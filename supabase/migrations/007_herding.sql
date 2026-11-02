-- =====================================================================
-- 007: Herding etter sikkerhetsrådgiver
--   * Ikke-innloggede (anon) kan ikke kalle noen security definer-funksjon
--   * Triggerfunksjoner kan ikke kalles direkte via API
--   * Låst søkesti på sett_updated_at
-- =====================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as er_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.er_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- niva_for gjelder vilkårlig bruker – bare for tjenerfunksjonene
revoke execute on function public.niva_for(uuid, uuid) from authenticated;

alter function public.sett_updated_at() set search_path = public;

-- Nye funksjoner skal ikke automatisk kunne kjøres av anon
alter default privileges in schema public revoke execute on functions from public, anon;
