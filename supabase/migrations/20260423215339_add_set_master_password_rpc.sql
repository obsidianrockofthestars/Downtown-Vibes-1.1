-- RPC: public.set_master_password(new_password TEXT)
-- Sets an account password for the CURRENT authenticated user, regardless of
-- whether they signed up via SSO or email/password. Workaround for
-- supabase.auth.updateUser({password}) silently failing on SSO-only users
-- (encrypted_password stays NULL). Writes the bcrypt-hashed password directly
-- to auth.users.encrypted_password and creates an auth.identities row for
-- provider=email if one doesn't exist. After this RPC succeeds, the user has
-- a working password credential identical in every way to a natively email/
-- password signup — all existing flows (signInWithPassword, owner gate re-
-- auth, delete flows) just work.
--
-- Security:
--   - SECURITY DEFINER so it can write to auth.users (RLS on auth.users blocks
--     client-side UPDATE otherwise).
--   - Operates ONLY on auth.uid() — no user_id parameter, so a user can only
--     set their OWN password. No privilege escalation.
--   - search_path pinned to prevent search_path attacks.
--   - Minimum 8 character check server-side (client enforces too, defense in
--     depth).
--
-- Deployment context: 1.4.3 (newspaper interview launch anchor 2026-04-24 2PM).
-- Replaces the failing supabase.auth.updateUser({password}) call in
-- app/(tabs)/login.tsx handleSetPassword.

CREATE OR REPLACE FUNCTION public.set_master_password(new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'auth', 'pg_catalog'
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

  -- Look up email for the identity row we may need to create below.
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No email on this account';
  END IF;

  -- Write bcrypt-hashed password. `crypt(plain, gen_salt('bf'))` produces the
  -- same format Supabase's native password flow produces, so
  -- signInWithPassword validates it correctly.
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_user_id;

  -- Ensure an email identity exists, so the client-side
  -- `getUserIdentities().some(provider='email')` check returns true after
  -- this call. For SSO-only users, this row is created fresh. For users who
  -- already have it (shouldn't happen for SSO-only but defensive), skip.
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

GRANT EXECUTE ON FUNCTION public.set_master_password(TEXT) TO authenticated;

COMMENT ON FUNCTION public.set_master_password(TEXT) IS
  'Sets the master password for the current authenticated user. Works for SSO-only users where native supabase.auth.updateUser({password}) silently fails. Writes encrypted_password via bcrypt and creates an email identity if missing. Deployed 2026-04-23 for 1.4.3.';
