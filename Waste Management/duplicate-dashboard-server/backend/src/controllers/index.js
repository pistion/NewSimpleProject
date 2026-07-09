const { createInMemoryDatabase } = require('../services/database.service');
const { createRequisitionController } = require('./requisition.controller');
const { createPositionController } = require('./position.controller');
const { createApplicantController } = require('./applicant.controller');
const { createAIFiltrationController } = require('./ai-filtration.controller');
const { createScreeningController } = require('./screening.controller');
const { createTalentController } = require('./talent.controller');
const { createSupportController } = require('./support.controller');
const { createMessageController } = require('./message.controller');
const { createPipedriveController } = require('./pipedrive.controller');

function createControllers(database = createInMemoryDatabase()) {
  return {
    database,
    requisitions: createRequisitionController(database),
    positions: createPositionController(database),
    applicants: createApplicantController(database),
    aiFiltration: createAIFiltrationController(database),
    screening: createScreeningController(database),
    talents: createTalentController(database),
    support: createSupportController(database),
    messages: createMessageController(database),
    pipedrive: createPipedriveController(database),
  };
}

module.exports = {
  createControllers,
  ...require('./requisition.controller'),
  ...require('./position.controller'),
  ...require('./applicant.controller'),
  ...require('./ai-filtration.controller'),
  ...require('./screening.controller'),
  ...require('./talent.controller'),
  ...require('./support.controller'),
  ...require('./message.controller'),
  ...require('./pipedrive.controller'),
};
