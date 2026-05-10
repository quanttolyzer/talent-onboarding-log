-- migration-phase6.sql

-- 1. Mini-card display fields per board column + unique constraint for upsert
ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS card_display_fields JSONB NOT NULL DEFAULT '[]';
ALTER TABLE board_columns
  DROP CONSTRAINT IF EXISTS board_columns_config_label_unique;
ALTER TABLE board_columns
  ADD CONSTRAINT board_columns_config_label_unique UNIQUE (board_config_id, label);

-- 2. Default ticket status flag (at most one row can be true)
ALTER TABLE ticket_statuses
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 3. Sticky notes table
CREATE TABLE IF NOT EXISTS ticket_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT 'yellow',
  is_done     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_notes_ticket_id_idx ON ticket_notes(ticket_id);

DROP TRIGGER IF EXISTS ticket_notes_updated_at ON ticket_notes;
CREATE TRIGGER ticket_notes_updated_at
  BEFORE UPDATE ON ticket_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Drop position uniqueness constraint on board_columns
--    The UNIQUE (board_config_id, position) constraint causes save failures
--    when upserts run in sequence and two columns temporarily share a position
--    mid-loop (e.g. inserting a new column at pos=1 while the old col still holds pos=1).
ALTER TABLE board_columns
  DROP CONSTRAINT IF EXISTS uq_board_columns_position;
