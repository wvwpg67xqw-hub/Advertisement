import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const timezones = ['UTC-12','UTC-11','UTC-10','UTC-9','UTC-8 (PST)','UTC-7 (MST)','UTC-6 (CST)','UTC-5 (EST)','UTC-4','UTC-3','UTC-2','UTC-1','UTC+0 (GMT)','UTC+1 (CET)','UTC+2 (EET)','UTC+3','UTC+4','UTC+5','UTC+5:30 (IST)','UTC+6','UTC+7','UTC+8 (CST)','UTC+9 (JST)','UTC+10 (AEST)','UTC+11','UTC+12'];

export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roles, setRoles] = useState([]);

  const [form, setForm] = useState({
    role: searchParams.get('role') || '',
    age: '', timezone: '', experience: '', motivation: '', availability: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.json())
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const required = ['role', 'age', 'timezone', 'experience', 'motivation', 'availability'];
    for (const field of required) {
      if (!form[field]?.trim()) return setError('Please fill in all fields.');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
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

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="page-container" style={{ maxWidth: 700 }}>
      <div className="page-header">
        <h1 className="page-title">📋 Staff Application</h1>
        <p className="page-subtitle">Take your time and answer thoughtfully — quality answers improve your chances.</p>
      </div>

      {/* Identity banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        {user?.avatar && <img src={user.avatar} alt="" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />}
        <div>
          <div style={{ fontWeight: 600 }}>{user?.username}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Applying as · ID {user?.userId}</div>
        </div>
        <span style={{ marginLeft: 'auto', background: 'rgba(88,101,242,0.15)', color: '#7289da', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>via Discord</span>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div className="alert alert-error">{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Role Applying For *</label>
              <select className="form-input" value={form.role} onChange={set('role')}>
                <option value="">Select a role</option>
                {roles.map(r => <option key={r.id} value={r.name}>{r.emoji} {r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Age *</label>
              <input className="form-input" type="number" min="13" max="99" placeholder="Your age" value={form.age} onChange={set('age')} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Timezone *</label>
            <select className="form-input" value={form.timezone} onChange={set('timezone')}>
              <option value="">Select your timezone</option>
              {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Previous Experience *</label>
            <textarea className="form-input" placeholder="Describe any relevant previous experience." value={form.experience} onChange={set('experience')} style={{ minHeight: 100 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Why Do You Want This Role? *</label>
            <textarea className="form-input" placeholder="Tell us your motivation for applying and what you'd bring to the team." value={form.motivation} onChange={set('motivation')} style={{ minHeight: 120 }} />
          </div>

          <div className="form-group">
            <label className="form-label">Weekly Availability *</label>
            <input className="form-input" placeholder="e.g. 15–20 hours/week, weekdays evenings and weekends" value={form.availability} onChange={set('availability')} />
          </div>

          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? <div className="spinner" /> : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
