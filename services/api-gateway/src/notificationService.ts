/**
 * Notification_Service — on-call paging (Requirement 19).
 *
 * Delivers pages when key thresholds are breached and keeps paging until a human
 * acknowledges, without drowning on-call in duplicates for a single ongoing
 * condition. It is specified as a distinct logical service but runs as a module
 * inside the gateway process for now (design "Notification_Service").
 *
 * Triggers:
 *   - success rate < 85% over a trailing 15-min window with >= 20 completions (19.1)
 *   - a provider Circuit_Breaker open for more than 10 minutes                (19.2)
 *   - any billing mismatch reported by a Reconciliation_Job                   (19.3)
 *   - 5xx rate > 1% over a trailing 15-min window with >= 20 requests         (19.4)
 *   - re-page any page unacknowledged after 15 minutes                        (19.5)
 *   - suppress duplicate pages while the same condition stays active (dedupe) (19.6)
 *
 * Design: the pure decisions (threshold breaches with their minimum-volume
 * guards, prolonged-breaker detection, and the re-page-when-unacked decision)
 * are separated from all I/O. The pager delivery mechanism (`PagerSink`) and the
 * clock are injected so this module can page a real notifier in production and
 * be unit/property-tested without wall-clock waits or a live pager. This is the
 * concrete sink the Circuit_Breaker (task 4.1, `BreakerAlertHook`) and the
 * Reconciliation_Jobs (task 11.x, `ReconciliationAlertHook`) left injectable
 * hooks for — see `asBreakerAlertHook` / `asReconciliationAlertHook` below.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6
 */

import type { AlertKind, Page } from "@neuralgrid/shared";

// --- Thresholds and windows (Req 19) ---

/** Success rate at or above this is healthy; strictly below it breaches (19.1). */
export const SUCCESS_RATE_FLOOR = 0.85;
/** Minimum completions in the window before a success-rate breach can page (19.1). */
export const SUCCESS_RATE_MIN_COMPLETIONS = 20;

/** 5xx rate strictly above this breaches (19.4). */
export const HTTP_5XX_RATE_CEILING = 0.01;
/** Minimum requests in the window before a 5xx breach can page (19.4). */
export const HTTP_5XX_MIN_REQUESTS = 20;

/** Trailing evaluation window for the rate-based triggers (19.1, 19.4). */
export const WINDOW_MS = 15 * 60 * 1000;

/** A breaker open longer than this is "prolonged" and pages (19.2). */
export const BREAKER_PROLONGED_MS = 10 * 60 * 1000;

/** An unacknowledged page is re-sent once this much time has elapsed (19.5). */
export const REPAGE_AFTER_MS = 15 * 60 * 1000;

// --- Pure decision logic (no I/O; unit/property testable) ---

/** A rolling-window tally of completed jobs and how many succeeded. */
export interface CompletionWindow {
  completions: number;
  successes: number;
}

/** A rolling-window tally of HTTP requests and how many returned 5xx. */
export interface RequestWindow {
  requests: number;
  http5xx: number;
}

/**
 * Success-rate breach (19.1). Breaches iff at least the minimum number of jobs
 * completed in the window AND the success ratio is strictly below the floor. The
 * minimum-volume guard prevents a single early failure from paging on-call.
 */
export function successRateBreached(w: CompletionWindow): boolean {
  if (w.completions < SUCCESS_RATE_MIN_COMPLETIONS) return false;
  if (w.completions <= 0) return false;
  return w.successes / w.completions < SUCCESS_RATE_FLOOR;
}

/**
 * 5xx-rate breach (19.4). Breaches iff at least the minimum number of requests
 * occurred in the window AND the 5xx ratio is strictly above the ceiling.
 */
export function httpErrorRateBreached(w: RequestWindow): boolean {
  if (w.requests < HTTP_5XX_MIN_REQUESTS) return false;
  if (w.requests <= 0) return false;
  return w.http5xx / w.requests > HTTP_5XX_RATE_CEILING;
}

/**
 * Prolonged-breaker decision (19.2). A breaker that opened at `openedAt` is
 * prolonged once it has stayed open strictly longer than the threshold.
 */
