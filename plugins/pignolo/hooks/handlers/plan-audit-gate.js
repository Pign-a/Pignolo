'use strict';
// plan-audit-gate (spec §8.3, R-2, R-15, R-16): los hooks de la auditoría del plan.
//  - PreToolUse Bash|PowerShell: el agente de revisión en modo review no ejecuta.
//  - PostToolUse y PostToolUseFailure Bash|PowerShell: el agente que experimenta en modo
//    verify suma una llamada (log de solo-agregar).
//  - SubagentStop: bloquea el cierre hasta un experimento por afirmación (MAX_BLOCKS veces);
//    el intento se cuenta antes de cualquier otro trabajo.
// Filtra primero por agente y por modo vivo; callado en el éxito. Nunca reescribe mode.json.
const { projectState } = require('../../lib/project');
const { REVIEW_AGENT, VERIFY_AGENT } = require('../../lib/plan-agents');

const BASH_TOOLS = new Set(['Bash', 'PowerShell']);
const silent = () => ({ exit: 0 });

const REVIEW_DENIED = 'pignolo bloqueó el comando: el paso 1 de la auditoría lee y no ejecuta. Alternativa: listá la afirmación en `claims` del bloque json y el paso 2b la verifica.\n';

exports.run = (input, ctx = {}) => {
  const event = input.hook_event_name;
  const agent = input.agent_type;
  if (agent !== REVIEW_AGENT && agent !== VERIFY_AGENT) return silent();
  if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStop'].includes(event)) return silent();

  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const { main, active } = projectState({ cwd, env });
  if (!active) return silent();
  const pa = require('../../lib/plan-audit');
  const mode = pa.readMode({ main, now: typeof ctx.now === 'number' ? ctx.now : undefined });
  if (!mode.active) return silent();

  if (event === 'SubagentStop') return onStop({ input, main, mode, agent, pa });
  if (!BASH_TOOLS.has(input.tool_name)) return silent();
  if (event === 'PreToolUse') {
    return mode.mode === 'review' && agent === REVIEW_AGENT ? { exit: 2, stderr: REVIEW_DENIED } : silent();
  }
  // PostToolUse y PostToolUseFailure: un Bash que sale con código distinto de cero dispara el
  // segundo y no el primero, y esa es la refutación típica.
  if (mode.mode === 'verify' && agent === VERIFY_AGENT) {
    try {
      const ti = input.tool_input || {};
      pa.recordExperiment({ main, plan: mode.plan, command: typeof ti.command === 'string' ? ti.command : '' });
    } catch (e) {
      return { exit: 0, stderr: `pignolo: plan-audit-gate no pudo anotar el experimento (${e.message})\n` };
    }
  }
  return silent();
};

function onStop({ input, main, mode, agent, pa }) {
  const mine = mode.mode === 'review' ? agent === REVIEW_AGENT : agent === VERIFY_AGENT;
  if (!mine) return silent();
  // Lo primero: el intento queda contado aunque algo falle después.
  let attempt;
  try {
    attempt = pa.recordStop({ main, plan: mode.plan });
  } catch (e) {
    return { exit: 0, stderr: `pignolo: plan-audit-gate no pudo contar el intento de cierre (${e.message})\n` };
  }
  let decision;
  try {
    decision = pa.stopDecision({ mode, lastMessage: input.last_assistant_message, attempt });
  } catch (e) {
    // Un exit 2 bloquearía sin pasar por MAX_BLOCKS: se acota igual que una decisión normal.
    decision = attempt > pa.MAX_BLOCKS
      ? { block: false, incomplete: true }
      : { block: true, reason: `plan-audit-gate could not evaluate your final message (${e.message}); end it again with the required json block.` };
  }
  if (!decision) return silent();
  if (decision.block) return { exit: 0, stdout: JSON.stringify({ decision: 'block', reason: decision.reason }) };
  try { pa.markIncomplete({ main, plan: mode.plan }); } catch (_) { /* el veredicto lo lee de stops.log */ }
  return silent();
}
