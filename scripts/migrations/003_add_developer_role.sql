-- NeuralGrid Dashboard Redesign: developer role and onboarding flag
-- Migration 003: Add role and onboarding_completed columns to developers

BEGIN;

ALTER TABLE developers
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'developer'
    CHECK (role IN ('developer', 'admin')),
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_developers_role ON developers(role);

COMMIT;
