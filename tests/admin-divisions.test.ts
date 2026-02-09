import { describe, it, expect, beforeAll } from 'vitest';
import { GeoBed, loadAdminDivisionsForDir } from '../src/index.js';
import { isAdminDivision, getAdminDivisionCountry, getAdminDivisionName } from '../src/admin-divisions.js';

describe('Admin Divisions', () => {
  let g: GeoBed;
  beforeAll(async () => { g = await GeoBed.create(); });

  it('loads admin divisions', () => {
    const adminDivisions = loadAdminDivisionsForDir('./geobed-data');
    expect(adminDivisions.size).toBeGreaterThan(0);

    // US/TX
    expect(adminDivisions.get('US')?.has('TX')).toBe(true);
    // CA/08 (Ontario)
    expect(adminDivisions.get('CA')?.has('08')).toBe(true);
    // AU/02 (NSW)
    expect(adminDivisions.get('AU')?.has('02')).toBe(true);
    // DE/16 (Berlin)
    expect(adminDivisions.get('DE')?.has('16')).toBe(true);
    // GB/ENG
    expect(adminDivisions.get('GB')?.has('ENG')).toBe(true);
  });

  it.each([
    { country: 'US', division: 'TX', want: true },
    { country: 'US', division: 'CA', want: true },
    { country: 'US', division: 'NY', want: true },
    { country: 'US', division: 'ZZ', want: false },
    { country: 'CA', division: '08', want: true },
    { country: 'AU', division: '02', want: true },
    { country: 'DE', division: '16', want: true },
    { country: 'GB', division: 'ENG', want: true },
    { country: 'XX', division: 'TX', want: false },
  ])('isAdminDivision($country, $division) = $want', ({ country, division, want }) => {
    expect(isAdminDivision(g.getConfig().dataDir, country, division)).toBe(want);
  });

  it.each([
    { code: 'TX', wantCountry: 'US' },
    { code: 'NY', wantCountry: 'US' },
    { code: 'ENG', wantCountry: 'GB' },
  ])('getAdminDivisionCountry($code) = $wantCountry', ({ code, wantCountry }) => {
    expect(getAdminDivisionCountry(g.getConfig().dataDir, code)).toBe(wantCountry);
  });

  it.each([
    { country: 'US', division: 'TX', wantName: 'Texas' },
    { country: 'US', division: 'CA', wantName: 'California' },
    { country: 'GB', division: 'ENG', wantName: 'England' },
    { country: 'US', division: 'ZZ', wantName: '' },
  ])('getAdminDivisionName($country, $division) = $wantName', ({ country, division, wantName }) => {
    expect(getAdminDivisionName(g.getConfig().dataDir, country, division)).toBe(wantName);
  });

  it('international admin divisions geocoding', () => {
    const tests = [
      { query: 'Austin, TX', wantCountry: 'US', wantCity: 'Austin' },
      { query: 'Dallas, TX', wantCountry: 'US', wantCity: 'Dallas' },
      { query: 'New York, NY', wantCountry: 'US', wantCity: 'New York City' },
    ];
    for (const tc of tests) {
      const result = g.geocode(tc.query);
      expect(GeoBed.cityCountry(result)).toBe(tc.wantCountry);
      expect(result.city).toBe(tc.wantCity);
    }
  });

  it('ambiguous admin division codes', () => {
    const ambiguousCodes = ['01', '02', '03', '08'];
    for (const code of ambiguousCodes) {
      const result = getAdminDivisionCountry(g.getConfig().dataDir, code);
      if (result !== '') {
        // Count countries with this code
        const adminDivisions = loadAdminDivisionsForDir(g.getConfig().dataDir);
        let count = 0;
        for (const [, divs] of adminDivisions) {
          if (divs.has(code)) count++;
        }
        expect(count).toBeLessThanOrEqual(1);
      }
    }
  });
});
