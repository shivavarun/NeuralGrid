# Requirements Document

## Introduction

NeuralGrid Production Readiness covers backend, infra, reliability, security, billing, and observability work layered on top of the already-implemented MVP (`API_Gateway`, `Compute_Estimator`, `Job_Scheduler`, `Price_Aggregator` — see `neuralgrid-mvp` spec) and Stage 2 (`Fireworks_Adapter`, `Job_Executor`, webhooks, savings dashboard, provider health — see `neuralgrid-stage2` spec, not yet implemented). The MVP explicitly deferred job queuing, SLA guarantees, and real-money billing guarantees in favor of shipping fast. This spec defines what "production" adds so the system keeps routing jobs correctly, keeps billing correctly, and keeps a human informed when it can't, without anyone watching it at 3am.

This spec is backend/infra-focused (`API_Gateway`, `Job_Scheduler`, `Price_Aggregator`, `Billing_Service`, `Notification_Service`). Dashboard UI work is covered separately by the `dashboard-redesign` spec and is out of scope here.

## Glossary

- **API_Gateway**: The service handling HTTP routing, authentication, rate limiting, validation, and orchestration for developer-facing `/v1` routes and internal admin routes
- **Job_Scheduler**: The service that assigns Jobs to Provider_Node entries, dispatches, monitors, retries, and times out Jobs
- **Price_Aggregator**: The service that polls and caches Provider_Node availability and pricing per tier
- **Compute_Estimator**: The service that predicts VRAM requirements and assigns a Tier and Confidence to a Job
- **Billing_Service**: The service that records charges, credits, refunds, and margin against `billing_events`, and reconciles against Stripe
- **Notification_Service**: The service that delivers alerts (on-call paging) and developer-facing notifications
- **Provider_Adapter**: The per-provider integration (Vast.ai, RunPod, and others) implementing node listing and job execution against that provider's API
- **Provider_Node**: A unit of GPU capacity offered by a provider at a given tier, price, and availability
- **Job_Store**: The PostgreSQL database holding Job state as the single source of truth; no service holds Job state only in memory
- **Job**: A submitted unit of work with a `status` (`QUEUED`, `DISPATCHED`, `RUNNING`, `COMPLETE`, `FAILED`), a `tier_assigned`, and an `idempotency_key`
- **Soft_Queue**: The in-memory holding state for a Job when no Provider_Node is available at its assigned tier, bounded to 30 seconds
- **Idempotency_Key**: The value supplied in the `Idempotency-Key` request header on `POST /jobs`, unique per user, used to prevent duplicate Job creation and duplicate charges
- **Circuit_Breaker**: The per-provider mechanism that opens after repeated dispatch failures, excluding that provider from routing for a cooldown period
- **Job_Timeout**: The maximum duration a dispatched Job may remain non-terminal, computed as `estimated_runtime × 3`
- **Output_Validator**: The component that checks a Job's result payload against the validation rule for its `job_type` before the Job_Scheduler marks it `COMPLETE`
- **OOM_Retry**: An automatic redispatch of a Job to the next higher Tier following a provider-reported out-of-memory event
- **Estimator_Miss_Record**: A logged record capturing that the Compute_Estimator's tier assignment was wrong for a Job, tagged with a cause (`TIMEOUT` or `OOM`)
- **billing_events**: The append-only ledger table recording every balance-affecting event (`charge`, `credit`, `topup`, `refund`) for a user
- **Reconciliation_Job**: The scheduled process that compares computed ledger balances against cached balances (nightly) and Stripe records against `billing_events` (every 15 minutes)
- **neuralgrid_margin**: The percentage margin NeuralGrid applies on top of provider cost at charge time
- **Secrets_Manager**: The external secure credential store used in production instead of `.env` files for provider, Stripe, and database credentials
- **Admin_Session**: An authenticated session belonging to a user with `role=admin`, tracked with a session start time
- **Stripe_Webhook**: An inbound event delivered by Stripe to a NeuralGrid endpoint, verified via Stripe's signing secret
- **Provider_Callback_Signature**: The HMAC signature attached to a provider's job result callback, verified against a shared secret
- **Data_Retention_Job**: The scheduled process that purges Job input content older than 30 days unless the owning user has opted into extended retention
- **Audit_Log**: The append-only table recording every admin and system mutation (credit grant, refund, key revoke) with actor, action, and target
- **max_job_cost_cap**: The maximum permitted `estimated_cost_usd` for a single Job ($5.00)
- **CI_Pipeline**: The continuous integration process that runs automated tests and gates production deployment
- **Go_Live_Checklist**: The fixed set of 12 readiness items that must all be complete before production traffic is admitted beyond the original 10 beta developers
- **IDEMPOTENCY_IN_PROGRESS**: The error code returned when a `POST /jobs` request's Idempotency_Key matches a prior request whose Job has not yet reached a terminal status
- **refund-pending**: The Job status value recorded when the Billing_Service exhausts all retry attempts to create a required `credit` `billing_events` row

