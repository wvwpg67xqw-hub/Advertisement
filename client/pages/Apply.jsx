import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const TIMEZONES = ['UTC-12','UTC-11','UTC-10','UTC-9','UTC-8 (PST)','UTC-7 (MST)','UTC-6 (CST)','UTC-5 (EST)','UTC-4','UTC-3','UTC-2','UTC-1','UTC+0 (GMT)','UTC+1 (CET)','UTC+2 (EET)','UTC+3','UTC+4','UTC+5','UTC+5:30 (IST)','UTC+6','UTC+7','UTC+8 (CST)','UTC+9 (JST)','UTC+10 (AEST)','UTC+11','UTC+12'];

export const ROLE_QUESTIONS = {
  Moderator: [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to moderating?',
    'Have you moderated a Discord server before? If so, describe your experience.',
    'What is the first thing you do when you see two members arguing in chat?',
    'A member reports someone for posting hate speech. Walk us through exactly what you would do.',
    'How do you handle a rule violation committed by a well-known or senior community member?',
    'What do you think is the most important quality a moderator should have, and why?',
    'Describe a time you had to make a difficult or unpopular decision. How did you handle it?',
    'Moderation can be stressful. How do you manage burnout or frustration on the job?',
    'Are you familiar with Discord\'s Terms of Service and Community Guidelines? Summarise your understanding.',
    'Which moderation bots or tools have you worked with before?',
    'How would you respond to a coordinated raid or mass-spam event in the server?',
    'A user claims you moderated them unfairly and demands an explanation. How do you respond?',
    'How do you remain unbiased when moderating a conflict between someone you know and a stranger?',
    'You disagree with a decision made by a senior staff member. What do you do?',
    'Describe how you would word a formal warning to a member who broke a rule.',
    'Three incidents happen at the same time. How do you decide what to handle first?',
    'Why do you want to be part of this community\'s staff team specifically?',
    'Is there anything else you would like us to know about you?',
  ],
  'Human Resources': [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to HR duties?',
    'Do you have previous HR or staff management experience? If so, describe it.',
    'A staff member has been repeatedly inactive without giving notice. How do you handle it?',
    'Two staff members are in conflict and come to you separately. How do you approach the situation?',
    'Describe how you would onboard a newly accepted staff member from day one.',
    'How do you approach addressing performance issues with a staff member sensitively?',
    'How would you identify signs of low morale within the team and what would you do about it?',
    'What qualities do you specifically look for when reviewing a staff application?',
    'A staff member shares something confidential with you. How do you handle that information?',
    'A staff member is struggling to keep up with their duties. What support do you offer?',
    'How would you approach the process of demoting or removing a staff member fairly?',
    'What ideas do you have to improve staff engagement, retention, and team culture?',
    'How do you ensure every staff member feels heard and treated equally regardless of rank?',
    'Describe a real situation where you resolved a conflict between people on a team.',
    'How comfortable are you with documentation such as keeping records and writing reports?',
    'What does a healthy and productive staff team look like to you?',
    'Why do you specifically want to join this community\'s HR team?',
    'Is there anything else you would like us to know about you?',
  ],
  Partnership: [
    'How old are you?',
    'What is your timezone?',
    'How many hours per week can you dedicate to partnership duties?',
    'Do you have any previous partnership, networking, or community relations experience?',
    'How do you decide whether a community is a good fit for a partnership?',
    'Walk us through exactly how you would reach out to a potential partner server for the first time.',
    'How do you measure whether a partnership has been successful?',
    'What would make you decline or end an existing partnership?',
    'How would you maintain a long-term partnership and keep both sides engaged over time?',
    'Describe your communication style when writing on behalf of this community.',
    'One of our partner servers is behaving inappropriately or violating our guidelines. What do you do?',
    'How comfortable are you writing partnership announcements, ad copy, or promotional content?',
    'How do you stay organised when managing a large number of active partnerships at once?',
    'What types of communities would you prioritise when looking for new partnerships?',
    'How do you handle a situation where a partnership pitch is rejected?',
    'Describe a time you successfully built a professional relationship or networked with someone new.',
    'How many Discord servers are you currently active in and what are your roles there?',
    'In your view, what makes a partnership genuinely beneficial for both communities?',
    'Why do you specifically want to join this community\'s partnership team?',
    'Is there anything else you would like us to know about you?',
  ],
};

