-- backend/database/migration-phase2.sql
-- Run ONCE in Neon SQL Editor after migration-phase1.sql

-- 1. Assessment levels dropdown (managed from admin panel)
CREATE TABLE IF NOT EXISTS assessment_levels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed common levels
INSERT INTO assessment_levels (name, sort_order) VALUES
  ('Junior', 1), ('Mid-Level', 2), ('Senior', 3), ('Lead', 4)
ON CONFLICT (name) DO NOTHING;

-- 2. Position board status
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS board_status TEXT NOT NULL DEFAULT 'open'
    CHECK (board_status IN ('open', 'filled'));

-- 3. Screening entries
CREATE TABLE IF NOT EXISTS position_board_screenings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL CHECK (count > 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Batches
CREATE TABLE IF NOT EXISTS position_board_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Candidates (named, inside batches)
CREATE TABLE IF NOT EXISTS position_board_candidates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES position_board_batches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Stage progression — one row per candidate, tracks CURRENT stage
--    UNIQUE(candidate_id) enforces one active stage per candidate.
CREATE TABLE IF NOT EXISTS position_board_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id         UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES position_board_candidates(id) ON DELETE CASCADE,
  stage               TEXT NOT NULL
    CHECK (stage IN ('assessment', 'technical_interview', 'offer', 'hired')),
  assessment_level    TEXT,
  assessment_result   TEXT,
  offer_ticket_number TEXT,
  moved_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

-- 7. Activity log
CREATE TABLE IF NOT EXISTS position_board_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbl_position
  ON position_board_log(position_id, created_at DESC);
