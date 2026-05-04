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
