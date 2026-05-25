import React, { useState, useEffect, useCallback } from 'react';

const api = (path, opts = {}) =>
  fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="modal-title">{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApplicationsTab() {
  const [apps, setApps] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [actioning, setActioning] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api(`/api/admin/applications?status=${filter}`);
    const data = await res.json();
    setApps(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function action(id, type) {
    setActioning(id);
    await api(`/api/admin/applications/${id}/${type}`, { method: 'POST' });
    setActioning(null);
    setSelected(null);
    load();
  }

  const fmt = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="tabs">
          {['pending', 'accepted', 'denied'].map(s => (
            <button key={s} className={`tab ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{apps.length} result{apps.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No {filter} applications</div>
          <div style={{ fontSize: 13 }}>Applications will appear here once submitted.</div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Role</th>
                <th>Age</th>
                <th>Timezone</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{app.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{app.userId}</div>
                  </td>
                  <td><span style={{ background: 'var(--surface2)', padding: '3px 8px', borderRadius: 6, fontSize: 13 }}>{app.role}</span></td>
                  <td>{app.age}</td>
                  <td style={{ fontSize: 13 }}>{app.timezone}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmt(app.createdAt)}</td>
                  <td><span className={`badge badge-${app.status}`}>{app.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelected(app)}>View</button>
                      {app.status === 'pending' && (
                        <>
                          <button className="btn btn-success btn-sm" disabled={actioning === app.id} onClick={() => action(app.id, 'accept')}>
                            {actioning === app.id ? '...' : '✓'}
                          </button>
                          <button className="btn btn-danger btn-sm" disabled={actioning === app.id} onClick={() => action(app.id, 'deny')}>
                            {actioning === app.id ? '...' : '✕'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Modal title={`Application — ${selected.username}`} onClose={() => setSelected(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Role', selected.role],
                ['Age', selected.age],
                ['Timezone', selected.timezone],
                ['Availability', selected.availability],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14 }}>{val}</div>
                </div>
              ))}
            </div>
            {[['Experience', selected.experience], ['Motivation', selected.motivation]].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{label}</div>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }}>{val}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}><span className={`badge badge-${selected.status}`}>{selected.status}</span></div>
          </div>
          {selected.status === 'pending' && (
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => action(selected.id, 'deny')}>Deny</button>
              <button className="btn btn-success" onClick={() => action(selected.id, 'accept')}>Accept</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function BlacklistTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '', username: '', reason: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api('/api/admin/blacklist');
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setErr('');
    if (!form.userId || !form.username || !form.reason) return setErr('All fields are required');
    setSaving(true);
    const res = await api('/api/admin/blacklist', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setSaving(false); return; }
    setShowAdd(false);
    setForm({ userId: '', username: '', reason: '' });
    load();
    setSaving(false);
  }

  async function handleRemove(id) {
    if (!confirm('Remove this blacklist entry?')) return;
    await api(`/api/admin/blacklist/${id}`, { method: 'DELETE' });
    load();
  }

  const fmt = (ts) => new Date(ts * 1000).toLocaleDateString();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{list.length} entr{list.length !== 1 ? 'ies' : 'y'}</span>
        <button className="btn btn-danger btn-sm" onClick={() => setShowAdd(true)}>+ Add to Blacklist</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div style={{ fontWeight: 600 }}>Blacklist is empty</div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>User</th><th>User ID</th><th>Reason</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {list.map(entry => (
                <tr key={entry.id}>
                  <td style={{ fontWeight: 500 }}>{entry.username}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{entry.userId}</td>
                  <td style={{ fontSize: 13 }}>{entry.reason}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmt(entry.createdAt)}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => handleRemove(entry.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add to Blacklist" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="form-group">
              <label className="form-label">Discord Username</label>
              <input className="form-input" placeholder="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">User ID</label>
              <input className="form-input" placeholder="123456789012345678" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-input" placeholder="Reason for blacklist..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-danger" disabled={saving}>{saving ? '...' : 'Blacklist'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '', username: '', role: 'admin' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api('/api/admin/admins');
    const data = await res.json();
    setAdmins(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setErr('');
    if (!form.userId || !form.username) return setErr('User ID and username are required');
    setSaving(true);
    const res = await api('/api/admin/admins', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setSaving(false); return; }
    setShowAdd(false);
    setForm({ userId: '', username: '', role: 'admin' });
    load();
    setSaving(false);
  }

  async function handleRemove(id) {
    if (!confirm('Remove this admin?')) return;
    await api(`/api/admin/admins/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{admins.length} admin{admins.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Admin</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : admins.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">👥</div><div style={{ fontWeight: 600 }}>No admins found</div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Username</th><th>User ID</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {admins.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.username}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{a.userId}</td>
                  <td>
                    <span style={{
                      background: a.role === 'owner' ? 'rgba(245,158,11,0.15)' : 'rgba(108,99,255,0.15)',
                      color: a.role === 'owner' ? 'var(--warning)' : 'var(--accent)',
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase'
                    }}>{a.role}</span>
                  </td>
                  <td>
                    {a.role !== 'owner' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleRemove(a.id)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="Add Admin" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="form-group">
              <label className="form-label">Discord Username</label>
              <input className="form-input" placeholder="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">User ID</label>
              <input className="form-input" placeholder="123456789012345678" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...' : 'Add Admin'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('applications');

  const tabs = [
    { id: 'applications', label: '📋 Applications' },
    { id: 'blacklist', label: '🚫 Blacklist' },
    { id: 'admins', label: '👑 Admins' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">⚙️ Admin Dashboard</h1>
        <p className="page-subtitle">Manage staff applications, blacklist, and admin access.</p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'blacklist' && <BlacklistTab />}
        {tab === 'admins' && <AdminsTab />}
      </div>
    </div>
  );
}
