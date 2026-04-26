-- backend/database/add-missing-schema.sql
-- Run this in Neon SQL Editor IF you already ran the original schema.sql
-- It adds the missing statuses found in your real data and fixes enum gaps.

-- Add any missing ticket_status values
-- (PostgreSQL enums require ALTER TYPE to add values)
ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'Archived';
ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'Closed';
ALTER TYPE ticket_status_enum ADD VALUE IF NOT EXISTS 'Transferred';

-- Add Exit Interview to ticket_type_enum (found in real data)
ALTER TYPE ticket_type_enum ADD VALUE IF NOT EXISTS 'Exit Interview';

-- Add Offboarding to action_enum (found in real data)
ALTER TYPE action_enum ADD VALUE IF NOT EXISTS 'Offboarding';
