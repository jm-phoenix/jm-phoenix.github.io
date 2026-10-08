// guide.js — Controlador del visor. Carga el GuideSpec, navega y actualiza el DOM.

import { validateGuideSpec } from '../shared/validation.js';
import { buildThemeVariables } from '../shared/theme.js';
import { readItem, writeItem } from '../shared/storage.js';
import { copyText } from '../shared/clipboard.js';
import { escapeHtml } from '../shared/utils.js';
import { renderStepHtml, buildDudaUrl } from '../shared/render.js';

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
  return `../guides/${id.substring(0, 2)}/${id}.json`;
}

async function loadGuide() {
  const id = getGuideIdFromUrl();
  let response;
  try {
    response = await fetch(guidePathFromId(id));
  } catch (e) {
    showError('No se pudo cargar la guía.');
    return;
  }
  if (!response.ok) { showError(`Guía no encontrada: ${id}`); return; }
  let spec;
  try { spec = await response.json(); } catch { showError('JSON de GuideSpec inválido'); return; }

  const result = validateGuideSpec(spec);
  if (!result.valid) {
    showError('Validación fallida: ' + result.errors.join('; '));
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
  document.getElementById('progress-label').textContent = `${pct}% completado`;
}

function currentStep() {
  const phase = state.spec.phases[state.currentPhaseIndex];
  return { phase, step: phase.steps[state.currentStepIndex] };
}

function renderStep() {
  const { phase, step } = currentStep();
  const pref = state.unitsPreference;
  const out = [];

  // Contenido del paso (render compartido)
  out.push(renderStepHtml(step, phase, state.spec, pref, { duda: true }));

  // Notas del técnico (local)
  const notes = readItem(`viewer:notes:${state.spec.guide.id}:${step.id}`, '');
  out.push(`
    <div class="step-section notes">
      <h4>Notas del técnico</h4>
      <textarea id="step-notes" placeholder="Las notas se guardan localmente en este dispositivo">${escapeHtml(notes)}</textarea>
    </div>`);

  out.push(`
    <div class="step-section">
      <label><input type="checkbox" id="mark-complete" ${state.completed.has(step.id) ? 'checked' : ''}/> Marcar paso como completado</label>
    </div>`);

  out.push(`
    <div class="step-nav">
      <button id="prev-step">← Anterior</button>
      <button id="next-step" class="primary">Siguiente →</button>
    </div>`);

  const main = document.getElementById('step-view');
  main.innerHTML = out.join('');

  main.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = decodeURIComponent(btn.dataset.copy);
      const ok = await copyText(text);
      btn.textContent = ok ? 'Copiado' : 'Falló';
      setTimeout(() => (btn.textContent = 'Copiar'), 1500);
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

  // Panel de dudas → Google AI Mode (Gemini) con contexto del paso
  const dudaBtn = main.querySelector('.duda-btn');
  const dudaPanel = main.querySelector('.duda-panel');
  if (dudaBtn && dudaPanel) {
    dudaBtn.addEventListener('click', () => {
      if (!dudaPanel.classList.contains('hidden')) {
        dudaPanel.classList.add('hidden');
        dudaPanel.innerHTML = '';
        return;
      }
      dudaPanel.classList.remove('hidden');
      dudaPanel.innerHTML = `
        <input type="text" id="duda-q" placeholder="Ej.: ¿qué torque uso si no tengo torquímetro?" aria-label="Tu duda sobre este paso" />
        <button id="duda-ask" class="primary">Preguntar a Gemini</button>`;
      const input = dudaPanel.querySelector('#duda-q');
      input.focus();
      const ask = () => {
        const q = input.value.trim();
        if (!q) { input.focus(); return; }
        window.open(buildDudaUrl(state.spec, step, q), '_blank', 'noopener');
      };
      dudaPanel.querySelector('#duda-ask').addEventListener('click', ask);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(); });
    });
  }

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
