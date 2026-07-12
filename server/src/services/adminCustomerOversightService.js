/**
 * adminCustomerOversightService.js — one customer, every relationship.
 *
 * Aggregation layer over the existing operational database (single source of
 * truth — nothing is copied). Flow:
 *
 *   admin route → adminCustomerController → this service → repositories → db.js
 *
 * ServiceAccess is the service index: every access row is resolved to its
 * underlying record (VPS, hosting deployment, business service, project) and
 * normalized into one AdminService DTO. Services found WITHOUT an access row
 * are still shown, flagged with a warning instead of being hidden.
 *
 * Failed optional sections never sink the whole overview — each failure
 * becomes a `warnings[]` entry (per the implementation pack's API contract).
 */

import * as customerRepo from '../repositories/customer.repository.js';
import * as billingRepo from '../repositories/billing.repository.js';
import * as operationsRepo from '../repositories/operations.repository.js';
import * as auditRepo from '../repositories/audit.repository.js';
import * as accessRepo from '../repositories/serviceAccess.repository.js';
import * as vpsRepo from '../repositories/vps.repository.js';
import { listByOwners as listProviderResourcesByOwners } from '../repositories/providerResource.repository.js';
import { listAllTickets } from './ticketService.js';
import { readHostingStore } from './hostingStore.js';

function httpError(message, status = 400, code = undefined) {
  return Object.assign(new Error(message), { status, code, expose: true });
}

