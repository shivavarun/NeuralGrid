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
export interface BreakerConfig {
    /** Failures within the window required to open the breaker. */
    threshold: number;
    /** Rolling window, in ms, over which failures are counted. */
    windowMs: number;
    /** How long, in ms, the breaker stays open before auto-closing. */
    cooldownMs: number;
}
export declare const DEFAULT_BREAKER_CONFIG: BreakerConfig;
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
export interface RedisLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
    del(key: string): Promise<unknown>;
}
export declare function breakerKey(providerId: string): string;
/** Drop failure timestamps that fall outside the rolling window ending at `now`. */
export declare function pruneTimestamps(timestamps: number[], now: number, windowMs: number): number[];
/** True once the number of in-window failures reaches the threshold. */
export declare function shouldOpen(failureCount: number, threshold: number): boolean;
/** True once the cooldown has fully elapsed since the breaker opened. */
export declare function cooldownElapsed(openedAt: number, now: number, cooldownMs: number): boolean;
/**
 * Apply auto-close: an open breaker whose cooldown has elapsed is treated as
 * closed with a cleared failure window. Otherwise the state is returned as-is.
 */
export declare function applyAutoClose(state: CircuitBreakerState, now: number, cooldownMs: number): CircuitBreakerState;
/** Whether the provider is currently open (excluded from selection) at `now`. */
export declare function isOpen(state: CircuitBreakerState, now: number, cooldownMs: number): boolean;
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
export declare function recordFailurePure(prev: CircuitBreakerState, now: number, config?: BreakerConfig): FailureTransition;
/** A successful dispatch clears the window and closes the breaker. */
export declare function recordSuccessPure(prev: CircuitBreakerState): CircuitBreakerState;
export declare function loadState(providerId: string, redis: RedisLike): Promise<CircuitBreakerState>;
/**
 * Record a dispatch failure for a provider. Opens the breaker at the threshold
 * within the rolling window and fires the alert hook exactly once on opening.
 * Returns the resulting state.
 */
export declare function recordDispatchFailure(providerId: string, redis: RedisLike, options?: {
    now?: number;
    config?: BreakerConfig;
    alertHook?: BreakerAlertHook;
}): Promise<CircuitBreakerState>;
/**
 * Record a successful dispatch for a provider, resetting the failure count to 0
 * and closing the breaker.
 */
export declare function recordDispatchSuccess(providerId: string, redis: RedisLike): Promise<CircuitBreakerState>;
/**
 * Whether a provider's breaker is currently open. Auto-closes (and persists the
 * closed state) if the cooldown has elapsed.
 */
export declare function isProviderOpen(providerId: string, redis: RedisLike, options?: {
    now?: number;
    config?: BreakerConfig;
}): Promise<boolean>;
/**
 * Build the set of provider ids whose breakers are currently open, for use as
 * the `deprioritizedProviders`/exclusion set in node selection.
 */
export declare function getOpenProviders(providerIds: string[], redis: RedisLike, options?: {
    now?: number;
    config?: BreakerConfig;
}): Promise<Set<string>>;
