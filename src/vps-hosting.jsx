import React, { useEffect, useState } from 'react';
import { ICN } from './icons';
import { Badge, Empty, StatusBadge, Tabs } from './components';
import {
  deployVpsService,
  destroyVpsService,
  getVpsService,
  getVpsQuote,
  getVultrSettings,
  haltVpsService,
  listVpsServices,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
  rebootVpsService,
  startVpsService,
} from './api/vultr.js';

const fmtCents = (cents) => cents != null ? (cents / 100).toFixed(2) : '—';

// ─── Plan type catalogue ───────────────────────────────────────────────────────

const PLAN_TYPES = [
  {
    id: 'vc2',
    name: 'Cloud Compute',
    tagline: 'Reliable shared CPU — perfect for most workloads',
    icon: 'Server',
    badge: 'Popular',
  },
  {
    id: 'vhf',
    name: 'High Frequency',
    tagline: 'NVMe SSD + high clock speeds for demanding apps',
    icon: 'Zap',
    badge: null,
  },
  {
    id: 'vhp',
    name: 'High Performance',
    tagline: 'AMD EPYC processors — ideal for CPU-intensive tasks',
    icon: 'Cpu',
    badge: null,
  },
  {
    id: 'voc-g',
    name: 'General Purpose',
    tagline: 'Optimized cloud with balanced CPU, RAM, and network',
    icon: 'LayoutDashboard',
    badge: null,
  },
];

// ─── Continent grouping ────────────────────────────────────────────────────────

const CONTINENT = {
  us: 'Americas', ca: 'Americas', br: 'Americas', cl: 'Americas', mx: 'Americas',
  gb: 'Europe',   de: 'Europe',   nl: 'Europe',   fr: 'Europe',
  es: 'Europe',   pl: 'Europe',   se: 'Europe',
  sg: 'Asia-Pacific', jp: 'Asia-Pacific', kr: 'Asia-Pacific',
  in: 'Asia-Pacific', au: 'Asia-Pacific',
  za: 'Africa',
};

function regionContinent(r) {
  return CONTINENT[r.country?.toLowerCase()] ?? 'Other';
}

