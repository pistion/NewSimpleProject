import deploymentService from '../services/deploymentService.js';
import zipDeploymentService from '../services/zipDeploymentService.js';
import githubDeploymentService from '../services/githubDeploymentService.js';

const deploymentController = {
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

  createGithubDeployment: async (req, res, next) => {
    try {
      const deployment = await githubDeploymentService.create(req.body || {}, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'GitHub deployment session started.', requestId: req.id });
    } catch (error) {
      if (!error.stage) error.stage = 'github_repo_validate';
      next(error);
    }
  },

  createZipDeployment: async (req, res, next) => {
    try {
      const file = req.file || req.files?.zip?.[0] || req.files?.file?.[0];
      const deployment = await zipDeploymentService.create({ file, fields: req.body || {} }, { userId: req.user?.id });
      res.status(202).json({ data: deployment, message: 'ZIP deployment session started.', requestId: req.id });
    } catch (error) {
      if (!error.stage) error.stage = 'zip_upload';
      next(error);
    }
  },

  getDeployment: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getDeployment(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  getStatus: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getStatus(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  redeploy: async (req, res, next) => {
    try {
      res.status(202).json({
        data: await deploymentService.redeploy(req.params.deploymentId, req.body || {}),
        message: 'Redeploy started.',
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  },

  redeployClearCache: async (req, res, next) => {
    try {
      res.status(202).json({
        data: await deploymentService.redeploy(req.params.deploymentId, { ...req.body, clearCache: 'clear' }),
        message: 'Redeploy with cache clear started.',
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  },

  verifyUrl: async (req, res, next) => {
    try {
      res.ok(await deploymentService.verifyUrl(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },

  getLogs: async (req, res, next) => {
    try {
      res.ok(await deploymentService.getLogs(req.params.deploymentId));
    } catch (error) {
      next(error);
    }
  },
};

export default deploymentController;
