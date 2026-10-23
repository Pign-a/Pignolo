#!/usr/bin/env node
// Measurement harness for Pignolo 2 vs superpowers. See README.md.
//   node run.mjs <prepare|run|accept|row|clean|blind|unblind|summary> [options] [--config <path>]
import fs from 'node:fs';
import { loadConfig, DEFAULT_CONFIG, DEFAULT_CSV, DEFAULT_GRADES, DEFAULT_EXPERIMENT, DEFAULT_WEIGHTS, DEFAULT_MODEL_FACTOR } from './config.mjs';
import { prepare } from './prepare.mjs';
import { runTask } from './execute.mjs';
import { acceptRun } from './accept.mjs';
import { appendRow } from './row.mjs';
import { blind, unblind } from './blind.mjs';
import { cleanRun } from './clean.mjs';
import { summarize, formatSummary, rowsFromCsv } from './summary.mjs';

const FLAGS = new Set(['force', 'allow-leaks', 'include-contaminated', 'json']);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    if (FLAGS.has(k)) out[k] = true;
    else {
      if (i + 1 >= argv.length) throw new Error(`falta el valor de --${k}`);
      i += 1;
      out[k] = argv[i];
    }
  }
  return out;
}

const run = (o) => ({ task: o.task, arm: o.arm, rep: o.rep });
const need = (o, ...ks) => { for (const k of ks) if (o[k] === undefined) throw new Error(`falta --${k}`); };
const print = (x) => console.log(JSON.stringify(x, null, 2));
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cmd = o._[0];
  const cfgPath = o.config || DEFAULT_CONFIG;
  if (!['prepare', 'run', 'accept', 'row', 'clean', 'blind', 'unblind', 'summary'].includes(cmd)) {
    throw new Error('uso: run.mjs <prepare|run|accept|row|clean|blind|unblind|summary> [opciones] [--config <ruta>]');
  }

  if (cmd === 'summary') {
    let cfg = null;
    try { cfg = loadConfig(cfgPath); } catch (e) { if (o.config) throw e; }
    const csv = o.csv || (cfg && cfg.csvPath) || DEFAULT_CSV;
    const gradesPath = o.grades || (cfg && cfg.gradesPath) || DEFAULT_GRADES;
    const kinds = {};
    if (cfg) for (const [id, t] of Object.entries(cfg.tasks || {})) if (t && t.kind) kinds[id] = t.kind;
    for (const id of list(o.medium)) kinds[id] = 'medium';
    for (const id of list(o.small)) kinds[id] = 'small';
    let rows;
    try { rows = rowsFromCsv(fs.readFileSync(csv, 'utf8')); } catch { throw new Error(`no se pudo leer el CSV ${csv}`); }
    let grades = [];
    try { grades = JSON.parse(fs.readFileSync(gradesPath, 'utf8')); } catch { /* optional */ }
    const res = summarize(rows, {
      kinds, grades, includeContaminated: Boolean(o['include-contaminated']),
      experiment: o.experiment || (cfg && cfg.experiment) || DEFAULT_EXPERIMENT,
      weights: (cfg && cfg.weights) || DEFAULT_WEIGHTS, modelFactor: (cfg && cfg.modelFactor) || DEFAULT_MODEL_FACTOR,
    });
    console.log(o.json ? JSON.stringify(res, null, 2) : formatSummary(res));
    return;
  }

  const cfg = loadConfig(cfgPath);
  // Calibration runs use another experiment name (for example pignolo2-calib): same CSV, never mixed in the real summary.
  if (o.experiment) cfg.experiment = o.experiment;
  if (cmd === 'prepare') { need(o, 'task', 'arm', 'rep'); print(await prepare(cfg, run(o))); }
  else if (cmd === 'run') { need(o, 'task', 'arm', 'rep'); print(await runTask(cfg, run(o))); }
  else if (cmd === 'accept') { need(o, 'task', 'arm', 'rep'); print(await acceptRun(cfg, run(o))); }
  else if (cmd === 'clean') { need(o, 'task', 'arm', 'rep'); print(cleanRun(cfg, run(o), { force: Boolean(o.force) })); }
  else if (cmd === 'row') { need(o, 'task', 'arm', 'rep'); print(appendRow(cfg, { ...run(o), note: o.note })); }
  else if (cmd === 'blind') {
    need(o, 'task', 'reps');
    print(blind(cfg, { task: o.task, reps: list(o.reps), force: Boolean(o.force), allowLeaks: Boolean(o['allow-leaks']) }));
  } else if (cmd === 'unblind') {
    need(o, 'task', 'input');
    print(unblind(cfg, { task: o.task, input: o.input, force: Boolean(o.force) }));
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exitCode = 1;
});
