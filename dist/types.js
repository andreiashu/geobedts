export const dataSetFiles = [
    { url: 'https://download.geonames.org/export/dump/cities1000.zip', path: './geobed-data/cities1000.zip', id: 'geonamesCities1000' },
    { url: 'https://download.geonames.org/export/dump/countryInfo.txt', path: './geobed-data/countryInfo.txt', id: 'geonamesCountryInfo' },
    { url: 'https://download.geonames.org/export/dump/admin1CodesASCII.txt', path: './geobed-data/admin1CodesASCII.txt', id: 'geonamesAdmin1Codes' },
];
export const US_STATE_CODES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming',
    'AS': 'American Samoa', 'DC': 'District of Columbia',
    'FM': 'Federated States of Micronesia', 'GU': 'Guam',
    'MH': 'Marshall Islands', 'MP': 'Northern Mariana Islands',
    'PW': 'Palau', 'PR': 'Puerto Rico', 'VI': 'Virgin Islands',
    'AA': 'Armed Forces Americas', 'AE': 'Armed Forces Europe', 'AP': 'Armed Forces Pacific',
};
export function withDataDir(dir) {
    return (config) => { config.dataDir = dir; };
}
export function withCacheDir(dir) {
    return (config) => { config.cacheDir = dir; };
}
export function defaultConfig() {
    return { dataDir: './geobed-data', cacheDir: './geobed-cache' };
}
export const S2_CELL_LEVEL = 10;
export const MAX_GEOCODE_INPUT_LEN = 256;
export const MIN_CITY_COUNT = 140000;
export const MIN_COUNTRY_COUNT = 200;
//# sourceMappingURL=types.js.map