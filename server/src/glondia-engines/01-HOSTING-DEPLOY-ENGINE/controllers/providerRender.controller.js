/**
 * providerRender.controller.js
 *
 * Thin HTTP wrappers around providerRender.service.js.
 * Each function reads from req, calls the service, and responds.
 */

import * as renderService from '../services/providerRender.service.js';

async function importGithubSandbox(req, res, next) {
  try {
    res.json(await renderService.importGithubSandbox(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function triggerRenderDeploy(req, res, next) {
  try {
    res.json(await renderService.triggerRenderDeploy(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function testRenderDeploy(req, res, next) {
  try {
    res.json(await renderService.testRenderDeploy(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function activateRenderRepo(req, res, next) {
  try {
    res.json(await renderService.activateRenderRepoService(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function getRenderSettings(req, res, next) {
  try {
    res.json(renderService.getRenderSettings());
  } catch (error) {
    next(error);
  }
}

async function listRenderDeploys(req, res, next) {
  try {
    res.json(await renderService.listRenderDeploys(req.query || {}));
  } catch (error) {
    next(error);
  }
}

async function listRenderServices(req, res, next) {
  try {
    if (process.env.RENDER_EXPOSE_SERVICE_LIST !== 'true') {
      res.json([]);
      return;
    }
    res.json(await renderService.listRenderServices());
  } catch (error) {
    next(error);
  }
}

export default {
  importGithubSandbox,
  triggerRenderDeploy,
  testRenderDeploy,
  activateRenderRepo,
  getRenderSettings,
  listRenderDeploys,
  listRenderServices,
};
