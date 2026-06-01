export const DEPLOY_PRESETS = [
  { id: 'static-html', label: 'Static HTML', description: 'Plain HTML/CSS/JS website.', serviceType: 'static_site', buildCommand: 'bash glondia-render-build.sh', publishDirectory: '.' },
  { id: 'vite-react', label: 'Vite React', description: 'Modern React static site built with Vite.', serviceType: 'static_site', buildCommand: 'bash glondia-render-build.sh', publishDirectory: 'dist' },
  { id: 'create-react-app', label: 'Create React App', description: 'React app with react-scripts.', serviceType: 'static_site', buildCommand: 'bash glondia-render-build.sh', publishDirectory: 'build' },
  { id: 'nextjs', label: 'Next.js', description: 'Next.js server-rendered app.', serviceType: 'web_service', runtime: 'node', buildCommand: 'npm install && npm run build', startCommand: 'npm start' },
  { id: 'express-api', label: 'Express API', description: 'Node/Express backend service.', serviceType: 'web_service', runtime: 'node', buildCommand: 'npm install', startCommand: 'npm start' },
  { id: 'node-web-app', label: 'Node Web App', description: 'Generic Node web service.', serviceType: 'web_service', runtime: 'node', buildCommand: 'npm install && npm run build', startCommand: 'npm start' },
];
