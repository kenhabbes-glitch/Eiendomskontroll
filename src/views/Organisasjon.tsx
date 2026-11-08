// Organisasjon og tilgang: medlemmer og tildeling, porteføljer, oppdrag og (for plattformadmin) kunder.
// Appen viser bare det brukeren har lov til å endre – databasen håndhever reglene uansett.
import React, { useEffect, useState } from 'react';
import { Hjelp } from '../components/Hjelp';
import { AbonnementOversikt, Bestillinger, modulAdmin, prisEditor } from './Abonnement';
import { S, adminApi, isPlattform, mineOrg, reloadAdmin, sb, state, toast, useStore, feiltekst, orgNavn, save, bump } from '../lib/store';
import { eNavn, fd, sortBy, today, aNavn } from '../lib/utils';
import { Chip, Empty, confirmBox, formModal, type Field } from '../components/ui';
import { KOMP } from '../lib/catalog';
import { PersonvernNotat } from './PersonvernNotat';

export const ORG_ROLLER: [string, string, string][] = [
  ['admin', 'Administrator', 'Styrer organisasjonen: brukere, tildeling av bygg, porteføljer og oppdrag. Ser alle bygg organisasjonen har.'],
  ['forvalter', 'Forvalter', 'Redigerer bygg de er tildelt: systemer, kontroller, avvik, dokumenter, leietakere, arealer og økonomi.'],
  ['tekniker', 'Driftstekniker', 'Ser tildelte bygg, registrerer utførte kontroller og avvik. Ser ikke leietakere eller leieavtaler.'],
  ['leser', 'Leser', 'Ser tildelte bygg uten å kunne endre (f.eks. eier, styre eller revisor).'],
];
export const OPPDRAG_ROLLER: [string, string, string][] = [
  ['forvalter', 'Forvaltning', 'Firmaet forvalter bygget: kan redigere alt (som egen forvalter). Firmaets administrator fordeler byggene på sine ansatte.'],
  ['drift', 'Drift', 'Byggdrifter: ser hele bygget, utfører kontroller og melder/lukker avvik. Kan ikke endre systemer, leietakere eller økonomi.'],
  ['service', 'Service', 'Servicefirma: ser bare systemene de er tildelt (med kontroller, avvik og FDV for disse) og kan registrere utført service.'],
  ['leser', 'Innsyn', 'Kan se bygget (f.eks. revisor, rådgiver eller kjøper i due diligence).'],
];
const ORG_TYPER: [string, string][] = [['eier', 'Gårdeier'], ['forvalter', 'Forvalterselskap'], ['drift', 'Byggdrift'], ['service', 'Servicefirma'], ['annet', 'Annet']];
const rolleNavn = (r: string) => ORG_ROLLER.find(x => x[0] === r)?.[1] || r;
const oppdragNavn = (r: string) => OPPDRAG_ROLLER.find(x => x[0] === r)?.[1] || r;
const typeNavn = (t: string) => ORG_TYPER.find(x => x[0] === t)?.[1] || t;
const profil = (id: string) => S.profiles.find(p => p.id === id) || ({} as any);
const portNavn = (id?: string) => S.portefoljer.find(p => p.id === id)?.navn || '';
// Eier av oppdrag (via eiendom eller portefølje)
const oppdragEier = (o: any) => o.eiendom_id ? S.eiendommer.find(e => e.id === o.eiendom_id)?.eierOrgId : S.portefoljer.find(p => p.id === o.portefolje_id)?.eier_org_id;
// Bygg en organisasjon har (som eier eller via aktivt oppdrag) – brukt ved tildeling
function orgBygg(org: string) {
  const L = S.eiendommer.filter(e => e.eierOrgId === org || S.oppdrag.some(o => o.org_id === org && o.aktiv && (o.eiendom_id === e.id || (o.portefolje_id && o.portefolje_id === e.portefoljeId))));
  const P = S.portefoljer.filter(p => p.eier_org_id === org || S.oppdrag.some(o => o.org_id === org && o.aktiv && o.portefolje_id === p.id));
  return { L: sortBy(L, e => e.navn), P: sortBy(P, p => p.navn) };
}
const tildelingTekst = (uid: string, org: string) => {
  const T = S.tilganger.filter(t => t.user_id === uid && t.org_id === org);
  const ord = [...T.filter(t => t.portefolje_id).map(t => 'Portefølje ' + portNavn(t.portefolje_id)), ...T.filter(t => t.eiendom_id).map(t => eNavn(t.eiendom_id))];
  return ord.length ? (ord.length <= 3 ? ord.join(', ') : `${ord.slice(0, 2).join(', ')} + ${ord.length - 2} til`) : '';
};

