// admin.js — Administration Console controller.

import { readItem, writeItem, removeItem, listKeys } from '/shared/storage.js';
import { validateGuideSpec } from '/shared/validation.js';
import { generateGuideId, nowIso, deepClone, escapeHtml } from '/shared/utils.js';
import { copyText } from '/shared/clipboard.js';
import { confirmAction, promptText, alertMessage } from '/shared/dialogs.js';
import { renderAiView } from './admin-ai.js';

const DRAFT_PREFIX = 'admin:draft:';

const state = {
  drafts: [], // list of {key, draft}
  currentKey: null,
  activeTab: 'metadata', // metadata | equipment | theme | phases | validate | publish
  view: 'drafts', // 'drafts' | 'ai'
};

function emptyDraft() {
  return {
    guideSpecVersion: '1.0',
    guide: {
      id: generateGuideId(),
      title: 'New Guide',
      description: '',
      version: '1.0.0',
      language: 'en',
      category: 'Maintenance',
      difficulty: 'Intermediate',
      estimatedMinutes: 30,
      keywords: [],
      author: '',
      created: nowIso(),
      updated: nowIso(),
    },
    equipment: { manufacturer: '', series: '', model: '' },
    theme: { enabled: false, primaryColor: '#0054A6', secondaryColor: '#003E7A', accentColor: '#F59E0B' },
    phases: [
      { id: 'phase-1', title: 'Phase 1', description: '', estimatedMinutes: 10,
        steps: [{ id: 'step-1', title: 'Step 1', instruction: 'Describe the action.', entities: {} }]
      },
    ],
    resources: [],
    metadata: {},
  };
}

function loadDrafts() {
  state.drafts = listKeys(DRAFT_PREFIX.substring('guideos:'.length)).map((key) => {
    return { key, draft: readItem(key) };
  }).filter((d) => d.draft);
}

function currentDraft() {
  if (!state.currentKey) return null;
  return state.drafts.find((d) => d.key === state.currentKey)?.draft || null;
}

function persistCurrent() {
  const d = currentDraft();
  if (!d) return;
  d.guide.updated = nowIso();
  writeItem(state.currentKey, d);
}

function renderSidebar() {
  const ul = document.getElementById('draft-list');
  ul.innerHTML = state.drafts.map(({ key, draft }) => `
    <li class="${key === state.currentKey ? 'active' : ''}">
      <a data-key="${escapeHtml(key)}">${escapeHtml(draft.guide.title || '(untitled)')}<br><small>${escapeHtml(draft.guide.id)}</small></a>
      <button data-delete="${escapeHtml(key)}" title="Delete">✕</button>
    </li>
  `).join('') || '<li class="muted">No drafts yet</li>';
  ul.querySelectorAll('a[data-key]').forEach((a) => {
    a.addEventListener('click', () => { state.currentKey = a.dataset.key; renderAll(); });
  });
  ul.querySelectorAll('button[data-delete]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirmAction('Delete this draft?')) return;
      removeItem(b.dataset.delete);
      if (state.currentKey === b.dataset.delete) state.currentKey = null;
      loadDrafts(); renderAll();
    });
  });
}

function renderEditor() {
  const main = document.getElementById('editor');
  if (state.view === 'ai') {
    renderAiView(main, { onDraftCreated: (obj) => { state.view = 'drafts'; createDraft(obj); } });
    return;
  }
  const d = currentDraft();
  if (!d) {
    main.innerHTML = '<p class="muted">Select a draft from the sidebar, click <b>+ New Draft</b>, or use <b>AI Generator</b>.</p>';
    return;
  }
  const tabs = ['metadata', 'equipment', 'theme', 'phases', 'validate', 'publish'];
  const tabsHtml = `<div class="tabs">${tabs.map((t) => `<button data-tab="${t}" class="${state.activeTab === t ? 'active' : ''}">${t}</button>`).join('')}</div>`;
  let body = '';
  switch (state.activeTab) {
    case 'metadata': body = renderMetadata(d); break;
    case 'equipment': body = renderEquipment(d); break;
    case 'theme': body = renderTheme(d); break;
    case 'phases': body = renderPhases(d); break;
    case 'validate': body = renderValidate(d); break;
    case 'publish': body = renderPublish(d); break;
  }
  main.innerHTML = `<h2>${escapeHtml(d.guide.title)} <small class="muted">${escapeHtml(d.guide.id)}</small></h2>${tabsHtml}${body}`;
  main.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => { state.activeTab = b.dataset.tab; renderEditor(); });
  });
  wireFieldHandlers();
}

