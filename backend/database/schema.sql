-- ============================================================
-- Talent & Onboarding Log — PostgreSQL Schema
-- Run this in Neon SQL Editor FIRST before anything else
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE ticket_type_enum AS ENUM (
  'Hiring Ticket',
  'Offer Ticket',
  'Onboarding Ticket',
  'Offboarding'
);

CREATE TYPE ticket_status_enum AS ENUM (
  'On-hold',
  'In-Progress',
  'Hired',
  'Active',
  'Accepted',
  'Joined',
  'Cancelled',
  'Rejected'
);

CREATE TYPE management_type_enum AS ENUM (
  'Management',
  'Non - Management'
);

CREATE TYPE action_enum AS ENUM (
  'Open Ticket',
  'Onboarding'
);

CREATE TYPE user_role_enum AS ENUM (
  'admin',
  'member',
  'viewer'
);

-- ============================================================
-- LOOKUP / MAPPING TABLES (from Mappings sheet)
-- ============================================================

CREATE TABLE positions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hiring_managers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE country_companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      VARCHAR(255) NOT NULL UNIQUE,
  country    VARCHAR(100),
  company    VARCHAR(100),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USERS TABLE
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role_enum NOT NULL DEFAULT 'member',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TICKET GROUPS (for Group_ID / Active Hiring Ticket feature)
-- One group = one "Active Hiring Ticket" row + all its clones
-- ============================================================

CREATE TABLE ticket_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code  VARCHAR(50) NOT NULL UNIQUE,  -- e.g. POS-20260425-0001
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CORE TICKETS TABLE
-- ============================================================

CREATE TABLE tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Group linking (NULL for tickets not part of any group)
  group_id            UUID REFERENCES ticket_groups(id) ON DELETE SET NULL,
  is_group_master     BOOLEAN NOT NULL DEFAULT false, -- true = "Active Hiring Ticket" row

  -- Ownership
  task_owner_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Core fields
  entry_date          DATE NOT NULL,
  ticket_number       VARCHAR(100) NOT NULL UNIQUE,
  ticket_type         ticket_type_enum NOT NULL,
  ticket_status       ticket_status_enum NOT NULL DEFAULT 'On-hold',
  ticket_date         DATE NOT NULL,

  -- Job context (FK to lookup tables)
  position_id         UUID REFERENCES positions(id),
  management_type     management_type_enum NOT NULL,
  department_id       UUID REFERENCES departments(id),
  ultimate_hm_id      UUID REFERENCES hiring_managers(id),
  direct_hm_id        UUID REFERENCES hiring_managers(id),
  country_company_id  UUID REFERENCES country_companies(id),

  -- Counts and classification
  candidate_count     SMALLINT NOT NULL DEFAULT 1 CHECK (candidate_count > 0),
  action              action_enum NOT NULL,
  sub_action          VARCHAR(150),
  remarks             TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOG
-- Tracks every field change on every ticket
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  field_name  VARCHAR(100) NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES — for fast filtering, search, and pagination
-- ============================================================

CREATE INDEX idx_tickets_status          ON tickets(ticket_status);
CREATE INDEX idx_tickets_owner           ON tickets(task_owner_id);
CREATE INDEX idx_tickets_type            ON tickets(ticket_type);
CREATE INDEX idx_tickets_entry_date      ON tickets(entry_date DESC);
CREATE INDEX idx_tickets_ticket_date     ON tickets(ticket_date DESC);
CREATE INDEX idx_tickets_position        ON tickets(position_id);
CREATE INDEX idx_tickets_department      ON tickets(department_id);
CREATE INDEX idx_tickets_group           ON tickets(group_id);
CREATE INDEX idx_tickets_group_master    ON tickets(group_id, is_group_master);
CREATE INDEX idx_tickets_sub_action      ON tickets(sub_action);
CREATE INDEX idx_audit_ticket            ON audit_log(ticket_id);
CREATE INDEX idx_audit_changed_at        ON audit_log(changed_at DESC);

-- Full-text search across ticket_number, remarks, sub_action
CREATE INDEX idx_tickets_fts ON tickets USING gin(
  to_tsvector('english',
    coalesce(ticket_number, '') || ' ' ||
    coalesce(remarks, '') || ' ' ||
    coalesce(sub_action, '')
  )
);

-- ============================================================
-- TRIGGERS — auto-update updated_at on tickets and users
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- GROUP STATUS SYNC FUNCTION
-- Called when "Active Hiring Ticket" master row status changes
-- Automatically updates ALL rows in the same group
-- ============================================================

CREATE OR REPLACE FUNCTION sync_group_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if this is the group master AND status actually changed
  IF NEW.is_group_master = true AND OLD.ticket_status <> NEW.ticket_status THEN
    UPDATE tickets
    SET ticket_status = NEW.ticket_status,
        updated_at = now()
    WHERE group_id = NEW.group_id
      AND id <> NEW.id;  -- don't update itself again
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_group_status_sync
  AFTER UPDATE OF ticket_status ON tickets
  FOR EACH ROW EXECUTE FUNCTION sync_group_status();

-- ============================================================
-- DEFAULT ADMIN USER (change password after first login!)
-- ============================================================

INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Admin',
  'admin@talent.internal',
  -- This is bcrypt hash of 'password' — CHANGE THIS IMMEDIATELY after first login
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
);
