// App.jsx — main shell, router state, theme/tweaks integration
import React, { useState as useStateApp, useEffect as useEffectApp } from 'react';
import { ICN } from './icons';
import { 
  DashSidebar, 
  DashTopbar, 
  Badge, 
  StatusBadge, 
  Empty 
} from './components';
import { 
  useTweaks, 
  TweaksPanel, 
  TweakSection, 
  TweakRadio, 
  TweakColor, 
  TweakSelect, 
  TweakButton 
} from './tweaks-panel';
import { Overview } from './overview';
import { HostingList, HostingDetail } from './hosting-control';
import { DomainsMine, DomainsBuy, DnsEditor } from './domains';
import {
  BuilderGallery, BuilderTemplates, BuilderRoxanne, BuilderImport,
  BuilderEditor, BuilderAiIntake, BuilderDeploymentSettings,
} from './features/builder';
import { ActivityPage } from './activity';
import { AdminPage } from './features/admin/AdminPage.jsx';
import BillingPage from './features/billing/BillingPage.jsx';
import ProfilePage from './features/profile/ProfilePage.jsx';
import { VpsHostingList, VpsCreateWizard, VpsDetail } from './vps-hosting';
import { notifyDataChanged } from './api';
import { isAuthenticated, clearAuthSession, storeAuthSession, AUTH_CHANGED_EVENT } from './api/auth.js';
import { isViewComingSoon } from './app/features.js';
import LoginPage from './features/auth/LoginPage.jsx';
import SignupPage from './features/auth/SignupPage.jsx';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#198754",
  "density": "regular",
  "fontPair": "serif-sans"
}/*EDITMODE-END*/;

const ACCENT_PRESETS = {
  "#198754": { hover: "#136943", soft: "#dcf2e6",   ink: "#0c4a2a", glow: "rgba(25,135,84,.22)"  }, // green (default)
  "#1d4e6e": { hover: "#163d57", soft: "#e0eaf2",   ink: "#0b2436", glow: "rgba(29,78,110,.24)"  }, // harbor blue
  "#7c2d12": { hover: "#5f220e", soft: "#fbe3d4",   ink: "#3a1607", glow: "rgba(124,45,18,.24)"  }, // terracotta
  "#2a4d9a": { hover: "#21407f", soft: "#e4ebf7",   ink: "#142555", glow: "rgba(42,77,154,.24)"  }, // royal
  "#1a1f1d": { hover: "#0a0e0c", soft: "#e6e8e6",   ink: "#070a09", glow: "rgba(26,31,29,.24)"   }, // mono
};

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ padding: "32px 24px", maxWidth: 720, margin: "40px auto" }}>
        <Empty
          icon="AlertCircle"
          title="This screen could not load"
          body={this.state.error?.message || "Something went wrong while rendering this workspace screen."}
          action={
            <button className="btn btn-primary" onClick={() => this.props.navigate({ view: "builder-gallery" })}>
              Back to site builder
            </button>
          }
        />
      </div>
    );
  }
}

function applyAccent(color) {
  const p = ACCENT_PRESETS[color] || ACCENT_PRESETS["#198754"];
  const r = document.documentElement.style;
  r.setProperty("--accent", color);
  r.setProperty("--accent-hover", p.hover);
  r.setProperty("--accent-soft", p.soft);
  r.setProperty("--accent-ink", p.ink);
  r.setProperty("--accent-glow", p.glow);
}

function applyFontPair(pair) {
  const r = document.documentElement.style;
  if (pair === "all-sans") {
    r.setProperty("--serif", '"Inter", system-ui, sans-serif');
  } else if (pair === "mono-display") {
    r.setProperty("--serif", '"JetBrains Mono", ui-monospace, monospace');
  } else {
    // serif-sans default
    r.setProperty("--serif", '"Instrument Serif", "Cormorant Garamond", Georgia, serif');
  }
}

