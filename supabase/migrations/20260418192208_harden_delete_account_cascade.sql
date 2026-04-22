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

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
