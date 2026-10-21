import { describe, expect, it } from 'vitest';

import { merchantKey, normalizeMerchant } from '../src/merchant.ts';

describe('normalizeMerchant', () => {
  // Real-looking messy bank descriptions. The expected merchant is what a
  // human would call the shop.
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['SQ *BLUE BOTTLE COFFEE #12', 'Blue Bottle Coffee'],
    ['SQ *BLUE BOTTLE COFFEE 425 MARKET ST SAN FRANCISCO CA', 'Blue Bottle Coffee'],
    ['TST*DOORDASH', 'DoorDash'],
    ['TST*DOORDASH - 45TH ST', 'DoorDash'],
    ['PAYPAL *AMAZON.COM', 'Amazon'],
    ['AMZN Mktp US*RJ32KM0X1', 'Amazon'],
    ['AMAZON MKT US*2K4L9', 'Amazon'],
    ['WHOLE FOODS MKT #10247 BRISBANE CA 94003', 'Whole Foods Market'],
    ['WHOLE FOODS MKT 10247 BRISBANE CA 94003', 'Whole Foods Market'],
    ['STARBUCKS #12345 SEATTLE WA 98101', 'Starbucks'],
    ['STARBUCKS 123 MARKET ST SAN FRANCISCO CA 94105', 'Starbucks'],
    ['CVS PHARMACY #10482 SAN JOSE CA 95126', 'CVS Pharmacy'],
    ['WALGREENS STORE 2210 AUSTIN TX 78701', 'Walgreens'],
    ['SHELL OIL 574', 'Shell'],
    ['EXXONMOBIL 2320198440827', 'ExxonMobil'],
    ['CHEVRON 0021 CARSON CA 90745', 'Chevron'],
    ['COMCAST CABLE COMM 800-COMCAST', 'Comcast'],
    ['NETFLIX.COM 800-585-0494', 'Netflix'],
    ['SPOTIFY USA NEW YORK NY', 'Spotify'],
    ['UBER TRIP HELP.UBER.COM SAN FRANCISCO CA', 'Uber'],
    ['UBER EATS 8/12/2026 500 GRANT AVE', 'Uber Eats'],
    ['LYFT RIDE 8/12 SAN FRANCISCO CA', 'Lyft'],
    ['DELTA AIR 0062345 ATL', 'Delta Air Lines'],
    ['THE HOME DEPOT #6612 SAN DIEGO CA 92101', 'Home Depot'],
    ['VENMO PAYMENT 1234 TO JOHN D', 'Venmo'],
    ['CASH APP PAYMENT TO JANE DOE', 'Cash App'],
    ['ZELLE PAYMENT TO JANE DOE', 'Zelle'],
    ['MARRIOTT HOTELS SAN JOSE CA', 'Marriott'],
    ['APPLE.COM/BILL', 'Apple'],
    ['PACIFIC GAS & ELECTRIC', 'PG&E'],
    ['GOOGLE *STORAGE', 'Google'],
    ['INTUIT*TurboTax', 'TurboTax'],
    ['TST*BURGER KING', 'Burger King'],
    ['SQ *TRADER JOES SF #455', 'Trader Joes'],
    ['SAFEWAY #1428', 'Safeway'],
    ['DOORDASH*PIZZA HUT 4155550199', 'DoorDash'],
    ['BASH CO-OP MARKET ST 254', 'Bash Co-op'],
    ['COSTCO WHSE #1089', 'Costco'],
    ['PRET A MANGER 021', 'Pret A Manger'],
    ['ATM WITHDRAWAL 123 MAIN ST', 'ATM Withdrawal'],
    ['T-MOBILE 855-555-0123', 'T-Mobile'],
    ['7-ELEVEN #1234', '7-Eleven'],
  ];

  it.each(cases)('normalizes %s', (input, expected) => {
    expect(normalizeMerchant(input)).toBe(expected);
  });

  it('collapses different descriptions of the same merchant to one key', () => {
    const variants = [
      'SQ *BLUE BOTTLE COFFEE #12',
      'BLUE BOTTLE COFFEE 425 MARKET ST SAN FRANCISCO CA',
      'SQ *BLUE BOTTLE COFFEE',
    ];
    const keys = new Set(variants.map((variant) => merchantKey(normalizeMerchant(variant))));
    expect(keys.size).toBe(1);
  });

  it('never returns an empty merchant name', () => {
    expect(normalizeMerchant('   ')).toBe('Unknown Merchant');
    expect(normalizeMerchant('#1234')).toBe('Unknown Merchant');
  });

  it('keeps the raw description untouched elsewhere', () => {
    // normalizeMerchant is pure: it never mutates its input.
    const raw = 'SQ *BLUE BOTTLE COFFEE #12';
    normalizeMerchant(raw);
    expect(raw).toBe('SQ *BLUE BOTTLE COFFEE #12');
  });
});

describe('merchantKey', () => {
  it('lowercases and strips punctuation', () => {
    expect(merchantKey('Blue Bottle Coffee')).toBe('blue bottle coffee');
    expect(merchantKey('PG&E')).toBe('pg and e');
    expect(merchantKey('Bash Co-op')).toBe('bash co op');
  });
});
