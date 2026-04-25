-- Fix: pgcrypto's gen_salt and crypt live in the `extensions` schema on
-- Supabase, not in the default search_path. The previous version of this RPC
-- declared search_path as 'public, auth, pg_catalog' — which meant
-- gen_salt('bf', 10) couldn't be resolved. Error surfaced in app as
-- "function gen_salt(unknown, integer) does not exist".
--
-- Also explicitly cast 'bf'::text and 10::integer to ensure unambiguous
-- function resolution even if the search_path ever drifts. Belt and
-- suspenders — resolution should work with just the path fix, but pinning
-- the argument types removes one more dimension of surprise.

CREATE OR REPLACE FUNCTION public.set_master_password(new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions', 'auth', 'pg_catalog'
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_has_email_identity BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF new_password IS NULL OR length(new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No email on this account';
  END IF;

  -- Explicit casts to remove ambiguity in function resolution.
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(
        new_password,
        extensions.gen_salt('bf'::text, 10::integer)
      ),
      updated_at = now()
  WHERE id = v_user_id;

  SELECT EXISTS(
    SELECT 1 FROM auth.identities
    WHERE user_id = v_user_id AND provider = 'email'
  ) INTO v_has_email_identity;

  IF NOT v_has_email_identity THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      provider,
      provider_id,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      'email',
      v_user_id::TEXT,
      jsonb_build_object(
        'sub', v_user_id::TEXT,
        'email', v_email,
        'email_verified', TRUE,
        'phone_verified', FALSE
      ),
      now(),
      now(),
      now()
    );
  END IF;
END;
$$;
