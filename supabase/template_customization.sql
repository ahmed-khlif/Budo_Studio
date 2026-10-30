-- BUDO Studio template customization upgrade.
-- Run this once in Supabase SQL Editor.
-- The editor stores every movable zone and its styling in template_presets.config.
-- JSONB keeps the model extensible: new element types do not require a new column.

alter table public.template_presets
  add column if not exists config jsonb not null default '{}'::jsonb;

-- Ensure older rows have usable values.
update public.template_presets
set config = '{}'::jsonb
where config is null;

create index if not exists template_presets_config_gin_idx
  on public.template_presets using gin (config);

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
