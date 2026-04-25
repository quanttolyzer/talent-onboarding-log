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

// ── USER MANAGEMENT ────────────────────────────────────────

// GET /api/v1/admin/users - Get all users
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/users - Create new user
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role = 'member' } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if email already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, is_active, created_at',
      [name, email.toLowerCase(), passwordHash, role]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/users/:id - Update user
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

// PUT /api/v1/admin/users/:id/password - Reset user password
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

// DELETE /api/v1/admin/users/:id - Delete user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const { rows } = await pool.query('DELETE FROM users WHERE id = $5 RETURNING id, name, email', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully', user: rows[0] });
  } catch (err) { next(err); }
});

// ── DYNAMIC DROPDOWNS MANAGEMENT ───────────────────────────────

// GET /api/v1/admin/dropdowns - Get all dropdown data
router.get('/dropdowns', async (req, res, next) => {
  try {
    const [positions, departments, hiringManagers, countryCompanies] = await Promise.all([
      pool.query('SELECT * FROM positions ORDER BY name'),
      pool.query('SELECT * FROM departments ORDER BY name'),
      pool.query('SELECT * FROM hiring_managers ORDER BY name'),
      pool.query('SELECT * FROM country_companies ORDER BY label')
    ]);

    res.json({
      positions: positions.rows,
      departments: departments.rows,
      hiringManagers: hiringManagers.rows,
      countryCompanies: countryCompanies.rows
    });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/positions - Add position
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

// PUT /api/v1/admin/positions/:id - Update position
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

// DELETE /api/v1/admin/positions/:id - Delete position
router.delete('/positions/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM positions WHERE id = $1 RETURNING *', [id]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'Position not found' });
    res.json({ message: 'Position deleted successfully' });
  } catch (err) { next(err); }
});

// Similar endpoints for departments, hiring_managers, country_companies
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

router.delete('/departments/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deleted successfully' });
  } catch (err) { next(err); }
});

// ── DATA EXPORT ───────────────────────────────────────────

// GET /api/v1/admin/export/tickets - Export tickets data
router.get('/export/tickets', async (req, res, next) => {
  try {
    const { format = 'csv' } = req.query;
    
    const { rows } = await pool.query(`
      SELECT 
        t.ticket_number,
        t.ticket_type,
        t.ticket_status,
        t.entry_date,
        t.ticket_date,
        t.candidate_count,
        t.action,
        t.sub_action,
        t.remarks,
        p.name as position_name,
        d.name as department_name,
        hm.name as ultimate_hm_name,
        hm2.name as direct_hm_name,
        cc.label as country_company,
        u.name as task_owner_name,
        t.created_at,
        t.updated_at
      FROM tickets t
      LEFT JOIN positions p ON t.position_id = p.id
      LEFT JOIN departments d ON t.department_id = d.id
      LEFT JOIN hiring_managers hm ON t.ultimate_hm_id = hm.id
      LEFT JOIN hiring_managers hm2 ON t.direct_hm_id = hm2.id
      LEFT JOIN country_companies cc ON t.country_company_id = cc.id
      LEFT JOIN users u ON t.task_owner_id = u.id
      ORDER BY t.created_at DESC
    `);

    if (format === 'csv') {
      // Convert to CSV
      const csv = convertToCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="tickets-export.csv"');
      res.send(csv);
    } else {
      res.json(rows);
    }
  } catch (err) { next(err); }
});

// GET /api/v1/admin/export/users - Export users data
router.get('/export/users', async (req, res, next) => {
  try {
    const { format = 'csv' } = req.query;
    
    const { rows } = await pool.query(`
      SELECT id, name, email, role, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
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

// ── SYSTEM STATS ───────────────────────────────────────────

// GET /api/v1/admin/stats - Get system statistics
router.get('/stats', async (req, res, next) => {
  try {
    const [userStats, ticketStats, recentActivity] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE is_active = true) as active_users,
          COUNT(*) FILTER (WHERE role = 'admin') as admin_users,
          COUNT(*) FILTER (WHERE role = 'member') as member_users
        FROM users
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total_tickets,
          COUNT(*) FILTER (WHERE ticket_status = 'On-hold') as on_hold,
          COUNT(*) FILTER (WHERE ticket_status = 'In-Progress') as in_progress,
          COUNT(*) FILTER (WHERE ticket_status = 'Hired') as hired,
          COUNT(*) FILTER (WHERE ticket_status = 'Active') as active
        FROM tickets
      `),
      pool.query(`
        SELECT 
          COUNT(*) as tickets_today,
          COUNT(*) FILTER (WHERE ticket_status = 'Hired') as hired_today
        FROM tickets 
        WHERE created_at >= CURRENT_DATE
      `)
    ]);

    res.json({
      users: userStats.rows[0],
      tickets: ticketStats.rows[0],
      today: recentActivity.rows[0]
    });
  } catch (err) { next(err); }
});

// Helper function to convert array of objects to CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') 
        ? `"${value.replace(/"/g, '""')}"` 
        : value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = router;
