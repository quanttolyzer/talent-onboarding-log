-- ============================================================
-- Talent & Onboarding Log — Complete PostgreSQL Schema
-- Auto-generated from running database schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_group_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_group_master = true AND OLD.ticket_status <> NEW.ticket_status THEN
    UPDATE tickets
    SET ticket_status = NEW.ticket_status,
        updated_at    = now()
    WHERE group_id = NEW.group_id
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- LOOKUP / DROPDOWN TABLES
-- ============================================================

CREATE TABLE positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL UNIQUE,
  management_type TEXT,
  board_status    TEXT NOT NULL DEFAULT 'open' CHECK (board_status IN ('open', 'filled')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE ticket_statuses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE management_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sub_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_name TEXT NOT NULL,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_name, name)
);

CREATE TABLE action_subaction_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_value      TEXT NOT NULL UNIQUE,
  sub_action_value  TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assessment_levels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(255) NOT NULL,
  email                    VARCHAR(255) NOT NULL UNIQUE,
  password_hash            VARCHAR(255) NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'member'
                             CHECK (role IN ('admin', 'member', 'viewer')),
  is_active                BOOLEAN NOT NULL DEFAULT true,
  date_override_enabled    BOOLEAN NOT NULL DEFAULT false,
  date_override_expires_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TICKET GROUPS
-- ============================================================

CREATE TABLE ticket_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TICKETS
-- ============================================================

CREATE TABLE tickets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           UUID REFERENCES ticket_groups(id) ON DELETE SET NULL,
  is_group_master    BOOLEAN NOT NULL DEFAULT false,
  task_owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  entry_date         DATE NOT NULL,
  ticket_number      VARCHAR(100) NOT NULL UNIQUE,
  ticket_type        TEXT NOT NULL,
  ticket_status      TEXT NOT NULL DEFAULT 'On-hold',
  ticket_date        DATE NOT NULL,
  position_id        UUID REFERENCES positions(id),
  management_type    TEXT NOT NULL,
  department_id      UUID REFERENCES departments(id),
  ultimate_hm_id     UUID REFERENCES hiring_managers(id),
  direct_hm_id       UUID REFERENCES hiring_managers(id),
  country_company_id UUID REFERENCES country_companies(id),
  candidate_count    SMALLINT NOT NULL DEFAULT 1 CHECK (candidate_count > 0),
  action             TEXT,
  sub_action         VARCHAR(150),
  remarks            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tickets_sync_group_status
  AFTER UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION sync_group_status();

-- ============================================================
-- TICKET NOTES
-- ============================================================

CREATE TABLE ticket_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT 'yellow',
  is_done    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ticket_notes_ticket_id_idx ON ticket_notes(ticket_id);

CREATE TRIGGER ticket_notes_updated_at
  BEFORE UPDATE ON ticket_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_ticket ON audit_log(ticket_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at DESC);

-- ============================================================
-- TICKET UPDATES (version history)
-- ============================================================

CREATE TABLE ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL,
  effective_date DATE,
  changes        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_ticket_updates_ticket ON ticket_updates(ticket_id);
CREATE INDEX idx_ticket_updates_submitted_at ON ticket_updates(submitted_at DESC);

-- ============================================================
-- BOARD MANAGEMENT SYSTEM
-- ============================================================

CREATE TABLE board_configs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('board', 'progress')),
  is_archived    BOOLEAN NOT NULL DEFAULT false,
  sort_order     INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_board_configs (
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_config_id UUID NOT NULL REFERENCES board_configs(id),
  bound_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, board_config_id)
);

CREATE INDEX idx_ticket_board_configs_ticket ON ticket_board_configs(ticket_id, bound_at);

CREATE TABLE board_columns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  card_display_fields JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_config_id, label),
  UNIQUE (board_config_id, position)
);

CREATE INDEX idx_board_columns_config ON board_columns(board_config_id);

CREATE TABLE board_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_config_id, position)
);

CREATE INDEX idx_board_phases_config ON board_phases(board_config_id);

CREATE TABLE board_column_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (board_column_id, field_key)
);

CREATE INDEX idx_board_column_fields_column ON board_column_fields(board_column_id);

CREATE TABLE board_column_transitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_column_id  UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  to_column_id    UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  UNIQUE (from_column_id, to_column_id)
);

CREATE TABLE board_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_values    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_entries_ticket ON board_entries(ticket_id);
CREATE INDEX idx_board_entries_column ON board_entries(board_column_id);

CREATE TRIGGER board_entries_updated_at
  BEFORE UPDATE ON board_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE ticket_phase_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_phase_id UUID REFERENCES board_phases(id) ON DELETE SET NULL,
  advanced_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_phase_history_ticket ON ticket_phase_history(ticket_id);

-- ============================================================
-- POSITION BOARD (Recruitment Pipeline)
-- ============================================================

CREATE TABLE position_board_batches (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_candidates (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id  UUID NOT NULL REFERENCES position_board_batches(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_stages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id        UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id       UUID NOT NULL UNIQUE REFERENCES position_board_candidates(id) ON DELETE CASCADE,
  stage              TEXT NOT NULL CHECK (stage IN ('assessment', 'technical_interview', 'offer', 'hired')),
  assessment_level   TEXT,
  assessment_result  TEXT,
  offer_ticket_number VARCHAR(100),
  moved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at           TIMESTAMPTZ
);

CREATE TABLE position_board_screenings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count      INTEGER NOT NULL CHECK (count > 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_hr_interviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count      INTEGER NOT NULL CHECK (count > 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pbl_position ON position_board_log(position_id, created_at DESC);

-- ============================================================
-- USER VISIBILITY GRANTS (Row-level access control)
-- ============================================================

CREATE TABLE user_visibility_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, target_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_tickets_status ON tickets(ticket_status);
CREATE INDEX idx_tickets_owner ON tickets(task_owner_id);
CREATE INDEX idx_tickets_type ON tickets(ticket_type);
CREATE INDEX idx_tickets_entry_date ON tickets(entry_date DESC);
CREATE INDEX idx_tickets_ticket_date ON tickets(ticket_date DESC);
CREATE INDEX idx_tickets_position ON tickets(position_id);
CREATE INDEX idx_tickets_department ON tickets(department_id);
CREATE INDEX idx_tickets_group ON tickets(group_id);
CREATE INDEX idx_tickets_group_master ON tickets(group_id, is_group_master);
CREATE INDEX idx_tickets_sub_action ON tickets(sub_action);
