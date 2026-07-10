import {
  archiveProject,
  createProject,
  getProject,
  listProjectServiceTypes,
  listProjects,
  projectDto,
  updateProject,
} from '../services/projectService.js';

function scope(req) {
  return {
    userId: req.user?.id && req.user.id !== 'local-user' ? req.user.id : null,
    workspaceId: req.params?.workspaceId || req.body?.workspaceId || null,
  };
}

const ProjectController = {
  listServiceTypes: async (_req, res) => {
    res.ok(listProjectServiceTypes());
  },

  listProjects: async (req, res, next) => {
    try {
      const rows = await listProjects({
        ...scope(req),
        includeArchived: req.query?.includeArchived === 'true',
      });
      res.ok(rows.map(projectDto));
    } catch (error) {
      next(error);
    }
  },

  createProject: async (req, res, next) => {
    try {
      const project = await createProject({ ...scope(req), input: req.body || {} });
      res.created(projectDto(project));
    } catch (error) {
      next(error);
    }
  },

  getProject: async (req, res, next) => {
    try {
      const project = await getProject({ ...scope(req), projectId: req.params.projectId });
      res.ok(projectDto(project));
    } catch (error) {
      next(error);
    }
  },

  getProjectSummary: async (req, res, next) => {
    try {
      const project = await getProject({ ...scope(req), projectId: req.params.projectId });
      res.ok({
        project: projectDto(project),
        metrics: { visitors30d: 0, bandwidth30d: 0, requests30d: 0 },
        services: [],
        recentDeployments: [],
      });
    } catch (error) {
      next(error);
    }
  },

  updateProject: async (req, res, next) => {
    try {
      const project = await updateProject({ ...scope(req), projectId: req.params.projectId, patch: req.body || {} });
      res.ok(projectDto(project));
    } catch (error) {
      next(error);
    }
  },

  archiveProject: async (req, res, next) => {
    try {
      const project = await archiveProject({ ...scope(req), projectId: req.params.projectId });
      res.ok(projectDto(project));
    } catch (error) {
      next(error);
    }
  },
};

export default ProjectController;
