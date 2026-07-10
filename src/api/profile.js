/**
 * Profile API client — self-service account details for the signed-in customer.
 */
import { liveApiRequest, liveApiUrl } from '../api.js';
import { authHeaders } from './auth.js';

/**
 * The backend wraps profile responses as { data: { profile } } and
 * liveApiRequest already strips the outer { data }. Unwrap the remaining
 * { profile } layer so callers always receive the profile object itself.
 */
const unwrapProfile = (result) => result?.profile || result?.data?.profile || result;

/** Fetch the caller's own profile (name, phone, personal details, ID photo flag). */
export const getProfile = () =>
  liveApiRequest('/v1/auth/profile').then(unwrapProfile);

/** Update editable profile fields: { name, phone, organizationName, profileDetails }. */
export const updateProfile = (patch) =>
  liveApiRequest('/v1/auth/profile', { method: 'PATCH', body: patch }).then(unwrapProfile);

/** Change the sign-in email. Requires the current password. */
export const updateEmail = (newEmail, currentPassword) =>
  liveApiRequest('/v1/auth/profile/email', {
    method: 'PATCH',
    body: { newEmail, currentPassword },
  }).then(unwrapProfile);

/** Soft-delete the caller's own account. Requires the current password. */
export const deleteAccount = (currentPassword) =>
  liveApiRequest('/v1/auth/profile/delete', {
    method: 'POST',
    body: { currentPassword },
  });

/** Upload the caller's ID photo (PNG/JPG/JPEG, ≤5MB). */
export async function uploadIdPhoto(file) {
  if (!file) throw new Error('Choose an ID photo first.');
  const form = new FormData();
  form.append('idPhoto', file);
  const response = await fetch(liveApiUrl('/v1/auth/profile/id-photo'), {
    method: 'POST',
    headers: { ...authHeaders() }, // never set Content-Type; the browser adds the multipart boundary
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Upload failed (${response.status}).`);
  return unwrapProfile(result?.data ?? result);
}

/** Returns an object URL for the caller's own ID photo (caller revokes when done). */
export async function getIdPhotoUrl() {
  const response = await fetch(liveApiUrl('/v1/auth/profile/id-photo'), { headers: { ...authHeaders() } });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { const j = await response.json(); message = j?.error?.message || message; } catch { /* binary body */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/** Upload the caller's profile avatar/headshot (PNG/JPG/JPEG, ≤5MB). */
export async function uploadAvatar(file) {
  if (!file) throw new Error('Choose a profile photo first.');
  const form = new FormData();
  form.append('avatar', file);
  const response = await fetch(liveApiUrl('/v1/auth/profile/avatar'), {
    method: 'POST',
    headers: { ...authHeaders() }, // never set Content-Type; the browser adds the multipart boundary
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Upload failed (${response.status}).`);
  return unwrapProfile(result?.data ?? result);
}

/** Change the caller's own password. Requires currentPassword unless account has no password yet. */
export const changePassword = (currentPassword, newPassword) =>
  liveApiRequest('/v1/auth/profile/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });

/** Returns an object URL for the caller's own avatar (caller revokes when done). */
export async function getAvatarUrl() {
  const response = await fetch(liveApiUrl('/v1/auth/profile/avatar'), { headers: { ...authHeaders() } });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { const j = await response.json(); message = j?.error?.message || message; } catch { /* binary body */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
