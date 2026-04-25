import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';

export default function RoleGuard({ children, requiredRole = 'admin' }) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // DEBUG: Runtime RoleGuard inspection
  console.log('=== ROLEGUARD DEBUG ===');
  console.log('RoleGuard user:', user);
  console.log('RoleGuard user.role:', user?.role);
  console.log('RoleGuard requiredRole:', requiredRole);
  console.log('RoleGuard isAuthenticated:', isAuthenticated);
  console.log('RoleGuard role check result:', user?.role !== requiredRole);
  console.log('=== END ROLEGUARD DEBUG ===');

  if (!isAuthenticated) {
    console.log('RoleGuard: Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== requiredRole) {
    console.log('RoleGuard: Role mismatch, showing access denied');
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '16px',
        }}>🔒</div>
        <h1 style={{ margin: '0 0 16px 0', fontSize: '1.5rem', fontWeight: 700 }}>
          Access Denied
        </h1>
        <p style={{ margin: '0 0 24px 0', color: 'var(--text-2)', maxWidth: '400px' }}>
          You don't have permission to access this page. This area requires {requiredRole} privileges.
        </p>
        <button 
          className="btn btn-primary"
          onClick={() => window.history.back()}
        >
          Go Back
        </button>
      </div>
    );
  }

  console.log('RoleGuard: Access granted, rendering children');
  return children;
}
