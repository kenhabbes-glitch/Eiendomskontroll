-- =====================================================================
-- Eiendomskontroll – innstillinger (KPI for prisjustering m.m.)
-- Kjør i Supabase: SQL Editor → New query → Lim inn → Run
-- =====================================================================
create table if not exists public.innstillinger (
  nokkel     text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.innstillinger enable row level security;

drop policy if exists innst_select on public.innstillinger;
create policy innst_select on public.innstillinger for select
  using (public.min_rolle() in ('admin','forvalter','tekniker'));

drop policy if exists innst_write on public.innstillinger;
create policy innst_write on public.innstillinger for all
  using (public.er_admin()) with check (public.er_admin());

drop trigger if exists innstillinger_updated on public.innstillinger;
create trigger innstillinger_updated before update on public.innstillinger
  for each row execute function public.sett_updated_at();

do $$ begin
  alter publication supabase_realtime add table public.innstillinger;
exception when duplicate_object then null;
end $$;
