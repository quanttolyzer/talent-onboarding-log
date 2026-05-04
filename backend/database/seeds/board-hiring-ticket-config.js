// backend/database/seeds/board-hiring-ticket-config.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('../../config/db');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [hiringType] } = await client.query(
      "SELECT id FROM ticket_types WHERE name = 'Hiring Ticket'"
    );
    if (!hiringType) throw new Error('"Hiring Ticket" not found in ticket_types table');

    const { rows: [config] } = await client.query(
      `INSERT INTO board_configs (ticket_type_id, mode)
       VALUES ($1, 'board')
       ON CONFLICT (ticket_type_id) DO UPDATE SET mode = 'board'
       RETURNING id`,
      [hiringType.id]
    );

    // Wipe existing columns (cascade → fields, transitions)
    await client.query('DELETE FROM board_columns WHERE board_config_id = $1', [config.id]);

    const columnDefs = [
      { label: 'Screening',           position: 1 },
      { label: 'HR Interview',         position: 2 },
      { label: 'Batches',              position: 3 },
      { label: 'Assessment',           position: 4 },
      { label: 'Technical Interview',  position: 5 },
      { label: 'Offer',                position: 6 },
      { label: 'Hired',                position: 7 },
    ];

    const ids = {};
    for (const col of columnDefs) {
      const { rows: [row] } = await client.query(
        'INSERT INTO board_columns (board_config_id, label, position) VALUES ($1, $2, $3) RETURNING id',
        [config.id, col.label, col.position]
      );
      ids[col.label] = row.id;
    }

    // candidate_name is required on all columns so entry cards always show a name
    for (const label of Object.keys(ids)) {
      await client.query(
        `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
         VALUES ($1, 'candidate_name', true, 1)`,
        [ids[label]]
      );
    }

    // Assessment column: assessment_level (required) + assessment_result (optional)
    await client.query(
      `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
       VALUES ($1, 'assessment_level', true, 2), ($1, 'assessment_result', false, 3)`,
      [ids['Assessment']]
    );

    // Offer column: ticket_number (required)
    await client.query(
      `INSERT INTO board_column_fields (board_column_id, field_key, is_required, display_order)
       VALUES ($1, 'ticket_number', true, 2)`,
      [ids['Offer']]
    );

    // Transitions (mirrors old VALID_TRANSITIONS in KanbanBoard.jsx)
    const transitionDefs = [
      ['Batches',              'Assessment'],
      ['Batches',              'Technical Interview'],
      ['Assessment',           'Technical Interview'],
      ['Technical Interview',  'Offer'],
      ['Offer',                'Hired'],
    ];
    for (const [from, to] of transitionDefs) {
      await client.query(
        `INSERT INTO board_column_transitions (from_column_id, to_column_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [ids[from], ids[to]]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Hiring Ticket board config seeded');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
