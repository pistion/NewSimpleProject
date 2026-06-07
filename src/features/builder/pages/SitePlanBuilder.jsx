// SitePlanBuilder.jsx — Hybrid Site Plan Builder
// Ported from sitemap/wireframe builder source files into React.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import './SitePlanBuilder.css';
import { createSiteFromTailoredTemplate } from '../../../api/template-ai.js';
import {
  createTemplateSitePlan,
  getTemplateSitePlan,
  updateTemplateSitePlanPart,
  approveTemplateSitePlan,
} from '../../../api/template-ai.js';

// ─── uid ────────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// ─── suggestSitemapFromBrief ─────────────────────────────────────────────────
function suggestSitemapFromBrief(brief) {
  const industry = (brief.industry || '').toLowerCase();
  let pages;

  if (industry.includes('restaurant') || industry.includes('café') || industry.includes('cafe') || industry.includes('hospitality')) {
    pages = [
      { name: 'Home', path: '/', sections: [{ title: 'Hero', type: 'hero', description: 'Welcome banner with photo and booking CTA.' }, { title: 'Menu Highlights', type: 'services', description: 'Popular dishes and specials.' }, { title: 'Book a Table', type: 'cta', description: 'Reservation call-to-action.' }] },
      { name: 'Menu', path: '/menu', sections: [{ title: 'Full Menu', type: 'services', description: 'Complete food and drinks menu.' }] },
      { name: 'Gallery', path: '/gallery', sections: [{ title: 'Photo Gallery', type: 'gallery', description: 'Photos of the venue and food.' }] },
      { name: 'Contact', path: '/contact', sections: [{ title: 'Contact & Booking', type: 'form', description: 'Reservation form and contact details.' }] },
    ];
  } else if (industry.includes('construction') || industry.includes('builder') || industry.includes('trade')) {
    pages = [
      { name: 'Home', path: '/', sections: [{ title: 'Hero', type: 'hero', description: 'Bold headline, services summary, CTA.' }, { title: 'Services', type: 'services', description: 'Main trade services offered.' }, { title: 'Why Us', type: 'about', description: 'Experience, licenses, and results.' }] },
      { name: 'Services', path: '/services', sections: [{ title: 'Service Details', type: 'services', description: 'Detailed list of services.' }, { title: 'Process', type: 'process', description: 'How the job gets done step by step.' }] },
      { name: 'Projects', path: '/projects', sections: [{ title: 'Past Projects', type: 'gallery', description: 'Photos and descriptions of completed work.' }] },
      { name: 'Contact', path: '/contact', sections: [{ title: 'Quote Request', type: 'form', description: 'Get a free quote form.' }, { title: 'Contact Details', type: 'details', description: 'Phone, email, area served.' }] },
    ];
  } else if (industry.includes('consult') || industry.includes('professional') || industry.includes('law') || industry.includes('account')) {
    pages = [
      { name: 'Home', path: '/', sections: [{ title: 'Hero', type: 'hero', description: 'Credibility-first headline and CTA.' }, { title: 'Services', type: 'services', description: 'Core consulting services.' }, { title: 'Why Work With Us', type: 'about', description: 'Credentials, experience, outcomes.' }] },
      { name: 'Services', path: '/services', sections: [{ title: 'Service Packages', type: 'services', description: 'Detailed service offerings.' }, { title: 'Process', type: 'process', description: 'How we work with clients.' }] },
      { name: 'About', path: '/about', sections: [{ title: 'Our Team', type: 'about', description: 'Team bios and credentials.' }] },
      { name: 'Contact', path: '/contact', sections: [{ title: 'Get In Touch', type: 'form', description: 'Contact and enquiry form.' }, { title: 'Office Details', type: 'details', description: 'Address, phone, email.' }] },
    ];
  } else {
    pages = [
      { name: 'Home', path: '/', sections: [{ title: 'Hero', type: 'hero', description: 'Main headline, value statement, CTA.' }, { title: 'Services', type: 'services', description: 'Overview of main services or products.' }, { title: 'Why Choose Us', type: 'about', description: 'Trust points and key benefits.' }, { title: 'Call To Action', type: 'cta', description: 'Encourage visitors to get in touch.' }] },
      { name: 'Services', path: '/services', sections: [{ title: 'Service List', type: 'services', description: 'Detailed service cards.' }, { title: 'Process', type: 'process', description: 'Step-by-step how you work.' }] },
      { name: 'About', path: '/about', sections: [{ title: 'Our Story', type: 'about', description: 'Background, mission, and team.' }] },
      { name: 'Contact', path: '/contact', sections: [{ title: 'Contact Form', type: 'form', description: 'Name, email, phone, message.' }, { title: 'Business Details', type: 'details', description: 'Address, email, opening hours.' }] },
    ];
  }

  return pages.map(p => ({ ...p, id: uid(), sections: p.sections.map(s => ({ ...s, id: uid() })) }));
}

