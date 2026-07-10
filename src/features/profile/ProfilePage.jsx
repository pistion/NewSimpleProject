/**
 * ProfilePage.jsx — Account settings page.
 * Design inspired by render-account-settings-preview.html.
 * Sections: Profile · Appearance · Account Security · Contact Details · Identity · Delete Account
 */
import React from 'react';
import './ProfilePage.css';
import {
  getProfile,
  updateProfile,
  updateEmail,
  deleteAccount,
  uploadAvatar,
  getAvatarUrl,
  uploadIdPhoto,
  changePassword,
} from '../../api/profile.js';
import { updateStoredAuthUser, logout } from '../../api/auth.js';

const { useState, useEffect, useCallback } = React;

const DETAIL_FIELDS = [
  { key: 'address',  label: 'Street Address' },
  { key: 'city',     label: 'City / Town' },
  { key: 'province', label: 'Province / State' },
  { key: 'country',  label: 'Country' },
  { key: 'idType',   label: 'ID Type (e.g. Passport)' },
  { key: 'idNumber', label: 'ID Number' },
  { key: 'companyName',            label: 'Company Name' },
  { key: 'billingEmail',           label: 'Billing Email' },
  { key: 'taxId',                  label: 'Tax ID (optional)' },
  { key: 'preferredContactMethod', label: 'Preferred Contact (email / phone)' },
  { key: 'timezone',               label: 'Timezone (e.g. Pacific/Port_Moresby)' },
];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function fmt(val) {
  return val && String(val).trim() ? String(val).trim() : null;
}

