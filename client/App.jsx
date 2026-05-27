import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Apply from './pages/Apply.jsx';
import Login from './pages/Login.jsx';
import Success from './pages/Success.jsx';
import Admin from './pages/Admin.jsx';
import Appeal from './pages/Appeal.jsx';
import Staff from './pages/Staff.jsx';
import NotFound from './pages/NotFound.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Navbar({ user, onLogout }) {
  return (
    <nav style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 60,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 18 }}>
        <span style={{ fontSize: 22 }}>🛡️</span>
        <span>Staff Portal</span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {user ? (
          <>
            <Link to="/staff" style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>
              Staff Panel
            </Link>
            {user.isAdmin && (
              <Link to="/admin" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 500 }}>
                Admin Panel
              </Link>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user.avatar && (
                <img src={user.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%' }} />
              )}
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{user.username}</span>
            </div>
            <button onClick={onLogout} className="btn btn-ghost btn-sm">Logout</button>
          </>
        ) : (
          <a href="/api/auth/login" className="btn btn-primary btn-sm" style={{
            background: '#5865F2', display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Login with Discord
          </a>
        )}
      </div>
    </nav>
  );
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isBlacklisted) return <Navigate to="/appeal" replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      <BrowserRouter>
        <Navbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/appeal" element={<Appeal />} />
          <Route path="/success" element={<Success />} />
          <Route path="/apply" element={
            <ProtectedRoute><Apply /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
          } />
          <Route path="/staff" element={
            <ProtectedRoute><Staff /></ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
