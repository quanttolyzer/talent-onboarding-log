const router  = require('express').Router();
const pool    = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// All ticket routes require auth
router.use(authMiddleware);

// ── Helper: write audit log ───────────────────────────────────
async function writeAudit(client, ticketId, userId, fieldName, oldVal, newVal) {
  await client.query(
    `INSERT INTO audit_log (ticket_id, changed_by, field_name, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [ticketId, userId, fieldName, String(oldVal ?? ''), String(newVal ?? '')]
  );
}

// ── Helper: generate group code ───────────────────────────────
function generateGroupCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `POS-${date}-${rand}`;
}

// ── GET /tickets ──────────────────────────────────────────────
// Supports: page, limit, search, status, ticket_type, task_owner_id,
//           position_id, department_id, entry_date_from, entry_date_to
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1, limit = 100,
      search = '',
      status, ticket_type, task_owner_id,
      position_id, department_id,
      entry_date_from, entry_date_to,
      group_id,
    } = req.query;

    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
    const conditions = [];
    const params = [];
    let p = 1;

    if (search) {
      conditions.push(`(
        t.ticket_number ILIKE $${p} OR
        t.remarks ILIKE $${p} OR
        t.sub_action ILIKE $${p} OR
        u.name ILIKE $${p}
      )`);
      params.push(`%${search}%`); p++;
    }
    if (status)          { conditions.push(`t.ticket_status = $${p++}`);  params.push(status); }
    if (ticket_type)     { conditions.push(`t.ticket_type = $${p++}`);    params.push(ticket_type); }
    if (task_owner_id)   { conditions.push(`t.task_owner_id = $${p++}`);  params.push(task_owner_id); }
    if (position_id)     { conditions.push(`t.position_id = $${p++}`);    params.push(position_id); }
    if (department_id)   { conditions.push(`t.department_id = $${p++}`);  params.push(department_id); }
    if (group_id)        { conditions.push(`t.group_id = $${p++}`);       params.push(group_id); }
    if (entry_date_from) { conditions.push(`t.entry_date >= $${p++}`);    params.push(entry_date_from); }
    if (entry_date_to)   { conditions.push(`t.entry_date <= $${p++}`);    params.push(entry_date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM tickets t LEFT JOIN users u ON u.id = t.task_owner_id ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(`
      SELECT
        t.*,
        u.name          AS task_owner_name,
        pos.name        AS position_name,
        dep.name        AS department_name,
        uhm.name        AS ultimate_hm_name,
        dhm.name        AS direct_hm_name,
        cc.label        AS country_company_label,
        tg.group_code   AS group_code
      FROM tickets t
      LEFT JOIN users u             ON u.id   = t.task_owner_id
      LEFT JOIN positions pos       ON pos.id  = t.position_id
      LEFT JOIN departments dep     ON dep.id  = t.department_id
      LEFT JOIN hiring_managers uhm ON uhm.id  = t.ultimate_hm_id
      LEFT JOIN hiring_managers dhm ON dhm.id  = t.direct_hm_id
      LEFT JOIN country_companies cc ON cc.id  = t.country_company_id
      LEFT JOIN ticket_groups tg    ON tg.id   = t.group_id
      ${where}
      ORDER BY t.entry_date DESC, t.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, Number(limit), offset]);

    res.json({
      data:  dataRes.rows,
      total,
      page:  Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) { next(err); }
});

// ── GET /tickets/filter-options ───────────────────────────────
router.get('/filter-options', async (req, res, next) => {
  try {
    const [statuses, types, owners, positions, departments] = await Promise.all([
      pool.query(`SELECT DISTINCT ticket_status AS value FROM tickets ORDER BY 1`),
      pool.query(`SELECT DISTINCT ticket_type   AS value FROM tickets ORDER BY 1`),
      pool.query(`SELECT id, name FROM users WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM positions WHERE is_active = true ORDER BY name`),
      pool.query(`SELECT id, name FROM departments WHERE is_active = true ORDER BY name`),
    ]);
    res.json({
      statuses:    statuses.rows.map(r => r.value),
      types:       types.rows.map(r => r.value),
      owners:      owners.rows,
      positions:   positions.rows,
      departments: departments.rows,
    });
  } catch (err) { next(err); }
});

// ── GET /tickets/:id ──────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*,
        u.name AS task_owner_name, pos.name AS position_name,
        dep.name AS department_name, uhm.name AS ultimate_hm_name,
        dhm.name AS direct_hm_name, cc.label AS country_company_label,
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
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Ticket not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /tickets ─────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      entry_date, ticket_number, ticket_type, ticket_status = 'On-hold',
      ticket_date, task_owner_id, position_id, management_type,
      department_id, ultimate_hm_id, direct_hm_id, country_company_id,
      candidate_count = 1, action, sub_action, remarks,
    } = req.body;

    // Validate required fields
    const required = { entry_date, ticket_number, ticket_type, ticket_date, management_type, action };
    const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Handle Group_ID for "Active Hiring Ticket"
    let groupId = null;
    let isGroupMaster = false;

    if (sub_action === 'Active Hiring Tickets') {
      const groupCode = generateGroupCode();
      const groupRes = await client.query(
        `INSERT INTO ticket_groups (group_code) VALUES ($1) RETURNING id`,
        [groupCode]
      );
      groupId = groupRes.rows[0].id;
      isGroupMaster = true;
    }

    const { rows } = await client.query(`
      INSERT INTO tickets (
        group_id, is_group_master, task_owner_id,
        entry_date, ticket_number, ticket_type, ticket_status, ticket_date,
        position_id, management_type, department_id, ultimate_hm_id, direct_hm_id,
        country_company_id, candidate_count, action, sub_action, remarks
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) RETURNING *
    `, [
      groupId, isGroupMaster, task_owner_id,
      entry_date, ticket_number, ticket_type, ticket_status, ticket_date,
      position_id || null, management_type, department_id || null,
      ultimate_hm_id || null, direct_hm_id || null,
      country_company_id || null, candidate_count, action, sub_action || null, remarks || null,
    ]);

    await writeAudit(client, rows[0].id, req.user.id, 'created', null, 'new ticket');
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ticket number already exists' });
    next(err);
  } finally { client.release(); }
});

