-- Push-varsler til telefon/PC (Web Push). Alt går via serverfunksjonen «push» (service-nøkkel); brukere har ingen direkte tilgang.
create table if not exists public.push_abonnement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  typer text[] not null default '{melding,kritisk,oversikt}',
  enhet text,
  opprettet timestamptz not null default now()
);
create index if not exists push_abonnement_user_idx on public.push_abonnement(user_id);
-- Serverens egne nøkler (VAPID). Lages automatisk første gang og vises aldri.
create table if not exists public.push_noekler (
  id int primary key check (id = 1),
  offentlig text not null,
  privat text not null,
  opprettet timestamptz not null default now()
);
alter table public.push_abonnement enable row level security;
alter table public.push_noekler enable row level security;
revoke all on public.push_abonnement, public.push_noekler from anon, authenticated;
