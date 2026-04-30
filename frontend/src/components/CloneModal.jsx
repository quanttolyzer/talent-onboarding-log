import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';

const TICKET_TYPES = ['Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding'];

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

export default function CloneModal({ rows, onClose, onSaved }) {
  const [overrides, setOverrides] = useState({
    entry_date:      new Date().toISOString().slice(0,10),
    ticket_number:   '',
    ticket_type:     '',
    candidate_count: '',
    action:          '',
    sub_action:      '',
    remarks:         '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/tickets/bulk-clone', {
      source_ids: rows.map(r => r.id),
      overrides: Object.fromEntries(
        Object.entries(overrides).filter(([, v]) => v !== '' && v !== null)
      ),
    }).then(r => r.data),
    onSuccess: onSaved,
    onError: (err) => toast.error(err.response?.data?.error || 'Clone failed'),
  });

  // FIX: action change is now atomic — clears sub_action in the same setState call,
  // eliminating the double-set race condition that caused the sub-action dropdown
  // to show no options after selecting an action.
  function set(k, v) {
    if (k === 'action') {
      setOverrides(o => ({ ...o, action: v, sub_action: '' }));
    } else {
      setOverrides(o => ({ ...o, [k]: v }));
    }
  }

  // subActions is derived from overrides.action on every render — always in sync
  const subActions = SUB_ACTIONS[overrides.action] || [];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
          <div>
            <h2 style={{ fontWeight:700 }}>Clone {rows.length} Row{rows.length > 1 ? 's' : ''}</h2>
            <p style={{ fontSize:'0.82rem', color:'var(--text-2)', marginTop:'4px' }}>
              Locked fields are inherited from the original row(s).
              Fill only the fields you want to override — blank keeps the original.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Locked field preview */}
        <div style={{
          background:'rgba(255,255,255,0.03)',
          border:'1px solid var(--border)',
          borderRadius:'var(--radius-sm)',
          padding:'12px 16px',
          marginBottom:'20px',
          fontSize:'0.82rem',
        }}>
          <div style={{ color:'var(--text-3)', fontWeight:600, marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>
            🔒 Locked (inherited from original)
          </div>
          {rows.length === 1 ? (
            <div style={{ display:'flex', flexWrap:'wrap', gap:'12px', color:'var(--text-2)' }}>
              <span>📅 Ticket Date: <strong>{rows[0].ticket_date?.slice(0,10) || '—'}</strong></span>
              <span>📌 {rows[0].position_name || '—'}</span>
              <span>🏢 {rows[0].department_name || '—'}</span>
              <span>👤 {rows[0].ultimate_hm_name || '—'}</span>
              <span>🌍 {rows[0].country_company_label || '—'}</span>
              <span>👔 {rows[0].task_owner_name || '—'}</span>
            </div>
          ) : (
            <div style={{ color:'var(--text-2)' }}>
              <div style={{ marginBottom:'6px' }}>Multiple rows selected — each clone inherits its own original values.</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                {rows.map(r => (
                  <span key={r.id} style={{
                    background:'rgba(99,102,241,0.1)',
                    border:'1px solid rgba(99,102,241,0.2)',
                    borderRadius:'4px',
                    padding:'2px 8px',
                    fontSize:'0.78rem',
                  }}>
                    {r.ticket_number} · {r.ticket_date?.slice(0,10) || '—'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Overridable fields */}
        <div className="form-grid form-grid-2" style={{ marginBottom:'18px' }}>
          <div className="form-group">
            <label>Date (override)</label>
            <input type="date" value={overrides.entry_date}
              onChange={e => set('entry_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Ticket Number (override)</label>
            <input value={overrides.ticket_number}
              onChange={e => set('ticket_number', e.target.value)}
              placeholder="Leave blank for auto-generated" />
          </div>
          <div className="form-group">
            <label>Ticket Type (override)</label>
            <select value={overrides.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
              <option value="">Keep original</option>
              {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Candidates (override)</label>
            <input type="number" min="1" value={overrides.candidate_count}
              onChange={e => set('candidate_count', e.target.value)}
              placeholder="Keep original" />
          </div>

          <div className="form-group">
            <label>Action (override)</label>
            {/* FIX: single set('action') call — atomic clear of sub_action handled inside set() */}
            <select value={overrides.action} onChange={e => set('action', e.target.value)}>
              <option value="">Keep original</option>
              <option value="Open Ticket">Open Ticket</option>
              <option value="Onboarding">Onboarding</option>
            </select>
          </div>

          <div className="form-group">
            <label>Sub-Action (override)</label>
            {/* FIX: disabled only when no action selected; subActions always in sync with overrides.action */}
            <select
              value={overrides.sub_action}
              onChange={e => set('sub_action', e.target.value)}
              disabled={!overrides.action}
            >
              <option value="">Keep original</option>
              {subActions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ gridColumn:'span 2' }}>
            <label>Remarks (override)</label>
            <input value={overrides.remarks} onChange={e => set('remarks', e.target.value)}
              placeholder="Leave blank to keep original" />
          </div>
        </div>

        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isLoading}>
            {mutation.isLoading
              ? <><span className="spinner" style={{width:16,height:16}} /> Cloning…</>
              : `Clone ${rows.length} Row${rows.length > 1 ? 's' : ''}`
            }
          </button>
        </div>

      </div>
    </div>
  );
}
