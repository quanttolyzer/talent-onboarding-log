// backend/routes/boardConfigs.js
const router = require('express').Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};
router.use(authMiddleware);
router.use(adminOnly);

async function loadConfigDetails(client, configId) {
  const { rows: columns } = await client.query(
    'SELECT id, label, position, card_display_fields FROM board_columns WHERE board_config_id = $1 ORDER BY position',
    [configId]
  );
  const columnIds = columns.map(c => c.id);

  let fields = [];
  let transitions = [];
  let phases = [];

  if (columnIds.length > 0) {
    const { rows: f } = await client.query(
      `SELECT board_column_id, field_key, is_required, display_order
       FROM board_column_fields WHERE board_column_id = ANY($1) ORDER BY display_order`,
      [columnIds]
    );
    fields = f;

    const { rows: t } = await client.query(
      'SELECT from_column_id, to_column_id FROM board_column_transitions WHERE from_column_id = ANY($1)',
      [columnIds]
    );
    transitions = t;
  }

  const { rows: p } = await client.query(
    'SELECT id, label, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
    [configId]
  );
  phases = p;

  const columnsWithData = columns.map(col => ({
    ...col,
    fields: fields
      .filter(f => f.board_column_id === col.id)
      .map(f => ({ field_key: f.field_key, is_required: f.is_required, display_order: f.display_order })),
    allowed_target_ids: transitions
      .filter(t => t.from_column_id === col.id)
      .map(t => t.to_column_id),
  }));

  return { columns: columnsWithData, phases };
}

