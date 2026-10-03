'use strict';
// Registro de estado del panel (R-P1 a R-P6): <main>/.pignolo/panel-state.json, formato
// `pignolo-panel-state/1`. Lo escribe pignolo (este módulo) y lo lee el mod `pignolo-panel`; el mod no
// escribe nada. Lo derivable se recalcula en `refresh` desde lo que pignolo ya guarda; los eventos
// (decisiones, evidencia, tope de gasto) solo suman lo que no existe en otro lado. Un archivo ilegible
// nunca tira: se reconstruye. Sin rutas absolutas ni datos del usuario en lo que se guarda (`sanitize`).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitRun } = require('./git');
const { cleanQuestion, answerText, answerPrefix } = require('./next-steps');

const SCHEMA = 'pignolo-panel-state/1';
const MAX_BYTES = 64 * 1024;
const STAGES = ['plan', 'execution', 'review', 'fixes', 'suite', 'merge'];
const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 10000;
const NOW = () => new Date().toISOString();
const REBUILD_BASE = () => Math.floor(Date.now() / 1000);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ---- texto -----------------------------------------------------------------------

// Una sola línea, sin rutas absolutas ni el directorio del usuario. Con `root`, una ruta dentro del
// proyecto queda relativa; cualquier otra queda como `…/<último tramo>`.
function sanitize(text, { max = 200, root } = {}) {
  let s = text === null || text === undefined ? '' : String(text);
  const home = os.homedir();
  const rootN = root ? String(root).replace(/\\/g, '/').replace(/\/+$/, '') : '';
  const fwd = (p) => p.replace(/\\/g, '/');
  if (home) s = s.split(home).join('~').split(fwd(home)).join('~');
  const abs = /(?<![\w.:~-])(?:[A-Za-z]:[\\/]|\/(?=[\w.@-]+\/))[^\s"'`<>|*?)\]]*/g;
  s = s.replace(abs, (m) => {
    const p = fwd(m).replace(/[.,;:]+$/, '');
    const tail = m.length - p.length;
    const suffix = tail ? m.slice(m.length - tail) : '';
    if (rootN && p.toLowerCase().startsWith(`${rootN.toLowerCase()}/`)) return p.slice(rootN.length + 1) + suffix;
    const last = p.split('/').filter(Boolean).pop() || '';
    return `…/${last}${suffix}`;
  });
  s = s.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const str = (v, max) => sanitize(v, { max });

// ---- forma -----------------------------------------------------------------------

function emptyState() {
  return {
    schema: SCHEMA, updated: null, pluginVersion: null, seq: 0, plan: null, decisions: [], branches: [], cards: [], budget: [], main: null,
    next: { none: 'nothing' },
  };
}

function option(o) {
  const label = isObj(o) ? o.label : o;
  if (typeof label !== 'string' || !label.trim()) return null;
  const out = { label: str(label, 80) };
  if (isObj(o) && typeof o.pros_contras === 'string' && o.pros_contras.trim()) out.pros_contras = str(o.pros_contras, 200);
  return out;
}

function normalizeNext(n) {
  if (!isObj(n)) return { none: 'nothing' };
  if (typeof n.none === 'string') return { none: ['busy', 'ambiguous', 'cost', 'attention', 'nothing'].includes(n.none) ? n.none : 'nothing' };
  if (typeof n.text !== 'string' || !n.text.trim()) return { none: 'nothing' };
  const step = (x) => ({
    rule: str(x.rule, 30), key: str(x.key, 80), text: str(x.text, 160), prompt: str(x.prompt, 300),
    costNote: x.costNote ? str(x.costNote, 120) : null, why: str(x.why, 200),
  });
  return { ...step(n), alternatives: arr(n.alternatives).filter((a) => isObj(a) && typeof a.text === 'string' && a.text.trim()).slice(0, 2).map(step) };
}

// Acepta cualquier JSON; lo que no tiene forma se descarta. { state, problems }. Nunca tira.
function normalize(raw) {
  const problems = [];
  if (!isObj(raw)) return { state: emptyState(), problems: ['not-object'] };
  if (raw.schema !== SCHEMA) return { state: emptyState(), problems: ['schema-unknown'] };
  const s = emptyState();
  s.updated = typeof raw.updated === 'string' ? raw.updated : null;
  s.pluginVersion = typeof raw.pluginVersion === 'string' ? str(raw.pluginVersion, 20) : null;
  s.seq = Math.max(0, Math.floor(num(raw.seq) || 0));
  if (isObj(raw.plan) && typeof raw.plan.slug === 'string' && raw.plan.slug) {
    s.plan = { slug: str(raw.plan.slug, 64), stage: str(raw.plan.stage || '?', 30), request: str(raw.plan.request, 160) };
  }
  s.decisions = arr(raw.decisions).filter((d) => isObj(d) && typeof d.id === 'string' && d.id && typeof d.question === 'string' && d.question.trim()).map((d) => {
    const out = {
      id: str(d.id, 40),
      question: str(d.question, 300),
      options: arr(d.options).map(option).filter(Boolean).slice(0, 4),
      recommended: str(d.recommended, 80),
      context: str(d.context, 400),
      kind: d.kind === 'budget' ? 'budget' : 'user',
      status: ['open', 'answered', 'postponed'].includes(d.status) ? d.status : 'open',
      askedAt: typeof d.askedAt === 'string' ? d.askedAt : null,
    };
    if (typeof d.key === 'string' && d.key.trim()) out.key = str(d.key, 80);
    if (typeof d.postponedAt === 'string') out.postponedAt = d.postponedAt;
    if (typeof d.answeredAt === 'string') out.answeredAt = d.answeredAt;
    if (typeof d.answer === 'string') out.answer = str(d.answer, 120);
    if (typeof d.shown === 'boolean') out.shown = d.shown;
    return out;
  });
  s.branches = arr(raw.branches).filter((b) => isObj(b) && typeof b.name === 'string' && b.name).map((b) => {
    const out = {
      name: str(b.name, 120),
      stage: STAGES.includes(b.stage) ? b.stage : 'plan',
      review: ['APPROVE', 'CHANGES'].includes(b.review) ? b.review : 'none',
      suite: ['green', 'red'].includes(b.suite) ? b.suite : 'none',
      commits: Math.max(0, Math.floor(num(b.commits) || 0)),
      waiting: b.waiting === true,
      merged: b.merged === true,
    };
    if (typeof b.sha === 'string' && /^[0-9a-f]{7,40}$/.test(b.sha)) out.sha = b.sha.slice(0, 12);
    if (isObj(b.costOk)) out.costOk = { ...(num(b.costOk.usd) !== null ? { usd: num(b.costOk.usd) } : {}), ok: b.costOk.ok === true };
    return out;
  });
  s.cards = arr(raw.cards).filter((c) => isObj(c) && typeof c.id === 'string' && c.id).map((c) => ({
    id: str(c.id, 40),
    plan: str(c.plan, 64),
    title: str(c.title, 120),
    status: ['todo', 'running', 'done', 'failed'].includes(c.status) ? c.status : 'todo',
    red: str(c.red, 80),
    green: str(c.green, 80),
    evidence: str(c.evidence, 160),
  }));
  s.budget = arr(raw.budget).filter((b) => isObj(b) && typeof b.hito === 'string' && b.hito && num(b.spent) !== null && num(b.cap) !== null)
    .map((b) => ({ hito: str(b.hito, 60), spent: num(b.spent), cap: num(b.cap), warned: b.warned === true }));
  const ahead = isObj(raw.main) ? num(raw.main.ahead) : null;
  s.main = ahead !== null ? { ahead: Math.max(0, Math.floor(ahead)) } : null;
  s.next = normalizeNext(raw.next);
  return { state: s, problems };
}

// Recorta lo menos importante hasta que el archivo cabe en 64 KB (nunca rechaza todo).
function serialize(state) {
  const s = { ...state };
  const text = () => `${JSON.stringify(s, null, 2)}\n`;
  const drops = [
    () => { const i = s.decisions.findIndex((d) => d.status === 'answered'); if (i < 0) return false; s.decisions = s.decisions.filter((_, j) => j !== i); return true; },
    () => { const i = s.branches.map((b) => b.merged).lastIndexOf(true); if (i < 0) return false; s.branches = s.branches.filter((_, j) => j !== i); return true; },
    () => { if (s.branches.length <= 20) return false; s.branches = s.branches.slice(0, -1); return true; },
    () => { if (s.cards.length <= 20) return false; s.cards = s.cards.slice(0, -1); return true; },
    () => { if (s.decisions.length <= 8) return false; s.decisions = s.decisions.slice(0, -1); return true; },
  ];
  let out = text();
  let guard = 2000;
  while (Buffer.byteLength(out) > MAX_BYTES && guard-- > 0) {
    if (!drops.some((d) => d())) break;
    out = text();
  }
  return out;
}

// ---- disco -----------------------------------------------------------------------

const fileOf = (main) => path.join(main, '.pignolo', 'panel-state.json');
const lockOf = (main) => path.join(main, '.pignolo', 'tmp', 'panel.lock');

function parseBuffer(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { return { state: emptyState(), problems: ['not-utf8'] }; }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!text.trim()) return { state: emptyState(), problems: ['empty'] };
  let raw;
  try { raw = JSON.parse(text); } catch (_) { return { state: emptyState(), problems: ['not-json'] }; }
  return normalize(raw);
}

// { state, problems[] }. Sin archivo = estado vacío sin problemas. Nunca tira.
function read(main) {
  let buf;
  try { buf = fs.readFileSync(fileOf(main)); } catch (e) {
    return { state: emptyState(), problems: e.code === 'ENOENT' ? [] : ['unreadable'] };
  }
  return parseBuffer(buf);
}

const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) { /* sin espera */ } };