function inputField(label, path, value, type = 'text') {
  return `<div class="field"><label>${escapeHtml(label)}</label><input data-path="${path}" type="${type}" value="${escapeHtml(value ?? '')}" /></div>`;
}
function textareaField(label, path, value) {
  return `<div class="field"><label>${escapeHtml(label)}</label><textarea data-path="${path}" rows="3">${escapeHtml(value ?? '')}</textarea></div>`;
}

function renderMetadata(d) {
  return `
    <div class="section">
      <h3>Guide Metadata</h3>
      ${inputField('Title', 'guide.title', d.guide.title)}
      ${textareaField('Description', 'guide.description', d.guide.description)}
      <div class="row">
        ${inputField('Version', 'guide.version', d.guide.version)}
        ${inputField('Language', 'guide.language', d.guide.language)}
      </div>
      <div class="row">
        ${inputField('Category', 'guide.category', d.guide.category)}
        ${inputField('Difficulty', 'guide.difficulty', d.guide.difficulty)}
      </div>
      <div class="row">
        ${inputField('Estimated Minutes', 'guide.estimatedMinutes', d.guide.estimatedMinutes, 'number')}
        ${inputField('Author', 'guide.author', d.guide.author)}
      </div>
      ${inputField('Keywords (comma separated)', 'guide.keywords', (d.guide.keywords || []).join(', '))}
    </div>`;
}

function renderEquipment(d) {
  return `
    <div class="section">
      <h3>Equipment</h3>
      <div class="row">
        ${inputField('Manufacturer *', 'equipment.manufacturer', d.equipment.manufacturer)}
        ${inputField('Series *', 'equipment.series', d.equipment.series)}
      </div>
      <div class="row">
        ${inputField('Model *', 'equipment.model', d.equipment.model)}
        ${inputField('Revision', 'equipment.revision', d.equipment.revision)}
      </div>
      <div class="row">
        ${inputField('Voltage', 'equipment.voltage', d.equipment.voltage)}
        ${inputField('Pressure', 'equipment.pressure', d.equipment.pressure)}
      </div>
    </div>`;
}

function renderTheme(d) {
  const t = d.theme || {};
  return `
    <div class="section">
      <h3>Theme</h3>
      <div class="field"><label><input type="checkbox" data-path="theme.enabled" ${t.enabled ? 'checked' : ''}/> Enable manufacturer theme</label></div>
      <div class="row">
        ${inputField('Primary color', 'theme.primaryColor', t.primaryColor, 'color')}
        ${inputField('Secondary color', 'theme.secondaryColor', t.secondaryColor, 'color')}
      </div>
      ${inputField('Accent color', 'theme.accentColor', t.accentColor, 'color')}
    </div>`;
}

function renderPhases(d) {
  const phases = d.phases.map((p, pi) => {
    const steps = p.steps.map((s, si) => `
      <div class="section" style="background:var(--color-surface)">
        <header><h3>Step ${si + 1}: ${escapeHtml(s.title)}</h3>
          <button data-delete-step="${pi}:${si}" class="danger">Delete</button>
        </header>
        ${inputField('Step ID', `phases.${pi}.steps.${si}.id`, s.id)}
        ${inputField('Title', `phases.${pi}.steps.${si}.title`, s.title)}
        ${textareaField('Instruction (use {entityName} placeholders)', `phases.${pi}.steps.${si}.instruction`, s.instruction)}
        ${inputField('Estimated Minutes', `phases.${pi}.steps.${si}.estimatedMinutes`, s.estimatedMinutes, 'number')}
        ${textareaField('Entities (JSON)', `phases.${pi}.steps.${si}.entities`, JSON.stringify(s.entities || {}, null, 2))}
      </div>`).join('');
    return `
      <div class="section">
        <header><h3>Phase ${pi + 1}</h3>
          <div style="display:flex;gap:8px">
            <button data-add-step="${pi}">+ Step</button>
            <button data-delete-phase="${pi}" class="danger">Delete Phase</button>
          </div>
        </header>
        ${inputField('Phase ID', `phases.${pi}.id`, p.id)}
        ${inputField('Title', `phases.${pi}.title`, p.title)}
        ${textareaField('Description', `phases.${pi}.description`, p.description)}
        ${steps}
      </div>`;
  }).join('');
  return `<div class="toolbar"><button id="add-phase">+ Add Phase</button></div>${phases}`;
}

function renderValidate(d) {
  const result = validateGuideSpec(d);
  const errors = result.errors.map((e) => `<div class="error">${escapeHtml(e)}</div>`).join('');
  const warnings = result.warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join('');
  const status = result.valid ? '<p class="ok">✓ GuideSpec is valid</p>' : `<p class="error">${result.errors.length} error(s)</p>`;
  return `<div class="section"><h3>Validation</h3>${status}<div class="validation-results">${errors}${warnings}</div></div>`;
}

