import { useEffect, useMemo, useState } from 'react';
import {
  AUTH_CHANGED_EVENT,
  DATA_CHANGED_EVENT,
  apiRequest,
  getStoredAuth,
  listSslCertificates,
  listRegisteredDomains,
  getRegistrarSettings,
  mapApiDnsRecord,
  mapApiDomain,
  listDnsRecords,
} from './api';
import { isLiveMode } from './app/config.js';

/**
 * Load domains for the dashboard.
 * - Live mode: registrar inventory only (never GD mock domains).
 * - Demo mode: local workspace store; empty if none.
 */
export function useDomains() {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({
    domains: [],
    loading: true,
    source: 'idle',
    error: null,
    providerConfigured: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: null }));

      if (isLiveMode()) {
        try {
          let providerConfigured = null;
          try {
            const settings = await getRegistrarSettings();
            providerConfigured = Boolean(settings?.configured);
          } catch {
            providerConfigured = false;
          }

          if (providerConfigured === false) {
            if (!cancelled) {
              setState({
                domains: [],
                loading: false,
                source: 'registrar',
                error: null,
                providerConfigured: false,
              });
            }
            return;
          }

          const result = await listRegisteredDomains(0, 100);
          const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
          if (!cancelled) {
            setState({
              domains: items.map(mapApiDomain),
              loading: false,
              source: 'registrar',
              error: null,
              providerConfigured: providerConfigured !== false,
            });
          }
        } catch (error) {
          if (!cancelled) {
            // Never fall back to demo domains in live mode.
            setState({
              domains: [],
              loading: false,
              source: 'registrar',
              error: error.message || 'Could not load domains.',
              providerConfigured: null,
            });
          }
        }
        return;
      }

      // Demo / local workspace mode
      const { accessToken } = getStoredAuth();
      if (!accessToken) {
        if (!cancelled) {
          setState({
            domains: [],
            loading: false,
            source: 'demo',
            error: null,
            providerConfigured: false,
          });
        }
        return;
      }

      try {
        const domains = await apiRequest('/domains');
        if (!cancelled) {
          setState({
            domains: (Array.isArray(domains) ? domains : []).map(mapApiDomain),
            loading: false,
            source: 'api',
            error: null,
            providerConfigured: false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            domains: [],
            loading: false,
            source: 'demo',
            error: error.message,
            providerConfigured: false,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [version]);

  useDataVersion(setVersion);
  return useMemo(() => state, [state]);
}

export function useDnsRecords(domainParam) {
  const { domains, source: domainsSource, providerConfigured } = useDomains();
  const [version, setVersion] = useState(0);
  const domain = domains.find((item) => item.id === domainParam || item.name === domainParam);
  const [state, setState] = useState({
    records: [],
    loading: false,
    source: 'idle',
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!domainParam) {
        setState({ records: [], loading: false, source: 'idle', error: null });
        return;
      }

      setState((current) => ({ ...current, loading: true, error: null }));

      if (isLiveMode()) {
        if (providerConfigured === false) {
          if (!cancelled) {
            setState({
              records: [],
              loading: false,
              source: 'registrar',
              error: null,
            });
          }
          return;
        }
        try {
          const name = domain?.name || domainParam;
          const records = await listDnsRecords(name);
          if (!cancelled) {
            setState({
              records: Array.isArray(records) ? records : [],
              loading: false,
              source: 'registrar',
              error: null,
            });
          }
        } catch (error) {
          if (!cancelled) {
            setState({
              records: [],
              loading: false,
              source: 'registrar',
              error: error.message || 'Could not load DNS records.',
            });
          }
        }
        return;
      }

      const { accessToken } = getStoredAuth();
      if (!accessToken || !domain?.id || domainsSource !== 'api') {
        if (!cancelled) {
          setState({ records: [], loading: false, source: 'demo', error: null });
        }
        return;
      }

      try {
        const records = await apiRequest(`/domains/${domain.id}/dns-records`);
        if (!cancelled) {
          setState({
            records: (Array.isArray(records) ? records : []).map(mapApiDnsRecord),
            loading: false,
            source: 'api',
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            records: [],
            loading: false,
            source: 'demo',
            error: error.message,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [domain?.id, domain?.name, domainParam, domainsSource, providerConfigured, version]);

  useDataVersion(setVersion);
  return useMemo(() => ({ ...state, domain }), [state, domain]);
}

export function useSslCertificates(domainId) {
  const [state, setState] = useState({ certs: [], loading: false, error: null });

  useEffect(() => {
    const { accessToken } = getStoredAuth();
    if (!accessToken || !domainId) {
      setState({ certs: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    listSslCertificates(domainId)
      .then((certs) => {
        if (cancelled) return;
        setState({ certs: Array.isArray(certs) ? certs : [], loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ certs: [], loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [domainId]);

  return state;
}

function useDataVersion(setVersion) {
  useEffect(() => {
    const handleDataChange = () => setVersion((current) => current + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, handleDataChange);
    window.addEventListener(DATA_CHANGED_EVENT, handleDataChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleDataChange);
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChange);
    };
  }, [setVersion]);
}
