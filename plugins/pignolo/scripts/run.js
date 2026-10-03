'use strict';
// Ciclo de vida de <main>/.pignolo/run.json (spec §6): start | task | task-end | renew | status | end.
// Salida JSON por stdout. Exit 0; 1 con el motivo en stderr (y, si hay `kind`, también en stdout);
// 2 por uso incorrecto.
// Uso: node run.js <verbo> [opciones] [--cwd <dir>]  (start --flow plan exige --plan <slug>)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { mainRoot } = require('../lib/disabled');
require('../lib/panel-hook').panelRefreshOnExit();
const { readRun, validateRun, taskList } = require('../lib/project');
const { readCounter, clearCounter, counterKey, NOTASK } = require('../lib/handback-counter');
const { pignoloHome } = require('../lib/home');
const { ensureIgnored, PIGNOLO_IGNORED: IGNORED } = require('../lib/pignolo-gitignore');
const { repoIdFor } = require('../lib/seals');
const { withDeadline } = require('../lib/git');
const { readProjectConfig } = require('../lib/project-config');
const { matchAny } = require('../lib/globs');
const { ID_RE, PLAN_RE } = require('../lib/branches');
const { readConfig } = require('../lib/profiles');
const { PROFILE_PARAMS } = require('../lib/roles');

const FLOWS = ['trivial', 'daily', 'review', 'plan'];
// Contador de los DONE rechazados con run.json ilegible (handback-gate).
const MALFORMED = '_malformed';
const WRITERS_NO_TESTS = ['pignolo:implementer', 'pignolo:fixer'];
const VERBS = {
  start: { value: ['flow', 'plan', 'ttl-min', 'cwd'], bool: ['replace'] },
  task: { value: ['id', 'worktree', 'base', 'test-ref', 'branch', 'plan', 'cwd'], multi: ['file', 'agent'], bool: ['test-authorization'] },
  'task-end': { value: ['id', 'cwd'], bool: [] },
  renew: { value: ['ttl-min', 'cwd'], bool: [] },
  status: { value: ['cwd'], bool: [] },
  end: { value: ['cwd'], bool: [] },
};

class Usage extends Error {}
class Fail extends Error {
  constructor(msg, extra) { super(msg); Object.assign(this, extra || {}); }
}

function parse(verb, argv) {
  const spec = VERBS[verb];
  const o = { multi: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Usage(`argumento inesperado: ${a}`);
    const name = a.slice(2);
    if (spec.bool.includes(name)) o[name] = true;
    else if (spec.value.includes(name) || (spec.multi || []).includes(name)) {
      i += 1;
      if (argv[i] === undefined) throw new Usage(`--${name} necesita un valor`);
      if ((spec.multi || []).includes(name)) (o.multi[name] = o.multi[name] || []).push(argv[i]);
      else o[name] = argv[i];
    } else throw new Usage(`opción desconocida para ${verb}: ${a}`);
  }
  return o;
}

