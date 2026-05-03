# Phase 2 — Position Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full position detail page with Kanban board (Screening → Batches → Assessment → Technical Interview → Offer → Hired), position details header, and activity log footer.

**Architecture:** New `backend/routes/positions.js` file mounts at `/api/v1/positions`, backed by 5 new board tables. Frontend replaces the `PositionPage` stub with a full-page component split into `PositionDetails`, `KanbanBoard` (with column sub-components), and `ActivityLog`. Drag-and-drop uses `@dnd-kit/core`. Board state is server-driven: every action calls the API, then refetches.

**Tech Stack:** Node.js/Express (backend), React 18 + TanStack Query + @dnd-kit/core (frontend), PostgreSQL on Neon, existing CSS custom properties and button/form classes.

**Spec:** `docs/superpowers/specs/2026-05-03-main-view-and-board-design.md` (Phase 2 sections)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/database/migration-phase2.sql` | Board tables + board_status + assessment_levels |
| Modify | `backend/app.js` | Mount `/api/v1/positions` router |
| Modify | `backend/routes/admin.js` | assessment_levels CRUD + include in dropdowns |
| Modify | `backend/routes/mappings.js` | Include assessment_levels in /mappings |
| Create | `backend/routes/positions.js` | All 8 board API routes |
| Modify | `frontend/src/components/admin/DropdownManagement.jsx` | Assessment Levels tab |
| Modify | `frontend/package.json` | Add @dnd-kit/core, @dnd-kit/utilities |
| Replace | `frontend/src/pages/PositionPage.jsx` | Full page: fetch + layout |
| Create | `frontend/src/components/board/PositionDetails.jsx` | Top details card + re-open |
| Create | `frontend/src/components/board/KanbanBoard.jsx` | DnD context + 6-column layout |
| Create | `frontend/src/components/board/ScreeningColumn.jsx` | Screening column + add popup |
| Create | `frontend/src/components/board/BatchesColumn.jsx` | Batches + slide-in panel |
| Create | `frontend/src/components/board/StageColumns.jsx` | Assessment/TI/Offer/Hired columns + drop popups |
| Create | `frontend/src/components/board/ActivityLog.jsx` | Log feed at bottom |

---

## Task 1: DB Migration Phase 2

**Files:**
- Create: `backend/database/migration-phase2.sql`

- [ ] **Step 1: Create the SQL file**

```sql
-- backend/database/migration-phase2.sql
-- Run ONCE in Neon SQL Editor after migration-phase1.sql

-- 1. Assessment levels dropdown (managed from admin panel)
CREATE TABLE IF NOT EXISTS assessment_levels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed common levels
INSERT INTO assessment_levels (name, sort_order) VALUES
  ('Junior', 1), ('Mid-Level', 2), ('Senior', 3), ('Lead', 4)
ON CONFLICT (name) DO NOTHING;

-- 2. Position board status
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS board_status TEXT NOT NULL DEFAULT 'open'
    CHECK (board_status IN ('open', 'filled'));

