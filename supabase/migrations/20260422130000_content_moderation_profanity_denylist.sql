-- Content moderation: profanity + slur filter on user-editable business fields.
--
-- Mirrors the chain-denylist pattern (see 20260422002352_block_national_chain_business_claims).
-- The chain denylist protects against trademark claims. This one protects against
-- UGC that would get the app rejected under Apple App Store Guideline 1.2
-- ("Apps with user-generated content or services that end up being used primarily
-- for pornographic content, ... or other objectionable content").
--
-- Scope (fields checked):
--   1. businesses.business_name
--   2. businesses.description
--   3. businesses.flash_sale
--
-- Fields explicitly NOT checked (yet):
--   - menu_link / website — URLs; domain-level blocklists are a different tool
--   - emoji_icon — single emoji; emoji-level moderation is deferred
--
-- Matching model: EXACT TOKEN match after normalize_business_name(). This avoids
-- the "Scunthorpe problem" — "Peacock Cafe" stays legal because "peacock" is the
-- token, not "cock"; "Associates Diner" stays legal because "associates" is the
-- token, not "ass". The tradeoff: creative spellings ("fuuuuck", "shiiit") slip
-- through. Server-side audit log catches them for manual review.
--
-- Word list: deliberately-conservative English subset of the LDNOOBW MIT list
-- (https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words).
-- Missing on purpose: mild profanity that's common in legitimate business names
-- (hell, damn, crap, butt — "Butt Drugs" in Corydon IN is a real pharmacy),
-- and ambiguous words that are more token than slur ("hoe" could be gardening).
-- Add words via follow-up migration if the hit log shows the list is weak.
--
-- EXCLUDED after innuendo-safety review (2026-04-22):
--   - 'dick' / 'dicks'  — nickname for Richard. "Dick's BBQ", "Dick's Drive-In".
--   - 'cock' / 'cocks'  — "Cock & Bull" is a traditional pub name.
--   - 'horny'           — "Horny Toad" (clothing brand + tavern name).
-- Kept: 'dickhead', 'cocksucker' — these are unambiguous as tokens and do
-- not round-trip from a common name or everyday word. 'weiner'/'wiener' were
-- never on the list (hot-dog vendor names should pass).
--
-- Re-use normalize_business_name so Unicode/homoglyph attacks folded for chain
-- denylist are automatically covered here too ("Ｆuck", Cyrillic-lookalike "fuсk").

CREATE TABLE IF NOT EXISTS public.blocked_words (
  normalized_word text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('profanity', 'slur', 'sexual', 'violence')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_words ENABLE ROW LEVEL SECURITY;

-- Readable by everyone so the client filter can mirror server state if needed.
-- No write policies; service role only.
DROP POLICY IF EXISTS blocked_words_read ON public.blocked_words;
CREATE POLICY blocked_words_read ON public.blocked_words
  FOR SELECT USING (true);

COMMENT ON TABLE public.blocked_words IS
  'Moderation wordlist. Single normalized token per row. Matched as EXACT token against normalize_business_name(input) tokens. Keep in sync with lib/profanityFilter.ts BLOCKED_WORDS set.';

-- Helper: returns the first token in `raw` that matches a blocked_words row,
-- or NULL if clean. STABLE so Postgres can cache it within a statement.
CREATE OR REPLACE FUNCTION public.contains_blocked_word(raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  norm text := public.normalize_business_name(raw);
  tokens text[];
  match text;
BEGIN
  IF norm = '' THEN
    RETURN NULL;
  END IF;

  tokens := string_to_array(norm, ' ');

  SELECT normalized_word INTO match
  FROM public.blocked_words
  WHERE normalized_word = ANY(tokens)
  LIMIT 1;

  RETURN match;
END;
$fn$;

COMMENT ON FUNCTION public.contains_blocked_word(text) IS
  'Content moderation match. Returns the first blocked token found in the input, or NULL. Uses normalize_business_name so Unicode/homoglyph folds apply.';

-- Trigger: enforced on insert + update of the three free-text fields. Rejects
-- the whole row. The exception message is deliberately generic so it does not
-- echo the matched word back to the client. The client filter gives the
-- user-friendly error; the trigger is last-line defense.
CREATE OR REPLACE FUNCTION public.enforce_content_moderation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF public.contains_blocked_word(NEW.business_name) IS NOT NULL THEN
    RAISE EXCEPTION
      'Business name contains words that are not allowed. Please choose a different name. If you believe this is an error, contact support@potionsandfamiliars.com.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.contains_blocked_word(NEW.description) IS NOT NULL THEN
    RAISE EXCEPTION
      'Description contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.contains_blocked_word(NEW.flash_sale) IS NOT NULL THEN
    RAISE EXCEPTION
      'Flash sale text contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_content_moderation() IS
  'BEFORE INSERT OR UPDATE trigger on public.businesses. Rejects rows where business_name / description / flash_sale contain any blocked token. Generic error messages by design — do not echo the matched word.';

DROP TRIGGER IF EXISTS enforce_content_moderation_trg ON public.businesses;
CREATE TRIGGER enforce_content_moderation_trg
BEFORE INSERT OR UPDATE OF business_name, description, flash_sale ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_content_moderation();

-- Seed the word list. MUST be kept in sync with lib/profanityFilter.ts BLOCKED_WORDS set.
-- Word order within category is alphabetical for easier manual review.
INSERT INTO public.blocked_words (normalized_word, category) VALUES
  -- profanity (the "seven dirty words" and close relatives)
  ('ass', 'profanity'),
  ('asses', 'profanity'),
  ('asshat', 'profanity'),
  ('asshole', 'profanity'),
  ('assholes', 'profanity'),
  ('bastard', 'profanity'),
  ('bastards', 'profanity'),
  ('bitch', 'profanity'),
  ('bitches', 'profanity'),
  ('bitching', 'profanity'),
  ('bullshit', 'profanity'),
  -- 'cock' and 'cocks' removed — see innuendo-safety review header.
  ('cocksucker', 'profanity'),
  ('cunt', 'profanity'),
  ('cunts', 'profanity'),
  -- 'dick' and 'dicks' removed — common nickname for Richard.
  ('dickhead', 'profanity'),
  ('dumbass', 'profanity'),
  ('fuck', 'profanity'),
  ('fucked', 'profanity'),
  ('fucker', 'profanity'),
  ('fuckers', 'profanity'),
  ('fuckin', 'profanity'),
  ('fucking', 'profanity'),
  ('fucks', 'profanity'),
  ('jackass', 'profanity'),
  ('motherfucker', 'profanity'),
  ('motherfuckers', 'profanity'),
  ('motherfucking', 'profanity'),
  ('piss', 'profanity'),
  ('pissed', 'profanity'),
  -- 'pussy' / 'pussies' kept — cat-slang is rare in actual business names and
  -- the sexual reading is dominant. Revisit if the hit log shows false positives.
  ('pussies', 'profanity'),
  ('pussy', 'profanity'),
  ('shit', 'profanity'),
  ('shithead', 'profanity'),
  ('shits', 'profanity'),
  ('shitted', 'profanity'),
  ('shitter', 'profanity'),
  ('shitting', 'profanity'),
  ('shitty', 'profanity'),
  ('smartass', 'profanity'),
  ('twat', 'profanity'),
  ('twats', 'profanity'),
  -- slurs (racial, ethnic, homophobic, transphobic, ableist)
  ('chink', 'slur'),
  ('chinks', 'slur'),
  ('coon', 'slur'),
  ('coons', 'slur'),
  ('dyke', 'slur'),
  ('dykes', 'slur'),
  ('fag', 'slur'),
  ('faggot', 'slur'),
  ('faggots', 'slur'),
  ('fags', 'slur'),
  ('gook', 'slur'),
  ('gooks', 'slur'),
  ('kike', 'slur'),
  ('kikes', 'slur'),
  ('nigga', 'slur'),
  ('niggas', 'slur'),
  ('nigger', 'slur'),
  ('niggers', 'slur'),
  ('retard', 'slur'),
  ('retarded', 'slur'),
  ('retards', 'slur'),
  ('spic', 'slur'),
  ('spics', 'slur'),
  ('tranny', 'slur'),
  ('trannies', 'slur'),
  ('wetback', 'slur'),
  ('wetbacks', 'slur'),
  -- sexual / pornographic
  ('anal', 'sexual'),
  ('blowjob', 'sexual'),
  ('blowjobs', 'sexual'),
  ('boner', 'sexual'),
  ('boners', 'sexual'),
  ('cum', 'sexual'),
  ('cumming', 'sexual'),
  ('cumshot', 'sexual'),
  ('dildo', 'sexual'),
  ('dildos', 'sexual'),
  ('handjob', 'sexual'),
  ('handjobs', 'sexual'),
  -- 'horny' removed — "Horny Toad" is a clothing brand and tavern name.
  ('incest', 'sexual'),
  ('jizz', 'sexual'),
  ('jerkoff', 'sexual'),
  ('milf', 'sexual'),
  ('orgasm', 'sexual'),
  ('orgy', 'sexual'),
  ('porn', 'sexual'),
  ('porno', 'sexual'),
  ('pornography', 'sexual'),
  ('rimjob', 'sexual'),
  ('slut', 'sexual'),
  ('sluts', 'sexual'),
  ('slutty', 'sexual'),
  ('threesome', 'sexual'),
  ('whore', 'sexual'),
  ('whores', 'sexual'),
  -- violence / severely offensive imagery
  ('rape', 'violence'),
  ('raped', 'violence'),
  ('rapes', 'violence'),
  ('rapist', 'violence'),
  ('rapists', 'violence'),
  ('raping', 'violence')
ON CONFLICT (normalized_word) DO NOTHING;
