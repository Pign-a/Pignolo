'use strict';
// Movimientos seguros de carpetas y archivos de documentos del proyecto (hito 8d, Task 2; R-7 a R-9, R-12).
// Nada se borra y nada se pisa: único movimiento permitido `git mv` (un origen por llamada) o `renameSync`, y solo
// a un destino que no existe. Única excepción declarada a "nada se borra": `rmdirSync` (no recursivo) de las carpetas
// vacías que el propio movimiento creó. Ninguna función de este módulo hace commit, add, push, reset, checkout, clean ni stash.
// Todo recorrido de árbol es manual (sin `recursive: true`, que atraviesa los junctions) y todo componente de toda ruta
// pasa por `isLinkOrOutside`.
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pignoloHome } = require('./home');
const { declaredPatternFor } = require('./places');
const { readRun } = require('./project');

const MAX_FILES = 2000;
const MAX_DEPTH = 12;
const DOC_EXT = Object.freeze(['md', 'mdx', 'txt', 'rst', 'adoc', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'csv', 'docx', 'xlsx', 'pptx', 'drawio', 'excalidraw']);
const DOC_NAMES = Object.freeze(['.gitignore', '.gitkeep', 'readme', 'license', 'notice']);
const PROTECTED_ROOTS = Object.freeze(['.git', '.pignolo', '.claude', 'node_modules', '.github']);
const FRAMEWORK_ROOTS = Object.freeze(['src', 'app', 'pages', 'public', 'lib', 'test', 'tests', 'cmd', 'internal', 'packages', 'apps', 'bin', 'build', 'dist']);
const RESERVED_SOURCES = Object.freeze([...PROTECTED_ROOTS, ...FRAMEWORK_ROOTS]);
const DOC_EXT_SET = new Set(DOC_EXT);
const LONG_PATH = 240;

// R-24: comparaciones insensibles a mayúsculas salvo en Linux.
const fold = (s) => (process.platform === 'linux' ? s : s.toLowerCase());
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');
const abs = (main, rel) => path.join(main, ...norm(rel).split('/'));
const isInsideRel = (child, parent) => { const c = fold(norm(child)); const p = fold(norm(parent)); return c.startsWith(`${p}/`); };
const sameRel = (a, b) => fold(norm(a)) === fold(norm(b));
const realOf = (fs, p) => (fs.realpathSync.native || fs.realpathSync)(p);

// ---------------------------------------------------------------- git

