/**
 * pipedrive.controller.js
 *
 * Handles the Pipedrive CRM integration for the HEYA admin dashboard.
 *
 * API key configuration:
 *   Set PIPEDRIVE_API_KEY in your Render (or local .env) environment variables.
 *   The key is NEVER accepted from the browser — it is read exclusively from
 *   process.env.PIPEDRIVE_API_KEY at runtime. No UI input, no PATCH endpoint
 *   for the key. Change it by updating the Render env var and redeploying.
 *
 * Exposed routes (registered in pipedrive.routes.js):
 *   GET   /api/admin/pipedrive/settings  — return status (configured yes/no, last sync)
 *   POST  /api/admin/pipedrive/test      — verify key against Pipedrive /users/me
 *   POST  /api/admin/pipedrive/sync      — push all applicants as Persons to Pipedrive
 *
 * SECURITY RULES:
 *   1. API key comes from process.env only — the client can never set or read it.
 *   2. The sync endpoint requires an explicit { confirmed: true } body field —
 *      prevents accidental mass-uploads. The frontend warning modal sets this.
 *   3. The controller reads applicants from the shared in-memory DB (read-only).
 *   4. Duplicate detection: searches Pipedrive by email before creating a Person;
 *      skips the record if a match is found.
 */

// ── Pipedrive API base ────────────────────────────────────────────────────────
const PD_BASE = 'https://api.pipedrive.com/v1';

// ── In-memory runtime state (no API key stored here — always read from env) ──
let _pdState = {
  lastSyncAt:     null,
  lastSyncResult: null,   // { synced, skipped, failed, errors[] }
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Always reads the key fresh from the environment.
 * If the Render env var changes and the service restarts, the new key is picked up
 * automatically — no redeployment of code required.
 */
function getPdApiKey() {
  return process.env.PIPEDRIVE_API_KEY || '';
}

/**
 * Append the api_token query param to any Pipedrive URL path.
 * Uses the stored key unless an override is supplied (e.g. from a test-connection request).
 */
function pdUrl(path, apiKey) {
  const key = apiKey || getPdApiKey();
  const sep = path.includes('?') ? '&' : '?';
  return `${PD_BASE}${path}${sep}api_token=${encodeURIComponent(key)}`;
}

async function callPipedrive(path, { method = 'GET', body, apiKey } = {}) {
  const url = pdUrl(path, apiKey);
  const opts = {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Search Pipedrive for an existing Person by email (exact match).
 * Returns the first matching Person object, or null if not found.
 */
async function findPersonByEmail(email, apiKey) {
  if (!email) return null;
  try {
    const { ok, data } = await callPipedrive(
      `/persons/search?term=${encodeURIComponent(email)}&field=email&exact_match=true&limit=1`,
      { apiKey }
    );
    if (!ok || !data?.success) return null;
    const items = data?.data?.items || [];
    return items.length > 0 ? items[0].item : null;
  } catch {
    return null;
  }
}

// ── Controller factory ────────────────────────────────────────────────────────

function createPipedriveController(database) {

  // GET /api/admin/pipedrive/settings
  // Returns status only — never the key value itself.
  async function getSettings() {
    return {
      ok:               true,
      apiKeyConfigured: Boolean(getPdApiKey()),
      lastSyncAt:       _pdState.lastSyncAt,
      lastSyncResult:   _pdState.lastSyncResult,
    };
  }

  // POST /api/admin/pipedrive/test
  // Key always comes from process.env — no body parameter accepted.
  async function testConnection() {
    const testKey = getPdApiKey();

    if (!testKey) {
      return {
        ok:      false,
        message: 'No Pipedrive API key configured. Enter your API key in the Pipedrive settings panel.',
      };
    }

    try {
      const { ok, status, data } = await callPipedrive('/users/me', { apiKey: testKey });

      if (ok && data?.success) {
        const user = data.data;
        return {
          ok:      true,
          message: `Connected to Pipedrive as ${user.name || user.email || 'unknown user'}.`,
          user:    { name: user.name, email: user.email, company: user.company_name },
        };
      }

      return {
        ok:      false,
        message: data?.error || `Pipedrive returned HTTP ${status}. Check your API key.`,
      };
    } catch (err) {
      return { ok: false, message: `Could not reach Pipedrive: ${err.message}` };
    }
  }

  // POST /api/admin/pipedrive/sync
  // Body must include { confirmed: true } — the frontend warning modal provides this.
  // Pushes every applicant in the DB as a Pipedrive Person (skips existing by email).
  async function syncApplicants(req) {
    if (!req.body?.confirmed) {
      return {
        ok:      false,
        status:  400,
        message: 'Sync must be explicitly confirmed. Set { confirmed: true } in the request body.',
      };
    }

    const apiKey = getPdApiKey();
    if (!apiKey) {
      return {
        ok:      false,
        status:  503,
        message: 'PIPEDRIVE_API_KEY is not set. Add it to your Render environment variables and redeploy.',
      };
    }

    // Pull all applicants from the shared database
    const all = database ? database.all('applicants') : [];
    if (!all.length) {
      return {
        ok:      true,
        message: 'No applicants found in the database — nothing to sync.',
        synced:  0,
        skipped: 0,
        failed:  0,
        errors:  [],
      };
    }

    const results = { synced: 0, skipped: 0, failed: 0, errors: [] };

    for (const applicant of all) {
      const name  = (applicant.name  || '').trim();
      const email = (applicant.email || '').trim();
      const phone = (applicant.phone || '').trim();

      // Must have at least a name or email to create a meaningful Pipedrive contact
      if (!name && !email) {
        results.skipped++;
        continue;
      }

      try {
        // Duplicate check — skip if already in Pipedrive by email
        if (email) {
          const existing = await findPersonByEmail(email, apiKey);
          if (existing) {
            results.skipped++;
            continue;
          }
        }

        // Build the Person payload — only send name, email, phone (as requested)
        const personPayload = { name: name || email };
        if (email) personPayload.email = [{ value: email, primary: true, label: 'work' }];
        if (phone) personPayload.phone = [{ value: phone, primary: true, label: 'work' }];

        const { ok, status, data } = await callPipedrive('/persons', {
          method: 'POST',
          body:   personPayload,
          apiKey,
        });

        if (ok && data?.success) {
          results.synced++;
        } else {
          results.failed++;
          results.errors.push({
            applicant: name || email,
            reason: data?.error || `HTTP ${status}`,
          });
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ applicant: name || email, reason: err.message });
      }
    }

    // Persist sync results for display in the Settings panel
    _pdState.lastSyncAt     = new Date().toISOString();
    _pdState.lastSyncResult = results;

    return {
      ok:      true,
      message: `Sync complete — ${results.synced} created, ${results.skipped} skipped, ${results.failed} failed.`,
      synced:  results.synced,
      skipped: results.skipped,
      failed:  results.failed,
      errors:  results.errors,
      syncedAt: _pdState.lastSyncAt,
    };
  }

  return { getSettings, testConnection, syncApplicants };
}

module.exports = { createPipedriveController };
