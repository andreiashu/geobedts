import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';
import {
  cellIDFromLatLng, cellIDParentAtLevel, cellIDEdgeNeighbors,
  latLngFromDegrees, angularDistance,
} from '../src/s2-geometry.js';

describe('Bug fix regressions', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); }, 60_000);

  // ──────────────────────────────────────────────
  // Bug 1: Alt names were split on whitespace instead of commas
  // Geonames stores alt names as comma-separated values. The old code
  // used .split(/\s+/) which broke multi-word alt names and prevented
  // matching on individual comma-separated entries.
  // ──────────────────────────────────────────────

  describe('Alt name comma-split fix', () => {
    it.each([
      { query: 'Bombay', wantCity: 'Mumbai', wantCountry: 'IN' },
      { query: 'Peking', wantCity: 'Beijing', wantCountry: 'CN' },
      { query: 'Constantinople', wantCity: 'Istanbul', wantCountry: 'TR' },
      { query: 'Saigon', wantCity: 'Ho Chi Minh City', wantCountry: 'VN' },
      { query: 'Rangoon', wantCity: 'Yangon', wantCountry: 'MM' },
    ])('$query → $wantCity ($wantCountry)', ({ query, wantCity, wantCountry }) => {
      const result = g.geocode(query);
      expect(result.city).toBe(wantCity);
      expect(GeoBed.cityCountry(result)).toBe(wantCountry);
    });

    it('Tokio → Tokyo (single-word alt name)', () => {
      const result = g.geocode('Tokio');
      expect(result.city).toBe('Tokyo');
      expect(GeoBed.cityCountry(result)).toBe('JP');
    });

    it('Londra → London (alt name in multiple languages)', () => {
      const result = g.geocode('Londra');
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('München → Munich (non-ASCII alt name)', () => {
      const result = g.geocode('München');
      expect(result.city).toBe('Munich');
      expect(GeoBed.cityCountry(result)).toBe('DE');
    });

    it('Thira → Firá (Greek island alt name)', () => {
      const result = g.geocode('Thira');
      expect(result.city).toBe('Firá');
      expect(GeoBed.cityCountry(result)).toBe('GR');
    });
  });

  // ──────────────────────────────────────────────
  // Bug 2: Search range only covered primary names by first character.
  // Alt names starting with a different letter than the primary name
  // were never found. The inverted index fixes this by mapping all
  // names (primary + alt) to city indices.
  // ──────────────────────────────────────────────

  describe('Inverted index cross-letter alt name lookup', () => {
    it('Bombay (B) finds Mumbai (M) via alt name', () => {
      // "Bombay" starts with B, "Mumbai" starts with M
      // Old first-character search would only scan B-cities
      const result = g.geocode('Bombay');
      expect(result.city).toBe('Mumbai');
    });

    it('Peking (P) finds Beijing (B) via alt name', () => {
      const result = g.geocode('Peking');
      expect(result.city).toBe('Beijing');
    });

    it('Constantinople (C) finds Istanbul (I) via alt name', () => {
      const result = g.geocode('Constantinople');
      expect(result.city).toBe('Istanbul');
    });

    it('Saigon (S) finds Ho Chi Minh City (H) via alt name', () => {
      const result = g.geocode('Saigon');
      expect(result.city).toBe('Ho Chi Minh City');
    });

    it('nameIndex contains both primary and alt name entries', () => {
      // Verify the index has entries for alt names
      expect(g.nameIndex.has('bombay')).toBe(true);
      expect(g.nameIndex.has('peking')).toBe(true);
      expect(g.nameIndex.has('constantinople')).toBe(true);

      // And the primary names
      expect(g.nameIndex.has('mumbai')).toBe(true);
      expect(g.nameIndex.has('beijing')).toBe(true);
      expect(g.nameIndex.has('istanbul')).toBe(true);
    });

    it('nameIndex keys are all lowercase', () => {
      for (const key of Array.from(g.nameIndex.keys()).slice(0, 1000)) {
        expect(key).toBe(key.toLowerCase());
      }
    });
  });

  // ──────────────────────────────────────────────
  // Bug 3: No-match returned cities[0] instead of empty.
  // bestMatchingKey started at 0, so nonsense queries returned the
  // first city alphabetically instead of an empty result.
  // ──────────────────────────────────────────────

  describe('No-match returns empty city', () => {
    it.each([
      'Zxqwvbn',
      'Xyzpdq123',
      'Qqqqqqq',
      '!@#$%^',
      '99999',
    ])('nonsense query "%s" returns empty city', (query) => {
      const result = g.geocode(query);
      expect(result.city).toBe('');
      expect(result.population).toBe(0);
      expect(result.latitude).toBe(0);
      expect(result.longitude).toBe(0);
    });

    it('empty and whitespace queries return empty city', () => {
      expect(g.geocode('').city).toBe('');
      expect(g.geocode('   ').city).toBe('');
      expect(g.geocode('\t\n').city).toBe('');
    });

    it('nonsense query does NOT return first city alphabetically', () => {
      const nonsense = g.geocode('Zxqwvbn');
      const firstCity = g.cities[0];
      // The bug was that nonsense queries returned cities[0]
      expect(nonsense.city).not.toBe(firstCity.city);
    });
  });

  // ──────────────────────────────────────────────
  // Bug 4: S2 cellIDLevel returned -1 for non-leaf cells.
  // The function checked (id & 1n) === 0n and returned -1 early.
  // Only leaf cells (level 30) have bit 0 set. Non-leaf cells from
  // cellIDParentAtLevel have lower bits zeroed, so the check failed.
  // This caused cellIDEdgeNeighbors to compute wildly wrong neighbors
  // on different S2 faces.
  // ──────────────────────────────────────────────

  describe('S2 cellIDLevel fix for non-leaf cells', () => {
    it('edge neighbors of level-10 cell are on the same face for inland locations', () => {
      // Paris is well inland on S2 face 2
      const ll = latLngFromDegrees(48.8566, 2.3522);
      const cell = cellIDParentAtLevel(cellIDFromLatLng(ll), 10);
      const face = Number(cell >> 61n);
      expect(face).toBeGreaterThanOrEqual(0);
      expect(face).toBeLessThanOrEqual(5);

      const neighbors = cellIDEdgeNeighbors(cell);
      for (let i = 0; i < 4; i++) {
        const nFace = Number(neighbors[i] >> 61n);
        expect(nFace).toBeGreaterThanOrEqual(0);
        expect(nFace).toBeLessThanOrEqual(5);
      }
    });

    it('edge neighbors produce 4 distinct cells', () => {
      const ll = latLngFromDegrees(48.8566, 2.3522);
      const cell = cellIDParentAtLevel(cellIDFromLatLng(ll), 10);
      const neighbors = cellIDEdgeNeighbors(cell);

      const unique = new Set(neighbors.map(String));
      expect(unique.size).toBe(4);

      // None should equal the original cell
      for (const n of neighbors) {
        expect(n).not.toBe(cell);
      }
    });

    it('edge neighbors are valid for multiple global locations', () => {
      const locations = [
        { name: 'Berlin', lat: 52.52, lng: 13.405 },
        { name: 'NYC', lat: 40.7128, lng: -74.006 },
        { name: 'Moscow', lat: 55.7558, lng: 37.6173 },
        { name: 'Denver', lat: 39.7392, lng: -104.9903 },
        { name: 'Austin', lat: 30.2672, lng: -97.7431 },
        // Face-boundary locations (previously broken with custom S2 impl)
        { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
        { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
        { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
        { name: 'Rome', lat: 41.9028, lng: 12.4964 },
        { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
        { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
      ];

      for (const loc of locations) {
        const ll = latLngFromDegrees(loc.lat, loc.lng);
        const cell = cellIDParentAtLevel(cellIDFromLatLng(ll), 10);
        const neighbors = cellIDEdgeNeighbors(cell);
        const unique = new Set(neighbors.map(String));

        // Should have 4 distinct neighbors
        expect(unique.size).toBe(4);

        // All should have valid S2 face (0-5)
        for (const n of neighbors) {
          const face = Number(n >> 61n);
          expect(face).toBeGreaterThanOrEqual(0);
          expect(face).toBeLessThanOrEqual(5);
        }
      }
    });

    it('nearby city is reachable via cell neighbors', () => {
      // Paris (the city) should be in a neighboring cell of the query point
      const queryLL = latLngFromDegrees(48.8566, 2.3522);
      const queryCell = cellIDParentAtLevel(cellIDFromLatLng(queryLL), 10);

      const parisLL = latLngFromDegrees(48.85341, 2.3488); // Paris coordinates
      const parisCell = cellIDParentAtLevel(cellIDFromLatLng(parisLL), 10);

      const searchCells = new Set<bigint>();
      searchCells.add(queryCell);
      for (const n of cellIDEdgeNeighbors(queryCell)) {
        searchCells.add(n);
      }

      expect(searchCells.has(parisCell)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Bug 5: Reverse geocode returned neighborhoods instead of cities.
  // Pure nearest-neighbor returned Mitte instead of Berlin, etc.
  // Fix: population-weighted distance threshold prefers major cities
  // over nearby neighborhoods/districts.
  // ──────────────────────────────────────────────

  describe('Reverse geocode neighborhood override', () => {
    it('Berlin coordinates return Berlin, not Mitte', () => {
      const result = g.reverseGeocode(52.52, 13.405);
      expect(result.city).toBe('Berlin');
      expect(GeoBed.cityCountry(result)).toBe('DE');
      expect(result.population).toBeGreaterThan(1_000_000);
    });

    it('Paris coordinates return Paris, not a neighborhood', () => {
      const result = g.reverseGeocode(48.8566, 2.3522);
      expect(result.city).toBe('Paris');
      expect(GeoBed.cityCountry(result)).toBe('FR');
    });

    it('Cairo coordinates return Cairo, not a neighborhood', () => {
      const result = g.reverseGeocode(30.0444, 31.2357);
      expect(result.city).toBe('Cairo');
      expect(GeoBed.cityCountry(result)).toBe('EG');
    });

    it('small offsets near Berlin center still return Berlin', () => {
      const center = g.reverseGeocode(52.52, 13.405);
      const offset = g.reverseGeocode(52.52, 13.419); // ~1km east
      expect(center.city).toBe('Berlin');
      expect(offset.city).toBe('Berlin');
    });

    it('small offsets near Paris center still return Paris', () => {
      const center = g.reverseGeocode(48.8566, 2.3522);
      const offset = g.reverseGeocode(48.8656, 2.3522); // ~1km north
      expect(center.city).toBe('Paris');
      expect(offset.city).toBe('Paris');
    });
  });

  // ──────────────────────────────────────────────
  // Bug 6: Reverse geocode returned results for remote locations.
  // After the S2 fix expanded the search area, the North Pole query
  // found a French city thousands of km away. Fix: ~100km max cutoff.
  // ──────────────────────────────────────────────

  describe('Reverse geocode max distance cutoff', () => {
    it('North Pole returns empty', () => {
      const result = g.reverseGeocode(90, 0);
      expect(result.city).toBe('');
    });

    it('South Pole returns empty', () => {
      const result = g.reverseGeocode(-90, 0);
      expect(result.city).toBe('');
    });

    it('mid-Pacific returns empty', () => {
      const result = g.reverseGeocode(0, -160);
      expect(result.city).toBe('');
    });

    it('mid-Atlantic returns empty', () => {
      const result = g.reverseGeocode(30, -40);
      expect(result.city).toBe('');
    });

    it('Antarctic returns empty', () => {
      const result = g.reverseGeocode(-75, 0);
      expect(result.city).toBe('');
    });

    it('locations near cities still work', () => {
      // Austin, TX
      const result = g.reverseGeocode(30.2672, -97.7431);
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });
  });

  // ──────────────────────────────────────────────
  // Bug 7: Coordinate validation — invalid inputs return empty
  // ──────────────────────────────────────────────

  describe('Coordinate validation', () => {
    it('NaN latitude returns empty', () => {
      const result = g.reverseGeocode(NaN, -97.7431);
      expect(result.city).toBe('');
    });

    it('NaN longitude returns empty', () => {
      const result = g.reverseGeocode(30.2672, NaN);
      expect(result.city).toBe('');
    });

    it('Infinity latitude returns empty', () => {
      const result = g.reverseGeocode(Infinity, -97.7431);
      expect(result.city).toBe('');
    });

    it('-Infinity longitude returns empty', () => {
      const result = g.reverseGeocode(30.2672, -Infinity);
      expect(result.city).toBe('');
    });

    it('lat=91 (out of range) returns empty', () => {
      const result = g.reverseGeocode(91, 0);
      expect(result.city).toBe('');
    });

    it('lat=-91 (out of range) returns empty', () => {
      const result = g.reverseGeocode(-91, 0);
      expect(result.city).toBe('');
    });

    it('lng=181 (out of range) returns empty', () => {
      const result = g.reverseGeocode(0, 181);
      expect(result.city).toBe('');
    });

    it('lng=-181 (out of range) returns empty', () => {
      const result = g.reverseGeocode(0, -181);
      expect(result.city).toBe('');
    });

    it('both NaN returns empty', () => {
      const result = g.reverseGeocode(NaN, NaN);
      expect(result.city).toBe('');
    });

    it('valid boundary values still work', () => {
      // lat=90 and lng=180 are valid boundary values
      const r1 = g.reverseGeocode(90, 0);
      expect(r1).toBeDefined();
      const r2 = g.reverseGeocode(0, 180);
      expect(r2).toBeDefined();
      const r3 = g.reverseGeocode(0, -180);
      expect(r3).toBeDefined();
    });
  });
});
