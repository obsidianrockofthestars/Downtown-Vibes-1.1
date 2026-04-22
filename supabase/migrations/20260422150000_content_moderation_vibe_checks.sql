-- Extend the profanity filter (from 20260422130000_content_moderation_profanity_denylist)
-- to vibe_checks.comment.
--
-- Why a separate trigger function: vibe_checks columns differ from businesses.
-- The base enforce_content_moderation() function references NEW.business_name /
-- NEW.description / NEW.flash_sale, which don't exist on vibe_checks. Rather
-- than generalize with dynamic SQL (fragile) or hstore (extension dependency),
-- we use a dedicated function per table. The wordlist + matcher are shared.
--
-- UGC scope (legal/Apple-compliance context):
--   - vibe_checks.comment is user-generated prose attached to a business pin.
--   - Without a pre-publish filter, a single malicious user could post slurs
--     that appear under a third-party's business, exposing us to Apple 1.2
--     rejection and arguably to defamation claims against the business owner.
--   - The pre-publish filter is the MINIMUM viable moderation. Report/flag,
--     moderation queue, and user bans are Track 2 work.
--
-- Error copy: generic by design, matches the businesses trigger. Does not
-- echo the matched word back to the client (that would teach the attacker
-- the exact wordlist).

CREATE OR REPLACE FUNCTION public.enforce_vibe_check_moderation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF public.contains_blocked_word(NEW.comment) IS NOT NULL THEN
    RAISE EXCEPTION
      'Your vibe check contains words that are not allowed. Please revise. If you believe this is an error, contact support@potionsandfamiliars.com.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_vibe_check_moderation() IS
  'BEFORE INSERT OR UPDATE trigger on public.vibe_checks. Rejects rows where comment contains any blocked token. Generic error messages by design.';

DROP TRIGGER IF EXISTS enforce_vibe_check_moderation_trg ON public.vibe_checks;
CREATE TRIGGER enforce_vibe_check_moderation_trg
BEFORE INSERT OR UPDATE OF comment ON public.vibe_checks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vibe_check_moderation();
