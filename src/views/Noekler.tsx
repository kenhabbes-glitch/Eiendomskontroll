// Nøkkeladministrasjon: nøkkelsystemer med låsplan og nøkkeltyper, nummererte nøkler, utkvittering og innlevering med utskrivbare skjemaer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { S, state, sb, toast, loggHendelse, kanDrifteE, useStore } from '../lib/store';
import { showModal, formModal, confirmBox, textModal } from '../components/ui';
import { byId, sortBy } from '../lib/utils';
import { tt } from '../lib/i18n';
import { skrivDok, esc, fakta, faktaPar, seksjon, tabell, regler, signatur, utfylling } from '../lib/dokument';

type Person = { navn: string; firma?: string; tlf?: string; epost?: string };
type Syl = { id: string; navn: string; sted?: string; typer: string[] };
type Sys = { id: string; eiendom_id: string; navn: string; data: { beskrivelse?: string; produsent?: string; sylindere?: Syl[]; regler?: string; arkivert?: boolean } };
type Typ = { id: string; system_id: string; eiendom_id: string; kode: string; data: { beskrivelse?: string } };
type Logg = { dato: string; tekst: string; av?: string };
type Nok = { id: string; type_id: string; system_id: string; eiendom_id: string; lopenr: number; status: 'inne' | 'ute' | 'tapt' | 'kassert'; data: { innehaver?: Person; sistHos?: Person; utkvitteringId?: string; utkvNr?: number; dato?: string; forventetRetur?: string; merknad?: string; logg?: Logg[] } };
type UtkNok = { id: string; type: string; lopenr: number; retur?: { dato: string; mottattAv: string; tapt?: boolean } };
type Utk = { id: string; eiendom_id: string; system_id: string | null; nr: number; created_at: string; data: { person: Person; nokler: UtkNok[]; dato: string; utlevertAv: string; formal?: string; forventetRetur?: string; regler: string; systemNavn: string } };

export const STANDARD_REGLER = `Nøkkelen er personlig og utleveres kun til den som har kvittert for den.
Nøkkelen må ikke kopieres, lånes bort eller overleveres til andre uten skriftlig samtykke fra utleier.
Tap eller mistanke om at nøkkelen er kommet på avveie må meldes til utleier umiddelbart.
Nøkkelen skal oppbevares forsvarlig og ikke merkes med adresse eller navn på låsen den passer til.
Nøkkelen skal leveres tilbake når behovet opphører, ved avsluttet oppdrag, arbeidsforhold eller leieforhold, eller når utleier ber om det.
Utleier kan kreve kostnader ved ombytting av sylindere og nye nøkler dekket når en nøkkel er mistet eller ikke levert tilbake.`;

const iDag = () => new Date().toISOString().slice(0, 10);
const dNo = (d?: string) => d ? d.slice(0, 10).split('-').reverse().join('.') : '';
const meg = () => state.me?.navn || state.me?.epost || '';
const lagId = () => crypto.randomUUID();
const forfalt = (n: Nok) => n.status === 'ute' && !!n.data.forventetRetur && n.data.forventetRetur < iDag();

function useNokler(eid: string) {
  const [d, setD] = useState<{ sys: Sys[]; typ: Typ[]; nok: Nok[]; utk: Utk[] } | null>(null); const [ver, setVer] = useState(0);
  useEffect(() => { let on = true; setD(null); (async () => {
    const q = (t: string) => sb.from(t).select('*').eq('eiendom_id', eid).limit(5000);
    const [a, b, c, u] = await Promise.all([q('nokkelsystemer'), q('nokkeltyper'), q('nokler'), q('nokkelutkvitteringer')]);
    const f = [a, b, c, u].find(x => x.error); if (f?.error) { toast(f.error.message); }
    if (on) setD({ sys: sortBy((a.data || []) as Sys[], s => s.navn), typ: (b.data || []) as Typ[], nok: (c.data || []) as Nok[], utk: sortBy((u.data || []) as Utk[], x => -x.nr) }); })(); return () => { on = false; }; }, [eid, ver]);
  return { d, reload: useCallback(() => setVer(x => x + 1), []) };
}

const nokkelTabell = (sys: Sys | undefined, n: UtkNok[], medRetur = false) => { const sy = sys?.data.sylindere || [];
  return tabell([tt("Nøkkelsystem"), tt("Nøkkeltype"), tt("Løpenr"), tt("Passer til"), ...(medRetur ? [tt("Levert tilbake")] : [])],
    sortBy(n, x => x.type + String(x.lopenr).padStart(6, '0')).map(x => { const pass = sy.filter(c => c.typer.includes(x.type)).map(c => c.navn + (c.sted ? ' ' + c.sted : '')).join(', ');
      return [esc(sys?.navn || ''), `<b>${esc(x.type)}</b>`, `<b>${x.lopenr}</b>`, esc(pass || '–'), ...(medRetur ? [x.retur ? esc(dNo(x.retur.dato)) + (x.retur.tapt ? ' (' + esc(tt("tapt")) + ')' : '') : ''] : [])]; }), [2]); };
