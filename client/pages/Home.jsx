import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useBranding } from '../App.jsx';

const DISCORD_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

export default function Home() {
  const { user } = useAuth();
  const { pfp_url, banner_url, guild_name } = useBranding();
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredRole, setHoveredRole] = useState(null);

  useEffect(() => {
    fetch('/api/roles', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleApply(roleName) {
    navigate(user ? `/apply?role=${encodeURIComponent(roleName)}` : '/login');
  }

  const serverName = guild_name || 'Our Community';

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>

        {/* Ambient glow blobs */}
        <div style={{
          position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(108,99,255,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 60, right: -100,
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(88,101,242,0.10) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Banner */}
        {banner_url && (
          <div style={{ position: 'relative', height: 220, overflow: 'hidden' }}>
            <img src={banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.6)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(11,11,16,0.2) 0%, #0b0b10 100%)' }} />
          </div>
        )}

        {/* Hero content */}
        <div style={{
          maxWidth: 860,
          margin: '0 auto',
          padding: banner_url ? '0 24px 80px' : '80px 24px 80px',
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* Server icon */}
          <div style={{ marginBottom: 28, display: 'inline-block', position: 'relative' }}>
            {pfp_url ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{
                  position: 'absolute', inset: -4, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5865f2, #6c63ff, #a78bfa)',
                  zIndex: 0,
                }} />
                <img src={pfp_url} alt="" style={{
                  width: 88, height: 88, borderRadius: '50%', objectFit: 'cover',
                  position: 'relative', zIndex: 1, display: 'block',
                }} />
              </div>
            ) : (
              <div style={{
                width: 88, height: 88, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 40,
                background: 'linear-gradient(135deg, rgba(88,101,242,0.3), rgba(108,99,255,0.3))',
                border: '1px solid rgba(108,99,255,0.4)',
              }}>🛡️</div>
            )}
          </div>

          {/* Pill badge */}
          <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(88,101,242,0.15)', border: '1px solid rgba(88,101,242,0.35)',
              color: '#a5b4fc', borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.3px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Applications Open
            </span>
          </div>

          <h1 style={{
            fontSize: 'clamp(32px, 6vw, 56px)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginBottom: 20,
            letterSpacing: '-1px',
          }}>
            Join{' '}
            <span style={{
              background: 'linear-gradient(135deg, #818cf8, #6c63ff, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {serverName}
            </span>
            {'\'s'} Staff Team
          </h1>

          <p style={{
            color: 'var(--text-muted)',
            fontSize: 'clamp(15px, 2vw, 18px)',
            maxWidth: 540,
            margin: '0 auto 36px',
            lineHeight: 1.7,
          }}>
            We're looking for dedicated, passionate people to help build and maintain an amazing community.
          </p>

          {!user ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a href="/api/auth/login" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#5865F2', color: '#fff',
                padding: '14px 32px', borderRadius: 12,
                fontWeight: 700, fontSize: 15,
                boxShadow: '0 4px 24px rgba(88,101,242,0.4)',
                transition: 'all 0.2s',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(88,101,242,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 24px rgba(88,101,242,0.4)'; }}
              >
                {DISCORD_ICON}
                Login with Discord
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/apply')}
                style={{ padding: '14px 32px', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 24px rgba(108,99,255,0.35)' }}
              >
                Browse Positions ↓
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => navigate('/staff')}
                style={{ padding: '14px 24px', fontSize: 15 }}
              >
                Staff Panel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── STATS STRIP ──────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <div style={{
          maxWidth: 860, margin: '0 auto', padding: '0 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
        }}>
          {[
            { icon: '⚡', label: 'Fast Review', sub: 'Reviewed within 48h' },
            { icon: '🔒', label: 'Secure', sub: 'Your data stays private' },
            { icon: '💬', label: 'Transparent', sub: 'Always know your status' },
          ].map((item, i) => (
            <div key={item.label} style={{
              textAlign: 'center', padding: '22px 16px',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── OPEN POSITIONS ───────────────────────────────────── */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '1.5px',
            textTransform: 'uppercase', color: '#818cf8',
            background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)',
            borderRadius: 999, padding: '4px 14px', marginBottom: 14,
          }}>
            Open Positions
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, marginBottom: 10, letterSpacing: '-0.5px' }}>
            Find your place on the team
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Each role plays a vital part in keeping our community thriving.
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" />
          </div>
        ) : roles.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 16,
          }}>
            <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.4 }}>📭</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No open positions right now</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Check back soon — new roles open regularly.</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}>
            {roles.map(role => {
              const isHovered = hoveredRole === role.id;
              return (
                <div
                  key={role.id}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                  style={{
                    background: isHovered ? 'var(--surface2)' : 'var(--surface)',
                    border: `1px solid ${isHovered ? role.color + '55' : 'var(--border)'}`,
                    borderRadius: 16,
                    padding: 24,
                    display: 'flex', flexDirection: 'column', gap: 18,
                    cursor: 'default',
                    transition: 'all 0.2s',
                    transform: isHovered ? 'translateY(-3px)' : 'none',
                    boxShadow: isHovered ? `0 8px 32px ${role.color}22` : 'none',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Top colour accent */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg, ${role.color}, ${role.color}88)`,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.2s',
                    borderRadius: '16px 16px 0 0',
                  }} />

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      background: role.color + '20',
                      border: `1px solid ${role.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24,
                      transition: 'transform 0.2s',
                      transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                    }}>
                      {role.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{role.name}</div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.8px', color: role.color,
                        background: role.color + '18',
                        padding: '2px 8px', borderRadius: 999,
                      }}>
                        Open Applications
                      </span>
                    </div>
                  </div>

                  <p style={{
                    color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, flex: 1,
                    margin: 0,
                  }}>
                    {role.description || 'Apply to join our team in this role.'}
                  </p>

                  <button
                    className="btn"
                    onClick={() => handleApply(role.name)}
                    style={{
                      background: isHovered ? role.color : 'transparent',
                      color: isHovered ? '#fff' : role.color,
                      border: `1.5px solid ${role.color}`,
                      fontWeight: 700, fontSize: 14,
                      transition: 'all 0.2s',
                      borderRadius: 10,
                    }}
                  >
                    Apply for {role.name} →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FOOTER CTA ───────────────────────────────────────── */}
      {!user && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <div style={{
            maxWidth: 860, margin: '0 auto', padding: '56px 24px',
            textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 600, height: 300, borderRadius: '50%',
              background: 'radial-gradient(ellipse, rgba(88,101,242,0.1) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
            <div style={{ fontSize: 36, marginBottom: 16 }}>🚀</div>
            <h3 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, marginBottom: 10 }}>
              Ready to make a difference?
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 15 }}>
              Log in with Discord to start your application in under a minute.
            </p>
            <a href="/api/auth/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: '#5865F2', color: '#fff',
              padding: '14px 32px', borderRadius: 12,
              fontWeight: 700, fontSize: 15,
              boxShadow: '0 4px 24px rgba(88,101,242,0.35)',
              textDecoration: 'none',
            }}>
              {DISCORD_ICON}
              Get Started with Discord
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
