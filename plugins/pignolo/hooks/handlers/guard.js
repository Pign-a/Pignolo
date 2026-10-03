'use strict';
// PreToolUse Bash|PowerShell (spec §11.6). Primero se evalúa el comando: si se
// bloquea, no se toma instantánea (no va a correr). Si pasa o pide confirmación,
// la instantánea WIP se toma solo antes de lo que puede descartar trabajo o de lo
// que la guardia no puede clasificar (`v.snapshot`, D-G4), en el directorio donde
// corre ese punto del comando (`v.snapshotDirs`, H7), con un plazo total acotado;
// si falla, se avisa con systemMessage sin cambiar la decisión, salvo una forma
// `required` (solo pasa con instantánea: `snapshot-required`).
// Lo no verificable sale deny o ask según `permission_mode` (spec §8.3). Con
// PIGNOLO_DISABLED=1 solo rige el conjunto catastrófico, que no se apaga nunca.
const { evaluate, RULES } = require('../../lib/git-guard');
const { readState } = require('../../lib/disabled');
const { pignoloHome, userHomes, claudeDirs } = require('../../lib/home');
const { snapshotWip } = require('../../lib/git-backup');
const { gitRun } = require('../../lib/git');

const SNAPSHOT_DEADLINE_MS = 2000; // dentro del plazo de 3 s del launcher

exports.SNAPSHOT_DEADLINE_MS = SNAPSHOT_DEADLINE_MS;

const MAX_SNAPSHOT_DIRS = 4;

// Un directorio que es un repo con el árbol limpio no tiene nada que respaldar.
function cleanRepo(dir) {
  try {
    if (gitRun(['rev-parse', '--is-inside-work-tree'], dir, { timeout: 1000 }) !== 'true') return false;
    return gitRun(['status', '--porcelain'], dir, { timeout: 1000 }) === '';
  } catch (_) { return false; }
}

// Una instantánea por directorio real de los puntos de descarte (más el cwd del hook si alguno no se conoce).
// Devuelve { note, failed }: `failed` cuenta solo para una forma `required`.
function takeSnapshots(v, { cwd, env, sessionId, snapshot, clean }) {
  const dirs = [...new Set(v.snapshotDirs || [])];
  if (!dirs.length || v.snapshotUnknown) dirs.push(cwd);
  const list = [...new Set(dirs)].slice(0, MAX_SNAPSHOT_DIRS);
  const required = v.snapshot === 'required';
  const notes = [];
  // Un directorio desconocido nunca basta para una forma `required` (H7, RT1-04): se respalda el del hook, pero se niega.
  let failed = required && Boolean(v.snapshotUnknown);
  for (const dir of list) {
    try {
      const snap = snapshot({ cwd: dir, reason: 'antes-de-comando', timeoutMs: Math.floor(SNAPSHOT_DEADLINE_MS / list.length), env, sessionId });
      if (snap && snap.warning) notes.push(`pignolo: ${snap.warning}`);
      if (required && ((snap && snap.partial) || (!snap && !clean(dir)))) failed = true;
    } catch (e) {
      notes.push(`pignolo: la instantánea WIP falló (${e.message}); este comando corre sin respaldo previo.`);
      failed = true;
    }
  }
  return { note: notes.join(' '), failed };
}

function denySnapshot() {
  const [, reason, alternative] = RULES['snapshot-required'];
  return { exit: 2, stderr: `pignolo bloqueó el comando: ${reason}. Alternativa: ${alternative}.\n` };
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const guardOff = readState({ env, cwd }).guardOff;

  const command = input.tool_input ? input.tool_input.command : undefined;
  const shell = String(input.tool_name || '').toLowerCase() === 'powershell' ? 'powershell' : 'bash';
  const v = (ctx.evaluate || evaluate)(command, {
    shell, cwd, mode: input.permission_mode, home: userHomes(env)[0], claudeDirs: claudeDirs(env), pignoloHome: pignoloHome(env), onlyCatastrophic: guardOff,
    subagent: Boolean(input.agent_id), agentType: input.agent_type,
  });
  if (v.decision === 'block') {
    return { exit: 2, stderr: `pignolo bloqueó el comando: ${v.reason}. Alternativa: ${v.alternative}.\n` };
  }
  if (guardOff) return { exit: 0 };

  let note = '';
  const required = v.snapshot === 'required';
  if (env.PIGNOLO_CANARY === '1') {
    if (required) return denySnapshot();
  } else if (v.snapshot !== 'none') {
    const r = takeSnapshots(v, { cwd, env, sessionId: input.session_id, snapshot: ctx.snapshot || snapshotWip, clean: ctx.cleanRepo || cleanRepo });
    if (required && r.failed) return denySnapshot();
    note = r.note;
  }
  if (v.decision === 'ask') {
    const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: v.reason } };
    if (note) out.systemMessage = note;
    return { exit: 0, stdout: JSON.stringify(out) };
  }
  return note ? { exit: 0, stdout: JSON.stringify({ systemMessage: note }) } : { exit: 0 };
};
