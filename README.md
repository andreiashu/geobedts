# geobedts

High-performance offline geocoding library for TypeScript/Node.js.

Provides forward geocoding (city name to coordinates) and reverse geocoding (coordinates to nearest city) using [Geonames](https://www.geonames.org/) data with ~165,000 cities worldwide.

## Installation

```bash
npm install github:andreiashu/geobedts
```

## Quick Start

```typescript
import { GeoBed } from 'geobedts';

const g = await GeoBed.create();

// Forward geocode
const city = g.geocode('Austin, TX');
console.log(city.city);                  // "Austin"
console.log(city.latitude, city.longitude); // 30.26715 -97.74306
console.log(GeoBed.cityCountry(city));   // "US"
console.log(GeoBed.cityRegion(city));    // "TX"

// Reverse geocode
const nearest = g.reverseGeocode(48.8566, 2.3522);
console.log(nearest.city); // "Paris"
```

## API

### `GeoBed.create(...opts): Promise<GeoBed>`

Creates a new GeoBed instance. Loads data from cache (MessagePack) or raw Geonames files. Downloads data automatically if not present.

```typescript
import { GeoBed, withDataDir, withCacheDir } from 'geobedts';

// Default paths
const g = await GeoBed.create();

// Custom paths
const g = await GeoBed.create(
  withDataDir('./my-data'),
  withCacheDir('./my-cache'),
);
```

### `g.geocode(query, opts?): GeobedCity`

Forward geocode a city name to coordinates.

```typescript
// Simple lookup
g.geocode('Paris');

// With country context
g.geocode('Paris, France');

// With US state
g.geocode('Portland, OR');

// Exact match only
g.geocode('Austin, TX', { exactCity: true });

// Fuzzy matching (Levenshtein distance)
g.geocode('Londn', { fuzzyDistance: 1 }); // returns London
```

### `g.reverseGeocode(lat, lng): GeobedCity`

Find the nearest city to given coordinates. Uses S2 spatial indexing for fast lookups.

```typescript
const city = g.reverseGeocode(37.4275, -122.1697);
console.log(city.city); // "Stanford"
```

### `GeoBed.cityCountry(city): string`

Returns the ISO country code for a city (e.g. "US", "FR", "DE").

### `GeoBed.cityRegion(city): string`

Returns the region/state code for a city (e.g. "TX", "CA", "ENG").

### `getDefaultGeobed(): Promise<GeoBed>`

Returns a singleton GeoBed instance. Safe to call concurrently.

## GeobedCity

```typescript
interface GeobedCity {
  city: string;       // City name
  cityAlt: string;    // Alternative names
  countryIdx: number; // Internal country index
  regionIdx: number;  // Internal region index
  latitude: number;
  longitude: number;
  population: number;
}
```

Use `GeoBed.cityCountry()` and `GeoBed.cityRegion()` to get the string codes from the indices.

## Data

On first run, geobedts downloads ~10MB of Geonames data and generates a local cache. Subsequent loads use the cache for fast startup.

Data files:
- `cities1000.zip` - All cities with population > 1000
- `countryInfo.txt` - Country metadata
- `admin1CodesASCII.txt` - Administrative divisions

## License

BSD-3-Clause
