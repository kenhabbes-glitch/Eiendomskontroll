import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreslaFraModell, typeForElement } from '../src/lib/modellForslag.ts';

test('systemtype ut fra IFC-klasse og navn', () => {
  assert.equal(typeForElement({ g: '1', k: 'IFCTRANSPORTELEMENT', n: 'Personheis 1' }), 'heis');
  assert.equal(typeForElement({ g: '2', k: 'IFCFLOWTERMINAL', n: 'Sprinklerhode K-factor 80' }), 'sprinkler');
  assert.equal(typeForElement({ g: '3', k: 'IFCDOOR', n: 'Enkel dør' }), '', 'vanlig dør er ikke et system');
  assert.equal(typeForElement({ g: '4', k: 'IFCDOOR', n: 'Branndør EI 30' }), 'branndorer');
  assert.equal(typeForElement({ g: '5', k: 'IFCALARM', n: 'Røykdetektor' }), 'brannalarm');
  assert.equal(typeForElement({ g: '6', k: 'IFCWALL', n: 'Yttervegg' }), '');
  assert.equal(typeForElement({ g: '7', k: 'IFCUNITARYEQUIPMENT', n: 'Luftbehandlingsaggregat LB01' }), 'ventilasjon');
});

test('grupperer per type, hopper over koblede objekter og teller etasjer', () => {
  const els = [{ g: 'a', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 0 }, { g: 'b', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 1 }, { g: 'c', k: 'IFCFLOWTERMINAL', n: 'Sprinkler', e: 1 }, { g: 'd', k: 'IFCTRANSPORTELEMENT', n: 'Heis', e: 0 }, { g: 'e', k: 'IFCWALL', n: 'Vegg', e: 0 }];
  const f = foreslaFraModell(els, new Set(['c']));
  assert.equal(f.length, 2);
  assert.equal(f[0].type, 'sprinkler'); assert.deepEqual(f[0].guider, ['a', 'b']); assert.deepEqual(f[0].etasjer, [0, 1]);
  assert.equal(f[1].type, 'heis');
});

// @ts-ignore – bygges av «pretest»
import { ifcFraModeller, ifcTilTabell, lesIfc } from './.bygg/ifc.mjs';
import { KOMP } from '../src/lib/catalog.ts';
test('opplastede 3D-modeller gir en IFC-modell som systemimporten kan bruke', () => {
  const ark = { etasjer: [{ navn: '1. etasje' }, { navn: '2. etasje' }], elementer: [
    { g: 'a', k: 'IFCDOOR', n: 'Enkel dør', t: '', e: 0 }, { g: 'b', k: 'IFCWINDOW', n: 'Vindu', t: '', e: 1 }, { g: 'c', k: 'IFCWALL', n: 'Vegg', t: '', e: 0 },
    { g: 's', k: 'IFCSTAIR', n: 'Trapp', t: '', e: 0 }, { g: 'f', k: 'IFCSTAIRFLIGHT', n: 'Løp', t: '', e: 0 }], egenskaper: { a: { ns: '244', egenskaper: { Manufacturer: 'Hörmann' } } } };
  const riv = { etasjer: [{ navn: '1. etasje' }], elementer: [{ g: 'a', k: 'IFCDOOR', n: 'Samme GUID igjen', t: '', e: 0 }, { g: 'v', k: 'IFCFAN', n: 'Vifte', t: '', e: 0 }] };
  const m = ifcFraModeller([{ filnavn: 'ARK.ifc', hode: ark }, { filnavn: 'RIV.ifc', hode: riv }]);
  assert.deepEqual(m.elementer.map(e => e.guid).sort(), ['a', 'b', 's', 'v'], 'vegg og trappeløp skal ikke med, og samme GUID bare én gang');
  assert.equal(m.elementer.find(e => e.guid === 'a')!.fabrikat, 'Hörmann');
  assert.equal(m.filnavn, '2 opplastede IFC-filer');
  const t = ifcTilTabell(m, new Set(['vindu', 'dor', 'trapp', 'teknisk']), true);
  assert.ok(t.R.length > 1, 'importtabellen skal ha rader');
});

