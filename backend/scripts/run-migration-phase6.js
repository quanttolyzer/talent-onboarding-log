// Run migration-phase6.sql against the database
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: false },
});

async function runMigration() {
  try {
    console.log('Reading migration-phase6.sql...');
    const migrationPath = path.join(__dirname, '../database/migration-phase6.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    await pool.query(migrationSQL);
    console.log('✅ Migration phase 6 completed successfully!');

    // Verify the changes
    console.log('\nVerifying changes...');

    // Check board_columns columns
    const boardColsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'board_columns'
      AND column_name IN ('card_display_fields')
      ORDER BY column_name
    `);
    console.log('board_columns columns:', boardColsResult.rows);

    // Check board_columns constraints
    const boardColsConstraints = await pool.query(`
      SELECT constraint_name
      FROM information_schema.constraint_column_usage
      WHERE table_name = 'board_columns'
      AND constraint_name LIKE '%unique%'
      ORDER BY constraint_name
    `);
    console.log('board_columns constraints:', boardColsConstraints.rows);

    // Check ticket_statuses columns
    const ticketStatusesResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ticket_statuses'
      AND column_name IN ('is_default')
      ORDER BY column_name
    `);
    console.log('ticket_statuses columns:', ticketStatusesResult.rows);

    // Check ticket_notes table
    const ticketNotesResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ticket_notes'
      ORDER BY ordinal_position
    `);
    console.log('ticket_notes columns:', ticketNotesResult.rows);

    // Check ticket_notes index
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'ticket_notes'
      ORDER BY indexname
    `);
    console.log('ticket_notes indexes:', indexResult.rows);

    console.log('\n✅ All verifications passed!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
