# Phase 1 — Main View Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the main view — visibility grants, wider search, 50/page table, column cleanup, admin-only edit/delete, date defaults, action→sub-action auto-fill, and the Update Progress flow.

**Architecture:** All DB changes ship in one SQL migration file run manually in Neon. Backend changes extend existing route files without restructuring. Frontend changes are isolated to the affected components; no new routing infrastructure for Phase 1 except a stub PositionPage so the position link doesn't 404.

**Tech Stack:** Node.js/Express (backend), React + TanStack Query + Zustand (frontend), PostgreSQL on Neon (DB), Axios (`api` wrapper), react-hot-toast.

**Spec:** `docs/superpowers/specs/2026-05-03-main-view-and-board-design.md` (Phase 1 sections)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/database/migration-phase1.sql` | All Phase 1 schema additions |
| Modify | `backend/routes/auth.js` | Expand `/me` to include date_override fields |
| Modify | `backend/routes/admin.js` | Visibility routes, date-override routes, action-subaction-rules CRUD |
| Modify | `backend/routes/tickets.js` | Expanded search, visibility filter, progress + updates routes |
| Modify | `backend/routes/mappings.js` | Include action_subaction_rules in response |
| Create | `frontend/src/pages/PositionPage.jsx` | Stub page for Phase 2 (prevents 404 on position link) |
| Modify | `frontend/src/App.jsx` | Add `/positions/:id` route |
| Modify | `frontend/src/store/authStore.js` | Store `date_override_enabled` + `date_override_expires_at` on user |
| Modify | `frontend/src/components/TicketModal.jsx` | Date default (read-only), auto-fill sub_action from rules |
| Modify | `frontend/src/components/admin/UserManagement.jsx` | Visibility tab + Date Override tab per user |
| Modify | `frontend/src/components/admin/DropdownManagement.jsx` | Auto-fill Rules tab |
| Create | `frontend/src/components/UpdateProgressModal.jsx` | In-place progress update + history view |
| Modify | `frontend/src/pages/DashboardPage.jsx` | LIMIT 50, column cleanup, admin-only actions, position link, Update Progress button |

---

## Task 1: DB Migration

**Files:**
- Create: `backend/database/migration-phase1.sql`

- [ ] **Step 1: Create the SQL file**

```sql
-- backend/database/migration-phase1.sql
-- Run ONCE in Neon SQL Editor (copy/paste entire file)

-- 1. Visibility grants
CREATE TABLE IF NOT EXISTS user_visibility_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, target_id)
);

-- 2. Date override columns on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_override_enabled    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_override_expires_at TIMESTAMPTZ;

-- 3. Ticket updates (progress history)
CREATE TABLE IF NOT EXISTS ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL,
  changes        JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_ticket_updates_ticket ON ticket_updates(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_updates_submitted_at ON ticket_updates(submitted_at DESC);

-- 4. Action→sub-action auto-fill rules
CREATE TABLE IF NOT EXISTS action_subaction_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_value    TEXT NOT NULL,
  sub_action_value TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_value)
);

-- 5. Seed initial rule
INSERT INTO action_subaction_rules (action_value, sub_action_value)
VALUES ('Open Ticket', 'Active Hiring Ticket')
ON CONFLICT (action_value) DO NOTHING;
```

- [ ] **Step 2: Run it in Neon**

Open the Neon SQL Editor, paste the entire file contents, click **Run**. Verify each statement completes without error. Check the "Tables" panel on the left — you should see `user_visibility_grants`, `ticket_updates`, `action_subaction_rules` listed. Check the `users` table columns to confirm `date_override_enabled` and `date_override_expires_at` are present.

- [ ] **Step 3: Commit**

```bash
git add backend/database/migration-phase1.sql
git commit -m "feat: add phase 1 migration (visibility grants, date override, ticket updates, auto-fill rules)"
```

---

## Task 2: Backend — Expand `/auth/me`

**Files:**
- Modify: `backend/routes/auth.js:73-81`

The existing `/me` endpoint returns only `id, name, email, role, created_at`. It needs `date_override_enabled` and `date_override_expires_at` so the frontend can decide whether to show a free date picker.

- [ ] **Step 1: Update the query in `GET /auth/me`**

In `backend/routes/auth.js`, replace the existing `/me` handler (lines 73–81) with:

```js
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, created_at,
              date_override_enabled,
              date_override_expires_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
# Replace TOKEN with a valid access token from login
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/v1/auth/me
```

Expected: JSON with `date_override_enabled: false` and `date_override_expires_at: null`.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/auth.js
git commit -m "feat: include date_override fields in /auth/me response"
```

---

## Task 3: Backend — Visibility Routes

**Files:**
- Modify: `backend/routes/admin.js`

Add three routes at the end of `admin.js`, before `module.exports`. All are already behind `adminMiddleware` via `router.use(adminMiddleware)` at the top of the file.

- [ ] **Step 1: Add visibility routes to `backend/routes/admin.js`**

Append before `module.exports = router;`:

```js
// ── VISIBILITY GRANTS ──────────────────────────────────────────

// GET /api/v1/admin/users/:id/visibility
router.get('/users/:id/visibility', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT g.target_id, u.name AS target_name
       FROM user_visibility_grants g
       JOIN users u ON u.id = g.target_id
       WHERE g.viewer_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/users/:id/visibility  body: { target_id }
router.post('/users/:id/visibility', async (req, res, next) => {
  try {
    const { target_id } = req.body;
    if (!target_id) return res.status(400).json({ error: 'target_id is required' });
    const { rows } = await pool.query(
      `INSERT INTO user_visibility_grants (viewer_id, target_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (viewer_id, target_id) DO NOTHING
       RETURNING *`,
      [req.params.id, target_id, req.user.id]
    );
    res.status(201).json(rows[0] || { message: 'Already granted' });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id/visibility/:target_id
router.delete('/users/:id/visibility/:target_id', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM user_visibility_grants WHERE viewer_id = $1 AND target_id = $2`,
      [req.params.id, req.params.target_id]
    );
    res.json({ message: 'Revoked' });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
