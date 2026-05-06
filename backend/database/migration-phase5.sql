-- Allow multiple board configs per ticket type (for stacked boards)
-- and add sort_order to control render order on the ticket board page.

ALTER TABLE board_configs DROP CONSTRAINT IF EXISTS board_configs_ticket_type_id_key;

ALTER TABLE board_configs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1;
