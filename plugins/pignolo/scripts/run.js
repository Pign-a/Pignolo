'use strict';
// Ciclo de vida de <main>/.pignolo/run.json (spec §6): start | task | renew | status | end.
// Salida JSON por stdout. Exit 0; 1 con el motivo en stderr; 2 por uso incorrecto.
// Uso: node run.js <verbo> [opciones] [--cwd <dir>]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { mainRoot } = require('../lib/disabled');
const { readRun, validateRun } = require('../lib/project');
const { readCounter, clearCounter } = require('../lib/handback-counter');
const { ensureIgnored } = require('../lib/pignolo-gitignore');
const { repoIdFor } = require('../lib/seals');
const { withDeadline } = require('../lib/git');
const { readProjectConfig } = require('../lib/project-config');
const { matchAny } = require('../lib/globs');

const FLOWS = ['trivial', 'daily', 'review', 'plan'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Contador de los DONE rechazados con run.json ilegible (handback-gate).
const MALFORMED = '_malformed';
// .pignolo/.gitignore: él mismo (sin commitear, contaría como un archivo más del diff y
// ningún cambio sería trivial), la marca, el flag, los temporales de las skills y sus worktrees.
const IGNORED = ['.gitignore', 'run.json', '.disabled', 'tmp/', 'worktrees/'];
const WRITERS_NO_TESTS = ['pignolo:implementer', 'pignolo:fixer'];
const VERBS = {
  start: { value: ['flow', 'ttl-min', 'cwd'], bool: ['replace'] },
  task: { value: ['id', 'worktree', 'base', 'test-ref', 'cwd'], multi: ['file', 'agent'], bool: ['test-authorization'] },
  renew: { value: ['ttl-min', 'cwd'], bool: [] },
  status: { value: ['cwd'], bool: [] },
  end: { value: ['cwd'], bool: [] },
};

class Usage extends Error {}
class Fail extends Error {}

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

// Escritura atómica (temp + rename).
function writeRun(file, run) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(run, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);

// Un run.json ilegible corta con el camino para limpiarlo.
function current(main, { needRunning = true } = {}) {
  const st = readRun(main);
  if (st.malformed) throw new Fail(`${st.file} está ilegible; borralo con "run.js end" o reemplazalo con "run.js start --replace"`);
  if (needRunning && !st.running) throw new Fail('no hay un flujo en curso; corré "run.js start --flow <flujo>"');
  return st;
}

function start(o, main, env) {
  if (!FLOWS.includes(o.flow)) throw new Usage(`--flow debe ser uno de ${FLOWS.join(', ')}`);
  const ms = ttlMs(o);
  const st = readRun(main);
  if (!o.replace) {
    if (st.malformed) throw new Fail(`${st.file} está ilegible; usá --replace para reemplazarlo o "run.js end" para borrarlo`);
    if (st.running) throw new Fail(`ya hay un flujo en curso (${st.run.flow}) hasta ${st.run.expires}`);
  }
  if (st.run && st.run.task) clearCounter(env, main, st.run.task.id);
  clearCounter(env, main, MALFORMED);
  const now = Date.now();
  const run = { v: 1, flow: o.flow, started: new Date(now).toISOString(), expires: new Date(now + ms).toISOString() };
  ensureIgnored(main, IGNORED);
  writeRun(st.file, run);
  out({ ok: true, run });
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

function task(o, main, env) {
  if (!o.id || !ID_RE.test(o.id)) throw new Usage(`--id debe cumplir ${ID_RE}`);
  const st = current(main);
  const prev = st.run.task && st.run.task.id === o.id ? st.run.task : null;
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
  checkFiles(t, cfg);
  const run = { ...st.run, task: t };
  const errs = validateRun(run);
  if (errs.length) throw new Fail(`la tarea no valida: ${errs.join('; ')}`);
  if (st.run.task && st.run.task.id !== o.id) clearCounter(env, main, st.run.task.id);
  writeRun(st.file, run);
  clearCounter(env, main, o.id);
  clearCounter(env, main, MALFORMED);
  out({ ok: true, run });
}

function renew(o, main) {
  const ms = ttlMs(o);
  const st = current(main, { needRunning: false });
  if (!st.run) throw new Fail('no hay un flujo; corré "run.js start --flow <flujo>"');
  const run = { ...st.run, expires: new Date(Date.now() + ms).toISOString() };
  writeRun(st.file, run);
  out({ ok: true, run });
}

function status(o, main, env) {
  const st = readRun(main);
  const run = st.run || null;
  out({
    running: st.running, malformed: Boolean(st.malformed), run,
    handback: run && run.task ? readCounter(env, main, run.task.id) : null,
    malformedHandback: readCounter(env, main, MALFORMED),
  });
}

function end(o, main, env) {
  const st = readRun(main);
  if (st.run && st.run.task) clearCounter(env, main, st.run.task.id);
  clearCounter(env, main, MALFORMED);
  const existed = fs.existsSync(st.file);
  fs.rmSync(st.file, { force: true });
  out({ ok: true, ended: existed });
}

function cli(argv, env = process.env) {
  const verb = argv[0];
  if (!VERBS[verb]) throw new Usage('uso: run.js start|task|renew|status|end [opciones]');
  const o = parse(verb, argv.slice(1));
  const main = mainRoot(o.cwd || process.cwd());
  ({ start, task, renew, status, end })[verb](o, main, env);
}

try {
  cli(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`pignolo run: ${e.message}\n`);
  process.exitCode = e instanceof Usage ? 2 : 1;
}
