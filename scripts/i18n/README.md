# Språk i appen

Kildeteksten er norsk (bokmål) og brukes som nøkkel: `tt('Lagre')`. Oversettelser ligger i `src/i18n/<språk>.json` (`{ "norsk tekst": "oversatt tekst" }`). Mangler en oversettelse, vises norsk.

- Plassholdere: `tt('Sendt til {0}', navn)` – samme `{0}` må finnes i oversettelsen.
- Lagrede verdier (status, alvorlighet, typer) lagres alltid på norsk og oversettes bare når de vises (`Chip`, nedtrekkslister, `vis()`).
- Språket velges under Min profil og på innloggingssiden, og lagres på enheten (`ek.sprak`).

## Verktøy

- `codemod.js <src> [--skriv]` pakker nye UI-tekster i `tt()` (JSX-tekst, `label`/`hint`/`title`-felt, `toast`, `confirmBox` m.fl.). Filer med lovtekst og lagrede verdier er unntatt (se `UTELAT`).
- `samle.js` lister alle nøkler som skal oversettes (`alle.json`) og etiketter i lister av typen `['nøkkel', 'Etikett']` (`tupler.json`).

Nytt språk: legg det til i `SPRAK` og `LASTERE` i `src/lib/i18n.ts`, og lag `src/i18n/<kode>.json`.
