import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';

describe('Specific Geocoding', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); });

  it.each([
    { query: 'New York', wantCity: 'New York City', wantState: 'NY' },
    { query: 'New York, NY', wantCity: 'New York City', wantState: 'NY' },
    { query: 'New York City', wantCity: 'New York City', wantState: 'NY' },
    { query: 'Austin, TX', wantCity: 'Austin', wantState: 'TX' },
    { query: 'Paris', wantCity: 'Paris', wantState: 'FR' },
  ])('geocode $query', ({ query, wantCity, wantState }) => {
    const r = g.geocode(query);
    expect(r.city).toBe(wantCity);
    if (wantState === 'FR') {
      expect(GeoBed.cityCountry(r)).toBe(wantState);
    } else {
      expect(GeoBed.cityRegion(r)).toBe(wantState);
    }
  });
});
