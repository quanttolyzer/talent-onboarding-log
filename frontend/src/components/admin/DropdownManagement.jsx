import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// Static (enum-backed) values — read-only; require a developer to change.
const STATIC_SECTIONS = [
  {
    id: 'ticket-statuses',
    label: 'Ticket Statuses',
    values: ['On-hold','In-Progress','Hired','Active','Accepted','Joined','Cancelled','Rejected'],
  },
  {
    id: 'ticket-types',
    label: 'Ticket Types',
    values: ['Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding'],
  },
  {
    id: 'management-types',
    label: 'Management Types',
    values: ['Management','Non - Management'],
  },
  {
    id: 'actions',
    label: 'Actions',
    values: ['Open Ticket','Onboarding'],
  },
  {
    id: 'sub-actions-open',
    label: 'Sub-Actions (Open Ticket)',
    values: [
      'Create Hiring Request','Active Hiring Tickets','Profile Screening',
      'Interview Execution','Batch Shared with Hiring Manager','Interview Scheduled',
      'Job Offer Created','Job Offer in the Approval Cycle','Offer Shared with candidate',
      'Candidate Accepted Job Offer','Candidate Rejected Job Offer','Closed Hiring Ticket',
    ],
  },
  {
    id: 'sub-actions-onboarding',
    label: 'Sub-Actions (Onboarding)',
    values: [
      'E-Visa Request','E-Wakala Request','Create Contract','Contract Attestation Request',
      'IT Request','Induction Program Preparation','Booking Accomodation',
      'Iqama Transfer Request','Flight Ticket','Closed Onboarding Tickets',
    ],
  },
];

