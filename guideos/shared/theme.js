// theme.js — Theme application. Pure: returns CSS variables; caller sets them.

import { validateThemeColor } from './validation.js';

export function buildThemeVariables(theme) {
  const vars = {};
  if (!theme || theme.enabled === false) return vars;
  if (validateThemeColor(theme.primaryColor)) vars['--color-primary'] = theme.primaryColor;
  if (validateThemeColor(theme.secondaryColor)) vars['--color-secondary'] = theme.secondaryColor;
  if (validateThemeColor(theme.accentColor)) vars['--color-accent'] = theme.accentColor;
  return vars;
}