// El registro solo se escribe dentro de <main>/.pignolo/ (un enlace o junction que apunte afuera se rechaza).
function assertInside(main) {
  const dir = path.join(main, '.pignolo');
  fs.mkdirSync(dir, { recursive: true });
  const real = fs.realpathSync(dir);
  const base = fs.realpathSync(main);
  const rel = path.relative(base, real);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    const e = new Error('.pignolo apunta fuera del proyecto: no se escribe el registro');
    e.code = 'OUTSIDE';
    throw e;
  }
}

function withLock(main, fn) {
  const lock = lockOf(main);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd = null;
  for (;;) {
    try { fd = fs.openSync(lock, 'wx'); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.rmSync(lock, { force: true }); continue; }
      } catch (_) { continue; }
      if (Date.now() > deadline) { const err = new Error('el lock del registro sigue tomado'); err.code = 'LOCKED'; throw err; }
      sleep(15);
    }
  }
  try {
    fs.writeSync(fd, `${process.pid}\n`);
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* ya cerrado */ }
    fs.rmSync(lock, { force: true });
  }
}

function writeFileAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, text);
    // En Windows el rename falla (EPERM/EBUSY) mientras un lector tiene el destino abierto: se reintenta un rato.
    const until = Date.now() + 3000;
    for (;;) {
      try { fs.renameSync(tmp, file); break; } catch (e) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(e.code) || Date.now() > until) throw e;
        sleep(10);
      }
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Lock + lectura + `fn(state)` (muta y puede devolver un valor) + temporal + rename. Devuelve lo de `fn`.
// Un archivo ilegible se reconstruye vacío (las decisiones abiertas ilegibles se pierden: se avisa en stderr).
function update(main, fn, { now = NOW() } = {}) {
  assertInside(main);
  // El registro es local: que git no lo vea nunca (también en proyectos anteriores a esta versión, cuyo .gitignore no lo trae).
  try { require('./pignolo-gitignore').ensureIgnored(main, ['.gitignore', 'panel-state.json', 'tmp/']); } catch (_) { /* sin ignore: el registro igual funciona */ }
  return withLock(main, () => {
    const { state, problems } = read(main);
    if (problems.length && !problems.includes('schema-unknown') && fs.existsSync(fileOf(main))) {
      process.stderr.write(`pignolo panel: el registro estaba ilegible (${problems.join(', ')}); se reconstruye.\n`);
    }
    // Un registro reconstruido no reinicia la numeración: un Q-<n> viejo (un botón dibujado antes, un texto pegado) no puede
    // caer en otra decisión (RP-02). La base sale del reloj, así que supera cualquier número dado antes.
    if (problems.length && fs.existsSync(fileOf(main)) && state.seq < REBUILD_BASE()) state.seq = REBUILD_BASE();
    const before = JSON.stringify({ ...state, updated: null });
    const result = fn(state);
    if (JSON.stringify({ ...state, updated: null }) === before && fs.existsSync(fileOf(main))) return result; // sin cambios: no se reescribe
    state.updated = now;
    state.pluginVersion = pluginVersion() || state.pluginVersion;
    const { state: clean } = normalize(JSON.parse(JSON.stringify(state)));
    writeFileAtomic(fileOf(main), serialize(clean));
    return result;
  });
}

function pluginVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch (_) { return null; }
}

// ---- eventos ---------------------------------------------------------------------

// Siguiente Q-<n> libre: nunca reusa uno ya respondido (seq guarda el máximo que existió).
function nextId(state) {
  const used = state.decisions.map((d) => /^Q-(\d+)$/.exec(d.id)).filter(Boolean).map((m) => Number(m[1]));
  const n = Math.max(state.seq || 0, 0, ...used) + 1;
  state.seq = n;
  return `Q-${n}`;
}

function addDecision(state, { question, options, recommended, context, kind = 'user', key, now }) {
  const opts = arr(options).map(option).filter(Boolean).slice(0, 4);
  const id = nextId(state);
  const d = {
    id, question: str(question, 300), options: opts, recommended: str(recommended, 80), context: str(context, 400),
    kind: kind === 'budget' ? 'budget' : 'user', status: 'open', askedAt: now || NOW(),
  };
  if (typeof key === 'string' && key.trim()) d.key = str(key, 80);
  state.decisions.push(d);
  return id;
}

// El texto que sale del panel como palabras del usuario se arma con esto: una sola línea, sin caracteres de control y con
// tope de largo. Lo que no cumple se rechaza al escribir (RP-03), no se recorta en silencio.
// Control, formato (ancho cero, RTL, "tag"), uso privado, sin asignar y separadores de línea (RR-01).
const BAD = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
const hasHiddenChars = (v) => BAD.test(v);
function lineProblem(what, v, max) {
  if (typeof v !== 'string') return null;
  if (hasHiddenChars(v)) return `${what} tiene saltos de línea, caracteres de control o caracteres invisibles`;
  if (v.length > max) return `${what} pasa de ${max} caracteres`;
  return null;
}
function checkAsk({ question, options, recommended }) {
  const bad = [lineProblem('la pregunta', question, 300), lineProblem('la recomendada', recommended, 80)];
  arr(options).forEach((o, i) => {
    bad.push(lineProblem(`la opción ${i + 1}`, isObj(o) ? o.label : o, 80));
    if (isObj(o)) bad.push(lineProblem(`los pros y contras de la opción ${i + 1}`, o.pros_contras, 200));
  });
  const p = bad.find(Boolean);
  if (p) throw new Error(`${p}: una pregunta del panel es de una sola línea`);
}

