/**
 * Circuit_Breaker for provider adapters (dispatch-side).
 *
 * Tracks a rolling 60s window of dispatch-failure timestamps per provider in
 * Redis, keyed `provider:breaker:{provider_id}`. The breaker opens at 3 failures
 * within the window, excludes that provider's nodes from selection while open,
 * auto-closes 5 minutes after opening, and resets the failure count to 0 on any
 * successful dispatch. When a breaker opens, an injectable alert hook fires so a
 * Notification_Service can page on-call for the affected provider.
 *
 * This is distinct from the Price_Aggregator's `provider:failures:{provider}`
 * counter (poll-side health); it lives in the Job_Scheduler and governs dispatch
 * selection. The pure decision logic is separated from Redis I/O so it is
 * testable without a running Redis.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import type { CircuitBreakerState } from "@neuralgrid/shared";
import {
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_WINDOW_SECONDS,
  CIRCUIT_BREAKER_DURATION_SECONDS,
} from "@neuralgrid/shared";

// --- Configuration ---

export interface BreakerConfig {
  /** Failures within the window required to open the breaker. */
  threshold: number;
  /** Rolling window, in ms, over which failures are counted. */
  windowMs: number;
  /** How long, in ms, the breaker stays open before auto-closing. */
  cooldownMs: number;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  threshold: CIRCUIT_BREAKER_THRESHOLD,
  windowMs: CIRCUIT_BREAKER_WINDOW_SECONDS * 1000,
  cooldownMs: CIRCUIT_BREAKER_DURATION_SECONDS * 1000,
};

// --- Injectable alert hook (decoupled from Notification_Service) ---

export interface BreakerOpenAlert {
  kind: "breaker_open";
  provider_id: string;
  opened_at: number;
}

/**
 * Called exactly once at the moment a provider's breaker transitions to open.
 * The concrete Notification_Service is injected by the caller so this module
 * never hard-wires paging.
 */
export type BreakerAlertHook = (alert: BreakerOpenAlert) => void | Promise<void>;

// --- Minimal Redis surface (satisfied by ioredis) ---

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export function breakerKey(providerId: string): string {
  return `provider:breaker:${providerId}`;
}

function closedState(providerId: string): CircuitBreakerState {
  return { provider_id: providerId, failure_timestamps: [], state: "closed" };
}

// --- Pure decision logic (no I/O; unit/property testable) ---

/** Drop failure timestamps that fall outside the rolling window ending at `now`. */
export function pruneTimestamps(
  timestamps: number[],
  now: number,
  windowMs: number
): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

/** True once the number of in-window failures reaches the threshold. */
export function shouldOpen(failureCount: number, threshold: number): boolean {
  return failureCount >= threshold;
}

/** True once the cooldown has fully elapsed since the breaker opened. */
export function cooldownElapsed(
  openedAt: number,
  now: number,
  cooldownMs: number
): boolean {
  return now - openedAt >= cooldownMs;
}

/**
 * Apply auto-close: an open breaker whose cooldown has elapsed is treated as
 * closed with a cleared failure window. Otherwise the state is returned as-is.
 */
export function applyAutoClose(
  state: CircuitBreakerState,
  now: number,
  cooldownMs: number
): CircuitBreakerState {
  if (
    state.state === "open" &&
    state.opened_at !== undefined &&
    cooldownElapsed(state.opened_at, now, cooldownMs)
  ) {
    return closedState(state.provider_id);
  }
  return state;
}

/** Whether the provider is currently open (excluded from selection) at `now`. */
export function isOpen(
  state: CircuitBreakerState,
  now: number,
  cooldownMs: number
): boolean {
  return applyAutoClose(state, now, cooldownMs).state === "open";
}

export interface FailureTransition {
  state: CircuitBreakerState;
  /** True only on the transition that opens a previously-closed breaker. */
  opened: boolean;
}

/**
 * Fold a single dispatch failure into the breaker state.
 *
 * - Auto-closes first if the prior open window has elapsed.
 * - While open, a failure is a no-op (provider is already excluded).
 * - While closed, prunes to the window, records `now`, and opens if the
 *   in-window failure count reaches the threshold.
 */
