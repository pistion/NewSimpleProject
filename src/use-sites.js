// use-sites.js — loads the user's builder sites from local browser storage.
import { useEffect, useMemo, useState } from 'react';
import { AUTH_CHANGED_EVENT, DATA_CHANGED_EVENT, apiRequest, getStoredAuth } from './api';

export function useSites() {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({
    sites: [],
    loading: false,
    source: 'none',
    error: null,
  });

  useEffect(() => {
    const { accessToken } = getStoredAuth();
    if (!accessToken) {
      setState({ sites: [], loading: false, source: 'none', error: null });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    apiRequest('/builder/sites')
      .then((sites) => {
        if (cancelled) return;
        setState({ sites, loading: false, source: 'api', error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ sites: [], loading: false, source: 'none', error: error.message });
      });

    return () => { cancelled = true; };
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
