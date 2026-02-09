import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type {
  GeobedCity, CountryInfo, GeocodeOptions, GeobedConfig,
  Option, SearchRange,
} from './types.js';
import {
  defaultConfig, US_STATE_CODES, S2_CELL_LEVEL,
  MAX_GEOCODE_INPUT_LEN, MIN_CITY_COUNT, MIN_COUNTRY_COUNT,
  dataSetFiles,
} from './types.js';
import { initLookupTables, getCountryInterner, getRegionInterner, internCountry, internRegion } from './string-interner.js';
import { toLower, toUpper, prev, compareCaseInsensitive } from './utils.js';
import { fuzzyMatch } from './fuzzy.js';
import {
  latLngFromDegrees, angularDistance,
  cellIDFromLatLng, cellIDParentAtLevel, cellIDEdgeNeighbors,
  type CellID,
} from './s2-geometry.js';
import { isAdminDivision, getAdminDivisionCountry } from './admin-divisions.js';
import { loadGeonamesCities, loadMaxMindCities, loadGeonamesCountryInfo, downloadDataSets } from './data-loader.js';
import { loadCachedCityData, loadCachedCountryData, loadCachedCityNameIdx, storeCache } from './cache.js';

const ABBREV_REGEX = /[\S]{2,3}/;

export class GeoBed {
  cities: GeobedCity[] = [];
  countries: CountryInfo[] = [];
  cityNameIdx: Map<string, number> = new Map();
  private cellIndex: Map<bigint, number[]> = new Map();
  private config: GeobedConfig;

  private constructor(config: GeobedConfig) {
    this.config = config;
  }

  static async create(...opts: Option[]): Promise<GeoBed> {
    const cfg = defaultConfig();
    for (const opt of opts) opt(cfg);

    const g = new GeoBed(cfg);
    initLookupTables();

    // Try loading from cache
    let loaded = false;
    try {
      const cities = loadCachedCityData(cfg.cacheDir);
      if (cities && cities.length > 0) {
        g.cities = cities;
        const countries = loadCachedCountryData(cfg.cacheDir);
        if (countries) g.countries = countries;
        const idx = loadCachedCityNameIdx(cfg.cacheDir);
        if (idx) g.cityNameIdx = idx;
        loaded = true;
      }
    } catch {
      // Cache load failed, fall through to raw data
    }

    if (!loaded || g.cities.length === 0) {
      await downloadDataSets(cfg.dataDir);
      await g.loadDataSets();
      try {
        storeCache(cfg.cacheDir, g.cities, g.countries, g.cityNameIdx);
      } catch (e) {
        console.warn('warning: failed to store cache:', e);
      }
    }

    g.buildCellIndex();
    return g;
  }

  private async loadDataSets(): Promise<void> {
    for (const f of dataSetFiles) {
      const localPath = join(this.config.dataDir, basename(f.path));
      switch (f.id) {
        case 'geonamesCities1000': {
          const cities = await loadGeonamesCities(localPath);
          this.cities.push(...cities);
          break;
        }
        case 'maxmindWorldCities': {
          try {
            const cities = await loadMaxMindCities(localPath);
            this.cities.push(...cities);
          } catch {
            // MaxMind is optional
          }
          break;
        }
        case 'geonamesCountryInfo': {
          this.countries = loadGeonamesCountryInfo(localPath);
          break;
        }
      }
    }

    // Sort cities alphabetically (case-insensitive)
    this.cities.sort((a, b) => compareCaseInsensitive(a.city, b.city));

    // Build city name index
    this.cityNameIdx = new Map();
    for (let k = 0; k < this.cities.length; k++) {
      const v = this.cities[k];
      if (v.city.length === 0) continue;
      const runes = [...v.city];
      if (runes.length === 0) continue;
      const ik = toLower(runes[0]);
      const existing = this.cityNameIdx.get(ik);
      if (existing === undefined || existing < k) {
        this.cityNameIdx.set(ik, k);
      }
    }
  }

  private buildCellIndex(): void {
    this.cellIndex = new Map();
    for (let i = 0; i < this.cities.length; i++) {
      const city = this.cities[i];
      const ll = latLngFromDegrees(city.latitude, city.longitude);
      const leafCell = cellIDFromLatLng(ll);
      const cell = cellIDParentAtLevel(leafCell, S2_CELL_LEVEL);
      const existing = this.cellIndex.get(cell);
      if (existing) {
        existing.push(i);
      } else {
        this.cellIndex.set(cell, [i]);
      }
    }
  }

