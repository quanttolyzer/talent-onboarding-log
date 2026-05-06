# Permissions, UI Fixes & Nested Boards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the clipped admin Actions button, lock ticket_type in the Update Progress modal, enforce ticket ownership/visibility checks on all ticket detail and board routes, and support two stacked boards per ticket type.

**Architecture:** Frontend tweaks are isolated one-liners or small component changes. Backend permission enforcement is centralised in a new `middleware/access.js` helper imported by both `routes/tickets.js` and `routes/boards.js`. Nested boards require a DB migration + a backend response-shape change + a frontend render loop.

**Tech Stack:** React + React Query (frontend), Node.js/Express + PostgreSQL/pg (backend). No new packages required.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/pages/DashboardPage.jsx` | Modify line 336 | Widen Actions column to 150px |
| `frontend/src/components/UpdateProgressModal.jsx` | Modify lines 19-25, 47-50, 113-119 | ticket_type read-only display + removed from form state |
| `backend/middleware/access.js` | **Create** | Exports `canAccessTicket(pool, userId, userRole, ticketId)` |
| `backend/routes/tickets.js` | Modify lines 151-173 | Import + call `canAccessTicket` on `GET /:id` |
| `backend/routes/boards.js` | Modify lines 1-6, 9-87, 89-125, 128-172 | Import + call `canAccessTicket` on GET, POST entries, PATCH move; refactor GET to return `{ boards: [...] }` |
| `backend/database/migration-phase5.sql` | **Create** | Drop unique constraint on board_configs; add sort_order column |
| `frontend/src/pages/TicketBoardPage.jsx` | Modify lines 229-279 | Map over `data.boards` array; update header title logic |

---

## Task 1 — Fix Actions Column Width

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx:336`

- [ ] **Step 1: Apply the one-line fix**

In `frontend/src/pages/DashboardPage.jsx`, change line 336:

```jsx
// Before:
<col style={{ width: '118px' }} />

// After:
<col style={{ width: '150px' }} />
```

- [ ] **Step 2: Verify manually**

Start the frontend dev server (`npm run dev` in the `frontend/` folder).
Log in as admin. On the dashboard table, confirm all 4 action buttons (`📝 ✏️ 🗑 📋`) are visible in the Actions column for every row without any clipping.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "fix: widen Actions column to 150px so all 4 admin buttons are visible"
```

---

## Task 2 — ticket_type Read-Only in Update Progress Modal

**Files:**
- Modify: `frontend/src/components/UpdateProgressModal.jsx`

- [ ] **Step 1: Remove ticket_type from form state**

In `UpdateProgressModal.jsx`, change lines 19-25:

```jsx
// Before:
const [form, setForm] = useState({
  entry_date:      today,
  ticket_status:   ticket.ticket_status || '',
  ticket_type:     ticket.ticket_type   || '',
  candidate_count: ticket.candidate_count || 1,
  remarks:         ticket.remarks       || '',
});

// After:
const [form, setForm] = useState({
  entry_date:      today,
  ticket_status:   ticket.ticket_status || '',
  candidate_count: ticket.candidate_count || 1,
  remarks:         ticket.remarks       || '',
});
```

- [ ] **Step 2: Always submit the original ticket_type**

Change `handleSubmit` (lines 47-50):

```jsx
// Before:
function handleSubmit(e) {
  e.preventDefault();
  progressMutation.mutate(form);
}