const ROLES = [
  { key: 'Moderator',        label: 'Moderator',           emoji: '🔨', desc: 'Enforce rules, handle reports, maintain order',          color: '#6c63ff' },
  { key: 'Human Resources',  label: 'Human Resources',     emoji: '🤝', desc: 'Manage staff, onboarding, and team wellbeing',           color: '#22c55e' },
  { key: 'Partnership',      label: 'Partnership Manager', emoji: '🌐', desc: 'Build community partnerships and grow the network',      color: '#f59e0b' },
];

export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const preselectedGuildId = searchParams.get('guildId') || '';
  const preselectedRole    = searchParams.get('role') || '';

  const initialStep = preselectedGuildId
    ? (preselectedRole ? 'form' : 'role')
    : 'server';

  const [step, setStep]                 = useState(initialStep);
  const [servers, setServers]           = useState([]);
  const [serversLoading, setLoading1]   = useState(true);
  const [selectedServer, setSelectedServer] = useState(null);
  const [role, setRole]                 = useState(preselectedRole);
  const [answers, setAnswers]           = useState(Array(20).fill(''));
  const [error, setError]               = useState('');
  const [submitting, setSubmitting]     = useState(false);

  useEffect(() => {
    fetch('/api/bot/guilds')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setServers(list);
        if (preselectedGuildId) {
          const match = list.find(s => s.id === preselectedGuildId);
          if (match) setSelectedServer(match);
        }
        setLoading1(false);
      })
      .catch(() => setLoading1(false));
  }, []);

  const questions = ROLE_QUESTIONS[role] || [];
  const roleInfo  = ROLES.find(r => r.key === role);

  function pickServer(server) {
    setSelectedServer(server);
    setStep('role');
    setError('');
  }

  function pickRole(r) {
    setRole(r);
    setAnswers(Array(20).fill(''));
    setStep('form');
    setError('');
  }

  function setAnswer(i, val) {
    setAnswers(prev => { const next = [...prev]; next[i] = val; return next; });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!selectedServer) return setError('Please select a server.');
    if (!role)           return setError('Please select a role.');
    for (let i = 0; i < questions.length; i++) {
      if (!answers[i]?.trim()) return setError(`Please answer question ${i + 1}.`);
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, answers, guildId: selectedServer.id }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Submission failed');
      navigate('/success');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const stepDefs = [
    { id: 'server', label: '1. Server' },
    { id: 'role',   label: '2. Role'   },
    { id: 'form',   label: '3. Form'   },
  ];
  const stepIndex = stepDefs.findIndex(s => s.id === step);

  return (
    <div className="page-container" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <h1 className="page-title">📋 Staff Application</h1>
        <p className="page-subtitle">Take your time and answer thoughtfully — quality answers improve your chances.</p>
      </div>

      {/* User badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
        {user?.avatar && <img src={user.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />}
        <div>
          <div style={{ fontWeight: 600 }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Applying as · {user?.userId}</div>
        </div>
        <span style={{ marginLeft: 'auto', background: 'rgba(88,101,242,0.15)', color: '#7289da', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>via Discord</span>
      </div>

      {/* Step breadcrumb */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, fontSize: 13 }}>
        {stepDefs.map((s, i) => {
          const done   = i < stepIndex;
          const active = i === stepIndex;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span style={{ color: 'var(--border)', margin: '0 2px' }}>›</span>}
              <span style={{ fontWeight: active || done ? 600 : 400, color: active ? 'var(--text)' : done ? 'var(--success)' : 'var(--text-muted)' }}>
                {done ? '✓ ' : ''}{s.label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 1: Server ── */}
      {step === 'server' && (
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🖥️ Choose a Server</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Which server are you applying to join the staff team for?</div>
          </div>

          {serversLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
          ) : servers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🤖</div>
              <div style={{ fontWeight: 600 }}>No servers available</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>The bot isn't in any eligible servers right now.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {servers.map(server => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => pickServer(server)}
                  style={{
                    background: 'var(--surface2)',
                    border: '2px solid var(--border)',
                    borderRadius: 14,
                    padding: '20px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#5865f2'; e.currentTarget.style.background = 'rgba(88,101,242,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)'; }}
                >
                  {server.icon_url ? (
                    <img src={server.icon_url} alt={server.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🖥️</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>{server.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Role ── */}
      {step === 'role' && (
        <div className="card">
          {/* Server context */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            {selectedServer?.icon_url && (
              <img src={selectedServer.icon_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontWeight: 700 }}>{selectedServer?.name}</div>
              <button type="button" onClick={() => { setStep('server'); setError(''); }} style={{ background: 'none', border: 'none', color: '#5865f2', cursor: 'pointer', fontSize: 12, padding: 0, marginTop: 1 }}>
                ← Change server
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🎭 Choose a Role</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Which position are you applying for?</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ROLES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => pickRole(r.key)}
                style={{
                  background: 'var(--surface2)',
                  border: '2px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                  width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = r.color; e.currentTarget.style.background = r.color + '18'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface2)'; }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 10, background: r.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {r.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{r.desc}</div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 20, flexShrink: 0 }}>›</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 3: Form ── */}
      {step === 'form' && (
        <div className="card">
          {/* Context bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 24 }}>
            {selectedServer?.icon_url && (
              <img src={selectedServer.icon_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 13, flex: 1 }}>
              <strong>{selectedServer?.name}</strong>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>·</span>
              {roleInfo?.emoji} <strong>{roleInfo?.label || role}</strong>
            </span>
            <button type="button" onClick={() => { setStep('role'); setError(''); }} style={{ background: 'none', border: 'none', color: '#5865f2', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
              ← Change role
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {questions.length} questions — answer all of them carefully.
            </div>

            {questions.map((q, i) => (
              <div key={i} className="form-group">
                <label className="form-label">
                  <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Q{i + 1}.</span>
                  {q} *
                </label>
                {i === 0 ? (
                  <input className="form-input" type="number" min="13" max="99" placeholder="Your age" value={answers[i]} onChange={e => setAnswer(i, e.target.value)} />
                ) : i === 1 ? (
                  <select className="form-input" value={answers[i]} onChange={e => setAnswer(i, e.target.value)}>
                    <option value="">Select your timezone</option>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                ) : (
                  <textarea className="form-input" placeholder="Your answer..." value={answers[i]} onChange={e => setAnswer(i, e.target.value)} style={{ minHeight: 88, resize: 'vertical' }} />
                )}
              </div>
            ))}

            {answers.filter(a => a.trim()).length >= 4 && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {answers[0] && <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Age: </span><strong>{answers[0]}</strong></div>}
                  {answers[1] && <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Timezone: </span><strong>{answers[1]}</strong></div>}
                  {answers[2] && <div style={{ gridColumn: '1/-1', fontSize: 13, color: 'var(--text-muted)' }}><span style={{ fontWeight: 600 }}>Q3: </span>{answers[2].slice(0, 120)}{answers[2].length > 120 ? '…' : ''}</div>}
                  {answers[3] && <div style={{ gridColumn: '1/-1', fontSize: 13, color: 'var(--text-muted)' }}><span style={{ fontWeight: 600 }}>Q4: </span>{answers[3].slice(0, 120)}{answers[3].length > 120 ? '…' : ''}</div>}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  ✅ {answers.filter(a => a.trim()).length} / {questions.length} answered
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? <div className="spinner" /> : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