## Requirements

## Reliability: Job Queuing and Tier Bump

### Requirement 1: Soft Queue and Tier Bump on No Node Available

**User Story:** As a developer, I want my job to wait briefly for capacity instead of failing immediately when no node is available, so that a transient capacity gap does not surface to me as an error.

#### Acceptance Criteria

1. WHEN the Job_Scheduler finds no available Provider_Node at a Job's assigned Tier, THE Job_Scheduler SHALL set the Job's status to QUEUED and SHALL place the Job into the Soft_Queue, recording the time of entry as the queue-wait anchor.
2. WHILE a Job is in the Soft_Queue, THE Job_Scheduler SHALL re-check the Price_Aggregator for an available Provider_Node at the Job's assigned Tier every 5 seconds, measured from the queue-wait anchor.
3. THE Job_Scheduler SHALL limit the total time a Job remains in the Soft_Queue to 30 seconds, measured from the queue-wait anchor recorded in Criterion 1.
4. IF a Provider_Node becomes available at a Job's assigned Tier while the Job is in the Soft_Queue, THEN THE Job_Scheduler SHALL dispatch the Job to that Provider_Node and SHALL remove the Job from the Soft_Queue.
5. IF a Job's Soft_Queue wait reaches 30 seconds with no available Provider_Node at its assigned Tier and the Tier is T1 or T2 (i.e. not the highest defined Tier, T3), THEN THE Job_Scheduler SHALL attempt dispatch once at the next higher Tier in the fixed order T1 → T2 → T3 before returning an error.
6. IF a Job's single tier-bump attempt under Acceptance Criterion 5 also finds no available Provider_Node, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `NO_NODE_AVAILABLE`.
7. IF a Job's Soft_Queue wait reaches 30 seconds with no available Provider_Node and the Job's assigned Tier is already T3, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `NO_NODE_AVAILABLE` without a tier-bump attempt.
8. IF more than one Job in the Soft_Queue becomes eligible for the same newly available Provider_Node at the same Tier, THEN THE Job_Scheduler SHALL dispatch that Provider_Node to the Job that entered the Soft_Queue earliest (FIFO by queue-wait anchor).

## Reliability: Idempotent Job Submission

### Requirement 2: Idempotency Key Enforcement on Job Submission

**User Story:** As a developer, I want retried job submissions with the same idempotency key handled safely, so that a network retry never double-charges me.

#### Acceptance Criteria

1. IF a `POST /jobs` request omits the `Idempotency-Key` header, THEN THE API_Gateway SHALL return a 400 error identifying the missing header.
2. IF a `POST /jobs` request's `Idempotency-Key` header is empty or exceeds 255 characters, THEN THE API_Gateway SHALL return a 400 error identifying the invalid header value.
3. WHEN a `POST /jobs` request carries an Idempotency_Key value not previously recorded for the requesting user, THE API_Gateway SHALL create a new Job, SHALL associate the Idempotency_Key with that Job, and SHALL retain that association for 24 hours from creation.
4. WHEN a `POST /jobs` request carries an Idempotency_Key value matching a prior request from the same user whose associated Job has reached a terminal status (`COMPLETE` or `FAILED`) and whose request body is byte-for-byte identical to the original, THE API_Gateway SHALL return the original Job's cached response, SHALL NOT create a new Job, and SHALL NOT record a new charge.
5. IF a `POST /jobs` request carries an Idempotency_Key value matching a prior request from the same user with a request body that is not byte-for-byte identical to the original, THEN THE API_Gateway SHALL return a 409 error with code `IDEMPOTENCY_CONFLICT`.
6. IF a `POST /jobs` request carries an Idempotency_Key value matching a prior request from the same user whose associated Job has not yet reached a terminal status, THEN THE API_Gateway SHALL return a 409 error with code `IDEMPOTENCY_IN_PROGRESS` and SHALL NOT create a new Job.
7. THE API_Gateway SHALL scope Idempotency_Key uniqueness per user, such that the same Idempotency_Key value submitted by two different users SHALL be treated as two independent keys.

## Reliability: Provider Circuit Breaker

### Requirement 3: Circuit Breaker for Provider Adapters

**User Story:** As an operator, I want a provider adapter that fails repeatedly to be temporarily skipped, so that a struggling provider does not degrade dispatch for every job.

#### Acceptance Criteria

1. WHEN a Provider_Adapter records 3 dispatch failures, each defined as a dispatch attempt to any of that provider's Provider_Node entries that returns an error response or does not complete within the configured dispatch timeout, within a rolling 60 second window, THE Circuit_Breaker SHALL open for that provider.
2. WHILE a provider's Circuit_Breaker is open, THE Job_Scheduler SHALL exclude that provider's Provider_Node entries from dispatch selection.
3. WHEN a provider's Circuit_Breaker opens, THE Notification_Service SHALL alert the on-call channel identifying the affected provider.
4. IF 5 minutes have elapsed since a provider's Circuit_Breaker opened, THEN THE Circuit_Breaker SHALL close for that provider and THE Job_Scheduler SHALL resume considering that provider's Provider_Node entries for dispatch.
5. WHEN a dispatch to a provider completes with a non-error response within the configured dispatch timeout, THE Circuit_Breaker SHALL reset that provider's rolling failure count to 0.

