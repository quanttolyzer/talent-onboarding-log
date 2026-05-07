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

test('ticket keeps original board config after admin edits config', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: [admin] } = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1"
    );
    assert.ok(admin?.id, 'admin user is required for this integration test');

    const token = jwt.sign(
      { id: admin.id, email: 'admin@talent.internal', role: 'admin', name: 'Admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const { rows: [ticketType] } = await pool.query(
      'SELECT id, name FROM ticket_types ORDER BY sort_order, created_at, id LIMIT 1'
    );
    assert.ok(ticketType?.id, 'ticket type is required for this integration test');

    await api(`/admin/board-configs/${ticketType.id}`, {
      method: 'DELETE',
      token,
    });

    const createdConfig = await api(`/admin/board-configs/${ticketType.id}`, {
      method: 'PUT',
      token,
      body: {
        mode: 'board',
        columns: [{ label: 'Old Column', position: 1, fields: [], card_display_fields: [] }],
        phases: [],
        transitions: [],
      },
    });
    assert.equal(createdConfig.status, 200);
    const configId = createdConfig.data.id;
    assert.ok(configId, 'config id must be returned');

    const ticketNumber = `SNAP-${Date.now()}`;
    const createdTicket = await api('/tickets', {
      method: 'POST',
      token,
      body: {
        entry_date: '2026-05-07',
        ticket_number: ticketNumber,
        ticket_type: ticketType.name,
        ticket_status: 'On-hold',
        ticket_date: '2026-05-07',
        management_type: 'Management',
      },
    });
    assert.equal(createdTicket.status, 201);

    const ticketId = createdTicket.data.id;
    assert.ok(ticketId, 'ticket id must be returned');

    const beforeEdit = await api(`/tickets/${ticketId}/board`, { token });
    assert.equal(beforeEdit.status, 200);
    assert.equal(beforeEdit.data.boards[0].columns[0].label, 'Old Column');

    const editedConfig = await api(`/admin/board-configs/${ticketType.id}`, {
      method: 'PUT',
      token,
      body: {
        config_id: configId,
        mode: 'board',
        columns: [{ label: 'New Column', position: 1, fields: [], card_display_fields: [] }],
        phases: [],
        transitions: [],
      },
    });
    assert.equal(editedConfig.status, 200);

    const afterEdit = await api(`/tickets/${ticketId}/board`, { token });
    assert.equal(afterEdit.status, 200);
    assert.equal(afterEdit.data.boards[0].columns[0].label, 'Old Column');
  } finally {
    await pool.end();
  }
});
