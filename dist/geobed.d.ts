import type { GeobedCity, CountryInfo, GeocodeOptions, GeobedConfig, Option } from './types.js';
export declare class GeoBed {
    cities: GeobedCity[];
    countries: CountryInfo[];
    nameIndex: Map<string, number[]>;
    private cellIndex;
    private countriesByNameLength;
    private config;
    private constructor();
    static create(...opts: Option[]): Promise<GeoBed>;
    private loadDataSets;
    private buildCellIndex;
    private cellAndNeighbors;
    geocode(n: string, opts?: GeocodeOptions): GeobedCity;
    reverseGeocode(lat: number, lng: number): GeobedCity;
    static cityCountry(city: GeobedCity): string;
    static cityRegion(city: GeobedCity): string;
    private exactMatchCity;
    private fuzzyMatchLocation;
    private extractLocationPieces;
    getConfig(): GeobedConfig;
}
export declare function getDefaultGeobed(): Promise<GeoBed>;
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
export declare const knownCities: ValidationCity[];
export declare const knownCoords: ValidationCoord[];
export declare function validateCache(): Promise<void>;
export {};
//# sourceMappingURL=geobed.d.ts.map