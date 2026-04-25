import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

export default function DropdownManagement() {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState('positions');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Dropdown data query
  const dropdownsQuery = useQuery({
    queryKey: ['admin-dropdowns'],
    queryFn: () => api.get('/admin/dropdowns').then(r => r.data),
  });

  const data = dropdownsQuery.data || {};

  // Generic mutations for CRUD operations
  const createMutation = useMutation({
    mutationFn: ({ section, name }) => api.post(`/admin/${section}`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      setShowCreateModal(false);
      toast.success('Item created successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ section, id, ...data }) => api.put(`/admin/${section}/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      setEditingItem(null);
      toast.success('Item updated successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update item'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ section, id }) => api.delete(`/admin/${section}/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      toast.success('Item deleted successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete item'),
  });

  const sections = [
    { id: 'positions', label: 'Positions', data: data.positions || [] },
    { id: 'departments', label: 'Departments', data: data.departments || [] },
    { id: 'hiringManagers', label: 'Hiring Managers', data: data.hiringManagers || [] },
    { id: 'countryCompanies', label: 'Country/Companies', data: data.countryCompanies || [] },
  ];

  const currentSection = sections.find(s => s.id === activeSection) || sections[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Dropdown Management</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          ➕ Add {currentSection.label.slice(0, -1)}
        </button>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeSection === section.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeSection === section.id ? 'var(--text-1)' : 'var(--text-2)',
              fontFamily: 'var(--font)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'var(--transition)',
              marginBottom: '-1px',
            }}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
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
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {dropdownsQuery.isLoading && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </td>
              </tr>
            )}
            {currentSection.data.length === 0 && !dropdownsQuery.isLoading && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)' }}>
                  No {currentSection.label.toLowerCase()} found.
                </td>
              </tr>
            )}
            {currentSection.data.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: item.is_active ? 'var(--success)' : 'var(--danger)',
                    color: 'white',
                  }}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>
                  {new Date(item.created_at).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      className="btn btn-ghost btn-xs"
                      onClick={() => setEditingItem({ ...item, section: activeSection })}
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn btn-danger btn-xs"
                      onClick={() => {
                        if (window.confirm(`Delete ${item.name}? This cannot be undone.`)) {
                          deleteMutation.mutate({ section: activeSection, id: item.id });
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

      {/* Create Item Modal */}
      {showCreateModal && (
        <CreateItemModal
          section={activeSection}
          sectionLabel={currentSection.label}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(name) => createMutation.mutate({ section: activeSection, name })}
          isLoading={createMutation.isLoading}
        />
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={(data) => updateMutation.mutate({ section: editingItem.section, id: editingItem.id, ...data })}
          isLoading={updateMutation.isLoading}
        />
      )}
    </div>
  );
}

// Create Item Modal
function CreateItemModal({ section, sectionLabel, onClose, onSubmit, isLoading }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(name);
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
        <h3 style={{ margin: '0 0 16px 0' }}>
          Add {sectionLabel.slice(0, -1)}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Enter ${sectionLabel.slice(0, -1).toLowerCase()} name`}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Item Modal
function EditItemModal({ item, onClose, onSubmit, isLoading }) {
  const [name, setName] = useState(item.name);
  const [isActive, setIsActive] = useState(item.is_active);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ name, is_active: isActive });
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
        <h3 style={{ margin: '0 0 16px 0' }}>Edit Item</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label>Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
