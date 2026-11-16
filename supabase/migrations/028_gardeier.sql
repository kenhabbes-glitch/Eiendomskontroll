-- Ny organisasjonsrolle «gardeier»: ser de byggene/porteføljene vedkommende er tildelt (eller alle), uten å kunne endre noe.
-- Tilgangsnivået i niva_for er det samme som for leser (kun lesing); tildeling skjer som for andre roller (enkeltbygg, portefølje, flere eller alle bygg).
alter table public.org_medlem drop constraint if exists org_medlem_rolle_check;
alter table public.org_medlem add constraint org_medlem_rolle_check check (rolle in ('admin','forvalter','tekniker','leser','gardeier'));
create or replace function public.er_medlem(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.er_org_rolle(p_org, array['admin','forvalter','tekniker','leser','gardeier']) $$;
