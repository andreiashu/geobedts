export type DataSourceID = 'geonamesCities1000' | 'geonamesCountryInfo' | 'geonamesAdmin1Codes' | 'maxmindWorldCities';
export interface DataSource {
    url: string;
    path: string;
    id: DataSourceID;
}
export declare const dataSetFiles: DataSource[];
export declare const US_STATE_CODES: Record<string, string>;
export interface GeobedCity {
    city: string;
    cityAlt: string;
    countryIdx: number;
    regionIdx: number;
    latitude: number;
    longitude: number;
    population: number;
}
export interface GeobedCityGob {
    city: string;
    cityAlt: string;
    country: string;
    region: string;
    latitude: number;
    longitude: number;
    population: number;
}
export interface CountryInfo {
    country: string;
    capital: string;
    area: number;
    population: number;
    geonameId: number;
    isoNumeric: number;
    iso: string;
    iso3: string;
    fips: string;
    continent: string;
    tld: string;
    currencyCode: string;
    currencyName: string;
    phone: string;
    postalCodeFormat: string;
    postalCodeRegex: string;
    languages: string;
    neighbours: string;
    equivalentFipsCode: string;
}
export interface GeocodeOptions {
    exactCity?: boolean;
    fuzzyDistance?: number;
}
export interface GeobedConfig {
    dataDir: string;
    cacheDir: string;
}
export type Option = (config: GeobedConfig) => void;
export declare function withDataDir(dir: string): Option;
export declare function withCacheDir(dir: string): Option;
export declare function defaultConfig(): GeobedConfig;
export interface AdminDivision {
    code: string;
    name: string;
}
export declare const S2_CELL_LEVEL = 10;
export declare const MAX_GEOCODE_INPUT_LEN = 256;
export declare const MIN_CITY_COUNT = 140000;
export declare const MIN_COUNTRY_COUNT = 200;
//# sourceMappingURL=types.d.ts.map