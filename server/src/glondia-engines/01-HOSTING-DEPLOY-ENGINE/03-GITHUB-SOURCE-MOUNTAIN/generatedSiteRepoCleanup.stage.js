import { getGithubInstallationToken } from './githubAppAuth.stage.js';
import { cleanGithubToken } from '../../00-SHARED/runtimeConfig.js';
import { parseGitHubRepoUrl } from './generatedSitesRepoPublisher.stage.js';

const DEFAULT_BRANCH = 'main';

export async function archiveGeneratedSiteFolder({
  repoUrl,
  branch = DEFAULT_BRANCH,
  targetRoot,
  archiveRoot = '_deleted',
  reason = 'deployment_deleted',
} = {}) {
  const parsed = parseGitHubRepoUrl(repoUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '');
  if (!parsed) return { attempted: false, skippedReason: 'No valid generated-sites repository URL was provided.' };

  const sourceRoot = cleanPath(targetRoot);
  if (!isSafeGeneratedTemplateRoot(sourceRoot)) {
    return { attempted: false, skippedReason: `Refusing to archive unsafe generated template root: ${sourceRoot || '(empty)'}` };
  }

  let { token, skippedReason } = await resolveCleanupToken();
  if (!token) return { attempted: false, skippedReason };

  const tree = await listTree({ ...parsed, branch, token });
  const sourcePrefix = `${sourceRoot}/`;
  const files = tree.filter((item) => item.type === 'blob' && item.path.startsWith(sourcePrefix));
  if (!files.length) return { attempted: true, archivedCount: 0, deletedCount: 0, sourceRoot, skippedReason: 'No files found at source root.' };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destinationRoot = cleanPath(`${archiveRoot}/${sourceRoot}/${stamp}`);
  const archived = [];
  const errors = [];

  for (const file of files) {
    try {
      const content = await getBlobContent({ ...parsed, sha: file.sha, token });
      await putFile({
        ...parsed,
        branch,
        token,
        path: `${destinationRoot}/${file.path.slice(sourcePrefix.length)}`,
        contentBase64: content,
        message: `Archive generated template site (${reason}): ${sourceRoot}`,
      });
      archived.push(file.path);
    } catch (error) {
      errors.push({ path: file.path, message: error.message });
    }
  }

  if (!errors.length) {
    for (const file of files) {
      try {
        await deleteFile({
          ...parsed,
          branch,
          token,
          path: file.path,
          sha: file.sha,
          message: `Remove generated template site (${reason}): ${sourceRoot}`,
        });
      } catch (error) {
        errors.push({ path: file.path, message: error.message });
      }
    }
  }

  return {
    attempted: true,
    repository: `${parsed.owner}/${parsed.repo}`,
    branch,
    sourceRoot,
    archiveRoot: destinationRoot,
    archivedCount: archived.length,
    deletedCount: errors.length ? 0 : files.length,
    errors,
  };
}

async function resolveCleanupToken() {
  let token = cleanGithubToken(
    process.env.GITHUB_GENERATED_SITES_TOKEN ||
    process.env.GENERATED_SITES_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '',
  );
  if (!token) return { token: '', skippedReason: 'Missing GITHUB_GENERATED_SITES_TOKEN for generated template cleanup.' };
  if (token.startsWith('-----BEGIN')) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return { token: '', skippedReason: 'GITHUB_CLIENT_ID is required when cleanup token is a GitHub App private key.' };
    token = await getGithubInstallationToken({ clientId, privateKey: token });
  }
  return { token, skippedReason: null };
}

async function listTree({ owner, repo, branch, token }) {
  const ref = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const sha = ref?.object?.sha;
  if (!sha) throw new Error(`Could not resolve ${branch} branch.`);
  const tree = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`, token);
  return Array.isArray(tree?.tree) ? tree.tree : [];
}

async function getBlobContent({ owner, repo, sha, token }) {
  const blob = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`, token);
  if (blob?.encoding !== 'base64' || !blob?.content) throw new Error(`Could not read blob ${sha}.`);
  return String(blob.content).replace(/\s/g, '');
}

async function putFile({ owner, repo, branch, token, path, contentBase64, message }) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}`, {
    method: 'PUT',
    headers: githubHeaders(token),
    body: JSON.stringify({ branch, message, content: contentBase64 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `GitHub archive write failed for ${path}.`);
}

async function deleteFile({ owner, repo, branch, token, path, sha, message }) {
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeRepoPath(path)}`, {
    method: 'DELETE',
    headers: githubHeaders(token),
    body: JSON.stringify({ branch, message, sha }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `GitHub source delete failed for ${path}.`);
}

async function githubJson(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `GitHub request failed with ${response.status}.`);
  return body;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'GlondiaSites-GeneratedSiteCleanup',
  };
}

function isSafeGeneratedTemplateRoot(value = '') {
  const root = cleanPath(process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR || process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR || 'generated-template-sites');
  const parts = value.split('/').filter(Boolean);
  return value.startsWith(`${root}/`) && parts.length >= 3 && !parts.includes('..');
}

function encodeRepoPath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function cleanPath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
