import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const publicPort = Number(process.env.PORT || 10000);
const internalApiPort = Number(process.env.INTERNAL_API_PORT || 4001);
const rootDir = resolve(process.cwd());
const distDir = join(rootDir, 'dist');
const backendDir = join(rootDir, 'backend');
const backendOrigin = `http://127.0.0.1:${internalApiPort}`;

const childEnv = { ...process.env };
delete childEnv.PORT;
childEnv.APP_PORT = String(internalApiPort);
childEnv.APP_URL = process.env.APP_URL || `http://127.0.0.1:${internalApiPort}`;
childEnv.API_BASE_URL = process.env.API_BASE_URL || `${childEnv.APP_URL}/api/v1`;
childEnv.FRONTEND_URL = process.env.FRONTEND_URL || `http://127.0.0.1:${publicPort}`;
childEnv.CORS_ORIGINS = [
  childEnv.CORS_ORIGINS || '',
  childEnv.FRONTEND_URL,
].filter(Boolean).join(',');

const backend = spawn('sh', ['start.sh'], {
  cwd: backendDir,
  env: childEnv,
  stdio: ['ignore', 'inherit', 'inherit'],
});

backend.on('exit', (code, signal) => {
  console.error(`[single-service] Backend exited with code=${code} signal=${signal}`);
  process.exit(code || 1);
});

process.on('SIGTERM', () => {
  backend.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  backend.kill('SIGINT');
  process.exit(0);
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = decodedPath.replace(/^\/+/, '');
  let filePath = resolve(distDir, safePath);

  if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  const ext = extname(filePath);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  const targetUrl = new URL(req.url || '/', backendOrigin);
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${internalApiPort}`,
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('[single-service] API proxy error:', error.message);
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Backend is starting. Refresh in a moment.' } }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`[single-service] Serving React from ${distDir}`);
  console.log(`[single-service] Public port ${publicPort}, backend internal ${backendOrigin}`);
});