const STEP = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('test.ifc','2026-01-01T00:00:00',(''),(''),'x','TestProgram','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCBUILDING('b1',$,'Testbygg',$,$,$,$,$,$,$,$,$);
#2=IFCBUILDINGSTOREY('s1',$,'1. etasje',$,$,$,$,$,$,0.);
#3=IFCBUILDINGSTOREY('s2',$,'2. etasje',$,$,$,$,$,$,3.);
#4=IFCSPACE('r1',$,'Rom 201',$,$,$,$,$,$,$,$);
#10=IFCDOOR('d1',$,'Enkel dør',$,$,$,$,'T1',$,$,$,$);
#11=IFCDOOR('d2',$,'Branndør EI 30',$,$,$,$,'',$,$,$,$);
#12=IFCWINDOW('w1',$,'Vindu i rom',$,$,$,$,'',$,$,$,$);
#13=IFCFAN('f1',$,'Vifte LB01',$,$,$,$,'=360.001-VIF001',$,$);
#14=IFCSTAIR('t1',$,'Trapp',$,$,$,$,'',$,$,$,$);
#15=IFCSTAIRFLIGHT('t2',$,'Løp 1',$,$,$,$,'',$,$,$,$,$);
#20=IFCRELCONTAINEDINSPATIALSTRUCTURE('c1',$,$,$,(#10,#13),#2);
#21=IFCRELAGGREGATES('a1',$,$,$,#3,(#4));
#22=IFCRELCONTAINEDINSPATIALSTRUCTURE('c2',$,$,$,(#12),#4);
#23=IFCRELCONTAINEDINSPATIALSTRUCTURE('c3',$,$,$,(#11,#14),#3);
#24=IFCRELAGGREGATES('a2',$,$,$,#14,(#15));
ENDSEC;
END-ISO-10303-21;
`;
test('IFC-leseren finner etasje også for objekter i rom og delobjekter, og TFM-merking', async () => {
  const m = await lesIfc(new File([STEP], 'test.ifc'));
  const et = (g: string) => m.elementer.find(e => e.guid === g)?.etasje;
  assert.equal(et('d1'), '1. etasje'); assert.equal(et('d2'), '2. etasje');
  assert.equal(et('w1'), '2. etasje', 'vindu i rom i 2. etasje');
  assert.equal(et('t2'), '2. etasje', 'trappeløp arver etasjen fra trappen');
  assert.equal(m.elementer.find(e => e.guid === 'f1')?.tfm?.sys, '360');
  assert.equal(m.elementer.find(e => e.guid === 't2')?.forelder, 't1');
});

test('importtabellen sorterer tekniske komponenter i riktig system og tar med elektro- og kjøleutstyr', () => {
  const el = (g: string, k: string, n: string, e = '1. etasje') => ({ klasse: k, guid: g, navn: n, type: '', etasje: e, tag: '', ns: '', mengder: {}, egenskaper: {} });
  const m = { filnavn: 'x.ifc', schema: 'IFC4', program: '', byggNavn: '', etasjer: ['1. etasje', '2. etasje'], tellinger: {}, elementer: [
    el('h1', 'IFCTRANSPORTELEMENT', 'Personheis 1'), el('h2', 'IFCTRANSPORTELEMENT', 'Personheis 2', '2. etasje'),
    el('s1', 'IFCFIRESUPPRESSIONTERMINAL', 'Sprinklerhode', '1. etasje'), el('s2', 'IFCFIRESUPPRESSIONTERMINAL', 'Sprinklerhode', '2. etasje'),
    el('v1', 'IFCUNITARYEQUIPMENT', 'Luftbehandlingsaggregat LB01'), el('p1', 'IFCPUMP', 'Sirkulasjonspumpe P1'),
    el('t1', 'IFCTRANSFORMER', 'Transformator T1'), el('b1', 'IFCSWITCHINGDEVICE', 'Hovedbryter'), el('k1', 'IFCCOMPRESSOR', 'Kompressor K1'), el('o1', 'IFCOUTLET', 'Stikkontakt') ] };
  const t = ifcTilTabell(m, new Set(['teknisk']), true);
  const navn = t.R.slice(1).map(r => r[0]);
  assert.ok(navn.some(n => /heis/i.test(n)) && t.R.slice(1).filter(r => /heis/i.test(r[0])).length === 1, 'heisene i begge etasjer skal i ett system: ' + navn.join(' | '));
  const heis = Object.entries(t.typer).find(([, v]) => v === 'heis'); assert.ok(heis, 'type heis'); assert.equal(t.komp[+heis![0]].length, 2);
  assert.ok(Object.values(t.typer).includes('sprinkler') && Object.values(t.typer).includes('ventilasjon'));
  const rest = Object.entries(t.komp).filter(([r]) => !t.typer[+r]).flatMap(([, k]) => k.map(x => x.guid)).sort();
  assert.deepEqual(rest, ['k1'], 'bare det vi ikke kjenner igjen (kompressor) står uten type');
  const typeAv = (g: string) => t.typer[+Object.entries(t.komp).find(([, k]) => k.some(x => x.guid === g))![0]];
  assert.equal(typeAv('p1'), 'pumper'); assert.equal(typeAv('t1'), 'eltavle'); assert.equal(typeAv('b1'), 'eltavle');
  assert.equal(Object.values(t.komp).flat().some(k => k.guid === 'o1'), false, 'småutstyr er ikke valgt som standard');
  assert.ok(ifcTilTabell(m, new Set(['elsmaa']), true).R.length === 2, 'småutstyr kan velges');
});

test('bygningsdeler får egen katalogtype i stedet for «Annet»', () => {
  const el = (g: string, k: string, n: string, extra: any = {}) => ({ klasse: k, guid: g, navn: n, type: '', etasje: '1. etasje', tag: '', ns: '', mengder: {}, egenskaper: {}, ...extra });
  const m = { filnavn: 'x.ifc', schema: 'IFC4', program: '', byggNavn: '', etasjer: ['1. etasje'], tellinger: {}, elementer: [
    el('d1', 'IFCDOOR', 'Dør 1'), el('tr', 'IFCSTAIR', 'Trapp A'), el('r1', 'IFCRAILING', 'Rekkverk'), el('c1', 'IFCCOVERING', 'Himling'), el('f1', 'IFCCURTAINWALL', 'Fasade'), el('m1', 'IFCFURNISHINGELEMENT', 'Skap'),
    el('x1', 'IFCBUILDINGELEMENTPROXY', 'Servant 2'), el('x2', 'IFCBUILDINGELEMENTPROXY', 'Ukjent greie') ] };
  const t = ifcTilTabell(m, new Set(['dor', 'trapp', 'rekkverk', 'himling', 'fasade', 'innredning', 'annet']), true);
  const typeAv = (g: string) => t.typer[+Object.entries(t.komp).find(([, k]) => k.some(x => x.guid === g))![0]];
  assert.deepEqual(['d1', 'tr', 'r1', 'c1', 'f1', 'm1', 'x1'].map(typeAv), ['innvdorer', 'trapp', 'rekkverk', 'himling', 'glassfasade', 'fastinv', 'sanitarutstyr']);
  assert.ok(!typeAv('x2'), 'ukjent proxy står uten type så brukeren velger selv');
  for (const t2 of Object.values(t.typer).filter(Boolean)) assert.ok(KOMP[t2], 'typen finnes i katalogen: ' + t2);
});