## Reliability: Job Timeout Handling

### Requirement 4: Job Timeout Detection and Recovery

**User Story:** As a developer, I want a stuck job to fail cleanly with a refund rather than hang indefinitely, so that I am never billed for GPU time that never produced a result.

#### Acceptance Criteria

1. WHEN the Job_Scheduler dispatches a Job to a Provider_Node, THE Job_Scheduler SHALL compute that Job's Job_Timeout as its `estimated_runtime` multiplied by 3, anchored to the dispatch timestamp.
2. IF a dispatched Job has not reached status `COMPLETE` or `FAILED` when its Job_Timeout elapses (measured from the dispatch timestamp recorded in Criterion 1), THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `JOB_TIMEOUT`.
3. IF a Job marked FAILED with error_code `JOB_TIMEOUT` has a `charge` `billing_events` row recorded for it, THEN THE Billing_Service SHALL refund that charge.
4. IF a Job marked FAILED with error_code `JOB_TIMEOUT` has no `charge` `billing_events` row recorded for it, THEN THE Billing_Service SHALL take no refund action for that Job.
5. WHEN the Job_Scheduler marks a Job FAILED with error_code `JOB_TIMEOUT`, THE Job_Scheduler SHALL record an Estimator_Miss_Record for that Job with cause `TIMEOUT`.
6. IF a provider reports a result for a Job after that Job has already been marked FAILED with error_code `JOB_TIMEOUT`, THEN THE Job_Scheduler SHALL discard that result and SHALL NOT change the Job's status from `FAILED`.

## Reliability: Output Validation

### Requirement 5: Output Validation Before Job Completion

**User Story:** As a developer, I want returned job output checked for validity before it's marked complete, so that a garbled or empty provider result is never reported to me as a success.

#### Acceptance Criteria

1. WHEN a provider reports a result for a Job, THE Output_Validator SHALL check that result against the validation rule for the Job's `job_type` before the Job_Scheduler marks the Job `COMPLETE`.
2. WHERE a Job's `job_type` produces text output, THE Output_Validator SHALL require the result content to contain at least 1 character after leading and trailing whitespace is removed.
3. WHERE a Job's `job_type` produces image output, THE Output_Validator SHALL require the result content to be non-empty and to contain a byte sequence matching a recognized image format signature (e.g. PNG, JPEG, WEBP).
4. WHERE a Job's `job_type` produces embeddings output, THE Output_Validator SHALL require the result content to be valid JSON and to parse as an array containing at least 1 numeric value.
5. IF a Job's result fails its Output_Validator check, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `INVALID_OUTPUT` instead of `COMPLETE`, and SHALL retain the original provider result associated with the Job for later retrieval.
6. IF a Job's `job_type` has no validation rule defined in the Output_Validator, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `INVALID_OUTPUT` instead of `COMPLETE`.

## Reliability: OOM Auto-Retry

### Requirement 6: Out-of-Memory Auto-Retry

**User Story:** As a developer, I want a job that runs out of memory on its assigned tier retried automatically at a higher tier, so that an estimator underestimate does not simply fail my job.

#### Acceptance Criteria

1. IF a provider node reports an out-of-memory event for a Job whose current Tier is not T3 and whose cumulative OOM_Retry count is below 2, THEN THE Job_Scheduler SHALL redispatch the Job at the next higher Tier in the fixed order T1 → T2 → T3 and SHALL increment that Job's cumulative OOM_Retry count by 1.
2. THE Job_Scheduler SHALL limit cumulative OOM_Retry attempts for a single Job, across its entire lifecycle, to 2.
3. IF a Job receives an out-of-memory event after already exhausting 2 cumulative OOM_Retry attempts, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `OOM_RETRY_EXHAUSTED`.
4. IF a provider node reports an out-of-memory event for a Job whose current Tier is already T3, THEN THE Job_Scheduler SHALL mark the Job FAILED with error_code `OOM_RETRY_EXHAUSTED` without attempting a redispatch, regardless of cumulative OOM_Retry count.
5. WHEN the Job_Scheduler performs an OOM_Retry for a Job, THE Job_Scheduler SHALL record an Estimator_Miss_Record for that Job with cause `OOM`.

## Billing Correctness: Ledger

### Requirement 7: Billing Ledger as Source of Truth

**User Story:** As an operator, I want the billing ledger treated as the single source of truth for user balances, so that a drifting cached balance is caught before it becomes a dispute.

#### Acceptance Criteria

