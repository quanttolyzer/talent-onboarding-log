#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_DATABASE_URL = process.env.DATABASE_URL;

if (!SOURCE_DATABASE_URL) {
  console.error('❌ SOURCE_DATABASE_URL is required');
  process.exit(1);
}

if (!TARGET_DATABASE_URL) {
  console.error('❌ DATABASE_URL is required');
  process.exit(1);
}

async function fetchRows(source, sql) {
  const { rows } = await source.query(sql);
  return rows;
}

async function run() {
  const source = new Pool({ connectionString: SOURCE_DATABASE_URL });
  const target = new Pool({ connectionString: TARGET_DATABASE_URL });

  const client = await target.connect();
  try {
    const [
      positions,
      managementTypes,
      departments,
      hiringManagers,
      countryCompanies,
    ] = await Promise.all([
      fetchRows(source, `
        SELECT name, management_type, is_active
        FROM positions
        ORDER BY name
      `),
      fetchRows(source, `
        SELECT name, sort_order, is_active
        FROM management_types
        ORDER BY sort_order, name
      `),
      fetchRows(source, `
        SELECT name, is_active
        FROM departments
        ORDER BY name
      `),
      fetchRows(source, `
        SELECT name, is_active
        FROM hiring_managers
        ORDER BY name
      `),
      fetchRows(source, `
        SELECT label, country, company, is_active
        FROM country_companies
        ORDER BY label
      `),
    ]);

    await client.query('BEGIN');

    for (const row of managementTypes) {
      await client.query(
        `INSERT INTO management_types (name, sort_order, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (name)
         DO UPDATE SET
           sort_order = EXCLUDED.sort_order,
           is_active = EXCLUDED.is_active`,
        [row.name, row.sort_order ?? 0, row.is_active ?? true]
      );
    }

    for (const row of departments) {
      await client.query(
        `INSERT INTO departments (name, is_active)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET is_active = EXCLUDED.is_active`,
        [row.name, row.is_active ?? true]
      );
    }

    for (const row of hiringManagers) {
      await client.query(
        `INSERT INTO hiring_managers (name, is_active)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET is_active = EXCLUDED.is_active`,
        [row.name, row.is_active ?? true]
      );
    }

    for (const row of countryCompanies) {
      await client.query(
        `INSERT INTO country_companies (label, country, company, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (label)
         DO UPDATE SET
           country = EXCLUDED.country,
           company = EXCLUDED.company,
           is_active = EXCLUDED.is_active`,
        [row.label, row.country || null, row.company || null, row.is_active ?? true]
      );
    }

    for (const row of positions) {
      await client.query(
        `INSERT INTO positions (name, management_type, is_active)
         VALUES ($1, $2, $3)
         ON CONFLICT (name)
         DO UPDATE SET
           management_type = EXCLUDED.management_type,
           is_active = EXCLUDED.is_active`,
        [row.name, row.management_type || null, row.is_active ?? true]
      );
    }

    await client.query('COMMIT');

    console.log('✅ Dropdown seed import completed');
    console.log(`- Positions: ${positions.length}`);
    console.log(`- Management Types: ${managementTypes.length}`);
    console.log(`- Departments: ${departments.length}`);
    console.log(`- Hiring Managers (Ultimate/Direct source): ${hiringManagers.length}`);
    console.log(`- Country & Company: ${countryCompanies.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Import failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await source.end();
    await target.end();
  }
}

run();