function TildelVelger({ org, val, set }: { org: string; val: { e: string[]; p: string[] }; set: (v: { e: string[]; p: string[] }) => void }) {
  const { L, P } = orgBygg(org);
  if (!L.length && !P.length) return <p className="small muted">Organisasjonen har ingen bygg ennå.</p>;
  const tog = (k: 'e' | 'p', id: string) => set({ ...val, [k]: val[k].includes(id) ? val[k].filter(x => x !== id) : [...val[k], id] });
  return <div className="checks" style={{ maxHeight: 260 }}>
    {P.map(p => <label key={p.id}><input type="checkbox" checked={val.p.includes(p.id)} onChange={() => tog('p', p.id)} /><span><span className="ct">Portefølje: {p.navn}</span><br /><span className="cs">Alle bygg i porteføljen, også nye som legges til · {S.eiendommer.filter(e => e.portefoljeId === p.id).length} bygg</span></span></label>)}
    {L.map(e => <label key={e.id}><input type="checkbox" checked={val.e.includes(e.id) || (!!e.portefoljeId && val.p.includes(e.portefoljeId))} disabled={!!e.portefoljeId && val.p.includes(e.portefoljeId)} onChange={() => tog('e', e.id)} /><span><span className="ct">{e.navn}</span><br /><span className="cs">{[e.adresse, portNavn(e.portefoljeId), e.eierOrgId !== org ? 'via oppdrag fra ' + orgNavn(e.eierOrgId) : ''].filter(Boolean).join(' · ')}</span></span></label>)}
  </div>;
}

async function lagreTildeling(uid: string, org: string, val: { e: string[]; p: string[] }) {
  const gml = S.tilganger.filter(t => t.user_id === uid && t.org_id === org);
  const del = gml.filter(t => (t.eiendom_id && !val.e.includes(t.eiendom_id)) || (t.portefolje_id && !val.p.includes(t.portefolje_id)));
  const add = [...val.e.filter(e => !gml.some(t => t.eiendom_id === e)).map(e => ({ user_id: uid, org_id: org, eiendom_id: e })), ...val.p.filter(p => !gml.some(t => t.portefolje_id === p)).map(p => ({ user_id: uid, org_id: org, portefolje_id: p }))];
  if (del.length) { const { error } = await sb.from('eiendom_tilgang').delete().in('id', del.map(t => t.id)); if (error) throw error; }
  if (add.length) { const { error } = await sb.from('eiendom_tilgang').insert(add); if (error) throw error; }
}

export function leggTilMedlem(org: string) {
  const fields: Field[] = [
    { k: 'navn', label: 'Navn', req: true, half: true }, { k: 'epost', label: 'E-post', type: 'email', req: true, half: true },
    { k: 'rolle', label: 'Rolle i organisasjonen', type: 'select', options: ORG_ROLLER.map(r => [r[0], r[1]] as [string, string]), def: 'forvalter' },
    { k: 'info', type: 'custom', render: v => <p className="small muted" style={{ margin: 0 }}>{ORG_ROLLER.find(r => r[0] === v.rolle)?.[2]}</p> },
    { k: 'alle_bygg', label: 'Tilgang til alle organisasjonens bygg (også nye)', type: 'checkbox', show: v => v.rolle !== 'admin' },
    { k: 'tild', type: 'custom', label: 'Tildel bygg / porteføljer', def: { e: [], p: [] }, show: v => v.rolle !== 'admin' && !v.alle_bygg, render: (v, set) => <TildelVelger org={org} val={v.tild} set={x => set({ tild: x })} /> },
    ...(isPlattform() ? [{ k: 'passord', label: 'Testbruker: sett passord i stedet for å sende invitasjon (valgfritt)', type: 'text', ph: 'Minst 10 tegn, store/små bokstaver og tall' } as Field] : []),
  ];
  formModal({
    title: 'Legg til bruker i ' + orgNavn(org), fields, saveTxt: 'Legg til',
    top: <p className="small" style={{ marginTop: 0 }}>Nye brukere får e-post med lenke for å velge passord. Har personen allerede bruker (f.eks. i en annen organisasjon), legges hen til uten ny invitasjon.</p>,
    onSave: async v => {
      const tildelinger = [...(v.tild?.e || []).map((e: string) => ({ eiendom_id: e })), ...(v.tild?.p || []).map((p: string) => ({ portefolje_id: p }))];
      try { const r = await adminApi({ action: v.passord ? 'testbruker' : 'inviter', org_id: org, epost: v.epost.trim(), navn: v.navn, rolle: v.rolle, alle_bygg: v.rolle === 'admin' || !!v.alle_bygg, tildelinger, passord: v.passord || undefined, redirectTo: location.origin }); toast(r.ny ? (v.passord ? 'Testbruker opprettet' : 'Invitasjon sendt til ' + v.epost) : 'Eksisterende bruker lagt til'); }
      catch (e: any) { toast('Feilet: ' + e.message); return false; }
      await reloadAdmin();
    },
  });
}

// Hvem i organisasjonen har tofaktor (bare synlig for administrator)
const MFA: Record<string, Record<string, boolean>> = {};
async function lastMfa(org: string) { const { data, error } = await sb.rpc('mfa_oversikt', { p_org: org }); if (!error) { MFA[org] = Object.fromEntries((data || []).map((r: any) => [r.user_id, !!r.har_mfa])); bump(); } }