1. THE Billing_Service SHALL record every balance-affecting event as a row in `billing_events` typed as `charge`, `credit`, `topup`, or `refund`, with `amount_usd` recorded as a negative value for `charge` events and a positive value for `credit`, `topup`, and `refund` events.
2. THE Billing_Service SHALL compute a user's current balance as the sum of that user's `billing_events.amount_usd` values.
3. THE Reconciliation_Job SHALL run once every 24 hours at a fixed scheduled time and SHALL compare each user's computed `billing_events` balance against that user's cached balance field, treating a difference of $0.01 or less as rounding tolerance rather than a mismatch.
4. IF the Reconciliation_Job finds a mismatch exceeding $0.01 between a user's computed `billing_events` balance and cached balance field, THEN THE Reconciliation_Job SHALL trigger an admin alert identifying the affected user and the size of the discrepancy, without modifying either balance value.
5. IF the Reconciliation_Job fails to complete comparison for a user during its scheduled run, THEN THE Reconciliation_Job SHALL trigger an admin alert identifying the incomplete run and SHALL retry the comparison for that user on the next scheduled run.

## Billing Correctness: Stripe Reconciliation

### Requirement 8: Stripe Webhook Reconciliation Job

**User Story:** As an operator, I want Stripe's record of charges and top-ups compared against our ledger on a fixed interval, so that missing or orphaned billing events are caught automatically.

#### Acceptance Criteria

1. THE Reconciliation_Job SHALL run every 15 minutes and SHALL compare Stripe's charge and topup records from the trailing 24 hours against `billing_events`, excluding Stripe records less than 5 minutes old to avoid flagging in-flight webhook delivery lag.
2. IF the Reconciliation_Job finds a Stripe charge or topup record (at least 5 minutes old) with no corresponding `billing_events` row, THEN THE Reconciliation_Job SHALL flag that record as an orphan.
3. IF the Reconciliation_Job finds a `billing_events` charge or topup row (at least 5 minutes old) with no corresponding Stripe record, THEN THE Reconciliation_Job SHALL flag that row as an orphan.
4. IF the Reconciliation_Job finds a Stripe charge or topup record and a corresponding `billing_events` row whose amounts differ by more than $0.01, THEN THE Reconciliation_Job SHALL flag that pair as a mismatch.
5. IF the Reconciliation_Job cannot reach the Stripe API during a scheduled run, THEN THE Reconciliation_Job SHALL trigger an admin alert identifying the failed run and SHALL retry on its next scheduled run.

## Billing Correctness: Auto-Refund

### Requirement 9: Automatic Refund on Post-Charge Job Failure

**User Story:** As a developer, I want to be refunded automatically when my job fails after I've already been charged, so that I never need to file a support request for a system-caused failure.

#### Acceptance Criteria

1. WHEN a Job fails after a `charge` `billing_events` row has been recorded for it, THE Billing_Service SHALL create a corresponding `credit` `billing_events` row whose amount equals the sum of all `charge` `billing_events` amounts recorded for that Job that do not already have a corresponding `credit` row.
2. THE Billing_Service SHALL create the credit `billing_events` row synchronously within the Job's failure handler, before the failure handler returns control to the caller.
3. IF a `credit` `billing_events` row already exists for a Job's `charge` `billing_events` row, THEN THE Billing_Service SHALL NOT create a duplicate `credit` row for that charge.
4. IF the Billing_Service fails to create a `credit` `billing_events` row, THEN THE Billing_Service SHALL retry the creation up to 3 additional times within the same failure handler invocation.
5. IF all retry attempts to create the `credit` `billing_events` row fail, THEN THE Billing_Service SHALL record the Job's status as refund-pending and SHALL allow the failure handler to complete without creating the credit row.

## Billing Correctness: Margin Auditability

### Requirement 10: Margin Line-Item Auditability

**User Story:** As an operator, I want NeuralGrid's margin recorded separately from provider cost on every job, so that provider-cost versus margin is auditable per job without recomputing it.

#### Acceptance Criteria

1. WHEN the Billing_Service charges a user for a completed Job, THE Billing_Service SHALL record, at the time of charge, the Job's provider-cost amount and the applied `neuralgrid_margin` amount as two distinct persisted line items, each expressed in the billing currency to 2 decimal places.
2. THE Billing_Service SHALL ensure that, for every charged Job, the sum of that Job's recorded provider-cost line and margin line equals that Job's total charged amount, within a tolerance of 0.01 currency unit.
3. IF a Job's recorded provider-cost line plus margin line does not equal that Job's total charged amount within 0.01 currency unit, THEN THE Billing_Service SHALL flag that Job's charge record as inconsistent and SHALL preserve the original recorded line items unmodified.
4. WHEN an operator requests margin detail for a specific charged Job, THE Billing_Service SHALL return that Job's recorded provider-cost line and margin line directly from stored records without recomputing either value.

## Security: API Key Storage

### Requirement 11: API Key Hashing at Rest

**User Story:** As an operator, I want API keys never stored in plaintext, so that a database compromise does not expose usable developer credentials.

