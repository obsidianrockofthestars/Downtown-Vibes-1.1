/**
 * Tests for the client-side profanity / slur filter.
 *
 * The matcher has subtle rules — exact-token match (so "Peacock Cafe" stays
 * legal), Unicode/homoglyph fold to match the server normalizer, innuendo
 * carve-outs ("Dick's BBQ", "Horny Toad", "Cock & Bull"), and generic error
 * copy (no word echo). Cover:
 *
 *   - Positive matches: one per category (profanity / slur / sexual / violence)
 *     plus at least one slur flagged in the Apple 1.2 context.
 *   - Scunthorpe negatives: real business names that contain blocked tokens
 *     as substrings of legitimate words (Peacock / Associates / Butt Drugs /
 *     Bass / Lasses).
 *   - Innuendo negatives: real business names that were DELIBERATELY excluded
 *     from the wordlist during the 2026-04-22 innuendo-safety review
 *     (Whistles Weiners / Hooters / Big Johnson's / Dick's BBQ / Horny Toad /
 *     Cock & Bull).
 *   - Unicode / homoglyph bypass attempts: fullwidth 'Ｆuck', Cyrillic 'fuсk',
 *     accented 'fück'. These should match the same way the server's
 *     `normalize_business_name` folds them.
 *   - Wordlist size sanity: assert BLOCKED_WORDS has exactly 102 entries,
 *     matching the seed count in migration 20260422130000.
 *
 * Keep this file and the server-side migration in sync: every test here
 * should also be a valid case for the DB trigger.
 */

import {
  matchBlockedWord,
  containsBlockedWord,
  __BLOCKED_WORDS_FOR_TESTS,
} from './profanityFilter';

describe('profanityFilter — positive matches (one per category)', () => {
  test.each([
    ['Fuck My Ass', 'profanity'],
    ['Shitty Diner', 'profanity'],
    ['Pussy Palace', 'profanity'],
    ['Faggot Corner', 'slur'],
    ['Retard Records', 'slur'],
    ['The Anal Lounge', 'sexual'],
    ['Porn Emporium', 'sexual'],
    ['Rape Revenge Tavern', 'violence'],
  ])('matches: %s (expected category %s)', (name, category) => {
    const hit = matchBlockedWord(name);
    expect(hit).not.toBeNull();
    expect(hit?.category).toBe(category);
    expect(containsBlockedWord(name)).toBe(true);
  });
});

describe('profanityFilter — Scunthorpe negatives (substring-of-legitimate-word)', () => {
  // These all contain blocked tokens as substrings of a longer, legitimate
  // token. Exact-token matching is what keeps them legal.
  test.each([
    'Peacock Cafe',          // contains "cock" as substring of "peacock"
    'Associates Diner',      // contains "ass" as substring of "associates"
    'Butt Drugs',            // "butt" is NOT on the list (real pharmacy)
    'Bass Pro Shop',         // "bass" contains "ass" as substring
    'Classic Lasses',        // "lasses" contains "ass" as substring
    'Sassafras Coffee',      // "sassafras" contains "ass" as substring
    'Scunthorpe Fish & Chips', // the namesake case
    'Cumberland Farms',      // "cumberland" contains "cum" as substring
    'Analytical Labs',       // "analytical" contains "anal" as substring
    'Shitake Mushroom Farm', // "shitake" contains "shit" as substring (fungus)
  ])('passes (Scunthorpe): %s', (name) => {
    expect(matchBlockedWord(name)).toBeNull();
    expect(containsBlockedWord(name)).toBe(false);
  });
});

