// Batch driver: follows a schedule (schedule.mjs) and, for each entry, runs prepare, run, accept (which also computes the quality
// panel) and row, one after the other. It stops at the first HARNESS error (a step that throws); an invalid run is not an error:
// it is recorded and the batch goes on. It prints one summary line per run. The spend ledger and its caps apply to every `run`
// as always. A batch can be started again with the same schedule: it skips what already has its CSV row and finishes what was
// left half way. --dry-run prints the plan and the checks without running anything or spending.
// --retry-infra [--max-retries N]: after the main pass, each entry whose latest row is an INFRASTRUCTURE fault (a crash, an API error,
// a hang... never a bad result, never a run cut by the cap or by the time while the agent worked: those are results) is run again
// (clean, prepare, run, accept, row --note "rerun N"), at most N times (2 at most: the ficha sets it). A rerun keeps the same
// task, arm and repetition; N is stored in the note column. The spend ledger applies to every rerun like to any run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runPaths, taskSet, hasPlugin, isFixtureTask, isReviewTask } from './config.mjs';
import { loadSchedule } from './schedule.mjs';
import { prepare } from './prepare.mjs';
import { runTask, checkPlugin, checkConfigDir } from './execute.mjs';
import { acceptRun } from './accept.mjs';
import { scoreRun } from './score.mjs';
import { appendRow, parseCsv } from './row.mjs';
import { cleanRun } from './clean.mjs';
import { isRetryableInfra } from './metrics.mjs';
import { spentUsd, assertWithinTotalCap, CAP_MARGIN } from './ledger.mjs';
import { verifyFreeze } from './freeze.mjs';

// sha256 of the prompt a review run of this entry sends (the arm's promptPrefix + reviewPrompt); null for any other task. The text is never printed.
export function reviewPromptSha(cfg, e) {
  if (!isReviewTask(cfg, e.task)) return null;
  const a = cfg.arms[e.arm];
  return crypto.createHash('sha256').update((a.promptPrefix || '') + String(a.reviewPrompt || '').trimEnd()).digest('hex');
}

// The ficha allows up to 2 reruns per run for infrastructure faults.
export const MAX_RETRIES_LIMIT = 2;
const RERUN_N = /(^|;)\s*rerun\s+(\d+)\s*(;|$)/;

// Rows of the CSV for one entry (same experiment, task, arm and repetition), in file order.
function entryRows(cfg, e) {
  if (!fs.existsSync(cfg.csvPath)) return [];
  return parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).filter((r) => r.experiment === cfg.experiment && r.task === e.task
    && r.arm === e.arm && Number(r.rep) === Number(e.rep));
}

// Where an entry stands for reruns: how many infrastructure reruns it already had (rows noted "rerun N") and whether its latest
// row is an infrastructure fault that can be run again.
export function retryState(cfg, e) {
  const rows = entryRows(cfg, e);
  let latest = null;
  rows.forEach((r, i) => {
    if (!latest || String(r.timestamp) > String(latest.r.timestamp) || (r.timestamp === latest.r.timestamp && i > latest.i)) latest = { r, i };
  });
  const attempts = rows.reduce((n, r) => Math.max(n, Number((String(r.note || '').match(RERUN_N) || [])[2] || 0)), 0);
  if (!latest) return { rows: 0, attempts, infra: false, reasons: [] };
  const reasons = String(latest.r.invalid_reason || '').split(';').map((x) => x.trim()).filter(Boolean);
  const infra = latest.r.invalid === 'true' && ['infra_fault', 'hang'].includes(latest.r.termination) && isRetryableInfra(reasons);
  return { rows: rows.length, attempts, infra, reasons };
}

