import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

export default function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const [hovering, setHovering] = useState(false);

  const errorMessages = {
    no_code:          'Discord did not return an authorisation code. Please try again.',
    token_failed:     'Failed to exchange the Discord authorisation code. Check your app credentials.',
    user_fetch_failed:'Could not retrieve your Discord profile. Please try again.',
    oauth_error:      'An unexpected error occurred during login. Please try again.',
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        {/* Logo / heading */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🛡️</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Staff Portal</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
            Sign in with your Discord account to apply or manage the team.
          </p>
        </div>

        {/* Error alert */}
        {error && (
          <div className="alert alert-error" style={{ width: '100%' }}>
            {errorMessages[error] || 'Something went wrong. Please try again.'}
          </div>
        )}

        {/* Discord OAuth button */}
        <a
          href="/api/auth/login"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            width: '100%',
            padding: '14px 24px',
            borderRadius: 12,
            background: hovering ? '#4752c4' : '#5865F2',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            transition: 'background 0.2s, transform 0.15s',
            transform: hovering ? 'translateY(-1px)' : 'none',
            boxShadow: hovering ? '0 8px 24px rgba(88,101,242,0.4)' : '0 4px 14px rgba(88,101,242,0.25)',
          }}
        >
          {/* Discord logo SVG */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Continue with Discord
        </a>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          We only request access to your <strong style={{ color: 'var(--text)' }}>username and ID</strong>.<br />
          No messages, servers, or other data are read.
        </p>

        <Link to="/" style={{ color: 'var(--accent)', fontSize: 13 }}>← Back to home</Link>
      </div>
    </div>
  );
}
