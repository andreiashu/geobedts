export class StringInterner {
    lookup = [''];
    index = new Map([['', 0]]);
    intern(s) {
        const existing = this.index.get(s);
        if (existing !== undefined)
            return existing;
        const idx = this.lookup.length;
        this.lookup.push(s);
        this.index.set(s, idx);
        return idx;
    }
    get(idx) {
        if (idx >= 0 && idx < this.lookup.length)
            return this.lookup[idx];
        return '';
    }
    count() {
        return this.lookup.length;
    }
}
let countryInterner = null;
let regionInterner = null;
let initialized = false;
export function initLookupTables() {
    if (initialized)
        return;
    countryInterner = new StringInterner();
    regionInterner = new StringInterner();
    initialized = true;
}
export function getCountryInterner() {
    if (!countryInterner)
        initLookupTables();
    return countryInterner;
}
export function getRegionInterner() {
    if (!regionInterner)
        initLookupTables();
    return regionInterner;
}
export function internCountry(code) {
    return getCountryInterner().intern(code);
}
export function internRegion(code) {
    return getRegionInterner().intern(code);
}
export function countryCount() {
    return getCountryInterner().count();
}
export function regionCount() {
    return getRegionInterner().count();
}
//# sourceMappingURL=string-interner.js.map