export function recordFailurePure(
  prev: CircuitBreakerState,
  now: number,
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG
): FailureTransition {
  const current = applyAutoClose(prev, now, config.cooldownMs);

  if (current.state === "open") {
    return { state: current, opened: false };
  }

  const timestamps = pruneTimestamps(
    current.failure_timestamps,
    now,
    config.windowMs
  );
  timestamps.push(now);

  if (shouldOpen(timestamps.length, config.threshold)) {
    return {
      state: {
        provider_id: current.provider_id,
        failure_timestamps: timestamps,
        state: "open",
        opened_at: now,
      },
      opened: true,
    };
  }

  return {
    state: {
      provider_id: current.provider_id,
      failure_timestamps: timestamps,
      state: "closed",
    },
    opened: false,
  };
}

/** A successful dispatch clears the window and closes the breaker. */
export function recordSuccessPure(
  prev: CircuitBreakerState
): CircuitBreakerState {
  return closedState(prev.provider_id);
}

// --- Redis-backed store operations ---

const STATE_TTL_SECONDS = Math.max(
  CIRCUIT_BREAKER_WINDOW_SECONDS,
  CIRCUIT_BREAKER_DURATION_SECONDS
);

export async function loadState(
  providerId: string,
  redis: RedisLike
): Promise<CircuitBreakerState> {
  const raw = await redis.get(breakerKey(providerId));
  if (raw === null) return closedState(providerId);
  try {
    const parsed = JSON.parse(raw) as CircuitBreakerState;
    // Defend against malformed payloads.
    if (!Array.isArray(parsed.failure_timestamps)) {
      return closedState(providerId);
    }
    return parsed;
  } catch {
    return closedState(providerId);
  }
}

async function saveState(
  state: CircuitBreakerState,
  redis: RedisLike
): Promise<void> {
  await redis.set(
    breakerKey(state.provider_id),
    JSON.stringify(state),
    "EX",
    STATE_TTL_SECONDS
  );
}

/**
 * Record a dispatch failure for a provider. Opens the breaker at the threshold
 * within the rolling window and fires the alert hook exactly once on opening.
 * Returns the resulting state.
 */
export async function recordDispatchFailure(
  providerId: string,
  redis: RedisLike,
  options: {
    now?: number;
    config?: BreakerConfig;
    alertHook?: BreakerAlertHook;
  } = {}
): Promise<CircuitBreakerState> {
  const now = options.now ?? Date.now();
  const config = options.config ?? DEFAULT_BREAKER_CONFIG;

  const prev = await loadState(providerId, redis);
  const { state, opened } = recordFailurePure(prev, now, config);
  await saveState(state, redis);

  if (opened && options.alertHook) {
    await options.alertHook({
      kind: "breaker_open",
      provider_id: providerId,
      opened_at: state.opened_at ?? now,
    });
  }

  return state;
}

/**
 * Record a successful dispatch for a provider, resetting the failure count to 0
 * and closing the breaker.
 */
export async function recordDispatchSuccess(
  providerId: string,
  redis: RedisLike
): Promise<CircuitBreakerState> {
  const prev = await loadState(providerId, redis);
  const next = recordSuccessPure(prev);
  await saveState(next, redis);
  return next;
}

/**
 * Whether a provider's breaker is currently open. Auto-closes (and persists the
 * closed state) if the cooldown has elapsed.
 */
export async function isProviderOpen(
  providerId: string,
  redis: RedisLike,
  options: { now?: number; config?: BreakerConfig } = {}
): Promise<boolean> {
  const now = options.now ?? Date.now();
  const config = options.config ?? DEFAULT_BREAKER_CONFIG;

  const state = await loadState(providerId, redis);
  const effective = applyAutoClose(state, now, config.cooldownMs);

  if (effective.state !== state.state) {
    // Cooldown elapsed — persist the auto-closed state.
    await saveState(effective, redis);
  }

  return effective.state === "open";
}

/**
 * Build the set of provider ids whose breakers are currently open, for use as
 * the `deprioritizedProviders`/exclusion set in node selection.
 */
export async function getOpenProviders(
  providerIds: string[],
  redis: RedisLike,
  options: { now?: number; config?: BreakerConfig } = {}
): Promise<Set<string>> {
  const open = new Set<string>();
  await Promise.all(
    providerIds.map(async (id) => {
      if (await isProviderOpen(id, redis, options)) {
        open.add(id);
      }
    })
  );
  return open;
}
