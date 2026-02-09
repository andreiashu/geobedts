import { initLookupTables } from './string-interner.js';
import { loadGeonamesCities, loadGeonamesCountryInfo } from './data-loader.js';
import { storeCache } from './cache.js';
import { compareCaseInsensitive, toLower } from './utils.js';

async function main() {
  console.log('Initializing lookup tables...');
  initLookupTables();

  console.log('Loading Geonames cities...');
  const cities = await loadGeonamesCities('./geobed-data/cities1000.zip');
  console.log(`Loaded ${cities.length} cities`);

  console.log('Loading country info...');
  const countries = loadGeonamesCountryInfo('./geobed-data/countryInfo.txt');
  console.log(`Loaded ${countries.length} countries`);

  console.log('Sorting cities...');
  cities.sort((a, b) => compareCaseInsensitive(a.city, b.city));

  console.log('Building city name index...');
  const cityNameIdx = new Map<string, number>();
  for (let k = 0; k < cities.length; k++) {
    const v = cities[k];
    if (v.city.length === 0) continue;
    const runes = [...v.city];
    if (runes.length === 0) continue;
    const ik = toLower(runes[0]);
    const existing = cityNameIdx.get(ik);
    if (existing === undefined || existing < k) {
      cityNameIdx.set(ik, k);
    }
  }

  console.log('Storing cache...');
  storeCache('./geobed-cache', cities, countries, cityNameIdx);
  console.log('Cache generated successfully!');
}

main().catch(console.error);
