# Design: Main View Improvements & Position Board

Date: 2026-05-03

## Overview

Two phases of work:

- **Phase 1** — Clean up the main view: visibility control (adopt April 30 spec), table layout, wider search, date defaults, admin-only edit/delete, hide clone and unused columns, action→sub-action auto-fill.
- **Phase 2** — Position detail full-page route with a Kanban board and activity log.

---

## Phase 1 — Main View Improvements

### 1. Visibility Control

Adopt the existing April 30 spec (`docs/superpowers/specs/2026-04-30-visibility-progress-update-design.md`) **Feature 1** exactly as written:

- `user_visibility_grants` table (viewer_id, target_id, granted_by, granted_at).
- `GET /tickets` backend filter: non-admin users see only tickets where `task_owner_id` is their own ID or in their granted targets.
- Admin panel → User Management: Visibility tab per user — checkboxes over all other active users; toggle calls grant/revoke endpoints.
- Admins see all tickets unconditionally.

No deviations from the April 30 spec for this feature.

---

### 2. Table Layout & Pagination

**Pagination:** Change default `LIMIT` from 100 to 50. Pagination controls remain the same.

**Table height:** Expand to fill viewport bottom — `maxHeight: calc(100vh - 320px)` (adjust constant during implementation to eliminate dead space below the table).

**Visible columns (in order):**

| # | Column | Notes |
|---|--------|-------|
| 1 | Date | entry_date |
| 2 | Task Owner | task_owner_name |
| 3 | Ticket # | ticket_number |
| 4 | Ticket Type | ticket_type |
| 5 | Status | StatusBadge |
| 6 | Ticket Date | ticket_date |
| 7 | Position | **Clickable** → navigates to `/positions/:positionId` |
| 8 | Mgmt Type | management_type |
| 9 | Department | department_name |
| 10 | Ultimate HM | ultimate_hm_name |
| 11 | Direct HM | direct_hm_name |
| 12 | Country & Company | country_company_label |
| 13 | Candidates | candidate_count |
| 14 | Action | action |
| 15 | Actions (sticky right) | Edit ✏️ + Delete 🗑 — **admin only** |

**Hidden columns:** Sub-Action, Remarks, Group.

**Actions column:**
- Status quick-change dropdown removed.
- Edit ✏️ and Delete 🗑 icon buttons shown **only when `user.role === 'admin'`**. Non-admin users see no action buttons.
- Clone button and `CloneModal` are hidden from the UI (code kept but not rendered — a full removal is planned for a later sprint).

**Horizontal scroll:** Kept — if all 14 columns don't fit the viewport, horizontal scroll is acceptable.

---

### 3. Search Scope Expansion

Backend `GET /tickets` search (`ILIKE %term%`) expanded to cover:

- `t.ticket_number`
- `t.action`
- `t.sub_action`
- `t.remarks`
- `u_owner.name` (task owner)
- `pos.name` (position name) — requires JOIN on positions
- `dept.name` (department name) — requires JOIN on departments
- `uhm.name` (ultimate HM name) — JOIN on `hiring_managers uhm ON uhm.id = t.ultimate_hm_id` (already exists)
- `dhm.name` (direct HM name) — JOIN on `hiring_managers dhm ON dhm.id = t.direct_hm_id` (already exists)
- `cc.label` (country & company label) — requires JOIN on country_companies

All joins must be LEFT JOINs so tickets with no linked record still appear. The existing JOIN aliases in the tickets query should be reused or added as needed.

---

### 4. Add New Entry — Date Default & Admin Date Override

- `entry_date` field on the Add New Entry form defaults to today's date and is rendered **read-only** for non-admin users who do not have an active date override.
- Admin date override window: adopt April 30 spec Feature 2 — `date_override_enabled` + `date_override_expires_at` columns on `users`; admin routes `POST/DELETE /api/v1/admin/users/:id/date-override`; if a user has an active window, `entry_date` becomes a free date picker.
- The "Update Progress" flow and `UpdateProgressModal` from the April 30 spec are also included in Phase 1 as they are closely related to the date override feature.

---

### 5. Action → Sub-Action Auto-Fill

**Settings storage:** A new dropdown-management category called `action_subaction_rules` holds the mapping list. Each record has `action_value` and `sub_action_value` fields (managed via the existing Dropdown Management admin UI — add a new tab "Auto-fill Rules").

**Behaviour on the Add/Edit form:**
- When the user selects an Action that matches a rule, the Sub-Action field is automatically populated with the mapped value.
- The Sub-Action field remains editable — the auto-fill is a suggestion, not a lock.
- Initial rule shipped in seed/migration: `Open Ticket → Active Hiring Ticket`.

**Backend:** No enforcement needed server-side — this is a UX convenience only; sub_action is always freely writable.

---

## Phase 2 — Position Detail Page & Kanban Board

### 1. Routing

New React route: `/positions/:positionId`

- Navigated to by clicking any position name cell in the main table.
- Full-page layout (no overlay). Browser Back returns to the main table.
- Three stacked sections: Position Details → Board → Activity Log.

---

### 2. Position Details (top section)

Read-only summary card:

