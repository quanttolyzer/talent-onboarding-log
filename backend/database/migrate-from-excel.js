// backend/database/migrate-from-excel.js
// ─────────────────────────────────────────────────────────────
// Migrates Progress__26_.xlsx into your Neon PostgreSQL database
//
// HOW TO RUN (from your project root):
//   cd backend
//   node database/migrate-from-excel.js ../Progress__26_.xlsx
//
// WHAT IT DOES:
//   1. Seeds all Mappings values (positions, departments, managers, country/companies)
//   2. Creates a system user for rows with unknown task owners
//   3. Imports all valid Progress rows as tickets
//   4. Handles duplicate ticket numbers by appending a suffix
//   5. Normalises statuses (On-Hold → On-hold, etc.)
//   6. Skips blank rows safely
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────
const STATUS_MAP = {
  'on-hold':    'On-hold',
  'on hold':    'On-hold',
  'in-progress':'In-Progress',
  'in progress':'In-Progress',
  'hired':      'Hired',
  'active':     'Active',
  'accepted':   'Accepted',
  'joined':     'Joined',
  'cancelled':  'Cancelled',
  'canceled':   'Cancelled',
  'rejected':   'Rejected',
  'archived':   'Cancelled',   // map old statuses to closest valid
  'closed':     'Cancelled',
  'transferred':'Cancelled',
};

const VALID_STATUSES = new Set([
  'On-hold','In-Progress','Hired','Active','Accepted','Joined','Cancelled','Rejected'
]);

const VALID_TICKET_TYPES = new Set([
  'Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding','Exit Interview'
]);

const VALID_MGMT_TYPES = new Set(['Management','Non - Management']);

const VALID_ACTIONS = new Set(['Open Ticket','Onboarding','Offboarding']);

