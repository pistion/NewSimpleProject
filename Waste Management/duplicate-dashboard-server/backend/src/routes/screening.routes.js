const { asHttpHandler } = require('../http/api-response');

function createScreeningRoutes(controllers) {
  const controller = controllers.screening;
  return [
    { method: 'GET', path: '/api/screening/criteria', action: 'ScreeningController.listCriteria', handler: controller.listCriteria },
    { method: 'POST', path: '/api/screening/criteria', action: 'ScreeningController.storeCriterion', handler: controller.storeCriterion },
    { method: 'GET', path: '/api/screening/criteria/:id', action: 'ScreeningController.showCriterion', handler: controller.showCriterion },
    { method: 'PATCH', path: '/api/screening/criteria/:id', action: 'ScreeningController.updateCriterion', handler: controller.updateCriterion },
    { method: 'DELETE', path: '/api/screening/criteria/:id', action: 'ScreeningController.destroyCriterion', handler: controller.destroyCriterion },
    { method: 'GET', path: '/api/screening/tie-breakers', action: 'ScreeningController.listTieBreakers', handler: controller.listTieBreakers },
    { method: 'POST', path: '/api/screening/tie-breakers', action: 'ScreeningController.storeTieBreaker', handler: controller.storeTieBreaker },
    { method: 'GET', path: '/api/screening/tie-breakers/:id', action: 'ScreeningController.showTieBreaker', handler: controller.showTieBreaker },
    { method: 'PATCH', path: '/api/screening/tie-breakers/:id', action: 'ScreeningController.updateTieBreaker', handler: controller.updateTieBreaker },
    { method: 'GET', path: '/api/screening/scores', action: 'ScreeningController.listScores', handler: controller.listScores },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/start', action: 'ScreeningController.startApplicantScreening', handler: controller.startApplicantScreening },
    { method: 'GET', path: '/api/screening/applicants/:applicantId', action: 'ScreeningController.applicantScreening', handler: controller.applicantScreening },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/scores', action: 'ScreeningController.scoreApplicant', handler: controller.scoreApplicant },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/scores/bulk', action: 'ScreeningController.bulkScoreApplicant', handler: controller.bulkScoreApplicant },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/tie-breaker', action: 'ScreeningController.saveApplicantTieBreaker', handler: controller.saveApplicantTieBreaker },
    { method: 'POST', path: '/api/screening/sort-with-tie-breaker', action: 'ScreeningController.sortWithTieBreaker', handler: controller.sortWithTieBreaker },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/report', action: 'ScreeningController.generateReport', handler: controller.generateReport },
    { method: 'POST', path: '/api/screening/applicants/:applicantId/finalize', action: 'ScreeningController.finalizeApplicant', handler: controller.finalizeApplicant },
    { method: 'GET', path: '/api/screening/reports', action: 'ScreeningController.listReports', handler: controller.listReports },
    { method: 'GET', path: '/api/screening/reports/:id', action: 'ScreeningController.showReport', handler: controller.showReport },
    { method: 'GET', path: '/api/screening/summary', action: 'ScreeningController.summary', handler: controller.summary }
  ];
}

function registerScreeningRoutes(app, controllers) {
  createScreeningRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createScreeningRoutes,
  registerScreeningRoutes
};
