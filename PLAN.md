# Geobed TypeScript Port - Implementation Plan

## Overview

Port the Go `geobed` library to TypeScript (`geobedts`), providing identical offline geocoding functionality: forward geocoding (city name to coordinates) and reverse geocoding (coordinates to city name). The TypeScript version must be a complete, production-ready drop-in replacement.

## Architecture Decisions

### Data Format
- The Go version uses GOB encoding (Go-specific binary format) for cache files
- **TypeScript approach**: Use MessagePack (via `@msgpack/msgpack`) for binary serialization - compact, fast, cross-language
- Alternatively, since we need to bootstrap from the same raw Geonames data files, we can parse the same raw `.zip`, `.txt`, and `.gz` files directly
- Cache files will be stored as `.msgpack.bz2` (or `.msgpack`) in a `geobed-cache/` directory
- For the initial implementation, we'll convert the Go cache data by reading the raw data files directly

### S2 Geometry
- The Go version uses `github.com/golang/geo/s2` for spatial indexing
- **TypeScript approach**: Use the `s2-geometry` npm package (or `s2geometry` / `@radarlabs/s2`) for S2 cell computation
- If no suitable S2 library exists, implement the minimal S2 cell computation needed (CellID from lat/lng at level 10, edge neighbors)

### Levenshtein Distance
- Use `fastest-levenshtein` npm package (fastest JS implementation)

### Bzip2 Decompression
- Use `seek-bzip` or `unbzip2-stream` for bzip2 decompression

### String Interning
- TypeScript doesn't have the same memory concerns as Go (no struct padding), but we'll implement a string interner for API consistency
- Country/Region stored as indexes into lookup tables, accessed via methods

### Embedded Data
- In Go, data is embedded via `//go:embed` at compile time
- **TypeScript approach**: Bundle the cache data files with the npm package, load at runtime from the package directory using `__dirname`/`import.meta.url`

## File Structure

```
geobedts/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── PLAN.md
├── README.md
├── src/
│   ├── index.ts                 # Public API exports
│   ├── geobed.ts                # Main GeoBed class
│   ├── admin-divisions.ts       # Admin division loading and lookup
│   ├── types.ts                 # All type definitions
│   ├── string-interner.ts       # String interner implementation
│   ├── s2-geometry.ts           # S2 cell computation (minimal implementation)
│   ├── data-loader.ts           # Raw data file parsing
│   ├── cache.ts                 # Cache serialization/deserialization
│   ├── fuzzy.ts                 # Fuzzy matching with Levenshtein
│   └── utils.ts                 # Utility functions (toLower, toUpper, prev, etc.)
├── geobed-cache/                # Bundled cache data (MessagePack format)
│   ├── cities.msgpack.bz2
│   ├── countries.msgpack.bz2
│   └── cityNameIdx.msgpack.bz2
├── geobed-data/                 # Symlink or copy of raw Geonames data
│   ├── cities1000.zip
│   ├── countryInfo.txt
│   └── admin1CodesASCII.txt
└── tests/
    ├── geobed.test.ts           # Core tests (init, geocode, reverse geocode)
    ├── comprehensive.test.ts    # Edge cases, unicode, concurrency, formats
    ├── fuzzy.test.ts            # Fuzzy matching tests
    ├── admin-divisions.test.ts  # Admin division tests
    ├── geocode.test.ts          # Specific geocoding regression tests
    ├── validation.test.ts       # Data integrity validation
    └── memory-analysis.test.ts  # Memory footprint analysis
```

## Implementation Steps

### Phase 1: Project Setup
1. Initialize npm project with TypeScript, Vitest
2. Set up tsconfig.json for Node.js with ESM
3. Install dependencies: `fastest-levenshtein`, `yauzl` (zip), `@msgpack/msgpack`, `unbzip2-stream` (or similar)
4. Set up the geobed-data directory (symlink to Go project's data)

### Phase 2: Core Types and Utilities
5. Implement `types.ts` - all interfaces and types
6. Implement `string-interner.ts` - StringInterner class
7. Implement `utils.ts` - toLower, toUpper, prev, compareCaseInsensitive
8. Implement `s2-geometry.ts` - S2 cell computation

### Phase 3: Data Loading
9. Implement `data-loader.ts` - parse cities1000.zip, countryInfo.txt, admin1CodesASCII.txt
10. Implement `cache.ts` - MessagePack serialization/deserialization with bzip2
11. Implement `admin-divisions.ts` - admin division loading and lookup

### Phase 4: Geocoding Algorithms
12. Implement `fuzzy.ts` - fuzzy matching with Levenshtein
13. Implement `geobed.ts` - main GeoBed class with:
    - Constructor with options
    - Forward geocoding (Geocode) with exact match and fuzzy match modes
    - Reverse geocoding (ReverseGeocode) with S2 spatial index
    - extractLocationPieces, getSearchRange
    - buildCellIndex, cellAndNeighbors
14. Implement `index.ts` - public API exports

### Phase 5: Cache Generation
15. Generate TypeScript-native cache files from the Go raw data
16. Bundle cache files with the package

### Phase 6: Testing
17. Port all test files from Go to TypeScript/Vitest
18. Run tests and fix any discrepancies
19. Validate that TypeScript results match Go results for all test cases

### Phase 7: Finalization
20. Add README.md with usage examples
21. Verify all Go tests pass in TypeScript
22. Performance benchmarking

## Key Behavioral Requirements

These behaviors MUST match the Go implementation exactly:

1. **Forward geocoding scoring** - Same scoring weights (7 for exact, 5 for region abbrev, etc.)
2. **Population tiebreaker** - When scores are equal, prefer higher population
3. **Case-insensitive comparison** - Using Unicode-aware toLowerCase
4. **US State code extraction** - Same prefix/suffix matching logic
5. **Country name extraction** - Same prefix/suffix matching with loaded country names
6. **Admin division lookup** - Same ambiguity handling
7. **S2 cell level 10** - Same spatial granularity for reverse geocoding
8. **Input truncation at 256 runes** - Same DoS protection
9. **City name index** - Same first-character-to-last-index mapping for search ranges
10. **Sort order** - Case-insensitive alphabetical by city name

## Dependencies

| npm package | Purpose |
|------------|---------|
| `fastest-levenshtein` | Levenshtein edit distance |
| `yauzl` | ZIP file reading |
| `@msgpack/msgpack` | Binary serialization |
| `seek-bzip` | Bzip2 decompression |
| `typescript` | TypeScript compiler |
| `vitest` | Test framework |
