// frontend/src/pages/PositionPage.jsx
// Legacy route — position boards are now served as ticket boards.
// This component finds the first ticket for the given position and redirects to its board.
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export default function PositionPage() {
  const { positionId } = useParams();

  const q = useQuery({
    queryKey: ['position-ticket', positionId],
    queryFn: () =>
      api.get('/tickets', { params: { position_id: positionId, limit: 1 } })
        .then(r => r.data?.data?.[0] || null),
  });

  if (q.isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  );

  if (!q.data) return <Navigate to="/" replace />;

  return <Navigate to={`/tickets/${q.data.id}/board`} replace />;
}