// Con `key` es idempotente: si ya hay una decisión sin responder con esa clave devuelve la misma (una skill puede repetir la llamada).
function ask(main, { question, options, recommended = '', context = '', kind = 'user', key, now } = {}) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('falta la pregunta');
  checkAsk({ question, options, recommended });
  return update(main, (s) => {
    const dup = key ? s.decisions.find((d) => d.key === key && d.status !== 'answered') : null;
    return dup ? { id: dup.id, existing: true } : { id: addDecision(s, { question, options, recommended, context, kind, key, now }) };
  }, { now });
}

// { ok, reason? }: el id (o la clave) existe y no está respondida; la respuesta es una de sus opciones o la libre "Otra".
// `strict` (el hook `panel-answer`): la decisión tiene que estar abierta, la pregunta citada tiene que ser la suya y la
// respuesta una de sus opciones, todo dentro del lock; si algo no coincide no marca nada (falla cerrado, RP-02).
function answer(main, { id, key, answer: text, question, strict = false, now } = {}) {
  return update(main, (s) => {
    const d = s.decisions.find((x) => (key ? x.key === key && x.status !== 'answered' : x.id === id));
    if (!d) return { ok: false, reason: 'unknown-id' };
    if (d.status === 'answered') return { ok: false, reason: 'already-answered' };
    if (strict && d.status !== 'open') return { ok: false, reason: 'not-open' };
    if (strict && question !== cleanQuestion(d.question)) return { ok: false, reason: 'question-differs' };
    const given = typeof text === 'string' ? text : '';
    if (strict && (hasHiddenChars(String(d.question)) || hasHiddenChars(given))) return { ok: false, reason: 'hidden-chars' };
    if (!d.options.some((o) => o.label === given) && (strict || given !== 'Otra')) return { ok: false, reason: 'not-an-option' };
    d.status = 'answered';
    d.answer = given;
    d.answeredAt = now || NOW();
    return { ok: true };
  }, { now });
}

