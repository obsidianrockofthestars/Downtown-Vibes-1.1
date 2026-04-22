-- Harden normalize_business_name against Unicode-based denylist bypass.
-- Adds NFKC (fullwidth fold), NFKD + combining-mark strip (diacritic fold),
-- and Cyrillic + Greek homoglyph fold. The homoglyph translate table covers
-- the 8 most-common Latin-lookalike Cyrillic chars + 7 Greek — not
-- exhaustive, but covers typo-squat attacks most likely in practice.
--
-- Scope note: existing rows in blocked_chain_names are NOT recomputed.
-- Each row corresponds to a reachable input variant from the client
-- BLOCKED_CHAINS list (e.g. "Applebees" vs "Applebee's" both produce
-- different normalized keys under earlier normalizer versions, and BOTH
-- remain reachable because users may type either spelling). Re-normalizing
-- would collapse these variants and lose coverage. The hardening this
-- migration provides is on the LOOKUP path: incoming user text is
-- normalized on the way in, and Unicode-based attacks ("Ťaco Bell",
-- fullwidth "ＴACO BELL", Cyrillic-lookalike "Тaco Bell") all now fold
-- to the plain ASCII form that the existing table rows match.
--
-- NOTE: superseded two migrations later by chain_denylist_homoglyph_fold_expansion,
-- which adds more Cyrillic/Greek pairs. Kept in history for audit continuity.

CREATE OR REPLACE FUNCTION public.normalize_business_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            regexp_replace(
              normalize(
                normalize(coalesce(raw, ''), NFKC),
                NFKD
              ),
              '[\u0300-\u036f]', '', 'g'
            ),
            'аеіорсхуАЕІОРСХУ' ||
            'αορεικνΑΟΡΕΙΚΝ',
            'aeiopcxyAEIOPCXY' ||
            'aoreiknAOREIKN'
          )
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$function$;

COMMENT ON FUNCTION public.normalize_business_name(text) IS
  'Canonical business-name normalizer. NFKC + NFKD + combining-mark strip + Cyrillic/Greek homoglyph fold + lowercase + alphanumeric-only + whitespace collapse. Same pipeline must be used everywhere business_name is compared (lookup against blocked_chain_names, client/server match parity, future UGC denylist table). Mismatches cause silent bypass.';
