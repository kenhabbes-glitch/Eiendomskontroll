-- 017: Priser per bruker med rabatttrapp, antall brukerlisenser per kunde, og bestilling av moduler
--
-- * Prisene ligger i plattform_innstilling (nøkkel 'priser') og kan leses av alle innloggede. Bare plattformadmin endrer.
-- * organisasjoner.lisenser: antall brukere kunden betaler for. Tom = ikke satt (prøveperiode/eksisterende) – ingen grense.
--   Kundens administrator endrer antallet selv via sett_lisenser() (ikke under antall aktive brukere). Endringer logges.
--   Direkte oppdatering av feltet er sperret for alle andre enn plattformadmin.
-- * modul_bestilling: kundens administrator bestiller en modul; plattformadmin aktiverer.

alter table public.organisasjoner add column if not exists lisenser int check (lisenser between 1 and 1000);

create or replace function public.org_lisens_vern() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lisenser is distinct from old.lisenser and auth.uid() is not null and not public.er_plattform_admin()
     and coalesce(current_setting('ek.lisens_ok', true), '') <> '1' then
    raise exception 'Antall brukere endres under Abonnement';
  end if;
  return new;
end $$;
drop trigger if exists org_lisens_vern on public.organisasjoner;
create trigger org_lisens_vern before update on public.organisasjoner for each row execute function public.org_lisens_vern();

create or replace function public.sett_lisenser(p_org uuid, p_antall int) returns int
language plpgsql security definer set search_path = public as $$
declare aktive int; gml int; navn text;
begin
  if not (public.er_org_admin(p_org) or public.er_plattform_admin()) then raise exception 'Bare administrator i organisasjonen kan endre antall brukere'; end if;
  if p_antall is null or p_antall < 1 or p_antall > 1000 then raise exception 'Antall brukere må være mellom 1 og 1000'; end if;
  select count(*) into aktive from org_medlem where org_id = p_org and aktiv;
  if p_antall < aktive then raise exception 'Organisasjonen har % aktive brukere. Deaktiver brukere før du reduserer antallet.', aktive; end if;
  select lisenser into gml from organisasjoner where id = p_org;
  perform set_config('ek.lisens_ok', '1', true);
  update organisasjoner set lisenser = p_antall where id = p_org;
  perform set_config('ek.lisens_ok', '', true);
  select coalesce(p.navn, p.epost) into navn from profiles p where p.id = auth.uid();
  insert into hendelseslogg (bruker_id, bruker, tabell, handling, org_id, tekst)
  values (auth.uid(), navn, 'hendelse', 'abonnement', p_org, format('Antall brukerlisenser endret fra %s til %s', coalesce(gml::text, 'ikke satt'), p_antall));
  return p_antall;
end $$;
revoke all on function public.sett_lisenser(uuid, int) from public, anon;
grant execute on function public.sett_lisenser(uuid, int) to authenticated;

drop policy if exists plattform_innst_priser on public.plattform_innstilling;
create policy plattform_innst_priser on public.plattform_innstilling for select to authenticated using (nokkel = 'priser');

create table if not exists public.modul_bestilling (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisasjoner(id) on delete cascade,
  modul text not null check (modul ~ '^[a-z_]{2,30}$'),
  kommentar text check (length(kommentar) <= 1000),
  status text not null default 'ny' check (status in ('ny','aktivert','avvist')),
  bestilt_av uuid default auth.uid(),
  bestilt_av_navn text,
  opprettet timestamptz not null default now(),
  behandlet timestamptz
);
create index if not exists modul_bestilling_org_idx on public.modul_bestilling(org_id);
alter table public.modul_bestilling enable row level security;
drop policy if exists bestilling_select on public.modul_bestilling;
create policy bestilling_select on public.modul_bestilling for select using (public.er_plattform_admin() or public.er_org_admin(org_id));
drop policy if exists bestilling_insert on public.modul_bestilling;
create policy bestilling_insert on public.modul_bestilling for insert with check (public.er_org_admin(org_id) and status = 'ny');
drop policy if exists bestilling_update on public.modul_bestilling;
create policy bestilling_update on public.modul_bestilling for update using (public.er_plattform_admin()) with check (public.er_plattform_admin());
drop policy if exists bestilling_delete on public.modul_bestilling;
create policy bestilling_delete on public.modul_bestilling for delete using (public.er_plattform_admin());
