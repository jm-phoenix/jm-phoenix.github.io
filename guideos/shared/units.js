// units.js — Engineering unit conversion. Pure functions.

const PRESSURE = { psi: 1, bar: 14.5038, kPa: 0.145038, MPa: 145.038 };
const TORQUE = { 'lb-ft': 1, 'lb-in': 1/12, 'N-m': 0.737562, 'kgf-m': 7.23301 };
const LENGTH = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
const DISTANCE = { km: 1, mi: 1.60934 };
const VOLUME = { L: 1, mL: 0.001, gal: 3.78541, qt: 0.946353 };
const FLOW = { 'L/min': 1, 'GPM': 3.78541, 'm³/h': 16.6667 };
const WEIGHT = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 };
const POWER = { W: 1, kW: 1000, HP: 745.7 };

const TABLES = {
  pressure: PRESSURE, torque: TORQUE, length: LENGTH, diameter: LENGTH,
  distance: DISTANCE, volume: VOLUME, flow: FLOW, weight: WEIGHT, power: POWER,
};

const METRIC_PREF = { pressure: 'bar', torque: 'N-m', length: 'mm', diameter: 'mm', distance: 'km', volume: 'L', flow: 'L/min', weight: 'kg', power: 'kW' };
const IMPERIAL_PREF = { pressure: 'psi', torque: 'lb-ft', length: 'in', diameter: 'in', distance: 'mi', volume: 'gal', flow: 'GPM', weight: 'lb', power: 'HP' };

export function isUnitValid(type, unit) {
  const t = TABLES[type];
  return !!(t && Object.prototype.hasOwnProperty.call(t, unit));
}

export function convertValue(type, value, fromUnit, toUnit) {
  const table = TABLES[type];
  if (!table || !(fromUnit in table) || !(toUnit in table)) return null;
  const base = value * table[fromUnit];
  return base / table[toUnit];
}

export function convertTemperature(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  if (fromUnit === '°C' && toUnit === '°F') return value * 9/5 + 32;
  if (fromUnit === '°F' && toUnit === '°C') return (value - 32) * 5/9;
  return null;
}

export function preferredUnit(type, preference) {
  if (preference === 'metric') return METRIC_PREF[type] || null;
  if (preference === 'imperial') return IMPERIAL_PREF[type] || null;
  return null;
}

export function formatValue(value, precision = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value.toFixed(precision);
}
