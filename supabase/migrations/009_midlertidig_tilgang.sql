-- =====================================================================
-- 009: Midlertidig tilgang via lenke og samtykke til personvernerklæring
--   * Lenker i arbeidsordre (avvik og kontroller) utløper (utloper)
--   * Samtykke til personvernerklæringen lagres på brukeren og på innsendte rapporter
-- =====================================================================
alter table public.ao_invitasjon add column if not exists utloper timestamptz;
update public.ao_invitasjon set utloper = opprettet + interval '90 days' where utloper is null;
alter table public.ao_invitasjon alter column utloper set default now() + interval '90 days';
alter table public.ao_invitasjon add column if not exists kvittert timestamptz;
alter table public.ao_invitasjon add column if not exists svar jsonb;

alter table public.ko_invitasjon add column if not exists utloper timestamptz;
update public.ko_invitasjon set utloper = greatest(opprettet + interval '30 days', coalesce(frist::timestamptz, opprettet) + interval '45 days') where utloper is null;
alter table public.ko_invitasjon alter column utloper set default now() + interval '60 days';

alter table public.lt_invitasjon add column if not exists utloper timestamptz;
update public.lt_invitasjon set utloper = opprettet + interval '60 days' where utloper is null;
alter table public.lt_invitasjon alter column utloper set default now() + interval '60 days';

alter table public.profiles add column if not exists samtykke jsonb;
