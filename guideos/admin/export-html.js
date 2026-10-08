// export-html.js — Exporta una guía como UN archivo HTML autocontenido.
// Incluye: CSS inline, guía renderizada, JSON embebido y mini-lector
// (botón de dudas por paso → Google AI Mode, botón de imprimir).

import { renderGuideHtml } from '../shared/render.js';
import { escapeHtml } from '../shared/utils.js';

const EXPORT_CSS = `
:root { --fg:#1a1a1a; --muted:#6b7280; --border:#e5e7eb; --surface:#f9fafb;
  --primary:#0054A6; --accent:#F59E0B; --warning-bg:#fef3c7; --warning-bd:#b45309; }
* { box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:var(--fg); line-height:1.6; margin:0; background:#fff; }
.wrap { max-width:860px; margin:0 auto; padding:24px 20px 64px; }
.topbar { display:flex; justify-content:space-between; align-items:center;
  border-bottom:2px solid var(--border); padding-bottom:12px; margin-bottom:24px; }
.topbar .brand { font-weight:700; color:var(--primary); }
button { font:inherit; cursor:pointer; border:1px solid var(--border);
  background:var(--surface); padding:8px 14px; border-radius:6px; }
button.primary { background:var(--primary); color:#fff; border-color:var(--primary); }
h1 { font-size:1.9rem; margin:.2em 0; }
.lede { color:var(--muted); font-size:1.05rem; }
.guide-meta { color:var(--muted); font-size:.9rem; }
.phase { border:1px solid var(--border); border-radius:10px; padding:18px; margin:22px 0; }
.phase-title { margin-top:0; color:var(--primary); }
.guide-step { border-top:1px dashed var(--border); padding:16px 0; }
.guide-step:first-of-type { border-top:none; }
.guide-step h2 { font-size:1.25rem; margin:.2em 0; }
.instruction { font-size:1.02rem; }
.muted { color:var(--muted); }
.warning { background:var(--warning-bg); border-left:4px solid var(--warning-bd);
  padding:10px 12px; border-radius:4px; margin:8px 0; }
.step-section { margin:14px 0; }
.step-section h4 { margin:.4em 0; font-size:.95rem; text-transform:uppercase;
  letter-spacing:.04em; color:var(--muted); }
.entity-list { margin:.3em 0; padding-left:1.2em; }
.code-block { position:relative; background:#111827; color:#e5e7eb; border-radius:8px; margin:10px 0; }
.code-block pre { padding:14px; overflow:auto; margin:0; }
.code-block .copy { position:absolute; top:8px; right:8px; font-size:.8rem; }
.duda-section { margin-top:14px; }
.duda-btn { border-style:dashed; }
.spec-details { margin-top:32px; }
.spec-details summary { cursor:pointer; color:var(--muted); }
.spec-details pre { background:var(--surface); border:1px solid var(--border);
  border-radius:8px; padding:14px; overflow:auto; font-size:.8rem; }
.footer { margin-top:40px; border-top:1px solid var(--border); padding-top:12px;
  color:var(--muted); font-size:.85rem; }
@media print {
  .topbar .actions, .duda-section, .spec-details { display:none; }
  .phase { break-inside:avoid; }
  body { font-size:11pt; }
}
`;

const EXPORT_JS = `
document.querySelectorAll('.duda-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var q = prompt('¿Cuál es tu duda sobre este paso?\\n\\n' + btn.dataset.step);
    if (!q) return;
    var maker = [btn.dataset.maker, btn.dataset.model].filter(Boolean).join(' ');
    var query = maker + ': ' + btn.dataset.step + '. ' + btn.dataset.instr + '. Pregunta: ' + q;
    window.open('https://www.google.com/search?udm=50&q=' + encodeURIComponent(query), '_blank');
  });
});
document.querySelectorAll('.code-block .copy').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var text = decodeURIComponent(btn.dataset.copy || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ btn.textContent = 'Copiado'; });
    }
  });
});
var printBtn = document.getElementById('print-guide');
if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
`;

export function buildStandaloneHtml(spec) {
  const g = spec.guide || {};
  const lang = g.language || 'es';
  const title = g.title || 'Guía';
  const guideHtml = renderGuideHtml(spec);
  const specJson = JSON.stringify(spec, null, 2)
    .replace(/</g, '\\u003c'); // evita romper el <script type="application/json">

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} — Guía</title>
<meta name="description" content="${escapeHtml(g.description || '')}" />
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <span class="brand">GuideOS</span>
    <span class="actions"><button id="print-guide" type="button">Imprimir / PDF</button></span>
  </div>
  ${guideHtml}
  <details class="spec-details">
    <summary>Ver GuideSpec JSON (documento maestro)</summary>
    <pre>${escapeHtml(JSON.stringify(spec, null, 2))}</pre>
  </details>
  <div class="footer">Guía generada con GuideOS · ${escapeHtml(g.id || '')} · v${escapeHtml(g.version || '1.0.0')}</div>
</div>
<script type="application/json" id="guidespec">${specJson}</script>
<script>${EXPORT_JS}</script>
</body>
</html>`;
}

export function downloadStandaloneHtml(spec) {
  const html = buildStandaloneHtml(spec);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${spec.guide.id}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function downloadJson(spec) {
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${spec.guide.id}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
