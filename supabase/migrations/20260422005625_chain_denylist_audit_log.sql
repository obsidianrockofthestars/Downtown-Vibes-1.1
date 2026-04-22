-- Audit table for chain-denylist hits. Captures BOTH client-side short-circuits
-- (via the log_chain_denylist_hit RPC below) and server-side trigger fires.
-- Client-side hits are normal traffic (legit franchisees or confused users);
-- server-side hits indicate client bypass and are the higher-signal events.
--
-- RLS: service role and postgres only. Regular users MUST NOT see this table.
-- It contains other users' attempted business names, which is not sensitive
-- but also not something end users have any reason to read.

CREATE TABLE IF NOT EXISTS public.chain_denylist_hits (
  id BIGSERIAL PRIMARY KEY,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  layer TEXT NOT NULL CHECK (layer IN ('client', 'server_trigger')),
  raw_name TEXT NOT NULL,
  normalized_key TEXT,
  matched_chain TEXT,
  user_id UUID
);

COMMENT ON TABLE public.chain_denylist_hits IS
  'Audit log of blocked national-chain business-claim attempts. Written by the log_chain_denylist_hit RPC (client) and the enforce_chain_denylist trigger (server). Trademark-liability evidence.';

ALTER TABLE public.chain_denylist_hits ENABLE ROW LEVEL SECURITY;

-- No USING policies -> no regular role can SELECT/INSERT/UPDATE/DELETE.
-- Service role bypasses RLS. RPC below is SECURITY DEFINER for client inserts.

CREATE INDEX IF NOT EXISTS idx_chain_denylist_hits_hit_at
  ON public.chain_denylist_hits (hit_at DESC);

CREATE INDEX IF NOT EXISTS idx_chain_denylist_hits_matched_chain
  ON public.chain_denylist_hits (matched_chain);

-- Client-facing RPC. Client calls this from handleCreateBusiness right after
-- matchBlockedChain returns a hit, before showing the "not claimable" Alert.
-- SECURITY DEFINER so anonymous / authenticated roles can write WITHOUT being
-- granted full table access. The function is the only legitimate write path.
CREATE OR REPLACE FUNCTION public.log_chain_denylist_hit(
  p_raw_name TEXT,
  p_matched_chain TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_norm TEXT;
  v_user UUID;
BEGIN
  -- Basic sanity: bound the raw_name length so we can't be used as a log spam
  -- primitive. 200 chars is more than any real business name.
  IF p_raw_name IS NULL OR length(p_raw_name) > 200 THEN
    RETURN;
  END IF;

  -- Compute the normalized key the same way the trigger does. Best-effort:
  -- if normalize_business_name doesn't exist yet, swallow the error and log
  -- without the normalized key.
  BEGIN
    v_norm := public.normalize_business_name(p_raw_name);
  EXCEPTION WHEN OTHERS THEN
    v_norm := NULL;
  END;

  -- auth.uid() is safe to call even if unauthenticated — returns NULL.
  BEGIN
    v_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  INSERT INTO public.chain_denylist_hits (layer, raw_name, normalized_key, matched_chain, user_id)
  VALUES ('client', p_raw_name, v_norm, p_matched_chain, v_user);
END;
$fn$;

-- Grant execute to the two roles clients actually use.
GRANT EXECUTE ON FUNCTION public.log_chain_denylist_hit(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.log_chain_denylist_hit(TEXT, TEXT) IS
  'Records a client-side chain-denylist short-circuit into chain_denylist_hits. Called by the app from handleCreateBusiness when matchBlockedChain returns a match. Do NOT use for anything else.';
