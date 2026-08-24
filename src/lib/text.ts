/** Lowercases and strips diacritics so an accented name matches a plain-ASCII search. */
export function foldText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}
