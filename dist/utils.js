export function toLower(s) {
    return s.toLowerCase();
}
export function toUpper(s) {
    return s.toUpperCase();
}
export function stripDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export function compareCaseInsensitive(a, b) {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower < bLower)
        return -1;
    if (aLower > bLower)
        return 1;
    return 0;
}
//# sourceMappingURL=utils.js.map