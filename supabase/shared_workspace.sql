  -- Share BUDO Studio data across all authenticated accounts.
  -- Run once after schema.sql and template_customization.sql.
  -- The server's BUDO_WORKSPACE_ID must match the ID below.

  begin;

  -- Merge user-scoped appearance preferences and custom belt lists. For duplicate
  -- config keys, the most recently updated workspace's value takes precedence.
  with configs as (
    select workspace_id, config, created_at, updated_at
    from public.workspace_preferences
  ), merged_config as (
    select coalesce(jsonb_object_agg(entry.key, entry.value order by configs.updated_at, configs.workspace_id), '{}'::jsonb) as value
    from configs
    cross join lateral jsonb_each(configs.config) as entry(key, value)
  ), merged_belts as (
    select coalesce(jsonb_agg(belt order by belt->>'id'), '[]'::jsonb) as value
    from (
      select distinct on (coalesce(belt->>'id', belt->>'name')) belt
      from configs
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(configs.config->'customBelts') = 'array'
          then configs.config->'customBelts' else '[]'::jsonb end
      ) as belt_items(belt)
      order by coalesce(belt->>'id', belt->>'name'), configs.updated_at desc, configs.workspace_id desc
    ) as deduplicated
  ), timestamps as (
    select min(created_at) as created_at, max(updated_at) as updated_at
    from configs
  )
  insert into public.workspace_preferences (workspace_id, config, created_at, updated_at)
  select 'budo-studio-shared',
        merged_config.value || jsonb_build_object('customBelts', merged_belts.value),
        coalesce(timestamps.created_at, now()),
        coalesce(timestamps.updated_at, now())
  from merged_config cross join merged_belts cross join timestamps
  on conflict (workspace_id) do update
  set config = excluded.config,
      updated_at = greatest(public.workspace_preferences.updated_at, excluded.updated_at);

  delete from public.workspace_preferences
  where workspace_id <> 'budo-studio-shared';

  -- Move existing records from every account/workspace into the shared workspace.
  update public.candidates
  set workspace_id = 'budo-studio-shared'
  where workspace_id <> 'budo-studio-shared';

  update public.template_presets
  set workspace_id = 'budo-studio-shared'
  where workspace_id <> 'budo-studio-shared';

  update public.template_assets
  set workspace_id = 'budo-studio-shared'
  where workspace_id <> 'budo-studio-shared';

  -- Authenticated users can collaborate on shared rows; RLS still blocks access
  -- to rows outside this one workspace. Keep the existing owner policies too.
  drop policy if exists candidates_shared_workspace_all on public.candidates;
  create policy candidates_shared_workspace_all on public.candidates
    for all to authenticated
    using ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared')
    with check ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared');

  drop policy if exists template_presets_shared_workspace_all on public.template_presets;
  create policy template_presets_shared_workspace_all on public.template_presets
    for all to authenticated
    using ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared')
    with check ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared');

  drop policy if exists template_assets_shared_workspace_all on public.template_assets;
  create policy template_assets_shared_workspace_all on public.template_assets
    for all to authenticated
    using ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared')
    with check ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared');

  drop policy if exists workspace_preferences_shared_workspace_all on public.workspace_preferences;
  create policy workspace_preferences_shared_workspace_all on public.workspace_preferences
    for all to authenticated
    using ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared')
    with check ((select auth.uid()) is not null and workspace_id = 'budo-studio-shared');

  notify pgrst, 'reload schema';

  commit;
