import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.json())
      .then(data => { setRoles(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleApply(roleName) {
    if (!user) navigate('/login');
    else navigate(`/apply?role=${encodeURIComponent(roleName)}`);
  }

  return (
    <div className="page-container">
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '60px 0 48px' }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🛡️</div>
        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>
          Join Our Staff Team
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 17, maxWidth: 520, margin: '0 auto 32px' }}>
          We're looking for dedicated, passionate people to help us build and maintain an amazing community.
        </p>
        {!user && (
          <a href="/api/auth/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#5865F2', color: '#fff', padding: '13px 28px',
            borderRadius: 12, fontWeight: 600, fontSize: 16,
            boxShadow: '0 4px 14px rgba(88,101,242,0.35)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Login with Discord to Apply
          </a>
        )}
      </div>

      {/* Role Cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : roles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div style={{ fontWeight: 600 }}>No open positions right now</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Check back soon!</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {roles.map(role => (
            <div key={role.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: role.color + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {role.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{role.name}</div>
                  <div style={{ fontSize: 12, color: role.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Open Applications
                  </div>
                </div>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, flex: 1 }}>
                {role.description || 'Apply to join our team in this role.'}
              </p>
              <button className="btn btn-primary" onClick={() => handleApply(role.name)} style={{ background: role.color }}>
                Apply for {role.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info strip */}
      <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        {[
          { icon: '⚡', label: 'Fast Review',   sub: 'Applications reviewed within 48h' },
          { icon: '🔒', label: 'Secure',         sub: 'Your data stays private' },
          { icon: '💬', label: 'Transparent',    sub: 'Know your application status' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
