# Innloggings-e-post på flere språk

Supabase sender selv e-postene for invitasjon og nytt passord. Malene ligger i Supabase, ikke i appen, så de må legges inn én gang.

Språket velges ut fra brukerens `sprak` (lagret på brukeren):
- ved invitasjon fra Organisasjon og tilgang og ved selvregistrering: språket til den som inviterer/registrerer
- ved hver innlogging: språket brukeren har valgt i appen

Mangler språket (eldre brukere som ikke har logget inn siden), brukes norsk.

## Slik legger du inn malene

1. Kjør `node supabase/epostmaler/lag.cjs` (lager `invite.html`, `recovery.html` og `emner.txt`).
2. Gå til Supabase → Authentication → Emails (Email Templates).
3. **Invite user**: lim inn innholdet i `invite.html` i meldingen, og invite-linjen fra `emner.txt` i emnefeltet.
4. **Reset password**: lim inn `recovery.html` i meldingen, og recovery-linjen fra `emner.txt` i emnefeltet.
5. Lagre, og test med «Glemt passord» for en bruker med svensk eller engelsk valgt.

Malene er testet med Go-malmotoren som Supabase bruker, også for brukere uten språk.

Endrer du tekstene, gjør det i `lag.cjs` og kjør skriptet på nytt.
