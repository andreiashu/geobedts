import type { GeobedCity, CountryInfo } from './types.js';
export declare function loadCachedCityData(cacheDir: string): GeobedCity[] | null;
export declare function loadCachedCountryData(cacheDir: string): CountryInfo[] | null;
export declare function loadCachedNameIndex(cacheDir: string): Map<string, number[]> | null;
export declare function storeCache(cacheDir: string, cities: GeobedCity[], countries: CountryInfo[], nameIndex: Map<string, number[]>): void;
//# sourceMappingURL=cache.d.ts.map