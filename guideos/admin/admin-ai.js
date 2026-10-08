// admin-ai.js — Generador IA: conecta a cualquier endpoint compatible con
// OpenAI (chat completions) para producir GuideSpec JSON.
// El usuario configura base URL, API key, modelo y (opcional) Brave Search key
// UNA sola vez en el panel de Ajustes. Todo vive en localStorage y la key
// solo viaja al endpoint configurado.
//
// Protocolo con el modelo:
// - El modelo hace UNA pregunta a la vez para recopilar datos.
// - Si necesita datos técnicos de internet, responde SOLO con: SEARCH: <consulta>
// - La app ejecuta la búsqueda (Brave con key, o DuckDuckGo sin key),
//   inyecta los resultados como mensaje de sistema y el modelo continúa.
// - Al tener todo: responde "¡Perfecto!" + el JSON GuideSpec validado.

import { readItem, writeItem } from '../shared/storage.js';
import { validateGuideSpec } from '../shared/validation.js';
import { generateGuideId, nowIso, escapeHtml } from '../shared/utils.js';
import { alertMessage } from '../shared/dialogs.js';
import { webSearch, formatSearchContext } from '../shared/websearch.js';

const SETTINGS_KEY = 'admin:ai:settings';
const CHAT_KEY = 'admin:ai:chat';
const MAX_SEARCH_ROUNDS = 3;
const MAX_FIX_ROUNDS = 2;

export const DEFAULT_SYSTEM_PROMPT = `Eres "GuideOS Author", un redactor técnico experto que produce guías de servicio para equipos industriales en formato GuideSpec JSON v1.0.

PROTOCOLO DE CONVERSACIÓN (obligatorio):
1. Haz UNA pregunta a la vez para recopilar lo esencial: fabricante, modelo/serie del equipo, tarea a realizar, idioma de la guía (es/en), categoría (Maintenance/Repair/Installation/Troubleshooting/Inspection) y nivel de dificultad (Beginner/Intermediate/Advanced/Expert). No pidas todo de golpe.
2. Si necesitas datos técnicos de internet (especificaciones del fabricante, voltajes, torques, presiones, capacidades, procedimientos oficiales), responde ÚNICAMENTE con una línea con este formato exacto y nada más:
   SEARCH: <tu consulta de búsqueda>
   Recibirás los resultados y continuarás la conversación donde la dejaste.
3. Cuando tengas TODA la información, responde "¡Perfecto!" seguido del objeto JSON GuideSpec. Nada después del JSON.

Esquema GuideSpec v1.0 (todos los campos requeridos salvo nota):
{
  "guideSpecVersion": "1.0",
  "guide": {
    "id": "<8 caracteres hexadecimales mayúsculas, único>",
    "title": "<título corto>",
    "description": "<1-3 oraciones>",
    "version": "1.0.0",
    "language": "es" | "en",
    "category": "Maintenance" | "Repair" | "Installation" | "Troubleshooting" | "Inspection",
    "difficulty": "Beginner" | "Intermediate" | "Advanced" | "Expert",
    "estimatedMinutes": <entero>,
    "keywords": ["..."],
    "author": "AI Author",
    "created": "<ISO 8601>",
    "updated": "<ISO 8601>"
  },
  "equipment": {
    "manufacturer": "<requerido>",
    "series": "<requerido>",
    "model": "<requerido>",
    "revision": "<opcional>",
    "voltage": "<opcional, ej. '480V 3ph 60Hz'>",
    "pressure": "<opcional>"
  },
  "theme": { "enabled": false, "primaryColor": "#0054A6", "secondaryColor": "#003E7A", "accentColor": "#F59E0B" },
  "phases": [
    {
      "id": "phase-1",
      "title": "<título de fase>",
      "description": "<qué cubre>",
      "estimatedMinutes": <entero>,
      "steps": [
        {
          "id": "step-1-1",
          "title": "<título del paso>",
          "instruction": "<oración(es) en imperativo. Referencia valores de ingeniería con {placeholders} que se definen en 'entities'>",
          "estimatedMinutes": <entero opcional>,
          "warnings": ["<advertencia de seguridad>"],
          "entities": {
            "torque": { "type": "torque", "value": 25, "unit": "Nm" },
            "temp":   { "type": "temperature", "value": 80, "unit": "°C" }
          }
        }
      ]
    }
  ],
  "resources": [],
  "metadata": {}
}

REGLAS:
- Usa placeholders {nombreEntidad} en el texto de instrucción para TODO valor de ingeniería (torque, presión, temperatura, longitud, voltaje, corriente, tiempo, etc.). Define cada uno en el mapa 'entities' del paso con type + value + unit.
- Tipos de ingeniería válidos: torque, pressure, temperature, length, voltage, current, time, mass, volume, flow, power, frequency, angle.
- Unidades de temperatura: "°C" o "°F". Los demás tipos usan SI (Nm, bar, m, V, A, s, kg, L, L/min, W, Hz, deg).
- Los ids de pasos deben ser únicos en toda la guía.
- guide.id: exactamente 8 caracteres hexadecimales en mayúsculas.
- Al final, responde SOLO con el objeto JSON. Sin cercas de código si puedes evitarlo.`;

