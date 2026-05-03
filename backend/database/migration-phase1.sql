-- ============================================================
-- MIGRATION: Phase 1 - Visibility Control & Date Overrides
-- Run this ONCE in your Neon SQL Editor
-- ============================================================

-- Step 1: Visibility grants table (for user-to-user visibility control)

CREATE TABLE IF NOT EXISTS user_visibility_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, target_id)
);

-- Step 2: Date override columns on users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_override_enabled    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_override_expires_at TIMESTAMPTZ;

-- Step 3: Ticket updates table (progress history with effective dates)

CREATE TABLE IF NOT EXISTS ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL,
  changes        JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket ON ticket_updates(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_updates_submitted_at ON ticket_updates(submitted_at DESC);

-- Step 4: Action→sub-action auto-fill rules table

CREATE TABLE IF NOT EXISTS action_subaction_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_value     TEXT NOT NULL,
  sub_action_value TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_value)
);

-- Step 5: Seed initial auto-fill rule

INSERT INTO action_subaction_rules (action_value, sub_action_value)
VALUES ('Open Ticket', 'Active Hiring Ticket')
ON CONFLICT (action_value) DO NOTHING;
