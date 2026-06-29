// guide.js — Viewer controller. Loads GuideSpec, drives navigation, updates DOM.

import { validateGuideSpec } from '/shared/validation.js';
import { resolveInstruction, renderEntity } from '/shared/entities.js';
import { buildThemeVariables } from '/shared/theme.js';
import { readItem, writeItem } from '/shared/storage.js';
import { copyText } from '/shared/clipboard.js';
import { escapeHtml } from '/shared/utils.js';

const state = {
  spec: null,
  currentPhaseIndex: 0,
  currentStepIndex: 0,
  unitsPreference: readItem('viewer:units', 'auto'),
  theme: readItem('viewer:theme', 'light'),
  completed: new Set(),
};

function showError(message) {
  const el = document.getElementById('error-banner');
  el.textContent = message;
  el.classList.remove('hidden');
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  if (state.spec?.theme) {
    const vars = buildThemeVariables(state.spec.theme);
    for (const [k, v] of Object.entries(vars)) {
      document.documentElement.style.setProperty(k, v);
    }
  }
}

function getGuideIdFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get('id') || '8F35A198';
}

function guidePathFromId(id) {
  return `/guides/${id.substring(0, 2)}/${id}.json`;
}

async function loadGuide() {
  const id = getGuideIdFromUrl();
  let response;
  try {
    response = await fetch(guidePathFromId(id));
  } catch (e) {
    showError('Failed to fetch guide.');
    return;
  }
  if (!response.ok) { showError(`Guide not found: ${id}`); return; }
  let spec;
  try { spec = await response.json(); } catch { showError('Invalid GuideSpec JSON'); return; }

  const result = validateGuideSpec(spec);
  if (!result.valid) {
    showError('Validation failed: ' + result.errors.join('; '));
    return;
  }
  state.spec = spec;
  state.completed = new Set(readItem(`viewer:progress:${spec.guide.id}`, []));
  document.title = `${spec.guide.title} — GuideOS`;
  document.getElementById('guide-title').textContent = spec.guide.title;
  applyTheme();
  renderTOC();
  renderStep();
}

function totalSteps() {
  return state.spec.phases.reduce((n, p) => n + p.steps.length, 0);
}