describe('profanityFilter — innuendo carve-outs (explicitly excluded tokens)', () => {
  // These tokens were DELIBERATELY excluded from the wordlist during the
  // 2026-04-22 innuendo-safety review. Each maps to at least one real
  // US business. If the wordlist ever grows to include any of these, the
  // innuendo review fails and these tests flag it.
  test.each([
    "Dick's BBQ",            // 'dick' — nickname for Richard
    "Dick's Drive-In",       // 'dick' — real Seattle-area burger chain
    "Cock & Bull Pub",       // 'cock' — traditional pub name
    "The Horny Toad Tavern", // 'horny' — real tavern + clothing brand
    'Horny Toad Clothing',   // 'horny' — real outdoor apparel brand
    "Whistles Weiners",      // 'weiner' — hot dog vendor
    "Whistle's Wieners",     // 'wiener' — alt spelling
    'Hooters',               // 'hooters' — was never on the list
    "Big Johnson's Auto",    // 'johnson' — common surname
    'Bush Brothers',         // 'bush' — common surname
    'Beaver Dam Diner',      // 'beaver' — common place name
    'Melon Patch Market',    // 'melons' — fruit stand
    'Ball & Chain Bar',      // 'balls' — idiom
  ])('passes (innuendo carve-out): %s', (name) => {
    expect(matchBlockedWord(name)).toBeNull();
    expect(containsBlockedWord(name)).toBe(false);
  });
});

describe('profanityFilter — ambiguous-but-kept tokens (dickhead, cocksucker, pussy)', () => {
  // These ARE on the list despite overlapping with innuendo-safe roots.
  // The standalone tokens are unambiguous enough that the false-positive
  // risk is worth it.
  test('dickhead matches (compound of an excluded + included root)', () => {
    expect(matchBlockedWord('Dickhead Brewing')?.word).toBe('dickhead');
  });

  test('cocksucker matches (compound of an excluded + included root)', () => {
    expect(matchBlockedWord('Cocksucker Bar')?.word).toBe('cocksucker');
  });

  test('pussy matches (sexual reading dominant)', () => {
    expect(matchBlockedWord('Pussy Cat Lounge')?.word).toBe('pussy');
  });
});

describe('profanityFilter — Unicode / homoglyph bypass attempts', () => {
  // These test that the client normalizer folds the same way the server
  // `normalize_business_name` function does. If any of these start failing,
  // the two normalizers have drifted.
  test.each([
    ['Ｆuck My Ass', 'fullwidth F'],
    ['ＦＵＣＫ ＹＯＵ', 'fullwidth all-caps'],
    ['Ｓhit Show', 'fullwidth S'],
    ['fuсk you', 'Cyrillic с (U+0441) in the middle'],
    ['fuсk my аss', 'Cyrillic с + Cyrillic а (U+0430)'],
    ['fück you', 'Latin-1 umlaut'],
    ['ｆｕｃｋ', 'fullwidth lowercase'],
    ['SHiT', 'mixed case'],
    ['  fuck  ', 'leading/trailing whitespace'],
  ])('catches: %s (%s)', (tricky, _note) => {
    expect(matchBlockedWord(tricky)).not.toBeNull();
  });

  // Cyrillic Ѕ (U+0405) is intentionally NOT in the homoglyph fold — that's
  // a documented limitation of normalizeChainName, not a bug here. Mirror
  // the accepted-miss test from chainDenylist.test.ts.
  test('documented miss: Cyrillic Ѕ (U+0405) is not folded', () => {
    expect(matchBlockedWord('Ѕhit Show')).toBeNull();
  });

  // Creative spellings (`f.u.c.k`, `f-u-c-k`, `fuuuuck`, `sh1t`) are NOT
  // caught by exact-token matching — punctuation splits into separate
  // tokens, and number/letter substitution breaks the alphabetic normalizer.
  // This is a documented limitation. Mitigation: the report/flag mechanism
  // in the Track-2 UGC moderation stack (see wiki/ugc-legal-moderation.md).
  test.each([
    'f.u.c.k You',           // periods split into 4 single-char tokens
    'f-u-c-k You',           // hyphens split into 4 single-char tokens
    'fuuuuck You',           // vowel stretching — no tokenizer-level fix
    'sh1t Show',             // digit substitution — '1' is not 'i'
    "F*U*C*K's",             // asterisks split into single-char tokens
  ])('documented miss (creative spelling): %s', (tricky) => {
    expect(matchBlockedWord(tricky)).toBeNull();
  });
});

