/**
 * Price_Aggregator Express server.
 * Polls Vast.ai and RunPod every 60s, caches results in Redis, serves prices by tier.
 */

import express from 'express';
import type { Tier, Provider, ProviderNode, PriceResponse } from '@neuralgrid/shared';
import {
  PRICE_POLL_INTERVAL_SECONDS,
  CIRCUIT_BREAKER_THRESHOLD,
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
  SloTracker,
} from '@neuralgrid/shared';
import { queryVastaiNodes } from './providers/vastai';
import { queryRunpodNodes } from './providers/runpod';
import {
  createRedisClient,
  cacheNodes,
  getFreshCachedNodes,
  recordProviderFailure,
  resetProviderFailures,
  getProviderFailureCount,
} from './cache';

const app = express();
const PORT = process.env.PORT || 8003;
const TIERS: Tier[] = ['T1', 'T2', 'T3'];
const PROVIDERS: { name: Provider; query: (tier: Tier) => Promise<ProviderNode[]> }[] = [
  { name: 'vastai', query: queryVastaiNodes },
  { name: 'runpod', query: queryRunpodNodes },
];

app.use(express.json());

const redis = createRedisClient();

// SLO tracker (Req 21): records non-5xx responses for availability tracking.
const sloTracker = new SloTracker();

// Track when each tier+provider was last successfully cached
const lastCachedAt: Record<string, number> = {};

function cacheKey(tier: Tier, provider: Provider): string {
  return `${tier}:${provider}`;
}

/**
 * Poll a single provider for a single tier. Cache on success, record failure on error.
 */
async function pollProvider(tier: Tier, provider: Provider, queryFn: (t: Tier) => Promise<ProviderNode[]>): Promise<void> {
  try {
    const nodes = await queryFn(tier);
    await cacheNodes(tier, provider, nodes, redis);
    await resetProviderFailures(provider, redis);
    lastCachedAt[cacheKey(tier, provider)] = Date.now();
  } catch (err) {
    await recordProviderFailure(provider, redis);
    console.error(`Poll failed for ${provider}/${tier}:`, (err as Error).message);
  }
}

/**
 * Poll all providers for all tiers.
 */
async function pollAll(): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const tier of TIERS) {
    for (const { name, query } of PROVIDERS) {
      jobs.push(pollProvider(tier, name, query));
    }
  }
  await Promise.allSettled(jobs);
}

// --- Health endpoint ---

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'price-aggregator' });
});

// --- SLO report endpoint (Req 21.1) ---

app.get('/internal/slo', (_req, res) => {
  res.json(sloTracker.report());
});

// --- GET /internal/prices/:tier ---

app.get('/internal/prices/:tier', async (req, res) => {
  const tier = req.params.tier as Tier;

  if (!TIERS.includes(tier)) {
    sloTracker.recordResponse(400);
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: `Invalid tier: ${tier}` } });
    return;
  }

  const allNodes: ProviderNode[] = [];
  let anyCached = false;
  let oldestCacheAge = 0;

  for (const { name: provider } of PROVIDERS) {
    // Serve cached prices only when fresh (< 90s); stale entries are excluded.
    const fresh = await getFreshCachedNodes(tier, provider, redis);
    const failures = await getProviderFailureCount(provider, redis);

    if (fresh !== null) {
      // Fresh cache hit — use cached data
      allNodes.push(...fresh.nodes);
      anyCached = true;
      if (fresh.ageSeconds > oldestCacheAge) oldestCacheAge = fresh.ageSeconds;
    } else if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
      // No fresh cache AND provider unreachable — exclude
      continue;
    } else {
      // No fresh cache but provider not circuit-broken — try a fresh poll
      try {
        const nodes = await PROVIDERS.find(p => p.name === provider)!.query(tier);
        await cacheNodes(tier, provider, nodes, redis);
        await resetProviderFailures(provider, redis);
        lastCachedAt[cacheKey(tier, provider)] = Date.now();
        allNodes.push(...nodes);
      } catch {
        await recordProviderFailure(provider, redis);
        // Exclude — no fresh cache and fresh poll failed
      }
    }
  }

  // Req 21.5: no price younger than 90s for this tier → error, never serve stale.
  if (allNodes.length === 0) {
    sloTracker.recordResponse(ERROR_HTTP_STATUS[ErrorCode.PRICE_STALE]);
    res
      .status(ERROR_HTTP_STATUS[ErrorCode.PRICE_STALE])
      .json(
        createErrorResponse(
          ErrorCode.PRICE_STALE,
          `No price younger than 90s available for tier ${tier}`
        )
      );
    return;
  }

  const response: PriceResponse = {
    nodes: allNodes,
    cached: anyCached,
    cache_age_seconds: oldestCacheAge,
  };

  sloTracker.recordResponse(200);
  res.json(response);
});

// --- Startup ---

let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function startServer(): Promise<void> {
  await redis.connect();
  // Initial poll on startup
  await pollAll();
  // Background polling every 60s
  pollInterval = setInterval(() => {
    pollAll().catch((err) => console.error('Poll cycle error:', err));
  }, PRICE_POLL_INTERVAL_SECONDS * 1000);

  app.listen(PORT, () => {
    console.log(`Price Aggregator listening on port ${PORT}`);
  });
}

export function stopServer(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  redis.disconnect();
}

// Start if this is the entrypoint
if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start Price Aggregator:', err);
    process.exit(1);
  });
}

export default app;
export { redis, pollAll, sloTracker };
