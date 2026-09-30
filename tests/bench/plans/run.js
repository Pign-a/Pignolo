#!/usr/bin/env node
'use strict';
// Runner de la prueba de metodologías de validación de planes.
//   node tests/bench/plans/run.js [--dry-run] [--cases real,p1,p2,p3,clean]
//     [--methods M1,M2,M3,M4,M5,M0] [--models sonnet,opus] [--reps 3] [--cap 25]
//     [--per-run-cap <usd>] [--mode isolated|bare] [--claude <cmd> [--claude-arg <a>]...]
//     [--probe] [--out <dir>] [--results-md <archivo>]
// Cada corrida llama a `claude -p` en una copia temporal del repo del caso, sin pignolo.
// --mode isolated (por defecto) no usa --bare: con el login de claude.ai `--bare` no
// autentica (solo lee ANTHROPIC_API_KEY o apiKeyHelper, `claude --help`); en su lugar
// limita las fuentes de configuración a project,local, que en la copia no existen.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { checkPlan, toFindings } = require('../../../plugins/pignolo/lib/plan-check');
const { grade } = require('./grade');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE = path.join(__dirname, 'fixture');
const REAL = { commit: '794b009', plan: 'docs/plans/2026-09-30-hito-4-tests-sabotaje-holdout.md' };
const CASES = ['real', 'p1', 'p2', 'p3', 'clean'];
const METHODS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M0'];
const MODELS = ['sonnet', 'opus'];
const TOOLS = { M3: 'Read,Grep,Glob', M4: 'Read,Grep,Glob', M5: 'Read,Grep,Glob,Bash,Write', M0: 'Read,Grep,Glob,Edit,Write,Bash' };
const PROMPT = { M3: 'reviewer.md', M4: 'layered.md', M5: 'experiments.md', M0: 'replay.md' };
// Estimaciones por corrida (USD) antes de tener medidas; la sonda de B4 las reemplaza.
const EST = { M3: { sonnet: 0.25, opus: 0.6 }, M4: { sonnet: 0.3, opus: 0.7 }, M5: { sonnet: 0.8, opus: 2 }, M0: { sonnet: 1.5, opus: 4 } };
const REAL_MULT = 2; // el plan real es ~8 veces más largo que un sintético y su repo más grande
// Tope de gasto por corrida (--max-budget-usd), antes de acotarlo con lo que queda del tope global.
const PER_RUN_CAP = { M3: { sonnet: 1, opus: 2.5 }, M4: { sonnet: 1.25, opus: 3 }, M5: { sonnet: 3, opus: 5 }, M0: { sonnet: 4, opus: 8 } };
const DEFAULT_CAP = 25;

const isAi = (method) => method === 'M3' || method === 'M4' || method === 'M5' || method === 'M0';

// M1 y M2 son deterministas (una vez por caso). M3 y M4 van por modelo y repetición;
// M0, una vez por modelo. Orden por repetición: si el tope corta, quedan las primeras
// corridas de todo y no todas las de un solo método.
function buildMatrix({ cases = CASES, methods = METHODS, models = MODELS, reps = 3 } = {}) {
  const out = [];
  for (let rep = 1; rep <= reps; rep += 1) {
    for (const method of METHODS) {
      if (!methods.includes(method)) continue;
      if (!isAi(method)) { if (rep === 1) for (const c of cases) out.push({ case: c, method, model: null, rep: 1 }); continue; }
      if (method === 'M0' && rep > 1) continue;
      for (const c of cases) for (const model of models) out.push({ case: c, method, model, rep });
    }
  }
  return out;
}

const estimateOf = (run) => (isAi(run.method) ? (EST[run.method][run.model] || 1) * (run.case === 'real' ? REAL_MULT : 1) : 0);
const perRunCapOf = (run, override) => override || (PER_RUN_CAP[run.method] && PER_RUN_CAP[run.method][run.model]) || 1;

function estimate(matrix) {
  const groups = new Map();
  let total = 0;
  for (const run of matrix) {
    const key = `${run.method}|${run.model || '—'}`;
    const g = groups.get(key) || { method: run.method, model: run.model, runs: 0, usd: 0 };
    g.runs += 1;
    g.usd += estimateOf(run);
    groups.set(key, g);
    total += estimateOf(run);
  }
  return { groups: [...groups.values()], total };
}

