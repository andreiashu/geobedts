export function toLower(s: string): string {
  return s.toLowerCase();
}

export function toUpper(s: string): string {
  return s.toUpperCase();
}

export function prev(r: string): string {
  const code = r.codePointAt(0);
  if (code === undefined || code <= 0) return '';
  return String.fromCodePoint(code - 1);
}

export function compareCaseInsensitive(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower < bLower) return -1;
  if (aLower > bLower) return 1;
  return 0;
}
