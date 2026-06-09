/**
 * forexService.js — Live PGK → USD forex conversion with in-memory cache.
 *
 * Business rule:
 *   - Glondia displays prices in PGK (K200 standard, K50 promo).
 *   - PayPal cannot settle PGK, so we charge the live USD equivalent.
 *   - Papua New Guinea GST (10% by default) is added on top of the
 *     converted amount before it is sent to PayPal.
 *
 * Rate source:
 *   Primary  → @fawazahmed0/currency-api (CDN-backed, no key, no rate limit)
 *   Fallback → open.er-api.com (free, daily update)
 *   Static   → implied rate from DEPLOYMENT_STANDARD_PROCESSOR_AMOUNT / 200
 *
 * Cache: rates are kept for FOREX_CACHE_TTL_MS (default 1 hour) so a fresh
 * HTTP fetch is not needed for every PayPal order creation.
 */

const CACHE_TTL_MS = Number(process.env.FOREX_CACHE_TTL_MS || 60 * 60 * 1000); // 1 hour default
const GST_PERCENT  = Number(process.env.BILLING_GST_PERCENT  ?? 10);            // PNG GST = 10 %

// Two free, key-less forex APIs. Primary uses a community CDN; fallback uses
// ExchangeRate-API's free tier (1 500 req/month, no key for /v6/latest).
const PRIMARY_URL  = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/pgk.min.json';
const FALLBACK_URL = 'https://open.er-api.com/v6/latest/PGK';

/** @type {{ rate: number|null, fetchedAt: number }} */
let _cache = { rate: null, fetchedAt: 0 };

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempt to fetch a fresh PGK→USD rate.
 * Returns null when both remotes fail so the caller can fall back gracefully.
 */
async function fetchLiveRate() {
  // ── Primary ──────────────────────────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(PRIMARY_URL);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.pgk?.usd;
      if (typeof rate === 'number' && rate > 0) {
        console.log(`[forex] PGK→USD ${rate} (primary cdn)`);
        return { rate, source: 'live:primary' };
      }
    }
  } catch (err) {
    console.warn('[forex] primary CDN failed:', err.message);
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(FALLBACK_URL);
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.USD;
      if (typeof rate === 'number' && rate > 0) {
        console.log(`[forex] PGK→USD ${rate} (fallback er-api)`);
        return { rate, source: 'live:fallback' };
      }
    }
  } catch (err) {
    console.warn('[forex] fallback er-api failed:', err.message);
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the current PGK→USD rate (with cache).
 * Falls back to stale cache, then to a static implied rate from env vars.
 * @returns {Promise<{ rate: number, source: string }>}
 */
export async function getPgkUsdRate() {
  const now = Date.now();

  // Fresh cache hit
  if (_cache.rate && (now - _cache.fetchedAt) < CACHE_TTL_MS) {
    return { rate: _cache.rate, source: 'cached' };
  }

  const live = await fetchLiveRate();
  if (live) {
    _cache = { rate: live.rate, fetchedAt: now };
    return live;
  }

  // Stale cache is better than nothing
  if (_cache.rate) {
    console.warn('[forex] all remotes failed — using stale rate:', _cache.rate);
    return { rate: _cache.rate, source: 'stale_cache' };
  }

  // Last resort: derive an implied rate from the static env var so old deploys
  // still produce a sensible USD amount rather than erroring out.
  const fallbackUsd = Number(process.env.DEPLOYMENT_STANDARD_PROCESSOR_AMOUNT || 60);
  const impliedRate = fallbackUsd / 200; // K200 ÷ static USD fallback
  console.warn(`[forex] using static implied rate ${impliedRate} (${fallbackUsd} USD / K200 PGK)`);
  return { rate: impliedRate, source: 'static_fallback' };
}

/**
 * Convert a PGK amount to the USD processor charge (forex + GST).
 *
 * Formula: USD = round2( pgkAmount × rate × (1 + GST/100) )
 * Minimum charge: US$1.00 (PayPal lower limit).
 *
 * @param {number} pgkAmount - Face value in PGK (e.g. 200 or 50)
 * @returns {Promise<{
 *   value:       string,   // '55.00'  — USD string for PayPal
 *   currency:    'USD',
 *   pgkAmount:   number,
 *   rate:        number,   // e.g. 0.2735
 *   gstPercent:  number,   // e.g. 10
 *   usdBeforeGst: number,  // informational
 *   computedAt:  string,   // ISO timestamp
 *   source:      string,   // 'live:primary' | 'cached' | 'stale_cache' | 'static_fallback'
 * }>}
 */
export async function pgkToProcessorAmount(pgkAmount) {
  const { rate, source } = await getPgkUsdRate();

  const usdBeforeGst = pgkAmount * rate;
  const usdWithGst   = usdBeforeGst * (1 + GST_PERCENT / 100);
  const rounded      = Math.max(1, Math.round(usdWithGst * 100) / 100);
  const value        = rounded.toFixed(2);

  return {
    value,
    currency:     'USD',
    pgkAmount,
    rate,
    gstPercent:   GST_PERCENT,
    usdBeforeGst: Math.round(usdBeforeGst * 100) / 100,
    computedAt:   new Date().toISOString(),
    source,
  };
}

/**
 * Fire-and-forget cache warm at server boot so the first real PayPal call
 * doesn't block on a cold forex fetch.
 */
export function warmForexCache() {
  getPgkUsdRate().catch(() => {});
}

export default { getPgkUsdRate, pgkToProcessorAmount, warmForexCache };
