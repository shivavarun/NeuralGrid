# NeuralGrid — Stage 2 PRD (Post-Hackathon)
# For Kiro IDE execution
**Version:** 3.0 | **Status:** Active | **Prerequisite:** Hackathon MVP complete

---

## Current state assessment

### What is already built (Stage 1 ✅)
- Compute Estimator — VRAM profiling, tier assignment, 34 models
- Price Aggregator — Vast.ai + RunPod polling, Redis cache, circuit breaker
- Job Scheduler — worker pool, retry logic, node scoring
- API Gateway — JWT auth, rate limiting, Stripe billing, full REST
- Dashboard — Next.js, job submission, monitoring, billing
- Shared package — types, constants, error definitions
- Docker Compose — full local orchestration

### What is missing (Stage 2 targets)

**Critical gaps for real users:**
1. No Fireworks AI / AMD integration (hackathon requires it, real users need it)
2. No end-to-end job execution — dispatch exists but actual inference not wired
3. No OpenAI-compatible endpoint — biggest adoption lever
4. No actual model execution layer — provider SDKs not fully integrated
5. No webhook delivery system
6. No provider health dashboard
7. No cost savings analytics (the core value prop has no UI proof)

---

## Stage 2 Specs

---

### SPEC-01: Fireworks AI Integration

**Priority:** P0 — required for hackathon AND real users

#### What to build
A fully working Fireworks AI provider adapter that executes real LLM inference jobs.

#### Requirements

**REQ-01-1:** Add `fireworks` to the `Provider` union type in `@neuralgrid/shared`

**REQ-01-2:** Implement `FireworksAdapter` in price-aggregator service:
```typescript
class FireworksAdapter implements ProviderAdapter {
  // Lists available models as "nodes" (serverless = always available)
  async listNodes(minVramGb: number): Promise<NodePrice[]>
  
  // Runs actual inference via Fireworks chat completions API
  async runJob(jobSpec: JobSpec): Promise<JobResult>
  
  // Fireworks is serverless — no spin-up/terminate needed
  async getJobStatus(jobId: string): Promise<JobStatus>
}
```

**REQ-01-3:** Fireworks model mapping — these models are available:
```typescript
const FIREWORKS_MODELS = {
  'llama-3-8b':    { modelId: 'accounts/fireworks/models/llama-v3-8b-instruct',    tier: 'T1', vramGb: 8,   pricePerMToken: 0.20 },
  'llama-3-70b':   { modelId: 'accounts/fireworks/models/llama-v3-70b-instruct',   tier: 'T3', vramGb: 40,  pricePerMToken: 0.90 },
  'mixtral-8x7b':  { modelId: 'accounts/fireworks/models/mixtral-8x7b-instruct',   tier: 'T2', vramGb: 24,  pricePerMToken: 0.50 },
  'llama-3-405b':  { modelId: 'accounts/fireworks/models/llama-v3p1-405b-instruct',tier: 'T3', vramGb: 192, pricePerMToken: 3.00 },
  'qwen2-72b':     { modelId: 'accounts/fireworks/models/qwen2-72b-instruct',      tier: 'T3', vramGb: 40,  pricePerMToken: 0.90 },
  'phi-3-mini':    { modelId: 'accounts/fireworks/models/phi-3-mini-128k-instruct', tier: 'T1', vramGb: 4,   pricePerMToken: 0.10 },
};
```

**REQ-01-4:** Price normalization — convert per-token pricing to $/hr equivalent for fair comparison with other providers:
`hourlyRateEquivalent = (pricePerMToken / 1_000_000) * estimatedTokensPerHour`
Where estimatedTokensPerHour = 500,000 (Fireworks typical throughput)

**REQ-01-5:** Fireworks nodes are always marked `isWarm: true` (serverless — no cold start)

**REQ-01-6:** AMD hardware flag — add `hardwareVendor: 'AMD' | 'NVIDIA' | 'unknown'` to `NodePrice` type. Fireworks MI300X nodes = `'AMD'`

**REQ-01-7:** `FIREWORKS_API_KEY` env var required. Service must fail fast with clear error if missing.

