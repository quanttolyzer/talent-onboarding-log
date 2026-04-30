-- ============================================================
-- MIGRATION: Dynamic Dropdown Tables
-- Run this ONCE in your Neon SQL Editor
-- ============================================================

-- Step 1: Create config tables for formerly-hardcoded dropdowns

CREATE TABLE IF NOT EXISTS ticket_statuses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS management_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(action_name, name)
);

-- Step 2: Seed with all existing values

INSERT INTO ticket_statuses (name, sort_order) VALUES
  ('On-hold', 1), ('In-Progress', 2), ('Hired', 3), ('Active', 4),
  ('Accepted', 5), ('Joined', 6), ('Cancelled', 7), ('Rejected', 8)
ON CONFLICT (name) DO NOTHING;

INSERT INTO ticket_types (name, sort_order) VALUES
  ('Hiring Ticket', 1), ('Offer Ticket', 2), ('Onboarding Ticket', 3), ('Offboarding', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO management_types (name, sort_order) VALUES
  ('Management', 1), ('Non - Management', 2)
ON CONFLICT (name) DO NOTHING;

INSERT INTO actions (name, sort_order) VALUES
  ('Open Ticket', 1), ('Onboarding', 2)
ON CONFLICT (name) DO NOTHING;

INSERT INTO sub_actions (action_name, name, sort_order) VALUES
  ('Open Ticket', 'Create Hiring Request', 1),
  ('Open Ticket', 'Active Hiring Tickets', 2),
  ('Open Ticket', 'Profile Screening', 3),
  ('Open Ticket', 'Interview Execution', 4),
  ('Open Ticket', 'Batch Shared with Hiring Manager', 5),
  ('Open Ticket', 'Interview Scheduled', 6),
  ('Open Ticket', 'Job Offer Created', 7),
  ('Open Ticket', 'Job Offer in the Approval Cycle', 8),
  ('Open Ticket', 'Offer Shared with candidate', 9),
  ('Open Ticket', 'Candidate Accepted Job Offer', 10),
  ('Open Ticket', 'Candidate Rejected Job Offer', 11),
  ('Open Ticket', 'Closed Hiring Ticket', 12),
  ('Onboarding', 'E-Visa Request', 1),
  ('Onboarding', 'E-Wakala Request', 2),
  ('Onboarding', 'Create Contract', 3),
  ('Onboarding', 'Contract Attestation Request', 4),
  ('Onboarding', 'IT Request', 5),
  ('Onboarding', 'Induction Program Preparation', 6),
  ('Onboarding', 'Booking Accomodation', 7),
  ('Onboarding', 'Iqama Transfer Request', 8),
  ('Onboarding', 'Flight Ticket', 9),
  ('Onboarding', 'Closed Onboarding Tickets', 10)
ON CONFLICT (action_name, name) DO NOTHING;

-- Step 3: Convert enum columns to plain TEXT
-- (existing data is preserved; the cast is safe)

ALTER TABLE tickets ALTER COLUMN ticket_status   TYPE TEXT USING ticket_status::TEXT;
ALTER TABLE tickets ALTER COLUMN ticket_type      TYPE TEXT USING ticket_type::TEXT;
ALTER TABLE tickets ALTER COLUMN management_type  TYPE TEXT USING management_type::TEXT;
ALTER TABLE tickets ALTER COLUMN action           TYPE TEXT USING action::TEXT;

-- Step 4: Drop old enum types (now unused)

DROP TYPE IF EXISTS ticket_type_enum;
DROP TYPE IF EXISTS ticket_status_enum;
DROP TYPE IF EXISTS management_type_enum;
DROP TYPE IF EXISTS action_enum;
