export const HOSTING_TABS = [
  'Overview',
  'Deploy History',
  'Build Logs',
  'Metrics',
  'Hosting Settings',
  'Env Vars',
  'Secret Files',
  'Headers',
  'Rules',
  'Disks',
  'Domains',
  'Billing',
];

export function hasRealRenderId(id) {
  return Boolean(id && !String(id).includes('_pending'));
}

export function getHostingSourceType(app) {
  if (app?.source === 'zip-upload' || app?.generatedSite?.sourceType === 'uploaded-zip-source-artifact') return 'zip-upload';
  if (app?.source === 'template') return 'template';
  if (app?.source === 'ai-tailored-template' || app?.sourceReference === 'roxanne-ai-tailored-template') return 'roxanne-ai';
  if (app?.githubRepo || app?.source === 'github') return 'github';
  return 'builder';
}

export function sourceLabel(app) {
  const type = getHostingSourceType(app);
  if (type === 'zip-upload') return 'ZIP Upload';
  if (type === 'template') return 'Template';
  if (type === 'roxanne-ai') return 'RoxanneAI generated';
  if (type === 'github') return 'GitHub import';
  return 'Builder';
}

export function sourceBadgeTone(app) {
  const type = getHostingSourceType(app);
  return type === 'zip-upload' || type === 'template' || type === 'roxanne-ai' ? 'info' : 'muted';
}

export function getRenderSourceRoot(app) {
  return app?.generatedSite?.sourceArtifact?.targetRoot
    || app?.generatedSite?.githubTargetRoot
    || app?.render?.githubPublish?.targetRoot
    || app?.environmentConfiguration?.rootDirectory
    || '';
}

export function statusLabel(status) {
  return {
    preparing: 'Preparing',
    configuration_required: 'Preparing',
    queued: 'Queued',
    building: 'Building',
    deploying: 'Deploying',
    deployed: 'Verifying URL',
    deployed_unverified: 'Deployed - Warming Up',
    live: 'Live',
    failed: 'Failed',
    suspended: 'Suspended',
    deleted: 'Deleted',
  }[status] || 'Preparing';
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

export function formatTime(value) {
  try {
    return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  } catch {
    return '';
  }
}

export function normalizeList(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