export default function ProfilePage({ navigate, theme: themeProp = 'dark', onThemeChange }) {
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  // editing: null | 'name' | 'phone' | 'avatar' | 'details' | 'theme' | 'password' | 'idphoto'
  const [editing, setEditing] = useState(null);

  // field values for single-field edits
  const [fieldVal, setFieldVal] = useState('');
  const [detailsVal, setDetailsVal] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);
  const [idFile, setIdFile] = useState(null);

  // password form
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });

  // email change + delete-account forms
  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' });
  const [deleteForm, setDeleteForm] = useState({ confirm: '', password: '' });

  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────────

  const loadAvatar = useCallback(async () => {
    try {
      const url = await getAvatarUrl();
      setAvatarUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch { /* no avatar */ }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const p = await getProfile();
      setProfile(p);
      if (p.hasAvatar) await loadAvatar();
    } catch (e) {
      setErr(e.message || 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, [loadAvatar]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (avatarUrl) URL.revokeObjectURL(avatarUrl); }, [avatarUrl]);

  // ── Edit helpers ──────────────────────────────────────────────────────────────

  const startEdit = (field) => {
    setEditing(field);
    setMsg(''); setErr('');
    if (field === 'name') setFieldVal(profile?.name || '');
    if (field === 'phone') setFieldVal(profile?.phone || '');
    if (field === 'org') setFieldVal(profile?.organizationName || profile?.profileDetails?.organizationName || '');
    if (field === 'details') setDetailsVal({ ...(profile?.profileDetails || {}) });
    if (field === 'password') setPwForm({ current: '', newPw: '', confirm: '' });
    if (field === 'email') setEmailForm({ newEmail: '', password: '' });
    if (field === 'delete') setDeleteForm({ confirm: '', password: '' });
    if (field === 'avatar') setAvatarFile(null);
    if (field === 'idphoto') setIdFile(null);
  };

  const cancelEdit = () => setEditing(null);

  const flash = (ok, m) => { if (ok) setMsg(m); else setErr(m); };

  // ── Save handlers ─────────────────────────────────────────────────────────────

  const saveName = async () => {
    setBusy('name'); setErr('');
    try {
      const p = await updateProfile({ name: fieldVal });
      setProfile(p);
      updateStoredAuthUser({ name: p.name });
      setEditing(null);
      flash(true, 'Name updated.');
    } catch (e) { flash(false, e.message || 'Could not save name.'); }
    finally { setBusy(''); }
  };

  const savePhone = async () => {
    setBusy('phone'); setErr('');
    try {
      const p = await updateProfile({ phone: fieldVal });
      setProfile(p);
      updateStoredAuthUser({ phone: p.phone });
      setEditing(null);
      flash(true, 'Phone number updated.');
    } catch (e) { flash(false, e.message || 'Could not save phone.'); }
    finally { setBusy(''); }
  };

  const saveOrg = async () => {
    setBusy('org'); setErr('');
    try {
      const p = await updateProfile({ organizationName: fieldVal });
      setProfile(p);
      updateStoredAuthUser({ organizationName: p.organizationName });
      setEditing(null);
      flash(true, 'Organization name updated.');
    } catch (e) { flash(false, e.message || 'Could not save organization name.'); }
    finally { setBusy(''); }
  };

  const saveEmail = async () => {
    if (!emailForm.newEmail.trim()) { setErr('Enter your new email address.'); return; }
    if (!emailForm.password) { setErr('Enter your current password to confirm the change.'); return; }
    setBusy('email'); setErr('');
    try {
      const p = await updateEmail(emailForm.newEmail.trim(), emailForm.password);
      setProfile(p);
      updateStoredAuthUser({ email: p.email });
      setEditing(null);
      setEmailForm({ newEmail: '', password: '' });
      flash(true, 'Email address updated. Use the new address next time you sign in.');
    } catch (e) { flash(false, e.message || 'Could not update email.'); }
    finally { setBusy(''); }
  };

  const confirmDelete = async () => {
    const typed = deleteForm.confirm.trim();
    const confirmed = typed === 'DELETE' || typed.toLowerCase() === (profile?.email || '').toLowerCase();
    if (!confirmed) {
      setErr('Type DELETE or your account email to confirm.');
      return;
    }
    if (!deleteForm.password) { setErr('Enter your password to confirm deletion.'); return; }
    setBusy('delete'); setErr('');
    try {
      await deleteAccount(deleteForm.password);
      await logout();
      window.location.href = '/';
    } catch (e) { flash(false, e.message || 'Could not delete account.'); }
    finally { setBusy(''); }
  };

  const saveDetails = async () => {
    setBusy('details'); setErr('');
    try {
      const p = await updateProfile({ profileDetails: detailsVal });
      setProfile(p);
      setEditing(null);
      flash(true, 'Contact details updated.');
    } catch (e) { flash(false, e.message || 'Could not save details.'); }
    finally { setBusy(''); }
  };

  const saveAvatar = async () => {
    if (!avatarFile) { setErr('Choose a photo first.'); return; }
    setBusy('avatar'); setErr('');
    try {
      const p = await uploadAvatar(avatarFile);
      setProfile(p);
      await loadAvatar();
      updateStoredAuthUser({ hasAvatar: true, avatarUrl: `/api/v1/auth/profile/avatar?t=${Date.now()}` });
      setEditing(null);
      flash(true, 'Profile photo updated.');
    } catch (e) { flash(false, e.message || 'Upload failed.'); }
    finally { setBusy(''); }
  };

  const saveIdPhoto = async () => {
    if (!idFile) { setErr('Choose a photo of your ID first.'); return; }
    setBusy('idphoto'); setErr('');
    try {
      const p = await uploadIdPhoto(idFile);
      setProfile(p);
      setEditing(null);
      flash(true, 'ID photo uploaded.');
    } catch (e) { flash(false, e.message || 'Upload failed.'); }
    finally { setBusy(''); }
  };

  const savePassword = async () => {
    if (pwForm.newPw !== pwForm.confirm) { setErr('New passwords do not match.'); return; }
    if (pwForm.newPw.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    setBusy('password'); setErr('');
    try {
      await changePassword(pwForm.current, pwForm.newPw);
      setEditing(null);
      setPwForm({ current: '', newPw: '', confirm: '' });
      flash(true, 'Password updated successfully.');
    } catch (e) { flash(false, e.message || 'Could not update password.'); }
    finally { setBusy(''); }
  };

  const applyTheme = async (v) => {
    onThemeChange?.(v);
    setEditing(null);
    // Persist alongside other display preferences (merged so nothing is wiped).
    try {
      const prevPrefs = profile?.profileDetails?.displayPreferences || {};
      const p = await updateProfile({
        profileDetails: { displayPreferences: { ...prevPrefs, theme: v } },
      });
      setProfile(p);
      flash(true, `Theme set to ${v}.`);
    } catch {
      flash(true, `Theme set to ${v} (saved locally; could not sync to your account).`);
    }
  };

  // ── Address summary ───────────────────────────────────────────────────────────

  const addressSummary = () => {
    const d = profile?.profileDetails || {};
    const parts = [d.address, d.city, d.province, d.country].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="acct-page">
        <div className="card" style={{ padding: 28, color: 'var(--text-muted)' }}>Loading account…</div>
      </div>
    );
  }

  const currentTheme = themeProp || 'dark';

  return (
    <div className="acct-page">

      {/* Page head */}
      <div className="acct-page-head">
        <div>
          <div className="acct-eyebrow">Account</div>
          <h1>Account settings</h1>
          <p>Manage your profile, security settings, and dashboard preferences.</p>
        </div>
        <div className="acct-badge">
          <span className="acct-badge-dot" />
          Personal account
        </div>
      </div>

      {/* Flash */}
      {msg && <div className="acct-flash ok">{msg}</div>}
      {err && <div className="acct-flash err">{err}</div>}

      {/* ── Main panel ── */}
      <div className="acct-panel">

        {/* ──── Profile ──── */}
        <div className="acct-section" id="profile">
          <div className="acct-section-head">
            <div>
              <h2>Profile</h2>
              <p>Your account name, email address, and profile image.</p>
            </div>
          </div>
          <div className="acct-rows">

            {/* Full Name */}
            <div className="acct-row">
              <div className="acct-row-label">Full Name</div>
              {editing === 'name' ? (
                <>
                  <input
                    className="acct-input"
                    value={fieldVal}
                    onChange={(e) => setFieldVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="acct-btn primary" disabled={busy === 'name'} onClick={saveName}>
                      {busy === 'name' ? 'Saving…' : 'Save'}
                    </button>
                    <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="acct-row-value">
                    <strong>{fmt(profile?.name) || '—'}</strong>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('name')}>Edit</button>
                </>
              )}
            </div>

            {/* Organization / Business Name */}
            <div className="acct-row">
              <div className="acct-row-label">Organization</div>
              {editing === 'org' ? (
                <>
                  <input
                    className="acct-input"
                    value={fieldVal}
                    onChange={(e) => setFieldVal(e.target.value)}
                    placeholder="Your business or organization name"
                    onKeyDown={(e) => e.key === 'Enter' && saveOrg()}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="acct-btn primary" disabled={busy === 'org'} onClick={saveOrg}>
                      {busy === 'org' ? 'Saving…' : 'Save'}
                    </button>
                    <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="acct-row-value">
                    <strong>{fmt(profile?.organizationName || profile?.profileDetails?.organizationName) || '—'}</strong>
                    <div className="acct-row-hint">Shown on invoices and workspace branding.</div>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('org')}>Edit</button>
                </>
              )}
            </div>

            {/* Email */}
            <div className="acct-row">
              <div className="acct-row-label">Email</div>
              {editing !== 'email' && (
                <>
                  <div className="acct-row-value">
                    <strong>{profile?.email}</strong>
                    <div className="acct-row-hint">Used to sign in. Changes require password confirmation.</div>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('email')}>Edit</button>
                </>
              )}
            </div>

            {/* Email expanded form */}
            {editing === 'email' && (
              <div className="acct-form-block">
                <div className="acct-row-label">Change Email</div>
                <div className="acct-form-grid">
                  <div className="acct-field">
                    <label>New Email Address</label>
                    <input
                      type="email"
                      className="acct-input"
                      value={emailForm.newEmail}
                      onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                      placeholder="you@newdomain.com"
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                  <div className="acct-field">
                    <label>Current Password</label>
                    <input
                      type="password"
                      className="acct-input"
                      value={emailForm.password}
                      onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <div className="acct-form-actions">
                  <button className="acct-btn primary" disabled={busy === 'email'} onClick={saveEmail}>
                    {busy === 'email' ? 'Saving…' : 'Update Email'}
                  </button>
                  <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}

            {/* Avatar */}
            <div className="acct-row">
              <div className="acct-row-label">Avatar</div>
              {editing === 'avatar' ? (
                <>
                  <div className="acct-file-row">
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="acct-btn primary" disabled={busy === 'avatar' || !avatarFile} onClick={saveAvatar}>
                      {busy === 'avatar' ? 'Uploading…' : 'Upload'}
                    </button>
                    <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="acct-row-value">
                    {avatarUrl
                      ? <img className="acct-avatar-img" src={avatarUrl} alt="Your avatar" />
                      : <div className="acct-avatar-box">{initials(profile?.name)}</div>}
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('avatar')}>Edit</button>
                </>
              )}
            </div>

          </div>
        </div>

        {/* ──── Appearance ──── */}
        <div className="acct-section" id="appearance">
          <div className="acct-section-head">
            <div>
              <h2>Appearance</h2>
              <p>Theme and display preferences for the dashboard.</p>
            </div>
          </div>
          <div className="acct-rows">

            {/* Dashboard Theme */}
            <div className="acct-row">
              <div className="acct-row-label">Dashboard Theme</div>
              {editing === 'theme' ? (
                <>
                  <div>
                    <div className="acct-theme-seg">
                      {['light', 'dark'].map((t) => (
                        <button
                          key={t}
                          className={`acct-theme-opt${currentTheme === t ? ' active' : ''}`}
                          onClick={() => applyTheme(t)}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                </>
              ) : (
                <>
                  <div className="acct-row-value">
                    <strong>{currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)}</strong>
                    <div className="acct-row-mono">themeSetting</div>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('theme')}>Edit</button>
                </>
              )}
            </div>

            {/* High Contrast (placeholder) */}
            <div className="acct-row">
              <div className="acct-row-label">High Contrast</div>
              <div className="acct-row-value">
                <span className="acct-status">
                  <span className="acct-status-dot" />
                  Disabled
                </span>
                <div className="acct-row-hint">Increases visibility of interactive elements.</div>
              </div>
              <button className="acct-btn" disabled>Enable</button>
            </div>

          </div>
        </div>

        {/* ──── Account Security ──── */}
        <div className="acct-section" id="security">
          <div className="acct-section-head">
            <div>
              <h2>Account Security</h2>
              <p>Password, login methods, and two-factor authentication.</p>
            </div>
          </div>
          <div className="acct-rows">

            {/* Password */}
            <div className="acct-row">
              <div className="acct-row-label">Password</div>
              {editing !== 'password' && (
                <>
                  <div className="acct-row-value">
                    <strong>••••••••</strong>
                    <div className="acct-row-hint">Update your account password.</div>
                  </div>
                  <button className="acct-btn primary" onClick={() => startEdit('password')}>Update</button>
                </>
              )}
            </div>

            {/* Password expanded form */}
            {editing === 'password' && (
              <div className="acct-form-block">
                <div className="acct-row-label">Change Password</div>
                <div className="acct-form-grid">
                  <div className="acct-field">
                    <label>Current Password</label>
                    <input
                      type="password"
                      className="acct-input"
                      value={pwForm.current}
                      onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                      autoFocus
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="acct-field">
                    <label>New Password</label>
                    <input
                      type="password"
                      className="acct-input"
                      value={pwForm.newPw}
                      onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="acct-field">
                    <label>Confirm New Password</label>
                    <input
                      type="password"
                      className="acct-input"
                      value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="acct-form-actions">
                  <button className="acct-btn primary" disabled={busy === 'password'} onClick={savePassword}>
                    {busy === 'password' ? 'Saving…' : 'Update Password'}
                  </button>
                  <button className="acct-btn" onClick={() => { cancelEdit(); setPwForm({ current: '', newPw: '', confirm: '' }); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Login Method */}
            <div className="acct-row">
              <div className="acct-row-label">Login Method</div>
              <div className="acct-row-value">
                <strong>{profile?.email}</strong>
                <div className="acct-row-hint">Your account is accessed using this email address.</div>
              </div>
              <button className="acct-btn" disabled>Options</button>
            </div>

            {/* Two-Factor Auth */}
            <div className="acct-row">
              <div className="acct-row-label">Two-Factor Auth</div>
              <div className="acct-row-value">
                <span className="acct-status">
                  <span className="acct-status-dot" />
                  Disabled
                </span>
                <div className="acct-row-hint">Time-based OTP compatible with major authenticator apps.</div>
              </div>
              <button className="acct-btn" disabled>Enable</button>
            </div>

          </div>
        </div>

        {/* ──── Contact Details ──── */}
        <div className="acct-section" id="contact">
          <div className="acct-section-head">
            <div>
              <h2>Contact Details</h2>
              <p>Phone number and postal address information.</p>
            </div>
          </div>
          <div className="acct-rows">

            {/* Phone */}
            <div className="acct-row">
              <div className="acct-row-label">Phone</div>
              {editing === 'phone' ? (
                <>
                  <input
                    className="acct-input"
                    value={fieldVal}
                    onChange={(e) => setFieldVal(e.target.value)}
                    placeholder="+675 7000 0000"
                    onKeyDown={(e) => e.key === 'Enter' && savePhone()}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="acct-btn primary" disabled={busy === 'phone'} onClick={savePhone}>
                      {busy === 'phone' ? 'Saving…' : 'Save'}
                    </button>
                    <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="acct-row-value">
                    <strong>{fmt(profile?.phone) || '—'}</strong>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('phone')}>Edit</button>
                </>
              )}
            </div>

            {/* Address */}
            <div className="acct-row">
              <div className="acct-row-label">Address</div>
              {editing !== 'details' && (
                <>
                  <div className="acct-row-value">
                    <strong>{addressSummary() || '—'}</strong>
                    {profile?.profileDetails?.country && (
                      <div className="acct-row-hint">{profile.profileDetails.country}</div>
                    )}
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('details')}>Edit</button>
                </>
              )}
            </div>

            {/* Address expanded form */}
            {editing === 'details' && (
              <div className="acct-form-block">
                <div className="acct-row-label">Address Details</div>
                <div className="acct-form-grid">
                  {DETAIL_FIELDS.map((f) => (
                    <div key={f.key} className="acct-field">
                      <label>{f.label}</label>
                      <input
                        className="acct-input"
                        value={detailsVal[f.key] || ''}
                        onChange={(e) => setDetailsVal({ ...detailsVal, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="acct-form-actions">
                  <button className="acct-btn primary" disabled={busy === 'details'} onClick={saveDetails}>
                    {busy === 'details' ? 'Saving…' : 'Save Details'}
                  </button>
                  <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ──── Identity Verification ──── */}
        <div className="acct-section" id="identity">
          <div className="acct-section-head">
            <div>
              <h2>Identity Verification</h2>
              <p>Government ID photo for payment and account verification. Only visible to you and administrators.</p>
            </div>
          </div>
          <div className="acct-rows">

            <div className="acct-row">
              <div className="acct-row-label">ID Document</div>
              {editing !== 'idphoto' && (
                <>
                  <div className="acct-row-value">
                    <span className={`acct-status${profile?.hasIdPhoto ? ' on' : ''}`}>
                      <span className="acct-status-dot" />
                      {profile?.hasIdPhoto ? 'Uploaded' : 'Not uploaded'}
                    </span>
                    <div className="acct-row-hint">PNG, JPG or JPEG, up to 5 MB.</div>
                  </div>
                  <button className="acct-btn" onClick={() => startEdit('idphoto')}>
                    {profile?.hasIdPhoto ? 'Replace' : 'Upload'}
                  </button>
                </>
              )}
            </div>

            {editing === 'idphoto' && (
              <div className="acct-form-block">
                <div className="acct-row-label">Upload ID Photo</div>
                <div className="acct-file-row">
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                    onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="acct-form-actions">
                  <button className="acct-btn primary" disabled={busy === 'idphoto' || !idFile} onClick={saveIdPhoto}>
                    {busy === 'idphoto' ? 'Uploading…' : 'Upload'}
                  </button>
                  <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>{/* end .acct-panel */}

      {/* ── Danger Zone ── */}
      <div className="acct-danger-panel">
        <div className="acct-section-head">
          <div>
            <h2>Delete Account</h2>
            <p>Deactivates your account and signs you out everywhere. Contact support to restore it.</p>
          </div>
          {editing !== 'delete' && (
            <button className="acct-btn danger" onClick={() => startEdit('delete')}>
              Delete Account
            </button>
          )}
        </div>

        {editing === 'delete' && (
          <div className="acct-form-block">
            <div className="acct-row-label">Confirm Account Deletion</div>
            <div className="acct-form-grid">
              <div className="acct-field">
                <label>Type DELETE or your account email</label>
                <input
                  className="acct-input"
                  value={deleteForm.confirm}
                  onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })}
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <div className="acct-field">
                <label>Current Password</label>
                <input
                  type="password"
                  className="acct-input"
                  value={deleteForm.password}
                  onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <div className="acct-form-actions">
              <button className="acct-btn danger" disabled={busy === 'delete'} onClick={confirmDelete}>
                {busy === 'delete' ? 'Deleting…' : 'Permanently Delete'}
              </button>
              <button className="acct-btn" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