const state = {
  settings: null,
  chat: null, // {messages:[{role,content,ts}], lastJson?, lastValidation?}
  searchRounds: 0,
  fixRounds: 0,
};

function defaultSettings() {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.4,
    braveKey: '',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
}
function defaultChat() { return { messages: [], lastJson: null, lastValidation: null }; }

function loadState() {
  state.settings = readItem(SETTINGS_KEY) || defaultSettings();
  // Migración suave: ajustes viejos sin braveKey
  if (state.settings.braveKey === undefined) state.settings.braveKey = '';
  state.chat = readItem(CHAT_KEY) || defaultChat();
}
function saveSettings() { writeItem(SETTINGS_KEY, state.settings); }
function saveChat() { writeItem(CHAT_KEY, state.chat); }

export function renderAiView(container, { onDraftCreated }) {
  loadState();
  state.searchRounds = 0;
  state.fixRounds = 0;
  container.innerHTML = `
    <h2>Generador IA <small class="muted">compatible OpenAI</small></h2>
    <div class="tabs">
      <button data-ai-tab="chat" class="active">Chat</button>
      <button data-ai-tab="settings">Ajustes</button>
    </div>
    <div id="ai-body"></div>
  `;
  const body = container.querySelector('#ai-body');
  const draw = (tab) => {
    container.querySelectorAll('[data-ai-tab]').forEach((b) =>
      b.classList.toggle('active', b.dataset.aiTab === tab));
    body.innerHTML = tab === 'settings' ? settingsHtml() : chatHtml();
    if (tab === 'settings') wireSettings(body);
    else wireChat(body, onDraftCreated);
  };
  container.querySelectorAll('[data-ai-tab]').forEach((b) =>
    b.addEventListener('click', () => draw(b.dataset.aiTab)));
  draw('chat');
}

