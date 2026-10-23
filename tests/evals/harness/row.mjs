// The CSV of runs: metrics only, generic task ids.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths } from './config.mjs';

export const COLUMNS = [
  'experiment', 'task', 'arm', 'rep', 'timestamp', 'model', 'cost_usd', 'weighted_tokens', 'input', 'output',
  'cache_read', 'cache_write', 'wall_s', 'turns', 'agents', 'accept_pass', 'accept_fail', 'full_pass', 'full_fail',
  'timed_out', 'contamination', 'files_changed', 'lines_added', 'lines_removed', 'note',
];

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

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isRerun = (note) => /(^|;)\s*rerun\s*(;|$)/.test(note || '');

export function appendRow(cfg, args) {
  const { task, arm, rep, dir } = runPaths(cfg, args);
  const m = readJson(path.join(dir, 'metrics.json'));
  if (!m) throw new Error(`no hay metrics.json en ${dir}; corré run primero`);
  const a = readJson(path.join(dir, 'acceptance.json'));
  const c = readJson(path.join(dir, 'changes.json'));
  const userNote = args.note || '';

  const exists = fs.existsSync(cfg.csvPath);
  const text = exists ? fs.readFileSync(cfg.csvPath, 'utf8') : '';
  if (exists && text.trim()) {
    const head = text.split(/\r?\n/)[0];
    if (head !== COLUMNS.join(',')) throw new Error(`el CSV ${cfg.csvPath} tiene un encabezado distinto al esperado`);
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
  const row = {
    experiment: cfg.experiment, task, arm, rep, timestamp: m.finishedAt, model: m.model,
    cost_usd: m.costUsd, weighted_tokens: m.weightedTokens,
    input: m.tokens && m.tokens.input, output: m.tokens && m.tokens.output,
    cache_read: m.tokens && m.tokens.cacheRead, cache_write: m.tokens && m.tokens.cacheWrite,
    wall_s: m.wallS, turns: m.turns, agents: m.agents,
    accept_pass: a && a.accept && a.accept.pass, accept_fail: a && a.accept && a.accept.fail,
    full_pass: a && a.full && a.full.pass, full_fail: a && a.full && a.full.fail,
    timed_out: m.timedOut, contamination: m.contamination,
    files_changed: c && c.filesChanged, lines_added: c && c.linesAdded, lines_removed: c && c.linesRemoved,
    note: notes.filter(Boolean).join(';'),
  };
  fs.mkdirSync(path.dirname(cfg.csvPath), { recursive: true });
  let out = '';
  if (!exists || !text.trim()) out += `${COLUMNS.join(',')}\n`;
  else if (!/\n$/.test(text)) out += '\n';
  out += `${serializeRow(row)}\n`;
  fs.appendFileSync(cfg.csvPath, out);
  return row;
}
