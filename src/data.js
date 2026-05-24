// data.js - shared reference data for the Glondia app
// All dynamic content (projects, deployments, domains, etc.) is loaded from the API.
// Shells are kept here so hooks have a safe initial/fallback value of [].

// Set TEMPLATES_REPO to the GitHub (or GitLab) repository where your template
// source files live. Each template's folder must match its id (e.g. /linen, /harbor).
// When set, a "View source" link appears on every template card in the gallery.
export const TEMPLATES_REPO = ''; // e.g. 'https://github.com/yourname/glondia-templates'

export const GD = {
  brand: {
    name: "Glondia",
    tagline: "Hosting, domains, and starter sites - in one workspace.",
  },

  // Dynamic - populated from API. Empty until user logs in.
  projects: [],
  deployments: [],
  buildLog: [],
  envVars: [],
  environments: [],
  myDomains: [],
  dnsRecords: [],
  activity: [],

  // Reference data.
  tldPrices: [
    { tld: ".com", price: 14.99, renewal: 16.99 },
    { tld: ".co", price: 24.99, renewal: 26.99 },
    { tld: ".io", price: 39.99, renewal: 49.99 },
    { tld: ".app", price: 16.99, renewal: 18.99 },
    { tld: ".dev", price: 14.99, renewal: 16.99 },
    { tld: ".org", price: 12.49, renewal: 14.49 },
    { tld: ".net", price: 11.99, renewal: 13.99 },
    { tld: ".store", price: 4.99, renewal: 58.99 },
    { tld: ".shop", price: 1.99, renewal: 34.99 },
  ],

  templates: [
    { id: "portfolio",    name: "Portfolio",      category: "Portfolio",     tagline: "Show your work. Land the client.",             accent: "#1a1f1d", surface: "#f9f7f4", motif: "monogram"  },
    { id: "small-biz",   name: "Small Business", category: "Business",      tagline: "From quote to booking in minutes.",            accent: "#1d4e6e", surface: "#f0f4f7", motif: "stripes"  },
    { id: "restaurant",  name: "Restaurant",     category: "Food & Drink",  tagline: "A menu worth sitting down for.",               accent: "#7c2d12", surface: "#fdf6ee", motif: "menu"     },
    { id: "photography", name: "Photography",    category: "Creative",      tagline: "Full-bleed images, nothing in the way.",       accent: "#1a1f1d", surface: "#0a0a0a", motif: "grid"     },
    { id: "agency",      name: "Agency",         category: "Business",      tagline: "Case studies that close deals.",               accent: "#2a4d9a", surface: "#f4f6fb", motif: "blocks"   },
    { id: "blog",        name: "Blog",           category: "Publishing",    tagline: "Long-form writing with room to breathe.",      accent: "#198754", surface: "#fafafa", motif: "lines"    },
    { id: "saas",        name: "SaaS",           category: "Technology",    tagline: "Hero, features, pricing. Ship it.",            accent: "#6d28d9", surface: "#0f0f14", motif: "gradient" },
    { id: "event",       name: "Event",          category: "Events",        tagline: "Build anticipation, sell the night.",          accent: "#c2410c", surface: "#09090b", motif: "spotlight" },
    { id: "nonprofit",   name: "Nonprofit",      category: "Community",     tagline: "Mission first. Donations follow.",             accent: "#065f46", surface: "#f0faf6", motif: "leaf"     },
  ],

  regions: [
    "Sydney (syd1)",
    "Singapore (sin1)",
    "Tokyo (nrt1)",
    "Frankfurt (fra1)",
    "Virginia (iad1)",
    "Sao Paulo (gru1)",
  ],

  frameworks: [
    "Next.js",
    "Astro",
    "SvelteKit",
    "Vite + React",
    "Vue + Nuxt",
    "Remix",
    "Static HTML",
  ],

  // Builder template defaults - null until user enters real content in the builder.
  templateDefaults: null,
};
