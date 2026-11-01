-- 005: Sjekkliste til leietaker – leietaker sender inn dokumentasjon, eier godkjenner.

-- Invitasjonslenker til leietakere (brukes av Netlify-funksjonen med service-nøkkel)
create table if not exists public.lt_invitasjon (
  token uuid primary key default gen_random_uuid(),
  leietaker_id uuid not null references public.leietakere(id) on delete cascade,
  epost text not null,
  opprettet_av uuid references public.profiles(id) on delete set null,
  opprettet timestamptz not null default now(),
  brukt timestamptz,
  bruker_id uuid references public.profiles(id) on delete set null
);
alter table public.lt_invitasjon enable row level security; -- ingen policyer: bare service-nøkkel

-- Leietaker sender inn en plikt til godkjenning (setter ikke «sist» – det gjør eier ved godkjenning)
create or replace function public.send_inn_plikt(p_key text, p_dato date, p_kommentar text, p_dok uuid default null, p_sjekk jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare lid uuid := public.mitt_leietaker_id(); pl jsonb; i int; funnet boolean := false; navn text;
begin
  if lid is null then raise exception 'Ingen tilgang'; end if;
  select coalesce(p.navn, p.epost) into navn from profiles p where p.id = auth.uid();
  select coalesce(data->'plikter','[]'::jsonb) into pl from leietakere where id = lid;
  for i in 0 .. jsonb_array_length(pl) - 1 loop
    if pl->i->>'key' = p_key then
      pl := jsonb_set(pl, array[i::text], (pl->i) || jsonb_build_object(
        'status', 'til_godkjenning',
        'innsendt', jsonb_build_object('dato', p_dato, 'komm', p_kommentar, 'dokId', p_dok, 'sjekk', coalesce(p_sjekk, '[]'::jsonb), 'tid', now(), 'av', navn),
        'tilbakemelding', null));
      funnet := true;
    end if;
  end loop;
  if not funnet then raise exception 'Fant ikke plikten'; end if;
  update leietakere set data = jsonb_set(data, '{plikter}', pl) where id = lid;
end $$;

revoke all on function public.send_inn_plikt(text,date,text,uuid,jsonb) from public, anon;
grant execute on function public.send_inn_plikt(text,date,text,uuid,jsonb) to authenticated;
