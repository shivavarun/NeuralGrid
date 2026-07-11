# Implementation Plan: NeuralGrid MVP

## Overview

Implement NeuralGrid as a microservices-based GPU task routing system using TypeScript/Express for backend services, Next.js for the dashboard, PostgreSQL for persistence, Redis for caching, and Stripe for billing. Each service is independently deployable via Docker. Property-based tests use fast-check.

## Tasks

- [x] 1. Project structure and shared types
  - [x] 1.1 Initialize monorepo structure with services and shared packages
    - Create top-level `services/` directory with `api-gateway`, `compute-estimator`, `job-scheduler`, `price-aggregator` subdirectories
    - Create `dashboard/` directory for Next.js app
    - Create `packages/shared/` for shared TypeScript types and interfaces
    - Initialize each service with `package.json`, `tsconfig.json`
    - Add fast-check and vitest as dev dependencies in each service
    - _Requirements: All_

  - [x] 1.2 Define shared TypeScript interfaces and types
    - Create `packages/shared/src/types.ts` with `EstimateRequest`, `EstimateResponse`, `PriceRequest`, `PriceResponse`, `ProviderNode`, `DispatchRequest`, `JobStatusResponse`, `JobResult` interfaces
    - Create `packages/shared/src/errors.ts` with error codes enum (`UNAUTHORIZED`, `MODEL_NOT_SUPPORTED`, `BUDGET_EXCEEDED`, `INVALID_REQUEST`, `JOB_NOT_FOUND`, `JOB_NOT_COMPLETE`, `INSUFFICIENT_CAPACITY`, `RATE_LIMIT_EXCEEDED`, `PAYMENT_FAILED`, `INTERNAL_ERROR`)
    - Create `packages/shared/src/constants.ts` with tier thresholds, bytes-per-param map, quantization values
    - _Requirements: 6.4, 6.5, 2.3_

  - [x] 1.3 Create database migration scripts
    - Create `scripts/migrations/001_init.sql` with `developers`, `api_keys`, `jobs`, `billing_records` tables and indexes as defined in design
    - _Requirements: 9.1, 10.1, 11.1_

- [x] 2. Compute_Estimator service
  - [x] 2.1 Implement model registry loader
    - Create `services/compute-estimator/src/registry.ts` that loads and parses `model_registry.yaml`
    - Export functions: `getModel(id)`, `getAllModels()`, `modelExists(id)`
    - Cache parsed registry in memory on startup
    - _Requirements: 5.1, 6.1_

  - [x] 2.2 Implement VRAM calculation and tier assignment logic
    - Create `services/compute-estimator/src/estimator.ts`
    - Implement exact registry lookup (confidence HIGH)
    - Implement LLM formula: `vram = (params_B × bytes_per_param × 1.2) + (tokens × 0.000002 × 1024)` with 20% buffer (confidence MEDIUM)
    - Implement tier assignment: T1 (0-12GB), T2 (12-28GB), T3 (28GB+)
    - Implement LOW confidence tier promotion (T1→T2, T2→T3, T3 stays T3)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.3 Write property tests for VRAM calculation (Properties 1-3)
    - **Property 1: VRAM Calculation Correctness** — For any LLM with params_billions and quantization, verify formula produces correct VRAM. When exact registry lookup exists, verify confidence is HIGH.
    - **Property 2: Tier Assignment from VRAM** — For any VRAM value, verify T1 if 0≤VRAM≤12, T2 if 12<VRAM≤28, T3 if VRAM>28.
    - **Property 3: LOW Confidence Tier Promotion** — For any LOW confidence result, verify tier is one level above calculated tier.
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

  - [x] 2.4 Implement Compute_Estimator Express server and routes
    - Create `services/compute-estimator/src/index.ts` with Express app on port 8001
    - `POST /internal/estimate` endpoint accepting `EstimateRequest`, returning `EstimateResponse`
    - Add runtime estimation logic (based on tier and token count)
    - Add cost estimation using Price_Aggregator average rates
    - _Requirements: 4.1, 6.1, 6.2_

