// Lager innloggings-e-postene (invitasjon og nytt passord) på alle språk i appen.
// Språket hentes fra brukerens metadata (user_metadata.sprak), som appen setter ved invitasjon og innlogging.
// Kjør: node supabase/epostmaler/lag.cjs  → skriver invite.html, recovery.html og emner.txt
const fs = require('fs'); const path = require('path');
const T = {
  invite: {
    nb: ['Du er invitert til Eiendomskontroll', 'Du er invitert', 'Du er invitert til å bruke Eiendomskontroll. Trykk på knappen for å velge passord og logge inn.', 'Godta invitasjonen', 'Lenken kan bare brukes én gang. Venter du ikke denne e-posten, kan du se bort fra den.'],
    en: ['You are invited to Eiendomskontroll', 'You are invited', 'You have been invited to use Eiendomskontroll. Tap the button to choose a password and log in.', 'Accept the invitation', 'The link can only be used once. If you were not expecting this e-mail, you can ignore it.'],
    sv: ['Du är inbjuden till Eiendomskontroll', 'Du är inbjuden', 'Du har bjudits in att använda Eiendomskontroll. Tryck på knappen för att välja lösenord och logga in.', 'Godkänn inbjudan', 'Länken kan bara användas en gång. Väntade du dig inte detta e-postmeddelande kan du bortse från det.'],
    da: ['Du er inviteret til Eiendomskontroll', 'Du er inviteret', 'Du er inviteret til at bruge Eiendomskontroll. Tryk på knappen for at vælge adgangskode og logge ind.', 'Acceptér invitationen', 'Linket kan kun bruges én gang. Venter du ikke denne e-mail, kan du se bort fra den.'],
    'es-MX': ['Invitación a Eiendomskontroll', 'Tiene una invitación', 'Lo invitaron a usar Eiendomskontroll. Toque el botón para elegir su contraseña e iniciar sesión.', 'Aceptar la invitación', 'El enlace solo se puede usar una vez. Si no esperaba este correo, puede ignorarlo.'],
    'es-ES': ['Invitación a Eiendomskontroll', 'Tienes una invitación', 'Te han invitado a usar Eiendomskontroll. Pulsa el botón para elegir tu contraseña e iniciar sesión.', 'Aceptar la invitación', 'El enlace solo se puede usar una vez. Si no esperabas este correo, puedes ignorarlo.'],
  },
  recovery: {
    nb: ['Nytt passord til Eiendomskontroll', 'Velg nytt passord', 'Vi har fått en forespørsel om nytt passord for {{ .Email }}. Trykk på knappen for å velge et nytt.', 'Velg nytt passord', 'Har du ikke bedt om dette, kan du se bort fra e-posten. Passordet ditt er ikke endret.'],
    en: ['New password for Eiendomskontroll', 'Choose a new password', 'We received a request for a new password for {{ .Email }}. Tap the button to choose a new one.', 'Choose a new password', 'If you did not request this, you can ignore this e-mail. Your password has not been changed.'],
    sv: ['Nytt lösenord till Eiendomskontroll', 'Välj nytt lösenord', 'Vi har fått en begäran om nytt lösenord för {{ .Email }}. Tryck på knappen för att välja ett nytt.', 'Välj nytt lösenord', 'Har du inte bett om detta kan du bortse från e-postmeddelandet. Ditt lösenord har inte ändrats.'],
    da: ['Ny adgangskode til Eiendomskontroll', 'Vælg ny adgangskode', 'Vi har modtaget en anmodning om ny adgangskode til {{ .Email }}. Tryk på knappen for at vælge en ny.', 'Vælg ny adgangskode', 'Har du ikke bedt om dette, kan du se bort fra e-mailen. Din adgangskode er ikke ændret.'],
    'es-MX': ['Nueva contraseña para Eiendomskontroll', 'Elija una nueva contraseña', 'Recibimos una solicitud de nueva contraseña para {{ .Email }}. Toque el botón para elegir una nueva.', 'Elegir nueva contraseña', 'Si no lo solicitó, puede ignorar este correo. Su contraseña no ha cambiado.'],
    'es-ES': ['Nueva contraseña para Eiendomskontroll', 'Elige una nueva contraseña', 'Hemos recibido una solicitud de nueva contraseña para {{ .Email }}. Pulsa el botón para elegir una nueva.', 'Elegir nueva contraseña', 'Si no lo has solicitado, puedes ignorar este correo. Tu contraseña no ha cambiado.'],
  },
};
const ANDRE = ['en', 'sv', 'da', 'es-MX', 'es-ES'];
// printf gjør verdien til tekst også når brukeren mangler språk (eldre brukere), så malen aldri feiler
const velg = (f) => ANDRE.map((s, i) => `{{ ${i ? 'else if' : 'if'} eq (printf "%v" .Data.sprak) "${s}" }}${f(s)}`).join('') + `{{ else }}${f('nb')}{{ end }}`;
const kropp = (t) => `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1d2320;max-width:560px">
  <h2 style="margin:0 0 12px">${t[1]}</h2><p>${t[2]}</p>
  <p style="margin:20px 0"><a href="{{ .ConfirmationURL }}" style="background:#1f6f5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${t[3]}</a></p>
  <p style="font-size:12px;color:#6b736d">${t[4]}</p></div>`;
// Emnefeltet i Supabase tåler maks 255 tegn: korte ord per språk, felles « – Eiendomskontroll»
const EMNE = { invite: ['Invitation', 'Inbjudan', 'Invitation', 'Invitación', 'Invitasjon'], recovery: ['New password', 'Nytt lösenord', 'Ny adgangskode', 'Nueva contraseña', 'Nytt passord'] };
let emner = 'Lim inn bare linjen UNDER navnet (ikke «invite:»/«recovery:»).\n\n';
for (const [mal, S] of Object.entries(T)) {
  fs.writeFileSync(path.join(__dirname, mal + '.html'), velg(s => '\n' + kropp(S[s]) + '\n') + '\n');
  const e = EMNE[mal]; const linje = `{{$s:=printf "%v" .Data.sprak}}{{if eq $s "en"}}${e[0]}{{else if eq $s "sv"}}${e[1]}{{else if eq $s "da"}}${e[2]}{{else if eq $s "es-MX" "es-ES"}}${e[3]}{{else}}${e[4]}{{end}} – Eiendomskontroll`;
  if (linje.length > 255) throw new Error('Emnet er for langt: ' + mal);
  emner += `${mal}:\n${linje}\n\n`;
}
fs.writeFileSync(path.join(__dirname, 'emner.txt'), emner);
console.log('skrevet invite.html, recovery.html og emner.txt');
