-- Harden public.delete_account to explicitly remove the email identity row
-- before cascading the auth.users delete.
--
-- Background: set_master_password RPC inserts an email identity on first
-- master-password set. checkUserHasPassword() on the client reads
-- auth.identities for provider='email' to decide whether to fire the
-- master-password modal. The FK auth.identities.user_id -> auth.users.id
-- IS declared ON DELETE CASCADE, so in theory deleting the user row
-- cascades the identity. But observed behavior on 2026-04-24: users who
-- delete their account and re-sign-in via SSO are not prompted for master
-- password on the second signup, implying the email identity material is
-- surviving the delete somehow (cache, re-linking, or otherwise).
--
-- This fix removes that ambiguity by explicitly deleting the email
-- identity BEFORE we delete auth.users. Belt-and-suspenders: even if
-- Supabase ever changes its cascade behavior or auto-links identities on
-- SSO re-signin, the password material is gone before the user row is.
--
-- Safe to re-run: delete from auth.identities is a no-op when the row
-- is already gone, and the rest of the function is unchanged from the
-- version shipped in migration 20260418192208_harden_delete_account_cascade.sql.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Cascade: app tables first, then auth.
  delete from public.vibe_checks where user_id = auth.uid();
  delete from public.user_favorites where user_id = auth.uid();
  delete from public.businesses where owner_id = (auth.uid())::text;

  -- Explicitly remove the email identity row created by set_master_password
  -- so the master-password prompt fires correctly if this user re-signs up
  -- via SSO. See function comment for threat model and background.
  delete from auth.identities
    where user_id = auth.uid()
      and provider = 'email';

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
