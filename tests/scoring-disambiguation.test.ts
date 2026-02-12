import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';

describe('Scoring & Disambiguation', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  }, 60_000);

  // ──────────────────────────────────────────────
  // Population tiebreaker — when multiple cities match
  // with equal score, higher population should win
  // ──────────────────────────────────────────────

  describe('Population tiebreaker', () => {
    it('Springfield → US (highest-population Springfield)', () => {
      const result = g.geocode('Springfield');
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityCountry(result)).toBe('US');
      // Springfield MO has pop ~170k — should beat smaller ones
      expect(result.population).toBeGreaterThan(100_000);
    });

    it('Columbus → US/OH (913k vs smaller Columbuses)', () => {
      const result = g.geocode('Columbus');
      expect(result.city).toBe('Columbus');
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(result.population).toBeGreaterThan(500_000);
    });

    it('Birmingham → GB (1.1M) vs US versions', () => {
      const result = g.geocode('Birmingham');
      expect(result.city).toBe('Birmingham');
      // Birmingham GB has ~1.1M pop; Birmingham AL has ~200k
      // The scorer should prefer the higher-population one
      expect(result.population).toBeGreaterThan(100_000);
    });

    it('Moscow → RU (10.3M) vs US versions', () => {
      const result = g.geocode('Moscow');
      expect(result.city).toBe('Moscow');
      expect(GeoBed.cityCountry(result)).toBe('RU');
      expect(result.population).toBeGreaterThan(1_000_000);
    });

    it('Dublin → IE (1M) vs US versions', () => {
      const result = g.geocode('Dublin');
      expect(result.city).toBe('Dublin');
      expect(GeoBed.cityCountry(result)).toBe('IE');
      expect(result.population).toBeGreaterThan(500_000);
    });

    it('Portland → US (highest-population Portland)', () => {
      const result = g.geocode('Portland');
      expect(result.city).toBe('Portland');
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(result.population).toBeGreaterThan(500_000);
    });

    it('Richmond → US (highest-population Richmond)', () => {
      const result = g.geocode('Richmond');
      expect(result.city).toBe('Richmond');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Cambridge → should return a Cambridge', () => {
      const result = g.geocode('Cambridge');
      expect(result.city).toBe('Cambridge');
      // Cambridge GB has ~130k, Cambridge MA has ~118k
      expect(result.population).toBeGreaterThan(50_000);
    });
  });

  // ──────────────────────────────────────────────
  // Alt-name matching — documents the broken whitespace
  // split on comma-separated cityAlt field
  // ──────────────────────────────────────────────

  describe('Alt-name matching (cityAlt)', () => {
    it('Tokyo matched by name, not alt', () => {
      const result = g.geocode('Tokyo');
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Tokio → Tokyo via alt name', () => {
      const result = g.geocode('Tokio');
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Londra → London via alt name', () => {
      const result = g.geocode('Londra');
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('München → Munich via alt name', () => {
      const result = g.geocode('München');
      expect(result.city).toBe('Munich');
      expect(GeoBed.cityCountry(result)).toBe('DE');
    });
  });

  // ──────────────────────────────────────────────
  // Country/state extraction formats
  // ──────────────────────────────────────────────

  describe('Country/state extraction formats', () => {
    it('Paris, France → Paris, FR', () => {
      const result = g.geocode('Paris, France');
      expect(result.city).toBe('Paris');
      expect(GeoBed.cityCountry(result)).toBe('FR');
    });

    it('France, Paris → Paris, FR', () => {
      const result = g.geocode('France, Paris');
      expect(result.city).toBe('Paris');
      expect(GeoBed.cityCountry(result)).toBe('FR');
    });

    it('Paris France → Paris, FR', () => {
      const result = g.geocode('Paris France');
      expect(result.city).toBe('Paris');
      expect(GeoBed.cityCountry(result)).toBe('FR');
    });

    it('TX, Houston → Houston, TX', () => {
      const result = g.geocode('TX, Houston');
      expect(result.city).toBe('Houston');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('Texas, Houston → Houston, TX', () => {
      const result = g.geocode('Texas, Houston');
      expect(result.city).toBe('Houston');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('Houston Texas → Houston, TX', () => {
      const result = g.geocode('Houston Texas');
      expect(result.city).toBe('Houston');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('Houston, TX → Houston, TX', () => {
      const result = g.geocode('Houston, TX');
      expect(result.city).toBe('Houston');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('Berlin, Germany → Berlin, DE', () => {
      const result = g.geocode('Berlin, Germany');
      expect(result.city).toBe('Berlin');
      expect(GeoBed.cityCountry(result)).toBe('DE');
    });

    it('Germany, Berlin → Berlin, DE', () => {
      const result = g.geocode('Germany, Berlin');
      expect(result.city).toBe('Berlin');
      expect(GeoBed.cityCountry(result)).toBe('DE');
    });

    it('Tokyo, Japan → Tokyo, JP', () => {
      const result = g.geocode('Tokyo, Japan');
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Japan, Tokyo → Tokyo, JP', () => {
      const result = g.geocode('Japan, Tokyo');
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Sydney, Australia → Sydney, AU', () => {
      const result = g.geocode('Sydney, Australia');
      expect(result.city).toBe('Sydney');
      expect(GeoBed.cityCountry(result)).toBe('AU');
    });
  });

  // ──────────────────────────────────────────────
  // Individual scoring weight paths
  // ──────────────────────────────────────────────

  describe('Scoring weight paths', () => {
    it('+7 exact city name match: London', () => {
      const result = g.geocode('London');
      expect(result.city).toBe('London');
    });

    it('+5 region abbrev exact: Austin, TX matches TX region', () => {
      const result = g.geocode('Austin, TX');
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('+4 country match: London, United Kingdom → GB', () => {
      const result = g.geocode('London, United Kingdom');
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('+4 state match: Portland, OR → OR region', () => {
      const result = g.geocode('Portland, OR');
      expect(result.city).toBe('Portland');
      expect(GeoBed.cityRegion(result)).toBe('OR');
    });

    it('+2 substring match: "New York" matches New York City', () => {
      const result = g.geocode('New York');
      expect(result.city).not.toBe('');
      expect(result.city.toLowerCase()).toContain('new york');
    });

    it('+1 case-insensitive match: "LONDON" matches London', () => {
      const result = g.geocode('LONDON');
      expect(result.city).toBe('London');
    });

    it('region disambiguation beats population alone: Springfield, IL', () => {
      const result = g.geocode('Springfield, IL');
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('IL');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('region disambiguation: Springfield, MA', () => {
      const result = g.geocode('Springfield, MA');
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('MA');
    });

    it('region disambiguation: Columbus, GA', () => {
      const result = g.geocode('Columbus, GA');
      expect(result.city).toBe('Columbus');
      expect(GeoBed.cityRegion(result)).toBe('GA');
    });

    it('country disambiguation beats population: Paris, France vs Paris, TX', () => {
      const fr = g.geocode('Paris, France');
      const tx = g.geocode('Paris, TX');
      expect(fr.city).toBe('Paris');
      expect(GeoBed.cityCountry(fr)).toBe('FR');
      expect(tx.city).toBe('Paris');
      expect(GeoBed.cityRegion(tx)).toBe('TX');
      // Paris FR should have much higher population
      expect(fr.population).toBeGreaterThan(tx.population);
    });

    it('population bonus for cities >= 1000', () => {
      // A city with pop >= 1000 should get +1 bonus
      // This is tested indirectly: major cities should always win over tiny ones
      const result = g.geocode('London');
      expect(result.population).toBeGreaterThan(1000);
    });
  });

  // ──────────────────────────────────────────────
  // Full US state name recognition
  // ──────────────────────────────────────────────

  describe('Full US state name recognition', () => {
    it('Springfield, Illinois → Springfield, IL, US', () => {
      const result = g.geocode('Springfield, Illinois');
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('IL');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Springfield Illinois → Springfield, IL, US', () => {
      const result = g.geocode('Springfield Illinois');
      expect(result.city).toBe('Springfield');
      expect(GeoBed.cityRegion(result)).toBe('IL');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('California, Los Angeles → Los Angeles, CA, US', () => {
      const result = g.geocode('California, Los Angeles');
      expect(result.city).toBe('Los Angeles');
      expect(GeoBed.cityRegion(result)).toBe('CA');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });
  });

  // ──────────────────────────────────────────────
  // Country prefix matching order
  // ──────────────────────────────────────────────

  describe('Country prefix matching order', () => {
    it('Bissau, Guinea-Bissau → GW (not Guinea)', () => {
      const result = g.geocode('Bissau, Guinea-Bissau');
      expect(result.city).toBe('Bissau');
      expect(GeoBed.cityCountry(result)).toBe('GW');
    });
  });
});
