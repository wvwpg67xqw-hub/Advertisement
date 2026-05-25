import React, { useState, useEffect } from 'react';
import { useAuth } from '../App.jsx';
import { Link } from 'react-router-dom';

export default function Appeal() {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [existingAppeal, setExistingAppeal] = useState(null);
  const [checkingAppeal, setCheckingAppeal] = useState(true);

  useEffect(() => {
    if (!user) { setCheckingAppeal(false); return; }
    fetch('/api/appeals/mine', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setExistingAppeal(data);
        setCheckingAppeal(false);
      })
      .catch(() => setCheckingAppeal(false));
  }, [user]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason.trim()) { setError('Please explain why you should be unbanned.'); return; }
    if (reason.length > 2000) { setError('Appeal must be under 2000 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to submit appeal.'); return; }
      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingAppeal) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 60px)' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (submitted || (existingAppeal && existingAppeal.status === 'pending')) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>📬</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>Appeal Submitted</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
            Your appeal has been received and will be reviewed by the team. You'll be able to access the portal if it's accepted.
          </p>
          <div className="card" style={{ textAlign: 'left', padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Your appeal reason:</div>
            <div style={{ fontSize: 14, lineHeight: 1.7 }}>{existingAppeal?.reason || reason}</div>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Status: <span style={{ color: '#f59e0b', fontWeight: 600 }}>⏳ Pending Review</span>
          </div>
        </div>
      </div>
    );
  }

  if (existingAppeal && existingAppeal.status === 'denied') {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>❌</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>Appeal Denied</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7 }}>
            Your appeal was reviewed and denied. You may not resubmit an appeal for this ban.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>Appeal a Ban</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
            You need to sign in with Discord so we can identify your account and process your appeal.
          </p>
          <a href="/api/auth/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#5865F2', color: '#fff', padding: '13px 28px',
            borderRadius: 12, fontWeight: 600, fontSize: 15,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Sign in with Discord
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 10 }}>You're Banned</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.7 }}>
            Your account has been banned from the Staff Portal. If you believe this was a mistake,
            you can submit an appeal below.
          </p>
        </div>

        {user && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 24 }}>
            {user.avatar && <img src={user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />}
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{user.username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Appealing as this account</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Why should your ban be lifted?
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why you believe this ban was a mistake, or why you should be given another chance..."
              maxLength={2000}
              rows={6}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 14,
                lineHeight: 1.6,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
              {reason.length}/2000
            </div>
          </div>

          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !reason.trim()}
            style={{ padding: '12px 0', fontSize: 15, fontWeight: 600 }}
          >
            {loading ? 'Submitting…' : 'Submit Appeal'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted)' }}>← Back to home</Link>
        </div>

      </div>
    </div>
  );
}
