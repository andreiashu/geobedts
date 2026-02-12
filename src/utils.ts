export function toLower(s: string): string {
  return s.toLowerCase();
}

export function toUpper(s: string): string {
  return s.toUpperCase();
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function compareCaseInsensitive(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower < bLower) return -1;
  if (aLower > bLower) return 1;
  return 0;
}