// A row written for an entry that already has rows is a rerun of an infrastructure fault.
const rerunNote = (cfg, e) => {
  const st = retryState(cfg, e);
  return st.rows > 0 ? `rerun ${st.attempts + 1}` : undefined;
};

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// Where an entry stands: which steps are still to do.
export function entryState(cfg, e) {
  const { dir, repo } = runPaths(cfg, e);
  const metrics = readJson(path.join(dir, 'metrics.json'));
  const streamed = fs.existsSync(path.join(dir, 'stream.jsonl'));
  const prepared = fs.existsSync(path.join(repo, '.git'));
  const review = isReviewTask(cfg, e.task);
  const accepted = fs.existsSync(path.join(dir, review ? 'review_score.json' : isFixtureTask(cfg, e.task) ? 'fronts.json' : 'acceptance.json'));
  let recorded = false;
  if (metrics && fs.existsSync(cfg.csvPath)) {
    recorded = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).some((r) => r.experiment === cfg.experiment && r.task === e.task
      && r.arm === e.arm && Number(r.rep) === Number(e.rep) && r.timestamp === metrics.finishedAt);
  }
  if (recorded) return { status: 'registrada', steps: [] };
  // It has rows but no run folder (cleaned after recording): done. Running it again would spend for a second row it cannot take.
  if (!metrics && !streamed && !prepared && entryRows(cfg, e).length) return { status: 'registrada', steps: [] };
  if (streamed && !metrics) return { status: 'interrumpida', steps: [] };
  const steps = [];
  if (!prepared && !streamed) steps.push('prepare');
  if (!metrics) steps.push('run');
  // A seeded-defect review has no acceptance: its step is the deterministic score.
  if (!accepted) steps.push(review ? 'score' : 'accept');
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
  let label = 'aceptación';
  if (row.defects_total !== undefined && row.defects_total !== '' && row.defects_total !== null) {
    label = 'revisión';
    accept = `defectos ${row.defects_found}/${row.defects_total}, hallazgos ${row.findings_total} (${row.findings_unmatched} sin coincidencia)`;
  }
  // A run cut by the budget cap or by the time while the agent worked is a result: valid, not green, with a censored cost.
  const censored = row.censored === true || row.censored === 'true';
  if (censored) accept = 'no verde (censurada)';
  const status = row.invalid ? `inválida: ${row.invalid_reason}`
    : censored ? `válida (terminada por ${row.termination === 'budget_cap' ? 'tope' : 'tiempo'}: censurada, costo ${fmtNum(row.cost_usd, 4)} USD)` : 'válida';
  return `[${index}/${total}] ${row.task} ${row.arm} rep ${row.rep} | costo ${fmtNum(row.cost_usd, 4)} USD | pared ${fmtNum(row.wall_s, 1)} s`
    + ` | turnos ${fmtNum(row.turns, 0)} | agentes ${fmtNum(row.agents, 0)} | activación ${row.activation_via || 'sin dato'}`
    + ` | ${label} ${accept} | ${status}`;
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
  for (const e of schedule.entries) {
    if (isReviewTask(cfg, e.task) && !cfg.arms[e.arm].reviewPrompt) problems.push(`el brazo ${e.arm} no tiene reviewPrompt (lo pide la tarea de revisión ${e.task})`);
  }
  const validation = [...new Set(schedule.entries.map((e) => e.task))].filter((t) => taskSet(cfg, t) === 'validation');
  let freeze = null;
  if (validation.length) {
    freeze = verifyFreeze(cfg);
    if (!freeze.ok) problems.push(`freeze: ${freeze.problems.join('; ')}`);
  }
  return { problems, validation, freeze };
}

export function checkMaxRetries(maxRetries) {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_RETRIES_LIMIT) {
    throw new Error(`--max-retries tiene que ser un entero entre 0 y ${MAX_RETRIES_LIMIT} (la ficha fija ${MAX_RETRIES_LIMIT} como máximo por corrida)`);
  }
  return maxRetries;
}

