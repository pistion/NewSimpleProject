// BuilderGallery.jsx — Entry point for the site builder: template-only hero.
import React from 'react';
import { ICN } from '../../../icons';

export function BuilderGallery({ navigate }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Site builder</div>
          <h1>Launch your website</h1>
          <p className="sub">
            Pick a professionally designed template, answer a few questions, and we'll tailor it to your brand before it goes live.
          </p>
        </div>
      </div>

      <div className="builder-gallery-hero">
        <div className="builder-gallery-hero-text">
          <div className="builder-gallery-hero-steps">
            <div className="builder-gallery-hero-step">
              <span className="builder-gallery-hero-step-num">1</span>
              <span>Choose a template</span>
            </div>
            <ICN.ArrowRight size={14} className="builder-gallery-hero-arrow" />
            <div className="builder-gallery-hero-step">
              <span className="builder-gallery-hero-step-num">2</span>
              <span>AI customises it for you</span>
            </div>
            <ICN.ArrowRight size={14} className="builder-gallery-hero-arrow" />
            <div className="builder-gallery-hero-step">
              <span className="builder-gallery-hero-step-num">3</span>
              <span>Deploy and go live</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => navigate({ view: "builder-templates" })}
          >
            <ICN.Layers size={16} /> Browse templates
          </button>
        </div>
      </div>
    </>
  );
}
