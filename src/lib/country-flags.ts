/**
 * Flag color palettes keyed by ISO 3166-1 alpha-2 code.
 * Colors are listed top-to-bottom as they appear on the flag.
 * Used when auto-creating countries from LLM-extracted data.
 */
export const FLAG_COLORS: Record<string, string[]> = {
  AD: ['#003DA5', '#FFCD00', '#C8102E'],
  AE: ['#00732F', '#FFFFFF', '#000000', '#FF0000'],
  AL: ['#E41E20', '#000000'],
  AT: ['#ED2939', '#FFFFFF', '#ED2939'],
  BA: ['#002395', '#FFCD00'],
  BE: ['#000000', '#FFD90C', '#EF3340'],
  BG: ['#FFFFFF', '#00966E', '#D62612'],
  BY: ['#CF101A', '#007C3E'],
  CH: ['#FF0000', '#FFFFFF'],
  CY: ['#FFFFFF', '#FF8C00'],
  CZ: ['#D7141A', '#FFFFFF', '#11457E'],
  DE: ['#000000', '#DD0000', '#FFCE00'],
  DK: ['#C60C30', '#FFFFFF'],
  EE: ['#0072CE', '#000000', '#FFFFFF'],
  ES: ['#AA151B', '#F1BF00', '#AA151B'],
  FI: ['#003580', '#FFFFFF'],
  FR: ['#002395', '#FFFFFF', '#ED2939'],
  GB: ['#012169', '#FFFFFF', '#C8102E'],
  GE: ['#FFFFFF', '#FF0000'],
  GR: ['#0D5EAF', '#FFFFFF'],
  HR: ['#FF0000', '#FFFFFF', '#171796'],
  HU: ['#CE2939', '#FFFFFF', '#477050'],
  IE: ['#169B62', '#FFFFFF', '#FF883E'],
  IS: ['#003897', '#FFFFFF', '#D72828'],
  IT: ['#009246', '#FFFFFF', '#CE2B37'],
  LI: ['#002B7F', '#CE1126'],
  LT: ['#FDB913', '#006A44', '#C1272D'],
  LU: ['#EF3340', '#FFFFFF', '#00A3E0'],
  LV: ['#9E3039', '#FFFFFF', '#9E3039'],
  MC: ['#CE1126', '#FFFFFF'],
  MD: ['#003DA5', '#FFD100', '#CC0001'],
  ME: ['#D4AF37', '#C40000'],
  MK: ['#CE2028', '#F7D118'],
  MT: ['#FFFFFF', '#CF0921'],
  NL: ['#AE1C28', '#FFFFFF', '#21468B'],
  NO: ['#EF2B2D', '#FFFFFF', '#002868'],
  PL: ['#FFFFFF', '#DC143C'],
  PT: ['#006600', '#FF0000', '#FFCC00'],
  RO: ['#002B7F', '#FCD116', '#CE1126'],
  RS: ['#C6363C', '#0C4076', '#FFFFFF'],
  RU: ['#FFFFFF', '#0039A6', '#D52B1E'],
  SE: ['#006AA7', '#FECC02'],
  SI: ['#003DA5', '#FFFFFF', '#DD0000'],
  SK: ['#FFFFFF', '#0B4EA2', '#EE1C25'],
  SM: ['#5EB6E4', '#FFFFFF'],
  TR: ['#E30A17', '#FFFFFF'],
  UA: ['#005BBB', '#FFD500'],
  XK: ['#244AA5', '#D4AF37'],
};

/** Returns flag colors for a given ISO alpha-2 code, or a neutral gray fallback. */
export function getFlagColors(code: string): string[] {
  return FLAG_COLORS[code.toUpperCase()] ?? ['#6B7280', '#9CA3AF'];
}

/** Derives a URL-safe slug from a name (country, company, etc.). */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}


