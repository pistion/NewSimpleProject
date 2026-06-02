/**
 * Profile API client — self-service account details for the signed-in customer.
 */
import { liveApiRequest, liveApiUrl } from '../api.js';
import { authHeaders } from './auth.js';

/** Fetch the caller's own profile (name, phone, personal details, ID photo flag). */
export const getProfile = () => liveApiRequest('/v1/auth/profile');

/** Update editable profile fields: { name, phone, profileDetails }. */
export const updateProfile = (patch) =>
  liveApiRequest('/v1/auth/profile', { method: 'PATCH', body: patch });

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
  return result?.data ?? result;
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
  return result?.data ?? result;
}

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
