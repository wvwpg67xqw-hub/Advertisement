import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', userId: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.userId.trim()) {
      return setError('Please fill in all fields.');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Login failed');
      setUser(data.user);
      navigate('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Sign In</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Enter your Discord username and User ID to continue
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Discord Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. username#0001"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Discord User ID</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. 123456789012345678"
                value={form.userId}
                onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Enable Developer Mode in Discord → right-click your name → Copy User ID
              </span>
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <div className="spinner" /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
