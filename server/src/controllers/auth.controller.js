/**
 * AuthController
 * Real identity + session management for the paid MVP.
 * Uses bcrypt password hashing, JWT access tokens, and DB-backed rotating
 * refresh tokens (see services/authService.js).
 */

import {
  getUserById,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
} from '../services/authService.js';

const AuthController = {
  register: async (req, res, next) => {
    try {
      const { email, password, name } = req.body || {};
      const session = await registerUser({ email, password, name });
      res.created(session);
    } catch (error) {
      next(error);
    }
  },

  login: async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      const session = await loginUser({ email, password });
      res.ok(session);
    } catch (error) {
      next(error);
    }
  },

  refreshToken: async (req, res, next) => {
    try {
      const rawToken = req.body?.refreshToken || req.body?.token;
      const session = await refreshSession(rawToken);
      res.ok(session);
    } catch (error) {
      next(error);
    }
  },

  logout: async (req, res, next) => {
    try {
      await logoutUser(req.body?.refreshToken || req.body?.token);
      res.ok({ message: 'Logged out successfully.' });
    } catch (error) {
      next(error);
    }
  },

  me: async (req, res, next) => {
    try {
      const user = await getUserById(req.user?.id);
      if (!user) return res.error('NOT_FOUND', 'User not found.', 404);
      res.ok({ user });
    } catch (error) {
      next(error);
    }
  },
};

export default AuthController;