export function breakerProlonged(openedAt: number, now: number): boolean {
  return now - openedAt > BREAKER_PROLONGED_MS;
}

/**
 * Re-page decision (19.5). An active page must be re-sent when it is still
 * unacknowledged and at least the re-page interval has elapsed since it was last
 * sent. Acknowledged pages never re-page.
 */
export function shouldRepage(
  page: Pick<Page, "acknowledged">,
  lastPagedAt: number,
  now: number
): boolean {
  if (page.acknowledged) return false;
  return now - lastPagedAt >= REPAGE_AFTER_MS;
}

// --- Dedupe-key builders (19.6) ---
//
// One active page per condition. Rate breaches are singletons; breaker and
// billing conditions are keyed by their subject so distinct providers/reasons
// page independently while each individual condition is deduped.

export function successRateDedupeKey(): string {
  return "success_rate_low";
}

export function httpErrorRateDedupeKey(): string {
  return "http_5xx_high";
}

export function breakerProlongedDedupeKey(providerId: string): string {
  return `breaker_open_prolonged:${providerId}`;
}

export function breakerOpenDedupeKey(providerId: string): string {
  return `breaker_open:${providerId}`;
}

export function billingMismatchDedupeKey(subject: string): string {
  return `billing_mismatch:${subject}`;
}

// --- Injected collaborators ---

/**
 * The delivery mechanism for a page (PagerDuty, Opsgenie, SMS, etc.). Injected
 * so this module never hard-wires a notifier; production supplies the real sink
 * and tests supply a recording stub.
 */
export interface PagerSink {
  deliver(page: Page): void | Promise<void>;
}

/** Injectable clock so behaviour is testable without the real wall clock. */
export type Clock = () => number;

interface ActivePage {
  page: Page;
  /** Wall-clock ms at which the page was last delivered (initial send or re-page). */
  lastPagedAt: number;
}

// --- Structural shapes of the hooks tasks 4.1 / 11.x already emit ---
//
// Declared locally (not imported) so the api-gateway does not depend on
// job-scheduler internals; they match the injectable hook payloads by shape.

/** Payload emitted by the Circuit_Breaker `BreakerAlertHook` (task 4.1). */
export interface BreakerOpenAlertInput {
  kind: "breaker_open";
  provider_id: string;
  opened_at: number;
}

/** Payload emitted by the Reconciliation `ReconciliationAlertHook`s (task 11.x). */
export interface BillingMismatchAlertInput {
  /** Ledger and Stripe hooks use different kinds; both route to a billing page. */
  kind: "billing_mismatch" | "ledger_mismatch" | "ledger_incomplete";
  /** User id (ledger) or a free-form reason label (stripe); used to key dedupe. */
  user_id?: string;
  reason?: string;
}

/**
 * The Notification_Service. Holds the set of currently-active pages keyed by
 * `dedupe_key` and enforces at-most-one page per active condition (19.6),
 * re-paging unacknowledged pages on demand (19.5).
 */
export class NotificationService {
  private readonly active = new Map<string, ActivePage>();
  /** Provider breakers currently open, keyed by provider id → opened-at ms. */
  private readonly openBreakers = new Map<string, number>();

  constructor(
    private readonly sink: PagerSink,
    private readonly clock: Clock = () => Date.now()
  ) {}

  /**
   * Raise a page for a condition. If a page for `dedupeKey` is already active the
   * call is suppressed and returns `null` (19.6); otherwise a new page is created,
   * delivered, and returned.
   */
  async raise(kind: AlertKind, dedupeKey: string): Promise<Page | null> {
    if (this.active.has(dedupeKey)) return null; // continuously active → suppress
    const now = this.clock();
    const page: Page = {
      kind,
      dedupe_key: dedupeKey,
      raised_at: now,
      acknowledged: false,
    };
    this.active.set(dedupeKey, { page, lastPagedAt: now });
    await this.sink.deliver(page);
    return page;
  }