// ─── Style presets ───────────────────────────────────────────────────────────
const STYLE_PRESETS = [
  { id: 'clean', label: 'Clean Pro', colors: { background: '#ffffff', surface: '#f8fafc', text: '#0f172a', muted: '#64748b', accent: '#198754', line: '#e2e8f0' }, headingFont: 'Hanken Grotesk', bodyFont: 'Hanken Grotesk', radius: 12, space: 1 },
  { id: 'swiss', label: 'Swiss Mono', colors: { background: '#fafafa', surface: '#f0f0f0', text: '#111111', muted: '#666666', accent: '#1a1a1a', line: '#e0e0e0' }, headingFont: 'Space Grotesk', bodyFont: 'Space Grotesk', radius: 0, space: 1.2 },
  { id: 'editorial', label: 'Editorial', colors: { background: '#fffdf7', surface: '#fdf8ed', text: '#1a1209', muted: '#8a7a5a', accent: '#c0392b', line: '#e8dfc8' }, headingFont: 'DM Serif Display', bodyFont: 'Lora', radius: 4, space: 1.1 },
  { id: 'dark', label: 'Premium Dark', colors: { background: '#0d0d0d', surface: '#1a1a1a', text: '#f0f0f0', muted: '#888888', accent: '#7c6af7', line: '#2a2a2a' }, headingFont: 'Sora', bodyFont: 'Hanken Grotesk', radius: 16, space: 1 },
  { id: 'warm', label: 'Warm Local', colors: { background: '#fef9f3', surface: '#fdf0e0', text: '#2d1a0e', muted: '#9a7a5e', accent: '#c96a1a', line: '#ead4b4' }, headingFont: 'DM Serif Display', bodyFont: 'Hanken Grotesk', radius: 8, space: 1 },
  { id: 'mint', label: 'Tech Mint', colors: { background: '#f0faf5', surface: '#e0f5ea', text: '#0a2018', muted: '#5a8a70', accent: '#0ea85a', line: '#b4e4cc' }, headingFont: 'Space Grotesk', bodyFont: 'Hanken Grotesk', radius: 20, space: 1 },
];

const FONT_OPTIONS = ['Hanken Grotesk', 'Sora', 'Space Grotesk', 'DM Serif Display', 'Lora'];

const SECTION_TYPES = ['hero', 'services', 'about', 'cta', 'gallery', 'form', 'details', 'process', 'faq', 'pricing', 'team', 'features'];

const TABS = [
  { key: 'brief', label: 'Client Brief', num: 1 },
  { key: 'sitemap', label: 'Sitemap', num: 2 },
  { key: 'wireframe', label: 'Wireframe', num: 3 },
  { key: 'style', label: 'Style', num: 4 },
  { key: 'review', label: 'Review', num: 5 },
];

// ─── Wireframe section renderer ───────────────────────────────────────────────
function getSectionType(type = '') {
  const t = type.toLowerCase();
  if (t === 'hero') return 'hero';
  if (['services', 'features', 'cards', 'pricing', 'team'].includes(t)) return 'cards';
  if (t === 'gallery') return 'gallery';
  if (['form', 'contact', 'enquiry', 'enquir'].some(k => t.includes(k))) return 'form';
  if (t === 'faq') return 'faq';
  if (t === 'cta') return 'cta';
  return 'split';
}

