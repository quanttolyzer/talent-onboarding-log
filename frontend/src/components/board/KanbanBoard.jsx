// frontend/src/components/board/KanbanBoard.jsx
import { useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import ScreeningColumn, { overlayStyle, popupStyle, cardStyle } from './ScreeningColumn';
import BatchesColumn from './BatchesColumn';
import {
  AssessmentColumn,
  TechnicalInterviewColumn,
  OfferColumn,
  HiredColumn,
} from './StageColumns';

const VALID_TRANSITIONS = {
  batch:                'assessment',
  assessment:           'technical_interview',
  technical_interview:  'offer',
  offer:                'hired',
};

const REQUIRES_POPUP = {
  assessment: true,
  offer:      true,
};

export default function KanbanBoard({ positionId, board, assessmentLevels }) {
  const qc = useQueryClient();
  const [activeCard, setActiveCard]           = useState(null);
  const [pendingDrop, setPendingDrop]         = useState(null);
  const [assessmentLevel, setAssessmentLevel] = useState('');
  const [offerTicket, setOfferTicket]         = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const stageMutation = useMutation({
    mutationFn: (body) => api.post(`/positions/${positionId}/stages`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['board', positionId]);
      qc.invalidateQueries(['board-log', positionId]);
      setPendingDrop(null);
      setAssessmentLevel('');
      setOfferTicket('');
      toast.success('Candidate moved');
    },
    onError: (err) => {
      setPendingDrop(null);
      toast.error(err.response?.data?.error || 'Move failed');
    },
  });

  function handleDragStart({ active }) {
    setActiveCard(active.data.current);
  }

  function handleDragEnd({ active, over }) {
    setActiveCard(null);
    if (!over) return;

    const { candidateId, candidateName, sourceStage } = active.data.current;
    const { targetStage } = over.data.current;

    if (VALID_TRANSITIONS[sourceStage] !== targetStage) {
      toast.error(`Cannot move from ${sourceStage.replace('_', ' ')} to ${targetStage.replace('_', ' ')}`);
      return;
    }

    if (REQUIRES_POPUP[targetStage]) {
      setPendingDrop({ candidateId, candidateName, targetStage });
    } else {
      stageMutation.mutate({ candidate_id: candidateId, stage: targetStage });
    }
  }

  function handlePopupSubmit(e) {
    e.preventDefault();
    if (!pendingDrop) return;
    const body = { candidate_id: pendingDrop.candidateId, stage: pendingDrop.targetStage };
    if (pendingDrop.targetStage === 'assessment') {
      if (!assessmentLevel) return toast.error('Select an assessment level');
      body.assessment_level = assessmentLevel;
    }
    if (pendingDrop.targetStage === 'offer') {
      if (!offerTicket.trim()) return toast.error('Enter offer ticket number');
      body.offer_ticket_number = offerTicket.trim();
    }
    stageMutation.mutate(body);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '12px',
          alignItems: 'flex-start',
        }}>
          <ScreeningColumn positionId={positionId} screenings={board.screenings} />
          <BatchesColumn positionId={positionId} batches={board.batches} />
          <AssessmentColumn positionId={positionId} stages={board.stages} assessmentLevels={assessmentLevels} />
          <TechnicalInterviewColumn stages={board.stages} />
          <OfferColumn stages={board.stages} />
          <HiredColumn stages={board.stages} position={board.position} />
        </div>

        <DragOverlay>
          {activeCard && (
            <div style={{ ...cardStyle, padding: '8px 12px', cursor: 'grabbing', opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
              👤 {activeCard.candidateName}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingDrop?.targetStage === 'assessment' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setPendingDrop(null); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
              Move to Assessment — {pendingDrop.candidateName}
            </h3>
            <form onSubmit={handlePopupSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Assessment Level *</label>
                <select value={assessmentLevel} onChange={e => setAssessmentLevel(e.target.value)} required>
                  <option value="">— Select —</option>
                  {(assessmentLevels || []).map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDrop(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={stageMutation.isPending}>
                  {stageMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDrop?.targetStage === 'offer' && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setPendingDrop(null); }}>
          <div style={popupStyle}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', fontSize: '0.95rem' }}>
              Move to Offer — {pendingDrop.candidateName}
            </h3>
            <form onSubmit={handlePopupSubmit}>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Offer Ticket Number *</label>
                <input
                  value={offerTicket}
                  onChange={e => setOfferTicket(e.target.value)}
                  placeholder="e.g. OFR-2026-001"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingDrop(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={stageMutation.isPending}>
                  {stageMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
