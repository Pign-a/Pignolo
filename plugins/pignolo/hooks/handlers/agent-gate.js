'use strict';
// PreToolUse Agent. En un proyecto con pignolo activo solo se despachan agentes
// pignolo (allowlist A-11, igualdad exacta sobre tool_input.subagent_type). Antes
// de cada despacho permitido se respalda (instantánea WIP y refs) salvo con
// PIGNOLO_DISABLED=1 o el canario. /pignolo:off apaga la allowlist, no los respaldos.
const { projectState } = require('../../lib/project');
const { readState } = require('../../lib/disabled');
const { snapshotWip, backupRefs } = require('../../lib/git-backup');

const SNAPSHOT_DEADLINE_MS = 2000;
const ALLOWED = /^pignolo:[a-z][a-z0-9-]*$/;
const ALLOWED_UI = new Set(['pignolo-ui:ui-option', 'pignolo-ui:ui-auditor']);

const allowed = (t) => typeof t === 'string' && (ALLOWED.test(t) || ALLOWED_UI.has(t));

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const type = input.tool_input ? input.tool_input.subagent_type : undefined;

  const { root, active } = projectState({ cwd, env });
  if (active && !allowed(type)) {
    const shown = String(type);
    return {
      exit: 2,
      stderr: `pignolo bloqueó el despacho de "${shown}": en este proyecto solo se despachan agentes pignolo:* (y pignolo-ui:ui-option, pignolo-ui:ui-auditor). Alternativa: usá el agente pignolo equivalente (p. ej. pignolo:explorer en lugar de Explore).\n`,
    };
  }

  if (readState({ env, cwd: root }).guardOff || env.PIGNOLO_CANARY === '1') return { exit: 0 };

  const notes = [];
  const snapshot = ctx.snapshot || snapshotWip;
  const refs = ctx.backupRefs || backupRefs;
  try {
    const snap = snapshot({ cwd, reason: 'antes-de-despacho', timeoutMs: SNAPSHOT_DEADLINE_MS, env, sessionId: input.session_id });
    if (snap && snap.warning) notes.push(`pignolo: ${snap.warning}`);
  } catch (e) {
    notes.push(`pignolo: la instantánea WIP falló (${e.message}); este despacho corre sin respaldo previo.`);
  }
  try {
    refs({ cwd, env, outside: false });
  } catch (e) {
    notes.push(`pignolo: el respaldo de refs falló (${e.message}); este despacho corre sin respaldo previo.`);
  }
  return notes.length ? { exit: 0, stdout: JSON.stringify({ systemMessage: notes.join(' ') }) } : { exit: 0 };
};
