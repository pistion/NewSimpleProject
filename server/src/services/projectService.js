import { prisma } from './db.js';
import { randomUUID } from 'node:crypto';

export const PROJECT_SERVICE_TYPES = [
  { id: 'website', label: 'Website / Site Builder', nextView: 'builder-gallery' },
  { id: 'hosting', label: 'Hosting', nextView: 'hosting-list' },
  { id: 'domain', label: 'Domain', nextView: 'domains' },
  { id: 'email', label: 'Business Email', nextView: 'email' },
  { id: 'vps', label: 'VPS Hosting', nextView: 'vps' },
  { id: 'consultation', label: 'Consultation', nextView: 'service-requests' },
  { id: 'build', label: 'Custom Build', nextView: 'service-requests' },
  { id: 'support', label: 'Support', nextView: 'tickets' },
  { id: 'other', label: 'Other', nextView: 'overview' },
];

const SERVICE_TYPE_IDS = new Set(PROJECT_SERVICE_TYPES.map((item) => item.id));

export function listProjectServiceTypes() {
  return PROJECT_SERVICE_TYPES.map((item) => ({ ...item }));
}

export async function listProjects({ userId, workspaceId, includeArchived = false } = {}) {
  const where = {
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(userId ? { userId } : workspaceId ? { workspaceId } : {}),
  };
  return prisma.clientProject.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createProject({ userId, workspaceId, input = {} } = {}) {
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, clientId: true, name: true, email: true } }) : null;
  const serviceType = normalizeServiceType(input.serviceType || input.type);
  const name = cleanText(input.name) || defaultProjectName(serviceType);
  const slug = await uniqueSlug({ userId: user?.id || null, name });
  const metadata = {
    source: input.source || 'manual',
    nextView: serviceTypeMeta(serviceType).nextView,
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
  };

  return prisma.clientProject.create({
    data: {
      projectCode: await uniqueProjectCode(),
      userId: user?.id || null,
      clientId: input.clientId || user?.clientId || null,
      workspaceId: workspaceId || input.workspaceId || null,
      name,
      slug,
      serviceType,
      status: input.status || 'draft',
      priority: input.priority || 'normal',
      description: cleanText(input.description) || null,
      metadata: JSON.stringify(metadata),
    },
  });
}

export async function getProject({ projectId, userId, workspaceId } = {}) {
  const project = await prisma.clientProject.findFirst({
    where: {
      id: projectId,
      ...(userId ? { userId } : workspaceId ? { workspaceId } : {}),
    },
  });
  if (!project) throw notFound();
  return project;
}

export async function updateProject({ projectId, userId, workspaceId, patch = {} } = {}) {
  await getProject({ projectId, userId, workspaceId });
  const data = {};
  if (patch.name !== undefined) {
    data.name = cleanText(patch.name) || 'Untitled project';
    data.slug = await uniqueSlug({ userId, name: data.name, projectId });
  }
  if (patch.serviceType !== undefined || patch.type !== undefined) data.serviceType = normalizeServiceType(patch.serviceType || patch.type);
  if (patch.status !== undefined) data.status = cleanText(patch.status) || 'draft';
  if (patch.priority !== undefined) data.priority = cleanText(patch.priority) || 'normal';
  if (patch.description !== undefined) data.description = cleanText(patch.description) || null;
  if (patch.metadata && typeof patch.metadata === 'object') data.metadata = JSON.stringify(patch.metadata);
  return prisma.clientProject.update({ where: { id: projectId }, data });
}

export async function archiveProject({ projectId, userId, workspaceId } = {}) {
  await getProject({ projectId, userId, workspaceId });
  return prisma.clientProject.update({
    where: { id: projectId },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

export function projectDto(project) {
  const meta = parseJson(project.metadata);
  return {
    id: project.id,
    projectId: project.id,
    projectCode: project.projectCode,
    userId: project.userId,
    clientId: project.clientId,
    workspaceId: project.workspaceId,
    name: project.name,
    slug: project.slug,
    serviceType: project.serviceType,
    serviceTypeLabel: serviceTypeMeta(project.serviceType).label,
    status: project.status,
    priority: project.priority,
    description: project.description,
    metadata: meta,
    nextView: meta.nextView || serviceTypeMeta(project.serviceType).nextView,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    archivedAt: project.archivedAt,
  };
}

function normalizeServiceType(value) {
  const id = String(value || 'website').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return SERVICE_TYPE_IDS.has(id) ? id : 'other';
}

function serviceTypeMeta(serviceType) {
  return PROJECT_SERVICE_TYPES.find((item) => item.id === serviceType) || PROJECT_SERVICE_TYPES.at(-1);
}

function defaultProjectName(serviceType) {
  return `${serviceTypeMeta(serviceType).label} project`;
}

function cleanText(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

async function uniqueSlug({ userId, name, projectId = null }) {
  const base = slugify(name);
  for (let i = 0; i < 50; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await prisma.clientProject.findFirst({
      where: {
        slug,
        userId: userId || null,
        ...(projectId ? { id: { not: projectId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function uniqueProjectCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = `GLP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const existing = await prisma.clientProject.findUnique({ where: { projectCode: code }, select: { id: true } });
    if (!existing) return code;
  }
  return randomUUID();
}

function parseJson(value) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

function notFound() {
  const err = new Error('Project not found.');
  err.status = 404;
  err.code = 'PROJECT_NOT_FOUND';
  return err;
}
