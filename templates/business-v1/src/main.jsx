import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">{{business.industry}}</p>
        <h1>{{hero.title}}</h1>
        <p>{{business.description}}</p>
        <a className="button" href="#contact">{{hero.ctaText}}</a>
      </section>

      <section className="section">
        <h2>About {{business.name}}</h2>
        <p>{{business.description}}</p>
      </section>

      <section className="section alt">
        <h2>Our Services</h2>
        <p>{{business.offer}}</p>
      </section>

      <section className="section" id="contact">
        <h2>Contact</h2>
        <p>{{contact.primaryAction}}</p>
      </section>

      <footer>
        <strong>__BUSINESS_NAME__</strong>
        <span>{{brand.tone}}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
