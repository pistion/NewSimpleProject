/**
 * DnsRecordController — workspace-scoped DNS records.
 *
 * Live DNS is managed through /api/registrar/dns/:domain/records (Spaceship).
 * This workspace surface returns empty data by default so the client dashboard
 * never shows hardcoded demo DNS (e.g. fake A records).
 */

const DnsRecordController = {
  listRecords: async (req, res) => {
    res.ok([], {
      source: 'workspace',
      demo: false,
      message: 'No workspace DNS records. Pull live DNS from the registrar when the domain is registered.',
    });
  },

  createRecord: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Workspace DNS writes are disabled. Use the registrar DNS API for live domains.',
      501
    );
  },

  updateRecord: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Workspace DNS writes are disabled. Use the registrar DNS API for live domains.',
      501
    );
  },

  deleteRecord: async (req, res) => {
    return res.error(
      'NOT_IMPLEMENTED',
      'Workspace DNS writes are disabled. Use the registrar DNS API for live domains.',
      501
    );
  },
};

export default DnsRecordController;
