// Batch driver: follows a schedule (schedule.mjs) and, for each entry, runs prepare, run, accept (which also computes the quality
// panel) and row, one after the other. It stops at the first HARNESS error (a step that throws); an invalid run is not an error:
// it is recorded and the batch goes on. It prints one summary line per run. The spend ledger and its caps apply to every `run`
// as always. A batch can be started again with the same schedule: it skips what already has its CSV row and finishes what was
// left half way. --dry-run prints the plan and the checks without running anything or spending.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, taskSet, hasPlugin, isFixtureTask } from './config.mjs';
import { loadSchedule } from './schedule.mjs';
import { prepare } from './prepare.mjs';
import { runTask, checkPlugin, checkConfigDir } from './execute.mjs';
import { acceptRun } from './accept.mjs';
import { appendRow, parseCsv } from './row.mjs';
import { spentUsd, assertWithinTotalCap, CAP_MARGIN } from './ledger.mjs';
import { verifyFreeze } from './freeze.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// Where an entry stands: which steps are still to do.
export function entryState(cfg, e) {
  const { dir, repo } = runPaths(cfg, e);
  const metrics = readJson(path.join(dir, 'metrics.json'));
  const streamed = fs.existsSync(path.join(dir, 'stream.jsonl'));
  const prepared = fs.existsSync(path.join(repo, '.git'));
  const accepted = fs.existsSync(path.join(dir, isFixtureTask(cfg, e.task) ? 'fronts.json' : 'acceptance.json'));
  let recorded = false;
  if (metrics && fs.existsSync(cfg.csvPath)) {
    recorded = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).some((r) => r.experiment === cfg.experiment && r.task === e.task
      && r.arm === e.arm && Number(r.rep) === Number(e.rep) && r.timestamp === metrics.finishedAt);
  }
  if (recorded) return { status: 'registrada', steps: [] };
  if (streamed && !metrics) return { status: 'interrumpida', steps: [] };
  const steps = [];
  if (!prepared && !streamed) steps.push('prepare');
  if (!metrics) steps.push('run');
  if (!accepted) steps.push('accept');
  steps.push('row');
  return { status: metrics ? 'a medias' : prepared ? 'preparada' : 'pendiente', steps };
}

const fmtNum = (x, d) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? 'sin dato' : Number(x).toFixed(d));

// One line for a finished run, from its CSV row.
export function summaryLine(index, total, row) {
  const green = row.accept_exit === 0 && row.accept_fail === 0 && row.accept_pass > 0 && !(row.accept_suites_failed > 0);
  let accept = 'sin dato';
  if (row.fronts_by_agents_ok) accept = row.fronts_by_agents_ok === 'true' ? 'pasa' : 'falla';
  else if (row.accept_exit !== null && row.accept_exit !== undefined) accept = green ? 'pasa' : 'falla';
  return `[${index}/${total}] ${row.task} ${row.arm} rep ${row.rep} | costo ${fmtNum(row.cost_usd, 4)} USD | pared ${fmtNum(row.wall_s, 1)} s`
    + ` | turnos ${fmtNum(row.turns, 0)} | agentes ${fmtNum(row.agents, 0)} | activación ${row.activation_via || 'sin dato'}`
    + ` | aceptación ${accept} | ${row.invalid ? `inválida: ${row.invalid_reason}` : 'válida'}`;
}

// Free checks shared by --dry-run and the real batch.
function preflight(cfg, schedule) {
  const problems = [];
  const arms = [...new Set(schedule.entries.map((e) => e.arm))];
  for (const a of arms) {
    try {
      if (hasPlugin(cfg, a) && !fs.existsSync(cfg.arms[a].pluginDir)) throw new Error(`no existe el plugin del brazo ${a}`);
      checkPlugin(cfg, a);
    } catch (e) { problems.push(e.message); }
  }
  try { checkConfigDir(cfg.configDir, { neutralPaths: cfg.neutralConfigPaths, armNames: Object.values(cfg.arms).map((a) => a.pluginName).filter(Boolean) }); } catch (e) { problems.push(e.message); }
  const validation = [...new Set(schedule.entries.map((e) => e.task))].filter((t) => taskSet(cfg, t) === 'validation');
  let freeze = null;
  if (validation.length) {
    freeze = verifyFreeze(cfg);
    if (!freeze.ok) problems.push(`freeze: ${freeze.problems.join('; ')}`);
  }
  return { problems, validation, freeze };
}

