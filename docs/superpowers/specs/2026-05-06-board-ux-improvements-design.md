# Design: Board UX Improvements

**Date:** 2026-05-06  
**Status:** Approved

---

## Overview

Five coordinated improvements to the ticket board system:

1. **Mini-card preview** — configurable ticket fields shown on Kanban board cards per column
2. **Professional activity logs** — fix `? → ?` bug on column moves; log new board entries
3. **Task Owner lock** — hide Task Owner from non-admin "Add New Entry" form; backend enforces current user
4. **Default Ticket Status** — one status marked as default; excluded from "Add New Entry" dropdown
5. **Sticky Notes per ticket** — color-coded, toggleable notes panel on the TicketBoardPage

---

## 1. Mini-Card Preview

### Problem
Cards on the Kanban board show `(entry)` when a column has no required fields, because the card label falls back to the first value in `field_values`, which is empty.

### Solution
Add a `card_display_fields` configuration per board column. Admin selects which ticket-level fields appear on the card. The board API joins ticket data into each entry so the card can render them.

### Data
**`board_columns`** — add column:
```sql
card_display_fields JSONB NOT NULL DEFAULT '[]'
```
Stores an ordered list of ticket field keys, e.g. `["ticket_number", "position_name", "department_name"]`.

Available ticket fields for selection:
- `ticket_number`, `ticket_type`, `ticket_status`
- `position_name`, `department_name`, `management_type`
- `task_owner_name`, `candidate_count`, `remarks`

### API
`GET /tickets/:id/board` — for each entry, attach a `ticket_fields` object containing the resolved values for all `card_display_fields` keys of its column.

### Admin UI (`BoardConfigPanel.jsx`)
Per column, add a "Card Display Fields" collapsible sub-panel (same style as existing Custom Fields panel). Admin checks/orders fields from the fixed list above. Saved alongside column on config save.

### Card UI (`DynamicKanbanBoard.jsx` — `DraggableCard`)
Replace single-label logic with a mini-card:
- First configured field rendered bold as the card title
- Remaining fields rendered as `key: value` rows beneath
- Fallback to `ticket_number` if `card_display_fields` is empty
- Remove hardcoded `👤` prefix; icon only shown if `task_owner_name` is a configured field

---

## 2. Activity Log Fixes

### Bug: `? → ?` on Column Move

**Root cause:** `boardConfigs.js` save route deletes all `board_columns` for a config and re-inserts them with new IDs (`DELETE FROM board_columns WHERE board_config_id = $1`). Existing `board_entries` retain the old column IDs. When an entry is moved, the label lookup for the old column returns no row, and the audit log writes `'?'`.

**Fix:** Replace delete+reinsert with upsert-by-label:
1. For each incoming column, check if a `board_columns` row with that `label` and `board_config_id` already exists.
2. If yes: update `position` and `card_display_fields` in place, preserving `id`.
3. If no: insert new row.
4. Delete any columns whose labels are no longer in the incoming list (and cascade-delete their entries/transitions/fields).

This preserves column IDs across config saves, keeping all `board_entries` references valid.

**Display fallback:** In `activityLabel()` on the frontend, replace `entry.old_value || '?'` with `entry.old_value || '—'` as a safety net.

### Missing Log: Board Entry Added

**`POST /tickets/:ticketId/board/entries`** — after inserting the entry, write to `audit_log`:
```
field_name: 'board_entry_added'
old_value:  column.label   (e.g. "Shortlisted")
new_value:  ticket_status  (e.g. "Active")
```

**`activityLabel()` new case:**
```
'board_entry_added' → "Added entry to '{old_value}' · Status: {new_value}"
```

### Log Display Format
All log entries show: `[icon] [description]` with `[actor] · [time ago]` beneath.

| `field_name` | Icon | Description |
|---|---|---|
| `created` | ✦ | `Ticket created` |
| `board_column` | → | `Moved: {old} → {new}` |
| `board_entry_added` | ＋ | `Added entry to '{old}' · Status: {new}` |
| `phase` | ◉ | `Phase: {old} → {new}` |
| other | ✎ | `{field}: {old} → {new}` |

---

## 3. Task Owner Lock

### Behavior
- **Non-admin users:** Task Owner field is **hidden** from the "Add New Entry" form entirely. Backend automatically sets `task_owner_id = req.user.id` when the ticket is created.
- **Admin users:** Task Owner field is visible and editable (current behavior unchanged).
- Edit form is unaffected — Task Owner remains editable for all users with edit access.

### Implementation
**`TicketModal.jsx`** — wrap the Task Owner `form-group` div in `{isAdmin && (...)}` where `isAdmin = user?.role === 'admin'`.

**`POST /tickets` backend** — before INSERT, if `req.user.role !== 'admin'`, override `task_owner_id` with `req.user.id` regardless of what was sent in the body.

---

## 4. Default Ticket Status

