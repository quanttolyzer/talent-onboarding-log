# Dynamic Board Builder — Design Spec
_Date: 2026-05-04_

## Overview

Replace the hardcoded Hiring Ticket Kanban board with a fully dynamic, admin-configurable board system. Each ticket type can be assigned one of two view modes — **Board** (Kanban-style) or **Progress** (linear stepper) — with all columns, phases, transitions, and entry fields configured by the admin. The system is scoped to a single ticket instance, matching the pattern of the existing board.

---

## 1. Database Schema

Six new tables added via migrations. The existing `position_stages` table is preserved until a final cleanup migration after production verification.

### `board_configs`
One row per ticket type. Declares the view mode.
```
id              serial primary key
ticket_type_id  int references ticket_types(id) on delete cascade
mode            text check (mode in ('board', 'progress'))
created_at      timestamptz default now()
unique (ticket_type_id)
```

### `board_columns`
Columns for board mode. Ordered by `position`.
```
id              serial primary key
board_config_id int references board_configs(id) on delete cascade
label           text not null
position        int not null
created_at      timestamptz default now()
```

### `board_column_fields`
Which ticket fields appear (and whether required) on the add-entry form for each column.
```
id               serial primary key
board_column_id  int references board_columns(id) on delete cascade
field_key        text not null   -- e.g. 'ticket_number', 'status', 'department'
is_required      boolean not null default false
display_order    int not null default 0
```

Available `field_key` values: `ticket_number`, `ticket_status`, `ticket_type`, `ticket_date`, `task_owner`, `department`, `position`, `country_company`, `action`, `sub_action`, `remarks`, `assessment_level`.

### `board_column_transitions`
Valid drag targets per column. Server enforces these on move requests.
```
id              serial primary key
from_column_id  int references board_columns(id) on delete cascade
to_column_id    int references board_columns(id) on delete cascade
unique (from_column_id, to_column_id)
```

### `board_phases`
Ordered phases for progress mode.
```
id              serial primary key
board_config_id int references board_configs(id) on delete cascade
label           text not null
position        int not null
created_at      timestamptz default now()
```

### `board_entries`
Actual entries per column per ticket. Replaces `position_stages`.
```
id               serial primary key
ticket_id        int references tickets(id) on delete cascade
board_column_id  int references board_columns(id) on delete cascade
field_values     jsonb not null default '{}'
created_at       timestamptz default now()
updated_at       timestamptz default now()
```

### `ticket_phase_history`
Tracks all phase transitions for a ticket in progress mode. Current phase = the row with the highest `id` for a given `ticket_id`. Doubles as the activity log shown in the stepper UI.
```
id              serial primary key
ticket_id       int references tickets(id) on delete cascade
board_phase_id  int references board_phases(id) on delete cascade
advanced_by     int references users(id)
created_at      timestamptz default now()
```

---

## 2. Backend API

New route file: `backend/routes/boardConfigs.js`.

### Admin config endpoints (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/board-configs/:ticketTypeId` | Fetch full config — columns, fields, transitions, phases |
| PUT | `/admin/board-configs/:ticketTypeId` | Create or replace full config (atomic upsert) |

The PUT body shape:
```json
{
  "mode": "board",
  "columns": [
    {
      "label": "Screening",
      "position": 1,
      "fields": [
        { "field_key": "ticket_number", "is_required": true, "display_order": 1 }
      ]
    }
  ],
  "transitions": [
    { "from_label": "Screening", "to_label": "HR Interview" }
  ]
}
```
For progress mode, replace `columns` and `transitions` with `phases: [{ "label": "...", "position": 1 }]`.

Column labels must be unique within a single config — the server uses labels to resolve `from_label`/`to_label` transition references and returns a `400` if duplicates are found.

### Board data endpoints (authenticated users)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets/:ticketId/board` | Config + entries (board) or config + current phase (progress) |
| POST | `/tickets/:ticketId/board/entries` | Add entry to a column (board mode) |
| PATCH | `/tickets/:ticketId/board/entries/:id/move` | Move entry to another column — server validates transition |
| DELETE | `/tickets/:ticketId/board/entries/:id` | Remove an entry (admin only) |
| POST | `/tickets/:ticketId/board/advance` | Move ticket to next phase (progress mode) |
| POST | `/tickets/:ticketId/board/phase/:phaseId` | Jump to a specific phase (admin only) |

On `PATCH /move`, the server queries `board_column_transitions` to confirm the move is allowed before writing. Returns `400` with a descriptive error if the transition is invalid.

