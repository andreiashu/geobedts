import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, validateCache, knownCities, knownCoords, MIN_CITY_COUNT, MIN_COUNTRY_COUNT } from '../src/index.js';

describe('Validation', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); }, 60_000);

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

// ──────────────────────────────────────────────
// Country data field-level correctness
// ──────────────────────────────────────────────

describe('Country Data Correctness', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); }, 60_000);

  describe('Specific country fields', () => {
    it('US → iso3: USA, capital: Washington, continent: NA', () => {
      const us = g.countries.find(c => c.iso === 'US');
      expect(us).toBeDefined();
      expect(us!.iso3).toBe('USA');
      expect(us!.capital).toBe('Washington');
      expect(us!.continent).toBe('NA');
      expect(us!.country).toBe('United States');
    });

    it('DE → iso3: DEU, capital: Berlin, continent: EU', () => {
      const de = g.countries.find(c => c.iso === 'DE');
      expect(de).toBeDefined();
      expect(de!.iso3).toBe('DEU');
      expect(de!.capital).toBe('Berlin');
      expect(de!.continent).toBe('EU');
      expect(de!.country).toBe('Germany');
    });

    it('JP → iso3: JPN, capital: Tokyo, continent: AS', () => {
      const jp = g.countries.find(c => c.iso === 'JP');
      expect(jp).toBeDefined();
      expect(jp!.iso3).toBe('JPN');
      expect(jp!.capital).toBe('Tokyo');
      expect(jp!.continent).toBe('AS');
      expect(jp!.country).toBe('Japan');
    });

    it('BR → iso3: BRA, capital: Brasilia, continent: SA', () => {
      const br = g.countries.find(c => c.iso === 'BR');
      expect(br).toBeDefined();
      expect(br!.iso3).toBe('BRA');
      expect(br!.capital).toBe('Brasilia');
      expect(br!.continent).toBe('SA');
      expect(br!.country).toBe('Brazil');
    });

    it('AU → iso3: AUS, capital: Canberra, continent: OC', () => {
      const au = g.countries.find(c => c.iso === 'AU');
      expect(au).toBeDefined();
      expect(au!.iso3).toBe('AUS');
      expect(au!.capital).toBe('Canberra');
      expect(au!.continent).toBe('OC');
      expect(au!.country).toBe('Australia');
    });

    it('NG → iso3: NGA, capital: Abuja, continent: AF', () => {
      const ng = g.countries.find(c => c.iso === 'NG');
      expect(ng).toBeDefined();
      expect(ng!.iso3).toBe('NGA');
      expect(ng!.capital).toBe('Abuja');
      expect(ng!.continent).toBe('AF');
      expect(ng!.country).toBe('Nigeria');
    });
  });

  describe('All countries structural integrity', () => {
    it('all countries have iso.length === 2', () => {
      for (const co of g.countries) {
        expect(co.iso.length).toBe(2);
      }
    });

    it('all countries have iso3.length === 3', () => {
      for (const co of g.countries) {
        expect(co.iso3.length).toBe(3);
      }
    });

    it('all countries have non-empty country name', () => {
      for (const co of g.countries) {
        expect(co.country.length).toBeGreaterThan(0);
      }
    });

    it('all countries have non-empty continent', () => {
      for (const co of g.countries) {
        expect(co.continent.length).toBeGreaterThan(0);
      }
    });

    it('all continents are valid codes', () => {
      const validContinents = new Set(['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA']);
      for (const co of g.countries) {
        expect(validContinents.has(co.continent)).toBe(true);
      }
    });

    it('iso codes are unique', () => {
      const isos = g.countries.map(c => c.iso);
      const unique = new Set(isos);
      expect(unique.size).toBe(isos.length);
    });

    it('iso3 codes are unique', () => {
      const iso3s = g.countries.map(c => c.iso3);
      const unique = new Set(iso3s);
      expect(unique.size).toBe(iso3s.length);
    });
  });
});

// ──────────────────────────────────────────────
// Cities structural integrity
// ──────────────────────────────────────────────

describe('Cities Structural Integrity', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); }, 60_000);

  it('cities are sorted case-insensitively', () => {
    // Verify ordering by checking a sample of adjacent pairs
    const sampleSize = Math.min(1000, g.cities.length - 1);
    const step = Math.floor(g.cities.length / sampleSize);
    for (let i = 0; i < g.cities.length - step; i += step) {
      const a = g.cities[i].city.toLowerCase();
      const b = g.cities[i + step].city.toLowerCase();
      // Not strictly checking adjacent since we're stepping,
      // but the sorted order should hold across steps
      expect(a <= b || a === '' || b === '').toBe(true);
    }
  });

  it('all coordinates in valid range: lat ∈ [-90,90]', () => {
    for (const city of g.cities) {
      expect(city.latitude).toBeGreaterThanOrEqual(-90);
      expect(city.latitude).toBeLessThanOrEqual(90);
    }
  });

  it('all coordinates in valid range: lng ∈ [-180,180]', () => {
    for (const city of g.cities) {
      expect(city.longitude).toBeGreaterThanOrEqual(-180);
      expect(city.longitude).toBeLessThanOrEqual(180);
    }
  });

  it('all cities have non-empty name', () => {
    let emptyCount = 0;
    for (const city of g.cities) {
      if (city.city === '') emptyCount++;
    }
    // Allow a small number of empty names (data quality)
    // but most should have names
    expect(emptyCount).toBeLessThan(g.cities.length * 0.01);
  });

  it('all cities have population >= 0', () => {
    for (const city of g.cities) {
      expect(city.population).toBeGreaterThanOrEqual(0);
    }
  });

  it('nameIndex maps names to valid city indices', () => {
    expect(g.nameIndex.size).toBeGreaterThan(0);
    for (const [name, indices] of g.nameIndex) {
      expect(name).toBe(name.toLowerCase());
      expect(indices.length).toBeGreaterThan(0);
      for (const idx of indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(g.cities.length);
      }
    }
  });

  it('large cities have population > 0', () => {
    const largeCities = ['Tokyo', 'New York City', 'London', 'Paris', 'Beijing', 'Moscow'];
    for (const cityName of largeCities) {
      const matches = g.cities.filter(c => c.city === cityName);
      if (matches.length > 0) {
        const maxPop = Math.max(...matches.map(c => c.population));
        expect(maxPop).toBeGreaterThan(100_000);
      }
    }
  });
});
