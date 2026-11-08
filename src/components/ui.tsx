import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Hjelp } from './Hjelp';
import { HJELP } from '../lib/hjelpTekster';
import { bump, feiltekst, fileUrl, toast, toasts, useStore, type Fil } from '../lib/store';
import { dUntil, fd } from '../lib/utils';
import { tt } from '../lib/i18n';

// ---------------- små komponenter
export function Chip({ c = '', plain, children, title }: { c?: string; plain?: boolean; children: ReactNode; title?: string }) {
  return <span className={`chip ${c} ${plain ? 'plain' : ''}`} title={title}>{typeof children === 'string' ? tt(children) : children}</span>;
}
export function DueChip({ s }: { s?: string }) {
  const d = dUntil(s);
  if (d === null) return <Chip>{tt("Ingen frist")}</Chip>;
  if (d < 0) return <Chip c="red">{tt("Forfalt")} {-d} d</Chip>;
  if (d === 0) return <Chip c="red">{tt("I dag")}</Chip>;
  if (d <= 30) return <Chip c="amber">{tt("Om")} {d} d · {fd(s)}</Chip>;
  return <Chip plain>{fd(s)}</Chip>;
}
export const AlvChip = ({ a }: { a?: string }) => <Chip c={({ Kritisk: 'red', 'Høy': 'orange', Middels: 'amber', Lav: 'blue' } as any)[a || ''] || ''}>{a || '–'}</Chip>;
export const StChip = ({ s }: { s?: string }) => <Chip c={({ Ny: 'blue', 'Under vurdering': 'blue', Planlagt: 'amber', 'Under utbedring': 'amber', 'Utført – til kontroll': 'green', Utsatt: 'orange', Rettet: 'green', Avvist: '', Lukket: 'green' } as any)[s || 'Ny'] || ''}>{s || tt("Ny")}</Chip>;
export const TgChip = ({ t }: { t?: string }) => t ? <Chip c={({ TG0: 'green', TG1: 'green', TG2: 'amber', TG3: 'red', TGIU: 'blue' } as any)[t] || ''}>{t}</Chip> : <span className="muted">–</span>;
export function RestChip({ r }: { r: number | null }) {
  if (r === null) return <span className="muted small">–</span>;
  if (r <= 0) return <Chip c="red">{r === 0 ? tt("Utløper i år") : tt("Overskredet {0} år", -r)}</Chip>;
  return <Chip c={r <= 3 ? 'amber' : 'green'}>{r} {tt("år")}</Chip>;
}
export function Empty({ t, children }: { t: string; children?: ReactNode }) { return <div className="empty"><b>{t}</b>{children}</div>; }

export function FileLink({ fil, children }: { fil?: Fil; children?: ReactNode }) {
  const [u, setU] = useState('');
  useEffect(() => { let on = true; if (fil?.path) fileUrl(fil.path).then(x => on && setU(x)); return () => { on = false; }; }, [fil?.path]);
  if (!fil?.path) return null;
  return <a href={u || '#'} target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); if (!u) e.preventDefault(); }}>{children || fil.navn || tt("Åpne fil")}</a>;
}
export function useFileUrl(path?: string) {
  const [u, setU] = useState('');
  useEffect(() => { let on = true; if (path) fileUrl(path).then(x => on && setU(x)); else setU(''); return () => { on = false; }; }, [path]);
  return u;
}

