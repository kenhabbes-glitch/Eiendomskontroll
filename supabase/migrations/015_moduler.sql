-- 015: Moduler og abonnement per organisasjon
--
-- * Kjernen (eiendommer, TFM, dokumenter, kontrollplan, avvik, leietakere) er alltid med og lagres ikke.
-- * org_modul: hvilke tilleggsmoduler en organisasjon har, med prøveperiode og sluttdato.
--   Bare plattformadministrator kan endre; medlemmene kan lese sin egen organisasjons moduler.
-- * Modulene til EIEREN av en eiendom gjelder for eiendommen – også for forvalter/drift/service som jobber på den.
-- * Eksisterende organisasjoner får alle moduler (ingen endring for dem). Nye får 30 dagers prøveperiode på alt.

create table if not exists public.org_modul (
  org_id    uuid not null references public.organisasjoner(id) on delete cascade,
  modul     text not null check (modul ~ '^[a-z_]{2,30}$' and modul <> 'kjerne'),
  aktiv     boolean not null default true,
  prove_til date,                       -- satt = prøveperiode som utløper denne datoen
  til       date,                       -- satt = oppsagt, gjelder til og med denne datoen
  merknad   text,
  endret    timestamptz not null default now(),
  endret_av uuid default auth.uid(),
  primary key (org_id, modul)
);
alter table public.org_modul enable row level security;

drop policy if exists org_modul_select on public.org_modul;
create policy org_modul_select on public.org_modul for select using (public.er_plattform_admin() or public.er_medlem(org_id));
drop policy if exists org_modul_write on public.org_modul;
create policy org_modul_write on public.org_modul for all using (public.er_plattform_admin()) with check (public.er_plattform_admin());

create or replace function public.har_modul(p_org uuid, p_modul text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_modul = 'kjerne' or p_org is null or exists (
    select 1 from org_modul m where m.org_id = p_org and m.modul = p_modul and m.aktiv
      and (m.til is null or m.til >= current_date) and (m.prove_til is null or m.prove_til >= current_date))
$$;

create or replace function public.eiendom_har_modul(p_eid uuid, p_modul text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.har_modul((select eier_org_id from eiendommer where id = p_eid), p_modul)
$$;

-- Moduler for organisasjonene brukeren er medlem av, og for eierne av eiendommene brukeren har tilgang til
create or replace function public.mine_moduler() returns table (org_id uuid, modul text, prove_til date, til date)
language sql stable security definer set search_path = public as $$
  with o as (
    select m.org_id from org_medlem m where m.user_id = auth.uid() and m.aktiv
    union select e.eier_org_id from eiendommer e where e.eier_org_id is not null and public.har_eiendom(e.id)
  )
  select m.org_id, m.modul, m.prove_til, m.til from org_modul m join o on o.org_id = m.org_id
  where auth.uid() is not null and m.aktiv and (m.til is null or m.til >= current_date) and (m.prove_til is null or m.prove_til >= current_date)
$$;

revoke all on function public.har_modul(uuid, text), public.eiendom_har_modul(uuid, text), public.mine_moduler() from public, anon;
grant execute on function public.har_modul(uuid, text), public.eiendom_har_modul(uuid, text), public.mine_moduler() to authenticated, service_role;

-- Håndheving i databasen: nye/endrede prosjekter krever prosjektmodulen hos eieren av eiendommen
drop policy if exists prosj_modul_ins on public.prosjekter;
create policy prosj_modul_ins on public.prosjekter as restrictive for insert to authenticated with check (public.eiendom_har_modul(eiendom_id, 'prosjekter'));
drop policy if exists prosj_modul_upd on public.prosjekter;
create policy prosj_modul_upd on public.prosjekter as restrictive for update to authenticated using (public.eiendom_har_modul(eiendom_id, 'prosjekter'));

-- Eksisterende organisasjoner: alle moduler
insert into public.org_modul (org_id, modul, merknad)
select o.id, m, 'Eksisterende kunde ved innføring av moduler' from public.organisasjoner o
cross join unnest(array['brannvern','vedlikehold','prosjekter','tilsyn','dokumentlesing','rapporter']) m
on conflict do nothing;

-- Nye organisasjoner: 30 dagers prøveperiode på alle moduler
create or replace function public.org_modul_prove() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into org_modul (org_id, modul, prove_til, merknad)
  select new.id, m, current_date + 30, 'Prøveperiode' from unnest(array['brannvern','vedlikehold','prosjekter','tilsyn','dokumentlesing','rapporter']) m
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists org_modul_prove on public.organisasjoner;
create trigger org_modul_prove after insert on public.organisasjoner for each row execute function public.org_modul_prove();
