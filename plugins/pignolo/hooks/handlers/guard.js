'use strict';
// PreToolUse Bash|PowerShell (spec §11.6). Primero se evalúa el comando: si se
// bloquea, no se toma instantánea (no va a correr). Si pasa o pide confirmación,
// se toma la instantánea WIP con un plazo total acotado; si falla, se avisa con
// systemMessage sin cambiar la decisión.
// Lo no verificable sale deny o ask según `permission_mode` (spec §8.3). Con
// PIGNOLO_DISABLED=1 solo rige el conjunto catastrófico, que no se apaga nunca.
const { evaluate, UNKNOWN_BRANCH } = require('../../lib/git-guard');
const { readState } = require('../../lib/disabled');
const { pignoloHome, userHomes, claudeDirs } = require('../../lib/home');
const { snapshotWip } = require('../../lib/git-backup');
const { currentBranch } = require('../../lib/git');

const SNAPSHOT_DEADLINE_MS = 2000; // dentro del plazo de 3 s del launcher
const BRANCH_TIMEOUT_MS = 1000;

exports.SNAPSHOT_DEADLINE_MS = SNAPSHOT_DEADLINE_MS;

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const guardOff = readState({ env, cwd }).guardOff;

  const command = input.tool_input ? input.tool_input.command : undefined;
  const shell = String(input.tool_name || '').toLowerCase() === 'powershell' ? 'powershell' : 'bash';
  // Si no se puede leer la rama (plazo vencido, HEAD suelto), merge pide confirmación.
  const branch = !guardOff && typeof command === 'string' && /merge/i.test(command)
    ? (currentBranch(cwd, { timeout: BRANCH_TIMEOUT_MS }) || UNKNOWN_BRANCH) : null;
  const v = evaluate(command, {
    shell, branch, cwd, mode: input.permission_mode, home: userHomes(env)[0], claudeDirs: claudeDirs(env), pignoloHome: pignoloHome(env), onlyCatastrophic: guardOff,
    subagent: Boolean(input.agent_id), agentType: input.agent_type,
  });
  if (v.decision === 'block') {
    return { exit: 2, stderr: `pignolo bloqueó el comando: ${v.reason}. Alternativa: ${v.alternative}.\n` };
  }
  if (guardOff) return { exit: 0 };

  let note = '';
  if (env.PIGNOLO_CANARY !== '1') {
    const snapshot = ctx.snapshot || snapshotWip;
    try {
      const snap = snapshot({ cwd, reason: 'antes-de-comando', timeoutMs: SNAPSHOT_DEADLINE_MS, env, sessionId: input.session_id });
      if (snap && snap.warning) note = `pignolo: ${snap.warning}`;
    } catch (e) {
      note = `pignolo: la instantánea WIP falló (${e.message}); este comando corre sin respaldo previo.`;
    }
  }
  if (v.decision === 'ask') {
    const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: v.reason } };
    if (note) out.systemMessage = note;
    return { exit: 0, stdout: JSON.stringify(out) };
  }
  return note ? { exit: 0, stdout: JSON.stringify({ systemMessage: note }) } : { exit: 0 };
};
