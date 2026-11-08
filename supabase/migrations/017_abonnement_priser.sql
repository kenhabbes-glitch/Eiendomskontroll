-- 017: Priser, abonnementstrinn (enbruker/flerbruker) og bestilling av moduler
--
-- * Prisene ligger i plattform_innstilling (nøkkel 'priser') og kan leses av alle innloggede. Bare plattformadmin endrer.
-- * organisasjoner.abonnement_trinn: 'en' (én bruker) eller 'fler'. Tom = ikke satt (prøveperiode/eksisterende) – ingen grense.
--   Bare plattformadmin kan endre trinnet (sperret med trigger, siden org-admin ellers kan oppdatere egen organisasjon).
-- * modul_bestilling: kundens administrator bestiller en modul; plattformadmin behandler.

alter table public.organisasjoner add column if not exists abonnement_trinn text check (abonnement_trinn in ('en','fler'));

create or replace function public.org_trinn_vern() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.abonnement_trinn is distinct from old.abonnement_trinn and auth.uid() is not null and not public.er_plattform_admin() then
    raise exception 'Bare leverandøren kan endre abonnementet';
  end if;
  return new;
end $$;
drop trigger if exists org_trinn_vern on public.organisasjoner;
create trigger org_trinn_vern before update on public.organisasjoner for each row execute function public.org_trinn_vern();

drop policy if exists plattform_innst_priser on public.plattform_innstilling;
create policy plattform_innst_priser on public.plattform_innstilling for select to authenticated using (nokkel = 'priser');

create table if not exists public.modul_bestilling (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisasjoner(id) on delete cascade,
  modul text not null check (modul ~ '^[a-z_]{2,30}$'),
  trinn text check (trinn in ('en','fler')),
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
