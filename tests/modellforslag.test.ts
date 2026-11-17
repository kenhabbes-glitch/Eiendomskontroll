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

import { ifcFraModeller, ifcTilTabell } from '../src/lib/ifc.ts';
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

import { lesIfc } from '../src/lib/ifc.ts';
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
