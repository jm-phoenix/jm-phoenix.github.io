// dialogs.js — Minimal user dialog wrappers.

export function confirmAction(message) {
  return window.confirm(message);
}
export function promptText(message, defaultValue = '') {
  return window.prompt(message, defaultValue);
}
export function alertMessage(message) {
  window.alert(message);
}
