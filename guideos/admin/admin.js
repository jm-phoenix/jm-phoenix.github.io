// admin.js — Consola de creación de guías GuideOS.
// Vistas: 'chat' (generador IA) | 'editor' (doble vista JSON + WYSIWYG).
// El JSON es el documento maestro: borradores en localStorage,
// "Bajar JSON" para backup, "Subir JSON" para editar, "Exportar HTML"
// como entregable principal.

import { readItem, writeItem, removeItem, listKeys } from '../shared/storage.js';
import { validateGuideSpec } from '../shared/validation.js';
import { generateGuideId, nowIso, escapeHtml } from '../shared/utils.js';
import { alertMessage, confirmAction } from '../shared/dialogs.js';
import { renderGuideHtml } from '../shared/render.js';
import { buildThemeVariables } from '../shared/theme.js';
import { renderAiView } from './admin-ai.js?v=2';
import { downloadStandaloneHtml, downloadJson } from './export-html.js';

const DRAFT_PREFIX = 'guideos:draft:';
const DRAFT_SUFFIX = DRAFT_PREFIX.substring('guideos:'.length); // 'draft:' (storage.js antepone 'guideos:')

const state = {
  drafts: [], // [{key, draft}]
  currentKey: null,
  view: 'chat', // 'chat' | 'editor'
};

const $ = (sel) => document.querySelector(sel);

function draftKey(id) {
  return DRAFT_SUFFIX + id; // clave completa: guideos:draft:<ID>
}

function emptyDraft() {
  return {
    guideSpecVersion: '1.0',
    guide: {
      id: generateGuideId(),
      title: 'Nueva guía',
      description: '',
      version: '1.0.0',
      language: 'es',
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
      { id: 'phase-1', title: 'Fase 1', description: '', estimatedMinutes: 10,
        steps: [{ id: 'step-1', title: 'Paso 1', instruction: 'Describe la acción.', entities: {} }] },
    ],
    resources: [],
    metadata: {},
  };
}

function loadDrafts() {
  state.drafts = listKeys(DRAFT_SUFFIX)
    .map((key) => ({ key, draft: readItem(key) }))
    .filter((d) => d.draft && d.draft.guide);
}

function currentDraft() {
  return state.drafts.find((d) => d.key === state.currentKey)?.draft || null;
}

function persistCurrent() {
  const d = currentDraft();
  if (!d) return;
  d.guide.updated = nowIso();
  writeItem(state.currentKey, d);
}

function createDraft(initial) {
  const draft = initial || emptyDraft();
  if (!draft.guide?.id || !/^[0-9A-F]{8}$/.test(draft.guide.id)) {
    draft.guide = { ...(draft.guide || {}), id: generateGuideId() };
  }
  const key = draftKey(draft.guide.id);
  writeItem(key, draft);
  loadDrafts();
  state.currentKey = key;
  showEditor();
}

// ---------- Sidebar ----------

function renderSidebar() {
  const ul = $('#draft-list');
  ul.innerHTML = state.drafts.map(({ key, draft }) => `
    <li class="${key === state.currentKey ? 'active' : ''}">
      <a data-key="${escapeHtml(key)}">${escapeHtml(draft.guide.title || '(sin título)')}<br><small>${escapeHtml(draft.guide.id)}</small></a>
      <button data-delete="${escapeHtml(key)}" title="Borrar">✕</button>
    </li>`).join('') || '<li class="muted">Sin borradores</li>';
  ul.querySelectorAll('a[data-key]').forEach((a) => {
    a.addEventListener('click', () => { state.currentKey = a.dataset.key; showEditor(); });
  });
  ul.querySelectorAll('button[data-delete]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirmAction('¿Borrar este borrador?')) return;
      removeItem(b.dataset.delete);
      if (state.currentKey === b.dataset.delete) state.currentKey = null;
      loadDrafts();
      renderSidebar();
      if (state.view === 'editor' && !currentDraft()) showChat();
      else if (state.view === 'editor') renderEditor();
    });
  });
}

// ---------- Vistas ----------

function setNav() {
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === state.view));
}

function showChat() {
  state.view = 'chat';
  setNav();
  const main = $('#editor');
  renderAiView(main, { onDraftCreated: (obj) => createDraft(obj) });
  renderSidebar();
}

function showEditor() {
  state.view = 'editor';
  setNav();
  renderEditor();
  renderSidebar();
}

let editorTimer = null;