#### Acceptance Criteria

1. WHEN a new API key is created, THE API_Gateway SHALL store `sha256(key)` in the `key_hash` field and SHALL NOT store the plaintext key anywhere in persistent storage.
2. THE API_Gateway SHALL display an API key's full plaintext value exactly once, in the creation response, and SHALL NOT include the plaintext value in any other response, view, or export.
3. WHEN any request is made to view or list API keys after an API key's creation response has been returned, THE API_Gateway SHALL display only that key's first 8 characters and last 4 characters, with the remainder masked.
4. THE API_Gateway SHALL exclude API key plaintext values from all log output.
5. IF the API_Gateway fails to persist a new API key's `key_hash`, THEN THE API_Gateway SHALL NOT return the plaintext key in the creation response and SHALL return an error indicating key creation failed.

## Security: Secrets Management

### Requirement 12: Centralized Secrets Storage

**User Story:** As an operator, I want provider, Stripe, and database credentials stored outside application config, so that a config or source dump does not expose usable credentials.

#### Acceptance Criteria

1. THE production deployment SHALL retrieve provider API keys, Stripe keys, and database credentials from a Secrets_Manager rather than from environment files checked into source control, and SHALL NOT fall back to a plaintext environment file for these credentials in production.
2. WHERE a credential retrieved from the Secrets_Manager is a provider API key, THE production deployment SHALL support rotating that credential without a code deployment, with the new credential taking effect within 5 minutes of rotation.
3. IF the production deployment cannot retrieve a required credential from the Secrets_Manager at startup, THEN THE production deployment SHALL fail startup and SHALL log an error identifying the missing credential without logging any partial credential value.

## Security: Admin Access Control

### Requirement 13: Admin RBAC and Session Re-Authentication

**User Story:** As an operator, I want admin routes protected server-side and stale admin sessions to require re-authentication, so that a leaked or long-lived admin session cannot be used to make unchecked mutations.

#### Acceptance Criteria

1. WHEN a request is made to an admin route, THE API_Gateway SHALL verify server-side that the requesting user's role is admin before processing the request.
2. IF a request is made to an admin route by a user whose role is not admin, THEN THE API_Gateway SHALL return a 403 error and SHALL NOT process the request.
3. IF an admin mutation request (a request to an admin route using POST, PUT, PATCH, or DELETE) is made using an Admin_Session whose age, measured from the session's last authentication timestamp, exceeds 12 hours, THEN THE API_Gateway SHALL return a 401 error indicating re-authentication is required, SHALL NOT process the mutation, and SHALL leave all existing data unchanged.
4. WHEN a user re-authenticates successfully after receiving a re-authentication required error, THE API_Gateway SHALL establish a new Admin_Session with its age reset to zero.
5. IF a re-authentication attempt fails, THEN THE API_Gateway SHALL return a 401 error and SHALL NOT establish a new Admin_Session.

## Security: Webhook and Callback Signature Verification

### Requirement 14: Stripe and Provider Callback Signature Verification

**User Story:** As an operator, I want inbound Stripe events and provider result callbacks verified as authentic, so that a forged request cannot trigger a billing or job-state change.

#### Acceptance Criteria

1. WHEN a Stripe_Webhook request is received, THE API_Gateway SHALL verify its signature against the Stripe signing secret before processing the event.
2. IF a Stripe_Webhook request fails signature verification, THEN THE API_Gateway SHALL reject the request, SHALL NOT process the event, and SHALL respond with an indication of rejection that does not reveal the signing secret or verification details.
3. WHEN a provider result callback is received, THE API_Gateway SHALL verify its Provider_Callback_Signature against the shared HMAC secret before processing the callback.
4. IF a provider result callback fails Provider_Callback_Signature verification, THEN THE API_Gateway SHALL reject the callback, SHALL NOT update Job state from it, and SHALL respond with an indication of rejection that does not reveal the shared HMAC secret or verification details.
5. IF a Stripe_Webhook or provider result callback request arrives unsigned (missing signature header), THEN THE API_Gateway SHALL reject the request using the same rejection behavior as a failed signature verification.
6. IF a Stripe_Webhook or provider result callback request's timestamp differs from the API_Gateway's current time by more than 300 seconds, THEN THE API_Gateway SHALL reject the request as a replay attempt and SHALL NOT process the event or update Job state from it.
7. IF a Stripe_Webhook or provider result callback request is rejected under Criteria 2, 4, 5, or 6, THEN THE API_Gateway SHALL leave all prior Job and billing state unchanged.

## Security: Data Retention

### Requirement 15: Job Input Data Retention and Purge

**User Story:** As an operator, I want job inputs purged after a fixed retention window, so that stored PII is minimized by default.

#### Acceptance Criteria

