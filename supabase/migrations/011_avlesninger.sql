-- 011: Måleravlesninger (sprinklertrykk, vann, fjernvarme, fjernkjøling, energi, seriemålere …)
-- Selve måleren er en komponent (komponenter.data.mType m.m.). Avlesningene ligger her, slik at driftsteknikere
-- (som ikke kan endre komponenter) og servicefirma med tilgang til systemet kan registrere dem.

create table if not exists public.avlesninger (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  komponent_id uuid not null references public.komponenter(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists avlesninger_komp_idx on public.avlesninger(komponent_id);
create index if not exists avlesninger_eiendom_idx on public.avlesninger(eiendom_id);

drop trigger if exists avlesninger_updated on public.avlesninger;
create trigger avlesninger_updated before update on public.avlesninger for each row execute function public.sett_updated_at();

-- Måleren må høre til samme eiendom som avlesningen
create or replace function public.avl_komp_ok(p_eid uuid, p_kid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from komponenter k where k.id = p_kid and k.eiendom_id = p_eid)
$$;
create or replace function public.avl_service(p_eid uuid, p_kid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from komponenter k where k.id = p_kid and k.eiendom_id = p_eid and k.system_id = any(public.service_systemer(p_eid)))
$$;
revoke execute on function public.avl_komp_ok(uuid, uuid), public.avl_service(uuid, uuid) from public, anon;
grant execute on function public.avl_komp_ok(uuid, uuid), public.avl_service(uuid, uuid) to authenticated;

alter table public.avlesninger enable row level security;
grant select, insert, update, delete on public.avlesninger to authenticated;

drop policy if exists avl_select on public.avlesninger;
create policy avl_select on public.avlesninger for select using (public.har_eiendom(eiendom_id) or public.avl_service(eiendom_id, komponent_id));
drop policy if exists avl_insert on public.avlesninger;
create policy avl_insert on public.avlesninger for insert
  with check ((public.kan_drifte(eiendom_id) or public.avl_service(eiendom_id, komponent_id)) and public.avl_komp_ok(eiendom_id, komponent_id));
drop policy if exists avl_update on public.avlesninger;
create policy avl_update on public.avlesninger for update
  using (public.kan_drifte(eiendom_id) or public.avl_service(eiendom_id, komponent_id))
  with check ((public.kan_drifte(eiendom_id) or public.avl_service(eiendom_id, komponent_id)) and public.avl_komp_ok(eiendom_id, komponent_id));
drop policy if exists avl_delete on public.avlesninger;
create policy avl_delete on public.avlesninger for delete using (public.kan_drifte(eiendom_id));

-- Tofaktor (samme regel som 010)
drop policy if exists mfa on public.avlesninger;
create policy mfa on public.avlesninger as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

do $$ begin
  begin execute 'alter publication supabase_realtime add table public.avlesninger'; exception when duplicate_object or undefined_object then null; end;
end $$;
