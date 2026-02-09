import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdminDivision } from './types.js';
import { toUpper } from './utils.js';

const adminDivisionsCache: Map<string, Map<string, Map<string, AdminDivision>>> = new Map();

export function loadAdminDivisionsForDir(dataDir: string): Map<string, Map<string, AdminDivision>> {
  const cached = adminDivisionsCache.get(dataDir);
  if (cached) return cached;

  const divisions: Map<string, Map<string, AdminDivision>> = new Map();

  try {
    const filePath = join(dataDir, 'admin1CodesASCII.txt');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line) continue;

      const fields = line.split('\t');
      if (fields.length < 2) continue;

      const parts = fields[0].split('.');
      if (parts.length !== 2) continue;

      const countryCode = parts[0];
      const divisionCode = parts[1];
      const divisionName = fields[1];

      if (!divisions.has(countryCode)) {
        divisions.set(countryCode, new Map());
      }

      divisions.get(countryCode)!.set(divisionCode, {
        code: divisionCode,
        name: divisionName,
      });
    }
  } catch {
    return divisions;
  }

  adminDivisionsCache.set(dataDir, divisions);
  return divisions;
}

export function isAdminDivision(dataDir: string, countryCode: string, divisionCode: string): boolean {
  const divisions = loadAdminDivisionsForDir(dataDir);
  divisionCode = toUpper(divisionCode);
  const countryDivisions = divisions.get(countryCode);
  if (countryDivisions) {
    return countryDivisions.has(divisionCode);
  }
  return false;
}

export function getAdminDivisionCountry(dataDir: string, code: string): string {
  const divisions = loadAdminDivisionsForDir(dataDir);
  code = toUpper(code);

  const matches: string[] = [];
  for (const [countryCode, countryDivisions] of divisions) {
    if (countryDivisions.has(code)) {
      matches.push(countryCode);
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }
  return '';
}

export function getAdminDivisionName(dataDir: string, countryCode: string, divisionCode: string): string {
  const divisions = loadAdminDivisionsForDir(dataDir);
  divisionCode = toUpper(divisionCode);
  const countryDivisions = divisions.get(countryCode);
  if (countryDivisions) {
    const div = countryDivisions.get(divisionCode);
    if (div) return div.name;
  }
  return '';
}
