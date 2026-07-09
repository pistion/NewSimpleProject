const { asHttpHandler } = require('../http/api-response');

function createTalentRoutes(controllers) {
  const controller = controllers.talents;
  return [
    { method: 'GET', path: '/api/talents', action: 'TalentController.list', handler: controller.list },
    { method: 'POST', path: '/api/talents', action: 'TalentController.store', handler: controller.store },
    { method: 'GET', path: '/api/talents/summary', action: 'TalentController.summary', handler: controller.summary },
    { method: 'GET', path: '/api/talents/matches/:positionId', action: 'TalentController.matchForPosition', handler: controller.matchForPosition },
    { method: 'GET', path: '/api/talents/:id', action: 'TalentController.show', handler: controller.show },
    { method: 'PATCH', path: '/api/talents/:id', action: 'TalentController.update', handler: controller.update },
    { method: 'DELETE', path: '/api/talents/:id', action: 'TalentController.destroy', handler: controller.destroy },
    { method: 'PATCH', path: '/api/talents/:id/status', action: 'TalentController.updateStatus', handler: controller.updateStatus },
    { method: 'POST', path: '/api/talents/:id/silver-medalist', action: 'TalentController.markSilverMedalist', handler: controller.markSilverMedalist },
    { method: 'DELETE', path: '/api/talents/:id/silver-medalist', action: 'TalentController.unmarkSilverMedalist', handler: controller.unmarkSilverMedalist },
    { method: 'POST', path: '/api/talents/:id/notes', action: 'TalentController.addNote', handler: controller.addNote },
    { method: 'POST', path: '/api/talents/:id/touchpoints', action: 'TalentController.logTouchpoint', handler: controller.logTouchpoint },
    { method: 'POST', path: '/api/talents/:id/invite', action: 'TalentController.inviteToApply', handler: controller.inviteToApply },
    { method: 'POST', path: '/api/talents/:id/convert-to-applicant', action: 'TalentController.convertToApplicant', handler: controller.convertToApplicant },
    { method: 'POST', path: '/api/talents/:id/archive', action: 'TalentController.archive', handler: controller.archive }
  ];
}

function registerTalentRoutes(app, controllers) {
  createTalentRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createTalentRoutes,
  registerTalentRoutes
};
