-- Sikkerhetsgjennomgang november 2026
-- 1) Tofaktor-regelen (mfa) manglet på tabeller som er laget etter migrasjon 010 (nøkler, meldinger, QR, 3D-modeller, brannbok m.fl.).
--    Legges på alle tabeller med tilgangsregler, og kan trygt kjøres flere ganger.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
             and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname <> 'mfa')
  loop
    execute format('drop policy if exists mfa on public.%I', t.relname);
    execute format('create policy mfa on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $$;

-- 2) Funksjoner som ikke trenger å kunne kalles uten innlogging
revoke execute on function public.er_samtale_ressurs(uuid, uuid, uuid) from public, anon;
revoke execute on function public.nokkel_utkvitter(uuid, uuid, uuid[], jsonb) from public, anon;
revoke execute on function public.nokkel_avslutt(uuid[], text, date, text, text) from public, anon;
grant execute on function public.er_samtale_ressurs(uuid, uuid, uuid), public.nokkel_utkvitter(uuid, uuid, uuid[], jsonb), public.nokkel_avslutt(uuid[], text, date, text, text) to authenticated, service_role;
alter function public.melding_mal(jsonb) set search_path = public;

-- 3) Uinnloggede trenger ingen direkte tabelltilgang (alt offentlig går via serverfunksjonene). TRUNCATE styres ikke av radregler.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
