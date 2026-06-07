import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../App.jsx';
import { QRCodeCanvas } from 'qrcode.react';

const api = (path, opts = {}) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="btn btn-ghost btn-sm" style={{ minWidth: 72 }}>
      {copied ? '✅ Copied' : '📋 Copy'}
    </button>
  );
}

export default function Staff() {
  const { user } = useAuth();

  // ── Config (main guild ID) ──
  const [mainGuildId, setMainGuildId] = useState(null);

  // ── Referral link state ──
  const [referralLink, setReferralLink] = useState(null);
  const [referralAuto, setReferralAuto] = useState(true);
  const [referralLoading, setReferralLoading] = useState(true);
  const [newLink, setNewLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkMsg, setLinkMsg] = useState(null);
  const [qrCopied, setQrCopied] = useState(false);
  const qrRef = useRef(null);

  // ── Modmail state ──
  const [modmailLoading, setModmailLoading] = useState(false);
  const [modmailMsg, setModmailMsg] = useState(null);

  useEffect(() => {
    api('/api/config').then(r => r.json()).then(d => setMainGuildId(d.mainGuildId)).catch(() => {});
  }, []);

  const loadReferralLink = useCallback(async () => {
    try {
      const res = await api('/api/staff/referral-link');
      const data = await res.json();
      setReferralLink(data.link);
      setReferralAuto(data.auto ?? true);
    } catch {}
    setReferralLoading(false);
  }, []);

  useEffect(() => {
    loadReferralLink();
    const interval = setInterval(loadReferralLink, 30000);
    return () => clearInterval(interval);
  }, [loadReferralLink]);

  async function saveLink(e) {
    e.preventDefault();
    if (!newLink.trim()) return;
    setSavingLink(true);
    setLinkMsg(null);
    try {
      const res = await api('/api/staff/referral-link', {
        method: 'POST',
        body: JSON.stringify({ link: newLink.trim(), guildId: mainGuildId }),
      });
      const data = await res.json();
      if (!res.ok) setLinkMsg({ error: data.error || 'Failed to save.' });
      else { setReferralLink(data.link); setNewLink(''); setLinkMsg({ success: 'Referral link updated.' }); }
    } catch { setLinkMsg({ error: 'Network error.' }); }
    setSavingLink(false);
  }

  async function copyQr() {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setQrCopied(true);
        setTimeout(() => setQrCopied(false), 2000);
      });
    } catch {
      // fallback: download
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'referral-qr.png';
      a.click();
    }
  }

  async function applyModmail() {
    if (!mainGuildId) {
      setModmailMsg({ error: 'Server config not loaded yet. Please wait a moment and try again.' });
      return;
    }
    setModmailLoading(true);
    setModmailMsg(null);
    try {
      const res = await api('/api/staff/apply-modmail', {
        method: 'POST',
        body: JSON.stringify({ guildId: mainGuildId }),
      });
      const data = await res.json();
      if (!res.ok) setModmailMsg({ error: data.error || 'Failed to submit.' });
      else setModmailMsg({ success: data.message });
    } catch { setModmailMsg({ error: 'Network error.' }); }
    setModmailLoading(false);
  }

  const cardStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '24px 28px',
    marginBottom: 24,
  };

  const sectionTitle = {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const sectionSub = {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 18,
  };

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
          🛡️ Moderator Panel
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Welcome back, <strong>{user?.username}</strong>. Use the tools below for your staff duties.
        </p>
      </div>

      {/* ── Referral Link ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>
          🔗 Application Referral Link
          {!referralLoading && referralAuto && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',
            }}>✨ Auto-generated</span>
          )}
          {!referralLoading && !referralAuto && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)',
            }}>Custom</span>
          )}
        </div>
        <div style={sectionSub}>
          Share this link so people can apply to join the staff team. It always points to the application page.
        </div>

        {referralLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="spinner" style={{ width: 16, height: 16 }} /> Loading...
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* QR Code */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div
                ref={qrRef}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 10,
                  display: 'inline-block',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                }}
              >
                <QRCodeCanvas
                  value={referralLink || ''}
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <button
                onClick={copyQr}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 8,
                  background: qrCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${qrCopied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}`,
                  color: qrCopied ? '#4ade80' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                {qrCopied ? '✅ Copied!' : '📋 Copy QR'}
              </button>
            </div>

            {/* Link + copy */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}>
                <a
                  href={referralLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontWeight: 600, wordBreak: 'break-all', fontSize: 13 }}
                >
                  {referralLink}
                </a>
                <CopyButton text={referralLink} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                Share this link or QR code. Anyone who applies through it will be tracked back to you.
              </p>
            </div>
          </div>
        )}

        {user?.isAdmin && (
          <>
            <form onSubmit={saveLink} style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <input
                className="form-input"
                style={{ flex: 1, fontSize: 13 }}
                placeholder="Override with a custom link (optional)…"
                value={newLink}
                onChange={e => setNewLink(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={savingLink || !newLink.trim()}
              >
                {savingLink ? 'Saving…' : 'Set Custom'}
              </button>
            </form>
            {!referralAuto && (
              <button
                style={{
                  marginTop: 8, fontSize: 12, color: 'var(--text-muted)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                }}
                onClick={async () => {
                  setLinkMsg(null);
                  await api('/api/staff/referral-link', {
                    method: 'POST',
                    body: JSON.stringify({ link: '__auto__', guildId: mainGuildId }),
                  });
                  await loadReferralLink();
                  setLinkMsg({ success: 'Reverted to auto-generated link.' });
                }}
              >
                ↩ Revert to auto-generated
              </button>
            )}
          </>
        )}

        {linkMsg && (
          <div style={{
            marginTop: 10, fontSize: 13, padding: '8px 12px', borderRadius: 8,
            background: linkMsg.error ? '#ef444420' : '#22c55e20',
            color: linkMsg.error ? '#ef4444' : '#22c55e',
          }}>
            {linkMsg.error || linkMsg.success}
          </div>
        )}
      </div>

      {/* ── Modmail Test Application ── */}
      <div style={cardStyle}>
        <div style={sectionTitle}>📬 Modmail Test</div>
        <div style={sectionSub}>
          Apply to take the modmail test. Your application will be sent to the management team for review.
        </div>

        <button
          className="btn btn-primary"
          onClick={applyModmail}
          disabled={modmailLoading || !!modmailMsg?.success}
          style={{ background: '#5865F2' }}
        >
          {modmailLoading ? 'Submitting…' : modmailMsg?.success ? '✅ Application Sent' : '📬 Apply for Modmail Test'}
        </button>

        {modmailMsg && (
          <div style={{
            marginTop: 12, fontSize: 13, padding: '10px 14px', borderRadius: 8,
            background: modmailMsg.error ? '#ef444420' : '#22c55e20',
            color: modmailMsg.error ? '#ef4444' : '#22c55e',
          }}>
            {modmailMsg.error || modmailMsg.success}
          </div>
        )}
      </div>

      {/* ── Info cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        {[
          { icon: '🔨', label: 'Mod Tasks', url: 'https://discord.com/channels/1495198147109060618/1502489464851796099' },
          { icon: '🤝', label: 'HR Tasks', url: 'https://discord.com/channels/1495198147109060618/1502489463001972799' },
          { icon: '📋', label: 'Management Tasks', url: 'https://discord.com/channels/1495198147109060618/1502489591725166673' },
        ].map(item => (
          <a
            key={item.label}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '18px 16px',
              textAlign: 'center',
              textDecoration: 'none',
              color: 'var(--text)',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Open in Discord →</div>
          </a>
        ))}
      </div>
    </div>
  );
}