// Ejecutor por defecto: salida cruda (sin trim: los nombres pueden empezar con espacio), búfer amplio, sin bloqueos opcionales.
function makeRun(main) {
  return (args, cwd, o = {}) => execFileSync('git', args, {
    cwd: cwd || main, encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120000, windowsHide: true, input: o.input,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: [o.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });
}

function scanFailed(what, cause) {
  const e = new Error(`no se pudo leer ${what}: ${cause && cause.message ? cause.message : cause}`);
  e.kind = 'scan-failed';
  return e;
}

// Listado de git con -z, sin trim: parte por NUL. Un fallo lanza `scan-failed` (nunca "sin resultados").
function gitList(run, main, args) {
  let out;
  try { out = run(args, main); } catch (e) { throw scanFailed(`git ${args[0]}`, e); }
  return String(out).split('\0').filter((s) => s !== '');
}

// `git check-ignore -q`: 0 = ignorado, 1 = no; otro fallo lanza.
function gitTrue(run, main, args) {
  try { run(args, main); return true; } catch (e) {
    if (e && e.status === 1) return false;
    throw scanFailed(`git ${args[0]}`, e);
  }
}

const lit = (rel) => `:(literal)${norm(rel)}`;

// ---------------------------------------------------------------- guarda de rutas (R-7)

// Recorre cada componente de `rel` desde `main` con lstat: un enlace en cualquiera es `link-in-path`.
// El primer ancestro existente debe resolver (realpath) dentro del proyecto. Se detiene en el primer componente que no existe.
function isLinkOrOutside(main, rel, fs = nodeFs) {
  const r = norm(rel);
  const parts = r === '' ? [] : r.split('/');
  if (/^([A-Za-z]:|\/)/.test(r) || parts.includes('..')) return { bad: true, reason: 'outside-project', at: r };
  let cur = main;
  let lastExisting = main;
  for (let i = 0; i < parts.length; i += 1) {
    cur = path.join(cur, parts[i]);
    let st;
    try { st = fs.lstatSync(cur); } catch (e) {
      if (['ENOENT', 'ENOTDIR', 'ENAMETOOLONG', 'EINVAL'].includes(e.code)) break;
      return { bad: true, reason: 'link-in-path', at: parts.slice(0, i + 1).join('/') };
    }
    if (st.isSymbolicLink()) return { bad: true, reason: 'link-in-path', at: parts.slice(0, i + 1).join('/') };
    lastExisting = cur;
  }
  let rm;
  let ra;
  try { rm = realOf(fs, main); ra = realOf(fs, lastExisting); } catch (_) { return { bad: true, reason: 'outside-project', at: r }; }
  const a = fold(ra);
  const m = fold(rm);
  if (a !== m && !a.startsWith(m.endsWith(path.sep) ? m : m + path.sep)) return { bad: true, reason: 'outside-project', at: r };
  return { bad: false };
}

// Recorrido manual: no sigue enlaces (los pone en `links`), no entra en `.git` anidados (los pone en `gitEntries`),
// corta en MAX_FILES o MAX_DEPTH con `tooBig` (sin tope silencioso). Resultado ordenado.
function walkTree(main, rel, fs = nodeFs) {
  const root = norm(rel);
  const out = { files: [], dirs: [], links: [], gitEntries: [], tooBig: false };
  let st;
  try { st = fs.lstatSync(abs(main, root)); } catch (_) { return out; }
  if (st.isSymbolicLink()) { out.links.push(root); return out; }
  if (!st.isDirectory()) { out.files.push({ path: root, size: st.size }); return out; }
  const stack = [{ rel: root, depth: 0 }];
  let seen = 0;
  while (stack.length) {
    const { rel: dir, depth } = stack.pop();
    let entries;
    try { entries = fs.readdirSync(abs(main, dir), { withFileTypes: true }); } catch (_) { out.tooBig = true; continue; }
    for (const d of entries) {
      const p = `${dir}/${d.name}`;
      if (d.name === '.git') { out.gitEntries.push(p); continue; }
      if (d.isSymbolicLink()) { out.links.push(p); continue; }
      seen += 1;
      if (seen > MAX_FILES) { out.tooBig = true; break; }
      if (d.isDirectory()) {
        out.dirs.push(p);
        if (depth + 1 >= MAX_DEPTH) { out.tooBig = true; continue; }
        stack.push({ rel: p, depth: depth + 1 });
      } else {
        let size = 0;
        try { size = fs.lstatSync(abs(main, p)).size; } catch (_) { size = 0; }
        out.files.push({ path: p, size });
      }
    }
    if (out.tooBig && seen > MAX_FILES) break;
  }
  const by = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  out.files.sort((a, b) => by(a.path, b.path));
  out.dirs.sort(by);
  out.links.sort(by);
  out.gitEntries.sort(by);
  return out;
}

// Carpetas de otras herramientas: solo adoptables (R-15).
function isToolOwned(main, rel, fs = nodeFs) {
  const parts = norm(rel).split('/');
  const first = parts[0].toLowerCase();
  const has = (p) => { try { fs.lstatSync(path.join(main, p)); return true; } catch (_) { return false; } };
  if (first === 'openspec') return true;
  if (first === 'docs' && (parts[1] || '').toLowerCase() === 'superpowers') return true;
  if (first === 'specs' && has('.specify')) return true;
  if (first === 'docs' || first === 'doc') {
    const markers = (base) => {
      let names = [];
      try { names = fs.readdirSync(path.join(main, base)); } catch (_) { return false; }
      return names.some((n) => n === 'mkdocs.yml' || n === 'conf.py' || n === '_config.yml' || n === '.vitepress' || /^docusaurus\.config\./.test(n));
    };
    return markers('') || markers(parts[0]);
  }
  return false;
}

// ---------------------------------------------------------------- estado de git y del proyecto

function gitDir(run, main) {
  try { return String(run(['rev-parse', '--absolute-git-dir'], main)).trim(); } catch (e) { throw scanFailed('git rev-parse', e); }
}

function repoBusy(run, main, fs = nodeFs) {
  const g = gitDir(run, main);
  const has = (n) => { try { fs.lstatSync(path.join(g, n)); return true; } catch (_) { return false; } };
  const merging = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'BISECT_LOG'].find(has);
  return { merging: merging || null, locked: has('index.lock') };
}

