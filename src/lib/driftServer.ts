// Driftsvarsler – serverdelen (kalles fra netlify/functions/arbeidsordre.ts).
// server/vakt.sh kjører hvert 10. minutt på serveren og melder fra hit når noe er galt (eller ordnet igjen).
// Varselet går som push til administratorer (type «drift») og som e-post til DRIFT_EPOST (eller UTVIKLER_EPOST).
// 'jobb_hjerteslag' skrives av de planlagte nattjobbene når de er ferdige, slik at vakten kan se at de faktisk har kjørt.
import type { SupabaseClient } from '@supabase/supabase-js';

const EPOST = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
type Ctx = {
  admin: SupabaseClient; body: any; json: (s: number, b: any) => Response; esc: (s: any) => string; erCron: boolean;
  sendEpost: (til: string, emne: string, html: string, tekst: string, v?: any, svarTil?: string, o?: any) => Promise<any>;
  oppsettFor: (eid: string | null | undefined, org?: string | null) => Promise<any>;
  pushTilOrg: (admin: any, orgId: string, typer: string[], inn: { tittel: string; tekst: string; url?: string; tag?: string }, roller?: string[]) => Promise<number>;
};

/** Rensker punktene fra skriptet: maks 12 linjer på 200 tegn, uten linjeskift */
export const renPunkter = (x: any): string[] => (Array.isArray(x) ? x : []).slice(0, 12).map((p: any) => String(p ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)).filter(Boolean);

export function driftTekst(status: string, punkter: string[]) {
  const ok = status === 'ok';
  const tittel = ok ? 'Driften er i orden igjen' : punkter.length === 1 ? 'Driftsfeil på serveren' : `${punkter.length} driftsfeil på serveren`;
  const tekst = ok ? 'Alle sjekkene går gjennom igjen.' : punkter.join(' · ');
  return { tittel, tekst, ok };
}

export async function driftHandling(x: Ctx): Promise<Response | null> {
  const { admin, body, json, esc } = x; const a = body.action;
  if (a !== 'drift_varsel' && a !== 'jobb_hjerteslag') return null;
  if (!x.erCron) return json(403, { error: 'Ikke tillatt' });
  if (a === 'jobb_hjerteslag') {
    const navn = String(body.navn || 'ko-auto').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'ko-auto';
    await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Planlagt jobb', tabell: 'hendelse', rad_id: null, eiendom_id: null, handling: 'jobb', tekst: `${navn} ferdig` });
    return json(200, { ok: true });
  }
  const status = body.status === 'ok' ? 'ok' : 'feil'; const punkter = renPunkter(body.punkter); if (status === 'feil' && !punkter.length) return json(400, { error: 'Mangler punkter' });
  const { tittel, tekst, ok } = driftTekst(status, punkter);
  const base = (process.env.URL || '').replace(/\/+$/, '');
  const { data: orger } = await admin.from('organisasjoner').select('id').eq('aktiv', true); let push = 0;
  for (const o of orger || []) push += await x.pushTilOrg(admin, o.id, ['drift'], { tittel, tekst, url: base ? base + '/#/innstillinger' : '/', tag: 'drift' }, ['admin']).catch(() => 0);
  const til = String(process.env.DRIFT_EPOST || process.env.UTVIKLER_EPOST || '').split(/[,;\s]+/).map(v => v.trim().toLowerCase()).filter(v => EPOST.test(v)); let epost = 0;
  const emne = `${ok ? '✔' : '⚠'} ${tittel}`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px"><h2>${esc(tittel)}</h2>${ok ? `<p>${esc(tekst)}</p>` : `<ul>${punkter.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`}<p style="font-size:12px;color:#6b736d">Sendt av vaktskriptet på serveren.</p></div>`;
  const txt = [tittel, '', ...(ok ? [tekst] : punkter.map(p => '- ' + p))].join('\n');
  if (til.length) { const o = await x.oppsettFor(null, null); for (const m of til) { const s = await x.sendEpost(m, emne, html, txt, undefined, undefined, o).catch(() => ({ sendt: false })); if (s?.sendt) epost++; } }
  await admin.from('hendelseslogg').insert({ bruker_id: null, bruker: 'Driftsvakt', tabell: 'hendelse', rad_id: null, eiendom_id: null, handling: 'drift', tekst: `${tittel}: ${tekst}`.slice(0, 500) });
  return json(200, { ok: true, push, epost, mottakereEpost: til.length });
}
