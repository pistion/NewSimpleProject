import { randomBytes } from 'node:crypto';
import { getGitHubAuthUrl, handleGitHubCallback } from '../services/githubOAuthService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.VITE_APP_URL || 'http://localhost:5173';

// Pending OAuth states (in-memory, single instance — fine for single-server deployments).
const pendingStates = new Map();

const GitHubOAuthController = {
  redirect: (req, res) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.status(503).send('GitHub OAuth is not configured on this server.');
    }
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now());
    // Prune states older than 10 minutes
    for (const [k, ts] of pendingStates) {
      if (Date.now() - ts > 600_000) pendingStates.delete(k);
    }
    res.redirect(getGitHubAuthUrl(state));
  },

  callback: async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${FRONTEND_URL}/?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state || !pendingStates.has(state)) {
      return res.redirect(`${FRONTEND_URL}/?auth_error=invalid_state`);
    }
    pendingStates.delete(state);

    try {
      const session = await handleGitHubCallback(code);
      // Pass tokens to the frontend via URL — the SPA reads them and stores in localStorage.
      const params = new URLSearchParams({
        github_auth:    '1',
        access_token:   session.tokens.accessToken,
        refresh_token:  session.tokens.refreshToken,
        github_login:   session.githubLogin || '',
        user:           JSON.stringify(session.user),
      });
      res.redirect(`${FRONTEND_URL}/?${params}`);
    } catch (err) {
      const msg = err.message || 'GitHub sign-in failed.';
      res.redirect(`${FRONTEND_URL}/?auth_error=${encodeURIComponent(msg)}`);
    }
  },
};

export default GitHubOAuthController;