describe('profanityFilter — empty / whitespace / punctuation input', () => {
  test('empty string returns null', () => {
    expect(matchBlockedWord('')).toBeNull();
    expect(containsBlockedWord('')).toBe(false);
  });

  test('whitespace-only returns null', () => {
    expect(matchBlockedWord('   \t\n')).toBeNull();
  });

  test('punctuation salad returns null', () => {
    expect(matchBlockedWord("!!!---'''...")).toBeNull();
  });

  test('clean local business passes', () => {
    expect(matchBlockedWord("Mom's Catio Workshop")).toBeNull();
    expect(matchBlockedWord('Potions and Familiars')).toBeNull();
    expect(matchBlockedWord('Downtown Vibes Test Kitchen')).toBeNull();
  });
});

describe('profanityFilter — wordlist size sanity (sync invariant)', () => {
  // MUST match the seed count in
  // supabase/migrations/20260422130000_content_moderation_profanity_denylist.sql.
  // If this assertion fails, the migration and the client mirror have drifted
  // and one of them must be updated to match.
  test('BLOCKED_WORDS has exactly 102 entries (matching the SQL seed)', () => {
    expect(__BLOCKED_WORDS_FOR_TESTS).toHaveLength(102);
  });

  test('category distribution: 41 profanity / 27 slur / 28 sexual / 6 violence', () => {
    const byCategory = __BLOCKED_WORDS_FOR_TESTS.reduce<Record<string, number>>(
      (acc, [, cat]) => {
        acc[cat] = (acc[cat] ?? 0) + 1;
        return acc;
      },
      {}
    );
    expect(byCategory).toEqual({
      profanity: 41,
      slur: 27,
      sexual: 28,
      violence: 6,
    });
  });

  test('every entry is lowercase + contains only a-z (post-normalization form)', () => {
    for (const [word] of __BLOCKED_WORDS_FOR_TESTS) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  test('no duplicate entries', () => {
    const seen = new Set<string>();
    for (const [word] of __BLOCKED_WORDS_FOR_TESTS) {
      expect(seen.has(word)).toBe(false);
      seen.add(word);
    }
  });

  test('innuendo carve-outs are NOT in the wordlist', () => {
    const words = new Set(__BLOCKED_WORDS_FOR_TESTS.map(([w]) => w));
    for (const excluded of ['dick', 'dicks', 'cock', 'cocks', 'horny']) {
      expect(words.has(excluded)).toBe(false);
    }
  });

  test('kept-on-purpose compound tokens ARE in the wordlist', () => {
    const words = new Set(__BLOCKED_WORDS_FOR_TESTS.map(([w]) => w));
    for (const kept of ['dickhead', 'cocksucker', 'pussy', 'pussies']) {
      expect(words.has(kept)).toBe(true);
    }
  });
});

describe('profanityFilter — return shape (for audit-log callers)', () => {
  // matchBlockedWord returns the normalized matched token + category.
  // This is meant for audit logging, NOT for rendering to the end user.
  // The generic user-facing copy lives in the caller's Alert.alert call.
  test('returns normalized lowercase word, not the raw casing', () => {
    const hit = matchBlockedWord('FUCK My Ass');
    expect(hit?.word).toBe('fuck');
  });

  test('returns the FIRST matching token when multiple are present', () => {
    // "fuck" is earlier in "Fuck My Ass" than "ass"
    const hit = matchBlockedWord('Fuck My Ass');
    expect(hit?.word).toBe('fuck');
  });

  test('returned category matches the seed classification', () => {
    expect(matchBlockedWord('nigger')?.category).toBe('slur');
    expect(matchBlockedWord('dildo')?.category).toBe('sexual');
    expect(matchBlockedWord('rape')?.category).toBe('violence');
    expect(matchBlockedWord('fuck')?.category).toBe('profanity');
  });
});