const personRader = (p: Person): [string, unknown][] => [[tt("Navn"), p.navn], [tt("Firma"), p.firma], [tt("Telefon"), p.tlf], [tt("E-post"), p.epost]];
export function skrivUtkvittering(u: Utk, sys: Sys | undefined, eid: string) {
  const retur = u.data.nokler.some(k => k.retur);
  skrivDok({ type: tt("Nøkkelkvittering"), nr: u.nr, eiendomId: eid, tittel: tt("Kvittering for utlevert nøkkel"), undertittel: `${tt("Nøkkelsystem")} ${u.data.systemNavn} · ${tt("utlevert")} ${dNo(u.data.dato)}`, filnavn: `Nøkkelkvittering ${u.nr}`,
    innhold: [faktaPar(fakta(tt("Mottaker"), personRader(u.data.person)), fakta(tt("Utlevering"), [[tt("Utlevert av"), u.data.utlevertAv], [tt("Formål"), u.data.formal], [tt("Forventet retur"), dNo(u.data.forventetRetur)]])),
      seksjon(tt("Utleverte nøkler"), nokkelTabell(sys, u.data.nokler, retur)),
      regler(tt("Regler for behandling av nøkkel"), u.data.regler.split('\n')),
      `<p style="margin-top:18px">${esc(tt("Jeg bekrefter å ha mottatt nøklene over og forplikter meg til å følge reglene."))}</p>`,
      signatur([tt("Sted og dato"), tt("Mottakers underskrift"), tt("Utlevert av")]),
      utfylling(tt("Retur – fylles ut ved innlevering"), signatur([tt("Dato levert"), tt("Mottatt av"), tt("Underskrift")]))] });
}
export function skrivRetur(p: Person, sys: Sys | undefined, n: UtkNok[], dato: string, mottattAv: string, eid: string, utkNr: number[]) {
  skrivDok({ type: tt("Returkvittering"), nr: utkNr.join(', '), eiendomId: eid, tittel: tt("Kvittering for returnert nøkkel"), undertittel: `${tt("Nøkkelsystem")} ${sys?.navn || ''} · ${tt("mottatt")} ${dNo(dato)}`, filnavn: `Returkvittering ${utkNr.join('-')}`,
    innhold: [faktaPar(fakta(tt("Levert av"), personRader(p)), fakta(tt("Mottak"), [[tt("Dato"), dNo(dato)], [tt("Mottatt av"), mottattAv], [tt("Gjelder utkvittering nr"), utkNr.join(', ')]])),
      seksjon(tt("Returnerte nøkler"), nokkelTabell(sys, n)),
      `<p style="margin-top:18px">${esc(tt("Nøklene er registrert som returnert og er ikke lenger på ditt ansvar."))}</p>`,
      signatur([tt("Mottatt av (underskrift)"), tt("Levert av (underskrift)")])] });
}

const logg = (n: Nok, tekst: string): Logg[] => [...(n.data.logg || []), { dato: new Date().toISOString(), tekst, av: meg() }];
const nokNavn = (n: Nok, T: Typ[]) => `${T.find(t => t.id === n.type_id)?.kode || '?'} ${n.lopenr}`;

