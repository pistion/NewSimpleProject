import renderApiService from './renderApiService.js';
import { makeId, mutateHostingStore, nowIso, readHostingStore } from './hostingStore.js';

class DiskService {
  async list(deploymentId) {
    const deployment = await findDeployment(deploymentId);
    const store = await readHostingStore();
    return store.disks[deployment.deploymentId] || [];
  }

  async attach(deploymentId, input = {}) {
    const disk = validateDisk(input);
    const deployment = await findDeployment(deploymentId);
    if (deployment.serviceType !== 'web_service') {
      const error = new Error('Persistent disks are supported only for Render web services in this flow.');
      error.status = 400;
      throw error;
    }
    const renderDisk = await renderApiService.createDisk(deployment.renderServiceId, disk);
    return mutateHostingStore((store) => {
      const item = {
        diskId: renderDisk?.disk?.id || renderDisk?.id || makeId('disk'),
        name: disk.name,
        mountPath: disk.mountPath,
        sizeGB: disk.sizeGB,
        status: 'attached',
        renderDisk,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      store.disks[deployment.deploymentId] = [item, ...(store.disks[deployment.deploymentId] || [])];
      updateDeploymentDisks(store, deployment.deploymentId);
      return item;
    });
  }

  async update(deploymentId, diskId, input = {}) {
    const deployment = await findDeployment(deploymentId);
    const disk = validateDisk(input, false);
    const renderDisk = await renderApiService.updateDisk(deployment.renderServiceId, diskId, disk);
    return mutateHostingStore((store) => {
      const item = (store.disks[deployment.deploymentId] || []).find((row) => row.diskId === diskId);
      if (!item) throw notFound('Disk not found.');
      Object.assign(item, disk, { renderDisk, updatedAt: nowIso() });
      updateDeploymentDisks(store, deployment.deploymentId);
      return item;
    });
  }

  async remove(deploymentId, diskId) {
    const deployment = await findDeployment(deploymentId);
    await renderApiService.deleteDisk(deployment.renderServiceId, diskId);
    return mutateHostingStore((store) => {
      store.disks[deployment.deploymentId] = (store.disks[deployment.deploymentId] || []).filter((row) => row.diskId !== diskId);
      updateDeploymentDisks(store, deployment.deploymentId);
      return { deleted: true, diskId };
    });
  }
}

function validateDisk(input = {}, requireAll = true) {
  const name = String(input.name || input.diskName || '').trim();
  const mountPath = String(input.mountPath || '').trim();
  const sizeGB = Number(input.sizeGB || input.size || 1);
  if (requireAll && !name) throw validationError('Disk name is required.');
  if (name && !/^[a-zA-Z0-9][a-zA-Z0-9-_]{1,62}$/.test(name)) throw validationError('Disk name must be 2-63 letters, numbers, hyphens, or underscores.');
  if (requireAll && !mountPath) throw validationError('Mount path is required.');
  if (mountPath && (!mountPath.startsWith('/') || mountPath.includes('..'))) throw validationError('Mount path must be an absolute path and cannot contain "..".');
  if (!Number.isFinite(sizeGB) || sizeGB < 1 || sizeGB > 1024) throw validationError('Disk size must be between 1 GB and 1024 GB.');
  return { name, mountPath, sizeGB };
}

async function findDeployment(deploymentId) {
  const store = await readHostingStore();
  const deployment = store.deployments.find((item) => item.deploymentId === deploymentId || item.renderServiceId === deploymentId);
  if (!deployment) throw notFound('Hosting service not found.');
  if (!deployment.renderServiceId) throw validationError('Deployment has not started. A real hosting service ID is required.');
  return deployment;
}

function updateDeploymentDisks(store, serviceId) {
  const deployment = store.deployments.find((item) => item.deploymentId === serviceId);
  if (!deployment) return;
  deployment.diskMetadata = store.disks[serviceId] || [];
  deployment.updatedAt = nowIso();
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

export default new DiskService();
