// Run migration-phase7.sql against the database
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
    console.log('Reading migration-phase7.sql...');
    const migrationPath = path.join(__dirname, '../database/migration-phase7.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration...');
    await pool.query(migrationSQL);
    console.log('✅ Migration phase 7 completed successfully!');

    // Verify the changes
    console.log('\nVerifying changes...');

    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'hiring_managers'
        AND column_name = 'hm_role'
    `);
    console.log('hiring_managers.hm_role column:', result.rows);

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
