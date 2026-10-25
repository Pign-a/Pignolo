// Une votos con la clave y resume por brazo. Descriptivo, sin estadística.
// Uso: node tally.mjs --votes a.json[,b.json] --key ka.json[,kb.json] [--control ARM] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const RATINGS = ['polish', 'clarity', 'keep'];

export function tally(votesList, keyList, control) {
  if (votesList.length !== keyList.length) throw new Error('--votes y --key deben tener la misma cantidad de archivos');
  const scenarios = [];
  votesList.forEach((votes, i) => {
    const key = keyList[i] && keyList[i].labels ? keyList[i].labels : keyList[i];
    const byArm = {};
    for (const [label, v] of Object.entries(votes.items)) {
      const k = key[label];
      if (!k || !k.arm) throw new Error(`La clave ${i + 1} no tiene la etiqueta ${label}`);
      (byArm[k.arm] ||= []).push({ label, v, rank: votes.ranking.indexOf(label) + 1 });
    }
    const arms = {};
    for (const [arm, rows] of Object.entries(byArm)) {
      const tags = {};
      for (const r of rows) for (const t of r.v.tags || []) tags[t] = (tags[t] || 0) + 1;
      const o = { n: rows.length, tags, rankMean: mean(rows.map((r) => r.rank)), firsts: rows.filter((r) => r.rank === 1).length };
      for (const c of RATINGS) o[c] = mean(rows.map((r) => r.v[c]));
      o.changesMean = mean(rows.map((r) => r.v.changes));
      o.changesMedian = median(rows.map((r) => r.v.changes));
      arms[arm] = o;
    }
    scenarios.push({ scenario: votes.scenario ?? `#${i + 1}`, items: Object.keys(votes.items).length, arms });
  });
  const armNames = [...new Set(scenarios.flatMap((s) => Object.keys(s.arms)))].sort();
  const overall = {};
  for (const arm of armNames) {
    const per = scenarios.map((s) => s.arms[arm]).filter(Boolean);
    const o = { scenarios: per.length, tags: {}, firsts: per.reduce((a, p) => a + p.firsts, 0) };
    for (const c of [...RATINGS, 'changesMean', 'changesMedian', 'rankMean']) o[c] = mean(per.map((p) => p[c]));
    for (const p of per) for (const [t, c] of Object.entries(p.tags)) o.tags[t] = (o.tags[t] || 0) + c;
    overall[arm] = o;
  }
  let paired = null;
  if (control) {
    paired = { control, perScenario: [], meanDiff: {} };
    for (const s of scenarios) {
      const c = s.arms[control];
      if (!c) continue;
      const diffs = {};
      for (const [arm, a] of Object.entries(s.arms)) if (arm !== control) diffs[arm] = a.changesMean - c.changesMean;
      paired.perScenario.push({ scenario: s.scenario, diffs });
    }
    for (const arm of armNames) {
      if (arm === control) continue;
      const d = paired.perScenario.map((p) => p.diffs[arm]).filter((x) => x !== undefined);
      paired.meanDiff[arm] = { n: d.length, mean: mean(d) };
    }
  }
  return { scenarios, overall, paired };
}

const f = (x) => (x === null || x === undefined ? '-' : (Math.round(x * 100) / 100).toString());

export function render(r) {
  const L = [];
  L.push('Aviso: n es pequeño; los números son descriptivos, no prueban diferencias.', '');
  for (const s of r.scenarios) {
    L.push(`Escenario ${s.scenario} (${s.items} opciones)`);
    for (const [arm, a] of Object.entries(s.arms).sort()) {
      L.push(`  ${arm} n=${a.n} pulida=${f(a.polish)} clara=${f(a.clarity)} conservar=${f(a.keep)} cambios(media/mediana)=${f(a.changesMean)}/${f(a.changesMedian)} puesto=${f(a.rankMean)} primeros=${a.firsts}`);
    }
  }
  L.push('', `Media sobre escenarios (unidad = escenario, ${r.scenarios.length})`);
  for (const [arm, a] of Object.entries(r.overall)) {
    L.push(`  ${arm} escenarios=${a.scenarios} pulida=${f(a.polish)} clara=${f(a.clarity)} conservar=${f(a.keep)} cambios(media/mediana)=${f(a.changesMean)}/${f(a.changesMedian)} puesto=${f(a.rankMean)} primeros=${a.firsts}`);
    const tg = Object.entries(a.tags).sort((x, y) => y[1] - x[1]).map(([t, c]) => `${t}=${c}`).join(', ');
    L.push(`    etiquetas (total): ${tg || '-'}`);
  }
  if (r.paired) {
    L.push('', `Diferencia en cambios pedidos, brazo menos control (${r.paired.control}); negativo = menos cambios`);
    for (const p of r.paired.perScenario) L.push(`  ${p.scenario}: ` + Object.entries(p.diffs).sort().map(([a, d]) => `${a}=${f(d)}`).join(' '));
    L.push('  media: ' + Object.entries(r.paired.meanDiff).sort().map(([a, d]) => `${a}=${f(d.mean)} (n=${d.n})`).join(' '));
  }
  return L.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const get = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const v = get('--votes'), k = get('--key');
  if (!v || !k) { console.error('Uso: node tally.mjs --votes a.json[,b.json] --key ka.json[,kb.json] [--control ARM] [--json]'); process.exit(2); }
  try {
    const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
    const r = tally(v.split(',').map(rd), k.split(',').map(rd), get('--control'));
    console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  } catch (e) { console.error('Error: ' + e.message); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
