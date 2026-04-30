# Design: Visibility Control & Progress Update Flow

Date: 2026-04-30

## Overview

Two features:
1. **Visibility Control** — each user sees only their own tickets by default; admins can grant per-user access to other users' tickets.
2. **Progress Update Flow** — replace the clone feature with an in-place "Update Progress" action that records a structured history per ticket; admin can open a temporary date-override window per user for back-dating.

---

## Feature 1 — Visibility Control

### Behaviour
- By default, a logged-in user sees only tickets where `task_owner_id = their own user ID`.
- Admins see all tickets (unchanged).
- An admin can grant user A visibility of user B's tickets. This gives A access to **all** of B's tickets.
- Grants are per-user, not per-team or per-ticket-type.

### Database

New table:

```sql
CREATE TABLE user_visibility_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, target_id)
);
```

### Backend

`GET /api/v1/tickets` gains an implicit filter for non-admin users:

```sql
task_owner_id IN (
  SELECT $current_user_id
  UNION
  SELECT target_id FROM user_visibility_grants WHERE viewer_id = $current_user_id
)
```

New admin routes (all under `authMiddleware` + `adminMiddleware`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/admin/users/:id/visibility` | List users this user can see |
| POST | `/api/v1/admin/users/:id/visibility` | Grant access — body: `{ target_id }` |
| DELETE | `/api/v1/admin/users/:id/visibility/:target_id` | Revoke access |

### Frontend

**Admin panel — UserManagement** gains a "Visibility" tab per user:
- Lists all other active users with checkboxes.
- Checked = this user can see their tickets.
- Calls grant/revoke endpoints on toggle.

**DashboardPage** — no frontend filter change needed; scoping is backend-only.

---

## Feature 2 — Progress Update Flow

### Behaviour
- The **Clone** button and `CloneModal` are removed entirely.
- Each ticket row gets an **"Update Progress"** button.
- Submitting an update edits the ticket in-place and records a snapshot of what changed.
- `entry_date` defaults to today on both new ticket creation and progress updates.
- An admin can open a **temporary date-override window** for a specific user, allowing them to enter any date. The window has an expiry date/time set by the admin; it auto-closes when that time passes. The admin can also close it early manually.
- A per-ticket **History** panel shows the full update timeline.

### Database

New columns on `users`:

```sql
ALTER TABLE users
  ADD COLUMN date_override_enabled    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN date_override_expires_at TIMESTAMPTZ;
```

New table:

```sql
CREATE TABLE ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL,
  changes        JSONB NOT NULL  -- [{field, old_value, new_value}, ...]
);

CREATE INDEX idx_ticket_updates_ticket ON ticket_updates(ticket_id);
CREATE INDEX idx_ticket_updates_submitted_at ON ticket_updates(submitted_at DESC);
```

### Backend

New ticket routes:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/tickets/:id/progress` | Submit a progress update |
| GET | `/api/v1/tickets/:id/updates` | Fetch update history for a ticket |

**`POST /tickets/:id/progress`**
- Accepted (editable) fields: `ticket_status`, `entry_date`, `ticket_type`, `candidate_count`, `action`, `sub_action`, `remarks`.
- Locked fields (position, department, hiring managers, country/company, task_owner, ticket_date) are ignored even if sent.
- If `entry_date` differs from today → checks `date_override_enabled = true AND date_override_expires_at > now()` for the requesting user. Returns `403` if not.
- Updates ticket row in-place.
- Computes `changes` JSONB (only fields whose value actually changed).
- Writes one row to `ticket_updates`.
- Also writes to `audit_log` per changed field (backwards compatibility).

**`GET /tickets/:id/updates`**
- Returns rows from `ticket_updates` joined with `users` (for `submitted_by_name`), ordered by `submitted_at DESC`.

New admin routes for date override:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/admin/users/:id/date-override` | Open window — body: `{ expires_at }` |
| DELETE | `/api/v1/admin/users/:id/date-override` | Close window early |

### Frontend

**DashboardPage**
- Remove "Clone" button and `CloneModal` import.
- Add "Update Progress" button per row (same action column position).

**New `UpdateProgressModal`**
- Locked fields shown read-only: ticket_date, position, department, hiring manager, country/company, task owner.
- Editable fields: ticket_status, ticket_type, candidate_count, action, sub_action, remarks.
- `entry_date` displayed as read-only showing today's date. If the logged-in user has `date_override_enabled = true` and `date_override_expires_at` is in the future (fetched from `GET /api/v1/me` on app load), it becomes a free date picker.
- On submit: calls `POST /tickets/:id/progress`, refreshes the ticket row.

**New per-ticket History panel**
- "History" icon/button on each ticket row.
- Opens a modal/panel fetching `GET /tickets/:id/updates`.
- Timeline view: each entry shows submitted_by name, submitted_at, effective_date, and a field-by-field diff.

**Admin panel — UserManagement** gains two new sub-sections per user:

*Visibility tab* (see Feature 1 above).

*Date Override tab:*
- Shows current status: "Active until [datetime]" or "Inactive".
- Expiry date/time picker + "Open Window" button to activate.
- "Close Now" button visible when a window is active.
- Calls date-override admin routes.

---

## What is NOT changing

- `audit_log` table — kept as-is, still written to on every field change.
- `ticket_groups` / `is_group_master` / group status sync — unchanged.
- Roles (`admin`, `member`, `viewer`) — unchanged.
- Admin sees all tickets regardless of visibility grants.
- The `bulk-clone` backend route is removed; the `ticket_groups` group membership of existing cloned rows is preserved in the DB for historical data.
