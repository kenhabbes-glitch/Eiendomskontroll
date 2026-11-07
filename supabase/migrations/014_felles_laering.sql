-- 014: Felles, anonymisert læring for lesing av servicerapporter (valgfritt per organisasjon)
--
-- Personvern og konfidensialitet:
--  * Ingen org_id, bruker-id, eiendom, adresse, leietaker eller rapporttekst lagres.
--  * Ordstatistikk deles bare per anleggstype/kontrolltype (f.eks. «type:ventilasjon») og bare for
--    appens standardord – aldri egne ord, ignorerte linjer eller tekst fra rapportene.
--  * Faste maler deles bare når brukeren krysser av for det, og nøkles på leverandørens
--    organisasjonsnummer (et foretak – klienten deler ikke maler for enkeltpersonforetak).
--  * Tabellene er stengt for direkte lesing/skriving. All tilgang går via funksjonene under,
--    som validerer og vasker innholdet.

create table if not exists public.felles_laering (
  kontekst text not null check (kontekst ~ '^type:[A-Za-zÆØÅæøå0-9_-]{2,40}$'),
  markor   text not null check (markor ~ '^(§seksjon|[a-zæøå][a-zæøå .:/-]{1,38}[a-zæøå0-9:.]?)$'),
  g int not null default 0 check (g >= 0),
  a int not null default 0 check (a >= 0),
  endret timestamptz not null default now(),
  primary key (kontekst, markor)
);

create table if not exists public.felles_maler (
  orgnr  text primary key check (orgnr ~ '^[0-9]{9}$'),
  mal    jsonb not null,
  stemmer int not null default 1,
  endret timestamptz not null default now()
);

alter table public.felles_laering enable row level security;
alter table public.felles_maler  enable row level security;
revoke all on public.felles_laering from anon, authenticated;
revoke all on public.felles_maler  from anon, authenticated;

-- Vasker en tekst fra malen: maks lengde, ingen e-post/telefon/lange tall
create or replace function public.felles_vask(t text, maks int default 40) returns text
language sql immutable set search_path = public as $$
  select case when t is null then ''
              when t ~ '@' or t ~ '[0-9]{4,}' or t ~ 'https?:' then ''
              else left(regexp_replace(trim(t), '\s+', ' ', 'g'), maks) end
$$;

-- Bidra med ordstatistikk. p = [{k:'type:ventilasjon', m:'lekkasje', g:1, a:0}, …]
create or replace function public.felles_bidra(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if auth.uid() is null then raise exception 'Ingen tilgang'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 120 then raise exception 'Ugyldig innhold'; end if;
  for r in select * from jsonb_array_elements(p) loop
    begin
      insert into felles_laering as f (kontekst, markor, g, a)
      values (r->>'k', lower(r->>'m'), least(greatest(coalesce((r->>'g')::int, 0), 0), 5), least(greatest(coalesce((r->>'a')::int, 0), 0), 5))
      on conflict (kontekst, markor) do update set g = f.g + excluded.g, a = f.a + excluded.a, endret = now();
      n := n + 1;
    exception when check_violation or invalid_text_representation or not_null_violation then null; -- hopp over ugyldige
    end;
  end loop;
  return n;
end $$;

create or replace function public.felles_hent(p_kontekster text[]) returns table (kontekst text, markor text, g int, a int)
language sql stable security definer set search_path = public as $$
  select f.kontekst, f.markor, f.g, f.a from felles_laering f
  where auth.uid() is not null and f.kontekst = any (p_kontekster[1:10])
$$;

-- Del en fast mal for en leverandør (org.nr). Bare struktur og korte overskrifter/statusord.
create or replace function public.felles_mal_del(p_orgnr text, p_mal jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t text := p_mal->>'type'; m jsonb;
begin
  if auth.uid() is null then raise exception 'Ingen tilgang'; end if;
  if p_orgnr !~ '^[0-9]{9}$' or t is null or t not in ('status', 'seksjon', 'prefiks') then raise exception 'Ugyldig mal'; end if;
  m := jsonb_build_object('type', t,
    'avvik', coalesce((select jsonb_agg(v) from (select felles_vask(x, 25) v from jsonb_array_elements_text(coalesce(p_mal->'avvik', '[]')) x limit 8) s where v <> ''), '[]'),
    'ok',    coalesce((select jsonb_agg(v) from (select felles_vask(x, 25) v from jsonb_array_elements_text(coalesce(p_mal->'ok', '[]')) x limit 8) s where v <> ''), '[]'),
    'start', felles_vask(p_mal->>'start'), 'slutt', felles_vask(p_mal->>'slutt'), 'prefiks', felles_vask(p_mal->>'prefiks', 15));
  insert into felles_maler as f (orgnr, mal) values (p_orgnr, m)
  on conflict (orgnr) do update set mal = excluded.mal, endret = now(),
    stemmer = case when f.mal = excluded.mal then f.stemmer + 1 else 1 end;
end $$;

create or replace function public.felles_mal_hent(p_orgnr text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (select mal || jsonb_build_object('stemmer', stemmer) from felles_maler where orgnr = p_orgnr) end
$$;

revoke all on function public.felles_bidra(jsonb), public.felles_hent(text[]), public.felles_mal_del(text, jsonb), public.felles_mal_hent(text), public.felles_vask(text, int) from public, anon;
grant execute on function public.felles_bidra(jsonb), public.felles_hent(text[]), public.felles_mal_del(text, jsonb), public.felles_mal_hent(text) to authenticated;
