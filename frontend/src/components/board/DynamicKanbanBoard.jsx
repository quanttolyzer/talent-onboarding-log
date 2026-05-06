// frontend/src/components/board/DynamicKanbanBoard.jsx
import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ── Styles ────────────────────────────────────────────────────
const columnStyle = {
  width: '220px',
  minWidth: '220px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 130px)',
};
const headerStyle = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};
const badgeStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1px 7px',
  fontSize: '0.75rem',
  color: 'var(--text-2)',
};
const cardStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '8px 10px',
  marginBottom: '6px',
  fontSize: '0.84rem',
};
const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
};
const popupStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '24px',
  width: '340px',
  maxWidth: '90vw',
};

// ── DraggableCard ─────────────────────────────────────────────
const FIELD_LABELS = {
  ticket_number:   'Ticket #',
  ticket_type:     'Type',
  ticket_status:   'Status',
  position_name:   'Position',
  department_name: 'Department',
  management_type: 'Management',
  task_owner_name: 'Owner',
  candidate_count: 'Candidates',
  remarks:         'Remarks',
};

function DraggableCard({ entry, column, ticketId, isAdmin }) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    data: { entryId: entry.id, fromColumnId: column.id, existingFieldValues: entry.field_values },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tickets/${ticketId}/board/entries/${entry.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-board', ticketId] });
      toast.success('Entry removed');
    },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const configuredFields = column.card_display_fields || [];
  const ticketFields = entry.ticket_fields || {};

  const displayFields = configuredFields.length > 0
    ? configuredFields.map(key => ({ key, label: FIELD_LABELS[key] || key, value: ticketFields[key] })).filter(f => f.value != null && f.value !== '')
    : [{ key: 'ticket_number', label: 'Ticket #', value: ticketFields.ticket_number || '—' }];

  const titleField = displayFields[0];
  const detailFields = displayFields.slice(1);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...cardStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: '0.84rem', flex: 1 }}>
          {titleField ? `${titleField.value}` : '—'}
        </div>
        {isAdmin && (
          <button
            className="btn btn-danger btn-xs"
            style={{ padding: '1px 4px', fontSize: '0.68rem', marginLeft: '4px' }}
            onClick={e => { e.stopPropagation(); deleteMutation.mutate(); }}
            onMouseDown={e => e.stopPropagation()}
          >
            🗑
          </button>
        )}
      </div>
      {detailFields.map(f => (
        <div key={f.key} style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          <span style={{ fontWeight: 500 }}>{f.label}:</span> {f.value}
        </div>
      ))}
      {Object.entries(entry.field_values || {}).map(([k, v]) => (
        <div key={k} style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px', borderTop: '1px solid var(--border)', paddingTop: '3px' }}>
          <span style={{ fontWeight: 500 }}>{k}:</span> {v || '—'}
        </div>
      ))}
    </div>
  );
}

// ── DroppableColumn ───────────────────────────────────────────
function DroppableColumn({ column, ticketId, isAdmin, onAddEntry }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  });

  return (
    <div style={{
      ...columnStyle,
      outline: isOver ? '2px solid var(--primary)' : '2px solid transparent',
      transition: 'outline 0.15s',
    }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{column.label}</span>
        <span style={badgeStyle}>{column.entries.length}</span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: '60px' }}>
        {column.entries.map(entry => (
          <DraggableCard
            key={entry.id}
            entry={entry}
            column={column}
            ticketId={ticketId}
            isAdmin={isAdmin}
          />
        ))}
        {column.entries.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
            Drag entries here
          </p>
        )}
      </div>
      {isAdmin && (
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-xs"
            style={{ width: '100%', fontSize: '0.78rem' }}
            onClick={() => onAddEntry(column)}
          >
            + Add entry
          </button>
        </div>
      )}
    </div>
  );
}