function redigerMedlem(m: any) {
  const p = profil(m.user_id); const T = S.tilganger.filter(t => t.user_id === m.user_id && t.org_id === m.org_id);
  formModal({
    title: (p.navn || p.epost || 'Bruker') + ' – ' + orgNavn(m.org_id),
    values: { rolle: m.rolle, alle_bygg: m.alle_bygg, aktiv: m.aktiv, tild: { e: T.filter(t => t.eiendom_id).map(t => t.eiendom_id), p: T.filter(t => t.portefolje_id).map(t => t.portefolje_id) } },
    fields: [
      { k: 'rolle', label: 'Rolle i organisasjonen', type: 'select', options: ORG_ROLLER.map(r => [r[0], r[1]] as [string, string]) },
      { k: 'info', type: 'custom', render: v => <p className="small muted" style={{ margin: 0 }}>{ORG_ROLLER.find(r => r[0] === v.rolle)?.[2]}</p> },
      { k: 'alle_bygg', label: 'Tilgang til alle organisasjonens bygg (også nye)', type: 'checkbox', show: v => v.rolle !== 'admin' },
      { k: 'tild', type: 'custom', label: 'Tildelte bygg / porteføljer', show: v => v.rolle !== 'admin' && !v.alle_bygg, render: (v, set) => <TildelVelger org={m.org_id} val={v.tild} set={x => set({ tild: x })} /> },
      { k: 'aktiv', label: 'Aktiv i organisasjonen', type: 'checkbox' },
    ],
    extraFoot: close => <>{MFA[m.org_id]?.[m.user_id] && <button className="btn" onClick={async () => {
      if (!(await confirmBox(`Nullstille tofaktor for ${p.navn || p.epost}? Bruk dette hvis brukeren har mistet eller byttet telefon. Brukeren må sette opp tofaktor på nytt ved neste innlogging${S.orgs.find(o => o.id === m.org_id)?.krev_mfa !== false && ['admin', 'forvalter'].includes(m.rolle) ? '' : ' (hvis hen ønsker det)'}.`, 'Nullstill'))) return;
      try { await adminApi({ action: 'mfa_nullstill', user_id: m.user_id, org_id: m.org_id }); toast('Tofaktor er nullstilt'); await lastMfa(m.org_id); close(); } catch (e: any) { toast(e.message); }
    }}>Nullstill tofaktor</button>}<button className="btn danger" onClick={async () => {
      if (!(await confirmBox(`Fjerne ${p.navn || p.epost} fra ${orgNavn(m.org_id)}? Brukeren mister all tilgang via denne organisasjonen.`, 'Fjern'))) return;
      const { error } = await sb.from('org_medlem').delete().eq('org_id', m.org_id).eq('user_id', m.user_id); if (error) { toast(feiltekst(error)); return; }
      await sb.from('eiendom_tilgang').delete().eq('org_id', m.org_id).eq('user_id', m.user_id); close(); await reloadAdmin(); toast('Fjernet fra organisasjonen');
    }}>Fjern fra organisasjonen</button></>,
    onSave: async v => {
      const { error } = await sb.from('org_medlem').update({ rolle: v.rolle, alle_bygg: v.rolle === 'admin' || !!v.alle_bygg, aktiv: !!v.aktiv }).eq('org_id', m.org_id).eq('user_id', m.user_id);
      if (error) { toast(feiltekst(error)); return false; }
      try { if (v.rolle !== 'admin' && !v.alle_bygg) await lagreTildeling(m.user_id, m.org_id, v.tild); } catch (e: any) { toast(feiltekst(e)); return false; }
      await reloadAdmin(); toast('Lagret');
    },
  });
}

// ---------- Porteføljer
function redigerPortefolje(org: string, p?: any) {
  const egne = sortBy(S.eiendommer.filter(e => e.eierOrgId === org), e => e.navn);
  formModal({
    title: p ? 'Portefølje: ' + p.navn : 'Ny portefølje', values: { navn: p?.navn || '', bygg: egne.filter(e => p && e.portefoljeId === p.id).map(e => e.id) },
    fields: [{ k: 'navn', label: 'Navn', req: true }, { k: 'bygg', type: 'custom', label: 'Bygg i porteføljen', render: (v, set) => <div className="checks" style={{ maxHeight: 320 }}>{egne.map(e => { const on = v.bygg.includes(e.id); return <label key={e.id}><input type="checkbox" checked={on} onChange={() => set({ bygg: on ? v.bygg.filter((x: string) => x !== e.id) : [...v.bygg, e.id] })} /><span><span className="ct">{e.navn}</span><br /><span className="cs">{e.portefoljeId && e.portefoljeId !== p?.id ? 'Flyttes fra ' + portNavn(e.portefoljeId) : e.adresse || ''}</span></span></label>; })}</div> }],
    extraFoot: close => p ? <button className="btn danger" onClick={async () => { if (!(await confirmBox(`Slette porteføljen «${p.navn}»? Byggene beholdes, men tas ut av porteføljen, og oppdrag/tildelinger som gjelder porteføljen slettes.`))) return; const { error } = await sb.from('portefoljer').delete().eq('id', p.id); if (error) { toast(feiltekst(error)); return; } close(); await reloadAdmin(); }}>Slett</button> : null,
    onSave: async v => {
      let pid = p?.id;
      if (p) { const { error } = await sb.from('portefoljer').update({ navn: v.navn }).eq('id', p.id); if (error) { toast(feiltekst(error)); return false; } }
      else { const { data, error } = await sb.from('portefoljer').insert({ eier_org_id: org, navn: v.navn }).select().single(); if (error) { toast(feiltekst(error)); return false; } pid = data.id; S.portefoljer.push(data); }
      for (const e of egne) { const skal = v.bygg.includes(e.id); if (skal && e.portefoljeId !== pid) await save('eiendommer', { ...e, portefoljeId: pid }); if (!skal && e.portefoljeId === pid) await save('eiendommer', { ...e, portefoljeId: '' }); }
      await reloadAdmin(); toast('Portefølje lagret');
    },
  });
}

