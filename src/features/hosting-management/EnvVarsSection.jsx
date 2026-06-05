import React, { useEffect, useState } from 'react';
import { deleteHostingEnvVar, listHostingEnvVars, syncHostingEnvVars, upsertHostingEnvVar } from '../../api';
import { Notice } from './SectionShell';

export default function EnvVarsSection({ deploymentId }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ key: '', value: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => listHostingEnvVars(deploymentId).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch((error) => setErr(error.message));
  useEffect(load, [deploymentId]);

  const add = async () => {
    if (!form.key.trim()) return;
    setBusy('add'); setMsg(''); setErr('');
    try {
      await upsertHostingEnvVar(deploymentId, form);
      setForm({ key: '', value: '' });
      setMsg('Environment variable saved.');
      load();
    } catch (error) { setErr(error.message); }
    finally { setBusy(''); }
  };

  const remove = async (key) => {
    setBusy(key); setMsg(''); setErr('');
    try {
      await deleteHostingEnvVar(deploymentId, key);
      setMsg('Environment variable deleted.');
      load();
    } catch (error) { setErr(error.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Environment variables</h2>
      <div className="hosting-form-row">
        <input className="input mono" placeholder="KEY" value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))} />
        <input className="input mono" placeholder="value" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} />
        <button className="btn btn-primary" disabled={busy === 'add'} onClick={add}>{busy === 'add' ? 'Saving...' : 'Add'}</button>
        <button className="btn btn-outline" onClick={() => syncHostingEnvVars(deploymentId).then(load)}>Sync</button>
      </div>
      <Notice type="success">{msg}</Notice>
      <Notice type="error">{err}</Notice>
      <div className="hosting-card-list">
        {items.map((item) => (
          <div className="hosting-row-card" key={item.key}>
            <span className="mono">{item.key}</span>
            <span className="mono muted">{item.valuePreview || 'hidden'}</span>
            <button className="btn btn-sm btn-outline" disabled={busy === item.key} onClick={() => remove(item.key)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
