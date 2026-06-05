import { useState } from 'react'
import { login, SOCIAL_PROVIDERS, socialAuthUrl } from '../../api/auth.js'

const S = {
  page: {
    minHeight: '100vh',
    background: '#0A0D0A',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    backgroundImage: 'radial-gradient(rgba(91,255,143,0.04) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    padding: '24px',
    position: 'relative',
  },
  back: {
    position: 'absolute',
    top: '24px',
    left: '28px',
    fontFamily: 'inherit',
    fontSize: '12px',
    color: '#4A5550',
    background: 'none',
    border: 'none',
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  box: {
    width: '100%',
    maxWidth: '420px',
    border: '1px solid #1E2A20',
    background: '#0D110D',
    boxShadow: '0 0 60px -20px rgba(91,255,143,0.12)',
  },
  head: {
    borderBottom: '1px solid #1E2A20',
    background: '#0F140F',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '11px',
    color: '#4A5550',
  },
  dots: { display: 'flex', gap: '6px' },
  dot: (c) => ({ width: '10px', height: '10px', borderRadius: '50%', background: c }),
  title: { flex: 1, textAlign: 'center', color: '#4A5550' },
  body: { padding: '32px 28px 28px' },
  eyebrow: {
    fontSize: '10px',
    color: '#5BFF8F',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#E8E8DC',
    letterSpacing: '-0.02em',
    margin: '0 0 6px',
  },
  sub: {
    fontSize: '13px',
    color: '#4A5550',
    marginBottom: '28px',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    fontSize: '11px',
    color: '#8A9388',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: '6px',
  },
  input: (focused) => ({
    width: '100%',
    background: '#0A0D0A',
    border: `1px solid ${focused ? '#5BFF8F' : '#1E2A20'}`,
    color: '#E8E8DC',
    fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    fontSize: '13px',
    padding: '10px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }),
  fieldWrap: { marginBottom: '16px' },
  btn: (disabled) => ({
    width: '100%',
    background: disabled ? '#2D5A3A' : '#5BFF8F',
    color: '#001A09',
    border: 'none',
    fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '13px 20px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.15s',
    opacity: disabled ? 0.6 : 1,
  }),
  socialBtn: (active) => ({
    width: '100%',
    background: 'transparent',
    border: '1px solid #1E2A20',
    color: active ? '#E8E8DC' : '#8A9388',
    fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    fontSize: '12px',
    padding: '10px 16px',
    cursor: active ? 'pointer' : 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
    opacity: active ? 1 : 0.5,
    position: 'relative',
    textDecoration: 'none',
    transition: 'border-color 0.15s, color 0.15s',
  }),
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '20px 0',
    color: '#2D4030',
    fontSize: '10px',
    letterSpacing: '0.1em',
  },
  dividerLine: { flex: 1, height: '1px', background: '#1E2A20' },
  footer: {
    fontSize: '12px',
    color: '#4A5550',
    marginTop: '20px',
    textAlign: 'center',
    lineHeight: 1.6,
    borderTop: '1px solid #1E2A20',
    paddingTop: '16px',
  },
  link: { color: '#5BFF8F', textDecoration: 'none', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', padding: 0 },
  errorBox: {
    background: 'rgba(255,60,60,0.08)',
    border: '1px solid rgba(255,60,60,0.25)',
    color: '#FF6B6B',
    fontSize: '12px',
    padding: '10px 14px',
    marginBottom: '16px',
    letterSpacing: '0.04em',
  },
}

export default function LoginPage({ navigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate({ view: 'overview' })
    } catch (err) {
      setError(err.message || 'Sign in failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <button style={S.back}
        onClick={() => { window.location.href = "/"; }}
        onMouseEnter={e => e.currentTarget.style.color = '#5BFF8F'}
        onMouseLeave={e => e.currentTarget.style.color = '#4A5550'}>
        ← glondia.co
      </button>

      <div style={S.box}>
        <div style={S.head}>
          <div style={S.dots}>
            <span style={S.dot('#5A2222')} />
            <span style={S.dot('#5A4622')} />
            <span style={S.dot('#224A2A')} />
          </div>
          <div style={S.title}>client-portal · secure</div>
          <span style={{ color: '#5BFF8F', fontSize: '10px' }}>● live</span>
        </div>

        <div style={S.body}>
          <div style={S.eyebrow}>
            <span style={{ width: 6, height: 6, background: '#5BFF8F', display: 'inline-block', boxShadow: '0 0 8px #5BFF8F' }} />
            Glondia Analysts &amp; Consultancy
          </div>
          <h1 style={S.h1}>Client Portal</h1>
          <p style={S.sub}>Access your research desk, briefings, and sector dashboards.</p>

          {/* Social sign-in */}
          {SOCIAL_PROVIDERS.map(p => {
            const url = socialAuthUrl(p.id);
            const icon = <i className={p.faClass} style={{ fontSize: '15px', width: '18px', textAlign: 'center' }} />;
            if (url) {
              return (
                <a key={p.id} href={url} style={S.socialBtn(true)}>
                  {icon}
                  {p.label}
                </a>
              );
            }
            return (
              <button key={p.id} style={S.socialBtn(false)} disabled>
                {icon}
                {p.label}
                <span style={{ position: 'absolute', right: 12, fontSize: 9, color: '#4A5550', letterSpacing: '0.1em', textTransform: 'uppercase' }}>coming soon</span>
              </button>
            );
          })}

          <div style={S.divider}>
            <span style={S.dividerLine} />
            <span>or sign in with email</span>
            <span style={S.dividerLine} />
          </div>

          {error && <div style={S.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={S.fieldWrap}>
              <label style={S.label}>Email</label>
              <input
                style={S.input(focus === 'email')}
                type="email"
                placeholder="you@firm.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus('')}
                required
                autoComplete="email"
              />
            </div>
            <div style={S.fieldWrap}>
              <label style={S.label}>Password</label>
              <input
                style={S.input(focus === 'password')}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus('')}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" style={S.btn(loading)} disabled={loading}>
              {loading ? 'Authenticating…' : 'Enter dashboard →'}
            </button>
          </form>

          <div style={S.footer}>
            <div>No account? <button style={S.link} onClick={() => navigate({ view: 'signup' })}>Create one</button></div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#2C3530', letterSpacing: '0.1em' }}>
        © 2026 GLONDIA ANALYSTS &amp; CONSULTANCY LTD · LONDON
      </div>
    </div>
  )
}
