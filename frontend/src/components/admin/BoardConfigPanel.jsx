// frontend/src/components/admin/BoardConfigPanel.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const TICKET_CARD_FIELDS = [
  { key: 'ticket_number',   label: 'Ticket Number' },
  { key: 'ticket_type',     label: 'Ticket Type' },
  { key: 'ticket_status',   label: 'Status' },
  { key: 'position_name',   label: 'Position' },
  { key: 'department_name', label: 'Department' },
  { key: 'management_type', label: 'Management Type' },
  { key: 'task_owner_name', label: 'Task Owner' },
  { key: 'candidate_count', label: 'Candidates' },
  { key: 'remarks',         label: 'Remarks' },
];

function CardDisplayFieldsPanel({ column, onChange }) {
  const [open, setOpen] = useState(false);
  const current = column.card_display_fields || [];

  function toggle(key) {
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key];
    onChange({ ...column, card_display_fields: next });
  }

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.75rem' }}
      >
        Card Display Fields ({current.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
        }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '8px' }}>
            Select ticket fields to show on board cards for this column.
          </p>
          {TICKET_CARD_FIELDS.map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={current.includes(f.key)}
                onChange={() => toggle(f.key)}
                style={{ width: 'auto' }}
              />
              {f.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function emptyConfig(sortOrder) {
  return {
    id: null,
    mode: 'board',
    sort_order: sortOrder,
    columns: [],
    phases: [],
  };
}

function ColumnFieldsPanel({ column, onChange }) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  function addField() {
    const label = newLabel.trim();
    if (!label) return;
    if (column.fields.find(f => f.field_key === label)) {
      toast.error('Field label already exists');
      return;
    }
    onChange({
      ...column,
      fields: [...column.fields, { field_key: label, is_required: false, display_order: column.fields.length + 1 }],
    });
    setNewLabel('');
  }

  function removeField(fieldKey) {
    onChange({ ...column, fields: column.fields.filter(f => f.field_key !== fieldKey) });
  }

  function toggleRequired(fieldKey) {
    onChange({
      ...column,
      fields: column.fields.map(f =>
        f.field_key === fieldKey ? { ...f, is_required: !f.is_required } : f
      ),
    });
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.75rem' }}
      >
        Custom Fields ({column.fields.length}) {open ? '▲' : '▼'}
      </button>

      {open && (
        <div style={{
          marginTop: '8px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px',
        }}>
          {column.fields.length === 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginBottom: '8px' }}>
              No custom fields yet. Add one below.
            </p>
          )}

          {column.fields.map(f => (
            <div key={f.field_key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.82rem' }}>
              <span style={{ flex: 1, fontWeight: 500 }}>{f.field_key}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={f.is_required}
                  onChange={() => toggleRequired(f.field_key)}
                  style={{ width: 'auto' }}
                />
                required
              </label>
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => removeField(f.field_key)}
                style={{ padding: '1px 5px', fontSize: '0.7rem' }}
              >
                🗑
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addField(); } }}
              placeholder="Field label (e.g. Interview Date)"
              style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px' }}
            />
            <button type="button" className="btn btn-ghost btn-xs" onClick={addField}>
              + Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BoardConfigPanel({ ticketTypeId, onClose }) {
  const qc = useQueryClient();
  const [configs, setConfigs] = useState([emptyConfig(1)]);
  const [activeIdx, setActiveIdx] = useState(0);

  const configQuery = useQuery({
    queryKey: ['board-config-admin', ticketTypeId],
    queryFn: () => api.get(`/admin/board-configs/${ticketTypeId}`).then(r => r.data),
  });

  useEffect(() => {
    if (!configQuery.data) return;
    const incoming = (configQuery.data.configs || []).map((cfg, i) => ({
      id: cfg.id,
      mode: cfg.mode || 'board',
      sort_order: cfg.sort_order || i + 1,
      columns: (cfg.columns || []).map(c => ({ ...c, fields: c.fields || [], card_display_fields: c.card_display_fields || [] })),
      phases: cfg.phases || [],
    }));
    if (incoming.length === 0) {
      setConfigs([emptyConfig(1)]);
      setActiveIdx(0);
      return;
    }
    setConfigs(incoming);
    setActiveIdx(prev => Math.min(prev, incoming.length - 1));
  }, [configQuery.data]);

  const activeConfig = configs[activeIdx] || emptyConfig(1);
  const mode = activeConfig.mode || 'board';
  const columns = activeConfig.columns || [];
  const phases = activeConfig.phases || [];

  function updateActiveConfig(updater) {
    setConfigs(prev =>
      prev.map((cfg, i) =>
        i === activeIdx
          ? (typeof updater === 'function' ? updater(cfg) : { ...cfg, ...updater })
          : cfg
      )
    );
  }

  function setMode(nextMode) {
    updateActiveConfig(cfg => ({ ...cfg, mode: nextMode }));
  }

  function setColumns(updater) {
    updateActiveConfig(cfg => ({
      ...cfg,
      columns: typeof updater === 'function' ? updater(cfg.columns || []) : updater,
    }));
  }

  function setPhases(updater) {
    updateActiveConfig(cfg => ({
      ...cfg,
      phases: typeof updater === 'function' ? updater(cfg.phases || []) : updater,
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (let idx = 0; idx < configs.length; idx += 1) {
        const cfg = configs[idx];
        const cfgColumns = cfg.columns || [];
        const cfgPhases = cfg.phases || [];
        const transitions = [];

        for (const col of cfgColumns) {
          for (const toId of (col.allowed_target_ids || [])) {
            const toCol = cfgColumns.find(c => c.id === toId);
            if (toCol) transitions.push({ from_label: col.label, to_label: toCol.label });
          }
        }

        await api.put(`/admin/board-configs/${ticketTypeId}`, {
          config_id: cfg.id || undefined,
          sort_order: idx + 1,
          mode: cfg.mode || 'board',
          columns: cfgColumns.map((c, i) => ({ label: c.label, position: i + 1, fields: c.fields || [], card_display_fields: c.card_display_fields || [] })),
          phases: cfgPhases.map((p, i) => ({ label: p.label, position: i + 1 })),
          transitions,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-config-admin', ticketTypeId] });
      toast.success('Board config saved');
    },
    onError: err => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (configId) => api.delete(`/admin/board-configs/${ticketTypeId}/${configId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board-config-admin', ticketTypeId] });
      toast.success('Board config removed');
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  function addBoardConfig() {
    if (configs.length >= 2) {
      toast.error('Only 2 board configs are allowed per ticket type');
      return;
    }
    setConfigs(prev => [...prev, emptyConfig(prev.length + 1)]);
    setActiveIdx(configs.length);
  }

  function removeCurrentConfig() {
    const cfg = configs[activeIdx];
    if (!cfg) return;
    if (!window.confirm('Remove this board config?')) return;

    if (!cfg.id) {
      setConfigs(prev => {
        const next = prev.filter((_, i) => i !== activeIdx);
        return next.length > 0 ? next : [emptyConfig(1)];
      });
      setActiveIdx(0);
      return;
    }

    deleteMutation.mutate(cfg.id);
  }

  function addColumn() {
    setColumns(prev => [...prev, {
      id: `new-${Date.now()}`,
      label: '',
      position: prev.length + 1,
      fields: [],
      allowed_target_ids: [],
      card_display_fields: [],
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

      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
          Boards (max 2)
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {configs.map((cfg, i) => (
            <button
              key={cfg.id || `new-${i}`}
              type="button"
              className={activeIdx === i ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setActiveIdx(i)}
            >
              {cfg.mode === 'board' ? '📋 Board' : '📊 Progress'} {i + 1}
            </button>
          ))}
          {configs.length < 2 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={addBoardConfig}>
              + Add Board
            </button>
          )}
        </div>
      </div>

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

      {mode === 'board' && (
        <div>
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
                <CardDisplayFieldsPanel column={col} onChange={updated => updateColumn(idx, updated)} />
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={addColumn}>
              + Add Column
            </button>
          </div>

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

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '8px' }}>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={removeCurrentConfig}
          disabled={deleteMutation.isPending}
        >
          Remove This Board
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
