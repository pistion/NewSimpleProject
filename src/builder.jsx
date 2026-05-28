// src/builder.jsx — compatibility re-export shim.
// All builder components now live in src/features/builder/.
// This file exists so any legacy import of './builder' continues to resolve.
export {
  BuilderGallery,
  BuilderTemplates,
  BuilderAiIntake,
  BuilderDeploymentSettings,
  BuilderEditor,
  BuilderImport,
  BuilderRoxanne,
} from './features/builder/index.js';
