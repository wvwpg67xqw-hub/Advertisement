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

// ── Applications ──────────────────────────────────────────────

function ApplicationsTab() {
  const [apps, setApps] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [actioning, setActioning] = useState(null);
  const [acceptModal, setAcceptModal] = useState(null);
  const [guildRoles, setGuildRoles] = useState([]);
  const [guildRolesLoading, setGuildRolesLoading] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api(`/api/admin/applications?status=${filter}`);
    setApps(await res.json().catch(() => []));
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function openAcceptModal(app) {
    setSelected(null);
    setSelectedRoleIds(new Set());
    setAcceptModal(app);
    setGuildRolesLoading(true);
    const guildId = app.guildId || '';
    const url = guildId ? `/api/admin/guild-roles?guildId=${guildId}` : '/api/admin/guild-roles';
    const res = await api(url);
    setGuildRoles(await res.json().catch(() => []));
    setGuildRolesLoading(false);
  }

  function toggleRole(id) {
    setSelectedRoleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function action(id, type, roleIds = []) {
    setActioning(id);
    await api(`/api/admin/applications/${id}/${type}`, {
      method: 'POST',
      body: type === 'accept' ? JSON.stringify({ roleIds }) : undefined,
    });
    setActioning(null);
    setSelected(null);
    setAcceptModal(null);
    load();
  }

  const fmt = ts => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const [testRole, setTestRole] = useState('');
  const [testRoles, setTestRoles] = useState([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetch('/api/roles').then(r => r.json()).then(d => setTestRoles(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function sendTestApp(e) {
    e.preventDefault();
    if (!testRole) return setTestResult({ error: 'Select a role first.' });
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await api('/api/admin/test-application', { method: 'POST', body: JSON.stringify({ role: testRole }) });
      const data = await res.json();
      if (!res.ok) setTestResult({ error: data.error || 'Failed' });
      else { setTestResult({ success: data.message }); load(); }
    } catch { setTestResult({ error: 'Network error.' }); }
    setTestLoading(false);
  }

  return (
    <div>
      {/* Test Application Panel */}
      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>🧪 Test Application</div>
        <form onSubmit={sendTestApp} style={{ display: 'flex', gap: 10, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-input" style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13 }} value={testRole} onChange={e => { setTestRole(e.target.value); setTestResult(null); }}>
            <option value="">Pick a role…</option>
            {testRoles.map(r => <option key={r.id} value={r.name}>{r.emoji} {r.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" type="submit" disabled={testLoading} style={{ flexShrink: 0 }}>
            {testLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Send Test'}
          </button>
        </form>
        {testResult && (
          testResult.error
            ? <div style={{ color: 'var(--danger)', fontSize: 13, width: '100%' }}>❌ {testResult.error}</div>
            : <div style={{ color: 'var(--success)', fontSize: 13, width: '100%' }}>✅ {testResult.success}</div>
        )}
      </div>

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
        <div className="empty-state"><div className="empty-state-icon">📭</div><div style={{ fontWeight: 600 }}>No {filter} applications</div></div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>Applicant</th><th>Role</th><th>Age</th><th>Timezone</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {app.avatar && <img src={app.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                      <div>
                        <div style={{ fontWeight: 500 }}>{app.username}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{app.userId}</div>
                      </div>
                    </div>
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
                          <button className="btn btn-success btn-sm" disabled={actioning === app.id} onClick={() => openAcceptModal(app)}>{actioning === app.id ? '...' : '✓'}</button>
                          <button className="btn btn-danger btn-sm" disabled={actioning === app.id} onClick={() => action(app.id, 'deny')}>{actioning === app.id ? '...' : '✕'}</button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>
            {/* Meta row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[['Role', selected.role], ['Age', selected.age || '—'], ['Timezone', selected.timezone || '—']].map(([l, v]) => (
                <div key={l} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`badge badge-${selected.status}`}>{selected.status}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Application #{selected.id}</span>
              {selected.discord_thread_id && (
                <span style={{ fontSize: 12, color: '#7289da' }}>🧵 Has Discord thread</span>
              )}
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Q&A answers */}
            {Array.isArray(selected.answers) && selected.answers.length > 0 ? (
              selected.answers.map((ans, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>
                    Q{i + 1}
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.7 }}>{ans || '—'}</div>
                </div>
              ))
            ) : (
              /* Legacy applications without structured answers */
              <>
                {selected.experience && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Experience</div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.7 }}>{selected.experience}</div>
                  </div>
                )}
                {selected.motivation && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Motivation</div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.7 }}>{selected.motivation}</div>
                  </div>
                )}
                {selected.availability && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>Availability</div>
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.7 }}>{selected.availability}</div>
                  </div>
                )}
              </>
            )}
          </div>
          {selected.status === 'pending' && (
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => action(selected.id, 'deny')}>Deny</button>
              <button className="btn btn-success" onClick={() => openAcceptModal(selected)}>Accept</button>
            </div>
          )}
        </Modal>
      )}

      {acceptModal && (
        <Modal title={`Accept — ${acceptModal.username}`} onClose={() => setAcceptModal(null)}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            Choose the Discord roles to assign to <strong style={{ color: '#fff' }}>{acceptModal.username}</strong> upon acceptance. The Staff role is always added automatically.
          </p>
          {guildRolesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : guildRoles.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No roles found (bot may be offline). You can still accept without assigning roles.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto', margin: '12px 0' }}>
              {guildRoles.map(r => (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 8,
                  background: selectedRoleIds.has(r.id) ? 'rgba(37,99,235,0.15)' : 'var(--surface2)',
                  border: `1px solid ${selectedRoleIds.has(r.id) ? 'rgba(96,165,250,0.5)' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.has(r.id)}
                    onChange={() => toggleRole(r.id)}
                    style={{ accentColor: '#3b82f6', width: 15, height: 15, flexShrink: 0 }}
                  />
                  {r.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {selectedRoleIds.size} role{selectedRoleIds.size !== 1 ? 's' : ''} selected
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setAcceptModal(null)}>Cancel</button>
            <button
              className="btn btn-success"
              disabled={actioning === acceptModal.id}
              onClick={() => action(acceptModal.id, 'accept', [...selectedRoleIds])}
            >
              {actioning === acceptModal.id
                ? <div className="spinner" style={{ width: 14, height: 14 }} />
                : `Accept & Assign ${selectedRoleIds.size > 0 ? `${selectedRoleIds.size} Role${selectedRoleIds.size !== 1 ? 's' : ''}` : 'No Extra Roles'}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Roles ─────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', emoji: '📋', color: '#6c63ff' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api('/api/admin/roles');
    setRoles(await res.json().catch(() => []));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  function openAdd() { setForm({ name: '', description: '', emoji: '📋', color: '#6c63ff' }); setErr(''); setEditing(null); setShowAdd(true); }
  function openEdit(role) { setForm({ name: role.name, description: role.description, emoji: role.emoji, color: role.color }); setErr(''); setEditing(role); setShowAdd(true); }

  async function handleSave(e) {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) return setErr('Name is required');
    setSaving(true);
    const res = editing
      ? await api(`/api/admin/roles/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) })
      : await api('/api/admin/roles', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setSaving(false); return; }
    setShowAdd(false);
    load();
    setSaving(false);
  }

  async function handleToggle(role) {
    await api(`/api/admin/roles/${role.id}/toggle`, { method: 'PATCH' });
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this role? Existing applications using it are unaffected.')) return;
    await api(`/api/admin/roles/${id}`, { method: 'DELETE' });
    load();
  }

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Control which staff positions appear on the application page.</p>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New Role</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {roles.map(role => (
            <div key={role.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
              opacity: role.active ? 1 : 0.5,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: role.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {role.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {role.name}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, display: 'inline-block' }} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {role.description || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: role.active ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {role.active ? 'Active' : 'Hidden'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(role)}>
                  {role.active ? 'Hide' : 'Show'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(role)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(role.id)}>Delete</button>
              </div>
            </div>
          ))}
          {roles.length === 0 && (
            <div className="empty-state"><div className="empty-state-icon">📋</div><div style={{ fontWeight: 600 }}>No roles yet</div></div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title={editing ? 'Edit Role' : 'New Role'} onClose={() => setShowAdd(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div className="alert alert-error">{err}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Role Name *</label>
                <input className="form-input" placeholder="e.g. Moderator" value={form.name} onChange={set('name')} />
              </div>
              <div className="form-group">
                <label className="form-label">Emoji</label>
                <input className="form-input" placeholder="📋" maxLength={4} value={form.emoji} onChange={set('emoji')} />
              </div>
              <div className="form-group">
                <label className="form-label">Colour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.color} onChange={set('color')} style={{ width: 44, height: 38, padding: 2, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer' }} />
                  <input className="form-input" value={form.color} onChange={set('color')} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Description</label>
                <textarea className="form-input" placeholder="What does this role do?" value={form.description} onChange={set('description')} style={{ minHeight: 80 }} />
              </div>
            </div>
            {/* Preview */}
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{form.emoji || '📋'}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{form.name || 'Role Name'}</div>
                <div style={{ fontSize: 11, color: form.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Open Applications</div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...' : editing ? 'Save Changes' : 'Create Role'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Apply Servers ─────────────────────────────────────────────

function ServersTab() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ guildId: '', name: '', short_name: '', description: '', icon_url: '', log_channel_id: '', apply_channel_id: '' });
  const [postingMsg, setPostingMsg] = useState(null);
  const [postResult, setPostResult] = useState({});
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [clientId, setClientId] = useState('');

  const load = async () => {
    setLoading(true);
    const [serversRes, clientRes] = await Promise.all([
      api('/api/admin/apply-servers'),
      api('/api/admin/bot-client-id'),
    ]);
    setServers(await serversRes.json().catch(() => []));
    const clientData = await clientRes.json().catch(() => ({}));
    setClientId(clientData.clientId || '');
    setLoading(false);
  };

  const botInviteUrl = (guildId) => clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=8&guild_id=${guildId}&disable_guild_select=true`
    : null;

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ guildId: '', name: '', short_name: '', description: '', icon_url: '', log_channel_id: '', apply_channel_id: '' });
    setErr(''); setEditing(null); setShowAdd(true);
  }

  async function postApplyMessage(server) {
    setPostingMsg(server.id);
    setPostResult(p => ({ ...p, [server.id]: null }));
    try {
      const res = await api(`/api/admin/apply-servers/${server.id}/post-apply-message`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setPostResult(p => ({ ...p, [server.id]: { error: data.error || 'Failed' } }));
      else setPostResult(p => ({ ...p, [server.id]: { success: true } }));
    } catch {
      setPostResult(p => ({ ...p, [server.id]: { error: 'Network error' } }));
    }
    setPostingMsg(null);
  }

  function openEdit(server) {
    setForm({
      guildId: server.guildId,
      name: server.name,
      short_name: server.short_name || '',
      description: server.description || '',
      icon_url: server.icon_url || '',
      log_channel_id: server.log_channel_id || '',
      apply_channel_id: server.apply_channel_id || '',
    });
    setErr(''); setEditing(server); setShowAdd(true);
  }

  async function fetchGuildInfo() {
    if (!form.guildId.trim()) return setErr('Enter a Guild ID first');
    setFetching(true); setErr('');
    try {
      const res = await api(`/api/admin/apply-servers/guild-info/${form.guildId.trim()}`);
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Failed to fetch guild info'); }
      else {
        setForm(f => ({
          ...f,
          name: data.name || f.name,
          short_name: f.short_name || '',
          icon_url: data.icon_url || f.icon_url,
        }));
      }
    } catch { setErr('Network error'); }
    setFetching(false);
  }

  async function handleSave(e) {
    e.preventDefault(); setErr('');
    if (!form.name.trim()) return setErr('Server name is required');
    if (!editing && !form.guildId.trim()) return setErr('Guild ID is required');
    setSaving(true);
    const payload = {
      name: form.name, short_name: form.short_name, description: form.description,
      icon_url: form.icon_url, log_channel_id: form.log_channel_id,
      apply_channel_id: form.apply_channel_id,
      ...(!editing && { guildId: form.guildId }),
    };
    const res = editing
      ? await api(`/api/admin/apply-servers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/admin/apply-servers', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || 'Failed to save'); setSaving(false); return; }
    setShowAdd(false); load(); setSaving(false);
  }

  async function handleToggle(server) {
    await api(`/api/admin/apply-servers/${server.id}/toggle`, { method: 'PATCH' });
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Remove this server from the apply list?')) return;
    await api(`/api/admin/apply-servers/${id}`, { method: 'DELETE' });
    load();
  }

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          These servers appear as cards on the Apply page. Each can route applications to its own Discord log channel.
        </p>
        <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ flexShrink: 0, marginLeft: 16 }}>+ Add Server</button>
      </div>

      <div style={{ background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        💡 If no servers are added, the apply page skips server selection and goes straight to the form.
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {servers.map(server => (
            <React.Fragment key={server.id}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '14px 16px',
              opacity: server.active ? 1 : 0.5,
            }}>
              {server.icon_url ? (
                <img src={server.icon_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🖥️</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {server.name}
                  {server.short_name && server.short_name !== server.name && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({server.short_name})</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ fontFamily: 'monospace' }}>{server.guildId}</span>
                  {server.log_channel_id && <span>📢 Custom channel</span>}
                  {server.description && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{server.description}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: server.active ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {server.active ? 'Active' : 'Hidden'}
                </span>
                {botInviteUrl(server.guildId) && (
                  <a
                    href={botInviteUrl(server.guildId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    title="Add the bot to this server"
                  >
                    🤖 Add Bot
                  </a>
                )}
                {server.apply_channel_id && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={postingMsg === server.id}
                    onClick={() => postApplyMessage(server)}
                    title="Post the apply message with role buttons to the configured apply channel"
                  >
                    {postingMsg === server.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : '📤 Post Apply Message'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(server)}>
                  {server.active ? 'Hide' : 'Show'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(server)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(server.id)}>Remove</button>
              </div>
            </div>
            {postResult[server.id] && (
              <div style={{ paddingLeft: 58, paddingBottom: 6 }}>
                {postResult[server.id].error
                  ? <span style={{ fontSize: 12, color: 'var(--danger)' }}>❌ {postResult[server.id].error}</span>
                  : <span style={{ fontSize: 12, color: 'var(--success)' }}>✅ Apply message posted to Discord!</span>
                }
              </div>
            )}
            </React.Fragment>
          ))}
          {servers.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🖥️</div>
              <div style={{ fontWeight: 600 }}>No servers added yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Add a server to enable per-server selection on the apply page.</div>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title={editing ? 'Edit Server' : 'Add Server'} onClose={() => setShowAdd(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div className="alert alert-error">{err}</div>}

            {!editing && (
              <div className="form-group">
                <label className="form-label">Discord Guild ID *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    placeholder="e.g. 1234567890123456789"
                    value={form.guildId}
                    onChange={set('guildId')}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={fetchGuildInfo}
                    disabled={fetching}
                    style={{ flexShrink: 0 }}
                  >
                    {fetching ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '🔍 Auto-fill'}
                  </button>
                  {botInviteUrl(form.guildId.trim()) && form.guildId.trim() && (
                    <a
                      href={botInviteUrl(form.guildId.trim())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      title="Add the bot to this server"
                      style={{ flexShrink: 0 }}
                    >
                      🤖 Add Bot
                    </a>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Add the bot first, then Auto-fill to pull the server name &amp; icon.
                </span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Full Server Name *</label>
                <input className="form-input" placeholder="e.g. Advertising Kingdom" value={form.name} onChange={set('name')} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Short Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(shown bold on card)</span></label>
                <input className="form-input" placeholder="e.g. AK" maxLength={30} value={form.short_name} onChange={set('short_name')} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="form-input" placeholder="Short description shown on the card" value={form.description} onChange={set('description')} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Icon URL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(auto-filled or paste custom)</span></label>
                <input className="form-input" placeholder="https://cdn.discordapp.com/..." value={form.icon_url} onChange={set('icon_url')} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Application Log Channel ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — overrides default)</span></label>
                <input className="form-input" placeholder="Leave blank to use default channel" value={form.log_channel_id} onChange={set('log_channel_id')} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Submitted applications for this server will post here for admin review.</span>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Apply Channel ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="form-input" placeholder="Channel where members click to apply" value={form.apply_channel_id} onChange={set('apply_channel_id')} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Once set, use the <strong>📤 Post Apply Message</strong> button to send an embed with Mod / HR / Partnership buttons to this channel.</span>
              </div>
            </div>

            {/* Preview */}
            {(form.name || form.icon_url) && (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', alignSelf: 'flex-start' }}>Card Preview</div>
                {form.icon_url ? (
                  <img src={form.icon_url} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🖥️</div>
                )}
                <div style={{ fontWeight: 700, fontSize: 16 }}>{form.short_name || form.name || 'Server Name'}</div>
                {form.short_name && form.short_name !== form.name && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{form.name}</div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...' : editing ? 'Save Changes' : 'Add Server'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Channels ──────────────────────────────────────────────────

function ChannelsTab() {
  const [channelId, setChannelId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(null);

  async function handleAction(action) {
    const id = channelId.trim();
    if (!id) return setResult({ error: 'Please enter a channel ID.' });
    setResult(null);
    setLoading(action);
    try {
      const res = await api(`/api/admin/channels/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setResult({ error: data.error || 'Something went wrong.' });
      else setResult({ success: true, action, channelId: id });
    } catch {
      setResult({ error: 'Network error. Check that the server is running.' });
    }
    setLoading(null);
  }

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
        Lock a channel to prevent anyone from sending messages, or unlock it to restore normal access.<br />
        Requires <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>TOKEN</code> and <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>DISCORD_GUILD_ID</code> to be set, and the bot must have <strong>Manage Channels</strong> permission.
      </p>

      <div className="card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="form-group">
            <label className="form-label">Channel ID</label>
            <input
              className="form-input"
              placeholder="e.g. 1234567890123456789"
              value={channelId}
              onChange={e => { setChannelId(e.target.value); setResult(null); }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Right-click a channel in Discord (Developer Mode on) → Copy Channel ID
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              className="btn btn-danger"
              disabled={!!loading}
              onClick={() => handleAction('lock')}
            >
              {loading === 'lock' ? <div className="spinner" /> : '🔒 Lock Channel'}
            </button>
            <button
              className="btn btn-success"
              disabled={!!loading}
              onClick={() => handleAction('unlock')}
            >
              {loading === 'unlock' ? <div className="spinner" /> : '🔓 Unlock Channel'}
            </button>
          </div>

          {result && (
            result.error ? (
              <div className="alert alert-error">{result.error}</div>
            ) : (
              <div className="alert alert-success">
                {result.action === 'lock'
                  ? `✅ Channel ${result.channelId} has been locked.`
                  : `✅ Channel ${result.channelId} has been unlocked.`}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Blacklist ─────────────────────────────────────────────────

function BlacklistTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '', username: '', reason: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const res = await api('/api/admin/blacklist'); setList(await res.json().catch(() => [])); setLoading(false); };
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault(); setErr('');
    if (!form.userId || !form.username || !form.reason) return setErr('All fields are required');
    setSaving(true);
    const res = await api('/api/admin/blacklist', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setSaving(false); return; }
    setShowAdd(false); setForm({ userId: '', username: '', reason: '' }); load(); setSaving(false);
  }

  async function handleRemove(id) {
    if (!confirm('Remove this blacklist entry?')) return;
    await api(`/api/admin/blacklist/${id}`, { method: 'DELETE' }); load();
  }

  const fmt = ts => new Date(ts * 1000).toLocaleDateString();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{list.length} entr{list.length !== 1 ? 'ies' : 'y'}</span>
        <button className="btn btn-danger btn-sm" onClick={() => setShowAdd(true)}>+ Add to Blacklist</button>
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        : list.length === 0 ? <div className="empty-state"><div className="empty-state-icon">✅</div><div style={{ fontWeight: 600 }}>Blacklist is empty</div></div>
        : (
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
            <div className="form-group"><label className="form-label">Discord Username</label><input className="form-input" placeholder="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">User ID</label><input className="form-input" placeholder="123456789012345678" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Reason</label><textarea className="form-input" placeholder="Reason for blacklist..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
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

// ── Bots ──────────────────────────────────────────────────────

const PERM_PRESETS = [
  { label: 'Administrator (recommended)', value: '8' },
  { label: 'Moderate Members + Send Messages', value: '1099511693312' },
  { label: 'Read Only', value: '68608' },
  { label: 'Custom…', value: 'custom' },
];

function buildOAuthUrl(clientId, permissions) {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
}

function BotsTab() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editBot, setEditBot] = useState(null);
  const [form, setForm] = useState({ name: '', clientId: '', description: '', permissions: '8', customPerms: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await api('/api/admin/bots');
    setBots(await res.json().catch(() => []));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm({ name: '', clientId: '', description: '', permissions: '8', customPerms: '' });
    setErr('');
    setEditBot(null);
    setShowAdd(true);
  }

  function openEdit(bot) {
    const isPreset = PERM_PRESETS.slice(0, -1).some(p => p.value === bot.permissions);
    setForm({
      name: bot.name,
      clientId: bot.clientId,
      description: bot.description,
      permissions: isPreset ? bot.permissions : 'custom',
      customPerms: isPreset ? '' : bot.permissions,
    });
    setErr('');
    setEditBot(bot);
    setShowAdd(true);
  }

  function resolvedPerms(f) {
    return f.permissions === 'custom' ? f.customPerms : f.permissions;
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr('');
    const perms = resolvedPerms(form);
    if (!form.name.trim()) return setErr('Name is required.');
    if (!editBot && !form.clientId.trim()) return setErr('Client ID is required.');
    if (form.permissions === 'custom' && !/^\d+$/.test(perms)) return setErr('Custom permissions must be a number.');
    setSaving(true);
    let res;
    if (editBot) {
      res = await api(`/api/admin/bots/${editBot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: form.name, description: form.description, permissions: perms }),
      });
    } else {
      res = await api('/api/admin/bots', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, clientId: form.clientId, description: form.description, permissions: perms }),
      });
    }
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setErr(data.error || 'Failed to save.');
    setShowAdd(false);
    load();
  }

  async function handleRemove(id) {
    if (!confirm('Remove this bot from the panel?')) return;
    setRemoving(id);
    await api(`/api/admin/bots/${id}`, { method: 'DELETE' });
    setRemoving(null);
    load();
  }

  return (
    <div>
      {/* ── Our Bots section header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}>🤖 Our Bots</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        {!loading && (
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 999, padding: '1px 8px',
          }}>{bots.length}</span>
        )}
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Bot</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : bots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div style={{ fontWeight: 600 }}>No bots added yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Click "+ Add Bot" to register your first bot.</div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gap: 16 }}>
          {bots.map(bot => (
            <div key={bot.id} style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}>
              {/* Bot avatar placeholder */}
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, flexShrink: 0,
              }}>🤖</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{bot.name}</div>
                {bot.description && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 6 }}>{bot.description}</div>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 12,
                    background: 'var(--surface)', padding: '2px 8px',
                    borderRadius: 6, color: 'var(--text-muted)', border: '1px solid var(--border)',
                  }}>
                    ID: {bot.clientId}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                    background: 'rgba(108,99,255,0.15)', color: 'var(--accent)',
                    padding: '2px 8px', borderRadius: 999,
                  }}>
                    Perms: {bot.permissions === '8' ? 'Admin' : bot.permissions}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <a
                  href={buildOAuthUrl(bot.clientId, bot.permissions)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  ➕ Add to Server
                </a>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(bot)}>✏️ Edit</button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={removing === bot.id}
                  onClick={() => handleRemove(bot.id)}
                >
                  {removing === bot.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Remove'}
                </button>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {showAdd && (
        <Modal title={editBot ? 'Edit Bot' : 'Add Bot'} onClose={() => setShowAdd(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="form-group">
              <label className="form-label">Bot Name</label>
              <input className="form-input" placeholder="e.g. Staff Portal Bot" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            {!editBot && (
              <div className="form-group">
                <label className="form-label">Client ID</label>
                <input className="form-input" placeholder="e.g. 1508745748815282217" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Found in your Discord Developer Portal under the bot's application.
                </span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <input className="form-input" placeholder="What does this bot do?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Permissions</label>
              <select className="form-input" value={form.permissions} onChange={e => setForm(f => ({ ...f, permissions: e.target.value, customPerms: '' }))}>
                {PERM_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            {form.permissions === 'custom' && (
              <div className="form-group">
                <label className="form-label">Custom Permissions Integer</label>
                <input className="form-input" placeholder="e.g. 277025507328" value={form.customPerms} onChange={e => setForm(f => ({ ...f, customPerms: e.target.value }))} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Use the <a href="https://discordapi.com/permissions.html" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Discord Permissions Calculator</a> to get the number.
                </span>
              </div>
            )}
            {/* Preview URL */}
            {(editBot?.clientId || form.clientId) && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>OAuth2 URL Preview</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', wordBreak: 'break-all', lineHeight: 1.6 }}>
                  {buildOAuthUrl(editBot?.clientId || form.clientId, resolvedPerms(form) || '8')}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '...' : editBot ? 'Save Changes' : 'Add Bot'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Admins ────────────────────────────────────────────────────

function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ userId: '', username: '', role: 'admin' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const res = await api('/api/admin/admins'); setAdmins(await res.json().catch(() => [])); setLoading(false); };
  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault(); setErr('');
    if (!form.userId || !form.username) return setErr('User ID and username are required');
    setSaving(true);
    const res = await api('/api/admin/admins', { method: 'POST', body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error); setSaving(false); return; }
    setShowAdd(false); setForm({ userId: '', username: '', role: 'admin' }); load(); setSaving(false);
  }

  async function handleRemove(id) {
    if (!confirm('Remove this admin?')) return;
    await api(`/api/admin/admins/${id}`, { method: 'DELETE' }); load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{admins.length} admin{admins.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add Admin</button>
      </div>
      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        : admins.length === 0 ? <div className="empty-state"><div className="empty-state-icon">👥</div><div style={{ fontWeight: 600 }}>No admins found</div></div>
        : (
          <div className="table-container">
            <table>
              <thead><tr><th>Username</th><th>User ID</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.username}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{a.userId}</td>
                    <td>
                      <span style={{ background: a.role === 'owner' ? 'rgba(245,158,11,0.15)' : 'rgba(108,99,255,0.15)', color: a.role === 'owner' ? 'var(--warning)' : 'var(--accent)', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{a.role}</span>
                    </td>
                    <td>{a.role !== 'owner' && <button className="btn btn-danger btn-sm" onClick={() => handleRemove(a.id)}>Remove</button>}</td>
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
            <div className="form-group"><label className="form-label">Discord Username</label><input className="form-input" placeholder="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">User ID</label><input className="form-input" placeholder="123456789012345678" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} /></div>
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

// ── Main Admin Page ───────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState('applications');

  const tabs = [
    { id: 'applications', label: '📋 Applications' },
    { id: 'roles',        label: '🎭 Roles' },
    { id: 'servers',      label: '🖥️ Servers' },
    { id: 'channels',     label: '🔒 Channels' },
    { id: 'blacklist',    label: '🚫 Blacklist' },
    { id: 'bots',         label: '🤖 Bots' },
    { id: 'admins',       label: '👑 Admins' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">⚙️ Admin Dashboard</h1>
        <p className="page-subtitle">Manage applications, roles, channels, blacklist, and admin access.</p>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <div className="tabs" style={{ width: 'max-content' }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'roles'        && <RolesTab />}
        {tab === 'servers'      && <ServersTab />}
        {tab === 'channels'     && <ChannelsTab />}
        {tab === 'blacklist'    && <BlacklistTab />}
        {tab === 'bots'         && <BotsTab />}
        {tab === 'admins'       && <AdminsTab />}
      </div>
    </div>
  );
}
