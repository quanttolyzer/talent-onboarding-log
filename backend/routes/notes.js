const router = require('express').Router({ mergeParams: true });
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const VALID_COLORS = ['yellow', 'orange', 'pink', 'teal', 'green', 'light-pink', 'light-blue'];

router.use(authMiddleware);

// GET /api/v1/tickets/:ticketId/notes
router.get('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { rows } = await pool.query(
      `SELECT n.*, u.name AS created_by_name
       FROM ticket_notes n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.ticket_id = $1
       ORDER BY n.created_at DESC`,
      [ticketId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/v1/tickets/:ticketId/notes
router.post('/', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { content, color = 'yellow' } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });
    if (color && !VALID_COLORS.includes(color)) return res.status(400).json({ error: 'Invalid color' });

    const { rows: [note] } = await pool.query(
      `INSERT INTO ticket_notes (ticket_id, created_by, content, color)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, req.user.id, content.trim(), color]
    );
    res.status(201).json({ ...note, created_by_name: req.user.name });
  } catch (err) { next(err); }
});

// PATCH /api/v1/tickets/:ticketId/notes/:noteId
router.patch('/:noteId', async (req, res, next) => {
  try {
    const { ticketId, noteId } = req.params;
    const { content, color, is_done } = req.body;

    const { rows: [existing] } = await pool.query(
      'SELECT * FROM ticket_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    if (req.user.role !== 'admin') {
      if (existing.created_by === null || existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only edit your own notes' });
      }
    }

    const updates = [];
    const params = [];
    let pi = 1;
    if (content !== undefined) {
      const trimmed = content.trim();
      if (!trimmed) return res.status(400).json({ error: 'Content cannot be empty' });
      updates.push(`content = $${pi++}`);
      params.push(trimmed);
    }
    if (color !== undefined) {
      if (!VALID_COLORS.includes(color)) return res.status(400).json({ error: 'Invalid color' });
      updates.push(`color = $${pi++}`);
      params.push(color);
    }
    if (is_done !== undefined) { updates.push(`is_done = $${pi++}`); params.push(Boolean(is_done)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push(`updated_at = now()`);
    params.push(noteId, ticketId);

    const { rows: [updated] } = await pool.query(
      `UPDATE ticket_notes SET ${updates.join(', ')}
       WHERE id = $${pi++} AND ticket_id = $${pi}
       RETURNING *`,
      params
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/tickets/:ticketId/notes/:noteId
router.delete('/:noteId', async (req, res, next) => {
  try {
    const { ticketId, noteId } = req.params;
    const { rows: [existing] } = await pool.query(
      'SELECT * FROM ticket_notes WHERE id = $1 AND ticket_id = $2',
      [noteId, ticketId]
    );
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    if (req.user.role !== 'admin') {
      if (existing.created_by === null || existing.created_by !== req.user.id) {
        return res.status(403).json({ error: 'You can only delete your own notes' });
      }
    }

    await pool.query('DELETE FROM ticket_notes WHERE id = $1 AND ticket_id = $2', [noteId, ticketId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
