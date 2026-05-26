import { useState } from 'react'
import { register, SOCIAL_PROVIDERS } from '../../api/auth.js'

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
    maxWidth: '460px',
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
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
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
  socialBtn: {
    width: '100%',
    background: 'transparent',
    border: '1px solid #1E2A20',
    color: '#8A9388',
    fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    fontSize: '12px',
    padding: '10px 16px',
    cursor: 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '8px',
    opacity: 0.5,
    position: 'relative',
  },
  comingSoon: {
    position: 'absolute',
    right: '12px',
    fontSize: '9px',
    color: '#4A5550',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
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

export default function SignupPage({ navigate }) {
  const [form, setForm] = useState({ name: '', organizationName: '', email: '', password: '' })
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await register(form)
      navigate({ view: 'overview' })
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const field = (name, label, type = 'text', placeholder = '') => (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      <input
        style={S.input(focus === name)}
        type={type}
        placeholder={placeholder}
        value={form[name]}
        onChange={set(name)}
        onFocus={() => setFocus(name)}
        onBlur={() => setFocus('')}
        required
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'new-password' : 'off'}
      />
    </div>
  )

  return (
    <div style={S.page}>
      <button style={S.back}
        onClick={() => navigate({ view: 'marketing' })}
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
          <div style={S.title}>create workspace · secure</div>
          <span style={{ color: '#5BFF8F', fontSize: '10px' }}>● secure</span>
        </div>

        <div style={S.body}>
          <div style={S.eyebrow}>
            <span style={{ width: 6, height: 6, background: '#5BFF8F', display: 'inline-block', boxShadow: '0 0 8px #5BFF8F' }} />
            Glondia Analysts &amp; Consultancy
          </div>
          <h1 style={S.h1}>Create Account</h1>
          <p style={S.sub}>Set up your workspace for hosting, domains, analytics, and more.</p>

          {/* Social sign-up placeholders */}
          {SOCIAL_PROVIDERS.map(p => (
            <button key={p.id} style={S.socialBtn} disabled title="Coming soon">
              {p.label}
              <span style={S.comingSoon}>coming soon</span>
            </button>
          ))}

          <div style={S.divider}>
            <span style={S.dividerLine} />
            <span>or register with email</span>
            <span style={S.dividerLine} />
          </div>

          {error && <div style={S.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={S.twoCol}>
              {field('name', 'Your name', 'text', 'Jane Smith')}
              {field('organizationName', 'Workspace name', 'text', 'Acme Ltd')}
            </div>
            {field('email', 'Email', 'email', 'you@firm.com')}
            {field('password', 'Password', 'password', '8+ characters')}
            <button type="submit" style={S.btn(loading)} disabled={loading}>
              {loading ? 'Creating workspace…' : 'Create account →'}
            </button>
          </form>

          <div style={S.footer}>
            <div>Already have an account? <button style={S.link} onClick={() => navigate({ view: 'login' })}>Sign in</button></div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#2C3530', letterSpacing: '0.1em' }}>
        © 2026 GLONDIA ANALYSTS &amp; CONSULTANCY LTD · LONDON
      </div>
    </div>
  )
}
