// S2 Geometry - Minimal implementation for geocoding spatial indexing
// Based on the S2 geometry library (https://s2geometry.io/)

const MAX_LEVEL = 30;
const POS_BITS = 2 * MAX_LEVEL + 1; // 61

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export interface LatLng {
  latRadians: number;
  lngRadians: number;
}

export function latLngFromDegrees(latDeg: number, lngDeg: number): LatLng {
  return {
    latRadians: toRadians(latDeg),
    lngRadians: toRadians(lngDeg),
  };
}

export function angularDistance(a: LatLng, b: LatLng): number {
  const dlat = b.latRadians - a.latRadians;
  const dlng = b.lngRadians - a.lngRadians;
  const sinDlat = Math.sin(dlat / 2);
  const sinDlng = Math.sin(dlng / 2);
  const h = sinDlat * sinDlat + Math.cos(a.latRadians) * Math.cos(b.latRadians) * sinDlng * sinDlng;
  return 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export type CellID = bigint;

function xyzToFace(x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax > ay) {
    if (ax > az) return x < 0 ? 3 : 0;
    return z < 0 ? 5 : 2;
  }
  if (ay > az) return y < 0 ? 4 : 1;
  return z < 0 ? 5 : 2;
}

function faceXYZtoUV(face: number, x: number, y: number, z: number): [number, number] {
  switch (face) {
    case 0: return [y / x, z / x];
    case 1: return [-x / y, z / y];
    case 2: return [-x / z, -y / z];
    case 3: return [z / x, y / x];
    case 4: return [z / y, -x / y];
    case 5: return [-y / z, -x / z];
    default: return [0, 0];
  }
}

function uvToST(u: number): number {
  if (u >= 0) {
    return 0.5 * Math.sqrt(1 + 3 * u);
  }
  return 1 - 0.5 * Math.sqrt(1 - 3 * u);
}

function stToIJ(s: number): number {
  const maxSize = 1 << MAX_LEVEL;
  return Math.max(0, Math.min(maxSize - 1, Math.floor(s * maxSize)));
}

// Hilbert curve lookup tables
const LOOKUP_POS: number[] = new Array(1024).fill(0);
const LOOKUP_IJ: number[] = new Array(1024).fill(0);

const SWAP_MASK = 0x01;
const INVERT_MASK = 0x02;
const POS_TO_IJ: number[][] = [
  [0, 1, 3, 2],
  [0, 2, 3, 1],
  [3, 2, 0, 1],
  [3, 1, 0, 2],
];
const POS_TO_ORIENTATION = [SWAP_MASK, 0, 0, INVERT_MASK | SWAP_MASK];

function initLookupCell(level: number, i: number, j: number, origOrientation: number, pos: number, orientation: number): void {
  if (level === 4) {
    const ij = (i << 4) | j;
    LOOKUP_POS[(ij << 2) | origOrientation] = (pos << 2) | orientation;
    LOOKUP_IJ[(pos << 2) | origOrientation] = (ij << 2) | orientation;
    return;
  }
  level++;
  i <<= 1;
  j <<= 1;
  pos <<= 2;
  const r = POS_TO_IJ[orientation];
  for (let index = 0; index < 4; index++) {
    const bits = r[index];
    initLookupCell(
      level,
      i + (bits >> 1),
      j + (bits & 1),
      origOrientation,
      pos + index,
      orientation ^ POS_TO_ORIENTATION[index],
    );
  }
}

// Initialize lookup tables at module load
(function initTables() {
  initLookupCell(0, 0, 0, 0, 0, 0);
  initLookupCell(0, 0, 0, SWAP_MASK, 0, SWAP_MASK);
  initLookupCell(0, 0, 0, INVERT_MASK, 0, INVERT_MASK);
  initLookupCell(0, 0, 0, SWAP_MASK | INVERT_MASK, 0, SWAP_MASK | INVERT_MASK);
})();

