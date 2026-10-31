-- =====================================================================
-- 003: Arbeidsordre – avvik på tegning, tildeling, eksterne utførende
--      og hendelseslogg for alle endringer.
-- Kjør i Supabase: SQL Editor → New query → lim inn → Run.
-- Skriptet kan kjøres flere ganger.
-- =====================================================================

-- ---------- Ny rolle: utførende (ekstern) – ser bare egne arbeidsordre
alter table public.profiles drop constraint if exists profiles_rolle_check;
alter table public.profiles add constraint profiles_rolle_check
  check (rolle in ('admin','forvalter','tekniker','leietaker','utforer','ingen'));

-- ---------- Avvik kan tildeles en bruker
alter table public.avvik add column if not exists tildelt_id uuid references public.profiles(id) on delete set null;
create index if not exists avvik_tildelt_idx on public.avvik(tildelt_id);

create or replace function public.er_tildelt(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from avvik where id = aid and tildelt_id = auth.uid())
$$;

drop policy if exists avvik_select on public.avvik;
drop policy if exists avvik_update on public.avvik;
create policy avvik_select on public.avvik for select using (
  public.har_eiendom(eiendom_id)
  or (leietaker_id is not null and leietaker_id = public.mitt_leietaker_id())
  or tildelt_id = auth.uid());
create policy avvik_update on public.avvik for update
  using (public.har_eiendom(eiendom_id) or tildelt_id = auth.uid())
  with check (public.har_eiendom(eiendom_id) or tildelt_id = auth.uid());

-- Den som bare er tildelt (ikke ansatt på eiendommen) kan kun endre status,
-- logg, vedlegg og utført-felt – og bare til «Under utbedring» eller «Utført – til kontroll».
create or replace function public.avvik_vakt() returns trigger
language plpgsql security definer set search_path = public as $$
declare tillatt text[] := array['status','logg','vedlegg','utfort','startet'];
begin
  if auth.uid() is null or public.har_eiendom(old.eiendom_id) then return new; end if;
  if old.tildelt_id is distinct from auth.uid() then raise exception 'Ingen tilgang'; end if;
  new.eiendom_id := old.eiendom_id; new.leietaker_id := old.leietaker_id; new.tildelt_id := old.tildelt_id; new.nr := old.nr;
  new.data := old.data || coalesce((select jsonb_object_agg(k, v) from jsonb_each(new.data) as e(k, v) where k = any(tillatt)), '{}'::jsonb);
  if (new.data->>'status') is distinct from (old.data->>'status')
     and coalesce(new.data->>'status','') not in ('Under utbedring','Utført – til kontroll') then
    new.data := jsonb_set(new.data, '{status}', coalesce(old.data->'status', '"Ny"'::jsonb));
  end if;
  return new;
end $$;
drop trigger if exists avvik_vakt on public.avvik;
create trigger avvik_vakt before update on public.avvik for each row execute function public.avvik_vakt();

-- Tildelte ser tegningen avviket er plassert på
drop policy if exists teg_select on public.tegninger;
create policy teg_select on public.tegninger for select using (
  public.har_eiendom(eiendom_id)
  or exists (select 1 from avvik a where a.tildelt_id = auth.uid() and a.data->'pos'->>'tegningId' = tegninger.id::text));

-- Forvalter/tekniker ser navn på utførende (for tildeling)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or public.er_admin()
  or (public.min_rolle() in ('forvalter','tekniker') and rolle in ('admin','forvalter','tekniker','utforer')));

