/**
 * AiInputField.jsx
 *
 * A wrapper around <input> or <textarea> that adds AI assist functionality.
 *
 * Props:
 *   fieldName       {string}   — field identifier (matches assistField keys)
 *   label           {string}   — visible label
 *   type            {string}   — 'text' | 'email' | 'textarea' | 'url'
 *   value           {string}   — controlled value
 *   onChange        {fn}       — (value) => void
 *   placeholder     {string}
 *   required        {bool}
 *   aiAssisted      {bool}     — show the ✨ AI assist button
 *   hint            {string}   — helper text below field
 *   suggestions     {object}   — { fieldName: suggestionText }
 *   loadingFields   {object}   — { fieldName: bool }
 *   errors          {object}   — { fieldName: errorMsg }
 *   onFieldChange   {fn}       — (fieldName, value) => void (debounced)
 *   triggerAssist   {fn}       — (fieldName, value) => void
 *   acceptSuggestion{fn}       — (fieldName) => string
 *   dismissSuggestion{fn}      — (fieldName) => void
 */

import React from 'react';

export function AiInputField({
  fieldName,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  aiAssisted,
  hint,
  suggestions     = {},
  loadingFields   = {},
  errors          = {},
  onFieldChange,
  triggerAssist,
  acceptSuggestion,
  dismissSuggestion
}) {
  const suggestion = suggestions[fieldName];
  const isLoading  = loadingFields[fieldName];
  const error      = errors[fieldName];

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    if (aiAssisted && onFieldChange) onFieldChange(fieldName, val);
  }

  function handleAccept() {
    if (!suggestion || !acceptSuggestion) return;
    const accepted = acceptSuggestion(fieldName);
    onChange(accepted);
  }

  const inputProps = {
    id         : fieldName,
    name       : fieldName,
    value      : value || '',
    onChange   : handleChange,
    placeholder: placeholder || '',
    required   : required || false,
    className  : 'glondia-input'
  };

  return (
    <div className="ai-field" data-field={fieldName}>
      <div className="ai-field-header">
        <label htmlFor={fieldName} className="ai-field-label">
          {label}
          {required && <span className="required-star"> *</span>}
        </label>
        {aiAssisted && (
          <button
            type="button"
            className={`ai-assist-btn ${isLoading ? 'loading' : ''}`}
            onClick={() => triggerAssist && triggerAssist(fieldName, value)}
            disabled={isLoading}
            title="Get AI suggestion for this field"
          >
            {isLoading ? '⏳ Thinking…' : '✨ AI Assist'}
          </button>
        )}
      </div>

      {type === 'textarea' ? (
        <textarea {...inputProps} rows={4} style={{ resize: 'vertical' }} />
      ) : (
        <input {...inputProps} type={type} />
      )}

      {hint && !suggestion && !error && (
        <p className="ai-field-hint">{hint}</p>
      )}

      {error && (
        <p className="ai-field-error">{error}</p>
      )}

      {suggestion && (
        <div className="ai-suggestion">
          <div className="ai-suggestion-header">
            <span className="ai-suggestion-label">✨ AI suggestion</span>
            <div className="ai-suggestion-actions">
              <button type="button" className="ai-suggestion-accept" onClick={handleAccept}>
                Use this
              </button>
              <button
                type="button"
                className="ai-suggestion-dismiss"
                onClick={() => dismissSuggestion && dismissSuggestion(fieldName)}
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="ai-suggestion-text">{suggestion}</p>
        </div>
      )}
    </div>
  );
}
