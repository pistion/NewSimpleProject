const { createMcpController } = require('../controllers/mcp.controller');

function createMcpRoutes(controllers) {
  const controller = controllers.mcp || createMcpController();
  return [
    // Dashboard settings (MCP config, profile, etc.)
    { method: 'GET',   path: '/api/admin/dashboard/settings', action: 'McpController.getSettings',   handler: controller.getSettings },
    { method: 'PATCH', path: '/api/admin/dashboard/settings', action: 'McpController.updateSettings', handler: controller.updateSettings },

    // MCP connection test — pings Roxanne MCP /healthz
    { method: 'POST',  path: '/api/admin/mcp/test',           action: 'McpController.testConnection', handler: controller.testConnection },

    // OAuth start — proxies to Roxanne MCP and returns { authUrl }
    { method: 'POST',  path: '/api/admin/mcp/oauth/start',    action: 'McpController.startOauth',     handler: controller.startOauth },

    // Disconnect MCP — clears connected state, forces re-OAuth on next action
    // Does NOT touch tokens on Roxanne MCP (Roxanne owns those)
    { method: 'POST',  path: '/api/admin/mcp/disconnect',     action: 'McpController.disconnectMcp',  handler: controller.disconnectMcp },

    // Social post gate — HARD-BLOCKED if Roxanne MCP has no valid tokens
    // Verifies live token status before forwarding any Facebook / LinkedIn write
    { method: 'POST',  path: '/api/admin/mcp/social/post',    action: 'McpController.socialPost',     handler: controller.socialPost },
  ];
}

function registerMcpRoutes(app, controllers) {
  createMcpRoutes(controllers).forEach((route) => {
    if (typeof app[route.method.toLowerCase()] === 'function') {
      app[route.method.toLowerCase()](route.path, route.handler);
    }
  });
  return app;
}

module.exports = { createMcpRoutes, registerMcpRoutes };
