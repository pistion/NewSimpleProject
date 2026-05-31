/**
 * templateSiteStore.js
 * JSON-backed persistent store for AI-tailored template site drafts.
 * Store file: DATA_DIR/template-sites.json
 * Pattern mirrors hostingStore.js.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { makeId, nowIso } from '../../../services/hostingStore.js';

const rootDir    = resolve(process.cwd());
const fallbackDataDir = join(rootDir, '.glondia-data');
const dataDir    = resolve(process.env.DATA_DIR || fallbackDataDir);
const storePath  = join(dataDir, 'template-sites.json');

function emptyStore() {
  return { sites: [] };
}

async function ensureStore() {
  if (existsSync(storePath)) return;
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(emptyStore(), null, 2));
}

async function readStore() {
  await ensureStore();
  const text = await readFile(storePath, 'utf8');
  return JSON.parse(text);
}

async function writeStore(store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
  return store;
}

/**
 * Create and persist a new tailored site draft.
 * @param {object} params
 * @param {string} params.templateId
 * @param {object} params.answers      — Collected intake answers
 * @param {Array}  params.tailoredPages — [{title, path, html}]
 * @returns {Promise<object>}  The created site record
 */
export async function createTemplateSite({ templateId, answers = {}, tailoredPages = [] }) {
  const store = await readStore();
  const site = {
    siteId:        makeId('tai'),
    templateId,
    answers,
    pages:         tailoredPages,
    status:        'draft',
    createdAt:     nowIso(),
    updatedAt:     nowIso(),
  };
  store.sites.push(site);
  await writeStore(store);
  return site;
}

/**
 * Retrieve a tailored site by siteId.
 * @param {string} siteId
 * @returns {Promise<object|null>}
 */
export async function getTemplateSite(siteId) {
  const store = await readStore();
  return store.sites.find(s => s.siteId === siteId) || null;
}

/**
 * Update fields on an existing tailored site.
 * @param {string} siteId
 * @param {object} updates  — Partial fields to merge
 * @returns {Promise<object|null>}  Updated site or null if not found
 */
export async function updateTemplateSite(siteId, updates) {
  const store = await readStore();
  const idx = store.sites.findIndex(s => s.siteId === siteId);
  if (idx === -1) return null;
  store.sites[idx] = { ...store.sites[idx], ...updates, siteId, updatedAt: nowIso() };
  await writeStore(store);
  return store.sites[idx];
}
