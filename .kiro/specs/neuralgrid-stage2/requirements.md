# Requirements Document

## Introduction

NeuralGrid Stage 2 extends the Stage 1 MVP (Compute_Estimator, Price_Aggregator, Job_Scheduler, API_Gateway, Dashboard) from a routing demo into an end-to-end working product. Stage 1 selects a provider node for a job but does not execute it; Stage 2 wires real inference execution, adds AMD-hardware-backed capacity via Fireworks AI, exposes an OpenAI-compatible endpoint for zero-migration adoption, adds asynchronous webhook notifications, and makes the cost-savings value proposition visible in the Dashboard. An internal provider health view rounds out operational visibility.

Stage 2 work is organized into six requirement groups, each corresponding to a PRD spec and carrying the priority defined in the Stage 2 PRD build order:

| Group | Spec | Priority | Summary |
|---|---|---|---|
| A | SPEC-01 | P0 | Fireworks AI provider adapter, AMD hardware flag |
| B | SPEC-02 | P0 | End-to-end job execution, result storage, real cost calculation, status events, retries |
| C | SPEC-03 | P1 | OpenAI-compatible `/v1/chat/completions` endpoint |
| D | SPEC-04 | P1 | Webhook registration and delivery |
| E | SPEC-05 | P1 | Cost savings analytics in the Dashboard |
| F | SPEC-06 | P2 | Internal provider health endpoint and admin dashboard page |

Build order: Group A → Group B (Week 1) → Group C → Group D (Week 2) → Group E → Group F (Week 3). Group B depends on Group A's adapter shape. Group C depends on Group B's execution path. Group D depends on Group B's completion events. Group E depends on Group B's actual-cost data. Group F is independent operational tooling and can proceed in parallel with any other group.

**Note on an existing behavior change:** Stage 1 Requirement 10.1 defines `actual_cost_usd = provider_hourly_rate × (runtime_seconds / 3600)`. Stage 2 introduces a 20% margin on top of provider cost for all execution paths (Requirement 8 below). This supersedes the Stage 1 formula for jobs executed under Stage 2; it is called out explicitly here rather than silently redefining Property 17 from the MVP design.

## Glossary

- **Fireworks_Adapter**: The Price_Aggregator provider adapter module that lists Fireworks AI serverless models as nodes and executes inference jobs through the Fireworks chat completions API
- **Fireworks_Model_Map**: The static mapping from NeuralGrid model identifiers to Fireworks model IDs, Tier, minimum VRAM, and price per million tokens
- **Hardware_Vendor**: A field on a provider node with value `AMD`, `NVIDIA`, or `unknown`, identifying the underlying GPU vendor for that node
- **Job_Executor**: The Job_Scheduler component that invokes a provider adapter's execution method, polls for completion, and retrieves the final result, as opposed to Stage 1's node-selection-only behavior
- **Provider_Adapter**: The common interface (`listNodes`, `runJob`, `getJobStatus`, `getResult`) implemented by each provider integration (Vast.ai, RunPod, Fireworks) so the Job_Executor can call any provider uniformly
- **Result_Store**: The storage routing logic that persists text results under 100KB inline in PostgreSQL and persists image or audio results to S3-compatible object storage, recording the resulting URL
- **Job_Event_Channel**: The Redis pub/sub channel `neuralgrid:jobs:events:{job_id}` on which the Job_Executor publishes job status updates
- **OpenAI_Compat_Endpoint**: The API_Gateway route `POST /v1/chat/completions` that accepts OpenAI's chat completions request schema and returns OpenAI's response schema
- **Model_Alias_Map**: The static mapping from OpenAI model names (for example `gpt-3.5-turbo`) to NeuralGrid model identifiers (for example `llama-3-8b`)
- **NeuralGrid_Extension**: The optional `neuralgrid` object appended to an OpenAI-compatible response, containing `actual_cost_usd`, `tier_used`, `provider`, and `savings_vs_openai_pct`
- **Webhook**: A developer-registered HTTPS URL, signing secret, and event subscription list, stored in the `webhooks` table, to which the Webhook_Worker delivers job lifecycle notifications
- **Webhook_Worker**: The background process that consumes queued webhook deliveries from Redis, sends a signed HTTP POST to the registered URL, and retries on failure
- **Webhook_Signature**: The `X-NeuralGrid-Signature` request header containing an HMAC-SHA256 signature of the webhook payload, keyed by the Webhook's secret
- **Cost_Comparison_Service**: The logic that computes, for a given job, the actual cost charged versus the equivalent cost on the RunPod A100 baseline
- **Savings_Dashboard**: The Dashboard page at `/dashboard/savings` presenting aggregate and per-model cost savings
- **Monthly_Projection**: An estimate of monthly spend on NeuralGrid versus the RunPod A100 baseline, computed from a developer's historical usage rate or from "what if" calculator inputs
- **Admin_Health_Endpoint**: The internal route `GET /internal/health`, accessible only with a valid admin key, reporting per-provider status and job success rates
- **Admin_Dashboard**: The Dashboard page at `/dashboard/admin`, visible only to accounts flagged as admin, rendering the data returned by the Admin_Health_Endpoint
- **Estimator_Accuracy_Record**: A per-job comparison of the Compute_Estimator's predicted VRAM tier against the VRAM tier the job actually required, classified as correct, over-estimated, or under-estimated

