// frontend/src/components/board/DynamicProgressStepper.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function DynamicProgressStepper({ ticketId, phases, currentPhaseId, history, isAdmin }) {
  const qc = useQueryClient();

  const currentIdx = currentPhaseId
    ? phases.findIndex(p => p.id === currentPhaseId)
    : -1;

  const advanceMutation = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/board/advance`),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Phase advanced');
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  const jumpMutation = useMutation({
    mutationFn: (phaseId) => api.post(`/tickets/${ticketId}/board/phase/${phaseId}`),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-board', ticketId]);
      toast.success('Phase updated');
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  const isLast = currentIdx === phases.length - 1;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>

      {/* Stepper strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '32px', overflowX: 'auto', paddingBottom: '8px' }}>
        {phases.map((phase, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent   = idx === currentIdx;
          const isUpcoming  = idx > currentIdx;

          const circleColor = isCurrent || isCompleted ? 'var(--primary)' : 'var(--border)';
          const textColor   = isUpcoming ? 'var(--text-3)' : 'var(--text-1)';

          return (
            <div key={phase.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div
                  onClick={() => isAdmin && jumpMutation.mutate(phase.id)}
                  title={isAdmin ? `Jump to "${phase.label}"` : undefined}
                  style={{
                    width: '36px', height: '36px',
                    borderRadius: '50%',
                    background: isCurrent || isCompleted ? circleColor : 'transparent',
                    border: `2px solid ${circleColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isCurrent || isCompleted ? '#fff' : 'var(--text-3)',
                    fontWeight: 700, fontSize: '0.85rem',
                    cursor: isAdmin ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: isCurrent ? 700 : 400,
                  color: textColor,
                  whiteSpace: 'nowrap',
                  maxWidth: '90px',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {phase.label}
                </span>
              </div>

              {idx < phases.length - 1 && (
                <div style={{
                  height: '2px',
                  width: '48px',
                  background: idx < currentIdx ? 'var(--primary)' : 'var(--border)',
                  marginBottom: '22px',
                  flexShrink: 0,
                  transition: 'background 0.2s',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current phase label */}
      {currentPhaseId && (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '4px' }}>Current phase</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>
            {phases.find(p => p.id === currentPhaseId)?.label || '—'}
          </div>
        </div>
      )}

      {/* Advance button */}
      {!isLast && (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => advanceMutation.mutate()}
          disabled={advanceMutation.isPending}
          style={{ marginBottom: '32px' }}
        >
          {advanceMutation.isPending
            ? 'Advancing…'
            : currentPhaseId
            ? `Advance to: ${phases[currentIdx + 1]?.label}`
            : `Start: ${phases[0]?.label}`}
        </button>
      )}
      {isLast && currentPhaseId && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius)', padding: '8px 14px',
          color: '#22c55e', fontSize: '0.85rem', fontWeight: 600,
          marginBottom: '32px',
        }}>
          ✅ All phases complete
        </div>
      )}

      {/* Activity log */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '10px' }}>
            History
          </div>
          {history.map((entry, i) => (
            <div key={i} style={{
              display: 'flex', gap: '12px', alignItems: 'flex-start',
              padding: '8px 0',
              borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: '0.82rem',
            }}>
              <span style={{ color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {entry.phase_label}
              </span>
              <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span style={{ color: 'var(--text-3)' }}>by {entry.advanced_by || 'system'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
