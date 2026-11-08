// Signaturfelt: tegn signaturen med finger, penn eller mus. Gir PNG som data-URL.
import React, { useEffect, useRef, useState } from 'react';
import { tt } from '../lib/i18n';

export function SignaturFelt({ onChange, hoyde = 150 }: { onChange: (png: string) => void; hoyde?: number }) {
  const cv = useRef<HTMLCanvasElement>(null); const tegner = useRef(false); const [tom, setTom] = useState(true);
  useEffect(() => { const c = cv.current!; const r = c.getBoundingClientRect(); const d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = hoyde * d; const g = c.getContext('2d')!; g.scale(d, d); g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#1d2521'; }, [hoyde]);
  const p = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ut = () => { const c = cv.current!; // beskjær og skaler ned til en liten PNG
    const o = document.createElement('canvas'); const s = Math.min(1, 600 / c.width); o.width = Math.round(c.width * s); o.height = Math.round(c.height * s); o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height); onChange(o.toDataURL('image/png')); };
  return <div>
    <canvas ref={cv} style={{ width: '100%', height: hoyde, border: '1px dashed var(--line2)', borderRadius: 8, background: '#fff', touchAction: 'none', display: 'block' }} aria-label={tt("Signaturfelt – tegn signaturen her")}
      onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); tegner.current = true; const g = cv.current!.getContext('2d')!; const [x, y] = p(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + .1, y + .1); g.stroke(); }}
      onPointerMove={e => { if (!tegner.current) return; const g = cv.current!.getContext('2d')!; const [x, y] = p(e); g.lineTo(x, y); g.stroke(); }}
      onPointerUp={() => { if (!tegner.current) return; tegner.current = false; setTom(false); ut(); }} />
    <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span>{tom ? tt("Tegn signaturen med finger, penn eller mus") : tt("Signatur registrert")}</span>
      <button type="button" className="btn sm ghost" onClick={() => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setTom(true); onChange(''); }}>{tt("Tøm")}</button></div>
  </div>;
}