## Requirements

## Group A — Fireworks AI Integration (P0)

### Requirement 1: Provider Type Extension for Fireworks and AMD Cloud

**User Story:** As the system, I want Fireworks AI recognized as a first-class provider with an associated hardware vendor, so that jobs can be routed to AMD-backed capacity alongside Vast.ai and RunPod.

#### Acceptance Criteria

1. THE Provider type in the shared package SHALL include the values `vastai`, `runpod`, `fireworks`, and `amd-cloud`
2. THE ProviderNode type in the shared package SHALL include a `hardware_vendor` field with value `AMD`, `NVIDIA`, or `unknown`
3. WHERE a provider node originates from the Fireworks_Adapter, THE Price_Aggregator SHALL set that node's `hardware_vendor` to `AMD`
4. IF setting a Fireworks_Adapter node's `hardware_vendor` to `AMD` fails or is skipped, THEN THE Price_Aggregator SHALL proceed with that node using its current `hardware_vendor` value and SHALL NOT block the node from becoming available
5. THE `amd-cloud` provider value SHALL be reserved for a future adapter; Group A SHALL NOT require an implemented adapter for `amd-cloud`

### Requirement 2: Fireworks Model Listing

**User Story:** As the system, I want to list Fireworks AI's supported serverless models as provider nodes, so that the scheduler can consider them when routing a job.

#### Acceptance Criteria

1. THE Fireworks_Model_Map SHALL define, for each supported model, a Fireworks model identifier, a Tier, a minimum VRAM in GB, and a price per million tokens
2. WHEN the Price_Aggregator requests nodes from the Fireworks_Adapter for a minimum VRAM value, THE Fireworks_Adapter SHALL return one node per Fireworks_Model_Map entry whose minimum VRAM meets or exceeds the requested value
3. THE Fireworks_Adapter SHALL mark every node it returns with `availability` true and `is_warm` true, because Fireworks capacity is serverless and requires no cold start
4. THE Price_Aggregator SHALL check for the `FIREWORKS_API_KEY` environment variable every time it starts
5. IF the `FIREWORKS_API_KEY` environment variable is not set, THEN THE Price_Aggregator SHALL fail to start and SHALL log an error identifying the missing variable, distinct from errors logged for other startup failures

### Requirement 3: Fireworks Price Normalization

**User Story:** As the system, I want Fireworks' per-token pricing converted into an hourly-rate equivalent, so that Fireworks nodes can be compared fairly against hourly-billed providers during node selection.

