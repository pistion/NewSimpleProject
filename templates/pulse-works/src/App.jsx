import { useEffect, useMemo, useState } from 'react';
import { routeFor, routes } from './routes.js';
import { siteData } from './siteData.js';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [cartCount, setCartCount] = useState(0);
  const route = useMemo(() => routeFor(path), [path]);

  useEffect(() => {
    const onRoute = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onRoute);
    return () => window.removeEventListener('popstate', onRoute);
  }, []);

  return (
    <div className="site-shell">
      <div className="promo">Live launch workspace - {siteData.offer || 'Current drop'} - {siteData.location || 'Online'}</div>
      <header className="nav">
        <button className="brand" onClick={() => navigate('/')}>{siteData.businessName || 'Pulse Works'}</button>
        <nav>
          {siteData.nav.map((item) => (
            <button key={item.path} className={path === item.path ? 'active' : ''} onClick={() => navigate(item.path)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="cart" onClick={() => setCartCount((count) => count + 1)}>Cart {cartCount}</button>
      </header>
      <main>
        {route.path === '/' && <Home />}
        {route.path === '/shop' && <Shop onAdd={() => setCartCount((count) => count + 1)} />}
        {route.path === '/product' && <Product onAdd={() => setCartCount((count) => count + 1)} />}
        {route.path === '/lookbook' && <Lookbook />}
        {route.path === '/studio' && <Studio />}
        {route.path === '/contact' && <Contact />}
      </main>
      <footer className="footer">
        <span>{siteData.businessName || 'Pulse Works'} / {siteData.slug || 'generated-site'}</span>
        <span>{siteData.contactEmail || 'hello@example.com'}</span>
      </footer>
    </div>
  );
}

function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Deploy-ready commerce template</p>
        <h1>{siteData.offer || 'Find your launch rhythm.'}</h1>
        <p>{siteData.businessName || 'This brand'} is built for {siteData.audience || 'customers who want a clean, focused storefront'}.</p>
        <div className="actions">
          <button onClick={() => navigate('/shop')}>Shop the drop</button>
          <button className="ghost" onClick={() => navigate('/lookbook')}>View lookbook</button>
        </div>
      </section>
      <Ticker />
      <ProductGrid />
    </>
  );
}

function Shop({ onAdd }) {
  return (
    <section className="page">
      <p className="eyebrow">Catalog route</p>
      <h2>Shop {siteData.industry || 'the collection'}</h2>
      <ProductGrid onAdd={onAdd} />
    </section>
  );
}

function Product({ onAdd }) {
  return (
    <section className="split-page">
      <div className="product-visual">01</div>
      <div>
        <p className="eyebrow">Featured product route</p>
        <h2>{siteData.products[0].name}</h2>
        <p>A focused product detail page for Glondia generated storefronts. Add real media, variants, payment links, and inventory once connected.</p>
        <button onClick={onAdd}>Add to cart</button>
      </div>
    </section>
  );
}

function Lookbook() {
  return (
    <section className="page">
      <p className="eyebrow">Campaign route</p>
      <h2>Lookbook</h2>
      <div className="lookbook-grid">
        <div>Frame 01</div><div>Frame 02</div><div>Frame 03</div>
      </div>
    </section>
  );
}

function Studio() {
  return (
    <section className="page narrow">
      <p className="eyebrow">Story route</p>
      <h2>Studio notes</h2>
      <p>{siteData.businessName || 'The brand'} turns a lightweight deploy into a full storefront foundation: content, routes, catalog blocks, and launch copy are all ready for refinement.</p>
    </section>
  );
}

function Contact() {
  return (
    <section className="page narrow">
      <p className="eyebrow">Contact route</p>
      <h2>Talk to the studio</h2>
      <form onSubmit={(event) => event.preventDefault()} className="contact-form">
        <input aria-label="Name" placeholder="Name" />
        <input aria-label="Email" placeholder="Email" />
        <textarea aria-label="Message" placeholder="Message" />
        <button type="submit">Send inquiry</button>
      </form>
    </section>
  );
}

function Ticker() {
  return <div className="ticker">{routes.map((route) => <span key={route.path}>{route.title}</span>)}</div>;
}

function ProductGrid({ onAdd = () => navigate('/product') }) {
  return (
    <section className="grid-section">
      {siteData.products.map((product, index) => (
        <article className="product-card" key={product.name}>
          <div className="product-image">{String(index + 1).padStart(2, '0')}</div>
          <p>{product.tag}</p>
          <h3>{product.name}</h3>
          <div>
            <span>{product.price}</span>
            <button onClick={onAdd}>Add</button>
          </div>
        </article>
      ))}
    </section>
  );
}