function postpone(main, { id, now } = {}) {
  return update(main, (s) => {
    const d = s.decisions.find((x) => x.id === id);
    if (!d) return { ok: false, reason: 'unknown-id' };
    if (d.status === 'answered') return { ok: false, reason: 'already-answered' };
    d.status = 'postponed';
    d.postponedAt = now || NOW();
    return { ok: true };
  }, { now });
}

// close-session: las pospuestas vuelven a abiertas (y se listan). Devuelve las que reabrió.
function reopenPostponed(main, { now } = {}) {
  return update(main, (s) => {
    const back = [];
    for (const d of s.decisions) {
      if (d.status !== 'postponed') continue;
      d.status = 'open';
      delete d.postponedAt;
      delete d.shown;
      back.push({ id: d.id, question: d.question });
    }
    return back;
  }, { now });
}

// close-session: lo que quedó sin responder al cerrar pasa a pospuesto; el próximo SessionStart lo reabre (RP-06).
function parkOpen(main, { now } = {}) {
  return update(main, (s) => {
    const parked = [];
    for (const d of s.decisions) {
      if (d.status !== 'open') continue;
      d.status = 'postponed';
      d.postponedAt = now || NOW();
      parked.push({ id: d.id, question: d.question });
    }
    return parked;
  }, { now });
}

// La cola marca una rama que espera al autor (conflicto de lógica, compuerta roja). `refresh` conserva la marca.
function setWaiting(main, { branch, waiting = true, now } = {}) {
  if (typeof branch !== 'string' || !branch.trim()) throw new Error('falta la rama');
  return update(main, (s) => {
    let b = s.branches.find((x) => x.name === branch);
    if (!b) {
      if (!waiting) return { ok: true };
      b = { name: str(branch, 120), stage: 'review', review: 'none', suite: 'none', commits: 0, waiting: false, merged: false };
      s.branches.push(b);
    }
    b.waiting = waiting === true;
    return { ok: true };
  }, { now });
}

