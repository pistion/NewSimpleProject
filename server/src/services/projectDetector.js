import fs from 'node:fs/promises';
import path from 'node:path';

export async function detectProject(siteDir, files = []) {
  const set = new Set(files);
  let pkg = null;
  if (set.has('package.json')) {
    try { pkg = JSON.parse(await fs.readFile(path.join(siteDir, 'package.json'), 'utf8')); } catch { pkg = null; }
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts = pkg?.scripts || {};
  const nodeVersion = pkg?.engines?.node || await readOptionalText(siteDir, '.nvmrc') || await readOptionalText(siteDir, '.node-version') || null;

  if (pkg) {
    if (deps.next || set.has('next.config.js') || set.has('next.config.mjs')) return preset('next-source', 'Next.js', 'web_service', 'npm run build', '.next', 'npm start', 'node', nodeVersion);
    if (deps['@remix-run/node'] || deps['@remix-run/react'] || set.has('remix.config.js')) return preset('remix-source', 'Remix', 'web_service', 'npm run build', 'build', 'npm start', 'node', nodeVersion);
    if (deps['@sveltejs/kit'] || set.has('svelte.config.js')) return preset('svelte-source', 'SvelteKit', 'web_service', 'npm run build', 'build', 'node build', 'node', nodeVersion);
    if (deps.vite || set.has('vite.config.js') || set.has('vite.config.ts') || set.has('vite.config.mjs')) return preset('vite-source', 'Vite', 'static_site', 'npm run build', 'dist', null, null, nodeVersion);
    if (deps.astro || set.has('astro.config.mjs')) return preset('astro-source', 'Astro', 'static_site', 'npm run build', 'dist', null, null, nodeVersion);
    if (deps.gatsby || set.has('gatsby-config.js')) return preset('gatsby-source', 'Gatsby', 'static_site', 'npm run build', 'public', null, null, nodeVersion);
    if (deps['react-scripts']) return preset('cra-source', 'Create React App', 'static_site', 'npm run build', 'build', null, null, nodeVersion);
    if (scripts.start || set.has('server.js') || set.has('app.js') || set.has('src/server.js')) return preset('node-server', 'Node.js server', 'web_service', scripts.build ? 'npm run build' : 'npm install', '.', scripts.start ? 'npm start' : 'node server.js', 'node', nodeVersion);
    return preset('node-source', 'Node static app', 'static_site', scripts.build ? 'npm run build' : null, scripts.build ? 'dist' : '.');
  }

  if (set.has('dist/index.html')) return preset('prebuilt-dist', 'Prebuilt (dist)', 'static_site', null, 'dist');
  if (set.has('build/index.html')) return preset('prebuilt-build', 'Prebuilt (build)', 'static_site', null, 'build');
  if (set.has('out/index.html')) return preset('prebuilt-out', 'Prebuilt (out)', 'static_site', null, 'out');
  if (set.has('index.html')) return preset('static-root-html', 'Static HTML', 'static_site', null, '.');
  if (set.has('public/index.html')) return preset('public-static-html', 'Public Static HTML', 'static_site', null, 'public');
  return preset('unknown', 'Unknown', 'static_site', null, '.');
}

function preset(type, framework, serviceType, detectedBuildCommand, publishDirectory, detectedStartCommand = null, runtime = null, nodeVersion = null) {
  return { type, projectType: type, framework, serviceType, detectedServiceType: serviceType, detectedBuildCommand, buildCommand: 'bash glondia-render-build.sh', publishDirectory, detectedPublishDirectory: publishDirectory, detectedStartCommand, startCommand: detectedStartCommand, runtime, nodeVersion };
}

async function readOptionalText(dir, filename) {
  try { return (await fs.readFile(path.join(dir, filename), 'utf8')).trim() || null; } catch { return null; }
}
