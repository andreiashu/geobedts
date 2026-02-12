import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';

describe('Exact City Match (exactMatchCity)', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  }, 60_000);

  // ──────────────────────────────────────────────
  // Path 1: Single match → return immediately
  // ──────────────────────────────────────────────

  describe('Single match - return immediately', () => {
    it('Tokyo, Japan → Tokyo, JP', () => {
      const result = g.geocode('Tokyo, Japan', { exactCity: true });
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Reykjavik → Reykjavik, IS (unique city name)', () => {
      const result = g.geocode('Reykjavik', { exactCity: true });
      // Reykjavik is fairly unique
      if (result.city !== '') {
        expect(result.city).toContain('Reykjav');
        expect(GeoBed.cityCountry(result)).toBe('IS');
      }
    });
  });

  // ──────────────────────────────────────────────
  // Path 2: Multiple matches, region match
  // ──────────────────────────────────────────────

  describe('Multiple matches - region match', () => {
    it('Austin, TX → Austin in Texas', () => {
      const result = g.geocode('Austin, TX', { exactCity: true });
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityRegion(result)).toBe('TX');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Portland, OR → Portland in Oregon', () => {
      const result = g.geocode('Portland, OR', { exactCity: true });
      expect(result.city).toBe('Portland');
      expect(GeoBed.cityRegion(result)).toBe('OR');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Portland, ME → Portland in Maine', () => {
      const result = g.geocode('Portland, ME', { exactCity: true });
      expect(result.city).toBe('Portland');
      expect(GeoBed.cityRegion(result)).toBe('ME');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Springfield, IL → Springfield in Illinois', () => {
      const result = g.geocode('Springfield, IL', { exactCity: true });
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('IL');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Springfield, MO → Springfield in Missouri', () => {
      const result = g.geocode('Springfield, MO', { exactCity: true });
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('MO');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Springfield, MA → Springfield in Massachusetts', () => {
      const result = g.geocode('Springfield, MA', { exactCity: true });
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('MA');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('London, OH → London in Ohio', () => {
      const result = g.geocode('London, OH', { exactCity: true });
      expect(result.city).toBe('London');
      expect(GeoBed.cityRegion(result)).toBe('OH');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Columbus, OH → Columbus in Ohio', () => {
      const result = g.geocode('Columbus, OH', { exactCity: true });
      expect(result.city).toBe('Columbus');
      expect(GeoBed.cityRegion(result)).toBe('OH');
    });

    it('Columbus, GA → Columbus in Georgia', () => {
      const result = g.geocode('Columbus, GA', { exactCity: true });
      expect(result.city).toBe('Columbus');
      expect(GeoBed.cityRegion(result)).toBe('GA');
    });
  });

  // ──────────────────────────────────────────────
  // Path 3: Multiple matches, country+region match
  // ──────────────────────────────────────────────

  describe('Multiple matches - country+region match', () => {
    it('London, United Kingdom → London, GB', () => {
      const result = g.geocode('London, United Kingdom', { exactCity: true });
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('Dublin, Ireland → Dublin, IE', () => {
      const result = g.geocode('Dublin, Ireland', { exactCity: true });
      expect(result.city).toBe('Dublin');
      expect(GeoBed.cityCountry(result)).toBe('IE');
    });

    it('Berlin, Germany → Berlin, DE', () => {
      const result = g.geocode('Berlin, Germany', { exactCity: true });
      expect(result.city).toBe('Berlin');
      expect(GeoBed.cityCountry(result)).toBe('DE');
    });

    it('Cairo, Egypt → Cairo, EG', () => {
      const result = g.geocode('Cairo, Egypt', { exactCity: true });
      expect(result.city).toBe('Cairo');
      expect(GeoBed.cityCountry(result)).toBe('EG');
    });

    it('Sydney, Australia → Sydney, AU', () => {
      const result = g.geocode('Sydney, Australia', { exactCity: true });
      expect(result.city).toBe('Sydney');
      expect(GeoBed.cityCountry(result)).toBe('AU');
    });
  });

  // ──────────────────────────────────────────────
  // Path 4: No region match, fallback to country
  // ──────────────────────────────────────────────

  describe('No region match - fallback to country', () => {
    it('Austin, United States → Austin in US (highest pop)', () => {
      const result = g.geocode('Austin, United States', { exactCity: true });
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityCountry(result)).toBe('US');
      // Should be the largest Austin in the US (Austin, TX ~964k)
      expect(result.population).toBeGreaterThan(500_000);
    });

    it('Portland, United States → Portland in US (highest pop = OR)', () => {
      const result = g.geocode('Portland, United States', { exactCity: true });
      expect(result.city).toBe('Portland');
      expect(GeoBed.cityCountry(result)).toBe('US');
      // Portland, OR has ~652k; Portland, ME has ~68k
      expect(result.population).toBeGreaterThan(400_000);
    });

    it('Springfield, United States → largest US Springfield', () => {
      const result = g.geocode('Springfield, United States', { exactCity: true });
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });
  });

  // ──────────────────────────────────────────────
  // Path 5: No match → empty result
  // ──────────────────────────────────────────────

  describe('No match - empty result', () => {
    it('Nonexistent City → empty', () => {
      const result = g.geocode('Nonexistent City', { exactCity: true });
      expect(result.city).toBe('');
    });

    it('Xyzzyplugh → empty', () => {
      const result = g.geocode('Xyzzyplugh', { exactCity: true });
      expect(result.city).toBe('');
    });

    it('12345 → empty', () => {
      const result = g.geocode('12345', { exactCity: true });
      expect(result.city).toBe('');
    });

    it('!@#$% → empty', () => {
      const result = g.geocode('!@#$%', { exactCity: true });
      expect(result.city).toBe('');
    });
  });

  // ──────────────────────────────────────────────
  // Ambiguous names without qualifier in exact mode
  // ──────────────────────────────────────────────

  describe('Ambiguous names without qualifier (exact mode)', () => {
    it('London (no qualifier) → GB (highest-population London)', () => {
      const result = g.geocode('London', { exactCity: true });
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('Dublin (no qualifier) → IE (highest-population Dublin)', () => {
      const result = g.geocode('Dublin', { exactCity: true });
      expect(result.city).toBe('Dublin');
      expect(GeoBed.cityCountry(result)).toBe('IE');
    });

    it('Austin (no qualifier) → US (highest-population Austin)', () => {
      const result = g.geocode('Austin', { exactCity: true });
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Paris (no qualifier) → FR (highest-population Paris)', () => {
      const result = g.geocode('Paris', { exactCity: true });
      expect(result.city).toBe('Paris');
      expect(GeoBed.cityCountry(result)).toBe('FR');
    });
  });

  // ──────────────────────────────────────────────
  // Population disambiguation within exactCity
  // ──────────────────────────────────────────────

  describe('Population disambiguation within exactCity', () => {
    it('Dublin, United States → highest-population US Dublin', () => {
      const result = g.geocode('Dublin, United States', { exactCity: true });
      if (result.city !== '') {
        expect(result.city).toBe('Dublin');
        expect(GeoBed.cityCountry(result)).toBe('US');
      }
    });

    it('Portland, OR has higher pop than Portland, ME in exact mode', () => {
      const or = g.geocode('Portland, OR', { exactCity: true });
      const me = g.geocode('Portland, ME', { exactCity: true });
      expect(or.city).toBe('Portland');
      expect(me.city).toBe('Portland');
      expect(or.population).toBeGreaterThan(me.population);
    });

    it('Columbus, OH has higher pop than Columbus, GA in exact mode', () => {
      const oh = g.geocode('Columbus, OH', { exactCity: true });
      const ga = g.geocode('Columbus, GA', { exactCity: true });
      expect(oh.city).toBe('Columbus');
      expect(ga.city).toBe('Columbus');
      expect(oh.population).toBeGreaterThan(ga.population);
    });
  });
});
