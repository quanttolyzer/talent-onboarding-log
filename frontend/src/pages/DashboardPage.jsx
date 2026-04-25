import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import TicketModal from '../components/TicketModal';
import CloneModal from '../components/CloneModal';

const STATUSES = ['On-hold','In-Progress','Hired','Active','Accepted','Joined','Cancelled','Rejected'];
const TICKET_TYPES = ['Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding'];

export default function DashboardPage() {
  const user       = useAuthStore((s) => s.user);
  const logout     = useAuthStore((s) => s.logout);
  const qc         = useQueryClient();

  // ── Tab state ─────────────────────────────────────────────
  const [tab, setTab] = useState('search'); // 'search' | 'add'

  // ── Filter/search state ───────────────────────────────────
  const [search,      setSearch]      = useState('');
  const [filterStatus,setFilterStatus]= useState('');
  const [filterType,  setFilterType]  = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [page,        setPage]        = useState(1);
  const LIMIT = 100;

  // ── Selection state ───────────────────────────────────────
  const [selected, setSelected] = useState(new Set());

  // ── Modal state ───────────────────────────────────────────
  const [editTicket,  setEditTicket]  = useState(null);  // ticket obj or null
  const [showAdd,     setShowAdd]     = useState(false);
  const [cloneRows,   setCloneRows]   = useState(null);  // array of tickets

  // ── Debounced search ──────────────────────────────────────
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  function handleSearchChange(e) {
    setSearch(e.target.value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(e.target.value);
      setPage(1);
    }, 300);
  }

  // ── Data queries ──────────────────────────────────────────
  const ticketsQuery = useQuery({
    queryKey: ['tickets', page, debouncedSearch, filterStatus, filterType, filterOwner],
    queryFn: () => api.get('/tickets', {
      params: {
        page, limit: LIMIT,
        search: debouncedSearch || undefined,
        status: filterStatus || undefined,
        ticket_type: filterType || undefined,
        task_owner_id: filterOwner || undefined,
      },
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const filterOptionsQuery = useQuery({
    queryKey: ['filter-options'],
    queryFn: () => api.get('/tickets/filter-options').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const mappingsQuery = useQuery({
    queryKey: ['mappings'],
    queryFn: () => api.get('/mappings').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  // ── Mutations ─────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (ids) => ids.length === 1
      ? api.delete(`/tickets/${ids[0]}`)
      : api.delete('/tickets/bulk', { data: { ids } }),
    onSuccess: () => {
      qc.invalidateQueries(['tickets']);
      setSelected(new Set());
      toast.success('Deleted successfully');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/tickets/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['tickets']);
      toast.success(vars.synced ? 'Status updated & synced to group' : 'Status updated');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  // ── Helpers ───────────────────────────────────────────────
  const tickets = ticketsQuery.data?.data || [];
  const total   = ticketsQuery.data?.total || 0;
  const pages   = ticketsQuery.data?.pages || 1;

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === tickets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tickets.map(t => t.id)));
    }
  }

  function clearFilters() {
    setSearch(''); setDebouncedSearch('');
    setFilterStatus(''); setFilterType(''); setFilterOwner('');
    setPage(1);
  }

  const selectedTickets = useMemo(
    () => tickets.filter(t => selected.has(t.id)),
    [tickets, selected]
  );

  function confirmDelete(ids) {
    const count = ids.length;
    if (window.confirm(`Delete ${count} ticket${count > 1 ? 's' : ''}? This cannot be undone.`)) {
      deleteMutation.mutate(ids);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header style={{
        height: '60px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
        gap: '12px',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', flex:1 }}>
          <div style={{
            width:'32px', height:'32px',
            background:'linear-gradient(135deg, var(--primary), var(--accent))',
            borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'16px',
          }}>💼</div>
          <span style={{ fontWeight:800, fontSize:'1rem' }}>Talent & Onboarding</span>
        </div>
        <span style={{ fontSize:'0.8rem', color:'var(--text-2)' }}>{user?.name}</span>
        {user?.role === 'admin' && (
          <a 
            href="/admin" 
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            ⚙️ Admin
          </a>
        )}
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </header>

      {/* ── Main ── */}
      <main style={{ flex:1, padding:'24px', maxWidth:'100%', overflow:'hidden' }}>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', gap:'4px', marginBottom:'24px', borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
          {[['search','🔍 Search & Edit'],['add','➕ Add New Entry']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding:'10px 20px',
                background:'transparent',
                border:'none',
                borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
                color: tab === key ? 'var(--text-1)' : 'var(--text-2)',
                fontFamily:'var(--font)',
                fontWeight:600,
                fontSize:'0.9rem',
                cursor:'pointer',
                transition:'var(--transition)',
                marginBottom:'-1px',
              }}
            >{label}</button>
          ))}
        </div>

        {/* ══ SEARCH & EDIT TAB ══ */}
        {tab === 'search' && (
          <div className="fade-up">

            {/* Search bar */}
            <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap' }}>
              <div style={{ position:'relative', flex:'1', minWidth:'240px' }}>
                <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--text-3)', fontSize:'14px' }}>🔍</span>
                <input
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Search ticket number, remarks, sub-action…"
                  style={{ paddingLeft:'36px' }}
                />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear all</button>
            </div>

            {/* Filter row */}
            <div style={{ display:'flex', gap:'10px', marginBottom:'16px', flexWrap:'wrap' }}>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={{ width:'auto', minWidth:'150px' }}>
                <option value="">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ width:'auto', minWidth:'160px' }}>
                <option value="">All Types</option>
                {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select value={filterOwner} onChange={e => { setFilterOwner(e.target.value); setPage(1); }} style={{ width:'auto', minWidth:'160px' }}>
                <option value="">All Owners</option>
                {(filterOptionsQuery.data?.owners || []).map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>

              <div style={{ marginLeft:'auto', display:'flex', gap:'8px' }}>
                {selected.size > 0 && <>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setCloneRows(selectedTickets); }}>
                    Clone ({selected.size})
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditTicket(selectedTickets[0])}>
                    Edit
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => confirmDelete([...selected])}>
                    Delete ({selected.size})
                  </button>
                </>}
              </div>
            </div>

            {/* Results count */}
            <div style={{ fontSize:'0.8rem', color:'var(--text-2)', marginBottom:'12px' }}>
              {ticketsQuery.isLoading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
              {selected.size > 0 && <span style={{ marginLeft:'12px', color:'var(--primary)' }}>{selected.size} selected</span>}
            </div>

            {/* Table */}
            <div style={{ overflow:'auto', maxHeight:'calc(100vh - 320px)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width:'36px' }}>
                      <input type="checkbox" checked={selected.size === tickets.length && tickets.length > 0}
                        onChange={toggleAll} style={{ width:'auto' }} />
                    </th>
                    <th>Date</th>
                    <th>Owner</th>
                    <th>Ticket #</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Ticket Date</th>
                    <th>Position</th>
                    <th>Department</th>
                    <th>Action</th>
                    <th>Sub-Action</th>
                    <th>Group</th>
                    <th>Candidates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketsQuery.isLoading && (
                    <tr><td colSpan={14} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                      <div className="spinner" style={{ margin:'0 auto' }} />
                    </td></tr>
                  )}
                  {!ticketsQuery.isLoading && tickets.length === 0 && (
                    <tr><td colSpan={14} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                      No tickets found. Try adjusting your filters.
                    </td></tr>
                  )}
                  {tickets.map(ticket => (
                    <tr key={ticket.id} className={selected.has(ticket.id) ? 'selected' : ''}>
                      <td>
                        <input type="checkbox" checked={selected.has(ticket.id)}
                          onChange={() => toggleSelect(ticket.id)} style={{ width:'auto' }} />
                      </td>
                      <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem' }}>{ticket.entry_date?.slice(0,10)}</td>
                      <td>{ticket.task_owner_name || '—'}</td>
                      <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem', color:'var(--primary)' }}>{ticket.ticket_number}</td>
                      <td style={{ fontSize:'0.8rem' }}>{ticket.ticket_type}</td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                          <StatusBadge status={ticket.ticket_status} />
                          {ticket.is_group_master && (
                            <span title="Group master — controls status for cloned rows" style={{ fontSize:'12px', cursor:'help' }}>⭐</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem' }}>{ticket.ticket_date?.slice(0,10)}</td>
                      <td style={{ maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis' }}>{ticket.position_name || '—'}</td>
                      <td style={{ maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis' }}>{ticket.department_name || '—'}</td>
                      <td style={{ fontSize:'0.8rem' }}>{ticket.action}</td>
                      <td style={{ fontSize:'0.8rem', color:'var(--text-2)', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis' }}>{ticket.sub_action || '—'}</td>
                      <td style={{ fontFamily:'var(--mono)', fontSize:'0.75rem', color:'var(--text-3)' }}>{ticket.group_code || '—'}</td>
                      <td style={{ textAlign:'center' }}>{ticket.candidate_count}</td>
                      <td>
                        <div style={{ display:'flex', gap:'6px' }}>
                          {/* Inline status dropdown — only group master can broadcast */}
                          <select
                            value={ticket.ticket_status}
                            onChange={e => statusMutation.mutate({ id: ticket.id, status: e.target.value })}
                            style={{ width:'auto', minWidth:'110px', fontSize:'0.78rem', padding:'5px 8px' }}
                          >
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditTicket(ticket)}>✏️</button>
                          <button className="btn btn-danger btn-xs" onClick={() => confirmDelete([ticket.id])}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginTop:'16px', justifyContent:'center' }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ fontSize:'0.85rem', color:'var(--text-2)' }}>Page {page} of {pages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ══ ADD ENTRY TAB ══ */}
        {tab === 'add' && (
          <div className="fade-up">
            <TicketModal
              mode="add"
              mappings={mappingsQuery.data}
              onClose={() => setTab('search')}
              onSaved={() => { qc.invalidateQueries(['tickets']); setTab('search'); toast.success('Entry added!'); }}
            />
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {editTicket && (
        <TicketModal
          mode="edit"
          ticket={editTicket}
          mappings={mappingsQuery.data}
          onClose={() => setEditTicket(null)}
          onSaved={() => { qc.invalidateQueries(['tickets']); setEditTicket(null); toast.success('Updated!'); }}
        />
      )}

      {cloneRows && (
        <CloneModal
          rows={cloneRows}
          onClose={() => setCloneRows(null)}
          onSaved={() => { qc.invalidateQueries(['tickets']); setCloneRows(null); setSelected(new Set()); toast.success('Cloned!'); }}
        />
      )}
    </div>
  );
}
