import { Link } from 'react-router-dom';

export default function PositionPage() {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-2)', marginBottom: '16px' }}>
        Position board — coming in Phase 2
      </p>
      <Link to="/" className="btn btn-ghost btn-sm">← Back to main view</Link>
    </div>
  );
}
