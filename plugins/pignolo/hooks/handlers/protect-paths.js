'use strict';
// PreToolUse Edit|Write|MultiEdit|NotebookEdit. Dos capas:
// - Conjunto catastrófico (spec §11.6), siempre activo, incluso con PIGNOLO_DISABLED:
//   nadie escribe .git/**, .claude/** (salvo .claude/worktrees/), .gitconfig,
//   ~/.pignolo/**, ~/.claude/settings*.json ni ~/.claude/plugins/** (lo que apagaría
//   la guardia en las sesiones siguientes). Cubre bypassPermissions, donde la
//   protección nativa no rige. `~` sale del HOME/USERPROFILE del entorno del hook.
// - Flags del interruptor (§3.3): apagable solo con PIGNOLO_DISABLED.
const fs = require('node:fs');
const path = require('node:path');
const { readState, flagPaths, mainRoot } = require('../../lib/disabled');
const { pignoloHome, userHomes, claudeDirs } = require('../../lib/home');
const { projectState, readRun } = require('../../lib/project');
const { resolveClean, isProtectedWrite, FLAG_RE } = require('../../lib/paths');

const BLOCKED = 'pignolo bloqueó la escritura: los flags del interruptor solo los escribe /pignolo:off y /pignolo:on. Alternativa: pedile al humano que escriba el comando.\n';
const PROTECTED = 'pignolo bloqueó la escritura: nadie escribe en .git, .claude (salvo .claude/worktrees), .gitconfig, ~/.pignolo, ~/.claude/settings*.json ni ~/.claude/plugins. Alternativa: usá comandos git; lo que haya que cambiar ahí lo hace el humano.\n';

const RUN_BLOCKED = 'pignolo bloqueó la escritura: .pignolo/run.json lo escriben solo las skills de pignolo desde la conversación principal. Alternativa: devolvé BLOCKED y nombrá lo que haga falta cambiar.\n';

const PROJECT_MD = '.pignolo/project.md';
const HOLDOUT_DIR = '.pignolo/tmp/holdout/';
const alt = (m) => ({ exit: 2, stderr: `pignolo bloqueó la escritura: ${m}
` });
const ALT_IMPL = 'Alternativa: un test cambia solo con test-authorization: devolvé BLOCKED y nombrá el test.';
const ALT_TW = 'Alternativa: escribí solo en test-paths o en .pignolo/tmp/holdout/; lo demás lo pide el hilo principal.';

// Raíz del worktree que contiene `file` (ruta cruda, con sus mayúsculas). Con tarea, solo
// el worktree de la tarea (spec §8.3): una ruta de otro repo no toma su configuración. Sin
// tarea, sube hasta el primer .git (sin git). path.relative compara sin mayúsculas en win32.
function worktreeOf(file, task) {
  if (task) {
    if (typeof task.worktree !== 'string' || !task.worktree) return null;
    const r = path.relative(task.worktree, file);
    return r !== '' && !r.startsWith('..') && !path.isAbsolute(r) ? task.worktree : null;
  }
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Escritura de tests por rol en el momento (spec §6/§11): espejo previo del handback-gate.
// `file` es la ruta cruda resuelta contra el cwd: los globs son sensibles a mayúsculas y
// resolveClean las pierde.
function roleRule({ input, env, cwd, file }) {
  const agent = input.agent_type;
  if (agent !== 'pignolo:implementer' && agent !== 'pignolo:fixer' && agent !== 'pignolo:test-writer') return null;
  const state = projectState({ env, cwd });
  if (!state.active) return null;
  const { run } = readRun(state.main);
  const task = run && run.task ? run.task : null;
  const wt = worktreeOf(file, task);
  if (!wt) return null;
  const rel = path.relative(wt, file).split(path.sep).join('/');
  let config;
  try {
    const { readProjectConfig } = require('../../lib/project-config');
    config = task
      ? readProjectConfig({ root: task.worktree, ref: task.testRef || task.base })
      : readProjectConfig({ root: state.main });
  } catch (e) {
    return alt(`no se pudo leer ${PROJECT_MD} para decidir si se puede escribir ${rel} (${e.message}). Alternativa: respondé BLOCKED con este motivo.`);
  }
  const { matchAny } = require('../../lib/globs');
  const isTest = matchAny(config.testPaths, rel);
  const isProt = rel === PROJECT_MD || matchAny(config.protectedTestConfig, rel);
  if (agent === 'pignolo:test-writer') {
    if (isProt) return alt(`el test-writer no escribe ${rel} (config de tests protegida). ${ALT_TW}`);
    if (!isTest && !rel.startsWith(HOLDOUT_DIR)) return alt(`el test-writer no escribe ${rel}, que está fuera de test-paths. ${ALT_TW}`);
    return null;
  }
  if (rel === PROJECT_MD) return alt(`${agent.slice(8)} no escribe ${PROJECT_MD}. ${ALT_IMPL}`);
  if (!isTest && !isProt) return null;
  const files = task && Array.isArray(task.files) ? task.files : [];
  if (task && task.testAuthorization === true && (files.includes(rel) || matchAny(files, rel))) return null;
  return alt(`${agent.slice(8)} no escribe ${rel} (test o config de tests) sin autorización. ${ALT_IMPL}`);
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (target === undefined || target === null || target === '') return { exit: 0 };
  if (typeof target !== 'string') return { exit: 2, stderr: 'pignolo bloqueó la escritura: la ruta no es texto.\n' };

  const home = userHomes(env)[0];
  const abs = resolveClean(target, cwd, home);
  if (isProtectedWrite(abs, { home, pignoloHome: pignoloHome(env), claudeDirs: claudeDirs(env) })) return { exit: 2, stderr: PROTECTED };
  if (readState({ env, cwd }).guardOff) return { exit: 0 };

  // run.json lo escriben solo las skills desde la conversación principal: un subagente
  // (payload con agent_id) no.
  if (input.agent_id && abs === resolveClean(path.join(mainRoot(cwd), '.pignolo', 'run.json'), cwd)) {
    return { exit: 2, stderr: RUN_BLOCKED };
  }

  const flags = flagPaths({ env, cwd });
  if (FLAG_RE.test(abs) || abs === resolveClean(flags.global, cwd) || abs === resolveClean(flags.project, cwd)) {
    return { exit: 2, stderr: BLOCKED };
  }
  return roleRule({ input, env, cwd, file: path.resolve(cwd, target) }) || { exit: 0 };
};
