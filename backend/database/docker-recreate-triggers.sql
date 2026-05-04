-- Docker init only: recreate trigger dropped before enum→TEXT migration.
-- ticket_status is now TEXT; the trigger logic is identical.
CREATE OR REPLACE FUNCTION sync_group_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_group_master = true AND OLD.ticket_status <> NEW.ticket_status THEN
    UPDATE tickets
    SET ticket_status = NEW.ticket_status,
        updated_at = now()
    WHERE group_id = NEW.group_id
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_group_status_sync
  AFTER UPDATE OF ticket_status ON tickets
  FOR EACH ROW EXECUTE FUNCTION sync_group_status();
