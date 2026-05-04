// One-time migration: copy lookup table data from Neon → local Docker DB
// Run inside the backend container:
//   docker exec talent-onboarding-log-backend-1 node scripts/migrate-neon-data.js

const { Pool } = require('pg');

const neon = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_qSlx3UV9zjrN@ep-still-tooth-aly02v99.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false },
});

const local = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function migrate() {
  console.log('Connecting to Neon…');

  // ── positions ────────────────────────────────────────────────
  const { rows: positions } = await neon.query(
    'SELECT name, management_type, board_status, is_active FROM positions ORDER BY name'
  );
  console.log(`positions: ${positions.length} rows`);
  for (const r of positions) {
    await local.query(
      `INSERT INTO positions (name, management_type, board_status, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE
         SET management_type = EXCLUDED.management_type,
             board_status    = EXCLUDED.board_status,
             is_active       = EXCLUDED.is_active`,
      [r.name, r.management_type || null, r.board_status || 'open', r.is_active ?? true]
    );
  }

  // ── departments ──────────────────────────────────────────────
  const { rows: departments } = await neon.query(
    'SELECT name, is_active FROM departments ORDER BY name'
  );
  console.log(`departments: ${departments.length} rows`);
  for (const r of departments) {
    await local.query(
      `INSERT INTO departments (name, is_active)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active`,
      [r.name, r.is_active ?? true]
    );
  }

  // ── hiring_managers ──────────────────────────────────────────
  const { rows: hm } = await neon.query(
    'SELECT name, is_active FROM hiring_managers ORDER BY name'
  );
  console.log(`hiring_managers: ${hm.length} rows`);
  for (const r of hm) {
    await local.query(
      `INSERT INTO hiring_managers (name, is_active)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET is_active = EXCLUDED.is_active`,
      [r.name, r.is_active ?? true]
    );
  }

  // ── country_companies ────────────────────────────────────────
  const { rows: cc } = await neon.query(
    'SELECT label, country, company, is_active FROM country_companies ORDER BY label'
  );
  console.log(`country_companies: ${cc.length} rows`);
  for (const r of cc) {
    await local.query(
      `INSERT INTO country_companies (label, country, company, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (label) DO UPDATE
         SET country   = EXCLUDED.country,
             company   = EXCLUDED.company,
             is_active = EXCLUDED.is_active`,
      [r.label, r.country || null, r.company || null, r.is_active ?? true]
    );
  }

  // ── management_types ─────────────────────────────────────────
  const { rows: mt } = await neon.query(
    'SELECT name, sort_order, is_active FROM management_types ORDER BY sort_order'
  );
  console.log(`management_types: ${mt.length} rows`);
  for (const r of mt) {
    await local.query(
      `INSERT INTO management_types (name, sort_order, is_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
         SET sort_order = EXCLUDED.sort_order,
             is_active  = EXCLUDED.is_active`,
      [r.name, r.sort_order || 0, r.is_active ?? true]
    );
  }

  console.log('\nDone. All lookup data copied to local Docker DB.');
  await neon.end();
  await local.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
