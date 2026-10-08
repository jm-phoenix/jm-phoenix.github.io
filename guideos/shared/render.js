// render.js — Pure GuideSpec → HTML renderers (no DOM access).
// Shared by: viewer (step view), admin editor (WYSIWYG preview),
// exporter (standalone HTML). All output is escaped.

import { resolveInstruction, renderEntity } from './entities.js';
import { escapeHtml } from './utils.js';

/**
 * Builds the Google AI Mode (Gemini) search URL for a step doubt.
 * Format: "<manufacturer> <model>: <step title>. <instruction>. Pregunta: <question>"
 */
export function buildDudaUrl(spec, step, question) {
  const eq = spec.equipment || {};
  const maker = [eq.manufacturer, eq.model].filter(Boolean).join(' ');
  const context = `${maker}: ${step.title}. ${step.instruction}`.trim();
  const query = question ? `${context}. Pregunta: ${question}` : context;
  return 'https://www.google.com/search?udm=50&q=' + encodeURIComponent(query);
}

/**
 * Data attributes (escaped) carrying the doubt context for a step.
 * Wired by the host page (viewer: inline panel, export: prompt()).
 */
export function dudaAttrs(spec, step) {
  const eq = spec.equipment || {};
  return (
    `data-maker="${escapeHtml(eq.manufacturer || '')}"` +
    ` data-model="${escapeHtml(eq.model || '')}"` +
    ` data-step="${escapeHtml(step.title || '')}"` +
    ` data-instr="${escapeHtml(step.instruction || '')}"`
  );
}

function renderWarnings(step) {
  if (!Array.isArray(step.warnings) || step.warnings.length === 0) return '';
  let out = '<div class="step-section"><h4>Advertencias</h4>';
  for (const w of step.warnings) out += `<div class="warning">${escapeHtml(w)}</div>`;
  return out + '</div>';
}

function renderEntities(step, pref) {
  if (!step.entities) return '';
  const groups = { tool: [], part: [], chemical: [], other: [] };
  for (const [, e] of Object.entries(step.entities)) {
    const li = `<li>${escapeHtml(renderEntity(e, pref))}</li>`;
    if (e.type === 'tool') groups.tool.push(li);
    else if (e.type === 'part') groups.part.push(li);
    else if (e.type === 'chemical') groups.chemical.push(li);
    else groups.other.push(`<li><strong>${escapeHtml(e.type || '')}:</strong> ${escapeHtml(renderEntity(e, pref))}</li>`);
  }
  let out = '';
  if (groups.tool.length) out += `<div class="step-section"><h4>Herramientas necesarias</h4><ul class="entity-list">${groups.tool.join('')}</ul></div>`;
  if (groups.part.length) out += `<div class="step-section"><h4>Repuestos necesarios</h4><ul class="entity-list">${groups.part.join('')}</ul></div>`;
  if (groups.chemical.length) out += `<div class="step-section"><h4>Químicos</h4><ul class="entity-list">${groups.chemical.join('')}</ul></div>`;
  if (groups.other.length) out += `<div class="step-section"><h4>Valores</h4><ul class="entity-list">${groups.other.join('')}</ul></div>`;
  return out;
}

function renderDependencies(step) {
  if (!Array.isArray(step.dependencies) || step.dependencies.length === 0) return '';
  return `<div class="step-section"><h4>Prerrequisitos</h4><ul class="entity-list">${step.dependencies.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul></div>`;
}

function renderCodeBlocks(step) {
  if (!Array.isArray(step.codeBlocks) || step.codeBlocks.length === 0) return '';
  let out = '';
  for (const cb of step.codeBlocks) {
    const code = escapeHtml(cb.code || '');
    out += `<div class="code-block"><button class="copy" data-copy="${encodeURIComponent(cb.code || '')}">Copiar</button><pre>${code}</pre></div>`;
  }
  return out;
}

/**
 * Renders one step's content (instruction, warnings, entities, code).
 * opts.duda (default true): include the "doubt" button block.
 */
export function renderStepHtml(step, phase, spec, pref = 'auto', opts = {}) {
  const withDuda = opts.duda !== false;
  const instructionHtml = escapeHtml(resolveInstruction(step.instruction, step.entities, pref));
  const out = [];
  if (phase && phase.title) out.push(`<p class="muted">${escapeHtml(phase.title)}</p>`);
  out.push(`<h2>${escapeHtml(step.title)}</h2>`);
  if (step.estimatedMinutes) out.push(`<p class="muted">Estimado: ${step.estimatedMinutes} min</p>`);
  out.push(`<p class="instruction">${instructionHtml}</p>`);
  out.push(renderWarnings(step));
  out.push(renderEntities(step, pref));
  out.push(renderDependencies(step));
  out.push(renderCodeBlocks(step));
  if (withDuda) {
    out.push(
      `<div class="step-section duda-section">` +
        `<button class="duda-btn" type="button" ${dudaAttrs(spec, step)}>¿Dudas con este paso?</button>` +
        `<div class="duda-panel hidden"></div>` +
        `</div>`
    );
  }
  return out.join('');
}

/**
 * Renders a complete guide (all phases and steps) as static HTML.
 * Used by the admin WYSIWYG preview and the standalone HTML exporter.
 */
export function renderGuideHtml(spec, pref = 'auto') {
  const g = spec.guide || {};
  const eq = spec.equipment || {};
  const out = [];
  out.push('<article class="guide-doc">');
  out.push(`<h1>${escapeHtml(g.title || 'Sin título')}</h1>`);
  if (g.description) out.push(`<p class="lede">${escapeHtml(g.description)}</p>`);
  const meta = [];
  if (eq.manufacturer || eq.model) meta.push(`<span><strong>Equipo:</strong> ${escapeHtml([eq.manufacturer, eq.series, eq.model].filter(Boolean).join(' '))}</span>`);
  if (eq.voltage) meta.push(`<span><strong>Voltaje:</strong> ${escapeHtml(eq.voltage)}</span>`);
  if (g.estimatedMinutes) meta.push(`<span><strong>Duración estimada:</strong> ${g.estimatedMinutes} min</span>`);
  if (g.difficulty) meta.push(`<span><strong>Nivel:</strong> ${escapeHtml(g.difficulty)}</span>`);
  if (g.category) meta.push(`<span><strong>Categoría:</strong> ${escapeHtml(g.category)}</span>`);
  if (g.version) meta.push(`<span><strong>Versión:</strong> ${escapeHtml(g.version)}</span>`);
  if (meta.length) out.push(`<p class="guide-meta">${meta.join(' · ')}</p>`);
  for (const phase of spec.phases || []) {
    out.push(`<section class="phase"><h2 class="phase-title">${escapeHtml(phase.title || '')}</h2>`);
    if (phase.description) out.push(`<p class="muted">${escapeHtml(phase.description)}</p>`);
    for (const step of phase.steps || []) {
      out.push(`<div class="guide-step">${renderStepHtml(step, null, spec, pref)}</div>`);
    }
    out.push('</section>');
  }
  out.push('</article>');
  return out.join('');
}
