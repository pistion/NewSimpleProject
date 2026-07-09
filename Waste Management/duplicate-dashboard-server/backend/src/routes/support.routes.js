const { asHttpHandler } = require('../http/api-response');

function createSupportRoutes(controllers) {
  const controller = controllers.support;
  return [
    { method: 'GET', path: '/api/health', action: 'SupportController.health', handler: controller.health },
    { method: 'GET', path: '/api/dashboard/summary', action: 'SupportController.dashboardSummary', handler: controller.dashboardSummary },
    { method: 'GET', path: '/api/export/database', action: 'SupportController.exportDatabase', handler: controller.exportDatabase },

    { method: 'GET', path: '/api/tasks', action: 'SupportController.listTasks', handler: controller.listTasks },
    { method: 'POST', path: '/api/tasks', action: 'SupportController.storeTask', handler: controller.storeTask },
    { method: 'GET', path: '/api/tasks/:id', action: 'SupportController.showTask', handler: controller.showTask },
    { method: 'PATCH', path: '/api/tasks/:id', action: 'SupportController.updateTask', handler: controller.updateTask },
    { method: 'POST', path: '/api/tasks/:id/complete', action: 'SupportController.completeTask', handler: controller.completeTask },
    { method: 'POST', path: '/api/tasks/:id/reopen', action: 'SupportController.reopenTask', handler: controller.reopenTask },
    { method: 'DELETE', path: '/api/tasks/:id', action: 'SupportController.destroyTask', handler: controller.destroyTask },

    { method: 'GET', path: '/api/activity', action: 'SupportController.listActivity', handler: controller.listActivity },
    { method: 'POST', path: '/api/activity', action: 'SupportController.storeActivity', handler: controller.storeActivity },

    { method: 'GET', path: '/api/calendar/events', action: 'SupportController.listCalendarEvents', handler: controller.listCalendarEvents },
    { method: 'POST', path: '/api/calendar/events', action: 'SupportController.storeCalendarEvent', handler: controller.storeCalendarEvent },
    { method: 'PATCH', path: '/api/calendar/events/:id', action: 'SupportController.updateCalendarEvent', handler: controller.updateCalendarEvent },
    { method: 'DELETE', path: '/api/calendar/events/:id', action: 'SupportController.destroyCalendarEvent', handler: controller.destroyCalendarEvent },

    { method: 'GET', path: '/api/offers', action: 'SupportController.listOffers', handler: controller.listOffers },
    { method: 'POST', path: '/api/offers', action: 'SupportController.storeOffer', handler: controller.storeOffer },
    { method: 'GET', path: '/api/offers/:id', action: 'SupportController.showOffer', handler: controller.showOffer },
    { method: 'PATCH', path: '/api/offers/:id', action: 'SupportController.updateOffer', handler: controller.updateOffer },
    { method: 'POST', path: '/api/offers/:id/send', action: 'SupportController.sendOffer', handler: controller.sendOffer },
    { method: 'POST', path: '/api/offers/:id/accept', action: 'SupportController.acceptOffer', handler: controller.acceptOffer },
    { method: 'POST', path: '/api/offers/:id/decline', action: 'SupportController.declineOffer', handler: controller.declineOffer },
    { method: 'DELETE', path: '/api/offers/:id', action: 'SupportController.destroyOffer', handler: controller.destroyOffer },

    { method: 'GET', path: '/api/files', action: 'SupportController.listFiles', handler: controller.listFiles },
    { method: 'POST', path: '/api/files', action: 'SupportController.storeFile', handler: controller.storeFile },
    { method: 'DELETE', path: '/api/files/:id', action: 'SupportController.destroyFile', handler: controller.destroyFile },

    { method: 'GET', path: '/api/users', action: 'SupportController.listUsers', handler: controller.listUsers },
    { method: 'POST', path: '/api/users', action: 'SupportController.storeUser', handler: controller.storeUser },
    { method: 'GET', path: '/api/users/:id', action: 'SupportController.showUser', handler: controller.showUser },
    { method: 'PATCH', path: '/api/users/:id', action: 'SupportController.updateUser', handler: controller.updateUser },
    { method: 'PATCH', path: '/api/users/:id/preferences', action: 'SupportController.updateUserPreferences', handler: controller.updateUserPreferences },
    { method: 'DELETE', path: '/api/users/:id', action: 'SupportController.destroyUser', handler: controller.destroyUser }
  ];
}

function registerSupportRoutes(app, controllers) {
  createSupportRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createSupportRoutes,
  registerSupportRoutes
};
