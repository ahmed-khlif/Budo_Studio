-- BUDO Studio persistence foundation.
-- Run this in the Supabase SQL editor before setting SUPABASE_URL and
-- SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) in the server environment.

create extension if not exists pgcrypto;

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  name text not null,
  birth text,
  obtained text,
  serial text,
  belt text,
  kyu text,
  exam_date text,
  ordinal text,
  origin text not null default 'Manual',
  status text not null default 'incomplete' check (status in ('ready', 'incomplete', 'archived')),
  source_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidates_workspace_created_idx on public.candidates (workspace_id, created_at desc);
create index if not exists candidates_workspace_belt_idx on public.candidates (workspace_id, belt);

create table if not exists public.template_presets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  name text not null,
  belt text,
  description text,
  config jsonb not null default '{}'::jsonb,
  preview_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists template_presets_workspace_updated_idx on public.template_presets (workspace_id, updated_at desc);
create index if not exists template_presets_workspace_belt_updated_idx on public.template_presets (workspace_id, belt, updated_at desc);
create index if not exists template_presets_config_gin_idx on public.template_presets using gin (config);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'template_presets_config_object_check'
      and conrelid = 'public.template_presets'::regclass
  ) then
    alter table public.template_presets
      add constraint template_presets_config_object_check
      check (jsonb_typeof(config) = 'object');
  end if;
end;
$$;

create table if not exists public.template_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'default',
  belt text,
  name text not null,
  cloudinary_url text not null,
  cloudinary_public_id text not null,
  preview_url text,
  resource_type text not null default 'image',
  mime_type text,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

alter table public.template_assets add column if not exists preview_url text;
alter table public.template_assets add column if not exists resource_type text not null default 'image';
alter table public.template_assets add column if not exists mime_type text;

create index if not exists template_assets_workspace_belt_idx on public.template_assets (workspace_id, belt);

-- Expose the tables to Supabase's Data API while RLS remains the row-level gate.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.candidates to authenticated;
grant select, insert, update, delete on public.template_presets to authenticated;
grant select, insert, update, delete on public.template_assets to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.candidates to service_role;
grant select, insert, update, delete on public.template_presets to service_role;
grant select, insert, update, delete on public.template_assets to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists candidates_touch_updated_at on public.candidates;
create trigger candidates_touch_updated_at before update on public.candidates
for each row execute function public.touch_updated_at();

drop trigger if exists template_presets_touch_updated_at on public.template_presets;
create trigger template_presets_touch_updated_at before update on public.template_presets
for each row execute function public.touch_updated_at();

-- The API uses the service role server-side. Keep RLS enabled so a future
-- browser client can be switched to authenticated workspace policies safely.
alter table public.candidates enable row level security;
alter table public.template_presets enable row level security;
alter table public.template_assets enable row level security;

drop policy if exists candidates_owner_select on public.candidates;
create policy candidates_owner_select on public.candidates for select to authenticated
using (workspace_id = auth.uid()::text);
drop policy if exists candidates_owner_insert on public.candidates;
create policy candidates_owner_insert on public.candidates for insert to authenticated
with check (workspace_id = auth.uid()::text);
drop policy if exists candidates_owner_update on public.candidates;
create policy candidates_owner_update on public.candidates for update to authenticated
using (workspace_id = auth.uid()::text) with check (workspace_id = auth.uid()::text);
drop policy if exists candidates_owner_delete on public.candidates;
create policy candidates_owner_delete on public.candidates for delete to authenticated
using (workspace_id = auth.uid()::text);

drop policy if exists template_presets_owner_select on public.template_presets;
create policy template_presets_owner_select on public.template_presets for select to authenticated
using (workspace_id = auth.uid()::text);
drop policy if exists template_presets_owner_insert on public.template_presets;
create policy template_presets_owner_insert on public.template_presets for insert to authenticated
with check (workspace_id = auth.uid()::text);
drop policy if exists template_presets_owner_update on public.template_presets;
create policy template_presets_owner_update on public.template_presets for update to authenticated
using (workspace_id = auth.uid()::text) with check (workspace_id = auth.uid()::text);
drop policy if exists template_presets_owner_delete on public.template_presets;
create policy template_presets_owner_delete on public.template_presets for delete to authenticated
using (workspace_id = auth.uid()::text);

drop policy if exists template_assets_owner_select on public.template_assets;
create policy template_assets_owner_select on public.template_assets for select to authenticated
using (workspace_id = auth.uid()::text);
drop policy if exists template_assets_owner_insert on public.template_assets;
create policy template_assets_owner_insert on public.template_assets for insert to authenticated
with check (workspace_id = auth.uid()::text);
drop policy if exists template_assets_owner_delete on public.template_assets;
create policy template_assets_owner_delete on public.template_assets for delete to authenticated
using (workspace_id = auth.uid()::text);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candidates') then
      execute 'alter publication supabase_realtime add table public.candidates';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'template_presets') then
      execute 'alter publication supabase_realtime add table public.template_presets';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'template_assets') then
      execute 'alter publication supabase_realtime add table public.template_assets';
    end if;
  end if;
end;
$$;

-- Add authenticated workspace policies before exposing the Supabase anon key
-- to production users. The Express API uses the service role server-side;
-- it does not expose that secret to the React bundle.

-- Account-scoped UI preferences and custom belt definitions used by the
-- compatibility API. The JSON object remains extensible without new columns.
create table if not exists public.workspace_preferences (
  workspace_id text primary key,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_preferences_config_object_check check (jsonb_typeof(config) = 'object')
);

create index if not exists workspace_preferences_updated_idx
  on public.workspace_preferences (updated_at desc);

grant select, insert, update, delete on public.workspace_preferences to authenticated;
grant select, insert, update, delete on public.workspace_preferences to service_role;

alter table public.workspace_preferences enable row level security;

drop policy if exists workspace_preferences_owner_select on public.workspace_preferences;
create policy workspace_preferences_owner_select on public.workspace_preferences for select to authenticated
using (workspace_id = auth.uid()::text);
drop policy if exists workspace_preferences_owner_insert on public.workspace_preferences;
create policy workspace_preferences_owner_insert on public.workspace_preferences for insert to authenticated
with check (workspace_id = auth.uid()::text);
drop policy if exists workspace_preferences_owner_update on public.workspace_preferences;
create policy workspace_preferences_owner_update on public.workspace_preferences for update to authenticated
using (workspace_id = auth.uid()::text) with check (workspace_id = auth.uid()::text);

drop trigger if exists workspace_preferences_touch_updated_at on public.workspace_preferences;
create trigger workspace_preferences_touch_updated_at before update on public.workspace_preferences
for each row execute function public.touch_updated_at();
