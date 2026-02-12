export declare class StringInterner {
    private lookup;
    private index;
    intern(s: string): number;
    get(idx: number): string;
    count(): number;
}
export declare function initLookupTables(): void;
export declare function getCountryInterner(): StringInterner;
export declare function getRegionInterner(): StringInterner;
export declare function internCountry(code: string): number;
export declare function internRegion(code: string): number;
export declare function countryCount(): number;
export declare function regionCount(): number;
//# sourceMappingURL=string-interner.d.ts.map