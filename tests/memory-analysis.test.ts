import { describe, it, expect } from 'vitest';
import { GeoBed, countryCount, regionCount } from '../src/index.js';

describe('Memory Analysis', () => {
  it('reports memory footprint', async () => {
    const g = await GeoBed.create();
    const heapUsed = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Cities loaded: ${g.cities.length}`);
    console.log(`Heap in use: ${heapUsed.toFixed(1)} MB`);
    console.log(`Countries indexed: ${countryCount()}`);
    console.log(`Regions indexed: ${regionCount()}`);
    expect(g.cities.length).toBeGreaterThan(0);
  });
});
