# Visibility Control & Progress Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user ticket visibility scoping and replace the clone flow with an in-place progress update system that records a structured history per ticket.

**Architecture:** Visibility is enforced server-side by injecting a `task_owner_id IN (...)` subquery into `GET /tickets` for non-admin users. Progress updates write to a new `ticket_updates` table (JSONB changes per session) and update the ticket in-place. Admin panel gains per-user Visibility and Date Override controls in a new Settings modal.

**Tech Stack:** Node.js / Express / PostgreSQL (Neon), React / TanStack Query v4, Zustand, react-hot-toast.

---

## File Map

**Create:**
- `backend/database/migration-visibility-progress.sql` — DB schema additions
- `frontend/src/components/UpdateProgressModal.jsx` — replaces CloneModal
- `frontend/src/components/TicketHistoryPanel.jsx` — per-ticket update timeline

**Modify:**
- `backend/routes/auth.js` — update GET /me to return date override fields; update login response
- `backend/routes/tickets.js` — add visibility filter to GET; add POST /:id/progress and GET /:id/updates
- `backend/routes/admin.js` — add GET/POST/DELETE /users/:id/visibility; POST/DELETE /users/:id/date-override; include date override fields in GET /users
- `frontend/src/store/authStore.js` — add refreshUser action, update hydrate to call it
- `frontend/src/pages/DashboardPage.jsx` — remove clone, add Update Progress + History buttons and modals
- `frontend/src/components/admin/UserManagement.jsx` — add per-user Settings modal with Visibility and Date Override panels

**Delete:**
- `frontend/src/components/CloneModal.jsx` — removed in Task 10

---

### Task 1: Run DB migration

**Files:**
- Create: `backend/database/migration-visibility-progress.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/database/migration-visibility-progress.sql` with:

```sql
-- ============================================================
-- Migration: visibility grants + ticket updates + date override
-- Run in Neon SQL Editor
-- ============================================================

-- Visibility grants: who can see whose tickets
CREATE TABLE user_visibility_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, target_id)
);

CREATE INDEX idx_uvg_viewer ON user_visibility_grants(viewer_id);

-- Progress update snapshots per ticket
CREATE TABLE ticket_updates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  submitted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE NOT NULL,
  changes        JSONB NOT NULL
);

CREATE INDEX idx_ticket_updates_ticket    ON ticket_updates(ticket_id);
CREATE INDEX idx_ticket_updates_submitted ON ticket_updates(submitted_at DESC);

-- Date override window per user
ALTER TABLE users
  ADD COLUMN date_override_enabled    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN date_override_expires_at TIMESTAMPTZ;
```

- [ ] **Step 2: Run the migration in Neon**

Open your Neon SQL Editor and run the contents of `backend/database/migration-visibility-progress.sql`.

Verify with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_visibility_grants', 'ticket_updates');
-- Should return 2 rows

SELECT column_name FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('date_override_enabled', 'date_override_expires_at');
-- Should return 2 rows
```

- [ ] **Step 3: Commit**

```bash
git add backend/database/migration-visibility-progress.sql
git commit -m "feat: add migration for visibility grants, ticket_updates, date override"
```

---

### Task 2: Update auth routes to expose date override fields

**Files:**
- Modify: `backend/routes/auth.js`
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Update GET /auth/me query in `backend/routes/auth.js`**

Find the `GET /me` handler and replace the SELECT query:

```javascript
// GET /api/v1/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, created_at,
              date_override_enabled, date_override_expires_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Update POST /auth/login to include date override in the returned user object**

Find the `res.json(...)` call inside the login handler and replace it:

```javascript
res.json({
  accessToken:  signAccess(user),
  refreshToken: signRefresh(user),
  user: {
    id:                       user.id,
    name:                     user.name,
    email:                    user.email,
    role:                     user.role,
    date_override_enabled:    user.date_override_enabled,
    date_override_expires_at: user.date_override_expires_at,
  },
});
```

- [ ] **Step 3: Update GET /admin/users in `backend/routes/admin.js`**

Find the `GET /users` handler and replace the SELECT:

```javascript
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active, created_at,
              date_override_enabled, date_override_expires_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Verify with curl** (start backend first: `cd backend && node server.js`)

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@talent.internal","password":"Admin@123"}' | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const j=JSON.parse(d);
console.log('user keys:', Object.keys(j.user||{}));
"
```

