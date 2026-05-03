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

// GET /api/v1/admin/dropdowns — returns ALL editable dropdown tables
router.get('/dropdowns', async (req, res, next) => {
  try {
    const [
      positions, departments, hiringManagers, countryCompanies,
      ticketStatuses, ticketTypes, managementTypes, actions, subActions,
      autoFillRules,
    ] = await Promise.all([
      pool.query('SELECT id, name, is_active, created_at FROM positions ORDER BY name'),
      pool.query('SELECT id, name, is_active, created_at FROM departments ORDER BY name'),
      pool.query('SELECT id, name, is_active, created_at FROM hiring_managers ORDER BY name'),
      pool.query('SELECT id, label AS name, is_active, created_at FROM country_companies ORDER BY label'),
      pool.query('SELECT id, name, is_active, created_at FROM ticket_statuses ORDER BY sort_order, name'),
      pool.query('SELECT id, name, is_active, created_at FROM ticket_types ORDER BY sort_order, name'),
      pool.query('SELECT id, name, is_active, created_at FROM management_types ORDER BY sort_order, name'),
      pool.query('SELECT id, name, is_active, created_at FROM actions ORDER BY sort_order, name'),
      pool.query('SELECT id, action_name, name, is_active, created_at FROM sub_actions ORDER BY action_name, sort_order, name'),
      pool.query('SELECT id, action_value, sub_action_value, is_active, created_at FROM action_subaction_rules ORDER BY action_value'),
    ]);

    res.json({
      positions:              positions.rows,
      departments:            departments.rows,
      hiring_managers:        hiringManagers.rows,
      country_companies:      countryCompanies.rows,
      ticket_statuses:        ticketStatuses.rows,
      ticket_types:           ticketTypes.rows,
      management_types:       managementTypes.rows,
      actions:                actions.rows,
      sub_actions:            subActions.rows,
      action_subaction_rules: autoFillRules.rows,
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

// ── HIRING MANAGERS ────────────────────────────────────────────

// POST /api/v1/admin/hiring-managers
router.post('/hiring-managers', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO hiring_managers (name) VALUES ($1) RETURNING id, name, is_active, created_at',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/hiring-managers/:id
router.put('/hiring-managers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE hiring_managers SET name = $1, is_active = $2 WHERE id = $3 RETURNING id, name, is_active, created_at',
      [name, is_active, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Hiring manager not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/hiring-managers/:id
router.delete('/hiring-managers/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM hiring_managers WHERE id = $1 RETURNING *', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Hiring manager not found' });
    res.json({ message: 'Hiring manager deleted successfully' });
  } catch (err) { next(err); }
});

// ── COUNTRY / COMPANIES ────────────────────────────────────────

// POST /api/v1/admin/country-companies
router.post('/country-companies', async (req, res, next) => {
  try {
    const { name } = req.body;  // frontend sends "name"; store as label
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO country_companies (label) VALUES ($1) RETURNING id, label AS name, is_active, created_at',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/country-companies/:id
router.put('/country-companies/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE country_companies SET label = $1, is_active = $2 WHERE id = $3 RETURNING id, label AS name, is_active, created_at',
      [name, is_active, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Country/company not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/country-companies/:id
router.delete('/country-companies/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM country_companies WHERE id = $1 RETURNING *', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Country/company not found' });
    res.json({ message: 'Country/company deleted successfully' });
  } catch (err) { next(err); }
});

// ── GENERIC CRUD HELPER for simple name+is_active tables ──────
function makeCrud(table, notFoundMsg) {
  return {
    create: async (req, res, next) => {
      try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        const { rows } = await pool.query(
          `INSERT INTO ${table} (name) VALUES ($1) RETURNING id, name, is_active, created_at`, [name]
        );
        res.status(201).json(rows[0]);
      } catch (err) { next(err); }
    },
    update: async (req, res, next) => {
      try {
        const { name, is_active } = req.body;
        const { rows } = await pool.query(
          `UPDATE ${table} SET name = $1, is_active = $2 WHERE id = $3 RETURNING id, name, is_active, created_at`,
          [name, is_active, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: notFoundMsg });
        res.json(rows[0]);
      } catch (err) { next(err); }
    },
    del: async (req, res, next) => {
      try {
        const { rows } = await pool.query(
          `DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: notFoundMsg });
        res.json({ message: 'Deleted successfully' });
      } catch (err) { next(err); }
    },
  };
}

const tsCrud  = makeCrud('ticket_statuses',  'Ticket status not found');
const ttCrud  = makeCrud('ticket_types',     'Ticket type not found');
const mtCrud  = makeCrud('management_types', 'Management type not found');
const actCrud = makeCrud('actions',          'Action not found');

router.post('/ticket-statuses',        tsCrud.create);
router.put('/ticket-statuses/:id',     tsCrud.update);
router.delete('/ticket-statuses/:id',  tsCrud.del);

router.post('/ticket-types',           ttCrud.create);
router.put('/ticket-types/:id',        ttCrud.update);
router.delete('/ticket-types/:id',     ttCrud.del);

router.post('/management-types',       mtCrud.create);
router.put('/management-types/:id',    mtCrud.update);
router.delete('/management-types/:id', mtCrud.del);

router.post('/actions',                actCrud.create);
router.put('/actions/:id',             actCrud.update);
router.delete('/actions/:id',          actCrud.del);

// ── SUB-ACTIONS ────────────────────────────────────────────────

router.post('/sub-actions', async (req, res, next) => {
  try {
    const { action_name, name } = req.body;
    if (!action_name || !name) return res.status(400).json({ error: 'action_name and name are required' });
    const { rows } = await pool.query(
      `INSERT INTO sub_actions (action_name, name) VALUES ($1, $2)
       RETURNING id, action_name, name, is_active, created_at`,
      [action_name, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/sub-actions/:id', async (req, res, next) => {
  try {
    const { name, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE sub_actions SET name = $1, is_active = $2 WHERE id = $3
       RETURNING id, action_name, name, is_active, created_at`,
      [name, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sub-action not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/sub-actions/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM sub_actions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sub-action not found' });
    res.json({ message: 'Deleted successfully' });
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

// ── ACTION→SUB-ACTION AUTO-FILL RULES ─────────────────────────

router.get('/action-subaction-rules', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action_value, sub_action_value, is_active, created_at
       FROM action_subaction_rules ORDER BY action_value`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

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

router.delete('/action-subaction-rules/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM action_subaction_rules WHERE id = $1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { next(err); }
});

// ── DATE OVERRIDE ──────────────────────────────────────────────

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

// ── VISIBILITY GRANTS ──────────────────────────────────────────

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

router.delete('/users/:id/visibility/:target_id', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM user_visibility_grants WHERE viewer_id = $1 AND target_id = $2`,
      [req.params.id, req.params.target_id]
    );
    res.json({ message: 'Revoked' });
  } catch (err) { next(err); }
});

module.exports = router;