function renderTOC() {
  const toc = document.getElementById('toc');
  const out = [];
  out.push('<ul>');
  state.spec.phases.forEach((phase, pi) => {
    out.push(`<li class="phase-title">${escapeHtml(phase.title)}</li>`);
    phase.steps.forEach((step, si) => {
      const active = pi === state.currentPhaseIndex && si === state.currentStepIndex;
      const done = state.completed.has(step.id);
      out.push(
        `<li><a href="#" class="step-link ${active ? 'active' : ''} ${done ? 'completed' : ''}" data-phase="${pi}" data-step="${si}">${escapeHtml(step.title)}</a></li>`
      );
    });
  });
  out.push('</ul>');
  toc.innerHTML = out.join('');
  toc.querySelectorAll('.step-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.currentPhaseIndex = Number(a.dataset.phase);
      state.currentStepIndex = Number(a.dataset.step);
      renderTOC();
      renderStep();
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  updateProgress();
}

function updateProgress() {
  const total = totalSteps();
  const pct = total === 0 ? 0 : Math.round((state.completed.size / total) * 100);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${pct}% complete`;
}

function currentStep() {
  const phase = state.spec.phases[state.currentPhaseIndex];
  return { phase, step: phase.steps[state.currentStepIndex] };
}

function renderStep() {
  const { phase, step } = currentStep();
  const pref = state.unitsPreference;
  const instructionHtml = escapeHtml(resolveInstruction(step.instruction, step.entities, pref));
  const out = [];
  out.push(`<p class="muted">${escapeHtml(phase.title)}</p>`);
  out.push(`<h2>${escapeHtml(step.title)}</h2>`);
  if (step.estimatedMinutes) out.push(`<p class="muted">Estimated: ${step.estimatedMinutes} min</p>`);
  out.push(`<p class="instruction">${instructionHtml}</p>`);

  if (Array.isArray(step.warnings) && step.warnings.length) {
    out.push('<div class="step-section"><h4>Warnings</h4>');
    for (const w of step.warnings) out.push(`<div class="warning">${escapeHtml(w)}</div>`);
    out.push('</div>');
  }

  if (step.entities) {
    const tools = [], parts = [], chems = [];
    for (const [name, e] of Object.entries(step.entities)) {
      if (e.type === 'tool') tools.push(`<li>${escapeHtml(renderEntity(e, pref))}</li>`);
      else if (e.type === 'part') parts.push(`<li>${escapeHtml(renderEntity(e, pref))}</li>`);
      else if (e.type === 'chemical') chems.push(`<li>${escapeHtml(renderEntity(e, pref))}</li>`);
    }
    if (tools.length) out.push(`<div class="step-section"><h4>Required Tools</h4><ul class="entity-list">${tools.join('')}</ul></div>`);
    if (parts.length) out.push(`<div class="step-section"><h4>Required Parts</h4><ul class="entity-list">${parts.join('')}</ul></div>`);
    if (chems.length) out.push(`<div class="step-section"><h4>Chemicals</h4><ul class="entity-list">${chems.join('')}</ul></div>`);
  }

  if (Array.isArray(step.dependencies) && step.dependencies.length) {
    out.push(`<div class="step-section"><h4>Prerequisites</h4><ul class="entity-list">${step.dependencies.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>`);
  }

  if (Array.isArray(step.codeBlocks)) {
    for (const cb of step.codeBlocks) {
      const code = escapeHtml(cb.code || '');
      out.push(`<div class="code-block"><button class="copy" data-copy="${encodeURIComponent(cb.code || '')}">Copy</button><pre>${code}</pre></div>`);
    }
  }

  const notes = readItem(`viewer:notes:${state.spec.guide.id}:${step.id}`, '');
  out.push(`
    <div class="step-section notes">
      <h4>Technician Notes</h4>
      <textarea id="step-notes" placeholder="Notes are saved locally on this device">${escapeHtml(notes)}</textarea>
    </div>`);

  out.push(`
    <div class="step-section">
      <label><input type="checkbox" id="mark-complete" ${state.completed.has(step.id) ? 'checked' : ''}/> Mark step complete</label>
    </div>`);

  out.push(`
    <div class="step-nav">
      <button id="prev-step">← Previous</button>
      <button id="next-step" class="primary">Next →</button>
    </div>`);

  const main = document.getElementById('step-view');
  main.innerHTML = out.join('');

  main.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.dataset.copy);
      const ok = await copyText(text);
      btn.textContent = ok ? 'Copied' : 'Failed';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
  });

  document.getElementById('step-notes').addEventListener('input', (e) => {
    writeItem(`viewer:notes:${state.spec.guide.id}:${step.id}`, e.target.value);
  });

  document.getElementById('mark-complete').addEventListener('change', (e) => {
    if (e.target.checked) state.completed.add(step.id);
    else state.completed.delete(step.id);
    writeItem(`viewer:progress:${state.spec.guide.id}`, [...state.completed]);
    renderTOC();
  });

  document.getElementById('prev-step').addEventListener('click', () => navigate(-1));
  document.getElementById('next-step').addEventListener('click', () => navigate(1));
  window.scrollTo(0, 0);
}

function navigate(delta) {
  let pi = state.currentPhaseIndex;
  let si = state.currentStepIndex + delta;
  while (si < 0) { pi -= 1; if (pi < 0) { pi = 0; si = 0; break; } si = state.spec.phases[pi].steps.length - 1; }
  while (pi < state.spec.phases.length && si >= state.spec.phases[pi].steps.length) { si = 0; pi += 1; }
  if (pi >= state.spec.phases.length) { pi = state.spec.phases.length - 1; si = state.spec.phases[pi].steps.length - 1; }
  state.currentPhaseIndex = pi;
  state.currentStepIndex = si;
  renderTOC();
  renderStep();
}

// init
document.getElementById('units-pref').value = state.unitsPreference;
document.getElementById('units-pref').addEventListener('change', (e) => {
  state.unitsPreference = e.target.value;
  writeItem('viewer:units', state.unitsPreference);
  if (state.spec) renderStep();
});
document.getElementById('toggle-theme').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  writeItem('viewer:theme', state.theme);
  applyTheme();
});
document.getElementById('toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

applyTheme();
loadGuide();
