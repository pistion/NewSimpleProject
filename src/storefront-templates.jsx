// storefront-templates.jsx — 9 production e-commerce templates (converted from ZIP)
// Each template is a full 1440px-wide React component with inline styles.
import React, { useEffect, useRef, useState } from 'react';

// ─── Shared SVG product illustrations ────────────────────────────────────────
const Bag = ({ stroke = "currentColor", w = 14 }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6">
    <path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>
  </svg>
);
const Bottle = ({ c1, c2, label }) => (
  <svg viewBox="0 0 100 140" style={{ width: "62%", height: "78%" }}>
    <rect x="38" y="8" width="24" height="14" rx="2" fill={c2}/>
    <path d="M30 30 Q30 22 50 22 Q70 22 70 30 L74 50 Q74 132 50 132 Q26 132 26 50 Z" fill={c1}/>
    <rect x="32" y="68" width="36" height="34" fill="rgba(255,255,255,.85)"/>
    <text x="50" y="84" textAnchor="middle" fontFamily="Geist Mono, monospace" fontSize="6" fill="#222" letterSpacing=".15em">{label}</text>
    <text x="50" y="93" textAnchor="middle" fontFamily="Newsreader, serif" fontSize="9" fontStyle="italic" fill="#222">No. {(label || "").length || 1}</text>
  </svg>
);
const Tee = ({ c1, c2 }) => (
  <svg viewBox="0 0 140 130" style={{ width: "78%", height: "78%" }}>
    <path d="M30 18 L50 8 Q70 22 90 8 L110 18 L122 38 L102 48 L102 122 L38 122 L38 48 L18 38 Z" fill={c1}/>
    <circle cx="70" cy="60" r="14" fill={c2}/>
  </svg>
);
const Chair = ({ c1, c2 }) => (
  <svg viewBox="0 0 120 140" style={{ width: "72%", height: "82%" }}>
    <rect x="18" y="20" width="84" height="58" rx="6" fill={c1}/>
    <rect x="18" y="74" width="84" height="14" fill={c2}/>
    <rect x="22" y="88" width="6" height="40" fill={c2}/>
    <rect x="92" y="88" width="6" height="40" fill={c2}/>
  </svg>
);
const Vase = ({ c1, c2 }) => (
  <svg viewBox="0 0 100 130" style={{ width: "60%", height: "82%" }}>
    <path d="M28 16 L72 16 L66 38 Q80 60 80 86 Q80 120 50 120 Q20 120 20 86 Q20 60 34 38 Z" fill={c1}/>
    <path d="M50 4 Q44 18 50 28 Q56 18 50 4 Z" fill={c2}/>
    <path d="M50 8 Q40 28 50 38" stroke={c2} fill="none" strokeWidth="1.5"/>
  </svg>
);
const Ring = ({ c1, c2 }) => (
  <svg viewBox="0 0 140 100" style={{ width: "72%", height: "62%" }}>
    <ellipse cx="70" cy="68" rx="38" ry="28" fill="none" stroke={c1} strokeWidth="6"/>
    <path d="M58 36 L70 14 L82 36 L70 50 Z" fill={c2}/>
  </svg>
);
const Earring = ({ c1, c2 }) => (
  <svg viewBox="0 0 140 100" style={{ width: "60%", height: "70%" }}>
    <circle cx="44" cy="22" r="4" fill={c1}/>
    <line x1="44" y1="26" x2="44" y2="60" stroke={c1} strokeWidth="1.5"/>
    <circle cx="44" cy="72" r="14" fill={c2}/>
    <circle cx="96" cy="22" r="4" fill={c1}/>
    <line x1="96" y1="26" x2="96" y2="60" stroke={c1} strokeWidth="1.5"/>
    <circle cx="96" cy="72" r="14" fill={c2}/>
  </svg>
);
const Can = ({ c1, c2, label }) => (
  <svg viewBox="0 0 90 130" style={{ width: "62%", height: "82%" }}>
    <rect x="14" y="14" width="62" height="106" rx="6" fill={c1}/>
    <rect x="14" y="50" width="62" height="34" fill={c2}/>
    <text x="45" y="72" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="700" fontSize="11" fill={c1}>{label}</text>
  </svg>
);
const Jar = ({ c1, c2, label }) => (
  <svg viewBox="0 0 100 130" style={{ width: "60%", height: "82%" }}>
    <rect x="22" y="10" width="56" height="18" rx="3" fill={c2}/>
    <rect x="18" y="26" width="64" height="96" rx="6" fill={c1}/>
    <rect x="22" y="56" width="56" height="38" fill="rgba(255,255,255,.92)"/>
    <text x="50" y="76" textAnchor="middle" fontFamily="Newsreader, serif" fontSize="9" fontStyle="italic" fill="#1a1410">{label}</text>
    <text x="50" y="88" textAnchor="middle" fontFamily="Space Mono, monospace" fontSize="5.5" fill="#1a1410" letterSpacing=".2em">SMALL BATCH</text>
  </svg>
);
const Bowl = ({ c1, c2 }) => (
  <svg viewBox="0 0 130 90" style={{ width: "70%", height: "62%" }}>
    <ellipse cx="65" cy="36" rx="50" ry="10" fill={c2}/>
    <path d="M15 36 Q15 80 65 80 Q115 80 115 36 Z" fill={c1}/>
  </svg>
);
const Plate = ({ c1, c2 }) => (
  <svg viewBox="0 0 130 90" style={{ width: "78%", height: "62%" }}>
    <ellipse cx="65" cy="60" rx="56" ry="14" fill={c1}/>
    <ellipse cx="65" cy="58" rx="42" ry="9" fill={c2}/>
  </svg>
);
const Boot = ({ c1, c2 }) => (
  <svg viewBox="0 0 140 110" style={{ width: "78%", height: "70%" }}>
    <path d="M22 14 L78 14 L82 70 L120 78 L120 96 L22 96 Z" fill={c1}/>
    <rect x="22" y="86" width="98" height="10" fill={c2}/>
    <path d="M30 30 L72 30 M30 44 L72 44 M30 58 L72 58" stroke={c2} strokeWidth="2"/>
  </svg>
);
const Pack = ({ c1, c2 }) => (
  <svg viewBox="0 0 120 140" style={{ width: "70%", height: "82%" }}>
    <rect x="20" y="22" width="80" height="100" rx="14" fill={c1}/>
    <rect x="30" y="32" width="60" height="34" fill={c2}/>
    <path d="M30 12 Q30 4 60 4 Q90 4 90 12 L90 24 L30 24 Z" fill={c2}/>
    <line x1="20" y1="86" x2="100" y2="86" stroke={c2} strokeWidth="2"/>
  </svg>
);
const Plant = ({ c1, c2 }) => (
  <svg viewBox="0 0 140 160" style={{ width: "72%", height: "92%" }}>
    <path d="M70 90 Q40 60 30 30 Q60 38 70 70 Q80 38 110 30 Q100 60 70 90 Z" fill={c1}/>
    <path d="M70 110 Q50 90 50 70 Q72 84 70 110 Z" fill={c1}/>
    <path d="M50 100 L48 150 L92 150 L90 100 Z" fill={c2}/>
  </svg>
);
const Lamp = ({ c1, c2 }) => (
  <svg viewBox="0 0 120 160" style={{ width: "60%", height: "94%" }}>
    <path d="M30 30 L90 30 L80 70 L40 70 Z" fill={c1}/>
    <rect x="58" y="70" width="4" height="70" fill={c2}/>
    <ellipse cx="60" cy="146" rx="26" ry="6" fill={c2}/>
  </svg>
);
const Pill = ({ children, bg = "transparent", color = "currentColor", border = "1px solid currentColor", style }) => (
  <span style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, border, background: bg, color, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", ...style }}>{children}</span>
);

