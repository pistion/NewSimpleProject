const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { createControllers } = require('../controllers');
const { createRoutes } = require('../routes');
const { fail } = require('../http/api-response');

function compilePath(path) {
  const keys = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { keys, regex: new RegExp(`^${pattern}/?$`) };
}

function parseQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    if (query[key] === undefined) {
      query[key] = value;
    } else if (Array.isArray(query[key])) {
      query[key].push(value);
    } else {
      query[key] = [query[key], value];
    }
  }
  return query;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      const contentType = String(req.headers['content-type'] || '');
      if (contentType.includes('application/json')) {
        try {
          return resolve(JSON.parse(raw));
        } catch (error) {
          error.status = 400;
          return reject(error);
        }
      }
      return resolve({ raw });
    });
    req.on('error', reject);
  });
}

function createResponseAdapter(res) {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      const body = JSON.stringify(payload, null, 2);
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
      });
      res.end(body);
    }
  };
}

function buildRouteTable(controllers = createControllers()) {
  return createRoutes(controllers).map((route) => ({
    ...route,
    ...compilePath(route.path)
  }));
}

function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { route, params };
  }
  return null;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.jsx':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function tryServeStatic(req, res, staticDir) {
  if (!staticDir || req.method !== 'GET') {
    return false;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/api/')) {
    return false;
  }

  pathname = pathname === '/' ? '/index.html' : pathname;
  const requestedPath = path.resolve(staticDir, `.${pathname}`);

  if (!requestedPath.startsWith(path.resolve(staticDir))) {
    sendJson(res, 403, fail('forbidden', 403));
    return true;
  }

  if (!fs.existsSync(requestedPath) || fs.statSync(requestedPath).isDirectory()) {
    return false;
  }

  const body = fs.readFileSync(requestedPath);
  res.writeHead(200, {
    'Content-Type': getContentType(requestedPath),
    'Content-Length': body.length
  });
  res.end(body);
  return true;
}

function createNativeServer(options = {}) {
  const controllers = options.controllers || createControllers(options.database);
  const routes = buildRouteTable(controllers);
  const staticDir = options.staticDir ? path.resolve(options.staticDir) : null;

  const server = http.createServer(async (req, res) => {
    try {
      if (tryServeStatic(req, res, staticDir)) {
        return;
      }

      if (req.method === 'OPTIONS') {
        return sendJson(res, 204, null);
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const matched = matchRoute(routes, req.method, url.pathname);

      if (!matched) {
        return sendJson(res, 404, fail(`route not found: ${req.method} ${url.pathname}`, 404));
      }

      const body = await readBody(req);
      const request = {
        params: matched.params,
        query: parseQuery(url.searchParams),
        body,
        user: req.headers['x-user-id'] ? { id: req.headers['x-user-id'] } : null,
        headers: req.headers
      };

      const response = createResponseAdapter(res);
      const result = await matched.route.handler(request);
      const status = result.status || (result.ok === false ? 400 : 200);
      return response.status(status).json(result);
    } catch (error) {
      return sendJson(res, error.status || 500, fail(error.message, error.status || 500));
    }
  });

  server.controllers = controllers;
  server.routes = routes;
  return server;
}

module.exports = {
  createNativeServer,
  buildRouteTable,
  matchRoute,
  compilePath
};
