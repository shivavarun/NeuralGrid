"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BREAKER_CONFIG = void 0;
exports.breakerKey = breakerKey;
exports.pruneTimestamps = pruneTimestamps;
exports.shouldOpen = shouldOpen;
exports.cooldownElapsed = cooldownElapsed;
exports.applyAutoClose = applyAutoClose;
exports.isOpen = isOpen;
exports.recordFailurePure = recordFailurePure;
exports.recordSuccessPure = recordSuccessPure;
exports.loadState = loadState;
exports.recordDispatchFailure = recordDispatchFailure;
exports.recordDispatchSuccess = recordDispatchSuccess;
exports.isProviderOpen = isProviderOpen;
exports.getOpenProviders = getOpenProviders;
const shared_1 = require("@neuralgrid/shared");
exports.DEFAULT_BREAKER_CONFIG = {
    threshold: shared_1.CIRCUIT_BREAKER_THRESHOLD,
    windowMs: shared_1.CIRCUIT_BREAKER_WINDOW_SECONDS * 1000,
    cooldownMs: shared_1.CIRCUIT_BREAKER_DURATION_SECONDS * 1000,
};
function breakerKey(providerId) {
    return `provider:breaker:${providerId}`;
}
function closedState(providerId) {
    return { provider_id: providerId, failure_timestamps: [], state: "closed" };
}
// --- Pure decision logic (no I/O; unit/property testable) ---
/** Drop failure timestamps that fall outside the rolling window ending at `now`. */
function pruneTimestamps(timestamps, now, windowMs) {
    const cutoff = now - windowMs;
    return timestamps.filter((t) => t > cutoff);
}
/** True once the number of in-window failures reaches the threshold. */
function shouldOpen(failureCount, threshold) {
    return failureCount >= threshold;
}
/** True once the cooldown has fully elapsed since the breaker opened. */
function cooldownElapsed(openedAt, now, cooldownMs) {
    return now - openedAt >= cooldownMs;
}
/**
 * Apply auto-close: an open breaker whose cooldown has elapsed is treated as
 * closed with a cleared failure window. Otherwise the state is returned as-is.
 */
function applyAutoClose(state, now, cooldownMs) {
    if (state.state === "open" &&
        state.opened_at !== undefined &&
        cooldownElapsed(state.opened_at, now, cooldownMs)) {
        return closedState(state.provider_id);
    }
    return state;
}
/** Whether the provider is currently open (excluded from selection) at `now`. */
function isOpen(state, now, cooldownMs) {
    return applyAutoClose(state, now, cooldownMs).state === "open";
}
/**
 * Fold a single dispatch failure into the breaker state.
 *
 * - Auto-closes first if the prior open window has elapsed.
 * - While open, a failure is a no-op (provider is already excluded).
 * - While closed, prunes to the window, records `now`, and opens if the
 *   in-window failure count reaches the threshold.
 */
function recordFailurePure(prev, now, config = exports.DEFAULT_BREAKER_CONFIG) {
    const current = applyAutoClose(prev, now, config.cooldownMs);
    if (current.state === "open") {
        return { state: current, opened: false };
    }
    const timestamps = pruneTimestamps(current.failure_timestamps, now, config.windowMs);
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
function recordSuccessPure(prev) {
    return closedState(prev.provider_id);
}
// --- Redis-backed store operations ---
const STATE_TTL_SECONDS = Math.max(shared_1.CIRCUIT_BREAKER_WINDOW_SECONDS, shared_1.CIRCUIT_BREAKER_DURATION_SECONDS);
async function loadState(providerId, redis) {
    const raw = await redis.get(breakerKey(providerId));
    if (raw === null)
        return closedState(providerId);
    try {
        const parsed = JSON.parse(raw);
        // Defend against malformed payloads.
        if (!Array.isArray(parsed.failure_timestamps)) {
            return closedState(providerId);
        }
        return parsed;
    }
    catch {
        return closedState(providerId);
    }
}
async function saveState(state, redis) {
    await redis.set(breakerKey(state.provider_id), JSON.stringify(state), "EX", STATE_TTL_SECONDS);
}
/**
 * Record a dispatch failure for a provider. Opens the breaker at the threshold
 * within the rolling window and fires the alert hook exactly once on opening.
 * Returns the resulting state.
 */
async function recordDispatchFailure(providerId, redis, options = {}) {
    const now = options.now ?? Date.now();
    const config = options.config ?? exports.DEFAULT_BREAKER_CONFIG;
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
async function recordDispatchSuccess(providerId, redis) {
    const prev = await loadState(providerId, redis);
    const next = recordSuccessPure(prev);
    await saveState(next, redis);
    return next;
}
/**
 * Whether a provider's breaker is currently open. Auto-closes (and persists the
 * closed state) if the cooldown has elapsed.
 */
async function isProviderOpen(providerId, redis, options = {}) {
    const now = options.now ?? Date.now();
    const config = options.config ?? exports.DEFAULT_BREAKER_CONFIG;
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
async function getOpenProviders(providerIds, redis, options = {}) {
    const open = new Set();
    await Promise.all(providerIds.map(async (id) => {
        if (await isProviderOpen(id, redis, options)) {
            open.add(id);
        }
    }));
    return open;
}
//# sourceMappingURL=circuitBreaker.js.map