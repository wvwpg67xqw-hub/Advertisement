import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useBranding } from '../App.jsx';

const DISCORD_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const errorMessages = {
  no_code:           'Discord did not return an authorisation code. Please try again.',
  token_failed:      'Failed to exchange the Discord authorisation code. Check your app credentials.',
  user_fetch_failed: 'Could not retrieve your Discord profile. Please try again.',
  oauth_error:       'An unexpected error occurred during login. Please try again.',
  invalid_state:     'Login session expired or was tampered with. Please try again.',
  bots_not_allowed:  'Bot accounts cannot log in to the Staff Portal.',
  vpn_not_allowed:   'VPN and proxy connections are not allowed. Please disable your VPN and try again.',
  access_denied:     'Access denied.',
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const error    = searchParams.get('error');
  const loggedOut = searchParams.get('loggedout') === '1';
  const { guild_name, pfp_url } = useBranding();
  const [hovering, setHovering] = useState(false);

  if (error === 'blacklisted') {
    return (
      <>
        <PageBackground />
        <div style={styles.outer}>
          <div style={styles.card}>
            <div style={styles.iconCircle}>🚫</div>
            <h1 style={styles.title}>Account Banned</h1>
            <p style={styles.subtitle}>
              Your Discord account has been banned from this Staff Portal.
              If you believe this is a mistake, you can submit an appeal.
            </p>
            <Link to="/appeal" style={{ ...styles.discordBtn, justifyContent: 'center' }}>
              Submit an Appeal
            </Link>
            <Link to="/" style={styles.backLink}>← Back to home</Link>
          </div>
        </div>
      </>
    );
  }

  const displayName = guild_name ? `${guild_name} Staff Portal` : 'Staff Portal';

  return (
    <>
      <PageBackground />
      <div style={styles.outer}>
        <div style={styles.card}>
          {/* Icon */}
          <div style={styles.iconCircle}>
            {pfp_url
              ? <img src={pfp_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
              : '🏅'}
          </div>

          {/* Title */}
          <h1 style={styles.title}>{displayName}</h1>
          <p style={styles.subtitle}>
            Join our network of communities. Login with Discord to begin your application.
          </p>

          {/* Error */}
          {error && (
            <div style={styles.errorBox}>
              {errorMessages[error] || 'Something went wrong. Please try again.'}
            </div>
          )}

          {/* Logged out notice */}
          {loggedOut && !error && (
            <div style={styles.loggedOutBox}>Logged out successfully</div>
          )}

          {/* Discord button */}
          <a
            href="/api/auth/login"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
              ...styles.discordBtn,
              background: hovering ? '#a31515' : '#c41a1a',
              transform: hovering ? 'translateY(-1px)' : 'none',
              boxShadow: hovering
                ? '0 6px 24px rgba(200,20,20,0.55)'
                : '0 4px 14px rgba(180,10,10,0.4)',
            }}
          >
            {DISCORD_SVG}
            Login with Discord
          </a>

          <p style={styles.footnote}>
            We only request access to your <strong style={{ color: 'rgba(255,255,255,0.85)' }}>username and ID</strong>.<br />
            No messages, servers, or other data are read.
          </p>

          <Link to="/" style={styles.backLink}>← Back to home</Link>
        </div>

        <p style={styles.credit}>A Dev_Aarons production</p>
      </div>
    </>
  );
}

function PageBackground() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: -1,
      background: 'radial-gradient(ellipse at 50% -10%, #5c0c0c 0%, #2b0404 35%, #0c0000 100%)',
    }} />
  );
}

const styles = {
  outer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px',
    gap: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: 'rgba(18, 3, 3, 0.96)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    borderRadius: 20,
    padding: '40px 32px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    textAlign: 'center',
    boxShadow: '0 8px 48px rgba(160, 0, 0, 0.25), 0 0 0 1px rgba(255,60,60,0.06)',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: '#c41a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 34,
    marginBottom: 4,
    boxShadow: '0 4px 20px rgba(200,20,20,0.5)',
    flexShrink: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: '#f87171',
    lineHeight: 1.25,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.7,
  },
  discordBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '13px 20px',
    borderRadius: 10,
    background: '#c41a1a',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    transition: 'background 0.18s, transform 0.15s, box-shadow 0.18s',
    border: 'none',
    cursor: 'pointer',
    justifyContent: 'center',
    textDecoration: 'none',
    marginTop: 4,
  },
  loggedOutBox: {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 10,
    border: '1px solid rgba(34,197,94,0.4)',
    background: 'rgba(34,197,94,0.06)',
    color: '#4ade80',
    fontWeight: 600,
    fontSize: 14,
  },
  errorBox: {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 10,
    border: '1px solid rgba(239,68,68,0.35)',
    background: 'rgba(239,68,68,0.08)',
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 1.5,
  },
  footnote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 1.7,
  },
  backLink: {
    fontSize: 13,
    color: '#f87171',
    opacity: 0.7,
  },
  credit: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
  },
};
