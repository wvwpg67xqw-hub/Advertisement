import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const roles = [
  {
    emoji: '🔨',
    name: 'Moderator',
    color: '#6c63ff',
    description: 'Enforce community rules, manage disputes, handle reports, and maintain a safe environment for all members.',
    perks: ['Manage messages', 'Timeout members', 'Access mod channels'],
  },
  {
    emoji: '🤝',
    name: 'Human Resources',
    color: '#22c55e',
    description: 'Onboard new staff, handle staff issues, manage promotions, and ensure team wellbeing and cohesion.',
    perks: ['Staff management', 'Conflict resolution', 'Recruitment oversight'],
  },
  {
    emoji: '🌐',
    name: 'Partnership',
    color: '#f59e0b',
    description: 'Build relationships with other communities, negotiate partnership deals, and grow our network.',
    perks: ['Server partnerships', 'Brand collaborations', 'Community growth'],
  },
];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  function handleApply(role) {
    if (!user) {
      navigate('/login');
    } else {
      navigate(`/apply?role=${encodeURIComponent(role)}`);
    }
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
          <button className="btn btn-primary" onClick={() => navigate('/login')} style={{ fontSize: 16, padding: '12px 28px' }}>
            Get Started →
          </button>
        )}
      </div>

      {/* Role Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {roles.map((role) => (
          <div key={role.name} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>{role.description}</p>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {role.perks.map(perk => (
                <li key={perk} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  <span style={{ color: role.color, fontSize: 16 }}>✓</span>
                  {perk}
                </li>
              ))}
            </ul>

            <button
              className="btn btn-primary"
              onClick={() => handleApply(role.name)}
              style={{ marginTop: 'auto', background: role.color }}
            >
              Apply for {role.name}
            </button>
          </div>
        ))}
      </div>

      {/* Info strip */}
      <div style={{
        marginTop: 48,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16,
      }}>
        {[
          { icon: '⚡', label: 'Fast Review', sub: 'Applications reviewed within 48h' },
          { icon: '🔒', label: 'Secure', sub: 'Your data stays private' },
          { icon: '💬', label: 'Transparent', sub: 'Know your application status' },
        ].map(item => (
          <div key={item.label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
