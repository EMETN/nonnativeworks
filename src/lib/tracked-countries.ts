/**
 * ISO alpha-2 codes for countries actively tracked by the website.
 * Jobs from any other country are filtered out during scraping.
 * Add or remove codes here to control which countries appear in the admin review.
 */
export const TRACKED_COUNTRY_CODES = new Set([
  'FI', // Finland
  'SE', // Sweden
  'NO', // Norway
  'DK', // Denmark
  'IS', // Iceland
  'NL', // Netherlands
  'DE', // Germany
  'EE', // Estonia
  'LV', // Latvia
  'LT', // Lithuania
  'PL', // Poland
  'FR', // France
  'BE', // Belgium
  'LU', // Luxembourg
  'CH', // Switzerland
]);
