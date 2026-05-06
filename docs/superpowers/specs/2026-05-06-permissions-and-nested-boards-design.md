# Design: Permissions, UI Fixes & Nested Boards

**Date:** 2026-05-06
**Status:** Approved

---

## Summary

Five issues to resolve:

1. Admin's `📝` Update Progress button is clipped in the Actions column
2. `ticket_type` should be read-only in the Update Progress modal
3. Ticket detail and board routes have no ownership check — any user can access any ticket by ID
4. Board editing should respect the same access rules as ticket visibility
5. A ticket type should be able to have two stacked boards on its board page

---

## Section 1 — Frontend Fixes

### 1A: Actions column width (`DashboardPage.jsx`)

The Actions column colgroup entry changes from `118px` to `150px`. Admin sees 4 action buttons (`📝 ✏️ 🗑 📋`); the wider column prevents them from overflowing and clipping the first button.

### 1B: ticket_type read-only in Update Progress modal (`UpdateProgressModal.jsx`)

- Remove `ticket_type` from the `form` state initializer.
- Always submit `ticket.ticket_type` (the original value) in the mutation payload.
- Replace the `<select>` with a styled read-only display `<div>` showing the current type.

**Why:** Changing ticket type changes which board config is loaded. This is a destructive structural change that should only happen via the full Edit modal (admin only), not via the progress update flow.

---

## Section 2 — Backend Permission Enforcement

### 2A: Shared helper `canAccessTicket`

Add to `backend/routes/tickets.js` and `backend/routes/boards.js` (or extract to `backend/middleware/access.js`):

```js
async function canAccessTicket(pool, userId, userRole, ticketId) {
  if (userRole === 'admin') return true;
  const { rows } = await pool.query(
    `SELECT 1 FROM tickets t
     WHERE t.id = $1
       AND (
         t.task_owner_id = $2
         OR EXISTS (
           SELECT 1 FROM user_visibility_grants
           WHERE viewer_id = $2
             AND target_id = t.task_owner_id
         )
       )`,
    [ticketId, userId]
  );
  return rows.length > 0;
}
```

### 2B: Apply to `GET /tickets/:id`

After the ticket is fetched, before returning the response:

```js
const allowed = await canAccessTicket(pool, req.user.id, req.user.role, req.params.id);
if (!allowed) return res.status(403).json({ error: 'Access denied' });
```

### 2C: Apply to board routes (`routes/boards.js`)

Add the same check at the top of:
- `GET /` — view board
- `POST /entries` — add entry
- `PATCH /entries/:entryId/move` — move entry

`ticketId` is available via `req.params.ticketId` (already set by `mergeParams: true`).

`DELETE /entries/:entryId` already requires admin — no change.

### Access rules summary

| User type | View ticket detail | View board | Add/move board entries | Delete board entries |
|-----------|-------------------|------------|----------------------|---------------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Ticket owner (member) | ✅ | ✅ | ✅ | ❌ |
| Visibility-granted user | ✅ | ✅ | ✅ | ❌ |
| Other authenticated user | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |

---

## Section 3 — Two Stacked Boards per Ticket Type

### 3A: Database migration

```sql
-- Remove one-config-per-type constraint
ALTER TABLE board_configs DROP CONSTRAINT board_configs_ticket_type_id_key;

-- Add sort_order (existing rows default to 1)
ALTER TABLE board_configs ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;
```

### 3B: Backend response shape change (`GET /tickets/:ticketId/board`)

Fetch all configs for the ticket type ordered by `sort_order`, build board data for each, and return an array:

```json
{
  "boards": [
    { "sort_order": 1, "mode": "board", "columns": [...] },
    { "sort_order": 2, "mode": "progress", "phases": [...], "current_phase_id": "..." }
  ]
}
```

### 3C: Frontend render loop (`TicketBoardPage.jsx`)

Replace the single `board.mode === 'board'` / `board.mode === 'progress'` conditional with a `.map()` over `data.boards`. Each board is wrapped in a labeled section with a bottom margin of `32px` to visually separate them. Section labels show `📋 Board` or `📊 Progress`, suffixed with `(1)` / `(2)` only when multiple boards exist.

### 3D: Admin board config UI

No immediate change required. Removing the DB unique constraint allows the existing board config form to create a second config for the same ticket type. A `sort_order` input can be added as a follow-up.

### Visual layout with 2 boards

```
┌─────────────────────────────────┐
│ ← Back   Ticket #HR-001         │
├─────────────────────────────────┤
│ Ticket Details (collapsible)    │
├─────────────────────────────────┤
│ 📋 Board (1)                    │
│  [ Col A ] [ Col B ] [ Col C ]  │
├─────────────────────────────────┤
│ 📊 Progress (2)                 │
│  ① → ② → ③ → ④               │
├─────────────────────────────────┤
│ Activity Log                    │
└─────────────────────────────────┘
```

---

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/pages/DashboardPage.jsx` | Actions col width 118px → 150px |
| `frontend/src/components/UpdateProgressModal.jsx` | ticket_type display-only, remove from form state |
| `backend/routes/tickets.js` | Add `canAccessTicket` helper + call on `GET /:id` |
| `backend/routes/boards.js` | Add `canAccessTicket` helper + call on GET, POST entries, PATCH move |
| `backend/database/` | New migration: drop unique constraint, add sort_order to board_configs |
| `frontend/src/pages/TicketBoardPage.jsx` | Map over `data.boards` array instead of single board object |
