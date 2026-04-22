-- Fix: the initial seed (20260422002352_block_national_chain_business_claims)
-- hand-wrote some normalized keys that don't match what the
-- `normalize_business_name` function actually produces at runtime.
--
-- Root cause: the seed was generated offline; several rows have stale
-- normalized_name values (e.g. keys with trailing/leading punctuation or
-- different whitespace collapse). Lookup against the normalized form would
-- miss those rows.
--
-- Fix strategy: for every seed row whose display_name doesn't round-trip
-- through normalize_business_name() to its stored normalized_name, INSERT
-- a NEW row with the correct normalized key. We don't UPDATE in place —
-- the original hand-written keys may still be reachable from other code
-- paths (e.g. older client versions with a different normalizer) and we
-- don't want to drop coverage. Duplicates are suppressed by
-- ON CONFLICT (normalized_name) DO NOTHING so this migration is idempotent
-- and safe to re-run.
--
-- match_mode derivation: multi-word normalized keys get 'prefix' (so
-- "taco bell cantina" still hits "taco bell"), single-word keys stay
-- 'exact' to avoid catching legit words that happen to start with a
-- chain name (e.g. "subway" prefix-match would falsely block
-- "Subway Sandwich Shop Downtown").

INSERT INTO public.blocked_chain_names (normalized_name, display_name, match_mode)
SELECT DISTINCT
  public.normalize_business_name(display_name) AS normalized_name,
  display_name,
  CASE
    WHEN array_length(
      string_to_array(public.normalize_business_name(display_name), ' '),
      1
    ) >= 2
    THEN 'prefix'
    ELSE 'exact'
  END AS match_mode
FROM public.blocked_chain_names
WHERE public.normalize_business_name(display_name) <> normalized_name
  AND public.normalize_business_name(display_name) <> ''
ON CONFLICT (normalized_name) DO NOTHING;
