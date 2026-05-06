import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

const COLORS = [
  { name: 'yellow',     hex: '#fef08a' },
  { name: 'orange',     hex: '#fed7aa' },
  { name: 'pink',       hex: '#f9a8d4' },
  { name: 'teal',       hex: '#99f6e4' },
  { name: 'green',      hex: '#bbf7d0' },
  { name: 'light-pink', hex: '#fecdd3' },
  { name: 'light-blue', hex: '#bae6fd' },
];

function colorHex(name) {
  return COLORS.find(c => c.name === name)?.hex || '#fef08a';
}

export default function StickyNotesPanel({ ticketId }) {
  const qc   = useQueryClient();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  const [composing, setComposing]   = useState(false);
  const [draft, setDraft]           = useState('');
  const [draftColor, setDraftColor] = useState('yellow');
  const [editingId, setEditingId]   = useState(null);
  const [editContent, setEditContent] = useState('');

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['ticket-notes', ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/notes`).then(r => r.data),
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (body) => api.post(`/tickets/${ticketId}/notes`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries(['ticket-notes', ticketId]);
      setDraft(''); setDraftColor('yellow'); setComposing(false);
    },
    onError: err => toast.error(err.response?.data?.error || 'Failed to add note'),
  });

  const patchMutation = useMutation({
    mutationFn: ({ noteId, ...body }) => api.patch(`/tickets/${ticketId}/notes/${noteId}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['ticket-notes', ticketId]),
    onError: err => toast.error(err.response?.data?.error || 'Failed to update note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId) => api.delete(`/tickets/${ticketId}/notes/${noteId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries(['ticket-notes', ticketId]),
    onError: err => toast.error(err.response?.data?.error || 'Failed to delete note'),
  });

  function handleDelete(note) {
    if (window.confirm('Delete this note?')) deleteMutation.mutate(note.id);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function saveEdit(note) {
    patchMutation.mutate({ noteId: note.id, content: editContent, color: note.color });
    setEditingId(null);
  }

  const canModify = (note) => isAdmin || note.created_by === user?.id;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1rem', margin: 0 }}>
          Notes {notes.length > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{notes.length}</span>}
        </h2>
        {!composing && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '1.1rem', lineHeight: 1, padding: '4px 8px' }}
            onClick={() => setComposing(true)}
          >
            +
          </button>
        )}
      </div>

      {/* Compose area */}
      {composing && (
        <div style={{
          background: colorHex(draftColor),
          borderRadius: '12px',
          padding: '12px',
          marginBottom: '16px',
          border: '2px solid rgba(0,0,0,0.1)',
        }}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a note..."
            rows={3}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              resize: 'vertical', fontFamily: 'var(--font)', fontSize: '0.88rem',
              outline: 'none', color: '#1a1a1a',
            }}
          />
          {/* Color picker */}
          <div style={{ display: 'flex', gap: '6px', margin: '8px 0' }}>
            {COLORS.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => setDraftColor(c.name)}
                style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: c.hex,
                  border: draftColor === c.name ? '2px solid #1a1a1a' : '2px solid transparent',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-sm"
              style={{ background: '#1a1a1a', color: '#fff', border: 'none' }}
              disabled={!draft.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ content: draft, color: draftColor })}
            >
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setComposing(false); setDraft(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}

      {/* Notes grid */}
      {notes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {notes.map(note => (
            <div
              key={note.id}
              style={{
                background: colorHex(note.color),
                borderRadius: '10px',
                padding: '10px 12px',
                border: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {editingId === note.id ? (
                <>
                  <textarea
                    autoFocus
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%', border: '1px solid rgba(0,0,0,0.2)',
                      borderRadius: '6px', background: 'rgba(255,255,255,0.4)',
                      fontFamily: 'var(--font)', fontSize: '0.84rem',
                      padding: '4px 6px', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: '#1a1a1a', color: '#fff', border: 'none', fontSize: '0.75rem' }}
                      onClick={() => saveEdit(note)}
                    >Save</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{
                    margin: 0, fontSize: '0.84rem', color: '#1a1a1a', flex: 1,
                    textDecoration: note.is_done ? 'line-through' : 'none',
                    opacity: note.is_done ? 0.6 : 1,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {note.content}
                  </p>
                  {canModify(note) && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        onClick={() => patchMutation.mutate({ noteId: note.id, is_done: !note.is_done })}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: note.is_done ? '#1a1a1a' : 'rgba(0,0,0,0.12)',
                          border: 'none', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: note.is_done ? '#fff' : '#1a1a1a',
                          fontSize: '0.75rem',
                        }}
                        title={note.is_done ? 'Mark undone' : 'Mark done'}
                      >✓</button>
                      <button
                        onClick={() => startEdit(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#555', padding: '2px 4px',
                        }}
                        title="Edit"
                      >✎</button>
                      <button
                        onClick={() => handleDelete(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#555', padding: '2px 4px',
                        }}
                        title="Delete"
                      >✕</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !isLoading && !composing && (
        <p style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>No notes yet. Click + to add one.</p>
      )}
    </div>
  );
}
