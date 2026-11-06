// (?) for sjekkpunkter som viser til lov eller forskrift – bruker appens felles hjelpeboble med kildelenker.
import React from 'react';
import { Hjelp as Boble } from './Hjelp';
import { HJELP } from '../lib/lovhjelp';

export function Hjelp({ k }: { k?: string }) {
  const h = k ? HJELP[k] : undefined; if (!h) return null;
  return <Boble tittel={h.tittel} tekst={h.tekst + '\n\nVeiledende forklaring – sjekk alltid gjeldende regelverk.'} kilde={h.kilde} size={18} />;
}
