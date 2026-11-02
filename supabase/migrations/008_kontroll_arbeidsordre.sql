-- =====================================================================
-- 008: Arbeidsordre for kontroller/service til eksterne servicefirma
--   Lenke uten innlogging: servicefirmaet registrerer utført og laster opp rapport.
--   Rapporten legges på kontrollen som «til godkjenning»; eier godkjenner i appen.
--   Tabellen brukes bare av serverfunksjonen (service-nøkkel) – ingen tilgang fra klienten.
-- =====================================================================
create table if not exists public.ko_invitasjon (
  token uuid primary key default gen_random_uuid(),
  oppgave_id uuid not null references public.oppgaver(id) on delete cascade,
  eiendom_id uuid not null references public.eiendommer(id) on delete cascade,
  epost text not null,
  frist date,
  auto boolean not null default false,
  opprettet timestamptz not null default now(),
  opprettet_av uuid references public.profiles(id) on delete set null,
  innsendt timestamptz,
  svar jsonb
);
create index if not exists ko_invitasjon_oppgave_idx on public.ko_invitasjon(oppgave_id);
alter table public.ko_invitasjon enable row level security;
revoke all on public.ko_invitasjon from anon, authenticated;
