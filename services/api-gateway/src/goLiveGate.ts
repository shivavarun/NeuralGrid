/**
 * Go_Live_Checklist gate (Requirement 28).
 *
 * Until an authorized operator marks all 12 Go_Live_Checklist items complete,
 * only the original 10 beta developer accounts may submit jobs (POST /v1/jobs)
 * or sign up. Every other account gets a `GO_LIVE_PENDING` (403) error and NO
 * account or job is created (Req 28.1, 28.4). When the final open item is
 * marked complete by an authorized operator, the restriction lifts and traffic
 * beyond the beta group is admitted (Req 28.3). If any item is later found or
 * marked incomplete, the restriction is restored (Req 28.5) — the gate is
 * derived purely from current checklist state, so lift/restore is inherently
 * reversible.
 *
 * Design (mirrors the other gateway middlewares — inputCaps, adminAuth):
 *  - The 12-item checklist model with the EXACT items enumerated in Req 28.2.
 *  - Pure, framework-free decision logic (`allItemsComplete`,
 *    `decideGoLiveAccess`) that is trivially unit/property testable.
 *  - An injectable `ChecklistStore` + `BetaAccountSet` so persistence and the
 *    beta membership source live with the caller, not hard-coded here.
 *  - `GoLiveChecklistGate`, a thin service coordinating the store + beta set and
 *    enforcing that only an authorized operator may mark items complete /
 *    incomplete.
 *  - `createGoLiveGateMiddleware`, an Express wrapper for POST /v1/jobs and
 *    signup that short-circuits with `GO_LIVE_PENDING` BEFORE any downstream
 *    handler runs, so a blocked request never creates a job or account.
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4, 28.5
 */

import type { Request, Response, NextFunction } from 'express';
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
} from '@neuralgrid/shared';

// ---------------------------------------------------------------------------
// Checklist model (Req 28.2)
// ---------------------------------------------------------------------------

/** Stable identifier for each of the 12 Go_Live_Checklist items. */
export type GoLiveChecklistItemId =
  | 'idempotency_keys_enforced'
  | 'circuit_breakers_live'
  | 'job_timeout_and_auto_refund_tested'
  | 'billing_reconciliation_running'
  | 'api_keys_hashed_at_rest'
  | 'admin_route_guard'
  | 'rate_limiting_enforced'
  | 'slo_dashboards_live'
  | 'alerting_verified_recently'
  | 'load_test_passed_recently'
  | 'data_retention_running'
  | 'runbooks_written';

/**
 * The fixed catalog of the 12 Go_Live_Checklist items, in checklist order, with
 * the human-readable descriptions taken verbatim from Requirement 28.2. This is
 * the single source of truth for the checklist's membership.
 */
export const GO_LIVE_CHECKLIST_DEFINITION: ReadonlyArray<{
  id: GoLiveChecklistItemId;
  label: string;
}> = [
  { id: 'idempotency_keys_enforced', label: 'Idempotency keys enforced on POST /jobs' },
  { id: 'circuit_breakers_live', label: 'Circuit breakers live for both Vast.ai and RunPod' },
  { id: 'job_timeout_and_auto_refund_tested', label: 'Job timeout and auto-refund tested end-to-end' },
  { id: 'billing_reconciliation_running', label: 'Billing reconciliation job running and alerting' },
  { id: 'api_keys_hashed_at_rest', label: 'API keys hashed at rest and never logged in plaintext' },
  { id: 'admin_route_guard', label: 'Admin route guard returning 403 for non-admin requests' },
  { id: 'rate_limiting_enforced', label: 'Rate limiting enforced at the gateway for Free and Pro tiers' },
  { id: 'slo_dashboards_live', label: 'SLO dashboards live for availability, dispatch latency, and success rate' },
  { id: 'alerting_verified_recently', label: 'Alerting wired to on-call and verified with a real page within the preceding 7 days' },
  { id: 'load_test_passed_recently', label: 'Load test passed at 5 times current beta traffic within the preceding 30 days' },
  { id: 'data_retention_running', label: 'Data retention and purge job running for job inputs older than 30 days' },
  { id: 'runbooks_written', label: 'Runbooks written for provider outage, billing mismatch, and estimator accuracy drop' },
] as const;

/** The exact number of Go_Live_Checklist items required for go-live (Req 28.2). */
export const GO_LIVE_CHECKLIST_ITEM_COUNT = GO_LIVE_CHECKLIST_DEFINITION.length;

/** A single checklist item and whether it has been marked complete. */
export interface ChecklistItem {
  id: GoLiveChecklistItemId;
  label: string;
  complete: boolean;
}

/**
 * Build a fresh checklist with all 12 items present and every item incomplete
 * — the pre-go-live starting state (Req 28.1).
 */
