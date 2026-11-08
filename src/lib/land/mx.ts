// Landpakke Mexico: føderale normer (NOM) og regler for Ciudad de México (CDMX).
// Kildene er offisielle publiseringer (DOF, Gaceta Oficial CDMX, Secretaría de Economía/platiica). Intervaller og hjemler
// er veiledende og må kvalitetssikres av lokal fagperson før kommersiell bruk. Andre delstater har egne lover om
// protección civil og egne byggeregler (reglamentos de construcción) – de er ikke lagt inn ennå.
import type { Mal } from '../catalog';

/** Kontrollmaler. Nøklene har prefiks mx_ så de kan ligge i samme katalog som de norske. */
export const MALER_MX: Record<string, Mal> = {
  // --- Eiendomsnivå (alle næringsbygg)
  mx_pipc: { n: 'Programa Interno de Protección Civil (PIPC) – actualización, registro y revalidación', k: 'Brann', t: 'Lovpålagt', h: 'Ley General de Protección Civil; CDMX: Ley de Gestión Integral de Riesgos y Protección Civil arts. 56–71 (reforma G.O. 28/04/2023: vigencia según tipo de inmueble) y su Reglamento art. 56; Términos de Referencia de la SGIRPC', i: [1, 'år'], u: 'Propietario / Responsable Oficial de Protección Civil', lvl: 'e', b: 'Revise la vigencia indicada en la constancia de registro del PIPC en la plataforma digital de la SGIRPC y ajuste el intervalo (normalmente 1 a 3 años según el nivel de riesgo).' },
  mx_simulacro: { n: 'Simulacro de evacuación y de emergencia de incendio', k: 'Brann', t: 'Lovpålagt', h: 'NOM-002-STPS-2010: al menos una vez al año en riesgo de incendio ordinario y dos veces al año en riesgo alto; PIPC (CDMX)', i: [1, 'år'], u: 'Propietario / Unidad Interna de Protección Civil', lvl: 'e', b: 'Coordine con los arrendatarios. En inmuebles de riesgo alto programe dos simulacros al año.' },
  mx_vobo: { n: 'Visto Bueno de Seguridad y Operación de las Instalaciones – renovación (CDMX)', k: 'Bygg', t: 'Lovpålagt', h: 'Reglamento de Construcciones para el Distrito Federal art. 68 (reforma G.O. 19/04/2021): renovación cada tres años, y dentro de 60 días hábiles después de cambios en la edificación o instalaciones; registro ante la Alcaldía (art. 69)', i: [3, 'år'], u: 'Director Responsable de Obra (DRO) y Corresponsable en Instalaciones', lvl: 'e', b: 'Aplica a los usos del art. 69 (p. ej. centros de reunión, comercios y oficinas de cierta superficie). Centros de reunión como bares y salones: renovación anual.' },
  mx_cse: { n: 'Constancia de Seguridad Estructural – renovación (CDMX, grupo A y subgrupo B1)', k: 'Bygg', t: 'Lovpålagt', h: 'Reglamento de Construcciones para el Distrito Federal art. 71 y Lineamientos del Instituto para la Seguridad de las Construcciones: cada cinco años, al cambiar el uso o la estructura, y después de un sismo intenso', i: [5, 'år'], u: 'Corresponsable en Seguridad Estructural / DRO', lvl: 'e' },
  mx_revision_inst: { n: 'Recorrido de verificación de condiciones de seguridad (instalaciones, rutas de evacuación, señalización)', k: 'Brann', t: 'Egenkontroll', h: 'NOM-002-STPS-2010 (rutas de evacuación y salidas de emergencia); NOM-003-SEGOB-2011 y NOM-026-STPS-2008 (señalización)', i: [1, 'mnd'], u: 'Administrador del inmueble', lvl: 'e' },
  mx_seguro: { n: 'Póliza de seguro del inmueble – revisión de vigencia y coberturas', k: 'Annet', t: 'Forsikringskrav', h: 'Contrato de seguro y, en su caso, contratos de arrendamiento', i: [1, 'år'], u: 'Propietario', lvl: 'e' },
  mx_predial: { n: 'Impuesto predial – pago', k: 'Annet', t: 'Lovpålagt', h: 'Código Fiscal de la entidad (CDMX: Código Fiscal de la Ciudad de México, pago bimestral)', i: [2, 'mnd'], u: 'Propietario', lvl: 'e' },
  mx_arrend_ik: { n: 'Obtener de los arrendatarios la evidencia de su PIPC, brigadas y revisiones', k: 'Internkontroll', t: 'Egenkontroll', h: 'Ley de Gestión Integral de Riesgos y Protección Civil de la CDMX; NOM-002-STPS-2010 (obligaciones del patrón en cada centro de trabajo); contrato de arrendamiento', i: [1, 'år'], u: 'Propietario / administrador', lvl: 'e', pl: 'alle' },
  mx_cisterna: { n: 'Cisternas y tinacos – limpieza y desinfección', k: 'VVS', t: 'Anbefalt', h: 'Buena práctica sanitaria; revise los requisitos de la autoridad sanitaria local', i: [6, 'mnd'], u: 'Empresa de servicio', lvl: 'e' },
  mx_estructura_visual: { n: 'Revisión visual de estructura, fachadas y elementos que puedan desprenderse', k: 'Bygg', t: 'Anbefalt', h: 'Buena práctica; obligatorio revisar después de un sismo (Reglamento de Construcciones CDMX)', i: [1, 'år'], u: 'Administrador del inmueble', lvl: 'e' },
  // --- Systemnivå
  mx_extintor_mes: { n: 'Extintores – revisión mensual', k: 'Brann', t: 'Lovpålagt', h: 'NOM-002-STPS-2010 num. 7.2 y 7.3: programa anual de revisión mensual de los extintores y registro de resultados', i: [1, 'mnd'], u: 'Personal capacitado del inmueble', lvl: 'a' },
  mx_extintor_anual: { n: 'Extintores – mantenimiento y recarga', k: 'Brann', t: 'Lovpålagt', h: 'NOM-002-STPS-2010 y NOM-154-SCFI-2005 (servicio de mantenimiento y recarga por prestador verificado)', i: [1, 'år'], u: 'Prestador de servicio a extintores (NOM-154-SCFI-2005)', lvl: 'a' },
  mx_equipos_ci: { n: 'Equipos contra incendio, detección, alarmas y sistemas fijos – revisión y pruebas anuales', k: 'Brann', t: 'Lovpålagt', h: 'NOM-002-STPS-2010 num. 7.4', i: [1, 'år'], u: 'Empresa especializada', lvl: 'a' },
  mx_alarma_mes: { n: 'Sistema de detección y alarma – prueba funcional mensual', k: 'Brann', t: 'Egenkontroll', h: 'NOM-002-STPS-2010 (programa de revisión); recomendación del fabricante', i: [1, 'mnd'], u: 'Personal capacitado del inmueble', lvl: 'a' },
  mx_rociadores_sem: { n: 'Rociadores e hidrantes – revisión semanal (presión, válvulas, bombas)', k: 'Brann', t: 'Egenkontroll', h: 'NOM-002-STPS-2010 (sistemas fijos contra incendio); NFPA 25 como referencia técnica', i: [1, 'uke'], u: 'Personal capacitado del inmueble', lvl: 'a' },
  mx_emergencia_luz: { n: 'Luces de emergencia y señalización – prueba de funcionamiento', k: 'Brann', t: 'Egenkontroll', h: 'NOM-002-STPS-2010 (rutas de evacuación); NOM-003-SEGOB-2011 (señales de protección civil)', i: [1, 'mnd'], u: 'Personal capacitado del inmueble', lvl: 'a' },
  mx_electrica_anual: { n: 'Instalaciones eléctricas – programa anual de revisión', k: 'Elektro', t: 'Lovpålagt', h: 'NOM-002-STPS-2010 num. 7.5 (revisión anual por personal capacitado y autorizado); NOM-029-STPS-2011 (mantenimiento de instalaciones eléctricas); NOM-001-SEDE-2012', i: [1, 'år'], u: 'Electricista calificado', lvl: 'a' },
  mx_tierras: { n: 'Red de puesta a tierra y pararrayos – medición de resistencia y continuidad', k: 'Elektro', t: 'Lovpålagt', h: 'NOM-022-STPS-2015 (electricidad estática) – medición periódica de la red de tierras y del sistema de pararrayos', i: [1, 'år'], u: 'Empresa especializada', lvl: 'a' },
  mx_uvie: { n: 'Dictamen de verificación de la instalación eléctrica (UVIE)', k: 'Elektro', t: 'Anbefalt', h: 'NOM-001-SEDE-2012 y su Procedimiento para la Evaluación de la Conformidad (DOF 18/06/2014): dictamen de una Unidad de Verificación para instalaciones nuevas o modificadas y lugares de concentración pública', i: [5, 'år'], u: 'Unidad de Verificación de Instalaciones Eléctricas (UVIE)', lvl: 'a', b: 'Revise si el inmueble es lugar de concentración pública o si hubo modificaciones: entonces el dictamen es obligatorio.' },
  mx_gas_anual: { n: 'Instalación de gas LP / natural – programa anual de revisión', k: 'VVS', t: 'Lovpålagt', h: 'NOM-002-STPS-2010 num. 7.6; NOM-004-SEDG-2004 (gas LP: dictamen de Unidad de Verificación en instalaciones nuevas y al modificarlas); NOM-002-SECRE-2010 (gas natural)', i: [1, 'år'], u: 'Técnico autorizado / Unidad de Verificación', lvl: 'a' },
  mx_presion: { n: 'Recipientes sujetos a presión y calderas – revisión y pruebas', k: 'Annet', t: 'Lovpålagt', h: 'NOM-020-STPS-2011 – periodicidad según la categoría del equipo; dictamen de Unidad de Verificación cuando aplique', i: [1, 'år'], u: 'Unidad de Verificación / empresa especializada', lvl: 'a' },
  mx_elevador_mant: { n: 'Elevadores y escaleras eléctricas – mantenimiento preventivo', k: 'Heis', t: 'Lovpålagt', h: 'NOM-207-SCFI-2018 (mantenimiento de elevadores, escaleras, rampas y aceras electromecánicas); NOM-053-SCFI-2000 (seguridad de elevadores de tracción)', i: [1, 'mnd'], u: 'Empresa de mantenimiento de elevadores', lvl: 'a' },
  mx_elevador_anual: { n: 'Elevadores – inspección anual de seguridad y pruebas', k: 'Heis', t: 'Anbefalt', h: 'NOM-207-SCFI-2018; reglamentos locales de construcción', i: [1, 'år'], u: 'Empresa de mantenimiento de elevadores', lvl: 'a' },
  mx_planta: { n: 'Planta de emergencia / UPS – prueba con carga y mantenimiento', k: 'Elektro', t: 'Egenkontroll', h: 'Recomendación del fabricante; NOM-001-SEDE-2012 (sistemas de emergencia)', i: [1, 'mnd'], u: 'Técnico de mantenimiento', lvl: 'a' },
  mx_hvac: { n: 'Aire acondicionado / ventilación – mantenimiento y cambio de filtros', k: 'VVS', t: 'Service', h: 'Recomendación del fabricante', i: [3, 'mnd'], u: 'Empresa de servicio HVAC', lvl: 'a' },
  mx_bombas: { n: 'Equipos de bombeo – revisión de funcionamiento', k: 'VVS', t: 'Egenkontroll', h: 'Recomendación del fabricante', i: [1, 'mnd'], u: 'Técnico de mantenimiento', lvl: 'a' },
  mx_trampa_grasa: { n: 'Trampa de grasa – limpieza', k: 'VVS', t: 'Lovpålagt', h: 'Normas locales de descarga a drenaje (CDMX: NADF-015-AGUA y requisitos de SACMEX) – revise la norma local aplicable', i: [3, 'mnd'], u: 'Empresa autorizada', lvl: 'a' },
  mx_impermeab: { n: 'Azotea e impermeabilización – inspección y limpieza de bajadas pluviales', k: 'Bygg', t: 'Anbefalt', h: 'Buena práctica (antes de la temporada de lluvias)', i: [1, 'år'], u: 'Administrador del inmueble', lvl: 'a' },
};

