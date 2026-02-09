import { join, basename } from 'node:path';
import type {
  GeobedCity, CountryInfo, GeocodeOptions, GeobedConfig,
  Option,
} from './types.js';
import {
  defaultConfig, US_STATE_CODES, S2_CELL_LEVEL,
  MAX_GEOCODE_INPUT_LEN, MIN_CITY_COUNT, MIN_COUNTRY_COUNT,
  dataSetFiles,
} from './types.js';
import { initLookupTables, getCountryInterner, getRegionInterner, internCountry, internRegion } from './string-interner.js';
import { toLower, toUpper, compareCaseInsensitive } from './utils.js';
import { fuzzyMatch } from './fuzzy.js';
import {
  latLngFromDegrees, angularDistance,
  cellIDFromLatLng, cellIDParentAtLevel, cellIDEdgeNeighbors,
  type CellID,
} from './s2-geometry.js';
import { isAdminDivision, getAdminDivisionCountry } from './admin-divisions.js';
import { loadGeonamesCities, loadMaxMindCities, loadGeonamesCountryInfo, downloadDataSets } from './data-loader.js';
import { loadCachedCityData, loadCachedCountryData, loadCachedNameIndex, storeCache } from './cache.js';

const ABBREV_REGEX = /[\S]{2,3}/;

export class GeoBed {
  cities: GeobedCity[] = [];
  countries: CountryInfo[] = [];
  nameIndex: Map<string, number[]> = new Map();
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
        const idx = loadCachedNameIndex(cfg.cacheDir);
        if (idx) g.nameIndex = idx;
        loaded = true;
      }
    } catch {
      // Cache load failed, fall through to raw data
    }

    if (!loaded || g.cities.length === 0) {
      await downloadDataSets(cfg.dataDir);
      await g.loadDataSets();
      try {
        storeCache(cfg.cacheDir, g.cities, g.countries, g.nameIndex);
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

    // Build inverted name index
    this.nameIndex = new Map();
    for (let i = 0; i < this.cities.length; i++) {
      const city = this.cities[i];
      if (city.city.length > 0) {
        const key = city.city.toLowerCase();
        const existing = this.nameIndex.get(key);
        if (existing) {
          existing.push(i);
        } else {
          this.nameIndex.set(key, [i]);
        }
      }
      if (city.cityAlt.length > 0) {
        const alts = city.cityAlt.split(',');
        for (const alt of alts) {
          const trimmed = alt.trim();
          if (trimmed.length === 0) continue;
          const key = trimmed.toLowerCase();
          const existing = this.nameIndex.get(key);
          if (existing) {
            existing.push(i);
          } else {
            this.nameIndex.set(key, [i]);
          }
        }
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
    n = n.replace(/\s+/g, ' ').trim();
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

    // Collect candidate indices from the inverted index
    const candidateSet = new Set<number>();
    const lookups = [n.toLowerCase(), nWithoutAbbrev.toLowerCase()];
    for (const ns of nSlice) {
      const trimmed = ns.replace(/,$/g, '');
      if (trimmed.length > 0) lookups.push(trimmed.toLowerCase());
    }
    for (const key of lookups) {
      const indices = this.nameIndex.get(key);
      if (indices) {
        for (const idx of indices) candidateSet.add(idx);
      }
    }

    const matchingCities: GeobedCity[] = [];

    for (const i of candidateSet) {
      const v = this.cities[i];
      if (n.toLowerCase() === v.city.toLowerCase()) {
        matchingCities.push(v);
      } else if (nWithoutAbbrev.toLowerCase() === v.city.toLowerCase()) {
        matchingCities.push(v);
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
    const empty: GeobedCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
    const { countryISO: nCo, stateCode: nSt, abbrevSlice, nameSlice: nSlice } = this.extractLocationPieces(n);

    // Collect candidate indices from the inverted index
    const candidateSet = new Set<number>();
    const nLower = n.toLowerCase();
    const fullIndices = this.nameIndex.get(nLower);
    if (fullIndices) {
      for (const idx of fullIndices) candidateSet.add(idx);
    }
    // Look up the joined name slice (handles multi-word names like "New York")
    const joinedSlice = nSlice.join(' ').toLowerCase();
    if (joinedSlice !== nLower) {
      const joinedIndices = this.nameIndex.get(joinedSlice);
      if (joinedIndices) {
        for (const idx of joinedIndices) candidateSet.add(idx);
      }
    }
    for (const ns of nSlice) {
      const trimmed = ns.replace(/,$/g, '').toLowerCase();
      if (trimmed.length === 0) continue;
      const indices = this.nameIndex.get(trimmed);
      if (indices) {
        for (const idx of indices) candidateSet.add(idx);
      }
    }

    // When fuzzy matching is enabled, scan index keys for fuzzy matches
    if (opts.fuzzyDistance && opts.fuzzyDistance > 0) {
      const queryTerms = nSlice.map(ns => ns.replace(/,$/g, '')).filter(t => t.length > 2);
      if (queryTerms.length > 0) {
        for (const [name, indices] of this.nameIndex) {
          for (const term of queryTerms) {
            if (fuzzyMatch(term, name, opts.fuzzyDistance)) {
              for (const idx of indices) candidateSet.add(idx);
              break;
            }
          }
        }
      }
    }

    if (candidateSet.size === 0) return empty;

    const bestMatchingKeys: Map<number, number> = new Map();

    for (const i of candidateSet) {
      const v = this.cities[i];
      const vCountry = GeoBed.cityCountry(v);
      const vRegion = GeoBed.cityRegion(v);

      // Fast path for simple "City, ST" format
      if (nSt !== '') {
        if (nLower === v.city.toLowerCase() && nSt.toLowerCase() === vRegion.toLowerCase()) {
          return v;
        }
      }

      let score = 0;

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
        const alts = v.cityAlt.split(',');
        for (const rawAlt of alts) {
          const altV = rawAlt.trim();
          if (altV.length === 0) continue;
          if (altV.toLowerCase() === nLower) {
            score += 3;
          }
          if (altV === n) {
            score += 5;
          }
        }
      }

      // Exact match gets highest bonus
      if (nLower === v.city.toLowerCase()) {
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

    if (bestMatchingKeys.size === 0) return empty;

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
    let bestMatchingKey = -1;
    for (const [k, v] of bestMatchingKeys) {
      if (v > m) {
        m = v;
        bestMatchingKey = k;
      }
      if (v === m && bestMatchingKey >= 0 && this.cities[k].population > this.cities[bestMatchingKey].population) {
        bestMatchingKey = k;
      }
    }

    if (bestMatchingKey >= 0 && bestMatchingKey < this.cities.length) {
      return this.cities[bestMatchingKey];
    }
    return empty;
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