function evidence(main, { card, red, green, title, now } = {}) {
  if (typeof card !== 'string' || !card.trim()) throw new Error('falta la tarjeta');
  return update(main, (s) => {
    let c = s.cards.find((x) => x.id === card);
    if (!c) { c = { id: str(card, 40), plan: s.plan ? s.plan.slug : '', title: '', status: 'todo', red: '', green: '', evidence: '' }; s.cards.push(c); }
    if (red !== undefined) c.red = str(red, 80);
    if (green !== undefined) c.green = str(green, 80);
    if (title !== undefined) c.title = str(title, 120);
    return { ok: true };
  }, { now });
}

// `cap` puede faltar si el hito ya tiene su tope (se actualiza solo lo gastado).
function setBudget(main, { hito, spent, cap, now } = {}) {
  if (typeof hito !== 'string' || !hito.trim() || num(spent) === null || (cap !== undefined && num(cap) === null)) throw new Error('hito y spent son obligatorios; cap debe ser un número');
  return update(main, (s) => {
    const b = s.budget.find((x) => x.hito === hito);
    if (cap === undefined && !b) throw new Error('el hito no tiene tope: falta cap');
    if (b) { b.spent = Number(spent); if (cap !== undefined) b.cap = Number(cap); } else s.budget.push({ hito: str(hito, 60), spent: Number(spent), cap: Number(cap), warned: false });
    return { ok: true };
  }, { now });
}

// ---- refresh ---------------------------------------------------------------------

const BUSY_KINDS = ['task-in-progress', 'wave-partial', 'queue-busy-dead'];
const ATTENTION_KINDS = ['task-blocked', 'queue-conflict', 'run-malformed', 'sabotage-pending', 'flow-expired-task', 'plan-unreadable'];
const money = (n) => String(Math.round(n * 100) / 100);

