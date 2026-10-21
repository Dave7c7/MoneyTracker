/**
 * Messy merchant names, exactly as banks emit them.
 *
 * Every template is a raw description with the noise a real statement
 * contains: processor prefixes, store numbers, city and state, phone numbers
 * and authorization codes.
 */

export interface MerchantTemplate {
  /** The raw bank description. */
  readonly description: string;
  /** The bank-provided category, if any. */
  readonly sourceCategory?: string;
  /** Rough price band in minor units: [min, max]. */
  readonly amount: readonly [number, number];
  /** How often this merchant shows up per month. */
  readonly perMonth: readonly [number, number];
}

/** Groceries. */
export const GROCERIES: readonly MerchantTemplate[] = [
  {
    description: 'WHOLE FOODS MKT #10247 BRISBANE CA 94003',
    sourceCategory: 'GROCERY',
    amount: [4200, 16800],
    perMonth: [2, 4],
  },
  {
    description: 'SAFEWAY #1428',
    sourceCategory: 'GROCERY',
    amount: [2800, 11400],
    perMonth: [1, 3],
  },
  {
    description: 'SQ *TRADER JOES SF #455',
    sourceCategory: 'GROCERY',
    amount: [3100, 9200],
    perMonth: [1, 2],
  },
  {
    description: 'KROGER 1450 SPRINGFIELD OH',
    sourceCategory: 'GROCERY',
    amount: [2400, 9800],
    perMonth: [0, 2],
  },
];

/** Coffee shops. Small amounts, many of them. */
export const COFFEE: readonly MerchantTemplate[] = [
  {
    description: 'SQ *BLUE BOTTLE COFFEE #12',
    sourceCategory: 'COFFEE',
    amount: [375, 750],
    perMonth: [3, 7],
  },
  {
    description: 'STARBUCKS #12345 SEATTLE WA 98101',
    sourceCategory: 'COFFEE',
    amount: [425, 725],
    perMonth: [2, 5],
  },
  {
    description: 'TST*BLUE BOTTLE COFFEE 425 MARKET ST SAN FRANCISCO CA',
    sourceCategory: 'COFFEE',
    amount: [500, 900],
    perMonth: [1, 3],
  },
];

/** Restaurants. */
export const RESTAURANTS: readonly MerchantTemplate[] = [
  {
    description: 'TST*DOORDASH - 45TH ST',
    sourceCategory: 'RESTAURANT',
    amount: [1850, 9400],
    perMonth: [1, 3],
  },
  {
    description: 'SQ *PRET A MANGER 021',
    sourceCategory: 'RESTAURANT',
    amount: [950, 2200],
    perMonth: [1, 2],
  },
  {
    description: 'MARRIOTT HOTELS SAN JOSE CA',
    sourceCategory: 'RESTAURANT',
    amount: [12000, 32000],
    perMonth: [0, 1],
  },
];

/** Gas stations. */
export const GAS: readonly MerchantTemplate[] = [
  {
    description: 'SHELL OIL 574',
    sourceCategory: 'GAS',
    amount: [3800, 7600],
    perMonth: [1, 3],
  },
  {
    description: 'CHEVRON 0021 CARSON CA 90745',
    sourceCategory: 'GAS',
    amount: [4100, 8200],
    perMonth: [0, 2],
  },
  {
    description: 'EXXONMOBIL 2320198440827',
    sourceCategory: 'GAS',
    amount: [4500, 8900],
    perMonth: [0, 1],
  },
];

/** Everything else the user buys. */
export const SHOPPING: readonly MerchantTemplate[] = [
  {
    description: 'AMZN Mktp US*RJ32KM0X1',
    sourceCategory: 'SHOPPING',
    amount: [1800, 14500],
    perMonth: [1, 3],
  },
  {
    description: 'TARGET 2845 ROSEVILLE CA 95677',
    sourceCategory: 'SHOPPING',
    amount: [2200, 11800],
    perMonth: [0, 2],
  },
  {
    description: 'TST*BURGER KING',
    sourceCategory: 'RESTAURANT',
    amount: [1200, 3400],
    perMonth: [0, 1],
  },
];

/** Recurring subscriptions. The amount changes when a price goes up. */
export interface SubscriptionTemplate extends MerchantTemplate {
  /** Day of the month the charge lands on. */
  readonly dayOfMonth: number;
  /** Amount before the price increase. */
  readonly baseAmount: number;
  /** Amount after the price increase. */
  readonly increasedAmount?: number;
  /** Month index (0 = oldest) from which the higher price applies. */
  readonly priceIncreaseFromMonth?: number;
}

export const SUBSCRIPTIONS: readonly SubscriptionTemplate[] = [
  {
    description: 'NETFLIX.COM 800-585-0494',
    sourceCategory: 'ENTERTAINMENT',
    amount: [1549, 1549],
    perMonth: [1, 1],
    dayOfMonth: 6,
    baseAmount: 1549,
    increasedAmount: 1799,
    priceIncreaseFromMonth: 8,
  },
  {
    description: 'SPOTIFY USA NEW YORK NY',
    sourceCategory: 'ENTERTAINMENT',
    amount: [1199, 1199],
    perMonth: [1, 1],
    dayOfMonth: 9,
    baseAmount: 1199,
  },
  {
    description: 'PAYPAL *YOUTUBE PREMIUM',
    sourceCategory: 'ENTERTAINMENT',
    amount: [1399, 1399],
    perMonth: [1, 1],
    dayOfMonth: 14,
    baseAmount: 1399,
  },
  {
    description: 'APPLE.COM/BILL',
    sourceCategory: 'ENTERTAINMENT',
    amount: [299, 299],
    perMonth: [1, 1],
    dayOfMonth: 21,
    baseAmount: 299,
  },
];

/** Bills that land on a fixed day each month. */
export interface BillTemplate extends MerchantTemplate {
  readonly dayOfMonth: number;
}

export const BILLS: readonly BillTemplate[] = [
  {
    description: 'OAKWOOD PROPERTY MANAGEMENT RENT',
    sourceCategory: 'RENT',
    amount: [225000, 225000],
    perMonth: [1, 1],
    dayOfMonth: 3,
  },
  {
    description: 'PG&E ELECTRIC BILL PAYMENT',
    sourceCategory: 'ELECTRICITY',
    amount: [6800, 16400],
    perMonth: [1, 1],
    dayOfMonth: 8,
  },
  {
    description: 'COMCAST INTERNET',
    sourceCategory: 'INTERNET',
    amount: [6999, 6999],
    perMonth: [1, 1],
    dayOfMonth: 12,
  },
  {
    description: 'T-MOBILE AUTOPAY 855-555-0123',
    sourceCategory: 'MOBILE PHONE',
    amount: [4500, 4500],
    perMonth: [1, 1],
    dayOfMonth: 15,
  },
  {
    description: 'IRON PEAK GYM MEMBERSHIP',
    sourceCategory: 'HEALTH',
    amount: [4900, 4900],
    perMonth: [1, 1],
    dayOfMonth: 5,
  },
];

/** Charges with no bank category, so they land in the review inbox. */
export const UNCATEGORIZED: readonly MerchantTemplate[] = [
  {
    description: 'SQ *LOCAL VENDOR 4242',
    amount: [1200, 6800],
    perMonth: [0, 1],
  },
  {
    description: 'VENMO PAYMENT 1234 TO JOHN D',
    amount: [1500, 9500],
    perMonth: [0, 1],
  },
];
