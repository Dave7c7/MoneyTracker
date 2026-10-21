/**
 * Merchant normalization.
 *
 * Bank descriptions are messy: processor prefixes, store numbers, city and
 * state suffixes, phone numbers and authorization codes all end up in the
 * description. `normalizeMerchant` strips that noise so the same merchant
 * collapses to one identity, which is what makes "apply to all from this
 * merchant?" possible.
 *
 * The approach is deliberately layered: strong structural signals first (a
 * store number ends the merchant name), then location tails, then a lookup
 * table for merchants the bank renames beyond recognition.
 */

/**
 * Merchants the bank renames beyond recognition.
 *
 * Keys are uppercase: lookups uppercase the cleaned description first.
 */
const MERCHANT_ALIASES: ReadonlyMap<string, string> = new Map([
  ['AMZN MKTP', 'Amazon'],
  ['AMZN MKTP US', 'Amazon'],
  ['AMAZON COM', 'Amazon'],
  ['AMAZON.COM', 'Amazon'],
  ['AMAZON MKT US', 'Amazon'],
  ['AMAZON', 'Amazon'],
  ['PAYPAL INST XFER', 'PayPal'],
  ['PAYPAL', 'PayPal'],
  ['VENMO PAYMENT', 'Venmo'],
  ['VENMO', 'Venmo'],
  ['CASH APP PAYMENT', 'Cash App'],
  ['CASH APP', 'Cash App'],
  ['SQUARE', 'Square'],
  ['APPLE.COM/BILL', 'Apple'],
  ['APPLE.COM/US', 'Apple'],
  ['GOOGLE *STORAGE', 'Google'],
  ['GOOGLE', 'Google'],
  ['INTUIT*TURBOTAX', 'TurboTax'],
  ['SHELL OIL', 'Shell'],
  ['EXXONMOBIL', 'ExxonMobil'],
  ['CHEVRON', 'Chevron'],
  ['CHIPOTLE ONLINE', 'Chipotle'],
  ['CHIPOTLE', 'Chipotle'],
  ['DOORDASH*PIZZA HUT', 'DoorDash'],
  ['DOORDASH', 'DoorDash'],
  ['UBER EATS', 'Uber Eats'],
  ['UBER TRIP', 'Uber'],
  ['UBER', 'Uber'],
  ['LYFT RIDE', 'Lyft'],
  ['LYFT', 'Lyft'],
  ['WHOLE FOODS MKT', 'Whole Foods Market'],
  ['WHOLE FOODS', 'Whole Foods Market'],
  ['TRADER JOES SF', 'Trader Joes'],
  ['TRADER JOES', 'Trader Joes'],
  ['SAFEWAY', 'Safeway'],
  ['KROGER', 'Kroger'],
  ['CVS PHARMACY', 'CVS Pharmacy'],
  ['WALGREENS', 'Walgreens'],
  ['TARGET', 'Target'],
  ['COSTCO WHSE', 'Costco'],
  ['THE HOME DEPOT', 'Home Depot'],
  ['MARRIOTT HOTELS', 'Marriott'],
  ['PRET A MANGER', 'Pret A Manger'],
  ['NETFLIX.COM', 'Netflix'],
  ['NETFLIX', 'Netflix'],
  ['SPOTIFY USA NEW YORK NY', 'Spotify'],
  ['SPOTIFY USA', 'Spotify'],
  ['SPOTIFY', 'Spotify'],
  ['YOUTUBE PREMIUM', 'YouTube Premium'],
  ['HULU', 'Hulu'],
  ['DISNEY PLUS', 'Disney Plus'],
  ['DROPBOX', 'Dropbox'],
  ['ZOOM.US', 'Zoom'],
  ['GITHUB', 'GitHub'],
  ['COMCAST CABLE COMM 800-COMCAST', 'Comcast'],
  ['COMCAST', 'Comcast'],
  ['XFINITY', 'Xfinity'],
  ['PG&E', 'PG&E'],
  ['PACIFIC GAS & ELECTRIC', 'PG&E'],
  ['VERIZON', 'Verizon'],
  ['T-MOBILE', 'T-Mobile'],
  ['DELTA AIR ATL', 'Delta Air Lines'],
  ['ATM WITHDRAWAL', 'ATM Withdrawal'],
  ['ZELLE PAYMENT', 'Zelle'],
  ['BURGER KING', 'Burger King'],
  ['BASH CO-OP', 'Bash Co-op'],
]);

/** Alias keys sorted longest first, so the most specific alias wins. */
const ALIAS_KEYS_BY_LENGTH = [...MERCHANT_ALIASES.keys()].sort((a, b) => b.length - a.length);

/** Payment processor and network prefixes that carry no meaning. */
const PROCESSOR_PREFIXES: readonly RegExp[] = [
  /^sq\s*\*\s*/i,
  /^tst\s*\*\s*/i,
  /^sp\s*\*\s*/i,
  /^pp\s*\*\s*/i,
  /^paypal\s*\*\s*/i,
  /^paypal\s+/i,
  /^pos\s+/i,
  /^purchase\s+authorized\s+on\s+\d{2}\/\d{2}(\s+\d{2}:\d{2})?\s*/i,
  /^recurring\s+payment\s+authorized\s+on\s+\d{2}\/\d{2}\s*/i,
  /^ach\s+(debit|credit)\s+(card\s+)?purchase\s*/i,
  /^debit\s+card\s+purchase\s*/i,
  /^visa\s+purchase\s+/i,
  /^external\s+debit\s+/i,
];

/**
 * A store number ends the merchant name; everything after it is location or
 * authorization noise. Matches "#123", "STORE 123", or a bare 3-6 digit
 * number that stands on its own.
 */
