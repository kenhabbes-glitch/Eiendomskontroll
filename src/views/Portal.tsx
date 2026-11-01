import React from 'react';
import { Hjelp } from '../components/Hjelp';
import { AV_LUKKET, VEDL_KAT } from '../lib/catalog';
import { S, bump, feiltekst, save, sb, state, toast, uploadFile, useStore } from '../lib/store';
import { addDays, byId, fd, intTxt, pliktStatus, sortBy, today, leieAreal, m2 } from '../lib/utils';
import { AlvChip, Chip, Empty, FileLink, StChip, formModal, showModal } from '../components/ui';

async function refreshMine() {
  const lid = state.me?.leietakerId; if (!lid) return;
  const { data } = await sb.from('leietakere').select('*').eq('id', lid).single();
  if (data) { const i = S.leietakere.findIndex(x => x.id === lid); const o = { ...(data.data || {}), id: data.id, eiendomId: data.eiendom_id }; if (i >= 0) S.leietakere[i] = o; else S.leietakere.push(o); bump(); }
}

function meldAvvik(l: any) {
  formModal({
    title: 'Meld avvik eller feil', saveTxt: 'Send melding',
    top: <p className="small muted" style={{ marginTop: 0 }}>Meldingen går til eier/forvalter av {byId('eiendommer', l.eiendomId)?.navn || 'eiendommen'}. Du kan følge status her.</p>,
    fields: [
      { k: 'tittel', label: 'Hva gjelder det?', req: true, ph: 'F.eks. Nødlys over utgang i 2. etg lyser ikke' },
      { k: 'plassering', label: 'Hvor?', ph: 'Etasje, rom, inngang …', half: true },
      { k: 'alv', label: 'Hvor alvorlig?', type: 'select', options: [['Kritisk', 'Kritisk – fare for liv/helse eller stor skade'], ['Høy', 'Høy – må rettes raskt'], ['Middels', 'Middels'], ['Lav', 'Lav – ikke hastesak']], def: 'Middels', half: true },
      { k: 'beskrivelse', label: 'Beskrivelse', type: 'textarea' },
      { k: 'fil', label: 'Bilde eller dokument (valgfritt)', type: 'file' }],
    onSave: async v => {
      const o: any = { tittel: v.tittel, beskrivelse: [v.beskrivelse, v.plassering ? 'Sted: ' + v.plassering : ''].filter(Boolean).join('\n'), eiendomId: l.eiendomId, leietakerId: l.id, alv: v.alv, status: 'Ny', kilde: 'Leietaker', ansvar: 'Eier', meldtAv: state.me?.navn || state.me?.epost, oppdaget: today(), frist: addDays(today(), ({ Kritisk: 7, 'Høy': 30, Middels: 90, Lav: 365 } as any)[v.alv]), logg: [{ t: new Date().toISOString(), s: 'Ny', k: 'Meldt av leietaker', av: state.me?.navn || state.me?.epost }] };
      if (v.fil) { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (f) o.vedlegg = [f]; }
      await save('avvik', o); toast('Takk! Meldingen er sendt.');
    },
  });
}
function bekreft(l: any, p: any) {
  formModal({
    title: p.navn, saveTxt: 'Bekreft',
    top: <p className="small muted" style={{ marginTop: 0 }}>{p.hjemmel}. Ved å bekrefte erklærer du at plikten er ivaretatt for virksomheten. Legg gjerne ved dokumentasjon.</p>,
    fields: [{ k: 'dato', label: 'Dato', type: 'date', def: today(), half: true }, { k: 'komm', label: 'Kommentar', type: 'textarea', ph: 'F.eks. navn på brannvernleder, dato for øvelse …' }, { k: 'fil', label: 'Dokumentasjon (valgfritt)', type: 'file' }],
    onSave: async v => {
      let dokId: string | null = null;
      if (v.fil) { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (f) dokId = await save('dokumenter', { eiendomId: l.eiendomId, leietakerId: l.id, type: 'Leietakers IK-dokumentasjon', tittel: p.navn + ' – ' + l.navn, dato: v.dato, fil: f }); }
      const { error } = await sb.rpc('bekreft_plikt', { p_key: p.key, p_dato: v.dato, p_kommentar: v.komm || '', p_dok: dokId });
      if (error) { toast('Kunne ikke lagre: ' + feiltekst(error)); return false; }
      await refreshMine(); toast('Takk – bekreftelsen er registrert');
    },
  });
}
function lastOpp(l: any) {
  formModal({
    title: 'Last opp dokument', saveTxt: 'Last opp',
    fields: [{ k: 'tittel', label: 'Tittel', req: true }, { k: 'type', label: 'Type', type: 'select', options: ['Leietakers IK-dokumentasjon', 'Servicerapport', 'Egenkontrollskjema', 'Annet'], def: 'Leietakers IK-dokumentasjon' }, { k: 'fil', label: 'Fil', type: 'file', req: true }, { k: 'notat', label: 'Kommentar', type: 'textarea' }],
    onSave: async v => { const f = await uploadFile(v.fil, l.eiendomId, l.id); if (!f) return false; await save('dokumenter', { eiendomId: l.eiendomId, leietakerId: l.id, type: v.type, tittel: v.tittel, dato: today(), fil: f, notat: v.notat }); toast('Dokumentet er lastet opp'); },
  });
}
function visAvvik(a: any) {
  showModal(`Melding #${a.nr || ''}: ${a.tittel}`, () => <>
    <dl className="dl"><dt>Status</dt><dd><StChip s={a.status} /></dd><dt>Alvorlighet</dt><dd><AlvChip a={a.alv} /></dd><dt>Meldt</dt><dd>{fd(a.oppdaget)}{a.meldtAv ? ' av ' + a.meldtAv : ''}</dd>{a.planlagt && <><dt>Planlagt utbedret</dt><dd>{fd(a.planlagt)}</dd></>}{a.beskrivelse && <><dt>Beskrivelse</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{a.beskrivelse}</dd></>}</dl>
    {(a.vedlegg || []).length > 0 && <p>{a.vedlegg.map((f: any, i: number) => <FileLink key={i} fil={f} />)}</p>}
    <h3 style={{ marginTop: 16 }}>Historikk</h3><div className="log">{(a.logg || []).slice().reverse().map((x: any, i: number) => <div key={i}><span className="lt">{new Date(x.t).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}</span> · <StChip s={x.s} />{x.k && <><br />{x.k}</>}</div>)}</div>
  </>);
}

