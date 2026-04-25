import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';

const STATUSES      = ['On-hold','In-Progress','Hired','Active','Accepted','Joined','Cancelled','Rejected'];
const TICKET_TYPES  = ['Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding'];
const MGMT_TYPES    = ['Management','Non - Management'];
const TASK_OWNERS   = ['Dina Atef','Abdallah Abodokhan','Habiba','Marina','Nessma Adel','Rivan Adel','Mariam Aly','Mirette Ashraf'];

const SUB_ACTIONS = {
  'Open Ticket': [
    'Create Hiring Request','Active Hiring Tickets','Profile Screening',
    'Interview Execution','Batch Shared with Hiring Manager','Interview Scheduled',
    'Job Offer Created','Job Offer in the Approval Cycle','Offer Shared with candidate',
    'Candidate Accepted Job Offer','Candidate Rejected Job Offer','Closed Hiring Ticket',
  ],
  'Onboarding': [
    'E-Visa Request','E-Wakala Request','Create Contract','Contract Attestation Request',
    'IT Request','Induction Program Preparation','Booking Accomodation',
    'Iqama Transfer Request','Flight Ticket','Closed Onboarding Tickets',
  ],
};

function empty() {
  return {
    entry_date: new Date().toISOString().slice(0,10),
    task_owner_name: '',
    ticket_number: '',
    ticket_type: '',
    ticket_status: 'On-hold',
    ticket_date: '',
    position_id: '',
    management_type: '',
    department_id: '',
    ultimate_hm_id: '',
    direct_hm_id: '',
    country_company_id: '',
    candidate_count: 1,
    action: '',
    sub_action: '',
    remarks: '',
  };
}

export default function TicketModal({ mode, ticket, mappings, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(() => {
    if (isEdit && ticket) {
      return {
        entry_date:         ticket.entry_date?.slice(0,10) || '',
        task_owner_name:    ticket.task_owner_name || '',
        ticket_number:      ticket.ticket_number || '',
        ticket_type:        ticket.ticket_type || '',
        ticket_status:      ticket.ticket_status || 'On-hold',
        ticket_date:        ticket.ticket_date?.slice(0,10) || '',
        position_id:        ticket.position_id || '',
        management_type:    ticket.management_type || '',
        department_id:      ticket.department_id || '',
        ultimate_hm_id:     ticket.ultimate_hm_id || '',
        direct_hm_id:       ticket.direct_hm_id || '',
        country_company_id: ticket.country_company_id || '',
        candidate_count:    ticket.candidate_count || 1,
        action:             ticket.action || '',
        sub_action:         ticket.sub_action || '',
        remarks:            ticket.remarks || '',
      };
    }
    return empty();
  });

  // Resolve task_owner_id from name for new entries
  const [ownerName, setOwnerName] = useState(
    isEdit ? (ticket?.task_owner_name || '') : ''
  );

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    if (field === 'action') {
      setForm(f => ({ ...f, action: value, sub_action: '' }));
    }
  }

  const mutation = useMutation({
    mutationFn: async (data) => {
      // Find task_owner_id from users list if needed
      // For simplicity we send task_owner_name as a label; backend resolves
      if (isEdit) {
        return api.put(`/tickets/${ticket.id}`, data).then(r => r.data);
      } else {
        return api.post('/tickets', data).then(r => r.data);
      }
    },
    onSuccess: onSaved,
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    const payload = { ...form };
    // Remove empty strings for optional FK fields
    ['position_id','department_id','ultimate_hm_id','direct_hm_id','country_company_id'].forEach(k => {
      if (!payload[k]) delete payload[k];
    });
    mutation.mutate(payload);
  }

  const subActions = SUB_ACTIONS[form.action] || [];
  const isInline = mode === 'add'; // embedded in page, not modal

  const inner = (
    <form onSubmit={handleSubmit}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <h2 style={{ fontWeight:700, fontSize:'1.1rem' }}>
          {isEdit ? `Edit — ${ticket?.ticket_number}` : 'Add New Entry'}
        </h2>
        {isEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>}
      </div>

      <div className="form-grid form-grid-3" style={{ marginBottom:'18px' }}>
        <div className="form-group">
          <label>Date *</label>
          <input type="date" required value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Task Owner *</label>
          <select required value={ownerName} onChange={e => setOwnerName(e.target.value)}>
            <option value="">Select…</option>
            {TASK_OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Number *</label>
          <input required value={form.ticket_number} onChange={e => set('ticket_number', e.target.value)} placeholder="e.g. TKT-2026-001" />
        </div>
        <div className="form-group">
          <label>Ticket Type *</label>
          <select required value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
            <option value="">Select…</option>
            {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Status *</label>
          <select required value={form.ticket_status} onChange={e => set('ticket_status', e.target.value)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Ticket Date *</label>
          <input type="date" required value={form.ticket_date} onChange={e => set('ticket_date', e.target.value)} />
        </div>
      </div>

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
          <select required value={form.management_type} onChange={e => set('management_type', e.target.value)}>
            <option value="">Select…</option>
            {MGMT_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
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
            {(mappings?.country_companies || []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-grid form-grid-3" style={{ marginBottom:'24px' }}>
        <div className="form-group">
          <label>Number of Candidates *</label>
          <input type="number" min="1" required value={form.candidate_count}
            onChange={e => set('candidate_count', parseInt(e.target.value) || 1)} />
        </div>
        <div className="form-group">
          <label>Action *</label>
          <select required value={form.action} onChange={e => { set('action', e.target.value); }}>
            <option value="">Select…</option>
            <option value="Open Ticket">Open Ticket</option>
            <option value="Onboarding">Onboarding</option>
          </select>
        </div>
        <div className="form-group">
          <label>Sub-Action *</label>
          <select required value={form.sub_action} onChange={e => set('sub_action', e.target.value)} disabled={!form.action}>
            <option value="">Select…</option>
            {subActions.map(s => <option key={s} value={s}>{s}</option>)}
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
          ⭐ <strong>Group Master row</strong> — a Group ID will be auto-generated. Any cloned rows from this ticket will inherit the same Group ID, and changing this row's status will automatically update all cloned rows.
        </div>
      )}

      <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
        {isEdit && <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>}
        <button type="submit" className="btn btn-success" disabled={mutation.isLoading}>
          {mutation.isLoading
            ? <><span className="spinner" style={{width:16,height:16}} /> Saving…</>
            : isEdit ? '💾 Save Changes' : '➕ Add Entry'
          }
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
