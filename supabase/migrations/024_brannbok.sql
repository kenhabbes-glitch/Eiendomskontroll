-- 024: Brannbok – delingslenker til brannvesenet og merknader fra dem.
-- Lenken er en lang tilfeldig nøkkel (token) som gir lesetilgang uten innlogging via netlify-funksjonen (service role).
-- Innholdet i lenken er et øyeblikksbilde (data.innhold) som eier oppdaterer fra appen. Merknader settes inn av funksjonen.
create table if not exists public.brannbok_lenker (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  token text not null unique,
  data jsonb not null default '{}'::jsonb,   -- til, epost, utloper, opprettetAv, trukket, apnet[], innhold, pdfPath, oppdatert
  created_at timestamptz not null default now()
);
create table if not exists public.brannbok_merknader (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  lenke_id uuid references public.brannbok_lenker(id) on delete set null,
  seksjon text not null default 'samlet',
  data jsonb not null default '{}'::jsonb,   -- tekst, navn, etat, epost, status (ny|besvart|lukket), svar, svarAv, svarTid
  created_at timestamptz not null default now()
);
create index if not exists brannbok_lenker_eiendom_idx on public.brannbok_lenker(eiendom_id);
create index if not exists brannbok_merknader_eiendom_idx on public.brannbok_merknader(eiendom_id, created_at desc);
alter table public.brannbok_lenker enable row level security;
alter table public.brannbok_merknader enable row level security;
grant select, insert, update, delete on public.brannbok_lenker to authenticated;
grant select, update, delete on public.brannbok_merknader to authenticated;
drop policy if exists bbl_sel on public.brannbok_lenker; create policy bbl_sel on public.brannbok_lenker for select using (public.kan_drifte(eiendom_id));
drop policy if exists bbl_ins on public.brannbok_lenker; create policy bbl_ins on public.brannbok_lenker for insert with check (public.kan_drifte(eiendom_id));
drop policy if exists bbl_upd on public.brannbok_lenker; create policy bbl_upd on public.brannbok_lenker for update using (public.kan_drifte(eiendom_id)) with check (public.kan_drifte(eiendom_id));
drop policy if exists bbl_del on public.brannbok_lenker; create policy bbl_del on public.brannbok_lenker for delete using (public.kan_drifte(eiendom_id));
drop policy if exists bbm_sel on public.brannbok_merknader; create policy bbm_sel on public.brannbok_merknader for select using (public.har_eiendom(eiendom_id) and public.min_rolle() <> 'leietaker');
drop policy if exists bbm_upd on public.brannbok_merknader; create policy bbm_upd on public.brannbok_merknader for update using (public.kan_drifte(eiendom_id)) with check (public.kan_drifte(eiendom_id));
drop policy if exists bbm_del on public.brannbok_merknader; create policy bbm_del on public.brannbok_merknader for delete using (public.kan_drifte(eiendom_id));
