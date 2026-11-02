-- Isolasjonstest for organisasjoner/oppdrag/RLS. Kjøres mot en database med alle migreringer.
-- Bruker auth.uid() fra innstillingen test.uid (lokal stub). Skriver PASS/FEIL per sjekk og feiler til slutt hvis noe er galt.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
grant usage on schema public, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
grant all on all sequences in schema public to authenticated;

create temp table resultat (nr serial, tekst text, ok boolean);
grant all on resultat to authenticated; grant all on resultat_nr_seq to authenticated;
create or replace function pg_temp.sjekk(t text, faktisk bigint, forventet bigint) returns void language plpgsql as $$
begin insert into resultat(tekst, ok) values (t || ' (fikk ' || faktisk || ', ventet ' || forventet || ')', faktisk = forventet); end $$;
create or replace function pg_temp.sjekkb(t text, b boolean) returns void language plpgsql as $$
begin insert into resultat(tekst, ok) values (t, b); end $$;

-- ---------- Testdata (som superbruker)
insert into auth.users(id,email) values
 ('a0000000-0000-0000-0000-000000000001','a_adm@a.no'),('a0000000-0000-0000-0000-000000000002','a_fv@a.no'),
 ('a0000000-0000-0000-0000-000000000003','a_tek@a.no'),('a0000000-0000-0000-0000-000000000004','a_les@a.no'),
 ('b0000000-0000-0000-0000-000000000001','b_adm@b.no'),
 ('f0000000-0000-0000-0000-000000000001','f_adm@f.no'),('f0000000-0000-0000-0000-000000000002','f_fv@f.no'),
 ('c0000000-0000-0000-0000-000000000001','s_tek@s.no'),('d0000000-0000-0000-0000-000000000001','d_tek@d.no'),
 ('e0000000-0000-0000-0000-000000000001','lt@lt.no'),('e0000000-0000-0000-0000-000000000002','ingen@x.no');
update profiles set aktiv = true;

insert into organisasjoner(id,navn,type) values
 ('0a000000-0000-0000-0000-00000000000a','Eier A','eier'),('0b000000-0000-0000-0000-00000000000b','Eier B','eier'),
 ('0f000000-0000-0000-0000-00000000000f','Forvalter AS','forvalter'),('0c000000-0000-0000-0000-00000000000c','Service AS','service'),
 ('0d000000-0000-0000-0000-00000000000d','Drift AS','drift');
insert into org_medlem(org_id,user_id,rolle,alle_bygg) values
 ('0a000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000001','admin',false),
 ('0a000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000002','forvalter',false),
 ('0a000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000003','tekniker',false),
 ('0a000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000004','leser',true),
 ('0b000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-000000000001','admin',false),
 ('0f000000-0000-0000-0000-00000000000f','f0000000-0000-0000-0000-000000000001','admin',false),
 ('0f000000-0000-0000-0000-00000000000f','f0000000-0000-0000-0000-000000000002','forvalter',false),
 ('0c000000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-000000000001','tekniker',true),
 ('0d000000-0000-0000-0000-00000000000d','d0000000-0000-0000-0000-000000000001','tekniker',true);

insert into portefoljer(id,eier_org_id,navn) values ('0a100000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-00000000000a','Portefølje A1');
insert into eiendommer(id,eier_org_id,portefolje_id,data) values
 ('aa000000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-00000000000a','0a100000-0000-0000-0000-000000000001','{"navn":"A1"}'),
 ('aa000000-0000-0000-0000-000000000002','0a000000-0000-0000-0000-00000000000a','0a100000-0000-0000-0000-000000000001','{"navn":"A2"}'),
 ('aa000000-0000-0000-0000-000000000003','0a000000-0000-0000-0000-00000000000a',null,'{"navn":"A3"}'),
 ('bb000000-0000-0000-0000-000000000001','0b000000-0000-0000-0000-00000000000b',null,'{"navn":"B1"}');
insert into systemer(id,eiendom_id,data) values
 ('5a000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','{"navn":"Brannalarm A1"}'),
 ('5a000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','{"navn":"Ventilasjon A1"}'),
 ('5b000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000001','{"navn":"System B1"}');
insert into komponenter(id,eiendom_id,system_id,data) values
 ('6a000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000001','{}'),
 ('6a000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','5a000000-0000-0000-0000-000000000002','{}');
