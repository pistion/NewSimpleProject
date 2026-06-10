/**
 * deploy.stage.js — 07-HANDOFF-DEPLOY
 *
 * Sole purpose:
 *   1. Pre-flight checks (ZIP validity, .gitignore-style exclusions, misconfig detection)
 *   2. Scan the generated site directory
 *   3. Push to GitHub (via existing publisher service)
 *   4. Hand off to 01-HOSTING-DEPLOY-ENGINE (done by controller after this stage)
 *
 * SECURITY: Never reads or logs .env files, API keys, tokens, or private keys.
 * Secrets are extracted and passed only as Render environment variables via the hosting engine.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import {
  publishGeneratedSiteToGitHub,
  githubPublisherConfigured,
} from '../../../../services/githubGeneratedSitePublisher.service.js';

// Files/patterns that must never be committed to GitHub
const EXCLUDED_PATTERNS = [
  /^\.env$/i,
  /^\.env\..+$/i,
  /\/\.env$/i,
  /\/\.env\..+$/i,
  /^node_modules\//,
  /\/node_modules\//,
  /\.pem$/i,
  /\.key$/i,
  /^\.git\//,
  /secrets?\./i,
  /credentials?\./i,
  /private.*key/i,
  /api[_-]?keys?\./i,
];

// Files that indicate a misconfiguration
const MISCONFIG_SIGNALS = [
  { pattern: /^\.env$/, message: '.env file found in site root — secrets must not be committed.' },
  { pattern: /node_modules/, message: 'node_modules directory found — run npm install at deploy time, not during packaging.' },
  { pattern: /package-lock\.json$/, message: 'package-lock.json found — this is acceptable but large; consider .gitignoring it.' },
];

export async function runDeployStage(options = {}) {
  const { siteDir, siteId, userId, siteName, slug, templateId, repoUrl, branch = 'main', rootDirectory, buildCommand, publishDirectory, framework, packageManager } = options;

  if (!siteDir || !existsSync(siteDir)) {
    throw Object.assign(new Error('Generated site directory not found. Cannot deploy.'), { status: 400, expose: true, code: 'DEPLOY_NO_SITE_DIR' });
  }

  // ── 1. Pre-flight: file scan ───────────────────────────────────────────────
  const allFiles = await listFilesRelative(siteDir);

  const excluded = allFiles.filter(f => EXCLUDED_PATTERNS.some(p => p.test(f)));
  if (excluded.length > 0) {
    throw Object.assign(
      new Error(`Deployment blocked: sensitive files detected — ${excluded.join(', ')}. These must never be committed to GitHub.`),
      { status: 400, expose: true, code: 'DEPLOY_SENSITIVE_FILES' },
    );
  }

  const warnings = [];
  for (const { pattern, message } of MISCONFIG_SIGNALS) {
    if (allFiles.some(f => pattern.test(f))) warnings.push(message);
  }

  // ── 2. Verify ZIP-like structure (must have at least one deployable file) ──
  const deployableExtensions = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.svg'];
  const hasDeployableFiles = allFiles.some(f => deployableExtensions.includes(extname(f).toLowerCase()));
  if (!hasDeployableFiles) {
    throw Object.assign(
      new Error('No deployable files found in the generated site directory.'),
      { status: 400, expose: true, code: 'DEPLOY_NO_DEPLOYABLE_FILES' },
    );
  }

  // ── 3. Push to GitHub ──────────────────────────────────────────────────────
  if (!githubPublisherConfigured()) {
    return {
      scanned: true,
      fileCount: allFiles.length,
      warnings,
      githubPushed: false,
      githubSkipped: true,
      githubSkipReason: 'GitHub publisher not configured — skipping push.',
      rootDirectory: rootDirectory || '',
    };
  }

  const githubResult = await publishGeneratedSiteToGitHub({
    siteDir,
    targetRoot: rootDirectory || `generated-template-sites/anonymous/${siteId}-${slug}`,
    repoUrl: repoUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL,
    branch,
    commitMessage: `feat: deploy site ${slug || siteId} from template ${templateId || 'unknown'}`,
    userId,
    siteId,
    siteName,
    slug,
    templateId,
  });

  return {
    scanned: true,
    fileCount: allFiles.length,
    warnings,
    githubPushed: true,
    githubResult,
    rootDirectory: rootDirectory || githubResult?.rootDirectory || '',
    buildCommand: buildCommand || 'npm run build',
    publishDirectory: publishDirectory || 'dist',
    branch,
    framework: framework || 'vite',
    packageManager: packageManager || 'npm',
  };
}

async function listFilesRelative(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRelative(fullPath)).map(f => `${entry.name}/${f}`));
    if (entry.isFile()) files.push(entry.name);
  }
  return files;
}