#### Acceptance Criteria

1. THE Fireworks_Adapter SHALL compute each node's `hourly_rate_usd` as `(price_per_million_tokens / 1,000,000) × 500,000`
2. FOR ALL Fireworks_Model_Map entries, THE computed `hourly_rate_usd` SHALL be a positive number proportional to `price_per_million_tokens`

### Requirement 4: Fireworks Job Execution

**User Story:** As the system, I want to submit inference jobs directly to Fireworks AI, so that LLM jobs routed to Fireworks nodes produce real output.

#### Acceptance Criteria

1. WHEN the Job_Executor invokes the Fireworks_Adapter's `runJob` for a text generation Job, THE Fireworks_Adapter SHALL call the Fireworks chat completions API with the mapped Fireworks model identifier and the Job's input
2. WHEN the Fireworks chat completions API returns a successful response, THE Fireworks_Adapter SHALL report JobStatus `complete` and SHALL return the generated content and tokens generated
3. IF the Fireworks chat completions API returns an error response, THEN THE Fireworks_Adapter SHALL report JobStatus `failed` with the error detail and SHALL override the Job's status to `failed` regardless of any prior status
4. THE Fireworks_Adapter SHALL NOT report JobStatus `complete` for a Job for which the Fireworks chat completions API returned an error response

## Group B — End-to-End Job Execution (P0)

### Requirement 5: Job Execution Dispatch

**User Story:** As the system, I want the Job_Scheduler to actually execute a job on the selected node rather than only recording a selection, so that developers receive real results instead of a permanently queued job.

#### Acceptance Criteria

1. WHEN a Job is dispatched to a selected ProviderNode, THE Job_Executor SHALL invoke that provider's Provider_Adapter `runJob` method with the Job specification
2. WHEN a Provider_Adapter `runJob` call returns a provider job identifier, THE Job_Executor SHALL poll that Provider_Adapter's `getJobStatus` method at a fixed interval until the returned status is no longer `running`
3. WHEN polling reports a status other than `running`, THE Job_Executor SHALL invoke the Provider_Adapter's `getResult` method and SHALL record the returned result against the Job

### Requirement 6: Result Storage Routing

**User Story:** As the system, I want result payloads routed to the appropriate storage backend by type and size, so that large binary outputs do not bloat the primary database.

#### Acceptance Criteria

1. WHEN a completed Job's output type is text and the content is under 100KB, THE Result_Store SHALL store the content inline in the `jobs.result_text` column in PostgreSQL
2. WHEN a completed Job's output type is image or audio, THE Result_Store SHALL upload the binary content to S3-compatible object storage and SHALL record the resulting URL on the Job
3. IF a completed Job's text output is 100KB or larger, THEN THE Result_Store SHALL upload the content to S3-compatible object storage and SHALL record the resulting URL on the Job rather than storing it inline

### Requirement 7: Real-Time Job Status Events

**User Story:** As a developer, I want job status changes published immediately, so that the Dashboard and my own client can reflect job progress without repeated polling.

#### Acceptance Criteria

1. WHEN a Job's status changes, THE Job_Executor SHALL publish a message containing the new status and an update timestamp to the Job_Event_Channel for that Job
2. IF publishing to the Job_Event_Channel fails, THEN THE Job_Executor SHALL still proceed with the Job's status change, and the publish failure SHALL NOT block or roll back that status change

### Requirement 8: Actual Cost Calculation with Margin

**User Story:** As the system, I want the true cost of an executed job calculated consistently across per-token and hourly providers, so that billing reflects real usage plus NeuralGrid's margin.

#### Acceptance Criteria