export function Portal() {
  useStore();
  const l = S.leietakere.find(x => x.id === state.me?.leietakerId);
  if (!l) return <div className="card"><Empty t="Fant ikke leieforholdet">Brukeren din er ikke koblet til en leietaker. Kontakt utleier.</Empty></div>;
  const e = byId('eiendommer', l.eiendomId) || ({} as any);
  const A = sortBy(S.avvik.filter(a => a.leietakerId === l.id), a => (AV_LUKKET.includes(a.status) ? '1' : '0') + (a.opprettet || '')).reverse();
  const apne = A.filter(a => !AV_LUKKET.includes(a.status));
  const D = S.dokumenter.filter(d => d.leietakerId === l.id);
  const pl = (l.plikter || []).filter((p: any) => !p.ikkeRelevant); const mangler = pl.filter((p: any) => pliktStatus(p).o >= 1);
  const mx = l.matrise || {};
  return <>
    <div className="portalhero"><div className="head" style={{ marginBottom: 0 }}><div className="grow"><h1>{l.navn}<Hjelp id="side.portal" /></h1><p className="sub">{e.navn}{e.adresse ? ' · ' + e.adresse : ''}{l.lokale ? ' · ' + l.lokale : ''}</p></div><button className="btn pri" onClick={() => meldAvvik(l)}>+ Meld avvik eller feil</button></div>
      <div className="kpis" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className={'kpi ' + (mangler.length ? 'warn' : 'ok')} style={{ cursor: 'default' }}><div className="l">Plikter som må bekreftes</div><div className="v">{mangler.length}</div><div className="s">av {pl.length} plikter</div></div>
        <div className="kpi" style={{ cursor: 'default' }}><div className="l">Åpne meldinger</div><div className="v">{apne.length}</div><div className="s">{A.length - apne.length} avsluttet</div></div>
        <div className="kpi" style={{ cursor: 'default' }}><div className="l">Leieavtale</div><div className="v" style={{ fontSize: 17, letterSpacing: 0 }}>{l.slutt ? 'til ' + fd(l.slutt) : '–'}</div><div className="s">{leieAreal(l).verdi !== null ? m2(leieAreal(l).verdi) + ' leieareal' : ''}</div></div>
      </div>
      {e.kontaktLeietaker && <p className="small" style={{ marginBottom: 0 }}>Kontakt utleier: {e.kontaktLeietaker}</p>}
    </div>
    <div className="sec"><h2>Internkontroll og plikter</h2><p className="small muted" style={{ marginTop: -6 }}>Som leietaker har virksomheten egne plikter etter forskrift om brannforebygging, internkontrollforskriften og leieavtalen. Bekreft at de er ivaretatt.</p>
      <div className="tbl-wrap"><table><thead><tr><th>Plikt</th><th>Hjemmel</th><th>Frekvens</th><th>Sist bekreftet</th><th>Status</th><th /></tr></thead><tbody>
        {pl.length ? pl.map((p: any) => { const s = pliktStatus(p); return <tr key={p.key}><td>{p.navn}{p.komm && <div className="small muted">{p.komm}</div>}</td><td className="small muted">{p.hjemmel}</td><td className="small">{intTxt(p.frekvens)}</td><td className="small">{fd(p.sist)}</td><td><Chip c={s.c}>{s.t}</Chip></td><td><button className={'btn sm ' + (s.o >= 1 ? 'pri' : '')} onClick={() => bekreft(l, p)}>Bekreft</button></td></tr>; }) : <tr><td colSpan={6} className="muted">Ingen plikter registrert.</td></tr>}
      </tbody></table></div></div>
    <div className="sec"><h2>Mine meldinger og avvik</h2>{A.length ? <div className="tbl-wrap"><table><thead><tr><th className="num">Nr</th><th>Melding</th><th>Alvorlighet</th><th>Status</th><th>Meldt</th><th>Ansvar</th></tr></thead><tbody>
      {A.map(a => <tr key={a.id} className="click" onClick={() => visAvvik(a)}><td className="num muted">{a.nr}</td><td><b style={{ fontWeight: 500 }}>{a.tittel}</b></td><td><AlvChip a={a.alv} /></td><td><StChip s={a.status} /></td><td className="small">{fd(a.oppdaget)}</td><td className="small">{a.ansvar === 'Leietaker' ? <Chip c="amber">Dere</Chip> : 'Utleier'}</td></tr>)}
    </tbody></table></div> : <div className="tbl-wrap"><Empty t="Ingen meldinger">Bruk «Meld avvik eller feil» når noe må utbedres.</Empty></div>}</div>
    <div className="grid g2 sec">
      <div className="card"><h2>Vedlikeholdsansvar etter leieavtalen</h2><table className="small"><tbody>{VEDL_KAT.map(([k]) => <tr key={k}><td style={{ padding: '5px 8px 5px 0' }}>{k}</td><td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{mx[k] === 'Leietaker' ? 'Dere' : mx[k] === 'Delt' ? 'Delt' : mx[k] === 'Ikke aktuelt' ? '–' : 'Utleier'}</td></tr>)}</tbody></table></div>
      <div className="card"><div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Dokumenter</h2><button className="btn sm" onClick={() => lastOpp(l)}>+ Last opp</button></div>
        {D.length ? <div className="list">{sortBy(D, d => d.dato || '').reverse().map(d => <div key={d.id} className="li" style={{ cursor: 'default' }}><div className="grow"><div className="lt">{d.fil ? <FileLink fil={d.fil}>{d.tittel}</FileLink> : d.tittel}</div><div className="ls">{d.type} · {fd(d.dato)}</div></div></div>)}</div> : <p className="muted small">Ingen dokumenter.</p>}</div>
    </div>
  </>;
}
