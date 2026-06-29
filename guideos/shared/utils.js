// utils.js — Generic utility helpers. No DOM access.

export function generateGuideId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isHexGuideId(id) {
  return typeof id === 'string' && /^[0-9A-F]{8}$/.test(id);
}

export function nowIso() {
  return new Date().toISOString();
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