1. WHEN a Job completes on a per-token provider, THE Job_Executor SHALL calculate `actual_cost_usd` as `(tokens_generated / 1,000,000) × price_per_million_tokens × 1.20`
2. WHEN a Job completes on an hourly-billed provider, THE Job_Executor SHALL calculate `actual_cost_usd` as `(runtime_seconds / 3600) × hourly_rate_usd × 1.20`
3. THE 1.20 multiplier in this Requirement SHALL apply to every Job executed through the Job_Executor, regardless of provider

### Requirement 9: Execution Failure Retry and Webhook Trigger

**User Story:** As the system, I want failed executions retried on a different node and completions to trigger any registered webhook, so that transient provider failures are absorbed and developers are notified asynchronously.

#### Acceptance Criteria

1. IF a Job execution fails on a provider node, THEN THE Job_Executor SHALL retry execution on a different node up to 2 additional times, consistent with Requirement 8.4 of the Stage 1 MVP requirements
2. IF a Job exhausts all retries without success, THEN THE Job_Executor SHALL set the Job's status to `failed` and SHALL set `actual_cost_usd` to `0`
3. WHEN a Job reaches status `complete` or `failed` and the developer has an active Webhook subscribed to the corresponding event, THE Job_Executor SHALL always attempt to enqueue a webhook delivery for that event
4. IF enqueueing a webhook delivery fails, THEN THE Job_Executor SHALL treat the Job's completion process as failed

## Group C — OpenAI-Compatible Endpoint (P1)

### Requirement 10: Chat Completions Request Handling

**User Story:** As a developer, I want to call NeuralGrid using the same request shape as the OpenAI chat completions API, so that I can switch providers by changing only my API base URL.

#### Acceptance Criteria

1. WHEN a developer sends a POST request to the OpenAI_Compat_Endpoint with `model` and a non-empty `messages` array, THE API_Gateway SHALL accept the request and SHALL submit an equivalent Job to the Job_Scheduler
2. WHEN the request's `model` value is a key in the Model_Alias_Map, THE API_Gateway SHALL translate it to the corresponding NeuralGrid model identifier before job submission
3. WHEN the request's `model` value is not a key in the Model_Alias_Map but matches a NeuralGrid model identifier directly, THE API_Gateway SHALL submit the Job using that model identifier
4. IF the request's `model` value is neither a Model_Alias_Map key nor a known NeuralGrid model identifier, THEN THE API_Gateway SHALL return a 400 error with code MODEL_NOT_SUPPORTED
5. WHEN the request includes `max_tokens` or `temperature`, THE API_Gateway SHALL forward those values to the underlying Job's execution parameters

### Requirement 11: OpenAI-Compatible Response Shape

**User Story:** As a developer, I want the response from the chat completions endpoint to match OpenAI's response schema, so that existing OpenAI SDK response parsing works unmodified.

#### Acceptance Criteria

1. WHEN a Job submitted through the OpenAI_Compat_Endpoint completes, THE API_Gateway SHALL return a response containing `id`, `object` set to `chat.completion`, `created`, `model`, a `choices` array with one entry containing `index` 0, a `message` with `role` `assistant` and the generated `content`, a `finish_reason`, and a `usage` object with `prompt_tokens`, `completion_tokens`, and `total_tokens`
2. THE API_Gateway SHALL include a `neuralgrid` NeuralGrid_Extension object on every completed response containing `actual_cost_usd`, `tier_used`, `provider`, and `savings_vs_openai_pct`
3. THE presence of the NeuralGrid_Extension object SHALL NOT cause a response otherwise valid against the OpenAI response schema to become invalid against that schema

### Requirement 12: Streaming Chat Completions

**User Story:** As a developer, I want to receive streamed tokens for chat completions, so that my application can render partial output as it is generated.

#### Acceptance Criteria

1. WHEN a developer sends a POST request to the OpenAI_Compat_Endpoint with `stream` set to true, THE API_Gateway SHALL respond using Server-Sent Events and SHALL forward each token chunk as it is produced by the underlying provider
2. WHEN a streamed response completes, THE API_Gateway SHALL send a final SSE message of `data: [DONE]`

