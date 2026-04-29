import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const login    = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    if (loading) return;

    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login successful');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'radial-gradient(ellipse at 60% 20%, rgba(99,102,241,0.12) 0%, transparent 60%)',
    }}>
      <div className="card fade-up" style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'32px' }}>
          <div style={{
            width:'42px', height:'42px',
            background:'linear-gradient(135deg, var(--primary), var(--accent))',
            borderRadius:'12px',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'20px',
          }}>
            💼
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:'1.1rem' }}>
              Talent & Onboarding
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-2)' }}>
              Sign in to continue
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom:'16px' }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="form-group" style={{ marginBottom:'24px' }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width:'100%', justifyContent:'center' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width:16, height:16 }} />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* FIX: removed public default credentials — contact your admin for access */}
        <p style={{
          marginTop:'20px',
          fontSize:'0.78rem',
          color:'var(--text-3)',
          textAlign:'center',
        }}>
          Contact your administrator if you need access.
        </p>

      </div>
    </div>
  );
}