export default function DropdownManagement() {
  const qc = useQueryClient();
  const [activeSection, setActiveSection] = useState('positions');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const dropdownsQuery = useQuery({
    queryKey: ['admin-dropdowns'],
    queryFn: () => api.get('/admin/dropdowns').then(r => r.data),
  });

  const data = dropdownsQuery.data || {};

  // Dynamic sections — full CRUD via backend
  // IDs match the backend route segments: /admin/<id>
  const DYNAMIC_SECTIONS = [
    { id: 'positions',         label: 'Positions',         data: data.positions         || [] },
    { id: 'departments',       label: 'Departments',       data: data.departments       || [] },
    { id: 'hiring-managers',   label: 'Hiring Managers',   data: data.hiring_managers   || [] },
    { id: 'country-companies', label: 'Country/Companies', data: data.country_companies || [] },
  ];

  const isDynamic  = DYNAMIC_SECTIONS.some(s => s.id === activeSection);
  const isStatic   = STATIC_SECTIONS.some(s => s.id === activeSection);
  const currentDyn = DYNAMIC_SECTIONS.find(s => s.id === activeSection);
  const currentSta = STATIC_SECTIONS.find(s => s.id === activeSection);

  const createMutation = useMutation({
    mutationFn: ({ section, name }) =>
      api.post(`/admin/${section}`, { name }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      setShowCreateModal(false);
      toast.success('Item created successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to create item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ section, id, ...body }) =>
      api.put(`/admin/${section}/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      setEditingItem(null);
      toast.success('Item updated successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to update item'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ section, id }) =>
      api.delete(`/admin/${section}/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-dropdowns']);
      toast.success('Item deleted successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to delete item'),
  });

  const tabStyle = (id) => ({
    padding: '8px 14px',
    background: 'transparent',
    border: 'none',
    borderBottom: activeSection === id ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeSection === id ? 'var(--text-1)' : 'var(--text-2)',
    fontFamily: 'var(--font)',
    fontWeight: 600,
    fontSize: '0.78rem',
    cursor: 'pointer',
    transition: 'var(--transition)',
    marginBottom: '-1px',
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
        <h2 style={{ margin:0, fontSize:'1.5rem', fontWeight:700 }}>Dropdown Management</h2>
        {isDynamic && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            ➕ Add {currentDyn.label.replace(/s$/, '')}
          </button>
        )}
      </div>

      {/* ── Group headers ── */}
      <div style={{ marginBottom:'4px', fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
        Dynamic (editable)
      </div>
      <div style={{ display:'flex', gap:'2px', flexWrap:'wrap', borderBottom:'1px solid var(--border)', paddingBottom:0, marginBottom:'4px' }}>
        {DYNAMIC_SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={tabStyle(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom:'4px', marginTop:'12px', fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
        Static (read-only — change in code)
      </div>
      <div style={{ display:'flex', gap:'2px', flexWrap:'wrap', borderBottom:'1px solid var(--border)', paddingBottom:0, marginBottom:'20px' }}>
        {STATIC_SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={tabStyle(s.id)}>
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setActiveSection('task-owners')}
          style={tabStyle('task-owners')}
        >
          Task Owners
        </button>
      </div>

      {/* ── Dynamic CRUD table ── */}
      {isDynamic && currentDyn && (
        <div style={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', overflow:'hidden', background:'var(--bg-surface)' }}>
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
                <tr><td colSpan={4} style={{ textAlign:'center', padding:'40px' }}>
                  <div className="spinner" style={{ margin:'0 auto' }} />
                </td></tr>
              )}
              {!dropdownsQuery.isLoading && currentDyn.data.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                  No {currentDyn.label.toLowerCase()} found.
                </td></tr>
              )}
              {currentDyn.data.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <span style={{
                      padding:'4px 8px', borderRadius:'4px', fontSize:'0.8rem', fontWeight:600,
                      background: item.is_active ? 'var(--success)' : 'var(--danger)', color:'white',
                    }}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button className="btn btn-ghost btn-xs"
                        onClick={() => setEditingItem({ ...item, section: activeSection })}>
                        ✏️
                      </button>
                      <button className="btn btn-danger btn-xs"
                        onClick={() => {
                          if (window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                            deleteMutation.mutate({ section: activeSection, id: item.id });
                          }
                        }}>
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Static read-only section ── */}
      {isStatic && currentSta && (
        <div>
          <div style={{
            background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)',
            borderRadius:'var(--radius-sm)', padding:'10px 14px', marginBottom:'16px',
            fontSize:'0.82rem', color:'var(--warning)',
          }}>
            ⚠️ These values are defined as database enums or frontend constants. To change them, update the source code and redeploy.
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
            {currentSta.values.map(v => (
              <span key={v} style={{
                background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-sm)', padding:'6px 14px',
                fontSize:'0.85rem', color:'var(--text-1)',
              }}>
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Task Owners info ── */}
      {activeSection === 'task-owners' && (
        <div style={{
          background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)',
          borderRadius:'var(--radius-sm)', padding:'14px 18px',
          fontSize:'0.85rem', color:'var(--text-1)',
        }}>
          <div style={{ fontWeight:700, marginBottom:'6px' }}>👤 Task Owners</div>
          <p style={{ color:'var(--text-2)', marginBottom:0 }}>
            Task owners are the active system users. Manage them in the <strong>Users</strong> tab above.
            Any active user with role <code>admin</code> or <code>member</code> can be assigned as a task owner.
          </p>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && isDynamic && (
        <CreateItemModal
          sectionLabel={currentDyn.label}
          onClose={() => setShowCreateModal(false)}
          onSubmit={(name) => createMutation.mutate({ section: activeSection, name })}
          isLoading={createMutation.isLoading}
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={(body) => updateMutation.mutate({ section: editingItem.section, id: editingItem.id, ...body })}
          isLoading={updateMutation.isLoading}
        />
      )}
    </div>
  );
}

function CreateItemModal({ sectionLabel, onClose, onSubmit, isLoading }) {
  const [name, setName] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius)', padding:'24px', width:'100%', maxWidth:'400px', border:'1px solid var(--border)' }}>
        <h3 style={{ margin:'0 0 16px 0' }}>Add {sectionLabel.replace(/s$/, '')}</h3>
        <form onSubmit={e => { e.preventDefault(); onSubmit(name); }}>
          <div className="form-group" style={{ marginBottom:'16px' }}>
            <label>Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder={`Enter ${sectionLabel.replace(/s$/, '').toLowerCase()} name`} />
          </div>
          <div style={{ display:'flex', gap:'12px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditItemModal({ item, onClose, onSubmit, isLoading }) {
  const [name, setName]       = useState(item.name);
  const [isActive, setActive] = useState(item.is_active);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius)', padding:'24px', width:'100%', maxWidth:'400px', border:'1px solid var(--border)' }}>
        <h3 style={{ margin:'0 0 16px 0' }}>Edit Item</h3>
        <form onSubmit={e => { e.preventDefault(); onSubmit({ name, is_active: isActive }); }}>
          <div className="form-group" style={{ marginBottom:'16px' }}>
            <label>Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom:'16px' }}>
            <label style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <input type="checkbox" checked={isActive} onChange={e => setActive(e.target.checked)} />
              Active
            </label>
          </div>
          <div style={{ display:'flex', gap:'12px', justifyContent:'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Updating…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