#### Tasks
- [ ] Add `fireworks` and `amd-cloud` to Provider type in shared package
- [ ] Add `hardwareVendor` field to NodePrice type
- [ ] Create `services/price-aggregator/src/providers/fireworks.ts`
- [ ] Implement `listNodes()` from FIREWORKS_MODELS mapping
- [ ] Implement `runJob()` calling Fireworks chat completions API
- [ ] Implement price normalization (REQ-01-4)
- [ ] Add FIREWORKS_API_KEY to docker-compose and .env.example
- [ ] Unit tests: listNodes returns correct tiers for VRAM filter
- [ ] Unit tests: price normalization formula
- [ ] Integration test: real Fireworks API call with test key
- [ ] Update Price Aggregator to include Fireworks in polling cycle

---

### SPEC-02: End-to-End Job Execution

**Priority:** P0 — without this, NeuralGrid doesn't actually work

#### What to build
Wire the full execution path: API Gateway → Scheduler → Provider SDK → Result storage → Webhook delivery.

#### Requirements

**REQ-02-1:** Job Scheduler must call the actual provider execution method after node selection:
```typescript
// Current (broken): scheduler selects node but doesn't execute
// Required: scheduler dispatches AND waits for result

async function executeJob(job: Job, node: NodePrice): Promise<JobResult> {
  const adapter = getProviderAdapter(node.provider);
  const providerJobId = await adapter.runJob(job, node);
  
  // Poll until complete
  let status: JobStatus;
  do {
    await sleep(2000);
    status = await adapter.getJobStatus(providerJobId);
  } while (status === 'running');
  
  return await adapter.getResult(providerJobId);
}
```

**REQ-02-2:** Result storage:
- Text results (under 100KB): store inline in PostgreSQL `jobs.result_text`
- Images: upload to S3-compatible storage (Cloudflare R2 or Supabase Storage), store URL
- Audio: same as images

**REQ-02-3:** Actual cost calculation after execution:
```typescript
// For per-token providers (Fireworks):
actualCostUsd = (tokensGenerated / 1_000_000) * pricePerMToken * 1.20 // NeuralGrid 20% margin

// For hourly providers (Vast.ai, RunPod):
actualCostUsd = (runtimeSeconds / 3600) * hourlyRateUsd * 1.20
```

**REQ-02-4:** Job status must update in real-time in Redis pub/sub:
`PUBLISH neuralgrid:jobs:events:{jobId} '{"status":"running","updatedAt":"..."}'`

**REQ-02-5:** On completion, trigger webhook delivery if registered (see SPEC-04)

**REQ-02-6:** On failure, apply retry logic (max 2 retries, different node each time). After all retries exhausted, mark FAILED and charge $0.

#### Tasks
- [ ] Implement `executeJob()` function in job-scheduler (REQ-02-1)
- [ ] Implement Fireworks adapter `runJob()` and `getResult()`
- [ ] Implement Vast.ai adapter `runJob()` (spin up instance, submit, poll, terminate)
- [ ] Implement RunPod adapter `runJob()` (using RunPod serverless or pod API)
- [ ] Set up Cloudflare R2 or Supabase Storage for binary results
- [ ] Implement result storage routing (text inline, binary to object storage)
- [ ] Implement actual cost calculation per provider type (REQ-02-3)
- [ ] Implement Redis pub/sub status updates (REQ-02-4)
- [ ] Wire retry logic to actual execution failures
- [ ] Update job status in PostgreSQL at each step
- [ ] Integration test: full job lifecycle with Fireworks (cheapest to test)
- [ ] Integration test: verify cost calculation accuracy
- [ ] Load test: 10 concurrent jobs all completing successfully

---

### SPEC-03: OpenAI-Compatible Endpoint

**Priority:** P1 — biggest adoption lever. Developers already have OpenAI SDKs. Zero migration effort.

#### What to build
A drop-in replacement for OpenAI's chat completions API that routes through NeuralGrid's cost optimizer.

#### Requirements

**REQ-03-1:** Implement `POST /v1/chat/completions` with exact OpenAI request schema:
```typescript
interface OpenAIRequest {
  model: string;                    // "gpt-4", "gpt-3.5-turbo", or NeuralGrid model IDs
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}
```

