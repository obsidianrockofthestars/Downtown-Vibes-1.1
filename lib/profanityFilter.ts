/**
 * Client-side profanity / slur / sexual / violence filter.
 *
 * Mirrors the server-side trigger installed by the migrations:
 *   - `supabase/migrations/20260422130000_content_moderation_profanity_denylist.sql`
 *     (enforce_content_moderation_trg on public.businesses.business_name /
 *     description / flash_sale)
 *   - `supabase/migrations/20260422150000_content_moderation_vibe_checks.sql`
 *     (enforce_vibe_check_moderation_trg on public.vibe_checks.comment)
 *
 * The server trigger is the hard floor — a user with a hacked client cannot
 * bypass it. This client mirror is defense-in-depth + UX: it rejects bad input
 * before the network call so the user gets an instant, friendly error instead
 * of a Supabase error surface with a slightly awkward wrapper.
 *
 * Matching model: EXACT TOKEN match after `normalizeChainName` (the same
 * Unicode-fold + strip-punctuation + lowercase pipeline as the chain denylist
 * and the server's `normalize_business_name`). This avoids the Scunthorpe
 * problem — "Peacock Cafe" stays legal because "peacock" is the token, not
 * "cock"; "Associates Diner" stays legal because "associates" is the token,
 * not "ass"; "Butt Drugs" stays legal because "butt" isn't on the list.
 *
 * Innuendo carve-outs (from the 2026-04-22 innuendo-safety review — must
 * match the server wordlist exactly):
 *   - 'dick' / 'dicks' — nickname for Richard. "Dick's BBQ" passes.
 *   - 'cock' / 'cocks' — "Cock & Bull" is a traditional pub name.
 *   - 'horny'          — "Horny Toad" is a clothing brand + tavern name.
 *   - 'weiner' / 'wiener' / 'hooters' / 'johnson' / 'bush' / 'beaver' /
 *     'melons' / 'balls' — never on the list.
 *
 * Kept on the list:
 *   - 'dickhead', 'cocksucker' — unambiguous as standalone tokens.
 *   - 'pussy' / 'pussies' — sexual reading is dominant; cat-slang is rare
 *     in actual business names. Revisit if the hit log shows false positives.
 *
 * Sync invariant: BLOCKED_WORDS MUST match the seed rows inserted by
 * 20260422130000_content_moderation_profanity_denylist.sql. If the SQL seed
 * grows or shrinks, update this constant in the same commit. The chain
 * denylist has the same invariant with its own SQL source of truth.
 *
 * Error copy is the caller's responsibility. Do NOT echo the matched word
 * back to the user — that teaches an attacker the exact wordlist. Callers
 * should surface a field-specific generic message (see the server trigger
 * RAISE EXCEPTION strings for the canonical phrasing).
 */

import { normalizeChainName } from './chainDenylist';

export type BlockedWordCategory =
  | 'profanity'
  | 'slur'
  | 'sexual'
  | 'violence';

export type ProfanityMatch = {
  /** The matched blocked token, normalized. Intended for audit logging, not
   *  for rendering to the end user. */
  word: string;
  category: BlockedWordCategory;
};

/**
 * Canonical wordlist. MUST be kept in sync with the seed rows in
 * `supabase/migrations/20260422130000_content_moderation_profanity_denylist.sql`.
 *
 * Total: 102 tokens across 4 categories (41 profanity, 27 slur, 28 sexual,
 * 6 violence).
 *
 * Alphabetical within category for easier manual diff against the SQL source.
 */
const BLOCKED_WORDS: ReadonlyArray<
  readonly [string, BlockedWordCategory]
