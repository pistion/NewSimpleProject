import React from 'react';

export function Notice({ type = 'muted', children }) {
  if (!children) return null;
  const color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--accent)' : 'var(--text-muted)';
  return <div className="hosting-notice" style={{ color }}>{children}</div>;
}

export function SectionActions({ children }) {
  return <div className="hosting-section-actions">{children}</div>;
}

export function EmptyRows({ message }) {
  return <p className="muted" style={{ margin: 0, fontSize: 13 }}>{message}</p>;
}
