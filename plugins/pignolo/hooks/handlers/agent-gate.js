'use strict';
// PreToolUse Agent. En un proyecto con pignolo activo solo se despachan agentes
// pignolo (allowlist A-11, igualdad exacta sobre tool_input.subagent_type). Antes
// de cada despacho permitido se respalda (instantánea WIP y refs) salvo con
// PIGNOLO_DISABLED=1 o el canario. /pignolo:off apaga la allowlist, no los respaldos.
// Los respaldos se reparten lo que queda del plazo del launcher (ctx.deadline): si no
// alcanza, se saltean con aviso y el despacho permitido pasa igual (spec §8.3).
const { projectState } = require('../../lib/project');
const { readState } = require('../../lib/disabled');
const { snapshotWip, backupRefs } = require('../../lib/git-backup');

const SNAPSHOT_DEADLINE_MS = 2000;
const LAUNCHER_DEADLINE_MS = 3000; // sin ctx.deadline (llamada en proceso), el del launcher
const MARGIN_MS = 400; // para devolver el resultado antes de que venza el launcher
const MIN_BUDGET_MS = 50; // por debajo, git ni arranca: se saltea
const ALLOWED = /^pignolo:[a-z][a-z0-9-]*$/;
const ALLOWED_UI = new Set(['pignolo-ui:ui-option', 'pignolo-ui:ui-auditor']);

const allowed = (t) => typeof t === 'string' && (ALLOWED.test(t) || ALLOWED_UI.has(t));

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const type = input.tool_input ? input.tool_input.subagent_type : undefined;
  const deadline = typeof ctx.deadline === 'number' ? ctx.deadline : Date.now() + LAUNCHER_DEADLINE_MS;
  const left = () => deadline - MARGIN_MS - Date.now();

  const { root, active } = projectState({ cwd, env });
  if (active && !allowed(type)) {
    const shown = String(type);
    // Explore y Plan son de lectura: su equivalente es pignolo:explorer. Para el resto
    // no hay un agente pignolo que haga lo mismo.
    const alternative = type === 'Explore' || type === 'Plan'
      ? 'usá pignolo:explorer, que también lee el repo y devuelve rutas y líneas'
      : 'hacé la tarea en la conversación principal, o pedile al humano /pignolo:off si necesita ese agente';
    return {
      exit: 2,
      stderr: `pignolo bloqueó el despacho de "${shown}": en este proyecto solo se despachan agentes pignolo:* (y pignolo-ui:ui-option, pignolo-ui:ui-auditor). Alternativa: ${alternative}.\n`,
    };
  }

  if (readState({ env, cwd: root }).guardOff || env.PIGNOLO_CANARY === '1') return { exit: 0 };

  const notes = [];
  const skipped = (what) => notes.push(`pignolo: no quedó tiempo para ${what} dentro del plazo del hook; este despacho corre sin ese respaldo.`);
  const snapshot = ctx.snapshot || snapshotWip;
  const refs = ctx.backupRefs || backupRefs;
  if (left() < MIN_BUDGET_MS) {
    skipped('la instantánea WIP');
  } else {
    try {
      const snap = snapshot({ cwd, reason: 'antes-de-despacho', timeoutMs: Math.min(SNAPSHOT_DEADLINE_MS, left()), env, sessionId: input.session_id });
      if (snap && snap.warning) notes.push(`pignolo: ${snap.warning}`);
    } catch (e) {
      notes.push(`pignolo: la instantánea WIP falló (${e.message}); este despacho corre sin respaldo previo.`);
    }
  }
  if (left() < MIN_BUDGET_MS) {
    skipped('el respaldo de refs');
  } else {
    try {
      refs({ cwd, env, outside: false, tags: false, timeoutMs: left() });
    } catch (e) {
      notes.push(`pignolo: el respaldo de refs falló (${e.message}); este despacho corre sin respaldo previo.`);
    }
  }
  return notes.length ? { exit: 0, stdout: JSON.stringify({ systemMessage: notes.join(' ') }) } : { exit: 0 };
};
