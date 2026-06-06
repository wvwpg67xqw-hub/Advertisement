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

const FALLBACK_ROLES = [
  { key: 'Moderator',       label: 'Moderator',           emoji: '🔨', desc: 'Enforce rules, handle reports, maintain order',     color: '#60a5fa' },
  { key: 'Human Resources', label: 'Human Resources',     emoji: '🤝', desc: 'Manage staff, onboarding, and team wellbeing',      color: '#34d399' },
  { key: 'Partnership',     label: 'Partnership Manager', emoji: '🌐', desc: 'Build community partnerships and grow the network', color: '#fbbf24' },
];

function PageBackground() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: -1,
      background: 'radial-gradient(ellipse at 50% -10%, #0c1e5c 0%, #040d2b 35%, #00060f 100%)',
    }} />
  );
}

export default function Apply() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const preselectedGuildId = searchParams.get('guildId') || '';
  const preselectedRole    = searchParams.get('role')    || '';

  const initialStep = preselectedGuildId
    ? (preselectedRole ? 'form' : 'role')
    : 'server';

  const [step, setStep]                     = useState(initialStep);
  const [servers, setServers]               = useState([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState(null);
  const [roles, setRoles]                   = useState(FALLBACK_ROLES);
  const [rolesLoading, setRolesLoading]     = useState(true);
  const [role, setRole]                     = useState(preselectedRole);
  const [answers, setAnswers]               = useState(Array(20).fill(''));
  const [error, setError]                   = useState('');
  const [submitting, setSubmitting]         = useState(false);

  useEffect(() => {
    fetch('/api/applications/servers')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) {
          return fetch('/api/bot/guilds')
            .then(r => r.ok ? r.json() : [])
            .then(fallback => {
              const fl = Array.isArray(fallback) ? fallback : [];
              setServers(fl);
              if (preselectedGuildId) {
                const match = fl.find(s => s.id === preselectedGuildId);
                if (match) setSelectedServer(match);
              }
            });
        }
        setServers(list);
        if (preselectedGuildId) {
          const match = list.find(s => s.guildId === preselectedGuildId || s.id === preselectedGuildId);
          if (match) setSelectedServer(match);
        }
      })
      .catch(() => {})
      .finally(() => setServersLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setRoles(data.map(r => ({
            key: r.name,
            label: r.name,
            emoji: r.emoji || '📋',
            desc: r.description || '',
            color: r.color || '#6c63ff',
          })));
        }
      })
      .catch(() => {})
      .finally(() => setRolesLoading(false));
  }, []);

  const questions = ROLE_QUESTIONS[role] || [];
  const roleInfo  = roles.find(r => r.key === role);

  function pickServer(server) { setSelectedServer(server); setStep('role'); setError(''); }
  function pickRole(r)        { setRole(r); setAnswers(Array(20).fill('')); setStep('form'); setError(''); }
  function setAnswer(i, val)  { setAnswers(prev => { const n = [...prev]; n[i] = val; return n; }); }

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
      const resolvedGuildId = selectedServer.guildId || selectedServer.id;
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, answers, guildId: resolvedGuildId }),
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

  const stepDefs  = [{ id: 'server', label: '1. Server' }, { id: 'role', label: '2. Role' }, { id: 'form', label: '3. Form' }];
  const stepIndex = stepDefs.findIndex(s => s.id === step);

  return (
    <>
      <PageBackground />
      <div style={{ minHeight: '100vh', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Breadcrumb */}
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 18, fontSize: 13 }}>
          {stepDefs.map((s, i) => {
            const done = i < stepIndex, active = i === stepIndex;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 2px' }}>›</span>}
                <span style={{ fontWeight: active || done ? 600 : 400, color: active ? '#93c5fd' : done ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
                  {done ? '✓ ' : ''}{s.label}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Step 1: Server ── */}
        {step === 'server' && (
          <div style={{ width: '100%', maxWidth: 520 }}>
            <div style={card}>
              <div style={iconCircle}>🖥️</div>
              <h2 style={cardTitle}>Select Server</h2>
              <p style={cardSubtitle}>Which server within the network are you applying for?</p>

              {serversLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <div className="spinner" style={{ borderTopColor: '#60a5fa', borderColor: 'rgba(96,165,250,0.2)' }} />
                </div>
              ) : servers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                  <div style={{ fontWeight: 600 }}>No servers available</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>The bot isn't in any eligible servers yet.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                  {servers.map(server => <ServerCard key={server.id} server={server} onClick={pickServer} />)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Role ── */}
        {step === 'role' && (
          <div style={{ width: '100%', maxWidth: 520 }}>
            <div style={card}>
              <div style={iconCircle}>🎭</div>
              <h2 style={cardTitle}>Select Role</h2>
              <p style={cardSubtitle}>
                Which position are you applying for in{' '}
                <strong style={{ color: '#93c5fd' }}>{selectedServer?.name}</strong>?
              </p>

              {rolesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <div className="spinner" style={{ borderTopColor: '#60a5fa', borderColor: 'rgba(96,165,250,0.2)' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  {roles.map(r => <RoleCard key={r.key} role={r} onClick={() => pickRole(r.key)} />)}
                </div>
              )}

              <button type="button" onClick={() => { setStep('server'); setError(''); }} style={backBtn}>
                ← Change server
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Form ── */}
        {step === 'form' && (
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div style={card}>
              {/* Context bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 10, padding: '10px 14px', width: '100%', marginBottom: 4,
              }}>
                {selectedServer?.icon_url && (
                  <img src={selectedServer.icon_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 13, flex: 1, color: 'rgba(255,255,255,0.8)' }}>
                  <strong style={{ color: '#93c5fd' }}>{selectedServer?.name}</strong>
                  <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 6px' }}>·</span>
                  {roleInfo?.emoji} <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{roleInfo?.label || role}</strong>
                </span>
                <button type="button" onClick={() => { setStep('role'); setError(''); }} style={backBtn}>
                  ← Change
                </button>
              </div>

              {/* User badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '12px 14px', width: '100%',
              }}>
                {user?.avatar && <img src={user.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{user?.username}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Applying as · {user?.userId}</div>
                </div>
                <span style={{ marginLeft: 'auto', background: 'rgba(37,99,235,0.2)', color: '#93c5fd', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  via Discord
                </span>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
                {error && (
                  <div style={{ padding: '11px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontSize: 13 }}>
                    {error}
                  </div>
                )}

                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  {questions.length} questions — answer all of them carefully.
                </p>

                {questions.map((q, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      <span style={{ color: 'rgba(147,197,253,0.7)', marginRight: 6 }}>Q{i + 1}.</span>{q} *
                    </label>
                    {i === 0 ? (
                      <input style={formInput} type="number" min="13" max="99" placeholder="Your age" value={answers[i]} onChange={e => setAnswer(i, e.target.value)} />
                    ) : i === 1 ? (
                      <select style={formInput} value={answers[i]} onChange={e => setAnswer(i, e.target.value)}>
                        <option value="">Select your timezone</option>
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    ) : (
                      <textarea style={{ ...formInput, minHeight: 88, resize: 'vertical' }} placeholder="Your answer..." value={answers[i]} onChange={e => setAnswer(i, e.target.value)} />
                    )}
                  </div>
                ))}

                {answers.filter(a => a.trim()).length >= 4 && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Preview</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {answers[0] && <div style={{ fontSize: 13 }}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Age: </span><strong style={{ color: '#fff' }}>{answers[0]}</strong></div>}
                      {answers[1] && <div style={{ fontSize: 13 }}><span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Timezone: </span><strong style={{ color: '#fff' }}>{answers[1]}</strong></div>}
                      {answers[2] && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}><strong>Q3: </strong>{answers[2].slice(0, 120)}{answers[2].length > 120 ? '…' : ''}</div>}
                      {answers[3] && <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}><strong>Q4: </strong>{answers[3].slice(0, 120)}{answers[3].length > 120 ? '…' : ''}</div>}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>✅ {answers.filter(a => a.trim()).length} / {questions.length} answered</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                  <button type="button" onClick={() => navigate('/')} style={{ padding: '12px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} style={{ flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none', background: submitting ? '#1e3a8a' : '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}>
                    {submitting ? <div className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> : 'Submit Application'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ServerCard({ server, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onClick(server)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'rgba(37,99,235,0.15)' : 'rgba(3,8,30,0.75)',
        border: `1px solid ${hover ? 'rgba(96,165,250,0.7)' : 'rgba(59,130,246,0.3)'}`,
        borderRadius: 14, padding: '22px 20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        textAlign: 'center', outline: 'none', width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {server.icon_url ? (
        <img src={server.icon_url} alt={server.name} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
      ) : (
        <div style={{ fontSize: 42 }}>🖥️</div>
      )}
      <div style={{ fontWeight: 800, fontSize: 20, color: '#fff', letterSpacing: '-0.3px' }}>{server.name}</div>
    </button>
  );
}

function RoleCard({ role, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'rgba(37,99,235,0.15)' : 'rgba(3,8,30,0.75)',
        border: `1px solid ${hover ? 'rgba(96,165,250,0.7)' : 'rgba(59,130,246,0.3)'}`,
        borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        textAlign: 'left', outline: 'none', width: '100%',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 10, background: `${role.color}22`, border: `1px solid ${role.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
        {role.emoji}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>{role.label}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{role.desc}</div>
      </div>
      <div style={{ color: 'rgba(147,197,253,0.6)', fontSize: 20, flexShrink: 0 }}>›</div>
    </button>
  );
}

const card = {
  background: 'rgba(3, 6, 24, 0.96)',
  border: '1px solid rgba(59, 130, 246, 0.3)',
  borderRadius: 20, padding: '36px 28px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%',
  boxShadow: '0 8px 48px rgba(0, 40, 160, 0.22), 0 0 0 1px rgba(60,120,255,0.05)',
};

const iconCircle = {
  width: 68, height: 68, borderRadius: '50%',
  background: '#1e40af',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 32, marginBottom: 4,
  boxShadow: '0 4px 20px rgba(37,99,235,0.5)', flexShrink: 0,
};

const cardTitle   = { fontSize: 24, fontWeight: 700, color: '#93c5fd', marginBottom: 2, textAlign: 'center' };
const cardSubtitle = { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, textAlign: 'center', marginBottom: 4 };
const backBtn     = { background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 12, opacity: 0.7, padding: 0, marginTop: 4 };
const formInput   = {
  background: 'rgba(3,8,30,0.85)', border: '1px solid rgba(59,130,246,0.3)',
  borderRadius: 8, color: '#fff', padding: '10px 14px', fontSize: 14,
  width: '100%', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
};
