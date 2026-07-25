/**
 * Helper utility functions for Bulk Product Import module
 * Resolves inconsistent CSV types, cleans values, and normalizes fields safely.
 */

/**
 * Safely parse a value as a string.
 */
export function parseString(val: any): string {
  if (val == null) return '';
  return String(val).trim();
}

/**
 * Safely parse a value as a number.
 * Supports currencies (₹, $), commas, and trailing Rs/rs labels.
 * Returns 0 instead of NaN if parsing fails.
 */
export function parseNumber(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  const rawStr = String(val).trim();
  if (!rawStr) return 0;

  // Remove currency symbols (₹, $), commas, Rs suffixes, and leading/trailing spaces
  const cleanedStr = rawStr
    .replace(/[₹$\s,]/g, '')
    .replace(/rs|Rs|RS/gi, '');

  const parsed = parseFloat(cleanedStr);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Safely parse a value as a boolean.
 * Accepts: true, false, 1, 0, yes, no, y, n, active, inactive (case-insensitive).
 */
export function parseBoolean(val: any): boolean {
  if (val == null) return false;
  if (typeof val === 'boolean') return val;

  const str = String(val).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'active'].includes(str);
}

/**
 * Safely parse a value as an array of trimmed strings.
 * Defaults to comma separator, removes empty values, and filters duplicates.
 */
export function parseArray(val: any, separator = ','): string[] {
  if (val == null) return [];
  const str = String(val).trim();
  if (!str) return [];

  const items = str
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

  // Return unique items
  return Array.from(new Set(items));
}

/**
 * Safely parse a value as a JSON object or array.
 * Never throws errors; returns the default value if parsing fails.
 */
export function parseJson(val: any, defaultValue: any = []): any {
  if (val == null) return defaultValue;
  if (typeof val === 'object') return val;

  const str = String(val).trim();
  if (!str) return defaultValue;

  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * Safely normalize weight unit to system standard enums.
 * e.g., Kg/KG -> kg, Gram/G -> g, Litre/Liter -> l, ML -> ml.
 */
export function normalizeWeightUnit(val: any): string {
  const str = parseString(val).toLowerCase();

  switch (str) {
    case 'kg':
    case 'kg.':
    case 'kilo':
    case 'kilogram':
    case 'kilograms':
      return 'kg';
    case 'g':
    case 'g.':
    case 'gram':
    case 'grams':
      return 'g';
    case 'mg':
    case 'mg.':
    case 'milligram':
    case 'milligrams':
      return 'mg';
    case 'ml':
    case 'ml.':
    case 'millilitre':
    case 'milliliter':
    case 'milliliters':
      return 'ml';
    case 'l':
    case 'l.':
    case 'liter':
    case 'litre':
    case 'liters':
    case 'litres':
      return 'l';
    case 'pcs':
    case 'pc':
    case 'piece':
    case 'pieces':
      return 'pcs';
    case 'pack':
    case 'packs':
    case 'package':
      return 'pack';
    case 'box':
    case 'boxes':
      return 'box';
    case 'set':
    case 'sets':
      return 'set';
    default:
      return str; // Return as-is for validation
  }
}