function settingsHtml() {
  const s = state.settings;
  return `
    <div class="section">
      <h3>Conexión (se configura una sola vez)</h3>
      <div class="field"><label>Endpoint (URL base)</label>
        <input id="ai-baseurl" type="text" value="${escapeHtml(s.baseUrl)}" placeholder="https://api.openai.com/v1" /></div>
      <div class="field"><label>API Key</label>
        <input id="ai-apikey" type="password" value="${escapeHtml(s.apiKey)}" placeholder="sk-..." autocomplete="off" /></div>
      <div class="row">
        <div class="field"><label>Modelo</label>
          <input id="ai-model" type="text" value="${escapeHtml(s.model)}" placeholder="gpt-4o-mini" /></div>
        <div class="field"><label>Temperature</label>
          <input id="ai-temp" type="number" min="0" max="2" step="0.1" value="${s.temperature}" /></div>
      </div>
      <div class="field"><label>Brave Search API key (opcional — para búsquedas web del asistente)</label>
        <input id="ai-bravekey" type="password" value="${escapeHtml(s.braveKey)}" placeholder="BSA-..." autocomplete="off" /></div>
      <p class="muted" style="font-size:12px">Todo se guarda localmente en tu navegador (localStorage). Las peticiones van directo de tu navegador al endpoint que configures. Sin Brave key, el asistente usa DuckDuckGo como respaldo gratuito.</p>
    </div>
    <div class="section">
      <h3>Prompt del sistema</h3>
      <div class="field"><textarea id="ai-sysprompt" rows="18" style="font-family:monospace;font-size:12px">${escapeHtml(s.systemPrompt)}</textarea></div>
      <div class="toolbar">
        <button id="ai-save" class="primary">Guardar ajustes</button>
        <button id="ai-test">Probar conexión</button>
        <button id="ai-reset-prompt">Restablecer prompt</button>
      </div>
      <div id="ai-test-result" class="muted" style="font-size:13px"></div>
    </div>`;
}

function wireSettings(body) {
  body.querySelector('#ai-save').addEventListener('click', () => {
    state.settings.baseUrl = body.querySelector('#ai-baseurl').value.trim().replace(/\/+$/, '');
    state.settings.apiKey = body.querySelector('#ai-apikey').value.trim();
    state.settings.model = body.querySelector('#ai-model').value.trim();
    state.settings.temperature = Number(body.querySelector('#ai-temp').value) || 0;
    state.settings.braveKey = body.querySelector('#ai-bravekey').value.trim();
    state.settings.systemPrompt = body.querySelector('#ai-sysprompt').value;
    saveSettings();
    alertMessage('Ajustes guardados.');
  });
  body.querySelector('#ai-test').addEventListener('click', () => testConnection(body));
  body.querySelector('#ai-reset-prompt').addEventListener('click', () => {
    body.querySelector('#ai-sysprompt').value = DEFAULT_SYSTEM_PROMPT;
  });
}

function chatHtml() {
  const s = state.settings;
  const configured = s.baseUrl && s.apiKey && s.model;
  const msgs = state.chat.messages.map((m) => `
    <div class="ai-msg ai-${m.role}">
      <div class="ai-role">${escapeHtml(m.role === 'user' ? 'Tú' : m.role === 'assistant' ? 'Asistente' : 'Sistema')}</div>
      <pre class="ai-content">${escapeHtml(m.content)}</pre>
    </div>`).join('');
  const v = state.chat.lastValidation;
  const vBlock = v ? `
    <div class="section">
      <h3>Última validación del JSON</h3>
      ${v.valid ? '<p class="ok">✓ GuideSpec válido</p>' : `<p class="error">${v.errors.length} error(es)</p>`}
      ${v.errors.map((e) => `<div class="error">${escapeHtml(e)}</div>`).join('')}
      ${v.warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join('')}
      <div class="toolbar">
        <button id="ai-create-draft" class="primary" ${v.valid ? '' : 'disabled'}>Crear borrador y editar</button>
        <button id="ai-copy-json">Copiar JSON</button>
      </div>
    </div>` : '';
  return `
    ${!configured ? '<div class="section error">Configura endpoint, API Key y modelo en la pestaña <b>Ajustes</b> primero.</div>' : ''}
    <div class="section">
      <h3>Conversación</h3>
      <div class="ai-chat" id="ai-chat">${msgs || '<p class="muted">Sin mensajes. Describe el equipo y el procedimiento para el que quieres una guía.</p>'}</div>
      <div class="field" style="margin-top:12px">
        <textarea id="ai-input" rows="3" placeholder="Ej.: Genera una guía de mantenimiento preventivo trimestral para una bomba centrífuga Goulds 3196, con puntos de lubricación, torques y pasos de seguridad."></textarea>
      </div>
      <div class="toolbar">
        <button id="ai-send" class="primary">Enviar</button>
        <button id="ai-clear">Limpiar chat</button>
        <span id="ai-status" class="muted"></span>
      </div>
    </div>
    ${vBlock}`;
}

