/**
 * Redis caching layer for Price_Aggregator.
 *
 * Key patterns:
 *   prices:{tier}:{provider}        → JSON ProviderNode[] (TTL 90s)
 *   provider:failures:{provider}    → Integer counter     (TTL 300s)
 */

import Redis from "ioredis";
import type { Tier, Provider, ProviderNode } from "@neuralgrid/shared";
import {
  PRICE_CACHE_TTL_SECONDS,
  PRICE_MAX_STALENESS_SECONDS,
  PROVIDER_FAILURE_TTL_SECONDS,
} from "@neuralgrid/shared";

// --- Pure staleness logic (Req 21.4) ---

/**
 * A cached price is stale once its age reaches the max staleness bound (90s).
 * Stale prices MUST be excluded from being served.
 */
export function isPriceStale(ageSeconds: number): boolean {
  return ageSeconds >= PRICE_MAX_STALENESS_SECONDS;
}

/** Convenience inverse of {@link isPriceStale}. */
export function isPriceFresh(ageSeconds: number): boolean {
  return !isPriceStale(ageSeconds);
}

/** Cached nodes together with their age at read time. */
export interface FreshNodes {
  nodes: ProviderNode[];
  ageSeconds: number;
}

// --- Redis client factory ---

export function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}

// --- Key helpers ---

function priceKey(tier: Tier, provider: Provider): string {
  return `prices:${tier}:${provider}`;
}

function failureKey(provider: Provider): string {
  return `provider:failures:${provider}`;
}

function priceTimestampKey(tier: Tier, provider: Provider): string {
  return `prices:${tier}:${provider}:cachedAt`;
}

// --- Cache operations ---

/**
 * Store provider nodes in cache with 90s TTL.
 */
export async function cacheNodes(
  tier: Tier,
  provider: Provider,
  nodes: ProviderNode[],
  redis: Redis
): Promise<void> {
  const key = priceKey(tier, provider);
  await redis.set(key, JSON.stringify(nodes), "EX", PRICE_CACHE_TTL_SECONDS);
  // Companion timestamp so staleness survives a process restart (kept separate
  // from the payload key so its serialized value stays a plain node array).
  await redis.set(
    priceTimestampKey(tier, provider),
    String(Date.now()),
    "EX",
    PRICE_CACHE_TTL_SECONDS
  );
}

/**
 * Age (seconds) of the cached price for a tier+provider, or null if no
 * timestamp exists (never cached or expired).
 */
export async function getCacheAgeSeconds(
  tier: Tier,
  provider: Provider,
  redis: Redis,
  now: number = Date.now()
): Promise<number | null> {
  const ts = await redis.get(priceTimestampKey(tier, provider));
  if (ts === null) return null;
  return Math.floor((now - parseInt(ts, 10)) / 1000);
}

/**
 * Get cached nodes only when they are fresh (age < 90s). Returns null when the
 * cache is missing, expired, or stale — stale prices are never served (Req 21.4).
 */
export async function getFreshCachedNodes(
  tier: Tier,
  provider: Provider,
  redis: Redis,
  now: number = Date.now()
): Promise<FreshNodes | null> {
  const nodes = await getCachedNodes(tier, provider, redis);
  if (nodes === null) return null;
  const age = await getCacheAgeSeconds(tier, provider, redis, now);
  // No timestamp → treat as unknown age and exclude rather than serve stale.
  if (age === null || isPriceStale(age)) return null;
  return { nodes, ageSeconds: age };
}

/**
 * Get cached nodes. Returns null if key expired or missing.
 */
export async function getCachedNodes(
  tier: Tier,
  provider: Provider,
  redis: Redis
): Promise<ProviderNode[] | null> {
  const key = priceKey(tier, provider);
  const data = await redis.get(key);
  if (data === null) return null;
  return JSON.parse(data) as ProviderNode[];
}

// --- Provider failure tracking ---

/**
 * Increment provider failure counter. Returns new count.
 * Counter has 300s TTL — auto-resets if no failures for 5 min.
 */
export async function recordProviderFailure(
  provider: Provider,
  redis: Redis
): Promise<number> {
  const key = failureKey(provider);
  const count = await redis.incr(key);
  // Reset TTL on every increment so it expires 300s after last failure
  await redis.expire(key, PROVIDER_FAILURE_TTL_SECONDS);
  return count;
}

/**
 * Reset failure counter on successful provider call.
 */
export async function resetProviderFailures(
  provider: Provider,
  redis: Redis
): Promise<void> {
  const key = failureKey(provider);
  await redis.del(key);
}

/**
 * Get current failure count for a provider.
 */
export async function getProviderFailureCount(
  provider: Provider,
  redis: Redis
): Promise<number> {
  const key = failureKey(provider);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}
