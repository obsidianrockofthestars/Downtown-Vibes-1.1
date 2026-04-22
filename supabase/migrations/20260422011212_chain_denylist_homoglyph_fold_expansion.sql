-- Expand Cyrillic/Greek homoglyph fold to match lib/chainDenylist.ts tests.
-- Existing function uses a different parameter name; drop + recreate.
--
-- KEEP THIS TABLE IN LOCK-STEP with HOMOGLYPH_FROM / HOMOGLYPH_TO in
-- lib/chainDenylist.ts. If you add a pair on one side, add it on the other
-- in the same migration.
--
-- Added letters this pass (beyond the initial 2026-04-21 set):
--   Cyrillic: т Т м М к К н Н в В
--   Greek:    τ Τ μ Μ Η Β
--
-- REPLAY WARNING: this migration does `DROP FUNCTION ... CASCADE`, which
-- will cascade through `match_blocked_chain` and `enforce_chain_denylist`
-- if they exist and depend on this function. When this ran live, both
-- downstream objects survived (CREATE OR REPLACE on their callers had
-- already replaced their bodies, breaking the dependency). If you ever
-- replay this migration from empty, be prepared to re-apply the earlier
-- `20260422002352_block_national_chain_business_claims` migration
-- afterwards to restore `match_blocked_chain` + `enforce_chain_denylist`
-- + the trigger. A follow-up migration that consolidates this properly
-- is in the backlog.

DROP FUNCTION IF EXISTS normalize_business_name(text) CASCADE;

CREATE OR REPLACE FUNCTION normalize_business_name(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
BEGIN
  IF raw IS NULL THEN
    RETURN '';
  END IF;

  s := normalize(raw, NFKC);
  s := normalize(s, NFKD);
  s := regexp_replace(s, '[\u0300-\u036f]', '', 'g');
  s := translate(
    s,
    'аеіорсхутмкнвАЕІОРСХУТМКНВαορεικντμΑΟΡΕΙΚΝΤΜΗΒ',
    'aeiopcxytmknbAEIOPCXYTMKHBaoreikntmAOREIKNTMHB'
  );
  s := lower(s);
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := btrim(s);

  RETURN s;
END;
$$;

COMMENT ON FUNCTION normalize_business_name(text) IS
  'Unicode-safe business name normalizer. NFKC->NFKD->strip combining->fold Cyrillic/Greek homoglyphs->lower->strip non-alphanumeric. MUST match lib/chainDenylist.ts client normalizer. Updated 2026-04-21 to add т Т м М к К н Н в В τ Τ μ Μ Η Β.';