function renderEditor() {
  const d = currentDraft();
  const main = $('#editor');
  if (!d) {
    main.innerHTML = '<p class="muted">Selecciona un borrador o crea uno nuevo con el chat IA.</p>';
    return;
  }
  const json = JSON.stringify(d, null, 2);
  main.innerHTML = `
    <h2>${escapeHtml(d.guide.title || '(sin título)')} <small class="muted">${escapeHtml(d.guide.id)}</small></h2>
    <div class="toolbar">
      <button id="ed-download-json">Bajar JSON</button>
      <button id="ed-export-html" class="primary">Exportar HTML</button>
      <span id="ed-status" class="muted"></span>
    </div>
    <div class="dual">
      <section class="pane">
        <h3>JSON (documento maestro — editable)</h3>
        <textarea id="ed-json" spellcheck="false">${escapeHtml(json)}</textarea>
      </section>
      <section class="pane">
        <h3>Vista previa (WYSIWYG)</h3>
        <div id="ed-preview" class="preview"></div>
      </section>
    </div>`;
  const ta = $('#ed-json');
  const preview = $('#ed-preview');
  const status = $('#ed-status');

  const apply = () => {
    let obj;
    try {
      obj = JSON.parse(ta.value);
    } catch (e) {
      status.innerHTML = `<span class="error">JSON inválido: ${escapeHtml(e.message)}</span>`;
      return;
    }
    const v = validateGuideSpec(obj);
    if (!v.valid) {
      status.innerHTML = `<span class="error">${v.errors.length} error(es): ${escapeHtml(v.errors.slice(0, 3).join('; '))}${v.errors.length > 3 ? '…' : ''}</span>`;
      return;
    }
    status.innerHTML = `<span class="ok">✓ Válido${v.warnings.length ? ` (${v.warnings.length} aviso(s))` : ''}</span>`;
    // Aplica tema de la guía a la vista previa
    const vars = buildThemeVariables(obj.theme);
    for (const [k, val] of Object.entries(vars)) preview.style.setProperty(k, val);
    preview.innerHTML = renderGuideHtml(obj);
    // Persiste el borrador
    const key = draftKey(obj.guide.id);
    obj.guide.updated = nowIso();
    writeItem(key, obj);
    if (key !== state.currentKey) { state.currentKey = key; loadDrafts(); renderSidebar(); }
    else { const rec = state.drafts.find((x) => x.key === key); if (rec) rec.draft = obj; }
  };

  ta.addEventListener('input', () => {
    clearTimeout(editorTimer);
    editorTimer = setTimeout(apply, 400);
  });
  apply();

  $('#ed-download-json').addEventListener('click', () => {
    const cur = currentDraft();
    if (cur) downloadJson(cur);
  });
  $('#ed-export-html').addEventListener('click', () => {
    let obj;
    try { obj = JSON.parse(ta.value); }
    catch { alertMessage('El JSON tiene errores de sintaxis.'); return; }
    const v = validateGuideSpec(obj);
    if (!v.valid) { alertMessage(`No se puede exportar: ${v.errors.length} error(es).\n- ${v.errors.slice(0, 5).join('\n- ')}`); return; }
    persistCurrent();
    downloadStandaloneHtml(obj);
    alertMessage('HTML exportado. También puedes bajar el JSON como respaldo.');
  });
}

// ---------- Subir JSON ----------

function handleUpload(file) {
  if (!file) return;
  file.text().then((text) => {
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { alertMessage('Archivo inválido: ' + e.message); return; }
    const v = validateGuideSpec(obj);
    if (!v.valid) {
      alertMessage(`El JSON tiene ${v.errors.length} error(es):\n- ${v.errors.slice(0, 5).join('\n- ')}\n\nSe cargará como borrador para que lo corrijas.`);
    }
    createDraft(obj);
  }).catch((e) => alertMessage('No se pudo leer el archivo: ' + e.message));
}

// ---------- Init ----------

$('#view-chat').addEventListener('click', showChat);
$('#view-new').addEventListener('click', () => createDraft());
$('#view-upload').addEventListener('click', () => $('#upload-file').click());
$('#upload-file').addEventListener('change', (e) => {
  handleUpload(e.target.files?.[0]);
  e.target.value = '';
});

loadDrafts();
const params = new URLSearchParams(location.search);
if (params.get('mode') === 'upload') {
  showChat();
  // Abre el selector de archivo directo (modo "Editar mi JSON")
  setTimeout(() => { try { $('#upload-file').click(); } catch {} }, 300);
} else {
  showChat();
}