insert into oppgaver(id,eiendom_id,data) values
 ('7a000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','{"navn":"Brannalarm årlig","anleggId":"5a000000-0000-0000-0000-000000000001"}'),
 ('7a000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','{"navn":"Vent service","anleggId":"5a000000-0000-0000-0000-000000000002"}'),
 ('7a000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000002','{"navn":"Eiers IK"}');
insert into avvik(id,eiendom_id,data) values
 ('8a000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','{"tittel":"Alarm feil","anleggId":"5a000000-0000-0000-0000-000000000001"}'),
 ('8a000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','{"tittel":"Vent feil","anleggId":"5a000000-0000-0000-0000-000000000002"}');
insert into leietakere(id,eiendom_id,data) values ('9a000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','{"navn":"Leietaker A1"}');
update profiles set rolle='leietaker', leietaker_id='9a000000-0000-0000-0000-000000000001' where id='e0000000-0000-0000-0000-000000000001';
insert into dokumenter(id,eiendom_id,leietaker_id,data) values
 ('da000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',null,'{"tittel":"FDV alarm","type":"FDV-dokumentasjon","anleggIds":["5a000000-0000-0000-0000-000000000001"],"fil":{"path":"aa000000-0000-0000-0000-000000000001/fdv-alarm.pdf"}}'),
 ('da000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001',null,'{"tittel":"Brannkonsept","type":"Brannkonsept/brannteknisk dokumentasjon"}'),
 ('da000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000001','{"tittel":"Leieavtale","type":"Leieavtale","fil":{"path":"aa000000-0000-0000-0000-000000000001/leietaker/9a000000-0000-0000-0000-000000000001/avtale.pdf"}}');
insert into storage.objects(bucket_id,name) values
 ('filer','aa000000-0000-0000-0000-000000000001/fdv-alarm.pdf'),('filer','aa000000-0000-0000-0000-000000000001/annet.pdf'),
 ('filer','aa000000-0000-0000-0000-000000000001/leietaker/9a000000-0000-0000-0000-000000000001/avtale.pdf'),('filer','bb000000-0000-0000-0000-000000000001/b.pdf');
insert into innstillinger(org_id,nokkel,data) values ('0a000000-0000-0000-0000-00000000000a','rente','{"sats":5}'),('0b000000-0000-0000-0000-00000000000b','rente','{"sats":7}');

-- Tildelinger og oppdrag
insert into eiendom_tilgang(user_id,org_id,portefolje_id) values ('a0000000-0000-0000-0000-000000000002','0a000000-0000-0000-0000-00000000000a','0a100000-0000-0000-0000-000000000001');
insert into eiendom_tilgang(user_id,org_id,eiendom_id) values ('a0000000-0000-0000-0000-000000000003','0a000000-0000-0000-0000-00000000000a','aa000000-0000-0000-0000-000000000002');
insert into eiendom_tilgang(user_id,org_id,eiendom_id) values ('f0000000-0000-0000-0000-000000000002','0f000000-0000-0000-0000-00000000000f','aa000000-0000-0000-0000-000000000001');
insert into oppdrag(org_id,portefolje_id,rolle) values ('0f000000-0000-0000-0000-00000000000f','0a100000-0000-0000-0000-000000000001','forvalter');
insert into oppdrag(org_id,eiendom_id,rolle) values ('0f000000-0000-0000-0000-00000000000f','bb000000-0000-0000-0000-000000000001','forvalter');
insert into oppdrag(org_id,eiendom_id,rolle,systemer) values ('0c000000-0000-0000-0000-00000000000c','aa000000-0000-0000-0000-000000000001','service','{5a000000-0000-0000-0000-000000000001}');
insert into oppdrag(org_id,eiendom_id,rolle,til) values ('0d000000-0000-0000-0000-00000000000d','aa000000-0000-0000-0000-000000000003','drift', current_date - 1);

-- ---------- Hjelper: bytt bruker
create or replace function pg_temp.som(uid text) returns void language plpgsql as $$
begin perform set_config('test.uid', uid, false); end $$;

set role authenticated;