**REQ-03-2:** Model mapping — translate OpenAI model names to NeuralGrid equivalents:
```typescript
const MODEL_MAP = {
  'gpt-3.5-turbo': 'llama-3-8b',      // T1 — 89% cheaper
  'gpt-4':         'llama-3-70b',      // T3 — 60% cheaper  
  'gpt-4-turbo':   'llama-3-405b',     // T3 via Fireworks
  'gpt-4o':        'qwen2-72b',        // T3
  'gpt-4o-mini':   'phi-3-mini',       // T1 — very cheap
};
// Also accept NeuralGrid native model IDs directly
```

**REQ-03-3:** Response MUST match OpenAI response schema exactly:
```typescript
interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: [{
    index: 0;
    message: { role: 'assistant'; content: string };
    finish_reason: 'stop' | 'length';
  }];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // NeuralGrid extension fields (non-breaking):
  neuralgrid?: {
    actual_cost_usd: string;
    tier_used: string;
    provider: string;
    savings_vs_openai_pct: number;
  };
}
```

**REQ-03-4:** Streaming support (`stream: true`) using SSE (Server-Sent Events). Forward the stream from Fireworks directly.

**REQ-03-5:** Authentication: accept both NeuralGrid API keys (`ng_...`) AND display a helpful error for OpenAI keys pointing to signup.

**REQ-03-6:** SDK usage example (add to docs):
```python
# Before — OpenAI (expensive)
from openai import OpenAI
client = OpenAI(api_key="sk-...")

# After — NeuralGrid (40% cheaper, same output)
from openai import OpenAI
client = OpenAI(
    api_key="ng_your_key_here",
    base_url="https://api.neuralgrid.dev/v1"  # one line change
)

# Everything else stays identical
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

#### Tasks
- [ ] Add `POST /v1/chat/completions` route to API Gateway
- [ ] Implement OpenAI request schema validation (Zod)
- [ ] Implement model mapping table (REQ-03-2)
- [ ] Map OpenAI request to NeuralGrid JobSubmission format
- [ ] Implement OpenAI response schema construction (REQ-03-3)
- [ ] Implement streaming SSE forwarding (REQ-03-4)
- [ ] Add `neuralgrid` extension fields to response
- [ ] Unit tests: model mapping covers all common OpenAI models
- [ ] Unit tests: response schema matches OpenAI spec exactly
- [ ] Integration test: Python OpenAI SDK works with NeuralGrid base_url
- [ ] Add code samples to dashboard docs page

---

### SPEC-04: Webhook Delivery System

**Priority:** P1 — developers need async notification without polling

#### Requirements

**REQ-04-1:** Webhook model in PostgreSQL:
```sql
CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  url VARCHAR NOT NULL,
  secret VARCHAR NOT NULL,  -- HMAC signing key
  events TEXT[] DEFAULT ARRAY['job.complete', 'job.failed'],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**REQ-04-2:** On job completion/failure, publish to webhook queue in Redis