/** Faste kontroller på eiendomsnivå. Regionsavhengige (CDMX) tas bare med når eiendommen ligger i regionen. */
export const PROP_MX: { k: string; region?: string[] }[] = [
  { k: 'mx_pipc' }, { k: 'mx_simulacro' }, { k: 'mx_revision_inst' }, { k: 'mx_arrend_ik' }, { k: 'mx_seguro' }, { k: 'mx_predial' },
  { k: 'mx_vobo', region: ['CDMX'] }, { k: 'mx_cse', region: ['CDMX'] }, { k: 'mx_estructura_visual' }, { k: 'mx_cisterna' },
];

/** Systemtype (KOMP-nøkkel) → meksikanske kontroller */
export const KOMP_MX: Record<string, string[]> = {
  slokkere: ['mx_extintor_mes', 'mx_extintor_anual'], brannslanger: ['mx_equipos_ci'], brannalarm: ['mx_alarma_mes', 'mx_equipos_ci'], sprinkler: ['mx_rociadores_sem', 'mx_equipos_ci'],
  talevarsling: ['mx_equipos_ci'], roykluker: ['mx_equipos_ci'], brannspjeld: ['mx_equipos_ci'], nodlys: ['mx_emergencia_luz'], branndorer: ['mx_revision_inst'], ytterdorer: ['mx_revision_inst'],
  eltavle: ['mx_electrica_anual', 'mx_uvie'], elanlegg: ['mx_electrica_anual'], lading: ['mx_electrica_anual'], solcelle: ['mx_electrica_anual'], lynvern: ['mx_tierras'], nodstrom: ['mx_planta'],
  kjel: ['mx_presion', 'mx_gas_anual'], trykk: ['mx_presion'], bereder: ['mx_presion'],
  heis: ['mx_elevador_mant', 'mx_elevador_anual'], rulletrapp: ['mx_elevador_mant', 'mx_elevador_anual'], loft: ['mx_elevador_mant'],
  ventilasjon: ['mx_hvac'], kjole: ['mx_hvac'], varmepumpe: ['mx_hvac'], grunnvann: ['mx_bombas'], fettutskiller: ['mx_trampa_grasa'],
  tak_asfalt: ['mx_impermeab'], tak_folie: ['mx_impermeab'], tak_stein: ['mx_impermeab'],
};

