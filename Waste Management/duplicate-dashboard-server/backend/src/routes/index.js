const { createControllers } = require('../controllers');
const { createMcpController } = require('../controllers/mcp.controller');
const { createRequisitionRoutes, registerRequisitionRoutes } = require('./requisition.routes');
const { createPositionRoutes, registerPositionRoutes } = require('./position.routes');
const { createApplicantRoutes, registerApplicantRoutes } = require('./applicant.routes');
const { createAIFiltrationRoutes, registerAIFiltrationRoutes } = require('./ai-filtration.routes');
const { createScreeningRoutes, registerScreeningRoutes } = require('./screening.routes');
const { createTalentRoutes, registerTalentRoutes } = require('./talent.routes');
const { createSupportRoutes, registerSupportRoutes } = require('./support.routes');
const { createMessageRoutes, registerMessageRoutes } = require('./message.routes');
const { createMcpRoutes, registerMcpRoutes } = require('./mcp.routes');
const { createPipedriveRoutes, registerPipedriveRoutes } = require('./pipedrive.routes');
const { createCrmRoutes, registerCrmRoutes } = require('./crm.routes');
const { createCrmToolRoutes, registerCrmToolRoutes } = require('./admin.crmTools.routes');

function createRoutes(controllers = createControllers()) {
  const mcp = createMcpController();
  return [
    ...createMcpRoutes({ mcp }),
    ...createRequisitionRoutes(controllers),
    ...createPositionRoutes(controllers),
    ...createApplicantRoutes(controllers),
    ...createAIFiltrationRoutes(controllers),
    ...createScreeningRoutes(controllers),
    ...createTalentRoutes(controllers),
    ...createMessageRoutes(controllers),
    ...createSupportRoutes(controllers),
    ...createPipedriveRoutes(controllers.database),
    ...createCrmRoutes(controllers),
    ...createCrmToolRoutes(),
  ];
}

function registerRoutes(app, controllers = createControllers()) {
  registerRequisitionRoutes(app, controllers);
  registerPositionRoutes(app, controllers);
  registerApplicantRoutes(app, controllers);
  registerAIFiltrationRoutes(app, controllers);
  registerScreeningRoutes(app, controllers);
  registerTalentRoutes(app, controllers);
  registerMessageRoutes(app, controllers);
  registerSupportRoutes(app, controllers);
  registerPipedriveRoutes(app, controllers.database);
  registerCrmRoutes(app, controllers);
  registerCrmToolRoutes(app);
  return app;
}

module.exports = {
  createRoutes,
  registerRoutes,
  createRequisitionRoutes,
  registerRequisitionRoutes,
  createPositionRoutes,
  registerPositionRoutes,
  createApplicantRoutes,
  registerApplicantRoutes,
  createAIFiltrationRoutes,
  registerAIFiltrationRoutes,
  createScreeningRoutes,
  registerScreeningRoutes,
  createTalentRoutes,
  registerTalentRoutes,
  createMessageRoutes,
  registerMessageRoutes,
  createSupportRoutes,
  registerSupportRoutes,
  createPipedriveRoutes,
  registerPipedriveRoutes,
  createCrmRoutes,
  registerCrmRoutes,
  createCrmToolRoutes,
  registerCrmToolRoutes,
};