  /** Acknowledge an active page so it stops re-paging (19.5). */
  acknowledge(dedupeKey: string): boolean {
    const entry = this.active.get(dedupeKey);
    if (!entry) return false;
    entry.page.acknowledged = true;
    return true;
  }

  /**
   * Mark a condition no longer active. Removing the active page lets the same
   * condition page again if it recurs later (the flip side of 19.6 dedupe).
   */
  resolve(dedupeKey: string): boolean {
    return this.active.delete(dedupeKey);
  }

  /** Snapshot of the currently-active pages. */
  activePages(): Page[] {
    return Array.from(this.active.values(), (e) => ({ ...e.page }));
  }

  /**
   * Re-page every active page that is still unacknowledged and overdue (19.5).
   * Returns the pages that were re-sent. Call periodically from a scheduler tick.
   */
  async processRepages(): Promise<Page[]> {
    const now = this.clock();
    const repaged: Page[] = [];
    for (const entry of this.active.values()) {
      if (shouldRepage(entry.page, entry.lastPagedAt, now)) {
        entry.lastPagedAt = now;
        await this.sink.deliver(entry.page);
        repaged.push({ ...entry.page });
      }
    }
    return repaged;
  }

  // --- Threshold evaluators (call from the metrics tick) ---

  /** Evaluate the success-rate window; pages (deduped) on breach (19.1). */
  async evaluateSuccessRate(w: CompletionWindow): Promise<Page | null> {
    const key = successRateDedupeKey();
    if (successRateBreached(w)) {
      return this.raise("success_rate_low", key);
    }
    // Condition cleared → allow a fresh page if it breaches again later.
    this.resolve(key);
    return null;
  }

  /** Evaluate the 5xx-rate window; pages (deduped) on breach (19.4). */
  async evaluateHttpErrorRate(w: RequestWindow): Promise<Page | null> {
    const key = httpErrorRateDedupeKey();
    if (httpErrorRateBreached(w)) {
      return this.raise("http_5xx_high", key);
    }
    this.resolve(key);
    return null;
  }

  // --- Circuit_Breaker wiring (task 4.1) ---

  /**
   * Adapter matching the breaker's injectable `BreakerAlertHook`. Records the
   * open timestamp so `evaluateBreakers` can page once the breaker stays open
   * beyond the prolonged threshold (19.2). The instantaneous open is not itself
   * a page under Req 19 — only a *prolonged* open is.
   */
  asBreakerAlertHook(): (alert: BreakerOpenAlertInput) => void {
    return (alert: BreakerOpenAlertInput) => {
      if (!this.openBreakers.has(alert.provider_id)) {
        this.openBreakers.set(alert.provider_id, alert.opened_at);
      }
    };
  }

  /** A breaker has closed: forget it and clear any prolonged page it raised. */
  noteBreakerClosed(providerId: string): void {
    this.openBreakers.delete(providerId);
    this.resolve(breakerProlongedDedupeKey(providerId));
  }

  /**
   * Page (deduped) for every breaker that has been open longer than the
   * prolonged threshold (19.2). Call periodically from a scheduler tick.
   */
  async evaluateBreakers(): Promise<Page[]> {
    const now = this.clock();
    const paged: Page[] = [];
    for (const [providerId, openedAt] of this.openBreakers) {
      if (breakerProlonged(openedAt, now)) {
        const page = await this.raise(
          "breaker_open_prolonged",
          breakerProlongedDedupeKey(providerId)
        );
        if (page) paged.push(page);
      }
    }
    return paged;
  }

  // --- Reconciliation wiring (task 11.x) ---

  /**
   * Adapter matching the reconciliation jobs' injectable `ReconciliationAlertHook`
   * (both the ledger and Stripe variants). Any reported mismatch pages on-call
   * (19.3), deduped per subject (user id or reason) so an ongoing discrepancy
   * pages once rather than every run.
   */
  asReconciliationAlertHook(): (alert: BillingMismatchAlertInput) => Promise<void> {
    return async (alert: BillingMismatchAlertInput) => {
      const subject = alert.user_id ?? alert.reason ?? "unknown";
      await this.raise("billing_mismatch", billingMismatchDedupeKey(subject));
    };
  }
}