Expected output includes `date_override_enabled` and `date_override_expires_at`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/auth.js backend/routes/admin.js
git commit -m "feat: expose date_override fields in /auth/me, login, and admin/users"
```

---

### Task 3: Apply ticket visibility filter in GET /tickets

**Files:**
- Modify: `backend/routes/tickets.js`

- [ ] **Step 1: Add visibility scope block to GET `/` handler**

In `backend/routes/tickets.js`, inside the `GET /` handler, after the `let p = 1;` line and before the `if (search)` block, insert:

```javascript
// Non-admin users: scope to own tickets + visibility grants
if (req.user.role !== 'admin') {
  conditions.push(`t.task_owner_id IN (
    SELECT uvg.target_id FROM user_visibility_grants uvg WHERE uvg.viewer_id = $${p}
    UNION ALL
    SELECT $${p}::uuid
  )`);
  params.push(req.user.id); p++;
}
```

- [ ] **Step 2: Verify with curl**

Log in as a member user (non-admin). Confirm the response only contains tickets owned by that user (and any granted users — none yet, so only their own).

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"MEMBER_EMAIL","password":"MEMBER_PASS"}' | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
process.stdout.write(JSON.parse(d).accessToken);
")

curl -s "http://localhost:3000/api/v1/tickets?limit=200" \
  -H "Authorization: Bearer $TOKEN" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const j=JSON.parse(d);
const names=[...new Set(j.data.map(t=>t.task_owner_name))];
console.log('total:', j.total, '— owners:', names);
"
```

Expected: only the member's own name in the owners list.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/tickets.js
git commit -m "feat: scope GET /tickets to owned+granted tickets for non-admin users"
```

---

### Task 4: Add visibility grant admin routes

**Files:**
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Add visibility routes to `backend/routes/admin.js`**

After the `DELETE /users/:id` handler block and before the `// ── DYNAMIC DROPDOWNS MANAGEMENT` comment, insert:

