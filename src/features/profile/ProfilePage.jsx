// ProfilePage.jsx — self-service account details for the signed-in customer.
import React from 'react';
import { ICN } from '../../icons';
import { getProfile, updateProfile, uploadIdPhoto, getIdPhotoUrl, uploadAvatar, getAvatarUrl } from '../../api/profile.js';
import { updateStoredAuthUser } from '../../api/auth.js';

const { useState, useEffect, useCallback } = React;

// Structured personal details stored inside profileDetails (JSON).
const DETAIL_FIELDS = [
  { key: 'address',   label: 'Address' },
  { key: 'city',      label: 'City / Town' },
  { key: 'province',  label: 'Province / State' },
  { key: 'country',   label: 'Country' },
  { key: 'idType',    label: 'ID type (e.g. Passport, NID)' },
  { key: 'idNumber',  label: 'ID number' },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', details: {} });
  const [photoUrl, setPhotoUrl] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [file, setFile] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadPhoto = useCallback(async () => {
    try {
      const url = await getIdPhotoUrl();
      setPhotoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch { /* no photo yet */ }
  }, []);

  const loadAvatar = useCallback(async () => {
    try {
      const url = await getAvatarUrl();
      setAvatarUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch { /* no avatar yet */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p = await getProfile();
      setProfile(p);
      setForm({ name: p.name || '', phone: p.phone || '', details: p.profileDetails || {} });
      if (p.hasIdPhoto) await loadPhoto();
      if (p.hasAvatar) await loadAvatar();
    } catch (e) {
      setErr(e.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [loadPhoto, loadAvatar]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);
  useEffect(() => () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl); }, [avatarUrl]);

  const setDetail = (key, value) => setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));

  const save = async () => {
    setBusy('save'); setErr(''); setMsg('');
    try {
      const updated = await updateProfile({ name: form.name, phone: form.phone, profileDetails: form.details });
      setProfile(updated);
      // Reflect the saved name/phone in the topbar account menu immediately.
      updateStoredAuthUser({ name: updated.name, phone: updated.phone });
      setMsg('Account details saved.');
    } catch (e) {
      setErr(e.message || 'Could not save your details.');
    } finally { setBusy(''); }
  };

  const upload = async () => {
    if (!file) { setErr('Choose a photo of your ID (PNG, JPG or JPEG).'); return; }
    setBusy('photo'); setErr(''); setMsg('');
    try {
      const updated = await uploadIdPhoto(file);
      setProfile(updated);
      setFile(null);
      await loadPhoto();
      setMsg('ID photo uploaded.');
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  const uploadHeadshot = async () => {
    if (!avatarFile) { setErr('Choose a profile photo (PNG, JPG or JPEG).'); return; }
    setBusy('avatar'); setErr(''); setMsg('');
    try {
      const updated = await uploadAvatar(avatarFile);
      setProfile(updated);
      setAvatarFile(null);
      await loadAvatar();
      // Topbar avatar updates immediately; cache-bust the authenticated route.
      updateStoredAuthUser({ hasAvatar: true, avatarUrl: `/api/v1/auth/profile/avatar?t=${Date.now()}` });
      setMsg('Profile photo updated.');
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally { setBusy(''); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Account</div>
          <h1>Your profile</h1>
          <p className="sub">Keep your contact and identity details up to date. We use these to verify payments and contact you about your hosting.</p>
        </div>
      </div>

      {err && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--danger)' }}>{err}</div>}
      {msg && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, color: 'var(--accent)' }}>{msg}</div>}

      {loading ? (
        <div className="card" style={{ padding: 28 }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Identity (read-only) + contact */}
          <div className="card" style={{ padding: 18 }}>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>Contact details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <Field label="Email (sign-in)"><input className="input" value={profile?.email || ''} disabled /></Field>
              <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></Field>
              <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +675 7000 0000" /></Field>
            </div>
          </div>

          {/* Personal details */}
          <div className="card" style={{ padding: 18 }}>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>Personal details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {DETAIL_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <input className="input" value={form.details?.[f.key] || ''} onChange={(e) => setDetail(f.key, e.target.value)} />
                </Field>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" disabled={busy === 'save'} onClick={save}>
                <ICN.CheckCircle size={14} /> {busy === 'save' ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </div>

          {/* Profile photo / Headshot (used as your account avatar) */}
          <div className="card" style={{ padding: 18 }}>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>Profile photo / Headshot</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '0 0 120px' }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="Your profile" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
                  : <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--bg-deep)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><ICN.User size={40} /></div>}
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                  This is used as your account avatar across the dashboard (PNG, JPG or JPEG, up to 5MB). It is separate from your private ID photo.
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(e) => setAvatarFile(e.target.files?.[0] || null)} />
                  <button className="btn btn-primary btn-sm" disabled={busy === 'avatar' || !avatarFile} onClick={uploadHeadshot}>
                    <ICN.Cloud size={13} /> {busy === 'avatar' ? 'Uploading…' : (profile?.hasAvatar ? 'Replace photo' : 'Upload photo')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ID photo (private verification document) */}
          <div className="card" style={{ padding: 18 }}>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>ID photo</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '0 0 220px' }}>
                {photoUrl
                  ? <img src={photoUrl} alt="Your ID" style={{ maxWidth: 220, borderRadius: 8, border: '1px solid var(--border)' }} />
                  : <div className="muted" style={{ fontSize: 13 }}>{profile?.hasIdPhoto ? 'Loading…' : 'No ID photo uploaded yet.'}</div>}
              </div>
              <div style={{ flex: '1 1 280px' }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                  Upload a clear photo or scan of your government ID (PNG, JPG or JPEG, up to 5MB). Only you and an administrator can view it.
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <button className="btn btn-primary btn-sm" disabled={busy === 'photo' || !file} onClick={upload}>
                    <ICN.Cloud size={13} /> {busy === 'photo' ? 'Uploading…' : (profile?.hasIdPhoto ? 'Replace ID photo' : 'Upload ID photo')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label" style={{ display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
