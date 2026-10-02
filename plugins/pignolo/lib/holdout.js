'use strict';
// Holdout (spec §8.2, modo plan): tests de aceptación guardados fuera del repo, en
// <pignoloHome>/holdout/<repo-id>/<plan>/. Los escribe el test-writer en
// .pignolo/tmp/holdout/<plan>/, el hilo principal los guarda (`save`) y solo el
// validator los corre (`run`) en un worktree temporal propio, con el comando declarado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pignoloHome } = require('./home');
const { repoIdFor } = require('./seals');
const { projectRoot } = require('./disabled');
const { gitRun } = require('./git');
const { readProjectConfig } = require('./project-config');
const { installDeps, shellRun: shellExec } = require('./worktrees');

const PLAN_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LEVELS = ['on-edit', 'on-done', 'pre-merge'];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const GIT_MS = 120000;
const TAIL_LINES = 40;

function checkPlan(plan) {
  if (typeof plan !== 'string' || !PLAN_RE.test(plan)) throw new Error(`plan inválido: ${plan} (minúsculas, dígitos y guiones)`);
}

function holdoutDir({ env = process.env, cwd, plan }) {
  checkPlan(plan);
  return path.join(pignoloHome(env), 'holdout', repoIdFor({ cwd }), plan);
}

// Lo que ningún subagente lee salvo el validator (hook private-reads).
function privateRoots(env = process.env) {
  const home = pignoloHome(env);
  return [path.join(home, 'holdout'), path.join(home, 'seals')];
}

// Archivos bajo `dir`, con su ruta relativa en '/'. Un enlace se rechaza.
function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) throw new Error(`${r} es un enlace; el holdout solo guarda archivos`);
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (fs.existsSync(dir)) walk('');
  return out.sort();
}

const inside = (p, dir) => {
  const rel = path.relative(dir, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

// Copia <from> (dentro de <raíz>/.pignolo/tmp/holdout/) al almacén y borra el origen.
// Si un archivo ya está en el almacén con otro contenido, no copia nada.
function saveHoldout({ cwd, env = process.env, plan, from }) {
  checkPlan(plan);
  const staging = path.join(projectRoot(cwd), '.pignolo', 'tmp', 'holdout');
  const src = path.resolve(cwd, from || '');
  let real;
  try { real = fs.realpathSync(src); } catch (_) { throw new Error(`no existe ${src}`); }
  const realStaging = fs.existsSync(staging) ? fs.realpathSync(staging) : staging;
  if (!inside(real, realStaging)) throw new Error(`--from debe estar dentro de ${staging}`);
  const files = listFiles(real);
  if (!files.length) throw new Error(`no hay archivos en ${src}`);
  const dest = holdoutDir({ env, cwd, plan });
  for (const f of files) {
    const target = path.join(dest, f);
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(fs.readFileSync(path.join(real, f)))) {
      throw new Error(`${f} ya está en el holdout de ${plan} con otro contenido`);
    }
  }
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(path.join(real, f), path.join(dest, f));
  }
  fs.rmSync(real, { recursive: true, force: true });
  return { plan, files };
}

function countHoldout({ cwd, env = process.env, plan }) {
  return { plan, count: listFiles(holdoutDir({ env, cwd, plan })).length };
}

function dropHoldout({ cwd, env = process.env, plan }) {
  const dir = holdoutDir({ env, cwd, plan });
  const existed = fs.existsSync(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  return { plan, dropped: existed };
}

const tailOf = (log) => log.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).slice(-TAIL_LINES).join('\n');

// Corre el holdout contra <ref> (HEAD por defecto) en un worktree temporal: deps-install
// si está declarado, copia el holdout con sus rutas y corre gates.<gate> del project.md
// de esa ref. Nunca un comando propio. El worktree y el temporal se borran siempre.
function runHoldout({ cwd, env = process.env, plan, ref, gate = 'on-done', timeoutMs = DEFAULT_TIMEOUT_MS }) {
  checkPlan(plan);
  if (!LEVELS.includes(gate)) throw new Error(`--gate debe ser ${LEVELS.join(' | ')}`);
  if (ref !== undefined && (typeof ref !== 'string' || !ref || ref.startsWith('-'))) throw new Error(`ref inválida: ${ref}`);
  const root = projectRoot(cwd);
  const store = holdoutDir({ env, cwd, plan });
  const files = listFiles(store);
  if (!files.length) throw new Error(`el holdout de ${plan} está vacío`);
  let sha;
  try { sha = gitRun(['rev-parse', '--verify', '--quiet', `${ref || 'HEAD'}^{commit}`], root, { timeout: GIT_MS }); } catch (_) { throw new Error(`la ref ${ref || 'HEAD'} no existe`); }
  const config = readProjectConfig({ root, ref: sha, timeoutMs: GIT_MS });
  const command = config.gates[gate];
  if (!command) throw new Error(`no hay gates.${gate} en .pignolo/project.md de ${sha}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-holdout-'));
  const wt = path.join(tmp, 'wt');
  const logFile = path.join(tmp, 'holdout.log');
  const result = { plan, ref: sha, count: files.length, exit: null, pass: false, logTail: '' };
  let added = false;
  try {
    gitRun(['worktree', 'add', '--detach', wt, sha], root, { timeout: GIT_MS });
    added = true;
    if (config.depsInstall) {
      const deps = installDeps({ cwd: wt, command: config.depsInstall, timeoutMs, logFile });
      if (!deps.ok) {
        result.exit = deps.code;
        Object.defineProperty(result, 'depsFailed', { value: true, enumerable: false });
        return result;
      }
    }
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
      fs.copyFileSync(path.join(store, f), path.join(wt, f));
    }
    result.exit = shellExec(command, { cwd: wt, timeoutMs, logFile });
    result.pass = result.exit === 0;
    return result;
  } finally {
    try { result.logTail = tailOf(fs.readFileSync(logFile, 'utf8')); } catch (_) { /* sin log */ }
    let removeFailed = false;
    if (added) {
      try { gitRun(['worktree', 'remove', '--force', wt], root, { timeout: GIT_MS }); } catch (_) { removeFailed = true; }
    }
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    // prune solo si remove falló: poda también los worktrees ajenos cuya carpeta falta
    // (y con ellos sus candados de sabotaje).
    if (removeFailed) {
      try { gitRun(['worktree', 'prune'], root, { timeout: GIT_MS }); } catch (_) { /* nada más que hacer */ }
    }
  }
}

module.exports = { PLAN_RE, holdoutDir, privateRoots, saveHoldout, countHoldout, dropHoldout, runHoldout };
