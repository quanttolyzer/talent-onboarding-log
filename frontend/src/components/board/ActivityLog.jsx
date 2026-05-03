// frontend/src/components/board/ActivityLog.jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';

function describeEvent(eventType, payload, actorName) {
  const actor = actorName || 'Someone';
  switch (eventType) {
    case 'screening_added':
      return `${actor} added a screening entry: ${payload.count} candidates`;
    case 'batch_created':
      return `${actor} created batch "${payload.batch_name}"`;
    case 'candidate_added':
      return `${actor} added "${payload.candidate_name}" to batch "${payload.batch_name}"`;
    case 'candidate_moved':
      return `${actor} moved "${payload.candidate_name}" to ${(payload.to_stage || '').replace('_', ' ')}`;
    case 'position_filled':
      return `Position automatically marked as Filled`;
    case 'position_reopened':
      return `${actor} re-opened the position`;
    case 'stage_updated':
      return `${actor} updated ${payload.field} for "${payload.candidate_name}"`;
    default:
      return `${actor} performed action: ${eventType}`;
  }
}

export default function ActivityLog({ positionId }) {
  const [page, setPage] = useState(1);

  const logQuery = useQuery({
    queryKey: ['board-log', positionId, page],
    queryFn: () => api.get(`/positions/${positionId}/log`, { params: { page } }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const entries = logQuery.data?.data || [];
  const pages   = logQuery.data?.pages || 1;

  return (
    <div style={{ marginTop: '32px' }}>
      <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '16px' }}>Activity Log</h2>

      {logQuery.isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}

      {entries.length === 0 && !logQuery.isLoading && (
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>No activity recorded yet.</p>
      )}

      {entries.map(entry => (
        <div key={entry.id} style={{
          display: 'flex',
          gap: '12px',
          padding: '10px 0',
          borderBottom: '1px solid var(--border)',
          fontSize: '0.84rem',
        }}>
          <div style={{ color: 'var(--text-3)', fontSize: '0.75rem', whiteSpace: 'nowrap', paddingTop: '1px', minWidth: '120px' }}>
            {new Date(entry.created_at).toLocaleString()}
          </div>
          <div style={{ color: 'var(--text-1)' }}>
            {describeEvent(entry.event_type, entry.payload || {}, entry.actor_name)}
          </div>
        </div>
      ))}

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
          <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>Page {page} of {pages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
