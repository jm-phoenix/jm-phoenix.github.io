// admin-ai.js — AI Generator: connects to any OpenAI-compatible chat completions
// endpoint to produce GuideSpec JSON. The user supplies base URL, API key and
// model from the Settings panel. All values are stored in localStorage and
// never leave the browser except in the direct request to the configured
// endpoint.

import { readItem, writeItem } from '/shared/storage.js';
import { validateGuideSpec } from '/shared/validation.js';
import { generateGuideId, nowIso, escapeHtml } from '/shared/utils.js';
import { alertMessage } from '/shared/dialogs.js';

const SETTINGS_KEY = 'admin:ai:settings';
const CHAT_KEY = 'admin:ai:chat';

export const DEFAULT_SYSTEM_PROMPT = `You are GuideOS Author, an expert technical writer that produces equipment service guides.

You MUST reply with a single JSON object that conforms to the GuideSpec v1.0 schema below — no prose, no markdown fences, no comments.

When the user asks for a guide on a specific machine, model or task, first use your knowledge (and any research the user provides) to gather accurate manufacturer data: model identifiers, voltages, pressures, torque values, fluid capacities, safety warnings, and the canonical procedure phases.

GuideSpec schema (all fields required unless noted):
{
  "guideSpecVersion": "1.0",
  "guide": {
    "id": "<8 uppercase hex chars, unique>",
    "title": "<short title>",
    "description": "<1-3 sentences>",
    "version": "1.0.0",
    "language": "en" | "es" | ...,
    "category": "Maintenance" | "Repair" | "Installation" | "Troubleshooting" | "Inspection",
    "difficulty": "Beginner" | "Intermediate" | "Advanced" | "Expert",
    "estimatedMinutes": <integer>,
    "keywords": ["..."],
    "author": "AI Author",
    "created": "<ISO 8601>",
    "updated": "<ISO 8601>"
  },
  "equipment": {
    "manufacturer": "<required>",
    "series": "<required>",
    "model": "<required>",
    "revision": "<optional>",
    "voltage": "<optional, e.g. '480V 3ph 60Hz'>",
    "pressure": "<optional>"
  },
  "theme": { "enabled": false, "primaryColor": "#0054A6", "secondaryColor": "#003E7A", "accentColor": "#F59E0B" },
  "phases": [
    {
      "id": "phase-1",
      "title": "<phase title>",
      "description": "<what this phase covers>",
      "estimatedMinutes": <integer>,
      "steps": [
        {
          "id": "step-1-1",
          "title": "<step title>",
          "instruction": "<imperative sentence(s). Reference engineering values via {placeholders} that map to entries in the 'entities' map below>",
          "estimatedMinutes": <integer optional>,
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

Rules:
- Use {entityName} placeholders inside instruction text for every engineering value (torque, pressure, temperature, length, voltage, current, time, etc.). Define each one in the step's entities map with type + value + unit.
- Valid engineering types: torque, pressure, temperature, length, voltage, current, time, mass, volume, flow, power, frequency, angle.
- Valid temperature units: "°C" or "°F". Other types use SI base units (Nm, bar, m, V, A, s, kg, L, L/min, W, Hz, deg).
- Step ids must be unique across the whole guide.
- guide.id must be exactly 8 uppercase hexadecimal characters.
- Output ONLY the JSON object. No \`\`\`json fences.`;

const state = {
  settings: null,
  chat: null, // {messages:[{role,content,ts}], lastJson?, lastValidation?}
};

function defaultSettings() {
  return {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.4,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
}
function defaultChat() { return { messages: [], lastJson: null, lastValidation: null }; }

function loadState() {
  state.settings = readItem(SETTINGS_KEY) || defaultSettings();
  state.chat = readItem(CHAT_KEY) || defaultChat();
}
function saveSettings() { writeItem(SETTINGS_KEY, state.settings); }
function saveChat() { writeItem(CHAT_KEY, state.chat); }

export function renderAiView(container, { onDraftCreated }) {
  loadState();
  container.innerHTML = `
    <h2>AI Generator <small class="muted">OpenAI-compatible</small></h2>
    <div class="tabs">
      <button data-ai-tab="generator" class="active">Generator</button>
      <button data-ai-tab="settings">Settings</button>
    </div>
    <div id="ai-body"></div>
  `;
  let tab = 'generator';
  const body = container.querySelector('#ai-body');
  const draw = () => {
    body.innerHTML = tab === 'settings' ? settingsHtml() : generatorHtml();
    if (tab === 'settings') wireSettings();
    else wireGenerator(onDraftCreated);
  };
  container.querySelectorAll('[data-ai-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.aiTab;
    container.querySelectorAll('[data-ai-tab]').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));
  draw();
}

