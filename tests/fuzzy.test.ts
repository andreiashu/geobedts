import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, fuzzyMatch } from '../src/index.js';
import type { GeocodeOptions } from '../src/index.js';

describe('Fuzzy Geocoding', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); });

  it.each([
    { query: 'Londn', maxDist: 1, wantCity: 'London' },
    { query: 'Pairis', maxDist: 1, wantCity: 'Paris' },
    { query: 'Toky', maxDist: 1, wantCity: 'Tokyo' },
    { query: 'Berln', maxDist: 1, wantCity: 'Berlin' },
    { query: 'Londno', maxDist: 2, wantCity: 'London' },
    { query: 'Sydeny', maxDist: 2, wantCity: 'Sydney' },
  ])('fuzzy geocode $query -> $wantCity', ({ query, maxDist, wantCity }) => {
    const result = g.geocode(query, { fuzzyDistance: maxDist });
    expect(result.city).toBe(wantCity);
  });

  // Distance 2 tests
  it.each([
    { query: 'Lnodon', maxDist: 2, wantCity: 'London' },
    { query: 'Tokiyo', maxDist: 2, wantCity: 'Tokyo' },
    { query: 'Sydnei', maxDist: 2, wantCity: 'Sydney' },
    { query: 'Mooscow', maxDist: 2, wantCity: 'Moscow' },
    { query: 'Amsterdm', maxDist: 2, wantCity: 'Amsterdam' },
  ])('fuzzy distance 2: $query -> $wantCity', ({ query, maxDist, wantCity }) => {
    const result = g.geocode(query, { fuzzyDistance: maxDist });
    expect(result.city).toBe(wantCity);
  });

  it('fuzzy match disabled - nonsense input returns empty', () => {
    const result = g.geocode('Zxqwvbn', { fuzzyDistance: 0 });
    expect(result.city).toBe('');
  });

  it('backward compatibility', () => {
    const cities = ['Austin', 'Paris', 'Sydney', 'Berlin', 'Tokyo'];
    for (const query of cities) {
      expect(g.geocode(query).city).toBe(query);
      expect(g.geocode(query, {}).city).toBe(query);
    }
  });
});

describe('fuzzyMatch function', () => {
  it.each([
    { query: 'London', candidate: 'London', maxDist: 0, want: true },
    { query: 'london', candidate: 'London', maxDist: 0, want: true },
    { query: 'LONDON', candidate: 'london', maxDist: 0, want: true },
    { query: 'Londn', candidate: 'London', maxDist: 0, want: false },
    { query: 'Londn', candidate: 'London', maxDist: 1, want: true },
    { query: 'LLondon', candidate: 'London', maxDist: 1, want: true },
    { query: 'Londnn', candidate: 'London', maxDist: 1, want: true },
    { query: 'Londxn', candidate: 'London', maxDist: 1, want: true },
    { query: 'Londoon', candidate: 'London', maxDist: 1, want: true },
    { query: 'Londno', candidate: 'London', maxDist: 2, want: true },
    { query: 'Lndn', candidate: 'London', maxDist: 2, want: true },
    { query: 'Lnodon', candidate: 'London', maxDist: 2, want: true },
    { query: 'ABC', candidate: 'London', maxDist: 1, want: false },
    { query: 'XYZ', candidate: 'London', maxDist: 2, want: false },
    { query: 'Londno', candidate: 'London', maxDist: 1, want: false },
  ])('fuzzyMatch($query, $candidate, $maxDist) = $want', ({ query, candidate, maxDist, want }) => {
    expect(fuzzyMatch(query, candidate, maxDist)).toBe(want);
  });
});