function openPlanHit(main, from, fs = nodeFs) {
  const dir = path.join(main, '.pignolo', 'state', 'plans');
  let slugs = [];
  try { slugs = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (_) { return null; }
  const relOf = (p) => (path.isAbsolute(p) ? norm(path.relative(main, p)) : norm(p));
  for (const slug of slugs) {
    let p;
    try { p = JSON.parse(fs.readFileSync(path.join(dir, slug, 'plan.json'), 'utf8')); } catch (_) { continue; }
    if (!p || p.stage === 'closed') continue;
    for (const f of [p.spec, p.planFile]) {
      if (typeof f === 'string' && f && (sameRel(relOf(f), from) || isInsideRel(relOf(f), from))) return `plan ${slug}: ${f}`;
    }
  }
  return null;
}

function activeRunHit(main, from) {
  const st = readRun(main);
  if (!st.running) return null;
  if (st.malformed) return 'run.json ilegible o inválido: no se sabe qué rutas usa';
  const t = st.run && st.run.task;
  if (t && Array.isArray(t.files)) {
    let same = false;
    try { same = fold(realOf(nodeFs, t.worktree)) === fold(realOf(nodeFs, main)); } catch (_) { same = false; }
    if (same) { const hit = t.files.map(norm).find((f) => sameRel(f, from) || isInsideRel(f, from)); if (hit) return `tarea ${t.id}: ${hit}`; }
  }
  return null;
}

// ---------------------------------------------------------------- planMoves (R-9)

const refuse = (reason, detail) => ({ reason, detail });

function caseCollision(ctx, rel) {
  if (process.platform === 'linux') return null;
  const { main, fs, run } = ctx;
  const parts = norm(rel).split('/');
  let live = true;
  for (let i = 0; i < parts.length; i += 1) {
    const parent = path.join(main, ...parts.slice(0, i));
    if (live) {
      let names = [];
      try { names = fs.readdirSync(parent); } catch (_) { live = false; }
      if (live) {
        if (!names.includes(parts[i])) {
          const other = names.find((n) => n.toLowerCase() === parts[i].toLowerCase());
          if (other) return refuse('case-collision', `${parts.slice(0, i).concat(parts[i]).join('/')} difiere en mayúsculas del nombre real en el disco (${other})`);
          live = false;
        }
      }
    }
    if (i !== 0 && i !== parts.length - 1) continue; // el índice se mira en el primer componente y en la ruta entera (el disco ya mira todos)
    const prefix = parts.slice(0, i + 1).join('/');
    for (const f of gitList(run, main, ['ls-files', '-z', '--', `:(icase,literal)${prefix}`])) {
      const seg = f.split('/')[i];
      if (seg !== undefined && seg !== parts[i] && seg.toLowerCase() === parts[i].toLowerCase()) {
        return refuse('case-collision', `${prefix} difiere en mayúsculas del nombre en el índice de git (${f.split('/').slice(0, i + 1).join('/')})`);
      }
    }
  }
  return null;
}

function nonDocFile(file) {
  const base = file.split('/').pop();
  if (DOC_NAMES.includes(base.toLowerCase())) return false;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return true;
  return !DOC_EXT_SET.has(base.slice(dot + 1).toLowerCase());
}

function ignoredByOutsideRule(ctx, from) {
  const { main, run } = ctx;
  const ignored = gitList(run, main, ['ls-files', '-z', '-o', '-i', '--exclude-standard', '--', lit(from)]);
  if (!ignored.length) return null;
  let out;
  try { out = String(run(['check-ignore', '-v', '-z', '--stdin'], main, { input: `${ignored.join('\0')}\0` })); } catch (e) {
    if (e && e.status === 1) return null;
    throw scanFailed('git check-ignore', e);
  }
  const f = out.split('\0');
  for (let i = 0; i + 3 < f.length; i += 4) {
    const [source, line, pattern, pathname] = [f[i], f[i + 1], f[i + 2], f[i + 3]];
    if (source === undefined || pathname === undefined) break;
    const src = norm(source);
    const inside = src !== '' && !path.isAbsolute(src) && !/^[A-Za-z]:/.test(src) && isInsideRel(src, from);
    if (!inside) return refuse('ignored-by-outside-rule', `${pathname} está ignorado por la regla "${pattern}" (${source}:${line}), que queda fuera de ${from}: al mover quedaría visible`);
  }
  return null;
}

function nestedRepo(ctx, from, walk) {
  const { main, run, fs } = ctx;
  if (walk.gitEntries.length) return refuse('nested-repo', `contiene ${walk.gitEntries[0]}`);
  const staged = gitList(run, main, ['ls-files', '-z', '-s', '--', lit(from)]);
  const link = staged.find((l) => l.startsWith('160000'));
  if (link) return refuse('nested-repo', `contiene un submódulo (${link.split('\t')[1]})`);
  const wt = String(run(['worktree', 'list', '--porcelain'], main)).split(/\r?\n/).filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  const base = abs(main, from);
  for (const w of wt) {
    let a;
    let b;
    try { a = fold(realOf(fs, w)); b = fold(realOf(fs, base)); } catch (_) { continue; }
    if (a !== b && a.startsWith(b + path.sep)) return refuse('nested-repo', `un worktree registrado vive adentro: ${w}`);
  }
  return null;
}

function planOne(ctx, raw, busy) {
  const { main, fs, run, config } = ctx;
  const from = norm(raw.from);
  const to = norm(raw.to);
  const kind = raw.kind === 'file' ? 'file' : 'dir';
  const item = { kind, from, to, tracked: false, files: 0, status: 'refused' };
  const no = (reason, detail) => { item.reason = reason; if (detail !== undefined) item.detail = detail; return item; };
  if (!from || !to) return no('not-found', 'ruta vacía');
  for (const p of [from, to]) {
    const g = isLinkOrOutside(main, p, fs);
    if (g.bad) return no(g.reason, g.at);
  }
  let st;
  try { st = fs.lstatSync(abs(main, from)); } catch (_) { return no('not-found', from); }
  if ((kind === 'dir') !== st.isDirectory()) return no('not-found', `${from} no es ${kind === 'dir' ? 'una carpeta' : 'un archivo'}`);
  const fparts = from.split('/');
  if (PROTECTED_ROOTS.includes(fparts[0].toLowerCase()) || (fparts.length === 1 && FRAMEWORK_ROOTS.includes(fparts[0].toLowerCase()))) return no('reserved-source', from);
  if (sameRel(from, to) && from !== to) return no('case-only', `${from} -> ${to}: solo cambia las mayúsculas; adoptá la carpeta en vez de moverla`);
  if (sameRel(from, to)) return no('dest-inside-source', 'origen y destino son la misma ruta');
  if (isInsideRel(to, from)) return no('dest-inside-source', `${to} está dentro de ${from}`);
  if (isInsideRel(from, to)) return no('source-inside-dest', `${from} está dentro de ${to}`);
  let exists = true;
  try { fs.lstatSync(abs(main, to)); } catch (_) { exists = false; }
  if (exists) return no('dest-exists', to);
  try {
    const cc = caseCollision(ctx, from) || caseCollision(ctx, to);
    if (cc) return no(cc.reason, cc.detail);

    const dirty = gitList(run, main, ['status', '--porcelain', '-z', '--untracked-files=no', '--', lit(from), lit(to)]);
    if (dirty.length) return no('dirty', `${dirty[0].slice(3)} tiene cambios sin guardar en git; si nadie lo tocó, puede ser un programa que lo tiene abierto (cerralo y reintentá)`);

    const walk = walkTree(main, from, fs);
    item.files = walk.files.length;
    if (walk.links.length) return no('link-in-path', walk.links[0]);
    if (walk.tooBig) return no('too-big', `más de ${MAX_FILES} archivos o más de ${MAX_DEPTH} niveles`);
    const nested = nestedRepo(ctx, from, walk);
    if (nested) return no(nested.reason, nested.detail);
    const nonDoc = walk.files.find((f) => nonDocFile(f.path));
    if (nonDoc) return no('contains-non-doc', nonDoc.path);
    for (const f of walk.files) {
      const dest = kind === 'file' ? to : `${to}${f.path.slice(from.length)}`;
      const pat = declaredPatternFor(config, f.path) || declaredPatternFor(config, dest);
      if (pat) return no('matches-declared-paths', pat);
    }
    if (isToolOwned(main, from, fs)) return no('tool-owned', from);
    if (busy.merging) return no('merge-in-progress', busy.merging);
    if (busy.locked) return no('index-locked', 'existe index.lock en el gitdir (otro git o un IDE); cerralo y reintentá');
    const outside = ignoredByOutsideRule(ctx, from);
    if (outside) return no(outside.reason, outside.detail);
    if (gitTrue(run, main, ['check-ignore', '-q', '--', kind === 'file' ? to : `${to}/.probe`])) return no('dest-ignored', to);
    const longest = walk.files.map((f) => path.join(main, ...(kind === 'file' ? to : `${to}${f.path.slice(from.length)}`).split('/'))).find((p) => p.length >= LONG_PATH);
    if (longest) return no('long-path', `${longest.length} caracteres`);
    const plan = openPlanHit(main, from, fs);
    if (plan) return no('plan-open', plan);
    const runHit = activeRunHit(main, from);
    if (runHit) return no('run-active', runHit);
    item.tracked = gitList(run, main, ['ls-files', '-z', '--', lit(from)]).length > 0;
  } catch (e) {
    return no('scan-failed', e.message);
  }
  item.status = 'ok';
  return item;
}

function planMoves({ main, items, config, run, fs = nodeFs } = {}) {
  const git = run || makeRun(main);
  const ctx = { main, fs, run: git, config };
  let busy = { merging: null, locked: false };
  let stagedOther = 0;
  let scanError = null;
  try { busy = repoBusy(git, main, fs); stagedOther = gitList(git, main, ['diff', '--cached', '--name-only', '-z']).length; } catch (e) { scanError = e; }
  const planned = items.map((it) => (scanError ? { kind: it.kind === 'file' ? 'file' : 'dir', from: norm(it.from), to: norm(it.to), tracked: false, files: 0, status: 'refused', reason: 'scan-failed', detail: scanError.message } : planOne(ctx, it, busy)));
  const batch = { ok: true };
  for (let i = 0; i < planned.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const a = planned[j];
      const b = planned[i];
      const clash = sameRel(a.to, b.to) || isInsideRel(a.to, b.to) || isInsideRel(b.to, a.to)
        || isInsideRel(b.to, a.from) || isInsideRel(a.to, b.from) || isInsideRel(b.from, a.from) || isInsideRel(a.from, b.from) || sameRel(a.from, b.from);
      if (clash) {
        b.status = 'refused'; b.reason = 'batch-conflict'; b.detail = `${b.from} -> ${b.to} choca con ${a.from} -> ${a.to}`;
        batch.ok = false; batch.reason = 'batch-conflict';
        break;
      }
    }
  }
  const ok = planned.every((i) => i.status === 'ok') && batch.ok;
  return { ok, items: planned, batch, stagedOther };
}

