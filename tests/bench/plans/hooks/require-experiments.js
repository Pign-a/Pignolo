#!/usr/bin/env node
'use strict';
// Hook de M6 (paso B, el experimentador): no lo deja terminar mientras haya corrido
// menos experimentos (llamadas a Bash) que afirmaciones le pasó el paso A.
//   node require-experiments.js <scratch>   (o PLAN_BENCH_SCRATCH)
// Lo registra el runner en un settings por corrida (`--settings <scratch>/settings.json`):
// - PostToolUse de Bash: anota una línea en <scratch>/bash-calls.log. Hace falta porque
//   con `-p --no-session-persistence` no se escribe la transcripción (transcript_path
//   apunta a un archivo que no existe; verificado con Claude Code 2.1.285).
// - Stop: cuenta los tool_use de Bash de la transcripción (si existe) y los anotados, se
//   queda con el mayor, y si es menor que las afirmaciones de <scratch>/claims.json
//   responde {"decision":"block"} con cuántos faltan. Bloquea como mucho MAX_BLOCKS veces
//   por corrida (estado en <scratch>/hook-state.json) y después deja terminar.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BLOCKS = 2;

function countBashInTranscript(text) {
  const ids = new Set();
  let anonymous = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch (_) { continue; }
    const content = entry && entry.type === 'assistant' && entry.message && entry.message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || c.type !== 'tool_use' || c.name !== 'Bash') continue;
      if (c.id) ids.add(c.id); else anonymous += 1;
    }
  }
  return ids.size + anonymous;
}

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } };
const readText = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; } };

function handle(payload, scratch) {
  const event = payload.hook_event_name;
  if (event === 'PostToolUse') {
    if (payload.tool_name === 'Bash') {
      const command = payload.tool_input && payload.tool_input.command;
      fs.appendFileSync(path.join(scratch, 'bash-calls.log'), `${JSON.stringify(String(command || ''))}\n`);
    }
    return null;
  }
  if (event !== 'Stop') return null;
  const raw = readJson(path.join(scratch, 'claims.json'), null);
  const claims = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.claims) ? raw.claims : []);
  const logged = readText(path.join(scratch, 'bash-calls.log')).split('\n').filter((l) => l.trim()).length;
  const count = Math.max(countBashInTranscript(readText(payload.transcript_path || '')), logged);
  const stateFile = path.join(scratch, 'hook-state.json');
  const state = { blocks: 0, ...readJson(stateFile, {}) };
  state.lastCount = count;
  state.claims = claims.length;
  let out = null;
  if (count < claims.length && state.blocks < MAX_BLOCKS) {
    state.blocks += 1;
    const missing = claims.length - count;
    out = {
      decision: 'block',
      reason: `You ran ${count} experiment(s) for ${claims.length} claim(s): ${missing} experiment(s) still missing. `
        + `For each remaining claim (${claims.map((c) => c.id).filter(Boolean).join(', ')}), write a small script in ${scratch} with Write `
        + 'and run it with Bash (`node <file>`), then give the final json array again.',
    };
  }
  fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`);
  return out;
}

function main() {
  const scratch = process.argv[2] || process.env.PLAN_BENCH_SCRATCH;
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    try {
      const out = scratch ? handle(JSON.parse(input || '{}'), scratch) : null;
      if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
      process.stderr.write(`require-experiments: ${e.message}\n`); // nunca traba la sesión
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { countBashInTranscript, handle, MAX_BLOCKS };
