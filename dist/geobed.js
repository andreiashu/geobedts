import { join, basename } from 'node:path';
import { defaultConfig, US_STATE_CODES, S2_CELL_LEVEL, MAX_GEOCODE_INPUT_LEN, MIN_CITY_COUNT, MIN_COUNTRY_COUNT, dataSetFiles, } from './types.js';
import { initLookupTables, getCountryInterner, getRegionInterner } from './string-interner.js';
import { toLower, toUpper, compareCaseInsensitive, stripDiacritics } from './utils.js';
import { fuzzyMatch } from './fuzzy.js';
import { latLngFromDegrees, angularDistance, cellIDFromLatLng, cellIDParentAtLevel, cellIDEdgeNeighbors, } from './s2-geometry.js';
import { isAdminDivision, getAdminDivisionCountry } from './admin-divisions.js';
import { loadGeonamesCities, loadMaxMindCities, loadGeonamesCountryInfo, downloadDataSets } from './data-loader.js';
import { loadCachedCityData, loadCachedCountryData, loadCachedNameIndex, storeCache } from './cache.js';
import { buildNameIndex } from './name-index.js';
export class GeoBed {
    cities = [];
    countries = [];
    nameIndex = new Map();
    cellIndex = new Map();
    countriesByNameLength = [];
    config;
    constructor(config) {
        this.config = config;
    }
    static async create(...opts) {
        const cfg = defaultConfig();
        for (const opt of opts)
            opt(cfg);
        const g = new GeoBed(cfg);
        initLookupTables();
        // Try loading from cache — only use if all components loaded successfully
        let loaded = false;
        try {
            const cities = loadCachedCityData(cfg.cacheDir);
            if (cities && cities.length > 0) {
                const countries = loadCachedCountryData(cfg.cacheDir);
                const idx = loadCachedNameIndex(cfg.cacheDir);
                if (countries && countries.length > 0 && idx && idx.size > 0) {
                    g.cities = cities;
                    g.countries = countries;
                    g.nameIndex = idx;
                    loaded = true;
                }
            }
        }
        catch {
            // Cache load failed, fall through to raw data
        }
        // Always ensure data files are present (e.g. admin1CodesASCII.txt is
        // read lazily and not included in the cache). downloadDataSets skips
        // files that already exist, so this is cheap after the first run.
        await downloadDataSets(cfg.dataDir);
        if (!loaded || g.cities.length === 0) {
            await g.loadDataSets();
            try {
                storeCache(cfg.cacheDir, g.cities, g.countries, g.nameIndex);
            }
            catch (e) {
                console.warn('warning: failed to store cache:', e);
            }
        }
        g.countriesByNameLength = [...g.countries].sort((a, b) => b.country.length - a.country.length);
        g.buildCellIndex();
        return g;
    }
    async loadDataSets() {
        for (const f of dataSetFiles) {
            const localPath = join(this.config.dataDir, basename(f.path));
            switch (f.id) {
                case 'geonamesCities1000': {
                    const cities = await loadGeonamesCities(localPath);
                    for (const c of cities)
                        this.cities.push(c);
                    break;
                }
                case 'maxmindWorldCities': {
                    try {
                        const cities = await loadMaxMindCities(localPath);
                        for (const c of cities)
                            this.cities.push(c);
                    }
                    catch {
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
        this.nameIndex = buildNameIndex(this.cities);
    }
    buildCellIndex() {
        this.cellIndex = new Map();
        for (let i = 0; i < this.cities.length; i++) {
            const city = this.cities[i];
            const ll = latLngFromDegrees(city.latitude, city.longitude);
            const leafCell = cellIDFromLatLng(ll);
            const cell = cellIDParentAtLevel(leafCell, S2_CELL_LEVEL);
            const existing = this.cellIndex.get(cell);
            if (existing) {
                existing.push(i);
            }
            else {
                this.cellIndex.set(cell, [i]);
            }
        }
    }
    cellAndNeighbors(cell) {
        const cells = [cell];
        const edgeNeighbors = cellIDEdgeNeighbors(cell);
        for (let i = 0; i < 4; i++) {
            cells.push(edgeNeighbors[i]);
        }
        const seen = new Set();
        for (const c of cells)
            seen.add(c);
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
    geocode(n, opts) {
        const empty = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        n = n.replace(/\s+/g, ' ').trim();
        if (n === '')
            return empty;
        // Truncate long inputs
        const runes = [...n];
        if (runes.length > MAX_GEOCODE_INPUT_LEN) {
            n = runes.slice(0, MAX_GEOCODE_INPUT_LEN).join('');
        }
        const options = opts || {};
        if (options.exactCity) {
            return this.exactMatchCity(n);
        }
        return this.fuzzyMatchLocation(n, options);
    }
    reverseGeocode(lat, lng) {
        const empty = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return empty;
        }
        const queryLL = latLngFromDegrees(lat, lng);
        const leafCell = cellIDFromLatLng(queryLL);
        const queryCell = cellIDParentAtLevel(leafCell, S2_CELL_LEVEL);
        // Collect all nearby candidates with their distances
        const candidates = [];
        for (const cell of this.cellAndNeighbors(queryCell)) {
            const indices = this.cellIndex.get(cell);
            if (!indices)
                continue;
            for (const idx of indices) {
                const city = this.cities[idx];
                const cityLL = latLngFromDegrees(city.latitude, city.longitude);
                const dist = angularDistance(queryLL, cityLL);
                candidates.push({ city, dist });
            }
        }
        if (candidates.length === 0) {
            return { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        }
        // Find the closest candidate
        candidates.sort((a, b) => a.dist - b.dist || b.city.population - a.city.population);
        let best = candidates[0];
        // Discard results that are unreasonably far (~100km)
        const MAX_DISTANCE = 0.0157; // ~100km in radians
        if (best.dist > MAX_DISTANCE) {
            return { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        }
        // When the closest match is a small place (likely a neighborhood/district),
        // prefer a nearby major city within ~10km that has 10x+ the population.
        if (best.city.population < 500_000) {
            const NEARBY_THRESHOLD = 0.00157; // ~10km in radians
            for (let i = 1; i < candidates.length; i++) {
                const c = candidates[i];
                if (c.dist > NEARBY_THRESHOLD)
                    break;
                if (c.city.population > best.city.population * 10) {
                    best = c;
                }
            }
        }
        return best.city;
    }
    // --- City accessor helpers ---
    static cityCountry(city) {
        return getCountryInterner().get(city.countryIdx);
    }
    static cityRegion(city) {
        return getRegionInterner().get(city.regionIdx);
    }
    // --- Private geocoding internals ---
    exactMatchCity(n) {
        let result = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        const { countryISO: nCo, stateCode: nSt, nameSlice: nSlice } = this.extractLocationPieces(n);
        const nWithoutAbbrev = nSlice.join(' ');
        // Collect candidate indices from the inverted index
        const candidateSet = new Set();
        const lookups = [n.toLowerCase(), nWithoutAbbrev.toLowerCase()];
        for (const ns of nSlice) {
            const trimmed = ns.replace(/,$/g, '');
            if (trimmed.length > 0)
                lookups.push(trimmed.toLowerCase());
        }
        for (const key of lookups) {
            const indices = this.nameIndex.get(key);
            if (indices) {
                for (const idx of indices)
                    candidateSet.add(idx);
            }
        }
        const matchingCities = [];
        for (const i of candidateSet) {
            const v = this.cities[i];
            if (n.toLowerCase() === v.city.toLowerCase()) {
                matchingCities.push(v);
            }
            else if (nWithoutAbbrev.toLowerCase() === v.city.toLowerCase()) {
                matchingCities.push(v);
            }
        }
        if (matchingCities.length === 1) {
            return matchingCities[0];
        }
        else if (matchingCities.length > 1) {
            // Find best match by region, using population as tie-breaker
            for (const city of matchingCities) {
                if (nSt.toLowerCase() === GeoBed.cityRegion(city).toLowerCase()) {
                    if (result.city === '' || city.population > result.population) {
                        result = city;
                    }
                }
            }
            // Prefer matches with both region AND country
            let bestRegionAndCountry = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
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
                const matchingCountryCities = [];
                for (const city of matchingCities) {
                    if (nCo.toLowerCase() === GeoBed.cityCountry(city).toLowerCase()) {
                        matchingCountryCities.push(city);
                    }
                }
                let biggestCity = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
                for (const city of matchingCountryCities) {
                    if (city.population > biggestCity.population) {
                        biggestCity = city;
                    }
                }
                result = biggestCity;
            }
            // If still no match (no qualifier given), fall back to highest-population match
            if (result.city === '') {
                for (const city of matchingCities) {
                    if (city.population > result.population)
                        result = city;
                }
            }
        }
        return result;
    }
    fuzzyMatchLocation(n, opts) {
        const empty = { city: '', cityAlt: '', countryIdx: 0, regionIdx: 0, latitude: 0, longitude: 0, population: 0 };
        const { countryISO: nCo, stateCode: nSt, abbrevSlice, nameSlice: nSlice } = this.extractLocationPieces(n);
        // Collect candidate indices from the inverted index
        const candidateSet = new Set();
        const nLower = n.toLowerCase();
        const fullIndices = this.nameIndex.get(nLower);
        if (fullIndices) {
            for (const idx of fullIndices)
                candidateSet.add(idx);
        }
        // Look up the joined name slice (handles multi-word names like "New York")
        const joinedSlice = nSlice.join(' ').toLowerCase();
        if (joinedSlice !== nLower) {
            const joinedIndices = this.nameIndex.get(joinedSlice);
            if (joinedIndices) {
                for (const idx of joinedIndices)
                    candidateSet.add(idx);
            }
        }
        for (const ns of nSlice) {
            const trimmed = ns.replace(/,$/g, '').toLowerCase();
            if (trimmed.length === 0)
                continue;
            const indices = this.nameIndex.get(trimmed);
            if (indices) {
                for (const idx of indices)
                    candidateSet.add(idx);
            }
        }
        // When fuzzy matching is enabled, scan index keys for fuzzy matches
        if (opts.fuzzyDistance && opts.fuzzyDistance > 0) {
            const queryTerms = nSlice.map(ns => ns.replace(/,$/g, '')).filter(t => t.length > 2);
            if (queryTerms.length > 0) {
                for (const [name, indices] of this.nameIndex) {
                    for (const term of queryTerms) {
                        if (fuzzyMatch(term, name, opts.fuzzyDistance)) {
                            for (const idx of indices)
                                candidateSet.add(idx);
                            break;
                        }
                    }
                }
            }
        }
        if (candidateSet.size === 0)
            return empty;
        const bestMatchingKeys = new Map();
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
                let hasExactAlt = false;
                let hasCaseInsensitiveAlt = false;
                for (const rawAlt of alts) {
                    const altV = rawAlt.trim();
                    if (altV.length === 0)
                        continue;
                    if (!hasCaseInsensitiveAlt && altV.toLowerCase() === nLower)
                        hasCaseInsensitiveAlt = true;
                    if (!hasExactAlt && altV === n)
                        hasExactAlt = true;
                    if (hasExactAlt && hasCaseInsensitiveAlt)
                        break;
                }
                if (hasCaseInsensitiveAlt)
                    score += 3;
                if (hasExactAlt)
                    score += 5;
            }
            // Exact match gets highest bonus (normalize diacritics for comparison)
            if (nLower === v.city.toLowerCase() || nLower === stripDiacritics(v.city.toLowerCase())) {
                score += 7;
            }
            else if (opts.fuzzyDistance && opts.fuzzyDistance > 0) {
                for (const ns of nSlice) {
                    const trimmed = ns.replace(/,$/g, '');
                    if (trimmed.length > 2 && fuzzyMatch(trimmed, v.city, opts.fuzzyDistance)) {
                        score += 5;
                    }
                }
            }
            for (const ns of nSlice) {
                const trimmed = ns.replace(/,$/g, '');
                const cityLower = toLower(v.city);
                const trimmedLower = toLower(trimmed);
                if (cityLower.includes(trimmedLower) || stripDiacritics(cityLower).includes(trimmedLower)) {
                    score += 2;
                }
                if (cityLower === trimmedLower || stripDiacritics(cityLower) === trimmedLower) {
                    score += 1;
                }
            }
            if (score > 0) {
                bestMatchingKeys.set(i, score);
            }
        }
        if (bestMatchingKeys.size === 0)
            return empty;
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
    extractLocationPieces(n) {
        const abbrevSlice = [];
        for (const m of n.matchAll(/\b([A-Z]{2,3})\b/g)) {
            abbrevSlice.push(m[1]);
        }
        let countryISO = '';
        // Check for country names (sorted longest-first to avoid partial prefix matches)
        for (const co of this.countriesByNameLength) {
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
                if (countryISO === '')
                    countryISO = 'US';
                break;
            }
            const prefixWithComma = scLower + ', ';
            if (nLower.length > prefixWithComma.length && nLower.substring(0, prefixWithComma.length) === prefixWithComma) {
                stateCode = sc;
                n = n.substring(prefixWithComma.length);
                if (countryISO === '')
                    countryISO = 'US';
                break;
            }
            const prefixWithSpace = scLower + ' ';
            if (nLower.length > prefixWithSpace.length && nLower.substring(0, prefixWithSpace.length) === prefixWithSpace) {
                stateCode = sc;
                n = n.substring(prefixWithSpace.length);
                if (countryISO === '')
                    countryISO = 'US';
                break;
            }
            const suffixWithComma = ', ' + scLower;
            if (nLower.length > suffixWithComma.length && nLower.substring(nLower.length - suffixWithComma.length) === suffixWithComma) {
                stateCode = sc;
                n = n.substring(0, n.length - suffixWithComma.length);
                if (countryISO === '')
                    countryISO = 'US';
                break;
            }
            const suffixWithSpace = ' ' + scLower;
            if (nLower.length > suffixWithSpace.length && nLower.substring(nLower.length - suffixWithSpace.length) === suffixWithSpace) {
                stateCode = sc;
                n = n.substring(0, n.length - suffixWithSpace.length);
                if (countryISO === '')
                    countryISO = 'US';
                break;
            }
        }
        // Check full US state names (e.g. "Illinois", "California")
        if (stateCode === '') {
            for (const [code, fullName] of Object.entries(US_STATE_CODES)) {
                const fullNameLower = toLower(fullName);
                const nLower = toLower(n);
                if (nLower === fullNameLower) {
                    stateCode = code;
                    n = '';
                    if (countryISO === '')
                        countryISO = 'US';
                    break;
                }
                const prefixWithComma = fullNameLower + ', ';
                if (nLower.length > prefixWithComma.length && nLower.substring(0, prefixWithComma.length) === prefixWithComma) {
                    stateCode = code;
                    n = n.substring(prefixWithComma.length);
                    if (countryISO === '')
                        countryISO = 'US';
                    break;
                }
                const prefixWithSpace = fullNameLower + ' ';
                if (nLower.length > prefixWithSpace.length && nLower.substring(0, prefixWithSpace.length) === prefixWithSpace) {
                    stateCode = code;
                    n = n.substring(prefixWithSpace.length);
                    if (countryISO === '')
                        countryISO = 'US';
                    break;
                }
                const suffixWithComma = ', ' + fullNameLower;
                if (nLower.length > suffixWithComma.length && nLower.substring(nLower.length - suffixWithComma.length) === suffixWithComma) {
                    stateCode = code;
                    n = n.substring(0, n.length - suffixWithComma.length);
                    if (countryISO === '')
                        countryISO = 'US';
                    break;
                }
                const suffixWithSpace = ' ' + fullNameLower;
                if (nLower.length > suffixWithSpace.length && nLower.substring(nLower.length - suffixWithSpace.length) === suffixWithSpace) {
                    stateCode = code;
                    n = n.substring(0, n.length - suffixWithSpace.length);
                    if (countryISO === '')
                        countryISO = 'US';
                    break;
                }
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
                    }
                    else if (countryISO === '') {
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
    getConfig() {
        return this.config;
    }
}
// Singleton
let defaultGeoBed = null;
let defaultGeoBedPromise = null;
export async function getDefaultGeobed() {
    if (defaultGeoBed)
        return defaultGeoBed;
    if (!defaultGeoBedPromise) {
        defaultGeoBedPromise = GeoBed.create().then(g => {
            defaultGeoBed = g;
            return g;
        });
    }
    return defaultGeoBedPromise;
}
export const knownCities = [
    { query: 'Austin', wantCity: 'Austin', wantCountry: 'US' },
    { query: 'Paris', wantCity: 'Paris', wantCountry: 'FR' },
    { query: 'Sydney', wantCity: 'Sydney', wantCountry: 'AU' },
    { query: 'Berlin', wantCity: 'Berlin', wantCountry: 'DE' },
    { query: 'New York, NY', wantCity: 'New York City', wantCountry: 'US' },
    { query: 'Tokyo', wantCity: 'Tokyo', wantCountry: 'JP' },
];
export const knownCoords = [
    { lat: 30.26715, lng: -97.74306, wantCity: 'Austin', wantCountry: 'US' },
    { lat: 37.44651, lng: -122.15322, wantCity: 'Palo Alto', wantCountry: 'US' },
    { lat: 36.9741, lng: -122.0308, wantCity: 'Santa Cruz', wantCountry: 'US' },
    { lat: -33.8688, lng: 151.2093, wantCity: 'Sydney', wantCountry: 'AU' },
];
export async function validateCache() {
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
//# sourceMappingURL=geobed.js.map