# Board UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five coordinated board/ticket UX improvements: mini-card preview, professional activity logs (including a bug fix for `? → ?`), task owner lock, default ticket status, and per-ticket sticky notes.

**Architecture:** Each feature is layered DB → backend route → frontend component. A single migration file adds all schema changes up front so later tasks can rely on them. The board config save bug (delete+reinsert) is fixed first because it underlies the `? → ?` log problem and must not be re-introduced.

**Tech Stack:** Node.js/Express, PostgreSQL (pool queries via `pg`), React 18, @tanstack/react-query v5, react-hot-toast, @dnd-kit/core.

---

## File Map

| File | Change |
|---|---|
| `backend/database/migration-phase6.sql` | New — all schema changes for this feature set |
| `backend/routes/boardConfigs.js` | Fix upsert-by-label; save `card_display_fields` |
| `backend/routes/boards.js` | Join ticket fields into board response; log entry adds |
| `backend/routes/tickets.js` | Enforce task_owner_id for non-admin POST; apply default status |
| `backend/routes/admin.js` | Expose `is_default` on statuses; add set-default endpoint |
| `backend/routes/notes.js` | New — CRUD for ticket notes |
| `backend/routes/mappings.js` | Include `is_default` on ticket_statuses |
| `backend/app.js` | Register notes router |
| `frontend/src/components/admin/BoardConfigPanel.jsx` | Add Card Display Fields sub-panel per column |
| `frontend/src/components/board/DynamicKanbanBoard.jsx` | Rewrite DraggableCard for mini-card rendering |
| `frontend/src/components/TicketModal.jsx` | Hide task owner for non-admin; filter+pre-fill default status |
| `frontend/src/components/admin/DropdownManagement.jsx` | Add Default radio for ticket statuses |
| `frontend/src/pages/TicketBoardPage.jsx` | Insert StickyNotesPanel; update activityLabel; fix fallback |
| `frontend/src/components/StickyNotesPanel.jsx` | New — sticky notes UI |

---

## Task 1: DB Migration

**Files:**
- Create: `backend/database/migration-phase6.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- migration-phase6.sql

-- 1. Mini-card display fields per board column + unique constraint for upsert
ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS card_display_fields JSONB NOT NULL DEFAULT '[]';
ALTER TABLE board_columns
  DROP CONSTRAINT IF EXISTS board_columns_config_label_unique;
ALTER TABLE board_columns
  ADD CONSTRAINT board_columns_config_label_unique UNIQUE (board_config_id, label);

-- 2. Default ticket status flag (at most one row can be true)
ALTER TABLE ticket_statuses
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- 3. Sticky notes table
CREATE TABLE IF NOT EXISTS ticket_notes (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT 'yellow',
  is_done     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_notes_ticket_id_idx ON ticket_notes(ticket_id);
```

- [ ] **Step 2: Run the migration against your database**

```bash
psql $DATABASE_URL -f backend/database/migration-phase6.sql
```

Expected output:
```
ALTER TABLE
ALTER TABLE
CREATE TABLE
CREATE INDEX
```

- [ ] **Step 3: Verify the columns exist**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'board_columns' AND column_name = 'card_display_fields';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'ticket_statuses' AND column_name = 'is_default';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'ticket_notes';
```

Expected: one row each.

- [ ] **Step 4: Commit**

```bash
git add backend/database/migration-phase6.sql
git commit -m "feat: add migration for card_display_fields, is_default, ticket_notes"
```

---

## Task 2: Fix Board Config Save (Upsert-by-Label)

**Files:**
- Modify: `backend/routes/boardConfigs.js:160-192`

The current code deletes all `board_columns` and re-inserts, giving them new IDs. This breaks `board_entries` references, causing `? → ?` in audit logs. Fix: upsert by label.

- [ ] **Step 1: Replace the delete+reinsert block in boardConfigs.js**

Find this block (around line 160):
```js
await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [activeConfigId]);
await client.query('DELETE FROM board_phases   WHERE board_config_id = $1', [activeConfigId]);

