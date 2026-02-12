import type { GeobedCity, CountryInfo } from './types.js';
export declare function loadGeonamesCities(path: string): Promise<GeobedCity[]>;
export declare function loadMaxMindCities(path: string): Promise<GeobedCity[]>;
export declare function loadGeonamesCountryInfo(path: string): CountryInfo[];
export declare function downloadFile(url: string, path: string): Promise<void>;
export declare function downloadDataSets(dataDir: string): Promise<void>;
//# sourceMappingURL=data-loader.d.ts.map