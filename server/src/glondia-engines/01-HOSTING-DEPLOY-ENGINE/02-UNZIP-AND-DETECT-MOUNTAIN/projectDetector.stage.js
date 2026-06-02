/**
 * projectDetector.stage.js — 02-UNZIP-AND-DETECT-MOUNTAIN
 *
 * Detect the project framework and build settings from extracted files.
 * Returns a preset with all deployment-relevant fields populated.
 *
 * Moved from: server/src/services/projectDetector.js
 * Original kept as a thin re-export for backward compatibility.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { stageFail, stageStart, stageSuccess } from '../../00-SHARED/stageLogger.js';
import { detectEnvHints } from './envHintDetector.stage.js';

export async function runStage(context) {
  const stageName = 'project_detection';
  stageStart(context, stageName, context.source?.localDir || null);
  try {
    const detected = await detectProject(context.source.localDir, context.source.files || []);
    context.project = {
      ...context.project,
      ...detected,
      publishDirectory: detected.publishDirectory,
    };
    context.detected = detected;
    stageSuccess(context, stageName, `${detected.framework} (${detected.type})`);
    return context;
  } catch (error) {
    stageFail(context, stageName, error);
    throw error;
  }
}

/**
 * Detect project type from extracted file list and optional package.json.
 *
 * @param {string}   siteDir  Absolute path to extracted directory
 * @param {string[]} files    Relative file paths returned by extractZipSafely
 * @returns {ProjectDetection}
 */
export async function detectProject(siteDir, files = []) {
  const detection = await detectProjectCore(siteDir, files);
  try {
    detection.envHints = await detectEnvHints(siteDir, files);
  } catch {
    detection.envHints = { requiredEnv: [], optionalEnv: [], publicEnv: [], databaseHints: [], riskLevel: 'low', messages: [] };
  }
  return detection;
}

async function detectProjectCore(siteDir, files = []) {
  const set = new Set(files);
  let pkg   = null;

  if (set.has('package.json')) {
    try {
      pkg = JSON.parse(await fs.readFile(path.join(siteDir, 'package.json'), 'utf8'));
    } catch {
      pkg = null;
    }
  }

  const deps        = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts     = pkg?.scripts || {};
  const nodeVersion = pkg?.engines?.node
    || await readOptionalText(siteDir, '.nvmrc')
    || await readOptionalText(siteDir, '.node-version')
    || null;

  if (pkg) {
    if (deps.next || set.has('next.config.js') || set.has('next.config.mjs'))
      return preset('next-source', 'Next.js', 'web_service', 'npm run build', '.next', 'npm start', 'node', nodeVersion);

    if (deps['@remix-run/node'] || deps['@remix-run/react'] || set.has('remix.config.js'))
      return preset('remix-source', 'Remix', 'web_service', 'npm run build', 'build', 'npm start', 'node', nodeVersion);

    if (deps['@sveltejs/kit'] || set.has('svelte.config.js'))
      return preset('svelte-source', 'SvelteKit', 'web_service', 'npm run build', 'build', 'node build', 'node', nodeVersion);

    if (deps.vite || set.has('vite.config.js') || set.has('vite.config.ts') || set.has('vite.config.mjs'))
      return preset('vite-source', 'Vite', 'static_site', 'npm run build', 'dist', null, null, nodeVersion);

    if (deps.astro || set.has('astro.config.mjs'))
      return preset('astro-source', 'Astro', 'static_site', 'npm run build', 'dist', null, null, nodeVersion);

    if (deps.gatsby || set.has('gatsby-config.js'))
      return preset('gatsby-source', 'Gatsby', 'static_site', 'npm run build', 'public', null, null, nodeVersion);

    if (deps['react-scripts'])
      return preset('cra-source', 'Create React App', 'static_site', 'npm run build', 'build', null, null, nodeVersion);

    if (scripts.start || set.has('server.js') || set.has('app.js') || set.has('src/server.js'))
      return preset(
        'node-server', 'Node.js server', 'web_service',
        // No build script → no build command. buildScriptWriter still installs
        // dependencies, so returning 'npm install' here would install twice.
        scripts.build ? 'npm run build' : null,
        '.', scripts.start ? 'npm start' : 'node server.js',
        'node', nodeVersion,
      );

    return preset('node-source', 'Node static app', 'static_site', scripts.build ? 'npm run build' : null, scripts.build ? 'dist' : '.');
  }

  // No package.json — prebuilt or static HTML
  if (set.has('dist/index.html'))    return preset('prebuilt-dist',   'Prebuilt (dist)',  'static_site', null, 'dist');
  if (set.has('build/index.html'))   return preset('prebuilt-build',  'Prebuilt (build)', 'static_site', null, 'build');
  if (set.has('out/index.html'))     return preset('prebuilt-out',    'Prebuilt (out)',   'static_site', null, 'out');
  if (set.has('index.html'))         return preset('static-root-html','Static HTML',      'static_site', null, '.');
  if (set.has('public/index.html'))  return preset('public-static-html','Public Static HTML','static_site',null,'public');
  return preset('unknown', 'Unknown', 'static_site', null, '.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function preset(type, framework, serviceType, detectedBuildCommand, publishDirectory, detectedStartCommand = null, runtime = null, nodeVersion = null) {
  return {
    type,
    projectType:           type,
    framework,
    serviceType,
    detectedServiceType:   serviceType,
    detectedBuildCommand,
    // All deployments use glondia-render-build.sh as the Render build command.
    // The real build command is embedded inside that script by buildScriptWriter.
    buildCommand:          'bash glondia-render-build.sh',
    publishDirectory,
    detectedPublishDirectory: publishDirectory,
    detectedStartCommand,
    startCommand:          detectedStartCommand,
    runtime,
    nodeVersion,
  };
}

async function readOptionalText(dir, filename) {
  try {
    return (await fs.readFile(path.join(dir, filename), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}