export async function runBatch(cfg, { schedule: file, dryRun = false }, { log = (s) => console.log(s) } = {}) {
  const schedule = loadSchedule(cfg, file);
  const total = schedule.entries.length;
  const states = schedule.entries.map((e) => ({ e, ...entryState(cfg, e) }));
  const pre = preflight(cfg, schedule);

  if (dryRun) {
    log(`calendario ${path.basename(file)}: ${total} corridas (semilla ${schedule.seed}), experimento ${cfg.experiment}`);
    for (const s of states) {
      log(`[${s.e.index || states.indexOf(s) + 1}/${total}] bloque ${s.e.block ?? '-'} ${s.e.task} ${s.e.arm} rep ${s.e.rep}: ${s.status}${s.steps.length ? ` -> ${s.steps.join(', ')}` : ''}`);
    }
    const toRun = states.filter((s) => s.steps.includes('run')).length;
    const spent = spentUsd(cfg);
    const perRun = Number(cfg.perRunCapUsd);
    const worst = Math.round(toRun * perRun * 10000) / 10000;
    let next = 'sí';
    try { assertWithinTotalCap(cfg); } catch (err) { next = `no: ${err.message}`; }
    log(`gastado hasta ahora ${spent} USD; tope total ${cfg.totalCapUsd} USD; tope por corrida ${perRun} USD (con margen ${CAP_MARGIN * perRun} USD)`);
    log(`corridas por lanzar ${toRun}; peor caso ${worst} USD; el peor caso entra en el tope total: ${spent + worst + (CAP_MARGIN - 1) * perRun <= Number(cfg.totalCapUsd) ? 'sí' : 'no'}`);
    log(`la próxima corrida pasa el chequeo del ledger: ${next}`);
    if (pre.validation.length) log(`tareas de validación ${pre.validation.join(', ')}: freeze ${pre.freeze.ok ? `verificado (${pre.freeze.freezeHash.slice(0, 12)})` : `NO se cumple: ${pre.freeze.problems.join('; ')}`}`);
    log(pre.problems.length ? `chequeos previos con problemas: ${pre.problems.join(' | ')}` : 'chequeos previos (plugins, configDir, freeze): bien');
    return { dryRun: true, entries: states.map((s) => ({ ...s.e, status: s.status, steps: s.steps })), spent, toRun, worstCaseUsd: worst, problems: pre.problems };
  }

  if (pre.problems.length) throw new Error(`chequeos previos del batch: ${pre.problems.join(' | ')}; no se lanza nada`);
  const results = [];
  let i = 0;
  for (const s of states) {
    i += 1;
    const e = s.e;
    const tag = `[${i}/${total}] ${e.task} ${e.arm} rep ${e.rep}`;
    if (s.status === 'registrada') { log(`${tag} | ya registrada en el CSV, se salta`); results.push({ ...e, skipped: true }); continue; }
    if (s.status === 'interrumpida') {
      const err = new Error(`${tag}: tiene stream.jsonl sin metrics.json (una corrida interrumpida); su gasto ya cuenta en el ledger. Revisala y limpiala con "run.mjs clean --force" antes de repetir`);
      err.results = results;
      throw err;
    }
    let step = 'inicio';
    try {
      const a = { task: e.task, arm: e.arm, rep: e.rep };
      if (s.steps.includes('prepare')) { step = 'prepare'; await prepare(cfg, a); }
      if (s.steps.includes('run')) { step = 'run'; await runTask(cfg, a); }
      if (s.steps.includes('accept')) { step = 'accept'; await acceptRun(cfg, a); }
      step = 'row';
      const row = appendRow(cfg, { ...a, note: undefined });
      log(summaryLine(i, total, row));
      results.push({ ...e, row });
    } catch (err) {
      const out = new Error(`${tag}: falló el paso ${step}: ${err.message}. El batch se detiene; al volver a correrlo con el mismo calendario retoma desde esta corrida`);
      out.results = results;
      throw out;
    }
  }
  return { dryRun: false, results };
}
