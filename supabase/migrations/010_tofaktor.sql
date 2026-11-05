-- 010: Tofaktorinnlogging (TOTP via Supabase Auth MFA)
--
-- Regler (håndheves i databasen, ikke bare i appen):
--  * Har brukeren slått på tofaktor, må økten være bekreftet med kode (aal2) for å nå data.
--  * Administratorer og forvaltere i organisasjoner som krever tofaktor (standard), og
--    plattformadministratorer, må ha tofaktor – uten den når de ingen data.
--  * Leietakere, teknikere, lesere og eksterne (lenker uten innlogging) berøres ikke,
--    med mindre de selv har slått på tofaktor.

alter table public.organisasjoner add column if not exists krev_mfa boolean not null default true;

-- Krever regelverket tofaktor for innlogget bruker?
create or replace function public.mfa_kreves_for(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plattform_admin and aktiv from profiles where id = p_uid), false)
      or exists (select 1 from org_medlem m join organisasjoner o on o.id = m.org_id
                 where m.user_id = p_uid and m.aktiv and o.aktiv and o.krev_mfa and m.rolle in ('admin', 'forvalter'))
$$;

create or replace function public.mfa_har_faktor(p_uid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = p_uid and f.status = 'verified')
$$;

-- Er økten god nok? (brukes av tilgangsreglene)
create or replace function public.mfa_ok_for(p_uid uuid, p_aal text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_uid is null
      or coalesce(p_aal, '') = 'aal2'
      or (not public.mfa_har_faktor(p_uid) and not public.mfa_kreves_for(p_uid))
$$;

create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok_for(auth.uid(), auth.jwt() ->> 'aal')
$$;

-- Status for appen før data lastes
create or replace function public.mfa_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('kreves', public.mfa_kreves_for(auth.uid()), 'har', public.mfa_har_faktor(auth.uid()),
                            'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'))
$$;

-- Oversikt for organisasjonsadministrator: hvem i organisasjonen har tofaktor
create or replace function public.mfa_oversikt(p_org uuid) returns table (user_id uuid, har_mfa boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, public.mfa_har_faktor(m.user_id) from org_medlem m
  where m.org_id = p_org and (public.er_org_admin(p_org) or public.er_plattform_admin())
$$;

revoke execute on function public.mfa_kreves_for(uuid), public.mfa_har_faktor(uuid), public.mfa_ok_for(uuid, text) from public, anon, authenticated;
grant execute on function public.mfa_ok_for(uuid, text) to service_role;
revoke execute on function public.mfa_ok(), public.mfa_status(), public.mfa_oversikt(uuid) from public, anon;
grant execute on function public.mfa_ok(), public.mfa_status(), public.mfa_oversikt(uuid) to authenticated;

-- Begrensende regel på alle tabeller som har tilgangsregler
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
             and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname <> 'mfa')
  loop
    execute format('drop policy if exists mfa on public.%I', t.relname);
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $$;

-- Filer
drop policy if exists filer_mfa on storage.objects;
create policy filer_mfa on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'filer' or (select public.mfa_ok())) with check (bucket_id <> 'filer' or (select public.mfa_ok()));
