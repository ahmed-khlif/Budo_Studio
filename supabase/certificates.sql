-- BUDO Studio issued certificate verification records.
-- Run after schema.sql and shared_workspace.sql.
-- Public verification is served by the backend through the token hash; the
-- raw verification token is never stored in this table.

begin;

create table if not exists public.issued_certificates (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  candidate_id text,
  -- Stable server-generated identity for the same candidate/data/template.
  -- The raw QR token is still never stored.
  issue_key text,
  token_hash text not null unique,
  public_code text not null unique,
  name text not null,
  belt text not null default '',
  kyu text,
  exam_date text,
  obtained text,
  serial text not null default '',
  status text not null default 'active' check (status in ('active', 'revoked')),
  preview_url text,
  template_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(template_snapshot) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.issued_certificates
  add column if not exists issue_key text;

create index if not exists issued_certificates_workspace_issued_idx
  on public.issued_certificates (workspace_id, issued_at desc);

create index if not exists issued_certificates_workspace_candidate_idx
  on public.issued_certificates (workspace_id, candidate_id);

create index if not exists issued_certificates_active_idx
  on public.issued_certificates (workspace_id, status)
  where status = 'active';

create unique index if not exists issued_certificates_active_issue_key_uidx
  on public.issued_certificates (workspace_id, issue_key)
  where status = 'active' and issue_key is not null;

grant usage on schema public to service_role;
grant select, insert, update on public.issued_certificates to service_role;

alter table public.issued_certificates enable row level security;

drop policy if exists issued_certificates_service_role_only on public.issued_certificates;
create policy issued_certificates_service_role_only on public.issued_certificates
  for all to service_role
  using (true)
  with check (true);

drop trigger if exists issued_certificates_touch_updated_at on public.issued_certificates;
create trigger issued_certificates_touch_updated_at
  before update on public.issued_certificates
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';

commit;