// ---------------------------------------------------------------- registro (R-12)

const stampOf = (now) => new Date(now).toISOString().replace(/[:.]/g, '-');
const sha12 = (main) => crypto.createHash('sha256').update(path.resolve(main)).digest('hex').slice(0, 12);

function recordPath({ main, env = process.env, now = new Date() } = {}) {
  return path.join(pignoloHome(env), 'init-backup', sha12(main), stampOf(now), 'moves.json');
}

// Escritura atómica (temp + rename). Única excepción a "no se borra" junto con rmdirSync de createdDirs: si el rename falla
// se quita el temporal PROPIO (recién creado con wx), para no dejar basura en el proyecto del usuario.
function writeAtomic(fs, file, text) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(tmp, text, { flag: 'wx' });
  try { fs.renameSync(tmp, file); } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ya no está */ }
    throw e;
  }
}

function readRecord(file, fs = nodeFs) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function updateRecord(file, fn, fs = nodeFs) {
  const rec = readRecord(file, fs);
  fn(rec);
  writeAtomic(fs, file, `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

function createRecord(fs, wanted, rec) {
  const dir0 = path.dirname(wanted);
  fs.mkdirSync(path.dirname(dir0), { recursive: true });
  for (let n = 0; n < 50; n += 1) {
    const dir = n === 0 ? dir0 : `${dir0}-${n}`;
    try { fs.mkdirSync(dir); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    const file = path.join(dir, 'moves.json');
    fs.writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`, { flag: 'wx' });
    return file;
  }
  throw new Error('no se pudo crear el registro de movimientos');
}