function normaliseStatus(raw) {
  if (!raw) return 'On-hold';
  const lower = String(raw).toLowerCase().trim();
  return STATUS_MAP[lower] || (VALID_STATUSES.has(raw) ? raw : 'On-hold');
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  // Excel serial number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

// ── main ──────────────────────────────────────────────────────
async function migrate() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node migrate-from-excel.js <path-to-xlsx>');
    process.exit(1);
  }

  console.log(`\n📂 Loading Excel file: ${path.resolve(filePath)}`);
  const wb = XLSX.readFile(path.resolve(filePath), { cellDates: true });

  // ── Read Mappings sheet ──────────────────────────────────
  const mappingsWs = wb.Sheets['Mappings'];
  if (!mappingsWs) { console.error('❌ No "Mappings" sheet found'); process.exit(1); }
  const mappingsData = XLSX.utils.sheet_to_json(mappingsWs, { defval: null });

  const positions     = [...new Set(mappingsData.map(r => cleanStr(r['Position'])).filter(Boolean))];
  const departments   = [...new Set(mappingsData.map(r => cleanStr(r['Department'])).filter(Boolean))];
  const ultimateHMs   = [...new Set(mappingsData.map(r => cleanStr(r['Ultimate Hiring Manager'])).filter(Boolean))];
  const directHMs     = [...new Set(mappingsData.map(r => cleanStr(r['Direct Hiring Manager'])).filter(Boolean))];
  const countryCompanies = [...new Set(mappingsData.map(r => cleanStr(r['Country & Company'])).filter(Boolean))];

  // Also collect all managers (ultimate + direct) to avoid missing references
  const allManagers = [...new Set([...ultimateHMs, ...directHMs])];

  console.log(`\n📋 Mappings found:`);
  console.log(`   Positions:        ${positions.length}`);
  console.log(`   Departments:      ${departments.length}`);
  console.log(`   All HM names:     ${allManagers.length}`);
  console.log(`   Country/Company:  ${countryCompanies.length}`);

  // ── Read Progress sheet ──────────────────────────────────
  const progressWs = wb.Sheets['Progress'];
  if (!progressWs) { console.error('❌ No "Progress" sheet found'); process.exit(1); }
  const progressData = XLSX.utils.sheet_to_json(progressWs, {
    defval: null,
    raw: false,    // parse dates as strings
  });

  const validRows = progressData.filter(r => cleanStr(r['Ticket Number']));
  console.log(`\n📊 Progress rows: ${progressData.length} total, ${validRows.length} with ticket numbers`);

  // ── Connect to DB ────────────────────────────────────────
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    console.log('\n🔌 Connected to database');
    await client.query('BEGIN');

    // ── Step 1: Seed lookup tables ───────────────────────
    console.log('\n⏳ Step 1: Seeding lookup tables…');

    const posMap = {};
    for (const name of positions) {
      const { rows } = await client.query(
        `INSERT INTO positions (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name]
      );
      posMap[name.toLowerCase()] = rows[0].id;
    }
    console.log(`   ✅ ${positions.length} positions`);

    const deptMap = {};
    for (const name of departments) {
      const { rows } = await client.query(
        `INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name]
      );
      deptMap[name.toLowerCase()] = rows[0].id;
    }
    console.log(`   ✅ ${departments.length} departments`);

    const hmMap = {};
    for (const name of allManagers) {
      const { rows } = await client.query(
        `INSERT INTO hiring_managers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name]
      );
      hmMap[name.toLowerCase()] = rows[0].id;
    }
    console.log(`   ✅ ${allManagers.length} hiring managers`);

    const ccMap = {};
    for (const label of countryCompanies) {
      const dashIdx = label.indexOf(' - ');
      const country = dashIdx > -1 ? label.slice(0, dashIdx).trim() : label;
      const company = dashIdx > -1 ? label.slice(dashIdx + 3).trim() : '';
      const { rows } = await client.query(
        `INSERT INTO country_companies (label, country, company) VALUES ($1,$2,$3)
         ON CONFLICT (label) DO UPDATE SET label=EXCLUDED.label RETURNING id`,
        [label, country, company]
      );
      ccMap[label.toLowerCase()] = rows[0].id;
    }
    console.log(`   ✅ ${countryCompanies.length} country/companies`);

    // ── Step 2: Seed users from unique task owners ───────
    console.log('\n⏳ Step 2: Seeding task owner users…');
    const taskOwners = [...new Set(validRows.map(r => cleanStr(r['Task Owner'])).filter(Boolean))];
    const userMap = {}; // name.lower → user id

    for (const name of taskOwners) {
      const email = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '') + '@talent.internal';
      // Use a fixed placeholder hash — these users should change their passwords
      const hash = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // Admin@123
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'member')
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [name, email, hash]
      );
      userMap[name.toLowerCase()] = rows[0].id;
    }
    console.log(`   ✅ ${taskOwners.length} task owners as users (password: Admin@123 — ask them to change)`);

    // ── Step 3: Import tickets ───────────────────────────
    console.log('\n⏳ Step 3: Importing tickets…');

    let inserted = 0, skipped = 0, errors = 0;
    const ticketNumSeen = {}; // track duplicates within this import

    for (const row of validRows) {
      try {
        const rawTicketNum = cleanStr(row['Ticket Number']);
        if (!rawTicketNum) { skipped++; continue; }

        // Make ticket number unique if duplicate
        ticketNumSeen[rawTicketNum] = (ticketNumSeen[rawTicketNum] || 0) + 1;
        const ticketNumber = ticketNumSeen[rawTicketNum] === 1
          ? rawTicketNum
          : `${rawTicketNum}__${ticketNumSeen[rawTicketNum]}`;

        const entryDate  = parseDate(row['Date']) || new Date().toISOString().slice(0,10);
        const ticketDate = parseDate(row['Ticket Date']) || entryDate;

        const rawStatus = cleanStr(row['Ticket Status']);
        const ticketStatus = normaliseStatus(rawStatus);

        const rawType = cleanStr(row['Ticket Type']);
        const ticketType = VALID_TICKET_TYPES.has(rawType) ? rawType : 'Hiring Ticket';

        const rawMgmt = cleanStr(row['Management Type']);
        const managementType = VALID_MGMT_TYPES.has(rawMgmt) ? rawMgmt : 'Non - Management';

        const rawAction = cleanStr(row['Action']);
        const action = VALID_ACTIONS.has(rawAction) ? rawAction : 'Open Ticket';

        const rawOwner = cleanStr(row['Task Owner']);
        const taskOwnerId = rawOwner ? (userMap[rawOwner.toLowerCase()] || null) : null;

        const rawPos = cleanStr(row['Position']);
        const positionId = rawPos ? (posMap[rawPos.toLowerCase()] || null) : null;

        const rawDept = cleanStr(row['Department']);
        const departmentId = rawDept ? (deptMap[rawDept.toLowerCase()] || null) : null;

        const rawUHM = cleanStr(row['Ultimate Hiring Manager']);
        const ultimateHmId = rawUHM ? (hmMap[rawUHM.toLowerCase()] || null) : null;

        const rawDHM = cleanStr(row['Direct Hiring Manager']);
        const directHmId = rawDHM ? (hmMap[rawDHM.toLowerCase()] || null) : null;

        const rawCC = cleanStr(row['Country & Company']);
        const countryCompanyId = rawCC ? (ccMap[rawCC.toLowerCase()] || null) : null;

        const candidates = parseInt(row['Number of Candidates']) || 1;
        const subAction  = cleanStr(row['Sub-Action']);
        const remarks    = cleanStr(row['Remarks']);

        // Detect group master (Active Hiring Tickets row)
        const isGroupMaster = subAction === 'Active Hiring Tickets';

        await client.query(`
          INSERT INTO tickets (
            is_group_master, task_owner_id,
            entry_date, ticket_number, ticket_type, ticket_status, ticket_date,
            position_id, management_type, department_id,
            ultimate_hm_id, direct_hm_id, country_company_id,
            candidate_count, action, sub_action, remarks
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        `, [
          isGroupMaster, taskOwnerId,
          entryDate, ticketNumber, ticketType, ticketStatus, ticketDate,
          positionId, managementType, departmentId,
          ultimateHmId, directHmId, countryCompanyId,
          candidates, action, subAction, remarks,
        ]);
        inserted++;

        if (inserted % 100 === 0) process.stdout.write(`   … ${inserted} rows inserted\r`);

      } catch (rowErr) {
        errors++;
        if (errors <= 5) {
          console.error(`\n   ⚠️  Row error (ticket: ${row['Ticket Number']}): ${rowErr.message}`);
        }
      }
    }

    await client.query('COMMIT');

    console.log(`\n\n✅ Migration complete!`);
    console.log(`   Inserted:  ${inserted} tickets`);
    console.log(`   Skipped:   ${skipped} (no ticket number)`);
    console.log(`   Errors:    ${errors}`);
    console.log(`\n⚠️  All imported users have password: Admin@123`);
    console.log(`   Ask each team member to change their password after first login.\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed — rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
