// validation.js — GuideSpec validation. Pure, returns structured results.

import { isKnownEntityType, isEngineeringType, findUnresolvedPlaceholders } from './entities.js';
import { isUnitValid } from './units.js';
import { isHexGuideId } from './utils.js';

const REQUIRED_GUIDE = ['id','title','description','version','language','category','difficulty','estimatedMinutes','keywords','author','created','updated'];
const REQUIRED_EQUIPMENT = ['manufacturer','series','model'];

export function validateGuideSpec(spec) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['Root must be an object'], warnings };
  }
  if (!spec.guideSpecVersion) errors.push('Missing guideSpecVersion');
  if (!spec.guide) errors.push('Missing guide object');
  if (!spec.equipment) errors.push('Missing equipment object');
  if (!Array.isArray(spec.phases) || spec.phases.length === 0) errors.push('Missing phases');

  if (spec.guide) {
    for (const f of REQUIRED_GUIDE) {
      if (spec.guide[f] === undefined || spec.guide[f] === null || spec.guide[f] === '') {
        errors.push(`guide.${f} is required`);
      }
    }
    if (spec.guide.id && !isHexGuideId(spec.guide.id)) {
      errors.push('guide.id must be 8 hexadecimal characters');
    }
  }
  if (spec.equipment) {
    for (const f of REQUIRED_EQUIPMENT) {
      if (!spec.equipment[f]) errors.push(`equipment.${f} is required`);
    }
  }

  if (Array.isArray(spec.phases)) {
    const seenStepIds = new Set();
    const allStepIds = new Set();
    for (const phase of spec.phases) {
      if (!phase.id || !phase.title) errors.push('Phase missing id/title');
      if (!Array.isArray(phase.steps) || phase.steps.length === 0) {
        errors.push(`Phase ${phase.id || '?'} has no steps`);
        continue;
      }
      for (const step of phase.steps) {
        if (!step.id || !step.title || !step.instruction) {
          errors.push(`Step ${step.id || '?'} missing required fields`);
        }
        if (step.id) {
          if (allStepIds.has(step.id)) errors.push(`Duplicate step id: ${step.id}`);
          allStepIds.add(step.id);
        }
        if (step.entities) {
          const names = Object.keys(step.entities);
          const dup = names.find((n, i) => names.indexOf(n) !== i);
          if (dup) errors.push(`Duplicate entity name "${dup}" in step ${step.id}`);
          for (const [name, e] of Object.entries(step.entities)) {
            if (!e || !e.type) {
              errors.push(`Entity ${name} missing type`);
              continue;
            }
            if (!isKnownEntityType(e.type)) {
              warnings.push(`Entity ${name}: unknown type "${e.type}"`);
            }
            if (isEngineeringType(e.type) && e.type !== 'temperature' && e.unit && !isUnitValid(e.type, e.unit)) {
              errors.push(`Entity ${name}: invalid ${e.type} unit "${e.unit}"`);
            }
            if (e.type === 'temperature' && e.unit && e.unit !== '°C' && e.unit !== '°F') {
              errors.push(`Entity ${name}: invalid temperature unit "${e.unit}"`);
            }
          }
          const unresolved = findUnresolvedPlaceholders(step.instruction, step.entities);
          for (const u of unresolved) errors.push(`Step ${step.id}: placeholder {${u}} has no entity`);
        }
      }
    }
    // Circular dependency check (simple DFS)
    if (errors.length === 0) {
      const stepDeps = new Map();
      for (const phase of spec.phases) {
        for (const step of phase.steps) {
          stepDeps.set(step.id, Array.isArray(step.dependencies) ? step.dependencies : []);
        }
      }
      for (const id of stepDeps.keys()) {
        if (hasCycle(id, stepDeps, new Set(), new Set())) {
          errors.push(`Circular dependency detected involving step ${id}`);
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function hasCycle(node, graph, visiting, visited) {
  if (visited.has(node)) return false;
  if (visiting.has(node)) return true;
  visiting.add(node);
  const deps = graph.get(node) || [];
  for (const d of deps) {
    if (graph.has(d) && hasCycle(d, graph, visiting, visited)) return true;
  }
  visiting.delete(node);
  visited.add(node);
  return false;
}

export function validateThemeColor(hex) {
  return typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex);
}
