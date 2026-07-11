# Requirements Document

## Introduction

NeuralGrid is an intelligent GPU task routing network that allows developers to submit AI jobs through a single REST API. The system automatically classifies compute demand for each job and routes it to the cheapest GPU tier across multiple providers (Vast.ai, RunPod) that can complete it reliably. The MVP targets a 30% average cost reduction compared to manually selecting GPUs on RunPod, with support for LLM inference, image generation, audio generation, and embeddings across 34 registered models.

## Glossary

- **API_Gateway**: The HTTP service (port 8080) that receives developer requests, authenticates them, validates input, and orchestrates calls to internal services
- **Compute_Estimator**: The service (port 8001) that predicts required VRAM and assigns a GPU tier for a given job based on model parameters, quantization, and token count
- **Price_Aggregator**: The service (port 8003) that queries GPU providers for current node pricing and caches results with a time-to-live (TTL)
- **Job_Scheduler**: The service (port 8002) that dispatches jobs to selected provider nodes, monitors execution, handles retries, and records results
- **Dashboard**: The Next.js web application (port 3000) that provides developers with job history, API key management, and spend tracking
- **Model_Registry**: A YAML-based catalog of 34 supported AI models with their VRAM requirements per quantization level and default tier assignments
- **GPU_Tier**: One of three hardware classes — T1 Lite (0–12GB VRAM), T2 Standard (12–28GB VRAM), or T3 Power (28GB+ VRAM)
- **Provider**: An external GPU marketplace (Vast.ai or RunPod in MVP) from which NeuralGrid rents compute nodes
- **Job**: A single AI workload submitted by a developer, consisting of a model, input payload, output configuration, and optional quantization preference
- **Quantization**: A model compression technique reducing precision (fp32, fp16, int8, int4) to lower VRAM requirements
- **Confidence_Level**: The Compute_Estimator's certainty in its tier assignment — HIGH (exact lookup), MEDIUM (heuristic with 20% buffer), or LOW (promote one tier)
- **Developer**: An authenticated user who submits jobs, views results, and manages billing through the API or Dashboard

## Requirements

### Requirement 1: Job Submission

**User Story:** As a developer, I want to submit an AI job with a model, input, and output configuration through a single API call, so that I do not need to manually select GPU hardware.

#### Acceptance Criteria

1. WHEN a developer sends a valid POST request to /v1/jobs with model, input, and output fields, THE API_Gateway SHALL return a 202 Accepted response containing the job ID, status "queued", assigned tier, estimated cost in USD, and a poll URL
2. WHEN a developer sends a POST request to /v1/jobs with a model not present in the Model_Registry, THE API_Gateway SHALL return a 400 error with code MODEL_NOT_SUPPORTED
3. WHEN a developer sends a POST request to /v1/jobs without a valid Authorization header, THE API_Gateway SHALL return a 401 error with code UNAUTHORIZED
4. WHEN a developer sends a POST request to /v1/jobs and the estimated cost exceeds the developer's configured max_cost_usd cap, THE API_Gateway SHALL return a 400 error with code BUDGET_EXCEEDED
5. WHEN a developer sends a POST request to /v1/jobs and no provider nodes are available at the required tier, THE API_Gateway SHALL return a 503 error with code INSUFFICIENT_CAPACITY

### Requirement 2: Job Status Polling

**User Story:** As a developer, I want to poll the status of my submitted job, so that I can know when my result is ready.

#### Acceptance Criteria

1. WHEN a developer sends a GET request to /v1/jobs/:id with a valid job ID belonging to that developer, THE API_Gateway SHALL return the current job status, tier, provider, estimated cost, and timestamps
2. WHEN a developer sends a GET request to /v1/jobs/:id with an ID that does not exist or belongs to another developer, THE API_Gateway SHALL return a 404 error with code JOB_NOT_FOUND
3. THE API_Gateway SHALL represent job status as one of the following values: queued, running, complete, or failed

### Requirement 3: Job Result Retrieval

**User Story:** As a developer, I want to retrieve the output of my completed job, so that I can use the AI-generated content in my application.