// ─── 01 ATELIER — luxury fashion ─────────────────────────────────────────────
function AtelierPage() {
  const looks = [
    { name: "The Cashmere Coat", price: "€2,840", season: "FW26 · Look 04", g: "linear-gradient(160deg,#cbbfae 0%,#9a8d7a 60%,#5e564b)" },
    { name: "Raw Silk Trouser",  price: "€1,260", season: "FW26 · Look 09", g: "linear-gradient(160deg,#e8dfcc,#a89c83)" },
    { name: "Linen Overshirt",   price: "€890",   season: "FW26 · Look 02", g: "linear-gradient(160deg,#dcd2bd,#7a6e58)" },
    { name: "Wool Bias Skirt",   price: "€1,440", season: "FW26 · Look 11", g: "linear-gradient(160deg,#bcb09c,#46402f)" },
    { name: "Ribbed Knit Vest",  price: "€720",   season: "FW26 · Look 06", g: "linear-gradient(160deg,#a89683,#6b5a45)" },
    { name: "Pleated Tunic",     price: "€1,080", season: "FW26 · Look 13", g: "linear-gradient(160deg,#d5c8b1,#3e372a)" },
  ];
  return (
    <div style={{ width: 1440, background: "#f4f1ec", color: "#1a1715", fontFamily: '"Cormorant Garamond", serif' }}>
      <div style={{ borderBottom: "1px solid #d8cfc0", padding: "10px 56px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".22em", color: "#8a7f74", display: "flex", justifyContent: "space-between", textTransform: "uppercase" }}>
        <span>Complimentary shipping over €600</span><span>FW 26 · Edition One — atelier in residence, Florence</span><span>EN · FR · IT · JA</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "28px 56px", fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: ".18em", textTransform: "uppercase" }}>
        <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 28, letterSpacing: 0, fontStyle: "italic", textTransform: "none" }}>Atelier</span>
        <div style={{ display: "flex", gap: 36 }}><span>Collection</span><span>Atelier</span><span>Journal</span><span>Stockists</span><span>Bespoke</span></div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}><span>Search</span><span>EN / €</span><Bag/></div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "20px 56px 0", gap: 56, alignItems: "end", height: 700 }}>
        <div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".2em", color: "#8a7f74" }}>FW 26 / EDITION ONE</div>
          <h1 style={{ fontSize: 168, lineHeight: .88, margin: "18px 0 0", letterSpacing: "-.02em", fontWeight: 300 }}>The<br/><em>Quiet</em><br/>Volume.</h1>
          <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 16, lineHeight: 1.6, maxWidth: 380, marginTop: 32, color: "#5a544c" }}>Cashmere, raw silk and undyed linen — sixteen pieces, cut once in Florence.</p>
          <div style={{ marginTop: 30, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", display: "flex", gap: 24 }}>
            <span style={{ borderBottom: "1px solid #1a1715", paddingBottom: 4 }}>Shop the edition →</span>
            <span style={{ color: "#8a7f74" }}>Read the brief</span>
          </div>
        </div>
        <div style={{ background: "linear-gradient(160deg,#cbbfae 0%,#9a8d7a 60%,#5e564b)", height: 660, position: "relative" }}>
          <div style={{ position: "absolute", left: 24, top: 24, color: "rgba(255,255,255,.85)", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".22em" }}>LOOK 04 — CHIARA, FLORENCE</div>
          <div style={{ position: "absolute", right: 24, bottom: 24, color: "rgba(255,255,255,.85)", fontFamily: '"Cormorant Garamond", serif', fontStyle: "italic", fontSize: 30 }}>The Cashmere Coat</div>
        </div>
      </section>
      <section style={{ borderTop: "1px solid #d8cfc0", borderBottom: "1px solid #d8cfc0", margin: "80px 56px 0", padding: "26px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: '"Cormorant Garamond", serif', fontStyle: "italic", fontSize: 22, color: "#5a544c" }}>
        <span>"The quietest collection of the season." — Vogue Italia</span><span>—</span><span>"A patient kind of luxury." — Wallpaper*</span><span>—</span><span>"Made the way Florentine ateliers used to." — Monocle</span>
      </section>
      <section style={{ padding: "100px 56px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".2em", color: "#8a7f74" }}>02 — THE EDITION</div>
            <h2 style={{ fontSize: 88, margin: "16px 0 0", fontWeight: 300, letterSpacing: "-.02em" }}>Sixteen pieces.<br/><em>One quiet wardrobe.</em></h2>
          </div>
          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", borderBottom: "1px solid #1a1715", paddingBottom: 4 }}>View the full lookbook →</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 56 }}>
          {looks.map((l,i) => (
            <article key={i}>
              <div style={{ background: l.g, aspectRatio: "3 / 4", position: "relative" }}>
                <div style={{ position: "absolute", left: 14, top: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".18em", color: "rgba(255,255,255,.8)" }}>{String(i+1).padStart(2,"0")} / 16</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 13 }}>
                <span style={{ fontFamily: '"Cormorant Garamond", serif', fontStyle: "italic", fontSize: 22 }}>{l.name}</span>
                <span>{l.price}</span>
              </div>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".18em", color: "#8a7f74", marginTop: 4 }}>{l.season}</div>
            </article>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginTop: 140, height: 720, borderTop: "1px solid #d8cfc0" }}>
        <div style={{ background: "linear-gradient(180deg,#8a7f6e,#3e372a)" }}/>
        <div style={{ padding: "80px 80px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".2em", color: "#8a7f74" }}>03 — INSIDE THE ATELIER</div>
            <h2 style={{ fontSize: 64, margin: "20px 0 0", fontWeight: 300, letterSpacing: "-.015em" }}>Cut once, on a<br/><em>wooden table.</em></h2>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 15, lineHeight: 1.75, marginTop: 24, color: "#5a544c", maxWidth: 460 }}>The Quiet Volume is made over twelve weeks in a third-floor atelier above Via Maggio. Cloth is sourced from one mill in Biella, cut once by hand, and shipped numbered.</p>
          </div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", borderBottom: "1px solid #1a1715", paddingBottom: 4, alignSelf: "flex-start" }}>Read the journal →</div>
        </div>
      </section>
      <section style={{ padding: "120px 56px 100px", textAlign: "center" }}>
        <div style={{ fontFamily: '"Cormorant Garamond", serif', fontStyle: "italic", fontSize: 28, color: "#8a7f74" }}>— Stay close —</div>
        <h3 style={{ fontSize: 72, fontWeight: 300, margin: "16px 0 0", letterSpacing: "-.02em" }}>One letter, every <em>solstice.</em></h3>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 36, gap: 12 }}>
          <input placeholder="your.email@somewhere.com" style={{ background: "transparent", border: 0, borderBottom: "1px solid #1a1715", width: 360, padding: "10px 0", fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontStyle: "italic", outline: 0 }}/>
          <button style={{ background: "#1a1715", color: "#f4f1ec", border: 0, padding: "10px 26px", fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase" }}>Subscribe</button>
        </div>
      </section>
      <footer style={{ borderTop: "1px solid #d8cfc0", padding: "60px 56px 40px", fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: "#5a544c" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 40 }}>
          <div><div style={{ fontFamily: '"Cormorant Garamond", serif', fontStyle: "italic", fontSize: 32, color: "#1a1715" }}>Atelier</div><p style={{ marginTop: 16, lineHeight: 1.7 }}>Via Maggio 22, 50125 Firenze<br/>Tuesday – Saturday, 11–19</p></div>
          {[["Shop",["The Edition","Lookbook","Bespoke","Archive"]],["Atelier",["The brief","Journal","Press","Stockists"]],["Care",["Contact","Shipping","Returns","Repair"]],["Studio",["Privacy","Terms","Imprint","Sustainability"]]].map(([h,items]) => (
            <div key={h}><div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "#8a7f74" }}>{h}</div>{items.map(x => <div key={x} style={{ marginTop: 10 }}>{x}</div>)}</div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #d8cfc0", marginTop: 50, paddingTop: 22, display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".18em", color: "#8a7f74", textTransform: "uppercase" }}>
          <span>© 2026 ATELIER S.R.L.</span><span>Made carefully in Florence</span><span>Instagram · Pinterest</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 02 PULSE WORKS — streetwear dark ────────────────────────────────────────
function PulsePage() {
  const drops = [
    { n: "07.1 / CARGO TEE", p: "$78",  c1: "#ff3a17", c2: "#0e0d0c" },
    { n: "07.2 / DUSTER",    p: "$240", c1: "#e8e2d4", c2: "#5a5750" },
    { n: "07.3 / NYL. VEST", p: "$165", c1: "#2b2622", c2: "#ff3a17" },
    { n: "07.4 / RIPSTOP",   p: "$92",  c1: "#7d7165", c2: "#0e0d0c" },
    { n: "07.5 / WORK PANT", p: "$148", c1: "#3a3530", c2: "#d4d0c4" },
    { n: "07.6 / TEE WHITE", p: "$58",  c1: "#e8e2d4", c2: "#ff3a17" },
    { n: "07.7 / CAP",       p: "$48",  c1: "#0e0d0c", c2: "#ff3a17" },
    { n: "07.8 / OVERSHIRT", p: "$210", c1: "#5a5048", c2: "#0e0d0c" },
  ];
  return (
    <div style={{ width: 1440, background: "#0e0d0c", color: "#f3f0e8", fontFamily: '"Archivo", sans-serif' }}>
      <div style={{ background: "#ff3a17", padding: "8px 40px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".3em", color: "#0e0d0c", display: "flex", justifyContent: "space-between" }}>
        <span>● LIVE NOW — DROP 07 / NEUTRAL HEAT</span><span>FREE SHIPPING / ORDERS &gt;$120</span><span>SOLD OUT IN: 09:42:18</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "20px 40px", borderBottom: "1px solid #2a2826", fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: ".06em" }}>
        <span style={{ fontFamily: "Anton, sans-serif", fontSize: 26, letterSpacing: ".02em" }}>PULSE//WORKS</span>
        <div style={{ display: "flex", gap: 28 }}><span>[ DROP 07 ]</span><span>SHOP</span><span>ARCHIVE</span><span>LOOKBOOK</span><span>STORES</span></div>
        <div style={{ display: "flex", gap: 14 }}><span>EN/USD</span><span>CART (2)</span></div>
      </nav>
      <section style={{ padding: "30px 40px" }}>
        <h1 style={{ fontFamily: "Anton, sans-serif", fontSize: 240, lineHeight: .82, margin: 0, letterSpacing: ".005em" }}>NEUTRAL<br/><span style={{ color: "#ff3a17" }}>HEAT.</span></h1>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: "#a09c93" }}>
          <span>14 PIECES / WORKWEAR REISSUE</span><span>SHOT IN HACKNEY, FEB 2026</span><span style={{ color: "#ff3a17" }}>→ ENTER THE DROP</span>
        </div>
      </section>
      <div style={{ borderTop: "1px solid #2a2826", borderBottom: "1px solid #2a2826", overflow: "hidden", padding: "12px 0", fontFamily: "Anton, sans-serif", fontSize: 36, letterSpacing: ".04em", whiteSpace: "nowrap" }}>
        <span style={{ marginRight: 32 }}>NEUTRAL HEAT</span><span style={{ color: "#ff3a17", marginRight: 32 }}>● DROP 07</span><span style={{ marginRight: 32 }}>14 PIECES</span><span style={{ color: "#ff3a17", marginRight: 32 }}>● MADE TO MOVE</span><span style={{ marginRight: 32 }}>WORKWEAR REISSUE</span><span style={{ color: "#ff3a17" }}>● DROP 07</span>
      </div>
      <section style={{ padding: "60px 40px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#2a2826", border: "1px solid #2a2826" }}>
          <div style={{ background: "#161513", padding: 36, minHeight: 540, position: "relative" }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".2em", color: "#a09c93" }}>HERO PIECE / 07.A</div>
            <h2 style={{ fontFamily: "Anton, sans-serif", fontSize: 96, lineHeight: .9, margin: "16px 0 0", color: "#ff3a17" }}>THE OVERSIZED<br/>RIPSTOP COAT.</h2>
            <p style={{ marginTop: 18, color: "#a09c93", maxWidth: 380, fontSize: 14, lineHeight: 1.6 }}>Dead-stock ripstop nylon. Reinforced shoulders. YKK hardware throughout. One pattern, two colorways, 220 made.</p>
            <div style={{ position: "absolute", left: 36, bottom: 36, display: "flex", gap: 14, alignItems: "center", fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
              <span style={{ background: "#ff3a17", color: "#0e0d0c", padding: "10px 18px", fontWeight: 700, letterSpacing: ".1em" }}>$420 — ADD TO CART</span>
              <span style={{ color: "#a09c93" }}>SIZE: S M L XL · 14/220 LEFT</span>
            </div>
          </div>
          <div style={{ background: "linear-gradient(135deg,#ff3a17,#1f1612)", minHeight: 540, position: "relative" }}>
            <div style={{ position: "absolute", right: 24, top: 24, fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".22em", color: "rgba(255,255,255,.7)" }}>FRAME 04 / 22</div>
            <div style={{ position: "absolute", left: 24, bottom: 24, fontFamily: "Anton, sans-serif", fontSize: 28, color: "#0e0d0c" }}>SHOT IN HACKNEY</div>
          </div>
        </div>
      </section>
      <section style={{ padding: "60px 40px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#2a2826", border: "1px solid #2a2826" }}>
          {drops.map((p,i) => (
            <div key={i} style={{ background: "#161513", padding: 18, height: 340, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#a09c93", letterSpacing: ".15em" }}>
                <span>0{i+1}/14</span><span style={{ color: i % 3 === 0 ? "#ff3a17" : "#a09c93" }}>{i % 3 === 0 ? "● LOW" : "IN STOCK"}</span>
              </div>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Tee c1={p.c1} c2={p.c2}/></div>
              <div style={{ borderTop: "1px solid #2a2826", paddingTop: 12, display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
                <span>{p.n}</span><span style={{ color: "#ff3a17" }}>{p.p}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ background: "#ff3a17", color: "#0e0d0c", margin: "100px 0 0", padding: "100px 40px" }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: ".22em" }}>// FROM THE STUDIO</div>
        <h2 style={{ fontFamily: "Anton, sans-serif", fontSize: 180, lineHeight: .85, margin: "20px 0 0", letterSpacing: ".005em" }}>WE DON'T<br/>RESTOCK.<br/>EVER.</h2>
      </section>
      <footer style={{ padding: "50px 40px 30px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "#a09c93", letterSpacing: ".08em" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "Anton, sans-serif", fontSize: 28, color: "#f3f0e8" }}>PULSE//WORKS</span>
          <span>© 2026 PULSE WORKS LTD</span>
          <span>INSTAGRAM / TIKTOK / NEWSLETTER</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 03 MIRTH — beauty / skincare ────────────────────────────────────────────
function MirthPage() {
  const goods = [
    { bg: "#f4cdb0", c1: "#d57956", c2: "#3a221b", l: "GLOW",  n: "Slow Glow Serum",    p: "$48", tag: "BESTSELLER" },
    { bg: "#e8c4b6", c1: "#a85a3e", c2: "#3a221b", l: "RICH",  n: "Rich Recovery Balm", p: "$36", tag: "" },
    { bg: "#fbd9c2", c1: "#e89970", c2: "#3a221b", l: "EYE",   n: "Gentle Eye Oil",     p: "$32", tag: "NEW" },
    { bg: "#e3b8a0", c1: "#7d3d2a", c2: "#3a221b", l: "CLEAN", n: "Soft Cleanse Gel",   p: "$28", tag: "" },
    { bg: "#f7dac4", c1: "#c66a4a", c2: "#3a221b", l: "MIST",  n: "Rose Hydra Mist",    p: "$24", tag: "" },
    { bg: "#eac1ac", c1: "#9c4a30", c2: "#3a221b", l: "MASK",  n: "Honey Mask",         p: "$42", tag: "NEW" },
  ];
  return (
    <div style={{ width: 1440, background: "#fbe9dc", color: "#3a221b", fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ borderBottom: "1px solid #ebd1bb", padding: "8px 56px", fontSize: 12, letterSpacing: ".06em", color: "#9c6a52", display: "flex", justifyContent: "space-between" }}>
        <span>Free shipping on orders over $60</span><span>★★★★★ 12,400 happy faces · refillable · carbon-neutral</span><span>Take the skin quiz →</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "26px 56px", alignItems: "center" }}>
        <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 30, fontStyle: "italic" }}>mirth.</span>
        <div style={{ display: "flex", gap: 32, fontSize: 14 }}><span>Skin</span><span>Body</span><span>Rituals</span><span>Refills</span><span>The Notebook</span></div>
        <div style={{ display: "flex", gap: 14, fontSize: 14 }}><span>Account</span><span>♡</span><span style={{ background: "#3a221b", color: "#fbe9dc", padding: "6px 14px", borderRadius: 999 }}>Bag · 0</span></div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, padding: "40px 56px 0", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, letterSpacing: ".18em", textTransform: "uppercase", color: "#9c6a52" }}>New · The Slow Edit</div>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 132, lineHeight: .95, margin: "16px 0 0", letterSpacing: "-.02em", fontWeight: 400 }}>A softer<br/>kind of <em style={{ color: "#d57956" }}>glow</em>.</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 460, marginTop: 24, color: "#6d4536" }}>Six tiny rituals for skin that's been through a week. Made with squalane, peach kernel and patience.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            <button style={{ background: "#3a221b", color: "#fbe9dc", border: 0, borderRadius: 999, padding: "14px 26px", fontSize: 14, fontWeight: 600 }}>Shop the edit</button>
            <button style={{ background: "transparent", color: "#3a221b", border: "1px solid #3a221b", borderRadius: 999, padding: "14px 26px", fontSize: 14 }}>Take the quiz →</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {goods.slice(0,4).map((p,i) => (
            <div key={i} style={{ background: p.bg, borderRadius: 28, height: 250, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <Bottle c1={p.c1} c2={p.c2} label={p.l}/>
              {p.tag && <span style={{ position: "absolute", right: 16, top: 16, background: "#3a221b", color: "#fbe9dc", padding: "3px 10px", borderRadius: 999, fontSize: 10, letterSpacing: ".1em" }}>{p.tag}</span>}
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: "100px 56px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 72, margin: 0, fontWeight: 400, letterSpacing: "-.015em" }}>Shop <em>everything</em>.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22, marginTop: 40 }}>
          {goods.map((p,i) => (
            <article key={i} style={{ background: p.bg, borderRadius: 28, padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: '"DM Serif Display", serif', fontStyle: "italic", fontSize: 20 }}>0{i+1}</span>
                {p.tag && <Pill bg="#3a221b" color="#fbe9dc" border="0" style={{ fontSize: 10 }}>{p.tag}</Pill>}
              </div>
              <div style={{ height: 220, display: "grid", placeItems: "center" }}><Bottle c1={p.c1} c2={p.c2} label={p.l}/></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 22 }}>{p.n}</span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{p.p}</span>
              </div>
              <button style={{ background: "#3a221b", color: "#fbe9dc", border: 0, borderRadius: 999, padding: "12px 0", fontSize: 13, fontWeight: 600, marginTop: 4 }}>Add to bag</button>
            </article>
          ))}
        </div>
      </section>
      <footer style={{ background: "#3a221b", color: "#d6a98c", padding: "60px 56px 32px", fontSize: 14, marginTop: 80 }}>
        <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: "italic", fontSize: 32, color: "#fbe9dc" }}>mirth.</div>
        <div style={{ borderTop: "1px solid #6d4536", marginTop: 24, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span>© 2026 Mirth Co.</span><span>Made carefully · 1% for the planet</span><span>privacy · terms</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 04 FORGE — outdoor / technical gear ─────────────────────────────────────
function ForgePage() {
  const products = [
    { n: "MERIDIAN GTX",  t: "ALPINE BOOT",     p: "$340", c1: "#3a3c33", c2: "#d4ff3a", spec: "WP 28K / VIBRAM XS" },
    { n: "PACER LO 02",   t: "DESERT RUNNER",   p: "$220", c1: "#5a4030", c2: "#dcdcd2", spec: "RECYCLED MESH / 220G" },
    { n: "RIDGE MID 09",  t: "MIDWEIGHT HIKER", p: "$295", c1: "#1f201c", c2: "#7a8a4a", spec: "WP 20K / 8MM LUG" },
  ];
  const packs = [
    { n: "RIDGE 28L",  p: "$240", c1: "#3a3c33", c2: "#d4ff3a" },
    { n: "ALPINE 38L", p: "$320", c1: "#1f201c", c2: "#7a8a4a" },
    { n: "DESERT 18L", p: "$180", c1: "#5a4030", c2: "#dcdcd2" },
  ];
  return (
    <div style={{ width: 1440, background: "#111210", color: "#dcdcd2", fontFamily: '"Archivo", sans-serif' }}>
      <div style={{ background: "#d4ff3a", color: "#0e0f0c", padding: "6px 40px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".22em", display: "flex", justifyContent: "space-between" }}>
        <span>● REPAIR FOR LIFE — SEND ANY ITEM, ANY YEAR.</span><span>FREE GROUND SHIPPING / ORDERS $120+</span><span>RATED FOR: ALPINE / DESERT / COASTAL / URBAN</span>
      </div>
      <nav style={{ display: "grid", gridTemplateColumns: "240px 1fr auto", padding: "22px 40px", alignItems: "center", borderBottom: "1px solid #25261f", gap: 30 }}>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 14, letterSpacing: ".22em" }}>F O R G E<br/><span style={{ color: "#6a6b5f", fontSize: 9 }}>WORK-WORTHY GEAR</span></div>
        <div style={{ display: "flex", gap: 32, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, letterSpacing: ".15em" }}>
          <span>FOOTWEAR</span><span>OUTERWEAR</span><span>PACKS</span><span>HARDWARE</span><span>REPAIR KITS</span><span>FIELD NOTES</span>
        </div>
        <div style={{ display: "flex", gap: 18, fontFamily: '"JetBrains Mono", monospace', fontSize: 12, color: "#a09c93" }}>
          <span>SEARCH</span><span>SIGN IN</span><span style={{ color: "#d4ff3a" }}>CART [3]</span>
        </div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "240px 1fr", borderBottom: "1px solid #25261f" }}>
        <aside style={{ borderRight: "1px solid #25261f", padding: 28, display: "flex", flexDirection: "column", gap: 30, minHeight: 760 }}>
          <div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#6a6b5f", letterSpacing: ".22em", marginBottom: 12 }}>CATEGORY</div>
            {["Outerwear","Footwear","Packs","Hardware","Repair kits"].map(c => (
              <div key={c} style={{ fontSize: 14, padding: "7px 0", color: c === "Footwear" ? "#d4ff3a" : "#dcdcd2" }}>{c}{c === "Footwear" && " ◉"}</div>
            ))}
          </div>
          <div style={{ marginTop: "auto", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#6a6b5f" }}>EST. 2019 · BEND, OR · 44.06°N<br/>120,000+ ITEMS REPAIRED</div>
        </aside>
        <main style={{ padding: "28px 40px" }}>
          <h1 style={{ fontWeight: 800, fontSize: 108, lineHeight: .95, margin: "32px 0 6px", letterSpacing: "-.02em" }}>Built for the<br/>tenth season.</h1>
          <p style={{ color: "#a09c93", marginTop: 16, maxWidth: 480, fontSize: 15, lineHeight: 1.6 }}>Footwear and packs that don't ask to be replaced. Engineered in Bend, tested in twelve climates, repaired forever.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 28 }}>
            {products.map((p,i) => (
              <div key={i} style={{ background: "#1a1b18", borderRadius: 8, padding: 18, height: 380, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: "#6a6b5f", letterSpacing: ".18em" }}>
                  <span>{p.t}</span><span>0{i+1}/18</span>
                </div>
                <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Boot c1={p.c1} c2={p.c2}/></div>
                <div style={{ borderTop: "1px solid #25261f", paddingTop: 12, display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
                  <span>{p.n}</span><span style={{ color: "#d4ff3a" }}>{p.p}</span>
                </div>
              </div>
            ))}
          </div>
        </main>
      </section>
      <section style={{ background: "#d4ff3a", color: "#0e0f0c", margin: "80px 0 0", padding: "80px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end" }}>
          <h2 style={{ fontWeight: 800, fontSize: 132, lineHeight: .88, margin: 0, letterSpacing: "-.02em" }}>Repair, don't<br/>replace.</h2>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, lineHeight: 1.7 }}>Send any Forge item back, any year you bought it. We resole, restitch, rewax, and ship it home — included on every order, forever.</div>
        </div>
      </section>
      <section style={{ padding: "60px 40px 0" }}>
        <h2 style={{ fontWeight: 800, fontSize: 56, margin: "0 0 24px", letterSpacing: "-.015em" }}>Carry the load.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {packs.map((p,i) => (
            <div key={i} style={{ background: "#1a1b18", borderRadius: 8, padding: 24, height: 420, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Pack c1={p.c1} c2={p.c2}/></div>
              <div style={{ borderTop: "1px solid #25261f", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 13 }}><span>{p.n}</span><span style={{ color: "#d4ff3a" }}>{p.p}</span></div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer style={{ padding: "50px 40px 28px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: "#a09c93", letterSpacing: ".08em", marginTop: 80 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, color: "#dcdcd2", letterSpacing: ".22em" }}>F O R G E</div>
          <span>© 2026 FORGE OUTDOOR CO. · BEND, OR</span>
          <span style={{ color: "#d4ff3a" }}>● ALL SYSTEMS NOMINAL</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 05 TENDRIL & CO. — plants & home ────────────────────────────────────────
function TendrilPage() {
  const plants = [
    { n: "Monstera Albo",    sz: "Size 02", p: "$148", g: "linear-gradient(180deg,#9aab7a,#4a5a40)" },
    { n: "Bird of Paradise", sz: "Size 03", p: "$220", g: "linear-gradient(180deg,#7c9560,#2f3f28)" },
    { n: "Rubber Tree",      sz: "Size 01", p: "$72",  g: "linear-gradient(180deg,#6e8350,#3d4a30)" },
    { n: "Olive Tree",       sz: "Size 03", p: "$280", g: "linear-gradient(180deg,#a5b294,#5f6a50)" },
    { n: "Philodendron",     sz: "Size 02", p: "$94",  g: "linear-gradient(180deg,#88a070,#3a4830)" },
    { n: "Fiddle Leaf",      sz: "Size 03", p: "$165", g: "linear-gradient(180deg,#7a9268,#3f4f30)" },
  ];
  const vessels = [
    { bg: "#dfd5b8", c1: "#7a6a4a", c2: "#3a3220", n: "Stoneware Vase", p: "$48" },
    { bg: "#c7c2a8", c1: "#4a4a30", c2: "#1f1f10", n: "Footed Bowl",    p: "$62" },
    { bg: "#d8d8c6", c1: "#5a5a3a", c2: "#2a2a18", n: "Ribbed Planter", p: "$58" },
    { bg: "#ddc7a6", c1: "#8a6a3a", c2: "#3a2810", n: "Hanging Vessel", p: "$72" },
  ];
  return (
    <div style={{ width: 1440, background: "#ece6d6", color: "#2a3326", fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ borderBottom: "1px solid #d6cfbe", padding: "9px 56px", fontSize: 12, letterSpacing: ".08em", color: "#6c7a5b", display: "flex", justifyContent: "space-between" }}>
        <span>Free local delivery to NYC · Spring window: Mar – May</span><span>Every plant ships with a one-page care card</span><span>Care guide →</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "28px 56px", alignItems: "center" }}>
        <div style={{ fontFamily: "Marcellus, serif", fontSize: 28, letterSpacing: ".02em" }}>Tendril &amp; Co.</div>
        <div style={{ display: "flex", gap: 32, fontSize: 14 }}><span>Plants</span><span>Vessels</span><span>Care guide</span><span>Subscriptions</span><span>The greenhouse</span></div>
        <div style={{ display: "flex", gap: 16, fontSize: 14, alignItems: "center" }}><span>Search</span><span>♡</span><span>Basket (0)</span></div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 60, padding: "40px 56px 80px", alignItems: "end" }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", color: "#6c7a5b" }}>Spring delivery, open now</div>
          <h1 style={{ fontFamily: "Marcellus, serif", fontSize: 144, lineHeight: .92, margin: "20px 0 0", letterSpacing: "-.015em", fontWeight: 400 }}>Slow grown.<br/>Carefully<br/>delivered.</h1>
          <p style={{ fontSize: 17, lineHeight: 1.75, maxWidth: 480, marginTop: 28, color: "#52613f" }}>Houseplants raised in our Hudson Valley greenhouse, paired with stoneware vessels from independent makers.</p>
          <div style={{ marginTop: 32, display: "flex", gap: 14 }}>
            <button style={{ background: "#2a3326", color: "#ece6d6", border: 0, borderRadius: 4, padding: "16px 28px", fontSize: 14 }}>Shop plants</button>
            <button style={{ background: "transparent", color: "#2a3326", border: "1px solid #2a3326", borderRadius: 4, padding: "16px 28px", fontSize: 14 }}>Browse vessels →</button>
          </div>
        </div>
        <div style={{ background: "linear-gradient(180deg,#9aab7a,#4a5a40)", height: 620, borderRadius: "210px 210px 12px 12px", position: "relative" }}>
          <div style={{ padding: 24, color: "rgba(255,255,255,.9)", fontFamily: "Marcellus, serif", fontStyle: "italic", fontSize: 24 }}>Monstera Albo</div>
          <div style={{ position: "absolute", bottom: 24, left: 24, color: "rgba(255,255,255,.85)", fontSize: 12, letterSpacing: ".1em" }}>SIZE 02 · BRIGHT INDIRECT · $148</div>
        </div>
      </section>
      <section style={{ padding: "80px 56px 0" }}>
        <h2 style={{ fontFamily: "Marcellus, serif", fontSize: 64, margin: "0 0 36px", fontWeight: 400, letterSpacing: "-.015em" }}>Statement plants, raised by hand.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {plants.map((p,i) => (
            <article key={i}>
              <div style={{ background: p.g, aspectRatio: "4 / 5", borderRadius: "180px 180px 6px 6px", position: "relative" }}>
                <div style={{ position: "absolute", left: 16, bottom: 16, color: "rgba(255,255,255,.9)", fontFamily: "Marcellus, serif", fontStyle: "italic", fontSize: 20 }}>{p.sz}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "baseline" }}>
                <span style={{ fontFamily: "Marcellus, serif", fontSize: 22 }}>{p.n}</span>
                <span style={{ fontSize: 16 }}>{p.p}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section style={{ padding: "120px 56px 0" }}>
        <h2 style={{ fontFamily: "Marcellus, serif", fontSize: 64, margin: "0 0 32px", fontWeight: 400 }}>Vessels, by makers we love.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
          {vessels.map((v,i) => (
            <div key={i} style={{ background: v.bg, borderRadius: 6, padding: 18, height: 320, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Vase c1={v.c1} c2={v.c2}/></div>
              <div>
                <div style={{ fontFamily: "Marcellus, serif", fontSize: 18 }}>{v.n}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4, color: "#52613f" }}>
                  <span>K. Olafsdottir</span><span>{v.p}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer style={{ background: "#2a3326", color: "#c2cdb1", padding: "60px 56px 32px", fontSize: 14, marginTop: 80 }}>
        <div style={{ fontFamily: "Marcellus, serif", fontSize: 28, color: "#ece6d6" }}>Tendril &amp; Co.</div>
        <div style={{ borderTop: "1px solid #4a5a40", marginTop: 24, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span>© 2026 Tendril &amp; Co. · Slow-grown</span><span>Instagram · Pinterest · Notebook</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 06 BODEGA 88 — food & pantry ────────────────────────────────────────────
function BodegaPage() {
  const jars = [
    { bg: "#ff5b1f", c1: "#fff6e6", c2: "#1a1410", n: "Miso Caramel",      p: "$14", l: "MISO",  tag: "NEW" },
    { bg: "#2f6b3c", c1: "#fff6e6", c2: "#1a1410", n: "Chile Crisp 04",    p: "$11", l: "CHILE", tag: "" },
    { bg: "#3866b2", c1: "#fff6e6", c2: "#1a1410", n: "Sicilian Anchovies",p: "$18", l: "FISH",  tag: "" },
    { bg: "#e7c9b4", c1: "#3a2618", c2: "#1a1410", n: "Honeycomb",         p: "$22", l: "HONEY", tag: "★" },
    { bg: "#ffce3f", c1: "#1a1410", c2: "#1a1410", n: "Lemon Confit",      p: "$13", l: "LEMON", tag: "" },
    { bg: "#9c2c2c", c1: "#fff6e6", c2: "#1a1410", n: "Tomato Conserva",   p: "$16", l: "TOMATO",tag: "NEW" },
    { bg: "#5e3a1c", c1: "#fff6e6", c2: "#1a1410", n: "Smoked Olive Oil",  p: "$28", l: "OIL",   tag: "" },
    { bg: "#e89d65", c1: "#fff6e6", c2: "#1a1410", n: "Spicy Peach Jam",   p: "$12", l: "PEACH", tag: "" },
  ];
  return (
    <div style={{ width: 1440, background: "#fff6e6", color: "#1a1410", fontFamily: '"Bricolage Grotesque", sans-serif' }}>
      <div style={{ background: "#1a1410", color: "#fff6e6", padding: "8px 0", fontFamily: '"Space Mono", monospace', fontSize: 11, letterSpacing: ".2em", whiteSpace: "nowrap", overflow: "hidden" }}>
        <span style={{ marginLeft: 40 }}>★ NEW: SICILIAN ANCHOVIES &nbsp;★&nbsp; COLD-SMOKED CHILE OIL &nbsp;★&nbsp; MISO CARAMEL &nbsp;★&nbsp; FREE SHIP OVER $50 &nbsp;★</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "20px 40px", alignItems: "center" }}>
        <span style={{ fontFamily: "Yeseva One, serif", fontSize: 40, fontStyle: "italic" }}>Bodega 88</span>
        <div style={{ display: "flex", gap: 28, fontSize: 15, fontWeight: 600 }}><span>Pantry</span><span>Fridge</span><span>Bundles</span><span>Recipes</span><span>Our makers</span></div>
        <span style={{ background: "#ff5b1f", color: "#fff6e6", padding: "8px 16px", borderRadius: 999, fontWeight: 700, fontSize: 14 }}>Bag · 4 — $58</span>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 24, padding: "20px 40px 0" }}>
        <div style={{ background: "#ffce3f", borderRadius: 32, padding: 40, position: "relative", minHeight: 580 }}>
          <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 12, letterSpacing: ".22em" }}>WEEK 21 / TASTING BOX</div>
          <h1 style={{ fontFamily: "Yeseva One, serif", fontSize: 156, lineHeight: .88, margin: "12px 0 0", fontStyle: "italic", letterSpacing: "-.01em" }}>Stuff<br/>worth<br/>spreading.</h1>
          <button style={{ background: "#1a1410", color: "#fff6e6", border: 0, borderRadius: 999, padding: "14px 28px", fontSize: 15, fontWeight: 700, marginTop: 22 }}>Start a box — $42/mo →</button>
          <div style={{ position: "absolute", right: 30, top: 30, background: "#ff5b1f", color: "#fff6e6", width: 100, height: 100, borderRadius: "50%", display: "grid", placeItems: "center", textAlign: "center", fontFamily: '"Space Mono", monospace', fontSize: 11, lineHeight: 1.3, transform: "rotate(8deg)", fontWeight: 700 }}>FIRST<br/>BOX<br/>$28</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {jars.slice(0,4).map((p,i) => (
            <div key={i} style={{ background: p.bg, borderRadius: 24, padding: 18, color: p.c1, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: ".2em" }}>
                <span>{p.tag || "BESTSELLER"}</span><span>0{i+1}/24</span>
              </div>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Jar c1={p.c1} c2={p.bg} label={p.l}/></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}><span>{p.n}</span><span>{p.p}</span></div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: "80px 40px 0" }}>
        <h2 style={{ fontFamily: "Yeseva One, serif", fontSize: 80, margin: "0 0 30px", fontStyle: "italic", letterSpacing: "-.015em" }}>The full pantry.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {jars.map((p,i) => (
            <article key={i} style={{ background: p.bg, borderRadius: 24, padding: 20, color: p.c1, minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ fontFamily: '"Space Mono", monospace', fontSize: 10, letterSpacing: ".18em" }}>{p.tag || `0${i+1}`}</div>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Jar c1={p.c1} c2={p.bg} label={p.l}/></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.n}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13 }}>
                  <span style={{ opacity: .75 }}>by Casa Rossa</span><span style={{ fontWeight: 700 }}>{p.p}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer style={{ background: "#1a1410", color: "#d6c8aa", padding: "60px 40px 32px", fontSize: 14, marginTop: 80 }}>
        <div style={{ fontFamily: "Yeseva One, serif", fontStyle: "italic", fontSize: 36, color: "#fff6e6" }}>Bodega 88</div>
        <div style={{ borderTop: "1px solid #3a2c20", marginTop: 24, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span>★ © 2026 Bodega 88 LLC</span><span>Instagram · TikTok · Substack</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 07 HALO — fine jewelry ───────────────────────────────────────────────────
function HaloPage() {
  const rings = [
    { n: "Solène",       p: "from $1,840", c1: "#c4a368", c2: "#e8d9b4" },
    { n: "Marin",        p: "from $2,200", c1: "#dcdcdc", c2: "#a7c0d4" },
    { n: "Iris",         p: "from $1,620", c1: "#c4a368", c2: "#b08fb8" },
    { n: "Halo Eternal", p: "from $3,400", c1: "#c4a368", c2: "#f6f0e6" },
  ];
  const earrings = [
    { n: "Vela Drop",    p: "$880",   c1: "#c4a368", c2: "#e8d9b4" },
    { n: "Sphera Stud",  p: "$640",   c1: "#dcdcdc", c2: "#f6f0e6" },
    { n: "Onde Hoop",    p: "$1,180", c1: "#c4a368", c2: "#a89066" },
    { n: "Astrid Tassel",p: "$1,420", c1: "#dcdcdc", c2: "#c4a368" },
  ];
  return (
    <div style={{ width: 1440, background: "#f6f0e6", color: "#2a221a", fontFamily: '"Manrope", sans-serif' }}>
      <div style={{ borderBottom: "1px solid #d8c8a8", padding: "9px 64px", fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "#8a7250", display: "flex", justifyContent: "space-between" }}>
        <span>Lifetime guarantee · Complimentary engraving</span><span>Made in Antwerp · 18k recycled gold · Lab-grown stones</span><span>Book a private viewing →</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "30px 64px", alignItems: "center" }}>
        <div style={{ fontFamily: '"EB Garamond", serif', fontSize: 32, letterSpacing: ".24em" }}>HALO</div>
        <div style={{ display: "flex", gap: 38, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>
          <span>Rings</span><span>Earrings</span><span>Necklaces</span><span>Bridal</span><span>The Vault</span><span>Journal</span>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 13 }}><span>Book a viewing</span><span>Account</span><span>♡</span><span>Bag</span></div>
      </nav>
      <section style={{ padding: "80px 64px 0", textAlign: "center" }}>
        <div style={{ fontFamily: '"EB Garamond", serif', fontStyle: "italic", fontSize: 20, color: "#8a7250" }}>The Heirloom Edit</div>
        <h1 style={{ fontFamily: '"EB Garamond", serif', fontWeight: 400, fontSize: 184, lineHeight: .9, margin: "20px 0 0", letterSpacing: "-.02em" }}>One ring,<br/><em>passed forward.</em></h1>
        <p style={{ fontSize: 15, lineHeight: 1.8, maxWidth: 560, margin: "32px auto 0", color: "#6f5a3a" }}>Recycled 18k gold, lab-grown stones, signed and numbered.</p>
        <div style={{ marginTop: 36, display: "inline-flex", gap: 14 }}>
          <button style={{ background: "#2a221a", color: "#f6f0e6", border: 0, padding: "14px 28px", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>Shop the edit</button>
          <button style={{ background: "transparent", color: "#2a221a", border: "1px solid #2a221a", padding: "14px 28px", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>Book a viewing →</button>
        </div>
      </section>
      <section style={{ padding: "100px 64px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32 }}>
          {rings.map((p,i) => (
            <article key={i} style={{ textAlign: "center" }}>
              <div style={{ height: 220, display: "grid", placeItems: "center", borderBottom: "1px solid #c8b896" }}><Ring c1={p.c1} c2={p.c2}/></div>
              <div style={{ fontFamily: '"EB Garamond", serif', fontSize: 26, marginTop: 18, fontStyle: "italic" }}>{p.n}</div>
              <div style={{ fontSize: 12, color: "#8a7250", letterSpacing: ".06em", marginTop: 4, textTransform: "uppercase" }}>{p.p}</div>
            </article>
          ))}
        </div>
      </section>
      <section style={{ padding: "120px 64px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontFamily: '"EB Garamond", serif', fontWeight: 400, fontSize: 84, margin: 0, letterSpacing: "-.015em" }}>For ears that listen.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 32, marginTop: 48 }}>
          {earrings.map((e,i) => (
            <div key={i} style={{ background: "#ede2cd", padding: 28, height: 320, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Earring c1={e.c1} c2={e.c2}/></div>
              <div style={{ borderTop: "1px solid #c8b896", paddingTop: 14 }}>
                <div style={{ fontFamily: '"EB Garamond", serif', fontStyle: "italic", fontSize: 22 }}>{e.n}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: "#8a7250", letterSpacing: ".06em", textTransform: "uppercase" }}>
                  <span>18k yellow</span><span>{e.p}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ background: "#2a221a", color: "#f6f0e6", margin: "120px 0 0", padding: "100px 64px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <h2 style={{ fontFamily: '"EB Garamond", serif', fontWeight: 400, fontSize: 96, lineHeight: .95, margin: 0, letterSpacing: "-.015em" }}>Bridal,<br/><em>made for two.</em></h2>
            <div style={{ marginTop: 26, display: "flex", gap: 12 }}>
              <button style={{ background: "#c4a368", color: "#2a221a", border: 0, padding: "14px 28px", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase" }}>Book a viewing</button>
            </div>
          </div>
          <div style={{ background: "linear-gradient(160deg,#c4a368,#6c4f24)", height: 460, position: "relative", display: "grid", placeItems: "center" }}>
            <Ring c1="#f6f0e6" c2="#2a221a"/>
          </div>
        </div>
      </section>
      <footer style={{ borderTop: "1px solid #c8b896", padding: "60px 64px 32px", fontSize: 13, color: "#6f5a3a" }}>
        <div style={{ fontFamily: '"EB Garamond", serif', fontSize: 28, color: "#2a221a", letterSpacing: ".24em" }}>HALO</div>
        <div style={{ borderTop: "1px solid #c8b896", marginTop: 24, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>
          <span>© 2026 HALO ATELIER BV</span><span>Privacy · Terms · Conflict-free</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 08 ATLAS — furniture & objects ──────────────────────────────────────────
function AtlasPage() {
  const objects = [
    { cat: "01 / SEATING",  n: "Vesper Lounge",   d: "S. Aalto, 2024", p: "€1,840", bg: "#bca78a", Comp: Chair, c1: "#5a4a3a", c2: "#2a221a" },
    { cat: "02 / LIGHTING", n: "Mira Sconce",     d: "K. Nakamura",    p: "€620",   bg: "#1a1a18", color: "#ededea", Comp: Lamp,  c1: "#e8c25a", c2: "#ededea" },
    { cat: "03 / TABLES",   n: "Disk Side Table", d: "L. Olsen",       p: "€480",   bg: "#a8b8a8", Comp: Chair, c1: "#3a3a30", c2: "#1a1a18" },
    { cat: "04 / SEATING",  n: "Bow Stool",       d: "Studio Atlas",   p: "€340",   bg: "#d8c4a8", Comp: Chair, c1: "#1a1a18", c2: "#c7b89a" },
    { cat: "05 / LIGHTING", n: "Column Lamp",     d: "M. Hadid",       p: "€780",   bg: "#3a4a3e", color: "#ededea", Comp: Lamp, c1: "#ededea", c2: "#c7b89a" },
    { cat: "06 / STORAGE",  n: "Modular Shelf",   d: "P. Albers",      p: "€1,240", bg: "#ededea", Comp: Chair, c1: "#5a5a4a", c2: "#bca78a" },
  ];
  return (
    <div style={{ width: 1440, background: "#ededea", color: "#1a1a18", fontFamily: '"Space Grotesk", sans-serif' }}>
      <div style={{ borderBottom: "1px solid #1a1a18", padding: "9px 40px", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
        <span>NEW · COLLECTION 03.2026</span><span>EU shipping included over €800 · 60-day return</span><span>Trade program · Studio visits</span>
      </div>
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "24px 40px", alignItems: "center", borderBottom: "1px solid #1a1a18" }}>
        <span style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-.02em" }}>ATLAS / OBJECTS</span>
        <div style={{ display: "flex", gap: 32, fontSize: 14, fontWeight: 500 }}><span>Seating</span><span>Tables</span><span>Lighting</span><span>Storage</span><span>Objects</span><span>Studio</span></div>
        <div style={{ display: "flex", gap: 14, fontSize: 14 }}><span>Search</span><span>Trade</span><span>Cart [1]</span></div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridAutoRows: "100px", gap: 1, background: "#1a1a18", padding: 1 }}>
        <div style={{ gridColumn: "1 / 8", gridRow: "1 / 5", background: "#d8c4a8", padding: 30, position: "relative" }}>
          <div style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase" }}>NEW · 03.2026</div>
          <h1 style={{ fontSize: 112, lineHeight: .9, margin: "10px 0 0", fontWeight: 500, letterSpacing: "-.03em" }}>Objects with<br/>opinions.</h1>
          <div style={{ position: "absolute", bottom: 30, left: 30, right: 30, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>22 pieces by 9 studios</span><span style={{ textDecoration: "underline" }}>View the collection →</span>
          </div>
        </div>
        <div style={{ gridColumn: "8 / 13", gridRow: "1 / 5", background: "#3a4a3e", display: "grid", placeItems: "center" }}>
          <Chair c1="#c7b89a" c2="#1a1a18"/>
        </div>
        <div style={{ gridColumn: "1 / 4", gridRow: "5 / 9", background: "#ededea", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".18em" }}>{objects[0].cat}</div>
          <div><div style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.02em" }}>{objects[0].n}</div><div style={{ fontSize: 13, color: "#6a6a66" }}>{objects[0].d} · {objects[0].p}</div></div>
        </div>
        <div style={{ gridColumn: "4 / 7", gridRow: "5 / 9", background: "#bca78a", display: "grid", placeItems: "center" }}><Chair c1="#5a4a3a" c2="#2a221a"/></div>
        <div style={{ gridColumn: "7 / 10", gridRow: "5 / 9", background: "#1a1a18", color: "#ededea", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".18em" }}>{objects[1].cat}</div>
          <Lamp c1="#e8c25a" c2="#ededea"/>
          <div><div style={{ fontSize: 30, fontWeight: 500 }}>{objects[1].n}</div><div style={{ fontSize: 13, color: "#a8a8a4" }}>{objects[1].d} · {objects[1].p}</div></div>
        </div>
        <div style={{ gridColumn: "10 / 13", gridRow: "5 / 9", background: "#a8b8a8", padding: 22, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: ".18em" }}>{objects[2].cat}</div>
          <Chair c1="#3a3a30" c2="#1a1a18"/>
          <div><div style={{ fontSize: 30, fontWeight: 500 }}>{objects[2].n}</div><div style={{ fontSize: 13, color: "#3a4a3a" }}>{objects[2].d} · {objects[2].p}</div></div>
        </div>
      </section>
      <section style={{ padding: "80px 40px 0" }}>
        <h2 style={{ fontWeight: 500, fontSize: 64, margin: "0 0 36px", letterSpacing: "-.02em" }}>The full collection.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
          {objects.map((o,i) => (
            <article key={i} style={{ background: o.bg, padding: 24, height: 480, color: o.color || "#1a1a18", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".18em" }}>{o.cat}</div>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><o.Comp c1={o.c1} c2={o.c2}/></div>
              <div style={{ borderTop: "1px solid currentColor", opacity: .8, paddingTop: 14 }}>
                <div style={{ fontSize: 24, fontWeight: 500 }}>{o.n}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13, opacity: .8 }}>
                  <span>{o.d}</span><span>{o.p}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 100, background: "#1a1a18", color: "#ededea", padding: "80px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end" }}>
          <h2 style={{ fontSize: 96, lineHeight: .9, margin: 0, fontWeight: 500, letterSpacing: "-.025em" }}>9 studios.<br/>One catalogue.</h2>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "#a8a8a4", maxWidth: 500 }}>We work with nine independent studios across Europe and Japan. Every piece is produced in small runs of 40 to 240 and shipped with its designer's signature.</p>
        </div>
      </section>
      <footer style={{ padding: "50px 40px 28px", fontSize: 13, color: "#6a6a66" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase" }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "#1a1a18" }}>ATLAS / OBJECTS</span>
          <span>© 2026 ATLAS OBJECTS S.A.S.</span><span>Privacy · Terms</span>
        </div>
      </footer>
    </div>
  );
}

// ─── 09 KINTO — Japanese tableware ───────────────────────────────────────────
function KintoPage() {
  const wares = [
    { n: "Tea Bowl",      en: "Yunomi",   p: "¥4,800",  c1: "#3a3024", c2: "#5a4a36" },
    { n: "Soup Bowl",     en: "Donburi",  p: "¥3,600",  c1: "#7a6850", c2: "#9c8a70" },
    { n: "Side Plate",    en: "Kozara",   p: "¥2,900",  c1: "#d8c8a8", c2: "#b8a888" },
    { n: "Sake Cup",      en: "Ochoko",   p: "¥1,800",  c1: "#2a241c", c2: "#4a3e2c" },
    { n: "Pour Vessel",   en: "Katakuchi",p: "¥6,400",  c1: "#a89070", c2: "#7a6248" },
    { n: "Tray",          en: "Obon",     p: "¥9,200",  c1: "#5a4a36", c2: "#3a3024" },
    { n: "Teapot",        en: "Kyusu",    p: "¥12,800", c1: "#3a2e22", c2: "#6c5a44" },
    { n: "Chopstick Set", en: "Hashi",    p: "¥3,200",  c1: "#5a4030", c2: "#1f1610" },
  ];
  return (
    <div style={{ width: 1440, background: "#f1ece1", color: "#1c1a16", fontFamily: '"Manrope", sans-serif' }}>
      <div style={{ padding: "10px 56px", fontSize: 11, letterSpacing: ".18em", color: "#7a6e54", display: "flex", justifyContent: "space-between", textTransform: "uppercase", borderBottom: "1px solid #d8d0bc" }}>
        <span>無料配送 · Worldwide shipping over ¥30,000</span><span>From the kilns of Mashiko, Tokoname &amp; Hagi</span><span>JP · EN · 한국어 · 中文</span>
      </div>
      <nav style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", padding: "26px 56px", alignItems: "center", gap: 40 }}>
        <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 26, fontWeight: 600 }}>器 KINTO</div>
        <div style={{ display: "flex", gap: 30, fontSize: 13 }}><span>Tableware</span><span>Drinkware</span><span>Tea ceremony</span><span>Sake</span><span>Bento</span><span>Stories</span></div>
        <div style={{ display: "flex", gap: 16, fontSize: 13 }}><span>JP / EN</span><span>♡ 0</span><span>Basket · 0</span></div>
      </nav>
      <section style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", height: 760, borderTop: "1px solid #d8d0bc", borderBottom: "1px solid #d8d0bc" }}>
        <div style={{ writingMode: "vertical-rl", padding: "50px 28px", fontFamily: '"Noto Serif JP", serif', fontSize: 72, letterSpacing: ".2em", color: "#2a261e", borderRight: "1px solid #d8d0bc" }}>
          無 駄 を 削 ぐ
        </div>
        <div style={{ padding: "70px 48px", borderRight: "1px solid #d8d0bc", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 15, color: "#7a6e54", letterSpacing: ".15em" }}>春 / Spring No.04</div>
            <h1 style={{ fontFamily: '"Noto Serif JP", serif', fontWeight: 500, fontSize: 100, lineHeight: 1, margin: "20px 0 0" }}>What is<br/>not there.</h1>
            <p style={{ fontSize: 15, lineHeight: 1.85, maxWidth: 380, marginTop: 28, color: "#52483a" }}>Ceramics from a small workshop in Mashiko, made in service of an empty table and a slow morning.</p>
          </div>
          <div style={{ fontSize: 13, letterSpacing: ".06em" }}>
            <span style={{ borderBottom: "1px solid #1c1a16", paddingBottom: 4 }}>Shop spring →</span>
          </div>
        </div>
        <div style={{ background: "linear-gradient(160deg,#cfc6b0,#8e8470)", position: "relative", display: "grid", placeItems: "center" }}>
          <Bowl c1="#3a3024" c2="#615648"/>
          <div style={{ position: "absolute", bottom: 24, left: 24, color: "rgba(255,255,255,.9)", fontFamily: '"Noto Serif JP", serif', fontSize: 18 }}>飯碗 — Mashiko</div>
        </div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", borderBottom: "1px solid #d8d0bc" }}>
        {wares.slice(0,5).map((p,i) => (
          <div key={i} style={{ borderRight: i < 4 ? "1px solid #d8d0bc" : "none", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ height: 84, display: "grid", placeItems: "center" }}><Bowl c1={p.c1} c2={p.c2}/></div>
            <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 14, textAlign: "center" }}>{p.n}<br/><span style={{ color: "#7a6e54", fontSize: 12 }}>{p.en} · {p.p}</span></div>
          </div>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #d8d0bc" }}>
        <div style={{ background: "linear-gradient(180deg,#a89070,#52483a)", minHeight: 560, position: "relative" }}>
          <div style={{ position: "absolute", left: 24, top: 24, color: "rgba(255,255,255,.9)", fontFamily: '"Noto Serif JP", serif', fontSize: 16, letterSpacing: ".15em" }}>窯 · Mashiko kiln no. 4</div>
          <div style={{ position: "absolute", right: 24, bottom: 24, color: "rgba(255,255,255,.85)", fontFamily: '"Noto Serif JP", serif', fontStyle: "italic", fontSize: 22 }}>柳田 健次郎 — Kenjiro Yanagida</div>
        </div>
        <div style={{ padding: "80px 56px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 14, color: "#7a6e54", letterSpacing: ".15em" }}>The maker — Yanagida 柳田</div>
          <h2 style={{ fontFamily: '"Noto Serif JP", serif', fontWeight: 500, fontSize: 64, margin: "16px 0 0", lineHeight: 1.05 }}>Fifty-two years<br/>at one wheel.</h2>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: "#52483a", marginTop: 22, maxWidth: 460 }}>Yanagida-san fires every piece himself in a wood-fueled noborigama kiln he built in 1973. We work with three studios like this.</p>
        </div>
      </section>
      <section style={{ padding: "100px 56px 0" }}>
        <h2 style={{ fontFamily: '"Noto Serif JP", serif', fontWeight: 500, fontSize: 64, margin: "0 0 36px" }}>The full table 食卓全集</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "#d8d0bc", border: "1px solid #d8d0bc" }}>
          {wares.map((p,i) => (
            <article key={i} style={{ background: "#f1ece1", padding: 24, minHeight: 280, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 11, color: "#7a6e54", letterSpacing: ".15em" }}>器 0{i+1} / 48</div>
              <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Bowl c1={p.c1} c2={p.c2}/></div>
              <div>
                <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 19 }}>{p.n} <span style={{ color: "#7a6e54", fontSize: 13 }}>· {p.en}</span></div>
                <div style={{ fontSize: 13, color: "#52483a", marginTop: 4 }}>{p.p}</div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section style={{ background: "#2a261e", color: "#e8dec4", margin: "120px 0 0", padding: "100px 56px" }}>
        <div>
          <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 14, color: "#a89070", letterSpacing: ".15em" }}>茶道具 — The tea collection</div>
          <h2 style={{ fontFamily: '"Noto Serif JP", serif', fontWeight: 500, fontSize: 84, lineHeight: 1, margin: "16px 0 0" }}>Tea is the lesson.</h2>
          <p style={{ fontSize: 15, lineHeight: 1.9, color: "#cfc6b0", marginTop: 22, maxWidth: 600 }}>Twelve pieces from masters of Mashiko, Tokoname and Hagi — for an honest morning bowl.</p>
        </div>
      </section>
      <footer style={{ borderTop: "1px solid #d8d0bc", padding: "60px 56px 32px", fontSize: 13, color: "#52483a" }}>
        <div style={{ fontFamily: '"Noto Serif JP", serif', fontSize: 22, fontWeight: 600, color: "#1c1a16" }}>器 KINTO</div>
        <div style={{ borderTop: "1px solid #d8d0bc", marginTop: 24, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: ".08em" }}>
          <span>© 2026 KINTO 株式会社 · Tokyo</span><span>無駄を削ぐ · Strip what is not needed</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────
export const STOREFRONT_TEMPLATES = [
  { id: "sf-atelier", name: "Atelier",       tag: "Fashion · Luxury",    category: "Fashion",  featured: true,  badge: "Editor's pick", Comp: AtelierPage },
  { id: "sf-pulse",   name: "Pulse Works",   tag: "Streetwear",          category: "Fashion",  badge: "New",                            Comp: PulsePage   },
  { id: "sf-mirth",   name: "Mirth",         tag: "Beauty & care",       category: "Beauty",                                            Comp: MirthPage   },
  { id: "sf-forge",   name: "Forge",         tag: "Outdoor · Gear",      category: "Outdoor",                                          Comp: ForgePage   },
  { id: "sf-tendril", name: "Tendril & Co.", tag: "Home & garden",       category: "Home",                                              Comp: TendrilPage },
  { id: "sf-bodega",  name: "Bodega 88",     tag: "Food & pantry",       category: "Food",     badge: "Popular",                        Comp: BodegaPage  },
  { id: "sf-halo",    name: "Halo",          tag: "Jewelry · Fine",      category: "Jewelry",                                           Comp: HaloPage    },
  { id: "sf-atlas",   name: "Atlas",         tag: "Furniture · Objects", category: "Home",                                              Comp: AtlasPage   },
  { id: "sf-kinto",   name: "Kinto",         tag: "Tableware · Craft",   category: "Home",                                              Comp: KintoPage   },
];

// ─── Live preview scaler (ResizeObserver) ────────────────────────────────────
export const StorefrontPreview = React.memo(function StorefrontPreview({ Comp }) {
  const wrapRef = useRef(null);
  const scalerRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scaler = scalerRef.current;
    if (!wrap || !scaler) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const s = Math.min(r.width / 1440, r.height / 900);
      scaler.style.transform = `scale(${s})`;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#fff" }}>
      <div ref={scalerRef} style={{ transformOrigin: "top left", position: "absolute", top: 0, left: 0, width: 1440, height: 900, pointerEvents: "none" }}>
        <Comp />
      </div>
    </div>
  );
});

// ─── Full-screen preview modal ─────────────────────────────────────────────────
export function StorefrontModal({ template, onClose, onUse }) {
  const stageRef  = useRef(null);
  const wrapRef   = useRef(null);
  const frameRef  = useRef(null);
  const [zoom, setZoom] = useState("fit");

  // Keyboard: Escape = close, F = toggle zoom
  useEffect(() => {
    if (!template) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key.toLowerCase() === "f") setZoom(z => z === "fit" ? "actual" : "fit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [template, onClose]);

  // Fit-to-width scaling — modal stage scrolls vertically
  useEffect(() => {
    if (!template) return;
    const fit = () => {
      const stage = stageRef.current, wrap = wrapRef.current, frame = frameRef.current;
      if (!stage || !wrap || !frame) return;
      const r = stage.getBoundingClientRect();
      const s = zoom === "actual" ? 1 : Math.min((r.width - 32) / 1440, 1);
      const naturalH = frame.scrollHeight || 900;
      frame.style.transform = `scale(${s})`;
      frame.style.transformOrigin = "top left";
      wrap.style.width  = (1440 * s) + "px";
      wrap.style.height = (naturalH * s) + "px";
    };
    const ros = [];
    if (stageRef.current) { const r = new ResizeObserver(fit); r.observe(stageRef.current); ros.push(r); }
    if (frameRef.current)  { const r = new ResizeObserver(fit); r.observe(frameRef.current);  ros.push(r); }
    const t1 = setTimeout(fit, 80);
    const t2 = setTimeout(fit, 500);
    fit();
    return () => { ros.forEach(r => r.disconnect()); clearTimeout(t1); clearTimeout(t2); };
  }, [template, zoom]);

  // Reset on template switch
  useEffect(() => {
    setZoom("fit");
    if (stageRef.current) stageRef.current.scrollTop = 0;
  }, [template]);

  if (!template) return null;
  const { Comp } = template;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal top bar */}
      <div style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 17 }}>{template.name}</span>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>{template.tag}</span>
          {template.badge && <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--accent)", letterSpacing: ".08em" }}>● {template.badge}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={() => setZoom(z => z === "fit" ? "actual" : "fit")}>
            {zoom === "fit" ? "Actual size" : "Fit to width"} <kbd style={{ fontFamily: "monospace", fontSize: 10, background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", marginLeft: 4 }}>F</kbd>
          </button>
          {onUse && (
            <button className="btn btn-primary" onClick={() => onUse(template)}>
              Use this template →
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
      </div>

      {/* Scrollable stage */}
      <div ref={stageRef} style={{ flex: 1, overflow: "auto", background: "var(--bg-deep)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 16 }}>
        <div ref={wrapRef} style={{ position: "relative", boxShadow: "0 24px 60px -16px rgba(0,0,0,.5)", background: "#fff" }}>
          <div ref={frameRef} style={{ width: 1440, transformOrigin: "top left" }}>
            <Comp />
          </div>
        </div>
      </div>
    </div>
  );
}