function safeJson(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/**
 * Ownership scope for one customer. Tokens historically used as
 * organizationId: the user id itself (VPS post-backfill) and the
 * human-readable client id.
 */
function ownershipScope(customer) {
  return [...new Set([customer.id, customer.clientId].filter(Boolean))];
}

/** Run one optional section; failures become warnings, not 500s. */
async function section(name, warnings, fallback, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[admin:oversight] Section "${name}" failed:`, err.message);
    warnings.push({ section: name, code: 'SECTION_FAILED', message: err.message });
    return fallback;
  }
}

// ─── Customer header ──────────────────────────────────────────────────────────

async function loadCustomer(userId) {
  const customer = await customerRepo.findCustomerById(userId);
  if (!customer) throw httpError('Customer not found.', 404, 'ADMIN_CUSTOMER_NOT_FOUND');
  const media = await customerRepo.getCustomerMediaFlags(userId);
  return {
    ...customer,
    profileDetails: safeJson(customer.profileDetails),
    hasAvatar: media.hasAvatar,
    avatarUrl: media.hasAvatar ? `/api/admin/users/${userId}/avatar` : null,
    hasIdPhoto: media.hasIdPhoto,
  };
}

// ─── Service resolution (ServiceAccess = index) ───────────────────────────────

function normalizeService({
  id, serviceType, serviceName, status, providerStatus = null, provider = null,
  plan = null, price = null, access = null, source = 'record', updatedAt = null,
}) {
  return {
    id,
    serviceType,
    serviceName,
    status: status ?? 'unknown',
    providerStatus,
    accessStatus: access?.accessStatus ?? null,
    billingStatus: access?.billingStatus ?? null,
    adminStatus: access?.adminStatus ?? null,
    provider,
    plan,
    price,
    expiresAt: access?.expiresAt ?? null,
    serviceAccessId: access?.id ?? null,
    source,
    updatedAt,
  };
}

/**
 * Resolve every service the customer owns into normalized AdminService DTOs.
 * Returns { services, warnings } — never raw records (no vps metadata /
 * connection credentials leave this function).
 */
export async function resolveCustomerServices(userId) {
  const customer = await loadCustomer(userId);
  const orgIds = ownershipScope(customer);
  const warnings = [];

  const accessRows = await accessRepo.listByUser(userId);
  const byType = new Map();
  for (const row of accessRows) {
    if (!byType.has(row.serviceType)) byType.set(row.serviceType, []);
    byType.get(row.serviceType).push(row);
  }
  const accessFor = (type, id) => accessRows.find((a) => a.serviceType === type && a.serviceId === id) ?? null;

  const [vpsRecords, businessRecords, hostingStoreData, webHostingRows, builderProjects] = await Promise.all([
    // Union: indexed by access + owned by organization (catches missing index rows).
    (async () => {
      const indexed = await vpsRepo.findManyByIds((byType.get('vps') ?? []).map((a) => a.serviceId));
      const owned = await Promise.all(orgIds.map((org) => vpsRepo.listByOrganization(org)));
      const map = new Map();
      for (const r of [...indexed, ...owned.flat()]) map.set(r.id, r);
      return [...map.values()];
    })(),
    (async () => {
      const indexedIds = [...(byType.get('domain') ?? []), ...(byType.get('email') ?? [])].map((a) => a.serviceId);
      const indexed = await customerRepo.findBusinessServicesByIds(indexedIds);
      const owned = await customerRepo.listBusinessServicesForCustomer(userId, orgIds);
      const map = new Map();
      for (const r of [...indexed, ...owned]) map.set(r.id, r);
      return [...map.values()];
    })(),
    readHostingStore().catch((err) => {
      warnings.push({ section: 'hosting', code: 'HOSTING_STORE_UNREADABLE', message: err.message });
      return { deployments: [] };
    }),
    customerRepo.listWebHostingForCustomer(userId, orgIds).catch(() => []),
    customerRepo.findClientProjectsByIds((byType.get('builder') ?? []).map((a) => a.serviceId)),
  ]);

  const services = [];

  for (const r of vpsRecords) {
    const access = accessFor('vps', r.id);
    if (!access) warnings.push({ section: 'services', code: 'MISSING_SERVICE_ACCESS', message: `VPS ${r.id} (${r.label}) has no ServiceAccess row.` });
    services.push(normalizeService({
      id: r.id,
      serviceType: 'vps',
      serviceName: r.label,
      status: r.deletedAt ? 'destroyed' : r.status,
      providerStatus: r.status,
      provider: r.provider,
      plan: r.plan,
      price: { totalPriceCents: r.totalPriceCents, currency: r.currency },
      access,
      updatedAt: r.updatedAt,
    }));
  }

  // Hosting: JSON store is still authoritative; relational rows are dual-read
  // and compared so drift is visible instead of silent.
  const deployments = (hostingStoreData.deployments ?? []).filter((d) => d.userId === userId);
  const relationalHosting = new Map(webHostingRows.map((w) => [w.providerServiceId ?? w.id, w]));
  for (const d of deployments) {
    const access = accessFor('hosting', d.deploymentId);
    if (!access) warnings.push({ section: 'services', code: 'MISSING_SERVICE_ACCESS', message: `Hosting deployment ${d.deploymentId} has no ServiceAccess row.` });
    services.push(normalizeService({
      id: d.deploymentId,
      serviceType: 'hosting',
      serviceName: d.serviceName ?? d.deploymentId,
      status: d.status ?? 'unknown',
      providerStatus: d.status ?? null,
      provider: 'render',
      plan: d.renderPlan ?? null,
      price: d.priceCents != null ? { totalPriceCents: d.priceCents, currency: d.priceCurrency ?? 'PGK' } : null,
      access,
      source: 'hosting_store',
      updatedAt: d.updatedAt ?? null,
    }));
    if (d.renderServiceId && relationalHosting.has(d.renderServiceId)) relationalHosting.delete(d.renderServiceId);
  }
  // Relational hosting rows with no JSON counterpart = drift worth reporting.
  for (const w of relationalHosting.values()) {
    warnings.push({ section: 'hosting', code: 'HOSTING_DUAL_SOURCE_MISMATCH', message: `WebHostingService ${w.id} (${w.name}) has no matching JSON deployment.` });
    services.push(normalizeService({
      id: w.id,
      serviceType: 'hosting',
      serviceName: w.name,
      status: w.status,
      provider: w.provider,
      plan: w.plan ?? null,
      price: { totalPriceCents: w.totalPriceCents, currency: w.currency },
      access: accessFor('hosting', w.id),
      source: 'relational',
      updatedAt: w.updatedAt,
    }));
  }

  for (const b of businessRecords) {
    const type = b.type === 'email' ? 'email' : b.type === 'domain' ? 'domain' : b.type;
    services.push(normalizeService({
      id: b.id,
      serviceType: type,
      serviceName: b.name,
      status: b.deletedAt ? 'deleted' : b.status,
      provider: b.provider,
      plan: b.billingCycle,
      price: { totalPriceCents: b.totalPriceCents, currency: b.currency },
      access: accessFor(type, b.id),
      updatedAt: b.updatedAt,
    }));
  }

  for (const p of builderProjects) {
    services.push(normalizeService({
      id: p.id,
      serviceType: 'builder',
      serviceName: p.name,
      status: p.archivedAt ? 'archived' : p.status,
      provider: 'glondia',
      access: accessFor('builder', p.id),
      updatedAt: p.updatedAt,
    }));
  }

  // Access rows whose underlying record could not be resolved at all.
  const resolvedIds = new Set(services.map((s) => `${s.serviceType}:${s.id}`));
  for (const a of accessRows) {
    if (['vps', 'hosting', 'domain', 'email', 'builder'].includes(a.serviceType) && !resolvedIds.has(`${a.serviceType}:${a.serviceId}`)) {
      warnings.push({ section: 'services', code: 'ORPHAN_SERVICE_ACCESS', message: `ServiceAccess ${a.id} points to missing ${a.serviceType} record ${a.serviceId}.` });
      services.push(normalizeService({
        id: a.serviceId,
        serviceType: a.serviceType,
        serviceName: a.serviceName ?? a.serviceId,
        status: 'record_missing',
        access: a,
        source: 'service_access_only',
        updatedAt: a.updatedAt,
      }));
    }
  }

  return { services, warnings, accessRows };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function getCustomerBilling(userId) {
  const customer = await loadCustomer(userId);
  const orgIds = ownershipScope(customer);
  const [orders, receipts, subscriptions, invoices, creditNotes, paymentMethods] = await Promise.all([
    billingRepo.listOrdersByUser(userId),
    billingRepo.listReceiptsByUser(userId),
    billingRepo.listSubscriptionsByUser(userId),
    billingRepo.listInvoicesByUser(userId, orgIds),
    billingRepo.listCreditNotesByUser(userId, orgIds),
    billingRepo.listPaymentMethodsByUser(userId, orgIds),
  ]);
  return { orders, receipts, subscriptions, invoices, creditNotes, paymentMethods };
}

export async function getCustomerSupport(userId) {
  const customer = await loadCustomer(userId);
  const [tickets, serviceRequests] = await Promise.all([
    listAllTickets({ userId, limit: 100 }),
    customerRepo.listServiceRequestsByUser(userId, customer.email),
  ]);
  return { tickets: tickets.items, serviceRequests };
}

export async function getCustomerOperations(userId) {
  const customer = await loadCustomer(userId);
  const orgIds = ownershipScope(customer);
  const { services } = await resolveCustomerServices(userId);
  const serviceRefs = services.map((s) => ({ serviceType: s.serviceType, serviceId: s.id }));
  const serviceIds = services.map((s) => s.id);

  const [providerResources, healthChecks, incidents, watchdogEvents, notifications] = await Promise.all([
    listProviderResourcesByOwners({ organizationIds: orgIds, userId }),
    operationsRepo.listHealthChecksForServices(serviceRefs),
    operationsRepo.listIncidentsForServices(serviceRefs),
    operationsRepo.listWatchdogEventsForCustomer(userId, orgIds, serviceIds),
    operationsRepo.listNotificationsForCustomer(userId),
  ]);

  return {
    providerResources: providerResources.map((r) => ({
      id: r.id,
      provider: r.provider,
      resourceType: r.resourceType,
      providerResourceId: r.providerResourceId,
      name: r.name,
      status: r.status,
      serviceId: r.serviceId,
      deletedAt: r.deletedAt,
      createdAt: r.createdAt,
    })),
    healthChecks,
    incidents,
    watchdogEvents,
    notifications,
  };
}

export async function getCustomerActivity(userId, { limit = 50, offset = 0 } = {}) {
  const customer = await loadCustomer(userId);
  const orgIds = ownershipScope(customer);
  const [audit, adminCommands] = await Promise.all([
    auditRepo.listAuditForCustomer(userId, orgIds, { limit, offset }),
    auditRepo.listAdminCommandsForCustomer(userId, { limit: 25 }),
  ]);
  return { audit, adminCommands };
}

export async function getCustomerServices(userId) {
  const { services, warnings } = await resolveCustomerServices(userId);
  return { services, warnings };
}

// ─── Unified overview ─────────────────────────────────────────────────────────

export async function getCustomerOverview(userId) {
  const customer = await loadCustomer(userId); // hard 404 if missing
  const warnings = [];

  const [projects, resolved, billing, support, operations, activity] = await Promise.all([
    section('projects', warnings, [], () => customerRepo.listCustomerProjects(userId)),
    section('services', warnings, { services: [], warnings: [] }, () => resolveCustomerServices(userId)),
    section('billing', warnings, { orders: [], receipts: [], subscriptions: [], invoices: [], creditNotes: [], paymentMethods: [] }, () => getCustomerBilling(userId)),
    section('support', warnings, { tickets: [], serviceRequests: [] }, () => getCustomerSupport(userId)),
    section('operations', warnings, { providerResources: [], healthChecks: [], incidents: [], watchdogEvents: [], notifications: [] }, () => getCustomerOperations(userId)),
    section('activity', warnings, { audit: { items: [], total: 0 }, adminCommands: [] }, () => getCustomerActivity(userId, { limit: 25 })),
  ]);

  warnings.push(...(resolved.warnings ?? []));
  const services = resolved.services ?? [];

  const ACTIVE = new Set(['active', 'running', 'live', 'deployed']);
  const FAILED = new Set(['error', 'failed', 'destroy_failed', 'provider_missing', 'record_missing']);
  const SUSPENDED = new Set(['suspended', 'account_suspended', 'stopped', 'halted']);

  const openTickets = (support.tickets ?? []).filter((t) => !['resolved', 'closed'].includes(t.status));
  const pendingOrders = (billing.orders ?? []).filter((o) => ['pending', 'payment_uploaded'].includes(o.status));
  const outstandingAmountCents = pendingOrders.reduce((sum, o) => sum + (o.totalAmountCents || 0), 0);

  const summary = {
    projects: projects.length,
    services: services.length,
    activeServices: services.filter((s) => ACTIVE.has(s.status)).length,
    failedServices: services.filter((s) => FAILED.has(s.status)).length,
    suspendedServices: services.filter((s) => SUSPENDED.has(s.status) || s.adminStatus === 'blocked').length,
    openTickets: openTickets.length,
    urgentTickets: openTickets.filter((t) => t.priority === 'urgent').length,
    pendingOrders: pendingOrders.length,
    pendingReceipts: (billing.receipts ?? []).filter((r) => r.status === 'pending').length,
    outstandingAmountCents,
    currency: (billing.orders ?? [])[0]?.currency ?? 'PGK',
    warnings: warnings.length,
  };

  return {
    customer,
    summary,
    projects,
    services,
    billing,
    support,
    operations,
    activity: activity.audit?.items ?? [],
    adminCommands: activity.adminCommands ?? [],
    warnings,
  };
}