function rerender(body, onDraftCreated) {
  body.innerHTML = chatHtml();
  wireChat(body, onDraftCreated);
  const chat = body.querySelector('#ai-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function wireChat(body, onDraftCreated) {
  const status = () => body.querySelector('#ai-status');
  body.querySelector('#ai-clear')?.addEventListener('click', () => {
    state.chat = defaultChat(); saveChat();
    state.searchRounds = 0; state.fixRounds = 0;
    rerender(body, onDraftCreated);
  });
  const send = async () => {
    const ta = body.querySelector('#ai-input');
    const text = ta.value.trim();
    if (!text) return;
    pushMsg('user', text);
    ta.value = '';
    rerender(body, onDraftCreated);
    const btn = body.querySelector('#ai-send');
    btn.disabled = true;
    try {
      await chatRound(body, onDraftCreated);
    } catch (err) {
      pushMsg('assistant', `[error] ${err.message}`);
      saveChat();
    } finally {
      rerender(body, onDraftCreated);
    }
  };
  body.querySelector('#ai-send')?.addEventListener('click', send);
  body.querySelector('#ai-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
  });
  body.querySelector('#ai-create-draft')?.addEventListener('click', () => {
    const obj = state.chat.lastJson;
    if (!obj) return;
    if (!obj.guide?.id || !/^[0-9A-F]{8}$/.test(obj.guide.id)) {
      obj.guide = { ...(obj.guide || {}), id: generateGuideId() };
    }
    onDraftCreated(obj);
  });
  body.querySelector('#ai-copy-json')?.addEventListener('click', async () => {
    if (!state.chat.lastJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.chat.lastJson, null, 2));
      alertMessage('JSON copiado.');
    } catch { alertMessage('No se pudo copiar.'); }
  });
  function pushMsg(role, content) {
    state.chat.messages.push({ role, content, ts: nowIso() });
    saveChat();
  }

  async function chatRound(bodyEl, onDraft) {
    const s = state.settings;
    if (!s.baseUrl || !s.apiKey || !s.model) throw new Error('Configura el endpoint, API Key y modelo primero.');
    status().textContent = 'Contactando al modelo…';
    const reply = await callModel();
    pushMsg('assistant', reply);

    // 1) ¿El modelo pide una búsqueda web?
    const searchMatch = reply.match(/^SEARCH:\s*(.+)$/m);
    if (searchMatch && state.searchRounds < MAX_SEARCH_ROUNDS) {
      const query = searchMatch[1].trim();
      state.searchRounds += 1;
      status().textContent = `Buscando en la web: ${query}`;
      try {
        const results = await webSearch(query, s.braveKey);
        pushMsg('system', formatSearchContext(query, results));
      } catch (e) {
        pushMsg('system', `La búsqueda web falló (${e.message}). Continúa con tu conocimiento y avisa al usuario de qué datos no pudiste verificar.`);
      }
      await chatRound(bodyEl, onDraft); // continúa la conversación
      return;
    }

    // 2) ¿Trae JSON? -> validar
    const obj = tryParseJson(reply);
    if (obj) {
      const v = validateGuideSpec(obj);
      state.chat.lastJson = obj;
      state.chat.lastValidation = v;
      saveChat();
      if (!v.valid && state.fixRounds < MAX_FIX_ROUNDS) {
        state.fixRounds += 1;
        pushMsg('system', `El JSON tiene ${v.errors.length} error(es) de validación:\n- ${v.errors.join('\n- ')}\n\nCorrige el JSON completo y devuélvelo de nuevo (sin explicaciones fuera del JSON).`);
        await chatRound(bodyEl, onDraft);
        return;
      }
      if (v.valid) {
        // 3) JSON válido -> pasa AUTOMÁTICAMENTE al editor
        onDraft(obj);
        return;
      }
    }
    status().textContent = '';
  }
}

