# Glondia Deploy Templates

This folder holds deploy-ready template source projects. These are separate from the lightweight preview templates shown in the builder UI.

The template deploy engine expects this shape:

```text
templates/
  pulse-works/
    template.json
    package.json
    index.html
    vite.config.js
    src/
  forge/
    template.json
    package.json
    index.html
    vite.config.js
    src/
```

Each template is a light Vite React app with client-side routes and placeholder tokens such as `{{businessName}}`, `{{offer}}`, `{{contactEmail}}`, and `{{slug}}`. The deploy pipeline copies the source, replaces known placeholders from the customer brief, and uses the manifest build settings:

```json
{
  "buildCommand": "npm run build",
  "publishDirectory": "dist"
}
```

Do not commit `node_modules`, `.env`, `.env.local`, or generated `dist` output here. Render can install dependencies during deployment from each template's `package.json`.