// ---------- Oppdrag (gårdeier gir et firma tilgang)
function redigerOppdrag(eierOrg: string, o?: any) {
  const egne = sortBy(S.eiendommer.filter(e => e.eierOrgId === eierOrg), e => e.navn); const P = sortBy(S.portefoljer.filter(p => p.eier_org_id === eierOrg), p => p.navn);
  const kjente = sortBy(S.orgs.filter(x => x.id !== eierOrg && x.aktiv !== false), x => x.navn);
  formModal({
    title: o ? 'Oppdrag: ' + orgNavn(o.org_id) : 'Gi et firma oppdrag', wide: true,
    values: o ? { firma: o.org_id, omfang: o.portefolje_id ? 'p' : 'e', eiendom: o.eiendom_id || '', portefolje: o.portefolje_id || '', rolle: o.rolle, systemer: o.systemer || [], fra: o.fra || '', til: o.til || '', aktiv: o.aktiv, notat: o.data?.notat || '' }
      : { firma: '', omfang: 'e', eiendom: egne[0]?.id || '', portefolje: P[0]?.id || '', rolle: 'drift', systemer: [], fra: today(), til: '', aktiv: true },
    fields: [
      ...(o ? [] : [{ k: 'orgnr', type: 'custom', label: 'Firma', render: (v: any, set: any) => <div>
        <div style={{ display: 'flex', gap: 6 }}><select value={v.firma} onChange={e => set({ firma: e.target.value })} style={{ flex: 1, border: '1px solid var(--line2)', borderRadius: 8, padding: 7 }}><option value="">– velg firma –</option>{kjente.map(x => <option key={x.id} value={x.id}>{x.navn} ({typeNavn(x.type)})</option>)}{v._funnet && !kjente.some(x => x.id === v._funnet.id) && <option value={v._funnet.id}>{v._funnet.navn} ({typeNavn(v._funnet.type)})</option>}</select></div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}><input placeholder="…eller finn firma på org.nr." value={v._orgnr || ''} onChange={e => set({ _orgnr: e.target.value })} style={{ width: 200, border: '1px solid var(--line2)', borderRadius: 8, padding: 7 }} />
          <button type="button" className="btn sm" onClick={async () => { const { data } = await sb.rpc('finn_org', { p_orgnr: v._orgnr || '' }); const f = (data || [])[0]; if (!f) { toast('Fant ingen kunde i Eiendomskontroll med dette org.nr.'); return; } set({ firma: f.id, _funnet: f }); }}>Finn</button>
          <span className="small muted">Firmaet må være kunde i Eiendomskontroll. Kontakt leverandøren for å opprette nye.</span></div></div> } as Field]),
      { k: 'omfang', label: 'Gjelder', type: 'select', options: [['e', 'Ett bygg'], ...(P.length ? [['p', 'En portefølje (alle bygg i den, også nye)']] : [])] as [string, string][], half: true },
      { k: 'eiendom', label: 'Bygg', type: 'select', options: egne.map(e => [e.id, e.navn] as [string, string]), half: true, show: v => v.omfang === 'e' },
      { k: 'portefolje', label: 'Portefølje', type: 'select', options: P.map(p => [p.id, p.navn] as [string, string]), half: true, show: v => v.omfang === 'p' },
      { k: 'rolle', label: 'Rolle', type: 'select', options: OPPDRAG_ROLLER.map(r => [r[0], r[1]] as [string, string]), help: 'oppdrag' },
      { k: 'rinfo', type: 'custom', render: v => <p className="small muted" style={{ margin: 0 }}>{OPPDRAG_ROLLER.find(r => r[0] === v.rolle)?.[2]}{v.rolle === 'service' && v.omfang === 'p' ? ' Service gjelder bestemte systemer og må gis per bygg.' : ''}</p> },
      { k: 'systemer', type: 'custom', label: 'Systemer servicefirmaet skal se', show: v => v.rolle === 'service' && v.omfang === 'e', render: (v, set) => { const A = sortBy(S.anlegg.filter(a => a.eiendomId === v.eiendom), a => (a.tfmSys || '999') + a.tfmLop);
        return A.length ? <div className="checks" style={{ maxHeight: 240 }}>{A.map(a => { const on = (v.systemer || []).includes(a.id); return <label key={a.id}><input type="checkbox" checked={on} onChange={() => set({ systemer: on ? v.systemer.filter((x: string) => x !== a.id) : [...(v.systemer || []), a.id] })} /><span><span className="ct">{aNavn(a.id)}</span><br /><span className="cs">{KOMP[a.type]?.n}{a.fabrikat ? ' · ' + a.fabrikat : ''}</span></span></label>; })}</div> : <p className="small muted">Bygget har ingen registrerte systemer.</p>; } },
      { k: 'fra', label: 'Fra dato', type: 'date', half: true }, { k: 'til', label: 'Til dato (tom = løpende)', type: 'date', half: true },
      { k: 'aktiv', label: 'Aktivt (firmaet har tilgang nå)', type: 'checkbox' },
      { k: 'notat', label: 'Notat (avtale, kontaktperson …)', type: 'textarea' },
    ],
    extraFoot: close => o ? <button className="btn danger" onClick={async () => { if (!(await confirmBox(`Avslutte og slette oppdraget til ${orgNavn(o.org_id)}? Firmaet mister tilgangen umiddelbart.`, 'Slett'))) return; const { error } = await sb.from('oppdrag').delete().eq('id', o.id); if (error) { toast(feiltekst(error)); return; } close(); await reloadAdmin(); }}>Slett oppdrag</button> : null,
    onSave: async v => {
      if (!o && !v.firma) { toast('Velg firma'); return false; }
      if (v.rolle === 'service' && v.omfang === 'p') { toast('Service må gis per bygg (med valgte systemer)'); return false; }
      if (v.rolle === 'service' && !(v.systemer || []).length) { toast('Velg minst ett system for servicefirmaet'); return false; }
      const rad: any = { org_id: o ? o.org_id : v.firma, eiendom_id: v.omfang === 'e' ? v.eiendom : null, portefolje_id: v.omfang === 'p' ? v.portefolje : null, rolle: v.rolle, systemer: v.rolle === 'service' ? v.systemer : [], fra: v.fra || null, til: v.til || null, aktiv: !!v.aktiv, data: { ...(o?.data || {}), notat: v.notat || '' } };
      const res = o ? await sb.from('oppdrag').update(rad).eq('id', o.id) : await sb.from('oppdrag').insert({ ...rad, opprettet_av: state.me?.id });
      if (res.error) { toast(feiltekst(res.error)); return false; }
      await reloadAdmin(); toast(o ? 'Oppdrag oppdatert' : 'Oppdrag opprettet – firmaets administrator kan nå tildele byggene til sine ansatte');
    },
  });
}

