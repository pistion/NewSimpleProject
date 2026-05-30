const PLACEHOLDER_PATTERNS = ['your_', 'xxx', 'example', 'replace_me', 'change_me', 'YOUR_USER_OR_ORG', 'YOUR_ORG_OR_USER'];

export function isBlank(value) {
  return !String(value || '').trim();
}

export function isPlaceholder(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => text.toLowerCase().includes(String(pattern).toLowerCase()));
}

export function hasRealValue(value) {
  return !isBlank(value) && !isPlaceholder(value);
}

export function normalizeRoot(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/g, '');
}

export function getRuntimeConfig() {
  const renderApiKey = process.env.RENDER_API_KEY;
  const renderOwnerId = process.env.RENDER_OWNER_ID;
  const generatedRepo = process.env.RENDER_GENERATED_SITES_REPO_URL;
  const githubToken = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN;

  return {
    renderConfigured: hasRealValue(renderApiKey) && hasRealValue(renderOwnerId),
    githubPublisherConfigured: hasRealValue(generatedRepo) && hasRealValue(githubToken),
    generatedSitesRepo: hasRealValue(generatedRepo) ? generatedRepo : '',
    githubPublisherToken: hasRealValue(githubToken) ? githubToken : '',
    generatedSitesRootDir: normalizeRoot(process.env.RENDER_GENERATED_SITES_ROOT_DIR || 'uploaded-sites'),
    missingRender: [!hasRealValue(renderApiKey) ? 'RENDER_API_KEY' : null, !hasRealValue(renderOwnerId) ? 'RENDER_OWNER_ID' : null].filter(Boolean),
    missingGithubPublisher: [!hasRealValue(generatedRepo) ? 'RENDER_GENERATED_SITES_REPO_URL' : null, !hasRealValue(githubToken) ? 'GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN' : null].filter(Boolean),
  };
}
