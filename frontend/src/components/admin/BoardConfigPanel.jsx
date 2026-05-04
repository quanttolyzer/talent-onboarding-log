// frontend/src/components/admin/BoardConfigPanel.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const AVAILABLE_FIELDS = [
  'candidate_name', 'ticket_number', 'ticket_status', 'ticket_date',
  'task_owner', 'department', 'position', 'country_company',
  'action', 'sub_action', 'remarks', 'assessment_level', 'assessment_result',
];

function ColumnFieldsPanel({ column, onChange }) {
  const [open, setOpen] = useState(false);

  function toggleField(fieldKey) {
    const exists = column.fields.find(f => f.field_key === fieldKey);
    const next = exists
      ? column.fields.filter(f => f.field_key !== fieldKey)
      : [...column.fields, { field_key: fieldKey, is_required: false, display_order: column.fields.length + 1 }];
    onChange({ ...column, fields: next });
  }

  function toggleRequired(fieldKey) {
    const next = column.fields.map(f =>
      f.field_key === fieldKey ? { ...f, is_required: !f.is_required } : f
    );
    onChange({ ...column, fields: next });
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.75rem' }}
      >
        Fields ({column.fields.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
        }}>
          {AVAILABLE_FIELDS.map(key => {
            const included = column.fields.find(f => f.field_key === key);
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={!!included}
                  onChange={() => toggleField(key)}
                  style={{ width: 'auto' }}
                />
                <span style={{ flex: 1 }}>{key.replace(/_/g, ' ')}</span>
                {included && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-2)' }}>
                    <input
                      type="checkbox"
                      checked={included.is_required}
                      onChange={() => toggleRequired(key)}
                      style={{ width: 'auto' }}
                    />
                    required
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BoardConfigPanel({ ticketTypeId, onClose }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState('board');
  const [columns, setColumns] = useState([]);
  const [phases, setPhases] = useState([]);

  const configQuery = useQuery({
    queryKey: ['board-config-admin', ticketTypeId],
    queryFn: () => api.get(`/admin/board-configs/${ticketTypeId}`).then(r => r.data),
  });

  // Populate form from loaded config
  useEffect(() => {
    if (!configQuery.data) return;
    setMode(configQuery.data.mode || 'board');
    setColumns((configQuery.data.columns || []).map(c => ({ ...c, fields: c.fields || [] })));
    setPhases(configQuery.data.phases || []);
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // Build transitions from allowed_target_ids
      const transitions = [];
      for (const col of columns) {
        for (const toId of (col.allowed_target_ids || [])) {
          const toCol = columns.find(c => c.id === toId);
          if (toCol) transitions.push({ from_label: col.label, to_label: toCol.label });
        }
      }
      return api.put(`/admin/board-configs/${ticketTypeId}`, {
        mode,
        columns: columns.map((c, i) => ({ label: c.label, position: i + 1, fields: c.fields })),
        phases:  phases.map((p, i)  => ({ label: p.label, position: i + 1 })),
        transitions,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-config-admin', ticketTypeId] });
      toast.success('Board config saved');
    },
    onError: err => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/board-configs/${ticketTypeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-config-admin', ticketTypeId] });
      toast.success('Board config removed');
      onClose();
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  function addColumn() {
    setColumns(prev => [...prev, {
      id: `new-${Date.now()}`,
      label: '',
      position: prev.length + 1,
      fields: [],
      allowed_target_ids: [],
    }]);
  }

  function removeColumn(idx) {
    const removed = columns[idx];
    setColumns(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({
      ...c,
      position: i + 1,
      allowed_target_ids: (c.allowed_target_ids || []).filter(id => id !== removed.id),
    })));
  }

  function updateColumnLabel(idx, label) {
    setColumns(prev => prev.map((c, i) => i === idx ? { ...c, label } : c));
  }

  function updateColumn(idx, updated) {
    setColumns(prev => prev.map((c, i) => i === idx ? updated : c));
  }

  function toggleTransition(fromIdx, toId) {
    setColumns(prev => prev.map((c, i) => {
      if (i !== fromIdx) return c;
      const has = (c.allowed_target_ids || []).includes(toId);
      return {
        ...c,
        allowed_target_ids: has
          ? c.allowed_target_ids.filter(id => id !== toId)
          : [...(c.allowed_target_ids || []), toId],
      };
    }));
  }

  function addPhase() {
    setPhases(prev => [...prev, { id: `new-${Date.now()}`, label: '', position: prev.length + 1 }]);
  }

  function removePhase(idx) {
    setPhases(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, position: i + 1 })));
  }

  function updatePhaseLabel(idx, label) {
    setPhases(prev => prev.map((p, i) => i === idx ? { ...p, label } : p));
  }

  if (configQuery.isLoading) return <div style={{ padding: '16px' }}><div className="spinner" /></div>;

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      marginTop: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Board Configuration</span>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
      </div>

      {/* Mode selector */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ marginBottom: '6px', display: 'block', fontSize: '0.82rem' }}>View Mode</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['board', 'progress'].map(m => (
            <button
              key={m}
              type="button"
              className={mode === m ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setMode(m)}
            >
              {m === 'board' ? '📋 Board' : '📊 Progress'}
            </button>
          ))}
        </div>
      </div>

      {/* Board mode config */}
      {mode === 'board' && (
        <div>
          {/* Columns list */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
              Columns
            </div>
            {columns.map((col, idx) => (
              <div key={col.id || idx} style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '10px 12px',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'grab' }}>⠿</span>
                  <input
                    value={col.label}
                    onChange={e => updateColumnLabel(idx, e.target.value)}
                    placeholder="Column name"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    onClick={() => removeColumn(idx)}
                  >
                    🗑
                  </button>
                </div>
                <ColumnFieldsPanel column={col} onChange={updated => updateColumn(idx, updated)} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addColumn}>
              + Add Column
            </button>
          </div>

          {/* Transitions grid */}
          {columns.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
                Allowed Transitions
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-2)' }}>From \ To</th>
                      {columns.map(c => (
                        <th key={c.id} style={{ padding: '6px 8px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {c.label || '?'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((fromCol, fromIdx) => (
                      <tr key={fromCol.id}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {fromCol.label || '?'}
                        </td>
                        {columns.map(toCol => (
                          <td key={toCol.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {toCol.id !== fromCol.id ? (
                              <input
                                type="checkbox"
                                style={{ width: 'auto' }}
                                checked={(fromCol.allowed_target_ids || []).includes(toCol.id)}
                                onChange={() => toggleTransition(fromIdx, toCol.id)}
                              />
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress mode config */}
      {mode === 'progress' && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
            Phases (in order)
          </div>
          {phases.map((phase, idx) => (
            <div key={phase.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>⠿</span>
              <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', minWidth: '18px' }}>{idx + 1}.</span>
              <input
                value={phase.label}
                onChange={e => updatePhaseLabel(idx, e.target.value)}
                placeholder="Phase name"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-danger btn-xs" onClick={() => removePhase(idx)}>🗑</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPhase}>
            + Add Phase
          </button>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '8px' }}>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => { if (window.confirm('Remove this board config?')) deleteMutation.mutate(); }}
          disabled={deleteMutation.isPending || !configQuery.data}
        >
          Remove Config
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
