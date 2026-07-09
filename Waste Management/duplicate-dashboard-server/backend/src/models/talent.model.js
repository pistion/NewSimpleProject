const { TalentStatus } = require('./enums');
const { createId, nowIso, pickDefined, requiredString } = require('./base');

function createTalent(input = {}) {
  return {
    id: input.id || createId('talent'),
    name: requiredString(input.name || '', 'name'),
    title: input.title || '',
    photo: input.photo || null,
    location: input.location || '',
    yearsExperience: Number(input.yearsExperience || 0),
    matchScore: Number(input.matchScore || 0),
    status: input.status || TalentStatus.ACTIVE,
    silverMedalist: Boolean(input.silverMedalist),
    headline: input.headline || '',
    email: input.email || '',
    phone: input.phone || '',
    languages: Array.isArray(input.languages) ? input.languages : [],
    education: input.education || '',
    skills: Array.isArray(input.skills) ? input.skills : [],
    pastRoles: Array.isArray(input.pastRoles) ? input.pastRoles : [],
    lastTouchpoint: input.lastTouchpoint || null,
    source: input.source || '',
    notes: input.notes || '',
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso()
  };
}

function patchTalent(talent, patch = {}) {
  return {
    ...talent,
    ...pickDefined({
      name: patch.name,
      title: patch.title,
      photo: patch.photo,
      location: patch.location,
      yearsExperience: patch.yearsExperience,
      matchScore: patch.matchScore,
      status: patch.status,
      silverMedalist: patch.silverMedalist,
      headline: patch.headline,
      email: patch.email,
      phone: patch.phone,
      languages: patch.languages,
      education: patch.education,
      skills: patch.skills,
      pastRoles: patch.pastRoles,
      lastTouchpoint: patch.lastTouchpoint,
      source: patch.source,
      notes: patch.notes
    }),
    updatedAt: nowIso()
  };
}

module.exports = {
  createTalent,
  patchTalent
};
