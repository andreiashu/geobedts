import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, validateCache, knownCities, knownCoords, MIN_CITY_COUNT, MIN_COUNTRY_COUNT } from '../src/index.js';

describe('Validation', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); });

  it('validates cache', async () => {
    await expect(validateCache()).resolves.not.toThrow();
  });

  it('data integrity', () => {
    expect(g.cities.length).toBeGreaterThanOrEqual(MIN_CITY_COUNT);
    expect(g.countries.length).toBeGreaterThanOrEqual(MIN_COUNTRY_COUNT);

    const continentCities: Record<string, string> = {
      'North America': 'New York',
      'South America': 'São Paulo',
      'Europe': 'London',
      'Asia': 'Tokyo',
      'Africa': 'Cairo',
      'Oceania': 'Sydney',
    };

    for (const [continent, city] of Object.entries(continentCities)) {
      const result = g.geocode(city);
      expect(result.city).not.toBe('');
    }
  });

  it('known cities geocode', () => {
    for (const tc of knownCities) {
      const result = g.geocode(tc.query);
      expect(result.city).toBe(tc.wantCity);
      expect(GeoBed.cityCountry(result)).toBe(tc.wantCountry);
    }
  });

  it('known coords reverse geocode', () => {
    for (const tc of knownCoords) {
      const result = g.reverseGeocode(tc.lat, tc.lng);
      expect(result.city).toBe(tc.wantCity);
      expect(GeoBed.cityCountry(result)).toBe(tc.wantCountry);
    }
  });
});