// ---------------- modaler (imperativt API, som gjør skjemaflyt enkel)
type ModalItem = { id: number; render: (close: () => void) => ReactNode; wide?: boolean; cls?: string; title?: ReactNode; noFrame?: boolean; onClose?: () => void };
const modals: ModalItem[] = []; let mid = 0;
export function openModal(o: Omit<ModalItem, 'id'>) {
  const item = { ...o, id: ++mid }; modals.push(item); bump();
  return () => closeModal(item.id);
}
function closeModal(id: number) { const i = modals.findIndex(m => m.id === id); if (i >= 0) { const m = modals[i]; modals.splice(i, 1); m.onClose?.(); bump(); } }
export function ModalHost() {
  useStore();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const top = modals[modals.length - 1]; if (e.key === 'Escape' && top && !top.noFrame) closeModal(top.id); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);
  return <>{modals.map(m => {
    const close = () => closeModal(m.id);
    if (m.noFrame) return <div key={m.id} className="ov" style={{ padding: '2vh 1.5vw' }}>{m.render(close)}</div>;
    return <div key={m.id} className="ov" onMouseDown={e => { (e.currentTarget as any)._d = e.target === e.currentTarget; }} onClick={e => { if (e.target === e.currentTarget && (e.currentTarget as any)._d) close(); }}>
      <div className={`modal ${m.wide ? 'wide' : ''} ${m.cls || ''}`} role="dialog" aria-modal="true">
        {m.render(close)}
      </div></div>;
  })}</>;
}
export function ModalFrame({ title, close, children, foot }: { title: ReactNode; close: () => void; children: ReactNode; foot?: ReactNode }) {
  return <>
    <div className="mh"><h2>{title}</h2><button className="btn ghost sm" onClick={close} aria-label={tt("Lukk")}>✕</button></div>
    <div className="mb">{children}</div>
    <div className="mf">{foot ?? <button className="btn" onClick={close}>{tt("Lukk")}</button>}</div>
  </>;
}
export function showModal(title: ReactNode, body: (close: () => void) => ReactNode, opts: { wide?: boolean; foot?: (close: () => void) => ReactNode } = {}) {
  return openModal({ wide: opts.wide, render: close => <ModalFrame title={title} close={close} foot={opts.foot?.(close)}>{body(close)}</ModalFrame> });
}
export function confirmBox(text: string, okTxt = 'Slett'): Promise<boolean> {
  return new Promise(res => {
    let done = false;
    openModal({ onClose: () => { if (!done) res(false); }, render: close => <ModalFrame title={tt("Bekreft")} close={close} foot={<><button className="btn" onClick={close}>{tt("Avbryt")}</button><button className="btn pri" autoFocus onClick={() => { done = true; res(true); close(); }}>{okTxt}</button></>}><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p></ModalFrame> });
  });
}
export function copyText(t: string) { navigator.clipboard.writeText(t).then(() => toast(tt("Kopiert")), () => toast(tt("Kunne ikke kopiere – merk teksten og kopier manuelt"))); }
export function textModal(title: string, text: string, note?: string) {
  showModal(title, () => <>{note && <p className="small muted" style={{ marginTop: 0 }}>{note}</p>}<textarea readOnly className="codebox" value={text} onFocus={e => e.currentTarget.select()} /></>,
    { wide: true, foot: close => <><button className="btn" onClick={close}>{tt("Lukk")}</button><button className="btn pri" onClick={() => copyText(text)}>{tt("Kopier")}</button></> });
}

// ---------------- generisk skjema
export type Opt = string | [string, string];
// Hjelp-ikon for et skjemafelt: eksplisitt f.help, ellers automatisk «felt.<nøkkel>» hvis det finnes tekst
const hq = (f: { k: string; help?: string | false }) => { if (f.help === false) return null; const id = f.help || (f.k === 'tagger' ? 'tagger' : 'felt.' + f.k); return HJELP[id] ? <Hjelp id={id} size={15} /> : null; };

