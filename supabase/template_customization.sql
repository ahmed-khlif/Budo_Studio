-- BUDO Studio template customization upgrade.
-- Run this once in Supabase SQL Editor.
-- The editor stores every movable zone and its styling in template_presets.config.
-- JSONB keeps the model extensible: new element types do not require a new column.

alter table public.template_presets
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Keep the candidate belt available for the editor's "Ceinture" field.
alter table public.candidates
  add column if not exists belt text;

create index if not exists candidates_workspace_belt_idx
  on public.candidates (workspace_id, belt);

-- Cloudinary template uploads use these fields for PDF previews and metadata.
alter table public.template_assets
  add column if not exists preview_url text;

alter table public.template_assets
  add column if not exists resource_type text not null default 'image';

alter table public.template_assets
  add column if not exists mime_type text;

-- The editor keeps its evolving configuration in JSONB so new controls do
-- not require a database migration. Current config shape:
-- {
--   "version": 2,
--   "belt": "أصفر",
--   "beltMeta": {"id": "custom_violet", "swatches": ["#7b61a8"], "kyu": ""},
--   "size": {"width": 645.75, "height": 936.75},
--   "backgroundUrl": "https://...",
--   "fields": [{
--     "id": "name", "source": "name", "x": 268, "y": 482,
--     "w": 385, "h": 50, "size": 41, "color": "#BD001C",
--     "family": "Mirza", "autoFit": true,
--     "brightness": 100, "glow": 0, "glowColor": "#ffffff",
--     "shadow": 0, "shadowColor": "#000000"
--   }, {
--     "id": "belt", "source": "belt", "label": "Ceinture",
--     "x": 320, "y": 620, "w": 260, "h": 45,
--     "size": 30, "color": "#BD001C", "autoFit": true
--   }]
-- }

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

-- Ensure older rows have usable values.
update public.template_presets
set config = '{}'::jsonb
where config is null;

create index if not exists template_presets_config_gin_idx
  on public.template_presets using gin (config);

create index if not exists template_presets_workspace_belt_updated_idx
  on public.template_presets (workspace_id, belt, updated_at desc);

grant select, insert, update, delete on public.template_presets to authenticated;
grant select, insert, update, delete on public.template_presets to service_role;

alter table public.template_presets enable row level security;

drop policy if exists template_presets_owner_select on public.template_presets;
create policy template_presets_owner_select on public.template_presets
  for select to authenticated
  using (workspace_id = auth.uid()::text);

drop policy if exists template_presets_owner_insert on public.template_presets;
create policy template_presets_owner_insert on public.template_presets
  for insert to authenticated
  with check (workspace_id = auth.uid()::text);

drop policy if exists template_presets_owner_update on public.template_presets;
create policy template_presets_owner_update on public.template_presets
  for update to authenticated
  using (workspace_id = auth.uid()::text)
  with check (workspace_id = auth.uid()::text);

drop policy if exists template_presets_owner_delete on public.template_presets;
create policy template_presets_owner_delete on public.template_presets
  for delete to authenticated
  using (workspace_id = auth.uid()::text);

-- Refresh PostgREST's schema cache after the migration.
notify pgrst, 'reload schema';