if (mode === 'board') {
  const labelToId = {};
  for (const col of columns) {
    const { rows: [inserted] } = await client.query(
      'INSERT INTO board_columns (board_config_id, label, position) VALUES ($1, $2, $3) RETURNING id',
      [activeConfigId, col.label, col.position]
    );
    labelToId[col.label] = inserted.id;
    for (const field of (col.fields || [])) {
      await client.query(
        `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
         VALUES ($1, $2, $3, $4)`,
        [inserted.id, field.field_key, field.is_required ?? false, field.display_order || 0]
      );
    }
  }
```

Replace with:
```js
// Phases still use delete+reinsert (no foreign key entries reference them by ID)
await client.query('DELETE FROM board_phases WHERE board_config_id = $1', [activeConfigId]);

if (mode === 'board') {
  const incomingLabels = columns.map(c => c.label);

  // Delete columns that are no longer in the incoming list
  // (CASCADE deletes their fields, transitions, and entries)
  if (incomingLabels.length > 0) {
    await client.query(
      `DELETE FROM board_columns
       WHERE board_config_id = $1 AND label <> ALL($2::text[])`,
      [activeConfigId, incomingLabels]
    );
  } else {
    await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [activeConfigId]);
  }

  const labelToId = {};
  for (const col of columns) {
    // Upsert: preserve existing id if label already exists
    const { rows: [upserted] } = await client.query(
      `INSERT INTO board_columns (board_config_id, label, position, card_display_fields)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (board_config_id, label)
       DO UPDATE SET position = EXCLUDED.position,
                     card_display_fields = EXCLUDED.card_display_fields
       RETURNING id`,
      [activeConfigId, col.label, col.position, JSON.stringify(col.card_display_fields || [])]
    );
    labelToId[col.label] = upserted.id;

    // Replace fields for this column (fields don't have external references)
    await client.query('DELETE FROM board_column_fields WHERE board_column_id = $1', [upserted.id]);
    for (const field of (col.fields || [])) {
      await client.query(
        `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
         VALUES ($1, $2, $3, $4)`,
        [upserted.id, field.field_key, field.is_required ?? false, field.display_order || 0]
      );
    }
  }
```

- [ ] **Step 2: Verify the upsert works**

Start the backend (`npm run dev` in `backend/`), open the admin panel, open a ticket type's board config, save it without changes. Then check the DB:
```sql
SELECT id, label FROM board_columns WHERE board_config_id = <your_config_id>;
```
Save again — IDs should remain the same.

> **Note:** The unique constraint required by `ON CONFLICT` is added in Task 1's migration. Always run Task 1 before Task 2.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/boardConfigs.js
git commit -m "fix: upsert board_columns by label to preserve IDs across config saves"
```

---

## Task 3: Log Board Entry Add

**Files:**
- Modify: `backend/routes/boards.js:107-142` (POST /entries route)

- [ ] **Step 1: Add ticket status fetch and audit log write to POST /entries**

Find the POST `/entries` route handler in `boards.js`. After `res.status(201).json(entry)`, the route currently ends. Restructure it to also write an audit log:

Replace the entire POST /entries handler body with:
```js
router.post('/entries', async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const allowed = await canAccessTicket(pool, req.user.id, req.user.role, ticketId);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });

    const { board_column_id, field_values = {} } = req.body;
    if (!board_column_id) return res.status(400).json({ error: 'board_column_id is required' });

    const { rows: [colCheck] } = await pool.query(
      `SELECT bc_col.id FROM board_columns bc_col
       JOIN board_configs bc   ON bc.id    = bc_col.board_config_id
       JOIN ticket_types tt    ON tt.id    = bc.ticket_type_id
       JOIN tickets t          ON t.ticket_type = tt.name
       WHERE bc_col.id = $1 AND t.id = $2`,
      [board_column_id, ticketId]
    );
    if (!colCheck) return res.status(400).json({ error: 'Invalid column for this ticket' });

    const { rows: required } = await pool.query(
      'SELECT field_key FROM board_column_fields WHERE board_column_id = $1 AND is_required = true',
      [board_column_id]
    );
    for (const rf of required) {
      if (field_values[rf.field_key] == null || field_values[rf.field_key] === '') {
        return res.status(400).json({ error: `Field "${rf.field_key}" is required` });
      }
    }

    const { rows: [entry] } = await pool.query(
      `INSERT INTO board_entries (ticket_id, board_column_id, field_values)
       VALUES ($1, $2, $3)
       RETURNING id, board_column_id, field_values, created_at`,
      [ticketId, board_column_id, JSON.stringify(field_values)]
    );

    // Log the entry add
    const [{ rows: [col] }, { rows: [ticket] }] = await Promise.all([
      pool.query('SELECT label FROM board_columns WHERE id = $1', [board_column_id]),
      pool.query('SELECT ticket_status FROM tickets WHERE id = $1', [ticketId]),
    ]);
    await pool.query(
      `INSERT INTO audit_log (ticket_id, changed_by, field_name, old_value, new_value)
       VALUES ($1, $2, 'board_entry_added', $3, $4)`,
      [ticketId, req.user.id, col?.label || '—', ticket?.ticket_status || '—']
    );

    res.status(201).json(entry);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Test manually**

Start the backend. Open a ticket's board page, add an entry to any column. Then check:
```sql
SELECT field_name, old_value, new_value FROM audit_log
WHERE ticket_id = <your_ticket_id>
ORDER BY changed_at DESC LIMIT 5;
```
Expected: one row with `field_name = 'board_entry_added'`, `old_value = '<column label>'`, `new_value = '<ticket status>'`.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/boards.js
git commit -m "feat: log audit event when board entry is added"
```

---

## Task 4: Expose is_default in Mappings API

**Files:**
- Modify: `backend/routes/mappings.js:19`

- [ ] **Step 1: Add is_default to the ticket_statuses query**

Change line 19 from:
```js
pool.query(`SELECT id, name FROM ticket_statuses  WHERE is_active = true ORDER BY sort_order, name`),
```
to:
```js
pool.query(`SELECT id, name, is_default FROM ticket_statuses  WHERE is_active = true ORDER BY sort_order, name`),
```

- [ ] **Step 2: Verify**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/v1/mappings | jq '.ticket_statuses[0]'
```
Expected: `{ "id": 1, "name": "...", "is_default": false }`.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/mappings.js
git commit -m "feat: include is_default on ticket_statuses in mappings API"
```

---

## Task 5: Default Ticket Status — Admin API

**Files:**
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Add is_default to the dropdowns GET query for ticket_statuses**

In `admin.js`, find the `GET /dropdowns` route (around line 134):
```js
pool.query('SELECT id, name, is_active, created_at FROM ticket_statuses ORDER BY sort_order, name'),
```
Change to:
```js
pool.query('SELECT id, name, is_active, is_default, created_at FROM ticket_statuses ORDER BY sort_order, name'),
```

- [ ] **Step 2: Add a dedicated set-default endpoint**

Add before the existing `router.post('/ticket-statuses', ...)` line:
```js
// PUT /api/v1/admin/ticket-statuses/:id/set-default
router.put('/ticket-statuses/:id/set-default', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Clear existing default
    await client.query('UPDATE ticket_statuses SET is_default = false');
    // Set new default
    const { rows } = await client.query(
      'UPDATE ticket_statuses SET is_default = true WHERE id = $1 RETURNING id, name, is_active, is_default',
      [req.params.id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket status not found' });
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// PUT /api/v1/admin/ticket-statuses/:id/clear-default
router.put('/ticket-statuses/:id/clear-default', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE ticket_statuses SET is_default = false WHERE id = $1 RETURNING id, name, is_active, is_default',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket status not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Test both endpoints**

```bash
# Set default
curl -X PUT -H "Authorization: Bearer <admin_token>" \
  http://localhost:3001/api/v1/admin/ticket-statuses/1/set-default
# Expected: { "id": 1, "is_default": true }

# Set another — first should clear
curl -X PUT -H "Authorization: Bearer <admin_token>" \
  http://localhost:3001/api/v1/admin/ticket-statuses/2/set-default
# Check that id=1 now has is_default=false in DB
```

- [ ] **Step 4: Commit**

```bash
git add backend/routes/admin.js
git commit -m "feat: add set-default/clear-default endpoints for ticket statuses"
```

---

## Task 6: Default Ticket Status — Admin UI

**Files:**
- Modify: `frontend/src/components/admin/DropdownManagement.jsx`

- [ ] **Step 1: Add set-default mutation**

After the existing `deleteMutation` definition (around line 48), add:
```jsx
const setDefaultMutation = useMutation({
  mutationFn: ({ id, isDefault }) => {
    const endpoint = isDefault
      ? `/admin/ticket-statuses/${id}/set-default`
      : `/admin/ticket-statuses/${id}/clear-default`;
    return api.put(endpoint).then(r => r.data);
  },
  onSuccess: () => { qc.invalidateQueries(['admin-dropdowns']); toast.success('Default updated'); },
  onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
});
```

- [ ] **Step 2: Add Default column to ticket-statuses table rows**

Find the `<th>` row in the table (around line 104):
```jsx
<thead>
  <tr>
    <th>Name</th>
    <th>Active</th>
    <th style={{ textAlign: 'right' }}>Actions</th>
  </tr>
</thead>
```
Change to:
```jsx
<thead>
  <tr>
    <th>Name</th>
    <th>Active</th>
    {activeSection === 'ticket-statuses' && <th>Default</th>}
    <th style={{ textAlign: 'right' }}>Actions</th>
  </tr>
</thead>
```

- [ ] **Step 3: Add Default cell to each ticket-status row**

Find the `<td>` block inside `{tableItems.map(item => (` (around line 123). After the `is_active` `<td>`, add:
```jsx
{activeSection === 'ticket-statuses' && (
  <td>
    <input
      type="radio"
      name="default-status"
      checked={!!item.is_default}
      onChange={() => setDefaultMutation.mutate({ id: item.id, isDefault: true })}
      title="Set as default for new tickets"
    />
  </td>
)}
```

- [ ] **Step 4: Verify in browser**

Open Admin → Dropdown Management → Ticket Statuses. You should see a "Default" column with radio buttons. Clicking one radio should update the selection. Reload to confirm persistence.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/DropdownManagement.jsx
git commit -m "feat: add default status radio button in ticket statuses admin"
```

---

## Task 7: Default Ticket Status + Task Owner Lock — TicketModal & Backend

**Files:**
- Modify: `frontend/src/components/TicketModal.jsx`
- Modify: `backend/routes/tickets.js` (POST /tickets, around line 180–225)

- [ ] **Step 1: Auto-fill default status on mount in TicketModal**

In `TicketModal.jsx`, find the `empty()` function and the `useState` initializer for `form`. Currently `ticket_status` starts as `''`.

Replace the `empty()` function:
```js
function empty(mappings) {
  const defaultStatus = (mappings?.ticket_statuses || []).find(s => s.is_default);
  return {
    entry_date:         new Date().toISOString().slice(0, 10),
    task_owner_id:      '',
    ticket_number:      '',
    ticket_type:        '',
    ticket_status:      defaultStatus?.name || '',
    ticket_date:        '',
    position_id:        '',
    management_type:    '',
    department_id:      '',
    ultimate_hm_id:     '',
    direct_hm_id:       '',
    country_company_id: '',
    candidate_count:    1,
    remarks:            '',
  };
}
```

Update the `useState` call (the component signature already receives `mappings` as a prop):
```js
const [form, setForm] = useState(() => {
  if (isEdit && ticket) {
    return {
      entry_date:         ticket.entry_date?.slice(0, 10)  || '',
      task_owner_id:      ticket.task_owner_id              || '',
      ticket_number:      ticket.ticket_number              || '',
      ticket_type:        ticket.ticket_type                || '',
      ticket_status:      ticket.ticket_status              || 'On-hold',
      ticket_date:        ticket.ticket_date?.slice(0, 10)  || '',
      position_id:        ticket.position_id                || '',
      management_type:    ticket.management_type            || '',
      department_id:      ticket.department_id              || '',
      ultimate_hm_id:     ticket.ultimate_hm_id             || '',
      direct_hm_id:       ticket.direct_hm_id               || '',
      country_company_id: ticket.country_company_id         || '',
      candidate_count:    ticket.candidate_count            || 1,
      remarks:            ticket.remarks                    || '',
    };
  }
  return empty(mappings);
});
```

- [ ] **Step 2: Filter default status out of Add New Entry dropdown for non-admins**

Find the `filteredStatuses` computed variable (around line 103). Replace with:
```js
const filteredStatuses = (() => {
  const t = form.ticket_type.toLowerCase();
  let base = statuses;
  if (t === 'hiring ticket')   base = statuses.filter(s => s.name === 'Active');
  else if (t === 'offer ticket' || t === 'onboarding ticket') base = statuses.filter(s => s.name === 'In-Progress');
  // Non-admins: hide the default status (it is auto-applied, no need to select it)
  if (!isEdit && user?.role !== 'admin') {
    base = base.filter(s => !s.is_default);
  }
  return base;
})();
```

Note: `isEdit` is already defined at the top of the component as `const isEdit = mode === 'edit';`.

- [ ] **Step 3: Hide Task Owner for non-admins**

Find the Task Owner form-group (around line 143):
```jsx
<div className="form-group">
  <label>Task Owner</label>
  <select value={form.task_owner_id} onChange={e => set('task_owner_id', e.target.value)}>
    <option value="">Select…</option>
    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
  </select>
</div>
```
Wrap it:
```jsx
{user?.role === 'admin' && (
  <div className="form-group">
    <label>Task Owner</label>
    <select value={form.task_owner_id} onChange={e => set('task_owner_id', e.target.value)}>
      <option value="">Select…</option>
      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 4: Enforce task_owner_id and default status on the backend POST /tickets**

In `backend/routes/tickets.js`, find the POST `/` handler (the one that creates a new ticket — search for `INSERT INTO tickets`). The handler destructures `req.body` into `task_owner_id`, `ticket_status`, etc. After that destructure line and before the INSERT query, add enforcement:

Find the section where the ticket is inserted (after the `const { ... } = req.body` destructure, before the INSERT). Add:
```js
// Enforce task_owner for non-admins
let resolvedTaskOwnerId = task_owner_id || null;
if (req.user.role !== 'admin') {
  resolvedTaskOwnerId = req.user.id;
}

// Apply default status if none provided
let resolvedStatus = ticket_status;
if (!resolvedStatus) {
  const { rows: [def] } = await client.query(
    'SELECT name FROM ticket_statuses WHERE is_default = true LIMIT 1'
  );
  resolvedStatus = def?.name || '';
}
```

Then in the INSERT query, replace `task_owner_id` and `ticket_status` with `resolvedTaskOwnerId` and `resolvedStatus`:
```js
const { rows } = await client.query(`
  INSERT INTO tickets (
    task_owner_id, entry_date, ticket_number, ticket_type, ticket_status, ticket_date,
    position_id, management_type, department_id, ultimate_hm_id, direct_hm_id,
    country_company_id, candidate_count, remarks
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  RETURNING *
`, [
  resolvedTaskOwnerId,
  entry_date, ticket_number, ticket_type, resolvedStatus, ticket_date,
  position_id || null, management_type, department_id || null,
  ultimate_hm_id || null, direct_hm_id || null,
  country_company_id || null, candidate_count, remarks || null,
]);
```

- [ ] **Step 5: Verify in browser**

Log in as a non-admin. Open "Add New Entry". Confirm:
- No Task Owner field visible
- Ticket Status dropdown excludes the default status
- Submitting creates ticket with `task_owner_id = current user` and default status applied

Log in as admin. Confirm Task Owner field is visible and default status appears in dropdown.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TicketModal.jsx backend/routes/tickets.js
git commit -m "feat: hide task owner for non-admin, auto-apply default ticket status"
```

---

## Task 8: Mini-Card — Board Config Admin UI

**Files:**
- Modify: `frontend/src/components/admin/BoardConfigPanel.jsx`

The available ticket fields that can be displayed on a card:
```js
const TICKET_CARD_FIELDS = [
  { key: 'ticket_number',     label: 'Ticket Number' },
  { key: 'ticket_type',       label: 'Ticket Type' },
  { key: 'ticket_status',     label: 'Status' },
  { key: 'position_name',     label: 'Position' },
  { key: 'department_name',   label: 'Department' },
  { key: 'management_type',   label: 'Management Type' },
  { key: 'task_owner_name',   label: 'Task Owner' },
  { key: 'candidate_count',   label: 'Candidates' },
  { key: 'remarks',           label: 'Remarks' },
];
```

- [ ] **Step 1: Add TICKET_CARD_FIELDS constant and CardDisplayFieldsPanel component**

At the top of `BoardConfigPanel.jsx`, after the imports, add:
```js
const TICKET_CARD_FIELDS = [
  { key: 'ticket_number',   label: 'Ticket Number' },
  { key: 'ticket_type',     label: 'Ticket Type' },
  { key: 'ticket_status',   label: 'Status' },
  { key: 'position_name',   label: 'Position' },
  { key: 'department_name', label: 'Department' },
  { key: 'management_type', label: 'Management Type' },
  { key: 'task_owner_name', label: 'Task Owner' },
  { key: 'candidate_count', label: 'Candidates' },
  { key: 'remarks',         label: 'Remarks' },
];

function CardDisplayFieldsPanel({ column, onChange }) {
  const [open, setOpen] = useState(false);
  const current = column.card_display_fields || [];

  function toggle(key) {
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    onChange({ ...column, card_display_fields: next });
  }

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.75rem' }}
      >
        Card Display Fields ({current.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '8px' }}>
            Select ticket fields to show on board cards for this column.
          </p>
          {TICKET_CARD_FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={current.includes(f.key)}
                onChange={() => toggle(f.key)}
                style={{ width: 'auto' }}
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render CardDisplayFieldsPanel inside each column's editor**

Find the place in `BoardConfigPanel` where each column is rendered in edit mode. It shows `ColumnFieldsPanel`. Add `CardDisplayFieldsPanel` directly below it:

Find:
```jsx
<ColumnFieldsPanel
  column={col}
  onChange={(updated) => { ... }}
/>
```
Add immediately after:
```jsx
<CardDisplayFieldsPanel
  column={col}
  onChange={(updated) => updateActiveConfig(cfg => ({
    ...cfg,
    columns: cfg.columns.map((c, ci) => ci === colIndex ? updated : c),
  }))}
/>
```

(Use the same `colIndex` already present in the column mapping loop.)

- [ ] **Step 3: Ensure card_display_fields is initialized when loading configs**

In the `useEffect` that processes `configQuery.data` (around line 126), update the columns map:
```js
columns: (cfg.columns || []).map(c => ({
  ...c,
  fields: c.fields || [],
  card_display_fields: c.card_display_fields || [],
})),
```

- [ ] **Step 4: Verify in browser**

Open Admin → Dropdown Management → a Ticket Type → Board Config. For each column, you should see a "Card Display Fields (0) ▼" button. Clicking it shows checkboxes. Check a few, save the config, reopen — selections persist.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/BoardConfigPanel.jsx
git commit -m "feat: add card display fields configuration per board column"
```

---

## Task 9: Mini-Card — Board API Join Ticket Fields

**Files:**
- Modify: `backend/routes/boards.js` (GET /:ticketId/board route, around line 33–75)

- [ ] **Step 1: Include card_display_fields in the columns query**

In the GET board route, find:
```js
const { rows: columns } = await pool.query(
  'SELECT id, label, position FROM board_columns WHERE board_config_id = $1 ORDER BY position',
  [config.id]
);
```
Change to:
```js
const { rows: columns } = await pool.query(
  'SELECT id, label, position, card_display_fields FROM board_columns WHERE board_config_id = $1 ORDER BY position',
  [config.id]
);
```

- [ ] **Step 2: Fetch ticket fields and attach to each entry**

After fetching `entries` (the `board_entries` query), add a ticket fields fetch and merge:
```js
// Fetch ticket fields needed by any column's card_display_fields
const allCardFields = columns.flatMap(c => c.card_display_fields || []);
let ticketFields = {};
if (allCardFields.length > 0) {
  const { rows: [t] } = await pool.query(
    `SELECT
       t.id, t.ticket_number, t.ticket_type, t.ticket_status,
       t.management_type, t.candidate_count, t.remarks,
       p.name  AS position_name,
       d.name  AS department_name,
       u.name  AS task_owner_name
     FROM tickets t
     LEFT JOIN positions p   ON p.id = t.position_id
     LEFT JOIN departments d ON d.id = t.department_id
     LEFT JOIN users u       ON u.id = t.task_owner_id
     WHERE t.id = $1`,
    [ticketId]
  );
  if (t) ticketFields = t;
}
```

Then in `columnsWithData`, attach `ticket_fields` to each entry:
```js
const columnsWithData = columns.map(col => ({
  ...col,
  card_display_fields: col.card_display_fields || [],
  fields: fields.filter(f => f.board_column_id === col.id),
  allowed_target_ids: transitions.filter(t => t.from_column_id === col.id).map(t => t.to_column_id),
  entries: entries
    .filter(e => e.board_column_id === col.id)
    .map(e => ({ ...e, ticket_fields: ticketFields })),
}));
```

- [ ] **Step 3: Verify response structure**

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/tickets/<id>/board | jq '.boards[0].columns[0].entries[0]'
```
Expected: entry object now has a `ticket_fields` key with ticket data.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/boards.js
git commit -m "feat: attach ticket fields to board entries for mini-card rendering"
```

---

## Task 10: Mini-Card — DraggableCard Rendering

**Files:**
- Modify: `frontend/src/components/board/DynamicKanbanBoard.jsx:59-111`

- [ ] **Step 1: Rewrite DraggableCard to render mini-card from configured fields**

Replace the entire `DraggableCard` component:
```jsx
const FIELD_LABELS = {
  ticket_number:   'Ticket #',
  ticket_type:     'Type',
  ticket_status:   'Status',
  position_name:   'Position',
  department_name: 'Department',
  management_type: 'Management',
  task_owner_name: 'Owner',
  candidate_count: 'Candidates',
  remarks:         'Remarks',
};

function DraggableCard({ entry, column, ticketId, isAdmin }) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    data: { entryId: entry.id, fromColumnId: column.id, existingFieldValues: entry.field_values },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tickets/${ticketId}/board/entries/${entry.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-board', ticketId] });
      toast.success('Entry removed');
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const configuredFields = column.card_display_fields || [];
  const ticketFields = entry.ticket_fields || {};

  // Build display rows from configured fields, fall back to ticket_number
  const displayFields = configuredFields.length > 0
    ? configuredFields.map(key => ({ key, label: FIELD_LABELS[key] || key, value: ticketFields[key] })).filter(f => f.value != null && f.value !== '')
    : [{ key: 'ticket_number', label: 'Ticket #', value: ticketFields.ticket_number || '—' }];

  const titleField = displayFields[0];
  const detailFields = displayFields.slice(1);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...cardStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: '0.84rem', flex: 1 }}>
          {titleField ? `${titleField.value}` : '—'}
        </div>
        {isAdmin && (
          <button
            className="btn btn-danger btn-xs"
            style={{ padding: '1px 4px', fontSize: '0.68rem', marginLeft: '4px' }}
            onClick={e => { e.stopPropagation(); deleteMutation.mutate(); }}
            onMouseDown={e => e.stopPropagation()}
          >
            🗑
          </button>
        )}
      </div>
      {detailFields.map(f => (
        <div key={f.key} style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          <span style={{ fontWeight: 500 }}>{f.label}:</span> {f.value}
        </div>
      ))}
      {Object.entries(entry.field_values || {}).map(([k, v]) => (
        <div key={k} style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px', borderTop: '1px solid var(--border)', paddingTop: '3px' }}>
          <span style={{ fontWeight: 500 }}>{k}:</span> {v || '—'}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open a ticket's board page. Cards should now show the configured fields. If no fields are configured, cards show `Ticket #`. If fields are configured via admin, they appear.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/board/DynamicKanbanBoard.jsx
git commit -m "feat: render mini-card with configured ticket fields on board cards"
```

---

## Task 11: Sticky Notes — Backend

**Files:**
- Create: `backend/routes/notes.js`
- Modify: `backend/app.js`

- [ ] **Step 1: Create backend/routes/notes.js**

```js
const router = require('express').Router({ mergeParams: true });
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/v1/tickets/:ticketId/notes
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows } = await pool.query(
      `SELECT n.*, u.name AS created_by_name
       FROM ticket_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.ticket_id = $1
       ORDER BY n.created_at DESC`,
      [ticketId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/notes
router.post('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { content, color = 'yellow' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const { rows: [note] } = await pool.query(
      `INSERT INTO ticket_notes (ticket_id, created_by, content, color)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, req.user.id, content.trim(), color]
    );
    res.status(201).json({ ...note, created_by_name: req.user.name });
  } catch (err) { next(err); }
});

// PATCH /api/v1/tickets/:ticketId/notes/:noteId
router.patch('/:noteId', async (req, res, next) => {
  try {
    const { ticketId, noteId } = req.params;
    const { content, color, is_done } = req.body;

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM ticket_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    // Non-admins can only edit their own notes; NULL created_by = admin-only
    if (req.user.role !== 'admin') {
      if (existing.created_by === null || existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only edit your own notes' });
      }
    }

    const updates = [];
    const params = [];
    let pi = 1;
    if (content !== undefined) { updates.push(`content = $${pi++}`); params.push(content.trim()); }
    if (color   !== undefined) { updates.push(`color = $${pi++}`);   params.push(color); }
    if (is_done !== undefined) { updates.push(`is_done = $${pi++}`); params.push(is_done); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push(`updated_at = now()`);
    params.push(noteId, ticketId);

    const { rows: [updated] } = await pool.query(
      `UPDATE ticket_notes SET ${updates.join(', ')}
       WHERE id = $${pi++} AND ticket_id = $${pi}
       RETURNING *`,
      params
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/tickets/:ticketId/notes/:noteId
router.delete('/:noteId', async (req, res, next) => {
  try {
    const { ticketId, noteId } = req.params;
    const { rows: [existing] } = await pool.query(
      'SELECT * FROM ticket_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    if (req.user.role !== 'admin') {
      if (existing.created_by === null || existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete your own notes' });
      }
    }

    await pool.query('DELETE FROM ticket_notes WHERE id = $1', [noteId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Register the notes router in app.js**

In `backend/app.js`, after the boards router line:
```js
app.use('/api/v1/tickets/:ticketId/board',  require('./routes/boards'));
```
Add:
```js
app.use('/api/v1/tickets/:ticketId/notes',  require('./routes/notes'));
```

- [ ] **Step 3: Test the endpoints**

```bash
# Create a note
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"content":"Test note","color":"yellow"}' \
  http://localhost:3001/api/v1/tickets/<id>/notes
# Expected: { "id": 1, "content": "Test note", "color": "yellow", "is_done": false, ... }

# Get notes
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/v1/tickets/<id>/notes
# Expected: array with the note above

# Toggle done
curl -X PATCH -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"is_done":true}' \
  http://localhost:3001/api/v1/tickets/<id>/notes/1
# Expected: { "is_done": true, ... }

# Delete
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/v1/tickets/<id>/notes/1
# Expected: { "ok": true }
```

- [ ] **Step 4: Commit**

```bash
git add backend/routes/notes.js backend/app.js
git commit -m "feat: add notes CRUD API for tickets"
```

---

## Task 12: Sticky Notes — Frontend Component

**Files:**
- Create: `frontend/src/components/StickyNotesPanel.jsx`
- Modify: `frontend/src/pages/TicketBoardPage.jsx`

- [ ] **Step 1: Create StickyNotesPanel.jsx**

```jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

const COLORS = [
  { name: 'yellow',     hex: '#fef08a' },
  { name: 'orange',     hex: '#fed7aa' },
  { name: 'pink',       hex: '#f9a8d4' },
  { name: 'teal',       hex: '#99f6e4' },
  { name: 'green',      hex: '#bbf7d0' },
  { name: 'light-pink', hex: '#fecdd3' },
  { name: 'light-blue', hex: '#bae6fd' },
];

function colorHex(name) {
  return COLORS.find(c => c.name === name)?.hex || '#fef08a';
}

export default function StickyNotesPanel({ ticketId }) {
  const qc   = useQueryClient();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const [composing, setComposing]   = useState(false);
  const [draft, setDraft]           = useState('');
  const [draftColor, setDraftColor] = useState('yellow');
  const [editingId, setEditingId]   = useState(null);
  const [editContent, setEditContent] = useState('');

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['ticket-notes', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/notes`).then(r => r.data),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (body) => api.post(`/tickets/${ticketId}/notes`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-notes', ticketId]);
      setDraft(''); setDraftColor('yellow'); setComposing(false);
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to add note'),
  });

  const patchMutation = useMutation({
    mutationFn: ({ noteId, ...body }) => api.patch(`/tickets/${ticketId}/notes/${noteId}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['ticket-notes', ticketId]),
    onError: err => toast.error(err.response?.data?.error || 'Failed to update note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId) => api.delete(`/tickets/${ticketId}/notes/${noteId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['ticket-notes', ticketId]),
    onError: err => toast.error(err.response?.data?.error || 'Failed to delete note'),
  });

  function handleDelete(note) {
    if (window.confirm('Delete this note?')) deleteMutation.mutate(note.id);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function saveEdit(note) {
    patchMutation.mutate({ noteId: note.id, content: editContent, color: note.color });
    setEditingId(null);
  }

  const canModify = (note) => isAdmin || note.created_by === user?.id;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>
          Notes {notes.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{notes.length}</span>}
        </h2>
        {!composing && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '1.1rem', lineHeight: 1, padding: '4px 8px' }}
            onClick={() => setComposing(true)}
          >
            +
          </button>
        )}
      </div>

      {/* Compose area */}
      {composing && (
        <div style={{
          background: colorHex(draftColor),
          borderRadius: '12px',
          padding: '12px',
          marginBottom: '16px',
          border: '2px solid rgba(0,0,0,0.1)',
        }}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a note..."
            rows={3}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              resize: 'vertical', fontFamily: 'var(--font)', fontSize: '0.88rem',
              outline: 'none', color: '#1a1a1a',
            }}
          />
          {/* Color picker */}
          <div style={{ display: 'flex', gap: '6px', margin: '8px 0' }}>
            {COLORS.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => setDraftColor(c.name)}
                style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: c.hex,
                  border: draftColor === c.name ? '2px solid #1a1a1a' : '2px solid transparent',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-sm"
              style={{ background: '#1a1a1a', color: '#fff', border: 'none' }}
              disabled={!draft.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ content: draft, color: draftColor })}
            >
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setComposing(false); setDraft(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}

      {/* Notes grid */}
      {notes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {notes.map(note => (
            <div
              key={note.id}
              style={{
                background: colorHex(note.color),
                borderRadius: '10px',
                padding: '10px 12px',
                border: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {editingId === note.id ? (
                <>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', border: '1px solid rgba(0,0,0,0.2)',
                      borderRadius: '6px', background: 'rgba(255,255,255,0.4)',
                      fontFamily: 'var(--font)', fontSize: '0.84rem',
                      padding: '4px 6px', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: '#1a1a1a', color: '#fff', border: 'none', fontSize: '0.75rem' }}
                      onClick={() => saveEdit(note)}
                    >Save</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{
                    margin: 0, fontSize: '0.84rem', color: '#1a1a1a', flex: 1,
                    textDecoration: note.is_done ? 'line-through' : 'none',
                    opacity: note.is_done ? 0.6 : 1,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {note.content}
                  </p>
                  {canModify(note) && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        onClick={() => patchMutation.mutate({ noteId: note.id, is_done: !note.is_done })}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: note.is_done ? '#1a1a1a' : 'rgba(0,0,0,0.12)',
                          border: 'none', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: note.is_done ? '#fff' : '#1a1a1a',
                          fontSize: '0.75rem',
                        }}
                        title={note.is_done ? 'Mark undone' : 'Mark done'}
                      >✓</button>
                      <button
                        onClick={() => startEdit(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#555', padding: '2px 4px',
                        }}
                        title="Edit"
                      >✎</button>
                      <button
                        onClick={() => handleDelete(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#555', padding: '2px 4px',
                        }}
                        title="Delete"
                      >✕</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !isLoading && !composing && (
        <p style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>No notes yet. Click + to add one.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Insert StickyNotesPanel in TicketBoardPage.jsx**

Find the section in `TicketBoardPage.jsx` where boards are rendered and the `<ActivityLog>` component follows. The structure currently looks like:

```jsx
{/* Boards */}
{boards.map(...)}

{/* Activity Log */}
{ticket && <ActivityLog ticketId={ticketId} />}
```

Add the import at the top:
```jsx
import StickyNotesPanel from '../components/StickyNotesPanel';
```

Insert the panel between boards and activity log:
```jsx
{/* Boards */}
{boards.map(...)}

{/* Sticky Notes */}
{ticket && <StickyNotesPanel ticketId={ticketId} />}

{/* Activity Log */}
{ticket && <ActivityLog ticketId={ticketId} />}
```

- [ ] **Step 3: Verify in browser**

Open any ticket's board page. Between the boards and activity log you should see:
- "Notes" heading with a "+" button
- Clicking "+" shows compose area with color swatches
- Adding a note shows it in a 2-column grid with the chosen color
- ✓ toggles strikethrough; ✎ opens inline edit; ✕ deletes with confirm

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StickyNotesPanel.jsx frontend/src/pages/TicketBoardPage.jsx
git commit -m "feat: add sticky notes panel to ticket board page"
```

---

## Task 13: Activity Log Display Fixes

**Files:**
- Modify: `frontend/src/pages/TicketBoardPage.jsx:29-37` (`activityLabel` function)

- [ ] **Step 1: Update activityLabel to handle new event type and fix fallback**

Replace the `activityLabel` function (around line 29):
```js
function activityLabel(entry) {
  const old_ = entry.old_value || '—';
  const new_ = entry.new_value || '—';
  switch (entry.field_name) {
    case 'created':
      return 'Ticket created';
    case 'board_column':
      return `Moved: ${old_} → ${new_}`;
    case 'board_entry_added':
      return `Added entry to "${old_}" · Status: ${new_}`;
    case 'phase':
      return `Phase: ${old_} → ${new_}`;
    default:
      return `${entry.field_name.replace(/_/g, ' ')}: ${old_} → ${new_}`;
  }
}
```

- [ ] **Step 2: Update the icon map in the activity log render**

Find the icon logic in the `ActivityLog` component (around line 173):
```jsx
{entry.field_name === 'created'      ? '✦'
 : entry.field_name === 'board_column' ? '→'
 : entry.field_name === 'phase'        ? '◉'
 : '✎'}
```
Replace with:
```jsx
{entry.field_name === 'created'           ? '✦'
 : entry.field_name === 'board_column'    ? '→'
 : entry.field_name === 'board_entry_added' ? '＋'
 : entry.field_name === 'phase'           ? '◉'
 : '✎'}
```

Also update the background color condition just above it:
```jsx
background: entry.field_name === 'created'
  ? 'rgba(34,197,94,0.15)'
  : entry.field_name === 'board_column' || entry.field_name === 'phase' || entry.field_name === 'board_entry_added'
  ? 'rgba(59,130,246,0.15)'
  : 'rgba(156,163,175,0.15)',
```

- [ ] **Step 3: Verify in browser**

Move an entry on the board — log should show `Moved: Column A → Column B` (no more `?`).
Add an entry — log should show `Added entry to "Column Name" · Status: Active`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TicketBoardPage.jsx
git commit -m "feat: update activity log display for new event types and fix fallback"
```

---

## Final Verification

- [ ] Log in as **non-admin**: Add New Entry — Task Owner field is hidden, status dropdown excludes the default status, ticket saves with your user as owner and default status.
- [ ] Log in as **admin**: Add New Entry — Task Owner dropdown visible, all statuses including default are shown.
- [ ] **Board config save**: Save a board config, create an entry, save config again — move the entry — activity log shows correct column names (not `?`).
- [ ] **Mini-card**: Configure card display fields for a column in admin, open the board — cards show the configured fields.
- [ ] **Sticky notes**: Add, edit, toggle done, delete a note on a ticket board page. Confirm notes persist on reload.
- [ ] **Default status**: Set one status as default in admin. Open Add New Entry — status field is pre-cleared of the default, and the created ticket has the default status.
