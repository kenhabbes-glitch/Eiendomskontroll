import { adminApi, mineOrg, reloadAdmin, toast, useStore, state } from '../lib/store';
import { formModal } from './ui';
import { tt } from '../lib/i18n';

/** Varsel til administrator når organisasjonen er registrert uten org.nr. – prøveperioden starter først når det er lagt inn. */
export function OrgnrVarsel() {
  useStore();
  const o = state.me?.plattform ? null : mineOrg(['admin']).find(x => x.aktiv !== false && !x.orgnr && x.data?.utenOrgnr);
  if (!o) return null;
  const legg = () => formModal({
    title: tt("Legg inn organisasjonsnummer"),
    fields: [{ k: 'orgnr', label: tt("Organisasjonsnummer"), req: true, mono: true, hint: tt("Prøveperioden på 30 dager starter når organisasjonsnummeret er lagt inn.") }],
    values: { orgnr: '' },
    onSave: async v => { try { const r = await adminApi({ action: 'org_orgnr', org_id: o.id, orgnr: v.orgnr }); toast(r.prove ? tt("Organisasjonsnummer lagret – prøveperioden på 30 dager har startet") : tt("Organisasjonsnummer lagret")); await reloadAdmin(); } catch (e: any) { toast(e.message); return false; } },
  });
  return <div className="banner" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    <span style={{ flex: 1, minWidth: 220 }}>{tt("«{0}» mangler organisasjonsnummer. Prøveperioden starter når du legger det inn.", o.navn)}</span>
    <button className="btn pri" onClick={legg}>{tt("Legg inn organisasjonsnummer")}</button>
  </div>;
}