function WireSection({ section }) {
  const kind = getSectionType(section.type);

  if (kind === 'hero') {
    return (
      <div className="spb-wire-section spb-wire-hero">
        <div className="spb-mock-label">{section.title}</div>
        <div className="spb-wire-hero-inner">
          <div className="spb-mock-text-block">
            <div className="spb-mock-h" />
            <div className="spb-mock-p" />
            <div className="spb-mock-p spb-mock-p--short" />
            <div className="spb-mock-btn" />
          </div>
          <div className="spb-mock-img-block" />
        </div>
      </div>
    );
  }

  if (kind === 'cards') {
    return (
      <div className="spb-wire-section spb-wire-cards">
        <div className="spb-mock-label">{section.title}</div>
        <div className="spb-wire-cards-inner">
          {[0, 1, 2].map(i => (
            <div key={i} className="spb-mock-card">
              <div className="spb-mock-icon-sq" />
              <div className="spb-mock-h spb-mock-h--sm" />
              <div className="spb-mock-p" />
              <div className="spb-mock-p spb-mock-p--short" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'gallery') {
    return (
      <div className="spb-wire-section spb-wire-gallery">
        <div className="spb-mock-label">{section.title}</div>
        <div className="spb-wire-gallery-inner">
          {[0, 1, 2].map(i => <div key={i} className="spb-mock-gallery-item" />)}
        </div>
      </div>
    );
  }

  if (kind === 'form') {
    return (
      <div className="spb-wire-section spb-wire-form">
        <div className="spb-mock-label">{section.title}</div>
        <div className="spb-wire-form-inner">
          <div className="spb-mock-form-row" />
          <div className="spb-mock-form-row" />
          <div className="spb-mock-form-row spb-mock-form-row--tall" />
          <div className="spb-mock-btn" />
        </div>
      </div>
    );
  }

  if (kind === 'faq') {
    return (
      <div className="spb-wire-section spb-wire-faq">
        <div className="spb-mock-label">{section.title}</div>
        {[0, 1, 2].map(i => (
          <div key={i} className="spb-mock-faq-row">
            <div className="spb-mock-h spb-mock-h--sm" />
            <div className="spb-mock-faq-arrow" />
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'cta') {
    return (
      <div className="spb-wire-section spb-wire-cta">
        <div className="spb-mock-label">{section.title}</div>
        <div className="spb-wire-cta-inner">
          <div className="spb-mock-h" />
          <div className="spb-mock-p spb-mock-p--short" style={{ margin: '0 auto' }} />
          <div className="spb-mock-btn" style={{ margin: '10px auto 0' }} />
        </div>
      </div>
    );
  }

  // split / about / process / details
  return (
    <div className="spb-wire-section spb-wire-split">
      <div className="spb-mock-label">{section.title}</div>
      <div className="spb-wire-split-inner">
        <div className="spb-mock-img-block spb-mock-img-block--sm" />
        <div className="spb-mock-text-block">
          <div className="spb-mock-h spb-mock-h--sm" />
          <div className="spb-mock-p" />
          <div className="spb-mock-p" />
          <div className="spb-mock-p spb-mock-p--short" />
          {section.description && <div className="spb-mock-desc">{section.description}</div>}
        </div>
      </div>
    </div>
  );
}

function WirePage({ page }) {
  return (
    <div className="spb-wireframe-page">
      <div className="spb-wire-browser-chrome">
        <span className="spb-wire-dot" />
        <span className="spb-wire-dot" />
        <span className="spb-wire-dot" />
        <span className="spb-wire-page-label">{page.name}</span>
        <span className="spb-wire-path">{page.path}</span>
      </div>
      <div className="spb-wire-nav" />
      {(page.sections || []).map(s => <WireSection key={s.id} section={s} />)}
      <div className="spb-wire-footer" />
    </div>
  );
}

// ─── Style preview ────────────────────────────────────────────────────────────
function StylePreview({ style }) {
  const c = style.colors || {};
  const previewStyle = {
    '--prev-bg': c.background || '#fff',
    '--prev-surf': c.surface || '#f8fafc',
    '--prev-text': c.text || '#0f172a',
    '--prev-muted': c.muted || '#64748b',
    '--prev-accent': c.accent || '#198754',
    '--prev-line': c.line || '#e2e8f0',
    '--prev-radius': `${style.radius ?? 12}px`,
    fontFamily: style.bodyFont ? `'${style.bodyFont}', sans-serif` : 'sans-serif',
  };

  return (
    <div className="spb-preview-frame" style={previewStyle}>
      <div className="spb-prev-nav">
        <span className="spb-prev-logo" style={{ fontFamily: style.headingFont ? `'${style.headingFont}', serif` : 'serif' }}>Brand</span>
        <div className="spb-prev-nav-links">
          {['Home', 'Services', 'About', 'Contact'].map(l => <span key={l} className="spb-prev-nav-link">{l}</span>)}
        </div>
        <div className="spb-prev-btn spb-prev-btn--accent">Get started</div>
      </div>
      <div className="spb-prev-hero">
        <div className="spb-prev-hero-text">
          <div className="spb-prev-h1" style={{ fontFamily: style.headingFont ? `'${style.headingFont}', serif` : 'serif' }}>Your headline here</div>
          <div className="spb-prev-sub">A short description of what you do and who you serve.</div>
          <div className="spb-prev-btn spb-prev-btn--accent" style={{ display: 'inline-block', marginTop: 10 }}>Get in touch</div>
        </div>
        <div className="spb-prev-hero-img" />
      </div>
      <div className="spb-prev-cards">
        {['Service A', 'Service B', 'Service C'].map(n => (
          <div key={n} className="spb-prev-card">
            <div className="spb-prev-card-icon" />
            <div className="spb-prev-card-title" style={{ fontFamily: style.headingFont ? `'${style.headingFont}', serif` : 'serif' }}>{n}</div>
            <div className="spb-prev-card-body">Short description of this service for your visitors.</div>
          </div>
        ))}
      </div>
      <div className="spb-prev-chips">
        {['design', 'web', 'local'].map(t => <span key={t} className="spb-prev-chip">{t}</span>)}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="spb-toast-wrap">
      <div className="spb-toast">{message}</div>
    </div>
  );
}

// ─── Section Edit Modal ───────────────────────────────────────────────────────
function SectionEditModal({ section, onSave, onClose }) {
  const [local, setLocal] = useState({ ...section });

  return (
    <div className="spb-modal-backdrop" onClick={onClose}>
      <div className="spb-modal" onClick={e => e.stopPropagation()}>
        <div className="spb-modal-header">
          <div className="spb-modal-title">Edit Section</div>
          <button className="spb-btn spb-btn--ghost spb-btn--icon" onClick={onClose}>✕</button>
        </div>
        <div className="spb-modal-body">
          <label className="spb-field-label">Title</label>
          <input className="spb-input" value={local.title} onChange={e => setLocal(p => ({ ...p, title: e.target.value }))} />
          <label className="spb-field-label" style={{ marginTop: 12 }}>Section type</label>
          <select className="spb-input" value={local.type} onChange={e => setLocal(p => ({ ...p, type: e.target.value }))}>
            {SECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="spb-field-label" style={{ marginTop: 12 }}>Description / content notes</label>
          <textarea className="spb-input spb-textarea" rows={4} value={local.description} onChange={e => setLocal(p => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="spb-modal-footer">
          <button className="spb-btn spb-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="spb-btn spb-btn--primary" onClick={() => { onSave(local); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BuilderSitePlan({ templateId, templateType, navigate }) {
  const [activeTab, setActiveTab] = useState('brief');
  const [toast, setToast] = useState(null);
  const [editingSection, setEditingSection] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [planId, setPlanId] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  const [sitePlan, setSitePlan] = useState(() => ({
    source: 'hybrid-site-plan',
    templateId,
    templateType,
    status: 'draft',
    brief: {
      businessName: '', industry: '', targetAudience: '', offer: '',
      brandTone: '', colors: '', stylePreferences: '', pages: '', contact: '',
      domainPreference: '', notes: '',
    },
    sitemap: {
      name: 'New Website',
      pages: [
        {
          id: uid(), name: 'Home', path: '/', sections: [
            { id: uid(), title: 'Hero Section', type: 'hero', description: 'Introduce the business, value statement, and primary call to action.' },
            { id: uid(), title: 'Services Overview', type: 'services', description: 'Show the main services visitors can choose from.' },
            { id: uid(), title: 'Call To Action', type: 'cta', description: 'Encourage visitors to contact or get started.' },
          ],
        },
        {
          id: uid(), name: 'Contact', path: '/contact', sections: [
            { id: uid(), title: 'Contact Form', type: 'form', description: 'Collect name, email, phone, and message.' },
            { id: uid(), title: 'Business Details', type: 'details', description: 'Show email, phone, location, and opening hours.' },
          ],
        },
      ],
    },
    wireframe: null,
    style: {
      presetId: 'clean',
      colors: { background: '#ffffff', surface: '#ffffff', text: '#0f172a', muted: '#64748b', accent: '#198754', line: '#e6e8ee' },
      headingFont: 'Hanken Grotesk',
      bodyFont: 'Hanken Grotesk',
      radius: 12,
      space: 1,
    },
  }));

  // ── Brief helpers ────────────────────────────────────────────────────────
  const setBriefField = (field, value) => {
    setSitePlan(p => ({ ...p, brief: { ...p.brief, [field]: value } }));
  };

  const handleSuggestSitemap = () => {
    const suggested = suggestSitemapFromBrief(sitePlan.brief);
    setSitePlan(p => ({ ...p, sitemap: { ...p.sitemap, pages: suggested } }));
    setActiveTab('sitemap');
    showToast('Sitemap suggested based on your brief!');
  };

  // ── Sitemap helpers ──────────────────────────────────────────────────────
  const addPage = () => {
    setSitePlan(p => ({
      ...p,
      sitemap: {
        ...p.sitemap,
        pages: [...p.sitemap.pages, { id: uid(), name: 'New Page', path: '/new-page', sections: [] }],
      },
    }));
  };

  const deletePage = (pageId) => {
    setSitePlan(p => ({
      ...p,
      sitemap: { ...p.sitemap, pages: p.sitemap.pages.filter(pg => pg.id !== pageId) },
    }));
  };

  const updatePage = (pageId, field, value) => {
    setSitePlan(p => ({
      ...p,
      sitemap: {
        ...p.sitemap,
        pages: p.sitemap.pages.map(pg => pg.id === pageId ? { ...pg, [field]: value } : pg),
      },
    }));
  };

  const addSection = (pageId) => {
    setSitePlan(p => ({
      ...p,
      sitemap: {
        ...p.sitemap,
        pages: p.sitemap.pages.map(pg =>
          pg.id === pageId
            ? { ...pg, sections: [...pg.sections, { id: uid(), title: 'New Section', type: 'hero', description: '' }] }
            : pg
        ),
      },
    }));
  };

  const deleteSection = (pageId, sectionId) => {
    setSitePlan(p => ({
      ...p,
      sitemap: {
        ...p.sitemap,
        pages: p.sitemap.pages.map(pg =>
          pg.id === pageId ? { ...pg, sections: pg.sections.filter(s => s.id !== sectionId) } : pg
        ),
      },
    }));
  };

  const updateSection = (pageId, updated) => {
    setSitePlan(p => ({
      ...p,
      sitemap: {
        ...p.sitemap,
        pages: p.sitemap.pages.map(pg =>
          pg.id === pageId
            ? { ...pg, sections: pg.sections.map(s => s.id === updated.id ? updated : s) }
            : pg
        ),
      },
    }));
  };

  // ── Style helpers ────────────────────────────────────────────────────────
  const applyPreset = (presetId) => {
    const preset = STYLE_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setSitePlan(p => ({
      ...p,
      style: {
        presetId: preset.id,
        colors: { ...preset.colors },
        headingFont: preset.headingFont,
        bodyFont: preset.bodyFont,
        radius: preset.radius,
        space: preset.space,
      },
    }));
  };

  const setStyleColor = (key, value) => {
    setSitePlan(p => ({ ...p, style: { ...p.style, colors: { ...p.style.colors, [key]: value } } }));
  };

  const setStyleField = (field, value) => {
    setSitePlan(p => ({ ...p, style: { ...p.style, [field]: value } }));
  };

  // ── Save plan ────────────────────────────────────────────────────────────
  const handleSavePlan = async () => {
    try {
      if (planId) {
        await updateTemplateSitePlanPart(planId, 'brief', sitePlan.brief);
        await updateTemplateSitePlanPart(planId, 'sitemap', sitePlan.sitemap);
        await updateTemplateSitePlanPart(planId, 'style', sitePlan.style);
        showToast('Plan saved.');
      } else {
        const result = await createTemplateSitePlan(sitePlan);
        if (result?.data?.planId) setPlanId(result.data.planId);
        showToast('Plan created and saved.');
      }
    } catch {
      showToast('Could not save plan — continuing offline.');
    }
  };

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const answers = {
        source: 'hybrid-site-plan',
        ...sitePlan.brief,
        sitemap: sitePlan.sitemap,
        style: sitePlan.style,
      };
      const result = await createSiteFromTailoredTemplate(templateId, answers, []);
      const siteId = result?.siteId || result?.data?.siteId;
      navigate({ view: 'builder-deployment-settings', params: { siteId, templateId, templateType } });
    } catch (e) {
      showToast(e?.message || 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="site-plan-builder">
      {/* Topbar */}
      <div className="spb-topbar">
        <button className="spb-btn spb-btn--ghost spb-btn--sm" onClick={() => navigate({ view: 'builder-gallery' })}>
          ← Back
        </button>
        <div className="spb-topbar-name">
          {sitePlan.sitemap.name || 'New Website'} — Site Plan
        </div>
        <div className="spb-topbar-right">
          <button className="spb-btn spb-btn--outline spb-btn--sm" onClick={handleSavePlan}>
            Save Plan
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="spb-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`spb-tab ${activeTab === tab.key ? 'spb-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="spb-tab-num">{tab.num}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="spb-tab-content">
        {activeTab === 'brief' && (
          <BriefTab brief={sitePlan.brief} onChange={setBriefField} onSuggest={handleSuggestSitemap} />
        )}
        {activeTab === 'sitemap' && (
          <SitemapTab
            sitemap={sitePlan.sitemap}
            onNameChange={name => setSitePlan(p => ({ ...p, sitemap: { ...p.sitemap, name } }))}
            onAddPage={addPage}
            onDeletePage={deletePage}
            onUpdatePage={updatePage}
            onAddSection={addSection}
            onDeleteSection={deleteSection}
            onEditSection={(pageId, section) => setEditingSection({ pageId, section })}
          />
        )}
        {activeTab === 'wireframe' && (
          <WireframeTab pages={sitePlan.sitemap.pages} />
        )}
        {activeTab === 'style' && (
          <StyleTab style={sitePlan.style} onPreset={applyPreset} onColor={setStyleColor} onField={setStyleField} />
        )}
        {activeTab === 'review' && (
          <ReviewTab
            sitePlan={sitePlan}
            templateId={templateId}
            templateType={templateType}
            onGenerate={handleGenerate}
            generating={generating}
          />
        )}
      </div>

      {/* Section edit modal */}
      {editingSection && (
        <SectionEditModal
          section={editingSection.section}
          onSave={updated => updateSection(editingSection.pageId, updated)}
          onClose={() => setEditingSection(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ─── BriefTab ─────────────────────────────────────────────────────────────────
function BriefTab({ brief, onChange, onSuggest }) {
  return (
    <div className="spb-panel">
      <div className="spb-panel-head">
        <h2 className="spb-panel-title">Client Brief</h2>
        <p className="spb-panel-sub">Fill in as much as you know — the sitemap will be suggested from this.</p>
      </div>
      <div className="spb-brief-grid">
        <div className="spb-field">
          <label className="spb-field-label">Business name</label>
          <input className="spb-input" value={brief.businessName} onChange={e => onChange('businessName', e.target.value)} placeholder="e.g. Sunrise Plumbing" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Industry</label>
          <input className="spb-input" value={brief.industry} onChange={e => onChange('industry', e.target.value)} placeholder="e.g. Construction, Restaurant, Consulting" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Target audience</label>
          <input className="spb-input" value={brief.targetAudience} onChange={e => onChange('targetAudience', e.target.value)} placeholder="e.g. Local homeowners in Sydney" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Products / services offered</label>
          <input className="spb-input" value={brief.offer} onChange={e => onChange('offer', e.target.value)} placeholder="e.g. Plumbing repairs, hot water systems, installations" />
        </div>
        <div className="spb-field spb-field--full">
          <label className="spb-field-label">Brand tone</label>
          <textarea className="spb-input spb-textarea" rows={3} value={brief.brandTone} onChange={e => onChange('brandTone', e.target.value)} placeholder="e.g. Professional but friendly, trustworthy, down-to-earth" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Preferred colors</label>
          <input className="spb-input" value={brief.colors} onChange={e => onChange('colors', e.target.value)} placeholder="e.g. Navy blue and white, or earthy tones" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Style preferences</label>
          <input className="spb-input" value={brief.stylePreferences} onChange={e => onChange('stylePreferences', e.target.value)} placeholder="e.g. Clean and modern, warm and approachable" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Pages needed</label>
          <input className="spb-input" value={brief.pages} onChange={e => onChange('pages', e.target.value)} placeholder="e.g. Home, Services, About, Contact" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Contact details</label>
          <input className="spb-input" value={brief.contact} onChange={e => onChange('contact', e.target.value)} placeholder="e.g. Phone, email, address" />
        </div>
        <div className="spb-field">
          <label className="spb-field-label">Domain preference</label>
          <input className="spb-input" value={brief.domainPreference} onChange={e => onChange('domainPreference', e.target.value)} placeholder="e.g. sunriseplumbing.com.au" />
        </div>
        <div className="spb-field spb-field--full">
          <label className="spb-field-label">Extra notes</label>
          <textarea className="spb-input spb-textarea" rows={3} value={brief.notes} onChange={e => onChange('notes', e.target.value)} placeholder="Any other details, special requirements, or context for the site" />
        </div>
      </div>
      <div className="spb-brief-actions">
        <button className="spb-btn spb-btn--primary" onClick={onSuggest}>
          Suggest sitemap from brief →
        </button>
      </div>
    </div>
  );
}

// ─── SitemapTab ───────────────────────────────────────────────────────────────
function SitemapTab({ sitemap, onNameChange, onAddPage, onDeletePage, onUpdatePage, onAddSection, onDeleteSection, onEditSection }) {
  return (
    <div className="spb-panel">
      <div className="spb-panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="spb-panel-title" style={{ margin: 0 }}>Sitemap</h2>
          <input
            className="spb-input spb-site-name-input"
            value={sitemap.name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Site name"
          />
        </div>
        <p className="spb-panel-sub">Build out the page structure and sections for this site.</p>
      </div>

      <div className="spb-pages-grid">
        {sitemap.pages.map(page => (
          <div key={page.id} className="spb-page-card">
            <div className="spb-page-card-head">
              <div className="spb-page-fields">
                <input
                  className="spb-input spb-input--sm spb-page-name"
                  value={page.name}
                  onChange={e => onUpdatePage(page.id, 'name', e.target.value)}
                  placeholder="Page name"
                />
                <input
                  className="spb-input spb-input--sm spb-page-path"
                  value={page.path}
                  onChange={e => onUpdatePage(page.id, 'path', e.target.value)}
                  placeholder="/path"
                />
              </div>
              <button className="spb-btn spb-btn--ghost spb-btn--icon spb-delete-btn" onClick={() => onDeletePage(page.id)} title="Delete page">
                ✕
              </button>
            </div>

            <div className="spb-sections-list">
              {page.sections.map(section => (
                <div key={section.id} className="spb-section-card" onClick={() => onEditSection(page.id, section)}>
                  <div className="spb-section-card-inner">
                    <div className="spb-section-type-badge">{section.type}</div>
                    <div className="spb-section-title">{section.title}</div>
                    {section.description && <div className="spb-section-desc">{section.description}</div>}
                  </div>
                  <button
                    className="spb-btn spb-btn--ghost spb-btn--icon spb-delete-btn"
                    onClick={e => { e.stopPropagation(); onDeleteSection(page.id, section.id); }}
                    title="Delete section"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button className="spb-btn spb-btn--ghost spb-btn--sm spb-add-section-btn" onClick={() => onAddSection(page.id)}>
              + Add section
            </button>
          </div>
        ))}

        <div className="spb-page-card spb-page-card--add" onClick={onAddPage} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onAddPage()}>
          <div className="spb-add-page-inner">
            <div className="spb-add-page-icon">+</div>
            <div className="spb-add-page-label">Add page</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WireframeTab ─────────────────────────────────────────────────────────────
function WireframeTab({ pages }) {
  return (
    <div className="spb-panel spb-panel--wire">
      <div className="spb-panel-head">
        <h2 className="spb-panel-title">Wireframe</h2>
        <p className="spb-panel-sub">Auto-generated layout preview from your sitemap. Edit sections in the Sitemap tab to update this.</p>
      </div>
      <div className="spb-wireframe-canvas">
        {pages.length === 0 && (
          <div className="spb-wire-empty">No pages yet. Add pages in the Sitemap tab.</div>
        )}
        {pages.map(page => <WirePage key={page.id} page={page} />)}
      </div>
    </div>
  );
}

// ─── StyleTab ─────────────────────────────────────────────────────────────────
function StyleTab({ style, onPreset, onColor, onField }) {
  const COLOR_ROWS = [
    { key: 'background', label: 'Background' },
    { key: 'surface', label: 'Surface' },
    { key: 'text', label: 'Text' },
    { key: 'muted', label: 'Muted text' },
    { key: 'accent', label: 'Accent' },
    { key: 'line', label: 'Border / Line' },
  ];

  return (
    <div className="spb-panel">
      <div className="spb-panel-head">
        <h2 className="spb-panel-title">Style Direction</h2>
        <p className="spb-panel-sub">Choose a visual style preset, then fine-tune colors, fonts, and spacing.</p>
      </div>
      <div className="spb-style-body">
        <div className="spb-style-controls">
          {/* Presets */}
          <div className="spb-style-section">
            <div className="spb-style-section-label">Presets</div>
            <div className="spb-preset-grid">
              {STYLE_PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`spb-preset-btn ${style.presetId === p.id ? 'spb-preset-btn--active' : ''}`}
                  onClick={() => onPreset(p.id)}
                  style={{ '--preset-accent': p.colors.accent, '--preset-bg': p.colors.background }}
                >
                  <span className="spb-preset-swatch" style={{ background: p.colors.accent }} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="spb-style-section">
            <div className="spb-style-section-label">Colors</div>
            {COLOR_ROWS.map(row => (
              <div key={row.key} className="spb-color-row">
                <label className="spb-color-label">{row.label}</label>
                <input
                  type="color"
                  className="spb-color-picker"
                  value={style.colors?.[row.key] || '#ffffff'}
                  onChange={e => onColor(row.key, e.target.value)}
                />
                <input
                  className="spb-input spb-input--sm spb-color-hex"
                  value={style.colors?.[row.key] || '#ffffff'}
                  onChange={e => onColor(row.key, e.target.value)}
                  maxLength={7}
                />
              </div>
            ))}
          </div>

          {/* Fonts */}
          <div className="spb-style-section">
            <div className="spb-style-section-label">Fonts</div>
            <div className="spb-font-row">
              <label className="spb-color-label">Heading font</label>
              <div className="spb-font-seg">
                {FONT_OPTIONS.map(f => (
                  <button key={f} className={`spb-font-btn ${style.headingFont === f ? 'spb-font-btn--active' : ''}`} onClick={() => onField('headingFont', f)} style={{ fontFamily: `'${f}', serif` }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="spb-font-row" style={{ marginTop: 10 }}>
              <label className="spb-color-label">Body font</label>
              <div className="spb-font-seg">
                {FONT_OPTIONS.map(f => (
                  <button key={f} className={`spb-font-btn ${style.bodyFont === f ? 'spb-font-btn--active' : ''}`} onClick={() => onField('bodyFont', f)} style={{ fontFamily: `'${f}', sans-serif` }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Radius + Space */}
          <div className="spb-style-section">
            <div className="spb-style-section-label">Corner radius</div>
            <div className="spb-slider-row">
              <input type="range" min={0} max={24} value={style.radius ?? 12} onChange={e => onField('radius', Number(e.target.value))} className="spb-slider" />
              <span className="spb-slider-val">{style.radius ?? 12}px</span>
            </div>
          </div>
          <div className="spb-style-section">
            <div className="spb-style-section-label">Density</div>
            <div className="spb-slider-row">
              <input type="range" min={0.8} max={1.4} step={0.1} value={style.space ?? 1} onChange={e => onField('space', Number(e.target.value))} className="spb-slider" />
              <span className="spb-slider-val">
                {style.space <= 0.9 ? 'Compact' : style.space >= 1.3 ? 'Spacious' : 'Comfortable'}
              </span>
            </div>
          </div>
        </div>

        <div className="spb-style-preview">
          <div className="spb-style-preview-label">Live preview</div>
          <StylePreview style={style} />
        </div>
      </div>
    </div>
  );
}

// ─── ReviewTab ────────────────────────────────────────────────────────────────
function ReviewTab({ sitePlan, templateId, templateType, onGenerate, generating }) {
  const { brief, sitemap, style } = sitePlan;
  const totalSections = sitemap.pages.reduce((sum, p) => sum + (p.sections?.length || 0), 0);
  const preset = STYLE_PRESETS.find(p => p.id === style.presetId);

  return (
    <div className="spb-panel">
      <div className="spb-panel-head">
        <h2 className="spb-panel-title">Review & Generate</h2>
        <p className="spb-panel-sub">Review your plan before generating the site. Once generated, it will be handed to the Deploy Engine.</p>
      </div>

      <div className="spb-review-section">
        <div className="spb-review-label">Template</div>
        <div className="spb-review-value">{templateId || '—'} <span className="spb-review-tag">{templateType}</span></div>
      </div>

      <div className="spb-review-section">
        <div className="spb-review-label">Business profile</div>
        <div className="spb-review-rows">
          {brief.businessName && <div><strong>Business:</strong> {brief.businessName}</div>}
          {brief.industry && <div><strong>Industry:</strong> {brief.industry}</div>}
          {brief.targetAudience && <div><strong>Audience:</strong> {brief.targetAudience}</div>}
          {brief.offer && <div><strong>Services:</strong> {brief.offer}</div>}
          {brief.brandTone && <div><strong>Tone:</strong> {brief.brandTone}</div>}
          {brief.domainPreference && <div><strong>Domain:</strong> {brief.domainPreference}</div>}
          {!brief.businessName && !brief.industry && <span className="spb-review-empty">No brief filled in yet.</span>}
        </div>
      </div>

      <div className="spb-review-section">
        <div className="spb-review-label">Pages ({sitemap.pages.length}) — {totalSections} sections total</div>
        <div className="spb-review-rows">
          {sitemap.pages.map(page => (
            <div key={page.id} className="spb-review-page-row">
              <span className="spb-review-page-name">{page.name}</span>
              <span className="spb-review-page-path">{page.path}</span>
              <span className="spb-review-page-count">{page.sections.length} sections</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spb-review-section">
        <div className="spb-review-label">Style</div>
        <div className="spb-review-rows">
          <div><strong>Preset:</strong> {preset?.label || style.presetId}</div>
          <div><strong>Accent color:</strong> <span className="spb-review-color-swatch" style={{ background: style.colors?.accent }} /> {style.colors?.accent}</div>
          <div><strong>Heading font:</strong> {style.headingFont}</div>
          <div><strong>Body font:</strong> {style.bodyFont}</div>
          <div><strong>Corner radius:</strong> {style.radius}px</div>
        </div>
      </div>

      <div className="spb-review-section spb-review-section--note">
        <div className="spb-review-note-icon">ℹ</div>
        <div>
          This will prepare a generated source copy from the chosen template, applying your brief, sitemap, and style direction, then hand it to the Hosting Deploy Engine for GitHub + Render deployment.
        </div>
      </div>

      <div className="spb-review-generate">
        <button
          className="spb-btn spb-btn--primary spb-btn--lg"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate & Deploy →'}
        </button>
      </div>
    </div>
  );
}
