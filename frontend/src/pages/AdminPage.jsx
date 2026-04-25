import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import UserManagement from '../components/admin/UserManagement';
import DropdownManagement from '../components/admin/DropdownManagement';
import DataExport from '../components/admin/DataExport';
import SystemStats from '../components/admin/SystemStats';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('users');

  // System stats query
  const statsQuery = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const tabs = [
    { id: 'users', label: '👥 User Management', icon: '👥' },
    { id: 'dropdowns', label: '📋 Dropdown Management', icon: '📋' },
    { id: 'export', label: '📊 Data Export', icon: '📊' },
    { id: 'stats', label: '📈 System Stats', icon: '📈' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        height: '60px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
          }}>⚙️</div>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>Admin Control Panel</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{user?.name} (Admin)</span>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '100%', overflow: 'hidden' }}>
        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--text-1)' : 'var(--text-2)',
                fontFamily: 'var(--font)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'var(--transition)',
                marginBottom: '-1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="fade-up">
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'dropdowns' && <DropdownManagement />}
          {activeTab === 'export' && <DataExport />}
          {activeTab === 'stats' && <SystemStats stats={statsQuery.data} isLoading={statsQuery.isLoading} />}
        </div>
      </main>
    </div>
  );
}
