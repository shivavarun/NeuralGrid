# Implementation Plan: NeuralGrid Stage 2

## Overview

Convert the Stage 1 routing demo into a working product across six requirement groups, built in dependency order: Group A (Fireworks/AMD adapter) → Group B (real job execution, which depends on A's adapter shape) → Group C (OpenAI-compat endpoint) and Group D (webhooks), both of which depend on B's execution/completion path → Group E (savings analytics, depends on B's actual-cost data) → Group F (provider health, independent operational tooling that can run in parallel with any other group). TypeScript/Express services, Next.js dashboard, PostgreSQL, Redis, fast-check for property tests, vitest as the test runner — matching the existing MVP stack.

## Tasks

- [ ] 1. Shared type extensions for providers and hardware vendor
  - [ ] 1.1 Extend shared types and constants for Stage 2
    - Update `packages/shared/src/types.ts`: extend `Provider` union to `"vastai" | "runpod" | "fireworks" | "amd-cloud"`; add `HardwareVendor` type (`"AMD" | "NVIDIA" | "unknown"`); add `hardware_vendor: HardwareVendor` and optional `is_warm?: boolean` to `ProviderNode`; add `ProviderAdapter` interface (`listNodes`, `runJob`, `getJobStatus`, `getResult`); add `binaryContent?: Buffer` to `JobResult`; add `WebhookPayload` interface
    - Add `MARGIN_MULTIPLIER = 1.20` to `packages/shared/src/constants.ts`
    - _Requirements: 1.1, 1.2_

  - [ ]* 1.2 Write property test for hardware vendor invariant (Property 1)
    - **Property 1: Hardware vendor is always one of the allowed values**
    - **Validates: Requirements 1.2**

- [ ] 2. Fireworks_Adapter in Price_Aggregator
  - [ ] 2.1 Create Fireworks model map
    - Create `services/price-aggregator/src/providers/fireworksModels.ts` with `FireworksModelEntry` interface and `FIREWORKS_MODELS` record (modelId, tier, minVramGb, pricePerMToken per model), and `FIREWORKS_TOKENS_PER_HOUR = 500_000`
    - _Requirements: 2.1_

  - [ ] 2.2 Implement FireworksAdapter listNodes and price normalization
    - Create `services/price-aggregator/src/providers/fireworks.ts`
    - Implement `normalizeHourlyRate(pricePerMToken)` as `(pricePerMToken / 1_000_000) * FIREWORKS_TOKENS_PER_HOUR`
    - Implement `FireworksAdapter.listNodes(minVramGb)` filtering `FIREWORKS_MODELS` entries by `minVramGb >= requested`, mapping each to a `ProviderNode` with `provider: "fireworks"`, `hardware_vendor: "AMD"`, `availability: true`, `is_warm: true`
    - Implement `safeSetHardwareVendor` wrapping the AMD tag assignment in try/catch, always falling through to return the vendor (never blocks node availability per 1.4)
    - _Requirements: 1.3, 1.4, 2.2, 2.3, 3.1_

  - [ ]* 2.3 Write property tests for Fireworks listing and pricing (Properties 2, 3, 4)
    - **Property 2: Fireworks nodes are always AMD, always warm, always available**
    - **Property 3: Fireworks node listing matches the VRAM filter exactly**
    - **Property 4: Fireworks price normalization formula**
    - **Validates: Requirements 1.3, 1.4, 2.2, 2.3, 3.1, 3.2**

  - [ ] 2.4 Implement FireworksAdapter job execution methods
    - Add `runJob`, `getJobStatus`, `getResult`, and `FireworksApiError` class to `services/price-aggregator/src/providers/fireworks.ts`
    - `runJob` posts to the Fireworks chat completions API with the mapped `modelId` and job input; on 2xx response stores `{status: "complete", content, tokens_generated}` keyed by a synthetic `providerJobId` (Redis key `fireworks:result:{providerJobId}`, TTL 300s); on error response stores `{status: "failed", error}`
    - `getJobStatus`/`getResult` read from that same cache entry rather than re-polling Fireworks
    - Ensure the write happens once from the single point where the HTTP result is inspected, so `complete` can never be reported off an error response
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 2.5 Write property test for Fireworks execution outcome mirroring (Property 5)
    - **Property 5: Fireworks job status mirrors the API outcome, never crossed**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [ ] 2.6 Add FIREWORKS_API_KEY startup validation and wire into polling cycle
    - In `services/price-aggregator/src/index.ts`: check `process.env.FIREWORKS_API_KEY` unconditionally on every start, before the first `pollAll()` run; log a distinct error message naming the missing variable and exit if unset
    - Add Fireworks as a third provider in the existing `pollAll()` tier/provider loop, calling `FireworksAdapter.listNodes(minVramForTier(tier))` and reusing the existing `cacheNodes`/Redis TTL machinery unchanged
    - Update `services/price-aggregator/src/providers/index.ts` to export the new adapter
    - _Requirements: 2.4, 2.5_

  - [ ] 2.7 Update Vast.ai and RunPod adapters for hardware_vendor field
    - Update `services/price-aggregator/src/providers/vastai.ts` and `runpod.ts` so `mapOfferToNode`/`mapGpuToNode` set `hardware_vendor: "unknown"` on every returned node (required field, not optional)
    - _Requirements: 1.2_

- [ ] 3. Checkpoint - Fireworks integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Provider_Adapter interface and job-scheduler adapter implementations
  - [ ] 4.1 Implement VastaiAdapter and RunpodAdapter full Provider_Adapter implementations
    - Create `services/job-scheduler/src/adapters/vastaiAdapter.ts` and `services/job-scheduler/src/adapters/runpodAdapter.ts` implementing the shared `ProviderAdapter` interface (`listNodes`, `runJob`, `getJobStatus`, `getResult`), replacing Stage 1's single placeholder dispatch fetch with real per-provider `runJob`/poll/`getResult` calls
    - Create `services/job-scheduler/src/adapters/index.ts` exporting a `getAdapter(provider: Provider): ProviderAdapter` factory that also returns the Fireworks adapter for `provider === "fireworks"`
    - _Requirements: 5.1_

  - [ ] 4.2 Implement Result_Store
    - Create `services/job-scheduler/src/resultStore.ts` with `StoredResult` interface, `ResultStore` interface, and `createResultStore(s3Client, bucket)` factory
    - Route text under 100KB to `result_text` (inline); route image, audio, and text at or above 100KB to S3-compatible upload (Cloudflare R2 via `@aws-sdk/client-s3`), recording `result_url`
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 4.3 Write property test for result storage routing (Property 8)
    - **Property 8: Result storage routing by type and size**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ] 4.4 Implement Job_Event_Channel publisher
    - Create `services/job-scheduler/src/jobEvents.ts` with `publishStatus(redis, jobId, status)` publishing `{status, updatedAt}` JSON to `neuralgrid:jobs:events:{job_id}`
    - Wrap the Redis `PUBLISH` call in try/catch; a publish failure is logged and swallowed, never thrown back into caller control flow
    - _Requirements: 7.1, 7.2_

  - [ ]* 4.5 Write property test for status publish non-blocking behavior (Property 9)
    - **Property 9: Status publish is best-effort and non-blocking**
    - **Validates: Requirements 7.1, 7.2**

- [ ] 5. Job_Executor cost calculation and accuracy tracking
  - [ ] 5.1 Implement actual cost calculation with margin
    - Create `services/job-scheduler/src/costCalculation.ts` with `calculateActualCost(node, result, stored)`
    - Per-token branch: `(tokens_generated / 1_000_000) * pricePerMToken * MARGIN_MULTIPLIER`; hourly branch: reuse Stage 1's `calculateCost(hourly_rate, runtime_seconds)` from `dispatcher.ts` then multiply by `MARGIN_MULTIPLIER`
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 5.2 Write property test for cost formula with margin (Property 10)
    - **Property 10: Actual cost formula with margin**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [ ] 5.3 Implement Estimator_Accuracy_Record classification
    - Create `services/job-scheduler/src/accuracy.ts` with `classifyAccuracy(predicted: Tier, actual: Tier)` returning `"correct" | "over_estimated" | "under_estimated"` by comparing tier order (`T1: 1, T2: 2, T3: 3`)
    - Implement `recordAccuracy(accuracyStore, request, stored)` that inserts into `estimator_accuracy_records`, awaited synchronously so a failed insert surfaces as a thrown error (classification not considered complete unless persisted)
    - _Requirements: 21.1_

  - [ ]* 5.4 Write property test for accuracy classification and persistence gating (Property 32)
    - **Property 32: Estimator accuracy classification correctness and persistence gating**
    - **Validates: Requirements 21.1**

- [ ] 6. Job_Executor dispatch/poll/execute loop
  - [ ] 6.1 Implement executeJob core loop
    - Create `services/job-scheduler/src/executor.ts` with `executeJob(request, allNodes, getAdapter, deps)` replacing the body of Stage 1's `dispatchJob` retry loop
    - Per attempt: publish `running` status, call adapter `runJob`, poll `getJobStatus` at a fixed interval while status is `running`, call `getResult` exactly once after polling stops, record result against the Job
    - Reuse `selectCheapestNode` from `services/job-scheduler/src/selector.ts` unchanged for picking the next node on retry; import `MAX_JOB_RETRIES` from `@neuralgrid/shared`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 6.2 Write property tests for dispatch and poll-until-terminal behavior (Properties 6, 7)
    - **Property 6: Job_Executor dispatches to the selected node's adapter exactly once per attempt**
    - **Property 7: Poll-until-terminal then fetch result**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ] 6.3 Implement retry exhaustion and webhook enqueue trigger in executeJob
    - On adapter failure or non-`complete` terminal status: add the failed provider to `failedProviders`, select next cheapest node excluding failed providers, retry up to `MAX_JOB_RETRIES` (2) additional times
    - On retries exhausted: set status `failed`, `actual_cost_usd` to `"0"`
    - On reaching `complete` or `failed`: always attempt to enqueue a webhook delivery for the matching event via `deps.webhookQueue`; if enqueue throws, surface a `completion_error` flag on the return value distinct from the Job's own `status` (does not roll back the status change)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 6.4 Write property tests for retry exhaustion and webhook enqueue attempt (Properties 11, 12)
    - **Property 11: Retry exhaustion terminates at zero cost, always a different provider**
    - **Property 12: Webhook enqueue is always attempted and its failure is surfaced**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ] 6.5 Wire Job_Executor into Job_Scheduler's Express server
    - Update `services/job-scheduler/src/index.ts` so `POST /internal/dispatch` invokes `executeJob` (via the worker pool) instead of Stage 1's mocked dispatch, passing `getAdapter`, `resultStore`, Redis publisher, webhook queue client, and accuracy store as deps
    - _Requirements: 5.1_