// ── AddEntryPopup ─────────────────────────────────────────────
function AddEntryPopup({ column, ticketId, onClose }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});

  const mutation = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/board/entries`, {
      board_column_id: column.id,
      field_values: values,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-board', ticketId] });
      toast.success('Entry added');
      onClose();
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Add entry — {column.label}
        </h3>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
          {(column.fields || []).map(field => (
            <div key={field.field_key} className="form-group" style={{ marginBottom: '12px' }}>
              <label>{field.field_key}{field.is_required && ' *'}</label>
              <input
                value={values[field.field_key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                required={field.is_required}
                placeholder={field.field_key}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MovePopup ─────────────────────────────────────────────────
function MovePopup({ pendingMove, targetColumn, ticketId, onClose }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});

  const mutation = useMutation({
    mutationFn: (additionalValues) => api.patch(
      `/tickets/${ticketId}/board/entries/${pendingMove.entryId}/move`,
      { target_column_id: targetColumn.id, additional_field_values: additionalValues }
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-board', ticketId] });
      toast.success('Entry moved');
      onClose();
    },
    onError: err => {
      toast.error(err.response?.data?.error || 'Move failed');
      onClose();
    },
  });

  const existingKeys = Object.keys(pendingMove.existingFieldValues || {});
  const missingRequired = (targetColumn.fields || []).filter(
    f => f.is_required && !existingKeys.includes(f.field_key)
  );

  useEffect(() => {
    if (missingRequired.length === 0) {
      mutation.mutate({});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (missingRequired.length === 0) return null;

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Move to {targetColumn.label}
        </h3>
        <form onSubmit={e => {
          e.preventDefault();
          mutation.mutate(values);
        }}>
          {missingRequired.map(field => (
            <div key={field.field_key} className="form-group" style={{ marginBottom: '12px' }}>
              <label>{field.field_key} *</label>
              <input
                value={values[field.field_key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.field_key]: e.target.value }))}
                required
                autoFocus
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Moving…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DynamicKanbanBoard ────────────────────────────────────────
export default function DynamicKanbanBoard({ ticketId, columns, isAdmin }) {
  const [activeCard, setActiveCard]   = useState(null);
  const [addingToColumn, setAddingTo] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const colById = Object.fromEntries(columns.map(c => [c.id, c]));

  function handleDragStart({ active }) {
    setActiveCard(active.data.current);
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null);
    if (!over) return;

    const { entryId, fromColumnId } = active.data.current;
    const toColumnId = over.data.current?.columnId;
    if (!toColumnId || fromColumnId === toColumnId) return;

    const fromCol = colById[fromColumnId];
    if (!fromCol) return;

    if (!fromCol.allowed_target_ids.includes(toColumnId)) {
      const toLabel = colById[toColumnId]?.label || toColumnId;
      toast.error(`Cannot move from "${fromCol.label}" to "${toLabel}"`);
      return;
    }

    const entry = fromCol.entries.find(e => e.id === entryId);
    setPendingMove({
      entryId,
      existingFieldValues: entry?.field_values || {},
      toColumnId,
    });
  }

  const pendingTargetCol = pendingMove ? colById[pendingMove.toColumnId] : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
          {columns.map(col => (
            <DroppableColumn
              key={col.id}
              column={col}
              ticketId={ticketId}
              isAdmin={isAdmin}
              onAddEntry={setAddingTo}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard && (
            <div style={{ ...cardStyle, padding: '8px 12px', cursor: 'grabbing', opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
              👤 {activeCard.label || 'entry'}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {addingToColumn && (
        <AddEntryPopup
          column={addingToColumn}
          ticketId={ticketId}
          onClose={() => setAddingTo(null)}
        />
      )}

      {pendingMove && pendingTargetCol && (
        <MovePopup
          pendingMove={pendingMove}
          targetColumn={pendingTargetCol}
          ticketId={ticketId}
          onClose={() => setPendingMove(null)}
        />
      )}
    </>
  );
}
