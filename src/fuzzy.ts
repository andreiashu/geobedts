import { distance as levenshteinDistance } from 'fastest-levenshtein';

export function fuzzyMatch(query: string, candidate: string, maxDist: number): boolean {
  if (maxDist === 0) {
    return query.toLowerCase() === candidate.toLowerCase();
  }
  const dist = levenshteinDistance(query.toLowerCase(), candidate.toLowerCase());
  return dist <= maxDist;
}