### Requirement 13: Chat Completions Authentication

**User Story:** As a developer, I want a clear error if I use an OpenAI key instead of a NeuralGrid key, so that I can quickly fix my configuration.

#### Acceptance Criteria

1. WHEN a request to the OpenAI_Compat_Endpoint includes a valid NeuralGrid API key with the `ng_` prefix, THE API_Gateway SHALL authenticate the request as it does for other `/v1` routes
2. IF a request to the OpenAI_Compat_Endpoint includes an Authorization header whose key begins with `sk-`, THEN THE API_Gateway SHALL return a 401 error with code UNAUTHORIZED and a message directing the developer to obtain a NeuralGrid API key
3. IF a request to the OpenAI_Compat_Endpoint is missing an Authorization header, THEN THE API_Gateway SHALL return a 401 error with code UNAUTHORIZED

## Group D — Webhook Delivery System (P1)

### Requirement 14: Webhook Registration

**User Story:** As a developer, I want to register a URL to receive job lifecycle notifications, so that I do not need to poll for job completion.

#### Acceptance Criteria

1. WHEN a developer sends a POST request to `/v1/webhooks` with a valid `url`, THE API_Gateway SHALL create a Webhook record with a generated signing secret, a default `events` list of `job.complete` and `job.failed`, and `is_active` true
2. WHEN a developer sends a GET request to `/v1/webhooks`, THE API_Gateway SHALL return the developer's registered Webhooks, excluding each Webhook's secret from the response body
3. WHEN a developer sends a DELETE request to `/v1/webhooks/:id` for a Webhook belonging to that developer, THE API_Gateway SHALL deactivate the Webhook
4. IF a developer sends a DELETE request to `/v1/webhooks/:id` for a Webhook belonging to another developer, THEN THE API_Gateway SHALL return a 404 error and SHALL NOT deactivate or otherwise modify that Webhook

### Requirement 15: Webhook Delivery and Signing

**User Story:** As a developer, I want delivered webhook payloads signed, so that I can verify the notification originated from NeuralGrid.

#### Acceptance Criteria

1. WHEN the Webhook_Worker delivers a queued notification, THE Webhook_Worker SHALL send an HTTP POST to the Webhook's `url` containing the job event payload with fields `event`, `job_id`, `status`, `tier_used`, `provider`, `actual_cost_usd`, `savings_vs_runpod_pct`, and `timestamp`
2. THE Webhook_Worker SHALL include a Webhook_Signature header computed as the HMAC-SHA256 of the request body, keyed by the Webhook's secret, formatted as `sha256=<hex_digest>`, regardless of the payload's `actual_cost_usd` or `savings_vs_runpod_pct` values, including zero-cost or zero-savings Jobs

### Requirement 16: Webhook Delivery Retry

**User Story:** As the system, I want failed webhook deliveries retried with backoff and eventually abandoned, so that a developer's unreachable endpoint does not consume delivery resources indefinitely.

#### Acceptance Criteria

1. IF a webhook delivery attempt does not receive a successful HTTP response, THEN THE Webhook_Worker SHALL retry delivery after 1 second, then after 5 seconds, then after 25 seconds
2. IF all retry attempts for a webhook delivery fail, THEN THE Webhook_Worker SHALL stop retrying that delivery and SHALL record it as failed
3. THE Webhook_Worker SHALL NOT attempt more than 3 retries for a single queued delivery
4. IF the maximum number of retries has been reached but the delivery is subsequently marked as successful, THEN THE Webhook_Worker SHALL record that delivery as successful rather than failed

## Group E — Cost Savings Analytics Dashboard (P1)

### Requirement 17: Savings Dashboard Page

**User Story:** As a developer, I want a dedicated page showing how much I have saved, so that I can see the value NeuralGrid provides at a glance.

#### Acceptance Criteria