function missingParents(fs, main, items) {
  const made = new Set();
  const list = [];
  for (const it of items) {
    const parts = norm(it.to).split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i += 1) {
      const rel = parts.slice(0, i).join('/');
      if (made.has(fold(rel))) continue;
      let ex = true;
      try { fs.lstatSync(abs(main, rel)); } catch (_) { ex = false; }
      if (!ex) { made.add(fold(rel)); list.push(rel); }
    }
  }
  return list;
}

function describeFail(e, item) {
  const msg = String((e && (e.stderr || e.message)) || e).trim().split(/\r?\n/)[0];
  return `${msg} (cerrá el programa que tenga abierto un archivo de ${item.from} y reintentá, o deshacé con places.js undo)`;
}

function removeEmptyDirs(fs, main, dirs) {
  const informed = [];
  for (const rel of [...dirs].sort((a, b) => b.length - a.length)) {
    try {
      if (isLinkOrOutside(main, rel, fs).bad) { informed.push(rel); continue; }
      if (fs.readdirSync(abs(main, rel)).length === 0) fs.rmdirSync(abs(main, rel)); else informed.push(rel);
    } catch (_) { /* ya no existe */ }
  }
  return informed;
}

function applyMoves({ main, plan, config, rewrites = [], mapEdits = [], env = process.env, now = new Date(), run, fs = nodeFs } = {}) {
  const git = run || makeRun(main);
  if (!plan || !plan.ok || plan.items.some((i) => i.status !== 'ok')) return { ok: false, refused: 'plan-not-ok', items: plan ? plan.items : [] };
  const again = planMoves({ main, items: plan.items, config, run: git, fs });
  if (!again.ok) {
    const bad = again.items.find((i) => i.status !== 'ok');
    return { ok: false, refused: bad ? bad.reason : 'stale-plan', detail: bad ? bad.detail : undefined, items: again.items };
  }
  const same = again.items.every((i, k) => i.from === plan.items[k].from && i.to === plan.items[k].to && i.tracked === plan.items[k].tracked && i.files === plan.items[k].files);
  if (!same) return { ok: false, refused: 'stale-plan', items: again.items };

  const createdDirs = missingParents(fs, main, again.items);
  const head = (() => { try { return String(git(['rev-parse', 'HEAD'], main)).trim(); } catch (_) { return null; } })();
  const record = {
    v: 1, ts: new Date(now).toISOString(), main: path.resolve(main), head, status: 'applying',
    items: again.items.map((i) => ({ kind: i.kind, from: i.from, to: i.to, tracked: i.tracked, status: 'pending' })),
    createdDirs,
    rewrites: rewrites.map((r) => ({ backup: null, status: 'pending', ...r })),
    mapEdits: mapEdits.map((m) => ({ kind: m.kind, before: m.before === undefined ? null : m.before, after: m.after })),
  };
  const recFile = createRecord(fs, recordPath({ main, env, now }), record);
  const done = [];
  for (let k = 0; k < record.items.length; k += 1) {
    const it = record.items[k];
    const fail = (e) => {
      // R-12: decide por el disco. Un `git mv` puede renombrar y fallar después (índice bloqueado): si `to` existe y `from` no, el ítem se movió.
      const onDisk = (rel) => { try { fs.lstatSync(abs(main, rel)); return true; } catch (_) { return false; } };
      if (onDisk(it.to) && !onDisk(it.from)) {
        done.push(it.from);
        updateRecord(recFile, (r) => { r.items[k].status = 'done'; }, fs);
      }
      const pending = record.items.slice(done.length > k ? k + 1 : k).map((x) => x.from);
      if (!done.length) {
        removeEmptyDirs(fs, main, createdDirs);
        updateRecord(recFile, (r) => { r.status = 'undone'; r.items[k].status = 'pending'; }, fs);
        return { ok: false, kind: 'failed', failed: { item: it.from, error: describeFail(e, it) }, done, pending, record: recFile };
      }
      updateRecord(recFile, (r) => { r.status = 'partial'; }, fs);
      return { ok: false, kind: 'partial', failed: { item: it.from, error: describeFail(e, it) }, done, pending, record: recFile };
    };
    try {
      const one = planMoves({ main, items: [it], config, run: git, fs });
      if (!one.ok) return fail(Object.assign(new Error(`${one.items[0].reason}: ${one.items[0].detail || it.from}`), {}));
      const parents = createdDirs.filter((d) => isInsideRel(it.to, d));
      for (const rel of parents) {
        const g = isLinkOrOutside(main, rel, fs);
        if (g.bad) return fail(new Error(`${g.reason}: ${g.at}`));
        try { fs.mkdirSync(abs(main, rel)); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      const g = isLinkOrOutside(main, norm(it.to).split('/').slice(0, -1).join('/'), fs);
      if (g.bad) return fail(new Error(`${g.reason}: ${g.at}`));
      if (it.tracked) git(['mv', '--', it.from, it.to], main);
      else fs.renameSync(abs(main, it.from), abs(main, it.to));
    } catch (e) {
      return fail(e);
    }
    done.push(it.from);
    updateRecord(recFile, (r) => { r.items[k].status = 'done'; }, fs);
  }
  updateRecord(recFile, (r) => { r.status = 'applied'; }, fs);
  return { ok: true, record: recFile, items: record.items.map((i) => ({ ...i, status: 'done' })), createdDirs, stagedOther: again.stagedOther };
}

// ---------------------------------------------------------------- undoMoves (R-12)

const sha256Of = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function hashIfFile(fs, file) {
  try { return sha256Of(fs.readFileSync(file)); } catch (_) { return null; }
}

function undoMoves({ record, main, env = process.env, run, fs = nodeFs } = {}) {
  const git = run || makeRun(main);
  const refusal = (refused, extra = {}) => ({ ok: false, refused, items: [], restored: [], ...extra });
  let rec;
  try { rec = readRecord(record, fs); } catch (e) { return refusal('bad-record', { detail: e.message }); }
  if (!rec || rec.v !== 1 || !Array.isArray(rec.items)) return refusal('bad-record', { detail: 'moves.json no tiene la forma esperada' });
  if (rec.status === 'undone') {
    // R-12: "undone" no basta; si algún ítem sigue movido en el disco (un fallo tardío de git mv), se sigue.
    const movedOnDisk = rec.items.some((i) => {
      try { fs.lstatSync(abs(main, i.to)); } catch (_) { return false; }
      try { fs.lstatSync(abs(main, i.from)); return false; } catch (_) { return true; }
    });
    if (!movedOnDisk) return { ok: true, already: 'undone', items: [], restored: [] };
  }
  let same = false;
  try { same = fold(realOf(fs, rec.main)) === fold(realOf(fs, main)); } catch (_) { same = false; }
  if (!same) return refusal('wrong-repo', { detail: `el registro es de ${rec.main}` });

  const rewrites = Array.isArray(rec.rewrites) ? rec.rewrites : [];
  for (const rel of [...rec.items.flatMap((i) => [i.from, i.to]), ...rewrites.flatMap((r) => [r.file, r.fileBefore || r.file])]) {
    const g = isLinkOrOutside(main, rel, fs);
    if (g.bad) return refusal('link-in-path', { detail: g.at, files: [rel] });
  }
  const exists = (rel) => { try { fs.lstatSync(abs(main, rel)); return true; } catch (_) { return false; } };
  const state = rec.items.map((i) => {
    const f = exists(i.from);
    const t = exists(i.to);
    return { item: i, state: f && t ? 'both' : (t ? 'revert' : (f ? 'reverted' : 'none')) };
  });
  const both = state.filter((s) => s.state === 'both');
  if (both.length) return refusal('source-exists', { files: both.map((s) => s.item.from) });
  const none = state.filter((s) => s.state === 'none');
  if (none.length) return refusal('dest-missing', { files: none.map((s) => s.item.to) });

  let busy;
  try { busy = repoBusy(git, main, fs); } catch (e) { return refusal('scan-failed', { detail: e.message }); }
  if (busy.merging) return refusal('merge-in-progress', { detail: busy.merging });
  if (busy.locked) return refusal('index-locked');

  const toRestore = [];
  const modified = [];
  for (const r of rewrites) {
    const cur = fs.existsSync(abs(main, r.file)) ? abs(main, r.file) : (r.fileBefore ? abs(main, r.fileBefore) : null);
    const h = cur ? hashIfFile(fs, cur) : null;
    if (h === r.sha256Before) continue;
    if (h === r.sha256After && cur === abs(main, r.file) && r.backup) { toRestore.push(r); continue; }
    modified.push(r.file);
  }
  if (modified.length) return refusal('modified-since', { files: modified });

  const restored = [];
  const items = [];
  try {
    for (const r of toRestore) {
      writeAtomic(fs, abs(main, r.file), fs.readFileSync(r.backup));
      restored.push(r.file);
    }
  } catch (e) {
    return { ok: false, kind: 'partial', failed: { item: 'rewrites', error: e.message }, items, restored, pending: rec.items.map((i) => i.from), record };
  }
  const pendingNow = () => state.filter((s) => s.state === 'revert' && !items.includes(s.item.from)).map((s) => s.item.from);
  for (const s of [...state].reverse()) {
    if (s.state !== 'revert') { items.push(s.item.from); continue; }
    const it = s.item;
    try {
      const parts = norm(it.from).split('/').slice(0, -1);
      for (let i = 1; i <= parts.length; i += 1) {
        const rel = parts.slice(0, i).join('/');
        const g = isLinkOrOutside(main, rel, fs);
        if (g.bad) throw new Error(`${g.reason}: ${g.at}`);
        try { fs.mkdirSync(abs(main, rel)); } catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      const tracked = gitList(git, main, ['ls-files', '-z', '--', lit(it.to)]).length > 0;
      if (tracked) git(['mv', '--', it.to, it.from], main);
      else fs.renameSync(abs(main, it.to), abs(main, it.from));
    } catch (e) {
      return { ok: false, kind: 'partial', failed: { item: it.from, error: describeFail(e, it) }, items, restored, pending: pendingNow(), record };
    }
    items.push(it.from);
  }
  const notEmpty = removeEmptyDirs(fs, main, rec.createdDirs || []);
  const left = [];
  if (Array.isArray(rec.mapEdits) && rec.mapEdits.length) {
    const mapped = revertMap({ main, rec, env, fs });
    left.push(...mapped.left);
  }
  updateRecord(record, (r) => { r.status = 'undone'; }, fs);
  return { ok: true, items, restored, notEmpty, mapLeft: left };
}

// Revierte `places.<tipo>` en project.md con una edición puntual (la única otra escritura de project.md).
function revertMap({ main, rec, env, fs }) {
  const { revertPlaces } = require('./project-md');
  const { backupFile } = require('./init-actions');
  const file = path.join(main, '.pignolo', 'project.md');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return { left: [] }; }
  const r = revertPlaces({ text, edits: rec.mapEdits });
  if (r.text !== text) {
    backupFile({ file, main, env, now: new Date() });
    writeAtomic(fs, file, r.text);
  }
  return { left: r.left };
}

module.exports = {
  DOC_EXT, RESERVED_SOURCES, MAX_FILES, MAX_DEPTH, isLinkOrOutside, walkTree, gitList, makeRun, isToolOwned, planMoves, applyMoves, undoMoves,
  recordPath, readRecord, updateRecord, writeAtomic, nonDocFile, norm, fold,
};
