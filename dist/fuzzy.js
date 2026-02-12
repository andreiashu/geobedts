import { distance as levenshteinDistance } from 'fastest-levenshtein';
export function fuzzyMatch(query, candidate, maxDist) {
    if (maxDist === 0) {
        return query.toLowerCase() === candidate.toLowerCase();
    }
    const dist = levenshteinDistance(query.toLowerCase(), candidate.toLowerCase());
    return dist <= maxDist;
}
//# sourceMappingURL=fuzzy.js.map