// ── PATCH /tickets/:id/status ─────────────────────────────────
// Most important route — updates status, syncs group if master
router.patch('/:id/status', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const { rows: [ticket] } = await client.query(
      'SELECT * FROM tickets WHERE id = $1', [req.params.id]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    await client.query(
      'UPDATE tickets SET ticket_status = $1 WHERE id = $2',
      [status, ticket.id]
    );
    await writeAudit(client, ticket.id, req.user.id, 'ticket_status', ticket.ticket_status, status);

    // If this is the group master → sync all group members
    // (DB trigger also handles this, this is a safety confirmation)
    if (ticket.is_group_master && ticket.group_id) {
      const { rows: synced } = await client.query(
        `UPDATE tickets SET ticket_status = $1, updated_at = now()
         WHERE group_id = $2 AND id <> $3
         RETURNING id`,
        [status, ticket.group_id, ticket.id]
      );
      // Write audit for each synced row
      for (const row of synced) {
        await writeAudit(client, row.id, req.user.id, 'ticket_status', ticket.ticket_status, status + ' (group sync)');
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, synced: ticket.is_group_master });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── PUT /tickets/:id ──────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [old] } = await client.query('SELECT * FROM tickets WHERE id = $1', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Ticket not found' });

    const fields = [
      'entry_date','ticket_number','ticket_type','ticket_status','ticket_date',
      'task_owner_id','position_id','management_type','department_id',
      'ultimate_hm_id','direct_hm_id','country_company_id',
      'candidate_count','action','sub_action','remarks',
    ];

    const updates = [];
    const params = [];
    let p = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${p++}`);
        params.push(req.body[field]);
        if (String(old[field]) !== String(req.body[field])) {
          await writeAudit(client, old.id, req.user.id, field, old[field], req.body[field]);
        }
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    const { rows } = await client.query(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${p} RETURNING *`,
      params
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ticket number already exists' });
    next(err);
  } finally { client.release(); }
});

// ── POST /tickets/bulk-clone ──────────────────────────────────
router.post('/bulk-clone', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { source_ids, overrides = {} } = req.body;
    if (!source_ids?.length) return res.status(400).json({ error: 'source_ids required' });
    if (source_ids.length > 10) return res.status(400).json({ error: 'Max 10 rows at a time' });

    const cloned = [];
    for (const srcId of source_ids) {
      const { rows: [src] } = await client.query('SELECT * FROM tickets WHERE id = $1', [srcId]);
      if (!src) continue;

      // Generate unique ticket number for clone
      const cloneTicketNumber = overrides.ticket_number
        ? overrides.ticket_number
        : `${src.ticket_number}-CLONE-${Date.now()}`;

      // Cloned rows inherit group_id but are NOT group masters
      const { rows: [cloned_row] } = await client.query(`
        INSERT INTO tickets (
          group_id, is_group_master, task_owner_id,
          entry_date, ticket_number, ticket_type, ticket_status, ticket_date,
          position_id, management_type, department_id, ultimate_hm_id, direct_hm_id,
          country_company_id, candidate_count, action, sub_action, remarks
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING *
      `, [
        src.group_id,    // inherit group
        false,           // never master
        overrides.task_owner_id || src.task_owner_id,
        overrides.entry_date    || src.entry_date,
        cloneTicketNumber,
        overrides.ticket_type   || src.ticket_type,
        src.ticket_status,      // inherit current status
        overrides.ticket_date   || src.ticket_date,
        src.position_id,        // locked — same as original
        src.management_type,
        src.department_id,      // locked
        src.ultimate_hm_id,     // locked
        src.direct_hm_id,       // locked
        src.country_company_id, // locked
        overrides.candidate_count || src.candidate_count,
        overrides.action         || src.action,
        overrides.sub_action     || src.sub_action,
        overrides.remarks        || src.remarks,
      ]);

      await writeAudit(client, cloned_row.id, req.user.id, 'created', null, `cloned from ${srcId}`);
      cloned.push(cloned_row);
    }

    await client.query('COMMIT');
    res.status(201).json({ cloned, count: cloned.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── DELETE /tickets/bulk ──────────────────────────────────────
router.delete('/bulk', requireRole('admin', 'member'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });

    await client.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [ids]);
    await client.query('COMMIT');
    res.json({ deleted: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// ── DELETE /tickets/:id ───────────────────────────────────────
router.delete('/:id', requireRole('admin', 'member'), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tickets WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── GET /tickets/:id/audit ────────────────────────────────────
router.get('/:id/audit', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, u.name AS changed_by_name
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.changed_by
      WHERE a.ticket_id = $1
      ORDER BY a.changed_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
