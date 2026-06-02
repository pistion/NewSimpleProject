import deploymentService from '../../../services/deploymentService.js';
import { run as runGeneratedSiteToRender } from '../pipelines/generatedSiteToRender.pipeline.js';
import { deprecatedDeployControllerResponse } from '../00-SHARED/deployErrors.js';
import deploymentManagementController from '../10-MANAGEMENT-MOUNTAIN/deploymentManagement.controller.js';
import zipValidationController from '../01-ZIP-INTAKE-MOUNTAIN/zipValidation.controller.js';

const hostingDeployController = {
  createDeployment: async (req, res, next) => {
    try {
      const deployment = await deploymentService.createDeployment(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Deployment session started.', requestId: req.id });
    } catch (error) {
      next(error);
    }
  },

  createRenderDeployment: async (req, res, next) => {
    try {
      const deployment = await deploymentService.createRenderDeployment(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Render deployment accepted.', requestId: req.id });
    } catch (error) {
      if (!error.stage) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('repo') || msg.includes('github')) error.stage = 'github_repo_validate';
        else if (msg.includes('render') && msg.includes('service')) error.stage = 'render_service_create';
        else if (msg.includes('render') && msg.includes('deploy')) error.stage = 'render_deploy_trigger';
        else error.stage = 'render_service_create';
      }
      next(error);
    }
  },

  createGithubDeployment: async (req, res) => deprecatedDeployControllerResponse(res, req.id),
  createZipDeployment: async (req, res) => deprecatedDeployControllerResponse(res, req.id),

  createGeneratedSiteDeployment: async (req, res, next) => {
    try {
      const deployment = await runGeneratedSiteToRender(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'Generated site deployment session started.', requestId: req.id });
    } catch (error) {
      if (!error.stage) error.stage = 'generated_site_package';
      next(error);
    }
  },

  // Compatibility delegates. Canonical routes import the focused controllers.
  getSettings: deploymentManagementController.getSettings,
  validateZipDeployment: zipValidationController.validateZipDeployment,
  getDeployment: deploymentManagementController.getDeployment,
  getStatus: deploymentManagementController.getStatus,
  redeploy: deploymentManagementController.redeploy,
  redeployClearCache: deploymentManagementController.redeployClearCache,
  verifyUrl: deploymentManagementController.verifyUrl,
  getLogs: deploymentManagementController.getLogs,
};

export default hostingDeployController;