const STORE_NUMBER = /\s*(?:#|store\s*#?\s*)\d+\b|\s+\d{3,6}(?=\s|$)/i;

/** US state and district codes, used to recognise a "City ST" tail. */
const STATE_CODES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
];

/** Location tails: "CITY ST 94105", "CA 94105", "94105". */
const LOCATION_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\s+[A-Za-z .'-]+,\\s*[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\b`, 'g'),
  new RegExp(`\\s+[A-Za-z .'-]+\\s+[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\b`, 'g'),
  new RegExp(`\\s+[A-Za-z]{2}\\s+\\d{5}(-\\d{4})?\\b`, 'g'),
  /\s+\d{5}(-\d{4})?\b/g,
  new RegExp(`\\s+[A-Za-z .'-]+\\s+(?:${STATE_CODES.join('|')})\\b`, 'g'),
];

/** Street addresses: "123 MARKET ST", "45TH ST", "STE 200". */
const STREET_PATTERNS: readonly RegExp[] = [
  /\s+-?\s*\d+[a-z]{0,3}\s+[A-Za-z0-9'&-]+(\s+[A-Za-z0-9'&-]+)?\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|hwy|highway|pl|place|pkwy|parkway|suite|ste|apt|unit)\b\.?/gi,
];

/** Everything else that is not part of the merchant name. */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g,
  /\s+\d{6,}\b/g,
  /\s*\*+\s*[A-Za-z0-9]{3,}\s*$/,
  /\s+[A-Z]{2}\d{4,}\s*$/,
  /\s+authorized\s+on\s+\d{2}\/\d{2}(\s+\d{2}:\d{2})?\s*$/i,
  /\s+pending\s*$/i,
  /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io)\b(?!\/)/gi,
  /\s+TO\s+[A-Z][A-Za-z'-]+(\s+[A-Z][A-Za-z'-]+)*\s*$/,
  /\s*\b(?:inc|llc|ltd)\b\.?\s*$/i,
];

/** Names that are conventionally written in all caps. */
const UPPERCASE_NAMES = new Set([
  'ATM',
  'CVS',
  'UPS',
  'KFC',
  'IKEA',
  'H&M',
  'AT&T',
  'BP',
  'USPS',
  'REI',
  'AMC',
  'TGI',
  'M&M',
  'PG&E',
]);

/** Words that stay lowercase inside a display name. */
const MINOR_WORDS = new Set(['and', 'the', 'of', 'for', 'to', 'in', 'on', 'at', 'by']);

/**
 * Normalizes a raw bank description into a stable merchant display name.
 *
 * @example
 * normalizeMerchant('SQ *BLUE BOTTLE COFFEE #12'); // "Blue Bottle Coffee"
 * normalizeMerchant('TST*DOORDASH'); // "DoorDash"
 */
export function normalizeMerchant(descriptionRaw: string): string {
  let value = descriptionRaw.trim().replace(/\s+/g, ' ');

  for (const prefix of PROCESSOR_PREFIXES) {
    value = value.replace(prefix, '');
  }
  value = value.trim();

  // A store number ends the merchant name.
  const storeNumber = value.match(STORE_NUMBER);
  if (storeNumber?.index !== undefined) {
    value = value.slice(0, storeNumber.index).trim();
  }

  const earlyAlias = lookupAlias(value);
  if (earlyAlias) return earlyAlias;

  for (let pass = 0; pass < 4; pass += 1) {
    const before = value;
    for (const pattern of [...LOCATION_PATTERNS, ...STREET_PATTERNS, ...NOISE_PATTERNS]) {
      value = value.replace(pattern, '');
    }
    value = value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[-,;.]+$/, '')
      .trim();
    if (value === before) break;
  }

  if (value.length === 0) {
    return 'Unknown Merchant';
  }

  const alias = lookupAlias(value);
  if (alias) {
    return alias;
  }

  return toDisplayCase(value);
}

/**
 * Looks a cleaned description up in the alias table.
 *
 * Exact matches win; otherwise the longest alias that prefixes the
 * description is used, so "BASH CO-OP MARKET ST" still resolves to the
 * "BASH CO-OP" merchant.
 */
function lookupAlias(value: string): string | null {
  const upper = value.toUpperCase();
  const exact = MERCHANT_ALIASES.get(upper);
  if (exact) return exact;

  for (const key of ALIAS_KEYS_BY_LENGTH) {
    if (!upper.startsWith(key)) continue;
    const next = upper.charAt(key.length);
    if (next !== '' && /[A-Z0-9]/.test(next)) continue;
    return MERCHANT_ALIASES.get(key) ?? null;
  }
  return null;
}

/**
 * Returns the lookup key for a merchant name: lowercase, punctuation-free.
 *
 * Two descriptions that normalize to the same merchant share this key, which
 * is what links them together in the database.
 *
 * @example
 * merchantKey('Blue Bottle Coffee'); // "blue bottle coffee"
 */
export function merchantKey(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Capitalizes words for display, keeping conventional all-caps names intact.
 */
function toDisplayCase(value: string): string {
  return value
    .split(' ')
    .map((word, index) => {
      if (word.length === 0) return word;
      const upper = word.toUpperCase();
      if (UPPERCASE_NAMES.has(upper)) return upper;
      if (/\d/.test(word)) {
        // Keep digits and punctuation, e.g. "7-ELEVEN" -> "7-Eleven".
        return word.replace(
          /[a-z]+/gi,
          (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
        );
      }
      if (word.includes('-')) {
        // Hyphenated names keep their casing per part: "T-MOBILE" -> "T-Mobile".
        return word
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join('-');
      }
      const lower = word.toLowerCase();
      if (index > 0 && MINOR_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