export default function App() {
  const [route, setRoute] = useStateApp({ view: "login" });
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [githubBanner, setGithubBanner] = useStateApp(null);
  const [authed, setAuthed] = useStateApp(isAuthenticated());
  // Mobile sidebar drawer open/closed (desktop ignores this).
  const [mobileNavOpen, setMobileNavOpen] = useStateApp(false);

  useEffectApp(() => {
    const sync = () => setAuthed(isAuthenticated());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  // Apply theme/accent/density to root
  useEffectApp(() => { document.documentElement.dataset.theme = t.theme; }, [t.theme]);
  useEffectApp(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
  useEffectApp(() => { applyAccent(t.accent); }, [t.accent]);
  useEffectApp(() => { applyFontPair(t.fontPair); }, [t.fontPair]);

  // GitHub OAuth callback — handle both repo-connect and sign-in flows.
  useEffectApp(() => {
    const params = new URLSearchParams(window.location.search);
    const clean = new URL(window.location.href);
    clean.search = '';

    // Sign-in via GitHub OAuth
    if (params.get('github_auth') === '1') {
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const ghLogin      = params.get('github_login') || '';
      let   user         = null;
      try { user = JSON.parse(params.get('user') || 'null'); } catch {}
      window.history.replaceState({}, '', clean.toString());
      if (accessToken) {
        storeAuthSession({ tokens: { accessToken, refreshToken }, user });
        setGithubBanner(ghLogin ? `Signed in with GitHub as @${ghLogin}` : 'Signed in with GitHub');
        setRoute({ view: 'overview' });
        const t = setTimeout(() => setGithubBanner(null), 5000);
        return () => clearTimeout(t);
      }
    }

    // Sign-in via Google OAuth
    if (params.get('google_auth') === '1') {
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      let   user         = null;
      try { user = JSON.parse(params.get('user') || 'null'); } catch {}
      window.history.replaceState({}, '', clean.toString());
      if (accessToken) {
        storeAuthSession({ tokens: { accessToken, refreshToken }, user });
        setGithubBanner(`Signed in with Google${user?.name ? ` as ${user.name}` : ''}`);
        setRoute({ view: 'overview' });
        const t = setTimeout(() => setGithubBanner(null), 5000);
        return () => clearTimeout(t);
      }
    }

    // Auth error from GitHub
    if (params.get('auth_error')) {
      const msg = params.get('auth_error') || 'GitHub sign-in failed.';
      window.history.replaceState({}, '', clean.toString());
      setGithubBanner(`Sign-in failed: ${msg}`);
      const t = setTimeout(() => setGithubBanner(null), 7000);
      return () => clearTimeout(t);
    }

    // Repo-connect callback (existing behaviour)
    if (params.get('github_connected') === '1') {
      const login = params.get('login') || '';
      setGithubBanner(login ? `GitHub connected as @${login}.` : 'GitHub connected successfully.');
      window.history.replaceState({}, '', clean.toString());
      setRoute({ view: 'hosting-list' });
      notifyDataChanged();
      const t = setTimeout(() => setGithubBanner(null), 6000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffectApp(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [route.view, route.params?.id]);

  const navigate = (r) => setRoute(r);
  const toggleTheme = () => setTweak("theme", t.theme === "dark" ? "light" : "dark");

  const DASHBOARD_VIEWS = new Set([
    "overview","hosting-list","hosting-detail","domains-mine","domains-buy","dns",
    "builder-gallery","builder-templates","builder-roxanne","builder-import","builder-editor","builder-ai-intake","builder-deployment-settings",
    "analytics","activity","billing","settings","profile","vps-hosting","vps-create","vps-detail","admin",
  ]);

  // Render
  const isAuthBlocked = DASHBOARD_VIEWS.has(route.view) && !authed;

  const renderView = () => {
    if (isAuthBlocked) return <LoginPage navigate={navigate} />;

    // Non-MVP surfaces are gated behind Coming Soon instead of broken pages.
    if (isViewComingSoon(route.view)) return <ComingSoon navigate={navigate} />;

    switch (route.view) {
      case "login":             return authed ? (() => { navigate({ view: 'overview' }); return null; })() : <LoginPage navigate={navigate} />;
      case "signup":            return authed ? (() => { navigate({ view: 'overview' }); return null; })() : <SignupPage navigate={navigate} />;
      case "overview":          return <Overview navigate={navigate} />;
      case "hosting-list":      return <HostingList navigate={navigate} />;
      case "hosting-detail":    return <HostingDetail id={route.params?.id} navigate={navigate} />;
      case "domains-mine":      return <DomainsMine navigate={navigate} />;
      case "domains-buy":       return <DomainsBuy navigate={navigate} />;
      case "dns":               return <DnsEditor domain={route.params?.domain || ""} navigate={navigate} />;
      case "builder-gallery":   return <BuilderGallery navigate={navigate} />;
      case "builder-templates": return <BuilderTemplates navigate={navigate} />;
      case "builder-roxanne":   return <BuilderRoxanne navigate={navigate} />;
      case "builder-import":    return <BuilderImport mode={route.params?.mode || "github"} navigate={navigate} />;
      case "builder-ai-intake":              return <BuilderAiIntake templateId={route.params?.templateId || ""} templateType={route.params?.templateType || "html"} navigate={navigate} />;
      case "builder-deployment-settings":    return <BuilderDeploymentSettings siteId={route.params?.siteId || null} templateId={route.params?.templateId || ""} templateType={route.params?.templateType || "html"} navigate={navigate} />;
      case "builder-editor":                 return <BuilderEditor id={route.params?.id} siteId={route.params?.siteId} navigate={navigate} />;
      case "analytics":         return <SimplePage title="Analytics" body="Cross-project analytics — coming up next." />;
      case "activity":          return <ActivityPage />;
      case "admin":             return <AdminPage navigate={navigate} />;
      case "billing":           return <BillingPage navigate={navigate} />;
      case "profile":           return <ProfilePage navigate={navigate} />;
      case "settings":          return <SimplePage title="Settings" body="Workspace settings — coming up next." />;
      case "vps-hosting":       return <VpsHostingList navigate={navigate} />;
      case "vps-create":        return <VpsCreateWizard navigate={navigate} initialPlan={route.params?.plan || ''} initialPlanType={route.params?.planType || ''} />;
      case "vps-detail":        return <VpsDetail id={route.params?.id} navigate={navigate} />;
      default:
        window.location.href = "/";
        return null;
    }
  };

  // Sidebar key
  const activeKey = (() => {
    if (route.view.startsWith("hosting")) return "hosting";
    if (route.view.startsWith("vps")) return "vps-hosting";
    if (route.view === "domains-mine") return "domains";
    if (route.view === "domains-buy") return "buy";
    if (route.view === "dns") return "dns";
    if (route.view.startsWith("builder")) return "builder";
    return route.view;
  })();

  const crumbs = (() => {
    switch (route.view) {
      case "overview":        return [{ label: "Workspace" }, { label: "Overview" }];
      case "hosting-list":    return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Hosting" }];
      case "hosting-detail":  return [{ label: "Hosting", onClick: () => navigate({ view: "hosting-list" }) }, { label: route.params?.id || "project" }];
      case "domains-mine":    return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Domains" }];
      case "domains-buy":     return [{ label: "Domains", onClick: () => navigate({ view: "domains-mine" }) }, { label: "Buy a domain" }];
      case "dns":             return [{ label: "Domains", onClick: () => navigate({ view: "domains-mine" }) }, { label: route.params?.domain || "DNS" }, { label: "DNS records" }];
      case "builder-gallery":    return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Site builder" }];
      case "builder-ai-intake":           return [{ label: "Site builder", onClick: () => navigate({ view: "builder-gallery" }) }, { label: "Template setup" }];
      case "builder-deployment-settings": return [{ label: "Template setup", onClick: () => navigate({ view: "builder-ai-intake" }) }, { label: "Deploy" }];
      case "builder-templates": return [{ label: "Site builder", onClick: () => navigate({ view: "builder-gallery" }) }, { label: "Templates" }];
      case "builder-roxanne": return [{ label: "Site builder", onClick: () => navigate({ view: "builder-gallery" }) }, { label: "RoxanneAI" }];
      case "builder-import":  return [{ label: "Site builder", onClick: () => navigate({ view: "builder-gallery" }) }, { label: "Import" }];
      case "builder-editor":  return [{ label: "Templates", onClick: () => navigate({ view: "builder-templates" }) }, { label: "Editor" }];
      case "billing":         return [{ label: "Workspace" }, { label: "Billing" }];
      case "profile":         return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Profile" }];
      case "admin":           return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Admin" }];
      case "vps-hosting":    return [{ label: "Workspace", onClick: () => navigate({ view: "overview" }) }, { label: "Cloud Servers" }];
      case "vps-create":     return [{ label: "Cloud Servers", onClick: () => navigate({ view: "vps-hosting" }) }, { label: "New server" }];
      case "vps-detail":     return [{ label: "Cloud Servers", onClick: () => navigate({ view: "vps-hosting" }) }, { label: route.params?.id || "Server" }];
      default:                return [{ label: "Workspace" }];
    }
  })();

  const isFullPageView = route.view === "login" || route.view === "signup" || isAuthBlocked;

  return (
    <>
      {isFullPageView
        ? renderView()
        : (
          <div className="dash">
            {githubBanner && (
              <div style={{
                position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
                background: "var(--accent-soft)", color: "var(--accent)",
                borderBottom: "1px solid var(--accent)", padding: "10px 20px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 13, fontWeight: 500,
              }}>
                <span><ICN.Git size={14} style={{ marginRight: 6 }} />{githubBanner}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setGithubBanner(null)} style={{ color: "var(--accent)" }}>✕</button>
              </div>
            )}
            <DashSidebar
              active={activeKey}
              navigate={(r) => { navigate(r); setMobileNavOpen(false); }}
              mobileOpen={mobileNavOpen}
              onClose={() => setMobileNavOpen(false)}
            />
            {mobileNavOpen && <button className="dash-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
            <main className="dash-main">
              <DashTopbar crumbs={crumbs} navigate={navigate} theme={t.theme} toggleTheme={toggleTheme} onOpenNav={() => setMobileNavOpen(true)} />
              <div className="dash-body">
                <RouteErrorBoundary routeKey={`${route.view}:${route.params?.id || ""}:${route.params?.siteId || ""}`} navigate={navigate}>
                  {renderView()}
                </RouteErrorBoundary>
              </div>
            </main>
          </div>
        )}

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme} options={["light", "dark"]}
                    onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]}
                    onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent}
                    options={Object.keys(ACCENT_PRESETS)}
                    onChange={(v) => setTweak("accent", v)} />
        <TweakSelect label="Font pairing" value={t.fontPair}
                     options={[
                       { value: "serif-sans", label: "Instrument Serif + Inter" },
                       { value: "all-sans",   label: "Inter only" },
                       { value: "mono-display", label: "JetBrains Mono display" },
                     ]}
                     onChange={(v) => setTweak("fontPair", v)} />
        <TweakSection label="Navigate" />
        <TweakButton onClick={() => { window.location.href = "/"; }}>Front page</TweakButton>
        <TweakButton onClick={() => navigate({ view: "overview" })}>Dashboard overview</TweakButton>
        <TweakButton onClick={() => navigate({ view: "hosting-list" })}>Hosting projects</TweakButton>
        <TweakButton onClick={() => navigate({ view: "hosting-detail", params: { id: "" } })}>Project detail</TweakButton>
        <TweakButton onClick={() => navigate({ view: "domains-buy" })}>Buy a domain</TweakButton>
        <TweakButton onClick={() => navigate({ view: "dns" })}>DNS editor</TweakButton>
        <TweakButton onClick={() => navigate({ view: "builder-gallery" })}>Site builder start</TweakButton>
        <TweakButton onClick={() => navigate({ view: "builder-templates" })}>Template gallery</TweakButton>
        <TweakButton onClick={() => navigate({ view: "builder-templates" })}>Builder editor</TweakButton>
      </TweaksPanel>
    </>
  );
}

function ComingSoon({ navigate }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Coming soon</div>
          <h1>Not available yet</h1>
          <p className="sub">This feature is being prepared and will unlock soon.</p>
        </div>
      </div>
      <Empty
        icon="Sparkles"
        title="Coming soon"
        body="We're focused on shipping core hosting first. This area will be available in an upcoming release."
        action={
          <button className="btn btn-primary" onClick={() => navigate({ view: "hosting-list" })}>
            Go to hosting
          </button>
        }
      />
    </>
  );
}

function SimplePage({ title, body }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Workspace</div>
          <h1>{title}</h1>
          <p className="sub">{body}</p>
        </div>
      </div>
      <Empty icon="Sparkles" title="Surface in progress" body="This panel is on the roadmap for the next sprint." />
    </>
  );
}
