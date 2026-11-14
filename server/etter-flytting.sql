-- Kjøres én gang etter at databasen er flyttet (se server/README.md).
-- «supabase db dump» tar ikke med ting som ligger i auth- og storage-skjemaene, så de legges inn her.
begin;
-- Tilgang til filer (tegninger, bilder, dokumenter, 3D-modeller)
drop policy if exists filer_select on storage.objects;
create policy filer_select on storage.objects for select to public using (bucket_id = 'filer' and public.kan_lese_fil(name));
drop policy if exists filer_insert on storage.objects;
create policy filer_insert on storage.objects for insert to public with check (bucket_id = 'filer' and public.kan_skrive_fil(name));
drop policy if exists filer_delete on storage.objects;
create policy filer_delete on storage.objects for delete to public using (bucket_id = 'filer' and coalesce((select public.kan_redigere(e.id) from public.eiendommer e where e.id::text = split_part(objects.name, '/', 1)), false));
drop policy if exists filer_mfa on storage.objects;
create policy filer_mfa on storage.objects as restrictive for all to authenticated using (bucket_id <> 'filer' or (select public.mfa_ok())) with check (bucket_id <> 'filer' or (select public.mfa_ok()));
-- Ny bruker får profil automatisk
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.ny_bruker();
-- Sanntidsoppdatering mellom brukere
do $$ declare t text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['profiles','eiendom_tilgang','eiendommer','leietakere','systemer','komponenter','oppgaver','avvik','dokumenter','tegninger','innstillinger','hendelseslogg','organisasjoner','org_medlem','portefoljer','oppdrag','avlesninger','prosjekter','befaringer'] loop
    if to_regclass('public.' || t) is not null and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t)
    then execute format('alter publication supabase_realtime add table public.%I', t); end if;
  end loop; end $$;
commit;
select 'Ferdig: ' || (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'filer_%') || ' filregler, '
  || (select count(*) from pg_trigger where tgname = 'on_auth_user_created') || ' brukertrigger, '
  || (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') || ' sanntidstabeller' as status;
