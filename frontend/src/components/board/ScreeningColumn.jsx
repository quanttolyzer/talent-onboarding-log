// frontend/src/components/board/ScreeningColumn.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function ScreeningColumn({ positionId, screenings, isAdmin }) {
  const qc = useQueryClient();
  const [showPopup, setShowPopup] = useState(false);
  const [count, setCount] = useState('');

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/positions/${positionId}/screenings/${id}`),
    onSuccess: () => { qc.invalidateQueries(['board', positionId]); toast.success('Deleted'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const addMutation = useMutation({
    mutationFn: (data) => api.post(`/positions/${positionId}/screenings`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setShowPopup(false);
      setCount('');
      toast.success('Screening added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    const n = parseInt(count, 10);
    if (!n || n < 1) return toast.error('Enter a valid number');
    addMutation.mutate({ count: n });
  }

  return (
    <div style={columnStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Screening</span>
        <span style={badgeStyle}>{screenings.length}</span>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowPopup(true)}
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {screenings.map((s, i) => (
          <div key={s.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Screening #{i + 1}</div>
              {isAdmin && (
                <button className="btn btn-danger btn-xs" style={{ padding: '1px 5px', fontSize: '0.7rem' }}
                  onClick={() => deleteMutation.mutate(s.id)}>🗑</button>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '2px' }}>
              {s.count} candidates · {new Date(s.created_at).toLocaleDateString()}
            </div>
            {s.created_by_name && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '2px' }}>
                by {s.created_by_name}
              </div>
            )}
          </div>
        ))}
        {screenings.length === 0 && (
          <p style={emptyStyle}>No screenings yet</p>
        )}
      </div>

      {showPopup && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowPopup(false); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>Add Screening</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Number of Screenings</label>
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={e => setCount(e.target.value)}
                  placeholder="e.g. 12"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPopup(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={addMutation.isPending}>
                  {addMutation.isPending ? 'Adding…' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared styles (exported so other column files can import them)
export const columnStyle = {
  display: 'flex',
  flexDirection: 'column',
  width: '220px',
  minWidth: '220px',
  background: 'var(--bg)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  maxHeight: '600px',
};
export const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};
export const badgeStyle = {
  background: 'var(--primary)',
  color: '#fff',
  borderRadius: '99px',
  padding: '1px 7px',
  fontSize: '0.72rem',
  fontWeight: 700,
};
export const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '10px',
  marginBottom: '8px',
  fontSize: '0.82rem',
};
export const emptyStyle = {
  color: 'var(--text-3)',
  fontSize: '0.8rem',
  textAlign: 'center',
  padding: '20px 8px',
};
export const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};
export const popupStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '24px',
  width: '340px',
  maxWidth: '95vw',
};
