import React, { useEffect, useState } from 'react';
import { addHostingDomain, deleteHostingDomain, listHostingDomains, verifyHostingDomain } from '../../api';
import { Notice } from './SectionShell';

export default function DomainsSection({ deploymentId }) {
  const [items, setItems] = useState([]);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => listHostingDomains(deploymentId).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch((error) => setMsg(error.message || 'Could not load domains.'));
  useEffect(load, [deploymentId]);

  const add = async () => {
    if (!domain.trim()) return;
    setBusy('add'); setMsg('');
    try { await addHostingDomain(deploymentId, { domain }); setDomain(''); setMsg('Domain added.'); load(); }
    catch (error) { setMsg(error.message || 'Could not add domain.'); }
    finally { setBusy(''); }
  };

  const verify = async (item) => {
    setBusy(item.domainId); setMsg('');
    try { await verifyHostingDomain(deploymentId, item.domainId); setMsg('Domain verification refreshed.'); load(); }
    catch (error) { setMsg(error.message || 'Could not verify domain.'); }
    finally { setBusy(''); }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.name || item.domain}?`)) return;
    setBusy(item.domainId); setMsg('');
    try { await deleteHostingDomain(deploymentId, item.domainId); setMsg('Domain removed.'); load(); }
    catch (error) { setMsg(error.message || 'Could not remove domain.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Custom domains</h2>
      <div className="hosting-form-row">
        <input className="input mono" placeholder="example.com" value={domain} onChange={(event) => setDomain(event.target.value)} />
        <button className="btn btn-primary" disabled={busy === 'add'} onClick={add}>{busy === 'add' ? 'Adding...' : 'Add domain'}</button>
      </div>
      <Notice>{msg}</Notice>
      <div className="hosting-card-list">
        {items.map((item) => (
          <div className="hosting-row-card" key={item.domainId}>
            <span className="mono">{item.name || item.domain}</span>
            <span className="muted">{item.status || item.verificationStatus || 'pending'}</span>
            <button className="btn btn-sm btn-outline" disabled={busy === item.domainId} onClick={() => verify(item)}>Verify</button>
            <button className="btn btn-sm btn-outline" disabled={busy === item.domainId} onClick={() => remove(item)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
