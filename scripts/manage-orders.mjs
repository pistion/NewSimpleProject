/**
 * manage-orders.mjs — view and delete orders from both the DB and the JSON store.
 *
 * Usage:
 *   node scripts/manage-orders.mjs list                        # list all orders
 *   node scripts/manage-orders.mjs list --status=pending       # filter by status
 *   node scripts/manage-orders.mjs list --user=<userId>        # filter by user
 *   node scripts/manage-orders.mjs view <orderId>              # view one order in detail
 *   node scripts/manage-orders.mjs delete <orderId>            # delete one order (DB + JSON store)
 *   node scripts/manage-orders.mjs delete-all --status=expired # delete all matching a status
 *
 * Env vars:
 *   DATABASE_URL   — path to your SQLite DB  (e.g. file:/var/glondia/data/glondia.db)
 *   DATA_DIR       — path to the JSON store dir (e.g. /var/glondia/data)
 *
 * ⚠️  Deleting an order is permanent. PaymentReceipt rows linked to the order
 *    are cascade-deleted automatically (onDelete: Cascade in schema).
 */

import { PrismaClient } from '@prisma/client';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSqliteUrl(url) {
  if (!url || !url.startsWith('file:')) return url;
  if (url.startsWith('file:///') || url.startsWith('file://')) return url;
  const path = url.slice('file:'.length);
  return path.startsWith('/') ? `file://${path}` : url;
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeSqliteUrl(process.env.DATABASE_URL);
}

const prisma = new PrismaClient();

// ── JSON store helpers ────────────────────────────────────────────────────────

function getStorePath() {
  const dataDir = process.env.DATA_DIR
    ? resolve(process.env.DATA_DIR)
    : join(resolve(process.cwd()), '.glondia-data');
  return join(dataDir, 'render-hosting.json');
}

async function readStore() {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return null;
  const text = await readFile(storePath, 'utf8');
  return JSON.parse(text);
}

async function writeStore(store) {
  const storePath = getStorePath();
  const tmpPath = `${storePath}.tmp`;
  const bakPath = `${storePath}.bak`;
  await mkdir(resolve(storePath, '..'), { recursive: true });
  if (existsSync(storePath)) {
    try { await writeFile(bakPath, await readFile(storePath)); } catch { /* best effort */ }
  }
  await writeFile(tmpPath, JSON.stringify(store, null, 2));
  await rename(tmpPath, storePath);
}

function money(cents, currency = 'PGK') {
  return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
}

function col(val, width) {
  const s = String(val ?? '—');
  return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const target = args[1] && !args[1].startsWith('--') ? args[1] : null;
  const flags = {};
  for (const a of args) {
    const m = /^--(\w[\w-]*)(?:=(.+))?$/.exec(a);
    if (m) flags[m[1]] = m[2] ?? true;
  }
  return { cmd, target, flags };
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdList(flags) {
  const where = { type: 'deployment' };
  if (flags.status) where.status = flags.status;
  if (flags.user) where.userId = flags.user;

  const orders = await prisma.checkoutOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: flags.limit ? Number(flags.limit) : 200,
  });

  if (!orders.length) {
    console.log('No orders found.');
    return;
  }

  console.log(`\n${'ID'.padEnd(38)} ${'STATUS'.padEnd(18)} ${'AMOUNT'.padEnd(14)} ${'USER'.padEnd(36)} CREATED`);
  console.log('─'.repeat(120));
  for (const o of orders) {
    console.log(
      `${col(o.id, 38)} ${col(o.status, 18)} ${col(money(o.totalAmountCents, o.currency), 14)} ${col(o.userId, 36)} ${o.createdAt?.toISOString?.() ?? '—'}`
    );
  }
  console.log(`\nTotal: ${orders.length} order(s)`);
}

async function cmdView(orderId) {
  if (!orderId) { console.error('Provide an order ID: view <orderId>'); process.exit(1); }

  const order = await prisma.checkoutOrder.findUnique({
    where: { id: orderId },
    include: { receipts: true },
  });

  if (!order) { console.error(`Order "${orderId}" not found in DB.`); process.exit(2); }

  console.log('\n── Order ────────────────────────────────────────');
  for (const [k, v] of Object.entries(order)) {
    if (k === 'receipts') continue;
    console.log(`  ${k.padEnd(22)} ${v ?? '—'}`);
  }

  if (order.receipts?.length) {
    console.log(`\n── Linked receipts (${order.receipts.length}) ──────────────────`);
    for (const r of order.receipts) {
      console.log(`  ${r.id}  status=${r.status}  created=${r.createdAt?.toISOString?.()}`);
    }
  }

  // Check JSON store too
  const store = await readStore();
  if (store) {
    const storeOrder = (store.checkoutOrders || []).find((o) => o.id === orderId);
    if (storeOrder) {
      console.log('\n── Also found in JSON store ─────────────────────');
      console.log(JSON.stringify(storeOrder, null, 2));
    }
  }
}