#### Acceptance Criteria

1. WHEN a developer sends a GET request to /v1/jobs/:id/result for a job with status "complete", THE API_Gateway SHALL return the result payload including output type, content, model used, and finish reason
2. WHEN a developer sends a GET request to /v1/jobs/:id/result for a job that is not yet complete, THE API_Gateway SHALL return a 409 error with code JOB_NOT_COMPLETE
3. WHEN the completed job is of type "image", THE API_Gateway SHALL return image URLs with expiration timestamps, width, and height
4. WHEN the completed job is of type "text", THE API_Gateway SHALL return the generated text content, tokens generated count, model identifier, and finish reason

### Requirement 4: Cost Estimation

**User Story:** As a developer, I want to get a cost estimate before submitting a job, so that I can decide whether to proceed based on expected spend.

#### Acceptance Criteria

1. WHEN a developer sends a GET request to /v1/models/:model_id/estimate with valid parameters (input_tokens, max_tokens, quantization), THE Compute_Estimator SHALL return the assigned tier, minimum VRAM in GB, estimated runtime in seconds, estimated cost in USD, and confidence level
2. WHEN the Compute_Estimator returns an estimate, THE API_Gateway SHALL include a comparison showing the equivalent cost on RunPod A100 and the percentage saving
3. WHEN a developer requests an estimate for a model not in the Model_Registry, THE API_Gateway SHALL return a 400 error with code MODEL_NOT_SUPPORTED

### Requirement 5: Model Listing

**User Story:** As a developer, I want to see all supported models with their capabilities, so that I can choose the right model for my workload.

#### Acceptance Criteria

1. WHEN a developer sends a GET request to /v1/models, THE API_Gateway SHALL return a list of all models in the Model_Registry including model ID, family, default tier, supported quantizations, input types, and output types
2. THE API_Gateway SHALL include the total count of available models in the response

### Requirement 6: Compute Estimation Logic

**User Story:** As the system, I want to accurately predict VRAM requirements for each job, so that jobs are assigned to the cheapest sufficient GPU tier.

#### Acceptance Criteria

1. WHEN the job model exists in the Model_Registry with an exact VRAM lookup value for the requested quantization, THE Compute_Estimator SHALL use that value and assign Confidence_Level HIGH
2. WHEN the job model is an LLM without an exact lookup, THE Compute_Estimator SHALL calculate VRAM using the formula: vram_gb = (params_billions × bytes_per_param × 1.2) + (token_count × 0.000002 × 1024), add a 20% buffer, and assign Confidence_Level MEDIUM
3. WHEN the Compute_Estimator assigns Confidence_Level LOW, THE Compute_Estimator SHALL promote the tier assignment one level higher than the calculated tier (T1 becomes T2, T2 becomes T3)
4. THE Compute_Estimator SHALL assign tier T1 for VRAM requirements between 0 and 12 GB, tier T2 for VRAM requirements between 12 and 28 GB, and tier T3 for VRAM requirements above 28 GB
5. THE Compute_Estimator SHALL use the following bytes-per-parameter values: 4 for fp32, 2 for fp16, 1 for int8, and 0.5 for int4

### Requirement 7: Price Aggregation

**User Story:** As the system, I want to query GPU providers for current pricing, so that jobs are routed to the cheapest available node at the required tier.

#### Acceptance Criteria

1. THE Price_Aggregator SHALL query Vast.ai and RunPod for available node pricing at each GPU tier
2. THE Price_Aggregator SHALL cache provider pricing in Redis with a 90-second TTL
3. WHEN cached pricing data exists and has not expired, THE Price_Aggregator SHALL return cached data without querying providers
4. WHEN a provider API query fails, THE Price_Aggregator SHALL continue serving cached data for that provider until the cache expires
5. IF a provider API is unreachable and cached data has expired, THEN THE Price_Aggregator SHALL exclude that provider from routing decisions until the provider becomes reachable again

### Requirement 8: Job Scheduling and Routing

**User Story:** As the system, I want to route each job to the optimal provider node, so that developers get the lowest cost for reliable execution.

#### Acceptance Criteria

