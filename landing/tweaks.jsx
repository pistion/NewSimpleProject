// Tweaks panel for Glondia
const { useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentPalette": ["#5BFF8F", "#5BFF8F", "#8CFFB5", "#2D8050", "rgba(91,255,143,0.18)"],
  "bgMode": "noir",
  "showGrid": true,
  "scanlines": false,
  "h1Text": "Market intelligence at the speed of a terminal"
}/*EDITMODE-END*/;

// 4 curated accent palettes — each is [accent, accent, accent-bright, accent-dim, accent-glow]
const ACCENT_PALETTES = [
  ["#5BFF8F", "#5BFF8F", "#8CFFB5", "#2D8050", "rgba(91,255,143,0.18)"],   // terminal green (default)
  ["#FFB23B", "#FFB23B", "#FFD580", "#8A5E1F", "rgba(255,178,59,0.18)"],   // amber CRT
  ["#6EAFFF", "#6EAFFF", "#A8CDFF", "#2E5A8A", "rgba(110,175,255,0.18)"],  // tron blue
  ["#FF5C9C", "#FF5C9C", "#FF9AC2", "#8A2E5A", "rgba(255,92,156,0.18)"],   // magenta-pink
];

const BG_MODES = {
  noir:  { "--bg": "#0A0D0A", "--bg-elev": "#11150F", "--bg-card": "#0D110D", "--bg-line": "#0F140F" },
  black: { "--bg": "#000000", "--bg-elev": "#070907", "--bg-card": "#040604", "--bg-line": "#020402" },
  paper: { "--bg": "#F4F2EA", "--bg-elev": "#EBE9E0", "--bg-card": "#FFFFFF", "--bg-line": "#EFEDE3" },
};

function applyTweaks(t) {
  const root = document.documentElement;

  // accent palette
  const [c1, accent, bright, dim, glow] = t.accentPalette;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-bright", bright);
  root.style.setProperty("--accent-dim", dim);
  root.style.setProperty("--accent-glow", glow);

  // background
  const bg = BG_MODES[t.bgMode] || BG_MODES.noir;
  Object.entries(bg).forEach(([k, v]) => root.style.setProperty(k, v));

  // paper mode = invert text tokens
  if (t.bgMode === "paper") {
    root.style.setProperty("--text", "#1A1F1B");
    root.style.setProperty("--text-dim", "#5A6358");
    root.style.setProperty("--text-faint", "#8A9388");
    root.style.setProperty("--text-ghost", "#C4C9C2");
    root.style.setProperty("--border", "#D6D2C4");
    root.style.setProperty("--border-bright", "#B8B4A4");
    root.style.setProperty("--border-glow", "#A0A090");
  } else {
    root.style.setProperty("--text", "#E8E8DC");
    root.style.setProperty("--text-dim", "#8A9388");
    root.style.setProperty("--text-faint", "#4A5550");
    root.style.setProperty("--text-ghost", "#2C3530");
    root.style.setProperty("--border", "#1E2A20");
    root.style.setProperty("--border-bright", "#2E4030");
    root.style.setProperty("--border-glow", "#3D5A40");
  }

  // grid
  document.body.style.backgroundImage = t.showGrid
    ? `radial-gradient(${t.bgMode === "paper" ? "rgba(45,128,80,0.10)" : "rgba(91,255,143,0.04)"} 1px, transparent 1px)`
    : "none";

  // scanlines
  let sl = document.getElementById("__scanlines");
  if (t.scanlines) {
    if (!sl) {
      sl = document.createElement("div");
      sl.id = "__scanlines";
      sl.style.cssText = `
        position:fixed;inset:0;pointer-events:none;z-index:9999;
        background-image:repeating-linear-gradient(
          to bottom,
          rgba(0,0,0,0) 0,
          rgba(0,0,0,0) 2px,
          rgba(0,0,0,0.12) 2px,
          rgba(0,0,0,0.12) 3px
        );
        mix-blend-mode:multiply;
      `;
      document.body.appendChild(sl);
    }
  } else if (sl) {
    sl.remove();
  }

  // headline text
  const h1 = document.querySelector(".hero h1");
  if (h1 && t.h1Text) {
    // preserve .swap structure by highlighting the last word
    const txt = t.h1Text.trim();
    const words = txt.split(/\s+/);
    if (words.length > 1) {
      const head = words.slice(0, -1).join(" ");
      const tail = words.slice(-1)[0];
      h1.innerHTML = `${head} <span class="swap">${tail}</span>`;
    } else {
      h1.innerHTML = `<span class="swap">${txt}</span>`;
    }
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => { applyTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Accent" />
        <TweakColor
          label="Palette"
          value={t.accentPalette}
          onChange={(v) => setTweak("accentPalette", v)}
          options={ACCENT_PALETTES}
        />

      <TweakSection label="Background" />
        <TweakRadio
          label="Mode"
          value={t.bgMode}
          onChange={(v) => setTweak("bgMode", v)}
          options={["noir", "black", "paper"]}
        />
        <TweakToggle
          label="Dot grid"
          value={t.showGrid}
          onChange={(v) => setTweak("showGrid", v)}
        />
        <TweakToggle
          label="CRT scanlines"
          value={t.scanlines}
          onChange={(v) => setTweak("scanlines", v)}
        />

      <TweakSection label="Copy" />
        <TweakText
          label="Headline"
          value={t.h1Text}
          onChange={(v) => setTweak("h1Text", v)}
        />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<App />);
