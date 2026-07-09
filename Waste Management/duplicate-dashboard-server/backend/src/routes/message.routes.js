const { asHttpHandler } = require('../http/api-response');

function createMessageRoutes(controllers) {
  const controller = controllers.messages;
  return [
    { method: 'GET', path: '/api/messages', action: 'MessageController.list', handler: controller.list },
    { method: 'POST', path: '/api/messages', action: 'MessageController.intake', handler: controller.intake },
    { method: 'GET', path: '/api/messages/summary', action: 'MessageController.summary', handler: controller.summary },
    { method: 'GET', path: '/api/messages/notifications', action: 'MessageController.notifications', handler: controller.notifications },
    { method: 'GET', path: '/api/messages/:id', action: 'MessageController.show', handler: controller.show },
    { method: 'POST', path: '/api/messages/:id/read', action: 'MessageController.markRead', handler: controller.markRead },
    { method: 'POST', path: '/api/messages/:id/unread', action: 'MessageController.markUnread', handler: controller.markUnread },
    { method: 'POST', path: '/api/messages/:id/archive', action: 'MessageController.archive', handler: controller.archive },
    { method: 'DELETE', path: '/api/messages/:id', action: 'MessageController.destroy', handler: controller.destroy },
    { method: 'POST', path: '/api/messages/:id/reply', action: 'MessageController.reply', handler: controller.reply },
    { method: 'POST', path: '/api/messages/:id/add-to-talent-pool', action: 'MessageController.addToTalentPool', handler: controller.addToTalentPool },
    { method: 'POST', path: '/api/messages/:id/attach-to-position', action: 'MessageController.attachToPosition', handler: controller.attachToPosition }
  ];
}

function registerMessageRoutes(app, controllers) {
  createMessageRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createMessageRoutes,
  registerMessageRoutes
};
