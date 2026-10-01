#!/usr/bin/env node
'use strict';
// Runner del A/B del paso de brainstorm (tests/evals/RESULTS-brainstorm.md).
//   node tests/bench/brainstorm/run.js [--arms A,B] [--reps 3] [--first-rep 1] [--cap 10]
//     [--per-run-cap 2.5] [--max-turns 60] [--probe] [--dry-run] [--out <dir>]
// Brazo A: el texto de hoy del paso 2 de la skill `plan` (prompts/arm-a.md).
// Brazo B: el borrador de tests/bench/brainstorm/draft/SKILL.md (sin el encabezado).
// Cada corrida es un `claude -p` con opus sobre una copia limpia del repo en el commit
// anterior al plan del hito 4c (d0213e8), y termina con un spec escrito. Al autor lo
// reemplaza ask.js (sonnet con truth.json): en la copia solo queda un envoltorio, la verdad
// vive fuera. El gasto ya hecho se lee de los metrics.json de --out, así el tope vale entre
// invocaciones (la sonda y las corridas).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { gradeSpec } = require('./grade');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const COMMIT = 'd0213e8';
const SPEC = 'docs/specs/2026-10-01-ui-canvas-design.md';
const SKILL = path.join(REPO_ROOT, 'plugins', 'pignolo', 'skills', 'brainstorm', 'SKILL.md');
const TOOLS = 'Read,Grep,Glob,Write,Edit,Bash';
const ALLOWED = 'Read,Grep,Glob,Write,Edit,Bash(node ask.js:*)';
const SHIM = "process.exit(require(require('node:path').join(process.env.BS_BENCH_DIR, 'ask.js')).main(process.argv.slice(2)));\n";

const usd = (n) => n.toFixed(2).replace('.', ',');
const read = (f) => fs.readFileSync(f, 'utf8');
const readJsonOr = (file, fallback) => { try { return JSON.parse(read(file)); } catch (_) { return fallback; } };

function armText(arm) {
  if (arm === 'A') return read(path.join(__dirname, 'prompts', 'arm-a.md')).trim();
  // La skill sin su encabezado YAML: lo que el modelo recibe al invocarla.
  return `(The \`pignolo:brainstorm\` skill.)\n\n${read(SKILL).replace(/^---\n[\s\S]*?\n---\n/, '').trim()}`;
}

function buildPrompt(arm) {
  return read(path.join(__dirname, 'prompts', 'common.md'))
    .replace('{{REQUEST}}', () => read(path.join(__dirname, 'request.txt')).trim())
    .replace('{{ARM}}', () => armText(arm));
}

