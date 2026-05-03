// frontend/src/components/board/PositionDetails.jsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-1)' }}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function PositionDetails({ position, positionId }) {
  const qc = useQueryClient();

  const reopenMutation = useMutation({
    mutationFn: () => api.post(`/positions/${positionId}/reopen`),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      toast.success('Position re-opened');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to re-open'),
  });

  const isFilled = position.board_status === 'filled';
  const managementType = position.position_management_type || position.management_type || null;

  const fields = [
    ['Department',          position.department_name],
    ['Country & Company',   position.country_company_label],
    ['Management Type',     managementType],
    ['Ultimate HM',         position.ultimate_hm_name],
    ['Direct HM',           position.direct_hm_name],
    ['Candidates Required', position.required_candidates],
    ['Ticket Count',        position.ticket_count],
    ['Ticket Status',       position.ticket_status],
    ['Ticket Type',         position.ticket_type],
    ['Action',              position.action],
    ['Sub-Action',          position.sub_action],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px 24px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: '4px' }}>
            {position.name}
          </h1>
          <div style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '99px',
            fontSize: '0.78rem',
            fontWeight: 600,
            background: isFilled ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
            color: isFilled ? '#ef4444' : 'var(--primary)',
          }}>
            {isFilled ? '● Filled' : '● Open'}
          </div>
        </div>
        {isFilled && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isPending}
          >
            {reopenMutation.isPending ? 'Re-opening…' : 'Re-open Position'}
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px',
        marginTop: '16px',
      }}>
        {fields.map(([label, value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </div>

      {isFilled && (
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius)',
          fontSize: '0.85rem',
          color: '#ef4444',
        }}>
          ✅ Position filled — all required candidates hired. Click "Re-open Position" to continue hiring.
        </div>
      )}
    </div>
  );
}
