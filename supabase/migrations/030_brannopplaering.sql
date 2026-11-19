-- 030: Interaktiv brannvernopplæring for leietakere
-- Eier sender en personlig lenke til leietakerens brannvernleder/hovedkontakt. Etter gjennomgang med spørsmål kan
-- vedkommende invitere egne ansatte (personlige lenker på e-post) og følge opp/purre. Eier og forvalter ser bare
-- prosent som har gjennomført – navn og e-post til ansatte leses bare av serverfunksjonen (service-nøkkel).
create table if not exists public.opplaering_kurs (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  leietaker_id uuid not null,
  versjon int not null default 0,
  innhold jsonb not null default '{}'::jsonb,     -- steg og spørsmål (med fasit; fasit sendes aldri til nettleseren før svar)
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists opplaering_kurs_lt_idx on public.opplaering_kurs(leietaker_id);
create table if not exists public.opplaering_deltakere (
  id uuid primary key default gen_random_uuid(),
  kurs_id uuid not null references public.opplaering_kurs(id) on delete cascade,
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  leietaker_id uuid not null,
  token text not null unique,                     -- lang tilfeldig token i lenken (tabellen kan ikke leses fra nettleseren)
  rolle text not null default 'ansatt' check (rolle in ('leder','ansatt')),
  navn text not null,
  epost text not null,
  invitert_av uuid,                               -- deltaker (leder) som inviterte
  sendt_tid timestamptz,
  purret_tid timestamptz,
  purret_ant int not null default 0,
  startet_tid timestamptz,
  fullfort_tid timestamptz,
  riktige jsonb not null default '[]'::jsonb,     -- id-er på spørsmål som er besvart riktig
  forsok int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists opplaering_deltakere_kurs_idx on public.opplaering_deltakere(kurs_id);
alter table public.opplaering_kurs enable row level security;
alter table public.opplaering_deltakere enable row level security;
-- Kurs: bare synlig for dem som har tilgang til eiendommen. Deltakere: ingen policy = bare serveren (service-nøkkel) når dem.
grant select on public.opplaering_kurs to authenticated;
drop policy if exists opl_kurs_select on public.opplaering_kurs;
create policy opl_kurs_select on public.opplaering_kurs for select using (public.har_eiendom(eiendom_id));
