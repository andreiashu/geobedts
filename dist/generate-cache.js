import { initLookupTables } from './string-interner.js';
import { loadGeonamesCities, loadGeonamesCountryInfo } from './data-loader.js';
import { storeCache } from './cache.js';
import { compareCaseInsensitive } from './utils.js';
import { buildNameIndex } from './name-index.js';
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
    console.log('Building name index...');
    const nameIndex = buildNameIndex(cities);
    console.log('Storing cache...');
    storeCache('./geobed-cache', cities, countries, nameIndex);
    console.log('Cache generated successfully!');
}
main().catch(console.error);
//# sourceMappingURL=generate-cache.js.map