function settingsHtml() {
  const s = state.settings;
  return `
    <div class="section">
      <h3>Endpoint</h3>
      <div class="field"><label>Base URL</label>
        <input id="ai-baseurl" type="text" value="${escapeHtml(s.baseUrl)}" placeholder="https://api.openai.com/v1" /></div>
      <div class="field"><label>API Key</label>
        <input id="ai-apikey" type="password" value="${escapeHtml(s.apiKey)}" placeholder="sk-..." autocomplete="off" /></div>
      <div class="row">
        <div class="field"><label>Model</label>
          <input id="ai-model" type="text" value="${escapeHtml(s.model)}" placeholder="gpt-4o-mini" /></div>
        <div class="field"><label>Temperature</label>
          <input id="ai-temp" type="number" min="0" max="2" step="0.1" value="${s.temperature}" /></div>
      </div>
      <p class="muted" style="font-size:12px">Stored locally in your browser (localStorage). Requests go directly from this browser to the Base URL you set. Any endpoint that implements <code>POST {baseUrl}/chat/completions</code> with the OpenAI message format works (OpenAI, Azure OpenAI compatible, OpenRouter, Together, Groq, Ollama, LM Studio, vLLM, ...).</p>
    </div>
    <div class="section">
      <h3>System Prompt</h3>
      <div class="field"><textarea id="ai-sysprompt" rows="20" style="font-family:monospace;font-size:12px">${escapeHtml(s.systemPrompt)}</textarea></div>
      <div class="toolbar">
        <button id="ai-save" class="primary">Save Settings</button>
        <button id="ai-reset-prompt">Reset prompt to default</button>
      </div>
    </div>`;
}

function wireSettings() {
  document.getElementById('ai-save').addEventListener('click', () => {
    state.settings.baseUrl = document.getElementById('ai-baseurl').value.trim().replace(/\/+$/, '');
    state.settings.apiKey  = document.getElementById('ai-apikey').value.trim();
    state.settings.model   = document.getElementById('ai-model').value.trim();
    state.settings.temperature = Number(document.getElementById('ai-temp').value) || 0;
    state.settings.systemPrompt = document.getElementById('ai-sysprompt').value;
    saveSettings();
    alertMessage('AI settings saved.');
  });
  document.getElementById('ai-reset-prompt').addEventListener('click', () => {
    document.getElementById('ai-sysprompt').value = DEFAULT_SYSTEM_PROMPT;
  });
}

function generatorHtml() {
  const s = state.settings;
  const configured = s.baseUrl && s.apiKey && s.model;
  const msgs = state.chat.messages.map((m) => `
    <div class="ai-msg ai-${m.role}">
      <div class="ai-role">${escapeHtml(m.role)}</div>
      <pre class="ai-content">${escapeHtml(m.content)}</pre>
    </div>
  `).join('');
  const v = state.chat.lastValidation;
  const vBlock = v ? `
    <div class="section">
      <h3>Last JSON Validation</h3>
      ${v.valid ? '<p class="ok">✓ Valid GuideSpec</p>' : `<p class="error">${v.errors.length} error(s)</p>`}
      ${v.errors.map((e) => `<div class="error">${escapeHtml(e)}</div>`).join('')}
      ${v.warnings.map((w) => `<div class="warning">${escapeHtml(w)}</div>`).join('')}
      <div class="toolbar">
        <button id="ai-create-draft" class="primary" ${v.valid ? '' : 'disabled'}>Create draft from JSON</button>
        <button id="ai-copy-json">Copy JSON</button>
      </div>
    </div>` : '';
  return `
    ${!configured ? '<div class="section error">Configure Base URL, API Key and Model in the <b>Settings</b> tab first.</div>' : ''}
    <div class="section">
      <h3>Conversation</h3>
      <div class="ai-chat" id="ai-chat">${msgs || '<p class="muted">No messages yet. Describe the equipment and procedure you want a guide for.</p>'}</div>
      <div class="field" style="margin-top:var(--space-3)">
        <textarea id="ai-input" rows="4" placeholder="e.g. Generate a quarterly preventive maintenance guide for a Fanuc R-2000iC/165F robot, including lubrication points, torque specs and safety steps."></textarea>
      </div>
      <div class="toolbar">
        <button id="ai-send" class="primary" ${configured ? '' : 'disabled'}>Send</button>
        <button id="ai-clear">Clear conversation</button>
        <span id="ai-status" class="muted"></span>
      </div>
    </div>
    ${vBlock}
  `;
}

