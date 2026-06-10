/**
 * templateAiGithub.service.js — 02-TEMPLATE-AI-ENGINE
 *
 * Handles pushing the AI-generated site ZIP to GitHub:
 *
 *  1. Extract the ZIP in memory (no temp files on disk)
 *  2. Push each file to the target GitHub repo under templates/{slug}/
 *  3. Delete the local ZIP buffer (GC handles it — no disk writes)
 *  4. Return the repo URL, branch, and template path for Render config
 *
 * Target repo: RENDER_GENERATED_SITES_REPO_URL (env)
 *   e.g. https://github.com/pistion/glondia-generated-sites
 *
 * Auth: GITHUB_GENERATED_SITES_TOKEN (fine-grained PAT with repo write scope)
 *
 * File placement:
 *   templates/{slug}/         ← the deployed site folder
 *   templates/{slug}/package.json
 *   templates/{slug}/src/...
 *   etc.
 */

import AdmZip from 'adm-zip';

const GITHUB_API = 'https://api.github.com';

function getGithubToken() {
  const token = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_GENERATED_SITES_TOKEN is not set. Cannot push to GitHub.');
  return token;
}

function parseRepoFromUrl(repoUrl) {
  // Supports: https://github.com/owner/repo or https://github.com/owner/repo.git
  const match = String(repoUrl || '').match(/github\.com\/([^/]+)\/([^/.\s]+)/);
  if (!match) throw new Error(`Cannot parse GitHub repo URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

function githubHeaders(token) {
  return {
    Authorization : `Bearer ${token}`,
    Accept        : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent'  : 'glondia-template-ai/1.0'
  };
}

/**
 * Get the current SHA of a file (needed for updates).
 * Returns null if file doesn't exist yet.
 */
async function getFileSha(owner, repo, filePath, branch, token) {
  try {
    const resp = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
      { headers: githubHeaders(token) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

/**
 * Push or update a single file in the GitHub repo.
 */
async function pushFile(owner, repo, filePath, content, branch, token, commitMessage) {
  const existingSha = await getFileSha(owner, repo, filePath, branch, token);
  const body = {
    message: commitMessage,
    content: Buffer.from(content).toString('base64'),
    branch
  };
  if (existingSha) body.sha = existingSha;

  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method : 'PUT',
      headers: githubHeaders(token),
      body   : JSON.stringify(body)
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`GitHub push failed for ${filePath}: ${err.message || resp.status}`);
  }

  return resp.json();
}

/**
 * Push the AI-generated ZIP to GitHub.
 *
 * @param {object} params
 * @param {Buffer} params.zipBuffer
 * @param {string} params.slug
 * @param {string} params.deployId
 * @param {string} params.clientId
 * @param {string} params.templateId
 * @param {object} params.clientConfig
 * @returns {{ repoUrl, branch, templatePath, filespushed, commitSha }}
 */
export async function pushGeneratedSiteToGitHub({ zipBuffer, slug, deployId, clientId, templateId, clientConfig }) {
  const token   = getGithubToken();
  const repoUrl = process.env.RENDER_GENERATED_SITES_REPO_URL
                  || 'https://github.com/pistion/glondia-generated-sites';
  const { owner, repo } = parseRepoFromUrl(repoUrl);
  const branch  = process.env.GITHUB_DEFAULT_BRANCH || 'main';

  // Extract ZIP in memory
  const zip   = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  console.log(`[template-ai-github] pushing ${entries.length} files → ${owner}/${repo}/templates/${slug}/`);

  const commitMessage = `feat(template-ai): deploy ${slug} [${deployId}] — ${templateId} template`;
  const filespushed   = [];
  let   lastCommit    = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // entry.entryName is like: slug/src/App.jsx
    // We strip the leading slug/ prefix and place under templates/{slug}/
    const entryName    = entry.entryName.replace(/\\/g, '/');
    const strippedPath = entryName.startsWith(`${slug}/`)
      ? entryName.slice(slug.length + 1)
      : entryName;

    const targetPath = `templates/${slug}/${strippedPath}`;
    const content    = entry.getData(); // Buffer

    try {
      const result = await pushFile(owner, repo, targetPath, content, branch, token, commitMessage);
      filespushed.push(targetPath);
      lastCommit = result?.commit?.sha || lastCommit;
    } catch (err) {
      console.warn(`[template-ai-github] skipped ${targetPath}: ${err.message}`);
    }
  }

  // Also push a deploy manifest
  const manifest = JSON.stringify({
    deployId,
    clientId,
    templateId,
    slug,
    pushedAt  : new Date().toISOString(),
    filesCount: filespushed.length,
    config    : {
      businessName : clientConfig.businessName,
      industry     : clientConfig.industry,
      contactEmail : clientConfig.contactEmail
    }
  }, null, 2);

  try {
    await pushFile(owner, repo, `templates/${slug}/_deploy-manifest.json`, manifest, branch, token, commitMessage);
    filespushed.push(`templates/${slug}/_deploy-manifest.json`);
  } catch (err) {
    console.warn('[template-ai-github] manifest push failed:', err.message);
  }

  console.log(`[template-ai-github] ✓ pushed ${filespushed.length} files. Last commit: ${lastCommit}`);

  return {
    repoUrl     : `https://github.com/${owner}/${repo}`,
    branch,
    templatePath: `templates/${slug}`,
    filespushed: filespushed.length,
    commitSha   : lastCommit,
    githubUrl   : `https://github.com/${owner}/${repo}/tree/${branch}/templates/${slug}`
  };
}