// Copia limpia: `git archive` del commit (sin .git del repo real), con su propio repo git.
function prepareCopy(tmpDir) {
  const base = fs.mkdtempSync(path.join(tmpDir, 'claude-eval-bs-'));
  const dir = path.join(base, 'repo');
  fs.mkdirSync(dir);
  execFileSync('git', ['archive', '--format=tar', '-o', path.join(base, 'repo.tar'), COMMIT], { cwd: REPO_ROOT, stdio: 'ignore' });
  execFileSync('tar', ['-xf', 'repo.tar', '-C', 'repo'], { cwd: base, stdio: 'ignore' });
  fs.rmSync(path.join(base, 'repo.tar'));
  fs.writeFileSync(path.join(dir, 'ask.js'), SHIM);
  fs.mkdirSync(path.join(dir, '.pignolo', 'tmp'), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('-c', 'core.autocrlf=false', 'add', '-A');
  git('-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', 'commit', '-q', '-m', `copia de ${COMMIT}`);
  return { dir, cleanup: () => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

function claudeArgs({ dir, budget, maxTurns }) {
  return ['-p', '--model', 'opus', '--output-format', 'json', '--max-budget-usd', String(Number(budget.toFixed(2))),
    '--max-turns', String(maxTurns), '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands',
    '--setting-sources', 'project,local', '--plugin-dir', path.join(dir, 'plugins', 'pignolo'),
    '--permission-mode', 'acceptEdits', '--tools', TOOLS, '--allowedTools', ALLOWED];
}

function readAsks(logDir) {
  let text = '';
  try { text = read(path.join(logDir, 'ask.jsonl')); } catch (_) { return []; }
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function runOne({ arm, rep }, opts, budget) {
  const id = `${arm}${rep}`;
  const outDir = path.join(opts.outDir, id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const work = prepareCopy(opts.tmpDir);
  const t0 = Date.now();
  try {
    const r = spawnSync('claude', claudeArgs({ dir: work.dir, budget, maxTurns: opts.maxTurns }), {
      cwd: work.dir, env: { ...process.env, BS_BENCH_DIR: __dirname, BS_LOG_DIR: outDir }, input: buildPrompt(arm),
      encoding: 'utf8', timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    });
    const wall = (Date.now() - t0) / 1000;
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (_) { /* queda el error */ }
    fs.writeFileSync(path.join(outDir, 'claude.json'), json ? `${JSON.stringify(json, null, 2)}\n` : String(r.stdout || r.stderr || (r.error && r.error.message) || ''));
    // Lo que dejó la corrida: el spec y los archivos del árbol y de las decisiones (G23: se
    // mira el archivo, no el informe).
    let spec = null;
    try { spec = read(path.join(work.dir, SPEC)); } catch (_) { /* no lo escribió */ }
    if (spec != null) fs.writeFileSync(path.join(outDir, 'spec.md'), spec);
    const tmp = path.join(work.dir, '.pignolo', 'tmp');
    const left = fs.existsSync(tmp) ? fs.readdirSync(tmp) : [];
    for (const f of left) fs.cpSync(path.join(tmp, f), path.join(outDir, 'tmp', f), { recursive: true });
    const asks = readAsks(outDir);
    const u = (json && json.usage) || {};
    const oracleUsd = asks.reduce((s, a) => s + (a.costUsd || 0), 0);
    const armUsd = (json && Number(json.total_cost_usd)) || 0;
    const metrics = {
      id, arm, rep, commit: COMMIT,
      error: !json ? `salida que no es JSON (exit ${r.status})` : (json.is_error || (json.subtype && json.subtype !== 'success') ? `claude terminó con ${json.subtype || 'error'}` : (spec == null ? 'no escribió el spec' : null)),
      asks: asks.length, authorWords: asks.reduce((s, a) => s + (a.answerWords || 0), 0), askErrors: asks.filter((a) => a.error).length,
      specWords: spec == null ? 0 : spec.trim().split(/\s+/).length,
      treeFile: left.some((f) => f.startsWith('brainstorm-')), decisionsFile: left.some((f) => f.startsWith('decisions-')),
      touched: spec == null ? [] : gradeSpec(spec, opts.truth).touched,
      armUsd, oracleUsd, costUsd: armUsd + oracleUsd,
      tokens: { input: u.input_tokens || 0, output: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) },
      minutes: ((json && json.duration_ms != null ? json.duration_ms / 1000 : wall) / 60), turns: (json && json.num_turns) || null,
      denials: ((json && json.permission_denials) || []).length,
    };
    fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
    return metrics;
  } finally {
    work.cleanup();
  }
}

// Gasto ya hecho bajo --out: cada metrics.json más las llamadas sueltas al oráculo.
function spentIn(outDir) {
  let total = 0;
  if (!fs.existsSync(outDir)) return 0;
  for (const name of fs.readdirSync(outDir)) {
    const m = readJsonOr(path.join(outDir, name, 'metrics.json'), null);
    total += m ? m.costUsd : readAsks(path.join(outDir, name)).reduce((s, a) => s + (a.costUsd || 0), 0);
  }
  return total;
}

function main(argv) {
  const o = { arms: ['A', 'B'], reps: 3, firstRep: 1, cap: 10, perRunCap: 2.5, maxTurns: 60, outDir: path.join(__dirname, 'results'), tmpDir: os.tmpdir(), timeoutMs: 40 * 60 * 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--arms') o.arms = argv[++i].split(',').filter(Boolean);
    else if (a === '--reps') o.reps = Number(argv[++i]);
    else if (a === '--first-rep') o.firstRep = Number(argv[++i]);
    else if (a === '--cap') o.cap = Number(argv[++i]);
    else if (a === '--per-run-cap') o.perRunCap = Number(argv[++i]);
    else if (a === '--max-turns') o.maxTurns = Number(argv[++i]);
    else if (a === '--out') o.outDir = path.resolve(argv[++i]);
    else if (a === '--probe') Object.assign(o, { arms: ['B'], reps: 1 });
    else if (a === '--dry-run') o.dryRun = true;
    else { process.stderr.write(`argumento desconocido: ${a}\n`); return 2; }
  }
  if (o.arms.some((x) => !['A', 'B'].includes(x)) || [o.reps, o.firstRep, o.cap, o.perRunCap, o.maxTurns].some((n) => !(n > 0))) { process.stderr.write('opciones inválidas\n'); return 2; }
  o.truth = JSON.parse(read(path.join(__dirname, 'truth.json')));
  const matrix = [];
  for (let rep = o.firstRep; rep < o.firstRep + o.reps; rep += 1) for (const arm of o.arms) matrix.push({ arm, rep });
  process.stdout.write(`Matriz: ${matrix.map((r) => r.arm + r.rep).join(', ')}. Tope global: ${usd(o.cap)} USD; por corrida: ${usd(o.perRunCap)} USD. Gastado hasta ahora: ${usd(spentIn(o.outDir))} USD.\n`);
  if (o.dryRun) {
    for (const arm of o.arms) process.stdout.write(`Brazo ${arm}: prompt de ${buildPrompt(arm).split(/\s+/).length} palabras.\n`);
    process.stdout.write(`claude ${claudeArgs({ dir: '<copia>', budget: o.perRunCap, maxTurns: o.maxTurns }).join(' ')}\n`);
    return 0;
  }
  for (const run of matrix) {
    const remaining = o.cap - spentIn(o.outDir);
    // Margen para el oráculo de la corrida (≈ 0,02 USD por mensaje).
    const budget = Math.min(o.perRunCap, remaining - 0.4);
    if (budget < 0.5) { process.stdout.write(`Corte por el tope: quedan ${usd(Math.max(remaining, 0))} USD.\n`); return 3; }
    const m = runOne(run, o, budget);
    process.stdout.write(`${m.id}: ${m.asks} mensajes al autor, ${m.authorWords} palabras del autor, tocadas ${m.touched.length}/${o.truth.decisions.length} (${m.touched.join(' ')}), ${usd(m.costUsd)} USD (${usd(m.oracleUsd)} del oráculo), ${m.minutes.toFixed(1)} min, ${m.turns} turnos, ${m.denials} permisos negados${m.error ? `, error: ${m.error}` : ''}\n`);
  }
  process.stdout.write(`Gasto total: ${usd(spentIn(o.outDir))} USD.\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { buildPrompt, armText, claudeArgs, spentIn, main };
