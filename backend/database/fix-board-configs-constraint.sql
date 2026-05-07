-- ============================================================
-- FIX: Remove mode uniqueness for board configs
-- Allows multiple board/progress configs per ticket type.
-- ============================================================

-- Drop the problematic unique constraint that was preventing multiple configs per ticket type
ALTER TABLE board_configs DROP CONSTRAINT IF EXISTS board_configs_ticket_type_id_key;

-- Add the sort_order column if it doesn't already exist (used to order boards on ticket page)
ALTER TABLE board_configs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1;
ALTER TABLE board_configs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Remove mode uniqueness so same-mode configs can coexist
ALTER TABLE board_configs
DROP CONSTRAINT IF EXISTS uq_ticket_type_mode;

CREATE TABLE IF NOT EXISTS ticket_board_configs (
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_config_id UUID NOT NULL REFERENCES board_configs(id),
  bound_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, board_config_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_board_configs_ticket
  ON ticket_board_configs(ticket_id, bound_at);

INSERT INTO ticket_board_configs (ticket_id, board_config_id)
SELECT t.id, bc.id
FROM tickets t
JOIN ticket_types tt ON tt.name = t.ticket_type
JOIN board_configs bc ON bc.ticket_type_id = tt.id
WHERE bc.is_archived = false
ON CONFLICT (ticket_id, board_config_id) DO NOTHING;

-- Verify the constraint was added
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'board_configs' AND constraint_type = 'UNIQUE';
