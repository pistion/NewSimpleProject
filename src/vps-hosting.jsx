import React, { useEffect, useRef, useState } from 'react';
import { ICN } from './icons';
import { Badge, Empty, StatusBadge } from './components';
import {
  captureVpsPayPalOrder,
  createVpsPayPalOrder,
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

const STEPS = ['Type', 'Region', 'Plan', 'OS', 'Configure', 'Review', 'Pay'];

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

// ─── VPS List ─────────────────────────────────────────────────────────────────

export function VpsHostingList({ navigate }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([listVpsServices(), getVultrSettings()])
      .then(([list]) => { if (alive) setServers(list ?? []); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Hosting</div>
          <h1>Cloud Servers</h1>
          <p className="sub">Provision and manage virtual servers — choose your region, resources, and OS.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => navigate({ view: 'vps-create' })}>
            <ICN.Plus size={14} /> New server
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '10px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
      )}

      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading servers…
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
                <th>Server</th>
                <th>Location</th>
                <th>Specs</th>
                <th>IP address</th>
                <th>Status</th>
                <th>Monthly</th>
                <th />
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
                  <td className="mono" style={{ fontWeight: 600 }}>
                    ${((s.totalPriceCents ?? 0) / 100).toFixed(2)}
                  </td>
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
  );
}

// ─── VPS Create Wizard ────────────────────────────────────────────────────────

