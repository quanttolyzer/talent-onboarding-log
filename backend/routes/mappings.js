const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/v1/mappings — all lookup data needed by forms
router.get('/', async (req, res, next) => {
  try {
    const [
      positions, departments, managers, countryCompanies,
      ticketStatuses, ticketTypes, managementTypes, actions, subActions, users,
    ] = await Promise.all([
      pool.query(`SELECT id, name FROM positions        WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM departments      WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM hiring_managers  WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, label AS name FROM country_companies WHERE is_active = true ORDER BY label`),
      pool.query(`SELECT id, name FROM ticket_statuses  WHERE is_active = true ORDER BY sort_order, name`),
      pool.query(`SELECT id, name FROM ticket_types     WHERE is_active = true ORDER BY sort_order, name`),
      pool.query(`SELECT id, name FROM management_types WHERE is_active = true ORDER BY sort_order, name`),
      pool.query(`SELECT id, name FROM actions          WHERE is_active = true ORDER BY sort_order, name`),
      pool.query(`SELECT id, action_name, name FROM sub_actions WHERE is_active = true ORDER BY action_name, sort_order, name`),
      pool.query(`SELECT id, name FROM users WHERE is_active = true ORDER BY name`),
    ]);

    res.json({
      positions:        positions.rows,
      departments:      departments.rows,
      hiring_managers:  managers.rows,
      country_companies: countryCompanies.rows,
      ticket_statuses:  ticketStatuses.rows,
      ticket_types:     ticketTypes.rows,
      management_types: managementTypes.rows,
      actions:          actions.rows,
      sub_actions:      subActions.rows,
      users:            users.rows,
    });
  } catch (err) { next(err); }
});

module.exports = router;