function wireGenerator(onDraftCreated) {
  const status = () => document.getElementById('ai-status');
  document.getElementById('ai-clear')?.addEventListener('click', () => {
    state.chat = defaultChat(); saveChat();
    document.getElementById('ai-body').innerHTML = generatorHtml();
    wireGenerator(onDraftCreated);
  });
  document.getElementById('ai-send')?.addEventListener('click', async () => {
    const ta = document.getElementById('ai-input');
    const text = ta.value.trim();
    if (!text) return;
    state.chat.messages.push({ role: 'user', content: text, ts: nowIso() });
    saveChat();
    ta.value = '';
    rerender(onDraftCreated);
    const btn = document.getElementById('ai-send');
    btn.disabled = true; status().textContent = 'Contacting model...';
    try {
      const reply = await callModel();
      state.chat.messages.push({ role: 'assistant', content: reply, ts: nowIso() });
      tryParseJson(reply);
      saveChat();
      status().textContent = '';
    } catch (err) {
      state.chat.messages.push({ role: 'assistant', content: `[error] ${err.message}`, ts: nowIso() });
      saveChat();
      status().textContent = 'Request failed';
    } finally {
      btn.disabled = false;
      rerender(onDraftCreated);
    }
  });
  document.getElementById('ai-create-draft')?.addEventListener('click', () => {
    const obj = state.chat.lastJson;
    if (!obj) return;
    if (!obj.guide?.id || !/^[0-9A-F]{8}$/.test(obj.guide.id)) {
      obj.guide = { ...(obj.guide || {}), id: generateGuideId() };
    }
    onDraftCreated(obj);
  });
  document.getElementById('ai-copy-json')?.addEventListener('click', async () => {
    if (!state.chat.lastJson) return;
    await navigator.clipboard.writeText(JSON.stringify(state.chat.lastJson, null, 2));
    alertMessage('JSON copied.');
  });
}

function rerender(onDraftCreated) {
  const body = document.getElementById('ai-body');
  if (!body) return;
  body.innerHTML = generatorHtml();
  wireGenerator(onDraftCreated);
  const chat = document.getElementById('ai-chat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function tryParseJson(text) {
  // Extract JSON object from the assistant reply, tolerant to fences.
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  // Slice from first { to last }
  const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) { state.chat.lastJson = null; state.chat.lastValidation = { valid:false, errors:['No JSON object found in response'], warnings:[] }; return; }
  try {
    const obj = JSON.parse(raw.substring(a, b + 1));
    state.chat.lastJson = obj;
    state.chat.lastValidation = validateGuideSpec(obj);
  } catch (e) {
    state.chat.lastJson = null;
    state.chat.lastValidation = { valid:false, errors:['JSON parse error: ' + e.message], warnings:[] };
  }
}

async function callModel() {
  const s = state.settings;
  if (!s.baseUrl || !s.apiKey || !s.model) throw new Error('AI settings not configured');
  const messages = [
    { role: 'system', content: s.systemPrompt },
    ...state.chat.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      temperature: s.temperature,
      messages,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${t.substring(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Unexpected response shape (no choices[0].message.content)');
  return content;
}