-- 3. Screening entries
CREATE TABLE IF NOT EXISTS position_board_screenings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL CHECK (count > 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Batches
CREATE TABLE IF NOT EXISTS position_board_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Candidates (named, inside batches)
CREATE TABLE IF NOT EXISTS position_board_candidates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id   UUID NOT NULL REFERENCES position_board_batches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Stage progression — one row per candidate, tracks CURRENT stage
--    UNIQUE(candidate_id) enforces one active stage per candidate.
CREATE TABLE IF NOT EXISTS position_board_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id         UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES position_board_candidates(id) ON DELETE CASCADE,
  stage               TEXT NOT NULL
    CHECK (stage IN ('assessment', 'technical_interview', 'offer', 'hired')),
  assessment_level    TEXT,
  assessment_result   TEXT,
  offer_ticket_number TEXT,
  moved_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  moved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

-- 7. Activity log
CREATE TABLE IF NOT EXISTS position_board_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbl_position
  ON position_board_log(position_id, created_at DESC);
```

- [ ] **Step 2: Run in Neon**

Open Neon SQL Editor, paste the file contents, click Run. Verify in the Tables panel: `assessment_levels`, `position_board_screenings`, `position_board_batches`, `position_board_candidates`, `position_board_stages`, `position_board_log` all appear. Check the `positions` table has a `board_status` column.

- [ ] **Step 3: Commit**

```bash
git add backend/database/migration-phase2.sql
git commit -m "feat: add phase 2 migration — board tables and assessment_levels"
```

---

## Task 2: Backend — Assessment Levels + Positions Router

**Files:**
- Modify: `backend/routes/admin.js`
- Modify: `backend/routes/mappings.js`
- Modify: `backend/app.js`
- Create: `backend/routes/positions.js`

### 2a — Assessment levels in admin.js

- [ ] **Step 1: Add makeCrud entry for assessment_levels in `backend/routes/admin.js`**

Find the section with `const tsCrud = makeCrud(...)` and add:

```js
const alCrud = makeCrud('assessment_levels', 'Assessment level not found');
router.post('/assessment-levels',        alCrud.create);
router.put('/assessment-levels/:id',     alCrud.update);
router.delete('/assessment-levels/:id',  alCrud.del);
```

- [ ] **Step 2: Add assessment_levels to `GET /admin/dropdowns`**

In the `GET /dropdowns` handler, add to the `Promise.all` destructuring and queries:

```js
// Add to destructuring array (after autoFillRules):
assessmentLevels,

// Add as last query in Promise.all (after autoFillRules query):
pool.query('SELECT id, name, is_active, created_at FROM assessment_levels ORDER BY sort_order, name'),

// Add to res.json:
assessment_levels: assessmentLevels.rows,
```

- [ ] **Step 3: Add assessment_levels to `GET /mappings` in `backend/routes/mappings.js`**

```js
// Add to destructuring (after autoFillRules):
assessmentLevels,

// Add query:
pool.query(`SELECT id, name FROM assessment_levels WHERE is_active = true ORDER BY sort_order, name`),

// Add to res.json:
assessment_levels: assessmentLevels.rows,
```

- [ ] **Step 4: Add Assessment Levels tab to `frontend/src/components/admin/DropdownManagement.jsx`**

Add to the `SECTIONS` array (after `action-subaction-rules`):
```js
{ id: 'assessment-levels', label: 'Assessment Levels' },
```

This section uses only `name` (same as ticket-statuses pattern) — no special handling needed.

- [ ] **Step 5: Commit backend dropdown changes**

```bash
git add backend/routes/admin.js backend/routes/mappings.js frontend/src/components/admin/DropdownManagement.jsx
git commit -m "feat: add assessment_levels dropdown management"
```

### 2b — Create `backend/routes/positions.js`

- [ ] **Step 6: Create the positions route file**

```js
// backend/routes/positions.js
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ── Helper: write board log ───────────────────────────────────
async function writeLog(client, positionId, actorId, eventType, payload) {
  await client.query(
    `INSERT INTO position_board_log (position_id, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [positionId, actorId, eventType, JSON.stringify(payload)]
  );
}

// ── GET /positions/:id/board ──────────────────────────────────
router.get('/:id/board', async (req, res, next) => {
  try {
    const id = req.params.id;

    // Position details
    const { rows: [pos] } = await pool.query(`
      SELECT
        p.id, p.name, p.board_status,
        d.name                      AS department_name,
        cc.label                    AS country_company_label,
        COALESCE(MAX(t.management_type), '')  AS management_type,
        COALESCE(MAX(uhm.name), '')           AS ultimate_hm_name,
        COALESCE(MAX(dhm.name), '')           AS direct_hm_name,
        COALESCE(MAX(t.candidate_count), 0)   AS required_candidates
      FROM positions p
      LEFT JOIN departments d           ON d.id = p.id
      LEFT JOIN tickets t               ON t.position_id = p.id
      LEFT JOIN hiring_managers uhm     ON uhm.id = t.ultimate_hm_id
      LEFT JOIN hiring_managers dhm     ON dhm.id = t.direct_hm_id
      LEFT JOIN country_companies cc    ON cc.id = t.country_company_id
      WHERE p.id = $1
      GROUP BY p.id, p.name, p.board_status, d.name, cc.label
    `, [id]);

    if (!pos) return res.status(404).json({ error: 'Position not found' });

    // Screenings
    const { rows: screenings } = await pool.query(`
      SELECT s.id, s.count, s.created_at, u.name AS created_by_name
      FROM position_board_screenings s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE s.position_id = $1
      ORDER BY s.created_at ASC
    `, [id]);

    // Batches with candidates
    const { rows: batches } = await pool.query(`
      SELECT b.id, b.name, b.created_at, u.name AS created_by_name
      FROM position_board_batches b
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.position_id = $1
      ORDER BY b.created_at ASC
    `, [id]);

    const { rows: candidates } = await pool.query(`
      SELECT c.id, c.batch_id, c.name, c.created_at
      FROM position_board_candidates c
      JOIN position_board_batches b ON b.id = c.batch_id
      WHERE b.position_id = $1
      ORDER BY c.created_at ASC
    `, [id]);

    const batchMap = {};
    batches.forEach(b => { batchMap[b.id] = { ...b, candidates: [] }; });
    candidates.forEach(c => {
      if (batchMap[c.batch_id]) batchMap[c.batch_id].candidates.push(c);
    });

    // Stages (current stage per candidate)
    const { rows: stages } = await pool.query(`
      SELECT s.id, s.candidate_id, s.stage,
             s.assessment_level, s.assessment_result,
             s.offer_ticket_number, s.moved_at,
             c.name AS candidate_name
      FROM position_board_stages s
      JOIN position_board_candidates c ON c.id = s.candidate_id
      WHERE s.position_id = $1
      ORDER BY s.moved_at ASC
    `, [id]);

    res.json({
      position:  pos,
      screenings,
      batches:   Object.values(batchMap),
      stages,
    });
  } catch (err) { next(err); }
});

// ── POST /positions/:id/screenings ────────────────────────────
router.post('/:id/screenings', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { count } = req.body;
    if (!count || count < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'count must be a positive integer' });
    }
    const { rows: [row] } = await client.query(
      `INSERT INTO position_board_screenings (position_id, count, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, count, req.user.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'screening_added', { count });
    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/batches ───────────────────────────────
router.post('/:id/batches', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name } = req.body;
    if (!name) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'name is required' }); }
    const { rows: [row] } = await client.query(
      `INSERT INTO position_board_batches (position_id, name, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, name, req.user.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'batch_created', { batch_name: name });
    await client.query('COMMIT');
    res.status(201).json({ ...row, candidates: [] });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/batches/:batchId/candidates ───────────
router.post('/:id/batches/:batchId/candidates', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name } = req.body;
    if (!name) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'name is required' }); }

    // Verify batch belongs to this position
    const { rows: [batch] } = await client.query(
      'SELECT id, name FROM position_board_batches WHERE id = $1 AND position_id = $2',
      [req.params.batchId, req.params.id]
    );
    if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }

    const { rows: [candidate] } = await client.query(
      'INSERT INTO position_board_candidates (batch_id, name) VALUES ($1, $2) RETURNING *',
      [req.params.batchId, name]
    );
    await writeLog(client, req.params.id, req.user.id, 'candidate_added',
      { candidate_name: name, batch_name: batch.name });
    await client.query('COMMIT');
    res.status(201).json(candidate);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/stages ────────────────────────────────
// Body: { candidate_id, stage, assessment_level?, offer_ticket_number? }
router.post('/:id/stages', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { candidate_id, stage, assessment_level, offer_ticket_number } = req.body;
    const validStages = ['assessment', 'technical_interview', 'offer', 'hired'];
    if (!candidate_id || !stage || !validStages.includes(stage)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'candidate_id and valid stage are required' });
    }
    if (stage === 'assessment' && !assessment_level) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'assessment_level is required for assessment stage' });
    }
    if (stage === 'offer' && !offer_ticket_number) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'offer_ticket_number is required for offer stage' });
    }

    // Verify candidate belongs to a batch in this position
    const { rows: [cand] } = await client.query(`
      SELECT c.id, c.name FROM position_board_candidates c
      JOIN position_board_batches b ON b.id = c.batch_id
      WHERE c.id = $1 AND b.position_id = $2
    `, [candidate_id, req.params.id]);
    if (!cand) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Candidate not found' }); }

    // Upsert: one stage row per candidate
    const { rows: [row] } = await client.query(`
      INSERT INTO position_board_stages
        (position_id, candidate_id, stage, assessment_level, offer_ticket_number, moved_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (candidate_id) DO UPDATE SET
        stage               = EXCLUDED.stage,
        assessment_level    = EXCLUDED.assessment_level,
        offer_ticket_number = EXCLUDED.offer_ticket_number,
        moved_by            = EXCLUDED.moved_by,
        moved_at            = now()
      RETURNING *
    `, [req.params.id, candidate_id, stage, assessment_level || null, offer_ticket_number || null, req.user.id]);

    await writeLog(client, req.params.id, req.user.id, 'candidate_moved', {
      candidate_name: cand.name,
      to_stage: stage,
    });

    // Auto-fill check: if stage = hired, see if position is now filled
    if (stage === 'hired') {
      const { rows: [counts] } = await client.query(`
        SELECT
          COALESCE(MAX(t.candidate_count), 0) AS required,
          COUNT(s.id) AS hired_count
        FROM positions p
        LEFT JOIN tickets t ON t.position_id = p.id
        LEFT JOIN position_board_stages s ON s.position_id = p.id AND s.stage = 'hired'
        WHERE p.id = $1
        GROUP BY p.id
      `, [req.params.id]);

      if (parseInt(counts.hired_count, 10) >= parseInt(counts.required, 10) && counts.required > 0) {
        await client.query(
          `UPDATE positions SET board_status = 'filled' WHERE id = $1`,
          [req.params.id]
        );
        await writeLog(client, req.params.id, req.user.id, 'position_filled', {});
      }
    }

    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── PATCH /positions/:id/stages/:stageId ─────────────────────
// Body: { assessment_result? } or { offer_ticket_number? }
router.patch('/:id/stages/:stageId', async (req, res, next) => {
  try {
    const { assessment_result, offer_ticket_number } = req.body;
    const { rows: [row] } = await pool.query(`
      UPDATE position_board_stages
      SET
        assessment_result   = COALESCE($1, assessment_result),
        offer_ticket_number = COALESCE($2, offer_ticket_number)
      WHERE id = $3 AND position_id = $4
      RETURNING *
    `, [assessment_result ?? null, offer_ticket_number ?? null, req.params.stageId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Stage record not found' });
    res.json(row);
  } catch (err) { next(err); }
});

// ── POST /positions/:id/reopen ────────────────────────────────
router.post('/:id/reopen', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE positions SET board_status = 'open' WHERE id = $1`,
      [req.params.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'position_reopened', {});
    await client.query('COMMIT');
    res.json({ message: 'Position re-opened' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── GET /positions/:id/log ────────────────────────────────────
router.get('/:id/log', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(`
      SELECT l.id, l.event_type, l.payload, l.created_at,
             u.name AS actor_name
      FROM position_board_log l
      LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.position_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*) FROM position_board_log WHERE position_id = $1',
      [req.params.id]
    );

    res.json({ data: rows, total: parseInt(count, 10), page, pages: Math.ceil(count / limit) });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 7: Mount positions router in `backend/app.js`**

Add after the existing routes:
```js
app.use('/api/v1/positions', require('./routes/positions'));
```

- [ ] **Step 8: Commit**

```bash
git add backend/routes/positions.js backend/app.js backend/routes/admin.js backend/routes/mappings.js
git commit -m "feat: add positions board backend routes and assessment_levels"
```

- [ ] **Step 9: Verify**

```bash
# Start backend: cd backend && node server.js
# Test board fetch (replace IDs with real ones from your DB):
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/v1/positions/POSITION_ID/board
# Expected: { position: {...}, screenings: [], batches: [], stages: [] }

curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/v1/positions/POSITION_ID/log
# Expected: { data: [], total: 0, page: 1, pages: 0 }
```

---

## Task 3: Frontend — Install @dnd-kit

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Verify install**

```bash
# package.json should now include:
grep "dnd-kit" package.json
# Expected output lines:
# "@dnd-kit/core": "^6.x.x",
# "@dnd-kit/utilities": "^3.x.x"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add @dnd-kit/core for Kanban drag and drop"
```

---

## Task 4: Frontend — PositionDetails Component

**Files:**
- Create: `frontend/src/components/board/PositionDetails.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/PositionDetails.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function PositionDetails({ position, positionId }) {
  const qc = useQueryClient();

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/positions/${positionId}/reopen`),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      toast.success('Position re-opened');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to re-open'),
  });

  const isFilled = position.board_status === 'filled';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 24px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '4px' }}>
            {position.name}
          </h1>
          <div style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '99px',
            fontSize: '0.78rem',
            fontWeight: 600,
            background: isFilled ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
            color: isFilled ? '#ef4444' : 'var(--primary)',
          }}>
            {isFilled ? '● Filled' : '● Open'}
          </div>
        </div>
        {isFilled && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isLoading}
          >
            {reopenMutation.isLoading ? 'Re-opening…' : 'Re-open Position'}
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '12px',
        marginTop: '16px',
      }}>
        {[
          ['Department',       position.department_name],
          ['Country & Company', position.country_company_label],
          ['Management Type',  position.management_type],
          ['Ultimate HM',      position.ultimate_hm_name],
          ['Direct HM',        position.direct_hm_name],
          ['Candidates Required', position.required_candidates],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
              {label}
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-1)' }}>
              {value || '—'}
            </div>
          </div>
        ))}
      </div>

      {isFilled && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius)',
          fontSize: '0.85rem',
          color: '#ef4444',
        }}>
          ✅ Position filled — all required candidates hired. Click "Re-open Position" to continue hiring.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/PositionDetails.jsx
git commit -m "feat: add PositionDetails component with re-open support"
```

---

## Task 5: Frontend — ScreeningColumn

**Files:**
- Create: `frontend/src/components/board/ScreeningColumn.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/ScreeningColumn.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function ScreeningColumn({ positionId, screenings }) {
  const qc = useQueryClient();
  const [showPopup, setShowPopup] = useState(false);
  const [count, setCount] = useState('');

  const addMutation = useMutation({
    mutationFn: (data) => api.post(`/positions/${positionId}/screenings`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setShowPopup(false);
      setCount('');
      toast.success('Screening added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    const n = parseInt(count, 10);
    if (!n || n < 1) return toast.error('Enter a valid number');
    addMutation.mutate({ count: n });
  }

  return (
    <div style={columnStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Screening</span>
        <span style={badgeStyle}>{screenings.length}</span>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowPopup(true)}
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {screenings.map((s, i) => (
          <div key={s.id} style={cardStyle}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              Screening #{i + 1}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '2px' }}>
              {s.count} candidates · {new Date(s.created_at).toLocaleDateString()}
            </div>
            {s.created_by_name && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '2px' }}>
                by {s.created_by_name}
              </div>
            )}
          </div>
        ))}
        {screenings.length === 0 && (
          <p style={emptyStyle}>No screenings yet</p>
        )}
      </div>

      {showPopup && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowPopup(false); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>Add Screening</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Number of Screenings</label>
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={e => setCount(e.target.value)}
                  placeholder="e.g. 12"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPopup(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={addMutation.isLoading}>
                  {addMutation.isLoading ? 'Adding…' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared styles (exported so other column files can import them)
export const columnStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: '220px',
  minWidth: '220px',
  background: 'var(--bg)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  maxHeight: '600px',
};
export const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};
export const badgeStyle = {
  background: 'var(--primary)',
  color: '#fff',
  borderRadius: '99px',
  padding: '1px 7px',
  fontSize: '0.72rem',
  fontWeight: 700,
};
export const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px',
  marginBottom: '8px',
  fontSize: '0.82rem',
};
export const emptyStyle = {
  color: 'var(--text-3)',
  fontSize: '0.8rem',
  textAlign: 'center',
  padding: '20px 8px',
};
export const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};
export const popupStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '24px',
  width: '340px',
  maxWidth: '95vw',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/ScreeningColumn.jsx
git commit -m "feat: add ScreeningColumn with add-screening popup"
```

---

## Task 6: Frontend — BatchesColumn

**Files:**
- Create: `frontend/src/components/board/BatchesColumn.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/BatchesColumn.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  columnStyle, headerStyle, badgeStyle, cardStyle, emptyStyle, overlayStyle, popupStyle,
} from './ScreeningColumn';

function DraggableCandidate({ candidate, batchId }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `candidate-${candidate.id}`,
    data: { candidateId: candidate.id, candidateName: candidate.name, sourceStage: 'batch', batchId },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...cardStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        marginBottom: '4px',
        padding: '7px 10px',
        fontSize: '0.8rem',
        userSelect: 'none',
      }}
    >
      👤 {candidate.name}
    </div>
  );
}

function BatchCard({ batch, positionId, qc }) {
  const [expanded, setExpanded] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateName, setCandidateName] = useState('');

  const addCandidateMutation = useMutation({
    mutationFn: (name) => api.post(`/positions/${positionId}/batches/${batch.id}/candidates`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setCandidateName('');
      setShowAddCandidate(false);
      toast.success('Candidate added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={{ ...cardStyle, padding: '10px', marginBottom: '8px' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: expanded ? '8px' : 0 }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: '0.8rem' }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.84rem', flex: 1 }}>{batch.name}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{batch.candidates.length}</span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: '4px' }}>
          {batch.candidates.map(c => (
            <DraggableCandidate key={c.id} candidate={c} batchId={batch.id} />
          ))}
          {batch.candidates.length === 0 && (
            <p style={{ ...emptyStyle, padding: '8px' }}>No candidates yet</p>
          )}

          {showAddCandidate ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (candidateName.trim()) addCandidateMutation.mutate(candidateName.trim());
              }}
              style={{ marginTop: '6px' }}
            >
              <input
                value={candidateName}
                onChange={e => setCandidateName(e.target.value)}
                placeholder="Candidate name"
                autoFocus
                style={{ marginBottom: '4px', fontSize: '0.8rem', padding: '5px 8px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="submit" className="btn btn-primary btn-xs" disabled={addCandidateMutation.isLoading}>
                  Add
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowAddCandidate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="btn btn-ghost btn-xs"
              style={{ width: '100%', marginTop: '4px', fontSize: '0.78rem' }}
              onClick={() => setShowAddCandidate(true)}
            >
              + Add candidate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchesColumn({ positionId, batches }) {
  const qc = useQueryClient();
  const [showPanel, setShowPanel] = useState(false);
  const [batchName, setBatchName] = useState('');

  const totalCandidates = batches.reduce((sum, b) => sum + b.candidates.length, 0);

  const addBatchMutation = useMutation({
    mutationFn: (name) => api.post(`/positions/${positionId}/batches`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setBatchName('');
      setShowPanel(false);
      toast.success('Batch created');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <>
      <div style={{ ...columnStyle, width: '260px', minWidth: '260px' }}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Batches</span>
          <span style={badgeStyle}>{totalCandidates}</span>
          <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setShowPanel(true)}>
            +
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {batches.map(batch => (
            <BatchCard key={batch.id} batch={batch} positionId={positionId} qc={qc} />
          ))}
          {batches.length === 0 && <p style={emptyStyle}>No batches yet</p>}
        </div>
      </div>

      {/* Right-side slide-in panel */}
      {showPanel && (
        <div style={{ ...overlayStyle, justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPanel(false); }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            width: '320px',
            height: '100%',
            padding: '24px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Create Batch</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPanel(false)}>✕</button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (batchName.trim()) addBatchMutation.mutate(batchName.trim());
            }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Batch Name</label>
                <input
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                  placeholder="e.g. Engineering Round 1"
                  autoFocus
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addBatchMutation.isLoading}>
                {addBatchMutation.isLoading ? 'Creating…' : 'Create Batch'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/BatchesColumn.jsx
git commit -m "feat: add BatchesColumn with slide-in panel and draggable candidates"
```

---

## Task 7: Frontend — Stage Columns (Assessment, TI, Offer, Hired)

**Files:**
- Create: `frontend/src/components/board/StageColumns.jsx`

This file exports `AssessmentColumn`, `TechnicalInterviewColumn`, `OfferColumn`, `HiredColumn` and the shared `useDroppable` wrappers.

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/board/StageColumns.jsx
import { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  columnStyle, headerStyle, badgeStyle, cardStyle, emptyStyle, overlayStyle, popupStyle,
} from './ScreeningColumn';

// ── Draggable stage candidate card ────────────────────────────
function DraggableStageCard({ stage, onEditResult }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `candidate-${stage.candidate_id}`,
    data: {
      candidateId: stage.candidate_id,
      candidateName: stage.candidate_name,
      sourceStage: stage.stage,
      stageId: stage.id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...cardStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>👤 {stage.candidate_name}</div>
      {stage.assessment_level && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          Level: {stage.assessment_level}
        </div>
      )}
      {stage.assessment_result !== null && stage.assessment_result !== undefined && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '1px' }}>
          Result: {stage.assessment_result || <span style={{ color: 'var(--text-3)' }}>—</span>}
        </div>
      )}
      {stage.offer_ticket_number && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          Ticket: {stage.offer_ticket_number}
        </div>
      )}
      {onEditResult && (
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginTop: '6px', fontSize: '0.72rem' }}
          onClick={e => { e.stopPropagation(); onEditResult(stage); }}
          onMouseDown={e => e.stopPropagation()}
        >
          Edit result
        </button>
      )}
    </div>
  );
}

