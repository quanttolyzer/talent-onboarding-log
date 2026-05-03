// frontend/src/components/board/HRInterviewColumn.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import { columnStyle, headerStyle, badgeStyle, cardStyle, emptyStyle, overlayStyle, popupStyle } from './ScreeningColumn';

export default function HRInterviewColumn({ positionId, hrInterviews, isAdmin }) {
  const qc = useQueryClient();
  const [showPopup, setShowPopup] = useState(false);
  const [count, setCount] = useState('');

  const addMutation = useMutation({
    mutationFn: (data) => api.post(`/positions/${positionId}/hr-interviews`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setShowPopup(false);
      setCount('');
      toast.success('HR Interview added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/positions/${positionId}/hr-interviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      toast.success('Deleted');
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
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>HR Interview</span>
        <span style={badgeStyle}>{hrInterviews.length}</span>
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowPopup(true)}
        >
          +
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {hrInterviews.map((h, i) => (
          <div key={h.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>HR Interview #{i + 1}</div>
              {isAdmin && (
                <button
                  className="btn btn-danger btn-xs"
                  style={{ padding: '1px 5px', fontSize: '0.7rem' }}
                  onClick={() => deleteMutation.mutate(h.id)}
                >
                  🗑
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '2px' }}>
              {h.count} candidates · {new Date(h.created_at).toLocaleDateString()}
            </div>
            {h.created_by_name && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '2px' }}>
                by {h.created_by_name}
              </div>
            )}
          </div>
        ))}
        {hrInterviews.length === 0 && (
          <p style={emptyStyle}>No HR interviews yet</p>
        )}
      </div>

      {showPopup && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowPopup(false); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>Add HR Interview</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Number of Candidates</label>
                <input
                  type="number"
                  min="1"
                  value={count}
                  onChange={e => setCount(e.target.value)}
                  placeholder="e.g. 8"
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