function cellIDFromFaceIJ(face: number, i: number, j: number): bigint {
  let n = BigInt(face) << BigInt(POS_BITS - 1);
  let bits = (face & SWAP_MASK);
  for (let k = 7; k >= 0; k--) {
    const mask = (1 << 4) - 1;
    bits += ((((i >> (k * 4)) & mask) << 4) | ((j >> (k * 4)) & mask)) << 2;
    bits = LOOKUP_POS[bits];
    n |= BigInt((bits >> 2)) << BigInt(k * 2 * 4);
    bits &= (SWAP_MASK | INVERT_MASK);
  }
  return n * 2n + 1n;
}

function lsbForLevel(level: number): bigint {
  return 1n << BigInt(2 * (MAX_LEVEL - level));
}

function cellIDParent(cellId: bigint, level: number): bigint {
  const newLsb = lsbForLevel(level);
  return (cellId & (-newLsb)) | newLsb;
}

export function cellIDFromLatLng(ll: LatLng): CellID {
  const phi = ll.latRadians;
  const theta = ll.lngRadians;
  const cosphi = Math.cos(phi);
  const x = cosphi * Math.cos(theta);
  const y = cosphi * Math.sin(theta);
  const z = Math.sin(phi);

  const face = xyzToFace(x, y, z);
  const [u, v] = faceXYZtoUV(face, x, y, z);
  const s = uvToST(u);
  const t = uvToST(v);
  const i = stToIJ(s);
  const j = stToIJ(t);

  return cellIDFromFaceIJ(face, i, j);
}

export function cellIDParentAtLevel(cellId: CellID, level: number): CellID {
  return cellIDParent(cellId, level);
}

function cellIDFace(id: CellID): number {
  return Number(id >> BigInt(POS_BITS));
}

function cellIDLevel(id: CellID): number {
  if (id === 0n) return -1;
  let lsb = id & (-id);
  let level = MAX_LEVEL;
  while (lsb > 1n) {
    lsb >>= 2n;
    level--;
  }
  return level;
}

function cellIDToFaceIJ(id: CellID): [number, number, number] {
  const face = cellIDFace(id);
  let bits = face & 1;
  let i = 0;
  let j = 0;

  for (let k = 7; k >= 0; k--) {
    const nbits = (k === 7) ? (MAX_LEVEL - 7 * 4) : 4;
    bits += (Number((id >> BigInt(k * 2 * 4 + 1)) & BigInt((1 << (2 * nbits)) - 1))) << 2;
    bits = LOOKUP_IJ[bits];
    i = (i << nbits) + ((bits >> (nbits + 2)));
    j = (j << nbits) + (((bits >> 2)) & ((1 << nbits) - 1));
    bits &= (SWAP_MASK | INVERT_MASK);
  }

  return [face, i, j];
}

function sizeIJ(level: number): number {
  return 1 << (MAX_LEVEL - level);
}

function cellIDFromFaceIJWrap(face: number, i: number, j: number, level: number): CellID {
  const maxSize = 1 << MAX_LEVEL;
  const ci = Math.max(0, Math.min(maxSize - 1, i));
  const cj = Math.max(0, Math.min(maxSize - 1, j));
  const leafCell = cellIDFromFaceIJ(face, ci, cj);
  return cellIDParent(leafCell, level);
}

function cellIDFromFaceIJSame(face: number, i: number, j: number, sameFace: boolean, level: number): CellID {
  if (sameFace) {
    const leafCell = cellIDFromFaceIJ(face, i, j);
    return cellIDParent(leafCell, level);
  }
  return cellIDFromFaceIJWrap(face, i, j, level);
}

export function cellIDEdgeNeighbors(id: CellID): [CellID, CellID, CellID, CellID] {
  const level = cellIDLevel(id);
  const size = sizeIJ(level);
  const [face, i, j] = cellIDToFaceIJ(id);

  return [
    cellIDFromFaceIJSame(face, i, j - size, j - size >= 0, level),
    cellIDFromFaceIJSame(face, i + size, j, i + size < (1 << MAX_LEVEL), level),
    cellIDFromFaceIJSame(face, i, j + size, j + size < (1 << MAX_LEVEL), level),
    cellIDFromFaceIJSame(face, i - size, j, i - size >= 0, level),
  ];
}