1. THE Data_Retention_Job SHALL execute at least once every 24 hours and SHALL purge Job `input_ref` content for Jobs whose creation timestamp is older than 30 days, such that the purged content is no longer retrievable through any System interface.
2. WHERE a user has opted into extended retention, THE Data_Retention_Job SHALL exclude that user's Jobs from the 30-day purge until the user revokes the opt-in or the user's configured extended retention period elapses.
3. THE Data_Retention_Job SHALL purge only Job input content, leaving each Job's cost, status, and timestamp fields intact and unchanged.
4. IF the Data_Retention_Job fails to purge a Job's `input_ref` content, THEN THE Data_Retention_Job SHALL retain that Job in a pending-purge state and SHALL retry the purge on its next scheduled run.

## Security: Input Validation Caps

### Requirement 16: Input Size and Cost Cap Validation

**User Story:** As an operator, I want hard caps on prompt length, image size, and output tokens, so that no single job can exceed the maximum allowed cost.

#### Acceptance Criteria

1. IF a job submission's prompt length (character count), image size (bytes), or requested output tokens (token count) exceeds the configured maximum for its `job_type`, THEN THE API_Gateway SHALL return a 400 error response identifying every field that exceeded its cap, and for each such field, stating the submitted value and the configured maximum.
2. IF a job submission specifies a `job_type` for which no input validation caps are configured, THEN THE API_Gateway SHALL return a 400 error indicating the `job_type` has no configured validation caps.
3. WHEN input validation caps are configured or updated for a `job_type`, THE API_Gateway SHALL reject the configuration IF the `estimated_cost_usd` computed from that `job_type`'s capped maximum values for prompt length, image size, and output tokens exceeds `max_job_cost_cap` ($5.00).

## Observability: Structured Logging

### Requirement 17: Structured Job State Transition Logging

**User Story:** As an operator, I want every job state transition logged in a structured, queryable format, so that debugging a specific job does not require a raw log grep.

#### Acceptance Criteria

1. WHEN a Job transitions between statuses, THE Job_Scheduler SHALL emit a structured JSON log entry containing the fields `job_id`, `user_id`, `request_id`, `from_status`, `to_status`, and `timestamp` (ISO 8601, UTC, millisecond precision).
2. IF the Job_Scheduler fails to emit a structured log entry for a job state transition, THEN THE Job_Scheduler SHALL retry emission up to 3 times and SHALL NOT block or roll back the job state transition.
3. THE Job_Scheduler SHALL emit exactly one structured log entry per job state transition, with no duplicate or missing entries for the same transition.

## Observability: Metrics

### Requirement 18: Operational Metrics Collection

**User Story:** As an operator, I want throughput, success, latency, provider error, and estimator accuracy metrics collected, so that system health is visible without querying raw logs.

#### Acceptance Criteria

1. WHEN a job dispatch attempt completes (success or failure), THE Job_Scheduler SHALL update job throughput, job success rate, P50 dispatch latency, and P95 dispatch latency metrics computed over a rolling 5-minute window.
2. THE Job_Scheduler SHALL emit the metrics defined in Criterion 1 at a fixed interval of 60 seconds.
3. THE Job_Scheduler SHALL emit a per-provider error rate metric for each configured provider, computed over the same rolling 5-minute window as Criterion 1.
4. WHEN a new Estimator_Miss_Record is recorded, THE Job_Scheduler SHALL update the estimator accuracy rate metric derived from the most recent 100 Estimator_Miss_Record entries (or all entries if fewer than 100 exist).
5. IF fewer than 10 Estimator_Miss_Record entries are available, THEN THE Job_Scheduler SHALL emit the estimator accuracy rate metric as not-available rather than compute a value.

## Observability: Alerting

### Requirement 19: Alerting on Threshold Breach

**User Story:** As an operator, I want automated pages when key thresholds are breached, so that an incident is caught without someone watching a dashboard.

#### Acceptance Criteria

1. IF job success rate falls below 85% over a trailing 15 minute window AND at least 20 jobs completed in that window, THEN THE Notification_Service SHALL page on-call.
2. IF a provider's Circuit_Breaker remains open for more than 10 minutes, THEN THE Notification_Service SHALL page on-call.
3. IF the Reconciliation_Job records a billing mismatch, THEN THE Notification_Service SHALL page on-call.
4. IF the API_Gateway's 5xx response rate exceeds 1% over a trailing 15 minute window AND at least 20 requests occurred in that window, THEN THE Notification_Service SHALL page on-call.
5. IF a page sent under Criteria 1-4 is not acknowledged within 15 minutes, THEN THE Notification_Service SHALL re-page on-call.
6. THE Notification_Service SHALL suppress duplicate pages for the same breach condition while that condition remains continuously active.

## Observability: Tracing

### Requirement 20: Distributed Tracing per Job

**User Story:** As an operator, I want one trace per job from submission through dispatch to result, so that a single query answers "why was this job slow."

#### Acceptance Criteria

