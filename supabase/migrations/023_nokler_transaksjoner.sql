-- 023: Utkvittering og innlevering av nøkler som én transaksjon.
-- Låser nøklene, sjekker at de fortsatt har riktig status, tildeler skjemanummer og oppdaterer nøkler og skjema samlet.
-- Hindrer at to personer kvitterer ut samme nøkkel samtidig, og at en feil midt i lagringen etterlater halvveis oppdaterte data.
-- security invoker: radtilgangsreglene (kan_drifte) gjelder som før.
create or replace function public.nokkel_utkvitter(p_eiendom uuid, p_system uuid, p_nokler uuid[], p_data jsonb)
returns public.nokkelutkvitteringer language plpgsql security invoker set search_path = public as $$
declare v_nr int; v_u public.nokkelutkvitteringer; v_liste jsonb;
begin
  if not public.kan_drifte(p_eiendom) then raise exception 'Ingen tilgang til eiendommen'; end if;
  if coalesce(array_length(p_nokler, 1), 0) = 0 then raise exception 'Velg minst én nøkkel'; end if;
  perform 1 from nokler where id = any(p_nokler) for update;
  if (select count(*) from nokler where id = any(p_nokler) and eiendom_id = p_eiendom and system_id = p_system and status = 'inne') <> array_length(p_nokler, 1) then
    raise exception 'En eller flere av nøklene er ikke lenger ledige. Last siden på nytt.'; end if;
  perform pg_advisory_xact_lock(hashtext('nokkelutkv' || p_eiendom::text));
  select coalesce(max(nr), 0) + 1 into v_nr from nokkelutkvitteringer where eiendom_id = p_eiendom;
  select jsonb_agg(jsonb_build_object('id', n.id, 'type', t.kode, 'lopenr', n.lopenr) order by t.kode, n.lopenr) into v_liste
    from nokler n join nokkeltyper t on t.id = n.type_id where n.id = any(p_nokler);
  insert into nokkelutkvitteringer (eiendom_id, system_id, nr, data) values (p_eiendom, p_system, v_nr, p_data || jsonb_build_object('nokler', v_liste)) returning * into v_u;
  update nokler set status = 'ute', data = (data - 'merknad' - 'sistHos') || jsonb_build_object('innehaver', p_data->'person', 'utkvitteringId', v_u.id, 'utkvNr', v_nr,
      'dato', p_data->>'dato', 'forventetRetur', nullif(p_data->>'forventetRetur', ''),
      'logg', coalesce(data->'logg', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('dato', now(), 'tekst', 'Utkvittert til ' || (p_data->'person'->>'navn') || ' (skjema ' || v_nr || ')', 'av', p_data->>'utlevertAv')))
    where id = any(p_nokler);
  return v_u;
end $$;

-- Avslutter utlån: p_status 'inne' = levert tilbake, 'tapt' = meldt tapt mens den var utlånt.
create or replace function public.nokkel_avslutt(p_nokler uuid[], p_status text, p_dato date, p_av text, p_merknad text)
returns int language plpgsql security invoker set search_path = public as $$
declare v_ant int; r record;
begin
  if p_status not in ('inne', 'tapt') then raise exception 'Ugyldig status'; end if;
  perform 1 from nokler where id = any(p_nokler) for update;
  if exists (select 1 from nokler where id = any(p_nokler) and (status <> 'ute' or not public.kan_drifte(eiendom_id))) then
    raise exception 'En eller flere av nøklene er allerede levert inn. Last siden på nytt.'; end if;
  for r in select distinct (data->>'utkvitteringId')::uuid as uid from nokler where id = any(p_nokler) and data ? 'utkvitteringId' loop
    update nokkelutkvitteringer u set data = jsonb_set(u.data, '{nokler}', (select jsonb_agg(case when (x->>'id')::uuid = any(p_nokler) and not x ? 'retur'
        then x || jsonb_build_object('retur', jsonb_build_object('dato', p_dato, 'mottattAv', p_av, 'tapt', p_status = 'tapt')) else x end) from jsonb_array_elements(u.data->'nokler') x))
      where u.id = r.uid;
  end loop;
  update nokler set status = p_status,
    data = (data - array['innehaver', 'utkvitteringId', 'utkvNr', 'dato', 'forventetRetur']) || jsonb_build_object('merknad', nullif(p_merknad, ''),
      'sistHos', case when p_status = 'tapt' then data->'innehaver' else null end,
      'logg', coalesce(data->'logg', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('dato', now(), 'av', p_av, 'tekst',
        case when p_status = 'tapt' then 'Meldt tapt av ' || coalesce(data->'innehaver'->>'navn', '?') else 'Levert inn av ' || coalesce(data->'innehaver'->>'navn', '?') || ', mottatt av ' || p_av end)))
    where id = any(p_nokler);
  get diagnostics v_ant = row_count; return v_ant;
end $$;
grant execute on function public.nokkel_utkvitter(uuid, uuid, uuid[], jsonb) to authenticated;
grant execute on function public.nokkel_avslutt(uuid[], text, date, text, text) to authenticated;