// ---------- Kunder (plattformadmin)
function FullTilgang() {
  const [v, setV] = useState<boolean | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { sb.from('plattform_innstilling').select('verdi').eq('nokkel', 'full_tilgang').maybeSingle().then(({ data, error }) => setV(error ? null : data?.verdi === true)); }, []);
  if (v === null) return null;
  const sett = async (ny: boolean) => { if (!ny || await confirmBox('Slå på full tilgang? Du får se og endre alle kunders eiendommer og data (krever innlogging med tofaktor). Databehandleravtalen sier i dag at leverandøren ikke ser kundedata – slå av før kommersiell drift.', 'Slå på')) {
    setBusy(true); const { error } = await sb.from('plattform_innstilling').upsert({ nokkel: 'full_tilgang', verdi: ny, endret: new Date().toISOString() }); setBusy(false);
    if (error) return toast(feiltekst(error)); setV(ny); toast(ny ? 'Full tilgang er på – laster data på nytt' : 'Full tilgang er av – laster data på nytt'); setTimeout(() => location.reload(), 600); } };
  return <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', borderColor: v ? 'var(--amber)' : undefined, marginBottom: 12 }}>
    <div style={{ flex: 1 }}><b>Full tilgang til alle kunder (utviklermodus)</b> {v ? <Chip c="amber">På</Chip> : <Chip c="grey">Av</Chip>}
      <div className="small muted">Plattformadministratorer ser og kan endre alle eiendommer og organisasjoner når de er innlogget med tofaktor.{v && !S.fullTilgang ? ' Du er ikke innlogget med tofaktor nå – logg ut og inn igjen med kode.' : ''} Slå av før kommersiell drift.</div></div>
    <button className={'btn' + (v ? '' : ' pri')} disabled={busy} onClick={() => sett(!v)}>{v ? 'Slå av' : 'Slå på'}</button></div>;
}
function endreOrg(o: any) {
  formModal({
    title: 'Endre kunde',
    fields: [{ k: 'navn', label: 'Navn', req: true, half: true }, { k: 'orgnr', label: 'Org.nr.', half: true, mono: true },
      { k: 'type', label: 'Type', type: 'select', options: ORG_TYPER, half: true }],
    values: { navn: o.navn, orgnr: o.orgnr || '', type: o.type },
    extraFoot: close => <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={() => { close(); slettOrg(o); }}>Slett kunde</button>,
    onSave: async v => { const orgnr = String(v.orgnr || '').replace(/\D/g, '');
      if (orgnr && orgnr.length !== 9) { toast('Org.nr. må ha 9 siffer'); return false; }
      const { error } = await sb.from('organisasjoner').update({ navn: String(v.navn).trim(), orgnr: orgnr || null, type: v.type }).eq('id', o.id);
      if (error) { toast(feiltekst(error)); return false; } toast('Kunden er oppdatert'); await reloadAdmin(); },
  });
}
function slettOrg(o: any) {
  formModal({
    title: `Slette «${o.navn}»?`, saveTxt: 'Slett for godt',
    top: <div className="note" style={{ color: 'var(--ink)' }}>Organisasjonen, medlemskap, porteføljer, oppdrag, innstillinger og moduler slettes. Brukere som <b>bare</b> var med i denne organisasjonen, slettes også, slik at e-postadressen kan brukes på nytt. Eier organisasjonen eiendommer, stoppes slettingen – da må eiendommene slettes eller flyttes først. <b>Dette kan ikke angres.</b></div>,
    fields: [{ k: 'bekreft', label: `Skriv «${o.navn}» for å bekrefte`, req: true }],
    onSave: async v => { if (String(v.bekreft).trim() !== String(o.navn).trim()) { toast('Navnet stemte ikke'); return false; }
      try { const r = await adminApi({ action: 'slett_org', org_id: o.id }); toast(`«${o.navn}» er slettet${r.brukere ? ` – ${r.brukere} bruker${r.brukere > 1 ? 'e' : ''} fjernet` : ''}`); await reloadAdmin(); } catch (e: any) { toast(e.message); return false; } },
  });
}
function nyOrg() {
  formModal({
    title: 'Ny kunde / organisasjon',
    fields: [{ k: 'navn', label: 'Navn', req: true, half: true }, { k: 'orgnr', label: 'Org.nr.', half: true, mono: true },
      { k: 'type', label: 'Type', type: 'select', options: ORG_TYPER, def: 'eier', half: true }, { k: 's', label: 'Første administrator', type: 'sec' },
      { k: 'admin_navn', label: 'Navn', req: true, half: true }, { k: 'admin_epost', label: 'E-post', type: 'email', req: true, half: true },
      { k: 'passord', label: 'Testkunde: sett passord i stedet for invitasjon (valgfritt)', ph: 'Minst 10 tegn, store/små bokstaver og tall' }],
    onSave: async v => { try { await adminApi({ action: 'ny_org', ...v, redirectTo: location.origin }); toast('Organisasjon opprettet'); await reloadAdmin(); } catch (e: any) { toast(e.message); return false; } },
  });
}