function flagEmoji(country) {
  if (!country) return '🌐';
  return country.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

// ─── OS logo initials ──────────────────────────────────────────────────────────

const OS_COLORS = {
  Ubuntu: ['#E95420', '#fff'],
  Debian: ['#A80030', '#fff'],
  AlmaLinux: ['#0F4266', '#fff'],
  'Rocky Linux': ['#10B981', '#fff'],
  Fedora: ['#294172', '#fff'],
  CentOS: ['#932279', '#fff'],
  FreeBSD: ['#AB2B28', '#fff'],
  Windows: ['#0078D4', '#fff'],
};

function OsIcon({ name, size = 32 }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();
  const [bg, fg] = OS_COLORS[name?.split(' ')[0]] ?? ['var(--bg-deep)', 'var(--text)'];
  return (
    <span style={{
      width: size, height: size, borderRadius: 8,
      background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, flexShrink: 0,
    }}>{initials}</span>
  );
}

// ─── Step progress bar ─────────────────────────────────────────────────────────

const STEPS = ['Type', 'Region', 'Plan', 'OS', 'Configure', 'Review', 'Deploying'];

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 24, overflow: 'hidden', borderRadius: 8 }}>
      {STEPS.map((label, i) => {
        const done    = i < step;
        const current = i === step;
        return (
          <div key={label} style={{
            flex: 1, padding: '7px 0', textAlign: 'center', fontSize: 11, fontWeight: current ? 700 : 400,
            background: done ? 'var(--accent-soft)' : current ? 'var(--accent)' : 'var(--bg-deep)',
            color: done ? 'var(--accent)' : current ? '#fff' : 'var(--text-faint)',
            borderRight: i < STEPS.length - 1 ? '1px solid var(--bg)' : 'none',
            transition: 'background .2s',
          }}>
            {done ? '✓ ' : `${i + 1}. `}{label}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared card-selector component ───────────────────────────────────────────

function SelectCard({ selected, onClick, children, style }) {
  return (
    <button type="button" onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer', border: 'none', borderRadius: 'var(--r)',
      padding: '14px 16px',
      background: selected ? 'var(--accent-soft)' : 'var(--bg-card)',
      outline: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
      outlineOffset: selected ? 0 : -1,
      transition: 'outline .1s, background .1s',
      ...style,
    }}>
      {children}
    </button>
  );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function Skel({ w = '80%', h = 14, style }) {
  return (
    <span className="skel" style={{
      display: 'inline-block', width: w, height: h, borderRadius: 4,
      ...style,
    }} />
  );
}

// ─── VPS List ─────────────────────────────────────────────────────────────────

export function VpsHostingList({ navigate, refreshKey = 0 }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('servers');

  const load = () => {
    setLoading(true);
    listVpsServices()
      .then((list) => setServers(list ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // Re-fetch whenever the parent bumps refreshKey (e.g. after destroy)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    listVpsServices()
      .then((list) => { if (alive) setServers(list ?? []); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const SKELETON_ROWS = 3;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting</div>
          <h1>Cloud Servers</h1>
          <p className="sub">Provision and manage virtual servers — choose your region, resources, and OS.</p>
        </div>
        <div className="actions">
          {tab === 'servers' && (
            <button className="btn btn-primary" onClick={() => navigate({ view: 'vps-create' })}>
              <ICN.Plus size={14} /> New server
            </button>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'servers',  label: 'My servers' },
          { value: 'plans',    label: 'Plans & pricing' },
          { value: 'settings', label: 'Settings' },
        ]}
      />

      {tab === 'servers' ? (
        <>
          {error && (
            <div className="card" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13 }}>
              {error}{' '}
              <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 8 }}>Retry</button>
            </div>
          )}

          {/* Always render the table shell — skeleton rows fill while loading */}
          {loading ? (
            <div className="card card-flush">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Server</th><th>Location</th><th>Specs</th>
                    <th>IP address</th><th>Status</th><th>Monthly</th><th />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                    <tr key={i}>
                      <td><Skel w="120px" /><br /><Skel w="80px" h={10} style={{ marginTop: 4 }} /></td>
                      <td><Skel w="60px" /></td>
                      <td><Skel w="140px" /></td>
                      <td><Skel w="100px" /></td>
                      <td><Skel w="56px" h={20} style={{ borderRadius: 99 }} /></td>
                      <td><Skel w="50px" /></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : servers.length === 0 ? (
            <Empty
              icon="Server"
              title="No servers yet"
              body="Provision your first cloud server in minutes — choose your region, plan, and OS."
              action={
                <button className="btn btn-primary" onClick={() => navigate({ view: 'vps-create' })}>
                  <ICN.Plus size={14} /> Deploy first server
                </button>
              }
            />
          ) : (
            <div className="card card-flush">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Server</th><th>Location</th><th>Specs</th>
                    <th>IP address</th><th>Status</th><th>Monthly</th><th />
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s) => (
                    <tr key={s.id} style={{ cursor: 'pointer' }}
                        onClick={() => navigate({ view: 'vps-detail', params: { id: s.id } })}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.label}</div>
                        <div className="mono faint" style={{ fontSize: 11 }}>{s.hostname}</div>
                      </td>
                      <td style={{ fontSize: 13 }}>{s.region}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {s.vcpuCount ? `${s.vcpuCount} vCPU · ${(s.ramMb / 1024).toFixed(0)} GB · ${s.diskGb} GB` : s.plan}
                      </td>
                      <td className="mono">{s.mainIp || '—'}</td>
                      <td><StatusBadge value={s.status} /></td>
                      <td className="mono" style={{ fontWeight: 600 }}>${fmtCents(s.totalPriceCents)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <ICN.ArrowRight size={13} style={{ color: 'var(--text-faint)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'plans' ? (
        <VpsPlans navigate={navigate} />
      ) : (
        <VpsSettings />
      )}
    </>
  );
}

// ─── VPS Create Wizard ────────────────────────────────────────────────────────

export function VpsCreateWizard({ navigate, initialPlan = '', initialPlanType = '' }) {
  const [step, setStep]           = useState(initialPlanType ? 1 : 0);
  const [regions, setRegions]     = useState([]);
  const [plans, setPlans]         = useState([]);
  const [osList, setOsList]       = useState([]);
  const [regionsReady, setRR]     = useState(false);
  const [plansReady, setPR]       = useState(false);
  const [osReady, setOR]          = useState(false);
  const [error, setError]         = useState('');
  const [quote, setQuote]         = useState(null);
  const [quoteLoading, setQL]     = useState(false);
  const [deployLoading, setDL]    = useState(false);
  const [deployedVps, setDeployed]= useState(null);

  const [form, setForm] = useState({
    planType: initialPlanType || '',
    region: '', plan: initialPlan || '', osId: null,
    label: '', hostname: '',
    // SSH
    sshMode: 'none',   // 'none' | 'paste' | 'existing'
    sshPublicKey: '', sshKeyName: '', sshKeyId: '',
    // Options
    enableIpv6: false, backups: false, ddosProtection: false,
    // Cloud-init
    userData: '',
  });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k) => () => setForm((f) => ({ ...f, [k]: !f[k] }));

  // Load catalog data in parallel — each resolves independently so the wizard
  // renders immediately and each step fills in as its data arrives.
  useEffect(() => {
    let alive = true;
    listVultrRegions()
      .then((r) => { if (alive) setRegions(r ?? []); })
      .catch((err) => { if (alive) setError((e) => e || err.message); })
      .finally(() => { if (alive) setRR(true); });
    listVultrPlans()
      .then((p) => { if (alive) setPlans(p ?? []); })
      .catch((err) => { if (alive) setError((e) => e || err.message); })
      .finally(() => { if (alive) setPR(true); });
    listVultrOperatingSystems()
      .then((o) => { if (alive) setOsList(o ?? []); })
      .catch((err) => { if (alive) setError((e) => e || err.message); })
      .finally(() => { if (alive) setOR(true); });
    return () => { alive = false; };
  }, []);

  // Fetch quote when reaching review step; re-fetch if config changed after going back
  useEffect(() => {
    if (step !== 5 || !form.region || !form.plan || !form.osId) return;
    setQL(true);
    getVpsQuote({ region: form.region, plan: form.plan, osId: form.osId })
      .then(setQuote)
      .catch((err) => setError(err.message))
      .finally(() => setQL(false));
  }, [step, form.region, form.plan, form.osId]);

  const handleDeploy = async () => {
    setError('');
    setDL(true);
    setStep(6);
    try {
      const vps = await deployVpsService({
        region: form.region, plan: form.plan, osId: form.osId,
        label: form.label, hostname: form.hostname || form.label,
        sshKeyId:    form.sshMode === 'existing' ? form.sshKeyId    : undefined,
        sshPublicKey:form.sshMode === 'paste'    ? form.sshPublicKey: undefined,
        sshKeyName:  form.sshMode === 'paste'    ? (form.sshKeyName || form.label) : undefined,
        userData:    form.userData || undefined,
        enableIpv6:  form.enableIpv6  || undefined,
        backups:     form.backups     || undefined,
        ddosProtection: form.ddosProtection || undefined,
      });
      setDeployed(vps);
      // Navigate to detail after a short delay so the user sees the success state
      setTimeout(() => navigate({ view: 'vps-detail', params: { id: vps.id } }), 1800);
    } catch (err) {
      setError(err.message || 'Deployment failed. Please try again.');
      setStep(5); // go back to review so user can retry
    } finally {
      setDL(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return Boolean(form.planType);
    if (step === 1) return Boolean(form.region);
    if (step === 2) return Boolean(form.plan);
    if (step === 3) return form.osId !== null;
    if (step === 4) return form.label.trim().length > 0;
    return true;
  };

  const typePlans  = form.planType ? plans.filter((p) => p.type === form.planType) : plans;
  const regionPlans = form.region
    ? typePlans.filter((p) => !p.locations?.length || p.locations.includes(form.region))
    : typePlans;

  const selectedRegion = regions.find((r) => r.id === form.region);
  const selectedPlan   = plans.find((p) => p.id === form.plan);
  const selectedOs     = osList.find((o) => o.id === form.osId);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Cloud Servers</div>
          <h1>Deploy a server</h1>
          <p className="sub">Choose your plan type, region, OS, and options — deploy instantly, billed monthly by usage.</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate({ view: 'vps-hosting' })}>Cancel</button>
        </div>
      </div>

      <StepBar step={step} />

      {error && (
        <div className="card" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card">
        <div style={{ padding: '24px' }}>

          {/* ── Step 0: Plan type ── */}
          {step === 0 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Choose a server type</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                Select the compute class that best fits your workload.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {PLAN_TYPES.map((pt) => {
                  const Icon = ICN[pt.icon];
                  const sel = form.planType === pt.id;
                  return (
                    <SelectCard key={pt.id} selected={sel} onClick={() => set('planType')(pt.id)}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <span style={{
                          width: 38, height: 38, borderRadius: 10,
                          background: sel ? 'var(--accent)' : 'var(--bg-deep)',
                          color: sel ? '#fff' : 'var(--text-muted)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Icon size={18} />
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{pt.name}</span>
                            {pt.badge && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: 'var(--accent)', color: '#fff' }}>
                                {pt.badge}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{pt.tagline}</div>
                        </div>
                      </div>
                    </SelectCard>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 1: Region ── */}
          {step === 1 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Choose a location</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                Pick the datacenter closest to your users for the best latency.
              </p>
              {!regionsReady && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Skel w={28} h={28} style={{ borderRadius: '50%', flexShrink: 0 }} />
                      <div><Skel w="80px" /><br /><Skel w="50px" h={10} style={{ marginTop: 4 }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {regionsReady && ['Americas', 'Europe', 'Asia-Pacific', 'Africa', 'Other'].map((continent) => {
                const group = regions.filter((r) => regionContinent(r) === continent);
                if (!group.length) return null;
                return (
                  <div key={continent} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
                      {continent}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                      {group.map((r) => (
                        <SelectCard key={r.id} selected={form.region === r.id} onClick={() => set('region')(r.id)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>{flagEmoji(r.country)}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.city}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.country?.toUpperCase()} · {r.id}</div>
                            </div>
                          </div>
                        </SelectCard>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 2: Plan ── */}
          {step === 2 && (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Choose your resources</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                Prices shown include platform fee. You can upgrade anytime.
              </p>
              {!plansReady && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                      <Skel w={16} h={16} style={{ borderRadius: '50%', flexShrink: 0 }} />
                      <Skel w="90px" /><Skel w="40px" /><Skel w="50px" /><Skel w="60px" /><Skel w="60px" /><Skel w="55px" />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ overflowX: 'auto', display: plansReady ? 'block' : 'none' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['', 'vCPU', 'RAM', 'Storage', 'Bandwidth', 'Price / mo'].map((h) => (
                        <th key={h} style={{ textAlign: h === '' || h === 'Price / mo' ? 'left' : 'center',
                          padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {regionPlans.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)' }}>
                        No plans available for this region / type combination.
                      </td></tr>
                    ) : regionPlans.map((p) => {
                      const sel = form.plan === p.id;
                      const markup = 30;
                      const base   = p.monthly_cost ?? 0;
                      const total  = (base * (1 + markup / 100)).toFixed(2);
                      return (
                        <tr key={p.id}
                          onClick={() => set('plan')(p.id)}
                          style={{
                            cursor: 'pointer',
                            background: sel ? 'var(--accent-soft)' : 'transparent',
                            outline: sel ? '2px solid var(--accent)' : 'none',
                            borderBottom: '1px solid var(--border)',
                          }}>
                          <td style={{ padding: '12px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: '50%', border: '2px solid',
                                borderColor: sel ? 'var(--accent)' : 'var(--border)',
                                background: sel ? 'var(--accent)' : 'transparent', flexShrink: 0,
                              }} />
                              <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>{p.id}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600 }}>{p.vcpu_count}</td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>{p.ram >= 1024 ? `${p.ram / 1024} GB` : `${p.ram} MB`}</td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>{p.disk} GB SSD</td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>{p.bandwidth ? `${p.bandwidth} GB` : 'Unlimited'}</td>
                          <td style={{ padding: '12px 12px' }}>
                            <span style={{ fontWeight: 700, color: sel ? 'var(--accent)' : 'var(--text)', fontSize: 14 }}>
                              ${total}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 3: OS ── */}
          {step === 3 && (() => {
            if (!osReady) return (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>Choose an operating system</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Skel w={30} h={30} style={{ borderRadius: 8, flexShrink: 0 }} />
                      <div><Skel w="80px" /><br /><Skel w="40px" h={10} style={{ marginTop: 4 }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            );
            const popular = ['Ubuntu', 'Debian', 'AlmaLinux', 'Rocky Linux', 'Fedora', 'Windows', 'FreeBSD'];
            const sorted  = [...osList].sort((a, b) => {
              const ai = popular.indexOf(a.family ?? a.name);
              const bi = popular.indexOf(b.family ?? b.name);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            const families = [...new Set(sorted.map((o) => o.family))];
            return (
              <div>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>Choose an operating system</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                  All images are official releases sourced directly from the OS vendors.
                </p>
                {families.map((family) => (
                  <div key={family} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: 8 }}>
                      {family}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                      {sorted.filter((o) => o.family === family).map((o) => (
                        <SelectCard key={o.id} selected={form.osId === o.id} onClick={() => set('osId')(o.id)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <OsIcon name={o.family} size={30} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.arch || 'x86_64'}</div>
                            </div>
                          </div>
                        </SelectCard>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Step 4: Configure ── */}
          {step === 4 && (
            <div style={{ maxWidth: 540 }}>
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>Configure your server</h3>

              {/* Label & hostname */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <label className="label">Server label <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input" placeholder="my-web-server" value={form.label}
                    onChange={(e) => set('label')(e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Used to identify this server</div>
                </div>
                <div>
                  <label className="label">Hostname <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="input" placeholder="server.example.com" value={form.hostname}
                    onChange={(e) => set('hostname')(e.target.value)} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>FQDN for the server</div>
                </div>
              </div>

              {/* SSH key */}
              <div style={{ marginBottom: 20 }}>
                <label className="label" style={{ marginBottom: 8, display: 'block' }}>SSH access</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[['none', 'Password only'], ['paste', 'Add SSH key'], ['existing', 'Use key ID']].map(([val, lbl]) => (
                    <button key={val} type="button"
                      onClick={() => set('sshMode')(val)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', border: 'none',
                        background: form.sshMode === val ? 'var(--accent)' : 'var(--bg-deep)',
                        color: form.sshMode === val ? '#fff' : 'var(--text)',
                        fontWeight: form.sshMode === val ? 600 : 400,
                      }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {form.sshMode === 'paste' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="label">Key name</label>
                      <input className="input" placeholder="My laptop key" value={form.sshKeyName}
                        onChange={(e) => set('sshKeyName')(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Public key</label>
                      <textarea className="input" rows={4}
                        placeholder="ssh-rsa AAAAB3NzaC1yc2E... user@host"
                        value={form.sshPublicKey}
                        onChange={(e) => set('sshPublicKey')(e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'var(--mono, monospace)', fontSize: 11 }} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Run <code>cat ~/.ssh/id_rsa.pub</code> to get your public key
                      </div>
                    </div>
                  </div>
                )}

                {form.sshMode === 'existing' && (
                  <div>
                    <label className="label">SSH Key UUID</label>
                    <input className="input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={form.sshKeyId} onChange={(e) => set('sshKeyId')(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Additional options */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13 }}>Additional options</div>
                {[
                  { key: 'enableIpv6',     label: 'Enable IPv6',             sub: 'Adds a free IPv6 address to your server' },
                  { key: 'backups',        label: 'Automatic backups',        sub: 'Daily backups stored for 14 days' },
                  { key: 'ddosProtection', label: 'DDoS protection',          sub: 'Layer 3/4 mitigation — additional charge applies' },
                ].map(({ key, label, sub }) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
                    </div>
                    <button type="button" onClick={toggle(key)} style={{
                      width: 38, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: form[key] ? 'var(--accent)' : 'var(--border-strong)',
                      position: 'relative', transition: 'background .2s', flexShrink: 0, marginLeft: 16,
                    }}>
                      <span style={{
                        position: 'absolute', top: 2, left: form[key] ? 18 : 2,
                        width: 18, height: 18, borderRadius: 999,
                        background: '#fff', transition: 'left .2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,.18)',
                      }} />
                    </button>
                  </div>
                ))}

                {/* Cloud-init */}
                <div style={{ marginTop: 16 }}>
                  <label className="label">Startup script / cloud-init
                    <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> (optional)</span>
                  </label>
                  <textarea className="input" rows={4}
                    placeholder={'#!/bin/bash\napt-get update && apt-get upgrade -y'}
                    value={form.userData}
                    onChange={(e) => set('userData')(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'var(--mono, monospace)', fontSize: 11, marginTop: 6 }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Review ── */}
          {step === 5 && (
            <div style={{ maxWidth: 520 }}>
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>Review your server</h3>

              <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {[
                      ['Server label',  form.label],
                      ['Hostname',      form.hostname || form.label],
                      ['Location',      selectedRegion ? `${flagEmoji(selectedRegion.country)} ${selectedRegion.city}, ${selectedRegion.country?.toUpperCase()}` : form.region],
                      ['Plan',          selectedPlan  ? `${selectedPlan.vcpu_count} vCPU · ${selectedPlan.ram >= 1024 ? selectedPlan.ram / 1024 + ' GB' : selectedPlan.ram + ' MB'} RAM · ${selectedPlan.disk} GB SSD` : form.plan],
                      ['OS',            selectedOs?.name ?? String(form.osId)],
                      ['IPv6',          form.enableIpv6    ? 'Enabled'  : 'Disabled'],
                      ['Backups',       form.backups       ? 'Enabled'  : 'Disabled'],
                      ['DDoS protect',  form.ddosProtection? 'Enabled'  : 'Disabled'],
                      ['SSH access',    form.sshMode === 'paste' ? 'New key will be registered' : form.sshMode === 'existing' ? 'Existing key' : 'Password only'],
                    ].map(([label, value]) => (
                      <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', width: 140 }}>{label}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {quoteLoading ? (
                <div className="faint" style={{ fontSize: 13 }}>Calculating price…</div>
              ) : quote ? (
                <div style={{
                  background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                  borderRadius: 'var(--r)', padding: '16px 20px',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Usage-based billing</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Server cost</span>
                    <span className="mono">{quote.breakdown?.vpsPrice}/mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: 'var(--text-muted)' }}>
                    <span>Platform fee ({quote.markupPercent}%)</span>
                    <span className="mono">{quote.breakdown?.platformFee}/mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800,
                    fontSize: 16, borderTop: '1px solid var(--accent)', paddingTop: 12, marginTop: 6 }}>
                    <span>Total / month</span>
                    <span className="mono" style={{ color: 'var(--accent)' }}>{quote.breakdown?.total}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                    color: 'var(--text-muted)', marginTop: 6 }}>
                    <span>Hourly rate</span>
                    <span className="mono">${(quote.totalMonthlyCostCents / 100 / 730).toFixed(4)}/hr</span>
                  </div>
                  <div style={{
                    marginTop: 14, padding: '10px 12px', background: 'var(--bg-card)',
                    borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-muted)',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <ICN.Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
                    <span>
                      No charge today. Usage accrues hourly from the moment you deploy.
                      You'll be invoiced at the end of your billing period.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Step 6: Deploying ── */}
          {step === 6 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              {deployedVps ? (
                <>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'var(--accent-soft)', margin: '0 auto 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ICN.CheckCircle size={30} style={{ color: 'var(--accent)' }} />
                  </div>
                  <h3 style={{ marginTop: 0 }}>Server deploying</h3>
                  <p style={{ color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto 16px' }}>
                    <strong>{deployedVps.label}</strong> is provisioning in <strong>{deployedVps.region}</strong>.
                    Your IP address will appear within 60 seconds. Taking you to the server dashboard…
                  </p>
                </>
              ) : (
                <>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'var(--accent-soft)', margin: '0 auto 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ICN.Server size={28} style={{ color: 'var(--accent)' }} />
                  </div>
                  <h3 style={{ marginTop: 0 }}>Deploying your server…</h3>
                  <p style={{ color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto 16px' }}>
                    Sending the request to the datacenter. This usually takes a few seconds.
                  </p>
                </>
              )}
            </div>
          )}

        </div>

        {/* Footer nav */}
        {step < 6 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost"
              onClick={() => step === 0 ? navigate({ view: 'vps-hosting' }) : setStep((s) => s - 1)}>
              {step === 0 ? 'Cancel' : '← Back'}
            </button>
            {step < 5 ? (
              <button className="btn btn-primary" disabled={!canAdvance()} onClick={() => setStep((s) => s + 1)}>
                Continue →
              </button>
            ) : (
              <button className="btn btn-primary" style={{ minWidth: 180 }}
                disabled={deployLoading || quoteLoading} onClick={handleDeploy}>
                <ICN.Server size={14} />
                {deployLoading ? 'Deploying…' : 'Deploy server →'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── VPS Detail ───────────────────────────────────────────────────────────────

export function VpsDetail({ id, navigate, onDestroyed }) {
  const [server, setServer]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState('');
  const [error, setError]     = useState('');
  const [confirm, setConfirm] = useState('');

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    getVpsService(id)
      .then((s) => { setServer(s); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(() => { load(); }, [id]);

  // Auto-poll every 5 s while the server is still provisioning
  useEffect(() => {
    if (!server) return;
    const provisioning = ['pending', 'provisioning'].includes(server.status);
    if (!provisioning) return;
    const t = setInterval(() => load(false), 5000);
    return () => clearInterval(t);
  }, [server?.status]);

  const act = async (key, fn) => {
    setError('');
    setBusy(key);
    try {
      // Always call the API first and wait for confirmation.
      // For destroy: the "Destroying…" label is shown while we wait.
      // Only navigate after the server confirms deletion — that way the
      // list re-fetch happens AFTER the DB soft-delete is committed.
      await fn();
      if (key === 'destroy') {
        if (onDestroyed) onDestroyed(); // bump parent refreshKey AFTER API succeeds
        navigate({ view: 'vps-hosting' });
        return;
      }
      load(false); // silent refresh for start / halt / reboot
    } catch (err) {
      setError(err.message || `${key} failed. Please try again.`);
    } finally {
      setBusy('');
      setConfirm('');
    }
  };

  // Render page shell immediately — fill with skeletons while loading
  const isActive  = server?.status === 'active';
  const isStopped = ['stopped', 'halted'].includes(server?.status ?? '');
  const isProvisioning = ['pending', 'provisioning'].includes(server?.status ?? '');

  if (!loading && !server) return (
    <Empty icon="Server" title="Server not found"
      body={error || 'This server may have been destroyed.'}
      action={<button className="btn btn-outline" onClick={() => navigate({ view: 'vps-hosting' })}>← Back to servers</button>}
    />
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Cloud Servers</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {loading ? <Skel w="180px" h={28} /> : server.label}
            {!loading && <StatusBadge value={server.status} />}
            {isProvisioning && !loading && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                Auto-refreshing…
              </span>
            )}
          </h1>
          <p className="sub">
            {loading
              ? <Skel w="260px" h={13} />
              : `${server.hostname} · ${server.region} · ${server.plan}`}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate({ view: 'vps-hosting' })}>← All servers</button>
          <button className="btn btn-outline" onClick={() => load(false)} disabled={loading}>
            <ICN.RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      <div className="grid-side" style={{ '--side-width': '300px' }}>

        {/* Left: server info + connect */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div className="card">
            <div className="card-head"><h2>Server details</h2></div>
            <table className="tbl">
              <tbody>
                <tr><td className="label">IP address</td>
                  <td><span className="mono">{loading ? <Skel w="110px" /> : (server.mainIp || 'Pending…')}</span></td></tr>
                <tr><td className="label">Region</td><td>{loading ? <Skel w="60px" /> : server.region}</td></tr>
                <tr><td className="label">Plan</td><td className="mono">{loading ? <Skel w="100px" /> : server.plan}</td></tr>
                <tr><td className="label">vCPU</td><td>{loading ? <Skel w="50px" /> : (server.vcpuCount ? `${server.vcpuCount} cores` : '—')}</td></tr>
                <tr><td className="label">RAM</td><td>{loading ? <Skel w="50px" /> : (server.ramMb ? `${(server.ramMb / 1024).toFixed(0)} GB` : '—')}</td></tr>
                <tr><td className="label">Storage</td><td>{loading ? <Skel w="60px" /> : (server.diskGb ? `${server.diskGb} GB SSD` : '—')}</td></tr>
                <tr><td className="label">OS</td><td className="mono">{loading ? <Skel w="80px" /> : (server.osName || `ID ${server.osId}`)}</td></tr>
                <tr><td className="label">Created</td>
                  <td>{loading ? <Skel w="100px" /> : new Date(server.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>
              </tbody>
            </table>
          </div>

          {!loading && server.mainIp && server.mainIp !== 'Pending…' && (
            <div className="card">
              <div className="card-head"><h2>Connect via SSH</h2></div>
              <div style={{ padding: '10px 16px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Open your terminal and run:
                </div>
                <div className="mono" style={{
                  background: 'var(--bg-deep)', padding: '10px 14px', fontSize: 12,
                  borderRadius: 'var(--r-sm)', userSelect: 'all', wordBreak: 'break-all',
                }}>
                  ssh root@{server.mainIp}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  First time? Run <code>ssh-keygen</code> to generate a key pair, then add the public key when creating future servers.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: pricing + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div className="card">
            <div className="card-head"><h2>Billing</h2></div>
            <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Server cost</span>
                <span className="mono">{loading ? <Skel w="60px" /> : `$${fmtCents(server.monthlyCostCents)}/mo`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Platform fee ({loading ? '…' : `${server.markupPercent ?? 0}%`})</span>
                <span className="mono">{loading ? <Skel w="55px" /> : `$${fmtCents(server.markupAmountCents)}/mo`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700,
                borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 15 }}>
                <span>Total / month</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  {loading ? <Skel w="65px" h={18} /> : `$${fmtCents(server.totalPriceCents)}`}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Power controls</h2></div>
            <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-outline" disabled={loading || !!busy || isActive}
                onClick={() => act('start', () => startVpsService(id))}>
                {busy === 'start' ? 'Starting…' : <><ICN.Play size={13} /> Power on</>}
              </button>
              <button className="btn btn-outline" disabled={loading || !!busy || isStopped}
                onClick={() => act('halt', () => haltVpsService(id))}>
                {busy === 'halt' ? 'Halting…' : <><ICN.Square size={13} /> Power off</>}
              </button>
              <button className="btn btn-outline" disabled={loading || !!busy}
                onClick={() => act('reboot', () => rebootVpsService(id))}>
                {busy === 'reboot' ? 'Rebooting…' : <><ICN.RefreshCw size={13} /> Reboot</>}
              </button>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

              {confirm === 'destroy' ? (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    This permanently deletes the server and all its data. This cannot be undone.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger btn-sm" disabled={!!busy}
                      onClick={() => act('destroy', () => destroyVpsService(id))}>
                      {busy === 'destroy' ? 'Destroying…' : 'Yes, destroy'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm('')}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  disabled={loading || !!busy} onClick={() => setConfirm('destroy')}>
                  <ICN.Trash2 size={13} /> Destroy server
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── VPS Settings & integrations ──────────────────────────────────────────────

function VpsSettings() {
  const [settings, setSettings] = useState(null);
  const [plans, setPlans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([getVultrSettings(), listVultrPlans()])
      .then(([s, p]) => {
        if (!alive) return;
        setSettings(s);
        setPlans(p ?? []);
      })
      .catch((err) => { if (alive) setApiError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return (
    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading settings…
    </div>
  );

  // Graceful fallback so layout renders even when backend is unreachable
  const cfg      = settings ?? { vultrConfigured: false, paypalConfigured: false, markupPercent: 30 };
  const markup   = cfg.markupPercent ?? 30;
  const vultrOk  = cfg.vultrConfigured  ?? false;
  const paypalOk = cfg.paypalConfigured ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {apiError && (
        <div className="card" style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
          Backend unreachable — showing default configuration. ({apiError})
        </div>
      )}

      {/* ── Integration status cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: vultrOk ? 'var(--accent-soft)' : 'rgba(239,68,68,.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: vultrOk ? 'var(--accent)' : 'var(--danger)',
            }}>
              <ICN.Cpu size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>Provider API</span>
                <StatusBadge value={vultrOk ? 'connected' : 'error'} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {vultrOk
                  ? 'Connected. Regions, plans, and server provisioning are live.'
                  : 'Not configured. Set VULTR_API_KEY on your backend to enable server provisioning.'}
              </div>
              <div className="mono" style={{
                fontSize: 11, background: 'var(--bg-deep)', borderRadius: 6, padding: '6px 10px',
                color: 'var(--text-faint)', letterSpacing: '0.03em',
              }}>
                VULTR_API_KEY
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: paypalOk ? 'var(--accent-soft)' : 'rgba(239,68,68,.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: paypalOk ? 'var(--accent)' : 'var(--danger)',
            }}>
              <ICN.CreditCard size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>Payment gateway</span>
                <StatusBadge value={paypalOk ? 'connected' : 'error'} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {paypalOk
                  ? 'Connected. PayPal checkout is ready for customer payments.'
                  : 'Not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable payments.'}
              </div>
              <div className="mono" style={{
                fontSize: 11, background: 'var(--bg-deep)', borderRadius: 6, padding: '6px 10px',
                color: 'var(--text-faint)', letterSpacing: '0.03em',
              }}>
                PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent)',
            }}>
              <ICN.Settings size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700 }}>Sandbox mode</span>
                <StatusBadge value={cfg.sandbox !== false ? 'warn' : 'active'} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                {cfg.sandbox !== false
                  ? 'PayPal sandbox is active — no real charges. Set PAYPAL_SANDBOX=false in production.'
                  : 'Live mode — real PayPal charges. Ensure VULTR_API_KEY is your production key.'}
              </div>
              <div className="mono" style={{
                fontSize: 11, background: 'var(--bg-deep)', borderRadius: 6, padding: '6px 10px',
                color: 'var(--text-faint)', letterSpacing: '0.03em',
              }}>
                PAYPAL_SANDBOX=false
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reseller margin ── */}
      <div className="card">
        <div className="card-head">
          <h2>Reseller margin</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Set via <code className="mono" style={{ fontSize: 11 }}>PLATFORM_MARKUP_PERCENT</code> on your backend
          </span>
        </div>
        <div style={{ padding: '16px 16px 20px', display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 100 }}>
            <div style={{
              fontSize: 72, fontWeight: 800, lineHeight: 1,
              color: 'var(--accent)', fontFamily: 'var(--mono, monospace)',
            }}>
              {markup}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>on every order</div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Every customer order is charged at the Vultr base cost plus your {markup}% markup.
              The full margin goes directly to you — Glondia does not take a cut of the reseller margin.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {[5, 10, 20, 40, 80, 160].map((base) => {
                const yours  = base * (1 + markup / 100);
                const margin = yours - base;
                return (
                  <div key={base} style={{ background: 'var(--bg-deep)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      ${base} plan
                    </div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
                      ${yours.toFixed(2)}
                      <span style={{ color: 'var(--text-faint)', fontWeight: 400, fontSize: 10 }}>/mo</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3 }}>+${margin.toFixed(2)} margin</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Plan catalog with markup ── */}
      {plans.length > 0 ? (
        <div className="card card-flush">
          <div className="card-head">
            <h2>Your plan catalog</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Customer-facing prices — {markup}% markup applied to Vultr base cost
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plan ID</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'center' }}>vCPU</th>
                  <th style={{ textAlign: 'center' }}>RAM</th>
                  <th style={{ textAlign: 'center' }}>Storage</th>
                  <th style={{ textAlign: 'center' }}>Bandwidth</th>
                  <th style={{ textAlign: 'right' }}>Base cost</th>
                  <th style={{ textAlign: 'right' }}>Customer price</th>
                  <th style={{ textAlign: 'right' }}>Your margin</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const base   = p.monthly_cost ?? 0;
                  const yours  = base * (1 + markup / 100);
                  const margin = yours - base;
                  return (
                    <tr key={p.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{p.id}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.type}</td>
                      <td style={{ textAlign: 'center' }}>{p.vcpu_count}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {p.ram >= 1024 ? `${p.ram / 1024} GB` : `${p.ram} MB`}
                      </td>
                      <td style={{ textAlign: 'center' }}>{p.disk} GB</td>
                      <td style={{ textAlign: 'center' }}>
                        {p.bandwidth ? `${p.bandwidth} GB` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                        ${base.toFixed(2)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                        ${yours.toFixed(2)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)', fontSize: 13 }}>
                        +${margin.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : !apiError ? (
        <div className="card" style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Plan catalog will appear here once your Vultr API key is configured.
        </div>
      ) : null}

    </div>
  );
}

// ─── VPS Plans & pricing (service catalog) ────────────────────────────────────

function VpsPlans({ navigate }) {
  const [plans, setPlans]           = useState([]);
  const [settings, setSettings]     = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [typeFilter, setTypeFilter] = useState('vc2');

  useEffect(() => {
    let alive = true;
    Promise.all([listVultrPlans(), getVultrSettings()])
      .then(([p, s]) => {
        if (!alive) return;
        setPlans(p ?? []);
        setSettings(s);
      })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return (
    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading instance catalog…
    </div>
  );

  const markup   = settings?.markupPercent ?? 30;
  const filtered = plans.filter((p) => p.type === typeFilter);
  const typeMeta = PLAN_TYPES.find((t) => t.id === typeFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {error && (
        <div className="card" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      {!settings?.vultrConfigured && !error && (
        <div className="card" style={{
          padding: '14px 18px', fontSize: 13,
          borderLeft: '3px solid var(--accent)', background: 'var(--accent-soft)',
        }}>
          <span style={{ fontWeight: 600 }}>Live catalog not available —</span>
          {' '}add <code className="mono">VULTR_API_KEY</code> to your backend environment to load real instance types and pricing.
        </div>
      )}

      {/* ── Plan type selector ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        {PLAN_TYPES.map((pt) => {
          const Icon  = ICN[pt.icon];
          const sel   = typeFilter === pt.id;
          const count = plans.filter((p) => p.type === pt.id).length;
          return (
            <SelectCard key={pt.id} selected={sel} onClick={() => setTypeFilter(pt.id)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: sel ? 'var(--accent)' : 'var(--bg-deep)',
                  color: sel ? '#fff' : 'var(--text-muted)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={17} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{pt.name}</span>
                    {pt.badge && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                        background: 'var(--accent)', color: '#fff' }}>{pt.badge}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 4 }}>
                    {pt.tagline}
                  </div>
                  {count > 0 && (
                    <div style={{ fontSize: 11, color: sel ? 'var(--accent)' : 'var(--text-faint)', fontWeight: 600 }}>
                      {count} sizes available
                    </div>
                  )}
                </div>
              </div>
            </SelectCard>
          );
        })}
      </div>

      {/* ── Instance table ── */}
      <div className="card card-flush">
        <div className="card-head">
          <div>
            <h2 style={{ margin: 0 }}>{typeMeta?.name ?? typeFilter}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{typeMeta?.tagline}</div>
          </div>
          {filtered.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {filtered.length} configurations · {markup}% platform fee included
            </span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {settings?.vultrConfigured
              ? 'No configurations for this plan type.'
              : 'Configure VULTR_API_KEY on your backend to load the live instance catalog.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Instance</th>
                  <th style={{ textAlign: 'center' }}>vCPU</th>
                  <th style={{ textAlign: 'center' }}>RAM</th>
                  <th style={{ textAlign: 'center' }}>SSD</th>
                  <th style={{ textAlign: 'center' }}>Transfer</th>
                  <th style={{ textAlign: 'right' }}>Monthly</th>
                  <th style={{ textAlign: 'right' }}>Hourly</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const base   = p.monthly_cost ?? 0;
                  const price  = base * (1 + markup / 100);
                  const hourly = price / 730;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {p.vcpu_count} {p.vcpu_count === 1 ? 'vCPU' : 'vCPUs'} · {p.ram >= 1024 ? p.ram / 1024 + ' GB' : p.ram + ' MB'} RAM
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {p.id}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{p.vcpu_count}</td>
                      <td style={{ textAlign: 'center' }}>
                        {p.ram >= 1024 ? `${p.ram / 1024} GB` : `${p.ram} MB`}
                      </td>
                      <td style={{ textAlign: 'center' }}>{p.disk} GB</td>
                      <td style={{ textAlign: 'center' }}>
                        {p.bandwidth ? `${p.bandwidth} GB` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>${price.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>/month</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>${hourly.toFixed(4)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>/hour</div>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 16 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => navigate({ view: 'vps-create', params: { plan: p.id, planType: p.type } })}
                        >
                          Deploy →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