| Field | Source |
|-------|--------|
| Position name | positions.name |
| Department | departments.name |
| Country & Company | country_companies.label |
| Management type | tickets.management_type (first ticket for this position) |
| Ultimate HM | hiring_managers.name (via ticket's ultimate_hm_id) |
| Direct HM | hiring_managers.name (via ticket's direct_hm_id) |
| Number of Candidates required | MAX(candidate_count) across all tickets for this position (the largest value set on any ticket — represents the full hiring target) |
| Status | Open / Filled |

**Re-open button:** Visible to all authenticated users when status is Filled. Clicking it sets status back to Open — all existing board data is preserved, no reset. Every re-open is logged in `position_board_log`.

---

### 3. Kanban Board (middle section)

Six columns rendered left-to-right. Drag-and-drop between columns uses a lightweight library (e.g. `@dnd-kit/core`).

#### Screening
- \+ button opens a small inline popup with one field: **Number of Screenings** (positive integer).
- Each submitted entry renders as a card: "Screening #N — [date]".
- No candidate names at this stage.
- Stored in `position_board_screenings`.

#### Batches
- \+ button opens a **right-side slide-in panel** with one field: batch name/label (text).
- Each batch renders as an expandable card.
- Inside each batch card, a \+ button adds a candidate by name (plain text, stored in `position_board_candidates`).
- Candidates in batches are the source pool for all downstream columns.

#### Assessment
- Candidates are **dragged in from any Batch card**.
- On drop, a required popup appears with:
  - **Assessment Level** — dropdown populated from the `assessment_levels` category in Dropdown Management.
  - **Assessment Result** — optional text field, editable later by clicking the candidate card.
- Stored as a `position_board_stages` row with `stage = 'assessment'`.

#### Technical Interview
- Candidates dragged in from Assessment. No popup on drop.
- Stored as `stage = 'technical_interview'`.

#### Offer
- Candidates dragged in from Technical Interview.
- On drop, a required popup appears with:
  - **Offer Ticket Number** — text field.
- Stored as `stage = 'offer'`.

#### Hired
- Candidates dragged in from Offer. No popup on drop.
- Stored as `stage = 'hired'`.
- When the count of Hired cards reaches the position's **Number of Candidates**, the position status flips to **Filled** automatically and a banner is shown: "Position filled — all required candidates hired."
- The Re-open button (see Position Details section) clears the banner.

---

### 4. Database Schema Additions

```sql
-- Screening entries per position
CREATE TABLE position_board_screenings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id  UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count        INTEGER NOT NULL CHECK (count > 0),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Batches
CREATE TABLE position_board_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id  UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Candidates (named, inside batches)
CREATE TABLE position_board_candidates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES position_board_batches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stage progression per candidate
CREATE TABLE position_board_stages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id          UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id         UUID NOT NULL REFERENCES position_board_candidates(id) ON DELETE CASCADE,
  stage                TEXT NOT NULL CHECK (stage IN ('assessment','technical_interview','offer','hired')),
  assessment_level     TEXT,
  assessment_result    TEXT,
  offer_ticket_number  TEXT,
  moved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, stage)
);

-- Position status (filled / open)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS board_status TEXT NOT NULL DEFAULT 'open'
  CHECK (board_status IN ('open', 'filled'));

-- Activity log
CREATE TABLE position_board_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id  UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type   TEXT NOT NULL,  -- e.g. 'screening_added', 'candidate_moved', 'position_reopened'
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pbl_position ON position_board_log(position_id, created_at DESC);
```

---

### 5. Backend API Routes

All routes under `authMiddleware`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/positions/:id/board` | Full board state (screenings, batches+candidates, stages) |
| POST | `/api/v1/positions/:id/screenings` | Add a screening entry |
| POST | `/api/v1/positions/:id/batches` | Create a batch |
| POST | `/api/v1/positions/:id/batches/:batchId/candidates` | Add candidate to batch |
| POST | `/api/v1/positions/:id/stages` | Move candidate to a stage (body: candidate_id, stage, + stage-specific fields) |
| PATCH | `/api/v1/positions/:id/stages/:stageId` | Edit assessment_result or offer_ticket_number |
| POST | `/api/v1/positions/:id/reopen` | Re-open a filled position |
| GET | `/api/v1/positions/:id/log` | Fetch activity log (paginated, newest first) |

Every write endpoint appends a row to `position_board_log` describing what changed.

---

### 6. Activity Log (bottom section)

Chronological feed pulled from `position_board_log`, newest-first, paginated (20 per page).

Each entry displays: actor name · event description · timestamp.

Example entries:
- "Marina moved **Ahmed Hassan** to Offer"
- "Abdallah created Batch **Engineering Round 1**"
- "Mostafa added candidate **Sara Ali** to Batch Engineering Round 1"
- "Position re-opened by Mostafa"
- "Screening entry added: 12 screenings"

---

## What is NOT changing

- Existing `audit_log` table — untouched.
- `ticket_groups` / `is_group_master` — untouched.
- Roles (`admin`, `member`, `viewer`) — untouched.
- `CloneModal` code — kept but not rendered (full removal deferred).
- Sub-Action, Remarks, Group columns — hidden from table but remain in DB and edit modal.
