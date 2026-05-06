// frontend/src/pages/TicketBoardPage.jsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import DynamicKanbanBoard from '../components/board/DynamicKanbanBoard';
import DynamicProgressStepper from '../components/board/DynamicProgressStepper';

// ── Helpers ───────────────────────────────────────────────────
function fmt(val) {
  if (!val) return '—';
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(val).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return val;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function activityLabel(entry) {
  switch (entry.field_name) {
    case 'created':      return 'Ticket created';
    case 'board_column': return `Moved: ${entry.old_value} → ${entry.new_value}`;
    case 'phase':        return `Phase: ${entry.old_value} → ${entry.new_value}`;
    default:
      return `${entry.field_name.replace(/_/g, ' ')}: ${entry.old_value || '—'} → ${entry.new_value || '—'}`;
  }
}

// ── TicketDetails ─────────────────────────────────────────────
function TicketDetails({ ticket }) {
  const [expanded, setExpanded] = useState(true);

  const statusColors = {
    'On-hold':    { bg: 'rgba(234,179,8,0.12)',  color: '#ca8a04' },
    'In-Progress':{ bg: 'rgba(59,130,246,0.12)', color: '#2563eb' },
    'Hired':      { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
    'Active':     { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
    'Accepted':   { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
    'Joined':     { bg: 'rgba(34,197,94,0.12)',  color: '#16a34a' },
    'Cancelled':  { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
    'Rejected':   { bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  };
  const sc = statusColors[ticket.ticket_status] || { bg: 'var(--bg-surface)', color: 'var(--text-1)' };

  const fields = [
    { label: 'Type',        value: ticket.ticket_type },
    { label: 'Entry Date',  value: fmt(ticket.entry_date) },
    { label: 'Ticket Date', value: fmt(ticket.ticket_date) },
    { label: 'Position',    value: ticket.position_name },
    { label: 'Department',  value: ticket.department_name },
    { label: 'Management',  value: ticket.management_type },
    { label: 'Country/Co',  value: ticket.country_company_label },
    { label: 'Ult. HM',     value: ticket.ultimate_hm_name },
    { label: 'Direct HM',   value: ticket.direct_hm_name },
    { label: 'Owner',       value: ticket.task_owner_name },
    { label: 'Candidates',  value: ticket.candidate_count },
    { label: 'Remarks',     value: ticket.remarks, full: true },
  ].filter(f => f.value);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: '20px',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 16px', cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-1)' }}>
          #{ticket.ticket_number}
        </span>
        <span style={{
          fontSize: '0.78rem', fontWeight: 600, padding: '2px 10px',
          borderRadius: '20px', background: sc.bg, color: sc.color,
        }}>
          {ticket.ticket_status}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
          {expanded ? '▲ hide' : '▼ details'}
        </span>
      </div>

      {/* Detail grid */}
      {expanded && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px 24px',
          padding: '14px 16px',
        }}>
          {fields.map(f => (
            <div
              key={f.label}
              style={f.full
                ? { width: '100%', fontSize: '0.83rem' }
                : { fontSize: '0.83rem', minWidth: '150px' }
              }
            >
              <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>{f.label}</span>
              <div style={{ color: 'var(--text-1)', fontWeight: 500, marginTop: '1px' }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ActivityLog ───────────────────────────────────────────────
function ActivityLog({ ticketId }) {
  const { data: log = [], isLoading } = useQuery({
    queryKey: ['ticket-audit', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/audit`).then(r => r.data),
    staleTime: 0,
  });

  if (isLoading) return null;
  if (log.length === 0) return null;

  // Sort newest first
  const sorted = [...log].sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginTop: '24px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)',
      }}>
        Activity Log
      </div>
      <div style={{ padding: '8px 0' }}>
        {sorted.map(entry => (
          <div key={entry.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.82rem',
          }}>
            <span style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: entry.field_name === 'created'
                ? 'rgba(34,197,94,0.15)'
                : entry.field_name === 'board_column' || entry.field_name === 'phase'
                ? 'rgba(59,130,246,0.15)'
                : 'rgba(156,163,175,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', flexShrink: 0,
            }}>
              {entry.field_name === 'created'      ? '✦'
               : entry.field_name === 'board_column' ? '→'
               : entry.field_name === 'phase'        ? '◉'
               : '✎'}
            </span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>
                {activityLabel(entry)}
              </span>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '2px' }}>
                {entry.changed_by_name || 'system'} · {timeAgo(entry.changed_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function TicketBoardPage() {
  const { ticketId } = useParams();
  const user    = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const boardQuery = useQuery({
    queryKey: ['ticket-board', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/board`).then(r => r.data),
    staleTime: 0,
  });

  const ticketQuery = useQuery({
    queryKey: ['ticket-detail', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}`).then(r => r.data),
    staleTime: 30000,
  });

  if (boardQuery.isLoading || ticketQuery.isLoading) {
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

  const { boards } = boardQuery.data;
  const ticket = ticketQuery.data;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Sticky top bar */}
      <header style={{
        height: '52px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: '16px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link to="/" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>← Back</Link>
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          {boards.length === 1
            ? (boards[0].mode === 'board' ? '📋 Board' : '📊 Progress')
            : '📋 Boards'}
        </span>
        {ticket && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
            {ticket.ticket_number}
          </span>
        )}
      </header>

      <main style={{ flex: 1, padding: '20px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>

        {/* Ticket details */}
        {ticket && <TicketDetails ticket={ticket} />}

        {/* Stacked boards */}
        {boards.map((board, i) => (
          <div key={board.sort_order} style={{ marginBottom: '32px' }}>
            <div style={{
              fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)',
              marginBottom: '12px',
            }}>
              {board.mode === 'board' ? '📋 Board' : '📊 Progress'}
              {boards.length > 1 ? ` (${i + 1})` : ''}
            </div>
            {board.mode === 'board' && (
              <DynamicKanbanBoard ticketId={ticketId} columns={board.columns} isAdmin={isAdmin} />
            )}
            {board.mode === 'progress' && (
              <DynamicProgressStepper
                ticketId={ticketId}
                phases={board.phases}
                currentPhaseId={board.current_phase_id}
                isAdmin={isAdmin}
              />
            )}
          </div>
        ))}

        {/* Activity log */}
        <ActivityLog ticketId={ticketId} />

      </main>
    </div>
  );
}
