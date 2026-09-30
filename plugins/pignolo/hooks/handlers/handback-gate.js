'use strict';
// handback-gate (spec §8.3). SubagentStop de los escritores pignolo y PreToolUse sobre
// SubagentHandback: un DONE pasa solo con un sello on-done PASS (o NO_TESTS con razón) del
// árbol de trabajo de la worktree de la tarea y la integridad de tests en verde. Nunca corre
// la suite. BLOCKED y NEEDS_CONTEXT pasan siempre. El intento cuenta (y se persiste) antes
// de tocar git; desde el intento 8 se verifica igual y, si no pasa, la tarea queda BLOCKED y
// se deja pasar (sin bucle). Los cierres sin palabra cuentan en la tarea. PostToolUse sobre
// Agent le avisa al hilo principal si la tarea no pasó. Callado en el éxito.
// Los módulos de git se cargan solo después de filtrar evento y agente (carga perezosa):
// en un despacho suelto este hook no cuesta más que el arranque.
const { projectState, readRun } = require('../../lib/project');
const { readCounter, writeCounter } = require('../../lib/handback-counter');

const WRITERS = new Set(['pignolo:implementer', 'pignolo:fixer', 'pignolo:test-writer']);
const WORDS = new Set(['DONE', 'BLOCKED', 'NEEDS_CONTEXT']);
const CAP = 8;
const LAUNCHER_DEADLINE_MS = 3000; // sin ctx.deadline (llamada en proceso), el del launcher
const MARGIN_MS = 400;
const PROJECT_MD = '.pignolo/project.md';
const PLUGIN_ROOT = require('node:path').join(__dirname, '..', '..');
const MALFORMED = '_malformed';