export function createInitialChecklist(): ChecklistItem[] {
  return GO_LIVE_CHECKLIST_DEFINITION.map((item) => ({
    id: item.id,
    label: item.label,
    complete: false,
  }));
}

// ---------------------------------------------------------------------------
// Pure decision logic (independently unit/property testable)
// ---------------------------------------------------------------------------

/**
 * True iff the checklist represents a fully-complete go-live state: it contains
 * all 12 required items AND every one of them is complete. A checklist missing
 * any required item is treated as incomplete (fail-closed), so an under-populated
 * store can never accidentally lift the restriction (Req 28.2, 28.3, 28.5).
 */
export function allItemsComplete(items: ReadonlyArray<ChecklistItem>): boolean {
  const presentIds = new Set(items.filter((i) => i.complete).map((i) => i.id));
  return GO_LIVE_CHECKLIST_DEFINITION.every((def) => presentIds.has(def.id));
}

/** Reason accompanying a go-live access decision. */
export type GoLiveDecisionReason =
  | 'beta-account'
  | 'checklist-complete'
  | 'go-live-pending';

/** Outcome of evaluating one account against the go-live gate. */
export interface GoLiveGateDecision {
  allow: boolean;
  reason: GoLiveDecisionReason;
}

/**
 * The core gate rule (pure): access is allowed iff the account is one of the
 * original beta accounts OR the entire checklist is complete. Otherwise the
 * request is blocked as go-live-pending (Req 28.1, 28.3, 28.4, 28.5).
 */
export function decideGoLiveAccess(
  isBetaAccount: boolean,
  checklistComplete: boolean
): GoLiveGateDecision {
  if (isBetaAccount) {
    return { allow: true, reason: 'beta-account' };
  }
  if (checklistComplete) {
    return { allow: true, reason: 'checklist-complete' };
  }
  return { allow: false, reason: 'go-live-pending' };
}

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/**
 * Persistence for the checklist state. Implementations back this with a DB or
 * config store; the gate only reads all items and flips a single item's
 * complete flag, which is what makes lift/restore reversible (Req 28.3, 28.5).
 */
export interface ChecklistStore {
  /** Return the current state of all checklist items. */
  getItems(): Promise<ChecklistItem[]> | ChecklistItem[];
  /** Set a single item's `complete` flag. */
  setItemComplete(
    id: GoLiveChecklistItemId,
    complete: boolean
  ): Promise<void> | void;
}

/**
 * Membership test for the original 10 beta developer accounts. Injected so the
 * beta set can come from config, a DB table, or an in-memory set.
 */
export interface BetaAccountSet {
  has(accountId: string): boolean | Promise<boolean>;
}

/** An operator attempting to mutate the checklist. */
export interface Operator {
  id: string;
}

/**
 * Authorizes an operator to mark checklist items complete/incomplete. Only an
 * authorized operator may lift or restore the restriction (Req 28.3, 28.5).
 */
export type OperatorAuthorizer = (operator: Operator) => boolean | Promise<boolean>;

/** Thrown when an unauthorized operator attempts to mutate the checklist. */
export class UnauthorizedOperatorError extends Error {
  constructor(operatorId: string) {
    super(`Operator '${operatorId}' is not authorized to modify the Go_Live_Checklist`);
    this.name = 'UnauthorizedOperatorError';
  }
}

/** Thrown when an operation targets an id that is not a checklist item. */
export class UnknownChecklistItemError extends Error {
  constructor(id: string) {
    super(`'${id}' is not a Go_Live_Checklist item`);
    this.name = 'UnknownChecklistItemError';
  }
}

const KNOWN_ITEM_IDS: ReadonlySet<string> = new Set(
  GO_LIVE_CHECKLIST_DEFINITION.map((d) => d.id)
);

/** Type guard for a valid checklist item id. */
export function isChecklistItemId(id: string): id is GoLiveChecklistItemId {
  return KNOWN_ITEM_IDS.has(id);
}

// ---------------------------------------------------------------------------
// Gate service
// ---------------------------------------------------------------------------

export interface GoLiveChecklistGateDeps {
  store: ChecklistStore;
  betaAccounts: BetaAccountSet;
  /** Defaults to denying every operator when omitted (fail-closed). */
  isAuthorizedOperator?: OperatorAuthorizer;
}

/**
 * Coordinates the checklist store + beta set to answer go-live access questions
 * and to apply reversible operator-driven changes to the checklist.
 */
export class GoLiveChecklistGate {
  private readonly store: ChecklistStore;
  private readonly betaAccounts: BetaAccountSet;
  private readonly isAuthorizedOperator: OperatorAuthorizer;

