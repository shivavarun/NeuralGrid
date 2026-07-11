# NeuralGrid — Production Readiness PRD
**Version:** 1.0 | **Status:** Ready for Kiro | **Date:** July 2026
**Covers:** Backend, API, infra, reliability, billing, security — the system underneath the User & Admin dashboards (see `Dashboard PRD v1.0`) and the original MVP scope (see `PRD v2.0`).

> This document does not repeat product vision or dashboard UI spec. It exists because "8 week MVP" and "production" are different systems. Read this before writing infra code.

---

## 0. Why this document exists

The MVP PRD optimized for speed to first dollar. It explicitly deferred: job queuing (errors instead), SLA guarantees, own supply, multi-GPU inference. Real developers with real API keys will now hit this system 24/7. This PRD defines what "production" adds on top of MVP so it doesn't fall over, leak money, or leak data.

**Definition of production-ready:** the system keeps routing jobs correctly, keeps billing correctly, and keeps a human informed when it can't — with no one watching it at 3am.

---

## 1. System Architecture

```
                         ┌─────────────────┐
 Developer ── HTTPS ────▶│   API Gateway    │── authn, rate limit, idempotency
                         └────────┬─────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼              ▼
            ┌───────────┐ ┌──────────────┐ ┌────────────┐
            │ Estimator │ │Price Aggreg. │ │  Job Store │ (Postgres)
            │  Service  │ │  (Redis TTL) │ │            │
            └─────┬─────┘ └──────┬───────┘ └─────┬──────┘
                  ▼               ▼               │
             ┌─────────────────────────┐          │
             │      Job Scheduler       │◀─────────┘
             │  (scoring + dispatch +   │
             │   retry + timeout)       │
             └───────────┬─────────────┘
                         ▼
             ┌───────────────────────┐
             │  Provider Adapters     │  (Vast.ai, RunPod, Fireworks,
             │  (per-provider client, │   AMD Dev Cloud, Akash — Phase2)
             │   circuit breaker)     │
             └───────────┬───────────┘
                         ▼
                   GPU Provider Node
                         │
                  result / webhook
                         ▼
             ┌───────────────────────┐
             │   Billing Service      │── Stripe, ledger, invoices
             └───────────────────────┘
                         │
             ┌───────────────────────┐
             │  Notification Service │── email, in-app, webhooks
             └───────────────────────┘
```

**Services are independently deployable.** Estimator and Scheduler are stateless and horizontally scalable. Job Store (Postgres) is the single source of truth for job state — no service holds job state only in memory.

**Message flow:** API Gateway writes job row (`status=QUEUED`) synchronously, then hands off to Scheduler via a queue (SQS/Cloud Tasks — pick one, do not build a custom queue). API returns `202 Accepted` with job ID immediately. Polling and webhooks read from Job Store, never from the queue.

---

## 2. Data Model (production schema)

```
users            (id, email, password_hash, role[user|admin], plan, created_at)
api_keys         (id, user_id, key_hash, prefix, label, last_used_at, revoked_at)
jobs             (id, user_id, api_key_id, model, job_type, input_ref, status,
                  tier_assigned, confidence, vram_estimate_gb, provider_id, node_id,
                  cost_usd, baseline_a100_cost_usd, runtime_ms, retry_count,
                  idempotency_key, created_at, dispatched_at, completed_at, error_code)
providers        (id, name, api_base, status[active|degraded|circuit_open], egress_fee)
provider_nodes   (id, provider_id, tier, vram_gb, price_per_hr, hardware_type,
                  is_warm, last_seen_at)
billing_events   (id, user_id, job_id, type[charge|credit|topup|refund], amount_usd,
                  stripe_event_id, created_at)
invoices         (id, user_id, period_start, period_end, total_usd, stripe_invoice_id)
estimator_registry (model_name, params_b, quant, vram_lookup_gb, confidence_default)
audit_log        (id, actor_id, actor_type[user|admin|system], action, target, created_at)
```

**Non-negotiables:**
- `jobs.idempotency_key` is unique per user — a retried POST with the same key returns the existing job, never double-charges.
- All monetary fields are integer **micro-dollars** internally (avoid float rounding); format to `$0.0000` only at the API/UI boundary.
- `audit_log` is append-only, no deletes, no updates. Every admin action (credit grant, refund, key revoke) writes a row here — this table is what makes disputes resolvable.

