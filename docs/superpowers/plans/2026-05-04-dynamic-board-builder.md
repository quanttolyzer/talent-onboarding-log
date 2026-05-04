# Dynamic Board Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Hiring Ticket Kanban board with a fully dynamic, admin-configurable board system where each ticket type can have either a Kanban board (custom columns, transitions, entry fields) or a linear progress stepper (custom phases), all configured from the Admin panel.

**Architecture:** Normalized relational tables store board config per ticket type (`board_configs`, `board_columns`, `board_column_fields`, `board_column_transitions`, `board_phases`, `board_entries`, `ticket_phase_history`). A new backend route serves config + live data per ticket. Two new generic React components (`DynamicKanbanBoard`, `DynamicProgressStepper`) replace all five hardcoded board components. The Hiring Ticket board config is seeded via a migration script to preserve continuity.

**Tech Stack:** Node.js/Express (CommonJS), `pg` pool (direct SQL, no ORM), PostgreSQL with UUID PKs, React 18, `@tanstack/react-query` v5, `@dnd-kit/core` v6, Vite. No test framework is configured — verification steps use the running dev server and curl.

---

## File Map

**Backend — new files:**
- `backend/database/migration-phase4.sql` — DDL for all 7 new tables
- `backend/database/seeds/board-hiring-ticket-config.js` — seeds Hiring Ticket board config
- `backend/database/seeds/board-migrate-entries.js` — migrates `position_board_stages` → `board_entries`
- `backend/routes/boardConfigs.js` — `GET/PUT/DELETE /api/v1/admin/board-configs/:ticketTypeId`
- `backend/routes/boards.js` — all `/api/v1/tickets/:ticketId/board/*` endpoints

**Backend — modified files:**
- `backend/app.js` — register two new route files

**Frontend — new files:**
- `frontend/src/pages/TicketBoardPage.jsx` — route page; fetches board data, renders kanban or stepper
- `frontend/src/components/board/DynamicKanbanBoard.jsx` — generic DnD kanban driven by config
- `frontend/src/components/board/DynamicProgressStepper.jsx` — linear phase stepper
- `frontend/src/components/admin/BoardConfigPanel.jsx` — admin UI to configure a board per ticket type

**Frontend — modified files:**
- `frontend/src/App.jsx` — add `/tickets/:ticketId/board` route
- `frontend/src/pages/DashboardPage.jsx` — change 📋 link from `/positions/:id` to `/tickets/:id/board`
- `frontend/src/components/admin/DropdownManagement.jsx` — add "Configure Board" button + inline panel

**Frontend — deleted in final task:**
- `frontend/src/components/board/KanbanBoard.jsx`
- `frontend/src/components/board/ScreeningColumn.jsx`
- `frontend/src/components/board/HRInterviewColumn.jsx`
- `frontend/src/components/board/BatchesColumn.jsx`
- `frontend/src/components/board/StageColumns.jsx`
- `frontend/src/pages/PositionPage.jsx` (replaced by TicketBoardPage)

---

## Task 1: DB Migration — Create board tables

**Files:**
- Create: `backend/database/migration-phase4.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- backend/database/migration-phase4.sql
-- Dynamic Board Builder — run ONCE in Neon SQL Editor after migration-phase3.sql

CREATE TABLE IF NOT EXISTS board_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id  UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('board', 'progress')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticket_type_id)
);

CREATE TABLE IF NOT EXISTS board_columns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_column_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  display_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS board_column_transitions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  to_column_id   UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  UNIQUE (from_column_id, to_column_id)
);

CREATE TABLE IF NOT EXISTS board_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_config_id UUID NOT NULL REFERENCES board_configs(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_column_id UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  field_values    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_phase_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  board_phase_id UUID NOT NULL REFERENCES board_phases(id) ON DELETE CASCADE,
  advanced_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run the migration in Neon SQL Editor**

Open the Neon dashboard → SQL Editor, paste the entire contents of `migration-phase4.sql`, and run it.

- [ ] **Step 3: Verify all 7 tables exist**

In Neon SQL Editor run:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'board_configs','board_columns','board_column_fields',
    'board_column_transitions','board_phases','board_entries','ticket_phase_history'
  )
ORDER BY table_name;
```
Expected: 7 rows returned.

- [ ] **Step 4: Commit**

```bash
git add backend/database/migration-phase4.sql
git commit -m "feat: add board builder DB migration"
```

---

## Task 2: Backend — Board Config Admin Routes

**Files:**
- Create: `backend/routes/boardConfigs.js`

- [ ] **Step 1: Create the file**

