// marketing.jsx — Glondia Analysts & Consultancy · public landing page
import React, { useState } from 'react';
import { ICN } from './icons';

// ─── Design tokens (dark theme, self-contained) ───────────────────────────────
const T = {
  bg:      '#0b1120',
  bg2:     '#0f172a',
  card:    '#111827',
  card2:   '#1a2540',
  accent:  '#22c55e',
  a2:      '#4ade80',
  a3:      '#86efac',
  border:  'rgba(255,255,255,0.08)',
  border2: 'rgba(34,197,94,0.25)',
  text:    '#f1f5f9',
  muted:   '#94a3b8',
  faint:   '#475569',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeIcon = (name) => ICN[name] || ICN.Box;

// ─── Brand icon (bar chart + trend arrow + magnifying glass in circular ring) ─
function GlondiaIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer ring */}
      <circle cx="20" cy="20" r="18.5" stroke={T.accent} strokeWidth="1.5" fill="rgba(34,197,94,0.07)" />
      {/* Rising bars */}
      <rect x="6"  y="26" width="4.5" height="7"  rx="1.2" fill={T.accent} opacity="0.5" />
      <rect x="12" y="20" width="4.5" height="13" rx="1.2" fill={T.accent} opacity="0.72" />
      <rect x="18" y="13" width="4.5" height="20" rx="1.2" fill={T.accent} />
      {/* Trend line following bar tops */}
      <path d="M8 25 L14.5 19 L20.5 13" stroke={T.a2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Arrow head */}
      <path d="M17.5 12 L21.5 12 L21.5 16" stroke={T.a2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Magnifying glass */}
      <circle cx="29" cy="22" r="6" stroke="white" strokeWidth="1.5" fill="none" opacity="0.82" />
      <line x1="33.5" y1="26.5" x2="36" y2="29" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.82" />
    </svg>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function ConsultNavbar({ navigate }) {
  const links = ['Services', 'Platform', 'Pricing'];

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: 'rgba(11,17,32,0.92)', backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${T.border}`,
      padding: '0 40px', height: 64,
      display: 'flex', alignItems: 'center', gap: 0,
    }}>
      {/* Brand mark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}
           onClick={() => navigate({ view: 'marketing' })}>
        <GlondiaIcon size={32} />
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: T.text, letterSpacing: '0.01em' }}>Glondia</div>
          <div style={{ fontSize: 9, color: T.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
            Analysts &amp; Consultancy
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {links.map((label) => (
          <NavLink key={label} label={label} onClick={() => {}} />
        ))}
        <a href="#"
           style={{ color: T.muted, fontSize: 14, textDecoration: 'none', padding: '8px 14px' }}
           onMouseEnter={(e) => e.currentTarget.style.color = T.text}
           onMouseLeave={(e) => e.currentTarget.style.color = T.muted}
           onClick={(e) => e.preventDefault()}>
          Docs
        </a>
      </div>

      <div style={{ width: 20 }} />
      {/* LinkedIn shortcut */}
      <a href="https://www.linkedin.com/company/glondia" target="_blank" rel="noopener noreferrer"
         style={{ color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', padding: '0 10px', transition: 'color 0.15s' }}
         title="Follow Glondia on LinkedIn"
         onMouseEnter={(e) => e.currentTarget.style.color = '#0a66c2'}
         onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}>
        <ICN.LinkedIn size={18} />
      </a>
      <div style={{ width: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <DarkBtn onClick={() => navigate({ view: 'login' })} ghost>Sign in</DarkBtn>
        <DarkBtn onClick={() => navigate({ view: 'signup' })} primary>
          Get started <ICN.ArrowRight size={13} />
        </DarkBtn>
      </div>
    </nav>
  );
}

function NavLink({ label, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <a href="#"
       style={{ color: hov ? T.text : T.muted, fontSize: 14, textDecoration: 'none', padding: '8px 14px', transition: 'color 0.15s' }}
       onMouseEnter={() => setHov(true)}
       onMouseLeave={() => setHov(false)}
       onClick={(e) => { e.preventDefault(); onClick(); }}>
      {label}
    </a>
  );
}

function DarkBtn({ children, onClick, primary, ghost, lg }) {
  const [hov, setHov] = useState(false);
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: 'none',
    fontSize: lg ? 15 : 14, padding: lg ? '12px 24px' : '8px 18px',
    transition: 'all 0.15s',
  };
  const style = primary
    ? { ...base, background: hov ? T.a2 : T.accent, color: '#0b1120' }
    : ghost
      ? { ...base, background: hov ? 'rgba(255,255,255,0.07)' : 'transparent', color: T.text, border: `1px solid ${T.border}` }
      : { ...base, background: hov ? T.card2 : T.card, color: T.text, border: `1px solid ${T.border}` };

  return (
    <button style={style} onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function HeroSection({ navigate }) {
  return (
    <section style={{
      background: `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(34,197,94,0.12) 0%, transparent 70%), ${T.bg}`,
      padding: '100px 40px 80px',
      textAlign: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative grid lines */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative' }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`,
          borderRadius: 99, padding: '6px 16px', marginBottom: 32,
          fontSize: 12, color: T.a2, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, display: 'inline-block' }} />
          Business Analytics · Strategy · Digital Consulting
        </div>

        {/* Main headline */}
        <h1 style={{
          fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 700,
          lineHeight: 1.08, letterSpacing: '-0.03em',
          color: T.text, margin: '0 0 8px',
        }}>
          Your Personal
        </h1>
        <h1 style={{
          fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 700,
          lineHeight: 1.08, letterSpacing: '-0.03em',
          margin: '0 0 28px',
          background: `linear-gradient(135deg, ${T.accent} 0%, ${T.a2} 60%, #34d399 100%)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Business Partner.
        </h1>

        <p style={{
          fontSize: 18, color: T.muted, lineHeight: 1.7,
          maxWidth: 600, margin: '0 auto 40px', fontWeight: 400,
        }}>
          Glondia Analysts &amp; Consultancy delivers data-driven strategy, expert business analysis, and
          a complete digital platform — so your business grows with clarity and confidence.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 64 }}>
          <DarkBtn primary lg onClick={() => navigate({ view: 'signup' })}>
            Start a conversation <ICN.ArrowRight size={16} />
          </DarkBtn>
          <DarkBtn ghost lg onClick={() => navigate({ view: 'login' })}>
            Sign in to platform
          </DarkBtn>
        </div>

        {/* Dashboard preview card */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 16, overflow: 'hidden', textAlign: 'left',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}>
          {/* Card titlebar */}
          <div style={{
            padding: '12px 20px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57','#febc2e','#28c840'].map((c) => (
                <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: T.faint, fontFamily: 'monospace' }}>
              glondia — business dashboard
            </span>
          </div>
          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: `1px solid ${T.border}` }}>
            {[
              { label: 'Revenue growth', value: '+34%',  delta: '↑ vs last quarter', green: true },
              { label: 'Market reach',   value: '12 mkt', delta: '3 new markets', green: true },
              { label: 'Cost reduction', value: '−18%',  delta: 'operating costs', green: true },
              { label: 'ROI delivered', value: '4.2×',   delta: 'avg client return', green: true },
            ].map((m, i) => (
              <div key={i} style={{
                padding: '20px 24px',
                borderRight: i < 3 ? `1px solid ${T.border}` : 'none',
              }}>
                <div style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: m.green ? T.accent : T.text, letterSpacing: '-0.02em' }}>{m.value}</div>
                <div style={{ fontSize: 11, color: T.a2, marginTop: 4 }}>{m.delta}</div>
              </div>
            ))}
          </div>
          {/* Activity rows */}
          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { who: 'Market analysis complete',        what: 'Retail sector · Port Moresby',  when: '2h ago',   ok: true },
              { who: 'Growth strategy delivered',       what: '3-year roadmap · 18 initiatives',when: '1d ago',   ok: true },
              { who: 'Digital transformation kickoff',  what: 'Phase 1 · stakeholder alignment',when: '3d ago',   ok: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: T.text }}>{r.who}</span>
                <span style={{ fontSize: 12, color: T.faint }}>{r.what}</span>
                <span style={{ fontSize: 11, color: T.faint, minWidth: 50, textAlign: 'right' }}>{r.when}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust strip ──────────────────────────────────────────────────────────────
function TrustStrip() {
  const items = [
    'Business Analysis', 'Market Research', 'Strategic Planning',
    'Digital Strategy', 'Financial Modelling', 'Operational Consulting',
  ];
  return (
    <div style={{
      borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
      background: T.bg2, padding: '18px 40px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 0, overflow: 'hidden',
    }}>
      <span style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 28, flexShrink: 0 }}>
        Our expertise
      </span>
      <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
        {items.map((item, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ fontSize: 13, color: T.muted, padding: '0 20px', whiteSpace: 'nowrap' }}>{item}</span>
            {i < items.length - 1 && <span style={{ color: T.faint, fontSize: 18, opacity: 0.4 }}>·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────
function ServicesSection() {
  const services = [
    {
      icon: 'BarChart2',
      title: 'Business Analysis',
      body: 'We turn raw data into clear decisions. From financial modelling and market sizing to operational diagnostics, we give you the full picture — and the path forward.',
      points: ['Market research & competitive intelligence', 'Financial modelling & forecasting', 'Operational performance reviews'],
    },
    {
      icon: 'Lightbulb',
      title: 'Strategic Consulting',
      body: "We work alongside your leadership team to design growth strategies that are grounded in reality and built for execution. No generic frameworks — your business, your strategy.",
      points: ['3–5 year growth roadmaps', 'Go-to-market & expansion planning', 'Business model innovation'],
    },
    {
      icon: 'Zap',
      title: 'Digital Transformation',
      body: 'Technology should accelerate your business, not constrain it. We assess your current stack, identify bottlenecks, and chart a practical path to modern, scalable operations.',
      points: ['Tech stack audit & advisory', 'Process automation & integration', 'Change management & team enablement'],
    },
    {
      icon: 'Globe',
      title: 'Web & Digital Presence',
      body: 'Your website is your first impression. We handle the entire digital setup — domain, hosting, professional site — so you launch looking the part from day one.',
      points: ['Domain registration & DNS setup', 'Managed hosting & deployment', 'Starter site templates, live in hours'],
    },
  ];

  return (
    <section id="services" style={{ padding: '96px 40px', background: T.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Eyebrow>What we do</Eyebrow>
        <SectionTitle>Expert guidance at every<br />stage of growth.</SectionTitle>
        <SectionLede>
          Whether you're launching, scaling, or navigating a pivot — we bring the analysis,
          the strategy, and the tools to make it happen.
        </SectionLede>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1, marginTop: 56, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {services.map((svc, i) => (
            <ServiceCard key={i} {...svc} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ServiceCard({ icon, title, body, points }) {
  const [hov, setHov] = useState(false);
  const Icon = safeIcon(icon);
  return (
    <div style={{
      background: hov ? T.card2 : T.card,
      padding: '36px 32px', cursor: 'default',
      transition: 'background 0.2s',
      borderRight: `1px solid ${T.border}`,
    }}
         onMouseEnter={() => setHov(true)}
         onMouseLeave={() => setHov(false)}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: hov ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.08)',
        border: `1px solid ${hov ? T.border2 : 'rgba(34,197,94,0.12)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, transition: 'all 0.2s',
        color: T.accent,
      }}>
        <Icon size={20} />
      </div>
      <h3 style={{ fontWeight: 700, fontSize: 17, color: T.text, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{title}</h3>
      <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: '0 0 20px' }}>{body}</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {points.map((pt, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: T.muted }}>
            <span style={{ color: T.accent, marginTop: 2, flexShrink: 0 }}><ICN.Check size={13} /></span>
            {pt}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Platform ─────────────────────────────────────────────────────────────────
function PlatformSection({ navigate }) {
  const pillars = [
    {
      icon: 'Server',
      title: 'Hosting & Deployment',
      body: 'Connect your Git repository and Glondia handles the rest — automated builds, global CDN delivery, preview URLs per branch, and atomic production deployments with instant rollback.',
      cta: 'Deploy a project',
      view: 'overview',
      highlights: ['Next.js, Astro, SvelteKit, Vite, Remix', 'Branch previews · env vars · rollback', '18 edge regions · auto SSL'],
    },
    {
      icon: 'Globe',
      title: 'Domains & DNS',
      body: 'Search 340+ TLDs at registrar prices, register in seconds, and point your domain at any project with one click. Full DNS editor with WHOIS privacy and auto-renew built in.',
      cta: 'Search for a domain',
      view: 'domains-buy',
      highlights: ['.com, .co, .io, .app, .dev and 335+ more', 'Auto SSL, WHOIS privacy, 2-yr auto-renew', 'A, CNAME, MX, TXT, SRV, CAA records'],
    },
    {
      icon: 'Layers',
      title: 'Site Builder',
      body: "No codebase? No problem. Pick one of nine professionally designed starter templates, fill in your content, and publish to your custom domain — live in under an hour, no drag-and-drop maze.",
      cta: 'Browse templates',
      view: 'builder',
      highlights: ['9 templates for services & consultancies', 'Simple content forms, not a visual editor', 'Publishes to your domain in one step'],
    },
  ];

  return (
    <section id="platform" style={{ padding: '96px 40px', background: T.bg2 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Eyebrow>The platform</Eyebrow>
        <SectionTitle>One workspace.<br />Everything your business needs online.</SectionTitle>
        <SectionLede>
          Hosting, domains, and site building — unified in a single platform so you're never
          juggling three different dashboards and two different bills.
        </SectionLede>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginTop: 56 }}>
          {pillars.map((p, i) => (
            <PillarCard key={i} {...p} navigate={navigate} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarCard({ icon, title, body, cta, view, highlights, navigate }) {
  const [hov, setHov] = useState(false);
  const Icon = safeIcon(icon);
  return (
    <div style={{
      background: hov ? T.card2 : T.card,
      border: `1px solid ${hov ? T.border2 : T.border}`,
      borderRadius: 16, padding: '32px',
      display: 'flex', flexDirection: 'column', gap: 0,
      transition: 'all 0.2s', cursor: 'default',
    }}
         onMouseEnter={() => setHov(true)}
         onMouseLeave={() => setHov(false)}>
      <div style={{ color: T.accent, marginBottom: 18 }}><Icon size={24} /></div>
      <h3 style={{ fontWeight: 700, fontSize: 18, color: T.text, margin: '0 0 12px', letterSpacing: '-0.015em' }}>{title}</h3>
      <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: '0 0 20px', flex: 1 }}>{body}</p>
      <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {highlights.map((h, i) => (
          <li key={i} style={{ fontSize: 12.5, color: T.faint, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
            <span style={{ color: T.accent, marginTop: 1 }}><ICN.Check size={12} /></span>
            {h}
          </li>
        ))}
      </ul>
      <button style={{
        background: 'transparent', border: `1px solid ${T.border2}`,
        color: T.accent, borderRadius: 8, padding: '9px 16px',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s',
        ...(hov ? { background: 'rgba(34,197,94,0.08)' } : {}),
      }}
              onClick={() => navigate({ view })}>
        {cta} <ICN.ArrowRight size={13} />
      </button>
    </div>
  );
}

// ─── Process ──────────────────────────────────────────────────────────────────
function ProcessSection() {
  const steps = [
    {
      n: '01',
      icon: 'Users',
      title: 'Understand your business',
      body: "We start with a deep-dive session — your market, your goals, your constraints. No assumptions. Everything we deliver is grounded in your specific context.",
    },
    {
      n: '02',
      icon: 'Target',
      title: 'Deliver clear insights',
      body: "You get a structured analysis with actionable findings, not a 90-page deck you'll never re-read. We prioritise what moves the needle and explain the reasoning plainly.",
    },
    {
      n: '03',
      icon: 'Rocket',
      title: 'Execute alongside you',
      body: "We stay involved through execution — reviewing progress, refining the plan, and deploying your digital presence so results are real, not just recommended.",
    },
  ];

  return (
    <section style={{ padding: '96px 40px', background: T.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Eyebrow>The process</Eyebrow>
        <SectionTitle>Simple steps. Real results.</SectionTitle>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 40, marginTop: 56 }}>
          {steps.map((s, i) => {
            const Icon = safeIcon(s.icon);
            return (
              <div key={i} style={{ position: 'relative' }}>
                {i < steps.length - 1 && (
                  <div style={{
                    position: 'absolute', top: 22, left: '100%', width: 40,
                    height: 1, background: `linear-gradient(90deg, ${T.border2}, transparent)`,
                    display: 'none', // hidden on small screens
                  }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: T.accent, flexShrink: 0,
                  }}>
                    <Icon size={20} />
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.faint, letterSpacing: '0.05em' }}>{s.n}</span>
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 18, color: T.text, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.65, margin: 0 }}>{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
function MetricsSection() {
  const stats = [
    { v: '120+', k: 'businesses served across the Pacific' },
    { v: '34%',  k: 'average revenue growth, year one' },
    { v: '18',   k: 'markets across PNG, Australia & beyond' },
    { v: '99.9%', k: 'platform uptime over 12 months' },
  ];

  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)`,
      borderTop: `1px solid ${T.border2}`, borderBottom: `1px solid ${T.border2}`,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '64px 40px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 0,
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '24px 32px',
            borderRight: i < stats.length - 1 ? `1px solid ${T.border}` : 'none',
          }}>
            <div style={{
              fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800,
              letterSpacing: '-0.03em',
              background: `linear-gradient(135deg, ${T.accent}, ${T.a2})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', lineHeight: 1,
            }}>{s.v}</div>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 8, lineHeight: 1.4 }}>{s.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function PricingSection({ navigate }) {
  const plans = [
    {
      name: 'Starter',
      price: '$0',
      period: 'forever',
      tagline: 'For individuals and early-stage projects.',
      features: [
        '1 hosted project',
        '100 GB bandwidth / 10k requests monthly',
        'Global CDN with auto SSL',
        'Glondia subdomain (yourapp.glondia.app)',
        'Community support',
      ],
      cta: 'Start free',
      tone: 'ghost',
    },
    {
      name: 'Growth',
      price: '$19',
      period: 'per member / month',
      tagline: 'For growing businesses shipping real work.',
      features: [
        '10 projects, unlimited environments',
        '1 TB bandwidth · 1M requests monthly',
        'Preview deployments per branch & PR',
        'Custom domains, env vars, instant rollback',
        'Includes 1 .com domain (first year)',
        'Email support, 24h response',
      ],
      cta: 'Start 14-day trial',
      tone: 'primary',
      featured: true,
    },
    {
      name: 'Scale',
      price: '$49',
      period: 'per member / month',
      tagline: 'For agencies and high-traffic businesses.',
      features: [
        'Unlimited projects & environments',
        '5 TB bandwidth · 10M requests monthly',
        'Dedicated build concurrency',
        'Team roles, audit log, SSO',
        'Includes 3 domains (any TLD)',
        'Priority support, 1h response',
      ],
      cta: 'Talk to us',
      tone: 'ghost',
    },
  ];

  return (
    <section id="pricing" style={{ padding: '96px 40px', background: T.bg2 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Eyebrow>Pricing</Eyebrow>
        <SectionTitle>Free to start. Predictable as you grow.</SectionTitle>
        <SectionLede>
          Consulting engagements are quoted per project. Platform pricing below — no hidden fees.
        </SectionLede>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 56 }}>
          {plans.map((plan, i) => (
            <PlanCard key={i} {...plan} navigate={navigate} />
          ))}
        </div>

        <p style={{ textAlign: 'center', color: T.faint, fontSize: 13, marginTop: 28 }}>
          Domain prices start at <strong style={{ color: T.muted }}>$1.99/yr</strong>.
          WHOIS privacy and auto-renew are included on every plan.
        </p>
      </div>
    </section>
  );
}

function PlanCard({ name, price, period, tagline, features, cta, tone, featured, navigate }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{
      background: featured ? 'rgba(34,197,94,0.07)' : T.card,
      border: `1px solid ${featured ? T.border2 : T.border}`,
      borderRadius: 16, padding: '32px',
      display: 'flex', flexDirection: 'column', gap: 0,
      position: 'relative',
      boxShadow: featured ? `0 0 0 1px rgba(34,197,94,0.15), 0 20px 60px rgba(34,197,94,0.06)` : 'none',
    }}>
      {featured && (
        <div style={{
          position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
          background: T.accent, color: '#0b1120', fontSize: 11,
          fontWeight: 700, padding: '3px 14px', borderRadius: '0 0 8px 8px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          Most popular
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <h4 style={{ fontWeight: 700, fontSize: 18, color: T.text, margin: '0 0 4px' }}>{name}</h4>
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>{tagline}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '20px 0' }}>
        <span style={{ fontSize: 42, fontWeight: 800, color: T.text, letterSpacing: '-0.03em' }}>{price}</span>
        <span style={{ fontSize: 13, color: T.faint }}>{period}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: '0 0 28px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: T.muted }}>
            <span style={{ color: T.accent, marginTop: 2, flexShrink: 0 }}><ICN.Check size={13} strokeWidth={2.5} /></span>
            {f}
          </li>
        ))}
      </ul>
      <button
        style={{
          width: '100%', borderRadius: 9, padding: '11px 0', fontSize: 14,
          fontWeight: 600, cursor: 'pointer', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
          ...(tone === 'primary'
            ? { background: hov ? T.a2 : T.accent, color: '#0b1120' }
            : { background: hov ? 'rgba(255,255,255,0.07)' : 'transparent', color: T.text, border: `1px solid ${T.border}` }),
        }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onClick={() => navigate({ view: 'signup' })}>
        {cta}
      </button>
    </div>
  );
}

// ─── CTA strip ────────────────────────────────────────────────────────────────
function CtaSection({ navigate }) {
  return (
    <section style={{
      padding: '96px 40px',
      background: `radial-gradient(ellipse 70% 80% at 50% 50%, rgba(34,197,94,0.12) 0%, transparent 70%), ${T.bg}`,
      borderTop: `1px solid ${T.border}`,
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <GlondiaIcon size={56} />
        <h2 style={{
          fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700,
          letterSpacing: '-0.03em', color: T.text,
          margin: '24px 0 16px', lineHeight: 1.1,
        }}>
          Ready to grow<br />
          <span style={{
            background: `linear-gradient(135deg, ${T.accent}, ${T.a2})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>your business?</span>
        </h2>
        <p style={{ fontSize: 16, color: T.muted, margin: '0 0 36px', lineHeight: 1.6 }}>
          No credit card required. Start free, scale when you're ready.
          Or speak to our team about a consulting engagement.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <DarkBtn primary lg onClick={() => navigate({ view: 'signup' })}>
            Open the workspace <ICN.ArrowRight size={16} />
          </DarkBtn>
          <DarkBtn ghost lg onClick={() => navigate({ view: 'login' })}>
            Sign in
          </DarkBtn>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function FooterSection({ navigate }) {
  const cols = [
    {
      heading: 'Platform',
      links: ['Hosting', 'Domains', 'DNS', 'Site builder', 'Pricing'],
    },
    {
      heading: 'Services',
      links: ['Business Analysis', 'Strategic Consulting', 'Digital Transformation', 'Web Presence'],
    },
    {
      heading: 'Developers',
      links: ['Docs', 'CLI reference', 'API', 'Framework guides', 'Status'],
    },
    {
      heading: 'Company',
      links: ['About', 'Blog', 'Careers', 'Contact', 'Legal'],
    },
  ];

  return (
    <footer style={{ background: T.bg2, borderTop: `1px solid ${T.border}` }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '64px 40px 48px',
        display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: 48,
      }}>
        {/* Brand column */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}
               onClick={() => navigate({ view: 'marketing' })}>
            <GlondiaIcon size={30} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>Glondia</div>
              <div style={{ fontSize: 9, color: T.faint, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Analysts &amp; Consultancy</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: T.faint, lineHeight: 1.6, margin: '0 0 20px', maxWidth: '32ch' }}>
            Your personal business partner — delivering analysis, strategy, and digital tools
            from Port Moresby and Sydney.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.faint }}>
            <span style={{ color: T.accent }}>●</span>
            All systems normal
          </div>
        </div>

        {/* Link columns */}
        {cols.map((col) => (
          <div key={col.heading}>
            <h5 style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
              {col.heading}
            </h5>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map((link) => (
                <li key={link}>
                  <a href="#" style={{ fontSize: 13, color: T.faint, textDecoration: 'none', transition: 'color 0.15s' }}
                     onMouseEnter={(e) => e.currentTarget.style.color = T.text}
                     onMouseLeave={(e) => e.currentTarget.style.color = T.faint}
                     onClick={(e) => e.preventDefault()}>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{
        borderTop: `1px solid ${T.border}`,
        padding: '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1200, margin: '0 auto',
        flexWrap: 'wrap', gap: 14,
      }}>
        <span style={{ fontSize: 12, color: T.faint }}>© 2026 Glondia Analysts &amp; Consultancy · Port Moresby · Sydney</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {['Terms', 'Privacy', 'Security'].map((l) => (
            <a key={l} href="#" style={{ fontSize: 12, color: T.faint, textDecoration: 'none' }}
               onClick={(e) => e.preventDefault()}>{l}</a>
          ))}
          {/* LinkedIn */}
          <a href="https://www.linkedin.com/company/glondia" target="_blank" rel="noopener noreferrer"
             style={{ color: T.faint, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
             title="Glondia on LinkedIn"
             onMouseEnter={(e) => e.currentTarget.style.color = '#0a66c2'}
             onMouseLeave={(e) => e.currentTarget.style.color = T.faint}>
            <ICN.LinkedIn size={17} />
          </a>
        </div>
      </div>
    </footer>
  );
}

// ─── Typography helpers ───────────────────────────────────────────────────────
function Eyebrow({ children }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: 11, color: T.accent, textTransform: 'uppercase',
      letterSpacing: '0.1em', fontWeight: 700, marginBottom: 20,
    }}>
      <span style={{ width: 20, height: 1.5, background: T.accent, display: 'inline-block', borderRadius: 1 }} />
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 700,
      letterSpacing: '-0.025em', color: T.text,
      margin: '0 0 16px', lineHeight: 1.12,
    }}>
      {children}
    </h2>
  );
}

function SectionLede({ children }) {
  return (
    <p style={{ fontSize: 16, color: T.muted, lineHeight: 1.65, maxWidth: 560, margin: 0 }}>
      {children}
    </p>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function Marketing({ navigate }) {
  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', fontFamily: 'inherit' }}>
      <ConsultNavbar navigate={navigate} />
      <HeroSection navigate={navigate} />
      <TrustStrip />
      <ServicesSection />
      <PlatformSection navigate={navigate} />
      <ProcessSection />
      <MetricsSection />
      <PricingSection navigate={navigate} />
      <CtaSection navigate={navigate} />
      <FooterSection navigate={navigate} />
    </div>
  );
}
