// entities.js — Entity resolution and placeholder rendering.

import { convertValue, convertTemperature, preferredUnit, formatValue, isUnitValid } from './units.js';

const ENGINEERING_TYPES = new Set([
  'pressure','torque','distance','length','temperature','weight','volume',
  'flow','speed','time','angle','voltage','current','frequency','power','diameter'
]);

const OBJECT_TYPES = new Set([
  'tool','part','chemical','bearing','seal','lubricant','wireGauge','thread','fastener','material',
  'document','manual','video','website','warning','note'
]);

export function isKnownEntityType(type) {
  return ENGINEERING_TYPES.has(type) || OBJECT_TYPES.has(type);
}

export function isEngineeringType(type) {
  return ENGINEERING_TYPES.has(type);
}

export function renderEntity(entity, preference = 'auto') {
  if (!entity || !entity.type) return '';
  const type = entity.type;

  if (type === 'temperature') {
    const target = preferredUnit('temperature', preference) || entity.unit;
    let value = entity.value;
    let unit = entity.unit;
    if (preference !== 'auto' && target && target !== unit) {
      const map = { metric: '°C', imperial: '°F' };
      const tgt = map[preference];
      const conv = convertTemperature(value, unit, tgt);
      if (conv != null) { value = conv; unit = tgt; }
    }
    return `${formatValue(value, entity.precision ?? 0)} ${unit}`;
  }

  if (ENGINEERING_TYPES.has(type)) {
    let value = entity.value;
    let unit = entity.unit;
    const target = preferredUnit(type, preference);
    if (target && target !== unit) {
      const conv = convertValue(type, value, unit, target);
      if (conv != null) { value = conv; unit = target; }
    }
    return `${formatValue(value, entity.precision ?? 0)} ${unit ?? ''}`.trim();
  }

  switch (type) {
    case 'tool': return entity.name || 'Tool';
    case 'part': return `${entity.partNumber ?? ''} ${entity.description ?? ''}`.trim();
    case 'chemical': return entity.name || 'Chemical';
    case 'bearing': return entity.designation || entity.name || 'Bearing';
    case 'seal': return entity.designation || entity.name || 'Seal';
    case 'lubricant': return entity.name || 'Lubricant';
    case 'wireGauge': return entity.gauge || '';
    case 'thread': return entity.designation || '';
    case 'fastener': return entity.description || '';
    case 'material': return entity.name || '';
    case 'document': case 'manual': return entity.title || entity.name || '';
    case 'video': case 'website': return entity.url || entity.title || '';
    case 'warning': case 'note': return entity.text || '';
    default: return '';
  }
}

export function resolveInstruction(instruction, entities, preference = 'auto') {
  if (!instruction) return '';
  return instruction.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    const e = entities && entities[name];
    if (!e) return match; // leave unresolved placeholder visible
    return renderEntity(e, preference);
  });
}

export function findUnresolvedPlaceholders(instruction, entities) {
  const out = [];
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let m;
  while ((m = re.exec(instruction || '')) !== null) {
    if (!entities || !entities[m[1]]) out.push(m[1]);
  }
  return out;
}

export { isUnitValid };
