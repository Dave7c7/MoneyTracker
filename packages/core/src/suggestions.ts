/**
 * Keyword suggestions.
 *
 * Many merchants say what they are in their name: "UBER *TRIP", "MTA*NYCT
 * PAYGO", "JOES DELI". A fixed, readable table of keywords turns those into a
 * suggested category, so the review inbox opens with a sensible guess instead
 * of "Uncategorized".
 *
 * A suggestion is only a guess. It runs after user rules, merchant memory,
 * transfer detection and the bank category, and its confidence stays below
 * the review threshold: it fills in the category, and the user still confirms
 * it with one tap.
 *
 * Matching is deterministic: every keyword that appears as a whole word is a
 * candidate, and the longest one wins ("UBER EATS" beats "UBER"). Ties keep
 * the order of the table.
 */

/** One keyword group: the words that point at a default category. */
export interface KeywordGroup {
  /** Slug of the default category the keywords point at. */
  categorySlug: string;
  /** Uppercase keywords, matched as whole words. */
  keywords: readonly string[];
}

/**
 * The keyword table, grouped by category.
 *
 * Keep keywords specific: a word that also means something else (such as
 * "BAR" or "MARKET") does more harm than good, because a wrong guess costs the
 * user a correction instead of a confirmation.
 */
export const KEYWORD_GROUPS: readonly KeywordGroup[] = [
  {
    categorySlug: 'transit',
    keywords: [
      'UBER',
      'UBER TRIP',
      'LYFT',
      'MTA',
      'NYCT',
      'OMNY',
      'METROCARD',
      'LIRR',
      'METRO-NORTH',
      'METRO NORTH',
      'NJ TRANSIT',
      'NJT',
      'PATH',
      'BART',
      'CLIPPER',
      'SEPTA',
      'WMATA',
      'MBTA',
      'CTA',
      'CITI BIKE',
      'CITIBIKE',
      'REVEL',
      'CURB',
      'TAXI',
      'YELLOW CAB',
      'NYC FERRY',
      'E-ZPASS',
      'EZPASS',
      'PARKING',
      'PARKMOBILE',
      'SPOTHERO',
    ],
  },
  {
    categorySlug: 'gas',
    keywords: [
      'SHELL',
      'EXXON',
      'EXXONMOBIL',
      'MOBIL',
      'CHEVRON',
      'SUNOCO',
      'CITGO',
      'SPEEDWAY',
      'MARATHON PETRO',
      'VALERO',
      'BP',
      'GULF OIL',
      'GAS STATION',
    ],
  },
  {
    categorySlug: 'restaurants',
    keywords: [
      'DELI',
      'DELI & GROCERY',
      'DELI GROCERY',
      'BODEGA',
      'PIZZA',
      'PIZZERIA',
      'DINER',
      'RESTAURANT',
      'GRILL',
      'BURGER',
      'BURGER KING',
      'SUSHI',
      'RAMEN',
      'TAQUERIA',
      'TACO',
      'HALAL',
      'BAGEL',
      'BAGELS',
      'KITCHEN',
      'BISTRO',
      'TRATTORIA',
      'STEAKHOUSE',
      'CHIPOTLE',
      'MCDONALDS',
      "MCDONALD'S",
      'WENDYS',
      'SHAKE SHACK',
      'SWEETGREEN',
      'CAVA',
      'CHICK-FIL-A',
      'POPEYES',
      'SUBWAY',
      'FIVE GUYS',
      'PANERA',
      'PRET A MANGER',
      'DOORDASH',
      'UBER EATS',
      'GRUBHUB',
      'SEAMLESS',
      'POSTMATES',
      'CAVIAR',
    ],
  },
  {
    categorySlug: 'coffee',
    keywords: [
      'STARBUCKS',
      'DUNKIN',
      'COFFEE',
      'CAFE',
      'ESPRESSO',
      'BLUE BOTTLE',
      'PEETS',
      'JOE COFFEE',
      'BLANK STREET',
    ],
  },
  {
    categorySlug: 'groceries',
    keywords: [
      'GROCERY',
      'GROCERIES',
      'SUPERMARKET',
      'WHOLE FOODS',
      'TRADER JOE',
      'TRADER JOES',
      'KROGER',
      'SAFEWAY',
      'ALDI',
      'PUBLIX',
      'WEGMANS',
      'SHOPRITE',
      'STOP & SHOP',
      'KEY FOOD',
      'C-TOWN',
      'CTOWN',
      'FOOD BAZAAR',
      'FAIRWAY',
      'MORTON WILLIAMS',
      'GRISTEDES',
      'H MART',
      'FRESHDIRECT',
      'INSTACART',
    ],
  },
  {
    categorySlug: 'subscriptions',
    keywords: [
      'NETFLIX',
      'SPOTIFY',
      'HULU',
      'DISNEY PLUS',
      'DISNEYPLUS',
      'HBO MAX',
      'PARAMOUNT',
      'PEACOCK',
      'YOUTUBE PREMIUM',
      'APPLE.COM/BILL',
      'AUDIBLE',
      'PATREON',
    ],
  },
  {
    categorySlug: 'movies',
    keywords: ['AMC', 'REGAL', 'CINEMA', 'TICKETMASTER', 'FANDANGO', 'STUBHUB', 'SEATGEEK'],
  },
  {
    categorySlug: 'phone',
    keywords: ['VERIZON', 'T-MOBILE', 'TMOBILE', 'AT&T', 'MINT MOBILE', 'VISIBLE'],
  },
  {
    categorySlug: 'internet',
    keywords: ['COMCAST', 'XFINITY', 'SPECTRUM', 'OPTIMUM', 'FIOS', 'ASTOUND'],
  },
  {
    categorySlug: 'utilities',
    keywords: ['CON ED', 'CONED', 'CONSOLIDATED EDISON', 'NATIONAL GRID', 'PSEG', 'PG&E'],
  },
  {
    categorySlug: 'health',
    keywords: [
      'CVS',
      'WALGREENS',
      'DUANE READE',
      'RITE AID',
      'PHARMACY',
      'DENTAL',
      'DENTIST',
      'MEDICAL',
      'URGENT CARE',
      'CITYMD',
      'HOSPITAL',
      'OPTOMETRY',
    ],
  },
  {
    categorySlug: 'shopping',
    keywords: [
      'AMAZON',
      'AMZN',
      'TARGET',
      'WALMART',
      'COSTCO',
      'BEST BUY',
      'HOME DEPOT',
      'IKEA',
      'ETSY',
      'EBAY',
      'UNIQLO',
      'ZARA',
      'MACYS',
    ],
  },
  {
    categorySlug: 'personal-care',
    keywords: ['BARBER', 'BARBERSHOP', 'SALON', 'NAIL', 'NAILS', 'SPA', 'SEPHORA', 'ULTA'],
  },
  {
    categorySlug: 'travel',
    keywords: [
      'AIRLINES',
      'AIRWAYS',
      'DELTA AIR',
      'JETBLUE',
      'UNITED AIR',
      'AMERICAN AIR',
      'SOUTHWEST AIR',
      'AMTRAK',
      'AIRBNB',
      'HOTEL',
      'MARRIOTT',
      'HILTON',
      'HYATT',
      'EXPEDIA',
      'BOOKING.COM',
    ],
  },
  {
    categorySlug: 'education',
    keywords: ['COURSERA', 'UDEMY', 'TUITION', 'BOOKSTORE'],
  },
];

