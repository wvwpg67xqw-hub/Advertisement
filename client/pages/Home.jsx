import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useBranding } from '../App.jsx';

export default function Home() {
  const { user } = useAuth();
  const { pfp_url, banner_url, guild_name } = useBranding();
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await fetch('/api/roles', {
          credentials: 'include',
        });

        if (!res.ok) throw new Error('Failed to load roles');

        const data = await res.json();
        setRoles(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadRoles();
  }, []);

  function handleApply(roleName) {
    if (!user) {
      navigate('/login');
      return;
    }

    navigate(`/apply?role=${encodeURIComponent(roleName)}`);
  }

  return (
    <div className="page-container">

      {/* BANNER */}
      {banner_url && (
        <div style={{
          width: '100%', height: 180, borderRadius: 16, overflow: 'hidden',
          marginBottom: 0, marginTop: 24, position: 'relative',
        }}>
          <img src={banner_url} alt="Server banner" style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)',
          }} />
        </div>
      )}

      {/* HERO */}
      <div style={{ textAlign: 'center', padding: banner_url ? '20px 0 48px' : '60px 0 48px' }}>
        {pfp_url ? (
          <img src={pfp_url} alt="Server icon" style={{
            width: 80, height: 80, borderRadius: 20, objectFit: 'cover',
            marginBottom: 20, border: '3px solid var(--border)', display: 'inline-block',
          }} />
        ) : (
          <div style={{ fontSize: 56, marginBottom: 20 }}>🛡️</div>
        )}

        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>
          {guild_name ? `Join ${guild_name}'s Staff Team` : 'Join Our Staff Team'}
        </h1>

        <p style={{ color: 'var(--text-muted)', fontSize: 17, maxWidth: 520, margin: '0 auto 32px' }}>
          We're looking for dedicated, passionate people to help build and maintain an amazing community.
        </p>

        {!user && (
          <a href="/api/auth/login" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#5865F2',
            color: '#fff',
            padding: '13px 28px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 16,
          }}>
            Login with Discord
          </a>
        )}
      </div>

      {/* ERROR STATE */}
      {error && (
        <div style={{ textAlign: 'center', color: 'red', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : roles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div style={{ fontWeight: 600 }}>No open positions right now</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Check back soon!</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20
        }}>
          {roles.map(role => (
            <div
              key={role.id}
              className="card"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: role.color + '22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {role.emoji}
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {role.name}
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: role.color,
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    Open Applications
                  </div>
                </div>
              </div>

              <p style={{
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1.7,
                flex: 1
              }}>
                {role.description || 'Apply to join our team in this role.'}
              </p>

              <button
                className="btn btn-primary"
                onClick={() => handleApply(role.name)}
                style={{ background: role.color }}
              >
                Apply for {role.name}
              </button>

            </div>
          ))}
        </div>
      )}

      {/* INFO STRIP */}
      <div style={{
        marginTop: 48,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16
      }}>
        {[
          { icon: '⚡', label: 'Fast Review', sub: 'Applications reviewed within 48h' },
          { icon: '🔒', label: 'Secure', sub: 'Your data stays private' },
          { icon: '💬', label: 'Transparent', sub: 'Know your application status' },
        ].map(item => (
          <div
            key={item.label}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 20,
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 28 }}>{item.icon}</div>
            <div style={{ fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}