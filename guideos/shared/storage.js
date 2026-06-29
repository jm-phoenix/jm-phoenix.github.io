// storage.js — LocalStorage abstraction. No DOM, no business logic.

const PREFIX = 'guideos:';

export function readItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeItem(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key) {
  localStorage.removeItem(PREFIX + key);
}

export function listKeys(prefix = '') {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX + prefix)) out.push(k.substring(PREFIX.length));
  }
  return out;
}
