const fs=require('fs');const K=require(process.env.KEYS||'./keys.json');const lang=process.argv[2],out_=process.argv[3];const out={};const seen=new Set();const feil=[];
for(const f of fs.readdirSync(lang).sort()){for(const line of fs.readFileSync(lang+'/'+f,'utf8').split('\n')){const i=line.indexOf('\t');if(i<0)continue;const n=+line.slice(0,i);let v=line.slice(i+1).replace(/\\n/g,'\n');const k=K[n];if(k===undefined){feil.push('idx '+n);continue;}seen.add(n);
 const tl=k.match(/\s*$/)[0],ld=k.match(/^\s*/)[0];v=v.trim()?v:v; if(tl&&!/\s$/.test(v))v=v+tl; if(ld&&!/^\s/.test(v))v=ld+v; if(!tl)v=v.replace(/\s+$/,''); if(!ld)v=v.replace(/^\s+/,'');
 const ph=s=>[...new Set(s.match(/\{\d+\}/g)||[])].sort().join();if(ph(k)!==ph(v))feil.push(n+' ph: '+k+' => '+v);
 if(v!==k)out[k]=v;}}
const m=K.map((_,i)=>i).filter(i=>!seen.has(i));console.log(lang,'oversatt',Object.keys(out).length,'mangler',m.length,m.slice(0,30).join(','));console.log(feil.join('\n'));
try{const old=JSON.parse(fs.readFileSync(out_,"utf8"));const ks=new Set(K);for(const[k,v] of Object.entries(old))if(!ks.has(k)&&!(k in out))out[k]=v;}catch{}
fs.writeFileSync(out_,JSON.stringify(out));
