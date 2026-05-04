// frontend/src/pages/TicketBoardPage.jsx
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import DynamicKanbanBoard from '../components/board/DynamicKanbanBoard';
import DynamicProgressStepper from '../components/board/DynamicProgressStepper';

export default function TicketBoardPage() {
  const { ticketId } = useParams();
  const user    = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const boardQuery = useQuery({
    queryKey: ['ticket-board', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/board`).then(r => r.data),
    staleTime: 0,
  });

  if (boardQuery.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (boardQuery.isError) {
    const msg = boardQuery.error?.response?.data?.error || 'Unknown error';
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>{msg}</p>
        <Link to="/" className="btn btn-ghost btn-sm">← Back</Link>
      </div>
    );
  }

  const board = boardQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '16px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>← Back</Link>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {board.mode === 'board' ? 'Board' : 'Progress'}
        </span>
      </header>

      <main style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
        {board.mode === 'board' && (
          <DynamicKanbanBoard ticketId={ticketId} columns={board.columns} isAdmin={isAdmin} />
        )}
        {board.mode === 'progress' && (
          <DynamicProgressStepper
            ticketId={ticketId}
            phases={board.phases}
            currentPhaseId={board.current_phase_id}
            history={board.history}
            isAdmin={isAdmin}
          />
        )}
      </main>
    </div>
  );
}