export type Field = {
  k: string; label?: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'file' | 'sec' | 'custom' | 'email';
  options?: Opt[] | ((v?: any) => Opt[]); groups?: () => [string, Opt[]][]; empty?: string; half?: boolean; req?: boolean; hint?: string; ph?: string;
  show?: (v: any) => boolean; dl?: [string, string][]; mono?: boolean; def?: any; accept?: string;
  render?: (v: any, set: (patch: any) => void) => ReactNode; help?: string | false;
};
export type FormOpts = {
  title: string; fields: Field[]; values?: any; wide?: boolean; saveTxt?: string;
  onSave: (v: any, close: () => void) => Promise<any> | any; onChange?: (k: string, v: any, prev: any) => any;
  extraFoot?: (close: () => void, v: any) => ReactNode; top?: ReactNode; bottom?: (v: any) => ReactNode; readOnly?: boolean;
};
function FormBody({ o, close }: { o: FormOpts; close: () => void }) {
  const init = () => { const v: any = {}; o.fields.forEach(f => { if (f.type === 'sec') return; const x = o.values?.[f.k]; v[f.k] = x ?? f.def ?? (f.type === 'checkbox' ? false : f.type === 'file' ? null : ''); }); return { ...(o.values || {}), ...v }; };
  const [v, setV] = useState<any>(init);
  const [busy, setBusy] = useState(false); const [feil, setFeil] = useState('');
  const vRef = useRef(v); vRef.current = v;
  const set = (patch: any) => setV((prev: any) => { let n = { ...prev, ...patch }; if (o.onChange) for (const k of Object.keys(patch)) { const p = o.onChange(k, n, prev); if (p) n = { ...n, ...p }; } return n; });
  const submit = async () => {
    const miss = o.fields.filter(f => f.req && (!f.show || f.show(v)) && (v[f.k] === '' || v[f.k] == null));
    if (miss.length) { toast(tt("Fyll ut: ") + miss.map(f => f.label).join(', ')); return; }
    setBusy(true); setFeil('');
    try { const r = await o.onSave(vRef.current, close); if (r !== false) close(); } catch (e: any) { console.error(e); setFeil(feiltekst(e)); } finally { setBusy(false); }
  };
  return <>
    <div className="mh"><h2>{o.title}</h2><button className="btn ghost sm" onClick={close} aria-label={tt("Lukk")}>✕</button></div>
    <div className="mb">{o.top}
      <form className="form" onSubmit={e => { e.preventDefault(); }} noValidate>
        {o.fields.map(f => {
          if (f.show && !f.show(v)) return null;
          const id = 'f_' + f.k; const cls = `fld ${f.half ? 'half' : ''} ${f.type === 'checkbox' ? 'cb' : ''}`;
          if (f.type === 'sec') return <div key={f.k} className="fld secth">{f.label}{hq(f)}</div>;
          if (f.type === 'custom') return <div key={f.k} className={cls}>{f.label && <label>{f.label}{hq(f)}</label>}{f.render?.(v, set)}{f.hint && <div className="hint">{f.hint}</div>}</div>;
          if (f.type === 'checkbox') return <div key={f.k} className={cls}><input type="checkbox" id={id} checked={!!v[f.k]} disabled={o.readOnly} onChange={e => set({ [f.k]: e.target.checked })} /><label htmlFor={id}>{f.label}</label>{hq(f)}</div>;
          let inp: ReactNode;
          if (f.type === 'select') {
            const op = typeof f.options === 'function' ? f.options(v) : f.options || [];
            const optEl = (x: Opt) => { const [a, b] = Array.isArray(x) ? x : [x, x]; return <option key={a} value={a}>{tt(b)}</option>; };
            inp = <select id={id} value={v[f.k] ?? ''} disabled={o.readOnly} onChange={e => set({ [f.k]: e.target.value })}>
              {f.empty !== undefined && <option value="">{f.empty}</option>}
              {f.groups ? f.groups().map(([g, l]) => <optgroup key={g} label={tt(g)}>{l.map(optEl)}</optgroup>) : op.map(optEl)}
            </select>;
          } else if (f.type === 'textarea') inp = <textarea id={id} value={v[f.k] ?? ''} placeholder={f.ph} readOnly={o.readOnly} onChange={e => set({ [f.k]: e.target.value })} />;
          else if (f.type === 'file') inp = <input id={id} type="file" accept={f.accept || '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.docx,.xlsx,.doc,.xls,.msg,.eml'} onChange={e => set({ [f.k]: e.target.files?.[0] || null })} />;
          else inp = <>
            <input id={id} type={f.type || 'text'} value={v[f.k] ?? ''} placeholder={f.ph} step={f.type === 'number' ? 'any' : undefined} list={f.dl ? 'dl_' + f.k : undefined} autoComplete={f.dl ? 'off' : undefined}
              readOnly={o.readOnly} style={f.mono ? { fontFamily: 'var(--mono)' } : undefined}
              onChange={e => set({ [f.k]: f.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value })} />
            {f.dl && <datalist id={'dl_' + f.k}>{f.dl.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</datalist>}
          </>;
          return <div key={f.k} className={cls}><label htmlFor={id}>{f.label}{f.req ? ' *' : ''}{hq(f)}</label>{inp}{f.hint && <div className="hint">{f.hint}</div>}</div>;
        })}
      </form>
      {o.bottom?.(v)}
    </div>
    {feil && <div className="banner" style={{ margin: '0 20px 10px', background: 'var(--redbg)', color: 'var(--red)', borderColor: '#f3c1bb' }}>{tt("Noe gikk galt, og ingenting eller bare deler ble lagret:")} {feil}</div>}
    <div className="mf">{o.extraFoot?.(close, v)}<span className="grow" />
      <button className="btn" onClick={close}>{o.readOnly ? tt("Lukk") : tt("Avbryt")}</button>
      {!o.readOnly && <button className="btn pri" disabled={busy} onClick={submit}>{busy ? tt("Lagrer …") : (o.saveTxt || tt("Lagre"))}</button>}
    </div>
  </>;
}
export function formModal(o: FormOpts) { return openModal({ wide: o.wide, render: close => <FormBody o={o} close={close} /> }); }

export function Toast() { useStore(); return <div id="toast" className={toasts.msg ? 'on' : ''}>{toasts.msg}</div>; }

export function Tip() {
  const [t, setT] = useState<{ h: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const over = (e: MouseEvent) => { const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null; setT(el ? { h: el.dataset.tip || '', x: e.clientX, y: e.clientY } : null); };
    document.addEventListener('mousemove', over); return () => document.removeEventListener('mousemove', over);
  }, []);
  if (!t) return null;
  return <div id="tip" style={{ display: 'block', left: Math.min(t.x + 14, innerWidth - 270), top: t.y + 14 }}>{t.h.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>;
}

// ---------------- Tagger (Brann, HVAC, Elektro …)
import { TAGGER } from '../lib/catalog';
export const taggFarge = (t: string) => TAGGER.find(x => x[0] === t)?.[1] || '#4b5563';
export function TaggChips({ t, small }: { t: string[]; small?: boolean }) {
  if (!t?.length) return null;
  return <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', verticalAlign: 'middle' }}>{t.map(x => <span key={x} style={{ fontSize: small ? 10.5 : 11.5, lineHeight: 1.5, padding: '0 6px', borderRadius: 9, color: '#fff', background: taggFarge(x), whiteSpace: 'nowrap' }}>{x}</span>)}</span>;
}
export function TaggVelger({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [ny, setNy] = useState('');
  const alle = [...TAGGER.map(x => x[0]), ...value.filter(v => !TAGGER.some(x => x[0] === v))];
  return <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
    {alle.map(x => { const on = value.includes(x); return <button type="button" key={x} disabled={disabled} onClick={() => onChange(on ? value.filter(v => v !== x) : [...value, x])} style={{ border: '1px solid ' + taggFarge(x), background: on ? taggFarge(x) : '#fff', color: on ? '#fff' : taggFarge(x), borderRadius: 12, padding: '2px 10px', fontSize: 12.5, cursor: disabled ? 'default' : 'pointer' }}>{on ? '✓ ' : ''}{x}</button>; })}
    {!disabled && <input value={ny} onChange={e => setNy(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = ny.trim(); if (v && !value.includes(v)) onChange([...value, v]); setNy(''); } }} placeholder={tt("+ egen tagg")} style={{ width: 110, border: '1px dashed var(--line2)', borderRadius: 12, padding: '2px 8px', fontSize: 12.5 }} />}
  </div>;
}

export function ForslagMerke({ tip }: { tip?: string }) {
  return <span data-tip={tip || 'Kostnaden er et forslag fra nettsøk – kontroller mot tilbud'} style={{ background: '#fff4e5', color: '#9a5b00', borderRadius: 9, padding: '0 6px', fontSize: 10.5, fontWeight: 600, marginLeft: 4, whiteSpace: 'nowrap' }}>{tt("FORSLAG")}</span>;
}
