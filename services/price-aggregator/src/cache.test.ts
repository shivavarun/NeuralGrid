import { describe, it, expect, beforeEach } from "vitest";
import Redis from "ioredis";
import {
  cacheNodes,
  getCachedNodes,
  recordProviderFailure,
  resetProviderFailures,
  getProviderFailureCount,
  createRedisClient,
} from "./cache";
import type { ProviderNode } from "@neuralgrid/shared";
import {
  PRICE_CACHE_TTL_SECONDS,
  PROVIDER_FAILURE_TTL_SECONDS,
} from "@neuralgrid/shared";

// --- In-memory mock Redis ---

class MockRedis {
  private store = new Map<string, string>();
  private ttls = new Map<string, number>();

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<"OK"> {
    this.store.set(key, value);
    if (mode === "EX" && ttl) {
      this.ttls.set(key, ttl);
    }
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.ttls.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || "0", 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key)) {
      this.ttls.set(key, seconds);
      return 1;
    }
    return 0;
  }

  // Test helper: get stored TTL
  getTtl(key: string): number | undefined {
    return this.ttls.get(key);
  }

  // Test helper: simulate key expiry
  expireKey(key: string): void {
    this.store.delete(key);
    this.ttls.delete(key);
  }
}

const sampleNodes: ProviderNode[] = [
  {
    provider: "vastai",
    node_id: "v-123",
    gpu_model: "RTX 4090",
    vram_gb: 24,
    hourly_rate_usd: 0.45,
    availability: true,
  },
  {
    provider: "vastai",
    node_id: "v-456",
    gpu_model: "RTX 3090",
    vram_gb: 24,
    hourly_rate_usd: 0.35,
    availability: true,
  },
];

describe("cache - cacheNodes / getCachedNodes", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = new MockRedis();
  });

  it("stores and retrieves nodes for a tier+provider", async () => {
    await cacheNodes("T2", "vastai", sampleNodes, redis as unknown as Redis);
    const result = await getCachedNodes("T2", "vastai", redis as unknown as Redis);
    expect(result).toEqual(sampleNodes);
  });

  it("returns null when cache is empty (expired)", async () => {
    const result = await getCachedNodes("T1", "runpod", redis as unknown as Redis);
    expect(result).toBeNull();
  });

  it("sets TTL to 90 seconds", async () => {
    await cacheNodes("T3", "runpod", sampleNodes, redis as unknown as Redis);
    expect(redis.getTtl("prices:T3:runpod")).toBe(PRICE_CACHE_TTL_SECONDS);
  });

  it("uses correct key format prices:{tier}:{provider}", async () => {
    await cacheNodes("T1", "vastai", [], redis as unknown as Redis);
    const raw = await redis.get("prices:T1:vastai");
    expect(raw).toBe("[]");
  });

  it("returns null after key expiry (simulated)", async () => {
    await cacheNodes("T2", "runpod", sampleNodes, redis as unknown as Redis);
    redis.expireKey("prices:T2:runpod");
    const result = await getCachedNodes("T2", "runpod", redis as unknown as Redis);
    expect(result).toBeNull();
  });
});

describe("cache - provider failure tracking", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = new MockRedis();
  });

  it("increments failure count from 0", async () => {
    const count = await recordProviderFailure("vastai", redis as unknown as Redis);
    expect(count).toBe(1);
  });

  it("increments failure count multiple times", async () => {
    await recordProviderFailure("runpod", redis as unknown as Redis);
    await recordProviderFailure("runpod", redis as unknown as Redis);
    const count = await recordProviderFailure("runpod", redis as unknown as Redis);
    expect(count).toBe(3);
  });

  it("sets TTL to 300 seconds on failure counter", async () => {
    await recordProviderFailure("vastai", redis as unknown as Redis);
    expect(redis.getTtl("provider:failures:vastai")).toBe(PROVIDER_FAILURE_TTL_SECONDS);
  });

  it("resetProviderFailures clears counter", async () => {
    await recordProviderFailure("runpod", redis as unknown as Redis);
    await recordProviderFailure("runpod", redis as unknown as Redis);
    await resetProviderFailures("runpod", redis as unknown as Redis);
    const count = await getProviderFailureCount("runpod", redis as unknown as Redis);
    expect(count).toBe(0);
  });

  it("getProviderFailureCount returns 0 when no failures", async () => {
    const count = await getProviderFailureCount("vastai", redis as unknown as Redis);
    expect(count).toBe(0);
  });

  it("getProviderFailureCount returns current count", async () => {
    await recordProviderFailure("vastai", redis as unknown as Redis);
    await recordProviderFailure("vastai", redis as unknown as Redis);
    const count = await getProviderFailureCount("vastai", redis as unknown as Redis);
    expect(count).toBe(2);
  });
});

describe("createRedisClient", () => {
  it("returns a Redis instance", () => {
    const client = createRedisClient();
    expect(client).toBeInstanceOf(Redis);
    // Clean up — don't actually connect
    client.disconnect();
  });
});
