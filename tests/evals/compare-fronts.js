'use strict';
// Compara la línea `Frentes: a, b` de una salida de `validate` con lo esperado
// para un repo de juguete. Uso: node tests/evals/compare-fronts.js <fixture> <archivo>
// Códigos de salida: 0 coincide, 1 no coincide, 2 uso o entrada inválidos (fixture o archivo
// inexistente, salida en UTF-16).
const fs = require('node:fs');
const path = require('node:path');

const VALID = ['security', 'database', 'code', 'tests', 'hygiene', 'docs'];
const CAP = 5;

// Convierte los bytes de una salida guardada en texto: quita el BOM de UTF-8 y rechaza UTF-16
// (la redirección `>` de PowerShell 5 guarda en UTF-16) en lugar de no encontrar la línea.
function decodeInput(buf) {
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
    throw new Error('la salida está en UTF-16; guardala como UTF-8');
  }
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

// Devuelve null si no hay línea; si no, el arreglo de ids (vacío si `Frentes:` solo).
function extractFronts(text) {
  const re = /^Frentes:(?: (.*))?$/gm;
  const src = String(text).replace(/^﻿/, '').replace(/\r/g, '');
  let last = null;
  let m;
  while ((m = re.exec(src)) !== null) last = m;
  if (!last) return null;
  const raw = (last[1] || '').trim();
  return raw === '' ? [] : raw.split(', ').map((s) => s.trim()).filter(Boolean);
}

function compareFronts(text, fixtureName, expected) {
  if (!Object.prototype.hasOwnProperty.call(expected, fixtureName)) {
    throw new Error(`fixture desconocido: ${fixtureName}`);
  }
  const got = extractFronts(text);
  if (got === null) return { ok: false, reason: 'sin línea de frentes' };
  const unknown = got.find((id) => !VALID.includes(id));
  if (unknown !== undefined) return { ok: false, reason: `id desconocido: ${unknown}` };
  const repeated = got.find((id, i) => got.indexOf(id) !== i);
  if (repeated !== undefined) return { ok: false, reason: `id repetido: ${repeated}` };
  if (got.length > CAP) return { ok: false, reason: 'supera el tope de 5' };
  const want = expected[fixtureName];
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  if (missing.length || extra.length) {
    return { ok: false, reason: 'frentes distintos a los esperados', missing, extra };
  }
  return { ok: true };
}

module.exports = { extractFronts, compareFronts, decodeInput };

if (require.main === module) {
  const [fixture, file] = process.argv.slice(2);
  if (!fixture || !file) {
    console.error('Uso: node tests/evals/compare-fronts.js <fixture> <archivo>');
    process.exit(2);
  }
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fronts-expected.json'), 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(expected, fixture)) {
    console.error(`fixture desconocido: ${fixture}`);
    process.exit(2);
  }
  let text;
  try {
    text = decodeInput(fs.readFileSync(file));
  } catch (e) {
    console.error(e.code === 'ENOENT' ? `no existe el archivo: ${file}` : e.message);
    process.exit(2);
  }
  const result = compareFronts(text, fixture, expected);
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
