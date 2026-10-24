// The CSV of runs: metrics only, generic task ids.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';
import { summarizeNeutralConfig } from './neutralconfig.mjs';
import { qualityColumns } from './quality.mjs';

export const COLUMNS = [
  'experiment', 'task', 'arm', 'rep', 'timestamp', 'model', 'model_resolved', 'claude_version', 'cost_usd', 'weighted_tokens',
  'input', 'output', 'cache_read', 'cache_write', 'model_tokens', 'wall_s', 'duration_ms', 'turns', 'agents', 'agents_main', 'agent_types', 'prompt_prefix_id', 'skill_calls', 'own_skill_calls', 'own_hook_ran', 'activation_via',
  'result_subtype', 'is_error', 'exit_code', 'timed_out', 'invalid', 'invalid_reason',
  'accept_exit', 'accept_pass', 'accept_fail', 'accept_suites_failed', 'full_pass', 'full_fail', 'full_baseline_fail',
  'contamination', 'neutral_plugins', 'neutral_config', 'fronts_ok', 'fronts_got', 'fronts_message', 'fronts_reason', 'fronts_by_agents', 'fronts_by_agents_ok', 'files_changed', 'lines_added', 'lines_removed', 'eol_only_files', 'eol_converted_files',
  'set', 'freeze_hash', 'prereg_commit',
  'tsc_base_errors', 'tsc_result_errors', 'tsc_new_errors', 'eslint_new_errors', 'eslint_new_warnings', 'out_of_scope_files', 'out_of_scope_lines',
  'diff_files', 'diff_lines', 'new_test_files', 'tests_added', 'coverage_lines_covered', 'coverage_lines_total',
  'mutation_killed', 'mutation_survived', 'mutation_timeout', 'quality_note', 'note',
];

