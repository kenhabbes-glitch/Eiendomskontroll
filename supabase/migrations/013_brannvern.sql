-- 013: Brannverninformasjon til leietakere (forskrift om brannforebygging § 4, § 10 og §§ 11–13)
--
-- Eier fører byggets brannkort i eiendommer.data->'brannvern' (versjonert). Hver leietaker får en
-- brannvernpakke (PDF) og bekrefter at den er lest og gjort kjent for de ansatte. Bekreftelser og
-- leietakers brannvernansvarlige lagres i leietakere.data->'brannInfo'.
-- Leietaker kan ikke oppdatere leietakere-tabellen direkte (RLS), så det skjer gjennom funksjonene under,
-- som bare endrer egne felter. Ingen tabeller endres.

-- Leietaker bekrefter gjeldende versjon av brannvernpakken
create or replace function public.bekreft_brannvern(p_versjon int, p_navn text, p_kommentar text default '')
returns void language plpgsql security definer set search_path = public as $$
declare lid uuid := public.mitt_leietaker_id(); eid uuid; gjeldende int; bi jsonb; bruker text;
begin
  if lid is null then raise exception 'Ingen tilgang'; end if;
  if not public.mfa_ok() then raise exception 'Tofaktor kreves'; end if;
  select eiendom_id, coalesce(data->'brannInfo', '{}'::jsonb) into eid, bi from leietakere where id = lid;
  select coalesce((data->'brannvern'->>'versjon')::int, 0) into gjeldende from eiendommer where id = eid;
  if gjeldende = 0 then raise exception 'Utleier har ikke publisert brannverninformasjon ennå'; end if;
  if p_versjon is distinct from gjeldende then raise exception 'Informasjonen er oppdatert – last siden på nytt og les den nye versjonen'; end if;
  select coalesce(p.navn, p.epost) into bruker from profiles p where p.id = auth.uid();
  bi := jsonb_set(bi, '{kvitteringer}', coalesce(bi->'kvitteringer', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'versjon', p_versjon, 'tid', now(), 'navn', coalesce(nullif(trim(p_navn), ''), bruker), 'bruker', bruker,
    'brukerId', auth.uid(), 'komm', coalesce(p_kommentar, ''), 'form', 'Bekreftet av leietaker i portalen')));
  update leietakere set data = jsonb_set(data, '{brannInfo}', bi) where id = lid;
end $$;

-- Leietaker melder/oppdaterer sin brannvernansvarlige (FOB § 12 – ansvarsforhold; samordning etter § 4)
create or replace function public.oppdater_brannvernansvarlig(p_navn text, p_tlf text, p_epost text, p_stedfortreder text)
returns void language plpgsql security definer set search_path = public as $$
declare lid uuid := public.mitt_leietaker_id(); bi jsonb; bruker text;
begin
  if lid is null then raise exception 'Ingen tilgang'; end if;
  if not public.mfa_ok() then raise exception 'Tofaktor kreves'; end if;
  if coalesce(trim(p_navn), '') = '' then raise exception 'Navn mangler'; end if;
  select coalesce(p.navn, p.epost) into bruker from profiles p where p.id = auth.uid();
  select coalesce(data->'brannInfo', '{}'::jsonb) into bi from leietakere where id = lid;
  bi := jsonb_set(bi, '{ansvarlig}', jsonb_build_object('navn', trim(p_navn), 'tlf', coalesce(p_tlf, ''), 'epost', coalesce(p_epost, ''),
    'stedfortreder', coalesce(p_stedfortreder, ''), 'oppdatert', now(), 'av', bruker));
  update leietakere set data = jsonb_set(jsonb_set(data, '{brannInfo}', bi), '{brannvernleder}',
    to_jsonb(trim(p_navn) || case when coalesce(p_tlf, '') <> '' then ' (' || p_tlf || ')' else '' end)) where id = lid;
end $$;

-- Leietaker bekrefter at et midlertidig brannsikringstiltak (f.eks. alarm ute av drift) er mottatt
create or replace function public.bekreft_brann_midlertidig(p_id text)
returns void language plpgsql security definer set search_path = public as $$
declare lid uuid := public.mitt_leietaker_id(); bi jsonb; bruker text;
begin
  if lid is null then raise exception 'Ingen tilgang'; end if;
  if not public.mfa_ok() then raise exception 'Tofaktor kreves'; end if;
  select coalesce(p.navn, p.epost) into bruker from profiles p where p.id = auth.uid();
  select coalesce(data->'brannInfo', '{}'::jsonb) into bi from leietakere where id = lid;
  bi := jsonb_set(bi, '{midlLest}', coalesce(bi->'midlLest', '{}'::jsonb), true);
  bi := jsonb_set(bi, array['midlLest', p_id],jsonb_build_object('tid', now(), 'av', bruker), true);
  update leietakere set data = jsonb_set(data, '{brannInfo}', bi) where id = lid;
end $$;

revoke all on function public.bekreft_brannvern(int, text, text) from public, anon;
revoke all on function public.oppdater_brannvernansvarlig(text, text, text, text) from public, anon;
revoke all on function public.bekreft_brann_midlertidig(text) from public, anon;
grant execute on function public.bekreft_brannvern(int, text, text) to authenticated;
grant execute on function public.oppdater_brannvernansvarlig(text, text, text, text) to authenticated;
grant execute on function public.bekreft_brann_midlertidig(text) to authenticated;
