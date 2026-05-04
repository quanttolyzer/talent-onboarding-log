-- Docker init only: drop triggers that reference enum columns before converting them to TEXT.
-- Recreated by docker-recreate-triggers.sql immediately after the dropdown migration.
DROP TRIGGER IF EXISTS tickets_group_status_sync ON tickets;
