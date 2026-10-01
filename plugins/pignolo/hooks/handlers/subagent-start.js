'use strict';
// SubagentStart (spec §6.1 y §8.3, R-5 del hito 6). Para todo agente `pignolo:*` inyecta en
// additionalContext el texto de rules/core.md y, si hay un flujo en curso cuya tarea nombra a
// este agente, la tarjeta de la tarea (<main>/.pignolo/tmp/task-<id>.md) con su worktree y rama.
// Nunca niega: ante cualquier error, ausencia o plazo calla con exit 0 (el lanzador también,
// FAIL_OPEN). Un run.json ilegible o vencido cuenta como "sin tarjeta" (R-12).
const fs = require('node:fs');
const path = require('node:path');

const CORE = path.join(__dirname, '..', '..', 'rules', 'core.md');
const CARD_LIMIT = 6000;
const CUT_MARK = '[recortada]';
const GIT_BUDGET_MS = 1000;

function branchOf(worktree) {
  try {
    const { gitRun } = require('../../lib/git');
    const b = String(gitRun(['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], worktree, { timeout: GIT_BUDGET_MS })).trim();
    return b || null;
  } catch (_) { return null; }
}

function cardSection(main, agent) {
  const { readRun } = require('../../lib/project');
  const r = readRun(main);
  const t = r.running && !r.malformed && r.run && r.run.task;
  if (!t || !Array.isArray(t.agents) || !t.agents.includes(agent)) return null;
  let card;
  try { card = fs.readFileSync(path.join(main, '.pignolo', 'tmp', `task-${t.id}.md`), 'utf8'); } catch (_) { return null; }
  card = card.replace(/\r\n/g, '\n').trim();
  if (card.length > CARD_LIMIT) card = `${card.slice(0, CARD_LIMIT)}\n${CUT_MARK}`;
  const lines = [`Tarjeta de la tarea ${t.id}:`, card, `Worktree: ${t.worktree}`];
  const branch = branchOf(t.worktree);
  if (branch) lines.push(`Rama: ${branch}`);
  return lines.join('\n');
}

exports.run = (input, ctx = {}) => {
  try {
    const agent = typeof input.agent_type === 'string' ? input.agent_type : '';
    if (!agent.startsWith('pignolo:')) return { exit: 0 };
    const env = { ...process.env, ...(ctx.env || {}) };
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const { readState, mainRoot } = require('../../lib/disabled');
    if (readState({ env, cwd }).hooksOff) return { exit: 0 };
    let core;
    try { core = fs.readFileSync(ctx.corePath || CORE, 'utf8').replace(/\r\n/g, '\n').trim(); } catch (_) { return { exit: 0 }; }
    if (!core) return { exit: 0 };
    const parts = [core];
    try {
      const card = cardSection(mainRoot(cwd), agent);
      if (card) parts.push(card);
    } catch (_) { /* sin tarjeta: solo core.md */ }
    const additionalContext = parts.join('\n\n');
    return { exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext } }) };
  } catch (_) {
    return { exit: 0 };
  }
};