- [x] 3. Price_Aggregator service
  - [x] 3.1 Implement provider API clients
    - Create `services/price-aggregator/src/providers/vastai.ts` — query Vast.ai for available nodes by GPU tier
    - Create `services/price-aggregator/src/providers/runpod.ts` — query RunPod for available nodes by GPU tier
    - Each client returns `ProviderNode[]`
    - _Requirements: 7.1_

  - [x] 3.2 Implement Redis caching layer with 90s TTL
    - Create `services/price-aggregator/src/cache.ts`
    - Cache key format: `prices:{tier}:{provider}`
    - Set TTL to 90 seconds
    - Return cached data when provider API fails
    - Exclude provider when cache expired AND provider unreachable
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 3.3 Implement Price_Aggregator Express server with polling
    - Create `services/price-aggregator/src/index.ts` with Express app on port 8003
    - `GET /internal/prices/:tier` endpoint returning `PriceResponse`
    - Background polling every 60s to refresh prices
    - Track provider failures in Redis (`provider:failures:{provider}`, TTL 300s)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Job_Scheduler service
  - [x] 4.1 Implement cheapest node selection logic
    - Create `services/job-scheduler/src/selector.ts`
    - Given list of `ProviderNode[]`, select node with minimum `hourly_rate_usd`
    - Factor in provider deprioritization (circuit breaker)
    - _Requirements: 8.1, 13.3_

  - [x] 4.2 Write property test for cheapest node selection (Property 4)
    - **Property 4: Cheapest Node Selection** — For any non-empty set of available nodes at a tier, verify the selected node has the minimum hourly_rate_usd.
    - **Validates: Requirements 8.1**

  - [x] 4.3 Implement job dispatch and retry logic
    - Create `services/job-scheduler/src/dispatcher.ts`
    - Dispatch job to provider API
    - On failure: retry up to 2 additional times on a different provider
    - Track retries, never retry on same provider that failed
    - Update job status: queued → running → complete/failed
    - Calculate actual_cost_usd = hourly_rate × (runtime_seconds / 3600)
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 10.1_

  - [x] 4.4 Write property tests for retry logic and cost calculation (Properties 5, 17, 18)
    - **Property 5: Retry Invariant** — For any failed job, verify retry uses different provider and max 2 retries.
    - **Property 17: Actual Cost Calculation** — For any completed job, verify actual_cost = hourly_rate × (runtime_seconds / 3600).
    - **Property 18: Provider Circuit Breaker** — After 3 consecutive failures, verify provider is deprioritized for 5 minutes.
    - **Validates: Requirements 8.4, 8.5, 10.1, 13.3**

  - [x] 4.5 Implement worker pool and Job_Scheduler Express server
    - Create `services/job-scheduler/src/index.ts` with Express app on port 8002
    - `POST /internal/dispatch` endpoint accepting `DispatchRequest`
    - `GET /internal/job/:id` endpoint returning `JobStatusResponse`
    - Worker pool with configurable size (default 10)
    - Process queued jobs from PostgreSQL
    - _Requirements: 8.6, 8.2, 8.3_

  - [x] 4.6 Implement provider failover logic
    - When selected provider has no available nodes, route to different provider at same tier
    - If no providers available at tier, signal INSUFFICIENT_CAPACITY
    - _Requirements: 13.1, 13.2_

