#!/usr/bin/env node
'use strict';
// Presentación (R-9). De lectura: la puede correr cualquiera. JSON por stdout.
//   decide --cwd <dir> [--tool-available] [--design-available]
//          imprime { mode, canvas, formats: { simple, ui, infra, decision }, notice? }
//   check --html <archivo> [--options-file <json>] [--cwd <dir>]
//          exit 0 si es publicable, 1 con los problemas (nunca repite el dato), 2 uso
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
const { readProjectConfig } = require('../lib/project-config');
const { readConfig } = require('../lib/profiles');
const pr = require('../lib/present');

const PLUGIN_ROOT = path.join(__dirname, '..');

class Usage extends Error {}

function parse(argv) {
  const [verb, ...rest] = argv;
  const spec = { decide: { value: ['cwd'], bool: ['tool-available', 'design-available'] }, check: { value: ['html', 'options-file', 'cwd'], bool: [] } }[verb];
  if (!spec) throw new Usage('uso: present.js decide|check [opciones]');
  const o = {};
  for (let i = 0; i < rest.length; i += 1) {
    const name = rest[i].startsWith('--') ? rest[i].slice(2) : null;
    if (name && spec.bool.includes(name)) o[name] = true;
    else if (name && spec.value.includes(name)) {
      i += 1;
      if (rest[i] === undefined) throw new Usage(`--${name} necesita un valor`);
      o[name] = rest[i];
    } else throw new Usage(`opción desconocida para ${verb}: ${rest[i]}`);
  }
  return { verb, o };
}

const out = (v) => process.stdout.write(`${JSON.stringify(v)}\n`);

function projectConfigOf(cwd) {
  try { return readProjectConfig({ root: mainRoot(cwd) }); } catch (e) { throw new Usage(`project.md ilegible: ${e.message}`); }
}

function main(argv) {
  const { verb, o } = parse(argv);
  const cwd = path.resolve(o.cwd || process.cwd());
  const projectConfig = projectConfigOf(cwd);
  if (verb === 'decide') {
    let userConfig = {};
    try { userConfig = readConfig(); } catch (_) { /* config de usuario ilegible: se usan los defaults */ }
    const pres = pr.resolvePresentation({ userConfig, projectConfig, artifactToolAvailable: Boolean(o['tool-available']) });
    const formats = {};
    for (const f of pr.FORMATS) formats[f] = pr.templateApproved({ pluginRoot: PLUGIN_ROOT, format: f }).approved;
    out({ ...pres, canvas: pr.canvasAllowed({ projectConfig, designTypeAvailable: Boolean(o['design-available']) }), formats });
    return 0;
  }
  if (!o.html) throw new Usage('falta --html');
  let html;
  try { html = fs.readFileSync(o.html, 'utf8'); } catch (e) { throw new Usage(`no se pudo leer --html: ${e.message}`); }
  const problems = pr.scanPublishable(html, { piiPatterns: projectConfig.piiPatterns }).map((p) => ({ problem: p.kind, match: p.match }));
  if (o['options-file']) {
    let opts;
    try { opts = JSON.parse(fs.readFileSync(o['options-file'], 'utf8')); } catch (e) { throw new Usage(`no se pudo leer --options-file: ${e.message}`); }
    const s = pr.sameOptions(opts, html);
    if (!s.same) problems.push({ problem: 'options-differ', extra: s.extra, missing: s.missing, changed: s.changed });
  }
  out({ ok: problems.length === 0, problems });
  return problems.length ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`pignolo present: ${e.message}\n`);
  process.exitCode = 2;
}
