// TemplateGallery.jsx — Template picker: storefront cards + HTML template cards.
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { GD, TEMPLATES_REPO } from '../../../data';
import { Empty } from '../../../components';
import { useTemplates } from '../../../use-templates';
import { STOREFRONT_TEMPLATES, StorefrontPreview, StorefrontModal } from '../templates/storefront-templates';

// ─────────────────────────────────────────────────────────────────────────────
// TplThumb — abstract geometric preview for non-HTML templates.
// ─────────────────────────────────────────────────────────────────────────────

function TplThumb({ tpl }) {
  const { accent, surface, motif } = tpl;
  const isDark = surface.startsWith('#0') || surface.startsWith('#1') && parseInt(surface.slice(1), 16) < 0x333333;
  const overlay = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const bar = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const Nav = () => (
    <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 22, height: 22, borderRadius: 4, background: accent, opacity: 0.9 }} />
      <div style={{ flex: 1 }} />
      {[32, 26, 22].map((w, i) => <div key={i} style={{ width: w, height: 7, borderRadius: 99, background: bar }} />)}
    </div>
  );
  const Lines = ({ count = 3, widths = [] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: widths[i] || (i === count - 1 ? '60%' : '90%') }} />
      ))}
    </div>
  );
  const Pill = ({ label, small }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', padding: small ? '3px 8px' : '5px 12px', background: accent, color: '#fff', borderRadius: 99, fontSize: small ? 8 : 9, fontWeight: 600, letterSpacing: '0.04em' }}>
      {label}
    </div>
  );

  if (motif === 'html-dark') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, display: 'flex', flexDirection: 'column', padding: 14 }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ height: 3, background: accent, borderRadius: 99, width: '100%' }} />
          <div style={{ height: 22, borderRadius: 3, background: `${accent}22`, marginBottom: 4 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 36, borderRadius: 4, background: overlay, border: `1px solid ${accent}33`, display: 'flex', alignItems: 'flex-end', padding: 4 }}>
                <div style={{ height: 4, width: '70%', borderRadius: 99, background: `${accent}66` }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {['/', '/shop', '/about', '/contact', '+1'].map((pg, i) => (
              <div key={i} style={{ padding: '2px 7px', background: i === 0 ? accent : overlay, borderRadius: 99, fontSize: 7, color: i === 0 ? surface : `${accent}99`, fontWeight: 600, letterSpacing: '0.04em' }}>
                {pg}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (motif === 'monogram') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, display: 'flex', flexDirection: 'column', padding: 14 }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 72, color: accent, opacity: 0.85, lineHeight: 1 }}>G</div>
        </div>
        <Lines count={2} widths={['70%', '45%']} />
      </div>
    );
  }
  if (motif === 'stripes') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <Nav />
        <div style={{ height: 5, background: accent, width: '100%', marginBottom: 12 }} />
        <div style={{ height: 28, borderRadius: 3, background: overlay, marginBottom: 10 }} />
        {[1,2,3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <div style={{ height: 7, borderRadius: 99, background: bar, flex: 1 }} />
          </div>
        ))}
        <div style={{ marginTop: 'auto' }}><Pill label="Request a quote" small /></div>
      </div>
    );
  }
  if (motif === 'menu') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[80, 65, 75, 55].map((w, i) => <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: `${w}%` }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[70, 80, 60, 72].map((w, i) => <div key={i} style={{ height: 7, borderRadius: 99, background: bar, width: `${w}%` }} />)}
          </div>
        </div>
        <div style={{ height: 1, background: overlay, margin: '10px 0' }} />
        <Pill label="Reserve a table" small />
      </div>
    );
  }
  if (motif === 'grid') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 10 }}>
        <Nav />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: '1fr 1.3fr', gap: 5, height: 'calc(100% - 50px)' }}>
          {[0.55,0.45,0.65,0.7,0.5,0.6].map((op, i) => (
            <div key={i} style={{ background: accent, borderRadius: 3, opacity: op }} />
          ))}
        </div>
      </div>
    );
  }
  if (motif === 'blocks') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: '1 / -1', height: 36, borderRadius: 4, background: `${accent}22` }} />
          {[1,2,3,4].map(i => <div key={i} style={{ borderRadius: 4, background: overlay, minHeight: 24 }} />)}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <div style={{ width: 44, height: 8, borderRadius: 99, background: accent }} />
          <div style={{ width: 44, height: 8, borderRadius: 99, background: bar }} />
        </div>
      </div>
    );
  }
  if (motif === 'lines') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Nav />
        {[1,2].map(i => (
          <div key={i} style={{ paddingBottom: 10, borderBottom: `1px solid ${overlay}` }}>
            <div style={{ height: 8, borderRadius: 99, background: accent, opacity: 0.7, width: '80%', marginBottom: 6 }} />
            <Lines count={2} widths={['95%', '65%']} />
          </div>
        ))}
        <Lines count={2} widths={['85%', '55%']} />
      </div>
    );
  }
  if (motif === 'gradient') {
    return (
      <div style={{ width: '100%', height: '100%', background: `linear-gradient(150deg, ${surface} 0%, ${surface}cc 100%)`, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ height: 12, borderRadius: 99, background: accent, opacity: 0.8, width: '70%' }} />
          <Lines count={2} widths={['90%', '60%']} />
          <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
            <Pill label="Start free" small />
            <div style={{ height: 22, width: 56, borderRadius: 99, background: bar }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, height: 30 }}>
          {[1,2,3].map(i => <div key={i} style={{ borderRadius: 3, background: overlay }} />)}
        </div>
      </div>
    );
  }
  if (motif === 'spotlight') {
    return (
      <div style={{ width: '100%', height: '100%', background: `radial-gradient(ellipse 70% 60% at 50% 30%, ${accent}55 0%, ${surface} 70%)`, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Nav />
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${accent}33`, border: `2px solid ${accent}66`, margin: '0 auto 8px' }} />
          <div style={{ height: 10, borderRadius: 99, background: isDark ? 'rgba(255,255,255,0.2)' : overlay, width: '60%', margin: '0 auto 4px' }} />
          <div style={{ height: 7, borderRadius: 99, background: bar, width: '40%', margin: '0 auto' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
          {[1,2,3].map(i => <div key={i} style={{ height: 18, borderRadius: 3, background: overlay }} />)}
        </div>
      </div>
    );
  }
  if (motif === 'leaf') {
    return (
      <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
        <Nav />
        <div style={{ display: 'flex', gap: 10, flex: 1, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50% 0 50% 50%', background: accent, opacity: 0.8, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <Lines count={3} widths={['90%', '75%', '55%']} />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 28, borderRadius: 4, background: `${accent}20`, marginBottom: 8 }} />
          <Pill label="Get involved" small />
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%', background: surface, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <div style={{ height: 32, borderRadius: 4, background: overlay, marginBottom: 10 }} />
      <Lines count={3} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TemplateCardPreview — scaled real iframe thumbnail for HTML templates.
// ─────────────────────────────────────────────────────────────────────────────

function TemplateCardPreview({ tpl }) {
  const pages = Array.isArray(tpl?.contentJson?.pages) ? tpl.contentJson.pages : [];
  const firstPage = pages[0];

  if (!firstPage?.html) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>
        <ICN.Image size={22} />
        <span style={{ fontSize: 11 }}>Preview unavailable</span>
      </div>
    );
  }

  return (
    <iframe
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      srcDoc={firstPage.html}
      style={{
        width: '900px',
        height: '600px',
        border: 'none',
        transform: 'scale(0.245)',
        transformOrigin: 'top left',
        pointerEvents: 'none',
        display: 'block',
      }}
      title={`${tpl.name} preview`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TemplatePreviewModal — full-screen overlay with real iframe preview.
// ─────────────────────────────────────────────────────────────────────────────

function TemplatePreviewModal({ template, onClose, onHost }) {
  const pages = Array.isArray(template?.contentJson?.pages) ? template.contentJson.pages : [];
  const [activePage, setActivePage] = useStateB(pages[0] || null);

  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="tpl-preview-modal-backdrop" onClick={onClose}>
      <div className="tpl-preview-modal-header" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-icon btn-ghost" onClick={onClose} title="Close (Esc)">
          <ICN.X size={16} />
        </button>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{template.name}</div>
        {template.tagline && (
          <div className="muted" style={{ fontSize: 13 }}>{template.tagline}</div>
        )}
        {pages.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginLeft: 16 }}>
            {pages.map((page, i) => (
              <button
                key={i}
                className={`btn btn-sm ${activePage === page ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActivePage(page)}
              >
                {page.title || `Page ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => onHost(template)}>
          <ICN.Sparkles size={14} /> Use AI to customize
        </button>
      </div>
      <div className="tpl-preview-modal-body" onClick={(e) => e.stopPropagation()}>
        <iframe
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          srcDoc={activePage?.html || '<!doctype html><html><body></body></html>'}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title={`${template.name} full preview`}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BuilderTemplates — public export
// ─────────────────────────────────────────────────────────────────────────────

export function BuilderTemplates({ navigate }) {
  const { templates, loading, source, error } = useTemplates();
  const [cat, setCat] = useStateB("All");
  const [sfCat, setSfCat] = useStateB("All");
  const [previewTpl, setPreviewTpl] = useStateB(null);
  const [genPreviewTpl, setGenPreviewTpl] = useStateB(null);

  const sfCats = ["All", ...Array.from(new Set(STOREFRONT_TEMPLATES.map(t => t.category)))];
  const sfFiltered = sfCat === "All" ? STOREFRONT_TEMPLATES : STOREFRONT_TEMPLATES.filter(t => t.category === sfCat);

  const htmlTemplates = templates.filter(t => t.contentJson?._source === 'html-template');
  const cats = ["All", ...Array.from(new Set(htmlTemplates.map(t => t.category)))];
  const filtered = cat === "All" ? htmlTemplates : htmlTemplates.filter(t => t.category === cat);

  const handleHostTemplate = (t) => {
    setPreviewTpl(null);
    setGenPreviewTpl(null);
    navigate({
      view:   'builder-ai-intake',
      params: { templateId: t.id, templateType: t.contentJson?._source === 'html-template' ? 'html' : 'storefront' },
    });
  };

  const handleUseStorefront = handleHostTemplate;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Site builder</div>
          <h1>Pick a template</h1>
          <p className="sub">
            Start with a live e-commerce design or a general-purpose starter. Fill in your content and publish to your domain in minutes.
          </p>
        </div>
      </div>

      {/* ── Storefront templates ─────────────────────────────────────────────── */}
      <div>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Storefront templates</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              9 full e-commerce designs — hover to see the live page preview.
            </p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {sfCats.map(c => (
              <button key={c} onClick={() => setSfCat(c)} className="btn btn-sm"
                style={{
                  border: `1px solid ${sfCat === c ? "var(--accent)" : "var(--border)"}`,
                  background: sfCat === c ? "var(--accent-soft)" : "var(--bg-elev)",
                  color: sfCat === c ? "var(--accent-ink)" : "var(--text)",
                  fontWeight: 500,
                }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="sf-tpl-grid">
          {sfFiltered.map(t => (
            <div className="sf-tpl-card" key={t.id}>
              <div className="sf-tpl-thumb">
                <StorefrontPreview Comp={t.Comp} />
                <div className="sf-tpl-overlay">
                  <button className="btn btn-primary" onClick={() => setPreviewTpl(t)}>
                    <ICN.Eye size={14} /> Full preview
                  </button>
                  <button className="btn btn-outline"
                    style={{ background: "rgba(255,255,255,.92)", color: "var(--text)" }}
                    onClick={() => setPreviewTpl(t)}>
                    View template
                  </button>
                </div>
                {t.badge && (
                  <span style={{
                    position: "absolute", top: 10, left: 10, zIndex: 2,
                    background: t.featured ? "var(--accent)" : "var(--bg-elev)",
                    color: t.featured ? "#fff" : "var(--text)",
                    border: t.featured ? "none" : "1px solid var(--border)",
                    borderRadius: 999, padding: "3px 9px",
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                  }}>
                    {t.badge}
                  </span>
                )}
              </div>
              <div className="sf-tpl-body">
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t.tag}</div>
                  </div>
                  <span className="faint" style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                    textTransform: "uppercase", marginTop: 2,
                  }}>{t.category}</span>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }}
                    onClick={() => setPreviewTpl(t)}>
                    <ICN.Eye size={12} /> Preview {t.name}
                  </button>
                  <button className="btn btn-sm btn-outline" title="Full preview"
                    onClick={() => setPreviewTpl(t)}>
                    <ICN.Eye size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HTML templates ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 48 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>HTML templates</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Multi-page HTML sites — AI-ready and fully tailored to your brand before you go live.
            </p>
          </div>
          {cats.length > 2 && (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCat(c)} className="btn btn-sm"
                  style={{
                    border: `1px solid ${cat === c ? "var(--accent)" : "var(--border)"}`,
                    background: cat === c ? "var(--accent-soft)" : "var(--bg-elev)",
                    color: cat === c ? "var(--accent-ink)" : "var(--text)",
                    fontWeight: 500,
                  }}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="tpl-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="tpl-card" style={{ opacity: 0.5 }}>
                <div className="tpl-thumb" style={{ background: "var(--bg-deep)" }} />
                <div className="tpl-body">
                  <div style={{ height: 16, background: "var(--bg-deep)", borderRadius: 4, width: "60%", marginBottom: 8 }} />
                  <div style={{ height: 12, background: "var(--bg-deep)", borderRadius: 4, width: "90%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="card" style={{ padding: "48px 24px" }}>
            <Empty icon="Layers" title="No templates yet"
              body="Templates will appear here once they are added to the backend."
              action={TEMPLATES_REPO
                ? <a href={TEMPLATES_REPO} target="_blank" rel="noopener noreferrer" className="btn btn-outline"><ICN.Git size={14} /> View template repo</a>
                : null} />
          </div>
        ) : (
          <div className="tpl-grid">
            {filtered.map(t => (
              <div
                className="tpl-card tpl-card--clickable"
                key={t.id}
                onClick={() => setGenPreviewTpl(t)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setGenPreviewTpl(t)}
              >
                <div className="tpl-thumb tpl-thumb--iframe">
                  <TemplateCardPreview tpl={t} />
                </div>
                <div className="tpl-body">
                  <div className="row between">
                    <h4>{t.name}</h4>
                    <span className="faint" style={{ fontSize: 11 }}>{t.category}</span>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t.tagline}</p>
                  <div className="tag-row">
                    <span className="ttag" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', border: '1px solid var(--accent)' }}>HTML</span>
                    {Array.isArray(t.contentJson?.pages) && (
                      <span className="ttag">{t.contentJson.pages.length} {t.contentJson.pages.length === 1 ? 'page' : 'pages'}</span>
                    )}
                    <span className="ttag">AI ready</span>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ flex: 1 }}
                      onClick={(e) => { e.stopPropagation(); setGenPreviewTpl(t); }}
                    >
                      <ICN.Eye size={12} /> Preview {t.name}
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      title="Preview template"
                      onClick={(e) => { e.stopPropagation(); setGenPreviewTpl(t); }}
                    >
                      <ICN.Eye size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewTpl && (
        <StorefrontModal
          template={previewTpl}
          onClose={() => setPreviewTpl(null)}
          onUse={handleUseStorefront}
        />
      )}

      {genPreviewTpl && (
        <TemplatePreviewModal
          template={genPreviewTpl}
          onClose={() => setGenPreviewTpl(null)}
          onHost={handleHostTemplate}
        />
      )}
    </>
  );
}
