import { useState } from 'react'
import { login, SOCIAL_PROVIDERS, socialAuthUrl } from '../../api/auth.js'

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
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true" />

      <a className="auth-back" href="/">
        <span className="auth-back-mark">←</span>
        <span>Glondia</span>
      </a>

      <div className="auth-shell">
        <aside className="auth-brand">
          <div className="auth-brand-inner">
            <div className="auth-monogram"><img src="/assets/glondia-logo.png" alt="Glondia" /></div>
            <p className="auth-brand-eyebrow">Glondia · workspace</p>
            <h1 className="auth-brand-title">
              Enter the<br />
              <em>control plane.</em>
            </h1>
            <p className="auth-brand-copy">
              Hosting, domains, cloud servers, and sites — one dark desk, green on black.
            </p>
            <ul className="auth-brand-list">
              <li>Projects &amp; deploys</li>
              <li>Cloud VPS control</li>
              <li>Domains &amp; DNS</li>
            </ul>
          </div>
        </aside>

        <main className="auth-card">
          <header className="auth-card-head">
            <div>
              <p className="auth-eyebrow">Sign in</p>
              <h2 className="auth-title">Welcome back</h2>
              <p className="auth-sub">Access your workspace with email or a connected account.</p>
            </div>
          </header>

          <div className="auth-card-body">
            <div className="auth-social">
              {SOCIAL_PROVIDERS.map((p) => {
                const url = socialAuthUrl(p.id)
                const icon = <i className={p.faClass} aria-hidden="true" />
                if (url) {
                  return (
                    <a key={p.id} href={url} className="auth-social-btn">
                      {icon}
                      <span>{p.label}</span>
                    </a>
                  )
                }
                return (
                  <button key={p.id} type="button" className="auth-social-btn is-disabled" disabled>
                    {icon}
                    <span>{p.label}</span>
                    <span className="auth-soon">Soon</span>
                  </button>
                )
              })}
            </div>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {error ? <div className="auth-error" role="alert">{error}</div> : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  className={`auth-input${focus === 'email' ? ' is-focus' : ''}`}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocus('email')}
                  onBlur={() => setFocus('')}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="auth-field">
                <span className="auth-label">Password</span>
                <input
                  className={`auth-input${focus === 'password' ? ' is-focus' : ''}`}
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus('')}
                  required
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Enter workspace'}
              </button>
            </form>

            <footer className="auth-foot">
              No account?{' '}
              <button type="button" className="auth-link" onClick={() => navigate({ view: 'signup' })}>
                Create one
              </button>
            </footer>
          </div>
        </main>
      </div>

      <p className="auth-legal">© 2026 Glondia · Hosting · Domains · Cloud</p>
    </div>
  )
}
