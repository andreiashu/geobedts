import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, prev, toLower, toUpper } from '../src/index.js';

describe('GeoBed', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  });

  it('TestANewGeobed - should create a valid GeoBed instance', () => {
    expect(g).toBeTruthy();
    expect(g.cities.length).toBeGreaterThan(0);
    expect(g.countries.length).toBeGreaterThan(0);
    expect(g.nameIndex.size).toBeGreaterThan(0);
    expect(Array.isArray(g.cities)).toBe(true);
    expect(Array.isArray(g.countries)).toBe(true);
    expect(g.nameIndex instanceof Map).toBe(true);
  });

  it('TestGeocode - should forward geocode cities correctly', () => {
    const testLocations = [
      { query: 'Austin', city: 'Austin', country: 'US', region: 'TX' },
      { query: 'Paris', city: 'Paris', country: 'FR', region: '' },
      { query: 'Sydney', city: 'Sydney', country: 'AU', region: '' },
      { query: 'Berlin', city: 'Berlin', country: 'DE', region: '' },
    ];

    for (const v of testLocations) {
      const r = g.geocode(v.query);
      expect(r.city).toBe(v.city);
      expect(GeoBed.cityCountry(r)).toBe(v.country);
      if (v.region !== '') {
        expect(GeoBed.cityRegion(r)).toBe(v.region);
      }
    }

    const empty = g.geocode('');
    expect(empty.city).toBe('');

    const space = g.geocode(' ');
    expect(space.population).toBe(0);
  });

  it('TestReverseGeocode - should reverse geocode coordinates correctly', () => {
    let r = g.reverseGeocode(30.26715, -97.74306);
    expect(r.city).toBe('Austin');
    expect(GeoBed.cityRegion(r)).toBe('TX');
    expect(GeoBed.cityCountry(r)).toBe('US');

    r = g.reverseGeocode(37.44651, -122.15322);
    expect(r.city).toBe('Palo Alto');
    expect(GeoBed.cityRegion(r)).toBe('CA');
    expect(GeoBed.cityCountry(r)).toBe('US');

    r = g.reverseGeocode(36.9741, -122.0308);
    expect(r.city).toBe('Santa Cruz');

    r = g.reverseGeocode(37.4275, -122.1697);
    expect(r.city).toBe('Stanford');

    r = g.reverseGeocode(51.51279, -0.09184);
    expect(r.city).toBe('London');
  });

  it('TestNext - should test prev function', () => {
    expect(prev('n')).toBe('m');
    expect(prev('n').codePointAt(0)).toBe(109);
  });

  it('TestToUpper - should convert to uppercase', () => {
    expect(toUpper('nyc')).toBe('NYC');
  });

  it('TestToLower - should convert to lowercase', () => {
    expect(toLower('NYC')).toBe('nyc');
  });

  it('TestConcurrentNewGeobed - should create multiple instances concurrently', async () => {
    const promises = Array.from({ length: 10 }, () => GeoBed.create());
    const instances = await Promise.all(promises);

    for (const instance of instances) {
      expect(instance).toBeTruthy();
      expect(instance.cities.length).toBeGreaterThan(0);
      const result = instance.geocode('Austin, TX');
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityCountry(result)).toBe('US');
    }
  });
});
