export class StringInterner {
  private lookup: string[] = [''];
  private index: Map<string, number> = new Map([['', 0]]);

  intern(s: string): number {
    const existing = this.index.get(s);
    if (existing !== undefined) return existing;
    const idx = this.lookup.length;
    this.lookup.push(s);
    this.index.set(s, idx);
    return idx;
  }

  get(idx: number): string {
    if (idx >= 0 && idx < this.lookup.length) return this.lookup[idx];
    return '';
  }

  count(): number {
    return this.lookup.length;
  }
}

let countryInterner: StringInterner | null = null;
let regionInterner: StringInterner | null = null;
let initialized = false;

export function initLookupTables(): void {
  if (initialized) return;
  countryInterner = new StringInterner();
  regionInterner = new StringInterner();
  initialized = true;
}

export function getCountryInterner(): StringInterner {
  if (!countryInterner) initLookupTables();
  return countryInterner!;
}

export function getRegionInterner(): StringInterner {
  if (!regionInterner) initLookupTables();
  return regionInterner!;
}

export function internCountry(code: string): number {
  return getCountryInterner().intern(code);
}

export function internRegion(code: string): number {
  return getRegionInterner().intern(code);
}

export function countryCount(): number {
  return getCountryInterner().count();
}

export function regionCount(): number {
  return getRegionInterner().count();
}
