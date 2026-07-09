const { asHttpHandler } = require('../http/api-response');

function createAIFiltrationRoutes(controllers) {
  const controller = controllers.aiFiltration;
  return [
    { method: 'GET', path: '/api/ai-filtration/runs', action: 'AIFiltrationController.listRuns', handler: controller.listRuns },
    { method: 'GET', path: '/api/ai-filtration/runs/:id', action: 'AIFiltrationController.showRun', handler: controller.showRun },
    { method: 'POST', path: '/api/ai-filtration/positions/:positionId/run', action: 'AIFiltrationController.runForPosition', handler: controller.runForPosition },
    { method: 'POST', path: '/api/ai-filtration/positions/:positionId/rerun', action: 'AIFiltrationController.rerunForPosition', handler: controller.rerunForPosition },
    { method: 'GET', path: '/api/ai-filtration/positions/:positionId/results', action: 'AIFiltrationController.resultsForPosition', handler: controller.resultsForPosition },
    { method: 'POST', path: '/api/ai-filtration/positions/:positionId/shortlist-top', action: 'AIFiltrationController.shortlistTopMatches', handler: controller.shortlistTopMatches },
    { method: 'GET', path: '/api/ai-filtration/suggestions', action: 'AIFiltrationController.suggestions', handler: controller.suggestions },
    { method: 'POST', path: '/api/ai-filtration/suggestions/:id/apply', action: 'AIFiltrationController.applySuggestion', handler: controller.applySuggestion },
    { method: 'GET', path: '/api/ai-filtration/applicants/:applicantId/explain', action: 'AIFiltrationController.explainApplicant', handler: controller.explainApplicant },
    { method: 'GET', path: '/api/ai-filtration/summary', action: 'AIFiltrationController.summary', handler: controller.summary }
  ];
}

function registerAIFiltrationRoutes(app, controllers) {
  createAIFiltrationRoutes(controllers).forEach((route) => {
    const method = route.method.toLowerCase();
    app[method](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = {
  createAIFiltrationRoutes,
  registerAIFiltrationRoutes
};
