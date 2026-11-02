const UNDECOMPOSED_LETTERS: Record<string, string> = {
    ł: 'l',
    ø: 'o',
    đ: 'd',
    æ: 'ae',
    ß: 'ss',
};

/** Lowercases and strips diacritics so an accented name matches a plain-ASCII search. */
export function foldText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[łøđæß]/g, (letter) => UNDECOMPOSED_LETTERS[letter]);
}

export const formatCount = (n: number) => n.toLocaleString('de-DE');