/** Leietakerens plikter (arrendatario) */
export const PLIKTER_MX: Record<string, { n: string; h: string; dok?: string[] }> = {
  mx_pipc_arr: { n: 'Programa Interno de Protección Civil del arrendatario registrado y vigente (cuando aplique a su actividad)', h: 'Ley de Gestión Integral de Riesgos y Protección Civil de la CDMX art. 58 y Términos de Referencia de la SGIRPC; leyes estatales de protección civil', dok: ['Constancia de registro del PIPC', 'Carta de corresponsabilidad del Responsable Oficial de Protección Civil (si aplica)', 'Fecha de vigencia'] },
  mx_brigadas: { n: 'Brigadas de emergencia integradas y capacitadas (incendio, evacuación, primeros auxilios)', h: 'NOM-002-STPS-2010 (brigadas contra incendio y capacitación anual)', dok: ['Lista de brigadistas', 'Constancias de capacitación (DC-3)', 'Programa de capacitación anual'] },
  mx_simulacro_arr: { n: 'Simulacros realizados y documentados', h: 'NOM-002-STPS-2010 (al menos uno al año; dos en riesgo alto)', dok: ['Fecha y tipo de simulacro', 'Lista de participantes', 'Informe de evaluación y mejoras'] },
  mx_extintores_arr: { n: 'Extintores propios revisados mensualmente y con mantenimiento vigente', h: 'NOM-002-STPS-2010 num. 7.2–7.3; NOM-154-SCFI-2005', dok: ['Registro de revisión mensual', 'Etiqueta/constancia de mantenimiento o recarga'] },
  mx_electrica_arr: { n: 'Revisión anual de las instalaciones eléctricas propias del local', h: 'NOM-002-STPS-2010 num. 7.5; NOM-029-STPS-2011', dok: ['Programa y registro de revisión', 'Nombre del responsable calificado'] },
  mx_gas_arr: { n: 'Instalación de gas del local revisada (restaurantes, cocinas)', h: 'NOM-002-STPS-2010 num. 7.6; NOM-004-SEDG-2004 (dictamen de Unidad de Verificación al instalar o modificar)', dok: ['Programa de revisión anual', 'Dictamen de la Unidad de Verificación (si aplica)'] },
  mx_responsable: { n: 'Responsable de protección civil del arrendatario designado y comunicado al propietario', h: 'Ley General de Protección Civil (Unidad Interna de Protección Civil); contrato de arrendamiento', dok: ['Nombre y contacto del responsable', 'Suplente'] },
  mx_seguro_arr: { n: 'Póliza de responsabilidad civil y contenidos vigente', h: 'Contrato de arrendamiento', dok: ['Póliza vigente', 'Fecha de vencimiento'] },
};
export const STD_PLIKTER_MX = ['mx_pipc_arr', 'mx_brigadas', 'mx_simulacro_arr', 'mx_extintores_arr', 'mx_electrica_arr', 'mx_responsable', 'mx_seguro_arr'];