- [ ] 7. Database migration for Stage 2 job columns and webhooks
  - [ ] 7.1 Create Stage 2 migration
    - Create `scripts/migrations/002_stage2.sql` adding `jobs.result_text`, `jobs.result_url`, `jobs.runpod_a100_baseline_usd`, `jobs.tokens_generated`, `developers.is_admin`; creating `webhooks`, `webhook_deliveries`, `estimator_accuracy_records` tables with indexes as defined in design
    - _Requirements: 6.1, 6.2, 14.1, 21.1_

- [ ] 8. Checkpoint - End-to-end job execution complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. OpenAI-Compatible Endpoint
  - [ ] 9.1 Implement Model_Alias_Map and request validation
    - Create `services/api-gateway/src/routes/chatCompletions.ts` with `MODEL_ALIAS_MAP` record and a Zod `ChatCompletionRequestSchema` (`model`, `messages` min 1, optional `max_tokens`, `temperature`, `stream`)
    - Add `zod` as a dependency in `services/api-gateway/package.json`
    - Implement `resolveModel(model)`: alias map lookup first, then direct model-registry lookup, else `null`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 9.2 Write property tests for model resolution and parameter passthrough (Properties 13, 14)
    - **Property 13: OpenAI model resolution — alias, direct, or rejected**
    - **Property 14: Execution parameter passthrough**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

  - [ ] 9.3 Implement non-streaming chat completions handler and OpenAI response builder
    - In `services/api-gateway/src/routes/chatCompletions.ts`: implement `buildJobSubmission`, `submitAndAwaitCompletion` (reusing the existing `/v1/jobs` submission + poll path), and `buildOpenAIResponse(job, resolvedModel)` constructing the base OpenAI-shaped object first then spreading the `neuralgrid` extension object afterward
    - Add a static OpenAI list-price table (per-model) for computing `savings_vs_openai_pct`
    - Mount `POST /v1/chat/completions` returning 400 `MODEL_NOT_SUPPORTED` when `resolveModel` returns `null`
    - _Requirements: 10.1, 10.5, 11.1, 11.2, 11.3_

  - [ ]* 9.4 Write property test for OpenAI response shape completeness (Property 15)
    - **Property 15: OpenAI response shape completeness and additive extension**
    - **Validates: Requirements 11.1, 11.2, 11.3**

  - [ ] 9.5 Implement streaming chat completions (SSE)
    - Implement `streamChatCompletion(res, jobRequest)` and `dispatchStreamingJob` in `chatCompletions.ts`: write SSE headers, forward Fireworks' native stream chunk-for-chunk for Fireworks-routed jobs, fall back to a single chunk on `getResult` completion for non-streaming providers, terminate every stream with `data: [DONE]`
    - _Requirements: 12.1, 12.2_

  - [ ]* 9.6 Write property test for streaming chunk forwarding (Property 16)
    - **Property 16: Streaming forwards every chunk in order, terminated once**
    - **Validates: Requirements 12.1, 12.2**

  - [ ] 9.7 Implement chat completions authentication pre-check
    - Add a route-scoped middleware in `chatCompletions.ts` ahead of the existing `authMiddleware` from `services/api-gateway/src/middleware/auth.ts`: return 401 `UNAUTHORIZED` with an OpenAI-key guidance message when the Authorization header starts with `Bearer sk-` or `sk-`; fall through to `authMiddleware` otherwise (which already handles missing header and valid `ng_` key cases)
    - Mount the chat completions router in `services/api-gateway/src/index.ts`
    - _Requirements: 13.1, 13.2, 13.3_

  - [ ]* 9.8 Write property test for chat completions authentication gate (Property 17)
    - **Property 17: Chat completions authentication gate**
    - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ] 10. Webhook Delivery System
  - [ ] 10.1 Implement webhook CRUD routes
    - Create `services/api-gateway/src/routes/webhooks.ts`: `POST /v1/webhooks` (generate secret via `crypto.randomBytes(32).toString('hex')`, default `events` to `["job.complete", "job.failed"]`, `is_active: true`); `GET /v1/webhooks` (list developer's webhooks, secret stripped from every entry); `DELETE /v1/webhooks/:id` (set `is_active = false` if owned by caller, 404 otherwise, following the same ownership-isolation pattern as `jobs.ts`)
    - Mount the router in `services/api-gateway/src/index.ts`
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 10.2 Write property tests for webhook creation, secret exposure, and ownership isolation (Properties 18, 19, 20)
    - **Property 18: Webhook creation always yields a secret and correct defaults**
    - **Property 19: Webhook secret is never exposed on listing**
    - **Property 20: Webhook ownership isolation**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

  - [ ] 10.3 Implement webhook enqueue from Job_Executor
    - Add `enqueueWebhook(webhookQueue, jobId, event, payload)` to `services/job-scheduler/src/executor.ts` (or a new `webhookEnqueue.ts`): look up active webhooks for the job's developer whose `events` array contains the event name, push one `WebhookDeliveryJob` per match onto Redis list `neuralgrid:webhooks:queue`
    - _Requirements: 9.3, 15.1_

  - [ ]* 10.4 Write property test for webhook payload field completeness (Property 21)
    - **Property 21: Webhook payload field completeness**
    - **Validates: Requirements 15.1**

  - [ ] 10.5 Scaffold Webhook_Worker service
    - Create `services/webhook-worker/` with its own `package.json`, `tsconfig.json`, `Dockerfile`, structurally parallel to `services/job-scheduler/`
    - Create `services/webhook-worker/src/queue.ts` with `consumeQueue(redis, deps)` (`BLPOP` on `neuralgrid:webhooks:queue`) and a delayed-redelivery scanner that moves due entries from the `neuralgrid:webhooks:delayed` sorted set back onto the main queue
    - _Requirements: 16.1_

  - [ ] 10.6 Implement webhook signing and delivery attempt
    - Create `services/webhook-worker/src/delivery.ts` with `attemptDelivery(delivery, deps)`: compute `X-NeuralGrid-Signature` as `sha256=` + hex HMAC-SHA256 of the request body keyed by the webhook's secret; POST the signed payload to the webhook's `url`
    - _Requirements: 15.2_

  - [ ]* 10.7 Write property test for webhook signature round-trip (Property 22)
    - **Property 22: Webhook signature round-trip**
    - **Validates: Requirements 15.2**

  - [ ] 10.8 Implement webhook retry backoff and outcome recording
    - In `services/webhook-worker/src/delivery.ts`: define `RETRY_DELAYS_MS = [1000, 5000, 25000]`; on failed delivery, schedule redelivery via `ZADD neuralgrid:webhooks:delayed` at `attempt` index up to 3 retries; on success or final failure, record via `recordDeliverySuccess`/`recordDeliveryFailure` against `webhook_deliveries`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [ ]* 10.9 Write property test for webhook retry bounded backoff (Property 23)
    - **Property 23: Webhook retry bounded backoff and eventual outcome**
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4**

  - [ ] 10.10 Add webhook-worker to docker-compose
    - Add a `webhook-worker` service entry to `docker-compose.yml` alongside `job-scheduler`, with Redis and PostgreSQL dependencies
    - _Requirements: 16.1_

- [ ] 11. Checkpoint - OpenAI endpoint and webhooks complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Cost Savings Analytics
  - [ ] 12.1 Freeze RunPod A100 baseline at dispatch time
    - Move `RUNPOD_A100_RATE_PER_HOUR` from `services/api-gateway/src/routes/estimate.ts` to `packages/shared/src/constants.ts`, re-exporting from `estimate.ts` for backward compatibility
    - Update `services/job-scheduler/src/executor.ts` to write `runpod_a100_baseline_usd` on the job row once at dispatch time, before execution starts
    - _Requirements: 18.1_

  - [ ] 12.2 Implement Cost_Comparison_Service
    - Create `services/api-gateway/src/costComparison.ts` with `getCostComparison(job, priceLookup)` computing an estimate for every configured provider (`vastai`, `runpod`, `fireworks`) from the job's actual usage and each provider's current cached rate
    - Add `GET /v1/jobs/:id/cost-comparison` route in `services/api-gateway/src/routes/jobs.ts`, reusing the existing lookup-then-compare ownership pattern (404 `JOB_NOT_FOUND` on mismatch)
    - _Requirements: 18.2, 18.3_

  - [ ]* 12.3 Write property tests for cost comparison coverage and isolation (Properties 25, 26)
    - **Property 25: Cost comparison covers every configured provider**
    - **Property 26: Cost comparison ownership isolation**
    - **Validates: Requirements 18.2, 18.3**

  - [ ] 12.4 Implement savings aggregation endpoint
    - Add `GET /v1/analytics/savings` route (new `services/api-gateway/src/routes/analytics.ts`) grouping the developer's completed jobs by month/model/tier, computing total saved (current month, all-time), average savings percentage, and per-model/per-tier breakdowns from `actual_cost_usd` and `runpod_a100_baseline_usd`
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ]* 12.5 Write property test for savings aggregation arithmetic consistency (Property 24)
    - **Property 24: Savings aggregation arithmetic consistency**
    - **Validates: Requirements 17.1, 17.2, 17.3**

  - [ ] 12.6 Implement monthly projection and what-if calculator
    - Add `projectMonthlySavings(trailingJobs, trailingDays)` to `services/api-gateway/src/costComparison.ts` (or a new `projection.ts`), extrapolating trailing daily actual/baseline cost to 30 days
    - Add `GET /v1/analytics/what-if?model=...&count=...` route in `analytics.ts`, multiplying a model's typical per-job NeuralGrid cost and RunPod A100-equivalent cost by the given count
    - _Requirements: 19.1, 19.2_

  - [ ]* 12.7 Write property test for projection and what-if linear scaling (Property 27)
    - **Property 27: Monthly projection and what-if calculator scale linearly**
    - **Validates: Requirements 19.1, 19.2**

  - [ ] 12.8 Implement Savings_Dashboard page
    - Create `dashboard/src/app/savings/page.tsx` following the `billing/page.tsx` server-component pattern (session check via `getServerSession`, redirect to `/login` if absent)
    - Render hero cards (total saved this month, total saved all-time, average savings % per job), breakdown tables by model and by tier, and a monthly projection banner, sourced from `GET /v1/analytics/savings`
    - _Requirements: 17.1, 17.2, 17.3, 19.1_

  - [ ] 12.9 Add per-job cost comparison to job detail panel and what-if calculator to dashboard home
    - Update `dashboard/src/app/jobs/JobsClient.tsx` to display, per completed job, `actual_cost_usd`, the RunPod A100 equivalent, absolute amount saved, and savings percentage (via `GET /v1/jobs/:id/cost-comparison`)
    - Update `dashboard/src/app/page.tsx` with a client-side "what if" form (model + expected monthly job count) calling `GET /v1/analytics/what-if`
    - _Requirements: 18.1, 19.2_

