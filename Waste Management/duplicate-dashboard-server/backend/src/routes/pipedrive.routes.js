/**
 * pipedrive.routes.js
 *
 * Registers all Pipedrive CRM API routes with the Express app.
 *
 *   GET  /api/admin/pipedrive/settings  — status only (apiKeyConfigured, lastSync)
 *   POST /api/admin/pipedrive/test      — test connection (key read from process.env)
 *   POST /api/admin/pipedrive/sync      — push all applicants to Pipedrive as Persons
 *
 * API key is NOT accepted via any route — set PIPEDRIVE_API_KEY in Render env vars.
 */

const { createPipedriveController } = require('../controllers/pipedrive.controller');

function wrapAsync(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) {
        const status = result?.status || (result?.ok === false ? 400 : 200);
        res.status(status).json(result);
      }
    } catch (err) {
      console.error('[Pipedrive Route Error]', err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: err.message || 'Internal server error' });
      }
    }
  };
}

function createPipedriveRoutes(database) {
  const controller = createPipedriveController(database);
  return [
    // Status check — apiKeyConfigured flag + last sync info (no key value returned)
    {
      method:  'GET',
      path:    '/api/admin/pipedrive/settings',
      action:  'PipedriveController.getSettings',
      handler: controller.getSettings,
    },
    // Test — reads key from process.env.PIPEDRIVE_API_KEY, no body key accepted
    {
      method:  'POST',
      path:    '/api/admin/pipedrive/test',
      action:  'PipedriveController.testConnection',
      handler: controller.testConnection,
    },
    // Sync — requires { confirmed: true } body; key always from process.env
    {
      method:  'POST',
      path:    '/api/admin/pipedrive/sync',
      action:  'PipedriveController.syncApplicants',
      handler: controller.syncApplicants,
    },
  ];
}

function registerPipedriveRoutes(app, database) {
  createPipedriveRoutes(database).forEach((route) => {
    const method = route.method.toLowerCase();
    if (typeof app[method] === 'function') {
      app[method](route.path, wrapAsync(route.handler));
    }
  });
  return app;
}

module.exports = { createPipedriveRoutes, registerPipedriveRoutes };