export function Organisasjon() {
  useStore();
  const admin = mineOrg(['admin']); const eierRoller = mineOrg(['admin', 'forvalter']).filter(o => o.type === 'eier' || S.eiendommer.some(e => e.eierOrgId === o.id) || S.portefoljer.some(p => p.eier_org_id === o.id));
  const fane0 = admin.length ? 'medlemmer' : eierRoller.length ? 'portefoljer' : isPlattform() ? 'kunder' : 'medlemmer';
  const [fane, setFane] = useState(fane0); const [orgV, setOrgV] = useState(admin[0]?.id || '');
  const tabs: [string, string][] = [...(admin.length ? [['medlemmer', 'Brukere og tildeling']] as [string, string][] : []), ...(eierRoller.length ? [['portefoljer', 'Porteføljer'], ['oppdrag', 'Oppdrag']] as [string, string][] : []), ...(admin.length ? [['personvern', 'Personvern'], ['abonnement', 'Abonnement']] as [string, string][] : []), ...(isPlattform() ? [['kunder', 'Kunder (plattform)']] as [string, string][] : [])];
  const org = admin.find(o => o.id === orgV) ? orgV : admin[0]?.id || '';
  const eierOrg = eierRoller.find(o => o.id === orgV)?.id || eierRoller[0]?.id || '';
  const orgVelger = (L: any[], v: string) => L.length > 1 ? <select value={v} onChange={e => setOrgV(e.target.value)} style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '6px 8px' }}>{L.map(o => <option key={o.id} value={o.id}>{o.navn}</option>)}</select> : <b>{L[0]?.navn}</b>;
  useEffect(() => { if (org && fane === 'medlemmer') lastMfa(org); }, [org, fane]);
  let c: React.ReactNode = null;
  if (fane === 'medlemmer' && org) {
    const M = sortBy(S.medlemmer.filter(m => m.org_id === org), m => (profil(m.user_id).navn || profil(m.user_id).epost || '').toLowerCase());
    const O = S.orgs.find(o => o.id === org); const krev = O?.krev_mfa !== false; const mf = MFA[org] || {};
    const settKrev = async (b: boolean) => {
      if (!b && !(await confirmBox('Slå av kravet om tofaktor for administratorer og forvaltere? Kontoene blir da beskyttet bare av passord. De som allerede har slått på tofaktor, beholder den.', 'Slå av kravet'))) return;
      const { error } = await sb.from('organisasjoner').update({ krev_mfa: b }).eq('id', org); if (error) return toast(feiltekst(error));
      if (O) O.krev_mfa = b; bump(); toast(b ? 'Tofaktor kreves nå for administratorer og forvaltere' : 'Kravet om tofaktor er slått av');
    };
    const mangler = M.filter(m => m.aktiv && ['admin', 'forvalter'].includes(m.rolle) && mf[m.user_id] === false);
    c = <><div className="toolbar">{orgVelger(admin, org)}<span className="muted small">{M.length} brukere · {typeNavn(S.orgs.find(o => o.id === org)?.type)}</span><button className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => leggTilMedlem(org)}>+ Legg til bruker</button></div>
      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" checked={krev} onChange={e => settKrev(e.target.checked)} /> Krev tofaktorinnlogging for administratorer og forvaltere</label>
        <p className="small muted" style={{ margin: '4px 0 0 24px' }}>{krev ? <>Administratorer og forvaltere må logge inn med passord og kode fra en autentiseringsapp. Uten tofaktor får de ikke tilgang til data – reglen håndheves i databasen.{mangler.length > 0 && <> <span style={{ color: 'var(--amber)' }}>{mangler.length} må sette det opp ved neste innlogging.</span></>}</> : 'Anbefalt å ha på. Andre brukere kan likevel slå på tofaktor selv under «Min profil».'}</p>
      </div>
      <div className="tbl-wrap"><table><thead><tr><th>Navn</th><th>E-post</th><th>Rolle</th><th>Tilgang til bygg</th><th>Tofaktor</th><th>Status</th></tr></thead><tbody>
        {M.map(m => { const p = profil(m.user_id); return <tr key={m.user_id} className="click" onClick={() => redigerMedlem(m)}><td><b style={{ fontWeight: 500 }}>{p.navn || '–'}</b>{m.user_id === state.me?.id && <span className="muted small"> (deg)</span>}</td><td className="small">{p.epost}</td>
          <td><Chip c={m.rolle === 'admin' ? 'blue' : m.rolle === 'leser' ? '' : 'green'}>{rolleNavn(m.rolle)}</Chip></td>
          <td className="small">{m.rolle === 'admin' || m.alle_bygg ? 'Alle organisasjonens bygg' : tildelingTekst(m.user_id, org) || <span style={{ color: 'var(--amber)' }}>Ingen bygg tildelt</span>}</td>
          <td>{mf[m.user_id] === undefined ? <span className="muted small">–</span> : mf[m.user_id] ? <Chip c="green">På</Chip> : krev && ['admin', 'forvalter'].includes(m.rolle) ? <Chip c="amber">Må settes opp</Chip> : <Chip>Av</Chip>}</td>
          <td>{m.aktiv ? <Chip c="green">Aktiv</Chip> : <Chip>Deaktivert</Chip>}</td></tr>; })}
      </tbody></table></div>
      <div className="sec"><h2>Roller i organisasjonen</h2><div className="tbl-wrap"><table><tbody>{ORG_ROLLER.map(r => <tr key={r[0]}><td style={{ width: 160 }}><b style={{ fontWeight: 600 }}>{r[1]}</b></td><td className="small">{r[2]}</td></tr>)}</tbody></table></div>
        <p className="small muted">Hva en bruker kan gjøre på et bygg avhenger både av rollen her og av organisasjonens forhold til bygget (eier, eller oppdrag som forvaltning, drift, service eller innsyn). Reglene håndheves i databasen.</p></div></>;
  }
  if (fane === 'portefoljer' && eierOrg) {
    const P = sortBy(S.portefoljer.filter(p => p.eier_org_id === eierOrg), p => p.navn); const uten = S.eiendommer.filter(e => e.eierOrgId === eierOrg && !e.portefoljeId);
    c = <><div className="toolbar">{orgVelger(eierRoller, eierOrg)}<button className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => redigerPortefolje(eierOrg)}>+ Ny portefølje</button></div>
      {P.length ? <div className="tbl-wrap"><table><thead><tr><th>Portefølje</th><th>Bygg</th><th className="num">Antall</th><th>Oppdrag</th></tr></thead><tbody>
        {P.map(p => { const B = S.eiendommer.filter(e => e.portefoljeId === p.id); const O = S.oppdrag.filter(o => o.portefolje_id === p.id);
          return <tr key={p.id} className="click" onClick={() => redigerPortefolje(eierOrg, p)}><td><b style={{ fontWeight: 600 }}>{p.navn}</b></td><td className="small">{B.map(e => e.navn).join(', ') || '–'}</td><td className="num">{B.length}</td><td className="small">{O.map(o => `${orgNavn(o.org_id)} (${oppdragNavn(o.rolle)})`).join(', ') || '–'}</td></tr>; })}
      </tbody></table></div> : <div className="card"><Empty t="Ingen porteføljer">Grupper byggene i porteføljer, f.eks. per selskap, område eller forvalter. Da kan du gi en forvalter hele porteføljen og se statistikk per portefølje.</Empty></div>}
      {uten.length > 0 && <p className="small muted">Bygg uten portefølje: {uten.map(e => e.navn).join(', ')}</p>}</>;
  }
  if (fane === 'oppdrag') {
    const mine = mineOrg().map(o => o.id);
    const gitt = S.oppdrag.filter(o => eierRoller.some(x => x.id === oppdragEier(o)));
    const fatt = S.oppdrag.filter(o => mine.includes(o.org_id));
    const rad = (o: any, kanEndre: boolean) => <tr key={o.id} className={kanEndre ? 'click' : ''} onClick={() => kanEndre && redigerOppdrag(oppdragEier(o), o)}>
      <td><b style={{ fontWeight: 600 }}>{kanEndre ? orgNavn(o.org_id) : orgNavn(oppdragEier(o))}</b></td><td>{o.eiendom_id ? eNavn(o.eiendom_id) : 'Portefølje: ' + portNavn(o.portefolje_id)}</td>
      <td><Chip c={o.rolle === 'forvalter' ? 'blue' : o.rolle === 'service' ? 'amber' : 'green'}>{oppdragNavn(o.rolle)}</Chip>{o.rolle === 'service' && <div className="small muted">{(o.systemer || []).map((s: string) => aNavn(s)).join(', ')}</div>}</td>
      <td className="small">{o.fra ? fd(o.fra) : '–'} – {o.til ? fd(o.til) : 'løpende'}</td>
      <td>{!o.aktiv ? <Chip>Avsluttet</Chip> : o.til && o.til < today() ? <Chip c="red">Utløpt</Chip> : <Chip c="green">Aktivt</Chip>}</td></tr>;
    c = <><div className="toolbar"><h2 style={{ margin: 0 }}>Oppdrag dere har gitt</h2><Hjelp id="oppdrag" />{eierOrg && <><span style={{ marginLeft: 'auto' }}>{orgVelger(eierRoller, eierOrg)}</span><button className="btn pri" onClick={() => redigerOppdrag(eierOrg)}>+ Gi et firma oppdrag</button></>}</div>
      {gitt.length ? <div className="tbl-wrap"><table><thead><tr><th>Firma</th><th>Gjelder</th><th>Rolle</th><th>Periode</th><th>Status</th></tr></thead><tbody>{sortBy(gitt, o => orgNavn(o.org_id)).map(o => rad(o, true))}</tbody></table></div>
        : <div className="card"><Empty t="Ingen oppdrag gitt">Gi et forvalterselskap, en byggdrifter eller et servicefirma tilgang til bygg eller porteføljer. Firmaet ser bare det dere gir dem, og tilgangen opphører når oppdraget avsluttes.</Empty></div>}
      {fatt.length > 0 && <div className="sec"><h2>Oppdrag dere har fått</h2><div className="tbl-wrap"><table><thead><tr><th>Oppdragsgiver</th><th>Gjelder</th><th>Rolle</th><th>Periode</th><th>Status</th></tr></thead><tbody>{fatt.map(o => rad(o, false))}</tbody></table></div><p className="small muted">Fordel byggene på deres ansatte under «Brukere og tildeling».</p></div>}</>;
  }
  if (fane === 'personvern' && org) {
    c = <><div className="toolbar">{orgVelger(admin, org)}<span className="muted small">Notat til advokat om hvordan appen behandler personopplysninger. Skriv ut eller lagre som PDF og send til advokaten; noter tilbakemeldingen her.</span></div>
      <PersonvernNotat key={org} org={org} /></>;
  }
  if (fane === 'abonnement' && admin.length) c = <AbonnementOversikt orgId={org} velger={admin.length > 1 ? orgVelger(admin, org) : undefined} />;
  if (fane === 'kunder' && isPlattform()) {
    const O = sortBy(S.orgs, o => o.navn);
    c = <><FullTilgang /><Bestillinger /><div className="toolbar"><span className="muted small">{O.length} organisasjoner.{S.fullTilgang ? ' Full tilgang er på: du ser og kan endre alle kunders data.' : ' Som plattformadministrator administrerer du kunder, men ser ikke deres data med mindre du er medlem.'}</span><button className="btn" style={{ marginLeft: 'auto' }} onClick={prisEditor}>Prisliste</button><button className="btn pri" onClick={nyOrg}>+ Ny kunde</button></div>
      <div className="tbl-wrap"><table><thead><tr><th>Organisasjon</th><th>Type</th><th>Org.nr.</th><th>Opprettet</th><th>Status</th><th /></tr></thead><tbody>
        {O.map(o => <tr key={o.id}><td><b style={{ fontWeight: 600 }}>{o.navn}</b>{o.lisenser && <span className="small muted"> · {o.lisenser} brukere</span>}{o.data?.selvregistrert && <div className="small muted">Selvregistrert {fd(String(o.data.registrert || '').slice(0, 10))} av {o.data.registrertAv?.navn} · {o.data.registrertAv?.epost}</div>}</td><td className="small">{typeNavn(o.type)}</td><td className="mono small">{o.orgnr || '–'}</td><td className="small">{fd(String(o.opprettet || '').slice(0, 10))}</td><td>{o.aktiv ? <Chip c="green">Aktiv</Chip> : <Chip c="red">Sperret</Chip>}</td>
          <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" style={{ marginRight: 6 }} onClick={() => modulAdmin(o)}>Moduler</button><button className="btn sm" style={{ marginRight: 6 }} onClick={() => endreOrg(o)}>Endre</button><button className="btn sm" onClick={async () => { if (!(await confirmBox(o.aktiv ? `Sperre «${o.navn}»? Alle brukere i organisasjonen mister tilgangen umiddelbart.` : `Gjenåpne «${o.navn}»?`, o.aktiv ? 'Sperr' : 'Gjenåpne'))) return; const { error } = await sb.from('organisasjoner').update({ aktiv: !o.aktiv }).eq('id', o.id); if (error) toast(feiltekst(error)); else { o.aktiv = !o.aktiv; bump(); } }}>{o.aktiv ? 'Sperr' : 'Gjenåpne'}</button></td></tr>)}
      </tbody></table></div></>;
  }
  return <>
    <div className="head"><div className="grow"><h1>Organisasjon og tilgang<Hjelp id="side.brukere" /></h1><p className="sub">{mineOrg().map(o => `${o.navn} (${rolleNavn(o.minRolle)})`).join(' · ') || 'Ingen organisasjon'}</p></div></div>
    {tabs.length > 1 && <div className="tabs">{tabs.map(([k, l]) => <a key={k} className={fane === k ? 'on' : ''} onClick={() => setFane(k)}>{l}</a>)}</div>}
    {c || <div className="card"><Empty t="Ingenting å administrere">Du er ikke administrator i noen organisasjon.</Empty></div>}
  </>;
}
