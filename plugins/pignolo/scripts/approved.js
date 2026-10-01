#!/usr/bin/env node
'use strict';
// Aprobados visuales (R-12). Lo ejecuta solo el hilo principal; JSON por stdout.
//   save   --project <raíz> --flow <slug> --from <carpeta con el HTML> [--date AAAA-MM-DD]
//          exit 0 guardado, 1 rechazado (pantallas no autocontenidas o con datos), 2 uso o error
//   record --project <raíz> --path design/approved/<flujo> --quote-file <archivo> [--date AAAA-MM-DD]
//          exit 0 registrado, 1 no se pudo registrar, 2 uso o error
const fs = require('node:fs');
const path = require('node:path');
const { saveApproved, manifestSha, recordDecision, APPROVED_PATH } = require('../lib/approved');
const { readProjectConfig } = require('../lib/project-config');

const ALLOWED = { save: ['project', 'flow', 'from', 'date'], record: ['project', 'path', 'quote-file', 'date'] };

class Usage extends Error {}

function parse(argv) {
  const [cmd, ...rest] = argv;
  if (!ALLOWED[cmd]) throw new Usage('uso: approved.js save|record [opciones]');
  const o = {};
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (!a.startsWith('--') || !ALLOWED[cmd].includes(a.slice(2))) throw new Usage(`opción desconocida para ${cmd}: ${a}`);
    if (rest[i + 1] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = rest[i + 1];
    i += 1;
  }
  return { cmd, o };
}

const need = (o, ...keys) => {
  const missing = keys.filter((k) => !o[k]);
  if (missing.length) throw new Usage(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOf(o) {
  if (o.date === undefined) return today();
  const d = new Date(`${o.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || Number.isNaN(d.getTime()) || !d.toISOString().startsWith(o.date)) throw new Usage('--date debe ser una fecha real AAAA-MM-DD');
  return o.date;
}

const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);

function main(argv) {
  const { cmd, o } = parse(argv);
  if (cmd === 'save') {
    need(o, 'project', 'flow', 'from');
    const projectRoot = path.resolve(o.project);
    let piiPatterns = [];
    try { piiPatterns = readProjectConfig({ root: projectRoot }).piiPatterns; } catch (e) { throw new Usage(`project.md ilegible: ${e.message}`); }
    const r = saveApproved({ projectRoot, flow: o.flow, from: path.resolve(o.from), date: dateOf(o), piiPatterns });
    out(r);
    return r.ok ? 0 : 1;
  }
  need(o, 'project', 'path', 'quote-file');
  if (!APPROVED_PATH.test(o.path)) throw new Usage(`--path debe cumplir ${APPROVED_PATH}`);
  const projectRoot = path.resolve(o.project);
  let quote;
  try { quote = fs.readFileSync(o['quote-file'], 'utf8').trim(); } catch (e) { throw new Usage(`no se pudo leer --quote-file: ${e.message}`); }
  let sha;
  try { sha = manifestSha(projectRoot, o.path); } catch (e) { throw new Usage(`no se pudo leer el manifest de ${o.path}: ${e.message}`); }
  const r = recordDecision({ projectRoot, path: o.path, manifestSha256: sha, quote, date: dateOf(o) });
  out(r.error ? { ok: false, error: r.error } : { ok: true, ...r });
  return r.error ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`pignolo approved: ${e.message}\n`);
  process.exitCode = 2;
}
