-- backend/database/migration-phase4.sql
-- Dynamic Board Builder — run ONCE in Neon SQL Editor after migration-phase3.sql

CREATE TABLE IF NOT EXISTS board_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id  UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('board', 'progress')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_type_id)
);

CREATE TABLE IF NOT EXISTS board_columns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_column_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board_column_transitions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  to_column_id   UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  UNIQUE (from_column_id, to_column_id)
);

CREATE TABLE IF NOT EXISTS board_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_values    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_phase_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_phase_id UUID NOT NULL REFERENCES board_phases(id) ON DELETE CASCADE,
  advanced_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
