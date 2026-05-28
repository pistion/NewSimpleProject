import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const fallbackDataDir = join(rootDir, '.glondia-data');
const dataDir = resolve(process.env.DATA_DIR || fallbackDataDir);
const generatedRoot = join(dataDir, 'generated-sites');

export async function generateViteStaticSiteFromTemplateSite(site, options = {}) {
  if (!site?.siteId) throw new Error('site.siteId is required to generate a static site.');
  const pages = Array.isArray(site.pages) ? site.pages : [];
  if (pages.length === 0) throw new Error('Cannot generate static site without tailored pages.');

  const siteName = options.siteName || site.answers?.businessName || site.templateId || site.siteId;
  const slug = slugify(options.slug || siteName || site.siteId);
  const siteDir = join(generatedRoot, site.siteId);
  const srcDir = join(siteDir, 'src');
  const dataOutDir = join(srcDir, 'data');

  await mkdir(dataOutDir, { recursive: true });

  const safePages = pages.map((page, index) => ({
    title: page.title || `Page ${index + 1}`,
    path: normalizePath(page.path, index),
    html: String(page.html || ''),
  }));

  const siteProfile = {
    ...(site.answers || {}),
    siteId: site.siteId,
    parentTemplateId: site.templateId,
    siteName,
    slug,
    generatedAt: new Date().toISOString(),
  };

  const files = {
    'package.json': JSON.stringify({
      name: slug,
      private: true,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        '@vitejs/plugin-react': '^4.2.1',
        vite: '^5.2.0',
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {},
    }, null, 2),
    'index.html': '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>' + escapeHtml(siteName) + '</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n',
    'vite.config.js': "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n",
    'src/main.jsx': "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App.jsx';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')).render(<App />);\n",
    'src/App.jsx': buildReactAppSource(),
    'src/styles.css': buildCssSource(),
    'src/data/siteProfile.json': JSON.stringify(siteProfile, null, 2),
    'src/data/pages.json': JSON.stringify(safePages, null, 2),
  };

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(join(siteDir, relativePath), content, 'utf8');
  }

  return {
    siteDir,
    sourceType: 'generated-vite-react-static-site',
    framework: 'vite-react',
    packageManager: 'npm',
    buildCommand: options.buildCommand || 'npm install && npm run build',
    publishDirectory: options.publishDirectory || 'dist',
    files: Object.keys(files),
    pages: safePages.map(({ title, path }) => ({ title, path })),
    siteProfile,
  };
}

function buildReactAppSource() {
  return `import React from 'react';
import pages from './data/pages.json';
import siteProfile from './data/siteProfile.json';

function normalisePath(path) {
  if (!path || path === '/') return '/';
  return path.startsWith('/') ? path : '/' + path;
}

export default function App() {
  const [activePath, setActivePath] = React.useState(() => normalisePath(window.location.pathname));
  const activePage = pages.find((page) => normalisePath(page.path) === activePath) || pages[0];

  React.useEffect(() => {
    document.title = siteProfile.siteName || activePage?.title || 'Website';
  }, [activePage]);

  const goTo = (page) => {
    const nextPath = normalisePath(page.path);
    window.history.pushState({}, '', nextPath);
    setActivePath(nextPath);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  React.useEffect(() => {
    const onPop = () => setActivePath(normalisePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <main className="generated-site-shell">
      {pages.length > 1 && (
        <nav className="generated-site-nav">
          <strong>{siteProfile.siteName}</strong>
          <div>
            {pages.map((page) => (
              <button key={page.path} onClick={() => goTo(page)} className={activePage?.path === page.path ? 'active' : ''}>
                {page.title}
              </button>
            ))}
          </div>
        </nav>
      )}
      <section className="generated-site-page" dangerouslySetInnerHTML={{ __html: activePage?.html || '' }} />
    </main>
  );
}
`;
}

function buildCssSource() {
  return `* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #111; }
.generated-site-shell { min-height: 100vh; }
.generated-site-nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; background: rgba(255,255,255,.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,.08); }
.generated-site-nav div { display: flex; gap: 8px; flex-wrap: wrap; }
.generated-site-nav button { border: 1px solid rgba(0,0,0,.12); background: #fff; border-radius: 999px; padding: 7px 12px; cursor: pointer; font: inherit; }
.generated-site-nav button.active { background: #111; color: #fff; }
.generated-site-page { min-height: 100vh; }
.generated-site-page > html,
.generated-site-page > body { display: contents; }
`;
}

function normalizePath(path, index) {
  if (path && typeof path === 'string') return path.startsWith('/') ? path : `/${path}`;
  return index === 0 ? '/' : `/page-${index + 1}`;
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}
