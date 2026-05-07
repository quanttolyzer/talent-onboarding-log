const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api/v1';

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { status: response.status, data };
}

test('PUT ticket status set-default endpoint is available for admin UI', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: [admin] } = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1"
    );
    assert.ok(admin?.id, 'admin user is required');

    const token = jwt.sign(
      { id: admin.id, email: 'admin@talent.internal', role: 'admin', name: 'Admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const { rows: [status] } = await pool.query(
      'SELECT id FROM ticket_statuses ORDER BY sort_order, created_at, id LIMIT 1'
    );
    assert.ok(status?.id, 'ticket status row is required');

    const response = await api(`/admin/ticket-statuses/${status.id}/set-default`, {
      method: 'PUT',
      token,
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.id, status.id);
    assert.equal(response.data.is_default, true);
  } finally {
    await pool.end();
  }
});

test('admin dropdowns response includes is_default for ticket statuses', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: [admin] } = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1"
    );
    assert.ok(admin?.id, 'admin user is required');

    const token = jwt.sign(
      { id: admin.id, email: 'admin@talent.internal', role: 'admin', name: 'Admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const { rows: [status] } = await pool.query(
      'SELECT id FROM ticket_statuses ORDER BY sort_order, created_at, id LIMIT 1'
    );
    assert.ok(status?.id, 'ticket status row is required');

    const setDefault = await api(`/admin/ticket-statuses/${status.id}/set-default`, {
      method: 'PUT',
      token,
    });
    assert.equal(setDefault.status, 200);

    const dropdowns = await api('/admin/dropdowns', { token });
    assert.equal(dropdowns.status, 200);

    const selected = (dropdowns.data.ticket_statuses || []).find((s) => s.id === status.id);
    assert.equal(selected?.is_default, true);
  } finally {
    await pool.end();
  }
});