- [x] 5. Checkpoint - Core services implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. API_Gateway service
  - [x] 6.1 Implement authentication middleware
    - Create `services/api-gateway/src/middleware/auth.ts`
    - Validate Bearer token with "ng_" prefix
    - Lookup key_hash (SHA-256) in PostgreSQL `api_keys` table
    - Return 401 UNAUTHORIZED for invalid/missing keys
    - _Requirements: 9.1, 9.2_

  - [x] 6.2 Write property test for authentication (Property 7)
    - **Property 7: Authentication Enforcement** — For any request with missing, malformed, or invalid Authorization header, verify 401 UNAUTHORIZED response.
    - **Validates: Requirements 1.3, 9.1, 9.2**

  - [x] 6.3 Implement rate limiting middleware
    - Create `services/api-gateway/src/middleware/rateLimit.ts`
    - Track requests per API key in Redis (`rate_limit:{api_key_prefix}`, TTL 60s)
    - Return 429 RATE_LIMIT_EXCEEDED when limit exceeded
    - _Requirements: 9.3_

  - [x] 6.4 Implement input validation middleware
    - Create `services/api-gateway/src/middleware/validation.ts`
    - Validate required fields: model, input, output
    - Validate model exists in registry
    - Validate quantization supported by model
    - Validate input type supported by model
    - Return appropriate 400 errors with descriptive messages
    - _Requirements: 12.1, 12.2, 12.3, 1.2_

  - [x] 6.5 Write property tests for validation (Properties 6, 15, 16)
    - **Property 6: Invalid Model Rejection** — For any model not in registry, verify 400 MODEL_NOT_SUPPORTED.
    - **Property 15: Unsupported Quantization/Input Type** — For invalid quantization or input type, verify 400 with supported options listed.
    - **Property 16: Missing Field Validation** — For any subset of missing required fields, verify 400 identifying exactly which fields are missing.
    - **Validates: Requirements 1.2, 4.3, 12.1, 12.2, 12.3**

  - [x] 6.6 Implement job submission endpoint (POST /v1/jobs)
    - Create `services/api-gateway/src/routes/jobs.ts`
    - Orchestrate: validate → estimate (call Compute_Estimator) → check budget → get prices → dispatch (call Job_Scheduler)
    - Return 202 with job_id, status "queued", tier, estimated_cost, poll_url
    - Handle budget exceeded (400 BUDGET_EXCEEDED)
    - Handle no capacity (503 INSUFFICIENT_CAPACITY)
    - Check payment_status, return 402 PAYMENT_FAILED if Stripe charge previously failed
    - _Requirements: 1.1, 1.4, 1.5, 10.3_

  - [x] 6.7 Write property test for budget check (Property 8)
    - **Property 8: Budget Exceeded Detection** — For any job where estimated_cost > developer.max_cost_usd, verify 400 BUDGET_EXCEEDED.
    - **Validates: Requirements 1.4**

  - [x] 6.8 Implement job status endpoint (GET /v1/jobs/:id)
    - Return job status, tier, provider, estimated_cost, timestamps
    - Enforce job isolation: return 404 if job belongs to different developer
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.9 Write property tests for status and isolation (Properties 9, 10)
    - **Property 9: Job Status Value Invariant** — For any job, verify status is one of: queued, running, complete, failed.
    - **Property 10: Job Isolation** — For any request where job belongs to different developer, verify 404 JOB_NOT_FOUND.
    - **Validates: Requirements 2.2, 2.3**

  - [x] 6.10 Implement job result endpoint (GET /v1/jobs/:id/result)
    - Return result payload for complete jobs
    - Return 409 JOB_NOT_COMPLETE for non-complete jobs
    - Shape response by output type (text: content/tokens/model/finish_reason, image: urls/expires/width/height)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.11 Write property tests for result retrieval (Properties 11, 12)
    - **Property 11: Result Availability Gate** — For any non-complete job, verify 409 JOB_NOT_COMPLETE.
    - **Property 12: Result Shape by Output Type** — For text jobs verify content/tokens/model/finish_reason. For image jobs verify urls/expires/width/height.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 6.12 Implement cost estimate endpoint (GET /v1/models/:model_id/estimate)
    - Call Compute_Estimator, add RunPod A100 comparison with savings percentage
    - Return tier, min_vram_gb, estimated_runtime_seconds, estimated_cost_usd, confidence, vs_runpod_a100
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.13 Write property test for estimate response (Property 13)
    - **Property 13: Cost Estimate Response Completeness** — Verify response contains all required fields and saving_pct = (runpod_cost - estimated_cost) / runpod_cost × 100.
    - **Validates: Requirements 4.1, 4.2**

  - [x] 6.14 Implement models listing endpoint (GET /v1/models)
    - Return all models from registry with id, family, default_tier, supported_quantizations, input_types, output_types
    - Include total count
    - _Requirements: 5.1, 5.2_

  - [x] 6.15 Write property test for model listing (Property 14)
    - **Property 14: Model Registry Listing Completeness** — Verify response contains every model from registry and total equals models returned count.
    - **Validates: Requirements 5.1, 5.2**

  - [x] 6.16 Implement billing recording and Stripe integration
    - Record actual_cost_usd on job completion to `billing_records`
    - Charge developer's Stripe payment method for usage
    - Block submissions with 402 when payment previously failed
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.17 Wire up API_Gateway Express server
    - Create `services/api-gateway/src/index.ts` on port 8080
    - Mount all routes with auth, rate-limit, validation middleware chain
    - Error handling middleware for consistent error response format
    - _Requirements: 1.1, 9.1_