// Última línea no vacía, sin `*` ni `` ` `` y sin puntuación final.
function lastWord(message) {
  if (typeof message !== 'string') return null;
  const lines = message.split(/\r?\n/).map((l) => l.replace(/[*`]/g, '').trim()).filter(Boolean);
  if (!lines.length) return null;
  const w = lines[lines.length - 1].replace(/[.!:;,]+$/, '').trim();
  return WORDS.has(w) ? w : null;
}

const silent = () => ({ exit: 0 });

function postToolUse(input, env) {
  const type = input.tool_input ? input.tool_input.subagent_type : undefined;
  if (!WRITERS.has(type)) return silent();
  try {
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
    const { main, active } = projectState({ cwd, env });
    if (!active) return silent();
    const r = readRun(main);
    if (r.malformed) {
      // run.json ilegible: el contador _malformed (lo borran run.js start, task y end).
      const m = readCounter(env, cwd, MALFORMED);
      if (!(m.blocked || (m.count > 0 && !m.accepted))) return silent();
      const additionalContext = `pignolo: el marcador del flujo (${r.file}) está ilegible y el handback-gate rechazó el DONE del escritor; tratá la tarea como BLOCKED y limpialo con run.js end o start --replace.`;
      return { exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }) };
    }
    const task = r.run && r.run.task;
    if (!task) return silent();
    const c = readCounter(env, cwd, task.id);
    if (!(c.blocked || (c.count > 0 && !c.accepted))) return silent();
    const additionalContext = `pignolo: la tarea ${task.id} no pasó el handback-gate (${c.lastReason || 'sin motivo registrado'}); tratala como BLOCKED y no la des por terminada.`;
    return { exit: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }) };
  } catch (e) {
    // PostToolUse nunca bloquea (la herramienta ya corrió).
    return { exit: 0, stderr: `pignolo: handback-gate no pudo leer el contador (${e.message})\n` };
  }
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const now = typeof ctx.now === 'number' ? ctx.now : Date.now();

  // 1. Evento y mensaje.
  if (input.hook_event_name === 'PostToolUse') return input.tool_name === 'Agent' ? postToolUse(input, env) : silent();
  let message;
  if (input.tool_name === 'SubagentHandback') message = input.tool_input ? input.tool_input.message : undefined;
  else if (input.hook_event_name === 'SubagentStop') message = input.last_assistant_message;
  else return silent();
  const isStop = input.tool_name !== 'SubagentHandback';

  // 2. Solo los escritores pignolo (el matcher de SubagentHandback no filtra por agente).
  if (!WRITERS.has(input.agent_type)) return silent();

  // 3. Proyecto activo y hooks encendidos.
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const { main, active } = projectState({ cwd, env });
  if (!active) return silent();

  // 4. Última palabra, antes que todo lo demás.
  const word = lastWord(message);
  if (word === 'BLOCKED' || word === 'NEEDS_CONTEXT') return silent();

  // 5. run.json.
  const state = readRun(main, now);
  let key;
  let taskId;
  let task = null;
  let preReason = null;
  if (state.malformed) {
    key = MALFORMED;
    taskId = MALFORMED;
    preReason = `el marcador del flujo (${state.file}) no se puede leer, así que no se puede verificar este DONE. Alternativa: respondé BLOCKED con este motivo; el hilo principal lo limpia con run.js end (o start --replace).`;
  } else {
    task = state.run && state.run.task;
    if (!task) return silent(); // sin run.json o sin tarea de escritura (vencido o no)
    taskId = task.id;
    // 6. Salto del SubagentStop posterior a un handback aceptado del mismo agente.
    if (isStop) {
      const prev = readCounter(env, cwd, task.id);
      if (prev.accepted && prev.acceptedAgentId === input.agent_id) return silent();
    }
    // El cierre sin palabra cuenta en la tarea: lo reinician la aceptación y run.js task,
    // y PostToolUse lo ve.
    key = task.id;
    if (!word) {
      preReason = 'el mensaje no termina con una palabra de cierre. Alternativa: terminá con DONE, BLOCKED o NEEDS_CONTEXT en la última línea.';
    } else if (!require('node:fs').existsSync(task.worktree)) {
      preReason = `la worktree de la tarea (${task.worktree}) no existe. Alternativa: respondé BLOCKED con este motivo; el orquestador tiene que registrar la tarea de nuevo (run.js task) o cerrar el flujo.`;
    }
  }

  // 7. El intento cuenta antes de cualquier git.
  const c = readCounter(env, cwd, key);
  c.count += 1;
  c.stopHookActive = [...(Array.isArray(c.stopHookActive) ? c.stopHookActive : []), input.stop_hook_active === true];
  c.accepted = false;
  writeCounter(env, cwd, key, c);

  // 12. Bloqueo: motivo guardado y exit 2. Desde el tope (8), BLOCKED y exit 0: sin bucle.
  const block = (reason) => {
    c.lastReason = reason;
    if (c.count >= CAP) c.blocked = true;
    try { writeCounter(env, cwd, key, c); } catch (_) { /* el intento ya contó en el paso 7 */ }
    if (c.blocked) {
      const systemMessage = `pignolo: la tarea ${taskId} quedó BLOCKED tras ${c.count} intentos rechazados del handback-gate (${reason}). Revisala antes de seguir.`;
      return { exit: 0, stdout: JSON.stringify({ systemMessage }) };
    }
    return { exit: 2, stderr: `pignolo: handback-gate rechazó el DONE: ${reason}\n` };
  };
  if (preReason) return block(preReason);

  // 8-10. Verificación con git, bajo un único plazo.
  let reason;
  try {
    reason = verify({ input, ctx, env, now, task });
  } catch (e) {
    // 13. Error de git o plazo vencido: nunca aceptar por error.
    reason = /no existe en/.test(String(e && e.message)) && e.pignoloRef
      ? `la referencia ${e.pignoloRef} de la tarea no existe en ${task.worktree}. Alternativa: respondé BLOCKED con este motivo; el orquestador tiene que registrar la tarea con una base válida.`
      : 'no se pudo verificar el sello dentro del plazo; se reintenta al próximo cierre';
  }
  if (reason) return block(reason);

  // 11. Aceptado.
  writeCounter(env, cwd, key, { ...c, count: 0, accepted: true, acceptedAgentId: input.agent_id, blocked: false });
  return silent();
};

// Devuelve el motivo de rechazo o null si el DONE se acepta.
function verify({ input, ctx, env, now, task }) {
  const { withDeadline } = require('../../lib/git');
  const { workingTree, changedFiles } = require('../../lib/changes');
  const { repoIdFor, findSeal } = require('../../lib/seals');
  const { readProjectConfig } = require('../../lib/project-config');
  const { matchAny } = require('../../lib/globs');

  const deadline = typeof ctx.deadline === 'number' ? ctx.deadline : now + LAUNCHER_DEADLINE_MS;
  const run = ctx.run || withDeadline(task.worktree, deadline - MARGIN_MS - Date.now());
  const wt = task.worktree;
  const ref = task.testRef || task.base;

  const tree = workingTree({ cwd: wt, run });
  if (input.agent_type !== 'pignolo:test-writer') {
    const repoId = repoIdFor({ cwd: wt, run });
    const seal = findSeal({ env, repoId, treeHash: tree, level: 'on-done' });
    if (!seal) {
      return `no hay un sello de on-done para el árbol actual de ${wt}. Alternativa: corré node "${PLUGIN_ROOT}/scripts/gate.js" --level on-done --task y, si falla, arreglalo o respondé BLOCKED con el motivo.`;
    }
    if (seal.task !== task.id) {
      return `el sello de on-done del árbol actual de ${wt} no es de la tarea ${task.id} (es de ${seal.task || 'ninguna tarea'}), así que no midió su alcance. Alternativa: corré node "${PLUGIN_ROOT}/scripts/gate.js" --level on-done --task y, si falla, arreglalo o respondé BLOCKED con el motivo.`;
    }
    const noTestsOk = seal.status === 'NO_TESTS' && typeof seal.noTestsReason === 'string' && seal.noTestsReason.trim() !== '';
    if (seal.status !== 'PASS' && !noTestsOk) {
      const why = seal.status === 'NO_TESTS' ? 'NO_TESTS sin razón registrada' : seal.status;
      return `el sello de on-done del árbol actual de ${wt} quedó ${why}. Alternativa: arreglalo y volvé a correr node "${PLUGIN_ROOT}/scripts/gate.js" --level on-done --task, o respondé BLOCKED con el motivo.`;
    }
  }

  let config;
  try {
    config = readProjectConfig({ root: wt, ref, run });
  } catch (e) {
    if (/no existe en/.test(e.message)) e.pignoloRef = ref;
    throw e;
  }
  const changed = changedFiles({ cwd: wt, base: ref, tree, run, sizes: false }).map((f) => f.path);
  const isTest = (p) => matchAny(config.testPaths, p);
  const isProtected = (p) => p === PROJECT_MD || matchAny(config.protectedTestConfig, p);

  if (input.agent_type === 'pignolo:test-writer') {
    const files = Array.isArray(task.files) ? task.files : [];
    const inCard = (p) => files.includes(p) || matchAny(files, p);
    const bad = changed.filter((p) => !isTest(p) || isProtected(p) || !inCard(p));
    if (bad.length) {
      return `el test-writer solo puede cambiar archivos de su tarjeta (--file) que estén en test-paths, y ninguno de protected-test-config; cambió: ${bad.join(', ')}. Alternativa: deshacé esos cambios o respondé BLOCKED con el motivo.`;
    }
    if (task.testAuthorization !== true) {
      const { weakenings } = require('../../lib/test-integrity');
      const weak = weakenings({ cwd: wt, base: ref, tree, timeoutMs: Math.max(1, deadline - MARGIN_MS - Date.now()), testPaths: config.testPaths, protectedTestConfig: config.protectedTestConfig });
      if (weak.length) {
        return `el test-writer debilitó tests: ${weak.map((w) => `${w.kind} en ${w.path}:${w.line}`).join(', ')}. Alternativa: escribí tests nuevos; no debilites los existentes.`;
      }
    }
    return null;
  }
  // Con test-authorization, los tests pueden cambiar; project.md sigue protegido (Review Focus 2).
  const altered = task.testAuthorization === true
    ? changed.filter((p) => p === PROJECT_MD)
    : changed.filter((p) => isTest(p) || isProtected(p));
  if (altered.length) {
    return `se alteraron tests o config de tests protegidos sin autorización (test-authorization): ${altered.join(', ')}. Alternativa: deshacé esos cambios o respondé BLOCKED pidiendo autorización.`;
  }
  return null;
}
