/**
 * deployModeResolver.stage.js — 02-UNZIP-AND-DETECT-MOUNTAIN
 *
 * Normalizes a user-selected deploy mode (or `auto`) against the detected
 * project to produce the concrete Render settings (serviceType, buildCommand,
 * publishDirectory, startCommand, runtime). Builds on projectDetector output —
 * it does NOT re-detect the framework.
 *
 * Modes:
 *   auto                 — use the detected result as-is.
 *   static_public_folder — publish a prebuilt front-end (public/ or repo root).
 *   static_build         — run a build, publish dist/build/out.
 *   web_service          — long-running server; requires a start command.
 *   custom_commands      — use the build/start/publish the user supplied.
 */

export const DEPLOY_MODES = ['auto', 'static_public_folder', 'static_build', 'web_service', 'custom_commands'];

const STATIC_BUILD_DIR_BY_FRAMEWORK = [
  [/next/i, '.next'],
  [/gatsby/i, 'public'],
  [/(vite|vue|astro)/i, 'dist'],
  [/(create react app|cra|react)/i, 'build'],
  [/(remix|svelte)/i, 'build'],
];

export function normalizeDeployMode(value) {
  const mode = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (DEPLOY_MODES.includes(mode)) return mode;
  // Friendly aliases from the UI.
  if (['static', 'frontend', 'front_end', 'static_site'].includes(mode)) return 'static_build';
  if (['public', 'public_folder', 'prebuilt'].includes(mode)) return 'static_public_folder';
  if (['web', 'server', 'fullapp', 'full_app', 'app'].includes(mode)) return 'web_service';
  if (['custom'].includes(mode)) return 'custom_commands';
  return 'auto';
}

/**
 * @param {object} args
 * @param {object} args.detected     Output from detectProject (framework, serviceType, publishDirectory, startCommand...).
 * @param {string} [args.selectedMode]  User selection (auto by default).
 * @param {object} [args.fields]      Build/start/publish overrides from the request.
 * @param {string[]} [args.files]     Relative file list for capability checks.
 */
export function resolveDeployMode({ detected = {}, selectedMode = 'auto', fields = {}, files = [] } = {}) {
  const mode = normalizeDeployMode(selectedMode);
  const fileSet = new Set(files);
  const warnings = [];

  const detectedServiceType = detected.serviceType || detected.detectedServiceType || 'static_site';
  const detectedPublish = detected.publishDirectory || detected.detectedPublishDirectory || 'dist';
  const detectedBuild = detected.detectedBuildCommand ?? (detected.buildCommand && detected.buildCommand !== 'bash glondia-render-build.sh' ? detected.buildCommand : null);
  const detectedStart = detected.startCommand || detected.detectedStartCommand || null;

  const overrideBuild = pick(fields.buildCommand, fields.projectBuildCommand);
  const overrideStart = pick(fields.startCommand);
  const overridePublish = pick(fields.publishDirectory, fields.outputDirectory);

  let result;
  switch (mode) {
    case 'static_public_folder': {
      const hasPublicIndex = fileSet.has('public/index.html');
      const publishDirectory = overridePublish || (hasPublicIndex ? 'public' : (fileSet.has('index.html') ? '.' : detectedPublish));
      if (!hasPublicIndex && !fileSet.has('index.html')) {
        warnings.push('No public/index.html or root index.html found — static front-end mode may publish an empty directory.');
      }
      result = {
        serviceType: 'static_site',
        buildCommand: overrideBuild || null,
        publishDirectory,
        startCommand: null,
        runtime: null,
        confidence: hasPublicIndex || fileSet.has('index.html') ? 'high' : 'low',
      };
      break;
    }
    case 'static_build': {
      const publishDirectory = overridePublish || buildDirForFramework(detected.framework) || detectedPublish || 'dist';
      result = {
        serviceType: 'static_site',
        buildCommand: overrideBuild || detectedBuild || 'npm run build',
        publishDirectory,
        startCommand: null,
        runtime: null,
        confidence: detectedBuild ? 'high' : 'medium',
      };
      break;
    }
    case 'web_service': {
      const startCommand = overrideStart || detectedStart || 'npm start';
      if (!overrideStart && !detectedStart) {
        warnings.push('No start command detected — defaulting to "npm start". Provide a start command if your server uses a different entry point.');
      }
      result = {
        serviceType: 'web_service',
        buildCommand: overrideBuild || detectedBuild || 'npm install',
        publishDirectory: overridePublish || detectedPublish || '.',
        startCommand,
        runtime: pick(fields.runtime) || detected.runtime || 'node',
        confidence: detectedStart || detectedServiceType === 'web_service' ? 'high' : 'medium',
      };
      break;
    }
    case 'custom_commands': {
      if (!overrideBuild && !overrideStart && !overridePublish) {
        warnings.push('Custom commands mode selected but no overrides supplied — falling back to detected values.');
      }
      const serviceType = overrideStart ? 'web_service' : detectedServiceType;
      result = {
        serviceType,
        buildCommand: overrideBuild ?? detectedBuild,
        publishDirectory: overridePublish || detectedPublish,
        startCommand: serviceType === 'web_service' ? (overrideStart || detectedStart || 'npm start') : null,
        runtime: serviceType === 'web_service' ? (pick(fields.runtime) || detected.runtime || 'node') : null,
        confidence: 'medium',
      };
      break;
    }
    case 'auto':
    default: {
      result = {
        serviceType: detectedServiceType,
        buildCommand: detectedBuild,
        publishDirectory: detectedPublish,
        startCommand: detectedServiceType === 'web_service' ? detectedStart : null,
        runtime: detectedServiceType === 'web_service' ? (detected.runtime || 'node') : null,
        confidence: detected.type && detected.type !== 'unknown' ? 'high' : 'low',
      };
      break;
    }
  }

  return {
    mode,
    serviceType: result.serviceType,
    buildCommand: result.buildCommand,
    publishDirectory: result.publishDirectory,
    startCommand: result.startCommand,
    runtime: result.runtime,
    confidence: result.confidence,
    warnings,
    alternatives: buildAlternatives(detected, fileSet),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAlternatives(detected, fileSet) {
  const alts = [{ mode: 'auto', label: 'Auto (recommended)', description: 'Use what Glondia detected.' }];
  if (fileSet.has('public/index.html') || fileSet.has('index.html')) {
    alts.push({ mode: 'static_public_folder', label: 'Static front-end only', description: 'Publish prebuilt HTML without running a build.' });
  }
  if (detected.detectedBuildCommand || /vite|next|react|vue|svelte|astro|gatsby|remix/i.test(detected.framework || '')) {
    alts.push({ mode: 'static_build', label: 'Static build', description: 'Run npm run build and publish the output folder.' });
  }
  alts.push({ mode: 'web_service', label: 'Full app / web service', description: 'Run a long-lived server with a start command.' });
  alts.push({ mode: 'custom_commands', label: 'Custom commands', description: 'Provide your own build, publish, and start commands.' });
  return alts;
}

function buildDirForFramework(framework) {
  for (const [re, dir] of STATIC_BUILD_DIR_BY_FRAMEWORK) {
    if (re.test(String(framework || ''))) return dir;
  }
  return null;
}

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export default { resolveDeployMode, normalizeDeployMode, DEPLOY_MODES };