/** Dokumenttyper eieren bør ha (tas med i dokumentdekningen) */
export const DOK_MX = ['Programa Interno de Protección Civil (constancia de registro)', 'Visto Bueno de Seguridad y Operación', 'Constancia de Seguridad Estructural', 'Licencia de construcción / Aviso de terminación de obra', 'Dictamen de instalación eléctrica (UVIE)', 'Dictamen de instalación de gas', 'Planos arquitectónicos y de instalaciones', 'Planos de rutas de evacuación', 'Póliza de seguro del inmueble', 'Boleta predial', 'Escritura / título de propiedad', 'Contrato de arrendamiento'];
export const DOK_MX_PAAKREVD = DOK_MX.slice(0, 7);

export const TILSYN_MX = ['Protección Civil', 'STPS (inspección del trabajo)', 'Alcaldía / municipio', 'Bomberos', 'Aseguradora'];
export const MYND_MX: Record<string, string> = { 'Protección Civil': 'Secretaría de Gestión Integral de Riesgos y Protección Civil (CDMX) / Coordinación Estatal de Protección Civil', 'STPS (inspección del trabajo)': 'Secretaría del Trabajo y Previsión Social', 'Alcaldía / municipio': 'Alcaldía / Ayuntamiento', 'Bomberos': 'Heroico Cuerpo de Bomberos', 'Aseguradora': 'Compañía aseguradora' };

