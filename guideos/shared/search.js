// search.js — Simple text search over guide phases/steps.

export function searchGuide(spec, query) {
  if (!spec || !query) return [];
  const q = query.toLowerCase();
  const hits = [];
  for (const phase of spec.phases || []) {
    for (const step of phase.steps || []) {
      const text = `${step.title} ${step.instruction}`.toLowerCase();
      if (text.includes(q)) hits.push({ phaseId: phase.id, stepId: step.id, title: step.title });
    }
  }
  return hits;
}

export function buildSearchUrl(provider, query) {
  const q = encodeURIComponent(query);
  switch (provider) {
    case 'google': return `https://www.google.com/search?q=${q}`;
    case 'youtube': return `https://www.youtube.com/results?search_query=${q}`;
    case 'duckduckgo': return `https://duckduckgo.com/?q=${q}`;
    default: return `https://www.google.com/search?q=${q}`;
  }
}
