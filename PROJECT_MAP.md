# Project map — Glondiasites

## Top-level directories

| Directory  | Role                                                                                           |
|------------|------------------------------------------------------------------------------------------------|
| `src/`     | **React frontend** — Vite SPA, all customer-facing UI and the internal workspace dashboard     |
| `server/`  | **Active Express backend** — ESM modules, JSON file-backed stores, OpenAI integration          |
| `landing/` | **Public marketing page** — static HTML/CSS served at `/`                                      |
| `backend/` | **Legacy / future NestJS backend** — not active in production; do not run alongside `server/`  |

## Frontend feature layout (`src/`)

```
src/
├── App.jsx                  Main shell and view-based router
├── features/
│   ├── auth/                Login and signup pages
│   └── builder/             Site builder feature (all screens)
│       ├── index.js         Barrel export — import everything from here
│       ├── pages/           Customer-facing builder screens
│       │   ├── BuilderGallery.jsx      Landing / "Launch your website" hero
│       │   ├── TemplateGallery.jsx     Template picker (storefront + HTML)
│       │   ├── AiTemplateSetup.jsx     AI intake questionnaire
│       │   └── DeploymentSettings.jsx  Final deploy config + live preview
│       ├── advanced/        Internal / advanced flows
│       │   ├── BuilderEditor.jsx       Full site editor + AI chat panel
│       │   ├── BuilderImport.jsx       GitHub repository import flow
│       │   └── BuilderRoxanne.jsx      RoxanneAI generation flow
│       ├── templates/       Template data (no API calls)
│       │   ├── storefront-templates.jsx  9 storefront designs
│       │   └── html/
│       │       ├── pulse-works.js      Pulse Works multi-page HTML template
│       │       └── forge.js            Forge multi-page HTML template
│       └── utils/
│           └── builderHelpers.js       Shared utilities (slugify, clamp, …)
└── builder.jsx              Compatibility shim — re-exports from features/builder
```

## Backend layout (`server/`)

```
server/
├── index.js                 Express entry point
├── routes/                  Route handlers
│   ├── builder.js           Builder CRUD (sites, pages, publish)
│   ├── template-ai.js       AI template generation and deploy endpoints
│   ├── hosting.js           Render deployment management
│   └── …
├── services/
│   ├── openai.js            OpenAI client — reads OPENAI_API_KEY server-side only
│   └── …
└── data/                    JSON file-backed stores (gitignored in production)
```

## Route → component mapping

| App.jsx `view` key             | Component                  | File                                      |
|-------------------------------|----------------------------|-------------------------------------------|
| `builder-gallery`             | `BuilderGallery`           | `features/builder/pages/BuilderGallery`   |
| `builder-templates`           | `BuilderTemplates`         | `features/builder/pages/TemplateGallery`  |
| `builder-ai-intake`           | `BuilderAiIntake`          | `features/builder/pages/AiTemplateSetup`  |
| `builder-deployment-settings` | `BuilderDeploymentSettings`| `features/builder/pages/DeploymentSettings` |
| `builder-editor`              | `BuilderEditor`            | `features/builder/advanced/BuilderEditor` |
| `builder-import`              | `BuilderImport`            | `features/builder/advanced/BuilderImport` |
| `builder-roxanne`             | `BuilderRoxanne`           | `features/builder/advanced/BuilderRoxanne`|

## Security constraints

- `OPENAI_API_KEY` is read **only** from `process.env` on the server. It is never in any `VITE_` variable and never sent to the client.
- Do not log API keys, auth tokens, or raw customer secrets.
- Do not pass server env values or credentials to OpenAI — only template HTML and user-provided business details.
