import { readFileSync, createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import * as yauzl from 'yauzl';
import type { GeobedCity, CountryInfo } from './types.js';
import { dataSetFiles } from './types.js';
import { internCountry, internRegion } from './string-interner.js';
import { toUpper } from './utils.js';

export async function loadGeonamesCities(path: string): Promise<GeobedCity[]> {
  const cities: GeobedCity[] = [];

  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err || new Error('Failed to open zip file'));
        return;
      }

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2 || !readStream) {
            reject(err2 || new Error('Failed to open read stream'));
            return;
          }

          const rl = createInterface({ input: readStream, crlfDelay: Infinity });
          rl.on('line', (line) => {
            const fields = line.split('\t');
            if (fields.length !== 19) return;

            const lat = parseFloat(fields[4]);
            const lng = parseFloat(fields[5]);
            if (isNaN(lat) || isNaN(lng)) return;

            const pop = parseInt(fields[14], 10) || 0;
            const cityName = fields[1].trim();

            if (cityName.length > 0) {
              cities.push({
                city: cityName,
                cityAlt: fields[3],
                countryIdx: internCountry(fields[8]),
                regionIdx: internRegion(fields[10]),
                latitude: lat,
                longitude: lng,
                population: pop,
              });
            }
          });

          rl.on('close', () => {
            zipfile.readEntry();
          });
        });
      });

      zipfile.on('end', () => resolve(cities));
      zipfile.on('error', reject);
    });
  });
}

export async function loadMaxMindCities(path: string): Promise<GeobedCity[]> {
  const cities: GeobedCity[] = [];
  const dedupeIdx: Map<string, string[]> = new Map();
  const locationDedupeIdx: Set<string> = new Set();

  if (!existsSync(path)) return cities;

  return new Promise((resolve, reject) => {
    const fileStream = createReadStream(path);
    const gunzip = createGunzip();
    const rl = createInterface({ input: fileStream.pipe(gunzip), crlfDelay: Infinity });

    rl.on('line', (line) => {
      const fields = line.split(',');
      if (fields.length === 7) {
        const key = fields[0] + fields[3] + fields[1];
        dedupeIdx.set(key, fields);
      }
    });

    rl.on('close', () => {
      for (const fields of dedupeIdx.values()) {
        if (fields[0] === '' || fields[0] === '0' || fields[2] === 'AccentCity') continue;

        const pop = parseInt(fields[4], 10) || 0;
        const lat = parseFloat(fields[5]);
        const lng = parseFloat(fields[6]);
        if (isNaN(lat) || isNaN(lng)) continue;

        let cn = fields[2].trim();
        cn = cn.replace(/^\(?\s*|\s*\)?$/g, '');
        if (cn.includes('!') || cn.includes('@')) continue;

        const dedupeKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (locationDedupeIdx.has(dedupeKey)) continue;
        locationDedupeIdx.add(dedupeKey);

        const countryIdx = internCountry(toUpper(fields[0]));
        if (cn.length > 0 && countryIdx !== 0) {
          cities.push({
            city: cn,
            cityAlt: '',
            countryIdx,
            regionIdx: internRegion(fields[3]),
            latitude: lat,
            longitude: lng,
            population: pop,
          });
        }
      }
      resolve(cities);
    });

    rl.on('error', reject);
  });
}

export function loadGeonamesCountryInfo(path: string): CountryInfo[] {
  const countries: CountryInfo[] = [];
  const content = readFileSync(path, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line || line[0] === '#') continue;

    const fields = line.split('\t');
    if (fields.length !== 19 || fields[0] === '' || fields[0] === '0') continue;

    countries.push({
      iso: fields[0],
      iso3: fields[1],
      isoNumeric: parseInt(fields[2], 10) || 0,
      fips: fields[3],
      country: fields[4],
      capital: fields[5],
      area: parseInt(fields[6], 10) || 0,
      population: parseInt(fields[7], 10) || 0,
      continent: fields[8],
      tld: fields[9],
      currencyCode: fields[10],
      currencyName: fields[11],
      phone: fields[12],
      postalCodeFormat: fields[13],
      postalCodeRegex: fields[14],
      languages: fields[15],
      geonameId: parseInt(fields[16], 10) || 0,
      neighbours: fields[17],
      equivalentFipsCode: fields[18],
    });
  }

  return countries;
}

export async function downloadFile(url: string, path: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP GET ${url}: status ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, buffer);
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadDataSets(dataDir: string): Promise<void> {
  mkdirSync(dataDir, { recursive: true });

  for (const f of dataSetFiles) {
    const localPath = join(dataDir, basename(f.path));
    if (existsSync(localPath)) continue;
    await downloadFile(f.url, localPath);
  }
}