// "model=input/output/cacheRead/cacheWrite" joined by "|": raw tokens per model, so summary can reweigh with the current config.
export function encodeModelTokens(byModel) {
  if (!byModel) return '';
  return Object.entries(byModel).map(([k, t]) => `${k}=${t.input}/${t.output}/${t.cacheRead}/${t.cacheWrite}`).join('|');
}
export function decodeModelTokens(text) {
  if (!text) return null;
  const out = {};
  for (const part of String(text).split('|')) {
    const at = part.lastIndexOf('=');
    if (at < 0) return null;
    const n = part.slice(at + 1).split('/').map(Number);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
    out[part.slice(0, at)] = { input: n[0], output: n[1], cacheRead: n[2], cacheWrite: n[3] };
  }
  return out;
}

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function serializeRow(obj) {
  return COLUMNS.map((c) => cell(obj[c])).join(',');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') q = false; else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// A CSV written by an older version has fewer columns (or the same in another order). It is rewritten once with the
// current header, mapping the old columns by name and leaving the new ones empty; a column that does not exist in the
// current schema is refused. Returns the migrated text, or null when the header is already the current one.
export function migratedCsvText(text) {
  const head = text.split(/\r?\n/)[0].replace(/^\uFEFF/, '');
  if (head === COLUMNS.join(',')) return null;
  const old = head.split(',').map((c) => c.trim());
  const unknown = old.filter((c) => !COLUMNS.includes(c));
  if (unknown.length) {
    throw new Error(`el CSV tiene columnas que no existen en el esquema actual (${unknown.join(', ')}); no se migra solo, revisalo a mano`);
  }
  const rows = parseCsv(text);
  return `${COLUMNS.join(',')}\n${rows.map((r) => serializeRow(r)).join('\n')}${rows.length ? '\n' : ''}`;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isRerun = (note) => /(^|;)\s*rerun\s*(;|$)/.test(note || '');

export function appendRow(cfg, args) {
  const { task, arm, rep, dir } = runPaths(cfg, args);
  const m = readJson(path.join(dir, 'metrics.json'));
  if (!m) throw new Error(`no hay metrics.json en ${dir}; corré run primero`);
  const a = readJson(path.join(dir, 'acceptance.json'));
  const c = readJson(path.join(dir, 'changes.json'));
  const fr = readJson(path.join(dir, 'fronts.json'));
  const qj = readJson(path.join(dir, 'quality.json'));
  const userNote = args.note || '';
  if (m.experiment && m.experiment !== cfg.experiment) {
    throw new Error(`la corrida se hizo con el experimento "${m.experiment}" y la fila saldría como "${cfg.experiment}"; pasá --experiment ${m.experiment}`);
  }

  const exists = fs.existsSync(cfg.csvPath);
  let text = exists ? fs.readFileSync(cfg.csvPath, 'utf8') : '';
  let migrated = null;
  if (exists && text.trim()) {
    migrated = migratedCsvText(text);
    if (migrated !== null) text = migrated;
    const dup = parseCsv(text).find((r) => r.experiment === cfg.experiment && r.task === task && r.arm === arm && Number(r.rep) === rep);
    if (dup && !isRerun(userNote)) {
      throw new Error(`ya existe una fila para ${task}/${arm}/${rep}; una repetición de la corrida necesita --note rerun`);
    }
  }
  const notes = [userNote];
  if (a && ((a.accept && a.accept.source === 'exit-code') || (a.full && a.full.source === 'exit-code'))) {
    notes.push('accept-por-codigo-de-salida');
  }
  if (m.tokenSource === 'usage') notes.push('tokens-solo-hilo-principal');
  for (const f of (c && c.flags) || []) notes.push(f);
  for (const w of m.warnings || []) notes.push(w);
  const reasons = [...new Set([...(m.invalidReasons || []), ...((a && a.invalidReasons) || []), ...((c && c.invalidReasons) || [])])];
  const row = {
    experiment: cfg.experiment, task, arm, rep, timestamp: m.finishedAt, model: m.model,
    model_resolved: m.init && m.init.model, claude_version: m.init && m.init.claude_code_version,
    cost_usd: m.costUsd, weighted_tokens: m.weightedTokens,
    input: m.tokens && m.tokens.input, output: m.tokens && m.tokens.output,
    cache_read: m.tokens && m.tokens.cacheRead, cache_write: m.tokens && m.tokens.cacheWrite,
    model_tokens: encodeModelTokens(m.tokensByModel),
    wall_s: m.wallS, duration_ms: m.durationMs, turns: m.turns, agents: m.agents, agents_main: m.agentsMain, agent_types: (m.agentTypes || []).join(';'), prompt_prefix_id: m.promptPrefix ? arm : '',
    skill_calls: m.skillCalls, own_skill_calls: m.ownSkillCalls, own_hook_ran: m.ownHookRan, activation_via: m.activationVia || '',
    result_subtype: m.resultSubtype, is_error: m.isError, exit_code: m.exitCode,
    timed_out: m.timedOut, invalid: reasons.length > 0, invalid_reason: reasons.join(';'),
    accept_exit: a && a.accept && a.accept.exitCode,
    accept_pass: a && a.accept && a.accept.pass, accept_fail: a && a.accept && a.accept.fail,
    accept_suites_failed: a && a.accept && a.accept.suitesFailed,
    full_pass: a && a.full && a.full.pass, full_fail: a && a.full && a.full.fail,
    full_baseline_fail: a && a.baselineFull && a.baselineFull.fail,
    contamination: m.contamination,
    neutral_plugins: (m.neutralPluginsLoaded || []).join(';'),
    neutral_config: summarizeNeutralConfig(m.neutralConfigContent),
    fronts_ok: fr ? String(fr.ok) : '', fronts_got: fr ? (fr.got || []).join(';') : '',
    fronts_message: fr && fr.foundIn && fr.foundIn.message !== null && fr.foundIn.message !== undefined ? String(fr.foundIn.message) : '', fronts_reason: fr && fr.reason ? fr.reason : '',
    fronts_by_agents: fr && Array.isArray(fr.frontsByAgents) ? fr.frontsByAgents.join(';') : '',
    fronts_by_agents_ok: fr && typeof fr.frontsByAgentsOk === 'boolean' ? String(fr.frontsByAgentsOk) : '',
    files_changed: c && c.filesChanged, lines_added: c && c.linesAdded, lines_removed: c && c.linesRemoved,
    eol_only_files: c && c.eolOnlyCount, eol_converted_files: c && c.eolConvertedCount,
    set: m.set || 'dev', freeze_hash: m.freezeHash || '', prereg_commit: m.preregCommit || '',
    diff_files: c && c.filesChanged, diff_lines: c && (c.linesAdded || 0) + (c.linesRemoved || 0),
    ...qualityColumns(qj),
    note: notes.filter(Boolean).join(';'),
  };
  fs.mkdirSync(path.dirname(cfg.csvPath), { recursive: true });
  if (migrated !== null) {
    // First a copy of the file as it was, then the new content through a temporary file so a cut never leaves it half written.
    const bak = fs.existsSync(`${cfg.csvPath}.bak`) ? `${cfg.csvPath}.${Date.now()}.bak` : `${cfg.csvPath}.bak`;
    fs.copyFileSync(cfg.csvPath, bak);
    fs.writeFileSync(`${cfg.csvPath}.tmp`, migrated);
    fs.renameSync(`${cfg.csvPath}.tmp`, cfg.csvPath);
  }
  let out = '';
  if (!exists || !text.trim()) out += `${COLUMNS.join(',')}\n`;
  else if (!/\n$/.test(text)) out += '\n';
  out += `${serializeRow(row)}\n`;
  fs.appendFileSync(cfg.csvPath, out);
  return row;
}
