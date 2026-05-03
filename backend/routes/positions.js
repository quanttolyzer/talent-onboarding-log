// backend/routes/positions.js
const router = require('express').Router();
const pool   = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// ── Helper: write board log ───────────────────────────────────
async function writeLog(client, positionId, actorId, eventType, payload) {
  await client.query(
    `INSERT INTO position_board_log (position_id, actor_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [positionId, actorId, eventType, JSON.stringify(payload)]
  );
}

// ── GET /positions/:id/board ──────────────────────────────────
router.get('/:id/board', async (req, res, next) => {
  try {
    const id = req.params.id;

    // Position details
    const { rows: [pos] } = await pool.query(`
      SELECT
        p.id, p.name, p.board_status,
        COALESCE(MAX(d.name), '')           AS department_name,
        COALESCE(MAX(cc.label), '')         AS country_company_label,
        COALESCE(MAX(t.management_type), '') AS management_type,
        COALESCE(MAX(uhm.name), '')          AS ultimate_hm_name,
        COALESCE(MAX(dhm.name), '')          AS direct_hm_name,
        COALESCE(MAX(t.candidate_count), 0)  AS required_candidates
      FROM positions p
      LEFT JOIN tickets t               ON t.position_id = p.id
      LEFT JOIN departments d           ON d.id = t.department_id
      LEFT JOIN hiring_managers uhm     ON uhm.id = t.ultimate_hm_id
      LEFT JOIN hiring_managers dhm     ON dhm.id = t.direct_hm_id
      LEFT JOIN country_companies cc    ON cc.id = t.country_company_id
      WHERE p.id = $1
      GROUP BY p.id, p.name, p.board_status
    `, [id]);

    if (!pos) return res.status(404).json({ error: 'Position not found' });

    // Screenings
    const { rows: screenings } = await pool.query(`
      SELECT s.id, s.count, s.created_at, u.name AS created_by_name
      FROM position_board_screenings s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE s.position_id = $1
      ORDER BY s.created_at ASC
    `, [id]);

    // Batches with candidates
    const { rows: batches } = await pool.query(`
      SELECT b.id, b.name, b.created_at, u.name AS created_by_name
      FROM position_board_batches b
      LEFT JOIN users u ON u.id = b.created_by
      WHERE b.position_id = $1
      ORDER BY b.created_at ASC
    `, [id]);

    const { rows: candidates } = await pool.query(`
      SELECT c.id, c.batch_id, c.name, c.created_at
      FROM position_board_candidates c
      JOIN position_board_batches b ON b.id = c.batch_id
      WHERE b.position_id = $1
      ORDER BY c.created_at ASC
    `, [id]);

    const batchMap = {};
    batches.forEach(b => { batchMap[b.id] = { ...b, candidates: [] }; });
    candidates.forEach(c => {
      if (batchMap[c.batch_id]) batchMap[c.batch_id].candidates.push(c);
    });

    // Stages (current stage per candidate)
    const { rows: stages } = await pool.query(`
      SELECT s.id, s.candidate_id, s.stage,
             s.assessment_level, s.assessment_result,
             s.offer_ticket_number, s.moved_at,
             c.name AS candidate_name
      FROM position_board_stages s
      JOIN position_board_candidates c ON c.id = s.candidate_id
      WHERE s.position_id = $1
      ORDER BY s.moved_at ASC
    `, [id]);

    res.json({
      position:  pos,
      screenings,
      batches:   Object.values(batchMap),
      stages,
    });
  } catch (err) { next(err); }
});

// ── POST /positions/:id/screenings ────────────────────────────
router.post('/:id/screenings', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { count } = req.body;
    if (!count || count < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'count must be a positive integer' });
    }
    const { rows: [row] } = await client.query(
      `INSERT INTO position_board_screenings (position_id, count, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, count, req.user.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'screening_added', { count });
    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/batches ───────────────────────────────
router.post('/:id/batches', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name } = req.body;
    if (!name) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'name is required' }); }
    const { rows: [row] } = await client.query(
      `INSERT INTO position_board_batches (position_id, name, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, name, req.user.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'batch_created', { batch_name: name });
    await client.query('COMMIT');
    res.status(201).json({ ...row, candidates: [] });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/batches/:batchId/candidates ───────────
router.post('/:id/batches/:batchId/candidates', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name } = req.body;
    if (!name) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'name is required' }); }

    // Verify batch belongs to this position
    const { rows: [batch] } = await client.query(
      'SELECT id, name FROM position_board_batches WHERE id = $1 AND position_id = $2',
      [req.params.batchId, req.params.id]
    );
    if (!batch) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Batch not found' }); }

    const { rows: [candidate] } = await client.query(
      'INSERT INTO position_board_candidates (batch_id, name) VALUES ($1, $2) RETURNING *',
      [req.params.batchId, name]
    );
    await writeLog(client, req.params.id, req.user.id, 'candidate_added',
      { candidate_name: name, batch_name: batch.name });
    await client.query('COMMIT');
    res.status(201).json(candidate);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── POST /positions/:id/stages ────────────────────────────────
// Body: { candidate_id, stage, assessment_level?, offer_ticket_number? }
router.post('/:id/stages', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { candidate_id, stage, assessment_level, offer_ticket_number } = req.body;
    const validStages = ['assessment', 'technical_interview', 'offer', 'hired'];
    if (!candidate_id || !stage || !validStages.includes(stage)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'candidate_id and valid stage are required' });
    }
    if (stage === 'assessment' && !assessment_level) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'assessment_level is required for assessment stage' });
    }
    if (stage === 'offer' && !offer_ticket_number) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'offer_ticket_number is required for offer stage' });
    }

    // Verify candidate belongs to a batch in this position
    const { rows: [cand] } = await client.query(`
      SELECT c.id, c.name FROM position_board_candidates c
      JOIN position_board_batches b ON b.id = c.batch_id
      WHERE c.id = $1 AND b.position_id = $2
    `, [candidate_id, req.params.id]);
    if (!cand) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Candidate not found' }); }

    // Upsert: one stage row per candidate
    const { rows: [row] } = await client.query(`
      INSERT INTO position_board_stages
        (position_id, candidate_id, stage, assessment_level, offer_ticket_number, moved_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (candidate_id) DO UPDATE SET
        stage               = EXCLUDED.stage,
        assessment_level    = EXCLUDED.assessment_level,
        offer_ticket_number = EXCLUDED.offer_ticket_number,
        moved_by            = EXCLUDED.moved_by,
        moved_at            = now()
      RETURNING *
    `, [req.params.id, candidate_id, stage, assessment_level || null, offer_ticket_number || null, req.user.id]);

    await writeLog(client, req.params.id, req.user.id, 'candidate_moved', {
      candidate_name: cand.name,
      to_stage: stage,
    });

    // Auto-fill check: if stage = hired, see if position is now filled
    if (stage === 'hired') {
      const { rows: [counts] } = await client.query(`
        SELECT
          COALESCE(MAX(t.candidate_count), 0) AS required,
          COUNT(s.id) AS hired_count
        FROM positions p
        LEFT JOIN tickets t ON t.position_id = p.id
        LEFT JOIN position_board_stages s ON s.position_id = p.id AND s.stage = 'hired'
        WHERE p.id = $1
        GROUP BY p.id
      `, [req.params.id]);

      if (parseInt(counts.hired_count, 10) >= parseInt(counts.required, 10) && counts.required > 0) {
        await client.query(
          `UPDATE positions SET board_status = 'filled' WHERE id = $1`,
          [req.params.id]
        );
        await writeLog(client, req.params.id, req.user.id, 'position_filled', {});
      }
    }

    await client.query('COMMIT');
    res.status(201).json(row);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── PATCH /positions/:id/stages/:stageId ─────────────────────
// Body: { assessment_result? } or { offer_ticket_number? }
router.patch('/:id/stages/:stageId', async (req, res, next) => {
  try {
    const { assessment_result, offer_ticket_number } = req.body;
    const { rows: [row] } = await pool.query(`
      UPDATE position_board_stages
      SET
        assessment_result   = COALESCE($1, assessment_result),
        offer_ticket_number = COALESCE($2, offer_ticket_number)
      WHERE id = $3 AND position_id = $4
      RETURNING *
    `, [assessment_result ?? null, offer_ticket_number ?? null, req.params.stageId, req.params.id]);
    if (!row) return res.status(404).json({ error: 'Stage record not found' });
    res.json(row);
  } catch (err) { next(err); }
});

// ── POST /positions/:id/reopen ────────────────────────────────
router.post('/:id/reopen', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE positions SET board_status = 'open' WHERE id = $1`,
      [req.params.id]
    );
    await writeLog(client, req.params.id, req.user.id, 'position_reopened', {});
    await client.query('COMMIT');
    res.json({ message: 'Position re-opened' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// ── GET /positions/:id/log ────────────────────────────────────
router.get('/:id/log', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(`
      SELECT l.id, l.event_type, l.payload, l.created_at,
             u.name AS actor_name
      FROM position_board_log l
      LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.position_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*) FROM position_board_log WHERE position_id = $1',
      [req.params.id]
    );

    res.json({ data: rows, total: parseInt(count, 10), page, pages: Math.ceil(count / limit) });
  } catch (err) { next(err); }
});

module.exports = router;
