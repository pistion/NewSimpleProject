/**
 * sandbox.controller.js
 *
 * Serves sandbox preview — static dist files or runtime proxy.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import sandboxRuntimeService from '../services/sandboxRuntime.service.js';

export function serveSandbox(req, res, next) {
  const sandboxRoot = sandboxRuntimeService.getSandboxRoot();
  const sandboxProcesses = sandboxRuntimeService.getSandboxProcesses();
  const siteId = sandboxRuntimeService.sanitizeId(req.params.siteId);
  const sandboxDist = resolve(sandboxRoot, siteId, 'dist');
  if (!siteId || !sandboxDist.startsWith(sandboxRoot)) return next();
  const runtime = sandboxProcesses.get(siteId);
  if (runtime?.port) return sandboxRuntimeService.proxySandboxRuntime(req, res, next, runtime.port, siteId);
  if (!existsSync(sandboxDist)) return next();
  return express.static(sandboxDist, {
    index: 'index.html',
    fallthrough: true,
    setHeaders(response, filePath) {
      response.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=60');
    },
  })(req, res, next);
}

export function serveSandboxFallback(req, res, next) {
  const sandboxRoot = sandboxRuntimeService.getSandboxRoot();
  const siteId = sandboxRuntimeService.sanitizeId(req.params.siteId);
  const indexPath = resolve(sandboxRoot, siteId, 'dist', 'index.html');
  if (!siteId || !indexPath.startsWith(sandboxRoot) || !existsSync(indexPath)) return next();
  res.type('html').sendFile(indexPath);
}

export default { serveSandbox, serveSandboxFallback };
