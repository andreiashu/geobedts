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
    it('numeric string', () => { g.geocode('12345'); }); // just no crash
    it('long number', () => { g.geocode('1234567890'); });
    it('special characters', () => { g.geocode('!@#$%^&*()'); });
    it('very long string', () => { g.geocode('a'.repeat(1000)); });
    it('string with newlines', () => { g.geocode('New\nYork'); });
    it('single character', () => { g.geocode('A'); });
    it('two characters', () => { g.geocode('NY'); });
  });

  describe('TestGeocodeUnicodeInternational', () => {
    const tests = [
      { name: 'Munich', input: 'Munich', wantCountry: 'DE' },
      { name: 'Sao Paulo', input: 'Sao Paulo', wantCountry: 'BR' },
      { name: 'Beijing', input: 'Beijing', wantCountry: 'CN' },
      { name: 'Moscow', input: 'Moscow', wantCountry: 'RU' },
      { name: 'Vienna', input: 'Vienna', wantCountry: 'AT' },
      { name: 'Prague', input: 'Prague', wantCountry: 'CZ' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        expect(result.city).not.toBe('');
        if (tt.wantCountry) {
          expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        }
      });
    }
  });

  describe('TestGeocodeJapaneseChineseNames', () => {
    const tests = [
      { name: 'Tokyo', input: 'Tokyo', wantCountry: 'JP' },
      { name: 'Osaka', input: 'Osaka', wantCountry: 'JP' },
      { name: 'Shanghai', input: 'Shanghai', wantCountry: 'CN' },
      { name: 'Seoul', input: 'Seoul', wantCountry: 'KR' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        expect(result.city).not.toBe('');
        expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
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
        if (tt.wantCountry) expect(GeoBed.cityCountry(result)).toBe(tt.wantCountry);
        if (tt.wantRegion) expect(GeoBed.cityRegion(result)).toBe(tt.wantRegion);
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
    const tests = [
      { name: 'origin (0,0)', lat: 0.0, lng: 0.0 },
      { name: 'north pole', lat: 90.0, lng: 0.0 },
      { name: 'south pole', lat: -90.0, lng: 0.0 },
      { name: 'date line positive', lat: 0.0, lng: 180.0 },
      { name: 'date line negative', lat: 0.0, lng: -180.0 },
      { name: 'middle of Pacific', lat: 0.0, lng: -160.0 },
      { name: 'middle of Atlantic', lat: 30.0, lng: -40.0 },
      { name: 'extreme coordinates', lat: -90.0, lng: 180.0 },
      { name: 'very precise - Austin TX', lat: 30.267153, lng: -97.743057 },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.reverseGeocode(tt.lat, tt.lng);
        void result.city;
        void GeoBed.cityCountry(result);
        void GeoBed.cityRegion(result);
      });
    }
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
    const tests = [
      { name: 'leading spaces', input: '  Austin' },
      { name: 'trailing spaces', input: 'Austin  ' },
      { name: 'multiple spaces', input: 'New  York' },
      { name: 'tabs between words', input: 'New\tYork' },
      { name: 'mixed whitespace', input: ' Austin , TX ' },
      { name: 'multiple commas', input: 'Austin,,,TX' },
      { name: 'semicolon separator', input: 'Austin;TX' },
      { name: 'hyphenated city', input: 'Winston-Salem' },
      { name: 'city with apostrophe', input: "O'Fallon" },
      { name: 'city with period', input: 'St. Louis' },
    ];

    for (const tt of tests) {
      it(tt.name, () => {
        const result = g.geocode(tt.input);
        void result.city; // just verify no crash
      });
    }
  });
});
