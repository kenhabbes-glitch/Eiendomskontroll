-- 018: Befaringsmodul
--
-- * befaringer: én befaring på en eiendom (forbefaring, overtakelse, tilbakelevering, HMS, energi, garanti …).
--   Sjekkpunkter, tegningsmarkeringer, deltakere og funn ligger i data (jsonb). Funn blir vanlige avvik
--   (tabellen avvik, data.befaringId) slik at ansvar, frist, status og arbeidsordre følges opp som før.
-- * bef_signatur: signaturer på befaringsrapporter. Skrives bare av serveren (Netlify-funksjonen med
--   service-nøkkel) etter kontroll av engangskode. Innloggede kan lese, ingen kan endre eller slette.
-- * Modulen «befaring» hos eieren av eiendommen kreves for å opprette og endre befaringer.

create table if not exists public.befaringer (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists befaringer_eiendom_idx on public.befaringer(eiendom_id);
drop trigger if exists befaringer_updated on public.befaringer;
create trigger befaringer_updated before update on public.befaringer for each row execute function public.sett_updated_at();

alter table public.befaringer enable row level security;
grant select, insert, update, delete on public.befaringer to authenticated;

-- Drift (kanDrifte) kan gjennomføre befaringer; sletting krever skrivetilgang
drop policy if exists bef_select on public.befaringer;
create policy bef_select on public.befaringer for select using (public.har_eiendom(eiendom_id));
drop policy if exists bef_insert on public.befaringer;
create policy bef_insert on public.befaringer for insert with check (public.niva_for(auth.uid(), eiendom_id) in ('skriv', 'drift'));
drop policy if exists bef_update on public.befaringer;
create policy bef_update on public.befaringer for update using (public.niva_for(auth.uid(), eiendom_id) in ('skriv', 'drift')) with check (public.niva_for(auth.uid(), eiendom_id) in ('skriv', 'drift'));
drop policy if exists bef_delete on public.befaringer;
create policy bef_delete on public.befaringer for delete using (public.kan_redigere(eiendom_id));

drop policy if exists mfa on public.befaringer;
create policy mfa on public.befaringer as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

drop policy if exists bef_modul_ins on public.befaringer;
create policy bef_modul_ins on public.befaringer as restrictive for insert to authenticated with check (public.eiendom_har_modul(eiendom_id, 'befaring'));
drop policy if exists bef_modul_upd on public.befaringer;
create policy bef_modul_upd on public.befaringer as restrictive for update to authenticated using (public.eiendom_har_modul(eiendom_id, 'befaring'));

-- Signaturer (bare serveren skriver)
create table if not exists public.bef_signatur (
  id uuid primary key default gen_random_uuid(),
  befaring_id uuid not null references public.befaringer(id) on delete cascade,
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  part_id text not null,
  navn text not null,
  epost text,
  rolle text,
  dok_hash text not null,          -- SHA-256 av rapporten (PDF) som ble signert
  metode text not null default 'epost_kode',
  ip text,
  nettleser text,
  signatur_bilde text,             -- tegnet signatur (PNG som data-URL), valgfri
  signert_at timestamptz not null default now()
);
create index if not exists bef_signatur_bef_idx on public.bef_signatur(befaring_id);
alter table public.bef_signatur enable row level security;
grant select on public.bef_signatur to authenticated;
drop policy if exists bef_sig_select on public.bef_signatur;
create policy bef_sig_select on public.bef_signatur for select using (public.har_eiendom(eiendom_id));
drop policy if exists mfa on public.bef_signatur;
create policy mfa on public.bef_signatur as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Endringer logges og sendes i sanntid som de andre tabellene
do $$ begin
  if exists (select 1 from pg_proc where proname = 'logg_endring') then
    execute 'drop trigger if exists befaringer_logg on public.befaringer';
    execute 'create trigger befaringer_logg after insert or update or delete on public.befaringer for each row execute function public.logg_endring()';
  end if;
  begin execute 'alter publication supabase_realtime add table public.befaringer'; exception when duplicate_object or undefined_object then null; end;
end $$;

-- Nye organisasjoner får også befaringsmodulen i prøveperioden
create or replace function public.org_modul_prove() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into org_modul (org_id, modul, prove_til, merknad)
  select new.id, m, current_date + 30, 'Prøveperiode' from unnest(array['brannvern','vedlikehold','prosjekter','tilsyn','dokumentlesing','rapporter','befaring']) m
  on conflict do nothing;
  return new;
end $$;