### Behavior
- Admin marks exactly one `ticket_status` as default in the Dropdown Management panel.
- When a non-admin opens "Add New Entry", the Ticket Status dropdown does **not** show the default status — the backend applies it automatically.
- Admin users see all statuses in the "Add New Entry" form (admin may need to override).
- Edit ticket form shows all statuses for all users (no change).
- New ticket creation: if `ticket_status` is not provided (non-admin path), backend defaults to the `is_default` status.

### Data
**`ticket_statuses`** — add column:
```sql
is_default BOOLEAN NOT NULL DEFAULT false
```
DB constraint or application-level enforcement ensures at most one row has `is_default = true`.

### API
- `GET /admin/mappings` — include `is_default` on each status object.
- `PUT /admin/dropdown-management/ticket_statuses/:id` — accept `is_default` flag; if setting to true, clear `is_default` on all other statuses first (single transaction).

### Admin UI (`DropdownManagement.jsx`)
For the Ticket Statuses section, add a "Default" radio button per row. Only one can be selected at a time. Clearly labeled.

### Add New Entry Form (`TicketModal.jsx`)
On mount, read `mappings.ticket_statuses`, find the one with `is_default === true`, and pre-fill `form.ticket_status` with its name. Filter that status out of the rendered `<option>` list for non-admin users.

---

## 5. Sticky Notes Per Ticket

### Behavior
- Notes panel lives on `TicketBoardPage`, between the boards section and the activity log.
- Any authenticated user can add, edit, delete, and toggle their own notes. Admins can manage all notes.
- Notes support 7 pastel colors: yellow (default), orange, pink, teal, green, light-pink, light-blue.
- Marking a note as done renders its text with strikethrough; the card retains its color.
- Notes are per-ticket (scoped to `ticket_id`).

### Data
New table `ticket_notes`:
```sql
CREATE TABLE ticket_notes (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT 'yellow',
  is_done     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ticket_notes(ticket_id);
```

### API — `/tickets/:ticketId/notes`

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/tickets/:id/notes` | — | Returns all notes for ticket, ordered by `created_at DESC` |
| POST | `/tickets/:id/notes` | `{content, color}` | Creates note; sets `created_by = req.user.id` |
| PATCH | `/tickets/:id/notes/:noteId` | `{content?, color?, is_done?}` | Updates note; non-admins can only update their own (`created_by = req.user.id`); notes with NULL created_by are admin-only |
| DELETE | `/tickets/:id/notes/:noteId` | — | Deletes note; non-admins can only delete their own; notes with NULL created_by are admin-only |

### Component: `StickyNotesPanel.jsx`

**Layout:**
```
Notes [8]                              [+]
┌─────────────────────────────────────────┐
│ [textarea: Write a note...]             │
│ ● ● ● ● ● ● ●  (color swatches)        │
│ [Save]  [Cancel]                        │
└─────────────────────────────────────────┘

[card]  [card]
[card]  [card]
[card]  [card]
```

**Note card:**
- Background color matches selected color (pastel CSS variable or inline hex)
- Content text; strikethrough + reduced opacity if `is_done`
- Bottom-right: `✓` (toggle done) · `✎` (enter edit mode inline) · `✕` (delete with confirm)
- Edit mode: content becomes a textarea in place; Save/Cancel inline

**Color palette** (hex values matching screenshot style):
| Name | Hex |
|---|---|
| yellow | `#fef08a` |
| orange | `#fed7aa` |
| pink | `#f9a8d4` |
| teal | `#99f6e4` |
| green | `#bbf7d0` |
| light-pink | `#fecdd3` |
| light-blue | `#bae6fd` |

---

## File Change Summary

### Backend
| File | Change |
|---|---|
| `backend/routes/boardConfigs.js` | Replace delete+reinsert with upsert-by-label for board_columns |
| `backend/routes/boards.js` | Add audit log on entry add; join ticket fields into board response |
| `backend/routes/tickets.js` | Enforce task_owner_id for non-admin on POST; apply default status |
| `backend/routes/admin.js` | Expose `is_default` on statuses; handle toggle in dropdown management |
| `backend/routes/notes.js` (new) | CRUD routes for ticket notes |
| `backend/database/schema.sql` or migration | Add `card_display_fields` to board_columns; `is_default` to ticket_statuses; create ticket_notes table |

### Frontend
| File | Change |
|---|---|
| `BoardConfigPanel.jsx` | Add Card Display Fields sub-panel per column |
| `DynamicKanbanBoard.jsx` | Rewrite DraggableCard to render mini-card from configured fields |
| `TicketModal.jsx` | Hide Task Owner for non-admin; filter+auto-set default status |
| `DropdownManagement.jsx` | Add Default radio for ticket statuses |
| `TicketBoardPage.jsx` | Insert StickyNotesPanel between boards and activity log; fix activityLabel fallback |
| `StickyNotesPanel.jsx` (new) | Full notes UI component |
