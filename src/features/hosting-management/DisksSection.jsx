import React, { useEffect, useState } from 'react';
import { StatusBadge } from '../../components';
import { attachHostingDisk, deleteHostingDisk, listHostingDisks, updateHostingDisk } from '../../api';
import { Notice } from './SectionShell';

export default function DisksSection({ app, deploymentId }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', mountPath: '/var/glondia/data', sizeGB: 1 });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => listHostingDisks(deploymentId).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch((error) => { setMsg(error.message || 'Could not load disks.'); setItems([]); });
  useEffect(load, [deploymentId]);

  const add = async () => {
    setBusy('add'); setMsg('');
    try {
      await attachHostingDisk(deploymentId, form);
      setForm({ name: '', mountPath: '/var/glondia/data', sizeGB: 1 });
      setMsg('Disk attached.');
      load();
    } catch (error) { setMsg(error.message || 'Could not attach disk.'); }
    finally { setBusy(''); }
  };

  const sync = async (disk) => {
    setBusy(disk.diskId); setMsg('');
    try { await updateHostingDisk(deploymentId, disk.diskId, disk); setMsg('Disk synced.'); load(); }
    catch (error) { setMsg(error.message || 'Could not sync disk.'); }
    finally { setBusy(''); }
  };

  const remove = async (disk) => {
    if (!window.confirm(`Delete disk ${disk.name}?`)) return;
    setBusy(disk.diskId); setMsg('');
    try { await deleteHostingDisk(deploymentId, disk.diskId); setMsg('Disk deleted.'); load(); }
    catch (error) { setMsg(error.message || 'Could not delete disk.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Persistent SSD disks</h2>
      {app.serviceType !== 'web_service' && <p className="muted">Disks are only available for web services.</p>}
      <div className="hosting-form-row">
        <input className="input" placeholder="disk name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        <input className="input mono" placeholder="/var/glondia/data" value={form.mountPath} onChange={(event) => setForm((current) => ({ ...current, mountPath: event.target.value }))} />
        <input className="input mono" type="number" min="1" value={form.sizeGB} onChange={(event) => setForm((current) => ({ ...current, sizeGB: Number(event.target.value) || 1 }))} />
        <button className="btn btn-primary" disabled={app.serviceType !== 'web_service' || busy === 'add'} onClick={add}>{busy === 'add' ? 'Attaching...' : 'Attach'}</button>
      </div>
      <Notice>{msg}</Notice>
      <div className="hosting-card-list">
        {items.map((disk) => (
          <div className="hosting-row-card" key={disk.diskId}>
            <span>{disk.name}</span>
            <span className="mono muted">{disk.mountPath} - {disk.sizeGB}GB</span>
            <StatusBadge value={disk.status || 'attached'} />
            <button className="btn btn-sm btn-outline" disabled={busy === disk.diskId} onClick={() => sync(disk)}>Sync</button>
            <button className="btn btn-sm btn-outline" disabled={busy === disk.diskId} onClick={() => remove(disk)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
