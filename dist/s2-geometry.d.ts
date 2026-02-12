export type CellID = bigint;
export interface LatLng {
    latRadians: number;
    lngRadians: number;
}
export declare function latLngFromDegrees(latDeg: number, lngDeg: number): LatLng;
export declare function angularDistance(a: LatLng, b: LatLng): number;
export declare function cellIDFromLatLng(ll: LatLng): CellID;
export declare function cellIDParentAtLevel(cellId: CellID, level: number): CellID;
export declare function cellIDEdgeNeighbors(id: CellID): [CellID, CellID, CellID, CellID];
//# sourceMappingURL=s2-geometry.d.ts.map