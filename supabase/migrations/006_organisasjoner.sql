-- =====================================================================
-- 006: Flere kunder (organisasjoner) med isolasjon i databasen
--
-- Modell
--   organisasjoner  – kunde/firma: gårdeier, forvalterselskap, byggdrifter, servicefirma
--   org_medlem      – bruker i organisasjon med rolle (admin/forvalter/tekniker/leser) og evt. «alle bygg»
--   portefoljer     – gårdeiers gruppering av egne bygg
--   eiendommer      – eies av én organisasjon (eier_org_id), kan ligge i én portefølje
--   oppdrag         – gårdeier gir en annen organisasjon tilgang til et bygg eller en portefølje
--                     med rolle: forvalter (redigere), drift (hele bygget, utføre), service (bare tildelte systemer), leser
--   eiendom_tilgang – organisasjonens admin tildeler egne ansatte enkeltbygg/porteføljer
--
-- Tilgangsnivå per eiendom (niva): skriv > drift > les > service. Alle RLS-regler bygger på dette.
-- Plattformadministrator (leverandør) administrerer organisasjoner, men ser IKKE kundedata automatisk.
-- =====================================================================

-- ---------- Tabeller
create table if not exists public.organisasjoner (
  id uuid primary key default gen_random_uuid(),
  navn text not null,
  orgnr text,
  type text not null default 'eier' check (type in ('eier','forvalter','drift','service','annet')),
  aktiv boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  opprettet timestamptz not null default now()
);

create table if not exists public.org_medlem (
  org_id uuid not null references public.organisasjoner(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rolle text not null default 'leser' check (rolle in ('admin','forvalter','tekniker','leser')),
  alle_bygg boolean not null default false,
  aktiv boolean not null default true,
  opprettet timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_medlem_user_idx on public.org_medlem(user_id);

create table if not exists public.portefoljer (
  id uuid primary key default gen_random_uuid(),
  eier_org_id uuid not null references public.organisasjoner(id) on delete cascade,
  navn text not null,
  data jsonb not null default '{}'::jsonb,
  opprettet timestamptz not null default now()
);
create index if not exists portefoljer_org_idx on public.portefoljer(eier_org_id);

alter table public.eiendommer add column if not exists eier_org_id uuid references public.organisasjoner(id);
alter table public.eiendommer add column if not exists portefolje_id uuid references public.portefoljer(id) on delete set null;
create index if not exists eiendommer_org_idx on public.eiendommer(eier_org_id);
create index if not exists eiendommer_portefolje_idx on public.eiendommer(portefolje_id);

create table if not exists public.oppdrag (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisasjoner(id) on delete cascade,
  eiendom_id uuid references public.eiendommer(id) on delete cascade,
  portefolje_id uuid references public.portefoljer(id) on delete cascade,
  rolle text not null check (rolle in ('forvalter','drift','service','leser')),
  systemer uuid[] not null default '{}',
  fra date, til date,
  aktiv boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  opprettet timestamptz not null default now(),
  opprettet_av uuid,
  check ((eiendom_id is null) <> (portefolje_id is null))
);
create index if not exists oppdrag_org_idx on public.oppdrag(org_id);
create index if not exists oppdrag_eiendom_idx on public.oppdrag(eiendom_id);
create index if not exists oppdrag_portefolje_idx on public.oppdrag(portefolje_id);

-- Tildeling til enkeltpersoner: per eiendom eller portefølje, innenfor en organisasjon
alter table public.eiendom_tilgang drop constraint if exists eiendom_tilgang_pkey;
alter table public.eiendom_tilgang add column if not exists id uuid not null default gen_random_uuid();
alter table public.eiendom_tilgang add column if not exists org_id uuid references public.organisasjoner(id) on delete cascade;
alter table public.eiendom_tilgang add column if not exists portefolje_id uuid references public.portefoljer(id) on delete cascade;
alter table public.eiendom_tilgang alter column eiendom_id drop not null;
alter table public.eiendom_tilgang add primary key (id);
do $$ begin alter table public.eiendom_tilgang add constraint eiendom_tilgang_mal check ((eiendom_id is null) <> (portefolje_id is null)); exception when duplicate_object then null; end $$;
create unique index if not exists eiendom_tilgang_unik on public.eiendom_tilgang(user_id, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(eiendom_id, portefolje_id));

alter table public.profiles add column if not exists plattform_admin boolean not null default false;

-- Innstillinger og e-postoppsett per organisasjon
alter table public.innstillinger add column if not exists org_id uuid references public.organisasjoner(id) on delete cascade;
alter table public.epost_oppsett add column if not exists org_id uuid references public.organisasjoner(id) on delete cascade;

alter table public.hendelseslogg add column if not exists org_id uuid;

-- ---------- Kjernefunksjoner (security definer, låst søkesti)
create or replace function public.er_plattform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plattform_admin and aktiv from profiles where id = auth.uid()), false)
$$;
-- Bakoverkompatibel: «admin» betyr nå plattformadministrator
create or replace function public.er_admin() returns boolean
language sql stable security definer set search_path = public as $$ select public.er_plattform_admin() $$;