// After:
function handleSubmit(e) {
  e.preventDefault();
  progressMutation.mutate({ ...form, ticket_type: ticket.ticket_type });
}
```

- [ ] **Step 3: Replace ticket_type select with read-only display**

Change lines 113-119:

```jsx
// Before:
<div className="form-group">
  <label>Ticket Type</label>
  <select value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
    <option value="">— Select —</option>
    {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
  </select>
</div>

// After:
<div className="form-group">
  <label>Ticket Type</label>
  <div style={{
    padding: '8px 10px',
    background: 'var(--bg)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    fontSize: '0.9rem',
  }}>
    {ticket.ticket_type}
  </div>
</div>
```

- [ ] **Step 4: Remove the now-unused `types` variable**

Delete line 53:

```jsx
// Delete this line:
const types      = mappings?.ticket_types    || [];
```

- [ ] **Step 5: Verify manually**

Open the Update Progress modal for any ticket. Confirm:
- Ticket Type shows as a grey read-only box with the current type value
- Submitting the form still saves correctly (check the History tab afterwards)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/UpdateProgressModal.jsx
git commit -m "fix: make ticket_type read-only in Update Progress modal"
```

---

## Task 3 — Create canAccessTicket Helper

**Files:**
- Create: `backend/middleware/access.js`

- [ ] **Step 1: Create the file**

Create `backend/middleware/access.js` with the following content:

```js
// Checks whether a user may read or write a specific ticket.
// Admins pass automatically. Non-admins must be the ticket's task_owner
// or have an explicit visibility grant targeting the ticket's owner.
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

module.exports = { canAccessTicket };
```

- [ ] **Step 2: Verify the file loads without errors**

```bash
node -e "const { canAccessTicket } = require('./backend/middleware/access.js'); console.log(typeof canAccessTicket);"
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add backend/middleware/access.js
git commit -m "feat: add canAccessTicket helper to middleware/access.js"
```

---

## Task 4 — Enforce Access Check on GET /tickets/:id

**Files:**
- Modify: `backend/routes/tickets.js:151-173`

- [ ] **Step 1: Import the helper**

At the top of `backend/routes/tickets.js`, after the existing requires (around line 3), add:

```js
const { canAccessTicket } = require('../middleware/access');
```

- [ ] **Step 2: Add the check inside GET /:id**

Change lines 151-173 so the ownership check runs after the 404 guard:

```js
// ── GET /tickets/:id ──────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
        u.name AS task_owner_name, pos.name AS position_name,
        dep.name AS department_name, uhm.name AS ultimate_hm_name,
        dhm.name AS direct_hm_name, cc.label AS country_company_label,
        tg.group_code AS group_code
      FROM tickets t
      LEFT JOIN users u              ON u.id   = t.task_owner_id
      LEFT JOIN positions pos        ON pos.id  = t.position_id
      LEFT JOIN departments dep      ON dep.id  = t.department_id
      LEFT JOIN hiring_managers uhm  ON uhm.id  = t.ultimate_hm_id
      LEFT JOIN hiring_managers dhm  ON dhm.id  = t.direct_hm_id
      LEFT JOIN country_companies cc ON cc.id   = t.country_company_id
      LEFT JOIN ticket_groups tg     ON tg.id   = t.group_id
      WHERE t.id = $1
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Verify manually**

- Log in as a user who is NOT the owner of a ticket and has no visibility grant. Try to open that ticket's board page — it should fail gracefully (frontend should show the error state from the 403).
- Log in as admin — all tickets still accessible.
- Log in as the ticket owner — their own ticket is still accessible.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/tickets.js
git commit -m "fix: enforce ownership/visibility check on GET /tickets/:id"
```

---

## Task 5 — Enforce Access Check on Board Routes

**Files:**
- Modify: `backend/routes/boards.js`

- [ ] **Step 1: Import the helper**

At the top of `backend/routes/boards.js`, after the existing requires (line 4), add:

```js
const { canAccessTicket } = require('../middleware/access');
```

- [ ] **Step 2: Add check to GET / (view board)**

Replace the first few lines of the `GET /` handler (lines 9-16):

```js
// GET /api/v1/tickets/:ticketId/board
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, ticketId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const { rows: [ticket] } = await pool.query(
      'SELECT id, ticket_type FROM tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    // ... rest of handler unchanged
```

- [ ] **Step 3: Add check to POST /entries (add entry)**

At the top of the `POST /entries` handler body (after `try {`), add:

```js
router.post('/entries', async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, ticketId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const { board_column_id, field_values = {} } = req.body;
    // ... rest of handler unchanged
```

- [ ] **Step 4: Add check to PATCH /entries/:entryId/move**

At the top of the `PATCH /entries/:entryId/move` handler body (after `try {`), add:

```js
router.patch('/entries/:entryId/move', async (req, res, next) => {
  try {
    const { ticketId, entryId } = req.params;

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, ticketId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const { target_column_id, additional_field_values = {} } = req.body;
    // ... rest of handler unchanged
```

- [ ] **Step 5: Verify manually**

Log in as a non-owner user with no visibility grant. Navigate directly to `/tickets/<some-ticket-id>/board`. The page should show the error state ("Access denied") rather than loading the board. Log in as the owner — board loads normally.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/boards.js
git commit -m "fix: enforce ownership/visibility check on board view, add-entry, and move-entry routes"
```

---

## Task 6 — DB Migration: Support Multiple Board Configs per Ticket Type

**Files:**
- Create: `backend/database/migration-phase5.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/database/migration-phase5.sql`:

```sql
-- Allow multiple board configs per ticket type (for stacked boards)
-- and add sort_order to control render order on the ticket board page.

ALTER TABLE board_configs DROP CONSTRAINT IF EXISTS board_configs_ticket_type_id_key;

ALTER TABLE board_configs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Run the migration against the database**

```bash
# From the project root (adjust connection string if needed — check backend/.env for DATABASE_URL)
docker exec -i talent-onboarding-postgres psql -U postgres -d talent_onboarding < backend/database/migration-phase5.sql
```

Expected output:
```
ALTER TABLE
ALTER TABLE
```

- [ ] **Step 3: Verify the schema change**

```bash
docker exec -it talent-onboarding-postgres psql -U postgres -d talent_onboarding -c "\d board_configs"
```

Confirm:
- No `board_configs_ticket_type_id_key` constraint listed
- `sort_order` column exists with type `integer` and default `1`

- [ ] **Step 4: Commit**

```bash
git add backend/database/migration-phase5.sql
git commit -m "feat: drop board_configs unique constraint and add sort_order for nested boards"
```

---

## Task 7 — Backend: Return boards Array from GET /tickets/:ticketId/board

**Files:**
- Modify: `backend/routes/boards.js` — the `GET /` handler

- [ ] **Step 1: Rewrite the GET / handler to return a boards array**

Replace the entire `GET /` handler (lines 9-87) with the following. The access check from Task 5 must remain at the top:

```js
// GET /api/v1/tickets/:ticketId/board
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, ticketId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const { rows: [ticket] } = await pool.query(
      'SELECT id, ticket_type FROM tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { rows: configs } = await pool.query(
      `SELECT bc.id, bc.mode, bc.sort_order
       FROM board_configs bc
       JOIN ticket_types tt ON tt.id = bc.ticket_type_id
       WHERE tt.name = $1
       ORDER BY bc.sort_order`,
      [ticket.ticket_type]
    );
    if (configs.length === 0) {
      return res.status(404).json({ error: 'No board configured for this ticket type' });
    }

    const boards = await Promise.all(configs.map(async (config) => {
      if (config.mode === 'board') {
        const { rows: columns } = await pool.query(
          'SELECT id, label, position FROM board_columns WHERE board_config_id = $1 ORDER BY position',
          [config.id]
        );
        const columnIds = columns.map(c => c.id);

        let fields = [], transitions = [], entries = [];
        if (columnIds.length > 0) {
          const { rows: f } = await pool.query(
            `SELECT board_column_id, field_key, is_required, display_order
             FROM board_column_fields WHERE board_column_id = ANY($1) ORDER BY display_order`,
            [columnIds]
          );
          fields = f;

          const { rows: t } = await pool.query(
            'SELECT from_column_id, to_column_id FROM board_column_transitions WHERE from_column_id = ANY($1)',
            [columnIds]
          );
          transitions = t;

          const { rows: e } = await pool.query(
            `SELECT id, board_column_id, field_values, created_at
             FROM board_entries WHERE ticket_id = $1 AND board_column_id = ANY($2)
             ORDER BY created_at`,
            [ticketId, columnIds]
          );
          entries = e;
        }

        const columnsWithData = columns.map(col => ({
          ...col,
          fields: fields.filter(f => f.board_column_id === col.id),
          allowed_target_ids: transitions.filter(t => t.from_column_id === col.id).map(t => t.to_column_id),
          entries: entries.filter(e => e.board_column_id === col.id),
        }));

        return { sort_order: config.sort_order, mode: 'board', columns: columnsWithData };
      }

      // Progress mode
      const { rows: phases } = await pool.query(
        'SELECT id, label, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
        [config.id]
      );
      const { rows: history } = await pool.query(
        `SELECT tph.id, tph.board_phase_id, tph.created_at,
                bp.label AS phase_label,
                u.name   AS advanced_by
         FROM ticket_phase_history tph
         JOIN board_phases bp ON bp.id = tph.board_phase_id
         LEFT JOIN users u   ON u.id  = tph.advanced_by
         WHERE tph.ticket_id = $1
         ORDER BY tph.created_at`,
        [ticketId]
      );
      const current_phase_id = history.length > 0 ? history[history.length - 1].board_phase_id : null;

      return { sort_order: config.sort_order, mode: 'progress', phases, current_phase_id, history };
    }));

    res.json({ boards });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify the API response shape**

Start the backend and call the endpoint with curl or a browser (logged in as admin):

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/tickets/<ticket-id>/board
```

Expected shape:
```json
{
  "boards": [
    { "sort_order": 1, "mode": "board", "columns": [...] }
  ]
}
```

(Or `"mode": "progress"` depending on how the ticket type is configured.)

- [ ] **Step 3: Commit**

```bash
git add backend/routes/boards.js
git commit -m "feat: GET /board returns boards array to support multiple stacked boards"
```

---

## Task 8 — Frontend: Render boards Array in TicketBoardPage

**Files:**
- Modify: `frontend/src/pages/TicketBoardPage.jsx:229-279`

- [ ] **Step 1: Update the render section to loop over boards**

Replace lines 229-279 (from `const board = boardQuery.data;` to the end of the component) with:

```jsx
  const { boards } = boardQuery.data;
  const ticket = ticketQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Sticky top bar */}
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '16px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>← Back</Link>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {boards.length === 1
            ? (boards[0].mode === 'board' ? '📋 Board' : '📊 Progress')
            : '📋 Boards'}
        </span>
        {ticket && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
            {ticket.ticket_number}
          </span>
        )}
      </header>

      <main style={{ flex: 1, padding: '20px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>

        {/* Ticket details */}
        {ticket && <TicketDetails ticket={ticket} />}

        {/* Stacked boards */}
        {boards.map((board, i) => (
          <div key={board.sort_order} style={{ marginBottom: '32px' }}>
            <div style={{
              fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)',
              marginBottom: '12px',
            }}>
              {board.mode === 'board' ? '📋 Board' : '📊 Progress'}
              {boards.length > 1 ? ` (${i + 1})` : ''}
            </div>
            {board.mode === 'board' && (
              <DynamicKanbanBoard ticketId={ticketId} columns={board.columns} isAdmin={isAdmin} />
            )}
            {board.mode === 'progress' && (
              <DynamicProgressStepper
                ticketId={ticketId}
                phases={board.phases}
                currentPhaseId={board.current_phase_id}
                isAdmin={isAdmin}
              />
            )}
          </div>
        ))}

        {/* Activity log */}
        <ActivityLog ticketId={ticketId} />

      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually — single board**

Open a ticket that has one board config. Confirm the page looks identical to before: no section label suffix `(1)` visible, board renders correctly.

- [ ] **Step 3: Verify manually — two boards (if a second config exists)**

In the Admin panel, create a second board config for the same ticket type with `sort_order = 2`. Open a ticket of that type. Confirm:
- Two boards render stacked vertically, each with a label `📋 Board (1)` / `📊 Progress (2)` (or whichever modes you configured)
- Activity log appears below both boards

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TicketBoardPage.jsx
git commit -m "feat: TicketBoardPage renders stacked boards array from updated API response"
```

---

## Self-Review

**Spec coverage:**
- ✅ Issue 1 (Actions column): Task 1
- ✅ Issue 2 (ticket_type read-only): Task 2
- ✅ Issue 3 (ticket detail permission check): Tasks 3 + 4
- ✅ Issue 4 (board edit permissions): Tasks 3 + 5
- ✅ Issue 5 (two stacked boards): Tasks 6 + 7 + 8

**Placeholder check:** All steps have exact file paths, complete code blocks, and exact shell commands. No TBDs.

**Type consistency:**
- `canAccessTicket(pool, userId, userRole, ticketId)` — defined in Task 3, imported identically in Tasks 4 and 5.
- `boards` array shape `{ sort_order, mode, columns/phases, ... }` — defined in Task 7, consumed identically in Task 8.
- `boardQuery.data` destructures to `{ boards }` in Task 8, matching the `res.json({ boards })` response in Task 7.
