/**
 * useAiAssist.js
 *
 * React hook that powers per-field AI assistance in the Template Configurator.
 *
 * Features:
 *  - Debounced auto-assist: fires 900ms after the user stops typing (if value ≥ 3 chars)
 *  - Manual trigger: call triggerAssist(fieldName) at any time
 *  - One in-flight request per field at a time
 *  - Suggestions cached per field so they don't re-fetch unnecessarily
 *  - graceful no-op when OpenAI is unavailable
 */

import { useCallback, useRef, useState } from 'react';

const DEBOUNCE_MS = 900;
const MIN_CHARS   = 3;
const API_BASE    = import.meta.env.VITE_API_BASE_URL || '/api';

export function useAiAssist({ templateId, getContext }) {
  const [suggestions, setSuggestions]   = useState({});   // { fieldName: suggestionText }
  const [loadingFields, setLoadingFields] = useState({}); // { fieldName: bool }
  const [errors, setErrors]             = useState({});   // { fieldName: errorMsg }
  const debounceTimers                  = useRef({});
  const inFlight                        = useRef({});

  const callAssist = useCallback(async (fieldName, currentValue) => {
    if (inFlight.current[fieldName]) return;
    inFlight.current[fieldName] = true;

    setLoadingFields((prev) => ({ ...prev, [fieldName]: true }));
    setErrors((prev) => ({ ...prev, [fieldName]: null }));

    try {
      const resp = await fetch(`${API_BASE}/template-ai/assist`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body   : JSON.stringify({
          fieldName,
          currentValue: currentValue || '',
          context     : getContext ? getContext(fieldName) : {},
          templateId
        })
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.ok && data.suggestion) {
        setSuggestions((prev) => ({ ...prev, [fieldName]: data.suggestion }));
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, [fieldName]: 'AI assist unavailable. Try again.' }));
    } finally {
      inFlight.current[fieldName]  = false;
      setLoadingFields((prev) => ({ ...prev, [fieldName]: false }));
    }
  }, [templateId, getContext]);

  /**
   * Called on every keystroke in an AI-assisted field.
   * Debounces and fires after DEBOUNCE_MS if value is long enough.
   */
  const onFieldChange = useCallback((fieldName, value) => {
    clearTimeout(debounceTimers.current[fieldName]);
    // Clear stale suggestion when user is actively typing
    setSuggestions((prev) => ({ ...prev, [fieldName]: null }));

    if (String(value || '').length >= MIN_CHARS) {
      debounceTimers.current[fieldName] = setTimeout(() => {
        callAssist(fieldName, value);
      }, DEBOUNCE_MS);
    }
  }, [callAssist]);

  /**
   * Manual trigger — called when user clicks "✨ AI Assist" button.
   */
  const triggerAssist = useCallback((fieldName, currentValue) => {
    clearTimeout(debounceTimers.current[fieldName]);
    callAssist(fieldName, currentValue);
  }, [callAssist]);

  /**
   * Accept a suggestion — returns the text so the caller can set the field value.
   */
  const acceptSuggestion = useCallback((fieldName) => {
    const text = suggestions[fieldName] || '';
    setSuggestions((prev) => ({ ...prev, [fieldName]: null }));
    return text;
  }, [suggestions]);

  /**
   * Dismiss a suggestion without accepting.
   */
  const dismissSuggestion = useCallback((fieldName) => {
    setSuggestions((prev) => ({ ...prev, [fieldName]: null }));
  }, []);

  return {
    suggestions,
    loadingFields,
    errors,
    onFieldChange,
    triggerAssist,
    acceptSuggestion,
    dismissSuggestion
  };
}
