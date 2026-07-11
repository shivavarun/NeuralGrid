# Implementation Plan: NeuralGrid Production Readiness

## Overview

This plan layers reliability, billing correctness, security, observability, and CI gating onto the shipped MVP services (`api-gateway`, `compute-estimator`, `job-scheduler`, `price-aggregator`) without changing their existing public contracts. Work proceeds: data model migrations → `Job_Scheduler` reliability mechanisms (Soft_Queue/tier-bump, Circuit_Breaker, Job_Timeout, Output_Validator, OOM_Retry) → `Billing_Service` (ledger, margin, auto-refund, reconciliation) → security (API keys, secrets, admin RBAC, audit log, signature verification, retention, input caps) → observability (logging, metrics, alerting, tracing, SLOs) → `CI_Pipeline` gates → the go-live checklist gate. Each of the design's 35 correctness properties gets its own `fast-check` property test (min 100 iterations), placed directly after the implementation task it validates.

## Tasks

- [x] 1. Database schema and shared types for production readiness
  - [x] 1.1 Write migration extending `jobs` and adding production tables
    - Add `scripts/migrations/002_production_readiness.sql`: extend `jobs` with `idempotency_key`, `error_code`, `tier_assigned`, `confidence`, `vram_estimate_gb`, `provider_id`, `node_id`, `cost_usd`, `baseline_a100_cost_usd`, `runtime_ms`, `retry_count`, `oom_retry_count`, `queued_at`, `dispatched_at`, `retention_purged_at`
    - Create `providers`, `provider_nodes`, `billing_events`, `invoices`, `estimator_registry`, `audit_log` tables with the FKs from the design's Data Models section
    - Add `UNIQUE(user_id, idempotency_key)` constraint on `jobs`
    - Add DB triggers rejecting `UPDATE`/`DELETE` on `billing_events` and `audit_log`
    - _Requirements: 26.1, 26.2, 26.3, 27.2_

  - [x] 1.2 Add production-readiness types and error codes to `packages/shared`
    - Extend `packages/shared/src/errors.ts` with `MISSING_IDEMPOTENCY_KEY`, `INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `NO_NODE_AVAILABLE`, `JOB_TIMEOUT`, `INVALID_OUTPUT`, `OOM_RETRY_EXHAUSTED`, `INPUT_CAP_EXCEEDED`, `NO_CAPS_CONFIGURED`, `ADMIN_FORBIDDEN`, `REAUTH_REQUIRED`, `SIGNATURE_INVALID`, `GO_LIVE_PENDING`, `PRICE_STALE` and their HTTP mappings
    - Extend `packages/shared/src/types.ts` with `IdempotencyRecord`, `SoftQueueEntry`, `CircuitBreakerState`, `JobTimeout`, `OutputValidator`/`ValidationOutcome`, `BillingEvent`, `RefundOutcome`, `AdminSession`, `SignedInbound`/`VerifyResult`, `Page`/`AlertKind`
    - _Requirements: 26.1, 26.2_

  - [ ]* 1.3 Write unit tests for schema migration and constraints
    - Verify new columns/tables/FKs exist with correct types
    - Verify `UNIQUE(user_id, idempotency_key)` rejects a duplicate insert
    - Verify the append-only triggers reject `UPDATE`/`DELETE` on `billing_events` and `audit_log`
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 27.2_

- [x] 2. Idempotent job submission
  - [x] 2.1 Implement Idempotency_Key enforcement in API_Gateway
    - Add `services/api-gateway/src/middleware/idempotency.ts`: validate `Idempotency-Key` header presence and length (1-255 chars)
    - Implement request-hash canonicalization, `response_snapshot` caching, and the 24h `(user_id, idempotency_key)` association
    - Implement the Redis `idem:{user_id}:{key}` in-progress lock and use the `UNIQUE(user_id, idempotency_key)` constraint from task 1.1 as the race arbiter (constraint violation → resolve as existing-key match)
    - Wire into `POST /v1/jobs`: new key → create job; terminal + identical body → cached replay; terminal + differing body → 409 `IDEMPOTENCY_CONFLICT`; non-terminal → 409 `IDEMPOTENCY_IN_PROGRESS`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 26.4_

  - [ ]* 2.2 Write property test for new-key job creation
    - **Property 3: New idempotency key creates exactly one job with a stored association**
    - **Validates: Requirements 2.3**

  - [ ]* 2.3 Write property test for idempotent replay
    - **Property 4: Idempotent replay creates no new job and no new charge**
    - **Validates: Requirements 2.4**

  - [ ]* 2.4 Write property test for conflict and in-progress handling
    - **Property 5: Idempotency conflict and in-progress handling**
    - **Validates: Requirements 2.5, 2.6**

  - [ ]* 2.5 Write property test for per-user key isolation
    - **Property 6: Idempotency keys are isolated per user**
    - **Validates: Requirements 2.7, 26.3, 26.4**

  - [ ]* 2.6 Write unit tests for idempotency header validation edge cases
    - Missing header, empty value, 1-char, 255-char, 256-char values
    - _Requirements: 2.1, 2.2_

- [x] 3. Soft_Queue and tier-bump
  - [x] 3.1 Implement Soft_Queue with FIFO ordering and tier-bump
    - Add `services/job-scheduler/src/softQueue.ts`: on no node at assigned tier, set `status=QUEUED`, persist `queued_at` as the queue-wait anchor
    - Re-check Price_Aggregator every 5s; on availability, dispatch to the earliest-anchored eligible job (FIFO) and dequeue
    - At the 30s bound: if tier is T1/T2, attempt one dispatch at the next tier (`T1→T2→T3`); on failure or if tier is already T3, mark `FAILED`/`NO_NODE_AVAILABLE`
    - Rebuild queue membership from `jobs.status = QUEUED` on scheduler restart
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 3.2 Write property test for bounded FIFO Soft_Queue
    - **Property 1: No node yields a bounded, FIFO-ordered Soft_Queue entry**
    - **Validates: Requirements 1.1, 1.4, 1.8**

  - [ ]* 3.3 Write property test for tier-bump failure ladder
    - **Property 2: Tier-bump then failure ladder**
    - **Validates: Requirements 1.5, 1.6**

  - [ ]* 3.4 Write unit tests for Soft_Queue timing boundaries
    - 5s re-check cadence, 30s bound at 29.9s/30s/30.1s, T3 no-bump path
    - _Requirements: 1.2, 1.3, 1.7_

- [x] 4. Circuit_Breaker for provider adapters
  - [x] 4.1 Implement Circuit_Breaker
    - Add `services/job-scheduler/src/circuitBreaker.ts`: track rolling 60s failure timestamps in Redis keyed `provider:breaker:{provider_id}`
    - Open at 3 failures in the window; exclude that provider's nodes from selection while open; auto-close after 5 minutes; reset failure count to 0 on a successful dispatch
    - Trigger a Notification_Service alert (via an injectable alert hook) identifying the affected provider when the breaker opens
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.2 Write property test for breaker-open condition
    - **Property 7: Circuit breaker opens on 3 failures in a rolling 60s window**
    - **Validates: Requirements 3.1**

  - [ ]* 4.3 Write property test for exclusion and reset behavior
    - **Property 8: An open breaker excludes the provider; success resets the count**
    - **Validates: Requirements 3.2, 3.5**

  - [ ]* 4.4 Write unit tests for breaker close boundary and alert content
    - Auto-close at exactly 5 minutes; open-provider alert identifies the correct provider
    - _Requirements: 3.3, 3.4_

- [x] 5. Job_Timeout detection and recovery
  - [x] 5.1 Implement Job_Timeout computation and monitor
    - Add `services/job-scheduler/src/jobTimeout.ts`: on dispatch, compute `timeout_ms = estimated_runtime_ms × 3` anchored to `dispatched_at`
    - Monitor non-terminal jobs; mark `FAILED`/`JOB_TIMEOUT` when the timeout elapses; record an Estimator_Miss_Record with cause `TIMEOUT`
    - Discard any provider result delivered for a job already `FAILED`/`JOB_TIMEOUT` (status stays `FAILED`)
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [ ]* 5.2 Write property test for timeout computation
    - **Property 9: Job_Timeout equals estimated runtime times three**
    - **Validates: Requirements 4.1**

  - [ ]* 5.3 Write property test for terminal timeout and late-result discard
    - **Property 10: A timed-out job fails terminally and stays failed**
    - **Validates: Requirements 4.2, 4.6**

- [x] 6. Output_Validator before job completion
  - [x] 6.1 Implement Output_Validator
    - Add `services/job-scheduler/src/outputValidator.ts`: text → ≥1 non-whitespace char; image → non-empty and matches a recognized PNG/JPEG/WEBP magic-byte signature; embeddings → valid JSON array with ≥1 numeric element
    - On failure, or when no rule exists for the `job_type`, mark `FAILED`/`INVALID_OUTPUT` instead of `COMPLETE` and retain the original provider result for later retrieval
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.2 Write property test for output validation gating
    - **Property 13: Output validation gates completion by output kind**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [ ]* 6.3 Write unit test for missing-rule fail-closed behavior
    - `job_type` with no configured validation rule → `FAILED`/`INVALID_OUTPUT`
    - _Requirements: 5.6_

- [x] 7. OOM_Retry auto-retry at higher tier
  - [x] 7.1 Implement OOM_Retry
    - Add `services/job-scheduler/src/oomRetry.ts`: on provider OOM report, if tier is not T3 and cumulative OOM count < 2, redispatch at the next tier (`T1→T2→T3`) and increment the count
    - If count reaches 2, or the job is already at T3, mark `FAILED`/`OOM_RETRY_EXHAUSTED` without a further redispatch
    - Record an Estimator_Miss_Record with cause `OOM` on every OOM_Retry
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.2 Write property test for OOM_Retry lifecycle
    - **Property 14: OOM_Retry lifecycle bumps tier, caps at 2, then exhausts**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 7.3 Write property test for Estimator_Miss cause correctness
    - **Property 12: Estimator_Miss is recorded with the correct cause**
    - **Validates: Requirements 4.5, 6.5**

  - [ ]* 7.4 Write unit test for OOM at T3 immediate exhaustion
    - _Requirements: 6.4_

- [x] 8. Checkpoint - Job_Scheduler reliability mechanisms complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Billing ledger and margin auditability
  - [x] 9.1 Implement `billing_events` ledger and margin line items
    - Add `services/api-gateway/src/billingLedger.ts` (or extend `billing.ts`): record `charge`/`credit`/`topup`/`refund` rows with `amount_usd` negative for `charge`, positive otherwise
    - Compute balance as `sum(amount_usd)` over a user's events
    - At charge time, persist `provider_cost_usd` and `margin_usd` as distinct fields (2 dp each); flag `charge_consistent = false` and preserve original lines if the sum doesn't match the total charged within $0.01
    - _Requirements: 7.1, 7.2, 10.1, 10.2, 10.3_

  - [ ]* 9.2 Write property test for ledger sign convention and balance-as-sum
    - **Property 15: Ledger sign convention and balance-as-sum**
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 9.3 Write property test for margin line-item invariant
    - **Property 19: Charge records provider-cost and margin as summing line items**
    - **Validates: Requirements 10.1, 10.2, 10.3**

  - [x] 9.4 Implement margin-detail retrieval
    - Add an operator-facing lookup that returns a charged Job's stored `provider_cost_usd`/`margin_usd` directly, with no recomputation
    - _Requirements: 10.4_

  - [ ]* 9.5 Write property test for margin-detail round-trip
    - **Property 20: Margin detail is served from stored records without recomputation**
    - **Validates: Requirements 10.4**

- [x] 10. Automatic refund on post-charge job failure
  - [x] 10.1 Implement synchronous auto-refund
    - Add `services/api-gateway/src/autoRefund.ts`: in the job failure handler, before returning control, create a `credit` equal to the sum of that job's `charge` rows lacking a corresponding credit (linked via `credit_of_event`)
    - Retry creation up to 3 additional times within the same invocation; on total exhaustion, set the job's status to `refund-pending` and let the handler complete
    - Wire the Job_Timeout (task 5.1), Output_Validator (task 6.1), and OOM_Retry-exhaustion (task 7.1) failure paths to invoke this handler
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 4.3, 4.4_

  - [ ]* 10.2 Write property test for auto-refund correctness
    - **Property 18: Auto-refund credits exactly the uncredited charges, idempotently**
    - **Validates: Requirements 9.1, 9.3**

  - [ ]* 10.3 Write property test for timeout-conditioned refund
    - **Property 11: Timeout refund is conditioned on an existing charge**
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 10.4 Write unit tests for refund ordering, retry count, and refund-pending path
    - Synchronous-before-return ordering, exactly 3 additional retries, `refund-pending` on exhaustion
    - _Requirements: 9.2, 9.4, 9.5_

- [x] 11. Reconciliation jobs
  - [x] 11.1 Implement ledger Reconciliation_Job
    - Add `services/api-gateway/src/reconciliation/ledgerReconciliation.ts`: run every 24h at a fixed time, compare each user's `sum(billing_events)` against cached balance
    - Treat a difference ≤ $0.01 as tolerance; on a larger mismatch, trigger an admin alert naming the user and discrepancy without mutating either balance; on an incomplete comparison, alert and retry that user next run
    - _Requirements: 7.3, 7.4, 7.5_

  - [ ]* 11.2 Write property test for ledger reconciliation tolerance
    - **Property 16: Ledger reconciliation flags and alerts only beyond tolerance, without mutation**
    - **Validates: Requirements 7.3, 7.4**

  - [x] 11.3 Implement Stripe Reconciliation_Job
    - Add `services/api-gateway/src/reconciliation/stripeReconciliation.ts`: run every 15 minutes, compare Stripe charge/topup records from the trailing 24h (excluding records <5min old) against `billing_events`
    - Flag one-sided records as orphans and amount deltas >$0.01 as mismatches; on Stripe unreachable, alert and retry next run
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.4 Write property test for Stripe reconciliation orphan and mismatch detection
    - **Property 17: Stripe reconciliation orphan and mismatch detection**
    - **Validates: Requirements 8.2, 8.3, 8.4**

  - [ ]* 11.5 Write unit tests for reconciliation windowing and retry paths
    - Record ages around 5min and 24h boundaries; incomplete ledger run retry; Stripe-unreachable retry
    - _Requirements: 7.5, 8.1, 8.5_

- [x] 12. Checkpoint - Billing_Service complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. API key hashing at rest
  - [x] 13.1 Implement hashed API key storage and masked display
    - Extend `services/api-gateway/src/middleware/auth.ts` / key-management routes: store `sha256(key)` in `key_hash`, never persist plaintext
    - Return full plaintext exactly once (creation response); all later views show first-8 + last-4 with the remainder masked
    - Exclude plaintext from all log output; on `key_hash` persist failure, omit plaintext from the response and return a key-creation-failed error
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 13.2 Write property test for key hashing and masking
    - **Property 21: API keys are stored hashed and masked on later views**
    - **Validates: Requirements 11.1, 11.3**

  - [ ]* 13.3 Write unit tests for single-exposure, log exclusion, and persist-failure path
    - Plaintext appears only in the creation response; log-output scan finds no plaintext keys; persist failure yields no plaintext and an error
    - _Requirements: 11.2, 11.4, 11.5_

- [x] 14. Secrets_Manager integration
  - [x] 14.1 Implement Secrets_Manager client
    - Add a client wrapper fetching provider, Stripe, and DB credentials from a Secrets_Manager at startup with no plaintext env fallback in production
    - Support short-TTL cached fetch so a rotated provider credential takes effect within 5 minutes without a deploy
    - On a missing required credential at startup, fail startup and log only the credential name (never a partial value)
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 14.2 Write integration test for rotation and missing-credential startup failure
    - Rotated credential effective within 5 minutes; missing credential fails startup and logs the name only
    - _Requirements: 12.2, 12.3_

- [x] 15. Admin RBAC and session re-authentication
  - [x] 15.1 Implement admin route guard and Admin_Session re-auth
    - Add `services/api-gateway/src/middleware/adminAuth.ts`: verify `role === 'admin'` server-side on every admin route, else 403
    - For admin mutations (POST/PUT/PATCH/DELETE), reject with 401 re-auth-required when `Admin_Session` age > 12h, leaving all data unchanged; on successful re-auth, establish a new session with age reset to zero; on failed re-auth, return 401 without establishing a session
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 15.2 Write property test for server-side RBAC enforcement
    - **Property 22: Admin RBAC is enforced server-side**
    - **Validates: Requirements 13.1, 13.2**

  - [ ]* 15.3 Write unit tests for session-age boundary and re-auth outcomes
    - Boundary at exactly 12h; re-auth success and failure paths
    - _Requirements: 13.3, 13.4, 13.5_

- [x] 16. Audit log append-only semantics
  - [x] 16.1 Implement Audit_Log recording
    - Add `services/api-gateway/src/auditLog.ts`: record actor, action type, target, outcome (`success`/`failure`), and a UTC ISO 8601 timestamp for every admin action that modifies user data (credit grant, refund, key revoke, etc.)
    - Rely on the append-only DB trigger from task 1.1 to reject any modify/delete attempt on existing rows
    - Wire into the admin mutation paths added in tasks 10.1, 13.1, and 15.1
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

  - [ ]* 16.2 Write property test for audit log completeness and immutability
    - **Property 34: Audit log is complete and append-only**
    - **Validates: Requirements 27.1, 27.2, 27.3, 27.4**

- [x] 17. Stripe and provider callback signature verification
  - [x] 17.1 Implement inbound signature and replay verification
    - Add `services/api-gateway/src/middleware/signatureVerification.ts`: verify Stripe_Webhook signatures against the Stripe signing secret and provider callback `Provider_Callback_Signature` against the shared HMAC secret
    - Reject unsigned requests using the same path as failed verification; reject requests whose timestamp differs from current time by more than 300s as replays
    - On rejection, respond without revealing the secret or verification details, and leave all prior Job and billing state unchanged
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 17.2 Write property test for signature and replay admission
    - **Property 23: Inbound signature verification admits only authentic, in-window requests**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6**

  - [ ]* 17.3 Write property test for rejected-request state preservation
    - **Property 24: Rejected inbound requests leave all prior state unchanged**
    - **Validates: Requirements 14.7**

  - [ ]* 17.4 Write unit tests for unsigned requests and exact replay-window boundaries
    - Missing signature header; timestamp skew at exactly ±300s
    - _Requirements: 14.5, 14.6_

- [x] 18. Job input data retention and purge
  - [x] 18.1 Implement Data_Retention_Job
    - Add `services/api-gateway/src/dataRetention.ts`: run at least every 24h, purge `input_ref` content for jobs older than 30 days unless the owner opted into extended retention
    - Leave cost, status, and timestamp fields intact; on purge failure, retain the job in a `pending-purge` state and retry next scheduled run
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 18.2 Write property test for retention purge scope
    - **Property 25: Data retention purges only old, non-opted-in inputs and preserves other fields**
    - **Validates: Requirements 15.1, 15.2, 15.3**

  - [ ]* 18.3 Write unit test for purge failure retry
    - Purge failure → `pending-purge` → retried on next scheduled run
    - _Requirements: 15.4_

- [x] 19. Input size and cost cap validation
  - [x] 19.1 Implement input-cap validation and cap-config cost check
    - Add `services/api-gateway/src/middleware/inputCaps.ts`: reject submissions exceeding per-`job_type` prompt/image/output-token caps with a 400 naming every offending field, submitted value, and configured maximum
    - Return 400 `NO_CAPS_CONFIGURED` when a `job_type` has no configured caps
    - Reject a proposed/updated cap configuration if the `estimated_cost_usd` computed from its capped maximums exceeds `max_job_cost_cap` ($5.00)
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ]* 19.2 Write property test for offending-field reporting
    - **Property 26: Input-cap validation reports every offending field with its cap**
    - **Validates: Requirements 16.1**

  - [ ]* 19.3 Write property test for cap-configuration cost-cap rejection
    - **Property 27: Cap configuration is rejected when it permits a job above the cost cap**
    - **Validates: Requirements 16.3**

  - [ ]* 19.4 Write unit test for no-caps-configured error path
    - _Requirements: 16.2_

- [x] 20. Checkpoint - Security hardening complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Structured job state transition logging
  - [x] 21.1 Implement structured transition logging
    - Add `services/job-scheduler/src/structuredLogger.ts`: emit one JSON entry per job state transition with `job_id`, `user_id`, `request_id`, `from_status`, `to_status`, and an ISO 8601 UTC millisecond `timestamp`
    - Retry emission up to 3 times on failure without blocking or rolling back the transition; dedupe on `{job_id, from, to, transition_seq}` for exactly-one-entry semantics
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 21.2 Write property test for exactly-one well-formed log entry per transition
    - **Property 28: Each job state transition emits exactly one well-formed structured log entry**
    - **Validates: Requirements 17.1, 17.3**

  - [ ]* 21.3 Write unit test for emission-failure retry without rollback
    - _Requirements: 17.2_

- [x] 22. Operational metrics collection
  - [x] 22.1 Implement rolling metrics and estimator accuracy
    - Add `services/job-scheduler/src/metrics.ts`: compute rolling 5-min throughput, success rate, P50/P95 dispatch latency, and per-provider error rate; emit every 60s
    - Derive estimator accuracy from the most recent 100 Estimator_Miss_Records (or all if fewer); emit `not-available` when fewer than 10 exist
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 22.2 Write property test for metrics matching reference computation
    - **Property 29: Dispatch and provider metrics match reference computation over the rolling window**
    - **Validates: Requirements 18.1, 18.3**

  - [ ]* 22.3 Write property test for estimator accuracy windowing
    - **Property 30: Estimator accuracy uses the most recent 100 miss records**
    - **Validates: Requirements 18.4**

  - [ ]* 22.4 Write unit test for below-minimum-volume estimator accuracy
    - Fewer than 10 Estimator_Miss_Records → `not-available`
    - _Requirements: 18.5_

- [x] 23. Alerting on threshold breach
  - [x] 23.1 Implement Notification_Service paging
    - Add `services/api-gateway/src/notificationService.ts` (or a shared module): page on-call for success rate <85% over 15min with ≥20 completions, and for 5xx rate >1% over 15min with ≥20 requests
    - Page on breaker-open >10min and on any billing mismatch (wired to tasks 4.1 and 11.x); re-page unacknowledged pages after 15min; suppress duplicate pages for a continuously active condition via `dedupe_key`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [ ]* 23.2 Write property test for threshold-breach paging with volume guard
    - **Property 31: Threshold breach with minimum-volume guard pages on-call**
    - **Validates: Requirements 19.1, 19.4**

  - [ ]* 23.3 Write property test for duplicate-page suppression
    - **Property 32: Duplicate pages are suppressed while a condition stays active**
    - **Validates: Requirements 19.6**

  - [ ]* 23.4 Write unit tests for breaker/billing/re-page triggers
    - Breaker-open >10min page, billing-mismatch page, unacknowledged re-page at 15min
    - _Requirements: 19.2, 19.3, 19.5_

- [x] 24. Distributed tracing per job
  - [x] 24.1 Implement per-job distributed tracing
    - Add tracing to `services/api-gateway/src/index.ts` / job flow: start one trace per submitted Job with spans for submission, estimation, dispatch, and result, recording start/end times
    - Support retrieval of all spans by `job_id`; return not-found for an unknown `job_id`; retain traces at least 30 days after completion
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 24.2 Write integration test for trace retrieval
    - All spans for a `job_id` returned within 5 seconds
    - _Requirements: 20.3_

  - [ ]* 24.3 Write unit test for unknown-`job_id` trace retrieval
    - _Requirements: 20.4_

- [x] 25. Price freshness and SLO tracking
  - [x] 25.1 Implement price staleness enforcement and SLO wiring
    - Extend `services/price-aggregator/src/cache.ts` / `index.ts`: exclude cached prices ≥90s old from being served; return `PRICE_STALE` when no price younger than 90s exists for a requested tier
    - Wire SLO metric tracking for API_Gateway availability, Job_Scheduler P50 dispatch latency, and job success rate against their targets
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [ ]* 25.2 Write property test for stale-price exclusion
    - **Property 33: Price cache excludes stale prices**
    - **Validates: Requirements 21.4**

  - [ ]* 25.3 Write unit test for no-fresh-price error path
    - _Requirements: 21.5_

- [x] 26. Checkpoint - Observability and alerting complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 27. CI unit-test coverage gate for core calculations
  - [x] 27.1 Wire unit-coverage gate for estimator, scoring, and cost modules
    - Ensure/extend unit tests verifying Compute_Estimator VRAM/tier output per quantization (fp32/fp16/int8/int4) and Confidence branch (HIGH/MEDIUM/LOW)
    - Ensure/extend unit tests verifying node-scoring selects the lowest-score node, including price-tie and AMD-bonus cases
    - Ensure/extend unit tests verifying cost calculation applies `neuralgrid_margin` and computes the RunPod A100 baseline comparison, including zero/negative savings
    - Configure the CI_Pipeline to block deployment on any failing test or <90% line coverage on these three modules
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

- [x] 28. CI provider adapter contract test gate
  - [x] 28.1 Implement contract tests for every Provider_Adapter
    - Run a contract test per registered Provider_Adapter on every build, comparing output against its recorded fixture's status code and response body schema
    - Fail the build for any Provider_Adapter lacking a recorded fixture; on assertion failure, report which adapter and assertion failed and block deployment
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [x] 29. CI load test gate
  - [x] 29.1 Implement the pre-deploy load test
    - Submit 500 concurrent job submissions within a 60s window, retrying each up to 3 times
    - Assert exactly 500 charges recorded (zero duplicates) and P95 dispatch latency ≤2000ms; block deployment and report which check failed otherwise
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

- [x] 30. CI chaos test gate
  - [x] 30.1 Implement the provider-kill chaos test
    - Kill a provider while a Job is Running; within 60s of the kill, observe Circuit_Breaker opening, failover dispatch, and a full refund for the killed Job
    - Block deployment if any of the three outcomes is missing, if the refund doesn't equal the accrued cost at kill time, or if the test doesn't complete within 120s
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

- [x] 31. Checkpoint - CI gates complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 32. Production go-live checklist gate
  - [x] 32.1 Implement the Go_Live_Checklist gate
    - Restrict `POST /jobs` and account signup to the original 10 beta developer accounts while any of the 12 checklist items is incomplete, returning a go-live-pending error with no account/job created for others
    - Lift the restriction when an authorized operator marks the final item complete; restore it if any item is later found or marked incomplete
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

  - [ ]* 32.2 Write property test for reversible go-live gating
    - **Property 35: Go-live gate reversibly restricts non-beta accounts**
    - **Validates: Requirements 28.1, 28.4, 28.5**

  - [ ]* 32.3 Write unit test for checklist completeness and restriction lift
    - Checklist contains all 12 named items; completing the final item lifts the restriction
    - _Requirements: 28.2, 28.3_

- [x] 33. Final checkpoint - Production readiness complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; they are all test-writing sub-tasks.
- Every implementation task references specific requirement clauses; all 28 requirements and all 35 correctness properties from `design.md` are covered exactly once.
- Property tests use `fast-check` with a minimum of 100 iterations, tagged `Feature: production-readiness, Property {N}: {title}`, matching the convention already used in `services/*/src/**/*.property.test.ts`.
- Checkpoints (tasks 8, 12, 20, 26, 31, 33) are not implementation work; they are pause points to run the full test suite.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 8, "tasks": ["9.5", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3"] },
    { "id": 12, "tasks": ["11.4", "11.5"] },
    { "id": 13, "tasks": ["13.1", "14.1", "15.1"] },
    { "id": 14, "tasks": ["13.2", "13.3", "14.2", "15.2", "15.3", "16.1"] },
    { "id": 15, "tasks": ["16.2", "17.1", "18.1", "19.1"] },
    { "id": 16, "tasks": ["17.2", "17.3", "18.2", "19.2", "19.3"] },
    { "id": 17, "tasks": ["17.4", "18.3", "19.4"] },
    { "id": 18, "tasks": ["21.1", "22.1", "23.1", "24.1", "25.1"] },
    { "id": 19, "tasks": ["21.2", "21.3", "22.2", "22.3", "22.4", "23.2", "23.3", "23.4", "24.2", "24.3", "25.2", "25.3"] },
    { "id": 20, "tasks": ["27.1", "28.1", "29.1", "30.1"] },
    { "id": 21, "tasks": ["32.1"] },
    { "id": 22, "tasks": ["32.2", "32.3"] }
  ]
}
```
