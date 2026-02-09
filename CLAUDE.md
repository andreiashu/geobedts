# CLAUDE.md

## Project Overview

geobedts is an offline geocoding library for TypeScript/Node.js. It provides forward geocoding (city name to coordinates) and reverse geocoding (coordinates to nearest city) using Geonames data.

## Build & Test

```bash
npm run build          # TypeScript compilation to dist/
npm test               # Run all tests (vitest)
npm run test:watch     # Watch mode
npm run generate-cache # Regenerate .msgpack cache files from raw data
```

## Architecture

- **Data source**: Geonames cities1000.zip, countryInfo.txt, admin1CodesASCII.txt
- **Cache format**: MessagePack (.msgpack) files in geobed-cache/
- **Spatial indexing**: Custom S2 geometry implementation (src/s2-geometry.ts) using level-10 cells
- **String interning**: Country/region codes stored as numeric indices into lookup tables
- **Fuzzy matching**: Levenshtein distance via `fastest-levenshtein`

## Key Files

- `src/geobed.ts` - Main GeoBed class with geocode() and reverseGeocode()
- `src/types.ts` - All types, constants, scoring weights
- `src/s2-geometry.ts` - S2 cell computation (Hilbert curve, CellID, neighbors)
- `src/data-loader.ts` - Raw data file parsing (zip, txt)
- `src/cache.ts` - MessagePack serialization with optional bzip2
- `src/admin-divisions.ts` - Admin division loading and lookup
- `src/index.ts` - Public API exports

## Conventions

- ESM modules (`"type": "module"` in package.json)
- Node16 module resolution
- Strict TypeScript
- Tests use Vitest with 60s timeouts (data loading is slow)
- All imports use `.js` extension (required for Node16 ESM)

## Behavioral Requirements

- Scoring weights: 7 exact city, 5 region abbrev/alt exact, 4 country/state, 3 alt case-insensitive, 2 substring, 1 case-insensitive
- Population tiebreaker when scores are equal
- Input truncation at 256 Unicode codepoints
- S2 cell level 10 for spatial indexing
- Cities sorted case-insensitive alphabetically
- City name index maps first character to last index in sorted array
