-- Docker init only: drop triggers and DEFAULT expressions that reference enum types
-- before converting those columns to TEXT in migration-dropdown-tables.sql.
-- Recreated by docker-recreate-triggers.sql immediately after the dropdown migration.
DROP TRIGGER IF EXISTS tickets_group_status_sync ON tickets;

ALTER TABLE tickets ALTER COLUMN ticket_status    DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN ticket_type      DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN management_type  DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN action           DROP DEFAULT;