  constructor(deps: GoLiveChecklistGateDeps) {
    this.store = deps.store;
    this.betaAccounts = deps.betaAccounts;
    this.isAuthorizedOperator = deps.isAuthorizedOperator ?? (() => false);
  }

  /** Snapshot of every checklist item's current state. */
  async getChecklist(): Promise<ChecklistItem[]> {
    return this.store.getItems();
  }

  /** True iff all 12 items are complete (i.e. the restriction is lifted). */
  async isChecklistComplete(): Promise<boolean> {
    return allItemsComplete(await this.store.getItems());
  }

  /**
   * True iff access is currently restricted to beta accounts (any item still
   * incomplete). The inverse of {@link isChecklistComplete} (Req 28.1, 28.5).
   */
  async isRestricted(): Promise<boolean> {
    return !(await this.isChecklistComplete());
  }

  /** Evaluate the gate for a specific account id (Req 28.1, 28.3, 28.4). */
  async decideForAccount(
    accountId: string | undefined
  ): Promise<GoLiveGateDecision> {
    const checklistComplete = await this.isChecklistComplete();
    const isBeta =
      accountId !== undefined && (await this.betaAccounts.has(accountId));
    return decideGoLiveAccess(isBeta, checklistComplete);
  }

  /**
   * Mark a checklist item complete. Marking the final open item lifts the
   * restriction (Req 28.3). Only an authorized operator may do this.
   */
  async markComplete(
    id: GoLiveChecklistItemId,
    operator: Operator
  ): Promise<void> {
    await this.setComplete(id, true, operator);
  }

  /**
   * Mark a previously-complete item incomplete. This restores the restriction
   * if the checklist was complete (Req 28.5). Only an authorized operator may
   * do this.
   */
  async markIncomplete(
    id: GoLiveChecklistItemId,
    operator: Operator
  ): Promise<void> {
    await this.setComplete(id, false, operator);
  }

  private async setComplete(
    id: GoLiveChecklistItemId,
    complete: boolean,
    operator: Operator
  ): Promise<void> {
    if (!isChecklistItemId(id)) {
      throw new UnknownChecklistItemError(id);
    }
    if (!(await this.isAuthorizedOperator(operator))) {
      throw new UnauthorizedOperatorError(operator.id);
    }
    await this.store.setItemComplete(id, complete);
  }
}

// ---------------------------------------------------------------------------
// Express middleware for POST /v1/jobs and signup
// ---------------------------------------------------------------------------

/**
 * Resolves the account id an inbound request acts as. For an authenticated
 * job submission this is the developer id attached by the auth middleware; for
 * a signup it is the proposed account identifier from the body. Returning
 * `undefined` means "no known account" and is treated as non-beta, so an
 * anonymous signup is gated while the checklist is incomplete (Req 28.4).
 */
export type AccountIdResolver = (req: Request) => string | undefined;

/**
 * Default resolver: prefer an authenticated developer id (POST /v1/jobs), then
 * common signup body fields (account id / email).
 */
export const defaultAccountIdResolver: AccountIdResolver = (req) => {
  const authed = (req as { developerId?: unknown }).developerId;
  if (typeof authed === 'string' && authed.length > 0) {
    return authed;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const field of ['account_id', 'developer_id', 'email']) {
    const value = body[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

export interface GoLiveGateMiddlewareDeps {
  store: ChecklistStore;
  betaAccounts: BetaAccountSet;
  /** Override how the acting account id is extracted from the request. */
  resolveAccountId?: AccountIdResolver;
}

/**
 * Express middleware guarding POST /v1/jobs and signup. When the checklist is
 * incomplete and the acting account is not a beta account, it responds with
 * `GO_LIVE_PENDING` (403) and returns BEFORE `next()`, so the downstream
 * handler never runs and no job or account is created (Req 28.1, 28.4). It
 * reads the checklist on every request, so a later-restored restriction takes
 * effect immediately (Req 28.5).
 */
export function createGoLiveGateMiddleware(deps: GoLiveGateMiddlewareDeps) {
  const resolveAccountId = deps.resolveAccountId ?? defaultAccountIdResolver;
  const gate = new GoLiveChecklistGate({
    store: deps.store,
    betaAccounts: deps.betaAccounts,
  });

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const accountId = resolveAccountId(req);
    const decision = await gate.decideForAccount(accountId);

    if (!decision.allow) {
      res
        .status(ERROR_HTTP_STATUS[ErrorCode.GO_LIVE_PENDING])
        .json(
          createErrorResponse(
            ErrorCode.GO_LIVE_PENDING,
            'Go-live is pending: access is currently limited to the original beta developer accounts until every Go_Live_Checklist item is complete.'
          )
        );
      return;
    }

    next();
  };
}
