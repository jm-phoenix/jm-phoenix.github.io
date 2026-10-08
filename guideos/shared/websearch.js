// websearch.js — Búsqueda web para el agente IA de GuideOS (100% cliente, sin backend).
// Estrategia: Brave Search API si el usuario configuró su key; si no,
// DuckDuckGo Instant Answer como fallback sin key (permite CORS).

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DDG_ENDPOINT = 'https://api.duckduckgo.com/';

async function braveSearch(query, apiKey) {
  const url = `${BRAVE_ENDPOINT}?q=${encodeURIComponent(query)}&count=5&text_decorations=0&search_lang=es`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  });
  if (!res.ok) throw new Error(`Brave Search respondió ${res.status}`);
  const data = await res.json();
  const items = (data.web && data.web.results) || [];
  if (items.length === 0) throw new Error('Brave no devolvió resultados');
  return items
    .map((r) => `• ${r.title || ''}\n  ${(r.description || '').slice(0, 400)}\n  ${r.url || ''}`)
    .join('\n');
}

async function duckDuckGoSearch(query) {
  const url = `${DDG_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo respondió ${res.status}`);
  const data = await res.json();
  const out = [];
  if (data.AbstractText) {
    out.push(data.AbstractText + (data.AbstractURL ? ` (${data.AbstractURL})` : ''));
  }
  for (const t of (data.RelatedTopics || []).slice(0, 5)) {
    if (t && t.Text) out.push('• ' + t.Text.slice(0, 400));
  }
  return out.join('\n') || 'Sin resultados relevantes.';
}

/**
 * Busca en la web. Usa Brave si hay apiKey; si falla o no hay, DuckDuckGo.
 * Devuelve texto plano con los resultados para inyectar al modelo.
 */
export async function webSearch(query, braveKey) {
  const errors = [];
  if (braveKey) {
    try {
      return await braveSearch(query, braveKey);
    } catch (e) {
      errors.push('Brave: ' + e.message);
    }
  }
  try {
    return await duckDuckGoSearch(query);
  } catch (e) {
    errors.push('DuckDuckGo: ' + e.message);
  }
  throw new Error('Búsqueda web falló (' + errors.join('; ') + ')');
}

export function formatSearchContext(query, results) {
  return (
    `Resultados de búsqueda web para "${query}":\n${results}\n\n` +
    `Usa esta información para continuar armando la guía. ` +
    `Si necesitas otra búsqueda, responde con otra línea SEARCH:. ` +
    `Cuando tengas TODO lo necesario, responde "¡Perfecto!" seguido del JSON GuideSpec.`
  );
}