// ── Generic droppable column ──────────────────────────────────
function DroppableColumn({ stage, label, children, count }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage}`,
    data: { targetStage: stage },
  });

  return (
    <div style={{
      ...columnStyle,
      outline: isOver ? '2px solid var(--primary)' : '2px solid transparent',
      transition: 'outline 0.15s',
    }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{label}</span>
        <span style={badgeStyle}>{count}</span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: '60px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Edit assessment result popup ──────────────────────────────
function EditResultPopup({ stage, positionId, onClose }) {
  const qc = useQueryClient();
  const [result, setResult] = useState(stage.assessment_result || '');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/positions/${positionId}/stages/${stage.id}`, { assessment_result: result }),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      toast.success('Result updated');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Edit Assessment Result — {stage.candidate_name}
        </h3>
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label>Assessment Result</label>
          <input
            value={result}
            onChange={e => setResult(e.target.value)}
            placeholder="e.g. Pass, Fail, On Hold"
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assessment Column ─────────────────────────────────────────
export function AssessmentColumn({ positionId, stages, assessmentLevels }) {
  const [editingStage, setEditingStage] = useState(null);
  const candidates = stages.filter(s => s.stage === 'assessment');

  return (
    <>
      <DroppableColumn stage="assessment" label="Assessment" count={candidates.length}>
        {candidates.map(s => (
          <DraggableStageCard
            key={s.id}
            stage={s}
            onEditResult={setEditingStage}
          />
        ))}
        {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
      </DroppableColumn>
      {editingStage && (
        <EditResultPopup
          stage={editingStage}
          positionId={positionId}
          onClose={() => setEditingStage(null)}
        />
      )}
    </>
  );
}

// ── Technical Interview Column ────────────────────────────────
export function TechnicalInterviewColumn({ stages }) {
  const candidates = stages.filter(s => s.stage === 'technical_interview');
  return (
    <DroppableColumn stage="technical_interview" label="Tech Interview" count={candidates.length}>
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}

// ── Offer Column ──────────────────────────────────────────────
export function OfferColumn({ stages }) {
  const candidates = stages.filter(s => s.stage === 'offer');
  return (
    <DroppableColumn stage="offer" label="Offer" count={candidates.length}>
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}

// ── Hired Column ──────────────────────────────────────────────
export function HiredColumn({ stages, position }) {
  const candidates = stages.filter(s => s.stage === 'hired');
  const required   = parseInt(position.required_candidates, 10) || 0;
  const filled     = position.board_status === 'filled';

  return (
    <DroppableColumn stage="hired" label="Hired" count={candidates.length}>
      {filled && (
        <div style={{
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius)',
          padding: '8px 10px',
          fontSize: '0.78rem',
          color: '#22c55e',
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          ✅ {candidates.length}/{required} hired
        </div>
      )}
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/StageColumns.jsx
git commit -m "feat: add Assessment/TI/Offer/Hired droppable columns with drag cards"
```

---

## Task 8: Frontend — KanbanBoard (DnD context + drop handling)

**Files:**
- Create: `frontend/src/components/board/KanbanBoard.jsx`

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/board/KanbanBoard.jsx
import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ScreeningColumn, { overlayStyle, popupStyle, cardStyle } from './ScreeningColumn';
import BatchesColumn from './BatchesColumn';
import {
  AssessmentColumn,
  TechnicalInterviewColumn,
  OfferColumn,
  HiredColumn,
} from './StageColumns';

// Valid drag transitions
const VALID_TRANSITIONS = {
  batch:                'assessment',
  assessment:           'technical_interview',
  technical_interview:  'offer',
  offer:                'hired',
};

// Stages that require extra fields on drop
const REQUIRES_POPUP = {
  assessment: true,
  offer:      true,
};

export default function KanbanBoard({ positionId, board, assessmentLevels }) {
  const qc = useQueryClient();
  const [activeCard, setActiveCard]       = useState(null);
  const [pendingDrop, setPendingDrop]     = useState(null); // { candidateId, candidateName, targetStage }
  const [assessmentLevel, setAssessmentLevel] = useState('');
  const [offerTicket, setOfferTicket]     = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const stageMutation = useMutation({
    mutationFn: (body) => api.post(`/positions/${positionId}/stages`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setPendingDrop(null);
      setAssessmentLevel('');
      setOfferTicket('');
      toast.success('Candidate moved');
    },
    onError: (err) => {
      setPendingDrop(null);
      toast.error(err.response?.data?.error || 'Move failed');
    },
  });

  function handleDragStart({ active }) {
    setActiveCard(active.data.current);
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null);
    if (!over) return;

    const { candidateId, candidateName, sourceStage } = active.data.current;
    const { targetStage } = over.data.current;

    if (VALID_TRANSITIONS[sourceStage] !== targetStage) {
      toast.error(`Cannot move from ${sourceStage.replace('_', ' ')} to ${targetStage.replace('_', ' ')}`);
      return;
    }

    if (REQUIRES_POPUP[targetStage]) {
      setPendingDrop({ candidateId, candidateName, targetStage });
    } else {
      stageMutation.mutate({ candidate_id: candidateId, stage: targetStage });
    }
  }

  function handlePopupSubmit(e) {
    e.preventDefault();
    if (!pendingDrop) return;
    const body = { candidate_id: pendingDrop.candidateId, stage: pendingDrop.targetStage };
    if (pendingDrop.targetStage === 'assessment') {
      if (!assessmentLevel) return toast.error('Select an assessment level');
      body.assessment_level = assessmentLevel;
    }
    if (pendingDrop.targetStage === 'offer') {
      if (!offerTicket.trim()) return toast.error('Enter offer ticket number');
      body.offer_ticket_number = offerTicket.trim();
    }
    stageMutation.mutate(body);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '12px',
          alignItems: 'flex-start',
        }}>
          <ScreeningColumn
            positionId={positionId}
            screenings={board.screenings}
          />
          <BatchesColumn
            positionId={positionId}
            batches={board.batches}
          />
          <AssessmentColumn
            positionId={positionId}
            stages={board.stages}
            assessmentLevels={assessmentLevels}
          />
          <TechnicalInterviewColumn stages={board.stages} />
          <OfferColumn stages={board.stages} />
          <HiredColumn stages={board.stages} position={board.position} />
        </div>

        <DragOverlay>
          {activeCard && (
            <div style={{ ...cardStyle, padding: '8px 12px', cursor: 'grabbing', opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
              👤 {activeCard.candidateName}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Drop popup — Assessment fields */}
      {pendingDrop?.targetStage === 'assessment' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setPendingDrop(null); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
              Move to Assessment — {pendingDrop.candidateName}
            </h3>
            <form onSubmit={handlePopupSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Assessment Level *</label>
                <select value={assessmentLevel} onChange={e => setAssessmentLevel(e.target.value)} required>
                  <option value="">— Select —</option>
                  {(assessmentLevels || []).map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDrop(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={stageMutation.isLoading}>
                  {stageMutation.isLoading ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drop popup — Offer ticket number */}
      {pendingDrop?.targetStage === 'offer' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setPendingDrop(null); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
              Move to Offer — {pendingDrop.candidateName}
            </h3>
            <form onSubmit={handlePopupSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Offer Ticket Number *</label>
                <input
                  value={offerTicket}
                  onChange={e => setOfferTicket(e.target.value)}
                  placeholder="e.g. OFR-2026-001"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDrop(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={stageMutation.isLoading}>
                  {stageMutation.isLoading ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/KanbanBoard.jsx
git commit -m "feat: add KanbanBoard with DnD context and drop popup handling"
```

---

## Task 9: Frontend — ActivityLog

**Files:**
- Create: `frontend/src/components/board/ActivityLog.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/board/ActivityLog.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';

function describeEvent(eventType, payload, actorName) {
  const actor = actorName || 'Someone';
  switch (eventType) {
    case 'screening_added':
      return `${actor} added a screening entry: ${payload.count} candidates`;
    case 'batch_created':
      return `${actor} created batch "${payload.batch_name}"`;
    case 'candidate_added':
      return `${actor} added "${payload.candidate_name}" to batch "${payload.batch_name}"`;
    case 'candidate_moved':
      return `${actor} moved "${payload.candidate_name}" to ${(payload.to_stage || '').replace('_', ' ')}`;
    case 'position_filled':
      return `Position automatically marked as Filled`;
    case 'position_reopened':
      return `${actor} re-opened the position`;
    case 'stage_updated':
      return `${actor} updated ${payload.field} for "${payload.candidate_name}"`;
    default:
      return `${actor} performed action: ${eventType}`;
  }
}

export default function ActivityLog({ positionId }) {
  const [page, setPage] = useState(1);

  const logQuery = useQuery({
    queryKey: ['board-log', positionId, page],
    queryFn: () => api.get(`/positions/${positionId}/log`, { params: { page } }).then(r => r.data),
    keepPreviousData: true,
  });

  const entries = logQuery.data?.data || [];
  const pages   = logQuery.data?.pages || 1;

  return (
    <div style={{ marginTop: '32px' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '16px' }}>Activity Log</h2>

      {logQuery.isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}

      {entries.length === 0 && !logQuery.isLoading && (
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>No activity recorded yet.</p>
      )}

      {entries.map(entry => (
        <div key={entry.id} style={{
          display: 'flex',
          gap: '12px',
          padding: '10px 0',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.84rem',
        }}>
          <div style={{ color: 'var(--text-3)', fontSize: '0.75rem', whiteSpace: 'nowrap', paddingTop: '1px', minWidth: '120px' }}>
            {new Date(entry.created_at).toLocaleString()}
          </div>
          <div style={{ color: 'var(--text-1)' }}>
            {describeEvent(entry.event_type, entry.payload || {}, entry.actor_name)}
          </div>
        </div>
      ))}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>Page {page} of {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/board/ActivityLog.jsx
git commit -m "feat: add ActivityLog component with event descriptions and pagination"
```

---

## Task 10: Frontend — Wire Up PositionPage

**Files:**
- Replace: `frontend/src/pages/PositionPage.jsx`

- [ ] **Step 1: Replace the stub with the full page**

```jsx
// frontend/src/pages/PositionPage.jsx
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import PositionDetails from '../components/board/PositionDetails';
import KanbanBoard from '../components/board/KanbanBoard';
import ActivityLog from '../components/board/ActivityLog';

export default function PositionPage() {
  const { positionId } = useParams();

  const boardQuery = useQuery({
    queryKey: ['board', positionId],
    queryFn: () => api.get(`/positions/${positionId}/board`).then(r => r.data),
    staleTime: 0,
  });

  const mappingsQuery = useQuery({
    queryKey: ['mappings'],
    queryFn: () => api.get('/mappings').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const assessmentLevels = mappingsQuery.data?.assessment_levels || [];

  if (boardQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (boardQuery.isError) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>
          Failed to load position: {boardQuery.error?.response?.data?.error || 'Unknown error'}
        </p>
        <Link to="/" className="btn btn-ghost btn-sm">← Back</Link>
      </div>
    );
  }

  const board = boardQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '12px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link
          to="/"
          className="btn btn-ghost btn-sm"
          style={{ textDecoration: 'none' }}
        >
          ← Main View
        </Link>
        <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
          / {board.position.name}
        </span>
      </header>

      {/* Content */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '100%' }}>

        {/* Position details card */}
        <PositionDetails position={board.position} positionId={positionId} />

        {/* Board */}
        <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '16px' }}>Hiring Board</h2>
        <KanbanBoard
          positionId={positionId}
          board={board}
          assessmentLevels={assessmentLevels}
        />

        {/* Activity log */}
        <ActivityLog positionId={positionId} />

      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/PositionPage.jsx
git commit -m "feat: complete PositionPage with board, details, and activity log"
```

- [ ] **Step 3: Verify end-to-end**

Start both backend and frontend dev servers. Click a position name in the main table. Verify:
- PositionPage loads with the position's details in the top card
- All 6 Kanban columns render empty
- Click + in Screening → popup appears → enter a number → card appears in Screening column
- Click + in Batches → slide-in panel → enter batch name → batch card appears
- Click + Add candidate inside batch → type name → candidate appears as draggable card
- Drag candidate from batch to Assessment column → assessment popup appears → select level → candidate appears in Assessment
- Drag from Assessment to Tech Interview → candidate moves (no popup)
- Drag from Tech Interview to Offer → offer popup → enter ticket → candidate appears in Offer
- Drag from Offer to Hired → candidate moves to Hired
- Activity log at the bottom shows all the above events
- If hired count reaches required_candidates, the "Position filled" banner appears in the Hired column and the details card shows "Filled" status with a Re-open button

---

## Self-Review

### Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Full-page route `/positions/:id` | Task 10 (PositionPage) |
| Position details card (all fields) | Task 4 (PositionDetails) |
| Re-open button — any user, preserves data | Task 4 + Task 2 (POST /reopen) |
| Screening column — + button, number field, count cards | Task 5 |
| Batches column — + button (slide-in panel), expandable cards, add candidate inside | Task 6 |
| Candidates draggable from batch | Task 6 (DraggableCandidate) |
| Assessment — drag from batch, Assessment Level required, Assessment Result editable | Task 7 + Task 8 |
| Technical Interview — drag from Assessment, no popup | Task 7 + Task 8 |
| Offer — drag from TI, Offer Ticket Number required | Task 7 + Task 8 |
| Hired — drag from Offer, no popup, auto-fills position on count match | Task 7 + Task 2 (auto-fill logic) |
| Activity log — paginated, human-readable event descriptions | Task 9 |
| Assessment Levels managed from Dropdown Management | Task 2 |
| DB tables: screenings, batches, candidates, stages, log, board_status | Task 1 |
| All write endpoints log to position_board_log | Task 2 (positions.js routes) |

All requirements covered.

### Placeholder Scan

No TBD, TODO, or incomplete steps present.

### Type Consistency

- `positionId` — `useParams()` returns string, used as path segment in API calls — consistent throughout.
- `board.stages` — array of stage rows from backend — consumed in all stage columns with `s.stage === 'assessment'` etc. — consistent.
- `board.batches` — array with `.candidates` array nested — matches backend query that builds `batchMap` — consistent.
- `assessmentLevels` — from `mappings.assessment_levels`, passed as prop to `KanbanBoard` → `AssessmentColumn` — consistent.
- `candidateId` in draggable data → used as `candidate_id` in POST body to `/stages` — consistent.
- `UNIQUE (candidate_id)` in migration → backend UPSERT uses `ON CONFLICT (candidate_id)` — consistent.
- `writeLog` helper called in every write route — consistent.
- `queryKey: ['board', positionId]` — invalidated after every mutation in `positions.js` results — consistent via `qc.invalidateQueries(['board', positionId])` calls in all components.
