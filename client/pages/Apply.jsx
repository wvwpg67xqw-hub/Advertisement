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

function ServerCard({ server, selected, onClick }) {
  const isSelected = selected?.id === server.id;
  return (
    <button
      type="button"
      onClick={() => onClick(server)}
      style={{
        background: isSelected ? 'rgba(88,101,242,0.15)' : 'var(--surface2)',
        border: `2px solid ${isSelected ? '#5865f2' : 'var(--border)'}`,
        borderRadius: 14,
        padding: '24px 20px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        transition: 'all 0.15s',
        width: '100%',
        textAlign: 'center',
        outline: 'none',
      }}
    >
      {server.icon_url ? (
        <img
          src={server.icon_url}
          alt={server.name}
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      ) : null}
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: server.icon_url ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 28,
        flexShrink: 0,
      }}>
        🖥️
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 4 }}>
          {server.short_name || server.name}
        </div>
        {server.short_name && server.short_name !== server.name && (
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {server.name}
          </div>
        )}
        {server.description && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            {server.description}
          </div>
        )}
      </div>
      {isSelected && (
        <div style={{ fontSize: 11, fontWeight: 700, color: '#5865f2', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ✓ Selected
        </div>
      )}
    </button>
  );
}

export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [applyServers, setApplyServers] = useState([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState(null);

  const [roles, setRoles] = useState([]);
  const [role, setRole] = useState(searchParams.get('role') || '');
  const [answers, setAnswers] = useState(Array(20).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const preselectedGuildId = searchParams.get('guildId') || '';

  useEffect(() => {
    fetch('/api/applications/servers')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setApplyServers(list);
        if (preselectedGuildId) {
          const match = list.find(s => s.guildId === preselectedGuildId);
          if (match) setSelectedServer(match);
        }
        setServersLoading(false);
      })
      .catch(() => setServersLoading(false));

    fetch('/api/roles')
      .then(r => r.json())
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const questions = ROLE_QUESTIONS[role] || [];
  const useServerSelection = applyServers.length > 0;

  function setAnswer(i, val) {
    setAnswers(prev => { const next = [...prev]; next[i] = val; return next; });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (useServerSelection && !selectedServer) return setError('Please select a server.');
    if (!role) return setError('Please select a role.');
    for (let i = 0; i < questions.length; i++) {
      if (!answers[i]?.trim()) return setError(`Please answer question ${i + 1}.`);
    }
    setLoading(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, answers, guildId: selectedServer?.guildId || null }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Submission failed');
      navigate('/success');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: 740 }}>
      <div className="page-header">
        <h1 className="page-title">📋 Staff Application</h1>
        <p className="page-subtitle">Take your time and answer thoughtfully — quality answers improve your chances.</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        {user?.avatar && <img src={user.avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />}
        <div>
          <div style={{ fontWeight: 600 }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Applying as · ID {user?.userId}</div>
        </div>
        <span style={{ marginLeft: 'auto', background: 'rgba(88,101,242,0.15)', color: '#7289da', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>via Discord</span>
      </div>

      {/* ── Server Selection ── */}
      {useServerSelection && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🖥️ Select Server</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Which server within the network are you applying for?</div>
          </div>

          {serversLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}>
              {applyServers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  selected={selectedServer}
                  onClick={s => { setSelectedServer(s); setError(''); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Application Form ── */}
      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Role Applying For *</label>
            <select className="form-input" value={role} onChange={e => { setRole(e.target.value); setAnswers(Array(20).fill('')); }}>
              <option value="">Select a role to see questions</option>
              {roles.map(r => <option key={r.id} value={r.name}>{r.emoji} {r.name}</option>)}
            </select>
          </div>

          {role && questions.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)' }} />

              {selectedServer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(88,101,242,0.1)', border: '1px solid rgba(88,101,242,0.3)', borderRadius: 8, padding: '10px 14px' }}>
                  {selectedServer.icon_url && <img src={selectedServer.icon_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                  <div style={{ fontSize: 13 }}>
                    Applying to <strong>{selectedServer.name}</strong>
                    <button type="button" onClick={() => setSelectedServer(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>Change</button>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                {questions.length} questions for <strong>{role}</strong> — answer all of them.
              </div>

              {questions.map((q, i) => (
                <div key={i} className="form-group">
                  <label className="form-label">
                    <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Q{i + 1}.</span>
                    {q} *
                  </label>

                  {i === 0 ? (
                    <input
                      className="form-input"
                      type="number"
                      min="13"
                      max="99"
                      placeholder="Your age"
                      value={answers[i]}
                      onChange={e => setAnswer(i, e.target.value)}
                    />
                  ) : i === 1 ? (
                    <select className="form-input" value={answers[i]} onChange={e => setAnswer(i, e.target.value)}>
                      <option value="">Select your timezone</option>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  ) : (
                    <textarea
                      className="form-input"
                      placeholder="Your answer..."
                      value={answers[i]}
                      onChange={e => setAnswer(i, e.target.value)}
                      style={{ minHeight: 90, resize: 'vertical' }}
                    />
                  )}
                </div>
              ))}

              {answers.filter(a => a.trim()).length >= 4 && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Preview</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {answers[0] && <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Age: </span><strong>{answers[0]}</strong></div>}
                    {answers[1] && <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Timezone: </span><strong>{answers[1]}</strong></div>}
                    {answers[2] && <div style={{ gridColumn: '1/-1', fontSize: 13, color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600 }}>Q3: </span>{answers[2].slice(0, 120)}{answers[2].length > 120 ? '…' : ''}
                    </div>}
                    {answers[3] && <div style={{ gridColumn: '1/-1', fontSize: 13, color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600 }}>Q4: </span>{answers[3].slice(0, 120)}{answers[3].length > 120 ? '…' : ''}
                    </div>}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    ✅ {answers.filter(a => a.trim()).length} / {questions.length} questions answered
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
                  {loading ? <div className="spinner" /> : 'Submit Application'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
