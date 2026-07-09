/**
 * securityContext.middleware.js
 *
 * Classifies every API request into a security group and attaches context that
 * the rest of the stack (threatTag, watchdog, audit) can read without re-computing.
 *
 * Sets req.securityContext = { group, actorType, riskScore, watchdogTags }
 *
 * Groups from planning/17:
 *   public_read | public_write | auth | customer_account | customer_service |
 *   billing | support | analytics | admin_read | admin_write | provider | webhook
 */

// Path prefix → security group mapping (ordered most-specific first).
const PATH_GROUP_MAP = [
  // Webhook (raw body, provider callbacks)
  [/^\/api\/v1\/payments\/paypal\/webhook/i, 'webhook'],
  [/^\/api\/payments\/.+\/webhook/i,          'webhook'],

  // Provider-facing endpoints
  [/^\/api\/spaceship\//i,                    'provider'],
  [/^\/api\/provider\//i,                     'provider'],
  [/^\/api\/render\//i,                       'provider'],

  // Admin routes (reads vs writes distinguished below)
  [/^\/api\/admin\//i,                        'admin_read'],

  // Auth
  [/^\/api\/v1\/auth\//i,                     'auth'],

  // Billing (checkout, receipts, invoices)
  [/^\/api\/payments\//i,                     'billing'],
  [/^\/api\/v1\/workspaces\/.+\/billing\//i,  'billing'],

  // Customer service actions (hosting, VPS, domains, etc.)
  [/^\/api\/deployments\//i,                  'customer_service'],
  [/^\/api\/hosting\//i,                      'customer_service'],
  [/^\/api\/v1\/vps-hosting\//i,              'customer_service'],
  [/^\/api\/v1\/workspaces\/.+\/domains\//i,  'customer_service'],
  [/^\/api\/v1\/workspaces\/.+\/sites\//i,    'customer_service'],

  // Support / tickets
  [/^\/api\/v1\/tickets\//i,                  'support'],
  [/^\/api\/tickets\//i,                      'support'],

  // Analytics events
  [/^\/api\/v1\/events\//i,                   'analytics'],
  [/^\/api\/analytics\//i,                    'analytics'],

  // Customer account details
  [/^\/api\/v1\/auth\/profile/i,              'customer_account'],
  [/^\/api\/v1\/auth\/me/i,                   'customer_account'],
  [/^\/api\/notifications\//i,                'customer_account'],
  [/^\/api\/v1\/notifications\//i,            'customer_account'],

  // Public reads
  [/^\/api\/v1\/public\//i,                   'public_read'],
  [/^\/api\/v1\/templates\//i,                'public_read'],
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function classifyPath(path, method) {
  for (const [pattern, group] of PATH_GROUP_MAP) {
    if (pattern.test(path)) {
      // Admin reads vs writes
      if (group === 'admin_read' && WRITE_METHODS.has(method)) return 'admin_write';
      return group;
    }
  }
  return 'public_read';
}

function actorType(req) {
  if (!req.user) return 'anonymous';
  if (req.user.role === 'admin') return 'admin';
  return 'customer';
}

export function securityContext(req, _res, next) {
  const path  = req.path || req.url || '';
  const method = (req.method || 'GET').toUpperCase();
  const group = classifyPath(path, method);

  req.securityContext = {
    group,
    actorType: actorType(req),
    riskScore: 0,       // threatTag middleware will increment this
    watchdogTags: [],   // threatTag middleware will populate this
    ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
  };

  next();
}
