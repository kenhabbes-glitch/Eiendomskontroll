-- 022: Nøkkeladministrasjon
-- Et bygg har ett eller flere nøkkelsystemer (f.eks. «1SL 1058») med låsplan (sylindere) og nøkkeltyper (HN, K1, K2 …).
-- Hver fysiske nøkkel har løpenummer innen sin type og en innehaver. Utkvitteringer er skjemaer med person, nøkler og retur.
-- Alt kan leses av dem som har tilgang til eiendommen og endres av driftssiden (kan_drifte). Leietakere har ikke tilgang.
create table if not exists public.nokkelsystemer (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  navn text not null,
  data jsonb not null default '{}'::jsonb,   -- beskrivelse, produsent, sylindere [{id,navn,sted,typer[]}], regler, arkivert
  created_at timestamptz not null default now(),
  unique (eiendom_id, navn)
);
create table if not exists public.nokkeltyper (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.nokkelsystemer(id) on delete cascade,
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  kode text not null,
  data jsonb not null default '{}'::jsonb,   -- beskrivelse
  created_at timestamptz not null default now(),
  unique (system_id, kode)
);
create table if not exists public.nokler (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references public.nokkeltyper(id) on delete cascade,
  system_id uuid not null references public.nokkelsystemer(id) on delete cascade,
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  lopenr int not null,
  status text not null default 'inne',        -- inne | ute | tapt | kassert
  data jsonb not null default '{}'::jsonb,    -- innehaver {navn,firma,tlf,epost}, utkvitteringId, dato, merknad, logg[]
  created_at timestamptz not null default now(),
  unique (type_id, lopenr)
);
create table if not exists public.nokkelutkvitteringer (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  system_id uuid references public.nokkelsystemer(id) on delete set null,
  nr int not null,
  data jsonb not null default '{}'::jsonb,   -- person, nokler [{id,type,lopenr,retur}], dato, utlevertAv, formal, forventetRetur, regler
  created_at timestamptz not null default now(),
  unique (eiendom_id, nr)
);
create index if not exists nokler_sys_idx on public.nokler(system_id);
create index if not exists nokler_eiendom_status_idx on public.nokler(eiendom_id, status);
do $$ declare t text; begin
  foreach t in array array['nokkelsystemer','nokkeltyper','nokler','nokkelutkvitteringer'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('create policy %I on public.%I for select using (public.har_eiendom(eiendom_id))', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('create policy %I on public.%I for insert with check (public.kan_drifte(eiendom_id))', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('create policy %I on public.%I for update using (public.kan_drifte(eiendom_id)) with check (public.kan_drifte(eiendom_id))', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for delete using (public.kan_drifte(eiendom_id))', t||'_del', t);
  end loop; end $$;
