import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import StatusBadge from '../components/StatusBadge';
import TicketModal from '../components/TicketModal';
import UpdateProgressModal from '../components/UpdateProgressModal';

// Statuses and ticket types are now dynamic — loaded from mappings.
// These fallbacks are only used before the first API response arrives.
const FALLBACK_STATUSES = ['On-hold','In-Progress','Hired','Active','Accepted','Joined','Cancelled','Rejected'];
const FALLBACK_TYPES    = ['Hiring Ticket','Offer Ticket','Onboarding Ticket','Offboarding'];

// FIX: sticky columns MUST have a fully opaque background — any rgba/transparent value
// lets adjacent cell content bleed through on scroll and on row selection.
// These helpers return solid background colors for the two sticky columns.
function stickyBg(isSelected) {
  // Use CSS vars so the colour still tracks the theme.
  // --bg-selected should be defined in your global CSS (see note below).
  // If it isn't, the fallback keeps the surface colour and relies on a
  // border-left / border-right to signal selection instead.
  return isSelected ? 'var(--bg-selected, var(--bg-surface))' : 'var(--bg-surface)';
}

export default function DashboardPage() {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const isAdmin = user?.role === 'admin';
  const qc     = useQueryClient();

  // ── Tab ─────────────────────────────────────────────────────
  const [tab, setTab] = useState('search');

  // ── Filters ─────────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterType,     setFilterType]     = useState('');
  const [filterOwner,    setFilterOwner]    = useState('');
  const [filterDept,     setFilterDept]     = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterCountry,  setFilterCountry]  = useState('');
  const [page,           setPage]           = useState(1);
  const LIMIT = 50;

  // ── Selection ────────────────────────────────────────────────
  const [selected,        setSelected]        = useState(new Set());
  const [editTicket,      setEditTicket]      = useState(null);
  const [progressTicket,  setProgressTicket]  = useState(null);

  // ── Top scrollbar mirror ─────────────────────────────────────
  const topScrollRef  = useRef(null);
  const tableWrapRef  = useRef(null);
  const spacerRef     = useRef(null);
  const isSyncing     = useRef(false);

  // Keep the spacer width exactly equal to the table wrapper's real scrollWidth
  // so both scroll bars have identical ranges.
  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return;
    const update = () => {
      if (spacerRef.current) spacerRef.current.style.width = wrap.scrollWidth + 'px';
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  function syncFromTop() {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (tableWrapRef.current) tableWrapRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    isSyncing.current = false;
  }
  function syncFromTable() {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = tableWrapRef.current.scrollLeft;
    isSyncing.current = false;
  }

  // ── Debounced search ─────────────────────────────────────────
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

  // ── Queries ──────────────────────────────────────────────────
  const ticketsQuery = useQuery({
    queryKey: ['tickets', page, debouncedSearch, filterStatus, filterType, filterOwner, filterDept, filterPosition, filterCountry],
    queryFn: () => api.get('/tickets', {
      params: {
        page,
        limit:              LIMIT,
        search:             debouncedSearch  || undefined,
        status:             filterStatus     || undefined,
        ticket_type:        filterType       || undefined,
        task_owner_id:      filterOwner      || undefined,
        department_id:      filterDept       || undefined,
        position_id:        filterPosition   || undefined,
        country_company_id: filterCountry    || undefined,
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

  // ── Mutations ────────────────────────────────────────────────
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


  // ── Helpers ──────────────────────────────────────────────────
  const tickets = ticketsQuery.data?.data  || [];
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
    setSelected(selected.size === tickets.length && tickets.length > 0
      ? new Set()
      : new Set(tickets.map(t => t.id))
    );
  }
  function clearFilters() {
    setSearch(''); setDebouncedSearch('');
    setFilterStatus(''); setFilterType(''); setFilterOwner('');
    setFilterDept(''); setFilterPosition(''); setFilterCountry('');
    setPage(1);
  }
  const selectedTickets = useMemo(
    () => tickets.filter(t => selected.has(t.id)),
    [tickets, selected]
  );
  function confirmDelete(ids) {
    if (window.confirm(`Delete ${ids.length} ticket${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) {
      deleteMutation.mutate(ids);
    }
  }

  const COL_COUNT = isAdmin ? 14 : 13;

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* ── Header ── */}
      <header style={{
        height:'60px', background:'var(--bg-surface)',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center',
        padding:'0 24px', position:'sticky', top:0, zIndex:100, gap:'12px',
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
          <Link
            to="/admin"
            className="btn btn-primary btn-sm"
            style={{ textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'6px' }}
          >
            ⚙️ Admin
          </Link>
        )}
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </header>

      {/* ── Main ── */}
      <main style={{ flex:1, padding:'24px', maxWidth:'100%', overflow:'visible' }}>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', gap:'4px', marginBottom:'24px', borderBottom:'1px solid var(--border)' }}>
          {[['search','🔍 Search & Edit'],['add','➕ Add New Entry']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding:'10px 20px', background:'transparent', border:'none',
              borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
              color: tab === key ? 'var(--text-1)' : 'var(--text-2)',
              fontFamily:'var(--font)', fontWeight:600, fontSize:'0.9rem',
              cursor:'pointer', transition:'var(--transition)', marginBottom:'-1px',
            }}>{label}</button>
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

            {/* Filters — 3-column equal grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', marginBottom:'16px' }}>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
                <option value="">All Statuses</option>
                {(mappingsQuery.data?.ticket_statuses || FALLBACK_STATUSES.map(s => ({ id: s, name: s }))).map(s => (
                  <option key={s.id || s} value={s.name || s}>{s.name || s}</option>
                ))}
              </select>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                <option value="">All Types</option>
                {(mappingsQuery.data?.ticket_types || FALLBACK_TYPES.map(t => ({ id: t, name: t }))).map(t => (
                  <option key={t.id || t} value={t.name || t}>{t.name || t}</option>
                ))}
              </select>
              <select value={filterOwner} onChange={e => { setFilterOwner(e.target.value); setPage(1); }}>
                <option value="">All Owners</option>
                {(filterOptionsQuery.data?.owners || []).map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                {(mappingsQuery.data?.departments || []).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select value={filterPosition} onChange={e => { setFilterPosition(e.target.value); setPage(1); }}>
                <option value="">All Positions</option>
                {(mappingsQuery.data?.positions || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select value={filterCountry} onChange={e => { setFilterCountry(e.target.value); setPage(1); }}>
                <option value="">All Countries & Companies</option>
                {(mappingsQuery.data?.country_companies || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Bulk actions — only visible when rows are selected */}
            {selected.size > 0 && (
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginBottom:'12px' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditTicket(selectedTickets[0])}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => confirmDelete([...selected])}>Delete ({selected.size})</button>
              </div>
            )}

            {/* Results count */}
            <div style={{ fontSize:'0.8rem', color:'var(--text-2)', marginBottom:'12px' }}>
              {ticketsQuery.isLoading
                ? 'Loading…'
                : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
              {selected.size > 0 && (
                <span style={{ marginLeft:'12px', color:'var(--primary)' }}>{selected.size} selected</span>
              )}
            </div>

            {/* ── Table ── */}
            {/* Top scrollbar mirror — synced with the table wrapper below */}
            <div
              ref={topScrollRef}
              onScroll={syncFromTop}
              style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', marginBottom: '2px' }}
            >
              <div ref={spacerRef} style={{ height: '1px' }} />
            </div>
            <div
              ref={tableWrapRef}
              onScroll={syncFromTable}
              style={{
              overflowX: 'auto',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              scrollbarWidth: 'thin',
            }}>
              <table className="data-table" style={{ minWidth: '1580px' }}>
                <thead>
                  <tr>
                    {/* FIX: thead sticky checkbox cell — always opaque */}
                    {isAdmin && (
                      <th style={{ width:'36px', position:'sticky', left:0, zIndex:6, background:'var(--bg)' }}>
                        <input
                          type="checkbox"
                          checked={selected.size === tickets.length && tickets.length > 0}
                          onChange={toggleAll}
                          style={{ width:'auto' }}
                        />
                      </th>
                    )}
                    <th>Date</th>
                    <th>Task Owner</th>
                    <th>Ticket #</th>
                    <th>Ticket Type</th>
                    <th>Status</th>
                    <th>Ticket Date</th>
                    <th>Position</th>
                    <th>Mgmt Type</th>
                    <th>Department</th>
                    <th>Ultimate HM</th>
                    <th>Direct HM</th>
                    <th>Country & Company</th>
                    <th style={{ textAlign:'center' }}>Candidates</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketsQuery.isLoading && (
                    <tr>
                      <td colSpan={COL_COUNT} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                        <div className="spinner" style={{ margin:'0 auto' }} />
                      </td>
                    </tr>
                  )}
                  {!ticketsQuery.isLoading && tickets.length === 0 && (
                    <tr>
                      <td colSpan={COL_COUNT} style={{ textAlign:'center', padding:'40px', color:'var(--text-2)' }}>
                        No tickets found. Try adjusting your filters.
                      </td>
                    </tr>
                  )}
                  {tickets.map(ticket => {
                    const isSelected = selected.has(ticket.id);
                    return (
                      <tr key={ticket.id} className={isSelected ? 'selected' : ''}>

                        {/*
                          FIX: Sticky cells MUST use a fully opaque background.
                          Previously rgba(99,102,241,0.08) was transparent, which let
                          scrolled content from other columns bleed through the cell.
                          stickyBg() returns var(--bg-surface) always, with
                          var(--bg-selected) override when the row is selected.
                          Add --bg-selected to your global CSS, e.g.:
                            --bg-selected: #1e2035;   (dark theme)
                          The left/right border provides the visual selection cue
                          on the sticky cells themselves.
                        */}
                        {isAdmin && (
                          <td style={{
                            position: 'sticky',
                            left: 0,
                            background: stickyBg(isSelected),
                            zIndex: 4,
                            borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                            transition: 'border-color 0.15s',
                          }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSelect(ticket.id)} style={{ width:'auto' }} />
                          </td>
                        )}

                        <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem', whiteSpace:'nowrap' }}>
                          {ticket.entry_date?.slice(0,10) || '—'}
                        </td>

                        <td style={{ whiteSpace:'nowrap' }}>{ticket.task_owner_name || '—'}</td>

                        <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem', color:'var(--primary)', whiteSpace:'nowrap' }}>
                          {ticket.ticket_number}
                        </td>

                        <td style={{ fontSize:'0.8rem', whiteSpace:'nowrap' }}>{ticket.ticket_type}</td>

                        <td style={{ whiteSpace:'nowrap' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                            <StatusBadge status={ticket.ticket_status} />
                            {ticket.is_group_master && (
                              <span title="Group master — controls status for all cloned rows" style={{ fontSize:'12px', cursor:'help' }}>⭐</span>
                            )}
                          </div>
                        </td>

                        <td style={{ fontFamily:'var(--mono)', fontSize:'0.8rem', whiteSpace:'nowrap' }}>
                          {ticket.ticket_date?.slice(0,10) || '—'}
                        </td>

                        <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ticket.position_name || '—'}
                        </td>

                        <td style={{ fontSize:'0.8rem', whiteSpace:'nowrap' }}>
                          {ticket.management_type || '—'}
                        </td>

                        <td style={{ maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ticket.department_name || '—'}
                        </td>

                        <td style={{ maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ticket.ultimate_hm_name || '—'}
                        </td>

                        <td style={{ maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ticket.direct_hm_name || '—'}
                        </td>

                        <td style={{ maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ticket.country_company_label || '—'}
                        </td>

                        <td style={{ textAlign:'center' }}>{ticket.candidate_count}</td>

                        {/* Actions sticky cell — always opaque background, right border for selection cue */}
                        <td style={{
                          position: 'sticky', right: 0,
                          background: stickyBg(isSelected), zIndex: 4,
                          borderRight: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                          transition: 'border-color 0.15s',
                        }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button className="btn btn-ghost btn-xs" onClick={() => setProgressTicket(ticket)} title="Update Progress">📝</button>
                            {isAdmin && (
                              <>
                                <button className="btn btn-ghost btn-xs" onClick={() => setEditTicket(ticket)} title="Edit">✏️</button>
                                <button className="btn btn-danger btn-xs" onClick={() => confirmDelete([ticket.id])} title="Delete">🗑</button>
                              </>
                            )}
                            <Link
                              to={`/tickets/${ticket.id}/board`}
                              className="btn btn-ghost btn-xs"
                              title="Open Board"
                              style={{ textDecoration: 'none' }}
                            >
                              📋
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
              onSaved={() => {
                qc.invalidateQueries(['tickets']);
                setTab('search');
                toast.success('Entry added!');
              }}
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
          onSaved={() => {
            qc.invalidateQueries(['tickets']);
            setEditTicket(null);
            toast.success('Updated!');
          }}
        />
      )}

      {progressTicket && (
        <UpdateProgressModal
          ticket={progressTicket}
          mappings={mappingsQuery.data}
          onClose={() => setProgressTicket(null)}
          onSaved={() => setProgressTicket(null)}
        />
      )}
    </div>
  );
}
