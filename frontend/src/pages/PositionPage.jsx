// frontend/src/pages/PositionPage.jsx
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import PositionDetails from '../components/board/PositionDetails';
import KanbanBoard from '../components/board/KanbanBoard';
import ActivityLog from '../components/board/ActivityLog';

export default function PositionPage() {
  const { positionId } = useParams();

  const boardQuery = useQuery({
    queryKey: ['board', positionId],
    queryFn: () => api.get(`/positions/${positionId}/board`).then(r => r.data),
    staleTime: 0,
  });

  const mappingsQuery = useQuery({
    queryKey: ['mappings'],
    queryFn: () => api.get('/mappings').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const assessmentLevels = mappingsQuery.data?.assessment_levels || [];

  if (boardQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (boardQuery.isError) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>
          Failed to load position: {boardQuery.error?.response?.data?.error || 'Unknown error'}
        </p>
        <Link to="/" className="btn btn-ghost btn-sm">← Back</Link>
      </div>
    );
  }

  const board = boardQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '12px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link
          to="/"
          className="btn btn-ghost btn-sm"
          style={{ textDecoration: 'none' }}
        >
          ← Main View
        </Link>
        <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
          / {board.position.name}
        </span>
      </header>

      {/* Content */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '100%' }}>

        {/* Position details card */}
        <PositionDetails position={board.position} positionId={positionId} />

        {/* Board */}
        <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '16px' }}>Hiring Board</h2>
        <KanbanBoard
          positionId={positionId}
          board={board}
          assessmentLevels={assessmentLevels}
        />

        {/* Activity log */}
        <ActivityLog positionId={positionId} />

      </main>
    </div>
  );
}