  private cellAndNeighbors(cell: CellID): CellID[] {
    const cells: CellID[] = [cell];

    const edgeNeighbors = cellIDEdgeNeighbors(cell);
    for (let i = 0; i < 4; i++) {
      cells.push(edgeNeighbors[i]);
    }

    const seen = new Set<bigint>();
    for (const c of cells) seen.add(c);

    for (let i = 0; i < 4; i++) {
      const cornerNeighbors = cellIDEdgeNeighbors(edgeNeighbors[i]);
      for (const corner of cornerNeighbors) {
        if (!seen.has(corner)) {
          cells.push(corner);
          seen.add(corner);
        }
      }
    }

    return cells;
  }

  // --- Public geocoding API ---

  geocode(n: string, opts?: GeocodeOptions): GeobedCity {
    const empty: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
    n = n.trim();
    if (n === '') return empty;

    // Truncate long inputs
    const runes = [...n];
    if (runes.length > MAX_GEOCODE_INPUT_LEN) {
      n = runes.slice(0, MAX_GEOCODE_INPUT_LEN).join('');
    }

    const options: GeocodeOptions = opts || {};

    if (options.exactCity) {
      return this.exactMatchCity(n);
    }
    return this.fuzzyMatchLocation(n, options);
  }

  reverseGeocode(lat: number, lng: number): GeobedCity {
    const queryLL = latLngFromDegrees(lat, lng);
    const leafCell = cellIDFromLatLng(queryLL);
    const queryCell = cellIDParentAtLevel(leafCell, S2_CELL_LEVEL);

    let closest: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
    let minDist = Infinity;

    for (const cell of this.cellAndNeighbors(queryCell)) {
      const indices = this.cellIndex.get(cell);
      if (!indices) continue;

      for (const idx of indices) {
        const city = this.cities[idx];
        const cityLL = latLngFromDegrees(city.latitude, city.longitude);
        const dist = angularDistance(queryLL, cityLL);

        if (dist < minDist) {
          minDist = dist;
          closest = city;
        } else if (dist === minDist && city.population > closest.population) {
          closest = city;
        }
      }
    }

    return closest;
  }

  // --- City accessor helpers ---

  static cityCountry(city: GeobedCity): string {
    return getCountryInterner().get(city.countryIdx);
  }

  static cityRegion(city: GeobedCity): string {
    return getRegionInterner().get(city.regionIdx);
  }

  // --- Private geocoding internals ---

  private exactMatchCity(n: string): GeobedCity {
    let result: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
    const { countryISO: nCo, stateCode: nSt, nameSlice: nSlice } = this.extractLocationPieces(n);
    const nWithoutAbbrev = nSlice.join(' ');
    const ranges = this.getSearchRange(nSlice);

    const matchingCities: GeobedCity[] = [];

    for (const rng of ranges) {
      for (let i = rng.from; i < rng.to; i++) {
        const v = this.cities[i];
        if (n.toLowerCase() === v.city.toLowerCase()) {
          matchingCities.push(v);
        }
        if (nWithoutAbbrev.toLowerCase() === v.city.toLowerCase()) {
          matchingCities.push(v);
        }
      }
    }

    if (matchingCities.length === 1) {
      return matchingCities[0];
    } else if (matchingCities.length > 1) {
      // Find best match by region, using population as tie-breaker
      for (const city of matchingCities) {
        if (nSt.toLowerCase() === GeoBed.cityRegion(city).toLowerCase()) {
          if (result.city === '' || city.population > result.population) {
            result = city;
          }
        }
      }

      // Prefer matches with both region AND country
      let bestRegionAndCountry: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
      for (const city of matchingCities) {
        if (nSt.toLowerCase() === GeoBed.cityRegion(city).toLowerCase() &&
            nCo.toLowerCase() === GeoBed.cityCountry(city).toLowerCase()) {
          if (bestRegionAndCountry.city === '' || city.population > bestRegionAndCountry.population) {
            bestRegionAndCountry = city;
          }
        }
      }
      if (bestRegionAndCountry.city !== '') {
        result = bestRegionAndCountry;
      }

      // If no region/country match, use country match with highest population
      if (result.city === '') {
        const matchingCountryCities: GeobedCity[] = [];
        for (const city of matchingCities) {
          if (nCo.toLowerCase() === GeoBed.cityCountry(city).toLowerCase()) {
            matchingCountryCities.push(city);
          }
        }

        let biggestCity: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        for (const city of matchingCountryCities) {
          if (city.population > biggestCity.population) {
            biggestCity = city;
          }
        }
        result = biggestCity;
      }
    }

    return result;
  }

