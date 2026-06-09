/**
 * env-var.controller.js
 *
 * Project-level environment variables (workspace context, not deployment-level).
 * Route: /api/v1/workspaces/:id/projects/:projectId/env-vars
 *
 * ⚠️  STUB — returns mock data. Wired to project.routes.js.
 *
 * The deployment-level env var controller (Render API backed) is:
 *   controllers/environmentController.js  →  routes/environmentRoutes.js
 *
 * TODO: implement with a real projectEnvVarService once the project
 * data model is built out.
 */

const EnvVarController = {
  listEnvVars: async (req, res) => {
    res.ok([
      { id: 'ev_1', key: 'NODE_ENV', value: 'production', env: ['Production'] },
    ]);
  },

  createEnvVar: async (req, res) => {
    res.created({ id: 'ev_new', ...req.body });
  },

  updateEnvVar: async (req, res) => {
    const { envVarId } = req.params;
    res.ok({ id: envVarId, ...req.body });
  },

  deleteEnvVar: async (req, res) => {
    res.status(204).send();
  },
};

export default EnvVarController;