# Get all users first, pick a viewer_id and target_id from the list
curl -H "Authorization: Bearer ADMIN_TOKEN" http://localhost:3001/api/v1/admin/users/VIEWER_ID/visibility
# Expected: [] (empty array)

curl -X POST -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"target_id":"TARGET_ID"}' \
  http://localhost:3001/api/v1/admin/users/VIEWER_ID/visibility
# Expected: 201 with the grant row

curl -H "Authorization: Bearer ADMIN_TOKEN" http://localhost:3001/api/v1/admin/users/VIEWER_ID/visibility
# Expected: [{ target_id: "TARGET_ID", target_name: "..." }]

curl -X DELETE -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3001/api/v1/admin/users/VIEWER_ID/visibility/TARGET_ID
# Expected: { message: "Revoked" }
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/admin.js
git commit -m "feat: add visibility grant/revoke admin routes"
```

---

## Task 4: Backend — Date Override Routes

**Files:**
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Add date-override routes to `backend/routes/admin.js`**

Append before `module.exports = router;`:

```js
// ── DATE OVERRIDE ──────────────────────────────────────────────

// POST /api/v1/admin/users/:id/date-override  body: { expires_at }
router.post('/users/:id/date-override', async (req, res, next) => {
  try {
    const { expires_at } = req.body;
    if (!expires_at) return res.status(400).json({ error: 'expires_at is required' });
    const { rows } = await pool.query(
      `UPDATE users
       SET date_override_enabled = true, date_override_expires_at = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, date_override_enabled, date_override_expires_at`,
      [expires_at, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id/date-override
router.delete('/users/:id/date-override', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET date_override_enabled = false, date_override_expires_at = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, date_override_enabled, date_override_expires_at`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
curl -X POST -H "Authorization: Bearer ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"expires_at":"2026-05-10T23:59:00Z"}' \
  http://localhost:3001/api/v1/admin/users/USER_ID/date-override
# Expected: { date_override_enabled: true, date_override_expires_at: "2026-05-10T23:59:00.000Z", ... }

curl -X DELETE -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:3001/api/v1/admin/users/USER_ID/date-override
# Expected: { date_override_enabled: false, date_override_expires_at: null, ... }
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/admin.js
git commit -m "feat: add date-override open/close admin routes"
```

---

## Task 5: Backend — Action→Sub-Action Rules Routes + Mappings

**Files:**
- Modify: `backend/routes/admin.js`
- Modify: `backend/routes/mappings.js`

- [ ] **Step 1: Add CRUD routes for auto-fill rules in `backend/routes/admin.js`**

Append before `module.exports = router;`:

```js
// ── ACTION→SUB-ACTION AUTO-FILL RULES ─────────────────────────

// GET /api/v1/admin/action-subaction-rules
router.get('/action-subaction-rules', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action_value, sub_action_value, is_active, created_at
       FROM action_subaction_rules ORDER BY action_value`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/action-subaction-rules
router.post('/action-subaction-rules', async (req, res, next) => {
  try {
    const { action_value, sub_action_value } = req.body;
    if (!action_value || !sub_action_value)
      return res.status(400).json({ error: 'action_value and sub_action_value are required' });
    const { rows } = await pool.query(
      `INSERT INTO action_subaction_rules (action_value, sub_action_value)
       VALUES ($1, $2) RETURNING *`,
      [action_value, sub_action_value]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/action-subaction-rules/:id
router.put('/action-subaction-rules/:id', async (req, res, next) => {
  try {
    const { action_value, sub_action_value, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE action_subaction_rules
       SET action_value = $1, sub_action_value = $2, is_active = $3
       WHERE id = $4 RETURNING *`,
      [action_value, sub_action_value, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/action-subaction-rules/:id
router.delete('/action-subaction-rules/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM action_subaction_rules WHERE id = $1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Add rules to `GET /admin/dropdowns` in `backend/routes/admin.js`**

In the `GET /admin/dropdowns` handler, add `action_subaction_rules` to the `Promise.all`:

```js
// Add to the destructured array at the top:
const [
  positions, departments, hiringManagers, countryCompanies,
  ticketStatuses, ticketTypes, managementTypes, actions, subActions,
  autoFillRules,  // ← add this
] = await Promise.all([
  // ... existing queries unchanged ...
  pool.query('SELECT id, action_name, name, is_active, created_at FROM sub_actions ORDER BY action_name, sort_order, name'),
  pool.query('SELECT id, action_value, sub_action_value, is_active, created_at FROM action_subaction_rules ORDER BY action_value'),  // ← add this
]);

// Add to the res.json object:
res.json({
  // ... existing keys unchanged ...
  sub_actions:            subActions.rows,
  action_subaction_rules: autoFillRules.rows,  // ← add this
});
```

- [ ] **Step 3: Add rules to `GET /api/v1/mappings` in `backend/routes/mappings.js`**

In `mappings.js`, add `action_subaction_rules` to the `Promise.all`:

```js
const [
  positions, departments, managers, countryCompanies,
  ticketStatuses, ticketTypes, managementTypes, actions, subActions, users,
  autoFillRules,  // ← add
] = await Promise.all([
  // ... existing queries unchanged ...
  pool.query(`SELECT id, name FROM users WHERE is_active = true ORDER BY name`),
  pool.query(`SELECT id, action_value, sub_action_value FROM action_subaction_rules WHERE is_active = true ORDER BY action_value`),  // ← add
]);

res.json({
  // ... existing keys unchanged ...
  users:                 users.rows,
  action_subaction_rules: autoFillRules.rows,  // ← add
});
```

- [ ] **Step 4: Verify**

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/v1/mappings
# Expected: response includes "action_subaction_rules": [{ "action_value": "Open Ticket", "sub_action_value": "Active Hiring Ticket" }]

curl -H "Authorization: Bearer ADMIN_TOKEN" http://localhost:3001/api/v1/admin/dropdowns
# Expected: response includes "action_subaction_rules": [...]
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/admin.js backend/routes/mappings.js
git commit -m "feat: add action-subaction auto-fill rules routes and include in mappings"
```

---

## Task 6: Backend — Expand Ticket Search + Visibility Filter

**Files:**
- Modify: `backend/routes/tickets.js`

Two changes to `GET /tickets`:
1. Expand the `search` ILIKE to cover all major text fields.
2. Add a visibility filter so non-admins only see their own + granted tickets.

- [ ] **Step 1: Replace the search condition block in `GET /tickets`**

Find the search condition (currently lines 43–51) and replace with:

```js
if (search) {
  conditions.push(`(
    t.ticket_number      ILIKE $${p} OR
    t.action             ILIKE $${p} OR
    t.sub_action         ILIKE $${p} OR
    t.remarks            ILIKE $${p} OR
    u.name               ILIKE $${p} OR
    pos.name             ILIKE $${p} OR
    dep.name             ILIKE $${p} OR
    uhm.name             ILIKE $${p} OR
    dhm.name             ILIKE $${p} OR
    cc.label             ILIKE $${p}
  )`);
  params.push(`%${search}%`); p++;
}
```

- [ ] **Step 2: Add visibility filter for non-admins**

After the `if (group_id)` condition block (around line 57), add:

```js
// Visibility: non-admins see only their own + granted tickets
if (req.user.role !== 'admin') {
  conditions.push(`t.task_owner_id IN (
    SELECT $${p}::uuid
    UNION
    SELECT target_id FROM user_visibility_grants WHERE viewer_id = $${p}::uuid
  )`);
  params.push(req.user.id); p++;
}
```

- [ ] **Step 3: Verify the count query also gets the LEFT JOINs**

The count query at line 63-66 only does `LEFT JOIN users u`. It needs the same joins for search to work on position/dept/HM names. Replace it with:

```js
const countRes = await pool.query(
  `SELECT COUNT(*) FROM tickets t
   LEFT JOIN users u             ON u.id   = t.task_owner_id
   LEFT JOIN positions pos       ON pos.id  = t.position_id
   LEFT JOIN departments dep     ON dep.id  = t.department_id
   LEFT JOIN hiring_managers uhm ON uhm.id  = t.ultimate_hm_id
   LEFT JOIN hiring_managers dhm ON dhm.id  = t.direct_hm_id
   LEFT JOIN country_companies cc ON cc.id  = t.country_company_id
   ${where}`,
  params
);
```

- [ ] **Step 4: Verify**

Start the backend (`node backend/server.js` or your dev command). Log in as a non-admin user and verify you can only see your own tickets. Log in as admin and verify all tickets are visible. Search for a position name in the search box — results should include tickets that contain that position name.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/tickets.js
git commit -m "feat: expand ticket search to all fields and add visibility filter for non-admins"
```

---

## Task 7: Backend — Progress Update Routes

**Files:**
- Modify: `backend/routes/tickets.js`

Add `POST /tickets/:id/progress` and `GET /tickets/:id/updates`.

- [ ] **Step 1: Add the progress update handler**

Append to `backend/routes/tickets.js` before `module.exports = router;`:

```js
// ── POST /tickets/:id/progress ────────────────────────────────
const EDITABLE_FIELDS = ['ticket_status','ticket_type','candidate_count','action','sub_action','remarks'];

router.post('/:id/progress', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [ticket] } = await client.query(
      'SELECT * FROM tickets WHERE id = $1', [req.params.id]
    );
    if (!ticket) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ticket not found' }); }

    // Date check
    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = req.body.entry_date || today;
    if (effectiveDate !== today) {
      const { rows: [u] } = await client.query(
        `SELECT date_override_enabled, date_override_expires_at FROM users WHERE id = $1`,
        [req.user.id]
      );
      const overrideActive = u.date_override_enabled &&
        u.date_override_expires_at &&
        new Date(u.date_override_expires_at) > new Date();
      if (!overrideActive) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Date override not active — entry_date must be today' });
      }
    }

    // Build diff
    const changes = [];
    const setClauses = [];
    const updateParams = [];
    let pi = 1;

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] === undefined) continue;
      const newVal = req.body[field];
      const oldVal = ticket[field];
      if (String(newVal ?? '') !== String(oldVal ?? '')) {
        changes.push({ field, old_value: oldVal ?? '', new_value: newVal ?? '' });
        setClauses.push(`${field} = $${pi++}`);
        updateParams.push(newVal);
        await writeAudit(client, ticket.id, req.user.id, field, oldVal, newVal);
      }
    }

    if (setClauses.length > 0) {
      updateParams.push(ticket.id);
      await client.query(
        `UPDATE tickets SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${pi}`,
        updateParams
      );
    }

    await client.query(
      `INSERT INTO ticket_updates (ticket_id, submitted_by, effective_date, changes)
       VALUES ($1, $2, $3, $4)`,
      [ticket.id, req.user.id, effectiveDate, JSON.stringify(changes)]
    );

    await client.query('COMMIT');
    const { rows: [updated] } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticket.id]);
    res.json(updated);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── GET /tickets/:id/updates ──────────────────────────────────
router.get('/:id/updates', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT tu.id, tu.submitted_at, tu.effective_date, tu.changes,
              u.name AS submitted_by_name
       FROM ticket_updates tu
       LEFT JOIN users u ON u.id = tu.submitted_by
       WHERE tu.ticket_id = $1
       ORDER BY tu.submitted_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify**

```bash
# Submit a progress update
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"ticket_status":"In-Progress","entry_date":"2026-05-03"}' \
  http://localhost:3001/api/v1/tickets/TICKET_ID/progress
# Expected: 200 with updated ticket

# Fetch history
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/v1/tickets/TICKET_ID/updates
# Expected: array with one entry, changes showing ticket_status diff
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/tickets.js
git commit -m "feat: add POST /tickets/:id/progress and GET /tickets/:id/updates routes"
```

---

## Task 8: Frontend — Update authStore with Date Override Fields

**Files:**
- Modify: `frontend/src/store/authStore.js`

The store needs to fetch date_override info from `/auth/me` on login and hydrate. This lets TicketModal check `user.date_override_enabled` and `user.date_override_expires_at` without an extra API call.

- [ ] **Step 1: Update `authStore.js`**

Replace the entire file with:

```js
import { create } from 'zustand';
import api from '../lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: () => {
    const token = localStorage.getItem('accessToken');
    const user  = localStorage.getItem('user');
    if (token && user) {
      set({ user: JSON.parse(user), isAuthenticated: true });
    }
  },

  refreshMe: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const updated = { ...stored, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      set(s => ({ user: { ...s.user, ...data } }));
    } catch (_) {}
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user, isAuthenticated: true });
    // Fetch full user info (includes date_override fields)
    try {
      const me = await api.get('/auth/me').then(r => r.data);
      const merged = { ...data.user, ...me };
      localStorage.setItem('user', JSON.stringify(merged));
      set({ user: merged });
    } catch (_) {}
    return data.user;
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuthenticated: false });
  },
}));
```

- [ ] **Step 2: Call `refreshMe` on app load in `App.jsx`**

In `frontend/src/App.jsx`, add a `useEffect` to refresh user info after hydration:

```jsx
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import RoleGuard from './components/RoleGuard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const hydrate    = useAuthStore((s) => s.hydrate);
  const refreshMe  = useAuthStore((s) => s.refreshMe);
  const isAuth     = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    hydrate();
  }, []);

  useEffect(() => {
    if (isAuth) refreshMe();
  }, [isAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e1e2e',
              color: '#cdd6f4',
              border: '1px solid rgba(255,255,255,0.1)',
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleGuard>
                  <AdminPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/positions/:positionId"
            element={
              <ProtectedRoute>
                <PositionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

Also add `import PositionPage from './pages/PositionPage';` to the imports in `App.jsx`.

- [ ] **Step 3: Create stub `PositionPage.jsx`**

Create `frontend/src/pages/PositionPage.jsx`:

```jsx
import { Link } from 'react-router-dom';

export default function PositionPage() {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>
        Position board — coming in Phase 2
      </p>
      <Link to="/" className="btn btn-ghost btn-sm">← Back to main view</Link>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Start the dev server. Open the browser. Log in. Open DevTools → Application → Local Storage. After login, the `user` key should now include `date_override_enabled: false` and `date_override_expires_at: null`. Navigating to `/positions/anything` should show the stub page, not the dashboard.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/authStore.js frontend/src/App.jsx frontend/src/pages/PositionPage.jsx
git commit -m "feat: refresh user date_override fields on login, add PositionPage stub route"
```

---

## Task 9: Frontend — TicketModal Date Default + Auto-fill

**Files:**
- Modify: `frontend/src/components/TicketModal.jsx`

Two changes:
1. `entry_date` is read-only for non-admins (or non-override users). It always defaults to today.
2. When `action` is set, auto-populate `sub_action` from `mappings.action_subaction_rules` if a match exists and no sub_action was already set.

- [ ] **Step 1: Read the full TicketModal to find where to make changes**

Read `frontend/src/components/TicketModal.jsx` lines 1–150 to locate the `set` function and the `entry_date` form group.

- [ ] **Step 2: Update the `set` function to auto-fill sub_action**

The `set` function currently (lines 54–60) resets `sub_action` when `action` changes. Replace it with:

```js
function set(field, value) {
  if (field === 'action') {
    const rule = (mappings?.action_subaction_rules || []).find(r => r.action_value === value);
    setForm(f => ({
      ...f,
      action: value,
      sub_action: rule ? rule.sub_action_value : '',
    }));
  } else {
    setForm(f => ({ ...f, [field]: value }));
  }
}
```

- [ ] **Step 3: Make `entry_date` read-only unless date override is active**

`TicketModal` receives `mappings` as a prop but not `user`. Import `useAuthStore` and compute `canEditDate`:

At the top of the component (after the import block, before `function empty()`):

```js
import { useAuthStore } from '../store/authStore';
```

Inside `TicketModal` component, add after `const isInline = mode === 'add';`:

```js
const user = useAuthStore((s) => s.user);
const canEditDate = user?.role === 'admin' || (
  user?.date_override_enabled === true &&
  user?.date_override_expires_at &&
  new Date(user.date_override_expires_at) > new Date()
);
```

- [ ] **Step 4: Update the `entry_date` form field rendering**

Find the `entry_date` form group in the JSX (it's in the form grid). Change it so non-override users see a read-only display:

```jsx
<div className="form-group">
  <label>Date *</label>
  {canEditDate ? (
    <input
      type="date"
      value={form.entry_date}
      onChange={e => set('entry_date', e.target.value)}
      required
    />
  ) : (
    <input
      type="date"
      value={form.entry_date}
      readOnly
      style={{ opacity: 0.7, cursor: 'not-allowed' }}
    />
  )}
</div>
```

- [ ] **Step 5: Verify**

Open the Add New Entry tab. The date field should show today's date and be read-only (greyed out) for a non-admin user. Select Action = "Open Ticket" — Sub-Action should auto-fill to "Active Hiring Ticket". Log in as admin → date field should be editable.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TicketModal.jsx
git commit -m "feat: date default read-only and action→sub-action auto-fill in TicketModal"
```

---

## Task 10: Frontend — UpdateProgressModal

**Files:**
- Create: `frontend/src/components/UpdateProgressModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/UpdateProgressModal.jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function UpdateProgressModal({ ticket, mappings, onClose, onSaved }) {
  const qc   = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const today = new Date().toISOString().slice(0, 10);
  const canEditDate = user?.role === 'admin' || (
    user?.date_override_enabled === true &&
    user?.date_override_expires_at &&
    new Date(user.date_override_expires_at) > new Date()
  );

  const [tab, setTab] = useState('update'); // 'update' | 'history'
  const [form, setForm] = useState({
    entry_date:    today,
    ticket_status: ticket.ticket_status || '',
    ticket_type:   ticket.ticket_type   || '',
    candidate_count: ticket.candidate_count || 1,
    action:        ticket.action        || '',
    sub_action:    ticket.sub_action    || '',
    remarks:       ticket.remarks       || '',
  });

  function set(field, value) {
    if (field === 'action') {
      const rule = (mappings?.action_subaction_rules || []).find(r => r.action_value === value);
      setForm(f => ({ ...f, action: value, sub_action: rule ? rule.sub_action_value : f.sub_action }));
    } else {
      setForm(f => ({ ...f, [field]: value }));
    }
  }

  const progressMutation = useMutation({
    mutationFn: (data) => api.post(`/tickets/${ticket.id}/progress`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['tickets']);
      toast.success('Progress updated');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const historyQuery = useQuery({
    queryKey: ['ticket-updates', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}/updates`).then(r => r.data),
    enabled: tab === 'history',
  });

  function handleSubmit(e) {
    e.preventDefault();
    progressMutation.mutate(form);
  }

  const statuses  = mappings?.ticket_statuses  || [];
  const types     = mappings?.ticket_types     || [];
  const actions   = mappings?.actions          || [];
  const allSubs   = mappings?.sub_actions      || [];
  const subActions = allSubs.filter(s => s.action_name === form.action);

  const overlayStyle = {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
  };
  const boxStyle = {
    background:'var(--bg-surface)', borderRadius:'var(--radius)',
    border:'1px solid var(--border)', width:'620px', maxWidth:'95vw',
    maxHeight:'90vh', overflowY:'auto', padding:'28px',
  };
  const tabBtn = (t) => ({
    padding:'8px 16px', background:'transparent', border:'none',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily:'var(--font)', fontWeight:600, fontSize:'0.85rem',
    cursor:'pointer', marginBottom:'-1px',
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h2 style={{ fontWeight:700, fontSize:'1.05rem' }}>
            Update Progress — {ticket.ticket_number}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Read-only ticket info */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'20px',
          padding:'12px', background:'var(--bg)', borderRadius:'var(--radius)', fontSize:'0.82rem' }}>
          <div><span style={{ color:'var(--text-2)' }}>Position: </span>{ticket.position_name || '—'}</div>
          <div><span style={{ color:'var(--text-2)' }}>Department: </span>{ticket.department_name || '—'}</div>
          <div><span style={{ color:'var(--text-2)' }}>Task Owner: </span>{ticket.task_owner_name || '—'}</div>
          <div><span style={{ color:'var(--text-2)' }}>Ticket Date: </span>{ticket.ticket_date?.slice(0,10) || '—'}</div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'4px', borderBottom:'1px solid var(--border)', marginBottom:'20px' }}>
          <button style={tabBtn('update')} onClick={() => setTab('update')}>Update</button>
          <button style={tabBtn('history')} onClick={() => setTab('history')}>History</button>
        </div>

        {tab === 'update' && (
          <form onSubmit={handleSubmit}>
            <div className="form-grid form-grid-2" style={{ marginBottom:'16px' }}>
              <div className="form-group">
                <label>Effective Date</label>
                {canEditDate ? (
                  <input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
                ) : (
                  <input type="date" value={form.entry_date} readOnly style={{ opacity:0.7, cursor:'not-allowed' }} />
                )}
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.ticket_status} onChange={e => set('ticket_status', e.target.value)}>
                  {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Ticket Type</label>
                <select value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
                  <option value="">— Select —</option>
                  {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Candidates</label>
                <input type="number" min="1" value={form.candidate_count}
                  onChange={e => set('candidate_count', parseInt(e.target.value, 10))} />
              </div>
              <div className="form-group">
                <label>Action</label>
                <select value={form.action} onChange={e => set('action', e.target.value)}>
                  <option value="">— Select —</option>
                  {actions.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Sub-Action</label>
                <select value={form.sub_action} onChange={e => set('sub_action', e.target.value)}>
                  <option value="">— Select —</option>
                  {subActions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom:'20px' }}>
              <label>Remarks</label>
              <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)}
                rows={3} style={{ resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={progressMutation.isLoading}>
                {progressMutation.isLoading ? 'Saving…' : 'Save Update'}
              </button>
            </div>
          </form>
        )}

        {tab === 'history' && (
          <div>
            {historyQuery.isLoading && <div className="spinner" style={{ margin:'20px auto' }} />}
            {historyQuery.data?.length === 0 && (
              <p style={{ color:'var(--text-2)', textAlign:'center', padding:'20px' }}>No updates yet.</p>
            )}
            {(historyQuery.data || []).map(entry => (
              <div key={entry.id} style={{
                borderBottom:'1px solid var(--border)', paddingBottom:'12px', marginBottom:'12px',
              }}>
                <div style={{ fontSize:'0.8rem', color:'var(--text-2)', marginBottom:'6px' }}>
                  <strong>{entry.submitted_by_name || 'Unknown'}</strong>
                  {' · '}
                  {new Date(entry.submitted_at).toLocaleString()}
                  {' · '}
                  Effective: {entry.effective_date?.slice(0,10)}
                </div>
                {(entry.changes || []).map((c, i) => (
                  <div key={i} style={{ fontSize:'0.8rem', marginLeft:'8px' }}>
                    <span style={{ color:'var(--text-2)' }}>{c.field}: </span>
                    <span style={{ textDecoration:'line-through', color:'var(--text-3)' }}>{String(c.old_value)}</span>
                    {' → '}
                    <span style={{ color:'var(--primary)' }}>{String(c.new_value)}</span>
                  </div>
                ))}
                {(!entry.changes || entry.changes.length === 0) && (
                  <div style={{ fontSize:'0.8rem', color:'var(--text-3)', marginLeft:'8px' }}>No field changes recorded.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/UpdateProgressModal.jsx
git commit -m "feat: add UpdateProgressModal with progress update form and history tab"
```

---

## Task 11: Frontend — DashboardPage Table Cleanup

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`

Changes:
- `LIMIT` 100 → 50
- Remove Clone state and CloneModal
- Remove status dropdown from actions column
- Show Edit/Delete only for admins
- Add Update Progress button (all users)
- Import UpdateProgressModal
- Hide Sub-Action, Remarks, Group columns
- Make Position cell a link to `/positions/:id`
- Expand table height

- [ ] **Step 1: Update imports and state**

At the top of `DashboardPage.jsx`, add:

```js
import { Link, useNavigate } from 'react-router-dom';
import UpdateProgressModal from '../components/UpdateProgressModal';
```

Replace existing state declarations — change:
- `const LIMIT = 100;` → `const LIMIT = 50;`
- Remove `const [cloneRows, setCloneRows] = useState(null);`
- Add `const [progressTicket, setProgressTicket] = useState(null);`

- [ ] **Step 2: Update COL_COUNT**

`COL_COUNT` is currently 19. With Sub-Action, Remarks, Group, and the status dropdown removed, and adding Update Progress column instead: the new visible columns are Checkbox + 14 data columns + Actions = 16.

```js
const COL_COUNT = 16;
```

- [ ] **Step 3: Remove Clone button from the bulk-action bar**

Find the block with `Clone ({selected.size})` button and delete that button entirely. Keep Edit and Delete.

- [ ] **Step 4: Update the table header**

Replace the current `<thead>` content. Remove Sub-Action, Remarks, Group column headers. The new header order:

```jsx
<tr>
  <th style={{ width:'36px', position:'sticky', left:0, zIndex:6, background:'var(--bg)' }}>
    <input type="checkbox" checked={selected.size === tickets.length && tickets.length > 0}
      onChange={toggleAll} style={{ width:'auto' }} />
  </th>
  <th>Date</th>
  <th>Task Owner</th>
  <th>Ticket #</th>
  <th>Ticket Type</th>
  <th>Status</th>
  <th>Ticket Date</th>
  <th>Position</th>
  <th>Mgmt Type</th>
  <th>Department</th>
  <th>Ultimate HM</th>
  <th>Direct HM</th>
  <th>Country & Company</th>
  <th style={{ textAlign:'center' }}>Candidates</th>
  <th>Action</th>
  <th style={{ position:'sticky', right:0, zIndex:6, background:'var(--bg)' }}>Actions</th>
</tr>
```

- [ ] **Step 5: Update the table body rows**

In the `tickets.map(ticket => ...)` block:

1. Remove the Sub-Action, Remarks, and Group `<td>` cells entirely.
2. Make Position a link:

```jsx
<td style={{ maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
  {ticket.position_id ? (
    <Link
      to={`/positions/${ticket.position_id}`}
      style={{ color:'var(--primary)', textDecoration:'none', fontWeight:500 }}
    >
      {ticket.position_name || '—'}
    </Link>
  ) : (ticket.position_name || '—')}
</td>
```

3. Replace the Actions sticky `<td>` content:

```jsx
<td style={{
  position:'sticky', right:0,
  background:stickyBg(isSelected), zIndex:4,
  borderRight: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
  transition:'border-color 0.15s',
}}>
  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
    <button className="btn btn-ghost btn-xs" onClick={() => setProgressTicket(ticket)} title="Update Progress">
      📝
    </button>
    {user?.role === 'admin' && <>
      <button className="btn btn-ghost btn-xs" onClick={() => setEditTicket(ticket)} title="Edit">✏️</button>
      <button className="btn btn-danger btn-xs" onClick={() => confirmDelete([ticket.id])} title="Delete">🗑</button>
    </>}
  </div>
</td>
```

- [ ] **Step 6: Expand table max-height**

Find `maxHeight: 'calc(100vh - 360px)'` and change to `maxHeight: 'calc(100vh - 300px)'`.

- [ ] **Step 7: Render UpdateProgressModal**

At the bottom of the `tab === 'search'` section (after the table and pagination), add:

```jsx
{progressTicket && (
  <UpdateProgressModal
    ticket={progressTicket}
    mappings={mappingsQuery.data}
    onClose={() => setProgressTicket(null)}
    onSaved={() => setProgressTicket(null)}
  />
)}
```

Also remove the `{cloneRows && <CloneModal ... />}` block entirely (and delete the `CloneModal` import).

- [ ] **Step 8: Verify**

Open the dashboard in the browser:
- Table shows 50 rows max with correct pagination
- Sub-Action, Remarks, Group columns are gone
- Position is a blue link; clicking it navigates to `/positions/<id>` showing the stub page
- No Clone button in bulk actions
- Admin user: Edit ✏️ and Delete 🗑 buttons appear alongside 📝
- Non-admin user: only 📝 appears
- Click 📝 on any row — UpdateProgressModal opens with the ticket's current values

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat: table cleanup — 50/page, hide columns, admin-only edit/delete, position link, update progress button"
```

---

## Task 12: Frontend — Admin UserManagement — Visibility & Date Override

**Files:**
- Modify: `frontend/src/components/admin/UserManagement.jsx`

Add a "Manage Access" button per user row that opens a modal with two tabs: Visibility (who this user can see) and Date Override (grant/revoke date editing).

- [ ] **Step 1: Add state for the access modal**

In `UserManagement`, add:

```js
const [accessUser, setAccessUser] = useState(null); // null or a user object
```

- [ ] **Step 2: Add "Access" button to each user row**

In the user table row (where Edit, Reset Password, Delete buttons are), add:

```jsx
<button className="btn btn-ghost btn-xs" onClick={() => setAccessUser(user)} title="Manage Access">
  🔐
</button>
```

- [ ] **Step 3: Add the UserAccessModal component**

At the bottom of `UserManagement.jsx` (before the `export default`), add:

```jsx
function UserAccessModal({ user, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('visibility');
  const [expiresAt, setExpiresAt] = useState('');

  // All users for the visibility checklist
  const allUsersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  });

  // Current visibility grants for this user
  const grantsQuery = useQuery({
    queryKey: ['user-visibility', user.id],
    queryFn: () => api.get(`/admin/users/${user.id}/visibility`).then(r => r.data),
  });

  // User's current date override status
  const meQuery = useQuery({
    queryKey: ['admin-user-detail', user.id],
    queryFn: () => api.get('/admin/users').then(r => r.data.find(u => u.id === user.id)),
  });

  const grantMutation = useMutation({
    mutationFn: (target_id) => api.post(`/admin/users/${user.id}/visibility`, { target_id }),
    onSuccess: () => qc.invalidateQueries(['user-visibility', user.id]),
    onError: (e) => toast.error(e.response?.data?.error || 'Grant failed'),
  });

  const revokeMutation = useMutation({
    mutationFn: (target_id) => api.delete(`/admin/users/${user.id}/visibility/${target_id}`),
    onSuccess: () => qc.invalidateQueries(['user-visibility', user.id]),
    onError: (e) => toast.error(e.response?.data?.error || 'Revoke failed'),
  });

  const openOverrideMutation = useMutation({
    mutationFn: () => api.post(`/admin/users/${user.id}/date-override`, { expires_at: expiresAt }),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); qc.invalidateQueries(['admin-user-detail', user.id]); toast.success('Date override opened'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const closeOverrideMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${user.id}/date-override`),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); qc.invalidateQueries(['admin-user-detail', user.id]); toast.success('Date override closed'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const grantedIds = new Set((grantsQuery.data || []).map(g => g.target_id));
  const otherUsers = (allUsersQuery.data || []).filter(u => u.id !== user.id && u.is_active);
  const targetUser = meQuery.data;
  const overrideActive = targetUser?.date_override_enabled &&
    targetUser?.date_override_expires_at &&
    new Date(targetUser.date_override_expires_at) > new Date();

  function toggleGrant(targetId) {
    if (grantedIds.has(targetId)) {
      revokeMutation.mutate(targetId);
    } else {
      grantMutation.mutate(targetId);
    }
  }

  const overlayStyle = {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
  };
  const boxStyle = {
    background:'var(--bg-surface)', borderRadius:'var(--radius)',
    border:'1px solid var(--border)', width:'500px', maxWidth:'95vw',
    maxHeight:'80vh', overflowY:'auto', padding:'24px',
  };
  const tabBtn = (t) => ({
    padding:'8px 16px', background:'transparent', border:'none',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily:'var(--font)', fontWeight:600, fontSize:'0.85rem',
    cursor:'pointer', marginBottom:'-1px',
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ fontWeight:700 }}>Access — {user.name}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:'20px' }}>
          <button style={tabBtn('visibility')} onClick={() => setTab('visibility')}>Visibility</button>
          <button style={tabBtn('date-override')} onClick={() => setTab('date-override')}>Date Override</button>
        </div>

        {tab === 'visibility' && (
          <div>
            <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginBottom:'12px' }}>
              Check the users whose tickets <strong>{user.name}</strong> can see (in addition to their own).
            </p>
            {grantsQuery.isLoading || allUsersQuery.isLoading
              ? <div className="spinner" style={{ margin:'20px auto' }} />
              : otherUsers.map(u => (
                <label key={u.id} style={{ display:'flex', alignItems:'center', gap:'10px',
                  padding:'8px 0', borderBottom:'1px solid var(--border)', cursor:'pointer', fontSize:'0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={grantedIds.has(u.id)}
                    onChange={() => toggleGrant(u.id)}
                    style={{ width:'auto' }}
                  />
                  {u.name}
                  <span style={{ color:'var(--text-3)', fontSize:'0.78rem' }}>{u.email}</span>
                </label>
              ))
            }
          </div>
        )}

        {tab === 'date-override' && (
          <div>
            <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginBottom:'16px' }}>
              Allow <strong>{user.name}</strong> to enter a custom date (not just today) when adding or updating entries.
            </p>
            {overrideActive ? (
              <div>
                <p style={{ fontSize:'0.88rem', marginBottom:'12px' }}>
                  ✅ Active until:{' '}
                  <strong>{new Date(targetUser.date_override_expires_at).toLocaleString()}</strong>
                </p>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => closeOverrideMutation.mutate()}
                  disabled={closeOverrideMutation.isLoading}
                >
                  Close Window Now
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize:'0.88rem', color:'var(--text-3)', marginBottom:'12px' }}>Inactive</p>
                <div className="form-group" style={{ marginBottom:'12px' }}>
                  <label>Expires at</label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openOverrideMutation.mutate()}
                  disabled={!expiresAt || openOverrideMutation.isLoading}
                >
                  Open Window
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render the modal**

In `UserManagement`'s JSX, at the bottom (before the closing `</div>`), add:

```jsx
{accessUser && (
  <UserAccessModal user={accessUser} onClose={() => setAccessUser(null)} />
)}
```

- [ ] **Step 5: Verify**

Open Admin → User Management. Each user row should have a 🔐 button. Click it — the modal opens with Visibility and Date Override tabs. In Visibility, check another user — the grant should apply immediately (toggle off to revoke). In Date Override, set a future datetime and click Open Window — the status shows "Active until...". Click Close Window Now — status reverts to Inactive.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/UserManagement.jsx
git commit -m "feat: add visibility and date override management per user in admin panel"
```

---

## Task 13: Frontend — Admin DropdownManagement — Auto-fill Rules Tab

**Files:**
- Modify: `frontend/src/components/admin/DropdownManagement.jsx`

Add `action-subaction-rules` as a new section with special two-column rendering (action_value → sub_action_value).

- [ ] **Step 1: Add the new section to the SECTIONS array**

In `DropdownManagement.jsx`, append to the `SECTIONS` array:

```js
{ id: 'action-subaction-rules', label: 'Auto-fill Rules' },
```

- [ ] **Step 2: Update `dataKey` to handle the hyphen correctly**

The existing `dataKey` function converts `'ticket-statuses'` → `'ticket_statuses'`. `'action-subaction-rules'` → `'action_subaction_rules'`. This already works with the existing `replace(/-/g, '_')` pattern.

Verify the `GET /admin/dropdowns` now returns `action_subaction_rules` (from Task 5). If it does, `raw['action_subaction_rules']` will be the array.

- [ ] **Step 3: Add special rendering for the auto-fill rules section**

The existing component renders a table with `item.name`. For the rules section, items have `action_value` and `sub_action_value` instead. Find the table body row rendering (the `tableItems.map(item => ...)` block) and add a condition:

```jsx
// In the table header area, add a conditional:
const isAutoFillRules = activeSection === 'action-subaction-rules';
```

In the table header row, conditionally show different columns:

```jsx
<tr>
  <th>{isAutoFillRules ? 'Action' : 'Name'}</th>
  {isAutoFillRules && <th>Sub-Action Auto-fill</th>}
  <th>Active</th>
  <th>Created</th>
  <th style={{ textAlign:'right' }}>Actions</th>
</tr>
```

In the table body row:

```jsx
<td>
  {isAutoFillRules ? item.action_value : item.name}
</td>
{isAutoFillRules && <td>{item.sub_action_value}</td>}
```

- [ ] **Step 4: Update the Create/Edit modal to handle two fields**

Find the `CreateModal` and `EditModal` components (or the inline modal logic). When `isAutoFillRules`, show two inputs instead of one name input:

In `CreateModal` (or wherever the create form renders):

```jsx
{isAutoFillRules ? (
  <>
    <div className="form-group">
      <label>Action Value</label>
      <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Open Ticket" />
    </div>
    <div className="form-group">
      <label>Sub-Action Value</label>
      <input value={newSubValue} onChange={e => setNewSubValue(e.target.value)} placeholder="e.g. Active Hiring Ticket" />
    </div>
  </>
) : (
  <div className="form-group">
    <label>Name</label>
    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Enter name" />
  </div>
)}
```

Add `const [newSubValue, setNewSubValue] = useState('');` to the component state.

The `createMutation` payload should be `{ name: newName }` for regular sections and `{ action_value: newName, sub_action_value: newSubValue }` for auto-fill rules:

```js
const payload = isAutoFillRules
  ? { action_value: newName, sub_action_value: newSubValue }
  : { name: newName };
createMutation.mutate(payload);
```

Apply the same dual-field pattern to the edit modal, setting `action_value` and `sub_action_value` in the PUT body.

- [ ] **Step 5: Verify**

Open Admin → Dropdown Management → Auto-fill Rules tab. You should see the seeded rule: `Open Ticket → Active Hiring Ticket`. Add a new rule, edit it, delete it — all should work. Return to the dashboard, add a new entry, select the action that has a rule — sub-action should auto-fill.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/DropdownManagement.jsx
git commit -m "feat: add auto-fill rules tab to dropdown management"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Task(s) |
|-------------|---------|
| Each user sees own work | Task 6 (visibility filter), Task 3 (admin routes) |
| Admin controls who sees whose tickets | Task 3 + Task 12 (UI) |
| 50 results per page | Task 11 (`LIMIT = 50`) |
| Search catches all fields | Task 6 (expanded ILIKE) |
| Date defaults to today, admin can grant date edit | Task 1 (migration), Task 4 (routes), Task 8 (store), Task 9 (TicketModal), Task 12 (admin UI) |
| Open Ticket → Active Hiring Ticket auto-fill | Task 1 (seed), Task 5 (routes), Task 9 (TicketModal), Task 13 (admin UI) |
| Edit/Delete admin only | Task 11 (`user?.role === 'admin'` guard) |
| Clone hidden | Task 11 (removed from UI) |
| Actions dropdown hidden | Task 11 (removed from actions column) |
| Sub-Action, Remarks, Group hidden | Task 11 (columns removed from table) |
| Position clickable → full page | Task 8 (route), Task 11 (Link) |
| Update Progress flow | Task 7 (backend), Task 10 (modal) |

All spec requirements are covered.

### Placeholder Scan

No TBD, TODO, or incomplete steps found.

### Type Consistency

- `user_visibility_grants` table uses `viewer_id` / `target_id` — consistent across Task 1 SQL, Task 3 routes, Task 12 UI.
- `date_override_enabled` / `date_override_expires_at` — consistent across Task 1, Task 2, Task 4, Task 8, Task 9, Task 12.
- `action_subaction_rules` → `action_value` / `sub_action_value` — consistent across Task 1, Task 5, Task 9, Task 13.
- `ticket_updates` → `ticket_id`, `submitted_by`, `effective_date`, `changes` — consistent across Task 1, Task 7, Task 10.
- `progressTicket` state in DashboardPage → passed as `ticket` prop to `UpdateProgressModal` — consistent.
