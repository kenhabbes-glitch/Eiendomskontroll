# Språk i appen

Kildeteksten er norsk (bokmål) og brukes som nøkkel: `tt('Lagre')`. Oversettelser ligger i `src/i18n/<språk>.json` (`{ "norsk tekst": "oversatt tekst" }`). Mangler en oversettelse, vises norsk.

- Plassholdere: `tt('Sendt til {0}', navn)` – samme `{0}` må finnes i oversettelsen.
- Lagrede verdier (status, alvorlighet, typer) lagres alltid på norsk og oversettes bare når de vises (`Chip`, nedtrekkslister, `vis()`).
- Språket velges under Min profil og på innloggingssiden, og lagres på enheten (`ek.sprak`).

## Verktøy

- `codemod.js <src> [--skriv]` pakker nye UI-tekster i `tt()` (JSX-tekst, `label`/`hint`/`title`-felt, `toast`, `confirmBox` m.fl.). Filer med lovtekst og lagrede verdier er unntatt (se `UTELAT`).
- `samle.js` lister alle nøkler som skal oversettes (`alle.json`) og etiketter i lister av typen `['nøkkel', 'Etikett']` (`tupler.json`).

Nytt språk: legg det til i `SPRAK` og `LASTERE` i `src/lib/i18n.ts`, og lag `src/i18n/<kode>.json`.

## Språk som finnes

| Kode | Språk | Fil |
|---|---|---|
| nb | Norsk (bokmål) – kildetekst | – |
| en | English | `src/i18n/en.json` |
| sv | Svenska | `src/i18n/sv.json` |
| da | Dansk | `src/i18n/da.json` |
| es-MX | Español (México) | `src/i18n/es-MX.json` |
| es-ES | Español (España) | `src/i18n/es-ES.json` – lages fra es-MX med `node scripts/i18n/es-ES-fra-es-MX.cjs` (alquiler, ascensor, móvil, aparcamiento …) |

- Nettleserspråket velger språk første gang (nb/no/nn → norsk, sv → svensk, da → dansk, en → engelsk, es-ES → spansk for Spania, annen spansk → meksikansk).
- Ord som oversettes ulikt etter sammenheng: `ttc('svar', 'Avvik')` slår opp `«Avvik|svar»` først (knappen «Avvik» = Deviation, menyen «Avvik» = Deviations).
- Tekster i PDF-rapporter oversettes sentralt i `safe()` (arealRapport.tsx), så etiketter i tabeller og nøkkeltall følger språket.
- `flett.cjs <språk> <utfil>` fletter oversettelsesfiler på formen `indeks<TAB>tekst` mot nøkkellisten og sjekker at plassholdere ({0}) stemmer.
