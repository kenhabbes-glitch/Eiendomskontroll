-- 020: Toveis kommunikasjon mellom utleier og leietaker
-- En melding hører til en leietaker (og eventuelt et avvik). Utleiersiden (kan_drifte) kan skrive, endre og slette,
-- og velger per melding om leietakeren skal se den (data.synlig = false → internt notat).
-- Leietakeren kan lese meldinger som er synlige, og skrive nye meldinger på egne vegne og på egne saker.
create table if not exists public.meldinger (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  leietaker_id uuid not null references public.leietakere(id) on delete cascade,
  avvik_id uuid references public.avvik(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,   -- tekst, rolle (utleier|leietaker), av, synlig, lest
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists meldinger_lt_idx on public.meldinger(leietaker_id, created_at);
create index if not exists meldinger_avvik_idx on public.meldinger(avvik_id);
alter table public.meldinger enable row level security;
grant select, insert, update, delete on public.meldinger to authenticated;

drop policy if exists mld_select on public.meldinger;
create policy mld_select on public.meldinger for select using (
  public.har_eiendom(eiendom_id)
  or (leietaker_id = public.mitt_leietaker_id() and coalesce(data->>'synlig', 'true') <> 'false'));

drop policy if exists mld_insert on public.meldinger;
create policy mld_insert on public.meldinger for insert with check (
  length(coalesce(data->>'tekst', '')) between 1 and 4000 and (
    (public.kan_drifte(eiendom_id) and data->>'rolle' = 'utleier')
    or (leietaker_id = public.mitt_leietaker_id() and eiendom_id = public.min_leietaker_eiendom()
        and data->>'rolle' = 'leietaker' and coalesce(data->>'synlig', 'true') <> 'false'
        and (avvik_id is null or exists (select 1 from public.avvik a where a.id = avvik_id and a.leietaker_id = public.mitt_leietaker_id())))));

drop policy if exists mld_update on public.meldinger;
create policy mld_update on public.meldinger for update using (public.kan_drifte(eiendom_id)) with check (public.kan_drifte(eiendom_id));
drop policy if exists mld_delete on public.meldinger;
create policy mld_delete on public.meldinger for delete using (public.kan_redigere(eiendom_id));
