// frontend/src/components/board/BatchesColumn.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import {
  columnStyle, headerStyle, badgeStyle, cardStyle, emptyStyle, overlayStyle, popupStyle,
} from './ScreeningColumn';

function DraggableCandidate({ candidate, batchId }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `candidate-${candidate.id}`,
    data: { candidateId: candidate.id, candidateName: candidate.name, sourceStage: 'batch', batchId },
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
        marginBottom: '4px',
        padding: '7px 10px',
        fontSize: '0.8rem',
        userSelect: 'none',
      }}
    >
      👤 {candidate.name}
    </div>
  );
}

function BatchCard({ batch, positionId, qc }) {
  const [expanded, setExpanded] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateName, setCandidateName] = useState('');

  const addCandidateMutation = useMutation({
    mutationFn: (name) => api.post(`/positions/${positionId}/batches/${batch.id}/candidates`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setCandidateName('');
      setShowAddCandidate(false);
      toast.success('Candidate added');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <div style={{ ...cardStyle, padding: '10px', marginBottom: '8px' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: expanded ? '8px' : 0 }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: '0.8rem' }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 600, fontSize: '0.84rem', flex: 1 }}>{batch.name}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{batch.candidates.length}</span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: '4px' }}>
          {batch.candidates.map(c => (
            <DraggableCandidate key={c.id} candidate={c} batchId={batch.id} />
          ))}
          {batch.candidates.length === 0 && (
            <p style={{ ...emptyStyle, padding: '8px' }}>No candidates yet</p>
          )}

          {showAddCandidate ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (candidateName.trim()) addCandidateMutation.mutate(candidateName.trim());
              }}
              style={{ marginTop: '6px' }}
            >
              <input
                value={candidateName}
                onChange={e => setCandidateName(e.target.value)}
                placeholder="Candidate name"
                autoFocus
                style={{ marginBottom: '4px', fontSize: '0.8rem', padding: '5px 8px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button type="submit" className="btn btn-primary btn-xs" disabled={addCandidateMutation.isPending}>
                  Add
                </button>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowAddCandidate(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="btn btn-ghost btn-xs"
              style={{ width: '100%', marginTop: '4px', fontSize: '0.78rem' }}
              onClick={() => setShowAddCandidate(true)}
            >
              + Add candidate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchesColumn({ positionId, batches }) {
  const qc = useQueryClient();
  const [showPanel, setShowPanel] = useState(false);
  const [batchName, setBatchName] = useState('');

  const totalCandidates = batches.reduce((sum, b) => sum + b.candidates.length, 0);

  const addBatchMutation = useMutation({
    mutationFn: (name) => api.post(`/positions/${positionId}/batches`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setBatchName('');
      setShowPanel(false);
      toast.success('Batch created');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed'),
  });

  return (
    <>
      <div style={{ ...columnStyle, width: '260px', minWidth: '260px' }}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Batches</span>
          <span style={badgeStyle}>{totalCandidates}</span>
          <button className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setShowPanel(true)}>
            +
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {batches.map(batch => (
            <BatchCard key={batch.id} batch={batch} positionId={positionId} qc={qc} />
          ))}
          {batches.length === 0 && <p style={emptyStyle}>No batches yet</p>}
        </div>
      </div>

      {showPanel && (
        <div style={{ ...overlayStyle, justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPanel(false); }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            width: '320px',
            height: '100%',
            padding: '24px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Create Batch</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPanel(false)}>✕</button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (batchName.trim()) addBatchMutation.mutate(batchName.trim());
            }}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Batch Name</label>
                <input
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                  placeholder="e.g. Engineering Round 1"
                  autoFocus
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={addBatchMutation.isPending}>
                {addBatchMutation.isPending ? 'Creating…' : 'Create Batch'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
