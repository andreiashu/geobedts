import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encode, decode } from '@msgpack/msgpack';
import seekBzip from 'seek-bzip';
import type { GeobedCity, GeobedCityGob, CountryInfo } from './types.js';
import { internCountry, internRegion, getCountryInterner, getRegionInterner } from './string-interner.js';

function tryReadFile(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function readOptionallyBzipped(basePath: string): Buffer | null {
  // Try .bz2 first
  const bz2Data = tryReadFile(basePath + '.bz2');
  if (bz2Data) {
    return Buffer.from(seekBzip.decode(bz2Data));
  }
  // Try uncompressed
  return tryReadFile(basePath);
}

export function loadCachedCityData(cacheDir: string): GeobedCity[] | null {
  const data = readOptionallyBzipped(join(cacheDir, 'cities.msgpack'));
  if (!data) return null;

  const gobCities = decode(data) as GeobedCityGob[];
  return gobCities.map(gc => ({
    city: gc.city,
    cityAlt: gc.cityAlt,
    countryIdx: internCountry(gc.country),
    regionIdx: internRegion(gc.region),
    latitude: gc.latitude,
    longitude: gc.longitude,
    population: gc.population,
  }));
}

export function loadCachedCountryData(cacheDir: string): CountryInfo[] | null {
  const data = readOptionallyBzipped(join(cacheDir, 'countries.msgpack'));
  if (!data) return null;

  return decode(data) as CountryInfo[];
}

export function loadCachedNameIndex(cacheDir: string): Map<string, number[]> | null {
  const data = readOptionallyBzipped(join(cacheDir, 'nameIndex.msgpack'));
  if (!data) return null;

  const obj = decode(data) as Record<string, number[]>;
  return new Map(Object.entries(obj));
}

export function storeCache(
  cacheDir: string,
  cities: GeobedCity[],
  countries: CountryInfo[],
  nameIndex: Map<string, number[]>,
): void {
  mkdirSync(cacheDir, { recursive: true });

  const countryInterner = getCountryInterner();
  const regionInterner = getRegionInterner();

  // Convert to serializable format
  const gobCities: GeobedCityGob[] = cities.map(c => ({
    city: c.city,
    cityAlt: c.cityAlt,
    country: countryInterner.get(c.countryIdx),
    region: regionInterner.get(c.regionIdx),
    latitude: c.latitude,
    longitude: c.longitude,
    population: c.population,
  }));

  writeFileSync(join(cacheDir, 'cities.msgpack'), Buffer.from(encode(gobCities)));
  writeFileSync(join(cacheDir, 'countries.msgpack'), Buffer.from(encode(countries)));
  writeFileSync(join(cacheDir, 'nameIndex.msgpack'), Buffer.from(encode(Object.fromEntries(nameIndex))));
}