---

## 3. API Specification (v1)

Base: `https://api.neuralgrid.dev/v1`

| Method | Path | Purpose |
|---|---|---|
| POST | `/jobs` | Submit a job. Requires `Idempotency-Key` header. |
| GET | `/jobs/:id` | Poll job status/result. |
| GET | `/jobs` | List jobs (cursor pagination, filters). |
| POST | `/jobs/:id/cancel` | Cancel a QUEUED/DISPATCHED job. |
| GET | `/estimate` | Dry-run: return tier + estimated cost without dispatching. |
| GET | `/account/balance` | Current balance, low-balance flag. |
| POST | `/account/topup` | Stripe payment intent for top-up. |

**POST /jobs — request**
```json
{
  "model": "llama-3-8b",
  "job_type": "llm_inference",
  "input": { "prompt": "...", "max_tokens": 512 },
  "quantization": "int8"
}
```

**Response — 202**
```json
{
  "job_id": "jb_9f2a...",
  "status": "QUEUED",
  "estimated_tier": "T1",
  "estimated_cost_usd": "0.0023",
  "confidence": "HIGH"
}
```

**Error contract (all endpoints):**
```json
{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "...", "request_id": "req_..." } }
```

Standard codes: `INVALID_MODEL`, `INSUFFICIENT_BALANCE`, `RATE_LIMITED`, `NO_NODE_AVAILABLE`, `PROVIDER_TIMEOUT`, `JOB_NOT_FOUND`, `IDEMPOTENCY_CONFLICT` (same key, different payload → `409`).

Every response includes `request_id` for support/debugging. Every 4xx/5xx is logged with that ID.

---

## 4. Reliability (this is the part MVP skipped)

MVP rule was "error if no node available." Production cannot say that to a paying developer.

| Concern | MVP behavior | Production requirement |
|---|---|---|
| No node available at tier | Immediate error | Queue for up to 30s, re-poll price aggregator every 5s, then tier-bump once before erroring |
| Provider API down | N/A | Circuit breaker: 3 failures in 60s → open circuit, skip provider for 5 min, alert on-call |
| Job exceeds timeout | N/A | `timeout = estimated_runtime × 3`. On timeout: mark FAILED, refund charge, log to estimator accuracy table |
| Duplicate submission (network retry) | Would double-charge | Idempotency key required; duplicate returns cached response, zero charge |
| Provider returns wrong/garbled output | N/A | Basic output validation per job_type (non-empty, valid image bytes, valid JSON for embeddings) before marking COMPLETE |
| Estimator wildly wrong (job OOMs on assigned tier) | N/A | Node reports OOM → auto-retry one tier up (max 2 retries) → log as estimator miss for `/admin/estimator` |

**SLOs (production targets, tracked from Month 1):**
- API availability: 99.5% (MVP had no target)
- P50 dispatch latency: < 800ms from job submit to node dispatch
- Job success rate: ≥ 90% (matches PRD Month 6 target, now enforced with alerting below 85%)
- Price cache staleness: never serve a price older than 90s (TTL enforced, not advisory)

---

## 5. Security

- **API keys:** never store plaintext. Store `sha256(key)`, show full key once at creation, display only `prefix + last 4` afterward.
- **Secrets:** all provider API keys, Stripe keys, DB credentials in a secrets manager (not `.env` in prod). Rotate provider keys quarterly.
- **Rate limiting:** enforced at gateway, not per-service (see Dashboard PRD §2.9 rate limit table — Free 10/min, Pro 100/min).
- **Admin access:** RBAC, `role=admin` checked server-side on every admin route (middleware, not client-side hiding). All admin mutations require re-auth if session > 12h old.
- **Webhook verification:** Stripe webhooks verified via signing secret; provider result callbacks verified via HMAC shared secret, reject unsigned payloads.
- **PII/data retention:** job inputs (prompts, images) retained 30 days then purged unless user opts into longer retention. Payment data never touches our DB — Stripe-hosted only (keeps us out of PCI scope).
- **Input validation:** hard cap on prompt length, image size, output tokens — prevents a single job from blowing past `max_job_cost_cap` ($5.00, per MVP PRD risk table).

---

