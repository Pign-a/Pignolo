'use strict';
// Compara la línea `Frentes: a, b` de una salida de `validate` con lo esperado
// para un repo de juguete. Uso: node tests/evals/compare-fronts.js <fixture> <archivo>
const fs = require('node:fs');
const path = require('node:path');

const VALID = ['security', 'database', 'code', 'tests', 'hygiene', 'docs'];
const CAP = 5;

// Devuelve null si no hay línea; si no, el arreglo de ids (vacío si `Frentes:` solo).
function extractFronts(text) {
  const re = /^Frentes:(?: (.*))?$/gm;
  const src = String(text).replace(/\r/g, '');
  let last = null;
  let m;
  while ((m = re.exec(src)) !== null) last = m;
  if (!last) return null;
  const raw = (last[1] || '').trim();
  return raw === '' ? [] : raw.split(', ').map((s) => s.trim()).filter(Boolean);
}

function compareFronts(text, fixtureName, expected) {
  const got = extractFronts(text);
  if (got === null) return { ok: false, reason: 'sin línea de frentes' };
  const unknown = got.find((id) => !VALID.includes(id));
  if (unknown !== undefined) return { ok: false, reason: `id desconocido: ${unknown}` };
  if (got.length > CAP) return { ok: false, reason: 'supera el tope de 5' };
  const want = expected[fixtureName] || [];
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  if (missing.length || extra.length) {
    return { ok: false, reason: 'frentes distintos a los esperados', missing, extra };
  }
  return { ok: true };
}

module.exports = { extractFronts, compareFronts };

if (require.main === module) {
  const [fixture, file] = process.argv.slice(2);
  if (!fixture || !file) {
    console.error('Uso: node tests/evals/compare-fronts.js <fixture> <archivo>');
    process.exit(2);
  }
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fronts-expected.json'), 'utf8'));
  if (!(fixture in expected)) {
    console.error(`fixture desconocido: ${fixture}`);
    process.exit(2);
  }
  const result = compareFronts(fs.readFileSync(file, 'utf8'), fixture, expected);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