function renderPublish(d) {
  const result = validateGuideSpec(d);
  const json = JSON.stringify(d, null, 2);
  return `
    <div class="section">
      <h3>Publish (Compile to GuideSpec)</h3>
      ${result.valid
        ? `<p class="ok">Draft passes validation. Download or copy the GuideSpec JSON below and place it under <code>/guides/${d.guide.id.substring(0,2)}/${d.guide.id}.json</code>, then add an entry to <code>/guides/index.json</code>.</p>`
        : `<p class="error">Validation must pass before publishing. ${result.errors.length} error(s) remain.</p>`}
      <div class="toolbar">
        <button id="copy-json" ${!result.valid ? 'disabled' : ''}>Copy JSON</button>
        <button id="download-json" class="primary" ${!result.valid ? 'disabled' : ''}>Download GuideSpec</button>
      </div>
      <pre class="json-output">${escapeHtml(json)}</pre>
    </div>`;
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = isNaN(parts[i]) ? parts[i] : Number(parts[i]);
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  cur[isNaN(last) ? last : Number(last)] = value;
}

function wireFieldHandlers() {
  const d = currentDraft();
  if (!d) return;

  document.querySelectorAll('[data-path]').forEach((el) => {
    el.addEventListener('input', () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') v = Number(v);
      if (el.dataset.path === 'guide.keywords') v = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (el.dataset.path.endsWith('.entities')) {
        try { v = JSON.parse(el.value || '{}'); el.style.borderColor = ''; }
        catch { el.style.borderColor = 'var(--color-danger)'; return; }
      }
      setByPath(d, el.dataset.path, v);
      persistCurrent();
      if (['guide.title'].includes(el.dataset.path)) renderSidebar();
    });
  });

  document.getElementById('add-phase')?.addEventListener('click', () => {
    const n = d.phases.length + 1;
    d.phases.push({ id: `phase-${n}`, title: `Phase ${n}`, description: '', estimatedMinutes: 10,
      steps: [{ id: `step-${n}-1`, title: 'New step', instruction: '', entities: {} }] });
    persistCurrent(); renderEditor();
  });
  document.querySelectorAll('[data-add-step]').forEach((b) => b.addEventListener('click', () => {
    const pi = Number(b.dataset.addStep);
    const sn = d.phases[pi].steps.length + 1;
    d.phases[pi].steps.push({ id: `step-${pi+1}-${sn}`, title: `Step ${sn}`, instruction: '', entities: {} });
    persistCurrent(); renderEditor();
  }));
  document.querySelectorAll('[data-delete-phase]').forEach((b) => b.addEventListener('click', () => {
    if (!confirmAction('Delete this phase?')) return;
    d.phases.splice(Number(b.dataset.deletePhase), 1);
    persistCurrent(); renderEditor();
  }));
  document.querySelectorAll('[data-delete-step]').forEach((b) => b.addEventListener('click', () => {
    if (!confirmAction('Delete this step?')) return;
    const [pi, si] = b.dataset.deleteStep.split(':').map(Number);
    d.phases[pi].steps.splice(si, 1);
    persistCurrent(); renderEditor();
  }));

  document.getElementById('copy-json')?.addEventListener('click', async () => {
    const ok = await copyText(JSON.stringify(d, null, 2));
    alertMessage(ok ? 'GuideSpec copied to clipboard.' : 'Copy failed.');
  });
  document.getElementById('download-json')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.guide.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function renderAll() {
  renderSidebar();
  renderEditor();
}

function createDraft(initial) {
  const draft = initial || emptyDraft();
  const key = DRAFT_PREFIX.substring('guideos:'.length) + draft.guide.id;
  writeItem(key, draft);
  loadDrafts();
  state.currentKey = key;
  state.activeTab = 'metadata';
  renderAll();
}

document.getElementById('new-draft').addEventListener('click', () => { state.view = 'drafts'; createDraft(); });
document.getElementById('view-drafts').addEventListener('click', () => { state.view = 'drafts'; renderEditor(); });
document.getElementById('view-ai').addEventListener('click', () => { state.view = 'ai'; renderEditor(); });
document.getElementById('import-draft').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    if (!obj.guide?.id) obj.guide = { ...(obj.guide || {}), id: generateGuideId() };
    createDraft(obj);
  } catch (err) {
    alertMessage('Failed to import: ' + err.message);
  }
  e.target.value = '';
});

loadDrafts();
if (state.drafts.length === 0) createDraft();
else { state.currentKey = state.drafts[0].key; renderAll(); }