function gitFacts(main, git, now, env) {
  const out = { branches: [], ahead: null, mainName: null };
  const g = (args) => git(['--no-optional-locks', ...args], main);
  let refs = [];
  try {
    refs = g(['for-each-ref', '--format=%(refname:short)\t%(objectname)\t%(tree)', 'refs/heads']).split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
  } catch (_) { return out; }
  const names = refs.map((r) => r[0]);
  out.mainName = ['main', 'master'].find((n) => names.includes(n)) || null;
  if (!out.mainName) return out;
  try {
    const n = Number(g(['rev-list', '--count', `origin/${out.mainName}..${out.mainName}`]));
    out.ahead = Number.isFinite(n) ? n : null;
  } catch (_) { out.ahead = null; }
  let merged = new Set();
  try { merged = new Set(g(['branch', '--merged', out.mainName, '--format=%(refname:short)']).split(/\r?\n/).filter(Boolean)); } catch (_) { /* sin dato */ }
  const seals = require('./seals');
  const L = require('./ledger');
  let repoId = null;
  try { repoId = seals.repoIdFor({ cwd: main, timeoutMs: 5000 }); } catch (_) { repoId = null; }
  const { pignoloHome } = require('./home');
  for (const [name, sha, tree] of refs) {
    if (name === out.mainName || /^(backup|queue)\//.test(name)) continue;
    const isMerged = merged.has(name);
    let commits = 0;
    try { commits = Number(g(['rev-list', '--count', `${out.mainName}..${name}`])) || 0; } catch (_) { commits = 0; }
    let review = 'none';
    let suite = 'none';
    if (!isMerged && repoId) {
      try {
        const l = JSON.parse(fs.readFileSync(path.join(pignoloHome(env), 'reviews', repoId, `${sha}-review.json`), 'utf8'));
        if (L.validateLedger(l).length === 0 && l.sha === sha) review = L.nextStep(l) === 'done' ? 'APPROVE' : 'CHANGES';
      } catch (_) { /* sin revisión guardada */ }
      for (const level of ['pre-merge', 'on-done']) {
        const seal = seals.findSeal({ env, repoId, treeHash: tree, level });
        if (seal) { suite = seal.status === 'PASS' ? 'green' : 'red'; break; }
      }
    }
    let stage = 'execution';
    if (isMerged && commits === 0) stage = 'merge';
    else if (review === 'APPROVE') stage = suite === 'green' ? 'merge' : 'suite';
    else if (review === 'CHANGES') stage = 'fixes';
    else if (commits > 0) stage = 'review';
    out.branches.push({ name, stage, review, suite, commits, waiting: false, merged: isMerged, sha: sha.slice(0, 12) });
  }
  out.branches.sort((a, b) => Number(a.merged) - Number(b.merged) || (a.name < b.name ? -1 : 1));
  return out;
}

// Parte lenta de `refresh` (lee planes, git, ledger y sellos): NO toma el lock del registro, así dos procesos no se
// bloquean entre sí. `prev` solo aporta lo que se mantiene (tarjetas ya hechas, costOk y waiting de las ramas).
function derive(main, { now = Date.now(), git = gitRun, env = process.env, prev } = {}) {
  const previous = prev || read(main).state;
  const { readRun, taskList } = require('./project');
  const ps = require('./plan-state');
  const { deriveNext } = require('./next');

  // plan abierto: el del flujo vigente o el más reciente sin cerrar
  let run = null;
  try { const st = readRun(main, now); run = st.run && !st.expired ? st.run : null; } catch (_) { run = null; }
  const open = [];
  try {
    for (const name of ps.listPlans(main, { git: true })) {
      const r = ps.readPlan({ main, plan: name, git: true });
      if (r.ok && r.plan.stage !== 'closed') open.push(r.plan);
    }
  } catch (_) { /* sin planes */ }
  open.sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0) || (a.plan < b.plan ? -1 : 1));
  const plan = (run && run.plan && open.find((p) => p.plan === run.plan)) || open[0] || null;
  const planOut = plan ? { slug: plan.plan, stage: plan.stage, request: sanitize(plan.request, { max: 160, root: main }) } : null;

  // tarjetas: las tareas del plan; "done" se mantiene una vez vista (una tarea que corría y ya no está en run.json terminó)
  const runIds = run ? taskList(run).map((t) => t.id) : [];
  const late = plan ? ['validating', 'final-review', 'closed'].includes(plan.stage) : false;
  const old = new Map(previous.cards.map((c) => [c.id, c]));
  const ids = plan ? (plan.tasks || []).map((t) => t.id) : [];
  for (const id of runIds) if (!ids.includes(id)) ids.push(id);
  const cards = ids.map((id) => {
    const o = old.get(id) || {};
    const samePlan = !o.plan || !plan || o.plan === plan.plan;
    let status = 'todo';
    if (runIds.includes(id)) status = 'running';
    else if (late || (samePlan && (o.status === 'done' || o.status === 'running'))) status = 'done';
    return { id, plan: plan ? plan.plan : '', title: o.title || '', status, red: o.red || '', green: o.green || '', evidence: o.evidence || '' };
  });

  const gf = gitFacts(main, git, now, env);
  let kind = 'nothing';
  try { kind = deriveNext({ cwd: main, env, now }).kind; } catch (_) { kind = 'nothing'; }
  return {
    plan: planOut, cards, branches: gf.branches, main: gf.ahead === null ? null : { ahead: gf.ahead },
    busy: BUSY_KINDS.includes(kind), attention: ATTENTION_KINDS.includes(kind) ? [kind] : [],
  };
}

