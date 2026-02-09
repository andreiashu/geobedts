import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';

describe('Round-Trip Consistency (forward + reverse)', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  }, 60_000);

  // ──────────────────────────────────────────────
  // Round-trip: geocode → reverseGeocode → same city
  // ──────────────────────────────────────────────

  describe('Geocode then reverse geocode returns same city', () => {
    const queries = [
      'Tokyo',
      'Paris',
      'Berlin',
      'Sydney',
      'New York, NY',
      'Lagos',
      'Cairo',
      'Moscow',
      'Nairobi',
      'Austin, TX',
      'San Francisco, CA',
      'London',
      'Seoul',
      'Mumbai',
      'Beijing',
    ];

    for (const query of queries) {
      it(`round-trip: ${query}`, () => {
        const fwd = g.geocode(query);
        expect(fwd.city).not.toBe('');

        const rev = g.reverseGeocode(fwd.latitude, fwd.longitude);
        expect(rev.city).toBe(fwd.city);
        expect(GeoBed.cityCountry(rev)).toBe(GeoBed.cityCountry(fwd));
      });
    }
  });

  // ──────────────────────────────────────────────
  // Coordinate reasonableness checks
  // ──────────────────────────────────────────────

  describe('Coordinate reasonableness', () => {
    it('Tokyo → lat ∈ [35,36], lng ∈ [139,140]', () => {
      const result = g.geocode('Tokyo');
      expect(result.latitude).toBeGreaterThanOrEqual(35);
      expect(result.latitude).toBeLessThanOrEqual(36);
      expect(result.longitude).toBeGreaterThanOrEqual(139);
      expect(result.longitude).toBeLessThanOrEqual(140);
    });

    it('Sydney → lat ∈ [-34,-33], lng ∈ [151,152]', () => {
      const result = g.geocode('Sydney');
      expect(result.latitude).toBeGreaterThanOrEqual(-34);
      expect(result.latitude).toBeLessThanOrEqual(-33);
      expect(result.longitude).toBeGreaterThanOrEqual(151);
      expect(result.longitude).toBeLessThanOrEqual(152);
    });

    it('Lagos → lat ∈ [6,7], lng ∈ [3,4]', () => {
      const result = g.geocode('Lagos');
      expect(result.latitude).toBeGreaterThanOrEqual(6);
      expect(result.latitude).toBeLessThanOrEqual(7);
      expect(result.longitude).toBeGreaterThanOrEqual(3);
      expect(result.longitude).toBeLessThanOrEqual(4);
    });

    it('Paris → lat ∈ [48,49], lng ∈ [2,3]', () => {
      const result = g.geocode('Paris');
      expect(result.latitude).toBeGreaterThanOrEqual(48);
      expect(result.latitude).toBeLessThanOrEqual(49);
      expect(result.longitude).toBeGreaterThanOrEqual(2);
      expect(result.longitude).toBeLessThanOrEqual(3);
    });

    it('Berlin → lat ∈ [52,53], lng ∈ [13,14]', () => {
      const result = g.geocode('Berlin');
      expect(result.latitude).toBeGreaterThanOrEqual(52);
      expect(result.latitude).toBeLessThanOrEqual(53);
      expect(result.longitude).toBeGreaterThanOrEqual(13);
      expect(result.longitude).toBeLessThanOrEqual(14);
    });

    it('Moscow → lat ∈ [55,56], lng ∈ [37,38]', () => {
      const result = g.geocode('Moscow');
      expect(result.latitude).toBeGreaterThanOrEqual(55);
      expect(result.latitude).toBeLessThanOrEqual(56);
      expect(result.longitude).toBeGreaterThanOrEqual(37);
      expect(result.longitude).toBeLessThanOrEqual(38);
    });

    it('Buenos Aires → lat ∈ [-35,-34], lng ∈ [-59,-58]', () => {
      const result = g.geocode('Buenos Aires');
      expect(result.latitude).toBeGreaterThanOrEqual(-35);
      expect(result.latitude).toBeLessThanOrEqual(-34);
      expect(result.longitude).toBeGreaterThanOrEqual(-59);
      expect(result.longitude).toBeLessThanOrEqual(-58);
    });

    it('Nairobi → lat ∈ [-2,-1], lng ∈ [36,37]', () => {
      const result = g.geocode('Nairobi');
      expect(result.latitude).toBeGreaterThanOrEqual(-2);
      expect(result.latitude).toBeLessThanOrEqual(-1);
      expect(result.longitude).toBeGreaterThanOrEqual(36);
      expect(result.longitude).toBeLessThanOrEqual(37);
    });

    it('Austin, TX → lat ∈ [30,31], lng ∈ [-98,-97]', () => {
      const result = g.geocode('Austin, TX');
      expect(result.latitude).toBeGreaterThanOrEqual(30);
      expect(result.latitude).toBeLessThanOrEqual(31);
      expect(result.longitude).toBeGreaterThanOrEqual(-98);
      expect(result.longitude).toBeLessThanOrEqual(-97);
    });

    it('San Francisco → lat ∈ [37,38], lng ∈ [-123,-122]', () => {
      const result = g.geocode('San Francisco');
      expect(result.latitude).toBeGreaterThanOrEqual(37);
      expect(result.latitude).toBeLessThanOrEqual(38);
      expect(result.longitude).toBeGreaterThanOrEqual(-123);
      expect(result.longitude).toBeLessThanOrEqual(-122);
    });
  });

  // ──────────────────────────────────────────────
  // Forward consistency: same query → same result
  // ──────────────────────────────────────────────

  describe('Deterministic: same query → same result', () => {
    it('geocode("Paris") returns same result every time', () => {
      const r1 = g.geocode('Paris');
      const r2 = g.geocode('Paris');
      expect(r1.city).toBe(r2.city);
      expect(r1.latitude).toBe(r2.latitude);
      expect(r1.longitude).toBe(r2.longitude);
      expect(GeoBed.cityCountry(r1)).toBe(GeoBed.cityCountry(r2));
    });

    it('reverseGeocode returns same result every time', () => {
      const r1 = g.reverseGeocode(48.8566, 2.3522);
      const r2 = g.reverseGeocode(48.8566, 2.3522);
      expect(r1.city).toBe(r2.city);
      expect(r1.latitude).toBe(r2.latitude);
      expect(r1.longitude).toBe(r2.longitude);
    });
  });
});
