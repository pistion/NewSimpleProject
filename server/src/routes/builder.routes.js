import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as builder from '../services/builderService.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/projects', wrap(async (req, res) => {
  const data = await builder.createProject(req.user, req.body || {});
  send(res, data, 201, req);
}));

router.get('/projects', wrap(async (req, res) => {
  const data = await builder.listProjects(req.user, req.query || {});
  send(res, data, 200, req);
}));

router.get('/projects/:projectId', wrap(async (req, res) => {
  const data = await builder.getProject(req.user, req.params.projectId);
  send(res, data, 200, req);
}));

router.patch('/projects/:projectId/plan', wrap(async (req, res) => {
  const data = await builder.updatePlan(req.user, req.params.projectId, req.body || {}, req.id);
  send(res, data, 200, req);
}));

router.post('/projects/:projectId/answer-sheet/build', wrap(async (req, res) => {
  const data = await builder.buildAnswerSheet(req.user, req.params.projectId, req.id);
  send(res, data, 200, req);
}));

router.patch('/projects/:projectId/answer-sheet', wrap(async (req, res) => {
  const data = await builder.updateAnswerSheet(req.user, req.params.projectId, req.body || {}, req.id);
  send(res, data, 200, req);
}));

router.post('/projects/:projectId/generations', wrap(async (req, res) => {
  const result = await builder.startGeneration(req.user, req.params.projectId, req.body || {}, req.headers['idempotency-key'], req.id);
  send(res, result.data, result.statusCode, req);
}));

router.get('/jobs/:jobId', wrap(async (req, res) => {
  const data = await builder.getJob(req.user, req.params.jobId);
  send(res, data, 200, req);
}));

router.get('/jobs/:jobId/events', wrap(async (req, res) => {
  const data = await builder.getJobEvents(req.user, req.params.jobId);
  send(res, data, 200, req);
}));

router.delete('/preview-grants/:grantId', wrap(async (req, res) => {
  const data = await builder.revokePreviewGrant(req.user, req.params.grantId);
  send(res, data, 200, req);
}));

router.get('/projects/:projectId/revisions', wrap(async (req, res) => {
  const data = await builder.listRevisions(req.user, req.params.projectId);
  send(res, data, 200, req);
}));

router.get('/projects/:projectId/revisions/:revisionId', wrap(async (req, res) => {
  const data = await builder.getRevision(req.user, req.params.projectId, req.params.revisionId);
  send(res, data, 200, req);
}));

router.post('/projects/:projectId/revisions/:revisionId/approve', wrap(async (req, res) => {
  const data = await builder.approveRevision(req.user, req.params.projectId, req.params.revisionId);
  send(res, data, 200, req);
}));

router.post('/projects/:projectId/revisions/:revisionId/change-request', wrap(async (req, res) => {
  const result = await builder.createChangeRequest(
    req.user,
    req.params.projectId,
    req.params.revisionId,
    req.body || {},
    req.headers['idempotency-key'],
  );
  send(res, result.data, result.statusCode, req);
}));

router.post('/projects/:projectId/revisions/:revisionId/preview-grants', wrap(async (req, res) => {
  const data = await builder.createPreviewGrant(req.user, req.params.projectId, req.params.revisionId);
  send(res, data, 201, req);
}));

router.post('/projects/:projectId/deployments', wrap(async (req, res) => {
  const result = await builder.createDeployment(req.user, req.params.projectId, req.body || {}, req.headers['idempotency-key']);
  send(res, result.data, result.statusCode, req);
}));

function send(res, data, status, req) {
  res.status(status).json({
    data,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
}

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const status = Number(err.status || 500);
      res.status(status).json({
        error: {
          code: err.code || 'BUILDER_ERROR',
          message: status >= 500 ? 'Builder request failed.' : err.message,
          ...(err.details ? { details: err.details } : {}),
        },
        requestId: req.id,
      });
    }
  };
}

export default router;
