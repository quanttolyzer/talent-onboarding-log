const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/v1/mappings — all lookup data in one call (for forms)
router.get('/', async (req, res, next) => {
  try {
    const [positions, departments, managers, countryCompanies] = await Promise.all([
      pool.query(`SELECT id, name FROM positions WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM departments WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM hiring_managers WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, label FROM country_companies WHERE is_active = true ORDER BY label`),
    ]);
    res.json({
      positions:       positions.rows,
      departments:     departments.rows,
      hiring_managers: managers.rows,
      country_companies: countryCompanies.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/mappings/positions
router.get('/positions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM positions WHERE is_active = true ORDER BY name`);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/mappings/positions (admin only)
router.post('/positions', requireRole('admin'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      `INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [name.trim()]
    );
    res.status(201).json(rows[0] || { message: 'Already exists' });
  } catch (err) { next(err); }
});

// GET /api/v1/mappings/departments
router.get('/departments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM departments WHERE is_active = true ORDER BY name`);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/v1/mappings/hiring-managers
router.get('/hiring-managers', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name FROM hiring_managers WHERE is_active = true ORDER BY name`);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/v1/mappings/country-companies
router.get('/country-companies', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, label, country, company FROM country_companies WHERE is_active = true ORDER BY label`);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
