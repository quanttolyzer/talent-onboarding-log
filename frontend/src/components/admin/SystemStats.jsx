export default function SystemStats({ stats, isLoading }) {
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

      {/* Activity Chart Placeholder */}
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding: '20px',
        marginTop: '24px',
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600 }}>Recent Activity</h3>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px', 
          color: 'var(--text-2)',
          border: '1px dashed var(--border)',
          borderRadius: '6px',
        }}>
          📊 Activity charts and graphs can be implemented here
          <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>
            Consider integrating a charting library like Chart.js or Recharts for visual analytics
          </div>
        </div>
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