1. WHEN a developer navigates to the Savings_Dashboard, THE Dashboard SHALL display total amount saved for the current calendar month, total amount saved across all time, and average savings percentage per Job
2. THE Savings_Dashboard SHALL display savings broken down by model
3. THE Savings_Dashboard SHALL display savings broken down by Tier

### Requirement 18: Per-Job Cost Comparison

**User Story:** As a developer, I want to see how a specific job's cost compares to the RunPod A100 baseline, so that I understand the savings for that individual job.

#### Acceptance Criteria

1. WHEN a developer views a completed Job's detail panel, THE Dashboard SHALL display that Job's `actual_cost_usd`, the equivalent RunPod A100 cost for that Job, the absolute amount saved, and the savings percentage
2. WHEN a developer sends a GET request to `/v1/jobs/:id/cost-comparison` for a completed Job belonging to that developer, THE Cost_Comparison_Service SHALL return the estimated cost of that Job on each configured provider
3. IF a developer sends a GET request to `/v1/jobs/:id/cost-comparison` for a Job belonging to another developer, THEN THE API_Gateway SHALL return a 404 error with code JOB_NOT_FOUND

### Requirement 19: Monthly Projection and What-If Calculator

**User Story:** As a developer, I want to project my monthly savings and experiment with hypothetical usage, so that I can estimate NeuralGrid's value before committing to higher usage.

#### Acceptance Criteria

1. THE Savings_Dashboard SHALL display a Monthly_Projection stating the estimated dollar amount saved per month versus the RunPod A100 baseline, computed from the developer's trailing usage rate
2. WHEN a developer enters a model and an expected monthly Job count into the Dashboard home "what if" calculator, THE Dashboard SHALL display the estimated monthly cost on NeuralGrid and the estimated monthly cost on the RunPod A100 baseline for that input

## Group F — Provider Health Dashboard (P2)

### Requirement 20: Internal Provider Health Endpoint

**User Story:** As an operator, I want a single endpoint reporting the health of every provider, so that I can diagnose routing or capacity issues quickly.

#### Acceptance Criteria

1. WHEN a request to the Admin_Health_Endpoint includes a valid admin key, THE API_Gateway SHALL return, for every configured provider, its status, last poll timestamp, count of available nodes, and circuit breaker state
2. A provider whose count of available nodes is zero MAY still be reported with an active or healthy status; a zero count of available nodes alone SHALL NOT imply a degraded or unhealthy status
3. THE Admin_Health_Endpoint response SHALL include Job counts and success rate for the trailing 1 hour and the trailing 24 hours
4. THE Admin_Health_Endpoint response SHALL include the proportion of Jobs classified as correct tier, over-estimated, and under-estimated, based on Estimator_Accuracy_Records
5. IF a request to the Admin_Health_Endpoint does not include a valid admin key, THEN THE API_Gateway SHALL return a 401 error with code UNAUTHORIZED

### Requirement 21: Estimator Accuracy Tracking

**User Story:** As an operator, I want each job's predicted tier compared against what it actually required, so that the Compute_Estimator's accuracy over time is measurable.

#### Acceptance Criteria

1. WHEN a Job completes, THE Job_Executor SHALL classify the Job's predicted Tier as correct, over-estimated, or under-estimated relative to the Job's actual resource usage, and SHALL persist that classification as an Estimator_Accuracy_Record; the classification SHALL NOT be considered complete unless the Estimator_Accuracy_Record is successfully persisted

### Requirement 22: Admin Dashboard Page

**User Story:** As an admin, I want a dashboard page showing provider health, so that I do not need to query the health endpoint directly.

#### Acceptance Criteria

1. WHEN an account flagged as admin navigates to the Admin_Dashboard, THE Dashboard SHALL render the data returned by the Admin_Health_Endpoint
2. IF an account not flagged as admin navigates to the Admin_Dashboard, THEN THE Dashboard SHALL deny access and SHALL NOT render provider health data
