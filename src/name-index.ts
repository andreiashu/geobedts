import type { GeobedCity } from './types.js';

export function buildNameIndex(cities: GeobedCity[]): Map<string, number[]> {
  const nameIndex = new Map<string, number[]>();
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    if (city.city.length > 0) {
      const key = city.city.toLowerCase();
      const existing = nameIndex.get(key);
      if (existing) {
        existing.push(i);
      } else {
        nameIndex.set(key, [i]);
      }
    }
    if (city.cityAlt.length > 0) {
      const alts = city.cityAlt.split(',');
      for (const alt of alts) {
        const trimmed = alt.trim();
        if (trimmed.length === 0) continue;
        const key = trimmed.toLowerCase();
        const existing = nameIndex.get(key);
        if (existing) {
          existing.push(i);
        } else {
          nameIndex.set(key, [i]);
        }
      }
    }
  }
  return nameIndex;
}