create or replace function public.er_org_rolle(p_org uuid, p_roller text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
                 where m.org_id = p_org and m.user_id = auth.uid() and m.aktiv and o.aktiv and p.aktiv and m.rolle = any(p_roller))
$$;
create or replace function public.er_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.er_org_rolle(p_org, array['admin']) $$;
create or replace function public.er_medlem(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.er_org_rolle(p_org, array['admin','forvalter','tekniker','leser']) $$;
create or replace function public.mine_org() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
  where m.user_id = auth.uid() and m.aktiv and o.aktiv and p.aktiv
$$;
create or replace function public.min_primar_org() returns uuid
language sql stable security definer set search_path = public as $$
  select m.org_id from org_medlem m join organisasjoner o on o.id = m.org_id
  where m.user_id = auth.uid() and m.aktiv and o.aktiv
  order by (m.rolle = 'admin') desc, (o.type = 'eier') desc, m.opprettet limit 1
$$;

-- Tilgangsnivå for en bruker på en eiendom: 'skriv' | 'drift' | 'les' | 'service' | null
create or replace function public.niva_for(p_uid uuid, eid uuid) returns text
language sql stable security definer set search_path = public as $$
  with e as (select id, eier_org_id, portefolje_id from eiendommer where id = eid),
  m as (select m.* from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
        where m.user_id = p_uid and m.aktiv and o.aktiv and p.aktiv),
  tildelt as (select t.org_id, t.eiendom_id, t.portefolje_id from eiendom_tilgang t where t.user_id = p_uid),
  kand as (
    -- som ansatt hos gårdeier
    select case when m.rolle in ('admin','forvalter') then 4 when m.rolle = 'tekniker' then 3 else 2 end as n
    from m, e where m.org_id = e.eier_org_id
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from tildelt t where t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
    union all
    -- som ansatt i et firma med aktivt oppdrag på bygget/porteføljen
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
create or replace function public.niva(eid uuid) returns text
language sql stable security definer set search_path = public as $$ select public.niva_for(auth.uid(), eid) $$;

-- Systemer en servicebruker har fått tildelt på eiendommen
create or replace function public.service_systemer(eid uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s), '{}') from (
    select unnest(o.systemer) s
    from oppdrag o join org_medlem m on m.org_id = o.org_id and m.user_id = auth.uid() and m.aktiv
    join organisasjoner org on org.id = o.org_id and org.aktiv
    join eiendommer e on e.id = eid
    where o.rolle = 'service' and o.aktiv and (o.fra is null or o.fra <= current_date) and (o.til is null or o.til >= current_date)
      and (o.eiendom_id = e.id or (o.portefolje_id is not null and o.portefolje_id = e.portefolje_id))
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from eiendom_tilgang t where t.user_id = auth.uid() and t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
  ) x
$$;
create or replace function public.er_service_system(eid uuid, sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select sid is not null and sid <> '' and sid = any(public.service_systemer(eid)::text[])
$$;

-- Eksisterende hjelpefunksjoner bygges om på nivå
create or replace function public.har_eiendom(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.niva(eid) in ('skriv','drift','les'), false) $$;
create or replace function public.kan_redigere(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.niva(eid) = 'skriv', false) $$;
create or replace function public.kan_drifte(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.niva(eid) in ('skriv','drift'), false) $$;
create or replace function public.har_service(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.niva(eid) = 'service', false) $$;

-- Hvilken organisasjon eier et oppdrag (via eiendom eller portefølje)
create or replace function public.oppdrag_eier(p_eid uuid, p_pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select eier_org_id from eiendommer where id = p_eid), (select eier_org_id from portefoljer where id = p_pid))
$$;
-- Har organisasjonen selv tilgang til eiendommen/porteføljen (som eier eller via oppdrag)?
create or replace function public.org_har(p_org uuid, p_eid uuid, p_pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.oppdrag_eier(p_eid, p_pid) = p_org
    or exists (select 1 from oppdrag o where o.org_id = p_org and o.aktiv
               and ((p_eid is not null and (o.eiendom_id = p_eid or o.portefolje_id = (select portefolje_id from eiendommer where id = p_eid)))
                 or (p_pid is not null and o.portefolje_id = p_pid)))
$$;

-- Liste over eiendommer brukeren har tilgang til, med nivå (brukes av appen)
create or replace function public.mine_tilganger() returns table (eiendom_id uuid, niva text)
language sql stable security definer set search_path = public as $$
  select e.id, public.niva(e.id) from eiendommer e where public.niva(e.id) is not null
$$;

-- Kan brukeren se en annen brukers profil?
create or replace function public.kan_se_profil(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid() or public.er_plattform_admin()
    or exists (select 1 from org_medlem a join org_medlem b on a.org_id = b.org_id where a.user_id = auth.uid() and a.aktiv and b.user_id = pid)
    or exists (select 1 from org_medlem b join oppdrag o on o.org_id = b.org_id where b.user_id = pid
               and ((o.eiendom_id is not null and public.kan_drifte(o.eiendom_id))
                 or (o.portefolje_id is not null and public.er_org_rolle(public.oppdrag_eier(null, o.portefolje_id), array['admin','forvalter']))))
    or exists (select 1 from avvik a where a.tildelt_id = pid and public.har_eiendom(a.eiendom_id))
    or exists (select 1 from profiles p where p.id = pid and p.leietaker_id is not null
               and exists (select 1 from leietakere l where l.id = p.leietaker_id and public.kan_redigere(l.eiendom_id)))
$$;

-- ---------- Integritet
-- Portefølje må tilhøre samme eier som eiendommen; eierskap kan bare flyttes av admin i begge organisasjoner
create or replace function public.eiendom_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.portefolje_id is not null and (select eier_org_id from portefoljer where id = new.portefolje_id) is distinct from new.eier_org_id then
    raise exception 'Porteføljen tilhører en annen eier';
  end if;
  if tg_op = 'UPDATE' and new.eier_org_id is distinct from old.eier_org_id and auth.uid() is not null then
    if not (public.er_plattform_admin() or (public.er_org_admin(old.eier_org_id) and public.er_org_admin(new.eier_org_id))) then
      raise exception 'Bare administrator i begge organisasjoner kan flytte en eiendom til en annen eier';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists eiendom_vakt on public.eiendommer;
create trigger eiendom_vakt before insert or update on public.eiendommer for each row execute function public.eiendom_vakt();

-- Den som oppretter en eiendom får den tildelt (slik at forvaltere uten «alle bygg» ser det de lager)
create or replace function public.eiendom_ny_tildeling() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into eiendom_tilgang (user_id, org_id, eiendom_id) values (auth.uid(), new.eier_org_id, new.id) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists eiendom_ny_tildeling on public.eiendommer;
create trigger eiendom_ny_tildeling after insert on public.eiendommer for each row execute function public.eiendom_ny_tildeling();

-- Hovedrolle i profilen (styrer menyene i appen) følger beste rolle i organisasjonene
create or replace function public.synk_hovedrolle() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(new.user_id, old.user_id); r text;
begin
  select case max(case m.rolle when 'admin' then 4 when 'forvalter' then 3 when 'tekniker' then 2 else 1 end)
           when 4 then 'admin' when 3 then 'forvalter' when 2 then 'tekniker' when 1 then 'tekniker' end
  into r from org_medlem m where m.user_id = uid and m.aktiv;
  update profiles set rolle = coalesce(r, case when rolle in ('leietaker','utforer') then rolle else 'ingen' end)
  where id = uid and (r is not null or rolle in ('admin','forvalter','tekniker'));
  return null;
end $$;
drop trigger if exists synk_hovedrolle on public.org_medlem;
create trigger synk_hovedrolle after insert or update or delete on public.org_medlem for each row execute function public.synk_hovedrolle();

-- Siste administrator i en organisasjon kan ikke fjernes eller nedgraderes
create or replace function public.org_admin_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rolle = 'admin' and old.aktiv and (tg_op = 'DELETE' or new.rolle <> 'admin' or not new.aktiv)
     and not exists (select 1 from org_medlem where org_id = old.org_id and user_id <> old.user_id and rolle = 'admin' and aktiv)
     and exists (select 1 from organisasjoner where id = old.org_id) then
    raise exception 'Organisasjonen må ha minst én administrator';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists org_admin_vakt on public.org_medlem;
create trigger org_admin_vakt before update or delete on public.org_medlem for each row execute function public.org_admin_vakt();

-- Avvik: utførende uten drift-tilgang kan bare endre utvalgte felt (oppdatert til nytt nivå)
create or replace function public.avvik_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare tillatt text[] := array['status','logg','vedlegg','utfort','startet'];
begin
  if auth.uid() is null or public.kan_drifte(old.eiendom_id) or public.er_service_system(old.eiendom_id, old.data->>'anleggId') then return new; end if;
  if old.tildelt_id is distinct from auth.uid() then raise exception 'Ingen tilgang'; end if;
  new.eiendom_id := old.eiendom_id; new.leietaker_id := old.leietaker_id; new.tildelt_id := old.tildelt_id; new.nr := old.nr;
  new.data := old.data || coalesce((select jsonb_object_agg(k, v) from jsonb_each(new.data) as e(k, v) where k = any(tillatt)), '{}'::jsonb);
  if (new.data->>'status') is distinct from (old.data->>'status')
     and coalesce(new.data->>'status','') not in ('Under utbedring','Utført – til kontroll') then
    new.data := jsonb_set(new.data, '{status}', coalesce(old.data->'status', '"Ny"'::jsonb));
  end if;
  return new;
end $$;

-- Hendelseslogg: også organisasjonsnivå
create or replace function public.logg_endring() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  r jsonb := coalesce(n, o);
  diff jsonb := '{}'::jsonb; k text; v jsonb; fra jsonb; navn text;
  eid uuid; oid uuid;
begin
  eid := case when tg_table_name = 'eiendommer' then (r->>'id')::uuid
              when r ? 'eiendom_id' then nullif(r->>'eiendom_id','')::uuid else null end;
  oid := case when tg_table_name = 'organisasjoner' then (r->>'id')::uuid
              when r ? 'eier_org_id' then nullif(r->>'eier_org_id','')::uuid
              when r ? 'org_id' then nullif(r->>'org_id','')::uuid
              when eid is not null then (select eier_org_id from eiendommer where id = eid) else null end;
  if tg_op = 'UPDATE' then
    for k, v in select * from jsonb_each(n - 'data' - 'updated_at' - 'created_at') loop
      if (o->k) is distinct from v then diff := diff || jsonb_build_object(k, jsonb_build_object('fra', o->k, 'til', v)); end if;
    end loop;
    for k, v in select * from jsonb_each(coalesce(n->'data','{}'::jsonb)) loop
      fra := o->'data'->k;
      if fra is distinct from v then
        if length(coalesce(fra::text,'')) + length(v::text) > 600 then diff := diff || jsonb_build_object(k, jsonb_build_object('endret', true));
        else diff := diff || jsonb_build_object(k, jsonb_build_object('fra', fra, 'til', v)); end if;
      end if;
    end loop;
    for k in select jsonb_object_keys(coalesce(o->'data','{}'::jsonb)) loop
      if not (coalesce(n->'data','{}'::jsonb) ? k) then diff := diff || jsonb_build_object(k, jsonb_build_object('fra', o->'data'->k, 'til', null)); end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
  end if;
  select coalesce(nullif(p.navn,''), p.epost) into navn from profiles p where p.id = auth.uid();
  insert into hendelseslogg (bruker_id, bruker, tabell, rad_id, eiendom_id, org_id, handling, tekst, endringer)
  values (auth.uid(), navn, tg_table_name, coalesce((r->>'id')::uuid, (r->>'user_id')::uuid), eid, oid,
          case tg_op when 'INSERT' then 'opprettet' when 'UPDATE' then 'endret' else 'slettet' end,
          coalesce(r->'data'->>'tittel', r->'data'->>'navn', r->>'navn', r->>'epost', r->>'rolle'),
          case when tg_op = 'UPDATE' then diff else null end);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['organisasjoner','org_medlem','portefoljer','oppdrag','eiendom_tilgang'] loop
    execute format('drop trigger if exists %I_logg on public.%I', t, t);
    execute format('create trigger %I_logg after insert or update or delete on public.%I for each row execute function public.logg_endring()', t, t);
  end loop;
end $$;

-- ---------- Fil-tilgang (sti: <eiendom_id>/...; leietaker: <eid>/leietaker/<lid>/...; arbeidsordre via ao_fil)
create or replace function public.kan_lese_fil(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  with x as (select split_part(p_name,'/',1) e1, split_part(p_name,'/',2) e2, split_part(p_name,'/',3) e3)
  select coalesce((
    select case
      when public.kan_redigere(e.id) then true
      when public.har_eiendom(e.id) then x.e2 <> 'leietaker'
      when public.har_service(e.id) then
        exists (select 1 from tegninger t where t.eiendom_id = e.id and t.data->'fil'->>'path' = p_name)
        or exists (select 1 from dokumenter d where d.eiendom_id = e.id and d.leietaker_id is null and d.data->'fil'->>'path' = p_name
                   and coalesce(d.data->'anleggIds','[]'::jsonb) ?| public.service_systemer(e.id)::text[])
      else false end
    from x join eiendommer e on e.id::text = x.e1), false)
  or (public.min_rolle() = 'leietaker' and split_part(p_name,'/',2) = 'leietaker' and split_part(p_name,'/',3) = public.mitt_leietaker_id()::text)
  or public.ao_fil(p_name)
$$;
create or replace function public.kan_skrive_fil(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.kan_drifte(e.id) or (public.har_service(e.id) and split_part(p_name,'/',2) <> 'leietaker')
                   from eiendommer e where e.id::text = split_part(p_name,'/',1)), false)
  or (public.min_rolle() = 'leietaker' and split_part(p_name,'/',2) = 'leietaker' and split_part(p_name,'/',3) = public.mitt_leietaker_id()::text)
  or public.ao_fil(p_name)
$$;

-- ---------- RLS: nye tabeller
alter table public.organisasjoner enable row level security;
alter table public.org_medlem enable row level security;
alter table public.portefoljer enable row level security;
alter table public.oppdrag enable row level security;

drop policy if exists org_select on public.organisasjoner;
create policy org_select on public.organisasjoner for select using (
  public.er_plattform_admin() or public.er_medlem(id)
  or exists (select 1 from eiendommer e where e.eier_org_id = organisasjoner.id and (public.har_eiendom(e.id) or public.har_service(e.id)))
  or exists (select 1 from oppdrag o where o.org_id = organisasjoner.id and public.er_org_rolle(public.oppdrag_eier(o.eiendom_id, o.portefolje_id), array['admin','forvalter'])));
drop policy if exists org_insert on public.organisasjoner;
create policy org_insert on public.organisasjoner for insert with check (public.er_plattform_admin());
drop policy if exists org_update on public.organisasjoner;
create policy org_update on public.organisasjoner for update using (public.er_plattform_admin() or public.er_org_admin(id)) with check (public.er_plattform_admin() or public.er_org_admin(id));
drop policy if exists org_delete on public.organisasjoner;
create policy org_delete on public.organisasjoner for delete using (public.er_plattform_admin());

drop policy if exists medlem_select on public.org_medlem;
create policy medlem_select on public.org_medlem for select using (user_id = auth.uid() or public.er_medlem(org_id) or public.er_plattform_admin());
drop policy if exists medlem_write on public.org_medlem;
create policy medlem_write on public.org_medlem for all using (public.er_org_admin(org_id) or public.er_plattform_admin()) with check (public.er_org_admin(org_id) or public.er_plattform_admin());

drop policy if exists portefolje_select on public.portefoljer;
create policy portefolje_select on public.portefoljer for select using (
  public.er_medlem(eier_org_id)
  or exists (select 1 from eiendommer e where e.portefolje_id = portefoljer.id and (public.har_eiendom(e.id) or public.har_service(e.id)))
  or exists (select 1 from oppdrag o where o.portefolje_id = portefoljer.id and public.er_medlem(o.org_id)));
drop policy if exists portefolje_write on public.portefoljer;
create policy portefolje_write on public.portefoljer for all using (public.er_org_rolle(eier_org_id, array['admin','forvalter'])) with check (public.er_org_rolle(eier_org_id, array['admin','forvalter']));

drop policy if exists oppdrag_select on public.oppdrag;
create policy oppdrag_select on public.oppdrag for select using (public.er_medlem(org_id) or public.er_org_rolle(public.oppdrag_eier(eiendom_id, portefolje_id), array['admin','forvalter']));
drop policy if exists oppdrag_write on public.oppdrag;
create policy oppdrag_write on public.oppdrag for all using (public.er_org_rolle(public.oppdrag_eier(eiendom_id, portefolje_id), array['admin','forvalter']))
  with check (public.er_org_rolle(public.oppdrag_eier(eiendom_id, portefolje_id), array['admin','forvalter']) and org_id <> public.oppdrag_eier(eiendom_id, portefolje_id));

-- ---------- RLS: eksisterende tabeller (erstatter globale roller)
drop policy if exists eiendom_select on public.eiendommer;
create policy eiendom_select on public.eiendommer for select using (public.har_eiendom(id) or public.har_service(id) or id = public.min_leietaker_eiendom());
drop policy if exists eiendom_insert on public.eiendommer;
create policy eiendom_insert on public.eiendommer for insert with check (eier_org_id is not null and public.er_org_rolle(eier_org_id, array['admin','forvalter']));
drop policy if exists eiendom_delete on public.eiendommer;
create policy eiendom_delete on public.eiendommer for delete using (public.er_org_admin(eier_org_id));

drop policy if exists system_select on public.systemer;
create policy system_select on public.systemer for select using (public.har_eiendom(eiendom_id) or id = any(public.service_systemer(eiendom_id)));
drop policy if exists komp_select on public.komponenter;
create policy komp_select on public.komponenter for select using (public.har_eiendom(eiendom_id) or system_id = any(public.service_systemer(eiendom_id)));

drop policy if exists oppg_select on public.oppgaver;
create policy oppg_select on public.oppgaver for select using (public.har_eiendom(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId'));
drop policy if exists oppg_update on public.oppgaver;
create policy oppg_update on public.oppgaver for update using (public.kan_drifte(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId'))
  with check (public.kan_drifte(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId'));

drop policy if exists avvik_select on public.avvik;
create policy avvik_select on public.avvik for select using (public.har_eiendom(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId')
  or (leietaker_id is not null and leietaker_id = public.mitt_leietaker_id()) or tildelt_id = auth.uid());
drop policy if exists avvik_insert on public.avvik;
create policy avvik_insert on public.avvik for insert with check (public.kan_drifte(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId')
  or (leietaker_id = public.mitt_leietaker_id() and eiendom_id = public.min_leietaker_eiendom() and coalesce(data->>'status','Ny') = 'Ny'));
drop policy if exists avvik_update on public.avvik;
create policy avvik_update on public.avvik for update using (public.kan_drifte(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId') or tildelt_id = auth.uid())
  with check (public.kan_drifte(eiendom_id) or public.er_service_system(eiendom_id, data->>'anleggId') or tildelt_id = auth.uid());

drop policy if exists dok_select on public.dokumenter;
create policy dok_select on public.dokumenter for select using (
  public.kan_redigere(eiendom_id)
  or (leietaker_id is null and coalesce(data->>'type','') <> all (array['Leieavtale','Forsikringspolise','Samordningsavtale','Leietakers IK-dokumentasjon'])
      and (public.har_eiendom(eiendom_id) or (public.har_service(eiendom_id) and coalesce(data->'anleggIds','[]'::jsonb) ?| public.service_systemer(eiendom_id)::text[])))
  or (leietaker_id is not null and leietaker_id = public.mitt_leietaker_id()));
drop policy if exists dok_insert on public.dokumenter;
create policy dok_insert on public.dokumenter for insert with check (
  public.kan_redigere(eiendom_id)
  or ((public.kan_drifte(eiendom_id) or public.har_service(eiendom_id)) and leietaker_id is null)
  or (leietaker_id = public.mitt_leietaker_id() and eiendom_id = public.min_leietaker_eiendom()));

drop policy if exists teg_select on public.tegninger;
create policy teg_select on public.tegninger for select using (public.har_eiendom(eiendom_id) or public.har_service(eiendom_id)
  or exists (select 1 from avvik a where a.tildelt_id = auth.uid() and a.data->'pos'->>'tegningId' = tegninger.id::text));

drop policy if exists tilgang_admin_all on public.eiendom_tilgang;
drop policy if exists tilgang_select on public.eiendom_tilgang;
create policy tilgang_select on public.eiendom_tilgang for select using (user_id = auth.uid() or (org_id is not null and public.er_org_admin(org_id)) or public.er_plattform_admin());
drop policy if exists tilgang_write on public.eiendom_tilgang;
create policy tilgang_write on public.eiendom_tilgang for all using (org_id is not null and public.er_org_admin(org_id))
  with check (org_id is not null and public.er_org_admin(org_id) and public.org_har(org_id, eiendom_id, portefolje_id)
              and exists (select 1 from org_medlem m where m.org_id = eiendom_tilgang.org_id and m.user_id = eiendom_tilgang.user_id));

drop policy if exists logg_insert on public.hendelseslogg;
create policy logg_insert on public.hendelseslogg for insert with check (bruker_id = auth.uid() and tabell = 'hendelse'
  and (eiendom_id is null or public.har_eiendom(eiendom_id) or public.har_service(eiendom_id) or public.er_tildelt(rad_id)));
drop policy if exists logg_select on public.hendelseslogg;
create policy logg_select on public.hendelseslogg for select using (
  (eiendom_id is not null and public.har_eiendom(eiendom_id))
  or (org_id is not null and public.er_org_admin(org_id))
  or (tabell = 'avvik' and public.er_tildelt(rad_id)) or bruker_id = auth.uid());

drop policy if exists innst_select on public.innstillinger;
create policy innst_select on public.innstillinger for select using (org_id = public.min_primar_org());
drop policy if exists innst_write on public.innstillinger;
create policy innst_write on public.innstillinger for all using (public.er_org_rolle(org_id, array['admin','forvalter'])) with check (public.er_org_rolle(org_id, array['admin','forvalter']));
alter table public.innstillinger alter column org_id set default public.min_primar_org();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (public.kan_se_profil(id));

-- Lagring
drop policy if exists filer_select on storage.objects;
create policy filer_select on storage.objects for select using (bucket_id = 'filer' and public.kan_lese_fil(name));
drop policy if exists filer_insert on storage.objects;
create policy filer_insert on storage.objects for insert with check (bucket_id = 'filer' and public.kan_skrive_fil(name));
drop policy if exists filer_delete on storage.objects;
create policy filer_delete on storage.objects for delete using (bucket_id = 'filer' and coalesce((select public.kan_redigere(e.id) from public.eiendommer e where e.id::text = split_part(name,'/',1)), false));

-- Finn et firma på eksakt org.nr. (for å gi oppdrag) – bare for admin/forvalter i en organisasjon; ingen fritt søk/oppramsing
create or replace function public.finn_org(p_orgnr text) returns table (id uuid, navn text, type text)
language sql stable security definer set search_path = public as $$
  select o.id, o.navn, o.type from organisasjoner o
  where o.aktiv and regexp_replace(coalesce(o.orgnr,''), '\D', '', 'g') = regexp_replace(coalesce(p_orgnr,''), '\D', '', 'g')
    and length(regexp_replace(coalesce(p_orgnr,''), '\D', '', 'g')) = 9
    and exists (select 1 from org_medlem m where m.user_id = auth.uid() and m.aktiv and m.rolle in ('admin','forvalter'))
  limit 1
$$;

-- ---------- Rettigheter på funksjoner
revoke all on function public.niva_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.niva_for(uuid, uuid) to service_role;
grant execute on function public.mine_tilganger() to authenticated;
grant execute on function public.min_primar_org() to authenticated;
grant execute on function public.finn_org(text) to authenticated;

-- ---------- Flytt dagens data inn i én organisasjon
do $$
declare org uuid; adm uuid;
begin
  if exists (select 1 from organisasjoner) then return; end if;
  insert into organisasjoner (navn, type) values ('Habbestad Eiendom', 'eier') returning id into org;
  update eiendommer set eier_org_id = org where eier_org_id is null;
  update innstillinger set org_id = org where org_id is null;
  update epost_oppsett set org_id = org where org_id is null;
  -- dagens administrator blir plattformadministrator og administrator i organisasjonen
  update profiles set plattform_admin = true where rolle = 'admin';
  insert into org_medlem (org_id, user_id, rolle, alle_bygg)
    select org, id, case rolle when 'admin' then 'admin' when 'forvalter' then 'forvalter' else 'tekniker' end, rolle = 'admin'
    from profiles where rolle in ('admin','forvalter','tekniker') on conflict do nothing;
  update eiendom_tilgang set org_id = org where org_id is null;
end $$;

alter table public.eiendommer alter column eier_org_id set not null;
-- Ny primærnøkkel per organisasjon (slett foreldreløse rader mens gammel nøkkel finnes – kreves av sanntidspublisering)
delete from public.innstillinger where org_id is null;
alter table public.innstillinger drop constraint if exists innstillinger_pkey;
alter table public.innstillinger alter column org_id set not null;
alter table public.innstillinger add primary key (org_id, nokkel);
delete from public.epost_oppsett where org_id is null;
alter table public.epost_oppsett drop constraint if exists epost_oppsett_id_check;
alter table public.epost_oppsett drop constraint if exists epost_oppsett_pkey;
alter table public.epost_oppsett alter column id drop not null;
alter table public.epost_oppsett alter column org_id set not null;
alter table public.epost_oppsett add primary key (org_id);

-- Sanntid for nye tabeller
do $$ begin
  alter publication supabase_realtime add table public.organisasjoner, public.org_medlem, public.portefoljer, public.oppdrag;
exception when others then null; end $$;
