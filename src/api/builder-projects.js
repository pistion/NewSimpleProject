import { authHeaders } from './auth.js';

function apiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

async function builderRequest(path, options = {}) {
  const response = await fetch(apiUrl(`/v1/builder${path}`), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `Builder request failed (${response.status}).`);
  }
  return result?.data ?? result;
}

export const builderProjectsApi = {
  createProject: (body) => builderRequest('/projects', { method: 'POST', body }),
  listProjects: (query = {}) => {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
    return builderRequest(`/projects${qs ? `?${qs}` : ''}`);
  },
  getProject: (projectId) => builderRequest(`/projects/${encodeURIComponent(projectId)}`),
  updatePlan: (projectId, body) => builderRequest(`/projects/${encodeURIComponent(projectId)}/plan`, { method: 'PATCH', body }),
  buildAnswerSheet: (projectId) => builderRequest(`/projects/${encodeURIComponent(projectId)}/answer-sheet/build`, { method: 'POST' }),
  updateAnswerSheet: (projectId, answerSheet) => builderRequest(`/projects/${encodeURIComponent(projectId)}/answer-sheet`, { method: 'PATCH', body: { answerSheet } }),
  startGeneration: (projectId, body, idempotencyKey) => builderRequest(`/projects/${encodeURIComponent(projectId)}/generations`, { method: 'POST', body, idempotencyKey }),
  getJob: (jobId) => builderRequest(`/jobs/${encodeURIComponent(jobId)}`),
  listRevisions: (projectId) => builderRequest(`/projects/${encodeURIComponent(projectId)}/revisions`),
  getRevision: (projectId, revisionId) => builderRequest(`/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}`),
  approveRevision: (projectId, revisionId) => builderRequest(`/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/approve`, { method: 'POST' }),
  requestChange: (projectId, revisionId, body, idempotencyKey) => builderRequest(`/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/change-request`, { method: 'POST', body, idempotencyKey }),
  createPreviewGrant: (projectId, revisionId) => builderRequest(`/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/preview-grants`, { method: 'POST' }),
  createDeployment: (projectId, body, idempotencyKey) => builderRequest(`/projects/${encodeURIComponent(projectId)}/deployments`, { method: 'POST', body, idempotencyKey }),
};
