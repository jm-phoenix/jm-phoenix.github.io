// localization.js — Minimal localization layer. Pure.

const STRINGS = {
  en: {
    'app.viewer': 'Guide Viewer',
    'app.admin': 'Administration Console',
    'nav.previous': 'Previous',
    'nav.next': 'Next',
    'nav.phases': 'Phases',
    'progress.complete': 'Complete',
    'step.tools': 'Required Tools',
    'step.parts': 'Required Parts',
    'step.warnings': 'Warnings',
    'step.dependencies': 'Prerequisites',
    'step.resources': 'Resources',
    'step.notes': 'Technician Notes',
    'units.auto': 'Auto',
    'units.metric': 'Metric',
    'units.imperial': 'Imperial',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'errors.invalidJson': 'Invalid GuideSpec JSON',
    'errors.notFound': 'Guide not found',
  },
};

let currentLanguage = 'en';

export function setLanguage(lang) {
  if (STRINGS[lang]) currentLanguage = lang;
}

export function translate(key) {
  return STRINGS[currentLanguage]?.[key] ?? STRINGS.en[key] ?? key;
}
