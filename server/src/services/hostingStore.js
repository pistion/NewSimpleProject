import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const fallbackDataDir = join(rootDir, '.glondia-data');
const dataDir = resolve(process.env.DATA_DIR || fallbackDataDir);
const storePath = join(dataDir, 'render-hosting.json');
const storeTmpPath = `${storePath}.tmp`;
const storeBackupPath = `${storePath}.bak`;

// ── Mutex — prevents concurrent read-modify-write corruption ───────────────
let writeLock = Promise.resolve();

export async function readHostingStore() {
  await ensureStore();
  const text = await readFile(storePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error(`[hostingStore] JSON parse failed: ${parseError.message}. Attempting recovery from backup.`);
    // Try the backup file
    if (existsSync(storeBackupPath)) {
      try {
        const backupText = await readFile(storeBackupPath, 'utf8');
        const backup = JSON.parse(backupText);
        console.log('[hostingStore] Recovered from backup file.');
        // Restore the main file from the valid backup
        await writeFile(storePath, backupText);
        return backup;
      } catch {
        console.error('[hostingStore] Backup file is also invalid.');
      }
    }
    // Last resort: return empty store and overwrite the corrupt file
    console.error('[hostingStore] Resetting to empty store. Corrupt file preserved at .json.corrupt');
    try {
      await rename(storePath, `${storePath}.corrupt`);
    } catch { /* ignore */ }
    const empty = emptyStore();
    await writeFile(storePath, JSON.stringify(empty, null, 2));
    return empty;
  }
}

/**
 * Write store atomically: write to .tmp then rename over the real file.
 * This prevents partial-write corruption if the process is killed mid-write.
 */
export async function writeHostingStore(store) {
  await mkdir(dirname(storePath), { recursive: true });
  const json = JSON.stringify(store, null, 2);
  // Backup current file before overwriting (best-effort)
  if (existsSync(storePath)) {
    try { await copyFileForBackup(storePath, storeBackupPath); } catch { /* ignore */ }
  }
  // Atomic write: tmp → rename
  await writeFile(storeTmpPath, json);
  await rename(storeTmpPath, storePath);
  return store;
}

/**
 * Read, mutate, write — serialized through a mutex so concurrent callers
 * queue up instead of corrupting the JSON file.
 */
export async function mutateHostingStore(mutator) {
  // Chain on the existing lock so mutations are serialized
  const prevLock = writeLock;
  let releaseLock;
  writeLock = new Promise((resolve) => { releaseLock = resolve; });

  try {
    await prevLock; // wait for any previous mutation to finish
    const store = await readHostingStore();
    const result = await mutator(store);
    await writeHostingStore(store);
    return result;
  } finally {
    releaseLock();
  }
}

function emptyStore() {
  return {
    deployments: [],
    sessions: [],
    logs: {},
    env: {},
    disks: {},
    domains: {},
    checkoutOrders: [],
    payments: [],
  };
}

async function ensureStore() {
  if (existsSync(storePath)) return;
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(emptyStore(), null, 2));
}

/** Best-effort file copy for backup (avoids importing cp which may not exist). */
async function copyFileForBackup(src, dest) {
  const content = await readFile(src);
  await writeFile(dest, content);
}

export function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function redactEnvValue(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  return raw.length <= 4 ? '****' : `${raw.slice(0, 2)}${'*'.repeat(Math.min(8, raw.length - 2))}`;
}