**REQ-04-3:** Webhook delivery worker:
- Consumes from webhook queue
- HTTP POST to registered URL with HMAC-SHA256 signature
- Retry 3 times: 1s → 5s → 25s exponential backoff
- Mark webhook as failed after 3 failures (don't retry indefinitely)

**REQ-04-4:** Webhook payload:
```json
{
  "event": "job.complete",
  "job_id": "job_01j9x2kp...",
  "status": "complete",
  "tier_used": "T1",
  "provider": "fireworks",
  "actual_cost_usd": "0.0021",
  "savings_vs_runpod_pct": 87,
  "timestamp": "2026-07-11T10:00:00Z"
}
```

**REQ-04-5:** Signature header: `X-NeuralGrid-Signature: sha256=<hmac>`

#### Tasks
- [ ] Create webhooks table migration
- [ ] Add POST /v1/webhooks, GET /v1/webhooks, DELETE /v1/webhooks/:id routes
- [ ] Implement webhook delivery worker (Redis queue consumer)
- [ ] Implement HMAC-SHA256 signing (REQ-04-5)
- [ ] Implement retry with exponential backoff
- [ ] Unit tests: HMAC signing
- [ ] Unit tests: retry logic
- [ ] Integration test: webhook received and verified at test endpoint

---

### SPEC-05: Cost Savings Analytics Dashboard

**Priority:** P1 — this is the entire value prop. It must be visible.

#### What to build
A dedicated analytics page in the dashboard that shows developers exactly how much they saved vs paying full A100 RunPod rates.

#### Requirements

**REQ-05-1:** New route `/dashboard/savings` with:
- Total saved this month (large number, prominently displayed)
- Total saved all time
- Average saving % per job
- Saving by model (which models save most)
- Saving by tier (T1 saves most — show this)

**REQ-05-2:** Per-job cost comparison in job detail view:
```
Your cost:        $0.0021  (T1 — Fireworks AMD MI300X)
vs RunPod A100:   $0.0133
You saved:        $0.0112  (84% cheaper)
```

**REQ-05-3:** Monthly cost projection:
"At your current usage rate, NeuralGrid saves you $147/month vs RunPod A100 pricing."

**REQ-05-4:** Cost comparison API endpoint:
```
GET /v1/jobs/:id/cost-comparison
```
Returns estimated cost on each provider for the same job.

**REQ-05-5:** "What if" calculator on dashboard home:
- Input: model + expected monthly job count
- Output: estimated monthly cost on NeuralGrid vs RunPod/AWS

#### Tasks
- [ ] Create `/dashboard/savings` page with analytics
- [ ] Implement cost comparison calculation per job (store RunPod baseline at dispatch time)
- [ ] Add cost comparison to job detail panel
- [ ] Add total savings display to dashboard home hero
- [ ] Build monthly projection calculator
- [ ] Implement GET /v1/jobs/:id/cost-comparison endpoint
- [ ] Add "What if" calculator to dashboard home
- [ ] Unit tests: savings calculation accuracy

---

### SPEC-06: Provider Health Dashboard (Internal)

**Priority:** P2

A simple admin page showing real-time provider status, circuit breaker state, price cache freshness, and job success rates per provider.

#### Requirements

**REQ-06-1:** GET /internal/health (admin key required):
```json
{
  "providers": {
    "vastai":    { "status": "healthy", "lastPoll": "...", "nodesAvailable": 47, "circuitBreaker": "closed" },
    "runpod":    { "status": "healthy", "lastPoll": "...", "nodesAvailable": 23, "circuitBreaker": "closed" },
    "fireworks": { "status": "healthy", "lastPoll": "...", "nodesAvailable": 6,  "circuitBreaker": "closed" },
    "amd-cloud": { "status": "degraded","lastPoll": "...", "nodesAvailable": 0,  "circuitBreaker": "open"   }
  },
  "jobs": {
    "last1h":  { "submitted": 42, "complete": 39, "failed": 3, "successRate": 92.9 },
    "last24h": { "submitted": 387,"complete": 371,"failed": 16,"successRate": 95.9 }
  },
  "estimatorAccuracy": {
    "correctTier": "87%",
    "overEstimated": "9%",
    "underEstimated": "4%"
  }
}
```

**REQ-06-2:** Dashboard page at `/dashboard/admin` (only visible to admin accounts)

#### Tasks
- [ ] Implement GET /internal/health endpoint
- [ ] Track estimator accuracy by comparing predicted vs actual VRAM usage
- [ ] Build `/dashboard/admin` page showing provider health
- [ ] Add job success rate tracking per provider to PostgreSQL

---

## Stage 2 — Build order for Kiro

Execute specs in this order. Each depends on the previous.

```
Week 1:  SPEC-01 (Fireworks)  →  SPEC-02 (Execution wiring)
Week 2:  SPEC-03 (OpenAI API) →  SPEC-04 (Webhooks)
Week 3:  SPEC-05 (Analytics)  →  SPEC-06 (Health dashboard)
```

## Definition of done — Stage 2

A developer pastes this into their terminal:

```python
from openai import OpenAI
client = OpenAI(api_key="ng_...", base_url="https://api.neuralgrid.dev/v1")
r = client.chat.completions.create(model="gpt-3.5-turbo", messages=[{"role":"user","content":"Hi"}])
print(r.choices[0].message.content)
print(r.neuralgrid['savings_vs_openai_pct'])  # → 84
```

And it works, end-to-end, on AMD/Fireworks infrastructure, cheaper than OpenAI, in under 5 seconds.
