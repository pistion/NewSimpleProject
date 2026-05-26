import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
  },
  back: {
    position: 'absolute',
    top: '24px',
    left: '28px',
    fontFamily: 'inherit',
    fontSize: '12px',
    color: '#4A5550',
    textDecoration: 'none',
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
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
  dot: { width: '10px', height: '10px', borderRadius: '50%', background: '#1E2A20' },
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
  input: {
    width: '100%',
    background: '#0A0D0A',
    border: '1px solid #1E2A20',
    color: '#E8E8DC',
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '10px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  fieldWrap: { marginBottom: '16px' },
  btn: {
    width: '100%',
    background: '#5BFF8F',
    color: '#001A09',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    padding: '13px 20px',
    cursor: 'pointer',
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.15s',
  },
  footer: {
    fontSize: '12px',
    color: '#4A5550',
    marginTop: '20px',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  link: { color: '#5BFF8F', textDecoration: 'none' },
  divider: {
    borderTop: '1px solid #1E2A20',
    margin: '20px 0 0',
    paddingTop: '16px',
  },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inputFocus, setInputFocus] = useState('')
  const navigate = useNavigate()

  const focusStyle = (name) => ({
    ...S.input,
    borderColor: inputFocus === name ? '#5BFF8F' : '#1E2A20',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    navigate('/dashboard')
  }

  return (
    <div style={S.page}>
      <a href="/" style={S.back} onMouseEnter={e => e.target.style.color='#5BFF8F'} onMouseLeave={e => e.target.style.color='#4A5550'}>
        ← glondia.co
      </a>

      <div style={S.box}>
        <div style={S.head}>
          <div style={S.dots}>
            <span style={{ ...S.dot, background: '#5A2222' }} />
            <span style={{ ...S.dot, background: '#5A4622' }} />
            <span style={{ ...S.dot, background: '#224A2A' }} />
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

          <form onSubmit={handleSubmit}>
            <div style={S.fieldWrap}>
              <label style={S.label}>Email</label>
              <input
                style={focusStyle('email')}
                type="email"
                placeholder="you@firm.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setInputFocus('email')}
                onBlur={() => setInputFocus('')}
                required
              />
            </div>
            <div style={S.fieldWrap}>
              <label style={S.label}>Password</label>
              <input
                style={focusStyle('password')}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setInputFocus('password')}
                onBlur={() => setInputFocus('')}
                required
              />
            </div>
            <button type="submit" style={S.btn}>
              Enter dashboard <span>→</span>
            </button>
          </form>

          <div style={{ ...S.footer, ...S.divider }}>
            <div>New client? <a href="mailto:hello@glondia.co" style={S.link}>Contact us to get access</a>.</div>
            <div style={{ marginTop: 6 }}>
              <Link to="/dashboard" style={{ ...S.link, fontSize: 11, color: '#2D8050' }}>Continue as guest →</Link>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: '#2C3530', letterSpacing: '0.1em' }}>
        © 2026 GLONDIA ANALYSTS &amp; CONSULTANCY LTD · LONDON
      </div>
    </div>
  )
}