  private fuzzyMatchLocation(n: string, opts: GeocodeOptions): GeobedCity {
    const { countryISO: nCo, stateCode: nSt, abbrevSlice, nameSlice: nSlice } = this.extractLocationPieces(n);
    const ranges = this.getSearchRange(nSlice);

    const bestMatchingKeys: Map<number, number> = new Map();
    let bestMatchingKey = 0;

    for (const rng of ranges) {
      for (let i = rng.from; i < rng.to; i++) {
        const v = this.cities[i];
        const vCountry = GeoBed.cityCountry(v);
        const vRegion = GeoBed.cityRegion(v);

        // Fast path for simple "City, ST" format
        if (nSt !== '') {
          if (n.toLowerCase() === v.city.toLowerCase() && nSt.toLowerCase() === vRegion.toLowerCase()) {
            return v;
          }
        }

        let score = bestMatchingKeys.get(i) || 0;

        for (const av of abbrevSlice) {
          const lowerAv = toLower(av);
          if (av.length === 2 && vRegion.toLowerCase() === lowerAv) {
            score += 5;
          }
          if (av.length === 2 && vCountry.toLowerCase() === lowerAv) {
            score += 3;
          }
        }

        if (nCo !== '' && nCo === vCountry) {
          score += 4;
        }

        if (nSt !== '' && nSt === vRegion) {
          score += 4;
        }

        if (v.cityAlt !== '') {
          const alts = v.cityAlt.split(/\s+/);
          for (const altV of alts) {
            if (altV.toLowerCase() === n.toLowerCase()) {
              score += 3;
            }
            if (altV === n) {
              score += 5;
            }
          }
        }

        // Exact match gets highest bonus
        if (n.toLowerCase() === v.city.toLowerCase()) {
          score += 7;
        } else if (opts.fuzzyDistance && opts.fuzzyDistance > 0) {
          for (const ns of nSlice) {
            const trimmed = ns.replace(/,$/g, '');
            if (trimmed.length > 2 && fuzzyMatch(trimmed, v.city, opts.fuzzyDistance)) {
              score += 5;
            }
          }
        }

        for (const ns of nSlice) {
          const trimmed = ns.replace(/,$/g, '');
          if (toLower(v.city).includes(toLower(trimmed))) {
            score += 2;
          }
          if (v.city.toLowerCase() === trimmed.toLowerCase()) {
            score += 1;
          }
        }

        if (score > 0) {
          bestMatchingKeys.set(i, score);
        }
      }
    }

    if (nCo === '') {
      let hp = 0;
      let hpk = 0;
      for (const [k, v] of bestMatchingKeys) {
        if (this.cities[k].population >= 1000) {
          bestMatchingKeys.set(k, v + 1);
        }
        if (this.cities[k].population > hp) {
          hpk = k;
          hp = this.cities[k].population;
        }
      }
      if (this.cities[hpk] && this.cities[hpk].population > 0) {
        bestMatchingKeys.set(hpk, (bestMatchingKeys.get(hpk) || 0) + 1);
      }
    }

    let m = 0;
    for (const [k, v] of bestMatchingKeys) {
      if (v > m) {
        m = v;
        bestMatchingKey = k;
      }
      if (v === m && this.cities[k].population > this.cities[bestMatchingKey].population) {
        bestMatchingKey = k;
      }
    }

    if (bestMatchingKey >= 0 && bestMatchingKey < this.cities.length) {
      return this.cities[bestMatchingKey];
    }
    return { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
  }

  private extractLocationPieces(n: string): {
    countryISO: string;
    stateCode: string;
    abbrevSlice: string[];
    nameSlice: string[];
  } {
    const abbrevMatch = ABBREV_REGEX.exec(n);
    const abbrevSlice = abbrevMatch ? [abbrevMatch[0]] : [];

    let countryISO = '';

    // Check for country names
    for (const co of this.countries) {
      const countryName = co.country;
      const countryNameLower = toLower(countryName);
      const nLower = toLower(n);

      // Exact match: "France"
      if (nLower === countryNameLower) {
        countryISO = co.iso;
        n = '';
        break;
      }

      // Prefix: "France, Paris"
      const prefixWithComma = countryNameLower + ', ';
      if (nLower.length > prefixWithComma.length && nLower.substring(0, prefixWithComma.length) === prefixWithComma) {
        countryISO = co.iso;
        n = n.substring(prefixWithComma.length);
        break;
      }
      const prefixWithSpace = countryNameLower + ' ';
      if (nLower.length > prefixWithSpace.length && nLower.substring(0, prefixWithSpace.length) === prefixWithSpace) {
        countryISO = co.iso;
        n = n.substring(prefixWithSpace.length);
        break;
      }

      // Suffix: "Paris, France"
      const suffixWithComma = ', ' + countryNameLower;
      if (nLower.length > suffixWithComma.length && nLower.substring(nLower.length - suffixWithComma.length) === suffixWithComma) {
        countryISO = co.iso;
        n = n.substring(0, n.length - suffixWithComma.length);
        break;
      }
      const suffixWithSpace = ' ' + countryNameLower;
      if (nLower.length > suffixWithSpace.length && nLower.substring(nLower.length - suffixWithSpace.length) === suffixWithSpace) {
        countryISO = co.iso;
        n = n.substring(0, n.length - suffixWithSpace.length);
        break;
      }
    }

    let stateCode = '';

    // Check US state codes
    for (const sc of Object.keys(US_STATE_CODES)) {
      const scLower = toLower(sc);
      const nLower = toLower(n);

      if (nLower === scLower) {
        stateCode = sc;
        n = '';
        if (countryISO === '') countryISO = 'US';
        break;
      }

      const prefixWithComma = scLower + ', ';
      if (nLower.length > prefixWithComma.length && nLower.substring(0, prefixWithComma.length) === prefixWithComma) {
        stateCode = sc;
        n = n.substring(prefixWithComma.length);
        if (countryISO === '') countryISO = 'US';
        break;
      }
      const prefixWithSpace = scLower + ' ';
      if (nLower.length > prefixWithSpace.length && nLower.substring(0, prefixWithSpace.length) === prefixWithSpace) {
        stateCode = sc;
        n = n.substring(prefixWithSpace.length);
        if (countryISO === '') countryISO = 'US';
        break;
      }

      const suffixWithComma = ', ' + scLower;
      if (nLower.length > suffixWithComma.length && nLower.substring(nLower.length - suffixWithComma.length) === suffixWithComma) {
        stateCode = sc;
        n = n.substring(0, n.length - suffixWithComma.length);
        if (countryISO === '') countryISO = 'US';
        break;
      }
      const suffixWithSpace = ' ' + scLower;
      if (nLower.length > suffixWithSpace.length && nLower.substring(nLower.length - suffixWithSpace.length) === suffixWithSpace) {
        stateCode = sc;
        n = n.substring(0, n.length - suffixWithSpace.length);
        if (countryISO === '') countryISO = 'US';
        break;
      }
    }

    // If no US state matched, check international admin divisions
    if (stateCode === '') {
      const parts = n.split(' ');
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].replace(/^[, ]+|[, ]+$/g, '');
        if (lastPart.length >= 2 && lastPart.length <= 3) {
          const lastPartUpper = toUpper(lastPart);
          if (countryISO !== '' && isAdminDivision(this.config.dataDir, countryISO, lastPartUpper)) {
            stateCode = lastPartUpper;
            n = parts.slice(0, parts.length - 1).join(' ');
          } else if (countryISO === '') {
            const country = getAdminDivisionCountry(this.config.dataDir, lastPartUpper);
            if (country !== '') {
              stateCode = lastPartUpper;
              countryISO = country;
              n = parts.slice(0, parts.length - 1).join(' ');
            }
          }
        }
      }
    }

