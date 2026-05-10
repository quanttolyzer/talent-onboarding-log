-- migration-phase7.sql
-- Separate hiring_managers into Direct and Ultimate roles.
-- Existing records receive hm_role='both' so they remain visible in all
-- form dropdowns until an admin explicitly re-categorises them.

ALTER TABLE hiring_managers
  ADD COLUMN IF NOT EXISTS hm_role TEXT NOT NULL DEFAULT 'both'
    CHECK (hm_role IN ('direct', 'ultimate', 'both'));