The existing `/positions/:positionId` route is kept during the migration period and becomes a thin redirect to `/tickets/:ticketId/board` once the Hiring Ticket config is verified.

---

## 3. Admin Config UI

Location: **Ticket Types** section inside `DropdownManagement.jsx`.

Each ticket type row gets a **"Configure Board"** button alongside existing edit/delete actions. Clicking it expands an inline panel below that row — no modal, no page navigation.

### Panel structure

**Mode selector** — three options: `None | Board | Progress`
- `None`: no board view; the "📋" button is hidden on the dashboard for tickets of this type
- `Board`: reveals board column config below
- `Progress`: reveals phase config below

**Board mode config:**
- Drag-to-reorder vertical list of columns
- Each column row: label input + "Fields" button + delete button
- "Fields" button opens a small inline sub-panel with a checklist of available ticket fields; each field has a "Required" toggle
- "Add Column" button at the bottom of the column list
- **Transitions** grid below the column list: rows = source column, columns = target columns, checkboxes mark allowed moves. Only columns defined above appear in the grid.

**Progress mode config:**
- Drag-to-reorder vertical list of phases
- Each phase row: label input + delete button
- "Add Phase" button at the bottom

**Save button** — sends the full config as a single PUT. No auto-save. Admin explicitly commits the config.

---

## 4. Board & Progress Rendering

### Route

New route: `/tickets/:ticketId/board` → `TicketBoardPage`. The dashboard "📋" button links here instead of `/positions/:positionId`. For ticket types with `mode = None`, the button is not rendered.

### `DynamicKanbanBoard`

Replaces the hardcoded `KanbanBoard` and all its column components (`ScreeningColumn`, `HRInterviewColumn`, `BatchesColumn`, `StageColumns`).

- Columns rendered from `config.columns` in saved order using DnD Kit (same library as today)
- On drag-end: client-side transition check (fast feedback) then `PATCH /move` (server validation)
- "Add entry" button per column opens a popup form with only the fields configured for that column; required fields enforced before submit
- Entry cards display `field_values` — only the fields the column is configured to show
- Admin users see delete button on each card

### `DynamicProgressStepper`

New component for progress mode.

- Horizontal strip of numbered step circles connected by lines
- States: completed (check icon, muted), current (filled primary colour, bold label), upcoming (outlined, muted)
- "Advance to next phase" button below the stepper; disabled on the last phase
- Admin users can click any phase circle to jump directly (calls `POST /board/phase/:phaseId`)
- Below the stepper: a compact activity log derived from `ticket_phase_history` — shows phase label, timestamp, and the user who advanced it

---

## 5. Migration Strategy

### Step 1 — DB migrations
Run all six new table migrations. `position_stages` is untouched.

### Step 2 — Seed Hiring Ticket board config
One-time seed script inserts into `board_configs`, `board_columns`, `board_column_fields`, `board_column_transitions` to replicate the current hardcoded setup:
- Mode: `board`
- Columns (in order): Screening, HR Interview, Batches, Assessment, Technical Interview, Offer, Hired
- Transitions: Batches → Assessment, Batches → Technical Interview, Assessment → Technical Interview, Technical Interview → Offer, Offer → Hired
- Fields: Assessment column → `assessment_level` (required); Offer column → `ticket_number` (required)

### Step 3 — Migrate `position_stages` rows
One-time migration script copies all rows from `position_stages` into `board_entries`, mapping each `stage` string to the corresponding `board_column_id` from the seeded config. Candidate name and other data go into `field_values` jsonb.

### Step 4 — Deploy new frontend
- `PositionPage` updated to redirect to `TicketBoardPage`
- Old hardcoded components removed: `KanbanBoard.jsx`, `ScreeningColumn.jsx`, `HRInterviewColumn.jsx`, `BatchesColumn.jsx`, `StageColumns.jsx`
- Dashboard "📋" link updated to `/tickets/:ticketId/board`

### Step 5 — Cleanup (next release cycle)
After production verification, a final migration drops the `position_stages` table.

### Rollback plan
If Step 4 fails, reverting the frontend deploy restores the old hardcoded board which still reads from `position_stages` (untouched until Step 5).

---

## Out of Scope

- Real-time collaborative updates (multiple users on the same board simultaneously)
- Custom field types beyond existing ticket fields (e.g. free-text custom fields)
- Board analytics or reporting
- Per-user column visibility controls
