// Construye vote.html (autocontenida, sin red) a partir de <pack>/pack.json.
// Uso: node tests/evals/ui-vote/build.mjs --pack <carpeta> [--out <archivo>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CRITERIA = [
  ['polish', 'Se ve pulida'],
  ['clarity', 'La acción principal es clara'],
  ['keep', 'La conservaría con pocos cambios'],
];
export const TAGS = ['jerarquía de acciones', 'jerarquía de texto', 'propósito del panel', 'estados hover/foco', 'controles nativos', 'sobrecarga', 'espaciado', 'otro'];

export function readPack(dir) {
  const file = path.join(dir, 'pack.json');
  if (!fs.existsSync(file)) throw new Error(`No existe pack.json en ${dir}`);
  let pack;
  try { pack = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`pack.json no es JSON válido: ${e.message}`); }
  if (!pack || typeof pack.scenario !== 'string' || !pack.scenario) throw new Error('pack.json: falta "scenario"');
  // The harness's uipack writes { options: [{ label, screens: [{ html, shots: [{ width, file }] }] }] }: use the first screen of each option.
  if (!Array.isArray(pack.items) && Array.isArray(pack.options)) {
    pack.items = pack.options.map((o) => {
      const sc = (o.screens || [])[0] || {};
      const shot = (w) => ((sc.shots || []).find((x) => x.width === w) || {}).file;
      return { label: o.label, files: { shot1280: shot(1280), shot390: shot(390), html: sc.html } };
    });
  }
  if (!Array.isArray(pack.items) || pack.items.length < 1) throw new Error('pack.json: "items" debe ser una lista no vacía');
  const seen = new Set();
  for (const it of pack.items) {
    if (!it || typeof it.label !== 'string' || !it.label) throw new Error('pack.json: un item no tiene "label"');
    if (seen.has(it.label)) throw new Error(`pack.json: etiqueta repetida ${it.label}`);
    seen.add(it.label);
    const f = it.files;
    if (!f || typeof f.shot1280 !== 'string' || typeof f.shot390 !== 'string' || typeof f.html !== 'string') {
      throw new Error(`pack.json: el item ${it.label} necesita files.shot1280, files.shot390 y files.html`);
    }
  }
  return pack;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