const usd = (n) => n.toFixed(2).replace('.', ',');

// ---------- copia de trabajo del caso ----------
function prepareCase(caseName, tmpDir) {
  const base = fs.mkdtempSync(path.join(tmpDir, 'plan-bench-'));
  const dir = path.join(base, 'repo');
  let planText;
  let cleanup;
  if (caseName === 'real') {
    execFileSync('git', ['worktree', 'add', '--detach', dir, REAL.commit], { cwd: REPO_ROOT, stdio: 'ignore' });
    planText = execFileSync('git', ['show', `${REAL.commit}:${REAL.plan}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    // Sin CLAUDE.md ni .claude del proyecto: se mide el método, no el plugin.
    fs.rmSync(path.join(dir, 'CLAUDE.md'), { force: true });
    fs.rmSync(path.join(dir, '.claude'), { recursive: true, force: true });
    cleanup = () => {
      try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, stdio: 'ignore' }); } catch (_) { /* ya no está */ }
      try { execFileSync('git', ['worktree', 'prune'], { cwd: REPO_ROOT, stdio: 'ignore' }); } catch (_) { /* nada */ }
      fs.rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    };
  } else {
    fs.cpSync(FIXTURE, dir, { recursive: true });
    planText = fs.readFileSync(path.join(__dirname, 'cases', `${caseName}.md`), 'utf8');
    cleanup = () => fs.rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
  fs.writeFileSync(path.join(dir, 'PLAN.md'), planText);
  return { dir, planText, cleanup };
}

// ---------- llamada a claude ----------
function claudeArgs({ method, model, budget, mode, scratch }) {
  const args = ['-p', '--model', model, '--output-format', 'json', '--max-budget-usd', String(Number(budget.toFixed(2))),
    '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands'];
  args.push(...(mode === 'bare' ? ['--bare'] : ['--setting-sources', 'project,local']));
  args.push('--allowedTools', TOOLS[method]);
  if (method === 'M0') args.push('--permission-mode', 'acceptEdits');
  // M5 corre Bash de verdad en Windows (sin sandbox): va con la guardia de pignolo de este repo.
  // Sin acceptEdits ni --add-dir, en -p no puede escribir el archivo del experimento fuera del cwd.
  if (method === 'M5') args.push('--plugin-dir', path.join(REPO_ROOT, 'plugins', 'pignolo'), '--permission-mode', 'acceptEdits', '--add-dir', scratch);
  return args;
}

function callClaude({ claude, args, cwd, prompt, env, timeoutMs }) {
  const t0 = Date.now();
  const r = spawnSync(claude[0], [...claude.slice(1), ...args], {
    cwd, env, input: prompt, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  const wall = (Date.now() - t0) / 1000;
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* queda el error */ }
  if (!json) {
    const why = r.error ? r.error.message : `salida que no es JSON (exit ${r.status}): ${String(r.stdout || r.stderr).slice(0, 200)}`;
    return { error: why, costUsd: 0, durationSeconds: wall, tokens: { input: 0, output: 0, cache: 0 }, text: '' };
  }
  const u = json.usage || {};
  return {
    error: json.is_error || (json.subtype && json.subtype !== 'success') ? `claude terminó con ${json.subtype || 'error'}` : null,
    costUsd: Number(json.total_cost_usd) || 0,
    durationSeconds: json.duration_ms != null ? json.duration_ms / 1000 : wall,
    tokens: { input: u.input_tokens || 0, output: u.output_tokens || 0, cache: (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) },
    text: typeof json.result === 'string' ? json.result : '',
  };
}

function runOne(run, opts, truth, budget) {
  const work = prepareCase(run.case, opts.tmpDir);
  const t0 = Date.now();
  try {
    let out;
    if (run.method === 'M1' || run.method === 'M2') {
      const res = checkPlan({ planText: work.planText, root: work.dir, runTests: run.method === 'M2', tmpDir: opts.tmpDir });
      out = { error: null, costUsd: 0, durationSeconds: (Date.now() - t0) / 1000, tokens: { input: 0, output: 0, cache: 0 }, findings: toFindings(res), text: '' };
    } else {
      let report = '';
      let scratch = null;
      if (run.method === 'M5') scratch = fs.mkdtempSync(path.join(opts.tmpDir, 'plan-bench-scratch-'));
      if (run.method === 'M4' || run.method === 'M5') {
        report = JSON.stringify(toFindings(checkPlan({ planText: work.planText, root: work.dir, runTests: true, tmpDir: opts.tmpDir })), null, 2);
      }
      const prompt = fs.readFileSync(path.join(__dirname, 'prompts', PROMPT[run.method]), 'utf8').replace('{{REPORT}}', () => report).replace('{{SCRATCH}}', () => scratch || '');
      const called = callClaude({
        claude: opts.claude, args: claudeArgs({ method: run.method, model: run.model, budget, mode: opts.mode, scratch }),
        cwd: work.dir, prompt, env: opts.env, timeoutMs: opts.timeoutMs,
      });
      out = { ...called, findings: called.text };
      if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    }
    const g = grade({ findings: out.findings, truth, plan: run.case });
    return {
      ...run, total: truth[run.case].length, found: g.found, missed: g.missed, falsePositives: g.falsePositives.length,
      falsePositiveFindings: g.falsePositives, costUsd: out.costUsd, durationSeconds: out.durationSeconds, tokens: out.tokens,
      error: out.error || g.error, raw: typeof out.findings === 'string' ? out.findings : undefined,
    };
  } finally {
    work.cleanup();
  }
}

// ---------- tabla ----------
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

function renderTable(rows, { spent = 0, stopped = null } = {}) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.method}|${r.model || '—'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const lines = [
    '# Validación de planes: resultados de la prueba', '',
    '| Método | Modelo | Corridas | Recall real | Recall sintéticos | Falsas alarmas por corrida | Falsas en el plan limpio | Costo medio (USD) | Tiempo medio (s) | USD por error hallado |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [key, rs] of groups) {
    const [method, model] = key.split('|');
    const withErrors = rs.filter((r) => r.total > 0);
    const recall = (set) => mean(set.map((r) => r.found.length / r.total));
    const foundTotal = rs.reduce((s, r) => s + r.found.length, 0);
    const cost = rs.reduce((s, r) => s + r.costUsd, 0);
    lines.push(`| ${method} | ${model} | ${rs.length} | ${pct(recall(withErrors.filter((r) => r.case === 'real')))} | ${pct(recall(withErrors.filter((r) => r.case !== 'real')))} `
      + `| ${usd(mean(withErrors.map((r) => r.falsePositives)) ?? 0)} | ${usd(mean(rs.filter((r) => r.total === 0).map((r) => r.falsePositives)) ?? 0)} `
      + `| ${usd(mean(rs.map((r) => r.costUsd)) ?? 0)} | ${(mean(rs.map((r) => r.durationSeconds)) ?? 0).toFixed(0)} | ${foundTotal ? usd(cost / foundTotal) : '—'} |`);
  }
  lines.push('', `Gasto total: ${usd(spent)} USD.`);
  if (stopped) lines.push('', `La corrida se cortó por el tope: ${stopped.reason}.`);
  const errors = rows.filter((r) => r.error);
  if (errors.length) lines.push('', `${errors.length} corridas con error (ver el JSON de resultados).`);
  return `${lines.join('\n')}\n`;
}

// ---------- corrida ----------
function runBench(options = {}) {
  const opts = {
    cases: CASES, methods: METHODS, models: MODELS, reps: 3, cap: DEFAULT_CAP, mode: 'isolated', claude: ['claude'],
    outDir: path.join(__dirname, 'results'), resultsMd: path.join(REPO_ROOT, 'tests', 'evals', 'RESULTS-planes.md'),
    tmpDir: os.tmpdir(), env: process.env, log: (l) => process.stdout.write(`${l}\n`), now: new Date(),
    timeoutMs: 30 * 60 * 1000, dryRun: false, perRunCap: null, ...options,
  };
  const matrix = buildMatrix(opts);
  const est = estimate(matrix);

  opts.log(`Matriz: ${matrix.length} corridas (${matrix.filter((r) => isAi(r.method)).length} con IA). Modo: ${opts.mode}. Tope global: ${usd(opts.cap)} USD.`);
  opts.log('Método | Modelo | Casos | Corridas | USD estimados');
  for (const g of est.groups) {
    const cs = [...new Set(matrix.filter((r) => r.method === g.method && r.model === g.model).map((r) => r.case))].join(',');
    opts.log(`${g.method} | ${g.model || '—'} | ${cs} | ${g.runs} | ${usd(g.usd)}`);
  }
  opts.log(`Costo estimado total: ${usd(est.total)} USD (estimación sin medir; la sonda la reemplaza). ${est.total > opts.cap ? `Supera el tope de ${usd(opts.cap)} USD: la corrida se corta al llegar al tope.` : 'Entra en el tope.'}`);
  if (opts.dryRun) return { matrix, estimate: est, rows: [], spent: 0, stopped: null, file: null };

  const truth = JSON.parse(fs.readFileSync(path.join(__dirname, 'truth.json'), 'utf8'));
  const rows = [];
  let spent = 0;
  let stopped = null;
  for (const run of matrix) {
    let budget = 0;
    if (isAi(run.method)) {
      const remaining = opts.cap - spent;
      if (remaining < estimateOf(run)) {
        stopped = { reason: `del tope de ${usd(opts.cap)} USD quedan ${usd(Math.max(remaining, 0))} y la corrida ${run.method} ${run.model} sobre ${run.case} estima ${usd(estimateOf(run))}`, at: rows.length };
        break;
      }
      budget = Math.min(perRunCapOf(run, opts.perRunCap), remaining);
    }
    const row = runOne(run, opts, truth, budget);
    spent += row.costUsd;
    rows.push(row);
    opts.log(`[${rows.length}/${matrix.length}] ${run.method} ${run.model || ''} ${run.case} #${run.rep}: ${row.found.length}/${row.total} hallados, ${row.falsePositives} falsas, ${usd(row.costUsd)} USD${row.error ? `, error: ${row.error}` : ''}`);
  }
  if (stopped) opts.log(`Corte por el tope: ${stopped.reason}.`);

  fs.mkdirSync(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, `${opts.now.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ meta: { mode: opts.mode, cap: opts.cap, spent, stopped, reps: opts.reps, methods: opts.methods, models: opts.models, cases: opts.cases }, rows }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(opts.resultsMd), { recursive: true });
  fs.writeFileSync(opts.resultsMd, renderTable(rows, { spent, stopped }));
  return { matrix, estimate: est, rows, spent, stopped, file };
}

function main(argv) {
  const o = {};
  const list = (v) => v.split(',').filter(Boolean);
  const claudeArgs2 = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--probe') o.probe = true;
    else if (a === '--cases') o.cases = list(argv[++i]);
    else if (a === '--methods') o.methods = list(argv[++i]);
    else if (a === '--models') o.models = list(argv[++i]);
    else if (a === '--reps') o.reps = Number(argv[++i]);
    else if (a === '--cap') o.cap = Number(argv[++i]);
    else if (a === '--per-run-cap') o.perRunCap = Number(argv[++i]);
    else if (a === '--mode') o.mode = argv[++i];
    else if (a === '--claude') o.claude = [argv[++i]];
    else if (a === '--claude-arg') claudeArgs2.push(argv[++i]);
    else if (a === '--out') o.outDir = path.resolve(argv[++i]);
    else if (a === '--results-md') o.resultsMd = path.resolve(argv[++i]);
    else { process.stderr.write(`argumento desconocido: ${a}\n`); return 2; }
  }
  if (claudeArgs2.length) o.claude = [...(o.claude || ['claude']), ...claudeArgs2];
  if (o.probe) Object.assign(o, { cases: ['p1'], methods: ['M3'], models: ['sonnet'], reps: 1 });
  const bad = [...(o.cases || []).filter((c) => !CASES.includes(c)), ...(o.methods || []).filter((m) => !METHODS.includes(m)), ...(o.models || []).filter((m) => !MODELS.includes(m))];
  if (bad.length || (o.mode && !['isolated', 'bare'].includes(o.mode)) || [o.reps, o.cap, o.perRunCap].some((n) => n !== undefined && !(n > 0))) {
    process.stderr.write(`opciones inválidas${bad.length ? `: ${bad.join(', ')}` : ''}\n`);
    return 2;
  }
  runBench(o);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { buildMatrix, estimate, runBench, renderTable, main, EST, PER_RUN_CAP };
