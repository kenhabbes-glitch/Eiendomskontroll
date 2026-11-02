// Tilstandsgrad (TG) og konsekvensgrad (KG) ved utkvittering, og forslag til endring på systemet/komponenten.
import React from 'react';
import { TG_DEF, KG_DEF } from '../lib/catalog';

export type Tilstand = { tg?: string; kg?: string; komm?: string };
export const tgTekst = (t?: Tilstand | null) => t?.tg ? `${t.tg}${t.kg ? ' · ' + t.kg : ''}` : 'Ikke vurdert';
/** Avviker vurderingen fra nåværende tilstand? (tom TG = ikke vurdert = ingen endring) */
export const tgAvviker = (ny?: Tilstand | null, naa?: Tilstand | null) => !!ny?.tg && (ny.tg !== (naa?.tg || '') || (!!ny.kg && ny.kg !== (naa?.kg || '')));

const sel: React.CSSProperties = { border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 10px', width: '100%', background: '#fff' };

/** Velger for TG/KG med begrunnelse. «naa» viser registrert tilstand og markerer endring. */
export function TgKgVelger({ v, set, naa, hva, intern }: { v: Tilstand; set: (t: Tilstand) => void; naa?: Tilstand | null; hva?: string; intern?: boolean }) {
  const d = TG_DEF.find(t => t[0] === v.tg); const endring = tgAvviker(v, naa);
  return <div style={{ margin: '10px 0' }}>
    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Tilstand etter jobben{hva ? ` – ${hva}` : ''}</div>
    {naa !== undefined && <div className="small muted" style={{ marginBottom: 6 }}>Registrert nå: <b>{tgTekst(naa)}</b></div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
      <div><label className="small">Tilstandsgrad (TG)</label><select value={v.tg || ''} onChange={e => set({ ...v, tg: e.target.value })} style={sel}>
        <option value="">Ikke vurdert</option>{TG_DEF.map(t => <option key={t[0]} value={t[0]}>{t[0]} – {t[1].toLowerCase()}</option>)}</select></div>
      <div><label className="small">Konsekvensgrad (KG)</label><select value={v.kg || ''} onChange={e => set({ ...v, kg: e.target.value })} style={sel} disabled={!v.tg}>
        <option value="">–</option>{KG_DEF.map(k => <option key={k[0]} value={k[0]}>{k[0]} – {k[1].toLowerCase()}</option>)}</select></div>
    </div>
    {d && <div className="small muted" style={{ marginTop: 4 }}>{d[2]}</div>}
    {v.tg && <><label className="small">Begrunnelse / observasjon</label><textarea value={v.komm || ''} onChange={e => set({ ...v, komm: e.target.value })} style={{ ...sel, minHeight: 56 }} placeholder="Hva er observert, og anbefalt tiltak" /></>}
    {endring && <div className="small" style={{ color: 'var(--amber)', marginTop: 4 }}>{intern ? 'Avviker fra registrert tilstand.' : 'Avviker fra registrert tilstand – sendes som forslag til endring som oppdragsgiver godkjenner.'}</div>}
  </div>;
}

/** Liten markering i lister når det finnes et forslag til endret tilstand. */
export function TgForslagChip({ o }: { o: any }) {
  const f = o?.tgForslag; if (!f?.tg) return null;
  return <span className="chip amber" style={{ marginLeft: 4, fontSize: 11 }} title={`Forslag fra ${f.av || 'utførende'} ${f.dato ? '(' + f.dato.split('-').reverse().join('.') + ')' : ''}: ${tgTekst(f)}${f.komm ? '\n' + f.komm : ''}`}>→ {tgTekst(f)}?</span>;
}
