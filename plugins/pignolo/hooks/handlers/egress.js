'use strict';
// PreToolUse WebSearch|WebFetch|mcp__.* (spec §8.3, R-7 del hito 6). Rige solo para subagentes
// (payload con agent_id) con pignolo activo y un flujo en curso (run.json vigente; uno ilegible
// cuenta como en curso: falla cerrado, R-12). El hilo principal y lo que pasa fuera de un flujo
// no se tocan. La decisión es lib/egress.js (pura); acá solo se leen el proyecto y el flujo.
// Filtra evento y agente antes de cargar nada de git.
const fs = require('node:fs');
const path = require('node:path');
const { classifyTool, projectIdentifiers, originPathOf, decideEgress, RESEARCHER } = require('../../lib/egress');

const GIT_BUDGET_MS = 1000;

// Rutas de los worktrees (git worktree list, con plazo) más <main>/.pignolo/worktrees/* (sin git).
function worktreesOf(main) {
  const out = new Set();
  try {
    const { withDeadline } = require('../../lib/git');
    const git = withDeadline(main, GIT_BUDGET_MS);
    const porcelain = git(['--no-optional-locks', 'worktree', 'list', '--porcelain']);
    for (const line of porcelain.split(/\r?\n/)) if (line.startsWith('worktree ')) out.add(line.slice(9).trim());
  } catch (_) { /* sin git o plazo vencido: quedan las rutas que se conocen sin git */ }
  try {
    const dir = path.join(main, '.pignolo', 'worktrees');
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) out.add(path.join(dir, d.name));
  } catch (_) { /* sin carpeta */ }
  return [...out];
}

function originOf(main) {
  try {
    const { gitRun } = require('../../lib/git');
    return originPathOf(gitRun(['config', '--get', 'remote.origin.url'], main, { timeout: GIT_BUDGET_MS }));
  } catch (_) { return null; }
}

exports.run = (input, ctx = {}) => {
  if (!input.agent_id) return { exit: 0 };
  const tool = String(input.tool_name || '');
  if (classifyTool(tool) === 'other') return { exit: 0 };
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const { projectState, readRun } = require('../../lib/project');
  const state = projectState({ cwd, env });
  if (!state.active) return { exit: 0 };
  const flow = readRun(state.main);
  if (!flow.running) return { exit: 0 };

  let project = null;
  if (classifyTool(tool) === 'web' && input.agent_type === RESEARCHER) {
    let piiPatterns = [];
    try {
      piiPatterns = require('../../lib/project-config').readProjectConfig({ root: state.main }).piiPatterns;
    } catch (e) {
      return { exit: 2, stderr: `pignolo bloqueó ${tool}: no se pudo leer .pignolo/project.md para filtrar la consulta (${e.message}). Alternativa: devolvé BLOCKED con este motivo; el hilo principal corrige project.md.\n` };
    }
    project = { piiPatterns, identifiers: projectIdentifiers({ main: state.main, worktrees: worktreesOf(state.main), originPath: originOf(state.main) }) };
  }
  const d = decideEgress({ tool, agentType: input.agent_type, hasAgentId: true, flow, toolInput: input.tool_input, project });
  if (d.allow) return { exit: 0 };
  return { exit: 2, stderr: `pignolo bloqueó ${tool}: ${d.reason} Alternativa: ${d.alternative}.\n` };
};
