// S2 Geometry - Thin wrapper around s2js library
import { s2 } from 's2js';

export type CellID = bigint;

export interface LatLng {
  latRadians: number;
  lngRadians: number;
}

export function latLngFromDegrees(latDeg: number, lngDeg: number): LatLng {
  const ll = s2.LatLng.fromDegrees(latDeg, lngDeg);
  return { latRadians: ll.lat, lngRadians: ll.lng };
}

export function angularDistance(a: LatLng, b: LatLng): number {
  const sa = new s2.LatLng(a.latRadians, a.lngRadians);
  const sb = new s2.LatLng(b.latRadians, b.lngRadians);
  return sa.distance(sb);
}

export function cellIDFromLatLng(ll: LatLng): CellID {
  const sll = new s2.LatLng(ll.latRadians, ll.lngRadians);
  return s2.cellid.fromLatLng(sll);
}

export function cellIDParentAtLevel(cellId: CellID, level: number): CellID {
  return s2.cellid.parent(cellId, level);
}

export function cellIDEdgeNeighbors(id: CellID): [CellID, CellID, CellID, CellID] {
  return s2.cellid.edgeNeighbors(id);
}
