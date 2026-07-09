const { createId, nowIso, pickDefined, requiredString } = require('./base');

const MessageKind = Object.freeze({
  GENERAL:        'general',
  JOB_APPLICATION:'job-application',
  CV_SUBMISSION:  'cv-submission'
});

const MessageStatus = Object.freeze({
  UNREAD:   'unread',
  READ:     'read',
  ARCHIVED: 'archived'
});

const VALID_MESSAGE_KINDS    = new Set(Object.values(MessageKind));
const VALID_MESSAGE_STATUSES = new Set(Object.values(MessageStatus));

function normalizeKind(kind) {
  if (!kind) return MessageKind.GENERAL;
  if (VALID_MESSAGE_KINDS.has(kind)) return kind;
  // Tolerate boolean-ish toggles coming from the public contact form.
  if (kind === true  || kind === 'cv' || kind === 'application' || kind === 'job') {
    return MessageKind.JOB_APPLICATION;
  }
  return MessageKind.GENERAL;
}

function createMessage(input = {}) {
  const kind = normalizeKind(input.kind || input.type);
  const isApplication = kind !== MessageKind.GENERAL;
  return {
    id:              input.id || createId('msg'),
    kind,
    isApplication,
    status:          VALID_MESSAGE_STATUSES.has(input.status) ? input.status : MessageStatus.UNREAD,
    name:            requiredString(input.name || '', 'name'),
    email:           (input.email || '').trim() || null,
    phone:           (input.phone || '').trim() || null,
    subject:         (input.subject || (isApplication ? 'Job application / CV submission' : 'New message')).trim(),
    body:            (input.body || input.message || '').trim(),
    positionId:      input.positionId || null,
    positionTitle:   input.positionTitle || null,
    cvName:          input.cvName || null,
    cvUrl:           input.cvUrl || null,
    coverLetterName: input.coverLetterName || null,
    coverLetterUrl:  input.coverLetterUrl || null,
    source:          input.source || 'contact-form',
    userAgent:       input.userAgent || null,
    ipAddress:       input.ipAddress || null,
    repliedAt:       input.repliedAt || null,
    replyBody:       input.replyBody || null,
    linkedTalentId:  input.linkedTalentId || null,
    linkedApplicantId: input.linkedApplicantId || null,
    receivedAt:      input.receivedAt || nowIso(),
    createdAt:       input.createdAt || nowIso(),
    updatedAt:       input.updatedAt || nowIso()
  };
}

function patchMessage(message, patch = {}) {
  return {
    ...message,
    ...pickDefined({
      status:            patch.status,
      subject:           patch.subject,
      body:              patch.body,
      positionId:        patch.positionId,
      positionTitle:     patch.positionTitle,
      cvName:            patch.cvName,
      cvUrl:             patch.cvUrl,
      coverLetterName:   patch.coverLetterName,
      coverLetterUrl:    patch.coverLetterUrl,
      repliedAt:         patch.repliedAt,
      replyBody:         patch.replyBody,
      linkedTalentId:    patch.linkedTalentId,
      linkedApplicantId: patch.linkedApplicantId
    }),
    updatedAt: nowIso()
  };
}

module.exports = {
  MessageKind,
  MessageStatus,
  VALID_MESSAGE_KINDS,
  VALID_MESSAGE_STATUSES,
  createMessage,
  patchMessage
};
