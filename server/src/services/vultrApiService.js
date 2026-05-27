const VULTR_BASE = process.env.VULTR_API_BASE_URL || 'https://api.vultr.com/v2';

export function isConfigured() {
  return Boolean(process.env.VULTR_API_KEY);
}

async function vultrReq(path, init = {}) {
  const key = process.env.VULTR_API_KEY;
  if (!key) {
    const err = new Error('Vultr API key is not configured. Set VULTR_API_KEY.');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${VULTR_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (res.status === 204) return {};
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error ?? json?.message ?? `Vultr API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return json;
}

export async function listRegions() {
  const d = await vultrReq('/regions?per_page=500');
  return d.regions ?? [];
}

export async function listPlans(type) {
  const qs = type ? `?type=${encodeURIComponent(type)}&per_page=500` : '?per_page=500';
  const d = await vultrReq(`/plans${qs}`);
  return d.plans ?? [];
}

export async function listOs() {
  const d = await vultrReq('/os?per_page=500');
  return d.os ?? [];
}

export async function createSshKey(name, publicKey) {
  const d = await vultrReq('/ssh-keys', {
    method: 'POST',
    body: JSON.stringify({ name, ssh_key: publicKey }),
  });
  return d.ssh_key;
}

export async function createInstance(opts) {
  const d = await vultrReq('/instances', { method: 'POST', body: JSON.stringify(opts) });
  return d.instance;
}

export async function getInstance(instanceId) {
  const d = await vultrReq(`/instances/${encodeURIComponent(instanceId)}`);
  return d.instance;
}

export async function deleteInstance(instanceId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}`, { method: 'DELETE' });
}

export async function haltInstance(instanceId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}/halt`, { method: 'POST' });
}

export async function rebootInstance(instanceId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}/reboot`, { method: 'POST' });
}

export async function startInstance(instanceId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}/start`, { method: 'POST' });
}

export async function listInstances() {
  const d = await vultrReq('/instances?per_page=500');
  return d.instances ?? [];
}

export async function resizeInstance(instanceId, plan) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ plan }),
  });
}

export async function reinstallInstance(instanceId, osId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}/reinstall`, {
    method: 'POST',
    body: JSON.stringify(osId != null ? { os_id: osId } : {}),
  });
}

export async function listSshKeys() {
  const d = await vultrReq('/ssh-keys?per_page=500');
  return d.ssh_keys ?? [];
}

export async function deleteSshKey(keyId) {
  await vultrReq(`/ssh-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' });
}

export async function getInstanceBandwidth(instanceId) {
  const d = await vultrReq(`/instances/${encodeURIComponent(instanceId)}/bandwidth`);
  return d.bandwidth ?? {};
}

export async function listSnapshots() {
  const d = await vultrReq('/snapshots?per_page=500');
  return d.snapshots ?? [];
}

export async function createSnapshot(instanceId, description) {
  const d = await vultrReq('/snapshots', {
    method: 'POST',
    body: JSON.stringify({ instance_id: instanceId, description }),
  });
  return d.snapshot;
}

export async function deleteSnapshot(snapshotId) {
  await vultrReq(`/snapshots/${encodeURIComponent(snapshotId)}`, { method: 'DELETE' });
}

export async function restoreInstance(instanceId, snapshotId) {
  await vultrReq(`/instances/${encodeURIComponent(instanceId)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export async function getBackupSchedule(instanceId) {
  const d = await vultrReq(`/instances/${encodeURIComponent(instanceId)}/backup-schedule`);
  return d.backup_schedule ?? {};
}

export async function setBackupSchedule(instanceId, schedule) {
  const d = await vultrReq(`/instances/${encodeURIComponent(instanceId)}/backup-schedule`, {
    method: 'POST',
    body: JSON.stringify(schedule),
  });
  return d.backup_schedule ?? {};
}
