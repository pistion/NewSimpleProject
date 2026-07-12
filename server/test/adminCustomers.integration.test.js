/**
 * Admin customer-oversight integration tests.
 *
 * Boots the real server against a throwaway SQLite database, seeds one
 * customer footprint (VPS in provider test mode + support ticket), then
 * exercises the unified /api/admin/customers/:userId/* endpoints:
 * admin gating, section completeness, cross-customer isolation, ServiceAccess
 * as the service index, and secret exclusion.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3984;
const BASE = `http://127.0.0.1:${PORT}/api`;

let proc;
let tempDir;

function api(path, { method = 'GET', user, role, body } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { 'x-user-id': user } : {}),
      ...(role ? { 'x-user-role': role } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const admin = (path, opts = {}) => api(path, { ...opts, user: 'admin-user', role: 'admin' });

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'glondia-admin-test-'));
  const dbPath = join(tempDir, 'test.db');
  closeSync(openSync(dbPath, 'w'));
  const dbUrl = `file:${dbPath.replaceAll('\\', '/')}`;

  execSync('npx prisma db push --skip-generate', {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'ignore',
  });

  // The dev auth fallback trusts x-user-id headers but oversight resolves the
  // customer from the users table — seed the identities it will look up.
  const seed = `
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      for (const [id, email, clientId] of [
        ['cust-a', 'cust-a@test.local', 'glondiac-0001'],
        ['cust-b', 'cust-b@test.local', 'glondiac-0002'],
        ['cust-c', 'cust-c@test.local', 'glondiac-0003'],
        ['cust-d', 'cust-d@test.local', 'glondiac-0004'],
        ['admin-user', 'admin@test.local', null],
      ]) {
        await prisma.user.create({ data: { id, email, clientId, passwordHash: 'x', role: id === 'admin-user' ? 'admin' : 'owner' } });
      }
      await prisma.$disconnect();
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  execSync(`node -e ${JSON.stringify(seed)}`, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });

  proc = spawn(process.execPath, ['server/src/server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(PORT),
      NODE_ENV: 'development',
      VPS_TEST_MODE: 'true',
      VULTR_API_KEY: '',
      AUTH_DEV_FALLBACK: 'true',
    },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('Server did not become healthy in 30s');
    await new Promise((r) => setTimeout(r, 400));
  }

  // Seed one customer footprint: a VPS (test mode) and a support ticket.
  const vps = await api('/v1/vps-hosting/services', {
    method: 'POST', user: 'cust-a',
    body: { plan: 'vc2-1c-1gb', region: 'syd', osId: 2284, label: 'oversight-a' },
  });
  assert.equal(vps.status, 201, 'seed VPS create must succeed');
  const ticket = await api('/v1/tickets', {
    method: 'POST', user: 'cust-a',
    body: { subject: 'Oversight test ticket', category: 'vps', priority: 'urgent', body: 'Something is wrong.' },
  });
  assert.equal(ticket.status, 201, 'seed ticket create must succeed');
  // A second customer with their own VPS for isolation checks.
  const vpsB = await api('/v1/vps-hosting/services', {
    method: 'POST', user: 'cust-b',
    body: { plan: 'vc2-1c-1gb', region: 'syd', osId: 2284, label: 'oversight-b' },
  });
  assert.equal(vpsB.status, 201);

  const extraSeed = `
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    (async () => {
      await prisma.serviceAccess.create({
        data: {
          userId: null,
          organizationId: 'glondiac-0001',
          serviceType: 'email',
          serviceId: 'org-email-a',
          serviceName: 'Org email A',
          accessStatus: 'active',
          billingStatus: 'paid',
        },
      });
      await prisma.serviceAccess.create({
        data: {
          userId: null,
          organizationId: 'foreign-org',
          serviceType: 'email',
          serviceId: 'foreign-email',
          serviceName: 'Foreign email',
          accessStatus: 'active',
          billingStatus: 'paid',
        },
      });
      for (const order of [
        { userId: 'cust-a', organizationId: 'cust-a', currency: 'PGK', totalAmountCents: 10000, status: 'pending' },
        { userId: 'cust-a', organizationId: 'cust-a', currency: 'USD', totalAmountCents: 5000, status: 'pending' },
        { userId: 'cust-b', organizationId: 'cust-b', currency: 'PGK', totalAmountCents: 12345, status: 'pending' },
        { userId: 'cust-d', organizationId: 'cust-d', currency: 'PGK', totalAmountCents: 9999, status: 'paid' },
      ]) {
        await prisma.checkoutOrder.create({ data: { ...order, type: 'deployment', provider: 'test' } });
      }
      await prisma.$disconnect();
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  execSync(`node -e ${JSON.stringify(extraSeed)}`, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'inherit',
  });
}, { timeout: 120000 });

after(() => {
  if (proc) proc.kill();
  if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows file locks */ } }
});

test('oversight endpoints are admin-gated', async () => {
  const asCustomer = await api('/admin/customers/cust-a/overview', { user: 'cust-a' });
  assert.equal(asCustomer.status, 403);
  const anonymous = await api('/admin/customers/cust-a/overview');
  assert.equal([401, 403].includes(anonymous.status), true);
});

test('unknown customer returns the stable error format', async () => {
  const res = await admin('/admin/customers/does-not-exist/overview');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'ADMIN_CUSTOMER_NOT_FOUND');
});

let overview;

