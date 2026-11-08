const d=require('../../src/i18n/es-MX.json');
const R=[
[/\b([Rr])enta bruta\b/g,(m,a)=>(a==='R'?'A':'a')+'lquiler bruto'],[/\b([Rr])enta neta\b/g,(m,a)=>(a==='R'?'A':'a')+'lquiler neto'],
[/\brenta todo\b/g,'alquila todo'],[/\brentan\b/g,'alquilan'],[/\bde la (renta|alquiler)\b/g,'del alquiler'],[/\ba (alquiler|renta) de mercado\b/g,'al precio de mercado'],[/\b([Ff])alta la renta\b/g,'$1alta el alquiler'],[/\bla renta\b/g,'el alquiler'],[/\bLa renta\b/g,'El alquiler'],
[/\bRenta\b/g,'Alquiler'],[/\brenta\b/g,'alquiler'],
[/\bcelulares\b/g,'móviles'],[/\bcelular\b/g,'móvil'],[/\bCelular\b/g,'Móvil'],
[/\belevadora\b/g,'elevadora'],[/\bElevadores\b/g,'Ascensores'],[/\belevadores\b/g,'ascensores'],[/\bElevador\b/g,'Ascensor'],[/\belevador\b/g,'ascensor'],
[/\bregaderas\b/g,'duchas'],[/\bRegaderas\b/g,'Duchas'],[/\bregadera\b/g,'ducha'],
[/\bEstacionamiento\b/g,'Aparcamiento'],[/\bestacionamiento\b/g,'aparcamiento'],
[/\bplomería\b/g,'fontanería'],[/\bdrenaje\b/g,'saneamiento'],[/\bBodega\b/g,'Almacén'],[/\bbodega\b/g,'almacén'],
[/\bapagadores\b/g,'interruptores'],[/\bContactos, apagadores\b/g,'Enchufes, interruptores'],[/\bContactos, interruptores\b/g,'Enchufes, interruptores'],
[/\bsala de juntas\b/gi,'sala de reuniones'],[/\bavalúo\b/g,'tasación'],[/\bvaluador certificado\b/g,'tasador homologado'],[/\btrampa de grasa\b/g,'separador de grasas'],[/\bTrampa de grasa\b/g,'Separador de grasas'],
[/\bAgregar\b/g,'Añadir'],[/\bagregar\b/g,'añadir'],[/\bAgregue\b/g,'Añada'],[/\bagregue\b/g,'añada'],[/\bAgrega\b/g,'Añade'],[/\bagrega\b/g,'añade'],[/\bagregad([oa]s?)\b/g,'añadid$1'],[/\bAgregad([oa]s?)\b/g,'Añadid$1'],[/\bagregan\b/g,'añaden'],[/\bagregó\b/g,'añadió'],
[/\bcomputadora\b/g,'ordenador'],[/\bde la alquiler\b/g,'del alquiler'],[/\bla alquiler\b/g,'el alquiler'],[/\bplaticar\b/g,'hablar'],[/\bchecar\b/g,'comprobar'],
];
const o={};let n=0;for(const[k,v0] of Object.entries(d)){let v=v0;for(const[a,b] of R)v=v.replace(a,b);if(v!==v0)n++;o[k]=v;}
o['Avvik']=d['Avvik'];
require('fs').writeFileSync(require('path').join(__dirname,'../../src/i18n/es-ES.json'),JSON.stringify(o));console.log('endret',n);
