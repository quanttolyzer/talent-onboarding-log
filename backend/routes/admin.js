const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Admin-only middleware
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Apply auth and admin middleware to all routes
router.use(authMiddleware);
router.use(adminMiddleware);

// ── USER MANAGEMENT ────────────────────────────────────────────

// GET /api/v1/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/users
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role = 'member' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, is_active, created_at',
      [name, email.toLowerCase(), passwordHash, role]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/users/:id
router.put('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;

    const { rows } = await pool.query(
      'UPDATE users SET name = $1, email = $2, role = $3, is_active = $4, updated_at = NOW() WHERE id = $5 RETURNING id, name, email, role, is_active, updated_at',
      [name, email.toLowerCase(), role, is_active, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/users/:id/password
router.put('/users/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email',
      [passwordHash, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successfully', user: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // FIX: was '$5' (typo — no other params), corrected to '$1'
    const { rows } = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully', user: rows[0] });
  } catch (err) { next(err); }
});

// ── DYNAMIC DROPDOWNS MANAGEMENT ──────────────────────────────

// GET /api/v1/admin/dropdowns
// FIX: response keys are now snake_case to match what every frontend
// component expects (mappings?.hiring_managers, mappings?.country_companies).
// Previously the keys were camelCase (hiringManagers / countryCompanies),
// which caused those dropdowns to always render empty.
router.get('/dropdowns', async (req, res, next) => {
  try {
    const [positions, departments, hiringManagers, countryCompanies] = await Promise.all([
      pool.query('SELECT * FROM positions ORDER BY name'),
      pool.query('SELECT * FROM departments ORDER BY name'),
      pool.query('SELECT * FROM hiring_managers ORDER BY name'),
      pool.query('SELECT * FROM country_companies ORDER BY label'),
    ]);

    res.json({
      positions:        positions.rows,
      departments:      departments.rows,
      hiring_managers:  hiringManagers.rows,    // FIX: was 'hiringManagers'
      country_companies: countryCompanies.rows, // FIX: was 'countryCompanies'
    });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/positions
router.post('/positions', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      'INSERT INTO positions (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/positions/:id
router.put('/positions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;

    const { rows } = await pool.query(
      'UPDATE positions SET name = $1, is_active = $2 WHERE id = $3 RETURNING *',
      [name, is_active, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Position not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/positions/:id
router.delete('/positions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM positions WHERE id = $1 RETURNING *', [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Position not found' });
    res.json({ message: 'Position deleted successfully' });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/departments
router.post('/departments', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      'INSERT INTO departments (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/departments/:id
router.put('/departments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;

    const { rows } = await pool.query(
      'UPDATE departments SET name = $1, is_active = $2 WHERE id = $3 RETURNING *',
      [name, is_active, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/departments/:id
router.delete('/departments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deleted successfully' });
  } catch (err) { next(err); }
});

// ── DATA EXPORT ────────────────────────────────────────────────

// GET /api/v1/admin/export/tickets
router.get('/export/tickets', async (req, res, next) => {
  try {
    const { format = 'csv' } = req.query;

    const { rows } = await pool.query(`
      SELECT
        t.ticket_number, t.ticket_type, t.ticket_status,
        t.entry_date, t.ticket_date, t.candidate_count,
        t.action, t.sub_action, t.remarks,
        p.name   AS position_name,
        d.name   AS department_name,
        hm.name  AS ultimate_hm_name,
        hm2.name AS direct_hm_name,
        cc.label AS country_company,
        u.name   AS task_owner_name,
        t.created_at, t.updated_at
      FROM tickets t
      LEFT JOIN positions       p   ON t.position_id        = p.id
      LEFT JOIN departments     d   ON t.department_id       = d.id
      LEFT JOIN hiring_managers hm  ON t.ultimate_hm_id      = hm.id
      LEFT JOIN hiring_managers hm2 ON t.direct_hm_id        = hm2.id
      LEFT JOIN country_companies cc ON t.country_company_id = cc.id
      LEFT JOIN users           u   ON t.task_owner_id       = u.id
      ORDER BY t.created_at DESC
    `);

    if (format === 'csv') {
      const csv = convertToCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="tickets-export.csv"');
      res.send(csv);
    } else {
      res.json(rows);
    }
  } catch (err) { next(err); }
});

// GET /api/v1/admin/export/users
router.get('/export/users', async (req, res, next) => {
  try {
    const { format = 'csv' } = req.query;

    const { rows } = await pool.query(`
      SELECT id, name, email, role, is_active, created_at, updated_at
      FROM users ORDER BY created_at DESC
    `);

    if (format === 'csv') {
      const csv = convertToCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
      res.send(csv);
    } else {
      res.json(rows);
    }
  } catch (err) { next(err); }
});

// ── SYSTEM STATS ───────────────────────────────────────────────

// GET /api/v1/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [userStats, ticketStats, recentActivity] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                        AS total_users,
          COUNT(*) FILTER (WHERE is_active = true)       AS active_users,
          COUNT(*) FILTER (WHERE role = 'admin')         AS admin_users,
          COUNT(*) FILTER (WHERE role = 'member')        AS member_users
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*)                                                  AS total_tickets,
          COUNT(*) FILTER (WHERE ticket_status = 'On-hold')        AS on_hold,
          COUNT(*) FILTER (WHERE ticket_status = 'In-Progress')    AS in_progress,
          COUNT(*) FILTER (WHERE ticket_status = 'Hired')          AS hired,
          COUNT(*) FILTER (WHERE ticket_status = 'Active')         AS active
        FROM tickets
      `),
      pool.query(`
        SELECT
          COUNT(*)                                           AS tickets_today,
          COUNT(*) FILTER (WHERE ticket_status = 'Hired')   AS hired_today
        FROM tickets
        WHERE created_at >= CURRENT_DATE
      `),
    ]);

    res.json({
      users:   userStats.rows[0],
      tickets: ticketStats.rows[0],
      today:   recentActivity.rows[0],
    });
  } catch (err) { next(err); }
});

// ── Helper ─────────────────────────────────────────────────────
function convertToCSV(data) {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const csvRows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      return typeof v === 'string' && v.includes(',')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    }).join(',')
  );
  return [headers.join(','), ...csvRows].join('\n');
}

module.exports = router;
