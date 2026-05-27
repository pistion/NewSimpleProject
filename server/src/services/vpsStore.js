import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const rootDir = resolve(process.cwd());
const dataDir = resolve(process.env.DATA_DIR || join(rootDir, '.glondia-data'));
const storePath = join(dataDir, 'vps-services.json');

function empty() {
  return { services: [], actionLogs: [] };
}

async function ensure() {
  if (existsSync(storePath)) return;
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(empty(), null, 2));
}

export async function readStore() {
  await ensure();
  return JSON.parse(await readFile(storePath, 'utf8'));
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

export async function mutateStore(fn) {
  const store = await readStore();
  const result = fn(store);
  await writeStore(store);
  return result;
}

export function newId() {
  return randomUUID();
}

export async function logAction(store, vpsServiceId, organizationId, actorUserId, action, status, request = {}) {
  store.actionLogs = store.actionLogs || [];
  store.actionLogs.push({
    id: randomUUID(),
    vpsServiceId,
    organizationId,
    actorUserId,
    action,
    status,
    request: JSON.stringify(request),
    createdAt: new Date().toISOString(),
  });
}