export function VpsCreateWizard({ navigate }) {
  const [step, setStep]         = useState(0);
  const [regions, setRegions]   = useState([]);
  const [plans, setPlans]       = useState([]);
  const [osList, setOsList]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [quote, setQuote]       = useState(null);
  const [quoteLoading, setQL]   = useState(false);
  const [payLoading, setPL]     = useState(false);
  const [pendingOrder, setOrder]= useState(null);
  const pollRef = useRef(null);

  const [form, setForm] = useState({
    planType: '',
    region: '', plan: '', osId: null,
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

  useEffect(() => {
    let alive = true;
    Promise.all([listVultrRegions(), listVultrPlans(), listVultrOperatingSystems()])
      .then(([r, p, o]) => {
        if (!alive) return;
        setRegions(r ?? []);
        setPlans(p ?? []);
        setOsList(o ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Fetch quote when reaching review step
  useEffect(() => {
    if (step !== 5 || !form.region || !form.plan || !form.osId) return;
    setQL(true);
    getVpsQuote({ region: form.region, plan: form.plan, osId: form.osId })
      .then(setQuote)
      .catch((err) => setError(err.message))
      .finally(() => setQL(false));
  }, [step]);

  const handlePay = async () => {
    setError('');
    setPL(true);
    try {
      const order = await createVpsPayPalOrder({
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
      setOrder(order);
      if (order.approvalUrl) {
        window.open(order.approvalUrl, '_blank', 'width=600,height=700');
        pollRef.current = setInterval(async () => {
          try {
            const vps = await captureVpsPayPalOrder({
              orderId: order.orderId,
              provisionDetails: {
                region: form.region, plan: form.plan, osId: form.osId,
                label: form.label, hostname: form.hostname || form.label,
              },
            });
            clearInterval(pollRef.current);
            navigate({ view: 'vps-detail', params: { id: vps.id } });
          } catch { /* not captured yet */ }
        }, 3000);
        setStep(6);
      }
    } catch (err) {
      setError(err.message || 'Failed to create PayPal order.');
    } finally {
      setPL(false);
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

  if (loading) return (
    <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading server catalog…
    </div>
  );

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
          <p className="sub">Choose your plan type, region, OS, and options — then pay securely with PayPal.</p>
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
              {['Americas', 'Europe', 'Asia-Pacific', 'Africa', 'Other'].map((continent) => {
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
              <div style={{ overflowX: 'auto' }}>
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
              <h3 style={{ marginTop: 0, marginBottom: 20 }}>Review your order</h3>

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
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Monthly billing</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Server cost</span>
                    <span className="mono">{quote.breakdown?.vpsPrice}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12, color: 'var(--text-muted)' }}>
                    <span>Platform fee ({quote.markupPercent}%)</span>
                    <span className="mono">{quote.breakdown?.platformFee}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800,
                    fontSize: 16, borderTop: '1px solid var(--accent)', paddingTop: 12 }}>
                    <span>Total per month</span>
                    <span className="mono" style={{ color: 'var(--accent)' }}>{quote.breakdown?.total}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    First month charged upfront via PayPal. Recurring billing managed separately.
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Step 6: Paying ── */}
          {step === 6 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--accent-soft)', margin: '0 auto 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ICN.CreditCard size={28} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 style={{ marginTop: 0 }}>Complete payment in the PayPal window</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto 16px' }}>
                A PayPal window has opened. After you approve the payment, your server will start provisioning automatically — usually within 60 seconds.
              </p>
              {pendingOrder?.orderId && (
                <div className="mono faint" style={{ fontSize: 11 }}>Order: {pendingOrder.orderId}</div>
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
              <button className="btn btn-primary" style={{ minWidth: 160 }}
                disabled={payLoading || quoteLoading} onClick={handlePay}>
                {payLoading ? 'Creating order…' : `Pay with PayPal →`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── VPS Detail ───────────────────────────────────────────────────────────────

export function VpsDetail({ id, navigate }) {
  const [server, setServer]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState('');
  const [error, setError]     = useState('');
  const [confirm, setConfirm] = useState('');

  const load = () => {
    setLoading(true);
    getVpsService(id)
      .then(setServer)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const act = async (key, fn) => {
    setError(''); setBusy(key);
    try {
      await fn();
      if (key === 'destroy') { navigate({ view: 'vps-hosting' }); return; }
      load();
    } catch (err) {
      setError(err.message || `${key} failed.`);
    } finally { setBusy(''); setConfirm(''); }
  };

  if (loading) return (
    <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  );

  if (!server) return (
    <Empty icon="Server" title="Server not found"
      body={error || 'This server may have been destroyed.'}
      action={<button className="btn btn-outline" onClick={() => navigate({ view: 'vps-hosting' })}>← Back to servers</button>}
    />
  );

  const isActive  = server.status === 'active';
  const isStopped = ['stopped', 'halted'].includes(server.status);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Cloud Servers</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {server.label}
            <StatusBadge value={server.status} />
          </h1>
          <p className="sub">{server.hostname} · {server.region} · {server.plan}</p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => navigate({ view: 'vps-hosting' })}>← All servers</button>
          <button className="btn btn-outline" onClick={load} disabled={loading}>
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
                  <td><span className="mono">{server.mainIp || 'Pending…'}</span></td></tr>
                <tr><td className="label">Region</td><td>{server.region}</td></tr>
                <tr><td className="label">Plan</td><td className="mono">{server.plan}</td></tr>
                {server.vcpuCount && <tr><td className="label">vCPU</td><td>{server.vcpuCount} cores</td></tr>}
                {server.ramMb     && <tr><td className="label">RAM</td><td>{(server.ramMb / 1024).toFixed(0)} GB</td></tr>}
                {server.diskGb    && <tr><td className="label">Storage</td><td>{server.diskGb} GB SSD</td></tr>}
                <tr><td className="label">OS</td><td className="mono">ID {server.osId}</td></tr>
                <tr><td className="label">Created</td>
                  <td>{new Date(server.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>
              </tbody>
            </table>
          </div>

          {server.mainIp && server.mainIp !== 'Pending…' && (
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
                <span className="mono">${(server.monthlyCostCents / 100).toFixed(2)}/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Platform fee ({server.markupPercent}%)</span>
                <span className="mono">${(server.markupAmountCents / 100).toFixed(2)}/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700,
                borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 15 }}>
                <span>Total / month</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  ${(server.totalPriceCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Power controls</h2></div>
            <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-outline" disabled={!!busy || isActive}
                onClick={() => act('start', () => startVpsService(id))}>
                {busy === 'start' ? 'Starting…' : <><ICN.Play size={13} /> Power on</>}
              </button>
              <button className="btn btn-outline" disabled={!!busy || isStopped}
                onClick={() => act('halt', () => haltVpsService(id))}>
                {busy === 'halt' ? 'Halting…' : <><ICN.Square size={13} /> Power off</>}
              </button>
              <button className="btn btn-outline" disabled={!!busy}
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
                  disabled={!!busy} onClick={() => setConfirm('destroy')}>
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