function ttlMs(o) {
  const min = o['ttl-min'] === undefined ? 120 : Number(o['ttl-min']);
  if (!Number.isFinite(min) || min <= 0) throw new Usage('--ttl-min debe ser un número mayor que 0');
  return min * 60000;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Lo que se escribe: siempre v2 (R-2) y sin el alias `task` (la lectura lo agrega).
function toFile(run) {
  const o = { v: 2, flow: run.flow, started: run.started, expires: run.expires };
  if (run.plan) o.plan = run.plan;
  o.tasks = run.tasks || {};
  return o;
}

// Escritura atómica (temp + rename). El rename se reintenta: en Windows da EPERM si otro
// proceso tiene el archivo abierto en ese instante (D-7-9, medido).
function writeRun(file, run) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(run, null, 2)}\n`);
    for (let i = 0; ; i += 1) {
      try { fs.renameSync(tmp, file); break; } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || i >= 40) throw e;
        sleep(25);
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const LOCK_WAIT_MS = 60000;
const LOCK_STALE_MS = 120000;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Lock corto del archivo (D-7-9, C-07): un directorio creado con mkdir (atómico) en
// ~/.pignolo/locks/<clave del repo>/ (fuera del repo, como los contadores). Reintento acotado.
// Se toma uno cuyo dueño murió (comprobado dos veces, con una pausa) o que lleva más de
// LOCK_STALE_MS; uno sin archivo de dueño solo tras 5 s viéndolo así (no se usa el mtime: en
// Windows no es confiable). Todo leer-modificar-escribir de run.json ocurre dentro.
function withRunLock(main, fn) {
  const dir = path.join(pignoloHome(process.env), 'locks', counterKey(main), 'run.lock');
  const ownerFile = path.join(dir, 'owner');
  const readOwner = () => { try { return JSON.parse(fs.readFileSync(ownerFile, 'utf8')); } catch (_) { return null; } };
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const t0 = Date.now();
  let noOwnerSince = null;
  for (;;) {
    try { fs.mkdirSync(dir); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = readOwner();
      let stale = false;
      if (owner && Number.isInteger(owner.pid)) {
        noOwnerSince = null;
        if (Date.now() - owner.t > LOCK_STALE_MS) stale = true;
        else if (!alive(owner.pid)) {
          sleep(150);
          const again = readOwner();
          stale = Boolean(again) && again.pid === owner.pid && again.t === owner.t && !alive(owner.pid);
        }
      } else {
        noOwnerSince = noOwnerSince || Date.now();
        stale = Date.now() - noOwnerSince > 5000;
      }
      if (stale) {
        try { fs.rmSync(ownerFile, { force: true }); fs.rmdirSync(dir); } catch (_) { /* otro lo tomó */ }
        noOwnerSince = null;
        continue;
      }
      if (Date.now() - t0 > LOCK_WAIT_MS) throw new Fail(`run.json está ocupado (lock ${dir}). Alternativa: reintentá en unos segundos`, { kind: 'busy' });
      sleep(20 + Math.floor(Math.random() * 30));
    }
  }
  try {
    try { fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, t: Date.now() })); } catch (_) { /* sin dueño: vale la espera de 5 s */ }
    return fn();
  } finally {
    try { fs.rmSync(ownerFile, { force: true }); fs.rmdirSync(dir); } catch (_) { /* queda para el vencimiento */ }
  }
}

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
// Lo que se imprime: el run normalizado y, con una sola tarea, el alias `task` (R-2).
const view = (run) => {
  const v = { ...run };
  const ts = taskList(run);
  if (ts.length === 1) v.task = ts[0];
  return v;
};

// Un run.json ilegible corta con el camino para limpiarlo.
function current(main, { needRunning = true } = {}) {
  const st = readRun(main);
  if (st.malformed) throw new Fail(`${st.file} está ilegible; borralo con "run.js end" o reemplazalo con "run.js start --replace"`);
  if (needRunning && !st.running) throw new Fail('no hay un flujo en curso; corré "run.js start --flow <flujo>"');
  return st;
}

function start(o, main, env) {
  if (!FLOWS.includes(o.flow)) throw new Usage(`--flow debe ser uno de ${FLOWS.join(', ')}`);
  if (o.flow === 'plan' && !o.plan) throw new Usage('--flow plan necesita --plan <slug>');
  if (o.plan !== undefined && o.flow !== 'plan') throw new Usage('--plan solo va con --flow plan');
  if (o.plan !== undefined && !ID_RE.test(o.plan)) throw new Usage(`--plan debe cumplir ${ID_RE}`);
  const ms = ttlMs(o);
  withRunLock(main, () => {
    const st = readRun(main);
    if (!o.replace) {
      if (st.malformed) throw new Fail(`${st.file} está ilegible; usá --replace para reemplazarlo o "run.js end" para borrarlo`);
      if (st.running) throw new Fail(`ya hay un flujo en curso (${st.run.flow}) hasta ${st.run.expires}`);
    }
    if (st.run) for (const t of taskList(st.run)) clearCounter(env, main, t.id);
    clearCounter(env, main, MALFORMED);
    clearCounter(env, main, NOTASK);
    const now = Date.now();
    const run = { flow: o.flow, started: new Date(now).toISOString(), expires: new Date(now + ms).toISOString() };
    if (o.plan) run.plan = o.plan;
    ensureIgnored(main, IGNORED);
    const file = toFile({ ...run, tasks: {} }); // siempre v2 (D-7-2)
    writeRun(st.file, file);
    out({ ok: true, run: file });
  });
}

function commitOf(git, worktree, what, ref) {
  if (String(ref).startsWith('-')) throw new Usage(`${what} inválido: ${ref}`);
  let sha = '';
  try { sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: worktree }); } catch (_) { /* no es un commit */ }
  if (!sha) throw new Fail(`${what} ${ref} no es un commit de ${worktree}`);
  try { git(['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: worktree }); } catch (_) {
    throw new Fail(`${what} ${ref} no es ancestro de HEAD de ${worktree}`);
  }
  return sha;
}

// --file: relativa a la raíz de la worktree y con '/' (las rutas de git). Se normaliza
// '\' y un './' inicial; una ruta absoluta o con '..' es un error de uso.
function normFile(p) {
  const s = String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (s === '' || /^([a-zA-Z]:|\/)/.test(s) || s.split('/').includes('..')) {
    throw new Usage(`--file debe ser una ruta relativa a la worktree, sin '..': ${p}`);
  }
  return s;
}

// Cada rol escribe solo donde el gate y el handback-gate lo van a aceptar (Review Focus 5
// de 3a: fallar al registrar, no tras 8 rechazos).
function checkFiles(t, cfg) {
  const tests = t.files.filter((f) => matchAny(cfg.testPaths, f) || matchAny(cfg.protectedTestConfig, f));
  if (t.agents.includes('pignolo:test-writer')) {
    const bad = t.files.filter((f) => !matchAny(cfg.testPaths, f) || matchAny(cfg.protectedTestConfig, f));
    if (bad.length) throw new Fail(`el test-writer solo escribe en test-paths y fuera de protected-test-config: ${bad.join(', ')}. Alternativa: elegí rutas de test-paths o registrá esos archivos para el implementer`);
  } else if (!t.testAuthorization && t.agents.some((a) => WRITERS_NO_TESTS.includes(a)) && tests.length) {
    throw new Fail(`el implementer y el fixer no tocan tests ni su configuración sin --test-authorization: ${tests.join(', ')}. Alternativa: registrá esos archivos para el test-writer`);
  }
}

// Máximo de tareas a la vez: el tope del perfil de ~/.pignolo/config.json (sin config, balanced).
function taskCap(env) {
  let profile = 'balanced';
  try { profile = readConfig({ env }).profile; } catch (_) { /* config ilegible: balanced */ }
  return { profile, cap: PROFILE_PARAMS[profile].parallel };
}

function task(o, main, env) {
  if (!o.id || !ID_RE.test(o.id)) throw new Usage(`--id debe cumplir ${ID_RE}`);
  if (o.plan !== undefined && !PLAN_RE.test(o.plan)) throw new Usage(`--plan debe cumplir ${PLAN_RE}`);
  if (o.branch !== undefined && (o.branch === '' || o.branch.startsWith('-'))) throw new Usage(`--branch inválido: ${o.branch}`);
  withRunLock(main, () => taskLocked(o, main, env));
}

function taskLocked(o, main, env) {
  const st = current(main);
  if (o.plan !== undefined && st.run.plan !== undefined && st.run.plan !== o.plan) {
    throw new Fail(`--plan ${o.plan} no es el plan del flujo en curso (${st.run.plan})`);
  }
  const tasks = { ...st.run.tasks };
  const prev = Object.prototype.hasOwnProperty.call(tasks, o.id) ? tasks[o.id] : null;
  if (!prev) {
    const { profile, cap } = taskCap(env);
    if (Object.keys(tasks).length >= cap) {
      const msg = `ya hay ${cap} tarea(s) registradas, el tope del perfil ${profile}. Alternativa: cerrá una tarea (run.js task-end) o bajá la ola`;
      out({ ok: false, kind: 'too-many-tasks', limit: cap, profile, tasks: Object.keys(tasks) });
      throw new Fail(msg, { kind: 'too-many-tasks', printed: true });
    }
  }
  const worktree = o.worktree !== undefined ? path.resolve(o.cwd || process.cwd(), o.worktree) : (prev && prev.worktree);
  const baseArg = o.base !== undefined ? o.base : (prev && prev.base);
  if (!worktree || !baseArg) throw new Usage('un id nuevo necesita --worktree y --base');
  if (!fs.existsSync(worktree)) throw new Fail(`la worktree ${worktree} no existe`);

  const git = withDeadline(worktree, 15000);
  let same;
  try { same = repoIdFor({ cwd: worktree }) === repoIdFor({ cwd: main }); } catch (e) { throw new Fail(`${worktree} no es un repo de git: ${e.message}`); }
  if (!same) throw new Fail(`la worktree ${worktree} no es del mismo repo que ${main}`);

  const base = commitOf(git, worktree, 'base', baseArg);
  const testRefArg = o['test-ref'] !== undefined ? o['test-ref'] : (prev && prev.testRef);
  const testRef = testRefArg ? commitOf(git, worktree, 'test-ref', testRefArg) : undefined;

  const ref = testRef || base;
  let cfg;
  try { cfg = readProjectConfig({ root: worktree, ref, run: git }); } catch (e) { throw new Fail(`no se pudo leer .pignolo/project.md en ${ref}: ${e.message}`); }
  if (!cfg.found || !cfg.gates['on-done']) {
    throw new Fail(`la base ${ref} no tiene .pignolo/project.md commiteado con gates.on-done; commitealo antes de registrar la tarea`);
  }

  const t = { id: o.id, worktree, base };
  if (testRef) t.testRef = testRef;
  t.files = o.multi.file ? o.multi.file.map(normFile) : ((prev && prev.files) || []);
  t.agents = o.multi.agent || (prev && prev.agents) || [];
  if (o['test-authorization'] || (prev && prev.testAuthorization)) t.testAuthorization = true;
  const branch = o.branch !== undefined ? o.branch : (prev && prev.branch);
  if (branch) t.branch = branch;
  checkFiles(t, cfg);
  tasks[o.id] = t;
  const run = toFile({ ...st.run, tasks });
  const errs = validateRun(run);
  if (errs.length) throw new Fail(`la tarea no valida: ${errs.join('; ')}`);
  writeRun(st.file, run);
  clearCounter(env, main, o.id);
  clearCounter(env, main, MALFORMED);
  clearCounter(env, main, NOTASK);
  out({ ok: true, run: view(readRun(main).run) });
}

function taskEnd(o, main, env) {
  if (!o.id || !ID_RE.test(o.id)) throw new Usage(`--id debe cumplir ${ID_RE}`);
  withRunLock(main, () => {
    const st = current(main, { needRunning: false });
    if (!st.run) throw new Fail('no hay un flujo; corré "run.js start --flow <flujo>"');
    if (!Object.prototype.hasOwnProperty.call(st.run.tasks, o.id)) {
      out({ ok: false, kind: 'no-such-task', id: o.id, tasks: Object.keys(st.run.tasks) });
      throw new Fail(`la tarea ${o.id} no está registrada. Alternativa: mirá "run.js status"`, { kind: 'no-such-task', printed: true });
    }
    const tasks = { ...st.run.tasks };
    delete tasks[o.id];
    writeRun(st.file, toFile({ ...st.run, tasks }));
    clearCounter(env, main, o.id);
    out({ ok: true, run: view(readRun(main).run) });
  });
}

function renew(o, main) {
  const ms = ttlMs(o);
  withRunLock(main, () => {
    const st = current(main, { needRunning: false });
    if (!st.run) throw new Fail('no hay un flujo; corré "run.js start --flow <flujo>"');
    const run = toFile({ ...st.run, expires: new Date(Date.now() + ms).toISOString() });
    writeRun(st.file, run);
    out({ ok: true, run: view(readRun(main).run) });
  });
}

function status(o, main, env) {
  const st = readRun(main);
  const run = st.run || null;
  const tasks = {};
  if (run) for (const t of taskList(run)) tasks[t.id] = { ...t, handback: readCounter(env, main, t.id) };
  const single = run && taskList(run).length === 1 ? taskList(run)[0] : null;
  out({
    running: st.running, malformed: Boolean(st.malformed), run: run ? view(run) : null,
    tasks,
    handback: single ? readCounter(env, main, single.id) : null,
    malformedHandback: readCounter(env, main, MALFORMED),
  });
}

function end(o, main, env) {
  withRunLock(main, () => {
    const st = readRun(main);
    if (st.run) for (const t of taskList(st.run)) clearCounter(env, main, t.id);
    clearCounter(env, main, MALFORMED);
    clearCounter(env, main, NOTASK);
    const existed = fs.existsSync(st.file);
    fs.rmSync(st.file, { force: true });
    out({ ok: true, ended: existed });
  });
}

function cli(argv, env = process.env) {
  const verb = argv[0];
  if (!VERBS[verb]) throw new Usage('uso: run.js start|task|task-end|renew|status|end [opciones]');
  const o = parse(verb, argv.slice(1));
  const main = mainRoot(o.cwd || process.cwd());
  ({ start, task, 'task-end': taskEnd, renew, status, end })[verb](o, main, env);
}

try {
  cli(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`pignolo run: ${e.message}\n`);
  process.exitCode = e instanceof Usage ? 2 : 1;
}
