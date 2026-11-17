-- Valg per organisasjon: gårdeiere kan opprette egne bygg.
-- Administrator slår det på (organisasjoner.gardeier_oppretter, standard av). En gårdeier som oppretter et bygg
-- får «skriv» på akkurat det bygget (eiendommer.opprettet_av), og fortsatt bare lesing på andre bygg.
-- Slås valget av, går gårdeieren tilbake til lesing også på byggene vedkommende har opprettet.
alter table public.organisasjoner add column if not exists gardeier_oppretter boolean not null default false;
alter table public.eiendommer add column if not exists opprettet_av uuid references public.profiles(id) on delete set null;

-- opprettet_av settes av databasen og kan ikke endres av vanlige brukere
create or replace function public.eiendom_opprettet_av() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.opprettet_av := auth.uid();
  elsif auth.uid() is not null and new.opprettet_av is distinct from old.opprettet_av then
    new.opprettet_av := old.opprettet_av;
  end if;
  return new;
end $$;
drop trigger if exists eiendom_opprettet_av on public.eiendommer;
create trigger eiendom_opprettet_av before insert or update on public.eiendommer for each row execute function public.eiendom_opprettet_av();

-- Kan brukeren opprette bygg i organisasjonen? Administrator og forvalter alltid; gårdeier bare når valget er på.
create or replace function public.kan_opprette_eiendom(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.er_org_rolle(p_org, array['admin','forvalter'])
    or exists (select 1 from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
               where m.org_id = p_org and m.user_id = auth.uid() and m.aktiv and m.rolle = 'gardeier' and o.aktiv and p.aktiv and o.gardeier_oppretter)
$$;
revoke all on function public.kan_opprette_eiendom(uuid) from public, anon;
grant execute on function public.kan_opprette_eiendom(uuid) to authenticated, service_role;

drop policy if exists eiendom_insert on public.eiendommer;
create policy eiendom_insert on public.eiendommer for insert with check (eier_org_id is not null and public.kan_opprette_eiendom(eier_org_id));

-- niva_for (fra 016) med én ekstra rad: gårdeier har skriv på bygg vedkommende selv har opprettet, når valget er på
create or replace function public.niva_for(p_uid uuid, eid uuid) returns text
language sql stable security definer set search_path = public as $$
  with e as (select id, eier_org_id, portefolje_id, opprettet_av from eiendommer where id = eid),
  m as (select m.* from org_medlem m join organisasjoner o on o.id = m.org_id join profiles p on p.id = m.user_id
        where m.user_id = p_uid and m.aktiv and o.aktiv and p.aktiv),
  tildelt as (select t.org_id, t.eiendom_id, t.portefolje_id from eiendom_tilgang t where t.user_id = p_uid),
  kand as (
    select 4 as n from e where public.full_tilgang(p_uid)
    union all
    select case when m.rolle in ('admin','forvalter') then 4 when m.rolle = 'tekniker' then 3 else 2 end as n
    from m, e where m.org_id = e.eier_org_id
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from tildelt t where t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
    union all
    select 4 as n
    from m, e, organisasjoner o where m.rolle = 'gardeier' and m.org_id = e.eier_org_id and o.id = m.org_id
      and o.gardeier_oppretter and e.opprettet_av = p_uid
    union all
    select case o.rolle
             when 'forvalter' then case when m.rolle in ('admin','forvalter') then 4 when m.rolle = 'tekniker' then 3 else 2 end
             when 'drift' then case when m.rolle = 'leser' then 2 else 3 end
             when 'leser' then 2
             else 1 end
    from oppdrag o join m on m.org_id = o.org_id cross join e
    where o.aktiv and (o.fra is null or o.fra <= current_date) and (o.til is null or o.til >= current_date)
      and (o.eiendom_id = e.id or (o.portefolje_id is not null and o.portefolje_id = e.portefolje_id))
      and (m.rolle = 'admin' or m.alle_bygg or exists (select 1 from tildelt t where t.org_id = m.org_id
           and (t.eiendom_id = e.id or (t.portefolje_id is not null and t.portefolje_id = e.portefolje_id))))
  )
  select case max(n) when 4 then 'skriv' when 3 then 'drift' when 2 then 'les' when 1 then 'service' end from kand
$$;
