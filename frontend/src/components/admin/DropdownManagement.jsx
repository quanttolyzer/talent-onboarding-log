import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import BoardConfigPanel from './BoardConfigPanel';

const SECTIONS = [
  { id: 'positions',         label: 'Positions' },
  { id: 'departments',       label: 'Departments' },
  { id: 'hiring-managers',   label: 'Hiring Managers' },
  { id: 'country-companies', label: 'Country / Companies' },
  { id: 'ticket-statuses',   label: 'Ticket Statuses' },
  { id: 'ticket-types',      label: 'Ticket Types' },
  { id: 'management-types',  label: 'Management Types' },
  { id: 'assessment-levels', label: 'Assessment Levels' },
];

function dataKey(sectionId) {
  return sectionId.replace(/-/g, '_'); // 'ticket-statuses' → 'ticket_statuses'
}

export default function DropdownManagement() {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState('positions');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [boardConfigTypeId, setBoardConfigTypeId] = useState(null);

  const q = useQuery({
    queryKey: ['admin-dropdowns'],
    queryFn: () => api.get('/admin/dropdowns').then(r => r.data),
  });

  const raw = q.data || {};

  const createMutation = useMutation({
    mutationFn: (payload) => api.post(`/admin/${activeSection}`, payload).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['admin-dropdowns']); setShowCreate(false); toast.success('Created'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Create failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/admin/${activeSection}/${id}`, body).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['admin-dropdowns']); setEditing(null); toast.success('Updated'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/admin/${activeSection}/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries(['admin-dropdowns']); toast.success('Deleted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  const key       = dataKey(activeSection);
  const allItems  = raw[key] || [];
  const tableItems = allItems;

  const currentSection = SECTIONS.find(s => s.id === activeSection);

  function handleDelete(item) {
    if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(item.id);
    }
  }

  const tabBtn = (s) => ({
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    borderBottom: activeSection === s.id ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeSection === s.id ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily: 'var(--font)',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'var(--transition)',
    marginBottom: '-1px',
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <h2 style={{ margin:0, fontSize:'1.5rem', fontWeight:700 }}>Dropdown Management</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          ➕ Add {currentSection?.label.replace(/s$/, '') || 'Item'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'2px', flexWrap:'wrap', borderBottom:'1px solid var(--border)', marginBottom:'20px' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={tabBtn(s)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', overflow:'hidden', background:'var(--bg-surface)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Active</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={3} style={{ textAlign:'center', padding:'40px' }}>
                <div className="spinner" style={{ margin:'0 auto' }} />
              </td></tr>
            )}
            {!q.isLoading && tableItems.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                No {currentSection?.label.toLowerCase()} found.
              </td></tr>
            )}
            {tableItems.map(item => (
              <Fragment key={item.id}>
                <tr>
                  <td>{item.name}</td>
                  <td>
                    <span style={{
                      padding:'3px 8px', borderRadius:'4px', fontSize:'0.78rem', fontWeight:600,
                      background: item.is_active ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                      color: item.is_active ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display:'flex', gap:'6px', justifyContent: 'flex-end' }}>
                      {activeSection === 'ticket-types' && (
                        <button
                          className="btn btn-ghost btn-xs"
                          title="Configure Board"
                          onClick={() => setBoardConfigTypeId(boardConfigTypeId === item.id ? null : item.id)}
                        >
                          📋
                        </button>
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditing(item)}>✏️</button>
                      <button className="btn btn-danger btn-xs" onClick={() => handleDelete(item)}>🗑️</button>
                    </div>
                  </td>
                </tr>
                {activeSection === 'ticket-types' && boardConfigTypeId === item.id && (
                  <tr>
                    <td colSpan={99} style={{ padding: '0 8px 12px' }}>
                      <BoardConfigPanel
                        ticketTypeId={item.id}
                        onClose={() => setBoardConfigTypeId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          sectionLabel={currentSection?.label || ''}
          isLoading={createMutation.isPending || createMutation.isLoading}
          onClose={() => setShowCreate(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
        />
      )}

      {/* Edit modal */}
      {editing && (
        <EditModal
          item={editing}
          isLoading={updateMutation.isPending || updateMutation.isLoading}
          onClose={() => setEditing(null)}
          onSubmit={(body) => updateMutation.mutate({ id: editing.id, ...body })}
        />
      )}
    </div>
  );
}

function CreateModal({ sectionLabel, onClose, onSubmit, isLoading }) {
  const [name, setName] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name });
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin:'0 0 18px 0' }}>Add {sectionLabel.replace(/s$/, '')}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom:'18px' }}>
          <label>Name</label>
          <input type="text" required value={name} onChange={e => setName(e.target.value)}
            placeholder={`Enter ${sectionLabel.replace(/s$/, '').toLowerCase()} name`} autoFocus />
        </div>
        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function EditModal({ item, onClose, onSubmit, isLoading }) {
  const [name, setName]       = useState(item.name || '');
  const [isActive, setActive] = useState(item.is_active);

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name, is_active: isActive });
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ margin:'0 0 18px 0' }}>Edit Item</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom:'14px' }}>
          <label>Name</label>
          <input type="text" required value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-group" style={{ marginBottom:'18px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'8px', textTransform:'none', letterSpacing:0 }}>
            <input type="checkbox" checked={isActive} onChange={e => setActive(e.target.checked)} />
            Active
          </label>
        </div>
        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius)', padding:'28px', width:'100%', maxWidth:'420px', border:'1px solid var(--border)', boxShadow:'var(--shadow)' }}>
        {children}
      </div>
    </div>
  );
}
