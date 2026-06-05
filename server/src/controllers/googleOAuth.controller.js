import { randomBytes } from 'node:crypto';
import { getGoogleAuthUrl, handleGoogleCallback } from '../services/googleOAuthService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.VITE_APP_URL || 'http://localhost:5173';

const pendingStates = new Map();

const GoogleOAuthController = {
  redirect: (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(503).send('Google OAuth is not configured on this server.');
    }
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now());
    for (const [k, ts] of pendingStates) {
      if (Date.now() - ts > 600_000) pendingStates.delete(k);
    }
    res.redirect(getGoogleAuthUrl(state));
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
      const session = await handleGoogleCallback(code);
      const params = new URLSearchParams({
        google_auth:   '1',
        access_token:  session.tokens.accessToken,
        refresh_token: session.tokens.refreshToken,
        user:          JSON.stringify(session.user),
      });
      res.redirect(`${FRONTEND_URL}/?${params}`);
    } catch (err) {
      const msg = err.message || 'Google sign-in failed.';
      res.redirect(`${FRONTEND_URL}/?auth_error=${encodeURIComponent(msg)}`);
    }
  },
};

export default GoogleOAuthController;
