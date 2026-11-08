-- 021: Ressurser (vaktmester, servicefirma, annen bruker) kobles på samtaler
-- * meldinger.leietaker_id kan være tom (samtale om et avvik uten leietaker).
-- * Hver melding har en målgruppe (data.til): «alle» (leietaker, utleier og ressurser), «ressurs» (utleier og ressurser) eller «intern» (bare utleier).
--   Eldre meldinger uten data.til følger data.synlig (false = intern).
-- * meldingsdeltakere: brukere utleier har koblet på en samtale. En bruker som er tildelt avviket (arbeidsordren) har samme tilgang til samtalen om avviket.
alter table public.meldinger alter column leietaker_id drop not null;

create or replace function public.melding_mal(d jsonb) returns text language sql immutable as $$
  select coalesce(d->>'til', case when d->>'synlig' = 'false' then 'intern' else 'alle' end)
$$;

create table if not exists public.meldingsdeltakere (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  leietaker_id uuid references public.leietakere(id) on delete cascade,
  avvik_id uuid references public.avvik(id) on delete cascade,
  bruker_id uuid not null references public.profiles(id) on delete cascade,
  lagt_til_av uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists mdel_bruker_idx on public.meldingsdeltakere(bruker_id);
alter table public.meldingsdeltakere enable row level security;
grant select, insert, update, delete on public.meldingsdeltakere to authenticated;
drop policy if exists mdel_select on public.meldingsdeltakere;
create policy mdel_select on public.meldingsdeltakere for select using (public.har_eiendom(eiendom_id) or bruker_id = auth.uid());
drop policy if exists mdel_insert on public.meldingsdeltakere;
create policy mdel_insert on public.meldingsdeltakere for insert with check (public.kan_drifte(eiendom_id));
drop policy if exists mdel_delete on public.meldingsdeltakere;
create policy mdel_delete on public.meldingsdeltakere for delete using (public.kan_drifte(eiendom_id));

-- Er innlogget bruker ressurs i samtalen (koblet på, eller tildelt avviket)?
create or replace function public.er_samtale_ressurs(p_eiendom uuid, p_leietaker uuid, p_avvik uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meldingsdeltakere d where d.bruker_id = auth.uid() and d.eiendom_id = p_eiendom
                 and d.leietaker_id is not distinct from p_leietaker and d.avvik_id is not distinct from p_avvik)
      or (p_avvik is not null and exists (select 1 from avvik a where a.id = p_avvik and a.tildelt_id = auth.uid()))
$$;

drop policy if exists mld_select on public.meldinger;
create policy mld_select on public.meldinger for select using (
  public.har_eiendom(eiendom_id)
  or (leietaker_id is not null and leietaker_id = public.mitt_leietaker_id() and public.melding_mal(data) = 'alle')
  or (public.melding_mal(data) in ('alle', 'ressurs') and public.er_samtale_ressurs(eiendom_id, leietaker_id, avvik_id)));

drop policy if exists mld_insert on public.meldinger;
create policy mld_insert on public.meldinger for insert with check (
  length(coalesce(data->>'tekst', '')) between 1 and 4000 and (
    (public.kan_drifte(eiendom_id) and data->>'rolle' = 'utleier')
    or (leietaker_id is not null and leietaker_id = public.mitt_leietaker_id() and eiendom_id = public.min_leietaker_eiendom()
        and data->>'rolle' = 'leietaker' and public.melding_mal(data) = 'alle'
        and (avvik_id is null or exists (select 1 from public.avvik a where a.id = avvik_id and a.leietaker_id = public.mitt_leietaker_id())))
    or (data->>'rolle' = 'ressurs' and public.melding_mal(data) = 'ressurs' and public.er_samtale_ressurs(eiendom_id, leietaker_id, avvik_id))));