1. WHEN a Job is submitted, THE API_Gateway SHALL start a distributed trace for that Job, and THE trace SHALL contain one span each for submission, estimation, dispatch, and result stages.
2. WHEN a stage completes for a Job, THE API_Gateway SHALL record the stage's span with start time and end time in the Job's trace.
3. WHEN a trace is retrieved using a valid `job_id`, THE API_Gateway SHALL return all spans recorded for that Job within 5 seconds.
4. IF a trace is retrieved using a `job_id` with no matching Job, THEN THE API_Gateway SHALL return an error response indicating the Job was not found, with no trace data.
5. THE API_Gateway SHALL retain each Job's distributed trace for at least 30 days after Job completion.

## Service Level Objectives

### Requirement 21: SLO Targets

**User Story:** As an operator, I want defined SLO targets tracked from month one, so that production performance is measured against a concrete bar rather than an implicit one.

#### Acceptance Criteria

1. THE API_Gateway SHALL target 99.5% availability (proportion of non-5xx responses), measured over each calendar month (UTC).
2. THE Job_Scheduler SHALL target a P50 dispatch latency of less than 800 milliseconds from job submission to node dispatch.
3. THE Job_Scheduler SHALL target a job success rate (proportion of Jobs reaching status COMPLETE without a FAILED or JOB_TIMEOUT outcome) of 90% or greater.
4. THE Price_Aggregator SHALL enforce a maximum price cache staleness of 90 seconds and SHALL exclude any cached price older than 90 seconds from being served.
5. IF the Price_Aggregator has no cached price younger than 90 seconds for a requested Tier, THEN THE Price_Aggregator SHALL return an error rather than serve a stale price.

## Testing and CI Gates

### Requirement 22: Unit Test Coverage for Core Calculations

**User Story:** As an operator, I want the estimator, scoring, and cost calculation logic covered by unit tests, so that a regression in billing-critical math is caught before deploy.

#### Acceptance Criteria

1. THE CI_Pipeline SHALL run unit tests verifying the Compute_Estimator produces the VRAM estimate and Tier assignment specified by Model_Registry for each supported quantization type (fp32, fp16, int8, int4) and for each Confidence branch (HIGH, MEDIUM, LOW).
2. THE CI_Pipeline SHALL run unit tests verifying the Job_Scheduler's node scoring algorithm selects the Provider_Node with the lowest computed score among available nodes at a Job's assigned Tier, including cases where node prices differ, where two nodes have an identical score, and where the AMD provider scoring bonus applies to at least one candidate node.
3. THE CI_Pipeline SHALL run unit tests verifying cost calculation applies the neuralgrid_margin percentage to the base provider cost and computes the RunPod A100 baseline comparison (absolute savings and savings percentage), including a case where the computed savings is zero or negative.
4. IF a unit test covered by this Requirement fails, THEN THE CI_Pipeline SHALL block the deployment.
5. IF the measured line coverage for the Compute_Estimator's estimation module, the Job_Scheduler's node scoring module, or the cost calculation module falls below 90%, THEN THE CI_Pipeline SHALL block the deployment.

### Requirement 23: Provider Adapter Contract Tests

**User Story:** As an operator, I want each provider adapter tested against a recorded fixture of that provider's real API responses, so that an upstream provider API change is caught in CI, not production.

#### Acceptance Criteria

1. WHEN CI_Pipeline executes a build for a commit that modifies a Provider_Adapter or its recorded fixture, THE CI_Pipeline SHALL run a contract test for that Provider_Adapter comparing its output against the recorded fixture's status code and response body schema for that provider's API.
2. IF a Provider_Adapter's contract test fails, THEN THE CI_Pipeline SHALL block the deployment and SHALL report which Provider_Adapter and which fixture assertion failed.
3. IF a Provider_Adapter has no corresponding recorded fixture, THEN THE CI_Pipeline SHALL fail the build for that Provider_Adapter.
4. THE CI_Pipeline SHALL run a contract test for every registered Provider_Adapter on every CI build, regardless of which files changed in that commit.

### Requirement 24: Load Test Gate

**User Story:** As an operator, I want a load test simulating peak concurrent submissions run before the first production deploy, so that dispatch latency and billing correctness are proven under load rather than assumed.

#### Acceptance Criteria

1. BEFORE the first production deployment, THE CI_Pipeline SHALL run a load test that submits 500 concurrent job submissions within a 60 second window.
2. WHILE the load test executes, THE CI_Pipeline SHALL retry each of the 500 job submissions up to 3 times to simulate a retry storm.
3. THE load test SHALL verify that the total number of charges recorded equals 500 (one per unique job submission), confirming zero duplicate charges.
4. THE load test SHALL verify that the 95th percentile dispatch latency does not exceed 2000 milliseconds across the 500 concurrent job submissions.
5. IF the load test records any duplicate charge or the 95th percentile dispatch latency exceeds 2000 milliseconds, THEN THE CI_Pipeline SHALL block the deployment and SHALL report an error indicating which check failed.

### Requirement 25: Chaos Test Gate

