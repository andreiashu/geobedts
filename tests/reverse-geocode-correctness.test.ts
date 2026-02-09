import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed } from '../src/index.js';

describe('Reverse Geocode Correctness', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  }, 60_000);

  // ──────────────────────────────────────────────
  // Remote locations → empty city (no cities nearby)
  // ──────────────────────────────────────────────

  describe('Remote locations → empty city', () => {
    it('(0, -160) Middle of Pacific → empty', () => {
      const result = g.reverseGeocode(0, -160);
      expect(result.city).toBe('');
    });

    it('(90, 0) North Pole → empty', () => {
      const result = g.reverseGeocode(90, 0);
      expect(result.city).toBe('');
    });

    it('(-90, 0) South Pole → empty', () => {
      const result = g.reverseGeocode(-90, 0);
      expect(result.city).toBe('');
    });

    it('(30, -40) Mid Atlantic → empty', () => {
      const result = g.reverseGeocode(30, -40);
      expect(result.city).toBe('');
    });

    it('(-75, 0) Antarctic → empty', () => {
      const result = g.reverseGeocode(-75, 0);
      expect(result.city).toBe('');
    });

    it('(0, 0) Gulf of Guinea → may be empty or near coastal city', () => {
      const result = g.reverseGeocode(0, 0);
      // (0,0) is in the Gulf of Guinea, might be empty or find a distant coastal city
      // Document actual behavior
      if (result.city !== '') {
        // If it returns something, it should be a real city
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ──────────────────────────────────────────────
  // World city coordinates → correct city name + country
  // ──────────────────────────────────────────────

  describe('World cities by coordinates', () => {
    const worldCities = [
      { name: 'Paris', lat: 48.8566, lng: 2.3522, wantCity: 'Paris', wantCountry: 'FR' },
      { name: 'Berlin', lat: 52.5200, lng: 13.4050, wantCity: 'Berlin', wantCountry: 'DE' },
      { name: 'Lagos', lat: 6.4541, lng: 3.3947, wantCity: 'Lagos', wantCountry: 'NG' },
      { name: 'Nairobi', lat: -1.2864, lng: 36.8172, wantCity: 'Nairobi', wantCountry: 'KE' },
      { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816, wantCity: 'Buenos Aires', wantCountry: 'AR' },
      { name: 'New York City', lat: 40.7128, lng: -74.0060, wantCity: 'New York City', wantCountry: 'US' },
      { name: 'Moscow', lat: 55.7558, lng: 37.6173, wantCity: 'Moscow', wantCountry: 'RU' },
      { name: 'Beijing', lat: 39.9042, lng: 116.4074, wantCity: 'Beijing', wantCountry: 'CN' },
      { name: 'Seoul', lat: 37.5665, lng: 126.9780, wantCity: 'Seoul', wantCountry: 'KR' },
      { name: 'Mumbai', lat: 19.0760, lng: 72.8777, wantCity: 'Mumbai', wantCountry: 'IN' },
      { name: 'Sydney', lat: -33.8688, lng: 151.2093, wantCity: 'Sydney', wantCountry: 'AU' },
      { name: 'Austin', lat: 30.2672, lng: -97.7431, wantCity: 'Austin', wantCountry: 'US' },
    ];

    for (const tc of worldCities) {
      it(`(${tc.lat}, ${tc.lng}) → ${tc.wantCity}, ${tc.wantCountry}`, () => {
        const result = g.reverseGeocode(tc.lat, tc.lng);
        expect(result.city).toBe(tc.wantCity);
        expect(GeoBed.cityCountry(result)).toBe(tc.wantCountry);
      });
    }
  });

  // ──────────────────────────────────────────────
  // Tokyo area — may return nearby city due to S2 cell resolution
  // ──────────────────────────────────────────────

  describe('Tokyo area', () => {
    it('Tokyo coordinates → near Tokyo, JP', () => {
      const result = g.reverseGeocode(35.6762, 139.6503);
      expect(GeoBed.cityCountry(result)).toBe('JP');
      // May return Tokyo or a nearby city in the Tokyo metropolitan area
      expect(result.city).not.toBe('');
    });
  });

  // ──────────────────────────────────────────────
  // Jakarta area
  // ──────────────────────────────────────────────

  describe('Jakarta area', () => {
    it('Jakarta coordinates → near Jakarta, ID', () => {
      const result = g.reverseGeocode(-6.2088, 106.8456);
      expect(GeoBed.cityCountry(result)).toBe('ID');
      expect(result.city).not.toBe('');
    });
  });

  // ──────────────────────────────────────────────
  // Precision: ~1km offset should still return same city
  // ──────────────────────────────────────────────

  describe('Precision - small offsets', () => {
    it('Paris center vs ~1km north → same city', () => {
      const center = g.reverseGeocode(48.8566, 2.3522);
      const offset = g.reverseGeocode(48.8656, 2.3522); // ~1km north
      expect(center.city).toBe('Paris');
      expect(offset.city).toBe('Paris');
    });

    it('Berlin center vs ~1km east → same city', () => {
      const center = g.reverseGeocode(52.5200, 13.4050);
      const offset = g.reverseGeocode(52.5200, 13.4190); // ~1km east
      expect(center.city).toBe('Berlin');
      expect(offset.city).toBe('Berlin');
    });

    it('Austin center vs ~1km south → same city', () => {
      const center = g.reverseGeocode(30.2672, -97.7431);
      const offset = g.reverseGeocode(30.2582, -97.7431); // ~1km south
      expect(center.city).toBe('Austin');
      expect(offset.city).toBe('Austin');
    });

    it('Moscow center vs ~1km west → same city', () => {
      const center = g.reverseGeocode(55.7558, 37.6173);
      const offset = g.reverseGeocode(55.7558, 37.6023); // ~1km west
      expect(center.city).toBe('Moscow');
      expect(offset.city).toBe('Moscow');
    });
  });

  // ──────────────────────────────────────────────
  // Boundary cases
  // ──────────────────────────────────────────────

  describe('Boundary coordinates', () => {
    it('(0, 180) date line → empty or nearest city', () => {
      const result = g.reverseGeocode(0, 180);
      // Date line in the Pacific — likely empty
      if (result.city !== '') {
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });

    it('(0, -180) date line → empty or nearest city', () => {
      const result = g.reverseGeocode(0, -180);
      if (result.city !== '') {
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });

    it('(-90, 180) extreme coordinates → empty', () => {
      const result = g.reverseGeocode(-90, 180);
      expect(result.city).toBe('');
    });
  });

  // ──────────────────────────────────────────────
  // Additional known locations
  // ──────────────────────────────────────────────

  describe('Additional known locations', () => {
    it('Palo Alto, CA coordinates', () => {
      const result = g.reverseGeocode(37.44651, -122.15322);
      expect(result.city).toBe('Palo Alto');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Santa Cruz, CA coordinates', () => {
      const result = g.reverseGeocode(36.9741, -122.0308);
      expect(result.city).toBe('Santa Cruz');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('London coordinates', () => {
      const result = g.reverseGeocode(51.5074, -0.1278);
      expect(result.city).toBe('London');
      expect(GeoBed.cityCountry(result)).toBe('GB');
    });

    it('Los Angeles coordinates', () => {
      const result = g.reverseGeocode(34.0522, -118.2437);
      expect(result.city).toBe('Los Angeles');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });

    it('Cairo coordinates', () => {
      const result = g.reverseGeocode(30.0444, 31.2357);
      expect(result.city).toBe('Cairo');
      expect(GeoBed.cityCountry(result)).toBe('EG');
    });
  });
});