export function NoeklerView() {
  useStore();
  const E = sortBy(S.eiendommer.filter(e => kanDrifteE(e.id)), e => e.navn || '');
  const [eid0, setEid] = useState(''); const eid = E.some(x => x.id === eid0) ? eid0 : E[0]?.id || ''; const [fane, setFane] = useState<'sys' | 'hvem' | 'utk'>('sys'); const [sok, setSok] = useState('');
  const [vf, setVf] = useState<Record<string, { vis?: string; filt?: string }>>({}); const { d, reload } = useNokler(eid); const e = byId('eiendommer', eid);
  const sokL = sok.trim().toLowerCase(); const ute = (d?.nok || []).filter(n => n.status === 'ute');
  const grupper = (() => { const m = new Map<string, Nok[]>(); ute.forEach(n => { const p = n.data?.innehaver; const k = (p?.navn || '?') + '|' + (p?.firma || ''); m.set(k, [...(m.get(k) || []), n]); }); return sortBy([...m.entries()].filter(([, l]) => !sokL || JSON.stringify(l[0].data.innehaver).toLowerCase().includes(sokL) || l.some(n => nokNavn(n, d!.typ).toLowerCase().includes(sokL))), ([k]) => k); })();
  // Tidligere mottakere (fra skjemaene) brukes som forslag ved ny utkvittering
  const personer = useMemo(() => { const m = new Map<string, Person>(); (d?.utk || []).slice().reverse().forEach(u => m.set(u.data.person.navn.toLowerCase(), u.data.person)); return m; }, [d]);
  if (!E.length || !eid) return <div className="empty"><b>{tt("Ingen eiendommer")}</b></div>;
  const sysAv = (id: string | null) => d?.sys.find(s => s.id === id);

  const redigerSys = (s?: Sys) => formModal({ title: s ? tt("Rediger nøkkelsystem") : tt("Nytt nøkkelsystem"),
    fields: [{ k: 'navn', label: tt("Navn / systemnummer"), req: true, ph: '1SL 1058' }, { k: 'produsent', label: tt("Produsent / låsleverandør"), ph: 'ASSA ABLOY, Trio, Daloc …' }, { k: 'beskrivelse', label: tt("Beskrivelse"), type: 'textarea' },
      { k: 'regler', label: tt("Regler for behandling av nøkkel (vises på utkvitteringsskjemaet)"), type: 'textarea', hint: tt("Én regel per linje.") }],
    values: { navn: s?.navn || '', produsent: s?.data.produsent || '', beskrivelse: s?.data.beskrivelse || '', regler: s?.data.regler || STANDARD_REGLER },
    onSave: async v => { const data = { ...(s?.data || {}), produsent: v.produsent, beskrivelse: v.beskrivelse, regler: v.regler };
      const r = s ? await sb.from('nokkelsystemer').update({ navn: v.navn.trim(), data }).eq('id', s.id) : await sb.from('nokkelsystemer').insert({ eiendom_id: eid, navn: v.navn.trim(), data });
      if (r.error) { toast(r.error.message.includes('duplicate') ? tt("Systemet finnes allerede") : r.error.message); return false; }
      if (!s) loggHendelse(`Opprettet nøkkelsystem «${v.navn}»`, undefined, eid); reload(); } });
  const slettSys = async (s: Sys) => { if (d!.nok.some(n => n.system_id === s.id && n.status === 'ute')) return toast(tt("Systemet har nøkler som er utkvittert. Lever dem inn først.")); if (!(await confirmBox(tt("Slette nøkkelsystemet «{0}» med alle typer, nøkler og låsplan?", s.navn)))) return; const r = await sb.from('nokkelsystemer').delete().eq('id', s.id); if (r.error) return toast(r.error.message); loggHendelse(`Slettet nøkkelsystem «${s.navn}»`, undefined, eid); reload(); };
  const nyType = (s: Sys, t?: Typ) => formModal({ title: t ? tt("Rediger nøkkeltype") : tt("Ny nøkkeltype"),
    fields: [{ k: 'kode', label: tt("Nøkkeltype"), req: true, ph: 'HN, K1, K2 …', half: true }, ...(t ? [] : [{ k: 'antall', label: tt("Antall nøkler som er produsert"), type: 'number' as const, half: true, hint: tt("Får løpenummer 1, 2, 3 …") }]), { k: 'beskrivelse', label: tt("Beskrivelse"), ph: tt("F.eks. Hovednøkkel, kontor, teknisk rom") }],
    values: { kode: t?.kode || '', antall: '', beskrivelse: t?.data.beskrivelse || '' },
    onSave: async v => { const kode = v.kode.trim().toUpperCase(); const data = { beskrivelse: v.beskrivelse };
      if (t) { const gml = t.kode, syl = (s.data.sylindere || []).map(x => ({ ...x, typer: [...x.typer] })); const r = await sb.from('nokkeltyper').update({ kode, data }).eq('id', t.id); if (r.error) { toast(r.error.message.includes('duplicate') ? tt("Nøkkeltypen finnes allerede i systemet") : r.error.message); return false; }
        if (kode !== gml && syl.some(x => x.typer.includes(gml))) await sb.from('nokkelsystemer').update({ data: { ...s.data, sylindere: syl.map(x => ({ ...x, typer: x.typer.map(k => k === gml ? kode : k) })) } }).eq('id', s.id);
        reload(); return; }
      const r = await sb.from('nokkeltyper').insert({ system_id: s.id, eiendom_id: eid, kode, data }).select().single(); if (r.error) { toast(r.error.message.includes('duplicate') ? tt("Nøkkeltypen finnes allerede i systemet") : r.error.message); return false; }
      if (+v.antall > 0) { const f = await lagNokler(s, r.data as Typ, +v.antall, 0); if (f) return false; } reload(); } });
  const lagNokler = async (s: Sys, t: Typ, n: number, start: number) => { if (n > 500) { toast(tt("Maks 500 nøkler om gangen")); return 'x'; } const rows = Array.from({ length: n }, (_, i) => ({ type_id: t.id, system_id: s.id, eiendom_id: eid, lopenr: start + i + 1, status: 'inne', data: { logg: [{ dato: new Date().toISOString(), tekst: 'Registrert', av: meg() }] } }));
    const r = await sb.from('nokler').insert(rows); if (r.error) { toast(r.error.message); return r.error.message; } loggHendelse(`Registrerte ${n} nøkler ${t.kode} i ${s.navn}`, undefined, eid); return ''; };
  const leggTil = (s: Sys, t: Typ) => formModal({ title: tt("Legg til nøkler – {0} {1}", s.navn, t.kode), fields: [{ k: 'antall', label: tt("Antall nye nøkler"), type: 'number', req: true }], values: { antall: 1 },
    onSave: async v => { const siste = Math.max(0, ...d!.nok.filter(n => n.type_id === t.id).map(n => n.lopenr)); const f = await lagNokler(s, t, Math.floor(+v.antall), siste); if (f) return false; reload(); } });
  const slettType = async (t: Typ) => { if (d!.nok.some(n => n.type_id === t.id && n.status === 'ute')) return toast(tt("Typen har utkvitterte nøkler")); if (!(await confirmBox(tt("Slette nøkkeltypen {0} og alle nøklene av typen?", t.kode)))) return; const r = await sb.from('nokkeltyper').delete().eq('id', t.id); if (r.error) return toast(r.error.message); reload(); };

  const laasplan = (s: Sys) => showModal(tt("Låsplan – {0}", s.navn), close => <Laasplan s={s} T={d!.typ.filter(t => t.system_id === s.id)} onSaved={() => { reload(); close(); }} />, { wide: true });

  const utkvitter = (s: Sys, forvalgt: string[] = []) => {
    const T = sortBy(d!.typ.filter(t => t.system_id === s.id), t => t.kode); const ledige = d!.nok.filter(n => n.system_id === s.id && n.status === 'inne'); if (!ledige.length) return toast(tt("Ingen ledige nøkler i dette systemet"));
    formModal({ title: tt("Utkvitter nøkler – {0}", s.navn), wide: true, saveTxt: tt("Utkvitter og skriv ut skjema"),
      onChange: (k, v, prev) => { if (k !== 'navn') return; const p = personer.get(String(v.navn).trim().toLowerCase()); if (p && !prev.firma && !prev.tlf && !prev.epost) return { firma: p.firma || '', tlf: p.tlf || '', epost: p.epost || '' }; },
      fields: [{ k: 'navn', label: tt("Mottaker (navn)"), req: true, half: true, dl: [...personer.values()].map(p => [p.navn, p.firma || ''] as [string, string]) }, { k: 'firma', label: tt("Firma / leietaker"), half: true, dl: sortBy(S.leietakere.filter((l: any) => l.eiendomId === eid), (l: any) => l.navn || '').map((l: any) => [l.navn, ''] as [string, string]) }, { k: 'tlf', label: tt("Telefon"), half: true }, { k: 'epost', label: tt("E-post"), type: 'email', half: true },
        { k: 'formal', label: tt("Formål"), ph: tt("F.eks. leietaker, vaktmester, renhold, håndverker"), half: true }, { k: 'forventetRetur', label: tt("Forventet levert tilbake"), type: 'date', half: true }, { k: 'dato', label: tt("Utlevert dato"), type: 'date', half: true },
        { k: 'valgt', label: tt("Velg nøkler"), type: 'custom', render: (v, set) => { const val: string[] = v.valgt || []; return <div>{T.map(t => { const l = sortBy(ledige.filter(n => n.type_id === t.id), n => n.lopenr); if (!l.length) return null; return <div key={t.id} style={{ marginBottom: 6 }}><b>{t.kode}</b> <span className="small muted">{t.data.beskrivelse || ''} · {l.length} {tt("ledige")}</span><br />{l.map(n => { const på = val.includes(n.id); return <button type="button" key={n.id} className={'btn sm' + (på ? ' pri' : '')} style={{ margin: '2px 3px 2px 0', minWidth: 38 }} onClick={() => set({ valgt: på ? val.filter(x => x !== n.id) : [...val, n.id] })}>{n.lopenr}</button>; })}</div>; })}<div className="small muted">{val.length} {tt("valgt")}</div></div>; } }],
      values: { navn: '', firma: '', tlf: '', epost: '', formal: '', forventetRetur: '', dato: iDag(), valgt: forvalgt },
      onSave: async v => { const val: string[] = v.valgt || []; if (!val.length) { toast(tt("Velg minst én nøkkel")); return false; }
        const person: Person = { navn: v.navn.trim(), firma: v.firma.trim(), tlf: v.tlf.trim(), epost: v.epost.trim() };
        const data = { person, dato: v.dato || iDag(), utlevertAv: meg(), formal: v.formal, forventetRetur: v.forventetRetur, regler: s.data.regler || STANDARD_REGLER, systemNavn: s.navn };
        const r = await sb.rpc('nokkel_utkvitter', { p_eiendom: eid, p_system: s.id, p_nokler: val, p_data: data }); if (r.error || !r.data) { toast(r.error?.message || tt("Utkvitteringen ble ikke lagret")); reload(); return false; }
        const u = r.data as Utk; loggHendelse(`Utkvitterte ${u.data.nokler.length} nøkler (${s.navn}) til ${person.navn}, skjema ${u.nr}`, undefined, eid); reload(); skrivUtkvittering(u, s, eid); } });
  };

  const leverInn = (keys: Nok[]) => { if (!keys.length) return toast(tt("Velg nøklene som leveres tilbake"));
    const p = keys[0].data.innehaver || { navn: '?' }; const T = d!.typ;
    formModal({ title: tt("Lever inn nøkler fra {0}", p.navn), saveTxt: tt("Registrer innlevert og skriv ut kvittering"), top: <p className="small">{keys.map(n => nokNavn(n, T)).join(', ')}</p>,
      fields: [{ k: 'dato', label: tt("Dato"), type: 'date', half: true }, { k: 'mottattAv', label: tt("Mottatt av"), half: true }, { k: 'merknad', label: tt("Merknad"), type: 'textarea' }], values: { dato: iDag(), mottattAv: meg(), merknad: '' },
      onSave: async v => { const utkNr = [...new Set(keys.map(n => n.data.utkvNr || 0).filter(Boolean))];
        const r = await sb.rpc('nokkel_avslutt', { p_nokler: keys.map(n => n.id), p_status: 'inne', p_dato: v.dato || iDag(), p_av: v.mottattAv || meg(), p_merknad: v.merknad || '' }); if (r.error) { toast(r.error.message); reload(); return false; }
        loggHendelse(`Mottok ${keys.length} nøkler fra ${p.navn}`, undefined, eid); reload();
        const sys0 = sysAv(keys[0].system_id); const rader: UtkNok[] = keys.map(n => ({ id: n.id, type: T.find(t => t.id === n.type_id)?.kode || '', lopenr: n.lopenr }));
        skrivRetur(p, sys0, rader, v.dato, v.mottattAv, eid, utkNr); } });
  };
  const markerTapt = async (n: Nok, st: 'tapt' | 'kassert') => { if (!(await confirmBox(st === 'tapt' ? tt("Registrere nøkkelen som tapt? Vurder ombytting av sylindere.") : tt("Registrere nøkkelen som kassert?"), tt("Registrer")))) return;
    if (n.status === 'ute') { const r = await sb.rpc('nokkel_avslutt', { p_nokler: [n.id], p_status: 'tapt', p_dato: iDag(), p_av: meg(), p_merknad: '' }); if (r.error) return toast(r.error.message); loggHendelse(`Nøkkel ${nokNavn(n, d!.typ)} meldt tapt (hos ${n.data.innehaver?.navn || '?'})`, undefined, eid); return reload(); }
    const x = await sb.from('nokler').update({ status: st, data: { ...n.data, logg: logg(n, st === 'tapt' ? 'Meldt tapt' : 'Kassert') } }).eq('id', n.id).eq('status', 'inne'); if (x.error) return toast(x.error.message); loggHendelse(`Nøkkel ${nokNavn(n, d!.typ)} markert ${st}`, undefined, eid); reload(); };
  const gjenopprett = async (n: Nok) => { const x = await sb.from('nokler').update({ status: 'inne', data: { ...n.data, innehaver: undefined, logg: logg(n, n.status === 'tapt' ? 'Funnet – tilbake på lager' : 'Tatt i bruk igjen') } }).eq('id', n.id).in('status', ['tapt', 'kassert']); if (x.error) return toast(x.error.message); reload(); };
  const historikk = (n: Nok) => textModal(tt("Historikk – {0}", nokNavn(n, d!.typ)), (n.data.logg || []).slice().reverse().map(l => `${dNo(l.dato)} ${l.dato.slice(11, 16)}  ${l.tekst}${l.av ? ' (' + l.av + ')' : ''}`).join('\n') || '–');

  const nokRad = (n: Nok) => <tr key={n.id}><td><b>{nokNavn(n, d!.typ)}</b></td><td><span className={'chip ' + ({ inne: 'green', ute: 'amber', tapt: 'red', kassert: '' } as any)[n.status]}>{tt(({ inne: 'På lager', ute: 'Utkvittert', tapt: 'Tapt', kassert: 'Kassert' } as any)[n.status])}</span></td>
    <td className="small">{n.data.innehaver ? <>{n.data.innehaver.navn}{n.data.innehaver.firma ? ' · ' + n.data.innehaver.firma : ''}<br /><span className="muted">{tt("siden")} {dNo(n.data.dato)} · {tt("skjema")} {n.data.utkvNr}</span>{forfalt(n) && <> <span className="chip red">{tt("Retur forfalt {0}", dNo(n.data.forventetRetur))}</span></>}</> : n.status === 'tapt' && n.data.sistHos ? <span className="muted">{tt("Sist hos {0}", n.data.sistHos.navn)}</span> : n.data.merknad ? <span className="muted">{n.data.merknad}</span> : ''}</td>
    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{n.status === 'ute' && <button className="btn sm" onClick={() => leverInn([n])}>{tt("Lever inn")}</button>} {n.status === 'inne' && <><button className="btn sm" onClick={() => utkvitter(sysAv(n.system_id)!, [n.id])}>{tt("Utkvitter")}</button> <button className="btn sm" onClick={() => markerTapt(n, 'kassert')}>{tt("Kasser")}</button></>} {(n.status === 'ute' || n.status === 'inne') && <button className="btn sm" onClick={() => markerTapt(n, 'tapt')}>{tt("Tapt")}</button>} {(n.status === 'tapt' || n.status === 'kassert') && <button className="btn sm" onClick={() => gjenopprett(n)}>{tt("Gjenopprett")}</button>} <button className="btn sm ghost" onClick={() => historikk(n)}>{tt("Historikk")}</button></td></tr>;

  const sysKort = (s: Sys) => { const T = sortBy(d!.typ.filter(t => t.system_id === s.id), t => t.kode); const N = d!.nok.filter(n => n.system_id === s.id); const vis = vf[s.id]?.vis || '', filt = vf[s.id]?.filt || ''; const setVis = (x: string) => setVf(o => ({ ...o, [s.id]: { ...o[s.id], vis: x } })); const setFilt = (x: string) => setVf(o => ({ ...o, [s.id]: { ...o[s.id], filt: x } }));
    const liste = sortBy(N.filter(n => (!vis || n.type_id === vis) && (!filt || n.status === filt)), n => (T.find(t => t.id === n.type_id)?.kode || '') + String(n.lopenr).padStart(6, '0'));
    return <div className="card" key={s.id} style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><h3 style={{ margin: 0 }}>{s.navn}</h3><span className="small muted">{[s.data.produsent, s.data.beskrivelse].filter(Boolean).join(' · ')}</span><span className="grow" />
        <button className="btn sm pri" onClick={() => utkvitter(s)}>{tt("Utkvitter nøkler")}</button><button className="btn sm" onClick={() => laasplan(s)}>{tt("Låsplan")} ({(s.data.sylindere || []).length})</button><button className="btn sm" onClick={() => redigerSys(s)}>{tt("Rediger")}</button><button className="btn sm" onClick={() => slettSys(s)}>{tt("Slett")}</button></div>
      <div className="tbl-wrap" style={{ marginTop: 10 }}><table><thead><tr><th>{tt("Nøkkeltype")}</th><th>{tt("Beskrivelse")}</th><th>{tt("Totalt")}</th><th>{tt("På lager")}</th><th>{tt("Utkvittert")}</th><th>{tt("Tapt")}</th><th /></tr></thead><tbody>
        {T.map(t => { const x = N.filter(n => n.type_id === t.id); const c = (st: string) => x.filter(n => n.status === st).length; return <tr key={t.id}><td><b>{t.kode}</b></td><td className="small">{t.data.beskrivelse}</td><td>{x.length - c('kassert')}</td><td>{c('inne')}</td><td>{c('ute') ? <b>{c('ute')}</b> : 0}</td><td>{c('tapt') ? <span style={{ color: 'var(--red)' }}>{c('tapt')}</span> : 0}</td>
          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="btn sm" onClick={() => leggTil(s, t)}>{tt("+ Nøkler")}</button> <button className="btn sm" onClick={() => setVis(vis === t.id ? '' : t.id)}>{vis === t.id ? tt("Vis alle") : tt("Vis nøkler")}</button> <button className="btn sm" onClick={() => nyType(s, t)}>{tt("Rediger")}</button> <button className="btn sm" onClick={() => slettType(t)}>✕</button></td></tr>; })}
        {!T.length && <tr><td colSpan={7} className="muted">{tt("Ingen nøkkeltyper ennå.")}</td></tr>}</tbody></table></div>
      <p style={{ margin: '8px 0' }}><button className="btn sm" onClick={() => nyType(s)}>{tt("+ Ny nøkkeltype")}</button></p>
      {N.length > 0 && <details open={!!vis}><summary className="small" style={{ cursor: 'pointer' }}>{tt("Alle nøkler i systemet")} ({N.length})</summary>
        <p><select value={filt} onChange={x => setFilt(x.target.value)}><option value="">{tt("Alle statuser")}</option><option value="inne">{tt("På lager")}</option><option value="ute">{tt("Utkvittert")}</option><option value="tapt">{tt("Tapt")}</option><option value="kassert">{tt("Kassert")}</option></select></p>
        <div className="tbl-wrap"><table><tbody>{liste.slice(0, 300).map(nokRad)}</tbody></table></div>{liste.length > 300 && <p className="small muted">{tt("Viser de 300 første. Bruk filter.")}</p>}</details>}
    </div>; };


  return <div>
    <div className="head"><div className="grow"><h1>{tt("Nøkler")}</h1><p className="sub">{tt("Nøkkelsystemer, låsplan og hvem som har hvilke nøkler")}</p></div>{E.length > 1 && <select value={eid} onChange={x => setEid(x.target.value)}>{E.map(x => <option key={x.id} value={x.id}>{x.navn}</option>)}</select>}</div>
    <p><button className={'btn' + (fane === 'sys' ? ' pri' : '')} onClick={() => setFane('sys')}>{tt("Nøkkelsystemer")}</button> <button className={'btn' + (fane === 'hvem' ? ' pri' : '')} onClick={() => setFane('hvem')}>{tt("Hvem har nøkler")} ({ute.length}){ute.some(forfalt) && <span className="chip red" style={{ marginLeft: 6 }}>{ute.filter(forfalt).length} {tt("forfalt")}</span>}</button> <button className={'btn' + (fane === 'utk' ? ' pri' : '')} onClick={() => setFane('utk')}>{tt("Utkvitteringer")}</button></p>
    {!d ? <p className="muted">{tt("Laster …")}</p> : fane === 'sys' ? <>{d.sys.map(sysKort)}{!d.sys.length && <p className="muted">{tt("Ingen nøkkelsystemer ennå. Opprett det første, for eksempel «1SL 1058».")}</p>}<button className="btn pri" onClick={() => redigerSys()}>{tt("+ Nytt nøkkelsystem")}</button></>
      : fane === 'hvem' ? <>
        <p><input placeholder={tt("Søk på person, firma eller nøkkel …")} value={sok} onChange={x => setSok(x.target.value)} style={{ minWidth: 280 }} /></p>
        {grupper.map(([k, l]) => { const p = l[0].data.innehaver || { navn: '?' }; return <div className="card" key={k} style={{ marginBottom: 10 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{p.navn}</b><span className="small muted">{[p.firma, p.tlf, p.epost].filter(Boolean).join(' · ')}</span><span className="grow" /><button className="btn sm pri" onClick={() => leverInn(l)}>{tt("Lever inn alle")} ({l.length})</button></div>
          <div className="tbl-wrap"><table><tbody>{sortBy(l, n => nokNavn(n, d.typ)).map(n => <tr key={n.id}><td><b>{nokNavn(n, d.typ)}</b></td><td className="small">{sysAv(n.system_id)?.navn}</td><td className="small">{tt("siden")} {dNo(n.data.dato)} · {tt("skjema")} {n.data.utkvNr}{forfalt(n) && <> <span className="chip red">{tt("Retur forfalt {0}", dNo(n.data.forventetRetur))}</span></>}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => markerTapt(n, 'tapt')}>{tt("Tapt")}</button> <button className="btn sm" onClick={() => leverInn([n])}>{tt("Lever inn")}</button></td></tr>)}</tbody></table></div></div>; })}
        {!grupper.length && <p className="muted">{ute.length ? tt("Ingen treff.") : tt("Ingen nøkler er utkvittert.")}</p>}</>
      : <><p><input placeholder={tt("Søk på skjemanr, person, firma eller nøkkel …")} value={sok} onChange={x => setSok(x.target.value)} style={{ minWidth: 280 }} /></p><div className="tbl-wrap"><table><thead><tr><th>{tt("Skjema")}</th><th>{tt("Dato")}</th><th>{tt("Mottaker")}</th><th>{tt("Nøkler")}</th><th>{tt("Status")}</th><th /></tr></thead><tbody>{d.utk.filter(u => !sokL || String(u.nr) === sokL || JSON.stringify(u.data.person).toLowerCase().includes(sokL) || u.data.nokler.some(k => `${k.type} ${k.lopenr}`.toLowerCase().includes(sokL))).map(u => { const igjen = u.data.nokler.filter(k => !k.retur).length; return <tr key={u.id}><td><b>{u.nr}</b></td><td>{dNo(u.data.dato)}</td><td>{u.data.person.navn}<br /><span className="small muted">{u.data.person.firma}</span></td><td className="small">{u.data.systemNavn}: {u.data.nokler.map(k => `${k.type} ${k.lopenr}`).join(', ')}</td><td>{igjen ? <span className="chip amber">{igjen} {tt("ute")}</span> : u.data.nokler.some(k => k.retur?.tapt) ? <span className="chip">{tt("Avsluttet – {0} tapt", u.data.nokler.filter(k => k.retur?.tapt).length)}</span> : <span className="chip green">{tt("Alle levert")}</span>}</td>
        <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => skrivUtkvittering(u, sysAv(u.system_id), eid)}>{tt("Skriv ut skjema")}</button></td></tr>; })}{!d.utk.length && <tr><td colSpan={6} className="muted">{tt("Ingen utkvitteringer ennå.")}</td></tr>}</tbody></table></div></>}
  </div>;
}