test('overview returns every section for one customer', async () => {
  const res = await admin('/admin/customers/cust-a/overview');
  assert.equal(res.status, 200);
  overview = (await res.json()).data;

  assert.equal(overview.customer.id, 'cust-a');
  for (const key of ['summary', 'projects', 'services', 'billing', 'support', 'operations', 'activity', 'warnings']) {
    assert.ok(key in overview, `overview must include ${key}`);
  }
  for (const key of ['orders', 'receipts', 'subscriptions', 'invoices', 'creditNotes', 'paymentMethods']) {
    assert.ok(Array.isArray(overview.billing[key]), `billing.${key} must be an array`);
  }

  // The seeded VPS is resolved through ServiceAccess into a normalized DTO.
  const vps = overview.services.find((s) => s.serviceType === 'vps');
  assert.ok(vps, 'VPS service must be resolved');
  assert.equal(vps.serviceName, 'oversight-a');
  assert.equal(vps.accessStatus, 'active');
  assert.equal(vps.billingStatus, 'free');
  assert.ok(vps.price.totalPriceCents > 0);

  // Support section carries the seeded ticket and drives the summary.
  assert.equal(overview.support.tickets.length, 1);
  assert.equal(overview.summary.openTickets, 1);
  assert.equal(overview.summary.urgentTickets, 1);
  assert.equal(overview.summary.services >= 1, true);
});

test('customer-scope ServiceAccess includes user-owned and organization-owned rows only', async () => {
  assert.ok(overview, 'overview loaded');
  assert.ok(overview.services.some((s) => s.serviceType === 'vps' && s.serviceName === 'oversight-a'), 'user-owned ServiceAccess must be included');
  assert.ok(overview.services.some((s) => s.serviceType === 'email' && s.serviceName === 'Org email A'), 'organization-owned ServiceAccess must be included');
  assert.equal(overview.services.some((s) => s.serviceName === 'Foreign email'), false, 'foreign organization ServiceAccess must not leak');
});

test('outstanding totals are grouped by currency', async () => {
  assert.deepEqual(overview.summary.outstandingByCurrency, [
    { currency: 'PGK', amountCents: 10000 },
    { currency: 'USD', amountCents: 5000 },
  ]);
  assert.equal('outstandingAmountCents' in overview.summary, false);
  assert.equal('currency' in overview.summary, false);
});

test('one-currency outstanding total remains a single grouped amount', async () => {
  const res = await admin('/admin/customers/cust-b/overview');
  assert.equal(res.status, 200);
  const body = (await res.json()).data;
  assert.deepEqual(body.summary.outstandingByCurrency, [
    { currency: 'PGK', amountCents: 12345 },
  ]);
});

test('no pending orders returns an empty outstanding group', async () => {
  const res = await admin('/admin/customers/cust-d/overview');
  assert.equal(res.status, 200);
  const body = (await res.json()).data;
  assert.deepEqual(body.summary.outstandingByCurrency, []);
});

test('cross-customer isolation: no foreign services or tickets leak', async () => {
  assert.ok(overview, 'overview loaded');
  const foreign = overview.services.find((s) => s.serviceName === 'oversight-b');
  assert.equal(foreign, undefined, "customer A's overview must not contain customer B's VPS");

  const resB = await admin('/admin/customers/cust-b/overview');
  const b = (await resB.json()).data;
  assert.equal(b.support.tickets.length, 0);
  assert.equal(b.services.some((s) => s.serviceName === 'oversight-a'), false);
});

test('no secrets in any oversight payload', async () => {
  const raw = JSON.stringify(overview);
  for (const needle of ['passwordHash', 'password_hash', 'connectionPassword', 'idPhotoPath', 'avatarPath', 'filePath', 'providerMethodId']) {
    assert.equal(raw.includes(needle), false, `overview must not contain ${needle}`);
  }
});

test('section endpoints respond individually', async () => {
  for (const sectionPath of ['services', 'billing', 'support', 'operations', 'activity']) {
    const res = await admin(`/admin/customers/cust-a/${sectionPath}`);
    assert.equal(res.status, 200, `${sectionPath} must respond 200`);
  }
});

test('old admin endpoints are preserved', async () => {
  const users = await admin('/admin/users');
  assert.equal(users.status, 200);
  const detail = await admin('/admin/users/cust-a');
  assert.equal(detail.status, 200);
  const legacy = (await detail.json()).data;
  assert.ok('deployments' in legacy && 'orders' in legacy && 'receipts' in legacy, 'legacy detail shape unchanged');
});

test('existing admin user lifecycle actions are preserved', async () => {
  const suspend = await admin('/admin/users/cust-c/suspend', {
    method: 'POST',
    body: { reason: 'freeze compatibility' },
  });
  assert.equal(suspend.status, 200);
  assert.equal((await suspend.json()).data.accountStatus, 'suspended');

  const reactivate = await admin('/admin/users/cust-c/reactivate', {
    method: 'POST',
    body: { resumeDeployments: false },
  });
  assert.equal(reactivate.status, 200);
  assert.equal((await reactivate.json()).data.accountStatus, 'active');

  const disable = await admin('/admin/users/cust-c/disable', {
    method: 'POST',
    body: { reason: 'freeze compatibility' },
  });
  assert.equal(disable.status, 200);
  assert.equal((await disable.json()).data.accountStatus, 'disabled');

  const remove = await admin('/admin/users/cust-c/delete', {
    method: 'POST',
    body: { reason: 'freeze compatibility' },
  });
  assert.equal(remove.status, 200);
  const removed = (await remove.json()).data;
  assert.equal(removed.deleted, true);
  assert.equal(removed.id, 'cust-c');

  const detail = await admin('/admin/users/cust-c');
  assert.equal(detail.status, 404);
});
