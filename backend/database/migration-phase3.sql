-- migration-phase3.sql
-- Run ONCE in Neon SQL Editor after migration-phase2.sql

-- 1. Add management_type field to positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS management_type TEXT;

-- 2. HR Interview entries (count-based, like screenings)
CREATE TABLE IF NOT EXISTS position_board_hr_interviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL CHECK (count > 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
