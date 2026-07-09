const { asHttpHandler } = require('../http/api-response');

function createApplicantRoutes(controllers) {
  const controller = controllers.applicants;
  return [
    { method: 'GET', path: '/api/applicants', action: 'ApplicantController.list', handler: controller.list },
    { method: 'POST', path: '/api/applicants', action: 'ApplicantController.store', handler: controller.store },
    { method: 'GET', path: '/api/applicants/summary', action: 'ApplicantController.summary', handler: controller.summary },
    { method: 'GET', path: '/api/applicants/:id', action: 'ApplicantController.show', handler: controller.show },
    { method: 'PATCH', path: '/api/applicants/:id', action: 'ApplicantController.update', handler: controller.update },
    { method: 'DELETE', path: '/api/applicants/:id', action: 'ApplicantController.destroy', handler: controller.destroy },
    { method: 'PATCH', path: '/api/applicants/:id/status', action: 'ApplicantController.updateStatus', handler: controller.updateStatus },
    { method: 'POST', path: '/api/applicants/:id/shortlist', action: 'ApplicantController.shortlist', handler: controller.shortlist },
    { method: 'POST', path: '/api/applicants/:id/review', action: 'ApplicantController.moveToReview', handler: controller.moveToReview },
    { method: 'POST', path: '/api/applicants/:id/interview', action: 'ApplicantController.moveToInterview', handler: controller.moveToInterview },
    { method: 'POST', path: '/api/applicants/:id/offer', action: 'ApplicantController.moveToOffer', handler: controller.moveToOffer },
    { method: 'POST', path: '/api/applicants/:id/hire', action: 'ApplicantController.hire', handler: controller.hire },
    { method: 'POST', path: '/api/applicants/:id/reject', action: 'ApplicantController.reject', handler: controller.reject },
    { method: 'POST', path: '/api/applicants/:id/upload-resume', action: 'ApplicantController.uploadResume', handler: controller.uploadResume }
  ];
}

function registerApplicantRoutes(app, controllers) {
  createApplicantRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createApplicantRoutes,
  registerApplicantRoutes
};
