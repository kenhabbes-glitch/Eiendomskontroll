-- 016: «Full tilgang» for plattformadministrator (utviklermodus)
--
-- Når innstillingen full_tilgang er på, får plattformadministratorer skrivetilgang til ALLE eiendommer og
-- administratorrettigheter i ALLE organisasjoner – men bare når de er innlogget med tofaktor (aal2).
-- Ment for utvikling og testing. Slås av under Organisasjon og tilgang → Kunder (plattform) før kommersiell drift,
-- eller databehandleravtalen må opplyse om tilgangen.

create table if not exists public.plattform_innstilling (
  nokkel text primary key,
  verdi  jsonb not null,
  endret timestamptz not null default now(),
  endret_av uuid default auth.uid()
);
alter table public.plattform_innstilling enable row level security;
drop policy if exists plattform_innst_all on public.plattform_innstilling;
create policy plattform_innst_all on public.plattform_innstilling for all using (public.er_plattform_admin()) with check (public.er_plattform_admin());
insert into public.plattform_innstilling (nokkel, verdi) values ('full_tilgang', 'true'::jsonb) on conflict (nokkel) do nothing;

-- Har brukeren full tilgang nå? (plattformadmin + innstilling på + tofaktor for egen innlogging; tjenestekall har sjekket tofaktor selv)
create or replace function public.full_tilgang(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_uid is not null
    and coalesce((select plattform_admin and aktiv from profiles where id = p_uid), false)
    and coalesce((select verdi = 'true'::jsonb from plattform_innstilling where nokkel = 'full_tilgang'), false)
    and (auth.uid() is distinct from p_uid or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;
revoke all on function public.full_tilgang(uuid) from public, anon;
grant execute on function public.full_tilgang(uuid) to authenticated, service_role;

-- Tilgangsnivå per eiendom: full tilgang gir «skriv» på alle eiendommer
create or replace function public.niva_for(p_uid uuid, eid uuid) returns text
language sql stable security definer set search_path = public as $$
  with e as (select id, eier_org_id, portefolje_id from eiendommer where id = eid),
  m as (select m.* from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
        where m.user_id = p_uid and m.aktiv and o.aktiv and p.aktiv),
  tildelt as (select t.org_id, t.eiendom_id, t.portefolje_id from eiendom_tilgang t where t.user_id = p_uid),
  kand as (
    select 4 as n from e where public.full_tilgang(p_uid)
    union all
    select case when m.rolle in ('admin','forvalter') then 4 when m.rolle = 'tekniker' then 3 else 2 end as n
    from m, e where m.org_id = e.eier_org_id
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from tildelt t where t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
    union all
    select case o.rolle
             when 'forvalter' then case when m.rolle in ('admin','forvalter') then 4 when m.rolle = 'tekniker' then 3 else 2 end
             when 'drift' then case when m.rolle = 'leser' then 2 else 3 end
             when 'leser' then 2
             else 1 end
    from oppdrag o join m on m.org_id = o.org_id cross join e
    where o.aktiv and (o.fra is null or o.fra <= current_date) and (o.til is null or o.til >= current_date)
      and (o.eiendom_id = e.id or (o.portefolje_id is not null and o.portefolje_id = e.portefolje_id))
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from tildelt t where t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
  )
  select case max(n) when 4 then 'skriv' when 3 then 'drift' when 2 then 'les' when 1 then 'service' end from kand
$$;

-- Organisasjonsroller: full tilgang regnes som administrator i alle organisasjoner
create or replace function public.er_org_rolle(p_org uuid, p_roller text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.full_tilgang(auth.uid())
    or exists (select 1 from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
               where m.org_id = p_org and m.user_id = auth.uid() and m.aktiv and o.aktiv and p.aktiv and m.rolle = any(p_roller))
$$;
