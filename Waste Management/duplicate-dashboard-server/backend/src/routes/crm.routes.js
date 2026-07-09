// CRM routes — lightweight endpoints for the CRM workspace.
// Service requests = general-kind messages (contact/enquiry form submissions).
const { ok } = require('../http/api-response');

function createCrmRoutes(controllers) {
  const db = controllers.database;

  function listServiceRequests(req, res) {
    const messages = db.all('messages');
    const serviceRequests = messages
      .filter((m) => m.kind === 'general')
      .map((m) => ({
        id:            m.id,
        name:          m.name,
        email:         m.email,
        phone:         m.phone,
        subject:       m.subject,
        message:       m.body,
        status:        m.status,
        source:        m.source,
        submittedAt:   m.receivedAt || m.createdAt,
        createdAt:     m.createdAt,
      }));
    return ok(res, { serviceRequests });
  }

  function getCrmOverview(req, res) {
    const messages        = db.all('messages');
    const talents         = db.all('talents');
    const applicants      = db.all('applicants');

    const serviceRequests = messages.filter((m) => m.kind === 'general');
    const unread          = messages.filter((m) => m.status === 'unread');

    return ok(res, {
      overview: {
        unreadMessages:   unread.length,
        totalMessages:    messages.length,
        serviceRequests:  serviceRequests.length,
        talentPoolEmails: talents.filter((t) => t.email).length,
        applicantEmails:  applicants.filter((a) => a.email).length,
      }
    });
  }

  return [
    { method: 'GET', path: '/api/admin/crm/service-requests', action: 'CrmRoutes.listServiceRequests', handler: listServiceRequests },
    { method: 'GET', path: '/api/admin/crm/overview',         action: 'CrmRoutes.getCrmOverview',      handler: getCrmOverview },
  ];
}

function registerCrmRoutes(app, controllers) {
  const { asHttpHandler } = require('../http/api-response');
  createCrmRoutes(controllers).forEach((route) => {
    app[route.method.toLowerCase()](route.path, asHttpHandler(route.handler));
  });
  return app;
}

module.exports = { createCrmRoutes, registerCrmRoutes };