```javascript
// ── VISIBILITY GRANTS ──────────────────────────────────────────

// GET /api/v1/admin/users/:id/visibility
router.get('/users/:id/visibility', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT uvg.target_id AS id, u.name, u.email
       FROM user_visibility_grants uvg
       JOIN users u ON u.id = uvg.target_id
       WHERE uvg.viewer_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/users/:id/visibility
router.post('/users/:id/visibility', async (req, res, next) => {
  try {
    const { target_id } = req.body;
    if (!target_id) return res.status(400).json({ error: 'target_id is required' });
    if (target_id === req.params.id) return res.status(400).json({ error: 'Cannot grant visibility to self' });

    await pool.query(
      `INSERT INTO user_visibility_grants (viewer_id, target_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (viewer_id, target_id) DO NOTHING`,
      [req.params.id, target_id, req.user.id]
    );
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id/visibility/:target_id
router.delete('/users/:id/visibility/:target_id', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM user_visibility_grants WHERE viewer_id = $1 AND target_id = $2`,
      [req.params.id, req.params.target_id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
# List all users to get IDs (replace TOKEN with admin token from Task 2)
curl -s http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $TOKEN" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
JSON.parse(d).forEach(u => console.log(u.id, u.name, u.role));
"
```

Pick VIEWER_ID (a member) and TARGET_ID (another user), then:

```bash
# Grant
curl -s -X POST http://localhost:3000/api/v1/admin/users/VIEWER_ID/visibility \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"target_id":"TARGET_ID"}'
# Expected: {"success":true}

# List
curl -s http://localhost:3000/api/v1/admin/users/VIEWER_ID/visibility \
  -H "Authorization: Bearer $TOKEN"
# Expected: array with one entry

# Revoke
curl -s -X DELETE http://localhost:3000/api/v1/admin/users/VIEWER_ID/visibility/TARGET_ID \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"success":true}
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/admin.js
git commit -m "feat: add visibility grant admin routes (GET/POST/DELETE)"
```

---

### Task 5: Add date-override admin routes

**Files:**
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Insert date-override routes after the visibility grants block**

```javascript
// ── DATE OVERRIDE WINDOW ───────────────────────────────────────

// POST /api/v1/admin/users/:id/date-override — open window
router.post('/users/:id/date-override', async (req, res, next) => {
  try {
    const { expires_at } = req.body;
    if (!expires_at) return res.status(400).json({ error: 'expires_at is required' });

    const expiresDate = new Date(expires_at);
    if (isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      return res.status(400).json({ error: 'expires_at must be a valid future datetime' });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET date_override_enabled = true, date_override_expires_at = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, name, date_override_enabled, date_override_expires_at`,
      [expires_at, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id/date-override — close window early
router.delete('/users/:id/date-override', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET date_override_enabled = false, date_override_expires_at = null, updated_at = now()
       WHERE id = $1
       RETURNING id, name, date_override_enabled`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
USER_ID="paste-a-member-user-id-here"

# Open window
curl -s -X POST http://localhost:3000/api/v1/admin/users/$USER_ID/date-override \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"expires_at":"2026-12-31T23:59:59Z"}'
# Expected: {id, name, date_override_enabled: true, date_override_expires_at: "..."}

# Close early
curl -s -X DELETE http://localhost:3000/api/v1/admin/users/$USER_ID/date-override \
  -H "Authorization: Bearer $TOKEN"
# Expected: {id, name, date_override_enabled: false}
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/admin.js
git commit -m "feat: add date-override admin routes (open/close window)"
```

---

### Task 6: Add progress update and history routes

**Files:**
- Modify: `backend/routes/tickets.js`

- [ ] **Step 1: Add POST /:id/progress and GET /:id/updates before `module.exports`**

In `backend/routes/tickets.js`, before the final `module.exports = router;` line, insert:

```javascript
// ── POST /tickets/:id/progress ────────────────────────────────
router.post('/:id/progress', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [ticket] } = await client.query(
      'SELECT * FROM tickets WHERE id = $1', [req.params.id]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const EDITABLE_FIELDS = [
      'ticket_status', 'entry_date', 'ticket_type',
      'candidate_count', 'action', 'sub_action', 'remarks',
    ];

    // Validate date override if entry_date differs from today
    const today = new Date().toISOString().slice(0, 10);
    if (req.body.entry_date && req.body.entry_date !== today) {
      const { rows: [u] } = await client.query(
        `SELECT date_override_enabled, date_override_expires_at FROM users WHERE id = $1`,
        [req.user.id]
      );
      const overrideActive = u?.date_override_enabled &&
        u?.date_override_expires_at &&
        new Date(u.date_override_expires_at) > new Date();
      if (!overrideActive) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Date override not permitted — contact admin to open the access window' });
      }
    }

    // Compute changes and build update
    const changes = [];
    const updates = [];
    const params  = [];
    let p = 1;

    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] === undefined) continue;
      const newVal = req.body[field];
      const oldVal = ticket[field];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes.push({ field, old_value: String(oldVal ?? ''), new_value: String(newVal ?? '') });
        await writeAudit(client, ticket.id, req.user.id, field, oldVal, newVal);
      }
      updates.push(`${field} = $${p++}`);
      params.push(newVal);
    }

    if (!updates.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(ticket.id);
    await client.query(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${p}`,
      params
    );

    const effectiveDate = req.body.entry_date || today;
    await client.query(
      `INSERT INTO ticket_updates (ticket_id, submitted_by, effective_date, changes)
       VALUES ($1, $2, $3, $4)`,
      [ticket.id, req.user.id, effectiveDate, JSON.stringify(changes)]
    );

    await client.query('COMMIT');

    const { rows: [updated] } = await pool.query(`
      SELECT t.*,
        u.name  AS task_owner_name,   pos.name  AS position_name,
        dep.name AS department_name,  uhm.name  AS ultimate_hm_name,
        dhm.name AS direct_hm_name,   cc.label  AS country_company_label,
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
    `, [ticket.id]);

    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── GET /tickets/:id/updates ──────────────────────────────────
router.get('/:id/updates', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT tu.*, u.name AS submitted_by_name
      FROM ticket_updates tu
      LEFT JOIN users u ON u.id = tu.submitted_by
      WHERE tu.ticket_id = $1
      ORDER BY tu.submitted_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify with curl**

```bash
# Get a ticket ID
TICKET_ID=$(curl -s "http://localhost:3000/api/v1/tickets?limit=1" \
  -H "Authorization: Bearer $TOKEN" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
process.stdout.write(JSON.parse(d).data[0].id);
")

# Submit progress update
curl -s -X POST http://localhost:3000/api/v1/tickets/$TICKET_ID/progress \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ticket_status":"In-Progress","remarks":"First progress update"}' | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const t=JSON.parse(d);
console.log('updated status:', t.ticket_status, '— remarks:', t.remarks);
"

# Check history
curl -s http://localhost:3000/api/v1/tickets/$TICKET_ID/updates \
  -H "Authorization: Bearer $TOKEN" | node -e "
const d=require('fs').readFileSync('/dev/stdin','utf8');
const rows=JSON.parse(d);
console.log('update count:', rows.length);
console.log('changes:', JSON.stringify(rows[0]?.changes));
"
```

Expected: update count 1, changes array contains the two changed fields.

- [ ] **Step 3: Commit**

```bash
git add backend/routes/tickets.js
git commit -m "feat: add POST /:id/progress and GET /:id/updates ticket routes"
```

---

### Task 7: Update authStore to refresh user on hydrate

**Files:**
- Modify: `frontend/src/store/authStore.js`

- [ ] **Step 1: Replace the full content of `frontend/src/store/authStore.js`**

```javascript
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
      // Refresh from server to pick up date_override_enabled changes
      api.get('/auth/me')
        .then(r => {
          set({ user: r.data });
          localStorage.setItem('user', JSON.stringify(r.data));
        })
        .catch(() => {});
    }
  },

  refreshUser: async () => {
    const { data } = await api.get('/auth/me');
    set({ user: data });
    localStorage.setItem('user', JSON.stringify(data));
    return data;
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    set({ user: data.user, isAuthenticated: true });
    return data.user;
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuthenticated: false });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/authStore.js
git commit -m "feat: add refreshUser to authStore, hydrate fetches fresh user from /auth/me"
```

---

### Task 8: Create UpdateProgressModal

**Files:**
- Create: `frontend/src/components/UpdateProgressModal.jsx`

- [ ] **Step 1: Create `frontend/src/components/UpdateProgressModal.jsx`**

```jsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

const today = () => new Date().toISOString().slice(0, 10);

export default function UpdateProgressModal({ ticket, mappings, onClose, onSaved }) {
  const user = useAuthStore((s) => s.user);

  const dateOverrideActive =
    user?.date_override_enabled &&
    user?.date_override_expires_at &&
    new Date(user.date_override_expires_at) > new Date();

  const [form, setForm] = useState({
    ticket_status:   ticket.ticket_status   || '',
    entry_date:      ticket.entry_date?.slice(0, 10) || today(),
    ticket_type:     ticket.ticket_type     || '',
    candidate_count: ticket.candidate_count || 1,
    action:          ticket.action          || '',
    sub_action:      ticket.sub_action      || '',
    remarks:         ticket.remarks         || '',
  });

  function set(k, v) {
    if (k === 'action') {
      setForm(f => ({ ...f, action: v, sub_action: '' }));
    } else {
      setForm(f => ({ ...f, [k]: v }));
    }
  }

  const ticketStatuses = mappings?.ticket_statuses || [];
  const ticketTypes    = mappings?.ticket_types    || [];
  const actions        = mappings?.actions         || [];
  const allSubActions  = mappings?.sub_actions     || [];
  const subActions     = allSubActions.filter(s => s.action_name === form.action);

  const mutation = useMutation({
    mutationFn: () => api.post(`/tickets/${ticket.id}/progress`, form).then(r => r.data),
    onSuccess: (updated) => onSaved(updated),
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <div>
            <h2 style={{ fontWeight:700 }}>Update Progress</h2>
            <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginTop:'4px' }}>
              Ticket <strong>{ticket.ticket_number}</strong> — changes are recorded with a timestamp.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Locked fields */}
        <div style={{
          background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
          borderRadius:'var(--radius-sm)', padding:'12px 16px', marginBottom:'20px', fontSize:'0.82rem',
        }}>
          <div style={{ color:'var(--text-3)', fontWeight:600, marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>
            🔒 Locked
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', color:'var(--text-2)' }}>
            <span>📅 Ticket Date: <strong>{ticket.ticket_date?.slice(0, 10) || '—'}</strong></span>
            <span>📌 {ticket.position_name || '—'}</span>
            <span>🏢 {ticket.department_name || '—'}</span>
            <span>👤 {ticket.ultimate_hm_name || '—'}</span>
            <span>🌍 {ticket.country_company_label || '—'}</span>
            <span>👔 {ticket.task_owner_name || '—'}</span>
          </div>
        </div>

        {/* Editable fields */}
        <div className="form-grid form-grid-2" style={{ marginBottom:'18px' }}>

          <div className="form-group">
            <label>
              Entry Date
              {dateOverrideActive && (
                <span style={{ fontSize:'0.75rem', color:'var(--primary)', marginLeft:'6px' }}>✓ date override active</span>
              )}
            </label>
            <input
              type="date"
              value={form.entry_date}
              onChange={e => set('entry_date', e.target.value)}
              readOnly={!dateOverrideActive}
              style={!dateOverrideActive ? { opacity:0.5, cursor:'not-allowed' } : {}}
            />
          </div>

          <div className="form-group">
            <label>Status</label>
            <select value={form.ticket_status} onChange={e => set('ticket_status', e.target.value)}>
              {ticketStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Ticket Type</label>
            <select value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
              {ticketTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Candidates</label>
            <input
              type="number" min="1"
              value={form.candidate_count}
              onChange={e => set('candidate_count', Number(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label>Action</label>
            <select value={form.action} onChange={e => set('action', e.target.value)}>
              <option value="">— select —</option>
              {actions.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Sub-Action</label>
            <select value={form.sub_action} onChange={e => set('sub_action', e.target.value)}
              disabled={!form.action}>
              <option value="">— select —</option>
              {subActions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn:'span 2' }}>
            <label>Remarks</label>
            <input
              value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
              placeholder="Add remarks…"
            />
          </div>
        </div>

        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || mutation.isLoading}
          >
            {(mutation.isPending || mutation.isLoading)
              ? <><span className="spinner" style={{ width:16, height:16 }} /> Saving…</>
              : 'Save Update'}
          </button>
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/UpdateProgressModal.jsx
git commit -m "feat: add UpdateProgressModal component"
```

---

### Task 9: Create TicketHistoryPanel

**Files:**
- Create: `frontend/src/components/TicketHistoryPanel.jsx`

- [ ] **Step 1: Create `frontend/src/components/TicketHistoryPanel.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const FIELD_LABELS = {
  ticket_status:   'Status',
  entry_date:      'Entry Date',
  ticket_type:     'Ticket Type',
  candidate_count: 'Candidates',
  action:          'Action',
  sub_action:      'Sub-Action',
  remarks:         'Remarks',
};

export default function TicketHistoryPanel({ ticket, onClose }) {
  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['ticket-updates', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}/updates`).then(r => r.data),
  });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth:'620px' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <div>
            <h2 style={{ fontWeight:700 }}>Update History</h2>
            <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginTop:'4px' }}>
              Ticket <strong>{ticket.ticket_number}</strong>
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {isLoading && (
          <div style={{ textAlign:'center', padding:'40px' }}>
            <div className="spinner" style={{ margin:'0 auto' }} />
          </div>
        )}

        {!isLoading && updates.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
            No progress updates recorded yet.
          </div>
        )}

        {!isLoading && updates.map((upd, i) => (
          <div key={upd.id} style={{
            borderLeft: '3px solid var(--primary)',
            paddingLeft: '16px',
            marginBottom: i < updates.length - 1 ? '24px' : 0,
          }}>
            <div style={{ display:'flex', gap:'12px', alignItems:'baseline', marginBottom:'8px' }}>
              <span style={{ fontWeight:600, fontSize:'0.9rem' }}>{upd.submitted_by_name || 'Unknown'}</span>
              <span style={{ fontSize:'0.78rem', color:'var(--text-3)', fontFamily:'var(--mono)' }}>
                {new Date(upd.submitted_at).toLocaleString()}
              </span>
              {upd.effective_date && (
                <span style={{ fontSize:'0.78rem', color:'var(--text-2)' }}>
                  · effective {upd.effective_date.slice(0, 10)}
                </span>
              )}
            </div>

            {Array.isArray(upd.changes) && upd.changes.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {upd.changes.map((c, ci) => (
                  <div key={ci} style={{ fontSize:'0.82rem', display:'flex', gap:'8px', alignItems:'center' }}>
                    <span style={{ color:'var(--text-3)', minWidth:'110px' }}>
                      {FIELD_LABELS[c.field] || c.field}
                    </span>
                    <span style={{ color:'var(--danger)', textDecoration:'line-through' }}>{c.old_value || '—'}</span>
                    <span style={{ color:'var(--text-3)' }}>→</span>
                    <span style={{ color:'var(--success)' }}>{c.new_value || '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize:'0.82rem', color:'var(--text-2)' }}>No field changes recorded.</span>
            )}
          </div>
        ))}

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TicketHistoryPanel.jsx
git commit -m "feat: add TicketHistoryPanel component"
```

---

### Task 10: Wire DashboardPage — remove clone, add Update Progress + History

**Files:**
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Delete: `frontend/src/components/CloneModal.jsx`

- [ ] **Step 1: Update imports**

In `frontend/src/pages/DashboardPage.jsx`, replace:
```javascript
import CloneModal from '../components/CloneModal';
```
With:
```javascript
import UpdateProgressModal from '../components/UpdateProgressModal';
import TicketHistoryPanel from '../components/TicketHistoryPanel';
```

- [ ] **Step 2: Replace `cloneRows` state with two new state variables**

Replace:
```javascript
const [cloneRows,  setCloneRows]  = useState(null);
```
With:
```javascript
const [updateTicket,  setUpdateTicket]  = useState(null);
const [historyTicket, setHistoryTicket] = useState(null);
```

- [ ] **Step 3: Remove the bulk Clone button from the filter row**

Find and delete this button from the `selected.size > 0 && <> ... </>` block:
```jsx
<button className="btn btn-ghost btn-sm" onClick={() => setCloneRows(selectedTickets)}>
  Clone ({selected.size})
</button>
```

- [ ] **Step 4: Add 🔄 and 📋 buttons to each row's sticky Actions cell**

Find the per-row actions `<div>` inside the sticky `<td>`. It currently has the status `<select>`, ✏️, and 🗑. Add two buttons before ✏️:

```jsx
<div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
  <select
    value={ticket.ticket_status}
    onChange={e => statusMutation.mutate({ id: ticket.id, status: e.target.value })}
    style={{ width:'auto', minWidth:'110px', fontSize:'0.78rem', padding:'5px 8px' }}
  >
    {(mappingsQuery.data?.ticket_statuses || FALLBACK_STATUSES.map(s => ({ id: s, name: s }))).map(s => (
      <option key={s.id || s} value={s.name || s}>{s.name || s}</option>
    ))}
  </select>
  <button className="btn btn-ghost btn-xs" onClick={() => setUpdateTicket(ticket)} title="Update Progress">🔄</button>
  <button className="btn btn-ghost btn-xs" onClick={() => setHistoryTicket(ticket)} title="View History">📋</button>
  <button className="btn btn-ghost btn-xs" onClick={() => setEditTicket(ticket)} title="Edit">✏️</button>
  <button className="btn btn-danger btn-xs" onClick={() => confirmDelete([ticket.id])} title="Delete">🗑</button>
</div>
```

- [ ] **Step 5: Replace the CloneModal render with UpdateProgressModal and TicketHistoryPanel**

Find and remove the entire `{cloneRows && (<CloneModal ... />)}` block.

Replace it with:
```jsx
{updateTicket && (
  <UpdateProgressModal
    ticket={updateTicket}
    mappings={mappingsQuery.data}
    onClose={() => setUpdateTicket(null)}
    onSaved={() => {
      qc.invalidateQueries(['tickets']);
      setUpdateTicket(null);
      toast.success('Progress saved!');
    }}
  />
)}

{historyTicket && (
  <TicketHistoryPanel
    ticket={historyTicket}
    onClose={() => setHistoryTicket(null)}
  />
)}
```

- [ ] **Step 6: Delete CloneModal**

```bash
git rm frontend/src/components/CloneModal.jsx
```

- [ ] **Step 7: Start dev server and test in browser**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. Verify:
- Log in as a **member** — dashboard shows only their own tickets
- Each row has 🔄 and 📋 in the Actions column; no Clone button anywhere
- Clicking 🔄 opens Update Progress modal with locked fields shown and editable fields pre-filled with the ticket's current values
- Submitting saves with "Progress saved!" toast and the row updates in-place
- Clicking 📋 opens History panel showing the update just submitted (submitter, timestamp, field diff)
- Log in as **admin** — all tickets visible, same 🔄 📋 buttons work

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/DashboardPage.jsx
git commit -m "feat: replace clone flow with Update Progress and History in DashboardPage"
```

---

### Task 11: Add Visibility and Date Override panels to UserManagement

**Files:**
- Modify: `frontend/src/components/admin/UserManagement.jsx`

- [ ] **Step 1: Add `settingsUser` state to the `UserManagement` component**

After the existing `const [showPasswordReset, setShowPasswordReset] = useState(null);` line, add:
```javascript
const [settingsUser, setSettingsUser] = useState(null);
```

- [ ] **Step 2: Add ⚙️ button to each user row's actions cell**

Find the actions `<td>` in the users table body. Add a ⚙️ button as the first button:

```jsx
<td>
  <div style={{ display: 'flex', gap: '6px' }}>
    <button
      className="btn btn-ghost btn-xs"
      onClick={() => setSettingsUser(user)}
      title="Visibility & Date Override"
    >
      ⚙️
    </button>
    <button
      className="btn btn-ghost btn-xs"
      onClick={() => setEditingUser(user)}
    >
      ✏️
    </button>
    <button
      className="btn btn-ghost btn-xs"
      onClick={() => setShowPasswordReset(user.id)}
    >
      🔑
    </button>
    <button
      className="btn btn-danger btn-xs"
      onClick={() => {
        if (window.confirm(`Delete user ${user.name}? This cannot be undone.`)) {
          deleteUserMutation.mutate(user.id);
        }
      }}
    >
      🗑️
    </button>
  </div>
</td>
```

- [ ] **Step 3: Add `UserSettingsModal` render**

After the `{showPasswordReset && (<PasswordResetModal .../>)}` block, add:
```jsx
{settingsUser && (
  <UserSettingsModal
    user={settingsUser}
    allUsers={users.filter(u => u.id !== settingsUser.id && u.is_active)}
    onClose={() => setSettingsUser(null)}
    onUpdated={() => qc.invalidateQueries(['admin-users'])}
  />
)}
```

- [ ] **Step 4: Add `UserSettingsModal`, `VisibilityPanel`, and `DateOverridePanel` at the bottom of the file**

Append after `PasswordResetModal`:

```jsx
function UserSettingsModal({ user, allUsers, onClose, onUpdated }) {
  const [activeTab, setActiveTab] = useState('visibility');

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0,
      background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000,
    }}>
      <div style={{
        background:'var(--bg-surface)', borderRadius:'var(--radius)',
        padding:'24px', width:'100%', maxWidth:'520px',
        border:'1px solid var(--border)', maxHeight:'80vh', display:'flex', flexDirection:'column',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ margin:0 }}>Settings — {user.name}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display:'flex', gap:'4px', borderBottom:'1px solid var(--border)', marginBottom:'16px' }}>
          {[['visibility','👁 Visibility'],['date-override','📅 Date Override']].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              padding:'8px 16px', background:'transparent', border:'none',
              borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === key ? 'var(--text-1)' : 'var(--text-2)',
              fontFamily:'var(--font)', fontWeight:600, fontSize:'0.85rem',
              cursor:'pointer', marginBottom:'-1px',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:'auto' }}>
          {activeTab === 'visibility' && (
            <VisibilityPanel userId={user.id} allUsers={allUsers} onUpdated={onUpdated} />
          )}
          {activeTab === 'date-override' && (
            <DateOverridePanel user={user} onUpdated={onUpdated} />
          )}
        </div>
      </div>
    </div>
  );
}

function VisibilityPanel({ userId, allUsers, onUpdated }) {
  const qc = useQueryClient();

  const grantsQuery = useQuery({
    queryKey: ['user-visibility', userId],
    queryFn: () => api.get(`/admin/users/${userId}/visibility`).then(r => r.data),
  });

  const grantedIds = new Set((grantsQuery.data || []).map(u => u.id));

  const grantMutation = useMutation({
    mutationFn: (target_id) => api.post(`/admin/users/${userId}/visibility`, { target_id }),
    onSuccess: () => { qc.invalidateQueries(['user-visibility', userId]); onUpdated(); toast.success('Visibility granted'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const revokeMutation = useMutation({
    mutationFn: (target_id) => api.delete(`/admin/users/${userId}/visibility/${target_id}`),
    onSuccess: () => { qc.invalidateQueries(['user-visibility', userId]); onUpdated(); toast.success('Visibility revoked'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  if (grantsQuery.isLoading) return <div style={{ textAlign:'center', padding:'20px' }}><div className="spinner" style={{ margin:'0 auto' }} /></div>;

  return (
    <div>
      <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginBottom:'12px' }}>
        This user sees their own tickets by default. Check boxes below to also grant access to others' tickets.
      </p>
      {allUsers.length === 0 && <p style={{ color:'var(--text-3)', fontSize:'0.82rem' }}>No other active users.</p>}
      {allUsers.map(u => (
        <label key={u.id} style={{
          display:'flex', alignItems:'center', gap:'10px',
          padding:'8px 0', borderBottom:'1px solid var(--border)', cursor:'pointer',
        }}>
          <input
            type="checkbox"
            style={{ width:'auto' }}
            checked={grantedIds.has(u.id)}
            onChange={e => {
              if (e.target.checked) grantMutation.mutate(u.id);
              else revokeMutation.mutate(u.id);
            }}
          />
          <span style={{ fontWeight:500 }}>{u.name}</span>
          <span style={{ fontSize:'0.78rem', color:'var(--text-3)', fontFamily:'var(--mono)' }}>{u.email}</span>
        </label>
      ))}
    </div>
  );
}

function DateOverridePanel({ user: initialUser, onUpdated }) {
  const qc = useQueryClient();
  const [expiresAt, setExpiresAt] = useState('');

  // Re-read from the admin-users cache so the panel updates after open/close
  const usersInCache = qc.getQueryData(['admin-users']) || [];
  const user = usersInCache.find(u => u.id === initialUser.id) || initialUser;

  const isActive = user.date_override_enabled &&
    user.date_override_expires_at &&
    new Date(user.date_override_expires_at) > new Date();

  const openMutation = useMutation({
    mutationFn: () => api.post(`/admin/users/${user.id}/date-override`, { expires_at: expiresAt }),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); onUpdated(); toast.success('Date override window opened'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${user.id}/date-override`),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); onUpdated(); toast.success('Date override closed'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div>
      <div style={{
        padding:'12px 16px', borderRadius:'var(--radius-sm)',
        border:'1px solid var(--border)', marginBottom:'16px',
        background: isActive ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ fontWeight:600, marginBottom:'4px' }}>
          {isActive
            ? <span style={{ color:'var(--success)' }}>✓ Active</span>
            : <span style={{ color:'var(--text-3)' }}>Inactive</span>}
        </div>
        {isActive && user.date_override_expires_at && (
          <div style={{ fontSize:'0.82rem', color:'var(--text-2)' }}>
            Expires: {new Date(user.date_override_expires_at).toLocaleString()}
          </div>
        )}
      </div>

      {isActive ? (
        <button
          className="btn btn-danger btn-sm"
          onClick={() => closeMutation.mutate()}
          disabled={closeMutation.isPending || closeMutation.isLoading}
        >
          Close Now
        </button>
      ) : (
        <div style={{ display:'flex', gap:'10px', alignItems:'flex-end' }}>
          <div className="form-group" style={{ flex:1, margin:0 }}>
            <label>Expires at</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => openMutation.mutate()}
            disabled={!expiresAt || openMutation.isPending || openMutation.isLoading}
          >
            Open Window
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Navigate to `/admin` → User Management. For any non-admin user:

- Click ⚙️ — Settings modal opens with Visibility and Date Override tabs
- **Visibility tab:** all other active users listed with unchecked boxes; check one → "Visibility granted" toast; log in as that user and confirm they now see both their own tickets AND the granted user's tickets
- **Date Override tab:** shows "Inactive"; set a future datetime, click "Open Window" → status shows "Active until [date]"; click "Close Now" → resets to "Inactive"
- After opening date override: log in as that user, click 🔄 on any ticket → Entry Date field is now freely editable (not grayed out)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/UserManagement.jsx
git commit -m "feat: add UserSettingsModal with Visibility and Date Override panels"
```
