import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const ROLES = ['admin', 'member', 'viewer'];

export default function UserManagement() {
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showPasswordReset, setShowPasswordReset] = useState(null);
  const [accessUser, setAccessUser] = useState(null);

  // Users query
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: (userData) => api.post('/admin/users', userData).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      setShowCreateModal(false);
      toast.success('User created successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create user'),
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...userData }) => api.put(`/admin/users/${id}`, userData).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      setEditingUser(null);
      toast.success('User updated successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update user'),
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/users/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      toast.success('User deleted successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete user'),
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }) => api.put(`/admin/users/${id}/password`, { password }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      setShowPasswordReset(null);
      toast.success('Password reset successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to reset password'),
  });

  const users = usersQuery.data || [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>User Management</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          ➕ Create User
        </button>
      </div>

      {/* Users Table */}
      <div style={{ 
        borderRadius: 'var(--radius)', 
        border: '1px solid var(--border)', 
        overflow: 'hidden',
        background: 'var(--bg-surface)'
      }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td>
              </tr>
            )}
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>{user.email}</td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: user.role === 'admin' ? 'var(--primary)' : 'var(--bg-tertiary)',
                    color: user.role === 'admin' ? 'white' : 'var(--text-1)',
                  }}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: user.is_active ? 'var(--success)' : 'var(--danger)',
                    color: 'white',
                  }}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setEditingUser(user)}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setShowPasswordReset(user.id)}
                    >
                      🔑
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setAccessUser(user)} title="Manage Access">
                      🔐
                    </button>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => {
                        if (window.confirm(`Delete user ${user.name}? This cannot be undone.`)) {
                          deleteUserMutation.mutate(user.id);
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(userData) => createUserMutation.mutate(userData)}
          isLoading={createUserMutation.isLoading}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={(userData) => updateUserMutation.mutate({ id: editingUser.id, ...userData })}
          isLoading={updateUserMutation.isLoading}
        />
      )}

      {/* Password Reset Modal */}
      {showPasswordReset && (
        <PasswordResetModal
          userId={showPasswordReset}
          onClose={() => setShowPasswordReset(null)}
          onSubmit={(password) => resetPasswordMutation.mutate({ id: showPasswordReset, password })}
          isLoading={resetPasswordMutation.isLoading}
        />
      )}

      {/* Access Modal */}
      {accessUser && (
        <UserAccessModal user={accessUser} onClose={() => setAccessUser(null)} />
      )}
    </div>
  );
}

function UserAccessModal({ user, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('visibility');
  const [expiresAt, setExpiresAt] = useState('');

  const allUsersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data),
  });

  const grantsQuery = useQuery({
    queryKey: ['user-visibility', user.id],
    queryFn: () => api.get(`/admin/users/${user.id}/visibility`).then(r => r.data),
  });

  const userDetailQuery = useQuery({
    queryKey: ['admin-user-detail', user.id],
    queryFn: () => api.get('/admin/users').then(r => r.data.find(u => u.id === user.id)),
  });

  const grantMutation = useMutation({
    mutationFn: (target_id) => api.post(`/admin/users/${user.id}/visibility`, { target_id }),
    onSuccess: () => qc.invalidateQueries(['user-visibility', user.id]),
    onError: (e) => toast.error(e.response?.data?.error || 'Grant failed'),
  });

  const revokeMutation = useMutation({
    mutationFn: (target_id) => api.delete(`/admin/users/${user.id}/visibility/${target_id}`),
    onSuccess: () => qc.invalidateQueries(['user-visibility', user.id]),
    onError: (e) => toast.error(e.response?.data?.error || 'Revoke failed'),
  });

  const openOverrideMutation = useMutation({
    mutationFn: () => api.post(`/admin/users/${user.id}/date-override`, { expires_at: expiresAt }),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      qc.invalidateQueries(['admin-user-detail', user.id]);
      toast.success('Date override opened');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const closeOverrideMutation = useMutation({
    mutationFn: () => api.delete(`/admin/users/${user.id}/date-override`),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      qc.invalidateQueries(['admin-user-detail', user.id]);
      toast.success('Date override closed');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const grantedIds  = new Set((grantsQuery.data || []).map(g => g.target_id));
  const otherUsers  = (allUsersQuery.data || []).filter(u => u.id !== user.id && u.is_active);
  const targetUser  = userDetailQuery.data;
  const overrideActive = targetUser?.date_override_enabled &&
    targetUser?.date_override_expires_at &&
    new Date(targetUser.date_override_expires_at) > new Date();

  function toggleGrant(targetId) {
    if (grantedIds.has(targetId)) revokeMutation.mutate(targetId);
    else grantMutation.mutate(targetId);
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const boxStyle = {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', width: '500px', maxWidth: '95vw',
    maxHeight: '80vh', overflowY: 'auto', padding: '24px',
  };
  const tabBtn = (t) => ({
    padding: '8px 16px', background: 'transparent', border: 'none',
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily: 'var(--font)', fontWeight: 600, fontSize: '0.85rem',
    cursor: 'pointer', marginBottom: '-1px',
  });

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700 }}>Access — {user.name}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          <button style={tabBtn('visibility')} onClick={() => setTab('visibility')}>Visibility</button>
          <button style={tabBtn('date-override')} onClick={() => setTab('date-override')}>Date Override</button>
        </div>

        {tab === 'visibility' && (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '12px' }}>
              Check the users whose tickets <strong>{user.name}</strong> can see (in addition to their own).
            </p>
            {(grantsQuery.isLoading || allUsersQuery.isLoading)
              ? <div className="spinner" style={{ margin: '20px auto' }} />
              : otherUsers.map(u => (
                <label key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', fontSize: '0.88rem',
                }}>
                  <input
                    type="checkbox"
                    checked={grantedIds.has(u.id)}
                    onChange={() => toggleGrant(u.id)}
                    style={{ width: 'auto' }}
                  />
                  {u.name}
                  <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{u.email}</span>
                </label>
              ))
            }
          </div>
        )}

        {tab === 'date-override' && (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '16px' }}>
              Allow <strong>{user.name}</strong> to enter a custom date when adding or updating entries.
            </p>
            {overrideActive ? (
              <div>
                <p style={{ fontSize: '0.88rem', marginBottom: '12px' }}>
                  ✅ Active until: <strong>{new Date(targetUser.date_override_expires_at).toLocaleString()}</strong>
                </p>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => closeOverrideMutation.mutate()}
                  disabled={closeOverrideMutation.isLoading}
                >
                  Close Window Now
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-3)', marginBottom: '12px' }}>Inactive</p>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Expires at</label>
                  <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => openOverrideMutation.mutate()}
                  disabled={!expiresAt || openOverrideMutation.isLoading}
                >
                  Open Window
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Create User Modal
function CreateUserModal({ onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Create New User</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Password</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit User Modal
function EditUserModal({ user, onClose, onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Edit User</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              {ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Password Reset Modal
function PasswordResetModal({ userId, onClose, onSubmit, isLoading }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    onSubmit(password);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid var(--border)',
      }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Reset Password</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>New Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Confirm Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
