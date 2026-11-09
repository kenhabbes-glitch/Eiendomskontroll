// Nøkkeladministrasjon: nøkkelsystemer med låsplan og nøkkeltyper, nummererte nøkler, utkvittering og innlevering med utskrivbare skjemaer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { S, state, sb, toast, loggHendelse, kanDrifteE, useStore, uploadFile, deleteFile, fileUrl, aoApi, type Fil } from '../lib/store';
import { showModal, formModal, confirmBox } from '../components/ui';
import { byId, sortBy } from '../lib/utils';
import { tt } from '../lib/i18n';
import { skrivDok, esc, fakta, faktaPar, seksjon, tabell, regler, signatur, utfylling } from '../lib/dokument';

type Person = { navn: string; firma?: string; tlf?: string; epost?: string; leietakerId?: string };
type Syl = { id: string; navn: string; sted?: string; typer: string[] };
type Sys = { id: string; eiendom_id: string; navn: string; data: { beskrivelse?: string; produsent?: string; sylindere?: Syl[]; regler?: string; arkivert?: boolean } };
type Typ = { id: string; system_id: string; eiendom_id: string; kode: string; data: { beskrivelse?: string } };
type Logg = { dato: string; tekst: string; av?: string };
type Nok = { id: string; type_id: string; system_id: string; eiendom_id: string; lopenr: number; status: 'inne' | 'ute' | 'tapt' | 'kassert'; data: { innehaver?: Person; sistHos?: Person; utkvitteringId?: string; utkvNr?: number; dato?: string; forventetRetur?: string; merknad?: string; logg?: Logg[] } };
type UtkNok = { id: string; type: string; lopenr: number; retur?: { dato: string; mottattAv: string; tapt?: boolean } };
type Utk = { id: string; eiendom_id: string; system_id: string | null; nr: number; created_at: string; data: { person: Person; nokler: UtkNok[]; dato: string; utlevertAv: string; formal?: string; forventetRetur?: string; regler: string; systemNavn: string; signert?: Fil[]; signertDato?: string; signertAv?: string } };

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
/** Bilder skaleres ned og lagres som JPEG (så de kan legges inn i PDF); PDF lagres som den er. */
async function tilLagring(f: File): Promise<File | null> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return f;
  if (!f.type.startsWith('image/')) return null;
  try { const bmp = await createImageBitmap(f); const sk = Math.min(1, 2200 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sk); c.height = Math.round(bmp.height * sk);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    const b: Blob = await new Promise((ok, feil) => c.toBlob(x => x ? ok(x) : feil(new Error('bilde')), 'image/jpeg', 0.85)); return new File([b], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }); }
  catch { return null; }
}
const apneFil = async (f: Fil) => { const u = await fileUrl(f.path); if (u) window.open(u, '_blank', 'noopener'); else toast(tt("Fant ikke filen")); };
/** Hører utkvitteringen til leietakeren? Koblet direkte, eller (eldre skjemaer) samme firmanavn. */
const gjelderLeietaker = (u: Utk, l: { id: string; navn?: string }) => u.data.person.leietakerId ? u.data.person.leietakerId === l.id : !!l.navn && (u.data.person.firma || '').trim().toLowerCase() === l.navn.trim().toLowerCase();
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

  const lts = sortBy(S.leietakere.filter((l: any) => l.eiendomId === eid), (l: any) => l.navn || '').map((l: any) => [l.id, l.navn] as [string, string]);
  const utkAv = (id?: string) => id ? d?.utk.find(u => u.id === id) : undefined;
  const lastOppSignert = async (u: Utk, filer: FileList | null) => { if (!filer?.length) return; const nye: Fil[] = [];
    for (const [i, f0] of Array.from(filer).entries()) { const f = await tilLagring(f0); if (!f) { toast(tt("{0}: bare PDF og bilder kan lastes opp", f0.name)); continue; }
      const r = await uploadFile(f, eid, undefined, `Nokkelkvittering ${u.nr} signert${filer.length > 1 ? ' ' + (i + 1) : ''}.${f.type === 'application/pdf' ? 'pdf' : 'jpg'}`, 'intern/nokler'); if (r) nye.push(r); }
    if (!nye.length) return; const r = await sb.from('nokkelutkvitteringer').update({ data: { ...u.data, signert: [...(u.data.signert || []), ...nye], signertDato: iDag(), signertAv: meg() } }).eq('id', u.id);
    if (r.error) return toast(r.error.message); loggHendelse(`Signert nøkkelkvittering nr ${u.nr} lastet opp (${u.data.person.navn})`, undefined, eid); toast(tt("Signert skjema lagret")); reload(); };
  const fjernSignert = async (u: Utk, f: Fil) => { if (!(await confirmBox(tt("Fjerne «{0}» fra utkvittering nr {1}?", f.navn, u.nr), tt("Fjern")))) return; const rest = (u.data.signert || []).filter(x => x.path !== f.path);
    const r = await sb.from('nokkelutkvitteringer').update({ data: { ...u.data, signert: rest, ...(rest.length ? {} : { signertDato: undefined }) } }).eq('id', u.id); if (r.error) return toast(r.error.message); await deleteFile(f); reload(); };
  /** Status for signert skjema: lenker til filene, eller knapp for å laste opp. */
  const signertVis = (u?: Utk, kort = false) => { if (!u) return null; const F = u.data.signert || [];
    const opp = <label className="btn sm" style={{ display: 'inline-flex' }} title={tt("Skann eller ta bilde av det signerte skjemaet")}>{F.length ? '+' : tt("Last opp signert")}<input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }} onChange={x => { lastOppSignert(u, x.target.files); x.target.value = ''; }} /></label>;
    return <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>{F.length ? F.map((f, i) => <button key={f.path} className="btn sm" onClick={() => apneFil(f)} title={f.navn}>✓ {kort ? tt("Signert") : F.length > 1 ? tt("Signert {0}", i + 1) : tt("Signert skjema")}</button>) : <span className="chip amber">{tt("Ikke signert")}</span>} {opp}</span>; };
  const sendSkjema = (u: Utk) => showModal(tt("Send utkvitteringsskjema nr {0}", u.nr), close => <SendSkjema u={u} sys={sysAv(u.system_id)} eid={eid} close={close} ferdig={reload} />, {});
  /** Åpne / send skjema for en utkvittering. */
  const skjemaKnapper = (u?: Utk) => u ? <><button className="btn sm" onClick={() => skrivUtkvittering(u, sysAv(u.system_id), eid)}>{tt("Åpne skjema")}</button> <button className="btn sm" onClick={() => sendSkjema(u)}>{tt("Send på nytt")}</button></> : null;
  const leietakerRapport = () => showModal(tt("Nøkkelrapport per leietaker"), close => <LeietakerRapport eid={eid} d={d!} close={close} />, {});

  const utkvitter = (s: Sys, forvalgt: string[] = []) => {
    const T = sortBy(d!.typ.filter(t => t.system_id === s.id), t => t.kode); const ledige = d!.nok.filter(n => n.system_id === s.id && n.status === 'inne'); if (!ledige.length) return toast(tt("Ingen ledige nøkler i dette systemet"));
    formModal({ title: tt("Utkvitter nøkler – {0}", s.navn), wide: true, saveTxt: tt("Utkvitter og skriv ut skjema"),
      onChange: (k, v, prev) => { if (k === 'leietakerId') { const l = byId('leietakere', v.leietakerId); return l && !prev.firma ? { firma: l.navn || '' } : undefined; }
        if (k === 'firma' && !prev.leietakerId) { const l = S.leietakere.find((x: any) => x.eiendomId === eid && (x.navn || '').toLowerCase() === String(v.firma).trim().toLowerCase()); if (l) return { leietakerId: l.id }; }
        if (k !== 'navn') return; const p = personer.get(String(v.navn).trim().toLowerCase()); if (p && !prev.firma && !prev.tlf && !prev.epost) return { firma: p.firma || '', tlf: p.tlf || '', epost: p.epost || '', leietakerId: p.leietakerId || prev.leietakerId || '' }; },
      fields: [{ k: 'navn', label: tt("Mottaker (navn)"), req: true, half: true, dl: [...personer.values()].map(p => [p.navn, p.firma || ''] as [string, string]) }, { k: 'firma', label: tt("Firma / leietaker"), half: true, dl: sortBy(S.leietakere.filter((l: any) => l.eiendomId === eid), (l: any) => l.navn || '').map((l: any) => [l.navn, ''] as [string, string]) }, { k: 'leietakerId', label: tt("Leietaker (for nøkkelrapport)"), type: 'select', half: true, empty: tt("– ikke leietaker –"), options: lts }, { k: 'tlf', label: tt("Telefon"), half: true }, { k: 'epost', label: tt("E-post"), type: 'email', half: true },
        { k: 'formal', label: tt("Formål"), ph: tt("F.eks. leietaker, vaktmester, renhold, håndverker"), half: true }, { k: 'forventetRetur', label: tt("Forventet levert tilbake"), type: 'date', half: true }, { k: 'dato', label: tt("Utlevert dato"), type: 'date', half: true },
        { k: 'valgt', label: tt("Velg nøkler"), type: 'custom', render: (v, set) => { const val: string[] = v.valgt || []; return <div>{T.map(t => { const l = sortBy(ledige.filter(n => n.type_id === t.id), n => n.lopenr); if (!l.length) return null; return <div key={t.id} style={{ marginBottom: 6 }}><b>{t.kode}</b> <span className="small muted">{t.data.beskrivelse || ''} · {l.length} {tt("ledige")}</span><br />{l.map(n => { const på = val.includes(n.id); return <button type="button" key={n.id} className={'btn sm' + (på ? ' pri' : '')} style={{ margin: '2px 3px 2px 0', minWidth: 38 }} onClick={() => set({ valgt: på ? val.filter(x => x !== n.id) : [...val, n.id] })}>{n.lopenr}</button>; })}</div>; })}<div className="small muted">{val.length} {tt("valgt")}</div></div>; } }],
      values: { navn: '', firma: '', leietakerId: '', tlf: '', epost: '', formal: '', forventetRetur: '', dato: iDag(), valgt: forvalgt },
      onSave: async v => { const val: string[] = v.valgt || []; if (!val.length) { toast(tt("Velg minst én nøkkel")); return false; }
        const person: Person = { navn: v.navn.trim(), firma: v.firma.trim(), tlf: v.tlf.trim(), epost: v.epost.trim(), ...(v.leietakerId ? { leietakerId: v.leietakerId } : {}) };
        const data = { person, dato: v.dato || iDag(), utlevertAv: meg(), formal: v.formal, forventetRetur: v.forventetRetur, regler: s.data.regler || STANDARD_REGLER, systemNavn: s.navn };
        const r = await sb.rpc('nokkel_utkvitter', { p_eiendom: eid, p_system: s.id, p_nokler: val, p_data: data }); if (r.error || !r.data) { toast(r.error?.message || tt("Utkvitteringen ble ikke lagret")); reload(); return false; }
        const u = r.data as Utk; loggHendelse(`Utkvitterte ${u.data.nokler.length} nøkler (${s.navn}) til ${person.navn}, skjema ${u.nr}`, undefined, eid); reload(); skrivUtkvittering(u, s, eid); toast(tt("Last opp det signerte skjemaet under «Utkvitteringer» når det er signert")); } });
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
  const historikk = (n: Nok) => showModal(tt("Historikk – {0}", nokNavn(n, d!.typ)), () => { const U = d!.utk.filter(u => u.data.nokler.some(k => k.id === n.id));
    return <div><h3 style={{ marginTop: 0 }}>{tt("Utkvitteringsskjemaer for nøkkelen")}</h3>
      {U.length ? <div className="tbl-wrap"><table><tbody>{U.map(u => { const k = u.data.nokler.find(x => x.id === n.id)!; return <tr key={u.id}><td><b>{tt("Skjema")} {u.nr}</b></td><td>{u.data.person.navn}<br /><span className="small muted">{u.data.person.firma}</span></td><td className="small">{dNo(u.data.dato)} – {k.retur ? dNo(k.retur.dato) + (k.retur.tapt ? ' (' + tt("tapt") + ')' : '') : tt("ute nå")}</td><td>{signertVis(u, true)}</td><td style={{ whiteSpace: 'nowrap' }}>{skjemaKnapper(u)}</td></tr>; })}</tbody></table></div> : <p className="muted">{tt("Nøkkelen har ikke vært utkvittert.")}</p>}
      <h3>{tt("Logg")}</h3><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{(n.data.logg || []).slice().reverse().map(l => `${dNo(l.dato)} ${l.dato.slice(11, 16)}  ${l.tekst}${l.av ? ' (' + l.av + ')' : ''}`).join('\n') || '–'}</pre></div>; }, { wide: true });

  const nokRad = (n: Nok) => <tr key={n.id}><td><b>{nokNavn(n, d!.typ)}</b></td><td><span className={'chip ' + ({ inne: 'green', ute: 'amber', tapt: 'red', kassert: '' } as any)[n.status]}>{tt(({ inne: 'På lager', ute: 'Utkvittert', tapt: 'Tapt', kassert: 'Kassert' } as any)[n.status])}</span></td>
    <td className="small">{n.data.innehaver ? <>{n.data.innehaver.navn}{n.data.innehaver.firma ? ' · ' + n.data.innehaver.firma : ''}<br /><span className="muted">{tt("siden")} {dNo(n.data.dato)} · {tt("skjema")} {n.data.utkvNr}</span> {signertVis(utkAv(n.data.utkvitteringId), true)}{forfalt(n) && <> <span className="chip red">{tt("Retur forfalt {0}", dNo(n.data.forventetRetur))}</span></>}</> : n.status === 'tapt' && n.data.sistHos ? <span className="muted">{tt("Sist hos {0}", n.data.sistHos.navn)}</span> : n.data.merknad ? <span className="muted">{n.data.merknad}</span> : ''}</td>
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
    <p><button className={'btn' + (fane === 'sys' ? ' pri' : '')} onClick={() => setFane('sys')}>{tt("Nøkkelsystemer")}</button> <button className={'btn' + (fane === 'hvem' ? ' pri' : '')} onClick={() => setFane('hvem')}>{tt("Hvem har nøkler")} ({ute.length}){ute.some(forfalt) && <span className="chip red" style={{ marginLeft: 6 }}>{ute.filter(forfalt).length} {tt("forfalt")}</span>}</button> <button className={'btn' + (fane === 'utk' ? ' pri' : '')} onClick={() => setFane('utk')}>{tt("Utkvitteringer")}</button> <button className="btn" onClick={leietakerRapport} disabled={!d}>{tt("Nøkkelrapport per leietaker")}</button></p>
    {!d ? <p className="muted">{tt("Laster …")}</p> : fane === 'sys' ? <>{d.sys.map(sysKort)}{!d.sys.length && <p className="muted">{tt("Ingen nøkkelsystemer ennå. Opprett det første, for eksempel «1SL 1058».")}</p>}<button className="btn pri" onClick={() => redigerSys()}>{tt("+ Nytt nøkkelsystem")}</button></>
      : fane === 'hvem' ? <>
        <p><input placeholder={tt("Søk på person, firma eller nøkkel …")} value={sok} onChange={x => setSok(x.target.value)} style={{ minWidth: 280 }} /></p>
        {grupper.map(([k, l]) => { const p = l[0].data.innehaver || { navn: '?' }; return <div className="card" key={k} style={{ marginBottom: 10 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b>{p.navn}</b><span className="small muted">{[p.firma, p.tlf, p.epost].filter(Boolean).join(' · ')}</span><span className="grow" /><button className="btn sm pri" onClick={() => leverInn(l)}>{tt("Lever inn alle")} ({l.length})</button></div>
          <div className="tbl-wrap"><table><tbody>{sortBy(l, n => nokNavn(n, d.typ)).map(n => <tr key={n.id}><td><b>{nokNavn(n, d.typ)}</b></td><td className="small">{sysAv(n.system_id)?.navn}</td><td className="small">{tt("siden")} {dNo(n.data.dato)} · {tt("skjema")} {n.data.utkvNr}{forfalt(n) && <> <span className="chip red">{tt("Retur forfalt {0}", dNo(n.data.forventetRetur))}</span></>}</td><td>{signertVis(utkAv(n.data.utkvitteringId), true)}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{skjemaKnapper(utkAv(n.data.utkvitteringId))} <button className="btn sm" onClick={() => markerTapt(n, 'tapt')}>{tt("Tapt")}</button> <button className="btn sm" onClick={() => leverInn([n])}>{tt("Lever inn")}</button></td></tr>)}</tbody></table></div></div>; })}
        {!grupper.length && <p className="muted">{ute.length ? tt("Ingen treff.") : tt("Ingen nøkler er utkvittert.")}</p>}</>
      : <><p><input placeholder={tt("Søk på skjemanr, person, firma eller nøkkel …")} value={sok} onChange={x => setSok(x.target.value)} style={{ minWidth: 280 }} /></p><div className="tbl-wrap"><table><thead><tr><th>{tt("Skjema")}</th><th>{tt("Dato")}</th><th>{tt("Mottaker")}</th><th>{tt("Nøkler")}</th><th>{tt("Status")}</th><th>{tt("Signert skjema")}</th><th /></tr></thead><tbody>{d.utk.filter(u => !sokL || String(u.nr) === sokL || JSON.stringify(u.data.person).toLowerCase().includes(sokL) || u.data.nokler.some(k => `${k.type} ${k.lopenr}`.toLowerCase().includes(sokL))).map(u => { const igjen = u.data.nokler.filter(k => !k.retur).length; return <tr key={u.id}><td><b>{u.nr}</b></td><td>{dNo(u.data.dato)}</td><td>{u.data.person.navn}<br /><span className="small muted">{u.data.person.firma}</span></td><td className="small">{u.data.systemNavn}: {u.data.nokler.map(k => `${k.type} ${k.lopenr}`).join(', ')}</td><td>{igjen ? <span className="chip amber">{igjen} {tt("ute")}</span> : u.data.nokler.some(k => k.retur?.tapt) ? <span className="chip">{tt("Avsluttet – {0} tapt", u.data.nokler.filter(k => k.retur?.tapt).length)}</span> : <span className="chip green">{tt("Alle levert")}</span>}</td><td>{signertVis(u)}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{skjemaKnapper(u)}</td></tr>; })}{!d.utk.length && <tr><td colSpan={7} className="muted">{tt("Ingen utkvitteringer ennå.")}</td></tr>}</tbody></table></div></>}
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

// ---------- Nøkkelrapport per leietaker (PDF med signerte utkvitteringsskjemaer som vedlegg)
type Data = { sys: Sys[]; typ: Typ[]; nok: Nok[]; utk: Utk[] };
type Mottaker = { id: string; navn: string; firma?: boolean };
const matcher = (m: Mottaker) => (u: Utk) => m.firma ? !u.data.person.leietakerId && (u.data.person.firma || '').trim().toLowerCase() === m.navn.toLowerCase() : gjelderLeietaker(u, m);

async function nokkelRapportPdf(eid: string, m: Mottaker, d: Data, medHist: boolean, medVedlegg: boolean) {
  const { ArkivDoc } = await import('../lib/prosjektArkiv'); const { profilFor, M } = await import('../lib/arealRapport'); const { PDFDocument } = await import('pdf-lib');
  const e = byId('eiendommer', eid); const U = sortBy(d.utk.filter(matcher(m)), u => u.nr); const aktive = U.filter(u => u.data.nokler.some(k => !k.retur)); const ids = new Set(U.map(u => u.id));
  const ute = sortBy(d.nok.filter(n => n.status === 'ute' && ids.has(n.data.utkvitteringId || '')), n => nokNavn(n, d.typ).padEnd(8) + String(n.lopenr).padStart(6, '0'));
  const relevante = medHist ? U : aktive; const mangler = relevante.filter(u => !(u.data.signert || []).length);
  const perType = new Map<string, number>(); ute.forEach(n => { const k = d.typ.find(t => t.id === n.type_id)?.kode || '?'; perType.set(k, (perType.get(k) || 0) + 1); });
  const D: any = await ArkivDoc.lag(`${tt("Nøkkeloversikt")} – ${m.navn}`); D.profil = profilFor(eid, tt("Nøkkeloversikt"));
  D.h1(tt("Nøkler utlevert til {0}", m.navn));
  D.kv([[tt("Leietaker"), m.navn], [tt("Eiendom"), e?.navn || ''], [tt("Dato"), dNo(iDag())], [tt("Nøkler utlevert nå"), String(ute.length)],
    [tt("Fordelt på nøkkeltype"), [...perType.entries()].sort().map(([k, n]) => `${k}: ${n}`).join(', ')], [tt("Utkvitteringsskjemaer"), String(relevante.length)], [tt("Mangler signert skjema"), mangler.length ? mangler.map(u => tt("nr {0}", u.nr)).join(', ') : tt("Ingen")]]);
  D.h2(tt("Nøkler som er utlevert nå"));
  if (ute.length) D.tab([[tt("System"), 1.3], [tt("Type"), 0.7], [tt("Løpenr"), 0.7, true], [tt("Mottaker"), 2], [tt("Utlevert"), 1], [tt("Skjema"), 0.7, true], [tt("Signert"), 0.8]],
    ute.map(n => { const u = d.utk.find(x => x.id === n.data.utkvitteringId); return { c: [d.sys.find(s => s.id === n.system_id)?.navn || '', d.typ.find(t => t.id === n.type_id)?.kode || '', String(n.lopenr), n.data.innehaver?.navn || '', dNo(n.data.dato), String(n.data.utkvNr || ''), (u?.data.signert || []).length ? tt("Ja") : tt("Mangler")] }; }));
  else D.tekst(tt("Ingen nøkler er utlevert nå."));
  if (medHist) { const H = U.flatMap(u => u.data.nokler.filter(k => k.retur).map(k => ({ u, k })));
    D.h2(tt("Tidligere utlån"));
    if (H.length) D.tab([[tt("System"), 1.3], [tt("Type"), 0.7], [tt("Løpenr"), 0.7, true], [tt("Mottaker"), 2], [tt("Utlevert"), 1], [tt("Avsluttet"), 1.3], [tt("Skjema"), 0.7, true]],
      H.map(({ u, k }) => ({ c: [u.data.systemNavn, k.type, String(k.lopenr), u.data.person.navn, dNo(u.data.dato), dNo(k.retur!.dato) + (k.retur!.tapt ? ' (' + tt("tapt") + ')' : ''), String(u.nr)] })));
    else D.tekst(tt("Ingen tidligere utlån."));
  }
  D.h2(tt("Vedlegg: signerte utkvitteringsskjemaer"));
  if (relevante.length) D.tab([[tt("Skjema"), 0.7, true], [tt("Mottaker"), 2], [tt("Utlevert"), 1], [tt("Nøkler"), 2.4], [tt("Signert skjema"), 1.2]],
    relevante.map(u => ({ c: [String(u.nr), u.data.person.navn, dNo(u.data.dato), u.data.nokler.map(k => `${k.type} ${k.lopenr}`).join(', '), (u.data.signert || []).length ? (medVedlegg ? tt("Vedlagt") : tt("Ja")) : tt("Mangler")] })));
  else D.tekst(tt("Ingen utkvitteringer."));
  if (medVedlegg) for (const u of relevante) for (const f of u.data.signert || []) {
    try { const buf = await (await fetch(await fileUrl(f.path))).arrayBuffer(); const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.navn);
      if (pdf) { const src = await PDFDocument.load(buf, { ignoreEncryption: true }); (await D.pdf.copyPages(src, src.getPageIndices())).forEach((p: any) => D.pdf.addPage(p)); continue; }
      const img = /\.png$/i.test(f.navn) || f.type === 'image/png' ? await D.pdf.embedPng(buf) : await D.pdf.embedJpg(buf); const pg = D.nyside(img.width > img.height);
      D.t(`${tt("Vedlegg")} – ${tt("utkvittering nr {0}", u.nr)} (${u.data.person.navn}, ${dNo(u.data.dato)})`, M, D.y - 10, 10, undefined, true);
      const W = pg.getWidth() - 2 * M, H = D.y - 26 - 46; const sk = Math.min(W / img.width, H / img.height); pg.drawImage(img, { x: M + (W - img.width * sk) / 2, y: 46 + (H - img.height * sk) / 2, width: img.width * sk, height: img.height * sk });
    } catch (err) { console.error(err); toast(tt("Kunne ikke legge ved {0}", f.navn)); }
  }
  return await D.pdf.save() as Uint8Array;
}

function LeietakerRapport({ eid, d, close }: { eid: string; d: Data; close: () => void }) {
  const M0: Mottaker[] = useMemo(() => { const L: Mottaker[] = sortBy(S.leietakere.filter((l: any) => l.eiendomId === eid), (l: any) => l.navn || '').map((l: any) => ({ id: l.id, navn: l.navn || '?' }));
    const firma = new Set<string>(); d.utk.forEach(u => { const f = (u.data.person.firma || '').trim(); if (f && !u.data.person.leietakerId && !L.some(l => l.navn.toLowerCase() === f.toLowerCase())) firma.add(f); });
    return [...L, ...[...firma].sort().map(f => ({ id: 'firma:' + f, navn: f, firma: true }))]; }, [eid, d]);
  const tall = (m: Mottaker) => { const U = d.utk.filter(matcher(m)); const ids = new Set(U.map(u => u.id)); return { ute: d.nok.filter(n => n.status === 'ute' && ids.has(n.data.utkvitteringId || '')).length, skjema: U.filter(u => u.data.nokler.some(k => !k.retur)).length, mangler: U.filter(u => u.data.nokler.some(k => !k.retur) && !(u.data.signert || []).length).length }; };
  const [vid, setVid] = useState(() => M0.find(m => tall(m).ute > 0)?.id || M0[0]?.id || ''); const [hist, setHist] = useState(false); const [ved, setVed] = useState(true); const [busy, setBusy] = useState(false);
  const m = M0.find(x => x.id === vid); const t = m ? tall(m) : null;
  const lag = async () => { if (!m) return; setBusy(true);
    try { const b = await nokkelRapportPdf(eid, m, d, hist, ved); const u = URL.createObjectURL(new Blob([b as any], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = u; a.download = `Nøkkeloversikt ${m.navn} ${iDag()}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 20000);
      loggHendelse(`Nøkkelrapport for ${m.navn} lastet ned`, undefined, eid); close(); }
    catch (e: any) { toast(tt("Kunne ikke lage rapporten: ") + (e?.message || e)); }
    setBusy(false); };
  if (!M0.length) return <p className="muted">{tt("Ingen leietakere på eiendommen, og ingen utkvitteringer med firmanavn.")}</p>;
  return <div>
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Rapporten viser hvilke nøkler leietakeren har kvittert ut, med de signerte utkvitteringsskjemaene som vedlegg.")}</p>
    <div className="form"><div className="fld"><label htmlFor="nr_lt">{tt("Leietaker")}</label><select id="nr_lt" value={vid} onChange={x => setVid(x.target.value)}>{M0.map(x => { const n = tall(x); return <option key={x.id} value={x.id}>{x.navn}{x.firma ? ' ' + tt("(firma, ikke koblet til leietaker)") : ''} – {n.ute} {tt("nøkler ute")}</option>; })}</select></div></div>
    {t && <p>{tt("{0} nøkler utlevert nå, på {1} utkvitteringsskjemaer.", t.ute, t.skjema)} {t.mangler > 0 && <span className="chip amber">{tt("{0} mangler signert skjema", t.mangler)}</span>}</p>}
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}><input type="checkbox" checked={ved} onChange={x => setVed(x.target.checked)} />{tt("Legg ved signerte utkvitteringsskjemaer")}</label>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}><input type="checkbox" checked={hist} onChange={x => setHist(x.target.checked)} />{tt("Ta med tidligere utlån (levert tilbake eller tapt)")}</label>
    <p style={{ textAlign: 'right', marginBottom: 0 }}><button className="btn" onClick={close}>{tt("Avbryt")}</button> <button className="btn pri" disabled={busy || !m} onClick={lag}>{busy ? tt("Lager rapport …") : tt("Last ned PDF")}</button></p>
  </div>;
}

// ---------- Utkvitteringsskjema som PDF (til e-post og nedlasting) og utsending på nytt
const tilBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export async function utkvitteringPdf(u: Utk, sys: Sys | undefined, eid: string): Promise<Uint8Array> {
  const { ArkivDoc } = await import('../lib/prosjektArkiv'); const { profilFor, INK, MUTED } = await import('../lib/arealRapport');
  const D: any = await ArkivDoc.lag(`${tt("Nøkkelkvittering")} ${u.nr}`); D.profil = profilFor(eid, tt("Nøkkelkvittering"), u.nr);
  D.tittelSerif(tt("Kvittering for utlevert nøkkel")); D.t(`${tt("Nøkkelsystem")} ${u.data.systemNavn} · ${tt("utlevert")} ${dNo(u.data.dato)}`, 44, D.y - 4, 9, MUTED); D.y -= 20;
  const p = u.data.person;
  D.faktaPar([tt("Mottaker"), [[tt("Navn"), p.navn], [tt("Firma"), p.firma], [tt("Telefon"), p.tlf], [tt("E-post"), p.epost]]], [tt("Utlevering"), [[tt("Utlevert av"), u.data.utlevertAv], [tt("Formål"), u.data.formal], [tt("Forventet retur"), dNo(u.data.forventetRetur)]]]);
  const sy = sys?.data.sylindere || []; const retur = u.data.nokler.some(k => k.retur);
  D.h2(tt("Utleverte nøkler"));
  D.tab([[tt("Nøkkelsystem"), 1.3], [tt("Nøkkeltype"), 0.9], [tt("Løpenr"), 0.7, true], [tt("Passer til"), 2.6], ...(retur ? [[tt("Levert tilbake"), 1.2] as [string, number]] : [])],
    sortBy(u.data.nokler, k => k.type + String(k.lopenr).padStart(6, '0')).map(k => ({ c: [u.data.systemNavn, k.type, String(k.lopenr), sy.filter(c => c.typer.includes(k.type)).map(c => c.navn + (c.sted ? ' ' + c.sted : '')).join(', ') || '–', ...(retur ? [k.retur ? dNo(k.retur.dato) + (k.retur.tapt ? ' (' + tt("tapt") + ')' : '') : ''] : [])] })));
  D.h2(tt("Regler for behandling av nøkkel"));
  u.data.regler.split('\n').filter(Boolean).forEach((r, i) => D.tekst(`${i + 1}. ${r}`, 8.8, INK));
  D.tekst(tt("Jeg bekrefter å ha mottatt nøklene over og forplikter meg til å følge reglene."), 9.5, INK);
  D.utfylling(tt("Signatur"), [], [tt("Sted og dato"), tt("Mottakers underskrift"), tt("Utlevert av")]);
  D.utfylling(tt("Retur – fylles ut ved innlevering"), [], [tt("Dato levert"), tt("Mottatt av"), tt("Underskrift")]);
  return await D.pdf.save() as Uint8Array;
}
const lastNed = (b: Uint8Array, navn: string, type = 'application/pdf') => { const url = URL.createObjectURL(new Blob([b as any], { type })); const a = document.createElement('a'); a.href = url; a.download = navn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000); };

function SendSkjema({ u, sys, eid, close, ferdig }: { u: Utk; sys?: Sys; eid: string; close: () => void; ferdig: () => void }) {
  const F = u.data.signert || [];
  const [til, setTil] = useState(u.data.person.epost || ''); const [mld, setMld] = useState(''); const [skjema, setSkjema] = useState<boolean>(true); const [sign, setSign] = useState(F.length > 0); const [busy, setBusy] = useState(''); const [svar, setSvar] = useState<any>(null);
  const navn = `Nøkkelkvittering ${u.nr}.pdf`;
  const send = async () => { if (!/^\S+@\S+\.\S+$/.test(til.trim())) return toast(tt("Skriv inn en gyldig e-postadresse")); setBusy(tt("Sender …"));
    try { const vedlegg: { navn: string; base64: string; type: string }[] = [];
      if (skjema) vedlegg.push({ navn, base64: tilBase64(await utkvitteringPdf(u, sys, eid)), type: 'application/pdf' });
      if (sign) for (const [i, f] of F.entries()) { const b = new Uint8Array(await (await fetch(await fileUrl(f.path))).arrayBuffer()); const pdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.navn);
        vedlegg.push({ navn: `Nøkkelkvittering ${u.nr} signert${F.length > 1 ? ' ' + (i + 1) : ''}.${pdf ? 'pdf' : 'jpg'}`, base64: tilBase64(b), type: pdf ? 'application/pdf' : 'image/jpeg' }); }
      const r = await aoApi({ action: 'nokkel_send', utkvittering_id: u.id, epost: til.trim(), melding: mld, vedlegg });
      if (r.sendt) { toast(tt("Skjemaet er sendt til {0}", r.til)); ferdig(); close(); return; }
      setSvar(r); }
    catch (e: any) { toast(tt("Kunne ikke sende: ") + (e?.message || e)); }
    setBusy(''); };
  const ned = async () => { setBusy(tt("Lager PDF …")); try { lastNed(await utkvitteringPdf(u, sys, eid), navn); } catch (e: any) { toast(String(e?.message || e)); } setBusy(''); };
  if (svar) return <div><p className="banner">{svar.grunn || tt("E-post er ikke satt opp.")}</p><p className="small">{tt("Last ned PDF-en og send den fra ditt eget e-postprogram, eller kopier teksten under.")}</p>
    <textarea readOnly value={svar.tekst || ''} rows={8} style={{ width: '100%' }} /><p style={{ textAlign: 'right' }}><button className="btn" onClick={ned}>{tt("Last ned PDF")}</button> <a className="btn pri" href={`mailto:${encodeURIComponent(svar.til || til)}?subject=${encodeURIComponent(svar.emne || '')}&body=${encodeURIComponent(svar.tekst || '')}`}>{tt("Åpne i e-postprogram")}</a></p></div>;
  return <div className="form">
    <p className="small muted" style={{ marginTop: 0 }}>{tt("Send kopi av utkvitteringsskjemaet, for eksempel hvis mottakeren har mistet det.")} {u.data.person.navn}{u.data.person.firma ? ' · ' + u.data.person.firma : ''} · {u.data.nokler.map(k => `${k.type} ${k.lopenr}`).join(', ')}</p>
    <div className="fld"><label htmlFor="ss_til">{tt("Send til (e-post)")}</label><input id="ss_til" type="email" value={til} onChange={x => setTil(x.target.value)} /></div>
    <div className="fld"><label htmlFor="ss_m">{tt("Melding (valgfritt)")}</label><textarea id="ss_m" value={mld} onChange={x => setMld(x.target.value)} placeholder={tt("Vedlagt er kopi av kvitteringen for nøklene du har fått utlevert.")} /></div>
    <div className="fld cb"><input type="checkbox" id="ss_s" checked={skjema} onChange={x => setSkjema(x.target.checked)} /><label htmlFor="ss_s">{tt("Legg ved utkvitteringsskjemaet (PDF)")}</label></div>
    <div className="fld cb"><input type="checkbox" id="ss_g" checked={sign} disabled={!F.length} onChange={x => setSign(x.target.checked)} /><label htmlFor="ss_g">{F.length ? tt("Legg ved signert kopi ({0} fil)", F.length) : tt("Legg ved signert kopi (ikke lastet opp)")}</label></div>
    {(u.data as any).sendt?.length > 0 && <p className="small muted">{tt("Sendt tidligere:")} {(u.data as any).sendt.map((x: any) => `${dNo(x.tid)} ${x.til}`).join(', ')}</p>}
    <p style={{ textAlign: 'right', marginBottom: 0 }}><button className="btn" onClick={ned} disabled={!!busy}>{tt("Last ned PDF")}</button> <button className="btn" onClick={close}>{tt("Avbryt")}</button> <button className="btn pri" onClick={send} disabled={!!busy || (!skjema && !sign)}>{busy || tt("Send")}</button></p>
  </div>;
}