- [ ] 13. Checkpoint - Savings analytics complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Provider Health Dashboard
  - [ ] 14.1 Implement Admin_Health_Endpoint
    - Create `services/api-gateway/src/routes/internalHealth.ts` with `GET /internal/health`, guarded by `X-Admin-Key` header compared against `process.env.ADMIN_KEY`, returning 401 `UNAUTHORIZED` on mismatch
    - Aggregate per-provider `{status, lastPoll, nodesAvailable, circuitBreaker}` from Price_Aggregator's existing `provider:failures:{provider}` Redis state (status never downgraded solely because `nodesAvailable === 0`); aggregate `jobs.last1h`/`jobs.last24h` counts and success rate from PostgreSQL `jobs`; aggregate `estimatorAccuracy` proportions from `estimator_accuracy_records`
    - Mount the router in `services/api-gateway/src/index.ts` outside the `/v1` auth/rate-limit middleware chain
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 14.2 Write property tests for provider health completeness and auth gate (Properties 28, 31)
    - **Property 28: Provider health completeness and status independence from node count**
    - **Property 31: Admin health endpoint authentication gate**
    - **Validates: Requirements 20.1, 20.2, 20.5**

  - [ ]* 14.3 Write property tests for job success rate and estimator accuracy aggregation (Properties 29, 30)
    - **Property 29: Job success rate aggregation correctness**
    - **Property 30: Estimator accuracy proportions match underlying counts**
    - **Validates: Requirements 20.3, 20.4**

  - [ ] 14.4 Add is_admin flag to session and implement Admin_Dashboard page
    - Extend NextAuth session/JWT callbacks in `dashboard/src/lib/auth.ts` to carry the `is_admin` flag from the `developers` table
    - Create `dashboard/src/app/admin/page.tsx` checking `session.user.isAdmin` before rendering (redirect to `/` with an access-denied state when false); fetch `/internal/health` server-side using a server-only admin key, render provider status, job counts/success rates, and estimator accuracy proportions
    - _Requirements: 22.1, 22.2_

