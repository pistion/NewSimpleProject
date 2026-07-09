const { asHttpHandler } = require('../http/api-response');

function createRequisitionRoutes(controllers) {
  const controller = controllers.requisitions;
  return [
    { method: 'GET', path: '/api/requisitions', action: 'RequisitionController.list', handler: controller.list },
    { method: 'POST', path: '/api/requisitions', action: 'RequisitionController.store', handler: controller.store },
    { method: 'GET', path: '/api/requisitions/:id', action: 'RequisitionController.show', handler: controller.show },
    { method: 'PATCH', path: '/api/requisitions/:id', action: 'RequisitionController.update', handler: controller.update },
    { method: 'DELETE', path: '/api/requisitions/:id', action: 'RequisitionController.destroy', handler: controller.destroy },
    { method: 'POST', path: '/api/requisitions/:id/apply', action: 'RequisitionController.apply', handler: controller.apply },
    { method: 'PATCH', path: '/api/requisitions/:id/checklist', action: 'RequisitionController.updateChecklist', handler: controller.updateChecklist },
    { method: 'POST', path: '/api/requisitions/:id/ready', action: 'RequisitionController.markReady', handler: controller.markReady },
    { method: 'POST', path: '/api/requisitions/:id/publish', action: 'RequisitionController.publish', handler: controller.publish },
    { method: 'POST', path: '/api/requisitions/:id/reopen-draft', action: 'RequisitionController.reopenDraft', handler: controller.reopenDraft },
    { method: 'POST', path: '/api/requisitions/:id/duplicate', action: 'RequisitionController.duplicate', handler: controller.duplicate }
  ];
}

function registerRequisitionRoutes(app, controllers) {
  createRequisitionRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createRequisitionRoutes,
  registerRequisitionRoutes
};
