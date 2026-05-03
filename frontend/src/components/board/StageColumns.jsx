// frontend/src/components/board/StageColumns.jsx
import { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  columnStyle, headerStyle, badgeStyle, cardStyle, emptyStyle, overlayStyle, popupStyle,
} from './ScreeningColumn';

function DraggableStageCard({ stage, onEditResult, positionId, isAdmin }) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `stage-${stage.candidate_id}`,
    data: {
      candidateId: stage.candidate_id,
      candidateName: stage.candidate_name,
      sourceStage: stage.stage,
      stageId: stage.id,
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/positions/${positionId}/stages/${stage.id}`),
    onSuccess: () => { qc.invalidateQueries(['board', positionId]); toast.success('Removed from stage'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...cardStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>👤 {stage.candidate_name}</div>
        {isAdmin && (
          <button
            className="btn btn-danger btn-xs"
            style={{ padding: '1px 4px', fontSize: '0.68rem' }}
            onClick={e => { e.stopPropagation(); deleteMutation.mutate(); }}
            onMouseDown={e => e.stopPropagation()}
          >
            🗑
          </button>
        )}
      </div>
      {stage.assessment_level && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          Level: {stage.assessment_level}
        </div>
      )}
      {stage.assessment_result !== null && stage.assessment_result !== undefined && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '1px' }}>
          Result: {stage.assessment_result || <span style={{ color: 'var(--text-3)' }}>—</span>}
        </div>
      )}
      {stage.offer_ticket_number && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '3px' }}>
          Ticket: {stage.offer_ticket_number}
        </div>
      )}
      {onEditResult && (
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginTop: '6px', fontSize: '0.72rem' }}
          onClick={e => { e.stopPropagation(); onEditResult(stage); }}
          onMouseDown={e => e.stopPropagation()}
        >
          Edit result
        </button>
      )}
    </div>
  );
}

function DroppableColumn({ stage, label, children, count }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage}`,
    data: { targetStage: stage },
  });

  return (
    <div style={{
      ...columnStyle,
      outline: isOver ? '2px solid var(--primary)' : '2px solid transparent',
      transition: 'outline 0.15s',
    }}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{label}</span>
        <span style={badgeStyle}>{count}</span>
      </div>
      <div ref={setNodeRef} style={{ flex: 1, overflowY: 'auto', padding: '8px', minHeight: '60px' }}>
        {children}
      </div>
    </div>
  );
}

function EditResultPopup({ stage, positionId, onClose }) {
  const qc = useQueryClient();
  const [result, setResult] = useState(stage.assessment_result || '');

  const mutation = useMutation({
    mutationFn: () => api.patch(`/positions/${positionId}/stages/${stage.id}`, { assessment_result: result }),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      toast.success('Result updated');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={popupStyle}>
        <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
          Edit Assessment Result — {stage.candidate_name}
        </h3>
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label>Assessment Result</label>
          <input
            value={result}
            onChange={e => setResult(e.target.value)}
            placeholder="e.g. Pass, Fail, On Hold"
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssessmentColumn({ positionId, stages, isAdmin }) {
  const [editingStage, setEditingStage] = useState(null);
  const candidates = stages.filter(s => s.stage === 'assessment');

  return (
    <>
      <DroppableColumn stage="assessment" label="Assessment" count={candidates.length}>
        {candidates.map(s => (
          <DraggableStageCard
            key={s.id}
            stage={s}
            onEditResult={setEditingStage}
            positionId={positionId}
            isAdmin={isAdmin}
          />
        ))}
        {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
      </DroppableColumn>
      {editingStage && (
        <EditResultPopup
          stage={editingStage}
          positionId={positionId}
          onClose={() => setEditingStage(null)}
        />
      )}
    </>
  );
}

export function TechnicalInterviewColumn({ stages, positionId, isAdmin }) {
  const candidates = stages.filter(s => s.stage === 'technical_interview');
  return (
    <DroppableColumn stage="technical_interview" label="Tech Interview" count={candidates.length}>
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} positionId={positionId} isAdmin={isAdmin} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}

export function OfferColumn({ stages, positionId, isAdmin }) {
  const candidates = stages.filter(s => s.stage === 'offer');
  return (
    <DroppableColumn stage="offer" label="Offer" count={candidates.length}>
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} positionId={positionId} isAdmin={isAdmin} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}

export function HiredColumn({ stages, position, positionId, isAdmin }) {
  const candidates = stages.filter(s => s.stage === 'hired');
  const required   = parseInt(position.required_candidates, 10) || 0;
  const filled     = position.board_status === 'filled';

  return (
    <DroppableColumn stage="hired" label="Hired" count={candidates.length}>
      {filled && (
        <div style={{
          background: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius)',
          padding: '8px 10px',
          fontSize: '0.78rem',
          color: '#22c55e',
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          ✅ {candidates.length}/{required} hired
        </div>
      )}
      {candidates.map(s => (
        <DraggableStageCard key={s.id} stage={s} positionId={positionId} isAdmin={isAdmin} />
      ))}
      {candidates.length === 0 && <p style={emptyStyle}>Drag candidates here</p>}
    </DroppableColumn>
  );
}
