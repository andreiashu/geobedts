// S2 Geometry - Thin wrapper around s2js library
import { s2 } from 's2js';
export function latLngFromDegrees(latDeg, lngDeg) {
    const ll = s2.LatLng.fromDegrees(latDeg, lngDeg);
    return { latRadians: ll.lat, lngRadians: ll.lng };
}
export function angularDistance(a, b) {
    const sa = new s2.LatLng(a.latRadians, a.lngRadians);
    const sb = new s2.LatLng(b.latRadians, b.lngRadians);
    return sa.distance(sb);
}
export function cellIDFromLatLng(ll) {
    const sll = new s2.LatLng(ll.latRadians, ll.lngRadians);
    return s2.cellid.fromLatLng(sll);
}
export function cellIDParentAtLevel(cellId, level) {
    return s2.cellid.parent(cellId, level);
}
export function cellIDEdgeNeighbors(id) {
    return s2.cellid.edgeNeighbors(id);
}
//# sourceMappingURL=s2-geometry.js.map