- [x] 7. Checkpoint - API_Gateway complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Dashboard (Next.js)
  - [x] 8.1 Initialize Next.js app with NextAuth
    - Create `dashboard/` with Next.js, configure NextAuth with JWT
    - Set up API client to call API_Gateway at port 8080
    - _Requirements: 11.4_

  - [x] 8.2 Implement jobs page
    - Create `/jobs` page displaying job list with status, model, tier, cost, timestamps
    - Add filtering and sorting
    - _Requirements: 11.1_

  - [x] 8.3 Implement API key management page
    - Create `/keys` page with create and revoke API key functionality
    - Display key prefix (ng_ + first 7 chars) and metadata
    - _Requirements: 9.4, 11.3_

  - [x] 8.4 Implement billing page
    - Create `/billing` page showing current period spend, job-level cost breakdown, payment history
    - Show savings vs RunPod A100 comparison
    - _Requirements: 10.4, 11.2, 11.5_

  - [x] 8.5 Write property test for billing display (Property 19)
    - **Property 19: Billing Period Spend Calculation** — Verify total spend equals sum of actual_cost_usd for all completed jobs in billing period. Verify savings_pct = (sum_runpod - sum_actual) / sum_runpod × 100.
    - **Validates: Requirements 11.2, 11.5**

- [x] 9. Integration and wiring
  - [x] 9.1 Create Docker configuration for each service
    - Create `Dockerfile` in each service directory
    - Verify `docker-compose.yml` works with all services
    - Ensure health checks and proper startup ordering
    - _Requirements: All_

  - [x] 9.2 Write integration tests for end-to-end job lifecycle
    - Test: submit job → poll status → retrieve result
    - Test: provider failover scenario
    - Test: rate limiting under concurrent requests
    - Mock external provider APIs (Vast.ai, RunPod)
    - _Requirements: 1.1, 2.1, 3.1, 8.1, 13.1_

- [x] 10. Final checkpoint - All services integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (min 100 iterations)
- Unit tests validate specific examples and edge cases
- All services use TypeScript with Express (except Dashboard which uses Next.js)
- Shared types in `packages/shared/` prevent interface drift between services

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "4.2"] },
    { "id": 4, "tasks": ["2.3", "2.4", "3.3", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 6, "tasks": ["6.1", "6.3", "6.4"] },
    { "id": 7, "tasks": ["6.2", "6.5", "6.6"] },
    { "id": 8, "tasks": ["6.7", "6.8", "6.10", "6.12", "6.14", "6.16"] },
    { "id": 9, "tasks": ["6.9", "6.11", "6.13", "6.15", "6.17"] },
    { "id": 10, "tasks": ["8.1"] },
    { "id": 11, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 12, "tasks": ["8.5", "9.1"] },
    { "id": 13, "tasks": ["9.2"] }
  ]
}
```
