import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, getDefaultGeobed } from '../src/index.js';

describe('GeoBed Comprehensive Tests', () => {
  let g: GeoBed;

  beforeAll(async () => {
    g = await GeoBed.create();
  });

  describe('TestGeocodeEdgeCases', () => {
    it('empty string', () => { expect(g.geocode('').city).toBe(''); });
    it('whitespace only - spaces', () => { expect(g.geocode('   ').city).toBe(''); });
    it('whitespace only - tabs', () => { expect(g.geocode('\t\t').city).toBe(''); });
    it('whitespace only - mixed', () => { expect(g.geocode(' \t \n ').city).toBe(''); });
    it('numeric string', () => { expect(g.geocode('12345').city).toBe(''); });
    it('long number', () => { expect(g.geocode('1234567890').city).toBe(''); });
    it('special characters', () => { expect(g.geocode('!@#$%^&*()').city).toBe(''); });
    it('very long string', () => {
      const result = g.geocode('a'.repeat(1000));
      // Should truncate at 256 codepoints and not crash
      expect(result).toBeDefined();
    });
    it('string with newlines', () => {
      const result = g.geocode('New\nYork');
      // Newlines in input — may or may not match
      expect(result).toBeDefined();
    });
    it('single character', () => {
      const result = g.geocode('A');
      // Single char may match something or return empty
      expect(result).toBeDefined();
    });
    it('two characters', () => {
      const result = g.geocode('NY');
      // "NY" is a state code — may or may not resolve to a city
      expect(result).toBeDefined();
    });
  });

  describe('TestGeocodeUnicodeInternational', () => {
    const tests = [
      { name: 'Munich', input: 'Munich', wantCity: 'Munich', wantCountry: 'DE' },
      { name: 'Sao Paulo', input: 'Sao Paulo', wantCity: 'São Paulo', wantCountry: 'BR' },
      { name: 'Beijing', input: 'Beijing', wantCity: 'Beijing', wantCountry: 'CN' },
      { name: 'Moscow', input: 'Moscow', wantCity: 'Moscow', wantCountry: 'RU' },
      { name: 'Vienna', input: 'Vienna', wantCity: 'Vienna', wantCountry: 'AT' },
      { name: 'Prague', input: 'Prague', wantCity: 'Prague', wantCountry: 'CZ' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        expect(result.city).toBe(tt.wantCity);
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        expect(result.population).toBeGreaterThan(0);
      });
    }
  });

  describe('TestGeocodeJapaneseChineseNames', () => {
    const tests = [
      { name: 'Tokyo', input: 'Tokyo', wantCity: 'Tokyo', wantCountry: 'JP' },
      { name: 'Osaka', input: 'Osaka', wantCity: 'Osaka', wantCountry: 'JP' },
      { name: 'Shanghai', input: 'Shanghai', wantCity: 'Shanghai', wantCountry: 'CN' },
      { name: 'Seoul', input: 'Seoul', wantCity: 'Seoul', wantCountry: 'KR' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        expect(result.city).toBe(tt.wantCity);
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        expect(result.population).toBeGreaterThan(0);
      });
    }
  });

  describe('TestGeocodeAmbiguousNames', () => {
    const tests = [
      { name: 'Paris France', input: 'Paris, France', wantCountry: 'FR', wantRegion: '' },
      { name: 'Paris Texas', input: 'Paris, TX', wantCountry: 'US', wantRegion: 'TX' },
      { name: 'London UK', input: 'London, UK', wantCountry: 'GB', wantRegion: '' },
      { name: 'London Ohio', input: 'London, OH', wantCountry: 'US', wantRegion: 'OH' },
      { name: 'Springfield IL', input: 'Springfield, IL', wantCountry: 'US', wantRegion: 'IL' },
      { name: 'Springfield MA', input: 'Springfield, MA', wantCountry: 'US', wantRegion: 'MA' },
      { name: 'Portland Oregon', input: 'Portland, OR', wantCountry: 'US', wantRegion: 'OR' },
      { name: 'Portland Maine', input: 'Portland, ME', wantCountry: 'US', wantRegion: 'ME' },
      { name: 'Columbus Ohio', input: 'Columbus, OH', wantCountry: 'US', wantRegion: 'OH' },
      { name: 'Columbus Georgia', input: 'Columbus, GA', wantCountry: 'US', wantRegion: 'GA' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        expect(result.city).not.toBe('');
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        if (tt.wantRegion) expect(GeoBed.cityRegion(result)).toBe(tt.wantRegion);
        expect(result.population).toBeGreaterThan(0);
      });
    }
  });

  describe('TestGeocodeCaseInsensitivity', () => {
    const tests = [
      { name: 'London', inputs: ['London', 'LONDON', 'london', 'LoNdOn', 'lONDON'] },
      { name: 'New York', inputs: ['New York', 'NEW YORK', 'new york', 'New york', 'nEW yORK'] },
      { name: 'Paris', inputs: ['Paris', 'PARIS', 'paris', 'PaRiS'] },
      { name: 'Tokyo', inputs: ['Tokyo', 'TOKYO', 'tokyo', 'ToKyO'] },
      { name: 'Sydney', inputs: ['Sydney', 'SYDNEY', 'sydney', 'SyDnEy'] },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const reference = g.geocode(tt.inputs[0]);
        expect(reference.city).not.toBe('');
        for (const input of tt.inputs.slice(1)) {
          const result = g.geocode(input);
          expect(result.city).toBe(reference.city);
          expect(GeoBed.cityCountry(result)).toBe(GeoBed.cityCountry(reference));
        }
      });
    }
  });

  describe('TestGeocodeConcurrency', () => {
    it('handles many geocode operations', () => {
      const queries = [
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
        'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
        'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte',
        'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston',
        'London', 'Paris', 'Tokyo', 'Berlin', 'Sydney',
        'Moscow', 'Beijing', 'Seoul', 'Mumbai', 'Cairo',
      ];
      for (let i = 0; i < 100; i++) {
        const query = queries[i % queries.length];
        const result = g.geocode(query);
        void result.city;
      }
    });
  });

  describe('TestReverseGeocodeConcurrency', () => {
    it('handles many reverse geocode operations', () => {
      const coords = [
        [40.7128, -74.0060], [34.0522, -118.2437], [51.5074, -0.1278],
        [48.8566, 2.3522], [35.6762, 139.6503], [-33.8688, 151.2093],
        [55.7558, 37.6173], [39.9042, 116.4074], [37.5665, 126.9780],
        [19.0760, 72.8777],
      ];
      for (let i = 0; i < 100; i++) {
        const [lat, lng] = coords[i % coords.length];
        const result = g.reverseGeocode(lat, lng);
        void result.city;
        void GeoBed.cityCountry(result);
      }
    });
  });

  describe('TestMixedConcurrency', () => {
    it('handles mixed operations', () => {
      const queries = ['New York', 'London', 'Paris', 'Tokyo', 'Sydney'];
      const coords = [
        [40.7128, -74.0060], [51.5074, -0.1278], [48.8566, 2.3522],
        [35.6762, 139.6503], [-33.8688, 151.2093],
      ];
      for (let i = 0; i < 200; i++) {
        if (i % 2 === 0) {
          const result = g.geocode(queries[i % queries.length]);
          void result.city;
        } else {
          const [lat, lng] = coords[i % coords.length];
          const result = g.reverseGeocode(lat, lng);
          void result.city;
        }
      }
    });
  });

  describe('TestReverseGeocodeEdgeCases', () => {
    it('origin (0,0) → empty or near coastal city', () => {
      const result = g.reverseGeocode(0, 0);
      // (0,0) is in the Gulf of Guinea — likely empty
      if (result.city !== '') {
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });

    it('north pole (90,0) → empty', () => {
      const result = g.reverseGeocode(90, 0);
      expect(result.city).toBe('');
    });

    it('south pole (-90,0) → empty', () => {
      const result = g.reverseGeocode(-90, 0);
      expect(result.city).toBe('');
    });

    it('date line positive (0,180) → empty or nearest', () => {
      const result = g.reverseGeocode(0, 180);
      if (result.city !== '') {
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });

    it('date line negative (0,-180) → empty or nearest', () => {
      const result = g.reverseGeocode(0, -180);
      if (result.city !== '') {
        expect(result.population).toBeGreaterThanOrEqual(0);
      }
    });

    it('middle of Pacific (0,-160) → empty', () => {
      const result = g.reverseGeocode(0, -160);
      expect(result.city).toBe('');
    });

    it('middle of Atlantic (30,-40) → empty', () => {
      const result = g.reverseGeocode(30, -40);
      expect(result.city).toBe('');
    });

    it('extreme coordinates (-90,180) → empty', () => {
      const result = g.reverseGeocode(-90, 180);
      expect(result.city).toBe('');
    });

    it('very precise Austin TX → Austin, US', () => {
      const result = g.reverseGeocode(30.267153, -97.743057);
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityCountry(result)).toBe('US');
    });
  });

  describe('TestReverseGeocodeKnownLocations', () => {
    const tests = [
      { name: 'Austin TX', lat: 30.26715, lng: -97.74306, wantCity: 'Austin', wantCountry: 'US' },
      { name: 'Palo Alto CA', lat: 37.44651, lng: -122.15322, wantCity: 'Palo Alto', wantCountry: 'US' },
      { name: 'Santa Cruz CA', lat: 36.9741, lng: -122.0308, wantCity: 'Santa Cruz', wantCountry: 'US' },
      { name: 'Sydney Australia', lat: -33.8688, lng: 151.2093, wantCity: 'Sydney', wantCountry: 'AU' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.reverseGeocode(tt.lat, tt.lng);
        expect(result.city).toBe(tt.wantCity);
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
      });
    }
  });

  describe('TestGeocodeWithOptions', () => {
    it('fuzzy match - Austin', () => {
      expect(g.geocode('Austin', { exactCity: false }).city).toBe('Austin');
    });
    it('exact match - Austin TX', () => {
      expect(g.geocode('Austin, TX', { exactCity: true }).city).toBe('Austin');
    });
    it('fuzzy match - New York NY', () => {
      expect(g.geocode('New York, NY', { exactCity: false }).city).toBe('New York City');
    });
    it('exact match - New York City NY', () => {
      expect(g.geocode('New York City, NY', { exactCity: true }).city).toBe('New York City');
    });
    it('fuzzy match - Paris France', () => {
      expect(g.geocode('Paris, France', { exactCity: false }).city).toBe('Paris');
    });
  });

  describe('TestGeocodeUSStates', () => {
    const tests = [
      { input: 'Austin, TX', wantCity: 'Austin', wantRegion: 'TX' },
      { input: 'Austin, tx', wantCity: 'Austin', wantRegion: 'TX' },
      { input: 'Austin TX', wantCity: 'Austin', wantRegion: 'TX' },
      { input: 'Houston, Texas', wantCity: 'Houston', wantRegion: 'TX' },
      { input: 'San Francisco, CA', wantCity: 'San Francisco', wantRegion: 'CA' },
      { input: 'New York, NY', wantCity: 'New York City', wantRegion: 'NY' },
    ];

    for (const tt of tests) {
      it(tt.input, () => {
        const result = g.geocode(tt.input);
        expect(result.city).toBe(tt.wantCity);
        expect(GeoBed.cityRegion(result)).toBe(tt.wantRegion);
      });
    }
  });

  describe('TestGeocodeCountries', () => {
    const tests = [
      { input: 'London, United Kingdom', wantCountry: 'GB' },
      { input: 'Paris, France', wantCountry: 'FR' },
      { input: 'Berlin, Germany', wantCountry: 'DE' },
      { input: 'Tokyo, Japan', wantCountry: 'JP' },
      { input: 'Sydney, Australia', wantCountry: 'AU' },
    ];

    for (const tt of tests) {
      it(tt.input, () => {
        const result = g.geocode(tt.input);
        expect(result.city).not.toBe('');
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        expect(result.population).toBeGreaterThan(0);
      });
    }
  });

  describe('TestGetDefaultGeobedSingleton', () => {
    it('returns same instance', async () => {
      const g1 = await getDefaultGeobed();
      const g2 = await getDefaultGeobed();
      expect(g1).toBe(g2);
      const result = g1.geocode('New York');
      expect(result.city).not.toBe('');
    });
  });

  describe('TestGetDefaultGeobedConcurrency', () => {
    it('50 concurrent calls return same instance', async () => {
      const promises = Array.from({ length: 50 }, () => getDefaultGeobed());
      const instances = await Promise.all(promises);
      for (let i = 1; i < instances.length; i++) {
        expect(instances[i]).toBe(instances[0]);
      }
    });
  });

  describe('TestGeobedCityMethods', () => {
    it('all fields for Austin TX', () => {
      const result = g.geocode('Austin, TX');
      expect(result.city).not.toBe('');
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(GeoBed.cityRegion(result)).toBe('TX');
      expect(result.latitude).toBeGreaterThan(30.0);
      expect(result.latitude).toBeLessThan(31.0);
      expect(result.longitude).toBeGreaterThan(-98.0);
      expect(result.longitude).toBeLessThan(-97.0);
      expect(result.population).toBeGreaterThan(0);
    });
  });

  describe('TestSpecialInputFormats', () => {
    it('leading spaces: "  Austin" → Austin', () => {
      const result = g.geocode('  Austin');
      expect(result.city).toBe('Austin');
    });

    it('trailing spaces: "Austin  " → Austin', () => {
      const result = g.geocode('Austin  ');
      expect(result.city).toBe('Austin');
    });

    it('leading/trailing spaces match normal query', () => {
      const normal = g.geocode('Austin');
      const padded = g.geocode('  Austin  ');
      expect(padded.city).toBe(normal.city);
      expect(GeoBed.cityCountry(padded)).toBe(GeoBed.cityCountry(normal));
    });

    it('multiple spaces: "New  York" → handles gracefully', () => {
      const result = g.geocode('New  York');
      expect(result.city).not.toBe('');
    });

    it('tabs between words: "New\\tYork" → handles gracefully', () => {
      const result = g.geocode('New\tYork');
      expect(result.city).not.toBe('');
    });

    it('mixed whitespace: " Austin , TX " → Austin, TX', () => {
      const result = g.geocode(' Austin , TX ');
      expect(result.city).toBe('Austin');
      expect(GeoBed.cityRegion(result)).toBe('TX');
    });

    it('multiple commas: "Austin,,,TX" → handles gracefully', () => {
      const result = g.geocode('Austin,,,TX');
      expect(result).toBeDefined();
    });

    it('semicolon separator: "Austin;TX" → handles gracefully', () => {
      const result = g.geocode('Austin;TX');
      expect(result).toBeDefined();
    });

    it('hyphenated city: Winston-Salem → US/NC', () => {
      const result = g.geocode('Winston-Salem');
      expect(result.city).toBe('Winston-Salem');
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(GeoBed.cityRegion(result)).toBe('NC');
    });

    it("city with apostrophe: O'Fallon → US/MO", () => {
      const result = g.geocode("O'Fallon");
      expect(result.city).toBe("O'Fallon");
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(GeoBed.cityRegion(result)).toBe('MO');
    });

    it('city with period: St. Louis → US/MO', () => {
      const result = g.geocode('St. Louis');
      expect(result.city).toBe('St. Louis');
      expect(GeoBed.cityCountry(result)).toBe('US');
      expect(GeoBed.cityRegion(result)).toBe('MO');
    });
  });
});
