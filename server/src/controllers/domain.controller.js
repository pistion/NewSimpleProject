/**
 * DomainController — workspace-scoped domain ownership API.
 *
 * Live registrar inventory lives on /api/registrar (Spaceship).
 * This workspace surface intentionally returns empty lists unless real
 * local/workspace records exist — never hardcodes demo domains like emakora.co.
 *
 * When FEATURE_DOMAINS is off, routes are blocked by requireFeature middleware.
 */

const DomainController = {
  listDomains: async (req, res) => {
    // No fake inventory. Wire workspace persistence later if needed.
    res.ok([], {
      source: 'workspace',
      demo: false,
      message: 'No workspace domain records yet. Registered domains appear via the registrar API.',
    });
  },

  getDomain: async (req, res) => {
    const { domainId } = req.params;
    return res.error(
      'NOT_FOUND',
      `Domain ${domainId} was not found in this workspace.`,
      404
    );
  },

  updateDomain: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Workspace domain updates are not available. Manage domains via the registrar.',
      501
    );
  },

  deleteDomain: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Workspace domain deletion is not available.',
      501
    );
  },

  verifyDomain: async (req, res) => {
    return res.ok({
      status: 'not_configured',
      verified: false,
      message: 'Domain verification is not configured for workspace records yet. Use registrar DNS tools for live domains.',
    });
  },

  linkProject: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Linking domains to projects is not available yet.',
      501
    );
  },

  toggleAutoRenew: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Use the registrar auto-renew endpoint for live domains.',
      501
    );
  },
};

export default DomainController;