function Laasplan({ s, T, onSaved }: { s: Sys; T: Typ[]; onSaved: () => void }) {
  const K = sortBy(T, t => t.kode); const [rader, setRader] = useState<Syl[]>(() => (s.data.sylindere || []).map(x => ({ ...x, typer: [...x.typer] }))); const [lim, setLim] = useState(''); const [busy, setBusy] = useState(false);
  const sett = (i: number, p: Partial<Syl>) => setRader(r => r.map((x, j) => j === i ? { ...x, ...p } : x));
  const lagre = async () => { setBusy(true); const r = await sb.from('nokkelsystemer').update({ data: { ...s.data, sylindere: rader.filter(x => x.navn.trim()) } }).eq('id', s.id); setBusy(false); if (r.error) return toast(r.error.message); onSaved(); };
  const importer = () => { const nye = lim.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [navn, sted] = l.split(/[;\t]/); return { id: lagId(), navn: (navn || '').trim(), sted: (sted || '').trim(), typer: [] as string[] }; }); setRader(r => [...r, ...nye]); setLim(''); };
  return <div>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Låsplanen viser hvilke nøkkeltyper som passer til hvilke sylindere (dører/låser). Kryss av for hver sylinder. Planen skrives ut på utkvitteringsskjemaet som «Passer til».")}</p>
    {!K.length && <p className="banner">{tt("Opprett nøkkeltyper først.")}</p>}
    <div className="tbl-wrap"><table><thead><tr><th>{tt("Sylinder / dør")}</th><th>{tt("Sted")}</th>{K.map(t => <th key={t.id} style={{ textAlign: 'center' }}>{t.kode}</th>)}<th /></tr></thead><tbody>
      {rader.map((x, i) => <tr key={x.id}><td><input value={x.navn} onChange={e => sett(i, { navn: e.target.value })} placeholder="D101" style={{ width: 130 }} /></td><td><input value={x.sted || ''} onChange={e => sett(i, { sted: e.target.value })} style={{ width: 170 }} /></td>
        {K.map(t => <td key={t.id} style={{ textAlign: 'center' }}><input type="checkbox" checked={x.typer.includes(t.kode)} onChange={e => sett(i, { typer: e.target.checked ? [...x.typer, t.kode] : x.typer.filter(k => k !== t.kode) })} /></td>)}<td><button className="btn sm" onClick={() => setRader(r => r.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table></div>
    <p><button className="btn sm" onClick={() => setRader(r => [...r, { id: lagId(), navn: '', sted: '', typer: [] }])}>{tt("+ Ny sylinder")}</button></p>
    <details><summary className="small" style={{ cursor: 'pointer' }}>{tt("Lim inn flere sylindere")}</summary><p className="small muted">{tt("Én per linje: navn;sted. Kryss av nøkkeltyper etterpå.")}</p><textarea value={lim} onChange={e => setLim(e.target.value)} rows={5} style={{ width: '100%' }} /><p><button className="btn sm" disabled={!lim.trim()} onClick={importer}>{tt("Legg til")}</button></p></details>
    <p style={{ textAlign: 'right' }}><button className="btn pri" disabled={busy} onClick={lagre}>{busy ? tt("Lagrer …") : tt("Lagre låsplan")}</button></p>
  </div>;
}