async function cmdDelete(orderId) {
  if (!orderId) { console.error('Provide an order ID: delete <orderId>'); process.exit(1); }

  // Check it exists first
  const order = await prisma.checkoutOrder.findUnique({ where: { id: orderId } });
  if (!order) {
    console.warn(`Order "${orderId}" not found in DB — checking JSON store only.`);
  } else {
    console.log(`\nFound order: ${order.id}`);
    console.log(`  Status  : ${order.status}`);
    console.log(`  Amount  : ${money(order.totalAmountCents, order.currency)}`);
    console.log(`  User    : ${order.userId ?? '—'}`);
    console.log(`  Created : ${order.createdAt?.toISOString?.()}`);
    console.log('\n⚠️  This will permanently delete the order and any linked receipts.');
    console.log('   Press Ctrl+C within 5 seconds to abort...');
    await new Promise((r) => setTimeout(r, 5000));

    await prisma.checkoutOrder.delete({ where: { id: orderId } });
    console.log(`✓ Deleted order ${orderId} from DB (receipts cascade-deleted).`);
  }

  // Remove from JSON store if present
  const store = await readStore();
  if (store) {
    const before = (store.checkoutOrders || []).length;
    store.checkoutOrders = (store.checkoutOrders || []).filter((o) => o.id !== orderId);
    if (store.checkoutOrders.length < before) {
      await writeStore(store);
      console.log(`✓ Removed order ${orderId} from JSON store.`);
    } else {
      console.log('  (Order was not present in JSON store.)');
    }
  }
}

async function cmdDeleteAll(flags) {
  if (!flags.status) {
    console.error('Specify a status filter: delete-all --status=<status>');
    console.error('  e.g. --status=expired  --status=pending');
    process.exit(1);
  }

  const orders = await prisma.checkoutOrder.findMany({
    where: { status: flags.status },
    select: { id: true, status: true, totalAmountCents: true, currency: true, createdAt: true },
  });

  if (!orders.length) {
    console.log(`No orders with status "${flags.status}" found.`);
    return;
  }

  console.log(`\nFound ${orders.length} order(s) with status "${flags.status}":`);
  for (const o of orders) {
    console.log(`  ${o.id}  ${money(o.totalAmountCents, o.currency)}  ${o.createdAt?.toISOString?.()}`);
  }

  console.log('\n⚠️  This will permanently delete ALL of the above orders and their receipts.');
  console.log('   Press Ctrl+C within 8 seconds to abort...');
  await new Promise((r) => setTimeout(r, 8000));

  const ids = orders.map((o) => o.id);
  const result = await prisma.checkoutOrder.deleteMany({ where: { id: { in: ids } } });
  console.log(`✓ Deleted ${result.count} order(s) from DB.`);

  // Clean JSON store
  const store = await readStore();
  if (store) {
    const before = (store.checkoutOrders || []).length;
    store.checkoutOrders = (store.checkoutOrders || []).filter((o) => !ids.includes(o.id));
    if (store.checkoutOrders.length < before) {
      await writeStore(store);
      console.log(`✓ Removed ${before - store.checkoutOrders.length} order(s) from JSON store.`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const { cmd, target, flags } = parseArgs();

try {
  switch (cmd) {
    case 'list':        await cmdList(flags); break;
    case 'view':        await cmdView(target); break;
    case 'delete':      await cmdDelete(target); break;
    case 'delete-all':  await cmdDeleteAll(flags); break;
    default:
      console.log(`
manage-orders.mjs — manage orders on the SSD / DB

Commands:
  list                          List all orders
  list --status=<s>             Filter by status (pending | paid | expired | payment_uploaded)
  list --user=<userId>          Filter by user ID
  list --limit=<n>              Limit results (default 200)
  view <orderId>                Show full detail for one order
  delete <orderId>              Delete one order (5s grace period)
  delete-all --status=<s>       Delete all orders with that status (8s grace period)

Examples:
  node scripts/manage-orders.mjs list
  node scripts/manage-orders.mjs list --status=expired
  node scripts/manage-orders.mjs view abc123
  node scripts/manage-orders.mjs delete abc123
  node scripts/manage-orders.mjs delete-all --status=expired
`);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