-- Filer: tildelte kan lese/laste opp under {eiendom}/ao/{avvik}/ og lese
-- tegningen og vedleggene til sine arbeidsordre
create or replace function public.ao_fil(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (split_part(p_name,'/',2) = 'ao' and exists (select 1 from avvik a where a.id::text = split_part(p_name,'/',3) and a.tildelt_id = auth.uid()))
    or exists (select 1 from avvik a join tegninger t on a.data->'pos'->>'tegningId' = t.id::text
               where a.tildelt_id = auth.uid() and t.data->'fil'->>'path' = p_name)
    or exists (select 1 from avvik a where a.tildelt_id = auth.uid() and a.data->'vedlegg' @> jsonb_build_array(jsonb_build_object('path', p_name)))
$$;

create or replace function public.kan_lese_fil(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select (case
    when public.min_rolle() in ('admin','forvalter') then
      exists (select 1 from eiendommer e where e.id::text = split_part(p_name,'/',1) and public.kan_redigere(e.id))
    when public.min_rolle() = 'tekniker' then
      split_part(p_name,'/',2) <> 'leietaker'
      and exists (select 1 from eiendommer e where e.id::text = split_part(p_name,'/',1) and public.har_eiendom(e.id))
    when public.min_rolle() = 'leietaker' then
      split_part(p_name,'/',2) = 'leietaker' and split_part(p_name,'/',3) = public.mitt_leietaker_id()::text
    else false end) or public.ao_fil(p_name)
$$;

-- ---------- Invitasjoner til eksterne (kun via serverfunksjon med service-nøkkel)
create table if not exists public.ao_invitasjon (
  token uuid primary key default gen_random_uuid(),
  avvik_id uuid not null references public.avvik(id) on delete cascade,
  epost text not null,
  opprettet timestamptz not null default now(),
  opprettet_av uuid,
  brukt timestamptz,
  bruker_id uuid
);
alter table public.ao_invitasjon enable row level security;

-- ---------- Hendelseslogg: alle endringer i fagdata logges automatisk
create table if not exists public.hendelseslogg (
  id bigint generated always as identity primary key,
  tid timestamptz not null default now(),
  bruker_id uuid default auth.uid(),
  bruker text,
  tabell text not null,
  rad_id uuid,
  eiendom_id uuid,
  handling text not null,
  tekst text,
  endringer jsonb
);
create index if not exists hendelseslogg_rad_idx on public.hendelseslogg(rad_id);
create index if not exists hendelseslogg_eiendom_idx on public.hendelseslogg(eiendom_id, tid desc);
create index if not exists hendelseslogg_tid_idx on public.hendelseslogg(tid desc);
alter table public.hendelseslogg enable row level security;

drop policy if exists logg_select on public.hendelseslogg;
drop policy if exists logg_insert on public.hendelseslogg;
create policy logg_select on public.hendelseslogg for select using (
  public.er_admin()
  or (eiendom_id is not null and public.har_eiendom(eiendom_id))
  or (tabell = 'avvik' and public.er_tildelt(rad_id))
  or bruker_id = auth.uid());
-- Appen kan føre egne hendelser (f.eks. «arbeidsordre sendt på e-post»)
create policy logg_insert on public.hendelseslogg for insert with check (
  bruker_id = auth.uid() and tabell = 'hendelse'
  and (eiendom_id is null or public.har_eiendom(eiendom_id) or public.er_tildelt(rad_id)));

create or replace function public.logg_endring() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  r jsonb := coalesce(n, o);
  diff jsonb := '{}'::jsonb; k text; v jsonb; fra jsonb; navn text;
  eid uuid;
begin
  eid := case when tg_table_name = 'eiendommer' then (r->>'id')::uuid
              when r ? 'eiendom_id' then nullif(r->>'eiendom_id','')::uuid else null end;
  if tg_op = 'UPDATE' then
    -- kolonner utenfor data
    for k, v in select * from jsonb_each(n - 'data' - 'updated_at' - 'created_at') loop
      if (o->k) is distinct from v then diff := diff || jsonb_build_object(k, jsonb_build_object('fra', o->k, 'til', v)); end if;
    end loop;
    -- felter i data
    for k, v in select * from jsonb_each(coalesce(n->'data','{}'::jsonb)) loop
      fra := o->'data'->k;
      if fra is distinct from v then
        if length(coalesce(fra::text,'')) + length(v::text) > 600 then
          diff := diff || jsonb_build_object(k, jsonb_build_object('endret', true));
        else diff := diff || jsonb_build_object(k, jsonb_build_object('fra', fra, 'til', v)); end if;
      end if;
    end loop;
    for k in select jsonb_object_keys(coalesce(o->'data','{}'::jsonb)) loop
      if not (coalesce(n->'data','{}'::jsonb) ? k) then diff := diff || jsonb_build_object(k, jsonb_build_object('fra', o->'data'->k, 'til', null)); end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
  end if;
  select coalesce(nullif(p.navn,''), p.epost) into navn from profiles p where p.id = auth.uid();
  insert into hendelseslogg (bruker_id, bruker, tabell, rad_id, eiendom_id, handling, tekst, endringer)
  values (auth.uid(), navn, tg_table_name, (r->>'id')::uuid, eid,
          case tg_op when 'INSERT' then 'opprettet' when 'UPDATE' then 'endret' else 'slettet' end,
          coalesce(r->'data'->>'tittel', r->'data'->>'navn', r->>'navn', r->>'epost'),
          case when tg_op = 'UPDATE' then diff else null end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['eiendommer','leietakere','systemer','komponenter','oppgaver','avvik','dokumenter','tegninger','profiles'] loop
    execute format('drop trigger if exists %I_logg on public.%I', t, t);
    execute format('create trigger %I_logg after insert or update or delete on public.%I for each row execute function public.logg_endring()', t, t);
  end loop;
end $$;

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.hendelseslogg'; exception when duplicate_object then null; end;
end $$;
