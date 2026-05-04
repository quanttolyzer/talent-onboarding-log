// backend/database/seeds/board-migrate-entries.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../../config/db');

const STAGE_TO_COLUMN = {
  assessment:          'Assessment',
  technical_interview: 'Technical Interview',
  offer:               'Offer',
  hired:               'Hired',
};

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all stage records joined to candidate name
    const { rows: stages } = await client.query(`
      SELECT
        s.id,
        s.candidate_id,
        s.stage,
        s.assessment_level,
        s.assessment_result,
        s.offer_ticket_number,
        c.name AS candidate_name,
        b.position_id
      FROM position_board_stages s
      JOIN position_board_candidates c ON c.id = s.candidate_id
      JOIN position_board_batches    b ON b.id = c.batch_id
      ORDER BY s.moved_at
    `);

    // Build position_id → ticket_id map (first ticket per position)
    const positionIds = [...new Set(stages.map(s => s.position_id))];
    const posToTicket = {};
    for (const posId of positionIds) {
      const { rows: [ticket] } = await client.query(
        'SELECT id FROM tickets WHERE position_id = $1 ORDER BY created_at LIMIT 1',
        [posId]
      );
      if (ticket) posToTicket[posId] = ticket.id;
    }

    // Get column label → id map for Hiring Ticket board
    const { rows: columns } = await client.query(`
      SELECT bco.id, bco.label
      FROM board_columns bco
      JOIN board_configs bc ON bc.id = bco.board_config_id
      JOIN ticket_types tt  ON tt.id = bc.ticket_type_id
      WHERE tt.name = 'Hiring Ticket'
    `);
    const colLabelToId = {};
    for (const c of columns) colLabelToId[c.label] = c.id;

    let migrated = 0, skipped = 0;
    for (const stage of stages) {
      const ticketId  = posToTicket[stage.position_id];
      const colLabel  = STAGE_TO_COLUMN[stage.stage];
      const columnId  = colLabel ? colLabelToId[colLabel] : null;

      if (!ticketId || !columnId) { skipped++; continue; }

      const fieldValues = { candidate_name: stage.candidate_name };
      if (stage.assessment_level)    fieldValues.assessment_level  = stage.assessment_level;
      if (stage.assessment_result)   fieldValues.assessment_result = stage.assessment_result;
      if (stage.offer_ticket_number) fieldValues.ticket_number     = stage.offer_ticket_number;

      await client.query(
        `INSERT INTO board_entries (ticket_id, board_column_id, field_values)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [ticketId, columnId, JSON.stringify(fieldValues)]
      );
      migrated++;
    }

    await client.query('COMMIT');
    console.log(`✅ Migration complete: ${migrated} entries migrated, ${skipped} skipped`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
