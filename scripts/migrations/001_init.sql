-- NeuralGrid MVP: Initial database schema
-- Migration 001: Create core tables and indexes

BEGIN;

-- Developers table
CREATE TABLE developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  max_cost_usd DECIMAL(10,4) DEFAULT 10.00,
  payment_status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Jobs table
CREATE TABLE jobs (
  id VARCHAR(30) PRIMARY KEY,
  developer_id UUID REFERENCES developers(id),
  model VARCHAR(100) NOT NULL,
  tier VARCHAR(5) NOT NULL,
  quantization VARCHAR(10),
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  input_payload JSONB NOT NULL,
  output_config JSONB NOT NULL,
  result_payload JSONB,
  provider VARCHAR(20),
  node_id VARCHAR(100),
  estimated_cost_usd DECIMAL(10,6),
  actual_cost_usd DECIMAL(10,6),
  confidence VARCHAR(10),
  retries INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Billing records table
CREATE TABLE billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES developers(id),
  job_id VARCHAR(30) REFERENCES jobs(id),
  amount_usd DECIMAL(10,6) NOT NULL,
  stripe_charge_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_jobs_developer_status ON jobs(developer_id, status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_billing_developer ON billing_records(developer_id, created_at DESC);

COMMIT;
