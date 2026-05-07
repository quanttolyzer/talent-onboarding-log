-- ============================================================
-- Talent & Onboarding Log — PostgreSQL Init (clean slate)
-- Single file: all tables, indexes, triggers, admin user only.
-- No enum types, no seed data for dropdowns.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

-- ============================================================
-- TICKET GROUPS
-- ============================================================

CREATE TABLE ticket_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TICKETS (all enum columns are plain TEXT)
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

-- ============================================================
-- VISIBILITY & DATE OVERRIDE
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
-- TICKET UPDATES (progress history)
-- ============================================================

CREATE TABLE ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL,
  changes        JSONB NOT NULL DEFAULT '[]'
);

-- ============================================================
-- ACTION → SUB-ACTION AUTO-FILL RULES
-- ============================================================

CREATE TABLE action_subaction_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_value     TEXT NOT NULL,
  sub_action_value TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_value)
);

-- ============================================================
-- POSITION BOARD TABLES
-- ============================================================

CREATE TABLE position_board_screenings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL CHECK (count > 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_candidates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES position_board_batches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id         UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES position_board_candidates(id) ON DELETE CASCADE,
  stage               TEXT NOT NULL CHECK (stage IN ('assessment', 'technical_interview', 'offer', 'hired')),
  assessment_level    TEXT,
  assessment_result   TEXT,
  offer_ticket_number TEXT,
  moved_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

CREATE TABLE position_board_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE position_board_hr_interviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL CHECK (count > 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DYNAMIC BOARD BUILDER
-- ============================================================

CREATE TABLE board_configs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL CHECK (mode IN ('board', 'progress')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_type_id)
);

CREATE TABLE board_columns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_board_columns_position UNIQUE (board_config_id, position)
);

CREATE TABLE board_column_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT uq_board_column_fields_key UNIQUE (board_column_id, field_key)
);

CREATE TABLE board_column_transitions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  to_column_id   UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  UNIQUE (from_column_id, to_column_id)
);

CREATE TABLE board_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_board_phases_position UNIQUE (board_config_id, position)
);

CREATE TABLE board_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_values    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_phase_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_phase_id UUID NOT NULL REFERENCES board_phases(id) ON DELETE CASCADE,
  advanced_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_tickets_status       ON tickets(ticket_status);
CREATE INDEX idx_tickets_owner        ON tickets(task_owner_id);
CREATE INDEX idx_tickets_type         ON tickets(ticket_type);
CREATE INDEX idx_tickets_entry_date   ON tickets(entry_date DESC);
CREATE INDEX idx_tickets_ticket_date  ON tickets(ticket_date DESC);
CREATE INDEX idx_tickets_position     ON tickets(position_id);
CREATE INDEX idx_tickets_department   ON tickets(department_id);
CREATE INDEX idx_tickets_group        ON tickets(group_id);
CREATE INDEX idx_tickets_group_master ON tickets(group_id, is_group_master);
CREATE INDEX idx_tickets_sub_action   ON tickets(sub_action);
CREATE INDEX idx_audit_ticket         ON audit_log(ticket_id);
CREATE INDEX idx_audit_changed_at     ON audit_log(changed_at DESC);

CREATE INDEX idx_tickets_fts ON tickets USING gin(
  to_tsvector('english',
    coalesce(ticket_number, '') || ' ' ||
    coalesce(remarks, '') || ' ' ||
    coalesce(sub_action, '')
  )
);

CREATE INDEX idx_ticket_updates_ticket       ON ticket_updates(ticket_id);
CREATE INDEX idx_ticket_updates_submitted_at ON ticket_updates(submitted_at DESC);
CREATE INDEX idx_pbl_position                ON position_board_log(position_id, created_at DESC);
CREATE INDEX idx_board_columns_config        ON board_columns(board_config_id);
CREATE INDEX idx_board_column_fields_column  ON board_column_fields(board_column_id);
CREATE INDEX idx_board_phases_config         ON board_phases(board_config_id);
CREATE INDEX idx_board_entries_ticket        ON board_entries(ticket_id);
CREATE INDEX idx_board_entries_column        ON board_entries(board_column_id);
CREATE INDEX idx_ticket_phase_history_ticket ON ticket_phase_history(ticket_id);

-- ============================================================
-- TRIGGERS
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

CREATE OR REPLACE FUNCTION sync_group_status()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_group_status_sync
  AFTER UPDATE OF ticket_status ON tickets
  FOR EACH ROW EXECUTE FUNCTION sync_group_status();

-- ============================================================
-- SEED: default admin user only
-- Fixed UUID so JWT tokens survive docker compose down -v
-- Default password: "password" — change after first login
-- ============================================================

INSERT INTO users (id, name, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Admin',
  'admin@talent.internal',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
);
