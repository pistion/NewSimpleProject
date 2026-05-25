export function connectGitHubUrl(returnPath = '') {
  return returnPath || '/';
}

export async function getGitHubStatus() {
  return { connected: false, login: null };
}

export async function disconnectGitHub() {
  return { disconnected: true };
}

export async function listGitHubRepos() {
  return [];
}

export async function listGitHubBranches(owner, repo) {
  return [{ name: 'main' }];
}

export function parseGithubRepo(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const ssh = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return normalizeGithubRepo(ssh[1], ssh[2]);

  const shorthand = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand && !raw.includes('://')) return normalizeGithubRepo(shorthand[1], shorthand[2]);

  try {
    const url = new URL(raw);
    if (!/github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    return normalizeGithubRepo(parts[0], parts[1]);
  } catch {
    return null;
  }
}

export async function buildGithubSandbox(input, repo, branch, sandboxId) {
  try {
    const response = await fetch('/api/builder/import-github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: sandboxId,
        repoUrl: input.repoUrl || repo.url,
        branch,
        outputDirectory: input.outputDirectory || 'dist',
      }),
    });
    if (!response.ok) throw new Error(`Sandbox build endpoint returned ${response.status}.`);
    return await response.json();
  } catch (error) {
    return {
      siteId: sandboxId,
      status: 'unavailable',
      previewUrl: null,
      outputDirectory: input.outputDirectory || 'dist',
      logs: [{ ok: false, command: 'sandbox', output: error.message || 'Sandbox build is unavailable.' }],
      error: error.message || 'Sandbox build is unavailable.',
    };
  }
}

export async function fetchGithubSnapshot(repo, branch) {
  if (typeof fetch !== 'function') {
    return emptyGithubSnapshot('GitHub file reading is not available in this runtime.');
  }

  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const treeResponse = await fetch(treeUrl, { headers: { Accept: 'application/vnd.github+json' } });
  if (!treeResponse.ok) {
    throw new Error(treeResponse.status === 404
      ? `Could not read ${repo.fullName} on branch ${branch}. Check that the repo is public and the branch exists.`
      : `GitHub returned ${treeResponse.status} while reading ${repo.fullName}. Try again or upload a ZIP.`);
  }

  const treeData = await treeResponse.json();
  const files = (treeData.tree || [])
    .filter((item) => item.type === 'blob')
    .map((item) => ({ path: item.path, size: item.size || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const preferred = pickGithubFiles(files);
  const contents = {};
  await Promise.all(preferred.map(async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(branch)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(rawUrl);
    if (response.ok) contents[file.path] = await response.text();
  }));

  const entryHtml = contents['index.html'] || contents['public/index.html'] || '';
  return {
    status: 'loaded',
    files,
    contents,
    entryHtml,
    summary: {
      fileCount: files.length,
      loadedFileCount: Object.keys(contents).length,
      hasPackageJson: files.some((file) => file.path === 'package.json'),
      hasIndexHtml: !!entryHtml,
    },
  };
}

function normalizeGithubRepo(owner, repo) {
  const cleanOwner = String(owner || '').trim();
  const cleanRepo = String(repo || '').trim().replace(/\.git$/i, '');
  if (!cleanOwner || !cleanRepo) return null;
  return {
    owner: cleanOwner,
    repo: cleanRepo,
    fullName: `${cleanOwner}/${cleanRepo}`,
    url: `https://github.com/${cleanOwner}/${cleanRepo}`,
  };
}

function emptyGithubSnapshot(message) {
  return {
    status: 'metadata-only',
    files: [],
    contents: {},
    entryHtml: '',
    summary: { fileCount: 0, loadedFileCount: 0, hasPackageJson: false, hasIndexHtml: false, message },
  };
}

function pickGithubFiles(files) {
  const important = ['package.json', 'index.html', 'public/index.html', 'src/main.jsx', 'src/main.tsx', 'src/App.jsx', 'src/App.tsx', 'vite.config.js', 'vite.config.ts'];
  const textExtensions = /\.(html|css|js|jsx|ts|tsx|json|md|txt|yml|yaml)$/i;
  const selected = [];

  important.forEach((path) => {
    const file = files.find((item) => item.path === path);
    if (file && file.size <= 200000) selected.push(file);
  });

  files.forEach((file) => {
    if (selected.length >= 24) return;
    if (selected.some((item) => item.path === file.path)) return;
    if (!textExtensions.test(file.path)) return;
    if (file.size > 120000) return;
    if (/(^|\/)(node_modules|dist|build|\.git|coverage)\//.test(file.path)) return;
    selected.push(file);
  });

  return selected;
}