-- Gårdeier A administrator: alle A-bygg, ikke B
select pg_temp.som('a0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('A-admin ser A1,A2,A3', (select count(*) from eiendommer), 3);
select pg_temp.sjekk('A-admin ser ikke B1', (select count(*) from eiendommer where data->>'navn'='B1'), 0);
select pg_temp.sjekk('A-admin ser ikke systemer på B', (select count(*) from systemer where eiendom_id='bb000000-0000-0000-0000-000000000001'), 0);
select pg_temp.sjekk('A-admin ser egne innstillinger (rente 5)', (select (data->>'sats')::int from innstillinger), 5);
select pg_temp.sjekk('A-admin ser ikke medlemmer i B', (select count(*) from org_medlem where org_id='0b000000-0000-0000-0000-00000000000b'), 0);
select pg_temp.sjekk('A-admin ser ikke profil til B-admin', (select count(*) from profiles where id='b0000000-0000-0000-0000-000000000001'), 0);
select pg_temp.sjekk('A-admin ser ikke B-filer', (select count(*) from storage.objects where name like 'bb%'), 0);
do $$ begin insert into eiendommer(eier_org_id,data) values ('0b000000-0000-0000-0000-00000000000b','{"navn":"Snik"}'); perform pg_temp.sjekkb('A-admin kan IKKE opprette bygg for B', false);
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE opprette bygg for B', true); end $$;
do $$ begin insert into eiendommer(eier_org_id,data) values ('0a000000-0000-0000-0000-00000000000a','{"navn":"A4"}'); perform pg_temp.sjekkb('A-admin kan opprette bygg for A', true);
exception when others then perform pg_temp.sjekkb('A-admin kan opprette bygg for A: ' || sqlerrm, false); end $$;
do $$ begin update eiendommer set eier_org_id='0b000000-0000-0000-0000-00000000000b' where data->>'navn'='A3'; perform pg_temp.sjekkb('A-admin kan IKKE flytte bygg til B', false);
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE flytte bygg til B', true); end $$;
do $$ begin insert into eiendom_tilgang(user_id,org_id,eiendom_id) values ('b0000000-0000-0000-0000-000000000001','0a000000-0000-0000-0000-00000000000a','aa000000-0000-0000-0000-000000000003'); perform pg_temp.sjekkb('A-admin kan IKKE gi B-bruker tilgang', false);
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE gi B-bruker tilgang', true); end $$;
do $$ begin insert into org_medlem(org_id,user_id,rolle) values ('0b000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001','admin'); perform pg_temp.sjekkb('A-admin kan IKKE melde seg inn i B', false);
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE melde seg inn i B', true); end $$;
do $$ begin update profiles set plattform_admin = true where id = 'a0000000-0000-0000-0000-000000000001';
  perform pg_temp.sjekkb('A-admin kan IKKE gjøre seg til plattformadmin', not (select plattform_admin from profiles where id='a0000000-0000-0000-0000-000000000001'));
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE gjøre seg til plattformadmin', true); end $$;
do $$ begin insert into oppdrag(org_id,eiendom_id,rolle) values ('0c000000-0000-0000-0000-00000000000c','aa000000-0000-0000-0000-000000000003','drift'); perform pg_temp.sjekkb('A-admin kan gi oppdrag på eget bygg', true);
exception when others then perform pg_temp.sjekkb('A-admin kan gi oppdrag på eget bygg: ' || sqlerrm, false); end $$;
do $$ begin insert into oppdrag(org_id,eiendom_id,rolle) values ('0a000000-0000-0000-0000-00000000000a','bb000000-0000-0000-0000-000000000001','forvalter'); perform pg_temp.sjekkb('A-admin kan IKKE gi seg selv oppdrag på B', false);
exception when others then perform pg_temp.sjekkb('A-admin kan IKKE gi seg selv oppdrag på B', true); end $$;
reset role; delete from oppdrag where org_id='0c000000-0000-0000-0000-00000000000c' and eiendom_id='aa000000-0000-0000-0000-000000000003'; set role authenticated;

-- A-forvalter: bare porteføljen (A1, A2)
select pg_temp.som('a0000000-0000-0000-0000-000000000002');
select pg_temp.sjekk('A-forvalter ser bygg i porteføljen + A4 hen ikke laget', (select count(*) from eiendommer), 2);
do $$ begin update eiendommer set data = data || '{"notat":"x"}' where data->>'navn'='A1'; perform pg_temp.sjekk('A-forvalter kan redigere A1', (select count(*) from eiendommer where data->>'notat'='x'), 1); end $$;
select pg_temp.sjekk('A-forvalter ser leietaker A1', (select count(*) from leietakere), 1);

-- A-tekniker: bare A2, drift-nivå
select pg_temp.som('a0000000-0000-0000-0000-000000000003');
select pg_temp.sjekk('A-tekniker ser bare A2', (select count(*) from eiendommer), 1);
update oppgaver set data = data || '{"utfort":true}' where data->>'navn'='Eiers IK';
select pg_temp.sjekk('A-tekniker kan registrere utført på A2', (select count(*) from oppgaver where data->>'utfort'='true'), 1);
update eiendommer set data = data || '{"notat":"tek"}';
select pg_temp.sjekk('A-tekniker kan IKKE redigere bygg', (select count(*) from eiendommer where data->>'notat'='tek'), 0);
select pg_temp.sjekk('A-tekniker ser ikke leietakere', (select count(*) from leietakere), 0);

-- A-leser med alle bygg: ser alt hos A, kan ikke endre
select pg_temp.som('a0000000-0000-0000-0000-000000000004');
select pg_temp.sjekk('A-leser ser alle A-bygg (4)', (select count(*) from eiendommer), 4);
update oppgaver set data = data || '{"les":1}';
select pg_temp.sjekk('A-leser kan IKKE endre oppgaver', (select count(*) from oppgaver where data ? 'les'), 0);
do $$ begin insert into avvik(eiendom_id,data) values ('aa000000-0000-0000-0000-000000000001','{"tittel":"x"}'); perform pg_temp.sjekkb('A-leser kan IKKE opprette avvik', false);
exception when others then perform pg_temp.sjekkb('A-leser kan IKKE opprette avvik', true); end $$;
select pg_temp.sjekk('A-leser ser ikke leieavtale-dokument', (select count(*) from dokumenter where data->>'type'='Leieavtale'), 0);

-- B-admin: bare B1
select pg_temp.som('b0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('B-admin ser bare B1', (select count(*) from eiendommer), 1);
select pg_temp.sjekk('B-admin ser B-rente 7', (select (data->>'sats')::int from innstillinger), 7);
select pg_temp.sjekk('B-admin ser ingen A-avvik', (select count(*) from avvik), 0);
select pg_temp.sjekk('B-admin ser ingen A-porteføljer', (select count(*) from portefoljer), 0);
select pg_temp.sjekk('B-admin ser oppdraget til Forvalter AS på B1', (select count(*) from oppdrag), 1);

-- Forvalter AS admin: A1, A2 (portefølje) og B1 – ikke A3
select pg_temp.som('f0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('Forvalter-admin ser A1,A2,B1', (select count(*) from eiendommer), 3);
select pg_temp.sjekk('Forvalter-admin ser ikke A3', (select count(*) from eiendommer where data->>'navn'='A3'), 0);
do $$ begin insert into eiendom_tilgang(user_id,org_id,eiendom_id) values ('f0000000-0000-0000-0000-000000000002','0f000000-0000-0000-0000-00000000000f','aa000000-0000-0000-0000-000000000003'); perform pg_temp.sjekkb('Forvalter-admin kan IKKE tildele bygg firmaet ikke har', false);
exception when others then perform pg_temp.sjekkb('Forvalter-admin kan IKKE tildele bygg firmaet ikke har', true); end $$;
do $$ begin insert into eiendom_tilgang(user_id,org_id,eiendom_id) values ('f0000000-0000-0000-0000-000000000002','0f000000-0000-0000-0000-00000000000f','bb000000-0000-0000-0000-000000000001'); perform pg_temp.sjekkb('Forvalter-admin kan tildele B1 til egen ansatt', true);
exception when others then perform pg_temp.sjekkb('Forvalter-admin kan tildele B1 til egen ansatt: ' || sqlerrm, false); end $$;
do $$ begin insert into oppdrag(org_id,eiendom_id,rolle) values ('0c000000-0000-0000-0000-00000000000c','bb000000-0000-0000-0000-000000000001','drift'); perform pg_temp.sjekkb('Forvalter kan IKKE gi oppdrag videre (eier bestemmer)', false);
exception when others then perform pg_temp.sjekkb('Forvalter kan IKKE gi oppdrag videre (eier bestemmer)', true); end $$;
select pg_temp.sjekk('Forvalter-admin ser ikke A sine innstillinger', (select count(*) from innstillinger), 0);

-- Forvalter AS ansatt: A1 (tildelt) + B1 (tildelt nå)
select pg_temp.som('f0000000-0000-0000-0000-000000000002');
select pg_temp.sjekk('Forvalter-ansatt ser bare tildelte A1 og B1', (select count(*) from eiendommer), 2);

-- Servicefirma: bare tildelt system på A1
select pg_temp.som('c0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('Service ser eiendommen A1', (select count(*) from eiendommer), 1);
select pg_temp.sjekk('Service ser bare brannalarmen', (select count(*) from systemer), 1);
select pg_temp.sjekk('Service ser bare komponent på brannalarmen', (select count(*) from komponenter), 1);
select pg_temp.sjekk('Service ser bare kontroll på brannalarmen', (select count(*) from oppgaver), 1);
select pg_temp.sjekk('Service ser bare avvik på brannalarmen', (select count(*) from avvik), 1);
select pg_temp.sjekk('Service ser bare FDV koblet til brannalarmen', (select count(*) from dokumenter), 1);
select pg_temp.sjekk('Service ser ingen leietakere', (select count(*) from leietakere), 0);
select pg_temp.sjekk('Service leser bare FDV-filen for sitt system', (select count(*) from storage.objects), 1);
update systemer set data = data || '{"x":1}';
select pg_temp.sjekk('Service kan IKKE endre systemet', (select count(*) from systemer where data ? 'x'), 0);
update oppgaver set data = data || '{"utfort":"2026-11-02"}';
select pg_temp.sjekk('Service kan registrere utført på sin kontroll', (select count(*) from oppgaver where data ? 'utfort'), 1);
do $$ begin insert into avvik(eiendom_id,data) values ('aa000000-0000-0000-0000-000000000001','{"tittel":"Ny feil alarm","anleggId":"5a000000-0000-0000-0000-000000000001"}'); perform pg_temp.sjekkb('Service kan melde avvik på sitt system', true);
exception when others then perform pg_temp.sjekkb('Service kan melde avvik på sitt system: ' || sqlerrm, false); end $$;
do $$ begin insert into avvik(eiendom_id,data) values ('aa000000-0000-0000-0000-000000000001','{"tittel":"Snik","anleggId":"5a000000-0000-0000-0000-000000000002"}'); perform pg_temp.sjekkb('Service kan IKKE melde avvik på annet system', false);
exception when others then perform pg_temp.sjekkb('Service kan IKKE melde avvik på annet system', true); end $$;

-- Utløpt oppdrag gir ingen tilgang
select pg_temp.som('d0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('Drift med utløpt oppdrag ser ingenting', (select count(*) from eiendommer), 0);

-- Leietaker: bare eget leieforhold
select pg_temp.som('e0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('Leietaker ser egen eiendom', (select count(*) from eiendommer), 1);
select pg_temp.sjekk('Leietaker ser bare egen leietaker', (select count(*) from leietakere), 1);
select pg_temp.sjekk('Leietaker ser ingen systemer', (select count(*) from systemer), 0);
select pg_temp.sjekk('Leietaker ser bare egen leieavtale', (select count(*) from dokumenter), 1);

-- Bruker uten organisasjon
select pg_temp.som('e0000000-0000-0000-0000-000000000002');
select pg_temp.sjekk('Bruker uten org ser ingenting', (select count(*) from eiendommer) + (select count(*) from organisasjoner) + (select count(*) from storage.objects), 0);

-- Plattformadmin uten medlemskap i A ser ikke A sine data
select pg_temp.som('00000000-0000-0000-0000-0000000000a1');
select pg_temp.sjekk('Plattformadmin ser bare egen organisasjons bygg', (select count(*) from eiendommer), 2);
select pg_temp.sjekk('Plattformadmin ser alle organisasjoner (administrasjon)', (select count(*) from organisasjoner), 6);

-- Deaktivert organisasjon mister tilgang
reset role; update organisasjoner set aktiv = false where id = '0f000000-0000-0000-0000-00000000000f'; set role authenticated;
select pg_temp.som('f0000000-0000-0000-0000-000000000001');
select pg_temp.sjekk('Deaktivert firma ser ingenting', (select count(*) from eiendommer), 0);

reset role;
select case when ok then 'PASS ' else 'FEIL ' end || tekst from resultat order by nr;
do $$ declare n int; begin select count(*) into n from resultat where not ok; if n > 0 then raise exception '% sjekker feilet', n; end if; end $$;