**User Story:** As an operator, I want a chaos test confirming failover behavior fires correctly, so that reliability mechanisms are proven rather than assumed.

#### Acceptance Criteria

1. WHEN THE CI_Pipeline executes the pre-deployment gate, THE CI_Pipeline SHALL run a chaos test that kills a provider while a Job is in the Running state, and checks within 60 seconds of the kill that the Circuit_Breaker opens, the Job_Scheduler fails over the Job to a different provider, and the Billing_Service issues a refund for the killed Job.
2. IF the chaos test does not observe all three of Circuit_Breaker opening, failover dispatch, and refund for the killed Job within 60 seconds of the provider kill, THEN THE CI_Pipeline SHALL block the deployment.
3. IF the refund issued for the killed Job does not equal the full cost accrued by that Job at the time of the kill, THEN THE CI_Pipeline SHALL block the deployment.
4. IF the chaos test fails to complete execution within 120 seconds of starting, THEN THE CI_Pipeline SHALL treat the result as failed and block the deployment.

## Data Model Extensions

### Requirement 26: Production Schema Extensions

**User Story:** As an operator, I want the jobs table and supporting tables extended to hold production-only fields, so that idempotency, error tracking, provider data, and billing data each have a defined place to live.

#### Acceptance Criteria

1. THE Job_Store SHALL extend the `jobs` table with `idempotency_key` (nullable text, unique per user), `error_code` (nullable text), `tier_assigned` (text), `confidence` (text), `vram_estimate_gb` (numeric), `provider_id` (foreign key to `providers`), `node_id` (foreign key to `provider_nodes`), `cost_usd` (numeric), `baseline_a100_cost_usd` (numeric), `runtime_ms` (integer), and `retry_count` (integer, default 0) columns.
2. THE Job_Store SHALL add `providers`, `provider_nodes`, `billing_events`, `invoices`, `estimator_registry`, and `audit_log` tables, with `provider_nodes.provider_id` referencing `providers.id`, `billing_events.job_id` referencing `jobs.id`, and `invoices.user_id` referencing `users.id`.
3. THE Job_Store SHALL enforce a uniqueness constraint on the combination of `jobs.user_id` and `jobs.idempotency_key`.
4. IF an insert into `jobs` would violate the uniqueness constraint in Criterion 3, THEN THE Job_Store SHALL reject the insert and THE API_Gateway SHALL treat this as an existing Idempotency_Key match per Requirement 2.

### Requirement 27: Audit Log Append-Only Semantics

**User Story:** As an operator, I want every admin action recorded in a tamper-evident log, so that a dispute about who did what is always resolvable.

#### Acceptance Criteria

1. WHEN an admin performs a credit grant, refund, API key revocation, or any other admin action that modifies user data, THE Audit_Log SHALL record a row containing a timestamp (UTC, ISO 8601), the actor's identifier, the action type, the target identifier, and the action outcome (success or failure).
2. THE Audit_Log SHALL be append-only, such that once a row is written, no system component SHALL modify or delete it.
3. IF an admin action listed in Criterion 1 fails, THEN THE Audit_Log SHALL record a row for the attempted action with outcome marked as failure.
4. IF a request attempts to modify or delete an existing Audit_Log row, THEN THE System SHALL reject the request and preserve the original row unchanged.

## Go-Live Gating

### Requirement 28: Production Go-Live Checklist Gate

**User Story:** As an operator, I want production traffic beyond the original beta group gated behind a completed checklist, so that the system never takes on real scale while a reliability or security item is still open.

#### Acceptance Criteria

1. THE system SHALL restrict access to only the original 10 beta developer accounts until an authorized operator marks every item of the Go_Live_Checklist complete.
2. THE Go_Live_Checklist SHALL include: idempotency keys enforced on `POST /jobs`; circuit breakers live for both Vast.ai and RunPod; job timeout and auto-refund tested end-to-end; billing reconciliation job running and alerting; API keys hashed at rest and never logged in plaintext; admin route guard returning 403 for non-admin requests; rate limiting enforced at the gateway for Free and Pro tiers; SLO dashboards live for availability, dispatch latency, and success rate; alerting wired to on-call and verified with a real page within the preceding 7 days; load test passed at 5 times current beta traffic within the preceding 30 days; data retention and purge job running for job inputs older than 30 days; and runbooks written for provider outage, billing mismatch, and estimator accuracy drop.
3. WHEN an authorized operator marks the final open Go_Live_Checklist item complete, THE system SHALL lift the access restriction and permit new account signups and job submissions beyond the original 10 beta developers.
4. IF a request to `POST /jobs` or account signup is made by an account outside the original 10 beta developers while any Go_Live_Checklist item is incomplete, THEN THE system SHALL reject the request and return an error response indicating go-live is pending, without creating the account or job.
5. IF any Go_Live_Checklist item is later found or marked incomplete after the access restriction was lifted, THEN THE system SHALL restore the access restriction limiting job submissions and new signups to the original 10 beta developers until the item is again marked complete.