> = [
  // profanity (41) — the "seven dirty words" and close relatives
  ['ass', 'profanity'],
  ['asses', 'profanity'],
  ['asshat', 'profanity'],
  ['asshole', 'profanity'],
  ['assholes', 'profanity'],
  ['bastard', 'profanity'],
  ['bastards', 'profanity'],
  ['bitch', 'profanity'],
  ['bitches', 'profanity'],
  ['bitching', 'profanity'],
  ['bullshit', 'profanity'],
  // 'cock' / 'cocks' excluded — traditional pub names. See header.
  ['cocksucker', 'profanity'],
  ['cunt', 'profanity'],
  ['cunts', 'profanity'],
  // 'dick' / 'dicks' excluded — common nickname for Richard. See header.
  ['dickhead', 'profanity'],
  ['dumbass', 'profanity'],
  ['fuck', 'profanity'],
  ['fucked', 'profanity'],
  ['fucker', 'profanity'],
  ['fuckers', 'profanity'],
  ['fuckin', 'profanity'],
  ['fucking', 'profanity'],
  ['fucks', 'profanity'],
  ['jackass', 'profanity'],
  ['motherfucker', 'profanity'],
  ['motherfuckers', 'profanity'],
  ['motherfucking', 'profanity'],
  ['piss', 'profanity'],
  ['pissed', 'profanity'],
  ['pussies', 'profanity'],
  ['pussy', 'profanity'],
  ['shit', 'profanity'],
  ['shithead', 'profanity'],
  ['shits', 'profanity'],
  ['shitted', 'profanity'],
  ['shitter', 'profanity'],
  ['shitting', 'profanity'],
  ['shitty', 'profanity'],
  ['smartass', 'profanity'],
  ['twat', 'profanity'],
  ['twats', 'profanity'],

  // slurs (27) — racial, ethnic, homophobic, transphobic, ableist
  ['chink', 'slur'],
  ['chinks', 'slur'],
  ['coon', 'slur'],
  ['coons', 'slur'],
  ['dyke', 'slur'],
  ['dykes', 'slur'],
  ['fag', 'slur'],
  ['faggot', 'slur'],
  ['faggots', 'slur'],
  ['fags', 'slur'],
  ['gook', 'slur'],
  ['gooks', 'slur'],
  ['kike', 'slur'],
  ['kikes', 'slur'],
  ['nigga', 'slur'],
  ['niggas', 'slur'],
  ['nigger', 'slur'],
  ['niggers', 'slur'],
  ['retard', 'slur'],
  ['retarded', 'slur'],
  ['retards', 'slur'],
  ['spic', 'slur'],
  ['spics', 'slur'],
  ['tranny', 'slur'],
  ['trannies', 'slur'],
  ['wetback', 'slur'],
  ['wetbacks', 'slur'],

  // sexual / pornographic (28)
  ['anal', 'sexual'],
  ['blowjob', 'sexual'],
  ['blowjobs', 'sexual'],
  ['boner', 'sexual'],
  ['boners', 'sexual'],
  ['cum', 'sexual'],
  ['cumming', 'sexual'],
  ['cumshot', 'sexual'],
  ['dildo', 'sexual'],
  ['dildos', 'sexual'],
  ['handjob', 'sexual'],
  ['handjobs', 'sexual'],
  // 'horny' excluded — "Horny Toad" clothing brand + tavern. See header.
  ['incest', 'sexual'],
  ['jizz', 'sexual'],
  ['jerkoff', 'sexual'],
  ['milf', 'sexual'],
  ['orgasm', 'sexual'],
  ['orgy', 'sexual'],
  ['porn', 'sexual'],
  ['porno', 'sexual'],
  ['pornography', 'sexual'],
  ['rimjob', 'sexual'],
  ['slut', 'sexual'],
  ['sluts', 'sexual'],
  ['slutty', 'sexual'],
  ['threesome', 'sexual'],
  ['whore', 'sexual'],
  ['whores', 'sexual'],

  // violence (6) — severely offensive imagery
  ['rape', 'violence'],
  ['raped', 'violence'],
  ['rapes', 'violence'],
  ['rapist', 'violence'],
  ['rapists', 'violence'],
  ['raping', 'violence'],
];

// Pre-indexed for O(1) lookup. Built once at module load.
const BLOCKED_WORD_MAP: ReadonlyMap<string, BlockedWordCategory> = new Map(
  BLOCKED_WORDS
);

/**
 * Returns the first matching blocked token in `raw`, or null if clean.
 *
 * Matching is EXACT TOKEN — the input is normalized (Unicode fold, strip
 * punctuation, lowercase) and split on whitespace; each resulting token is
 * checked against `BLOCKED_WORD_MAP`. A token only matches if it IS one of
 * the blocked words, not if it contains one as a substring.
 *
 * The returned word is the normalized form of the matched token. Do NOT
 * echo this back to the user — it's for audit logging / telemetry only.
 */
export function matchBlockedWord(raw: string): ProfanityMatch | null {
  const tokens = normalizeChainName(raw);
  for (const token of tokens) {
    const category = BLOCKED_WORD_MAP.get(token);
    if (category) {
      return { word: token, category };
    }
  }
  return null;
}

/**
 * Convenience boolean wrapper for callers that only need yes/no.
 */
export function containsBlockedWord(raw: string): boolean {
  return matchBlockedWord(raw) !== null;
}

/**
 * Test-only surface — expose the raw wordlist so the Jest tests can assert
 * the count matches the SQL seed. Not meant to be used by the app.
 *
 * @internal
 */
export const __BLOCKED_WORDS_FOR_TESTS: ReadonlyArray<
  readonly [string, BlockedWordCategory]
> = BLOCKED_WORDS;