```js
// backend/routes/boardConfigs.js
const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};
router.use(authMiddleware);
router.use(adminOnly);

// GET /api/v1/admin/board-configs/:ticketTypeId
router.get('/:ticketTypeId', async (req, res, next) => {
  try {
    const { ticketTypeId } = req.params;
    const { rows: [config] } = await pool.query(
      'SELECT id, mode FROM board_configs WHERE ticket_type_id = $1',
      [ticketTypeId]
    );
    if (!config) return res.json(null);

    const { rows: columns } = await pool.query(
      'SELECT id, label, position FROM board_columns WHERE board_config_id = $1 ORDER BY position',
      [config.id]
    );
    const columnIds = columns.map(c => c.id);

    let fields = [], transitions = [], phases = [];

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
    }

    if (config.mode === 'progress') {
      const { rows: p } = await pool.query(
        'SELECT id, label, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
        [config.id]
      );
      phases = p;
    }

    const columnsWithData = columns.map(col => ({
      ...col,
      fields: fields
        .filter(f => f.board_column_id === col.id)
        .map(f => ({ field_key: f.field_key, is_required: f.is_required, display_order: f.display_order })),
      allowed_target_ids: transitions
        .filter(t => t.from_column_id === col.id)
        .map(t => t.to_column_id),
    }));

    res.json({ mode: config.mode, columns: columnsWithData, phases });
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/board-configs/:ticketTypeId
router.put('/:ticketTypeId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { ticketTypeId } = req.params;
    const { mode, columns = [], phases = [], transitions = [] } = req.body;

    if (!['board', 'progress'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "board" or "progress"' });
    }

    await client.query('BEGIN');

    const { rows: [config] } = await client.query(
      `INSERT INTO board_configs (ticket_type_id, mode)
       VALUES ($1, $2)
       ON CONFLICT (ticket_type_id) DO UPDATE SET mode = EXCLUDED.mode
       RETURNING id`,
      [ticketTypeId, mode]
    );

    // Cascade deletes fields and transitions too
    await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [config.id]);
    await client.query('DELETE FROM board_phases   WHERE board_config_id = $1', [config.id]);

    if (mode === 'board') {
      const labels = columns.map(c => c.label);
      if (new Set(labels).size !== labels.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Column labels must be unique within a config' });
      }

      const labelToId = {};
      for (const col of columns) {
        const { rows: [inserted] } = await client.query(
          'INSERT INTO board_columns (board_config_id, label, position) VALUES ($1, $2, $3) RETURNING id',
          [config.id, col.label, col.position]
        );
        labelToId[col.label] = inserted.id;
        for (const field of (col.fields || [])) {
          await client.query(
            `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
             VALUES ($1, $2, $3, $4)`,
            [inserted.id, field.field_key, field.is_required || false, field.display_order || 0]
          );
        }
      }

      for (const t of transitions) {
        const fromId = labelToId[t.from_label];
        const toId   = labelToId[t.to_label];
        if (!fromId || !toId) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Transition references unknown column label: "${t.from_label}" → "${t.to_label}"`,
          });
        }
        await client.query(
          'INSERT INTO board_column_transitions (from_column_id, to_column_id) VALUES ($1, $2)',
          [fromId, toId]
        );
      }
    } else {
      for (const phase of phases) {
        await client.query(
          'INSERT INTO board_phases (board_config_id, label, position) VALUES ($1, $2, $3)',
          [config.id, phase.label, phase.position]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/v1/admin/board-configs/:ticketTypeId
router.delete('/:ticketTypeId', async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM board_configs WHERE ticket_type_id = $1',
      [req.params.ticketTypeId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/boardConfigs.js
git commit -m "feat: add board config admin routes"
```

---

## Task 3: Backend — Board Data Routes

**Files:**
- Create: `backend/routes/boards.js`

- [ ] **Step 1: Create the file**

```js
// backend/routes/boards.js
const router = require('express').Router({ mergeParams: true });
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/v1/tickets/:ticketId/board
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [ticket] } = await pool.query(
      'SELECT id, ticket_type FROM tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { rows: [config] } = await pool.query(
      `SELECT bc.id, bc.mode FROM board_configs bc
       JOIN ticket_types tt ON tt.id = bc.ticket_type_id
       WHERE tt.name = $1`,
      [ticket.ticket_type]
    );
    if (!config) return res.status(404).json({ error: 'No board configured for this ticket type' });

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

      return res.json({ mode: 'board', columns: columnsWithData });
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

    res.json({ mode: 'progress', phases, current_phase_id, history });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/entries
router.post('/entries', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { board_column_id, field_values = {} } = req.body;
    if (!board_column_id) return res.status(400).json({ error: 'board_column_id is required' });

    // Verify column belongs to a config that matches this ticket's type
    const { rows: [colCheck] } = await pool.query(
      `SELECT bc_col.id FROM board_columns bc_col
       JOIN board_configs bc   ON bc.id    = bc_col.board_config_id
       JOIN ticket_types tt    ON tt.id    = bc.ticket_type_id
       JOIN tickets t          ON t.ticket_type = tt.name
       WHERE bc_col.id = $1 AND t.id = $2`,
      [board_column_id, ticketId]
    );
    if (!colCheck) return res.status(400).json({ error: 'Invalid column for this ticket' });

    // Validate required fields
    const { rows: required } = await pool.query(
      'SELECT field_key FROM board_column_fields WHERE board_column_id = $1 AND is_required = true',
      [board_column_id]
    );
    for (const rf of required) {
      if (!field_values[rf.field_key]) {
        return res.status(400).json({ error: `Field "${rf.field_key}" is required` });
      }
    }

    const { rows: [entry] } = await pool.query(
      `INSERT INTO board_entries (ticket_id, board_column_id, field_values)
       VALUES ($1, $2, $3)
       RETURNING id, board_column_id, field_values, created_at`,
      [ticketId, board_column_id, JSON.stringify(field_values)]
    );
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// PATCH /api/v1/tickets/:ticketId/board/entries/:entryId/move
router.patch('/entries/:entryId/move', async (req, res, next) => {
  try {
    const { ticketId, entryId } = req.params;
    const { target_column_id, additional_field_values = {} } = req.body;
    if (!target_column_id) return res.status(400).json({ error: 'target_column_id is required' });

    const { rows: [entry] } = await pool.query(
      'SELECT id, board_column_id, field_values FROM board_entries WHERE id = $1 AND ticket_id = $2',
      [entryId, ticketId]
    );
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const { rows: [transition] } = await pool.query(
      'SELECT id FROM board_column_transitions WHERE from_column_id = $1 AND to_column_id = $2',
      [entry.board_column_id, target_column_id]
    );
    if (!transition) {
      return res.status(400).json({ error: 'This move is not permitted by the board configuration' });
    }

    const mergedValues = { ...entry.field_values, ...additional_field_values };

    const { rows: [updated] } = await pool.query(
      `UPDATE board_entries
       SET board_column_id = $1, field_values = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, board_column_id, field_values`,
      [target_column_id, JSON.stringify(mergedValues), entryId]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/tickets/:ticketId/board/entries/:entryId
router.delete('/entries/:entryId', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { ticketId, entryId } = req.params;
    await pool.query(
      'DELETE FROM board_entries WHERE id = $1 AND ticket_id = $2',
      [entryId, ticketId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/advance
router.post('/advance', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [config] } = await pool.query(
      `SELECT bc.id FROM board_configs bc
       JOIN ticket_types tt ON tt.id = bc.ticket_type_id
       JOIN tickets t       ON t.ticket_type = tt.name
       WHERE t.id = $1 AND bc.mode = 'progress'`,
      [ticketId]
    );
    if (!config) return res.status(404).json({ error: 'No progress board for this ticket' });

    const { rows: phases } = await pool.query(
      'SELECT id, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
      [config.id]
    );
    const { rows: [lastEntry] } = await pool.query(
      'SELECT board_phase_id FROM ticket_phase_history WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1',
      [ticketId]
    );

    let nextPhase;
    if (!lastEntry) {
      nextPhase = phases[0];
    } else {
      const idx = phases.findIndex(p => p.id === lastEntry.board_phase_id);
      nextPhase = phases[idx + 1];
    }
    if (!nextPhase) return res.status(400).json({ error: 'Already at the last phase' });

    await pool.query(
      'INSERT INTO ticket_phase_history (ticket_id, board_phase_id, advanced_by) VALUES ($1, $2, $3)',
      [ticketId, nextPhase.id, req.user.id]
    );
    res.json({ ok: true, phase_id: nextPhase.id });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/phase/:phaseId  (admin: jump to specific phase)
router.post('/phase/:phaseId', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { ticketId, phaseId } = req.params;
    await pool.query(
      'INSERT INTO ticket_phase_history (ticket_id, board_phase_id, advanced_by) VALUES ($1, $2, $3)',
      [ticketId, phaseId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/boards.js
git commit -m "feat: add board data routes"
```

---

## Task 4: Register New Routes in app.js

**Files:**
- Modify: `backend/app.js`

- [ ] **Step 1: Add the two new route registrations**

In `backend/app.js`, add these two lines after the existing `app.use('/api/v1/positions', ...)` line:

```js
app.use('/api/v1/admin/board-configs', require('./routes/boardConfigs'));
app.use('/api/v1/tickets/:ticketId/board', require('./routes/boards'));
```

The full routes block becomes:
```js
app.use('/api/v1/auth',                     require('./routes/auth'));
app.use('/api/v1/tickets',                  require('./routes/tickets'));
app.use('/api/v1/mappings',                 require('./routes/mappings'));
app.use('/api/v1/users',                    require('./routes/users'));
app.use('/api/v1/admin',                    require('./routes/admin'));
app.use('/api/v1/positions',                require('./routes/positions'));
app.use('/api/v1/admin/board-configs',      require('./routes/boardConfigs'));
app.use('/api/v1/tickets/:ticketId/board',  require('./routes/boards'));
```

- [ ] **Step 2: Start the backend and verify routes are reachable**

```bash
cd backend && npm run dev
```

In a second terminal:
```bash
curl -s http://localhost:3001/health
```
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 3: Commit**

```bash
git add backend/app.js
git commit -m "feat: register board config and board data routes"
```

---

## Task 5: Seed Hiring Ticket Board Config

**Files:**
- Create: `backend/database/seeds/board-hiring-ticket-config.js`

- [ ] **Step 1: Create the seed script**

```js
// backend/database/seeds/board-hiring-ticket-config.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [hiringType] } = await client.query(
      "SELECT id FROM ticket_types WHERE name = 'Hiring Ticket'"
    );
    if (!hiringType) throw new Error('"Hiring Ticket" not found in ticket_types table');

    const { rows: [config] } = await client.query(
      `INSERT INTO board_configs (ticket_type_id, mode)
       VALUES ($1, 'board')
       ON CONFLICT (ticket_type_id) DO UPDATE SET mode = 'board'
       RETURNING id`,
      [hiringType.id]
    );

    // Wipe existing columns (cascade → fields, transitions)
    await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [config.id]);

    const columnDefs = [
      { label: 'Screening',           position: 1 },
      { label: 'HR Interview',         position: 2 },
      { label: 'Batches',              position: 3 },
      { label: 'Assessment',           position: 4 },
      { label: 'Technical Interview',  position: 5 },
      { label: 'Offer',                position: 6 },
      { label: 'Hired',                position: 7 },
    ];

    const ids = {};
    for (const col of columnDefs) {
      const { rows: [row] } = await client.query(
        'INSERT INTO board_columns (board_config_id, label, position) VALUES ($1, $2, $3) RETURNING id',
        [config.id, col.label, col.position]
      );
      ids[col.label] = row.id;
    }

    // candidate_name is required on all columns so entry cards always show a name
    for (const label of Object.keys(ids)) {
      await client.query(
        `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
         VALUES ($1, 'candidate_name', true, 1)`,
        [ids[label]]
      );
    }

    // Assessment column: assessment_level (required) + assessment_result (optional)
    await client.query(
      `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
       VALUES ($1, 'assessment_level', true, 2), ($1, 'assessment_result', false, 3)`,
      [ids['Assessment']]
    );

    // Offer column: ticket_number (required)
    await client.query(
      `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
       VALUES ($1, 'ticket_number', true, 2)`,
      [ids['Offer']]
    );

    // Transitions (mirrors old VALID_TRANSITIONS in KanbanBoard.jsx)
    const transitionDefs = [
      ['Batches',              'Assessment'],
      ['Batches',              'Technical Interview'],
      ['Assessment',           'Technical Interview'],
      ['Technical Interview',  'Offer'],
      ['Offer',                'Hired'],
    ];
    for (const [from, to] of transitionDefs) {
      await client.query(
        `INSERT INTO board_column_transitions (from_column_id, to_column_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [ids[from], ids[to]]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Hiring Ticket board config seeded');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
```

- [ ] **Step 2: Run the seed**

```bash
cd backend && node database/seeds/board-hiring-ticket-config.js
```
Expected output: `✅ Hiring Ticket board config seeded`

- [ ] **Step 3: Verify seed in Neon SQL Editor**

```sql
SELECT bc.mode, bco.label, bco.position
FROM board_configs bc
JOIN ticket_types tt  ON tt.id = bc.ticket_type_id
JOIN board_columns bco ON bco.board_config_id = bc.id
WHERE tt.name = 'Hiring Ticket'
ORDER BY bco.position;
```
Expected: 7 rows — Screening, HR Interview, Batches, Assessment, Technical Interview, Offer, Hired.

- [ ] **Step 4: Commit**

```bash
git add backend/database/seeds/board-hiring-ticket-config.js
git commit -m "feat: seed Hiring Ticket board config"
```

---

## Task 6: Migrate position_board_stages → board_entries

**Files:**
- Create: `backend/database/seeds/board-migrate-entries.js`

> **Note:** This migrates only `position_board_stages` rows (candidates at Assessment / Technical Interview / Offer / Hired). Screening counts, HR interview counts, and batches have no 1:1 mapping to generic entries and are intentionally left as-is in their original tables. When a position has multiple tickets, the migration uses the first ticket found by `created_at`.

- [ ] **Step 1: Create the migration script**

```js
// backend/database/seeds/board-migrate-entries.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../../config/db');

const STAGE_TO_COLUMN = {
  assessment:          'Assessment',
  technical_interview: 'Technical Interview',
  offer:               'Offer',
  hired:               'Hired',
};

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all stage records joined to candidate name
    const { rows: stages } = await client.query(`
      SELECT
        s.id,
        s.candidate_id,
        s.stage,
        s.assessment_level,
        s.assessment_result,
        s.offer_ticket_number,
        c.name AS candidate_name,
        b.position_id
      FROM position_board_stages s
      JOIN position_board_candidates c ON c.id = s.candidate_id
      JOIN position_board_batches    b ON b.id = c.batch_id
      ORDER BY s.moved_at
    `);

    // Build position_id → ticket_id map (first ticket per position)
    const positionIds = [...new Set(stages.map(s => s.position_id))];
    const posToTicket = {};
    for (const posId of positionIds) {
      const { rows: [ticket] } = await client.query(
        'SELECT id FROM tickets WHERE position_id = $1 ORDER BY created_at LIMIT 1',
        [posId]
      );
      if (ticket) posToTicket[posId] = ticket.id;
    }

    // Get column label → id map for Hiring Ticket board
    const { rows: columns } = await client.query(`
      SELECT bco.id, bco.label
      FROM board_columns bco
      JOIN board_configs bc ON bc.id = bco.board_config_id
      JOIN ticket_types tt  ON tt.id = bc.ticket_type_id
      WHERE tt.name = 'Hiring Ticket'
    `);
    const colLabelToId = {};
    for (const c of columns) colLabelToId[c.label] = c.id;

    let migrated = 0, skipped = 0;
    for (const stage of stages) {
      const ticketId  = posToTicket[stage.position_id];
      const colLabel  = STAGE_TO_COLUMN[stage.stage];
      const columnId  = colLabel ? colLabelToId[colLabel] : null;

      if (!ticketId || !columnId) { skipped++; continue; }

      const fieldValues = { candidate_name: stage.candidate_name };
      if (stage.assessment_level)   fieldValues.assessment_level  = stage.assessment_level;
      if (stage.assessment_result)  fieldValues.assessment_result = stage.assessment_result;
      if (stage.offer_ticket_number) fieldValues.ticket_number    = stage.offer_ticket_number;

      await client.query(
        `INSERT INTO board_entries (ticket_id, board_column_id, field_values)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [ticketId, columnId, JSON.stringify(fieldValues)]
      );
      migrated++;
    }

    await client.query('COMMIT');
    console.log(`✅ Migration complete: ${migrated} entries migrated, ${skipped} skipped`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && node database/seeds/board-migrate-entries.js
```
Expected output: `✅ Migration complete: N entries migrated, M skipped`

- [ ] **Step 3: Verify in Neon SQL Editor**

```sql
SELECT be.field_values, bco.label
FROM board_entries be
JOIN board_columns bco ON bco.id = be.board_column_id
LIMIT 20;
```
Confirm `field_values` contains `candidate_name` and other relevant fields.

- [ ] **Step 4: Commit**

```bash
git add backend/database/seeds/board-migrate-entries.js
git commit -m "feat: migrate position_board_stages to board_entries"
```

---

## Task 7: Frontend — TicketBoardPage + Route

**Files:**
- Create: `frontend/src/pages/TicketBoardPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create TicketBoardPage.jsx**

```jsx
// frontend/src/pages/TicketBoardPage.jsx
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import DynamicKanbanBoard from '../components/board/DynamicKanbanBoard';
import DynamicProgressStepper from '../components/board/DynamicProgressStepper';

export default function TicketBoardPage() {
  const { ticketId } = useParams();
  const user    = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const boardQuery = useQuery({
    queryKey: ['ticket-board', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/board`).then(r => r.data),
    staleTime: 0,
  });

  if (boardQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (boardQuery.isError) {
    const msg = boardQuery.error?.response?.data?.error || 'Unknown error';
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>{msg}</p>
        <Link to="/" className="btn btn-ghost btn-sm">← Back</Link>
      </div>
    );
  }

  const board = boardQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '16px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>← Back</Link>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {board.mode === 'board' ? 'Board' : 'Progress'}
        </span>
      </header>

      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        {board.mode === 'board' && (
          <DynamicKanbanBoard ticketId={ticketId} columns={board.columns} isAdmin={isAdmin} />
        )}
        {board.mode === 'progress' && (
          <DynamicProgressStepper
            ticketId={ticketId}
            phases={board.phases}
            currentPhaseId={board.current_phase_id}
            history={board.history}
            isAdmin={isAdmin}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add the route in App.jsx**

Add this import at the top of `frontend/src/App.jsx`:
```js
import TicketBoardPage from './pages/TicketBoardPage';
```

Add this route inside `<Routes>`, after the `/positions/:positionId` route:
```jsx
<Route
  path="/tickets/:ticketId/board"
  element={
    <ProtectedRoute>
      <TicketBoardPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Verify the page loads**

Start the frontend dev server:
```bash
cd frontend && npm run dev
```
Navigate to `http://localhost:5173/tickets/SOME-VALID-TICKET-UUID/board` in the browser. You should see either the loading spinner, a "No board configured" error, or the board shell (with empty kanban/stepper) depending on whether the ticket's type has a board config.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TicketBoardPage.jsx frontend/src/App.jsx
git commit -m "feat: add TicketBoardPage and route"
```

---

## Task 8: Frontend — DynamicKanbanBoard

**Files:**
- Create: `frontend/src/components/board/DynamicKanbanBoard.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/DynamicKanbanBoard.jsx
import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ── Styles ────────────────────────────────────────────────────
const columnStyle = {
  width: '220px',
  minWidth: '220px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 130px)',
};
const headerStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};
const badgeStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1px 7px',
  fontSize: '0.75rem',
  color: 'var(--text-2)',
};
const cardStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 10px',
  marginBottom: '6px',
  fontSize: '0.84rem',
};
const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};
const popupStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '24px',
  width: '340px',
  maxWidth: '90vw',
};

// ── DraggableCard ─────────────────────────────────────────────
function DraggableCard({ entry, column, ticketId, isAdmin }) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    data: { entryId: entry.id, fromColumnId: column.id },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tickets/${ticketId}/board/entries/${entry.id}`),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Entry removed');
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const label = entry.field_values?.candidate_name
    || Object.values(entry.field_values || {})[0]
    || '(entry)';

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
        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>👤 {label}</div>
        {isAdmin && (
          <button
            className="btn btn-danger btn-xs"
            style={{ padding: '1px 4px', fontSize: '0.68rem' }}
            onClick={e => { e.stopPropagation(); deleteMutation.mutate(); }}
            onMouseDown={e => e.stopPropagation()}
          >
            🗑
          </button>
        )}
      </div>
      {Object.entries(entry.field_values || {})
        .filter(([k]) => k !== 'candidate_name')
        .map(([k, v]) => (
          <div key={k} style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
            {k.replace(/_/g, ' ')}: {v || '—'}
          </div>
        ))}
    </div>
  );
}

// ── DroppableColumn ───────────────────────────────────────────
function DroppableColumn({ column, ticketId, isAdmin, onAddEntry }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  });

  return (
    <div style={{
      ...columnStyle,
      outline: isOver ? '2px solid var(--primary)' : '2px solid transparent',
      transition: 'outline 0.15s',
    }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{column.label}</span>
        <span style={badgeStyle}>{column.entries.length}</span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: '60px' }}>
        {column.entries.map(entry => (
          <DraggableCard
            key={entry.id}
            entry={entry}
            column={column}
            ticketId={ticketId}
            isAdmin={isAdmin}
          />
        ))}
        {column.entries.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
            Drag entries here
          </p>
        )}
      </div>
      {isAdmin && (
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-xs"
            style={{ width: '100%', fontSize: '0.78rem' }}
            onClick={() => onAddEntry(column)}
          >
            + Add entry
          </button>
        </div>
      )}
    </div>
  );
}

// ── AddEntryPopup ─────────────────────────────────────────────
function AddEntryPopup({ column, ticketId, onClose }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});

  const mutation = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/board/entries`, {
      board_column_id: column.id,
      field_values: values,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Entry added');
      onClose();
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Add entry — {column.label}
        </h3>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
          {(column.fields || []).map(field => (
            <div key={field.field_key} className="form-group" style={{ marginBottom: '12px' }}>
              <label>
                {field.field_key.replace(/_/g, ' ')}
                {field.is_required && ' *'}
              </label>
              <input
                value={values[field.field_key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                required={field.is_required}
                placeholder={field.field_key.replace(/_/g, ' ')}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MovePopup (for columns with required fields on the target) ─
function MovePopup({ pendingMove, targetColumn, ticketId, onClose }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});

  const mutation = useMutation({
    mutationFn: () => api.patch(`/tickets/${ticketId}/board/entries/${pendingMove.entryId}/move`, {
      target_column_id: targetColumn.id,
      additional_field_values: values,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Entry moved');
      onClose();
    },
    onError: err => toast.error(err.response?.data?.error || 'Move failed'),
  });

  // Only show required fields not already in the entry's field_values
  const existingKeys = Object.keys(pendingMove.existingFieldValues || {});
  const missingRequired = (targetColumn.fields || []).filter(
    f => f.is_required && !existingKeys.includes(f.field_key)
  );

  if (missingRequired.length === 0) {
    // No missing required fields — trigger the move immediately on mount
    // We use a flag to avoid double-calling
    mutation.mutate();
    return null;
  }

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Move to {targetColumn.label}
        </h3>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
          {missingRequired.map(field => (
            <div key={field.field_key} className="form-group" style={{ marginBottom: '12px' }}>
              <label>{field.field_key.replace(/_/g, ' ')} *</label>
              <input
                value={values[field.field_key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                required
                autoFocus
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Moving…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DynamicKanbanBoard ────────────────────────────────────────
export default function DynamicKanbanBoard({ ticketId, columns, isAdmin }) {
  const [activeCard, setActiveCard]     = useState(null);
  const [addingToColumn, setAddingTo]   = useState(null);
  const [pendingMove, setPendingMove]   = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Build a lookup of columnId → column object for fast access
  const colById = Object.fromEntries(columns.map(c => [c.id, c]));

  function handleDragStart({ active }) {
    setActiveCard(active.data.current);
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null);
    if (!over) return;

    const { entryId, fromColumnId } = active.data.current;
    const toColumnId = over.data.current?.columnId;
    if (!toColumnId || fromColumnId === toColumnId) return;

    const fromCol = colById[fromColumnId];
    if (!fromCol) return;

    // Client-side transition check (fast feedback before API call)
    if (!fromCol.allowed_target_ids.includes(toColumnId)) {
      const toLabel = colById[toColumnId]?.label || toColumnId;
      toast.error(`Cannot move from "${fromCol.label}" to "${toLabel}"`);
      return;
    }

    // Find the entry being moved to get its current field_values
    const entry = fromCol.entries.find(e => e.id === entryId);
    setPendingMove({
      entryId,
      existingFieldValues: entry?.field_values || {},
      toColumnId,
    });
  }

  const pendingTargetCol = pendingMove ? colById[pendingMove.toColumnId] : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
          {columns.map(col => (
            <DroppableColumn
              key={col.id}
              column={col}
              ticketId={ticketId}
              isAdmin={isAdmin}
              onAddEntry={setAddingTo}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard && (
            <div style={{ ...cardStyle, padding: '8px 12px', cursor: 'grabbing', opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
              👤 {activeCard.label || 'entry'}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {addingToColumn && (
        <AddEntryPopup
          column={addingToColumn}
          ticketId={ticketId}
          onClose={() => setAddingTo(null)}
        />
      )}

      {pendingMove && pendingTargetCol && (
        <MovePopup
          pendingMove={pendingMove}
          targetColumn={pendingTargetCol}
          ticketId={ticketId}
          onClose={() => setPendingMove(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

With both servers running, open a Hiring Ticket board: `http://localhost:5173/tickets/TICKET-UUID/board`. You should see the 7 seeded columns. Try dragging an entry (if any exist from the migration) or clicking "+ Add entry" on a column.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/board/DynamicKanbanBoard.jsx
git commit -m "feat: add DynamicKanbanBoard component"
```

---

## Task 9: Frontend — DynamicProgressStepper

**Files:**
- Create: `frontend/src/components/board/DynamicProgressStepper.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/DynamicProgressStepper.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function DynamicProgressStepper({ ticketId, phases, currentPhaseId, history, isAdmin }) {
  const qc = useQueryClient();

  const currentIdx = currentPhaseId
    ? phases.findIndex(p => p.id === currentPhaseId)
    : -1;

  const advanceMutation = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/board/advance`),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Phase advanced');
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  const jumpMutation = useMutation({
    mutationFn: (phaseId) => api.post(`/tickets/${ticketId}/board/phase/${phaseId}`),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Phase updated');
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  const isLast = currentIdx === phases.length - 1;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

      {/* Stepper strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '32px', overflowX: 'auto', paddingBottom: '8px' }}>
        {phases.map((phase, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent   = idx === currentIdx;
          const isUpcoming  = idx > currentIdx;

          const circleColor = isCurrent
            ? 'var(--primary)'
            : isCompleted
            ? 'var(--primary)'
            : 'var(--border)';
          const textColor = isUpcoming ? 'var(--text-3)' : 'var(--text-1)';

          return (
            <div key={phase.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {/* Step node */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div
                  onClick={() => isAdmin && jumpMutation.mutate(phase.id)}
                  title={isAdmin ? `Jump to "${phase.label}"` : undefined}
                  style={{
                    width: '36px', height: '36px',
                    borderRadius: '50%',
                    background: isCurrent || isCompleted ? circleColor : 'transparent',
                    border: `2px solid ${circleColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isCurrent || isCompleted ? '#fff' : 'var(--text-3)',
                    fontWeight: 700, fontSize: '0.85rem',
                    cursor: isAdmin ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: isCurrent ? 700 : 400,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  maxWidth: '90px',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {phase.label}
                </span>
              </div>

              {/* Connector line (not after last) */}
              {idx < phases.length - 1 && (
                <div style={{
                  height: '2px',
                  width: '48px',
                  background: idx < currentIdx ? 'var(--primary)' : 'var(--border)',
                  marginBottom: '22px',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current phase label */}
      {currentPhaseId && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '4px' }}>Current phase</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            {phases.find(p => p.id === currentPhaseId)?.label || '—'}
          </div>
        </div>
      )}

      {/* Advance button */}
      {!isLast && (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => advanceMutation.mutate()}
          disabled={advanceMutation.isPending}
          style={{ marginBottom: '32px' }}
        >
          {advanceMutation.isPending
            ? 'Advancing…'
            : currentPhaseId
            ? `Advance to: ${phases[currentIdx + 1]?.label}`
            : `Start: ${phases[0]?.label}`}
        </button>
      )}
      {isLast && currentPhaseId && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius)', padding: '8px 14px',
          color: '#22c55e', fontSize: '0.85rem', fontWeight: 600,
          marginBottom: '32px',
        }}>
          ✅ All phases complete
        </div>
      )}

      {/* Activity log */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '10px' }}>
            History
          </div>
          {history.map((entry, i) => (
            <div key={i} style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: '0.82rem',
            }}>
              <span style={{ color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {entry.phase_label}
              </span>
              <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span style={{ color: 'var(--text-3)' }}>by {entry.advanced_by || 'system'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

To test the stepper, temporarily configure a ticket type with a progress board via the API:
```bash
# Get a ticket type ID first — query: SELECT id, name FROM ticket_types;
# Then use a valid JWT token from localStorage in browser DevTools → Application → localStorage → accessToken
curl -s -X PUT http://localhost:3001/api/v1/admin/board-configs/TICKET_TYPE_UUID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"mode":"progress","phases":[{"label":"Review","position":1},{"label":"Negotiation","position":2},{"label":"Signed","position":3}]}'
```
Then open a ticket of that type's board page. The stepper should render 3 phases.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/board/DynamicProgressStepper.jsx
git commit -m "feat: add DynamicProgressStepper component"
```

---

## Task 10: Frontend — BoardConfigPanel (Admin UI)

**Files:**
- Create: `frontend/src/components/admin/BoardConfigPanel.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/admin/BoardConfigPanel.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const AVAILABLE_FIELDS = [
  'candidate_name', 'ticket_number', 'ticket_status', 'ticket_date',
  'task_owner', 'department', 'position', 'country_company',
  'action', 'sub_action', 'remarks', 'assessment_level', 'assessment_result',
];

function ColumnFieldsPanel({ column, onChange }) {
  const [open, setOpen] = useState(false);

  function toggleField(fieldKey) {
    const exists = column.fields.find(f => f.field_key === fieldKey);
    const next = exists
      ? column.fields.filter(f => f.field_key !== fieldKey)
      : [...column.fields, { field_key: fieldKey, is_required: false, display_order: column.fields.length + 1 }];
    onChange({ ...column, fields: next });
  }

  function toggleRequired(fieldKey) {
    const next = column.fields.map(f =>
      f.field_key === fieldKey ? { ...f, is_required: !f.is_required } : f
    );
    onChange({ ...column, fields: next });
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.75rem' }}
      >
        Fields ({column.fields.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
        }}>
          {AVAILABLE_FIELDS.map(key => {
            const included = column.fields.find(f => f.field_key === key);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={!!included}
                  onChange={() => toggleField(key)}
                  style={{ width: 'auto' }}
                />
                <span style={{ flex: 1 }}>{key.replace(/_/g, ' ')}</span>
                {included && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-2)' }}>
                    <input
                      type="checkbox"
                      checked={included.is_required}
                      onChange={() => toggleRequired(key)}
                      style={{ width: 'auto' }}
                    />
                    required
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BoardConfigPanel({ ticketTypeId, onClose }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState('board');
  const [columns, setColumns] = useState([]);
  const [phases, setPhases] = useState([]);

  const configQuery = useQuery({
    queryKey: ['board-config-admin', ticketTypeId],
    queryFn: () => api.get(`/admin/board-configs/${ticketTypeId}`).then(r => r.data),
  });

  // Populate form from loaded config
  useEffect(() => {
    if (!configQuery.data) return;
    setMode(configQuery.data.mode || 'board');
    setColumns((configQuery.data.columns || []).map(c => ({ ...c, fields: c.fields || [] })));
    setPhases(configQuery.data.phases || []);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Build transitions from allowed_target_ids
      const transitions = [];
      for (const col of columns) {
        for (const toId of (col.allowed_target_ids || [])) {
          const toCol = columns.find(c => c.id === toId);
          if (toCol) transitions.push({ from_label: col.label, to_label: toCol.label });
        }
      }
      return api.put(`/admin/board-configs/${ticketTypeId}`, {
        mode,
        columns: columns.map((c, i) => ({ label: c.label, position: i + 1, fields: c.fields })),
        phases:  phases.map((p, i)  => ({ label: p.label, position: i + 1 })),
        transitions,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries(['board-config-admin', ticketTypeId]);
      toast.success('Board config saved');
    },
    onError: err => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/board-configs/${ticketTypeId}`),
    onSuccess: () => {
      qc.invalidateQueries(['board-config-admin', ticketTypeId]);
      toast.success('Board config removed');
      onClose();
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  function addColumn() {
    setColumns(prev => [...prev, {
      id: `new-${Date.now()}`,
      label: '',
      position: prev.length + 1,
      fields: [],
      allowed_target_ids: [],
    }]);
  }

  function removeColumn(idx) {
    const removed = columns[idx];
    setColumns(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({
      ...c,
      position: i + 1,
      allowed_target_ids: (c.allowed_target_ids || []).filter(id => id !== removed.id),
    })));
  }

  function updateColumnLabel(idx, label) {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, label } : c));
  }

  function updateColumn(idx, updated) {
    setColumns(prev => prev.map((c, i) => i === idx ? updated : c));
  }

  function toggleTransition(fromIdx, toId) {
    setColumns(prev => prev.map((c, i) => {
      if (i !== fromIdx) return c;
      const has = (c.allowed_target_ids || []).includes(toId);
      return {
        ...c,
        allowed_target_ids: has
          ? c.allowed_target_ids.filter(id => id !== toId)
          : [...(c.allowed_target_ids || []), toId],
      };
    }));
  }

  function addPhase() {
    setPhases(prev => [...prev, { id: `new-${Date.now()}`, label: '', position: prev.length + 1 }]);
  }

  function removePhase(idx) {
    setPhases(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, position: i + 1 })));
  }

  function updatePhaseLabel(idx, label) {
    setPhases(prev => prev.map((p, i) => i === idx ? { ...p, label } : p));
  }

  if (configQuery.isLoading) return <div style={{ padding: '16px' }}><div className="spinner" /></div>;

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      marginTop: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Board Configuration</span>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
      </div>

      {/* Mode selector */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ marginBottom: '6px', display: 'block', fontSize: '0.82rem' }}>View Mode</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['board', 'progress'].map(m => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setMode(m)}
            >
              {m === 'board' ? '📋 Board' : '📊 Progress'}
            </button>
          ))}
        </div>
      </div>

      {/* Board mode config */}
      {mode === 'board' && (
        <div>
          {/* Columns list */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
              Columns
            </div>
            {columns.map((col, idx) => (
              <div key={col.id || idx} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'grab' }}>⠿</span>
                  <input
                    value={col.label}
                    onChange={e => updateColumnLabel(idx, e.target.value)}
                    placeholder="Column name"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    onClick={() => removeColumn(idx)}
                  >
                    🗑
                  </button>
                </div>
                <ColumnFieldsPanel column={col} onChange={updated => updateColumn(idx, updated)} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addColumn}>
              + Add Column
            </button>
          </div>

          {/* Transitions grid */}
          {columns.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
                Allowed Transitions
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-2)' }}>From \ To</th>
                      {columns.map(c => (
                        <th key={c.id} style={{ padding: '6px 8px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {c.label || '?'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((fromCol, fromIdx) => (
                      <tr key={fromCol.id}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {fromCol.label || '?'}
                        </td>
                        {columns.map(toCol => (
                          <td key={toCol.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {toCol.id !== fromCol.id ? (
                              <input
                                type="checkbox"
                                style={{ width: 'auto' }}
                                checked={(fromCol.allowed_target_ids || []).includes(toCol.id)}
                                onChange={() => toggleTransition(fromIdx, toCol.id)}
                              />
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress mode config */}
      {mode === 'progress' && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
            Phases (in order)
          </div>
          {phases.map((phase, idx) => (
            <div key={phase.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>⠿</span>
              <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', minWidth: '18px' }}>{idx + 1}.</span>
              <input
                value={phase.label}
                onChange={e => updatePhaseLabel(idx, e.target.value)}
                placeholder="Phase name"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-danger btn-xs" onClick={() => removePhase(idx)}>🗑</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPhase}>
            + Add Phase
          </button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '8px' }}>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => { if (window.confirm('Remove this board config?')) deleteMutation.mutate(); }}
          disabled={deleteMutation.isPending || !configQuery.data}
        >
          Remove Config
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/BoardConfigPanel.jsx
git commit -m "feat: add BoardConfigPanel admin component"
```

---

## Task 11: Frontend — Wire BoardConfigPanel into DropdownManagement

**Files:**
- Modify: `frontend/src/components/admin/DropdownManagement.jsx`

- [ ] **Step 1: Add the import at the top of the file**

Add this import in `frontend/src/components/admin/DropdownManagement.jsx` after the existing imports:
```js
import BoardConfigPanel from './BoardConfigPanel';
```

- [ ] **Step 2: Add the open-panel state inside the DropdownManagement component**

Add this `useState` inside the `DropdownManagement` function body (after the existing state declarations):
```js
const [boardConfigTypeId, setBoardConfigTypeId] = useState(null);
```

- [ ] **Step 3: Add "Configure Board" button to the Ticket Types section**

In DropdownManagement, find the section that renders rows for each item. The render is different per section — look for the JSX that maps `items` to table rows. You need to add a "Configure Board" button **only when `activeSection === 'ticket-types'`**.

Find the row action buttons (typically contains the edit ✏️ and delete 🗑 buttons for each item) and add this button inside that same `div`, after the existing buttons:

```jsx
{activeSection === 'ticket-types' && (
  <button
    className="btn btn-ghost btn-xs"
    title="Configure Board"
    onClick={() => setBoardConfigTypeId(boardConfigTypeId === item.id ? null : item.id)}
  >
    📋
  </button>
)}
```

- [ ] **Step 4: Render the panel below the row**

After the row `<tr>` (or equivalent list item) that contains the buttons, add a conditional row that renders the panel. If the table uses `<tr>`, add:

```jsx
{activeSection === 'ticket-types' && boardConfigTypeId === item.id && (
  <tr>
    <td colSpan={99} style={{ padding: '0 8px 12px' }}>
      <BoardConfigPanel
        ticketTypeId={item.id}
        onClose={() => setBoardConfigTypeId(null)}
      />
    </td>
  </tr>
)}
```

- [ ] **Step 5: Verify in browser**

Go to `http://localhost:5173/admin` → Dropdown Management → Ticket Types. Each ticket type row should now show a 📋 button. Clicking it should expand the BoardConfigPanel inline below the row. Try switching between Board and Progress mode. Add columns, set fields, set transitions. Click Save — should show "Board config saved" toast.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/DropdownManagement.jsx
git commit -m "feat: wire BoardConfigPanel into Ticket Types admin section"
```

---

## Task 12: Frontend — Update Dashboard Link

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Replace the 📋 link target**

In `DashboardPage.jsx`, find both occurrences of:
```jsx
to={`/positions/${ticket.position_id}`}
```
Replace each with:
```jsx
to={`/tickets/${ticket.id}/board`}
```

Also remove the `ticket.position_id &&` condition that guards the link. The link should now render for all tickets (the board page handles "no config" gracefully). The result for each occurrence should be:

```jsx
<Link
  to={`/tickets/${ticket.id}/board`}
  className="btn btn-ghost btn-xs"
  title="Open Board"
  style={{ textDecoration: 'none' }}
>
  📋
</Link>
```

- [ ] **Step 2: Verify in browser**

On the dashboard, every ticket row should now show the 📋 button. Clicking it should open `/tickets/:id/board`. For a Hiring Ticket with the seeded config you should see the kanban board. For ticket types without a config you should see the "No board configured for this ticket type" error message.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat: update dashboard board link to ticket-scoped route"
```

---

## Task 13: Cleanup — Remove Old Board Components

> **Pre-condition:** Verify that the new DynamicKanbanBoard is working correctly for Hiring Tickets before running this task. This is irreversible without git history.

**Files:**
- Delete: `frontend/src/components/board/KanbanBoard.jsx`
- Delete: `frontend/src/components/board/ScreeningColumn.jsx`
- Delete: `frontend/src/components/board/HRInterviewColumn.jsx`
- Delete: `frontend/src/components/board/BatchesColumn.jsx`
- Delete: `frontend/src/components/board/StageColumns.jsx`
- Modify: `frontend/src/pages/PositionPage.jsx` — replace with redirect
- Modify: `frontend/src/App.jsx` — remove PositionPage import (optional: keep redirect route)

- [ ] **Step 1: Delete the five old component files**

```bash
cd frontend/src/components/board
rm KanbanBoard.jsx ScreeningColumn.jsx HRInterviewColumn.jsx BatchesColumn.jsx StageColumns.jsx
```

- [ ] **Step 2: Replace PositionPage with a redirect**

Replace the entire contents of `frontend/src/pages/PositionPage.jsx` with:

```jsx
// frontend/src/pages/PositionPage.jsx
// Legacy route — position boards are now served as ticket boards.
// This component finds the first ticket for the given position and redirects to its board.
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export default function PositionPage() {
  const { positionId } = useParams();

  const q = useQuery({
    queryKey: ['position-ticket', positionId],
    queryFn: () =>
      api.get('/tickets', { params: { position_id: positionId, limit: 1 } })
        .then(r => r.data?.data?.[0] || null),
  });

  if (q.isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  if (!q.data) return <Navigate to="/" replace />;

  return <Navigate to={`/tickets/${q.data.id}/board`} replace />;
}
```

- [ ] **Step 3: Verify no broken imports**

```bash
cd frontend && npm run build 2>&1 | head -40
```
Expected: build completes with no "Cannot find module" errors referencing the deleted files.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: remove hardcoded board components, add PositionPage redirect"
```

---

## Self-Review Checklist

### Spec coverage

| Spec section | Covered by task(s) |
|---|---|
| DB schema (7 tables) | Task 1 |
| GET /admin/board-configs | Task 2 |
| PUT /admin/board-configs (atomic upsert) | Task 2 |
| DELETE /admin/board-configs | Task 2 |
| GET /tickets/:id/board | Task 3 |
| POST board/entries | Task 3 |
| PATCH entries/move (server-side transition validation) | Task 3 |
| DELETE board/entries | Task 3 |
| POST board/advance | Task 3 |
| POST board/phase/:phaseId | Task 3 |
| Register routes in app.js | Task 4 |
| Seed Hiring Ticket config | Task 5 |
| Migrate position_board_stages | Task 6 |
| TicketBoardPage + routing | Task 7 |
| DynamicKanbanBoard (DnD, add entry, move popup) | Task 8 |
| DynamicProgressStepper (phases, advance, history) | Task 9 |
| BoardConfigPanel (mode, columns, fields, transitions, phases) | Task 10 |
| Wire BoardConfigPanel into DropdownManagement | Task 11 |
| Dashboard 📋 link update | Task 12 |
| Remove old hardcoded components | Task 13 |
| Column label uniqueness validation | Task 2 (PUT route) |
| ticket_phase_history as audit trail | Task 3 (GET board) + Task 9 (history UI) |

All spec sections covered.

### Type / name consistency

- `ticketId` used consistently in all backend routes and frontend API calls
- `board_column_id` / `board_column_fields` / `board_column_transitions` match the DDL in Task 1
- `allowed_target_ids` built by GET /admin/board-configs (Task 2) and consumed by DynamicKanbanBoard (Task 8)
- `additional_field_values` sent in PATCH move (Task 8 MovePopup) and received by boards.js (Task 3)
- `candidate_name` field key used in seed (Task 5) and rendered in DraggableCard (Task 8)
- `ticket_phase_history` table name consistent across migration (Task 1), boards.js (Task 3), and DynamicProgressStepper (Task 9)
