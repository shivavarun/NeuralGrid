-- NeuralGrid Production Readiness: schema extensions
-- Migration 002: extend jobs, add production tables, append-only triggers
--
-- Deviations from design.md's literal column names, kept consistent with the
-- schema actually shipped in 001_init.sql:
--   - `user_id` / `users(id)` -> `developer_id` / `developers(id)`
--     (this codebase has no `users` table; `developers` is the existing
--     account table, same rename already applied in neuralgrid-stage2)
--   - `job_id UUID REFERENCES jobs(id)` -> `job_id VARCHAR(30) REFERENCES jobs(id)`
--     (jobs.id is VARCHAR(30), a "job_" + ULID string, not a UUID)
--   - `jobs.confidence` already exists from 001_init.sql (VARCHAR(10), holds
--     HIGH/MEDIUM/LOW) and is reused as-is rather than re-added.
--   - `jobs.node_id` already exists from 001_init.sql as a raw provider-side
--     node identifier string (e.g. "vast_01"), not a UUID. It is renamed to
--     `provider_node_ref` to preserve that concept, and a fresh `node_id`
--     column is added as the UUID FK into the new `provider_nodes` table per
--     the design. No application code currently reads/writes either column
--     (MVP services are still in-memory), so this rename carries no runtime
--     risk today.

BEGIN;

-- ── Provider inventory tables (created first: jobs.provider_id/node_id FK to these) ──

CREATE TABLE providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,          -- 'vastai' | 'runpod' | ...
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_nodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES providers(id),
  gpu_model       TEXT NOT NULL,
  tier            TEXT NOT NULL,             -- T1 | T2 | T3
  vram_gb         NUMERIC NOT NULL,
  hourly_rate_usd NUMERIC NOT NULL,
  availability    BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_provider_nodes_provider_tier ON provider_nodes(provider_id, tier);

-- ── Extend jobs (Req 26.1) ──

-- Preserve the pre-existing raw provider-side node identifier under a new
-- name before introducing the UUID FK `node_id` column the design specifies.
ALTER TABLE jobs RENAME COLUMN node_id TO provider_node_ref;

ALTER TABLE jobs
  ADD COLUMN idempotency_key        TEXT,
  ADD COLUMN error_code             TEXT,
  ADD COLUMN tier_assigned          TEXT,
  ADD COLUMN vram_estimate_gb       NUMERIC,
  ADD COLUMN provider_id            UUID REFERENCES providers(id),
  ADD COLUMN node_id                UUID REFERENCES provider_nodes(id),
  ADD COLUMN cost_usd               NUMERIC,
  ADD COLUMN baseline_a100_cost_usd NUMERIC,
  ADD COLUMN runtime_ms             INTEGER,
  ADD COLUMN retry_count            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN oom_retry_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN queued_at              TIMESTAMPTZ,
  ADD COLUMN dispatched_at          TIMESTAMPTZ,
  ADD COLUMN retention_purged_at    TIMESTAMPTZ;

-- Backfill tier_assigned from the existing `tier` column, then enforce NOT NULL
-- per design.md, without breaking on any pre-existing rows.
UPDATE jobs SET tier_assigned = tier WHERE tier_assigned IS NULL;
ALTER TABLE jobs ALTER COLUMN tier_assigned SET NOT NULL;

-- Idempotency uniqueness per developer (Req 26.3). NULLs (jobs with no
-- idempotency_key) are not considered duplicates of each other by Postgres.
ALTER TABLE jobs
  ADD CONSTRAINT uq_jobs_developer_idempotency UNIQUE (developer_id, idempotency_key);

CREATE INDEX idx_jobs_provider_id ON jobs(provider_id);
CREATE INDEX idx_jobs_node_id ON jobs(node_id);
CREATE INDEX idx_jobs_queued_at ON jobs(queued_at) WHERE queued_at IS NOT NULL;

-- ── Append-only ledger (Req 26.2, 7, 9, 10) ──

CREATE TABLE billing_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id         UUID NOT NULL REFERENCES developers(id),
  job_id               VARCHAR(30) REFERENCES jobs(id),
  type                 TEXT NOT NULL CHECK (type IN ('charge','credit','topup','refund')),
  amount_usd           NUMERIC NOT NULL,      -- charge < 0; credit/topup/refund > 0
  provider_cost_usd    NUMERIC,               -- charge line item (Req 10)
  margin_usd           NUMERIC,               -- charge line item (Req 10)
  charge_consistent    BOOLEAN,               -- false => flagged inconsistent (Req 10.3)
  credit_of_event      UUID REFERENCES billing_events(id),  -- links credit -> charge (Req 9.3)
  reconciled_stripe_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_developer_id ON billing_events(developer_id, created_at DESC);
CREATE INDEX idx_billing_events_job_id ON billing_events(job_id);

CREATE TABLE invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID NOT NULL REFERENCES developers(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  total_usd    NUMERIC NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_developer_id ON invoices(developer_id, period_start DESC);

CREATE TABLE estimator_registry (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type   TEXT NOT NULL,
  cause      TEXT CHECK (cause IN ('TIMEOUT','OOM')),  -- Estimator_Miss_Record
  job_id     VARCHAR(30) REFERENCES jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimator_registry_job_type ON estimator_registry(job_type, created_at DESC);

-- Append-only (Req 27)
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    TEXT NOT NULL,
  action_type TEXT NOT NULL,                  -- credit_grant | refund | key_revoke | ...
  target_id   TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('success','failure')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id, created_at DESC);

-- ── Append-only enforcement triggers (Req 27.2, and billing_events per design) ──

CREATE OR REPLACE FUNCTION reject_update_or_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_billing_events_append_only
  BEFORE UPDATE OR DELETE ON billing_events
  FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();

CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();

COMMIT;