    n = n.replace(/^[, ]+|[, ]+$/g, '');
    const nameSlice = n.split(' ');

    return { countryISO, stateCode, abbrevSlice, nameSlice };
  }

  private getSearchRange(nSlice: string[]): SearchRange[] {
    const ranges: SearchRange[] = [];
    for (const ns of nSlice) {
      const trimmed = ns.replace(/,$/g, '');
      if (trimmed.length > 0) {
        const runes = [...trimmed];
        const fc = runes[0].toLowerCase();
        const pik = prev(fc);

        let fk = 0;
        if (pik !== '') {
          const val = this.cityNameIdx.get(pik);
          if (val !== undefined) {
            fk = val + 1;
          }
        }

        let tk = this.cities.length;
        const tkVal = this.cityNameIdx.get(fc);
        if (tkVal !== undefined) {
          tk = tkVal + 1;
        }

        if (fk > tk) fk = tk;
        if (tk > this.cities.length) tk = this.cities.length;

        ranges.push({ from: fk, to: tk });
      }
    }
    return ranges;
  }

  // --- Accessor for config ---
  getConfig(): GeobedConfig {
    return this.config;
  }
}

// Singleton
let defaultGeoBed: GeoBed | null = null;
let defaultGeoBedPromise: Promise<GeoBed> | null = null;

