/**
 * Chain claim denylist.
 *
 * Hyperlocal apps like Downtown Vibes only work as a trusted neighborhood
 * map if the businesses on it are actually owned by the people claiming
 * them. Letting a random user claim "Taco Bell" creates three problems:
 *
 *   1. **Trademark exposure.** Without a verification step, the platform
 *      (Potions and Familiars LLC) is the party that enabled the
 *      impersonation. Section 230 doesn't shield structural platform
 *      choices, only individual user speech.
 *   2. **Consumer fraud risk.** A claimant could post fake flash sales
 *      under a chain's name to drive traffic to a competitor or simply
 *      to deceive customers.
 *   3. **Franchise vs. corporate disputes.** Even legitimate franchisees
 *      shouldn't be claiming the chain name itself — they have an
 *      official corporate listing somewhere else, and we'd be on the
 *      hook for adjudicating who's "the real one."
 *
 * v1 policy: chains are not claimable in the app at all. Independent
 * franchisees who want to be on Downtown Vibes can contact support and
 * be onboarded with a name that clearly disambiguates them (e.g.
 * "Joe's Subway #4821 — St. Joseph, MO" via manual review). v2 will
 * introduce a verification flow (postcard or domain-email) for the
 * independent local businesses that are the platform's primary audience.
 *
 * Defense-in-depth: this list is enforced client-side (friendly UX) AND
 * via a database trigger on the `businesses` table (authoritative). A
 * user with a hacked client cannot bypass the DB check.
 */

/** Cyrillic + Greek homoglyph fold. Mirrors the server-side
 *  `normalize_business_name` fold so client and DB agree on which characters
 *  collapse to which Latin letters. Keep these two tables in lock-step; if
 *  you add a pair here, add it server-side in the same migration. */
const HOMOGLYPH_FROM = 'аеіорсхутмкнвАЕІОРСХУТМКНВαορεικντμΑΟΡΕΙΚΝΤΜΗΒ';
const HOMOGLYPH_TO   = 'aeiopcxytmknbAEIOPCXYTMKHBaoreikntmAOREIKNTMHB';
const HOMOGLYPH_MAP: Record<string, string> = {};
for (let i = 0; i < HOMOGLYPH_FROM.length; i++) {
  HOMOGLYPH_MAP[HOMOGLYPH_FROM[i]] = HOMOGLYPH_TO[i];
}

/** Normalize a name for comparison: lowercase, Unicode-fold, strip
 *  punctuation/diacritics, collapse internal whitespace, trim. Returns an
 *  array of word tokens.
 *
 *  Matches the server-side `normalize_business_name` pipeline:
 *    NFKC → NFKD → strip combining marks → homoglyph fold → lower →
 *    strip non-alphanumeric → collapse whitespace → trim.
 *
 *  The NFKC pass collapses fullwidth / compatibility forms (ＴACO → TACO)
 *  before the fold; the NFKD pass separates out combining marks so they
 *  can be dropped; the homoglyph step catches look-alikes that Unicode
 *  considers distinct code points (Cyrillic 'е' vs Latin 'e'). */
