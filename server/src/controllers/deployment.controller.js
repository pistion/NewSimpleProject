/**
 * deployment.controller.js
 *
 * Project-level deployment history (workspace context, not hosting deployments).
 * Route: /api/v1/workspaces/:id/projects/:projectId/deployments
 *
 * ⚠️  STUB — returns mock data. Wired to project.routes.js.
 *
 * The real hosting deployment controller (Render-backed, with build logs,
 * redeploy, cancel, etc.) is:
 *   controllers/deploymentController.js  →  (re-exports from engine)
 *   routes/deploymentRoutes.js  →  /api/deployments/*
 *
 * TODO: implement with a real deploymentHistoryService once the project
 * data model is built out.
 */

const DeploymentController = {
  listDeployments: async (req, res) => {
    res.ok([
      { id: 'dpl_1', commit: 'feat: update homepage', status: 'ready', time: '2 minutes ago' },
    ]);
  },

  createDeployment: async (req, res) => {
    res.status(202).json({
      data: { id: 'dpl_new', status: 'queued' },
      message: 'Deployment queued',
      requestId: req.id,
    });
  },

  getDeployment: async (req, res) => {
    const { deploymentId } = req.params;
    res.ok({ id: deploymentId, status: 'ready' });
  },

  cancelDeployment: async (req, res) => {
    res.ok({ message: 'Deployment cancelled' });
  },

  rollbackDeployment: async (req, res) => {
    res.ok({ message: 'Rollback successful' });
  },

  getLogs: async (req, res) => {
    res.ok([
      { id: 'l_1', level: 'info', message: 'Cloning repository...', timestamp: new Date().toISOString() },
      { id: 'l_2', level: 'ok',   message: 'Build successful',      timestamp: new Date().toISOString() },
    ]);
  },
};

export default DeploymentController;
