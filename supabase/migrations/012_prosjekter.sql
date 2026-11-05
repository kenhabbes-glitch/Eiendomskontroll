-- 012: Prosjektmodul (fra små vedlikeholdsprosjekter til store rehabiliteringer)
-- Prosjektet ligger på en eiendom. Faser, oppgaver, budsjett, kostnader og FDV ligger i data (jsonb).
-- Arkivering av systemer/komponenter/kontroller skjer med feltet data.arkivert på de eksisterende tabellene.

create table if not exists public.prosjekter (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists prosjekter_eiendom_idx on public.prosjekter(eiendom_id);
drop trigger if exists prosjekter_updated on public.prosjekter;
create trigger prosjekter_updated before update on public.prosjekter for each row execute function public.sett_updated_at();

alter table public.prosjekter enable row level security;
grant select, insert, update, delete on public.prosjekter to authenticated;

drop policy if exists prosj_select on public.prosjekter;
create policy prosj_select on public.prosjekter for select using (public.har_eiendom(eiendom_id));
drop policy if exists prosj_insert on public.prosjekter;
create policy prosj_insert on public.prosjekter for insert with check (public.kan_redigere(eiendom_id));
drop policy if exists prosj_update on public.prosjekter;
create policy prosj_update on public.prosjekter for update using (public.kan_redigere(eiendom_id)) with check (public.kan_redigere(eiendom_id));
drop policy if exists prosj_delete on public.prosjekter;
create policy prosj_delete on public.prosjekter for delete using (public.kan_redigere(eiendom_id));

drop policy if exists mfa on public.prosjekter;
create policy mfa on public.prosjekter as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Endringer logges i hendelsesloggen som de andre tabellene
do $$ begin
  if exists (select 1 from pg_proc where proname = 'logg_endring') then
    execute 'drop trigger if exists prosjekter_logg on public.prosjekter';
    execute 'create trigger prosjekter_logg after insert or update or delete on public.prosjekter for each row execute function public.logg_endring()';
  end if;
  begin execute 'alter publication supabase_realtime add table public.prosjekter'; exception when duplicate_object or undefined_object then null; end;
end $$;