export const REGIONER_MX: [string, string][] = [['CDMX', 'Ciudad de México'], ['MEX', 'Estado de México'], ['JAL', 'Jalisco'], ['NL', 'Nuevo León'], ['QRO', 'Querétaro'], ['GTO', 'Guanajuato'], ['PUE', 'Puebla'], ['BC', 'Baja California'], ['YUC', 'Yucatán'], ['QROO', 'Quintana Roo'], ['OTRO', 'Otro estado']];

/** Kilder som vises på regelverkssiden og overvåkes (scripts/regelverkssjekk-mx.mjs) */
export const KILDER_MX: { navn: string; lenke: string; niva: 'federal' | 'CDMX' }[] = [
  { navn: 'Ley General de Protección Civil', lenke: 'https://www.diputados.gob.mx/LeyesBiblio/index.htm', niva: 'federal' },
  { navn: 'Ley Federal del Trabajo', lenke: 'https://www.diputados.gob.mx/LeyesBiblio/index.htm', niva: 'federal' },
  { navn: 'NOM-002-STPS-2010 Prevención y protección contra incendios', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-002-stps-2010/', niva: 'federal' },
  { navn: 'NOM-001-SEDE-2012 Instalaciones eléctricas (utilización)', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-001-sede-2012/', niva: 'federal' },
  { navn: 'NOM-029-STPS-2011 Mantenimiento de instalaciones eléctricas', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-029-stps-2011/', niva: 'federal' },
  { navn: 'NOM-022-STPS-2015 Electricidad estática', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-022-stps-2015/', niva: 'federal' },
  { navn: 'NOM-020-STPS-2011 Recipientes sujetos a presión y calderas', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-020-stps-2011/', niva: 'federal' },
  { navn: 'NOM-154-SCFI-2005 Extintores – mantenimiento y recarga', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-154-scfi-2005/', niva: 'federal' },
  { navn: 'NOM-207-SCFI-2018 Mantenimiento de elevadores', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-207-scfi-2018/', niva: 'federal' },
  { navn: 'NOM-053-SCFI-2000 Elevadores eléctricos de tracción', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-053-scfi-2000/', niva: 'federal' },
  { navn: 'NOM-004-SEDG-2004 Instalaciones de aprovechamiento de gas L.P.', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-004-sedg-2004/', niva: 'federal' },
  { navn: 'NOM-003-SEGOB-2011 Señales y avisos para protección civil', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-003-segob-2011/', niva: 'federal' },
  { navn: 'NOM-026-STPS-2008 Colores y señales de seguridad', lenke: 'https://platiica.economia.gob.mx/normalizacion/nom-026-stps-2008/', niva: 'federal' },
  { navn: 'Ley de Gestión Integral de Riesgos y Protección Civil de la Ciudad de México', lenke: 'https://www.proteccioncivil.cdmx.gob.mx', niva: 'CDMX' },
  { navn: 'Reglamento de Construcciones para el Distrito Federal', lenke: 'https://data.consejeria.cdmx.gob.mx', niva: 'CDMX' },
];

/** Oversikt på regelverkssiden (statisk innhold, trygt som HTML) */
export const SEK_MX: [string, string[]][] = [
  ['Protección civil', ['<b>Ley General de Protección Civil</b> y leyes estatales: los inmuebles con afluencia de público y los centros de trabajo deben contar con un <b>Programa Interno de Protección Civil (PIPC)</b> y una Unidad Interna de Protección Civil.', '<b>CDMX</b>: Ley de Gestión Integral de Riesgos y Protección Civil – el PIPC se elabora conforme a los Términos de Referencia de la SGIRPC y se registra en su plataforma digital; la vigencia depende del tipo de inmueble (reforma 2023).', 'Simulacros: al menos uno al año; dos en inmuebles de riesgo alto (NOM-002-STPS-2010).']],
  ['Prevención de incendios (NOM-002-STPS-2010)', ['Clasificar el riesgo de incendio (ordinario o alto) de cada centro de trabajo.', 'Programa anual de revisión mensual de extintores (7.2–7.3); mantenimiento y recarga por prestador conforme a NOM-154-SCFI-2005.', 'Revisión y pruebas anuales de equipos contra incendio, detección, alarmas y sistemas fijos (7.4); programa anual de instalaciones eléctricas (7.5) y de gas (7.6).', 'Rutas de evacuación, salidas de emergencia y señalización (NOM-003-SEGOB-2011, NOM-026-STPS-2008); brigadas capacitadas.']],
  ['Seguridad estructural y operación (CDMX)', ['<b>Visto Bueno de Seguridad y Operación</b>: renovación cada tres años y dentro de 60 días hábiles tras modificaciones (Reglamento de Construcciones art. 68–69).', '<b>Constancia de Seguridad Estructural</b>: cada cinco años en edificaciones del grupo A y subgrupo B1, y después de un sismo intenso (art. 71).', 'Licencias y avisos de obra ante la Alcaldía; intervención de Director Responsable de Obra y Corresponsables.']],
  ['Electricidad, gas y equipos', ['<b>NOM-001-SEDE-2012</b>: instalaciones eléctricas; dictamen de Unidad de Verificación (UVIE) en instalaciones nuevas o modificadas y en lugares de concentración pública.', '<b>NOM-029-STPS-2011</b> (mantenimiento eléctrico) y <b>NOM-022-STPS-2015</b> (tierras y pararrayos).', '<b>NOM-004-SEDG-2004</b> (gas LP) y NOM-002-SECRE-2010 (gas natural); <b>NOM-020-STPS-2011</b> (recipientes a presión y calderas).', '<b>NOM-207-SCFI-2018</b> mantenimiento de elevadores y escaleras eléctricas; NOM-053-SCFI-2000 seguridad de elevadores.']],
  ['Arrendatarios', ['El arrendatario, como patrón, cumple la NOM-002-STPS-2010 y demás NOM en su centro de trabajo y mantiene su PIPC cuando aplique.', 'El propietario coordina el PIPC del inmueble con los arrendatarios y solicita evidencia de brigadas, simulacros y revisiones.', 'Código Civil de la entidad: reparaciones necesarias a cargo del arrendador; las de deterioro por uso ordinario según contrato.']],
];
