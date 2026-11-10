-- 025: 3D-modeller (konvertert fra IFC). Selve modellfilen (.ek3d.gz) ligger i lagringsbøtten «filer» under {eiendom}/intern/modell/.
-- data: navn, filnavn, path, str, tid, antall, etasjer[], opprettetAv
create table if not exists public.modeller3d (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists modeller3d_eiendom_idx on public.modeller3d(eiendom_id);
alter table public.modeller3d enable row level security;
grant select, insert, update, delete on public.modeller3d to authenticated;
drop policy if exists m3d_sel on public.modeller3d; create policy m3d_sel on public.modeller3d for select using (public.har_eiendom(eiendom_id) and public.min_rolle() not in ('leietaker'));
drop policy if exists m3d_ins on public.modeller3d; create policy m3d_ins on public.modeller3d for insert with check (public.kan_drifte(eiendom_id));
drop policy if exists m3d_upd on public.modeller3d; create policy m3d_upd on public.modeller3d for update using (public.kan_drifte(eiendom_id)) with check (public.kan_drifte(eiendom_id));
drop policy if exists m3d_del on public.modeller3d; create policy m3d_del on public.modeller3d for delete using (public.kan_drifte(eiendom_id));
