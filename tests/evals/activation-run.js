#!/usr/bin/env node
'use strict';
// Runner de la prueba de activación (tests/evals/RESULTS-activacion.md). NO se corrió: gastar es del autor.
//   node tests/evals/activation-run.js --arm control|treatment [--reps 3] [--cap 20] [--model sonnet]
//     [--max-turns 2] [--set main|plan] [--only P01,N03] [--probe] [--dry-run] [--out <dir>] [--control <hash>]
// control = los plugins de `main` antes del cambio (un `git worktree add --detach` de CONTROL_COMMIT, sin tar:
// en Windows tar toma "C:" como host remoto); treatment = este árbol.
// Cada corrida es un `claude -p` de una frase, con solo la herramienta Skill, sin cargar ajustes de usuario;
// se mira qué skills se invocaron, en orden (grade en activation-cases.js: entry -> la esperada cuenta como acierto).
// La salida cruda de cada corrida queda en <out>/raw/<brazo>-<caso>-r<n>.jsonl para poder recalificar. El gasto ya hecho se lee de los metrics.jsonl de
// --out, así el tope vale entre invocaciones. --probe corre solo P01 (una corrida) para validar el montaje.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { CASES, PLAN_CASES, invokedSkill, grade, gradePlan } = require('./activation-cases');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONTROL_COMMIT = '3882ded';

function parseArgs(argv) {
  const o = { arm: null, reps: 3, cap: 20, model: 'sonnet', maxTurns: null, set: 'main', only: null, probe: false, dryRun: false, control: CONTROL_COMMIT, out: path.join(os.tmpdir(), 'claude-eval-activation') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--probe') o.probe = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--arm') o.arm = argv[++i];
    else if (a === '--reps') o.reps = Number(argv[++i]);
    else if (a === '--cap') o.cap = Number(argv[++i]);
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--max-turns') o.maxTurns = Number(argv[++i]);
    else if (a === '--set') o.set = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',');
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--control') o.control = argv[++i];
    else throw new Error(`argumento desconocido: ${a}`);
  }
  if (!['control', 'treatment'].includes(o.arm)) throw new Error('--arm control|treatment');
  if (!['main', 'plan'].includes(o.set)) throw new Error('--set main|plan');
  if (!/^[0-9a-f]{7,40}$/.test(String(o.control))) throw new Error('--control <hash de 7 a 40 hex>');
  // el conjunto plan pasa por entry y después por plan: necesita dos invocaciones, así que 3 turnos por defecto
  if (o.maxTurns === null) o.maxTurns = o.set === 'plan' ? 3 : 2;
  return o;
}

// Raíz de plugins del brazo: el árbol actual, o un checkout limpio del commit de control.
function pluginsRoot(arm, tmp, commit = CONTROL_COMMIT) {
  if (arm === 'treatment') return path.join(REPO_ROOT, 'plugins');
  const dir = path.join(tmp, 'control');
  execFileSync('git', ['worktree', 'add', '--detach', '-f', dir, commit], { cwd: REPO_ROOT, stdio: 'ignore' });
  return path.join(dir, 'plugins');
}

function cleanupControl(tmp) {
  const dir = path.join(tmp, 'control');
  if (!fs.existsSync(dir)) return;
  try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, stdio: 'ignore' }); } catch (_) { /* se limpia abajo */ }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  try { execFileSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT, stdio: 'ignore' }); } catch (_) { /* nada */ }
}

function rawPath(out, arm, id, rep) {
  return path.join(out, 'raw', `${arm}-${id}-r${rep}.jsonl`);
}

function claudeArgs(o, plugins) {
  return ['-p', '--model', o.model, '--output-format', 'stream-json', '--verbose', '--max-turns', String(o.maxTurns),
    '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'project',
    '--plugin-dir', path.join(plugins, 'pignolo'), '--plugin-dir', path.join(plugins, 'pignolo-ui'),
    '--tools', 'Skill', '--allowedTools', 'Skill'];
}

function spentSoFar(out) {
  let sum = 0;
  for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) {
    if (!f.endsWith('.jsonl')) continue;
    for (const l of fs.readFileSync(path.join(out, f), 'utf8').split('\n')) {
      if (l.trim()) sum += Number(JSON.parse(l).costUsd) || 0;
    }
  }
  return sum;
}

function main(argv) {
  const o = parseArgs(argv);
  let cases = o.set === 'plan' ? PLAN_CASES : CASES;
  if (o.only) cases = cases.filter((c) => o.only.includes(c.id));
  if (o.probe) cases = cases.filter((c) => c.id === (o.set === 'plan' ? 'Q01' : 'P01'));
  const reps = o.probe ? 1 : o.reps;
  const plan = cases.flatMap((c) => Array.from({ length: reps }, (_, r) => ({ ...c, rep: r + 1 })));
  if (o.dryRun) {
    process.stdout.write(`${JSON.stringify({ arm: o.arm, runs: plan.length, model: o.model, cap: o.cap })}\n`);
    return 0;
  }
  fs.mkdirSync(o.out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-eval-act-'));
  const cwd = path.join(tmp, 'project');
  fs.mkdirSync(cwd);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd, stdio: 'ignore' });
  const plugins = pluginsRoot(o.arm, tmp, o.control);
  const file = path.join(o.out, `${o.arm}.metrics.jsonl`);
  try {
    for (const c of plan) {
      if (spentSoFar(o.out) >= o.cap) { process.stderr.write(`tope de ${o.cap} USD alcanzado: se corta\n`); return 3; }
      const r = spawnSync('claude', claudeArgs(o, plugins), { cwd, input: c.prompt, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      const stream = String(r.stdout || '');
      fs.mkdirSync(path.join(o.out, 'raw'), { recursive: true });
      fs.writeFileSync(rawPath(o.out, o.arm, c.id, c.rep), stream);
      const invoked = invokedSkill(stream);
      let cost = 0;
      for (const l of stream.split('\n')) { try { const e = JSON.parse(l); if (e.type === 'result') cost = Number(e.total_cost_usd) || 0; } catch (_) { /* no es JSON */ } }
      const row = { arm: o.arm, id: c.id, rep: c.rep, expect: c.expect, invoked, ok: (o.set === 'plan' ? gradePlan : grade)(c.expect, invoked), costUsd: cost, error: r.status === 0 ? null : `exit ${r.status}` };
      fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
    }
  } finally {
    cleanupControl(tmp);
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 2; }
}

module.exports = { parseArgs, claudeArgs, pluginsRoot, cleanupControl, rawPath, CONTROL_COMMIT };
