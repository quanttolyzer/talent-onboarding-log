import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function UpdateProgressModal({ ticket, mappings, onClose, onSaved }) {
  const qc   = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const today = new Date().toISOString().slice(0, 10);
  const canEditDate = user?.role === 'admin' || (
    user?.date_override_enabled === true &&
    user?.date_override_expires_at &&
    new Date(user.date_override_expires_at) > new Date()
  );

  const [tab, setTab] = useState('update');
  const [form, setForm] = useState({
    entry_date:      today,
    ticket_status:   ticket.ticket_status || '',
    ticket_type:     ticket.ticket_type   || '',
    candidate_count: ticket.candidate_count || 1,
    remarks:         ticket.remarks       || '',
  });

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const progressMutation = useMutation({
    mutationFn: (data) => api.post(`/tickets/${ticket.id}/progress`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['tickets']);
      toast.success('Progress updated');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const historyQuery = useQuery({
    queryKey: ['ticket-updates', ticket.id],
    queryFn: () => api.get(`/tickets/${ticket.id}/updates`).then(r => r.data),
    enabled: tab === 'history',
  });

  function handleSubmit(e) {
    e.preventDefault();
    progressMutation.mutate(form);
  }

  const statuses   = mappings?.ticket_statuses || [];
  const types      = mappings?.ticket_types    || [];

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const boxStyle = {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', width: '620px', maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto', padding: '28px',
  };
  const tabBtn = (t) => ({
    padding: '8px 16px', background: 'transparent', border: 'none',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily: 'var(--font)', fontWeight: 600, fontSize: '0.85rem',
    cursor: 'pointer', marginBottom: '-1px',
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>
            Update Progress — {ticket.ticket_number}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px',
          padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)', fontSize: '0.82rem',
        }}>
          <div><span style={{ color: 'var(--text-2)' }}>Position: </span>{ticket.position_name || '—'}</div>
          <div><span style={{ color: 'var(--text-2)' }}>Department: </span>{ticket.department_name || '—'}</div>
          <div><span style={{ color: 'var(--text-2)' }}>Task Owner: </span>{ticket.task_owner_name || '—'}</div>
          <div><span style={{ color: 'var(--text-2)' }}>Ticket Date: </span>{ticket.ticket_date?.slice(0, 10) || '—'}</div>
        </div>

        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <button style={tabBtn('update')} onClick={() => setTab('update')}>Update</button>
          <button style={tabBtn('history')} onClick={() => setTab('history')}>History</button>
        </div>

        {tab === 'update' && (
          <form onSubmit={handleSubmit}>
            <div className="form-grid form-grid-2" style={{ marginBottom: '16px' }}>
              <div className="form-group">
                <label>Effective Date</label>
                {canEditDate ? (
                  <input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} />
                ) : (
                  <input type="date" value={form.entry_date} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                )}
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={form.ticket_status} onChange={e => set('ticket_status', e.target.value)}>
                  {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Ticket Type</label>
                <select value={form.ticket_type} onChange={e => set('ticket_type', e.target.value)}>
                  <option value="">— Select —</option>
                  {types.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Candidates</label>
                <input type="number" min="1" value={form.candidate_count}
                  onChange={e => set('candidate_count', parseInt(e.target.value, 10))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Remarks</label>
              <textarea value={form.remarks} onChange={e => set('remarks', e.target.value)}
                rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={progressMutation.isLoading}>
                {progressMutation.isLoading ? 'Saving…' : 'Save Update'}
              </button>
            </div>
          </form>
        )}

        {tab === 'history' && (
          <div>
            {historyQuery.isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}
            {historyQuery.data?.length === 0 && (
              <p style={{ color: 'var(--text-2)', textAlign: 'center', padding: '20px' }}>No updates yet.</p>
            )}
            {(historyQuery.data || []).map(entry => (
              <div key={entry.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '12px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '6px' }}>
                  <strong>{entry.submitted_by_name || 'Unknown'}</strong>
                  {' · '}{new Date(entry.submitted_at).toLocaleString()}
                  {' · '}Effective: {entry.effective_date?.slice(0, 10)}
                </div>
                {(entry.changes || []).map((c, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
                    <span style={{ color: 'var(--text-2)' }}>{c.field}: </span>
                    <span style={{ textDecoration: 'line-through', color: 'var(--text-3)' }}>{String(c.old_value)}</span>
                    {' → '}
                    <span style={{ color: 'var(--primary)' }}>{String(c.new_value)}</span>
                  </div>
                ))}
                {(!entry.changes || entry.changes.length === 0) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginLeft: '8px' }}>No field changes recorded.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
