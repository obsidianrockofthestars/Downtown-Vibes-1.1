-- Version gating infrastructure for Downtown Vibes 1.5.0.
--
-- Problem: on 2026-04-24, version 1.4.4 shipped to the App Store with a
-- critical blank-map bug. We had no way to accelerate user upgrades to the
-- hotfix (1.4.5) beyond "hope Apple expedites the replacement." This table
-- gives us two capabilities:
--
--   1. Soft prompt — client reads `latest` and nudges users onto it with
--      a 24h-cooldown dismissable modal ("Update available"). Non-blocking.
--
--   2. Hard gate — client reads `minRequired` and, if the running version is
--      below, shows a blocking modal that cannot be dismissed ("Update
--      required to continue"). Flip this flag in a crisis; takes effect on
--      next app launch with no code deploy.
--
-- The payload is a single JSONB document keyed as `app_version`. Mobile
-- clients read this row on boot; it needs to be fast and cacheable.
--
-- RLS: anon + authenticated can SELECT. No one can INSERT/UPDATE/DELETE from
-- the client — changes happen via the Supabase dashboard (Dylan manually)
-- or via authenticated admin requests through server infrastructure later.

create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.app_config is
  'Read-only configuration for mobile clients. Update values via the Supabase dashboard. Clients fetch this on app launch.';

alter table public.app_config enable row level security;

drop policy if exists "app_config_select_all" on public.app_config;
create policy "app_config_select_all"
  on public.app_config
  for select
  to anon, authenticated
  using (true);

insert into public.app_config (key, value, description)
values (
  'app_version',
  jsonb_build_object(
    'ios', jsonb_build_object(
      'latest',          '1.4.5',
      'minRecommended',  '1.4.5',
      'minRequired',     '1.4.4',
      'storeUrl',        'https://apps.apple.com/app/id6761736773'
    ),
    'android', jsonb_build_object(
      'latest',          '1.4.5',
      'minRecommended',  '1.4.5',
      'minRequired',     '1.4.4',
      'storeUrl',        'https://play.google.com/store/apps/details?id=com.potionsandfamiliars.downtownvibes'
    )
  ),
  'Per-platform version gating. latest = most recent release. minRecommended = versions below show a soft nudge. minRequired = versions below show a hard blocking gate. Bump minRequired ONLY in a crisis; every user on a lower version gets locked out until they update.'
)
on conflict (key) do nothing;

create or replace function public.app_config_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_config_set_updated_at on public.app_config;
create trigger app_config_set_updated_at
  before update on public.app_config
  for each row
  execute function public.app_config_touch_updated_at();