async function callModel() {
  const s = state.settings;
  const messages = [
    { role: 'system', content: s.systemPrompt },
    ...state.chat.messages.map((m) => ({ role: m.role === 'system' ? 'system' : m.role, content: m.content })),
  ];
  const url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.model,
      temperature: s.temperature,
      messages,
      // Sin response_format: el modelo necesita texto libre para preguntar
      // y emitir líneas SEARCH:. El JSON se extrae y valida en el cliente.
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${t.substring(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Respuesta inesperada del modelo (sin choices[0].message.content)');
  return content;
}

// Prueba la conexión con los valores actuales del formulario (sin necesidad
// de guardar primero). Hace una petición mínima y explica el fallo en
// lenguaje claro: red/CORS, key inválida, modelo/endpoint mal, cuota, etc.
async function testConnection(body) {
  const out = body.querySelector('#ai-test-result');
  const say = (cls, html) => { out.innerHTML = `<span class="${cls}">${html}</span>`; };
  const baseUrl = body.querySelector('#ai-baseurl').value.trim().replace(/\/+$/, '');
  const apiKey = body.querySelector('#ai-apikey').value.trim();
  const model = body.querySelector('#ai-model').value.trim();
  if (!baseUrl || !apiKey || !model) {
    say('error', 'Completa endpoint, API Key y modelo antes de probar.');
    return;
  }
  say('muted', 'Probando conexión…');
  const url = baseUrl + '/chat/completions';
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Responde únicamente con la palabra: OK' }],
      }),
    });
  } catch (e) {
    // En Safari un fallo de red o de CORS llega como TypeError ("Load failed"):
    // la petición nunca salió del navegador.
    say('error', 'No se pudo contactar el endpoint (' + escapeHtml(e.message) + '). Revisa que la URL esté bien escrita, que tengas internet, y que el endpoint acepte llamadas desde el navegador: algunos, como el API de NVIDIA (integrate.api.nvidia.com), no tienen CORS habilitado y solo funcionan desde un servidor.');
    return;
  }
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 401) hint = 'API Key inválida o ausente. Verifica la key.';
    else if (res.status === 403) hint = 'Acceso denegado por el endpoint.';
    else if (res.status === 404) hint = 'No encontrado. Verifica que el endpoint sea solo la URL base (sin /chat/completions al final) y que el nombre del modelo sea correcto.';
    else if (res.status === 429) hint = 'Límite de uso excedido o sin crédito en tu cuenta.';
    else if (res.status >= 500) hint = 'Error interno del endpoint. Intenta de nuevo en unos minutos.';
    say('error', `El endpoint respondió ${res.status} ${escapeHtml(res.statusText)}. ${hint} Detalle: ${escapeHtml(t.substring(0, 220))}`);
    return;
  }
  let data;
  try { data = await res.json(); }
  catch {
    say('error', 'El endpoint respondió 200 pero no devolvió JSON válido.');
    return;
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    say('error', 'Respuesta inesperada: no trae choices[0].message.content. ¿Es un endpoint compatible con OpenAI?');
    return;
  }
  say('ok', `✓ Conexión exitosa en ${ms} ms. El modelo respondió: “${escapeHtml(content.trim().substring(0, 80))}”. Ya puedes usar el chat.`);
}

function tryParseJson(text) {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const obj = JSON.parse(raw.slice(a, b + 1));
    state.chat.lastJson = obj;
    state.chat.lastValidation = validateGuideSpec(obj);
    saveChat();
    return obj;
  } catch {
    return null;
  }
}