export async function runBatch(cfg, { schedule: file, dryRun = false, retryInfra = false, maxRetries = MAX_RETRIES_LIMIT }, { log = (s) => console.log(s) } = {}) {
  if (retryInfra) checkMaxRetries(maxRetries);
  const schedule = loadSchedule(cfg, file);
  const total = schedule.entries.length;
  const states = schedule.entries.map((e) => ({ e, ...entryState(cfg, e) }));
  const pre = preflight(cfg, schedule);

  if (dryRun) {
    log(`calendario ${path.basename(file)}: ${total} corridas (semilla ${schedule.seed}), experimento ${cfg.experiment}`);
    for (const s of states) {
      const rp = reviewPromptSha(cfg, s.e);
      log(`[${s.e.index || states.indexOf(s) + 1}/${total}] bloque ${s.e.block ?? '-'} ${s.e.task} ${s.e.arm} rep ${s.e.rep}: ${s.status}${s.steps.length ? ` -> ${s.steps.join(', ')}` : ''}${rp ? ` | revisión: pedido del brazo ${s.e.arm} sha256 ${rp.slice(0, 12)}` : ''}`);
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
    const retryCandidates = [];
    if (retryInfra && maxRetries > 0) {
      for (const s of states) {
        const st = retryState(cfg, s.e);
        if (st.infra && st.attempts < maxRetries) retryCandidates.push({ task: s.e.task, arm: s.e.arm, rep: s.e.rep, attempt: st.attempts + 1, reasons: st.reasons });
      }
      log(`reintentos por infraestructura pendientes: ${retryCandidates.length} (como mucho ${maxRetries} por corrida)`);
      for (const c of retryCandidates) log(`  ${c.task} ${c.arm} rep ${c.rep}: intento ${c.attempt} de ${maxRetries} (motivo: ${c.reasons.join(';')})`);
      // Worst case if every run still to launch also faults and uses all its reruns, plus what is already pending.
      const extra = toRun * maxRetries + retryCandidates.reduce((n, c) => n + (maxRetries - c.attempt + 1), 0);
      log(`peor caso con reintentos: ${Math.round((toRun + extra) * perRun * 10000) / 10000} USD`);
    }
    return { dryRun: true, entries: states.map((s) => ({ ...s.e, status: s.status, steps: s.steps, reviewPromptSha: reviewPromptSha(cfg, s.e) })), spent, toRun, worstCaseUsd: worst, problems: pre.problems, retryCandidates };
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
      if (s.steps.includes('score')) { step = 'score'; scoreRun(cfg, a); }
      step = 'row';
      // An entry that already has rows and is run again is a rerun of an infrastructure fault that was cut half way.
      const row = appendRow(cfg, { ...a, note: rerunNote(cfg, e) });
      log(summaryLine(i, total, row));
      results.push({ ...e, row });
    } catch (err) {
      const out = new Error(`${tag}: falló el paso ${step}: ${err.message}. El batch se detiene; al volver a correrlo con el mismo calendario retoma desde esta corrida`);
      out.results = results;
      throw out;
    }
  }
  const retries = [];
  if (retryInfra && maxRetries > 0) {
    let n = 0;
    for (const e of schedule.entries) {
      n += 1;
      const id = `${e.task} ${e.arm} rep ${e.rep}`;
      for (;;) {
        const st = retryState(cfg, e);
        if (!st.infra) break;
        if (st.attempts >= maxRetries) {
          log(`reintentos agotados: ${id} | ${st.attempts} de ${maxRetries} | sigue con fallo de infraestructura (${st.reasons.join(';')}): queda inválida y se informa`);
          break;
        }
        const attempt = st.attempts + 1;
        log(`reintento por infraestructura: ${id} | intento ${attempt} de ${maxRetries} | motivo: ${st.reasons.join(';')}`);
        let step = 'inicio';
        try {
          const a = { task: e.task, arm: e.arm, rep: e.rep };
          step = 'clean'; cleanRun(cfg, a);
          step = 'prepare'; await prepare(cfg, a);
          step = 'run'; await runTask(cfg, a);
          if (isReviewTask(cfg, e.task)) { step = 'score'; scoreRun(cfg, a); } else { step = 'accept'; await acceptRun(cfg, a); }
          step = 'row';
          const row = appendRow(cfg, { ...a, note: `rerun ${attempt}` });
          log(summaryLine(n, total, row));
          retries.push({ ...e, attempt, row });
        } catch (err) {
          const out = new Error(`[${n}/${total}] ${id}: falló el paso ${step} del reintento ${attempt}: ${err.message}. El batch se detiene; al volver a correrlo con --retry-infra retoma`);
          out.results = results;
          out.retries = retries;
          throw out;
        }
      }
    }
  }
  return { dryRun: false, results, retries };
}
