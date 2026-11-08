-- 019: QR-meldepunkter
-- Et meldepunkt er en lenke/QR-kode (på en vegg, et rom, et teknisk anlegg) som lar hvem som helst som
-- oppholder seg i bygget melde avvik uten å logge inn. Meldingene tas imot av Netlify-funksjonen qr-meld
-- (service-nøkkel, med honningkrukke og grenser) og blir vanlige avvik (kilde «QR-melding»).
-- Tabellen kan leses og endres bare av dem som har tilgang til eiendommen; offentlig oppslag skjer via serveren.
create table if not exists public.qr_punkter (
  id uuid primary key default gen_random_uuid(),
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  token text not null unique,
  navn text not null,
  data jsonb not null default '{}'::jsonb,   -- sted, systemId, aktiv
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists qr_punkter_eiendom_idx on public.qr_punkter(eiendom_id);
alter table public.qr_punkter enable row level security;
grant select, insert, update, delete on public.qr_punkter to authenticated;
drop policy if exists qr_select on public.qr_punkter;
create policy qr_select on public.qr_punkter for select using (public.har_eiendom(eiendom_id));
drop policy if exists qr_insert on public.qr_punkter;
create policy qr_insert on public.qr_punkter for insert with check (public.kan_redigere(eiendom_id));
drop policy if exists qr_update on public.qr_punkter;
create policy qr_update on public.qr_punkter for update using (public.kan_redigere(eiendom_id)) with check (public.kan_redigere(eiendom_id));
drop policy if exists qr_delete on public.qr_punkter;
create policy qr_delete on public.qr_punkter for delete using (public.kan_redigere(eiendom_id));
