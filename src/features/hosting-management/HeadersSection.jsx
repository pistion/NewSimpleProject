import React, { useEffect, useState } from 'react';
import { ICN } from '../../icons';
import { Empty } from '../../components';
import { listHostingHeaders, updateHostingHeaders } from '../../api';
import { normalizeList } from './shared';
import { Notice } from './SectionShell';

export default function HeadersSection({ deploymentId }) {
  const [headers, setHeaders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => listHostingHeaders(deploymentId)
    .then((data) => setHeaders(normalizeList(data, ['headers']).map((item) => ({ id: item.id || `${item.path}:${item.name}`, path: item.path || '/*', name: item.name || item.key || '', value: item.value || '' }))))
    .catch((error) => setErr(error.message || 'Could not load headers.'));
  useEffect(load, [deploymentId]);

  const addRow = () => setHeaders((current) => [...current, { id: `new_${Date.now()}`, path: '/*', name: '', value: '' }]);
  const updateRow = (index, field, value) => setHeaders((current) => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
  const removeRow = (index) => setHeaders((current) => current.filter((_, i) => i !== index));
  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await updateHostingHeaders(deploymentId, headers.filter((row) => row.name.trim()));
      setMsg('Headers saved.');
      load();
    } catch (error) { setErr(error.message || 'Could not save headers.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="hosting-section-head">
        <h2>Headers</h2>
        <div className="hosting-section-actions">
          <button className="btn btn-outline" onClick={addRow}><ICN.Plus size={14} /> Add header</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
      <Notice type="error">{err}</Notice>
      <Notice type="success">{msg}</Notice>
      {headers.length === 0 && <Empty icon="Code" title="No custom headers" body="Add response headers for paths on this site." />}
      <div className="hosting-card-list">
        {headers.map((row, index) => (
          <div className="hosting-edit-card hosting-edit-card--four" key={row.id || index}>
            <input className="input mono" placeholder="/*" value={row.path} onChange={(event) => updateRow(index, 'path', event.target.value)} />
            <input className="input mono" placeholder="Header-Name" value={row.name} onChange={(event) => updateRow(index, 'name', event.target.value)} />
            <input className="input mono" placeholder="value" value={row.value} onChange={(event) => updateRow(index, 'value', event.target.value)} />
            <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => removeRow(index)}><ICN.X size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
