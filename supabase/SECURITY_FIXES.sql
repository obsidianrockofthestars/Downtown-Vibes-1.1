-- Downtown Vibes Production — Security Fixes (apply in Supabase SQL Editor)
-- This file addresses:
-- 1) Hardened delete_account RPC
-- 2) RLS policy templates for core tables
--
-- Review and adjust table/column names to match your schema.

-- ============================================================
-- 1) Hardened account deletion RPC (current user only)
-- ============================================================
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

  -- If you DO NOT have ON DELETE CASCADE from app tables to auth.users,
  -- delete dependent rows here first (order matters if FKs exist).
  -- Uncomment if applicable:
  -- delete from public.vibe_checks where user_id = auth.uid();
  -- delete from public.user_favorites where user_id = auth.uid();
  -- delete from public.businesses where owner_id = auth.uid();

  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;


-- ============================================================
-- 2) RLS policy templates (REQUIRED — enforce security on server)
-- ============================================================
-- IMPORTANT: Enable RLS on each table.
-- alter table public.businesses enable row level security;
-- alter table public.vibe_checks enable row level security;
-- alter table public.user_favorites enable row level security;

-- ----------------------------
-- businesses
-- ----------------------------
-- Suggested public read (only active businesses)
-- create policy "businesses_read_active"
-- on public.businesses
-- for select
-- using (is_active = true);

-- Owners can manage their own businesses
-- create policy "businesses_owner_insert"
-- on public.businesses
-- for insert
-- with check (owner_id = auth.uid());

-- create policy "businesses_owner_update"
-- on public.businesses
-- for update
-- using (owner_id = auth.uid())
-- with check (owner_id = auth.uid());

-- create policy "businesses_owner_delete"
-- on public.businesses
-- for delete
-- using (owner_id = auth.uid());


-- ----------------------------
-- vibe_checks
-- ----------------------------
-- Users can read vibe checks for any business (public content)
-- create policy "vibe_checks_read"
-- on public.vibe_checks
-- for select
-- using (true);

-- Users can create/update/delete only their own
-- create policy "vibe_checks_insert_own"
-- on public.vibe_checks
-- for insert
-- with check (user_id = auth.uid());

-- create policy "vibe_checks_update_own"
-- on public.vibe_checks
-- for update
-- using (user_id = auth.uid())
-- with check (user_id = auth.uid());

-- create policy "vibe_checks_delete_own"
-- on public.vibe_checks
-- for delete
-- using (user_id = auth.uid());


-- ----------------------------
-- user_favorites
-- ----------------------------
-- Users can read only their favorites
-- create policy "user_favorites_read_own"
-- on public.user_favorites
-- for select
-- using (user_id = auth.uid());

-- Users can insert/delete only their favorites
-- create policy "user_favorites_insert_own"
-- on public.user_favorites
-- for insert
-- with check (user_id = auth.uid());

-- create policy "user_favorites_delete_own"
-- on public.user_favorites
-- for delete
-- using (user_id = auth.uid());