/** A keyword match: which word was found and where it points. */
export interface KeywordMatch {
  categorySlug: string;
  /** The keyword as it appears in the table, e.g. "UBER". */
  keyword: string;
}

interface CompiledKeyword {
  keyword: string;
  categorySlug: string;
  pattern: RegExp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles keywords into whole-word patterns, longest first.
 *
 * "Whole word" means no letter or digit right before or after, so "MTA"
 * matches "MTA*NYCT" but not "MONTANA", and "PATH" does not match "PATHMARK".
 */
function compile(groups: readonly KeywordGroup[]): CompiledKeyword[] {
  const compiled: CompiledKeyword[] = [];
  for (const group of groups) {
    for (const keyword of group.keywords) {
      compiled.push({
        keyword,
        categorySlug: group.categorySlug,
        pattern: new RegExp(`(?<![A-Z0-9])${escapeRegExp(keyword)}(?![A-Z0-9])`),
      });
    }
  }
  // Stable sort: equal lengths keep the table order.
  return compiled.sort((a, b) => b.keyword.length - a.keyword.length);
}

const DEFAULT_COMPILED = compile(KEYWORD_GROUPS);

/**
 * Finds the keyword that best describes a transaction.
 *
 * Looks at the raw description and, when there is one, the normalized
 * merchant name. Returns null when no keyword matches.
 *
 * @example
 * suggestFromKeywords('UBER *TRIP HELP.UBER.COM'); // { categorySlug: 'transit', keyword: 'UBER' }
 * suggestFromKeywords('UBER EATS PENDING'); // { categorySlug: 'restaurants', keyword: 'UBER EATS' }
 * suggestFromKeywords('ACME LLC'); // null
 */
export function suggestFromKeywords(
  descriptionRaw: string,
  merchantName?: string | null,
  groups?: readonly KeywordGroup[],
): KeywordMatch | null {
  const compiled = groups ? compile(groups) : DEFAULT_COMPILED;
  const haystacks = [descriptionRaw, merchantName ?? '']
    .map((text) => text.toUpperCase().replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);

  for (const candidate of compiled) {
    if (haystacks.some((text) => candidate.pattern.test(text))) {
      return { categorySlug: candidate.categorySlug, keyword: candidate.keyword };
    }
  }
  return null;
}
