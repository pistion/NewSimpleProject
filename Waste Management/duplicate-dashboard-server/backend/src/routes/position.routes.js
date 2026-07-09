const { asHttpHandler } = require('../http/api-response');

function createPositionRoutes(controllers) {
  const controller = controllers.positions;
  return [
    { method: 'GET', path: '/api/positions', action: 'PositionController.list', handler: controller.list },
    { method: 'GET', path: '/api/positions/summary', action: 'PositionController.summary', handler: controller.summary },
    { method: 'GET', path: '/api/positions/:id', action: 'PositionController.show', handler: controller.show },
    { method: 'PATCH', path: '/api/positions/:id', action: 'PositionController.update', handler: controller.update },
    { method: 'POST', path: '/api/positions/:id/close', action: 'PositionController.close', handler: controller.close },
    { method: 'POST', path: '/api/positions/:id/reopen', action: 'PositionController.reopen', handler: controller.reopen },
    { method: 'POST', path: '/api/positions/:id/archive', action: 'PositionController.archive', handler: controller.archive }
  ];
}

function registerPositionRoutes(app, controllers) {
  createPositionRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createPositionRoutes,
  registerPositionRoutes
};
