'use strict';
// Prefilter (card lentes-reales, section 8 step 2): marks as candidate the finding whose file is
// one of the files of a defect. It decides nothing: it only orders the grader's work, and it only
// looks at the file, so it cannot reveal the arm.
//
//   node tests/bench/revision/prefilter.js --experiment lentes|momento --batch <D1|7a|ui> --blind <blind/batch.json> --defects <defects dir> [--out <file>]
const fs = require('node:fs');
const path = require('node:path');
const { loadCases, parseArgs } = require('./lib');

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
// Two paths are the same file when one is a path suffix of the other (the plugin prefix varies).
function sameFile(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
}

function prefilter(findings, cards) {
  return findings.map((f) => ({
    code: f.code,
    candidates: cards.filter((c) => (c.files || []).some((file) => sameFile(f.file, file))).map((c) => c.id),
  }));
}

function batchDefects(cases, experiment, batch) {
  if (experiment === 'lentes') {
    const c = cases.lentes.cases.find((x) => x.id === batch);
    if (!c) throw new Error(`caso desconocido: ${batch}`);
    return c.defects;
  }
  if (!cases.momento.scope[batch]) throw new Error(`lote desconocido: ${batch}`);
  return cases.momento.scope[batch];
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.experiment || !a.batch || !a.blind || !a.defects) {
    process.stderr.write('uso: node prefilter.js --experiment lentes|momento --batch <id> --blind <file> --defects <dir> [--out <file>]\n');
    process.exit(2);
  }
  try {
    const ids = batchDefects(loadCases(), a.experiment, a.batch);
    const cards = ids.map((id) => JSON.parse(fs.readFileSync(path.join(a.defects, `${id}.json`), 'utf8')));
    const res = prefilter(JSON.parse(fs.readFileSync(a.blind, 'utf8')), cards);
    const text = `${JSON.stringify(res, null, 2)}\n`;
    if (a.out) fs.writeFileSync(a.out, text);
    else process.stdout.write(text);
    process.stderr.write(`prefilter: ${res.filter((r) => r.candidates.length).length} de ${res.length} hallazgos son candidatos\n`);
  } catch (e) {
    process.stderr.write(`prefilter: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { prefilter, sameFile, batchDefects };
