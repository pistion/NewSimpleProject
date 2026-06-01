// ProfilePage.jsx — self-service account details for the signed-in customer.
import React from 'react';
import { ICN } from '../../icons';
import { getProfile, updateProfile, uploadIdPhoto, getIdPhotoUrl } from '../../api/profile.js';

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
  const [file, setFile] = useState(null);
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

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p = await getProfile();
      setProfile(p);
      setForm({ name: p.name || '', phone: p.phone || '', details: p.profileDetails || {} });
      if (p.hasIdPhoto) await loadPhoto();
    } catch (e) {
      setErr(e.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [loadPhoto]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const setDetail = (key, value) => setForm((f) => ({ ...f, details: { ...f.details, [key]: value } }));

  const save = async () => {
    setBusy('save'); setErr(''); setMsg('');
    try {
      const updated = await updateProfile({ name: form.name, phone: form.phone, profileDetails: form.details });
      setProfile(updated);
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

          {/* ID photo */}
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
