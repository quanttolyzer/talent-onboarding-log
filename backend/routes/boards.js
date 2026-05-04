// backend/routes/boards.js
const router = require('express').Router({ mergeParams: true });
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/v1/tickets/:ticketId/board
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [ticket] } = await pool.query(
      'SELECT id, ticket_type FROM tickets WHERE id = $1',
      [ticketId]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { rows: [config] } = await pool.query(
      `SELECT bc.id, bc.mode FROM board_configs bc
       JOIN ticket_types tt ON tt.id = bc.ticket_type_id
       WHERE tt.name = $1`,
      [ticket.ticket_type]
    );
    if (!config) return res.status(404).json({ error: 'No board configured for this ticket type' });

    if (config.mode === 'board') {
      const { rows: columns } = await pool.query(
        'SELECT id, label, position FROM board_columns WHERE board_config_id = $1 ORDER BY position',
        [config.id]
      );
      const columnIds = columns.map(c => c.id);

      let fields = [], transitions = [], entries = [];
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

        const { rows: e } = await pool.query(
          `SELECT id, board_column_id, field_values, created_at
           FROM board_entries WHERE ticket_id = $1 AND board_column_id = ANY($2)
           ORDER BY created_at`,
          [ticketId, columnIds]
        );
        entries = e;
      }

      const columnsWithData = columns.map(col => ({
        ...col,
        fields: fields.filter(f => f.board_column_id === col.id),
        allowed_target_ids: transitions.filter(t => t.from_column_id === col.id).map(t => t.to_column_id),
        entries: entries.filter(e => e.board_column_id === col.id),
      }));

      return res.json({ mode: 'board', columns: columnsWithData });
    }

    // Progress mode
    const { rows: phases } = await pool.query(
      'SELECT id, label, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
      [config.id]
    );
    const { rows: history } = await pool.query(
      `SELECT tph.id, tph.board_phase_id, tph.created_at,
              bp.label AS phase_label,
              u.name   AS advanced_by
       FROM ticket_phase_history tph
       JOIN board_phases bp ON bp.id = tph.board_phase_id
       LEFT JOIN users u   ON u.id  = tph.advanced_by
       WHERE tph.ticket_id = $1
       ORDER BY tph.created_at`,
      [ticketId]
    );
    const current_phase_id = history.length > 0 ? history[history.length - 1].board_phase_id : null;

    res.json({ mode: 'progress', phases, current_phase_id, history });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/entries
router.post('/entries', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { board_column_id, field_values = {} } = req.body;
    if (!board_column_id) return res.status(400).json({ error: 'board_column_id is required' });

    // Verify column belongs to a config that matches this ticket's type
    const { rows: [colCheck] } = await pool.query(
      `SELECT bc_col.id FROM board_columns bc_col
       JOIN board_configs bc   ON bc.id    = bc_col.board_config_id
       JOIN ticket_types tt    ON tt.id    = bc.ticket_type_id
       JOIN tickets t          ON t.ticket_type = tt.name
       WHERE bc_col.id = $1 AND t.id = $2`,
      [board_column_id, ticketId]
    );
    if (!colCheck) return res.status(400).json({ error: 'Invalid column for this ticket' });

    // Validate required fields
    const { rows: required } = await pool.query(
      'SELECT field_key FROM board_column_fields WHERE board_column_id = $1 AND is_required = true',
      [board_column_id]
    );
    for (const rf of required) {
      if (!field_values[rf.field_key]) {
        return res.status(400).json({ error: `Field "${rf.field_key}" is required` });
      }
    }

    const { rows: [entry] } = await pool.query(
      `INSERT INTO board_entries (ticket_id, board_column_id, field_values)
       VALUES ($1, $2, $3)
       RETURNING id, board_column_id, field_values, created_at`,
      [ticketId, board_column_id, JSON.stringify(field_values)]
    );
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// PATCH /api/v1/tickets/:ticketId/board/entries/:entryId/move
router.patch('/entries/:entryId/move', async (req, res, next) => {
  try {
    const { ticketId, entryId } = req.params;
    const { target_column_id, additional_field_values = {} } = req.body;
    if (!target_column_id) return res.status(400).json({ error: 'target_column_id is required' });

    const { rows: [entry] } = await pool.query(
      'SELECT id, board_column_id, field_values FROM board_entries WHERE id = $1 AND ticket_id = $2',
      [entryId, ticketId]
    );
    if (!entry) return res.status(404).json({ error: 'Entry not found' });

    const { rows: [transition] } = await pool.query(
      'SELECT id FROM board_column_transitions WHERE from_column_id = $1 AND to_column_id = $2',
      [entry.board_column_id, target_column_id]
    );
    if (!transition) {
      return res.status(400).json({ error: 'This move is not permitted by the board configuration' });
    }

    const mergedValues = { ...entry.field_values, ...additional_field_values };

    const { rows: [updated] } = await pool.query(
      `UPDATE board_entries
       SET board_column_id = $1, field_values = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, board_column_id, field_values`,
      [target_column_id, JSON.stringify(mergedValues), entryId]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/tickets/:ticketId/board/entries/:entryId
router.delete('/entries/:entryId', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { ticketId, entryId } = req.params;
    const { rowCount } = await pool.query(
      'DELETE FROM board_entries WHERE id = $1 AND ticket_id = $2',
      [entryId, ticketId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/advance
router.post('/advance', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows: [config] } = await pool.query(
      `SELECT bc.id FROM board_configs bc
       JOIN ticket_types tt ON tt.id = bc.ticket_type_id
       JOIN tickets t       ON t.ticket_type = tt.name
       WHERE t.id = $1 AND bc.mode = 'progress'`,
      [ticketId]
    );
    if (!config) return res.status(404).json({ error: 'No progress board for this ticket' });

    const { rows: phases } = await pool.query(
      'SELECT id, position FROM board_phases WHERE board_config_id = $1 ORDER BY position',
      [config.id]
    );
    const { rows: [lastEntry] } = await pool.query(
      'SELECT board_phase_id FROM ticket_phase_history WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1',
      [ticketId]
    );

    let nextPhase;
    if (!lastEntry) {
      nextPhase = phases[0];
    } else {
      const idx = phases.findIndex(p => p.id === lastEntry.board_phase_id);
      nextPhase = phases[idx + 1];
    }
    if (!nextPhase) return res.status(400).json({ error: 'Already at the last phase' });

    await pool.query(
      'INSERT INTO ticket_phase_history (ticket_id, board_phase_id, advanced_by) VALUES ($1, $2, $3)',
      [ticketId, nextPhase.id, req.user.id]
    );
    res.json({ ok: true, phase_id: nextPhase.id });
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/board/phase/:phaseId  (admin: jump to specific phase)
router.post('/phase/:phaseId', async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { ticketId, phaseId } = req.params;
    await pool.query(
      'INSERT INTO ticket_phase_history (ticket_id, board_phase_id, advanced_by) VALUES ($1, $2, $3)',
      [ticketId, phaseId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
