const MAP = {
  'Active':      'badge-active',
  'In-Progress': 'badge-inprogress',
  'On-hold':     'badge-onhold',
  'Hired':       'badge-hired',
  'Cancelled':   'badge-cancelled',
  'Rejected':    'badge-rejected',
  'Accepted':    'badge-accepted',
  'Joined':      'badge-joined',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge ${MAP[status] || 'badge-onhold'}`}>
      {status || '—'}
    </span>
  );
}