// Parte rápida (dentro del lock): vuelca lo derivado sobre el estado ACTUAL sin pisar lo que otro proceso anotó
// mientras tanto (evidencia, decisiones), suma el aviso de tope y recalcula `next` con las decisiones vigentes.
function applyDerived(cur, d, now) {
  const { nextStep, toRegistry } = require('./next-steps');
  cur.plan = d.plan;
  const have = new Map(cur.cards.map((c) => [c.id, c]));
  cur.cards = d.cards.map((c) => {
    const o = have.get(c.id);
    return o ? { ...c, title: o.title || c.title, red: o.red, green: o.green, evidence: o.evidence } : c;
  });
  // evidencia de tarjetas que aún no están en el plan
  for (const o of have.values()) if (!cur.cards.some((c) => c.id === o.id) && (o.red || o.green)) cur.cards.push({ ...o });
  const keep = new Map(cur.branches.map((b) => [b.name, b]));
  cur.branches = d.branches.map((b) => {
    const o = keep.get(b.name);
    return { ...b, waiting: o ? o.waiting : false, ...(o && o.costOk ? { costOk: o.costOk } : {}) };
  });
  cur.main = d.main;

  // aviso de tope de gasto (una vez por hito)
  for (const b of cur.budget) {
    if (b.warned || !(b.cap > 0) || b.spent < 0.8 * b.cap) continue;
    addDecision(cur, { question: `el hito ${b.hito} lleva ${money(b.spent)} de ${money(b.cap)} USD, ¿seguimos?`, options: ['seguir', 'parar'], recommended: 'seguir', context: 'Pasaste el 80 % del tope aprobado de este hito.', kind: 'budget', now: new Date(now).toISOString() });
    b.warned = true;
  }

  // siguiente paso (R-P7)
  const busy = d.busy || cur.cards.some((c) => c.status === 'running');
  cur.next = toRegistry(nextStep({ busy, attention: d.attention, decisions: cur.decisions, branches: cur.branches, main: cur.main, plan: cur.plan, cards: cur.cards }));
  return cur;
}

// Lo mismo que hace `refresh` pero sin escribir: sirve a `next.js` (solo lectura).
function compute(main, opts = {}) {
  const prev = opts.prev || read(main).state;
  const cur = JSON.parse(JSON.stringify(prev));
  return applyDerived(cur, derive(main, { ...opts, prev }), opts.now || Date.now());
}

const stripVolatile = (s) => JSON.stringify({ ...s, updated: null });

// Idempotente: si lo recalculado es igual a lo guardado no reescribe. Nunca tira hacia afuera.
function refresh(main, opts = {}) {
  const d = derive(main, { ...opts, prev: read(main).state }); // lento, sin lock
  let wrote = false;
  const state = update(main, (cur) => {
    const before = stripVolatile(cur);
    applyDerived(cur, d, opts.now || Date.now());
    wrote = stripVolatile(cur) !== before || !fs.existsSync(fileOf(main));
    return cur;
  }, { now: opts.now ? new Date(opts.now).toISOString() : undefined });
  return { ...state, wrote };
}

// Texto llano del estado (`panel.js show --text`, /pignolo:status). Vacío si no hay nada que decir.
function toText(state) {
  const lines = [];
  if (state.plan) lines.push(`Plan ${state.plan.slug}: etapa ${state.plan.stage}.`);
  const open = state.decisions.filter((d) => d.status === 'open');
  const post = state.decisions.filter((d) => d.status === 'postponed');
  if (open.length) {
    lines.push(`Te toca (${open.length}):`);
    for (const d of open) lines.push(`- ${d.id}: ${d.question}${d.recommended ? ` (recomendada: ${d.recommended})` : ''}`);
  }
  if (post.length) lines.push(`Pospuestas hasta cerrar la sesión: ${post.map((d) => d.id).join(', ')}.`);
  const live = state.branches.filter((b) => !b.merged);
  if (live.length) lines.push(`Ramas sin unir: ${live.map((b) => `${b.name} (${b.stage})`).join(', ')}.`);
  if (state.next && state.next.text) lines.push(`Siguiente: ${state.next.text}.`);
  else if (state.next && state.next.none === 'attention') lines.push('Hay algo que mirar antes de seguir (ver `/pignolo:status`).');
  return lines.join('\n');
}

module.exports = {
  SCHEMA, MAX_BYTES, STAGES, emptyState, read, normalize, sanitize, update, ask, answer, postpone, reopenPostponed, evidence, setBudget, parkOpen, setWaiting, cleanQuestion, answerText, answerPrefix,
  compute, refresh, toText, fileOf, lockOf, serialize,
};
