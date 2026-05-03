import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

function empty() {
  return {
    entry_date:         new Date().toISOString().slice(0, 10),
    task_owner_id:      '',
    ticket_number:      '',
    ticket_type:        '',
    ticket_status:      'On-hold',
    ticket_date:        '',
    position_id:        '',
    management_type:    '',
    department_id:      '',
    ultimate_hm_id:     '',
    direct_hm_id:       '',
    country_company_id: '',
    candidate_count:    1,
    action:             '',
    sub_action:         '',
    remarks:            '',
  };
}

export default function TicketModal({ mode, ticket, mappings, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const user = useAuthStore((s) => s.user);
  const canEditDate = user?.role === 'admin' || (
    user?.date_override_enabled === true &&
    user?.date_override_expires_at &&
    new Date(user.date_override_expires_at) > new Date()
  );

  const [form, setForm] = useState(() => {
    if (isEdit && ticket) {
      return {
        entry_date:         ticket.entry_date?.slice(0, 10)  || '',
        task_owner_id:      ticket.task_owner_id              || '',
        ticket_number:      ticket.ticket_number              || '',
        ticket_type:        ticket.ticket_type                || '',
        ticket_status:      ticket.ticket_status              || 'On-hold',
        ticket_date:        ticket.ticket_date?.slice(0, 10)  || '',
        position_id:        ticket.position_id                || '',
        management_type:    ticket.management_type            || '',
        department_id:      ticket.department_id              || '',
        ultimate_hm_id:     ticket.ultimate_hm_id             || '',
        direct_hm_id:       ticket.direct_hm_id               || '',
        country_company_id: ticket.country_company_id         || '',
        candidate_count:    ticket.candidate_count            || 1,
        action:             ticket.action                     || '',
        sub_action:         ticket.sub_action                 || '',
        remarks:            ticket.remarks                    || '',
      };
    }
    return empty();
  });

  function set(field, value) {
    if (field === 'action') {
      const rule = (mappings?.action_subaction_rules || []).find(r => r.action_value === value);
      setForm(f => ({
        ...f,
        action: value,
        sub_action: rule ? rule.sub_action_value : '',
      }));
    } else if (field === 'position_id') {
      const pos = (mappings?.positions || []).find(p => p.id === value);
      setForm(f => ({
        ...f,
        position_id: value,
        management_type: pos?.management_type || f.management_type,
      }));
    } else {
      setForm(f => ({ ...f, [field]: value }));
    }
  }

  const selectedPositionManagementType = (mappings?.positions || []).find(p => p.id === form.position_id)?.management_type || null;

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/tickets/${ticket.id}`, data).then(r => r.data)
      : api.post('/tickets', data).then(r => r.data),
    onSuccess: onSaved,
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form };
    ['position_id', 'department_id', 'ultimate_hm_id', 'direct_hm_id', 'country_company_id', 'task_owner_id'].forEach(k => {
      if (!payload[k]) delete payload[k];
    });
    mutation.mutate(payload);
  }

  // Dynamic values from mappings — fall back to empty arrays until loaded
  const statuses        = mappings?.ticket_statuses  || [];
  const ticketTypes     = mappings?.ticket_types     || [];
  const managementTypes = mappings?.management_types || [];
  const actions         = mappings?.actions          || [];
  const allSubActions   = mappings?.sub_actions      || [];
  const subActions      = allSubActions.filter(s => s.action_name === form.action);
  const users           = mappings?.users            || [];
  const isInline        = mode === 'add';

  const inner = (
    <form onSubmit={handleSubmit}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem' }}>
          {isEdit ? `Edit — ${ticket?.ticket_number}` : 'Add New Entry'}
        </h2>
        {isEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>}
      </div>

      {/* Row 1 */}
      <div className="form-grid form-grid-3" style={{ marginBottom:'18px' }}>
        <div className="form-group">
          <label>Date *</label>
          {canEditDate ? (
            <input
              type="date"
              value={form.entry_date}
              onChange={e => set('entry_date', e.target.value)}
              required
            />
          ) : (
            <input
              type="date"
              value={form.entry_date}
              readOnly
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
            />
          )}
        </div>
        <div className="form-group">
          <label>Task Owner</label>
          <select value={form.task_owner_id} onChange={e => set('task_owner_id', e.target.value)}>
            <option value="">Select…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Number *</label>
          <input required value={form.ticket_number} onChange={e => set('ticket_number', e.target.value)}
            placeholder="e.g. TKT-2026-001" />
        </div>
        <div className="form-group">
          <label>Ticket Type *</label>
          <select required value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
            <option value="">Select…</option>
            {ticketTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Status *</label>
          <select required value={form.ticket_status} onChange={e => set('ticket_status', e.target.value)}>
            {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Date *</label>
          <input type="date" required value={form.ticket_date} onChange={e => set('ticket_date', e.target.value)} />
        </div>
      </div>

      {/* Row 2 */}
      <div className="form-grid form-grid-3" style={{ marginBottom:'18px' }}>
        <div className="form-group">
          <label>Position</label>
          <select value={form.position_id} onChange={e => set('position_id', e.target.value)}>
            <option value="">Select…</option>
            {(mappings?.positions || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Management Type *</label>
          <select required value={form.management_type} onChange={e => set('management_type', e.target.value)}
            disabled={!!selectedPositionManagementType}
            title={selectedPositionManagementType ? 'Set by position' : undefined}
          >
            <option value="">Select…</option>
            {managementTypes.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Department</label>
          <select value={form.department_id} onChange={e => set('department_id', e.target.value)}>
            <option value="">Select…</option>
            {(mappings?.departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ultimate Hiring Manager</label>
          <select value={form.ultimate_hm_id} onChange={e => set('ultimate_hm_id', e.target.value)}>
            <option value="">Select…</option>
            {(mappings?.hiring_managers || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Direct Hiring Manager</label>
          <select value={form.direct_hm_id} onChange={e => set('direct_hm_id', e.target.value)}>
            <option value="">Select…</option>
            {(mappings?.hiring_managers || []).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Country &amp; Company</label>
          <select value={form.country_company_id} onChange={e => set('country_company_id', e.target.value)}>
            <option value="">Select…</option>
            {(mappings?.country_companies || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Row 3 */}
      <div className="form-grid form-grid-3" style={{ marginBottom:'24px' }}>
        <div className="form-group">
          <label>Number of Candidates *</label>
          <input type="number" min="1" required value={form.candidate_count}
            onChange={e => set('candidate_count', parseInt(e.target.value) || 1)} />
        </div>
        <div className="form-group">
          <label>Action *</label>
          <select required value={form.action} onChange={e => set('action', e.target.value)}>
            <option value="">Select…</option>
            {actions.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Sub-Action *</label>
          <select required value={form.sub_action} onChange={e => set('sub_action', e.target.value)}
            disabled={!form.action}>
            <option value="">Select…</option>
            {subActions.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: isInline ? 'span 3' : undefined }}>
          <label>Remarks</label>
          <input value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Optional notes…" />
        </div>
      </div>

      {form.sub_action === 'Active Hiring Tickets' && (
        <div style={{
          background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)',
          borderRadius:'var(--radius-sm)', padding:'12px 16px', marginBottom:'18px',
          fontSize:'0.85rem', color:'var(--primary)',
        }}>
          ★ <strong>Group Master row</strong> — a Group ID will be auto-generated. Cloned rows inherit the same Group ID, and changing this row's status automatically updates all cloned rows.
        </div>
      )}

      <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
        {isEdit && <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button type="submit" className="btn btn-success" disabled={mutation.isPending || mutation.isLoading}>
          {(mutation.isPending || mutation.isLoading)
            ? <><span className="spinner" style={{ width:16, height:16 }} /> Saving…</>
            : isEdit ? '💾 Save Changes' : '➕ Add Entry'}
        </button>
      </div>
    </form>
  );

  if (isInline) return <div className="card">{inner}</div>;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">{inner}</div>
    </div>
  );
}
