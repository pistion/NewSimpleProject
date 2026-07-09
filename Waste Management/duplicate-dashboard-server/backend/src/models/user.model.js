const { createId, nowIso, pickDefined, requiredString } = require('./base');

function createUser(input = {}) {
  return {
    id: input.id || createId('user'),
    name: requiredString(input.name || '', 'name'),
    email: requiredString(input.email || '', 'email'),
    role: input.role || 'viewer',
    status: input.status || 'active',
    preferences: input.preferences || {},
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function patchUser(user, patch = {}) {
  return {
    ...user,
    ...pickDefined({
      name: patch.name,
      email: patch.email,
      role: patch.role,
      status: patch.status,
      preferences: patch.preferences
    }),
    updatedAt: nowIso()
  };
}

module.exports = {
  createUser,
  patchUser
};