// GET /api/v1/admin/board-configs/:ticketTypeId
router.get('/:ticketTypeId', async (req, res, next) => {
  try {
    const { ticketTypeId } = req.params;
    const { rows: configs } = await pool.query(
      `SELECT id, mode
       FROM board_configs
       WHERE ticket_type_id = $1
         AND is_archived = false
       ORDER BY sort_order, created_at, id`,
      [ticketTypeId]
    );
    if (configs.length === 0) return res.json({ configs: [] });

    const expanded = await Promise.all(
      configs.map(async (cfg) => {
        const details = await loadConfigDetails(pool, cfg.id);
        return {
          id: cfg.id,
          mode: cfg.mode,
          columns: details.columns,
          phases: details.phases,
        };
      })
    );

    res.json({ configs: expanded });
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/board-configs/:ticketTypeId
router.put('/:ticketTypeId', async (req, res, next) => {
  const { ticketTypeId } = req.params;
  const {
    config_id: configId,
    mode,
    columns = [],
    phases = [],
    transitions = [],
  } = req.body;

  // Validate before acquiring a DB connection
  if (!['board', 'progress'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "board" or "progress"' });
  }
  if (mode === 'board') {
    const labels = columns.map(c => c.label);
    if (new Set(labels).size !== labels.length) {
      return res.status(400).json({ error: 'Column labels must be unique within a config' });
    }
  }
  if (mode === 'progress') {
    for (const phase of phases) {
      if (!phase.label || phase.position === undefined) {
        return res.status(400).json({ error: 'Each phase must have a label and position' });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let activeConfigId = configId;

    if (activeConfigId) {
      const { rows: [existing] } = await client.query(
        `SELECT id, mode, sort_order
         FROM board_configs
         WHERE id = $1 AND ticket_type_id = $2 AND is_archived = false`,
        [activeConfigId, ticketTypeId]
      );
      if (!existing) {
        const err = new Error('Board config not found');
        err.status = 404;
        throw err;
      }

      const { rows: [usage] } = await client.query(
        `SELECT EXISTS(
           SELECT 1 FROM ticket_board_configs WHERE board_config_id = $1
         ) AS in_use`,
        [activeConfigId]
      );

      if (usage.in_use) {
        await client.query(
          'UPDATE board_configs SET is_archived = true WHERE id = $1',
          [activeConfigId]
        );
        const { rows: [created] } = await client.query(
          `INSERT INTO board_configs (ticket_type_id, mode, sort_order)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [ticketTypeId, mode, existing.sort_order]
        );
        activeConfigId = created.id;
      } else {
        await client.query(
          'UPDATE board_configs SET mode = $1 WHERE id = $2',
          [mode, activeConfigId]
        );
      }
    } else {
      const { rows: [last] } = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order
         FROM board_configs
         WHERE ticket_type_id = $1 AND is_archived = false`,
        [ticketTypeId]
      );
      const { rows: [created] } = await client.query(
        `INSERT INTO board_configs (ticket_type_id, mode, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [ticketTypeId, mode, last.max_order + 1]
      );
      activeConfigId = created.id;
    }

    // Phases still use delete+reinsert (no foreign key entries reference them by ID)
    await client.query('DELETE FROM board_phases WHERE board_config_id = $1', [activeConfigId]);

    if (mode === 'board') {
      const incomingLabels = columns.map(c => c.label);

      // Delete columns that are no longer in the incoming list
      // (CASCADE deletes their fields, transitions, and entries)
      if (incomingLabels.length > 0) {
        await client.query(
          `DELETE FROM board_columns
           WHERE board_config_id = $1 AND label <> ALL($2::text[])`,
          [activeConfigId, incomingLabels]
        );
      } else {
        await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [activeConfigId]);
      }

      const labelToId = {};
      for (const col of columns) {
        // Upsert: preserve existing id if label already exists
        const { rows: [upserted] } = await client.query(
          `INSERT INTO board_columns (board_config_id, label, position, card_display_fields)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (board_config_id, label)
           DO UPDATE SET position = EXCLUDED.position,
                         card_display_fields = EXCLUDED.card_display_fields
           RETURNING id`,
          [activeConfigId, col.label, col.position, JSON.stringify(col.card_display_fields || [])]
        );
        labelToId[col.label] = upserted.id;

        // Replace fields for this column (fields don't have external references)
        await client.query('DELETE FROM board_column_fields WHERE board_column_id = $1', [upserted.id]);
        for (const field of (col.fields || [])) {
          await client.query(
            `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
             VALUES ($1, $2, $3, $4)`,
            [upserted.id, field.field_key, field.is_required ?? false, field.display_order || 0]
          );
        }
      }

      // Clear existing transitions for all columns in this config before reinserting
      if (Object.keys(labelToId).length > 0) {
        const columnIds = Object.values(labelToId);
        await client.query(
          'DELETE FROM board_column_transitions WHERE from_column_id = ANY($1)',
          [columnIds]
        );
      }

      for (const t of transitions) {
        const fromId = labelToId[t.from_label];
        const toId   = labelToId[t.to_label];
        if (!fromId || !toId) {
          const err = new Error(`Transition references unknown column label: "${t.from_label}" → "${t.to_label}"`);
          err.status = 400;
          throw err;
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
          [activeConfigId, phase.label, phase.position]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, id: activeConfigId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /api/v1/admin/board-configs/:ticketTypeId/:configId
router.delete('/:ticketTypeId/:configId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ticketTypeId, configId } = req.params;
    const { rows: [usage] } = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM ticket_board_configs WHERE board_config_id = $1
       ) AS in_use`,
      [configId]
    );

    let affected = 0;
    if (usage.in_use) {
      const result = await client.query(
        `UPDATE board_configs
         SET is_archived = true
         WHERE ticket_type_id = $1 AND id = $2 AND is_archived = false`,
        [ticketTypeId, configId]
      );
      affected = result.rowCount;
    } else {
      const result = await client.query(
        'DELETE FROM board_configs WHERE ticket_type_id = $1 AND id = $2',
        [ticketTypeId, configId]
      );
      affected = result.rowCount;
    }

    if (affected === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Board config not found' });
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

// DELETE /api/v1/admin/board-configs/:ticketTypeId (legacy: delete all)
router.delete('/:ticketTypeId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ticketTypeId = req.params.ticketTypeId;

    const archived = await client.query(
      `UPDATE board_configs bc
       SET is_archived = true
       WHERE bc.ticket_type_id = $1
         AND bc.is_archived = false
         AND EXISTS (
           SELECT 1 FROM ticket_board_configs tbc WHERE tbc.board_config_id = bc.id
         )`,
      [ticketTypeId]
    );

    const deleted = await client.query(
      `DELETE FROM board_configs bc
       WHERE bc.ticket_type_id = $1
         AND bc.is_archived = false
         AND NOT EXISTS (
           SELECT 1 FROM ticket_board_configs tbc WHERE tbc.board_config_id = bc.id
         )`,
      [ticketTypeId]
    );

    if (archived.rowCount + deleted.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Board config not found' });
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

module.exports = router;