export async function getDefaultGeobed(): Promise<GeoBed> {
  if (defaultGeoBed) return defaultGeoBed;
  if (!defaultGeoBedPromise) {
    defaultGeoBedPromise = GeoBed.create().then(g => {
      defaultGeoBed = g;
      return g;
    });
  }
  return defaultGeoBedPromise;
}

// --- Validation ---

interface ValidationCity {
  query: string;
  wantCity: string;
  wantCountry: string;
}

interface ValidationCoord {
  lat: number;
  lng: number;
  wantCity: string;
  wantCountry: string;
}

export const knownCities: ValidationCity[] = [
  { query: 'Austin', wantCity: 'Austin', wantCountry: 'US' },
  { query: 'Paris', wantCity: 'Paris', wantCountry: 'FR' },
  { query: 'Sydney', wantCity: 'Sydney', wantCountry: 'AU' },
  { query: 'Berlin', wantCity: 'Berlin', wantCountry: 'DE' },
  { query: 'New York, NY', wantCity: 'New York City', wantCountry: 'US' },
  { query: 'Tokyo', wantCity: 'Tokyo', wantCountry: 'JP' },
];

export const knownCoords: ValidationCoord[] = [
  { lat: 30.26715, lng: -97.74306, wantCity: 'Austin', wantCountry: 'US' },
  { lat: 37.44651, lng: -122.15322, wantCity: 'Palo Alto', wantCountry: 'US' },
  { lat: 36.9741, lng: -122.0308, wantCity: 'Santa Cruz', wantCountry: 'US' },
  { lat: -33.8688, lng: 151.2093, wantCity: 'Sydney', wantCountry: 'AU' },
];

export async function validateCache(): Promise<void> {
  const g = await GeoBed.create();

  if (g.cities.length < MIN_CITY_COUNT) {
    throw new Error(`city count too low: got ${g.cities.length}, want >= ${MIN_CITY_COUNT}`);
  }

  if (g.countries.length < MIN_COUNTRY_COUNT) {
    throw new Error(`country count too low: got ${g.countries.length}, want >= ${MIN_COUNTRY_COUNT}`);
  }

  for (const tc of knownCities) {
    const result = g.geocode(tc.query);
    if (result.city !== tc.wantCity) {
      throw new Error(`geocode("${tc.query}") = "${result.city}", want "${tc.wantCity}"`);
    }
    if (GeoBed.cityCountry(result) !== tc.wantCountry) {
      throw new Error(`geocode("${tc.query}") country = "${GeoBed.cityCountry(result)}", want "${tc.wantCountry}"`);
    }
  }

  for (const tc of knownCoords) {
    const result = g.reverseGeocode(tc.lat, tc.lng);
    if (result.city !== tc.wantCity) {
      throw new Error(`reverseGeocode(${tc.lat}, ${tc.lng}) = "${result.city}", want "${tc.wantCity}"`);
    }
    if (GeoBed.cityCountry(result) !== tc.wantCountry) {
      throw new Error(`reverseGeocode(${tc.lat}, ${tc.lng}) country = "${GeoBed.cityCountry(result)}", want "${tc.wantCountry}"`);
    }
  }
}
