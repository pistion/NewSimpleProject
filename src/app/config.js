export const APP_MODE = normalizeAppMode(import.meta.env.VITE_APP_MODE);

export const APP_MODES = {
  demo: 'demo',
  live: 'live',
  disabled: 'disabled',
};

export function isLiveMode() {
  return APP_MODE === APP_MODES.live;
}

export function isFeatureDisabled() {
  return APP_MODE === APP_MODES.disabled;
}

export function modeBlockedResult(feature) {
  return {
    status: APP_MODE === APP_MODES.disabled ? 'disabled' : 'demo',
    provider: feature,
    message: APP_MODE === APP_MODES.disabled
      ? `${feature} is disabled in this build.`
      : `${feature} is in demo mode. Set VITE_APP_MODE=live to call the server.`,
  };
}

function normalizeAppMode(value) {
  const normalized = String(value || 'demo').trim().toLowerCase();
  return Object.values(APP_MODES).includes(normalized) ? normalized : APP_MODES.demo;
}
