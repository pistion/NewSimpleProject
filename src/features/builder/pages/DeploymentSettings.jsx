// DeploymentSettings.jsx — Final step: name the site, configure hosting, deploy.
import React, { useState as useStateB } from 'react';
import { ICN } from '../../../icons';
import { useTemplates } from '../../../use-templates';
import {
  createBuilderSite,
  publishBuilderSite,
  createRenderDeployment,
  getStoredAuth,
} from '../../../api';
import { STOREFRONT_TEMPLATES } from '../templates/storefront-templates';
import { getTailoredTemplateSite, deployTailoredTemplate } from '../../../api/template-ai.js';

export function BuilderDeploymentSettings({ siteId, templateId, templateType, navigate }) {
  const { templates } = useTemplates();

  const htmlTpl = templates.find(t => t.id === templateId) || null;
  const sfTpl   = STOREFRONT_TEMPLATES.find(t => t.id === templateId) || null;
  const template = htmlTpl || sfTpl;

  const [siteName,     setSiteName]     = useStateB('');
  const [serviceType,  setServiceType]  = useStateB('static_site');
  const [plan,         setPlan]         = useStateB('starter');
  const [deploying,    setDeploying]    = useStateB(false);
  const [deployError,  setDeployError]  = useStateB(null);
  const [deployMsg,    setDeployMsg]    = useStateB(null);

  const [tailoredSite,    setTailoredSite]    = useStateB(null);
  const [previewPage,     setPreviewPage]     = useStateB(null);
  const [loadingPreview,  setLoadingPreview]  = useStateB(false);

  React.useEffect(() => {
    if (!siteId) return;
    setLoadingPreview(true);
    getTailoredTemplateSite(siteId)
      .then((site) => {
        setTailoredSite(site);
        if (site?.pages?.length > 0) setPreviewPage(site.pages[0]);
        if (site?.answers?.businessName && !siteName) {
          setSiteName(site.answers.businessName);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const siteSlug = siteName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'my-site';

  const handleDeploy = async () => {
    if (!siteName.trim()) { setDeployError('Please enter a site name.'); return; }
    const { accessToken } = getStoredAuth();
    if (!accessToken) { setDeployError('Sign in to deploy.'); return; }
    setDeploying(true); setDeployError(null);
    try {
      let deployment;
      if (siteId) {
        deployment = await deployTailoredTemplate(siteId, {
          siteName: siteName.trim(),
          serviceType,
          plan,
        });
      } else {
        const site = await createBuilderSite({ name: siteName.trim(), templateId: templateId || null });
        const published = await publishBuilderSite(site.id);
        deployment = await createRenderDeployment({
          siteId:          site.id,
          projectId:       published?.projectId || site.id,
          name:            siteName.trim(),
          slug:            siteSlug,
          serviceType,
          sourceReference: 'builder',
          environment:     'production',
        });
      }
      setDeployMsg('Deployment started! Your site will be live shortly.');
      if (deployment?.deploymentId) {
        navigate({ view: 'hosting-detail', params: { id: deployment.deploymentId } });
      }
    } catch (err) {
      setDeployError(err.message || 'Deployment failed. Please try again.');
    } finally {
      setDeploying(false);
    }
  };

  const tailoredPages = tailoredSite?.pages || [];

  return (
    <>
      <div className="page-head">
        <div>
          <a
            className="page-eyebrow"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate({ view: 'builder-ai-intake', params: { templateId, templateType } });
            }}
          >
            Site builder / Template setup
          </a>
          <h1>Deployment settings</h1>
          <p className="sub">
            Give your site a name and configure hosting, then click Deploy to go live.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={() => navigate({ view: 'builder-templates' })}>
            ← Back to templates
          </button>
        </div>
      </div>

      <div className={`deploy-settings-layout${tailoredPages.length > 0 ? ' deploy-settings-layout--with-preview' : ''}`}>
        {/* ── Left: settings form ─────────────────────────────────── */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="label">Template</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>
              {template?.name || templateId || 'Selected template'}
            </div>
            {template?.tagline && (
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{template.tagline}</div>
            )}
          </div>

          <div>
            <div className="label">Site name *</div>
            <input
              className="input"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="My awesome store"
              autoFocus
            />
            {siteName.trim() && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Will be available at <span className="mono">{siteSlug}.glondia.app</span>
              </div>
            )}
          </div>

          <div>
            <div className="label">Service type</div>
            <select className="select" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              <option value="static_site">Static site (recommended for HTML templates)</option>
              <option value="web_service">Web service</option>
            </select>
          </div>

          <div>
            <div className="label">Plan</div>
            <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="starter">Starter (free tier)</option>
              <option value="standard">Standard</option>
              <option value="pro">Pro</option>
            </select>
          </div>

          {deployError && (
            <div style={{
              color: 'var(--danger)', fontSize: 13,
              padding: '10px 12px',
              background: 'var(--danger-soft, #fff0f0)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--r-sm)',
            }}>
              {deployError}
            </div>
          )}
          {deployMsg && (
            <div style={{ color: 'var(--accent)', fontSize: 13 }}>{deployMsg}</div>
          )}

          <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-outline"
              onClick={() => navigate({ view: 'builder-ai-intake', params: { templateId, templateType } })}
            >
              ← Back to customization
            </button>
            <button
              className="btn btn-primary"
              onClick={handleDeploy}
              disabled={deploying || !siteName.trim()}
            >
              <ICN.Rocket size={14} /> {deploying ? 'Deploying…' : 'Deploy site'}
            </button>
          </div>
        </div>

        {/* ── Centre: tailored preview ─────────────────────────────── */}
        {tailoredPages.length > 0 && (
          <div className="deploy-preview-column">
            <div className="deploy-preview-header">
              <div style={{ fontWeight: 600, fontSize: 13 }}>Your tailored site</div>
              {tailoredPages.length > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {tailoredPages.map((page, i) => (
                    <button
                      key={i}
                      className={`btn btn-sm ${previewPage === page ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPreviewPage(page)}
                    >
                      {page.title || `Page ${i + 1}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <iframe
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              srcDoc={previewPage?.html || tailoredPages[0]?.html || '<!doctype html><html><body></body></html>'}
              className="deploy-preview-iframe"
              title="Tailored site preview"
            />
          </div>
        )}

        {/* ── Right: what happens next ─────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>What happens when you click Deploy</div>
            {[
              'Your tailored site is submitted for deployment',
              'Glondia triggers a Render hosting deployment',
              'SSL certificate is issued automatically',
              'Site goes live at your Glondia subdomain',
              'Attach a custom domain from Domains at any time',
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, fontSize: 13 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <span style={{ paddingTop: 2 }}>{step}</span>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Need to re-tailor first?</div>
            <div className="muted" style={{ marginBottom: 12 }}>
              Go back to the AI setup to regenerate your template with different answers.
            </div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => navigate({ view: 'builder-ai-intake', params: { templateId, templateType } })}
            >
              ← Back to AI customization
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