## 6. Billing correctness (production adds real-money guarantees)

- **Ledger, not just balance field.** Every balance change is a row in `billing_events`. Current balance = `SUM(billing_events.amount_usd)` for the user, recomputed and reconciled nightly against the cached balance field — mismatch triggers an admin alert.
- **Stripe webhook reconciliation job** runs every 15 min: compares Stripe's record of charges/topups against `billing_events`, flags orphans either direction.
- **Refund path:** any job that fails after being charged auto-refunds via `billing_events` credit row — this must happen synchronously in the failure handler, not as a manual admin task.
- **Margin application:** `neuralgrid_margin` (20% default, per Dashboard PRD §2.9) applied at charge-time, stored as a separate line so provider-cost vs margin is always auditable per job.

---

## 7. Observability

- **Structured logs** (JSON) for every job state transition, tagged with `job_id`, `user_id`, `request_id`. Feeds `/admin/logs` (Dashboard PRD §2.8).
- **Metrics** (Prometheus/equivalent): job throughput, success rate, P50/P95 dispatch latency, per-provider error rate, estimator accuracy rate — these back the `/admin` home stat bar (Dashboard PRD §2.2).
- **Alerting:** PagerDuty/equivalent for: job success rate < 85% over 15 min, any provider circuit open > 10 min, billing reconciliation mismatch, API 5xx rate > 1%.
- **Tracing:** one trace per job from submit → estimate → dispatch → result, so a support ticket ("my job was slow") is answerable in one query, not a log grep.

---

## 8. Testing & CI/CD

- Unit tests: estimator formulas (all quant types, all confidence branches), scoring algorithm, cost calculation (margin + baseline comparison).
- Contract tests: each provider adapter tested against a recorded fixture of that provider's real API responses (so a provider API change breaks CI, not production).
- Load test: simulate 500 concurrent job submissions before first production deploy; confirm P95 dispatch latency holds and no double-charges occur under retry storms.
- Chaos test: kill a provider mid-job, confirm circuit breaker + failover + refund path all fire correctly.
- CI gate: no deploy to prod without passing the above plus the E2E suite already defined in Dashboard PRD §4 Phase G.

---

## 9. Environments & Deployment

- Three environments: `dev`, `staging`, `prod`. Staging uses provider sandbox/test modes where available (Stripe test mode always).
- Feature flags for anything provider-related (new provider, new tier logic) — ship dark, enable per-user for canary before global rollout.
- Blue/green or rolling deploy for API Gateway and Scheduler — job-in-flight must survive a deploy (no dropped jobs on release).
- Database migrations: additive-first (expand/contract pattern), never a breaking migration in the same release as the code that depends on it.

---

## 10. Production Go-Live Checklist

Gate every item before taking real traffic beyond the original 10 beta developers:

- [ ] Idempotency keys enforced on `/jobs` POST
- [ ] Circuit breakers live for both providers (Vast.ai, RunPod)
- [ ] Job timeout + auto-refund path tested end-to-end
- [ ] Billing reconciliation job running and alerting
- [ ] API keys hashed at rest, never logged in plaintext
- [ ] Admin route guard tested (non-admin gets 403, not a redirect that leaks data)
- [ ] Rate limiting enforced at gateway for Free/Pro tiers
- [ ] SLO dashboards live (availability, dispatch latency, success rate)
- [ ] Alerting wired to on-call, tested with a real page (not just config)
- [ ] Load test passed at 5× current beta traffic
- [ ] Data retention/purge job running for job inputs > 30 days
- [ ] Runbook written for: provider outage, billing mismatch, estimator accuracy drop

**This system is production-ready when all boxes are checked — not when the dashboard looks finished.**

---

## 11. Open Risks Carried Into Production

| Risk | Note |
|---|---|
| Job queuing (30s soft queue) is a stopgap, not real queuing infra | Revisit if queue wait times exceed SLO — may need dedicated queue depth per tier |
| Two-provider circuit breaker means degraded mode if both trip together | Phase 2 provider additions (Akash, Lambda) reduce single-point failure |
| Nightly reconciliation, not real-time | Acceptable for MVP-to-production step; move to event-driven reconciliation if billing volume grows past ~$50K MRR |

---
NeuralGrid — Production Readiness PRD v1.0 — July 2026 — Confidential
