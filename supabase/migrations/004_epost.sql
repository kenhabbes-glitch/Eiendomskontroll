-- =====================================================================
-- 004: E-postoppsett per installasjon (avsender, svar-til, SMTP/Resend).
-- Passord og API-nøkler lagres her og leses bare av serverfunksjonen
-- (service-nøkkel). Ingen innloggede brukere kan lese tabellen direkte.
-- Kjør i Supabase: SQL Editor → New query → lim inn → Run.
-- =====================================================================
create table if not exists public.epost_oppsett (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  hemmelig text,
  endret timestamptz not null default now(),
  endret_av uuid
);
alter table public.epost_oppsett enable row level security;
-- Ingen policyer: bare serverfunksjonen (service-nøkkel) har tilgang.
