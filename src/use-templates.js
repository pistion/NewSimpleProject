// use-templates.js — loads the template catalogue from the local app API.
// Falls back to the local GD.templates reference data so the gallery always renders
// even when the user isn't logged in or the API is unreachable.
//
// Visual metadata (accent colour, surface colour, motif, tagline) is kept in
// GD.templates because those are pure front-end design concerns. The hook merges
// them with the authoritative list returned by the API.

import { useEffect, useMemo, useState } from 'react';
import {
  AUTH_CHANGED_EVENT,
  DATA_CHANGED_EVENT,
  apiRequest,
  getStoredAuth,
  mapApiTemplate,
} from './api';
import { GD } from './data';

export function useTemplates() {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({
    templates: GD.templates,
    loading: false,
    source: 'local',
    error: null,
  });

  useEffect(() => {
    const { accessToken } = getStoredAuth();

    if (!accessToken) {
      setState({ templates: GD.templates, loading: false, source: 'local', error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    apiRequest('/builder/templates')
      .then((apiTemplates) => {
        if (cancelled) return;

        // Merge API list with local visual metadata (accent, surface, motif, tagline).
        // Any template the API adds beyond the local set gets sensible visual defaults.
        const merged = apiTemplates.map((raw) => {
          const api = mapApiTemplate(raw);
          const local = GD.templates.find((g) => g.id === api.id) || {};
          return {
            // Local visual data first, then override with API authoritative fields
            accent:   local.accent   || '#1a1f1d',
            surface:  local.surface  || '#f4f4f4',
            motif:    local.motif    || 'monogram',
            tagline:  local.tagline  || '',
            ...api,
          };
        });

        setState({
          // If the DB isn't seeded yet, keep the local set so the gallery isn't blank
          templates: merged.length ? merged : GD.templates,
          loading: false,
          source: 'api',
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ templates: GD.templates, loading: false, source: 'local', error: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    const handleChange = () => setVersion((v) => v + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, handleChange);
    window.addEventListener(DATA_CHANGED_EVENT, handleChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleChange);
      window.removeEventListener(DATA_CHANGED_EVENT, handleChange);
    };
  }, []);

  return useMemo(() => state, [state]);
}