export function buildHtml(pack, relPrefix = '') {
  const data = {
    scenario: pack.scenario,
    criteria: CRITERIA,
    tags: TAGS,
    items: pack.items.map((it) => ({
      label: it.label,
      shot1280: relPrefix + it.files.shot1280,
      shot390: relPrefix + it.files.shot390,
      html: relPrefix + it.files.html,
    })),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
  return TEMPLATE.replace('__TITLE__', `Votación a ciegas - ${esc(pack.scenario)}`).replace('__DATA__', () => json);
}

const TEMPLATE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#fafafa;--fg:#1a1a1a;--mut:#666;--line:#d8d8d8;--card:#fff;--acc:#1f4fd8;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--mut:#999;--line:#333;--card:#1e1e1e;--acc:#8ab0ff;--err:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
header{padding:16px 20px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0 0 4px}header p{margin:0;color:var(--mut)}
main{display:flex;gap:16px;padding:16px 20px;overflow-x:auto;align-items:flex-start}
.item{flex:0 0 440px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
.item h2{font-size:16px;margin:0 0 8px}.bar{display:flex;gap:8px;align-items:center;margin-bottom:8px}
button,select,input,textarea{font:inherit;color:inherit}
button{background:transparent;border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
button[aria-pressed=true]{border-color:var(--acc);color:var(--acc)}
.shot{border:1px solid var(--line);border-radius:6px;max-height:520px;overflow:auto;margin-bottom:10px}
.shot img{display:block;width:100%}.shot.narrow img{width:390px;max-width:100%;margin:0 auto}
a{color:var(--acc)}fieldset{border:0;padding:0;margin:8px 0}legend{font-weight:600;padding:0}
.rate label{margin-right:8px;white-space:nowrap}.tags label{display:block}
textarea{width:100%;min-height:50px;background:transparent;border:1px solid var(--line);border-radius:6px;padding:6px}
input[type=number],select{background:transparent;border:1px solid var(--line);border-radius:6px;padding:3px 6px;width:70px}
section.final{padding:0 20px 24px}.final .row{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:8px 0}
#problems{color:var(--err);margin:8px 0;padding-left:18px}#ok{color:var(--mut)}
</style></head><body>
<header><h1 id="ttl"></h1><p>Votá a ciegas: no se muestra qué generó cada pantalla. Tu avance queda guardado en este navegador.</p></header>
<main id="items"></main>
<section class="final"><h2>Ranking final</h2><p>Asigná un puesto distinto a cada opción (1 = la mejor).</p>
<div class="row" id="ranks"></div>
<ul id="problems"></ul><div class="row"><button id="export" type="button">Exportar votos</button><span id="ok"></span></div></section>
<script id="pack" type="application/json">__DATA__</script>
<script>
(function(){
var PACK=JSON.parse(document.getElementById('pack').textContent);
var KEY='ui-vote:'+PACK.scenario;
var state={items:{},ranks:{},wide:{}};
try{var s=localStorage.getItem(KEY);if(s){var p=JSON.parse(s);if(p&&p.items)state=p;}}catch(e){}
state.wide=state.wide||{};state.ranks=state.ranks||{};
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
function it(l){return state.items[l]||(state.items[l]={polish:null,clarity:null,keep:null,changes:null,tags:[],note:''});}
function el(t,a,c){var e=document.createElement(t);for(var k in (a||{}))e.setAttribute(k,a[k]);(c||[]).forEach(function(x){e.appendChild(typeof x==='string'?document.createTextNode(x):x);});return e;}
function enc(p){return p.split('/').map(encodeURIComponent).join('/');}
document.getElementById('ttl').textContent='Votación a ciegas - escenario '+PACK.scenario;
var root=document.getElementById('items');
PACK.items.forEach(function(item){
 var v=it(item.label),card=el('div',{'class':'item'});
 card.appendChild(el('h2',{},['Opción '+item.label]));
 var shot=el('div',{'class':'shot'}),img=el('img',{alt:'Captura de la opción '+item.label});
 shot.appendChild(img);
 var b1=el('button',{type:'button'},['1280']),b2=el('button',{type:'button'},['390']);
 function show(){var w=state.wide[item.label]!==false;img.src=enc(w?item.shot1280:item.shot390);shot.className='shot'+(w?'':' narrow');b1.setAttribute('aria-pressed',String(w));b2.setAttribute('aria-pressed',String(!w));}
 b1.onclick=function(){state.wide[item.label]=true;save();show();};b2.onclick=function(){state.wide[item.label]=false;save();show();};
 var a=el('a',{href:enc(item.html),target:'_blank',rel:'noopener'},['Abrir HTML']);
 card.appendChild(el('div',{'class':'bar'},[b1,b2,a]));card.appendChild(shot);show();
 PACK.criteria.forEach(function(c){
  var fs=el('fieldset',{'class':'rate'},[el('legend',{},[c[1]])]);
  for(var n=1;n<=5;n++){(function(n){var r=el('input',{type:'radio',name:c[0]+'-'+item.label});r.checked=v[c[0]]===n;r.onchange=function(){v[c[0]]=n;save();check();};fs.appendChild(el('label',{},[r,' '+n]));})(n);}
  card.appendChild(fs);});
 var num=el('input',{type:'number',min:'0',step:'1'});if(v.changes!==null)num.value=v.changes;
 num.oninput=function(){v.changes=num.value===''?null:Number(num.value);save();check();};
 card.appendChild(el('fieldset',{},[el('legend',{},['Cantidad de cambios que pediría']),num]));
 var tg=el('fieldset',{'class':'tags'},[el('legend',{},['Tipo de cambios'])]);
 PACK.tags.forEach(function(t){var c=el('input',{type:'checkbox'});c.checked=v.tags.indexOf(t)>=0;c.onchange=function(){v.tags=v.tags.filter(function(x){return x!==t;});if(c.checked)v.tags.push(t);save();};tg.appendChild(el('label',{},[c,' '+t]));});
 card.appendChild(tg);
 var note=el('textarea',{placeholder:'Nota libre'});note.value=v.note||'';note.oninput=function(){v.note=note.value;save();};
 card.appendChild(note);root.appendChild(card);});
var rk=document.getElementById('ranks'),n=PACK.items.length;
PACK.items.forEach(function(item){
 var s=el('select',{},[el('option',{value:''},['-'])]);
 for(var i=1;i<=n;i++)s.appendChild(el('option',{value:String(i)},[String(i)]));
 s.value=state.ranks[item.label]?String(state.ranks[item.label]):'';
 s.onchange=function(){state.ranks[item.label]=s.value===''?null:Number(s.value);save();check();};
 rk.appendChild(el('label',{},['Opción '+item.label+' ',s]));});
function problems(){
 var out=[];
 PACK.items.forEach(function(item){var v=it(item.label);
  PACK.criteria.forEach(function(c){if(!(v[c[0]]>=1&&v[c[0]]<=5))out.push('Opción '+item.label+': falta la puntuación "'+c[1]+'".');});
  if(v.changes===null||!Number.isInteger(v.changes)||v.changes<0)out.push('Opción '+item.label+': falta la cantidad de cambios (un entero, 0 o más).');});
 var seen={};
 PACK.items.forEach(function(item){var r=state.ranks[item.label];
  if(!r)out.push('Opción '+item.label+': falta el puesto en el ranking.');
  else if(seen[r])out.push('Las opciones '+seen[r]+' y '+item.label+' tienen el mismo puesto '+r+'.');else seen[r]=item.label;});
 return out;}
var ul=document.getElementById('problems'),ok=document.getElementById('ok');
function check(){var p=problems();ul.textContent='';p.forEach(function(m){ul.appendChild(el('li',{},[m]));});ok.textContent=p.length?'':'Todo completo.';return p;}
check();
document.getElementById('export').onclick=function(){
 var p=check();if(p.length)return;
 var items={};PACK.items.forEach(function(x){var v=it(x.label);items[x.label]={polish:v.polish,clarity:v.clarity,keep:v.keep,changes:v.changes,tags:v.tags.slice(),note:v.note||''};});
 var ranking=PACK.items.map(function(x){return x.label;}).sort(function(a,b){return state.ranks[a]-state.ranks[b];});
 var out={scenario:PACK.scenario,votedAt:new Date().toISOString(),items:items,ranking:ranking};
 var blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
 var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='votes-'+PACK.scenario+'.json';document.body.appendChild(a);a.click();a.remove();};
})();
</script></body></html>
`;

function main() {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const pack = get('--pack');
  if (!pack) { console.error('Uso: node build.mjs --pack <carpeta> [--out <archivo>]'); process.exit(2); }
  try {
    const dir = path.resolve(pack);
    const data = readPack(dir);
    const out = path.resolve(get('--out') || path.join(dir, 'vote.html'));
    let rel = path.relative(path.dirname(out), dir).split(path.sep).join('/');
    rel = rel ? rel + '/' : '';
    fs.writeFileSync(out, buildHtml(data, rel));
    console.log(`Escrito ${out} (${data.items.length} opciones)`);
  } catch (e) { console.error('Error: ' + e.message); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
