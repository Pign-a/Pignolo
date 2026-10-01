'use strict';
// Calificador de la prueba de brainstorm: cuántas de las decisiones posteriores conocidas
// (truth.json) aparecen tratadas en el spec. Una decisión cuenta como "tocada" si alguna
// línea del spec (renglón, viñeta o fila de tabla) tiene al menos una palabra de CADA grupo
// de `all`, comparadas completas (límite de palabra), sin mayúsculas ni tildes.
// Límite declarado (G11): esto solo dice que el tema está en el spec, no que el spec diga lo
// que el autor decidió. Las cifras publicadas en RESULTS-brainstorm.md se validaron A MANO
// (manual.json): resuelta igual que el autor, supuesto declarado, contraria o ausente.
//   node tests/bench/brainstorm/grade.js <spec.md>

const fs = require('node:fs');
const path = require('node:path');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Límite de palabra solo en el extremo de la palabra clave que sea carácter de palabra:
// `design.md` y `compare.html` coinciden; `real` no coincide dentro de `realizar`.
function hasWord(hay, kw) {
  const k = norm(kw);
  if (!k) return false;
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pre = /^\w/.test(k) ? '(?<!\\w)' : '';
  const post = /\w$/.test(k) ? '(?!\\w)' : '';
  return new RegExp(pre + esc + post).test(hay);
}

function gradeSpec(text, truth) {
  const lines = norm(text).split(/\r?\n/).filter((l) => l.trim());
  const touched = [];
  const evidence = {};
  for (const d of truth.decisions) {
    const hit = lines.find((line) => d.all.every((group) => group.some((kw) => hasWord(line, kw))));
    if (hit) { touched.push(d.id); evidence[d.id] = hit.trim().slice(0, 200); }
  }
  return { touched, missed: truth.decisions.map((d) => d.id).filter((id) => !touched.includes(id)), evidence };
}

if (require.main === module) {
  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'truth.json'), 'utf8'));
  const g = gradeSpec(fs.readFileSync(process.argv[2], 'utf8'), truth);
  process.stdout.write(`${JSON.stringify(g, null, 2)}\n`);
}

module.exports = { gradeSpec, hasWord, norm };