- [ ] 15. Final checkpoint - All Stage 2 groups integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster delivery
- Each task references specific requirement acceptance criteria for traceability
- Property tests validate the 32 correctness properties from design.md using fast-check (minimum 100 iterations), matching the MVP's testing convention
- Unit tests validate specific examples and edge cases and are covered inside their parent implementation tasks per the existing project convention (e.g. `fireworks.test.ts`, `chatCompletions.test.ts`) rather than as standalone tasks
- Group A must land before Group B (Job_Executor's `getAdapter` factory returns the Fireworks adapter). Groups C and D depend on Group B's execution/completion path. Group E depends on Group B's actual-cost and baseline data. Group F is independent operational tooling and its tasks can be scheduled in parallel with C/D/E once Group B's checkpoint passes.
- `webhook-worker` is a new standalone service (its own `package.json`/Dockerfile), matching `job-scheduler`'s structure rather than a module inside `api-gateway`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.7"] },
    { "id": 3, "tasks": ["2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.4", "7.1"] },
    { "id": 6, "tasks": ["4.3", "4.5", "5.1", "5.3"] },
    { "id": 7, "tasks": ["5.2", "5.4", "6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3"] },
    { "id": 9, "tasks": ["6.4", "6.5"] },
    { "id": 10, "tasks": ["9.1", "10.1", "12.1", "14.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "10.2", "10.3", "12.2", "14.2", "14.3", "14.4"] },
    { "id": 12, "tasks": ["9.4", "9.5", "10.4", "10.5", "12.3", "12.4"] },
    { "id": 13, "tasks": ["9.6", "9.7", "10.6", "12.5", "12.6"] },
    { "id": 14, "tasks": ["9.8", "10.7", "10.8", "12.7", "12.8"] },
    { "id": 15, "tasks": ["10.9", "10.10", "12.9"] }
  ]
}
```
