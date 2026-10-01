#!/usr/bin/env node
'use strict';
// "Autor oráculo" de la prueba de brainstorm. El brazo lo llama con un mensaje para el autor:
//   node ask.js "<mensaje>"      o      node ask.js --file <archivo con el mensaje>
// Corre `claude -p` (sonnet) con las decisiones de truth.json como único conocimiento y
// devuelve por stdout la respuesta del autor. Anota cada mensaje y respuesta en
// $BS_LOG_DIR/ask.jsonl. Con BS_ORACLE_MOCK=1 no llama a claude (prueba del arnés, gratis).
// En la copia de cada corrida se deja como `ask.js` un envoltorio de una línea que carga
// este archivo desde $BS_BENCH_DIR: la verdad (truth.json) nunca está dentro de la copia.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function systemPrompt(benchDir) {
  const truth = JSON.parse(fs.readFileSync(path.join(benchDir, 'truth.json'), 'utf8'));
  const request = fs.readFileSync(path.join(benchDir, 'request.txt'), 'utf8').trim();
  const decisions = truth.decisions.map((d) => `- ${d.decision}`).join('\n');
  return fs.readFileSync(path.join(benchDir, 'oracle.md'), 'utf8')
    .replace('{{REQUEST}}', () => request).replace('{{DECISIONS}}', () => decisions);
}

function answer(question, { benchDir, env = process.env } = {}) {
  if (env.BS_ORACLE_MOCK === '1') return { text: 'No sé, decidí vos.', costUsd: 0, error: null };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-oracle-'));
  try {
    const r = spawnSync('claude', ['-p', '--model', 'sonnet', '--output-format', 'json', '--system-prompt', systemPrompt(benchDir),
      '--tools', '', '--setting-sources', 'project,local', '--strict-mcp-config', '--no-session-persistence',
      '--disable-slash-commands', '--max-budget-usd', '0.25'], {
      cwd, env, input: `Mensaje del agente:\n\n${question}`, encoding: 'utf8', timeout: 100 * 1000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (_) { /* queda el error */ }
    if (!json || json.is_error || typeof json.result !== 'string') {
      return { text: '', costUsd: (json && Number(json.total_cost_usd)) || 0, error: r.error ? r.error.message : `oráculo sin respuesta (exit ${r.status}): ${String(r.stdout || r.stderr).slice(0, 300)}` };
    }
    return { text: json.result.trim(), costUsd: Number(json.total_cost_usd) || 0, error: null };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function main(argv, env = process.env) {
  const benchDir = env.BS_BENCH_DIR || __dirname;
  const question = argv[0] === '--file' ? fs.readFileSync(argv[1], 'utf8') : argv.join(' ');
  if (!question.trim()) { process.stderr.write('uso: node ask.js "<mensaje>" | node ask.js --file <archivo>\n'); return 2; }
  const t0 = Date.now();
  const a = answer(question, { benchDir, env });
  if (env.BS_LOG_DIR) {
    fs.mkdirSync(env.BS_LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(env.BS_LOG_DIR, 'ask.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), question, answer: a.text, answerWords: words(a.text), costUsd: a.costUsd, seconds: (Date.now() - t0) / 1000, error: a.error })}\n`);
  }
  if (a.error) { process.stderr.write(`el autor no está disponible: ${a.error}\n`); return 1; }
  process.stdout.write(`Respuesta del autor (en su turno):\n${a.text}\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { answer, systemPrompt, words, main };
