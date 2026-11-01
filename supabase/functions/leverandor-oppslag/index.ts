// Supabase Edge Function: leverandor-oppslag
// Søker på nett (Google Gemini + Google Search; ev. Anthropic som reserve) etter leverandørens antatte levetid
// og utskiftings-/retrofitkostnad for et fabrikat/modell. Kun admin/forvalter.
// Krever hemmeligheten GEMINI_API_KEY (gratis i Google AI Studio) i Supabase → Edge Functions → Secrets.
// Valgfritt: GEMINI_MODEL (standard: nyeste tilgjengelige Flash-modell), ANTHROPIC_API_KEY (brukes bare hvis Gemini-nøkkel mangler).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const svar = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `Du er en nøktern rådgiver for forvaltning, drift og vedlikehold (FDV) av næringseiendom i Norge.
Brukeren oppgir fabrikat/modell for et teknisk system eller en komponent. Søk på nett med Google Search (helst produsentens egne datablad, FDV-dokumentasjon, brosjyrer, samt norske kilder for priser) og finn:
1) leverandørens/produsentens antatte eller oppgitte levetid (teknisk levetid i år, evt. intervall),
2) en forventet utskiftingskostnad i NOK eks. mva for utstyr + montasje i Norge (dagens prisnivå),
3) evt. en retrofit-/oppgraderingskostnad dersom det er et realistisk alternativ til full utskifting.
Vær ærlig: hvis du ikke finner tall, sett null. Ikke finn på kilder: kilde_url skal bare være en nettadresse du faktisk har sett i søkeresultatene, ellers null. Kostnader er alltid anslag.
Svar til slutt KUN med ett JSON-objekt (ingen tekst før/etter, ingen markdown) på formen:
{"produkt":string,"levetid":{"aar":number|null,"min":number|null,"max":number|null,"type":"teknisk"|"funksjonell"|"garanti"|"ukjent","kilde_url":string|null,"kommentar":string},
"utskifting":{"belop_nok":number|null,"omfang":string,"kilde_url":string|null,"kommentar":string},
"retrofit":{"belop_nok":number|null,"omfang":string,"kilde_url":string|null,"kommentar":string}|null,
"usikkerhet":"lav"|"middels"|"høy","notat":string}
Skriv tekstfeltene på norsk og kort.`;

// Finn nyeste tilgjengelige «gemini-X.Y-flash» (ikke lite/preview/live/image/tts) for denne nøkkelen
async function nyesteFlash(key: string): Promise<string> {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } });
    const j = await r.json();
    const kand = (j.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => String(m.name).replace('models/', ''))
      .map((n: string) => ({ n, v: n.match(/^gemini-(\d+(?:\.\d+)?)-flash(?:-latest)?$/) }))
      .filter((x: any) => x.v)
      .sort((a: any, b: any) => parseFloat(b.v[1]) - parseFloat(a.v[1]) || a.n.length - b.n.length);
    if (kand.length) return kand[0].n;
  } catch { /* faller tilbake */ }
  return 'gemini-flash-latest';
}

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

    const gKey = Deno.env.get('GEMINI_API_KEY'); const aKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!gKey && !aKey) return svar({ error: 'GEMINI_API_KEY er ikke satt. Lag en gratis nøkkel i Google AI Studio og legg den inn i Supabase → Edge Functions → Secrets.' }, 500);

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

    const kilder = new Map<string, string>();
    let tekst = ''; let motor = '';
    let utenSok = false;
    if (gKey) {
      // Google Gemini med Google Search-grounding. Modellen velges automatisk (nyeste Flash) med mindre GEMINI_MODEL er satt.
      motor = Deno.env.get('GEMINI_MODEL') || await nyesteFlash(gKey);
      const kall = (medSok: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${motor}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': gKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + (medSok ? '' : '\nDu har IKKE tilgang til nettsøk nå. Svar ut fra generell kunnskap, sett alle kilde_url til null og usikkerhet til "høy".') }] },
          contents: [{ role: 'user', parts: [{ text: linjer }] }],
          ...(medSok ? { tools: [{ google_search: {} }] } : {}),
        }),
      });
      let r = await kall(true); let j = await r.json();
      if (!r.ok) {
        const m = String(j?.error?.message || r.status);
        // Gratisnivået gir ikke Google-søk på alle modeller (kvote 0 / ikke støttet) → prøv uten søk
        if (r.status === 429 || /search|grounding|tool/i.test(m)) {
          const r2 = await kall(false); const j2 = await r2.json();
          if (r2.ok) { r = r2; j = j2; utenSok = true; }
          else if (r2.status === 429) return svar({ error: 'Gratiskvoten hos Google er brukt opp for nå. Prøv igjen senere (døgnkvoten nullstilles ca. kl. 09 norsk tid).' }, 429);
          else return svar({ error: `Google Gemini (${motor}): ` + (j2?.error?.message || r2.status) }, 502);
        } else return svar({ error: `Google Gemini (${motor}): ` + m }, 502);
      }
      const c = j.candidates?.[0];
      tekst = (c?.content?.parts || []).filter((x: any) => !x.thought).map((x: any) => x.text || '').join('');
      for (const g of c?.groundingMetadata?.groundingChunks || []) if (g.web?.uri) kilder.set(g.web.uri, g.web.title || g.web.uri);
    } else {
      motor = 'claude-sonnet-5-5';
      const messages: any[] = [{ role: 'user', content: linjer }];
      for (let runde = 0; runde < 4; runde++) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': aKey!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: motor, max_tokens: 2500, system: SYSTEM, messages, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] }),
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
    }
    const resultat = plukkJson(tekst);
    if (!resultat) return svar({ error: 'Fikk ikke tolket svaret. Prøv igjen eller skriv fabrikat/modell mer presist.', raa: tekst.slice(0, 500) }, 502);
    return svar({ resultat, motor, utenSok, kilder: [...kilder].map(([url, title]) => ({ url, title })) });
  } catch (e) {
    return svar({ error: String((e as Error)?.message || e) }, 500);
  }
});
