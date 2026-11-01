// Supabase Edge Function: leverandor-oppslag
// Søker på nett (Anthropic API + web search) etter leverandørens antatte levetid
// og utskiftings-/retrofitkostnad for et fabrikat/modell. Kun admin/forvalter.
// Krever hemmeligheten ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const svar = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `Du er en nøktern rådgiver for forvaltning, drift og vedlikehold (FDV) av næringseiendom i Norge.
Brukeren oppgir fabrikat/modell for et teknisk system eller en komponent. Søk på nett (helst produsentens egne datablad, FDV-dokumentasjon, brosjyrer, samt norske kilder for priser) og finn:
1) leverandørens/produsentens antatte eller oppgitte levetid (teknisk levetid i år, evt. intervall),
2) en forventet utskiftingskostnad i NOK eks. mva for utstyr + montasje i Norge (dagens prisnivå),
3) evt. en retrofit-/oppgraderingskostnad dersom det er et realistisk alternativ til full utskifting.
Vær ærlig: hvis du ikke finner tall, sett null. Ikke finn på kilder. Kostnader er alltid anslag.
Svar til slutt KUN med ett JSON-objekt (ingen tekst før/etter, ingen markdown) på formen:
{"produkt":string,"levetid":{"aar":number|null,"min":number|null,"max":number|null,"type":"teknisk"|"funksjonell"|"garanti"|"ukjent","kilde_url":string|null,"kommentar":string},
"utskifting":{"belop_nok":number|null,"omfang":string,"kilde_url":string|null,"kommentar":string},
"retrofit":{"belop_nok":number|null,"omfang":string,"kilde_url":string|null,"kommentar":string}|null,
"usikkerhet":"lav"|"middels"|"høy","notat":string}
Skriv tekstfeltene på norsk og kort.`;

function plukkJson(t: string) {
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return svar({ error: 'Kun POST' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: rolle, error: rErr } = await sb.rpc('min_rolle');
    if (rErr) return svar({ error: 'Kunne ikke sjekke rolle: ' + rErr.message }, 401);
    if (!['admin', 'forvalter'].includes(String(rolle))) return svar({ error: 'Kun admin/forvalter kan søke leverandørdata.' }, 403);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return svar({ error: 'ANTHROPIC_API_KEY er ikke satt. Legg den inn i Supabase → Edge Functions → Secrets.' }, 500);

    const b = await req.json().catch(() => ({}));
    const fabrikat = String(b.fabrikat || '').trim().slice(0, 200);
    if (!fabrikat) return svar({ error: 'Mangler fabrikat/modell' }, 400);
    const linjer = [
      `Fabrikat/modell: ${fabrikat}`,
      b.betegnelse && `Betegnelse i registeret: ${String(b.betegnelse).slice(0, 200)}`,
      b.systemtype && `Systemtype: ${String(b.systemtype).slice(0, 100)}`,
      b.komponent && `Komponenttype: ${String(b.komponent).slice(0, 100)}`,
      b.nsKode && `NS 3451-kode: ${b.nsKode} ${String(b.nsNavn || '').slice(0, 100)}`,
      b.aar && `Installert år: ${b.aar}`,
      `Oppgi kostnad i ${b.kostAar || new Date().getFullYear()}-kroner.`,
    ].filter(Boolean).join('\n');

    const messages: any[] = [{ role: 'user', content: linjer }];
    const kilder = new Map<string, string>();
    let tekst = '';
    for (let runde = 0; runde < 4; runde++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5-5', max_tokens: 2500, system: SYSTEM, messages,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        }),
      });
      const j = await r.json();
      if (!r.ok) return svar({ error: 'Anthropic API: ' + (j?.error?.message || r.status) }, 502);
      for (const c of j.content || []) {
        if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) for (const x of c.content) if (x.url) kilder.set(x.url, x.title || x.url);
        if (c.type === 'text') { tekst += c.text; for (const ci of c.citations || []) if (ci.url) kilder.set(ci.url, ci.title || ci.url); }
      }
      if (j.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: j.content }); tekst = ''; continue; }
      break;
    }
    const resultat = plukkJson(tekst);
    if (!resultat) return svar({ error: 'Fikk ikke tolket svaret. Prøv igjen eller skriv fabrikat/modell mer presist.', raa: tekst.slice(0, 500) }, 502);
    return svar({ resultat, kilder: [...kilder].map(([url, title]) => ({ url, title })) });
  } catch (e) {
    return svar({ error: String((e as Error)?.message || e) }, 500);
  }
});
