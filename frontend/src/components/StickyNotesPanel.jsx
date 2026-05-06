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
          Notes <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{notes.length}</span>
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Saved just now</span>
          {!composing && (
            <button
              style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#1a1a1a', color: '#fff', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700,
              }}
              onClick={() => setComposing(true)}
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Compose area */}
      {composing && (
        <div style={{
          background: colorHex(draftColor),
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '16px',
          border: '2px solid rgba(0,0,0,0.15)',
        }}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write a note..."
            rows={4}
            style={{
              width: '100%', border: '2px solid rgba(0,0,0,0.2)', background: 'transparent',
              resize: 'vertical', fontFamily: 'var(--font)', fontSize: '0.88rem',
              outline: 'none', color: '#1a1a1a', borderRadius: '4px', padding: '8px',
            }}
          />
          {/* Color picker */}
          <div style={{ display: 'flex', gap: '10px', margin: '12px 0' }}>
            {COLORS.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => setDraftColor(c.name)}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: c.hex,
                  border: draftColor === c.name ? '3px solid #1a1a1a' : '2px solid rgba(0,0,0,0.2)',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{ 
                background: '#1a1a1a', color: '#fff', border: 'none', 
                borderRadius: '4px', padding: '8px 16px', fontSize: '0.88rem',
                fontWeight: 600, cursor: 'pointer', 
              }}
              disabled={!draft.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ content: draft, color: draftColor })}
            >
              Save
            </button>
            <button 
              style={{ 
                background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', border: 'none', 
                borderRadius: '4px', padding: '8px 16px', fontSize: '0.88rem',
                cursor: 'pointer',
              }}
              onClick={() => { setComposing(false); setDraft(''); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="spinner" style={{ margin: '20px auto' }} />}

      {/* Notes grid */}
      {notes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {notes.map(note => (
            <div
              key={note.id}
              style={{
                background: colorHex(note.color),
                borderRadius: '8px',
                padding: '12px',
                border: '2px solid rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
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
                      borderRadius: '4px', background: 'rgba(255,255,255,0.5)',
                      fontFamily: 'var(--font)', fontSize: '0.84rem',
                      padding: '6px 8px', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      style={{ 
                        background: '#1a1a1a', color: '#fff', border: 'none', 
                        borderRadius: '3px', padding: '6px 12px', fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => saveEdit(note)}
                    >Save</button>
                    <button 
                      style={{ 
                        background: 'rgba(0,0,0,0.06)', color: '#1a1a1a', 
                        border: 'none', borderRadius: '3px', padding: '6px 12px', 
                        fontSize: '0.75rem', cursor: 'pointer',
                      }} 
                      onClick={() => setEditingId(null)}
                    >Cancel</button>
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
                          background: note.is_done ? '#1a1a1a' : 'transparent',
                          border: note.is_done ? 'none' : '2px solid rgba(0,0,0,0.2)',
                          cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: note.is_done ? '#fff' : '#1a1a1a',
                          fontSize: '0.65rem', padding: 0,
                        }}
                        title={note.is_done ? 'Mark undone' : 'Mark done'}
                      >{note.is_done ? '✓' : ''}</button>
                      <button
                        onClick={() => startEdit(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#666', padding: '2px 4px',
                        }}
                        title="Edit"
                      >✎</button>
                      <button
                        onClick={() => handleDelete(note)}
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          fontSize: '0.85rem', color: '#666', padding: '2px 4px',
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
