import { useState } from 'react'
import { register, SOCIAL_PROVIDERS, socialAuthUrl } from '../../api/auth.js'

export default function SignupPage({ navigate }) {
  const [form, setForm] = useState({ name: '', organizationName: '', email: '', password: '' })
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const session = await register(form)
      navigate({ view: 'overview' }, { user: session?.user, replace: true })
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
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
            <p className="auth-brand-eyebrow">Glondia · onboarding</p>
            <h1 className="auth-brand-title">
              Claim your<br />
              <em>dark desk.</em>
            </h1>
            <p className="auth-brand-copy">
              One workspace for sites, hosting, domains, and cloud — designed for operators who prefer silence over noise.
            </p>
            <ul className="auth-brand-list">
              <li>Free workspace start</li>
              <li>Secure account</li>
              <li>Ready for deploys</li>
            </ul>
          </div>
        </aside>

        <main className="auth-card">
          <header className="auth-card-head">
            <div>
              <p className="auth-eyebrow">Create account</p>
              <h2 className="auth-title">Open a workspace</h2>
              <p className="auth-sub">A few details. Then you land in the control plane.</p>
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
              <span>or register with email</span>
            </div>

            {error ? <div className="auth-error" role="alert">{error}</div> : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-two-col">
                <label className="auth-field">
                  <span className="auth-label">Your name</span>
                  <input
                    className={`auth-input${focus === 'name' ? ' is-focus' : ''}`}
                    type="text"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={set('name')}
                    onFocus={() => setFocus('name')}
                    onBlur={() => setFocus('')}
                    required
                    autoComplete="name"
                  />
                </label>
                <label className="auth-field">
                  <span className="auth-label">Workspace</span>
                  <input
                    className={`auth-input${focus === 'organizationName' ? ' is-focus' : ''}`}
                    type="text"
                    placeholder="Acme Ltd"
                    value={form.organizationName}
                    onChange={set('organizationName')}
                    onFocus={() => setFocus('organizationName')}
                    onBlur={() => setFocus('')}
                    required
                    autoComplete="organization"
                  />
                </label>
              </div>
              <label className="auth-field">
                <span className="auth-label">Email</span>
                <input
                  className={`auth-input${focus === 'email' ? ' is-focus' : ''}`}
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={set('email')}
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
                  placeholder="8+ characters"
                  value={form.password}
                  onChange={set('password')}
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus('')}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Creating workspace…' : 'Create account'}
              </button>
            </form>

            <footer className="auth-foot">
              Already have an account?{' '}
              <button type="button" className="auth-link" onClick={() => navigate({ view: 'login' })}>
                Sign in
              </button>
            </footer>
          </div>
        </main>
      </div>

      <p className="auth-legal">© 2026 Glondia · Hosting · Domains · Cloud</p>
    </div>
  )
}