1. WHEN a job is queued, THE Job_Scheduler SHALL select the provider node with the lowest hourly rate at the required GPU tier from available nodes returned by the Price_Aggregator
2. WHEN a job is dispatched to a provider node, THE Job_Scheduler SHALL update the job status to "running" and record the selected provider
3. WHEN a job completes on the provider node, THE Job_Scheduler SHALL update the job status to "complete", record the actual cost in USD, and store the result payload
4. IF a job fails on the provider node, THEN THE Job_Scheduler SHALL retry the job on a different provider node up to 2 additional times before marking the job as "failed"
5. WHEN the Job_Scheduler retries a failed job, THE Job_Scheduler SHALL select a different provider than the one that failed
6. THE Job_Scheduler SHALL process queued jobs using a worker pool of configurable size

### Requirement 9: Authentication and API Key Management

**User Story:** As a developer, I want to authenticate using API keys, so that my jobs and billing are securely associated with my account.

#### Acceptance Criteria

1. THE API_Gateway SHALL authenticate every API request using a Bearer token in the Authorization header with the prefix "ng_"
2. WHEN an API request contains an invalid or missing API key, THE API_Gateway SHALL return a 401 error with code UNAUTHORIZED
3. WHEN a developer exceeds the rate limit, THE API_Gateway SHALL return a 429 error with code RATE_LIMIT_EXCEEDED
4. THE Dashboard SHALL allow developers to create, view, and revoke API keys associated with their account

### Requirement 10: Billing via Stripe

**User Story:** As a developer, I want to be billed in USD for my actual compute usage, so that I only pay for what I consume.

#### Acceptance Criteria

1. WHEN a job completes, THE API_Gateway SHALL record the actual cost in USD based on the provider's hourly rate and the job's runtime duration
2. THE API_Gateway SHALL charge the developer's Stripe payment method for accumulated usage
3. IF a Stripe charge fails, THEN THE API_Gateway SHALL return a 402 error with code PAYMENT_FAILED on subsequent job submissions until payment is resolved
4. THE Dashboard SHALL display the developer's current billing period spend, job-level cost breakdown, and payment history

### Requirement 11: Developer Dashboard

**User Story:** As a developer, I want a web dashboard to view my job history, manage API keys, and monitor spend, so that I can track and control my NeuralGrid usage.

#### Acceptance Criteria

1. THE Dashboard SHALL display a list of the developer's submitted jobs with status, model, tier, cost, and timestamps
2. THE Dashboard SHALL display the developer's total spend for the current billing period
3. THE Dashboard SHALL allow developers to generate new API keys and revoke existing API keys
4. WHEN a developer signs in, THE Dashboard SHALL authenticate using NextAuth with JWT tokens
5. THE Dashboard SHALL display the cost savings achieved compared to equivalent RunPod A100 pricing

### Requirement 12: Job Input Validation

**User Story:** As the system, I want to validate all job inputs before processing, so that invalid requests fail fast with clear error messages.

#### Acceptance Criteria

1. WHEN a job submission specifies a quantization not supported by the requested model, THE API_Gateway SHALL return a 400 error with a descriptive message indicating supported quantizations for that model
2. WHEN a job submission is missing required fields (model, input, or output), THE API_Gateway SHALL return a 400 error with a message identifying the missing fields
3. WHEN a job submission specifies an input type not supported by the requested model, THE API_Gateway SHALL return a 400 error indicating the supported input types

### Requirement 13: Provider Failover

**User Story:** As the system, I want to fail over to alternate providers when the primary provider is unavailable, so that job execution is resilient to individual provider outages.

#### Acceptance Criteria

1. WHEN all nodes at the required tier from the selected provider are unavailable, THE Job_Scheduler SHALL attempt to route the job to a different provider at the same tier
2. IF no providers have available nodes at the required tier, THEN THE API_Gateway SHALL return a 503 error with code INSUFFICIENT_CAPACITY
3. WHEN a provider experiences repeated failures (3 or more consecutive failures), THE Job_Scheduler SHALL deprioritize that provider in routing decisions for 5 minutes
