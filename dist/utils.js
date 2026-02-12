export function toLower(s) {
    return s.toLowerCase();
}
export function toUpper(s) {
    return s.toUpperCase();
}
export function prev(r) {
    const code = r.codePointAt(0);
    if (code === undefined || code <= 0)
        return '';
    return String.fromCodePoint(code - 1);
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