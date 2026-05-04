function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function actionLabel(field, oldVal, newVal) {
  if (!oldVal && newVal)  return `set ${field} → "${newVal}"`;
  if (oldVal && !newVal)  return `cleared ${field}`;
  return `changed ${field}: "${oldVal}" → "${newVal}"`;
}

export default function SystemStats({ stats, isLoading, activity = [], activityLoading = false }) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)' }}>
        No statistics available
      </div>
    );
  }

  const userStats = stats.users || {};
  const ticketStats = stats.tickets || {};
  const todayStats = stats.today || {};

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 700 }}>System Statistics</h2>
        <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '0.9rem' }}>
          Real-time overview of system usage and activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
        {/* User Statistics */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            👥 User Statistics
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Total Users</span>
              <span style={{ fontWeight: 600, fontSize: '1.2rem' }}>{userStats.total_users || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Active Users</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{userStats.active_users || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Admin Users</span>
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{userStats.admin_users || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Member Users</span>
              <span style={{ fontWeight: 600 }}>{userStats.member_users || 0}</span>
            </div>
          </div>
        </div>

        {/* Ticket Statistics */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎫 Ticket Statistics
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Total Tickets</span>
              <span style={{ fontWeight: 600, fontSize: '1.2rem' }}>{ticketStats.total_tickets || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>On Hold</span>
              <span style={{ fontWeight: 600, color: 'var(--warning)' }}>{ticketStats.on_hold || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>In Progress</span>
              <span style={{ fontWeight: 600, color: 'var(--info)' }}>{ticketStats.in_progress || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Hired</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{ticketStats.hired || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Active</span>
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{ticketStats.active || 0}</span>
            </div>
          </div>
        </div>

        {/* Today's Activity */}
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          padding: '20px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            📅 Today's Activity
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>New Tickets</span>
              <span style={{ fontWeight: 600, fontSize: '1.2rem', color: 'var(--primary)' }}>{todayStats.tickets_today || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-2)' }}>Hired Today</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{todayStats.hired_today || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginTop: '24px',
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          🕐 Recent Activity
          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-2)', marginLeft: '4px' }}>
            (latest {activity.length} entries)
          </span>
        </h3>

        {activityLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-2)', fontSize: '0.9rem' }}>
            No activity recorded yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {activity.map((entry, i) => (
              <div key={entry.id} style={{
                display: 'grid',
                gridTemplateColumns: '180px 140px 1fr',
                gap: '12px',
                alignItems: 'start',
                padding: '10px 12px',
                borderRadius: '6px',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                fontSize: '0.85rem',
              }}>
                {/* Date & time */}
                <span style={{ color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatDateTime(entry.changed_at)}
                </span>
                {/* User + ticket */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                    {entry.changed_by_name || 'System'}
                  </span>
                  {entry.ticket_number && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                      {entry.ticket_number}
                    </span>
                  )}
                </div>
                {/* What changed */}
                <span style={{ color: 'var(--text-1)', wordBreak: 'break-word' }}>
                  {actionLabel(entry.field_name, entry.old_value, entry.new_value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Health */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginTop: '24px',
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>System Health</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: 600 }}>Database</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Connected</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: 600 }}>API</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Operational</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✅</div>
            <div style={{ fontWeight: 600 }}>Auth</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Working</div>
          </div>
        </div>
      </div>
    </div>
  );
}
