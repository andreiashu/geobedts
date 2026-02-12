import type { AdminDivision } from './types.js';
export declare function loadAdminDivisionsForDir(dataDir: string): Map<string, Map<string, AdminDivision>>;
export declare function isAdminDivision(dataDir: string, countryCode: string, divisionCode: string): boolean;
export declare function getAdminDivisionCountry(dataDir: string, code: string): string;
export declare function getAdminDivisionName(dataDir: string, countryCode: string, divisionCode: string): string;
//# sourceMappingURL=admin-divisions.d.ts.map