export function normalizeChainName(raw: string): string[] {
  // Compatibility-decompose first to collapse fullwidth and ligature forms,
  // then canonically decompose so combining marks are separate.
  let s = raw.normalize('NFKC').normalize('NFKD');
  // Drop combining marks (accents).
  s = s.replace(/[\u0300-\u036f]/g, '');
  // Homoglyph fold — walk the string and translate Cyrillic/Greek look-alikes
  // to their Latin counterparts. Apply before lowercase so the uppercase
  // pairs in the table still match.
  let folded = '';
  for (const ch of s) {
    folded += HOMOGLYPH_MAP[ch] ?? ch;
  }
  return folded
    .toLowerCase()
    // Replace any non-alphanumeric character with a space. Apostrophes,
    // hyphens, ampersands, periods all become separators.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** National chains that should not be claimable in v1. Add to this list
 *  freely — false positives ("we blocked a real local business") are
 *  worse than false negatives ("we missed a chain"), so favor precision
 *  over recall and rely on manual support escalation for edge cases. */
const BLOCKED_CHAINS: ReadonlyArray<string> = [
  // Fast food
  "McDonald's",
  'McDonalds',
  'Mc Donalds',
  'Burger King',
  "Wendy's",
  'Taco Bell',
  'Subway',
  'Chick-fil-A',
  'Chipotle',
  'KFC',
  'Kentucky Fried Chicken',
  'Popeyes',
  "Arby's",
  'Sonic',
  'Sonic Drive-In',
  'Jack in the Box',
  'Whataburger',
  'Five Guys',
  'Shake Shack',
  'Panda Express',
  "Domino's",
  'Dominos',
  'Dominos Pizza',
  'Pizza Hut',
  "Papa John's",
  'Papa Johns',
  'Little Caesars',
  "Hardee's",
  "Carl's Jr",
  "Culver's",
  "Dairy Queen",
  "In-N-Out Burger",
  "Raising Cane's",
  "Zaxby's",
  "Bojangles",
  "Jersey Mike's",
  "Jimmy John's",
  "Firehouse Subs",
  "Quiznos",
  "Auntie Anne's",
  "Cinnabon",
  "Wingstop",
  "Buffalo Wild Wings",
  "Steak 'n Shake",

  // Coffee / donuts
  'Starbucks',
  "Dunkin'",
  'Dunkin Donuts',
  'Tim Hortons',
  'Caribou Coffee',
  "Peet's Coffee",
  'Krispy Kreme',
  'Scooters Coffee',
  "Scooter's Coffee",
  'Dutch Bros',
  'Dutch Bros Coffee',

  // Sit-down chains
  "Applebee's",
  'Olive Garden',
  'Red Lobster',
  'Outback Steakhouse',
  'TGI Fridays',
  "Ruby Tuesday",
  "Chili's",
  'IHOP',
  "Denny's",
  'Cracker Barrel',
  'The Cheesecake Factory',
  'Cheesecake Factory',
  'Texas Roadhouse',
  'LongHorn Steakhouse',
  'Hooters',
  'Red Robin',
  "Bob Evans",
  'Perkins',
  "Carrabba's Italian Grill",
  "Maggiano's",
  "PF Chang's",
  "P.F. Chang's",
  "BJ's Restaurant",
  'Twin Peaks',

  // Big-box retail
  'Walmart',
  'Walmart Supercenter',
  'Target',
  'Costco',
  "Sam's Club",
  'Best Buy',
  'Home Depot',
  'The Home Depot',
  "Lowe's",
  "Kohl's",
  "Macy's",
  'JCPenney',
  'Nordstrom',
  'Nordstrom Rack',
  'TJ Maxx',
  'TJMaxx',
  'Marshalls',
  'Ross',
  'Ross Dress for Less',
  'Old Navy',
  'Gap',
  'Banana Republic',
  'Foot Locker',
  'GameStop',
  'Barnes & Noble',
  "Dick's Sporting Goods",
  "Bed Bath & Beyond",
  'Big Lots',
  'Dollar General',
  'Dollar Tree',
  'Family Dollar',
  'Five Below',
  'Hobby Lobby',
  'Michaels',
  'Joann',
  'Joann Fabrics',
  'Office Depot',
  'Staples',
  'PetSmart',
  'Petco',
  'Tractor Supply',
  'Tractor Supply Co',

  // Grocery
  'Kroger',
  'Publix',
  'Safeway',
  'Albertsons',
  'Whole Foods',
  'Whole Foods Market',
  "Trader Joe's",
  'Aldi',
  'Lidl',
  'HEB',
  'H-E-B',
  'Hy-Vee',
  'Meijer',
  'Wegmans',
  'Sprouts',
  'Sprouts Farmers Market',
  "Winn-Dixie",
  'Food Lion',
  "Schnucks",
  "Price Chopper",

  // Pharmacy
  'CVS',
  'CVS Pharmacy',
  'Walgreens',
  'Rite Aid',

  // Gas / convenience
  'Shell',
  'Chevron',
  'Exxon',
  'ExxonMobil',
  'Mobil',
  'BP',
  'Texaco',
  'Marathon',
  'Valero',
  'Sunoco',
  'Speedway',
  "Casey's",
  "Casey's General Store",
  'Wawa',
  'Sheetz',
  '7-Eleven',
  '7 Eleven',
  '7 11',
  'Seven Eleven',
  'Circle K',
  'QuikTrip',
  'RaceTrac',
  'Kum & Go',
  'Maverik',
  'Phillips 66',
  'Conoco',
  'Citgo',
  'Pilot',
  "Love's",
  "Love's Travel Stops",
  'Loaf N Jug',

  // Hotels
  'Marriott',
  'Hilton',
  'Hyatt',
  'Holiday Inn',
  'Holiday Inn Express',
  'Best Western',
  'Comfort Inn',
  'Comfort Suites',
  'Hampton Inn',
  'Quality Inn',
  'Days Inn',
  'Super 8',
  'Motel 6',
  'Red Roof Inn',
  'La Quinta',
  'Courtyard by Marriott',
  'Residence Inn',
  'Embassy Suites',
  'Fairfield Inn',
  'SpringHill Suites',
  'TownePlace Suites',
  'Drury Inn',
  'Drury Hotels',
  'Candlewood Suites',
  'Sheraton',
  'Westin',
  'Doubletree',
  'Crowne Plaza',
  'Wyndham',
  'Ramada',

  // Banks / financial
  'Bank of America',
  'Chase',
  'Chase Bank',
  'Wells Fargo',
  'Citibank',
  'US Bank',
  'U.S. Bank',
  'PNC',
  'PNC Bank',
  'Capital One',
  'TD Bank',
  'Truist',
  'Regions Bank',
  'Fifth Third Bank',
  "Commerce Bank",
  "Nodaway Valley Bank",
  'H&R Block',
  'Jackson Hewitt',
  'Liberty Tax',
  'Edward Jones',

  // Auto
  'AutoZone',
  "O'Reilly Auto Parts",
  'NAPA Auto Parts',
  'Advance Auto Parts',
  'Pep Boys',
  'Jiffy Lube',
  'Valvoline',
  'Valvoline Instant Oil Change',
  'Midas',
  'Firestone',
  'Firestone Complete Auto Care',
  'Goodyear',
  'Discount Tire',
  'Big O Tires',
  'Mavis Tire',
  'Meineke',

  // Telecom / electronics
  'Verizon',
  'AT&T',
  'T-Mobile',
  'Sprint',
  'Xfinity',
  'Spectrum',
  'Apple Store',

  // Shipping / postal / printing
  'FedEx',
  'FedEx Office',
  'UPS Store',
  'The UPS Store',
  'USPS',
  'United States Postal Service',

  // Fitness
  'Planet Fitness',
  'Anytime Fitness',
  'LA Fitness',
  "Gold's Gym",
  'Orangetheory',
  'Orangetheory Fitness',
  'CrossFit',
  'YMCA',
];

// Pre-tokenize once at module load.
const BLOCKED_CHAIN_TOKENS: ReadonlyArray<string[]> = BLOCKED_CHAINS.map(
  normalizeChainName
).filter((toks) => toks.length > 0);

/** Tokens that indicate a chain qualifier when they immediately follow a
 *  single-word chain name. Lets us catch "Walmart Store #1234" or
 *  "Target Pharmacy" without also flagging "Walmart Avenue Cafe". */
const CHAIN_QUALIFIERS: ReadonlySet<string> = new Set([
  'store',
  'stores',
  'pharmacy',
  'restaurant',
  'location',
  'cafe',
  'coffee',
  'express',
  'supercenter',
  'market',
  'inc',
  'corp',
  'corporation',
  'company',
  'co',
  'llc',
  'no',
  'number',
]);

/** Returns the matching chain (in display form) if `rawName` looks like a
 *  national chain claim.
 *
 *  Match rules, in order:
 *    1. Multi-token chain (e.g. "Taco Bell"): match if the normalized
 *       business name starts with the chain's tokens as a contiguous
 *       prefix. The two-word combo is specific enough that incidental
 *       prefix overlap is rare.
 *    2. Single-token chain (e.g. "Walmart", "Target"): match only if
 *       the business name is EXACTLY the chain token, OR the next
 *       token is a digit/numeric, a "#"-style franchise marker (which
 *       normalizes to a digit), or a known chain qualifier ("store",
 *       "pharmacy", "supercenter"). This avoids blocking
 *       "Walmart Avenue Cafe" (a hypothetical local business on
 *       Walmart Avenue) while still catching "Walmart 1234" and
 *       "Walmart Pharmacy".
 *
 *  Known accepted false-positive case: a real local business whose name
 *  EXACTLY matches a chain ("Subway" sandwich shop named just "Subway"
 *  with no qualifier). Backstop: support contact in the user-facing
 *  Alert lets the owner request a manual override.
 */
export function matchBlockedChain(rawName: string): string | null {
  const bizTokens = normalizeChainName(rawName);
  if (bizTokens.length === 0) return null;

  for (let i = 0; i < BLOCKED_CHAIN_TOKENS.length; i++) {
    const chainToks = BLOCKED_CHAIN_TOKENS[i];
    if (chainToks.length === 0 || chainToks.length > bizTokens.length) continue;

    // Prefix-match the chain tokens against the start of the biz name.
    let isPrefix = true;
    for (let j = 0; j < chainToks.length; j++) {
      if (bizTokens[j] !== chainToks[j]) {
        isPrefix = false;
        break;
      }
    }
    if (!isPrefix) continue;

    if (chainToks.length >= 2) {
      // Multi-token chain — prefix match is sufficient.
      return BLOCKED_CHAINS[i];
    }

    // Single-token chain — require exact match OR a chain-qualifier follow-up.
    if (bizTokens.length === chainToks.length) {
      return BLOCKED_CHAINS[i];
    }
    const nextToken = bizTokens[chainToks.length];
    if (/^\d/.test(nextToken) || CHAIN_QUALIFIERS.has(nextToken)) {
      return BLOCKED_CHAINS[i];
    }
    // Otherwise fall through — single token chain followed by a non-qualifier
    // word is treated as a coincidence (e.g. "Walmart Avenue Cafe").
  }
  return null;
}

/** Convenience boolean wrapper. */
export function isBlockedChainName(rawName: string): boolean {
  return matchBlockedChain(rawName) !== null;
}
