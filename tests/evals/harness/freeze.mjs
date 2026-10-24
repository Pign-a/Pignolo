// Dev / validation split and the freeze. A validation task only runs against a freeze written after the pre-registration:
// <privateRoot>/freeze.json holds the hash of every validation task package, the identity of each arm's plugin, the
// `claude --version`, the model and the effort. If anything differs when a validation run starts, the run is refused (free,
// before any spend) and the message says what changed. Dev tasks never need it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { FIXTURES_DIR, taskConfig, isFixtureTask, taskSet } from './config.mjs';
import { buildChildEnv } from './env.mjs';

export const freezePath = (cfg) => path.join(cfg.privateRoot, 'freeze.json');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const slash = (p) => String(p).replace(/\\/g, '/');

// JSON with sorted keys at every level: the same data always gives the same text, so the same hash.
export function canonicalJson(x) {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x === undefined ? null : x);
}
export const hashOf = (x) => sha(canonicalJson(x));

const gitOut = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : null;
};

// Files under `dir` (relative, forward slashes, sorted); skips the folders in `skip` at any depth.
function walkFiles(dir, skip = []) {
  const out = [];
  const visit = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && skip.includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile()) out.push(slash(path.relative(dir, p)));
    }
  };
  visit(dir);
  return out.sort();
}

const OPTIONAL = ['gold-files.txt', 'coverage-cmd.txt', 'mutation-cmd.txt'];
const REQUIRED_FILES = ['prompt.md', 'base.txt', 'accept-cmd.txt', 'full-cmd.txt'];

// The hashes of one task package: prompt, base, the acceptance tests (sorted), the commands and, when present, the scope list and
// the optional coverage and mutation commands. A fixture task hashes its fixture folder and the prompt of the configuration.
export function taskPackage(cfg, task) {
  const files = {};
  if (isFixtureTask(cfg, task)) {
    const t = taskConfig(cfg, task);
    const root = path.join(FIXTURES_DIR, t.fixture);
    for (const f of walkFiles(root)) files[`fixture/${f}`] = sha(fs.readFileSync(path.join(root, f)));
    files['config:prompt'] = sha(String(t.prompt));
    return { files, baseCommit: null };
  }
  const dir = path.join(cfg.privateRoot, task);
  const missing = REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) throw new Error(`la tarea ${task} no tiene ${missing.join(', ')} en la carpeta privada`);
  for (const f of REQUIRED_FILES) files[f] = sha(fs.readFileSync(path.join(dir, f)));
  const acceptDir = path.join(dir, 'accept');
  for (const f of walkFiles(acceptDir)) files[`accept/${f}`] = sha(fs.readFileSync(path.join(acceptDir, f)));
  for (const f of OPTIONAL) if (fs.existsSync(path.join(dir, f))) files[f] = sha(fs.readFileSync(path.join(dir, f)));
  // The ref in base.txt must resolve to a commit, and that commit is part of the freeze (a branch name could move).
  const ref = fs.readFileSync(path.join(dir, 'base.txt'), 'utf8').trim();
  const baseCommit = ref ? gitOut(cfg.sourceRepo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) : null;
  if (!baseCommit) throw new Error(`la tarea ${task}: base.txt (${ref || 'vacío'}) no se resuelve a un commit de la fuente`);
  return { files, baseCommit };
}

// Identity of a plugin folder: inside a git repo, the tree hash of that folder at HEAD (it only changes when the plugin changes,
// unlike the commit of the whole repo, which moves with every unrelated commit); the repo commit is recorded apart for traceability.
// Outside git (or not tracked there), a hash of the folder content. A folder with uncommitted changes is dirty: it cannot be frozen.
export function pluginIdentity(dir) {
  if (!dir) return { identity: { kind: 'none' }, info: null };
  if (!fs.existsSync(dir)) throw new Error(`no existe la carpeta del plugin ${dir}`);
  const top = gitOut(dir, ['rev-parse', '--show-toplevel']);
  if (top) {
    const prefix = gitOut(dir, ['rev-parse', '--show-prefix']) || '';
    const spec = prefix ? `HEAD:${slash(prefix).replace(/\/+$/, '')}` : 'HEAD^{tree}';
    const tree = gitOut(dir, ['rev-parse', '--verify', '--quiet', spec]);
    if (tree) {
      const dirty = (gitOut(dir, ['status', '--porcelain', '--untracked-files=all', '--', '.']) || '') !== '';
      return { identity: { kind: 'git', treeHash: tree }, info: { commit: gitOut(dir, ['rev-parse', 'HEAD']), dirty } };
    }
  }
  const h = crypto.createHash('sha256');
  for (const f of walkFiles(dir, ['.git', 'node_modules'])) h.update(`${f}\0${sha(fs.readFileSync(path.join(dir, f)))}\n`);
  return { identity: { kind: 'content', contentHash: h.digest('hex') }, info: null };
}

export function claudeVersion(cfg) {
  const r = spawnSync(cfg.claudeBin, [...(cfg.claudeArgsPrefix || []), '--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 60000, env: buildChildEnv(cfg).env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error || r.status !== 0 || !String(r.stdout).trim()) {
    throw new Error(`no se pudo obtener "${cfg.claudeBin} --version"${r.error ? `: ${r.error.message}` : ''}`);
  }
  return String(r.stdout).trim().split(/\r?\n/)[0];
}

export const validationTasks = (cfg) => Object.entries(cfg.tasks || {}).filter(([, t]) => t && t.set === 'validation').map(([id]) => id).sort();

// What the freeze hash covers (nothing here depends on a path or a timestamp). `info` carries what is recorded but not hashed.
export function computeBody(cfg, preregCommit) {
  const tasks = {};
  for (const id of validationTasks(cfg)) {
    const p = taskPackage(cfg, id);
    tasks[id] = { set: taskSet(cfg, id), baseCommit: p.baseCommit, files: p.files, taskHash: hashOf({ files: p.files, baseCommit: p.baseCommit }) };
  }
  const arms = {};
  const info = { plugins: {} };
  for (const [id, a] of Object.entries(cfg.arms)) {
    const { identity, info: i } = pluginIdentity(a.pluginDir);
    arms[id] = { pluginName: a.pluginName || null, plugin: identity, promptPrefixSha: a.promptPrefix ? sha(a.promptPrefix) : null };
    if (i) info.plugins[id] = i;
  }
  const body = { schema: 1, preregCommit, claudeVersion: claudeVersion(cfg), model: String(cfg.model), effort: String(cfg.effort), tasks, arms };
  return { body, info };
}

// Describes, in words, what differs between the frozen body and the current one.
export function describeChanges(saved, now) {
  const out = [];
  for (const k of ['preregCommit', 'claudeVersion', 'model', 'effort']) {
    if (saved[k] !== now[k]) out.push(`${k} cambió (congelado ${JSON.stringify(saved[k])}, ahora ${JSON.stringify(now[k])})`);
  }
  const ids = [...new Set([...Object.keys(saved.tasks || {}), ...Object.keys(now.tasks || {})])].sort();
  for (const id of ids) {
    const a = saved.tasks && saved.tasks[id];
    const b = now.tasks && now.tasks[id];
    if (!a) { out.push(`la tarea ${id} es de validación pero no figura en el freeze`); continue; }
    if (!b) { out.push(`la tarea ${id} figura en el freeze pero ya no es de validación en la configuración`); continue; }
    if (a.baseCommit !== b.baseCommit) out.push(`tarea ${id}: el commit base cambió`);
    const names = [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].sort();
    for (const n of names) {
      if (a.files[n] === undefined) out.push(`tarea ${id}: archivo nuevo ${n}`);
      else if (b.files[n] === undefined) out.push(`tarea ${id}: archivo borrado ${n}`);
      else if (a.files[n] !== b.files[n]) out.push(`tarea ${id}: cambió ${n}`);
    }
  }
  const armIds = [...new Set([...Object.keys(saved.arms || {}), ...Object.keys(now.arms || {})])].sort();
  for (const id of armIds) {
    const a = saved.arms && saved.arms[id];
    const b = now.arms && now.arms[id];
    if (!a || !b) { out.push(`brazo ${id}: ${a ? 'ya no está en la configuración' : 'no figura en el freeze'}`); continue; }
    if (a.pluginName !== b.pluginName) out.push(`brazo ${id}: cambió el plugin (${a.pluginName} a ${b.pluginName})`);
    if (canonicalJson(a.plugin) !== canonicalJson(b.plugin)) out.push(`brazo ${id}: el contenido del plugin cambió`);
    if (a.promptPrefixSha !== b.promptPrefixSha) out.push(`brazo ${id}: cambió el promptPrefix`);
  }
  return out;
}

const readSaved = (cfg) => {
  const file = freezePath(cfg);
  if (!fs.existsSync(file)) return { error: `no existe ${file}; después de pre-registrar la ficha corré "run.mjs freeze --prereg <commit de la ficha>"` };
  try { return { saved: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { error: `freeze.json ilegible: ${e.message}` }; }
};

// Checks the current files and arm identities against freeze.json. Writes nothing.
export function verifyFreeze(cfg) {
  const { saved, error } = readSaved(cfg);
  if (error) return { ok: false, problems: [error], freezeHash: null, preregCommit: null };
  const problems = [];
  if (!saved || !saved.body || !saved.freezeHash) {
    return { ok: false, problems: ['freeze.json no tiene body ni freezeHash'], freezeHash: null, preregCommit: null };
  }
  if (hashOf(saved.body) !== saved.freezeHash) problems.push('freeze.json fue editado: su freezeHash no coincide con su contenido');
  let now = null;
  try { now = computeBody(cfg, saved.body.preregCommit); } catch (e) { problems.push(`no se pudo recalcular el freeze: ${e.message}`); }
  if (now) {
    problems.push(...describeChanges(saved.body, now.body));
    for (const [id, i] of Object.entries(now.info.plugins)) {
      if (i.dirty) problems.push(`brazo ${id}: el plugin tiene cambios sin commitear`);
    }
    if (!problems.length && hashOf(now.body) !== saved.freezeHash) problems.push('el freezeHash recalculado no coincide con el guardado');
  }
  return { ok: problems.length === 0, problems, freezeHash: saved.freezeHash, preregCommit: saved.body.preregCommit };
}

// For `run`: refuses (throws) unless the freeze verifies and the task is in it. Returns { freezeHash, preregCommit }.
export function requireFreeze(cfg, task) {
  const v = verifyFreeze(cfg);
  if (!v.ok) {
    throw new Error(`la tarea ${task} es de validación y el freeze no se cumple (algo cambió después del pre-registro): ${v.problems.join('; ')}. No se lanza nada`);
  }
  return { freezeHash: v.freezeHash, preregCommit: v.preregCommit };
}

const stamp = () => new Date().toISOString().replace(/[-:.]/g, '');

// Writes freeze.json. Refuses to overwrite one that exists (--force moves the old one to freeze.json.<timestamp>.bak first).
export function freeze(cfg, { prereg, force = false }) {
  if (!prereg || !/^[0-9a-f]{7,40}$/i.test(String(prereg))) throw new Error('--prereg necesita el hash (7 a 40 hexadecimales) del commit de la ficha pre-registrada');
  const repo = cfg.preregRepo;
  const commit = gitOut(repo, ['rev-parse', '--verify', '--quiet', `${prereg}^{commit}`]);
  if (!commit) throw new Error(`el commit ${prereg} no existe en ${repo}: la ficha tiene que estar commiteada antes del freeze`);
  const tasks = validationTasks(cfg);
  if (!tasks.length) throw new Error('no hay tareas de validación: marcá alguna con "set": "validation" en la configuración');
  const file = freezePath(cfg);
  if (fs.existsSync(file) && !force) {
    throw new Error(`${file} ya existe; un freeze nuevo necesita --force (el anterior queda en freeze.json.<fecha>.bak)`);
  }
  const { body, info } = computeBody(cfg, commit);
  const dirty = Object.entries(info.plugins).filter(([, i]) => i.dirty).map(([id]) => id);
  if (dirty.length) throw new Error(`el plugin de los brazos ${dirty.join(', ')} tiene cambios sin commitear: commitealo antes de congelar`);
  let backup = null;
  if (fs.existsSync(file)) {
    backup = `${file}.${stamp()}.bak`;
    fs.renameSync(file, backup);
  }
  const out = { freezeHash: hashOf(body), preregCommit: commit, createdAt: new Date().toISOString(), info, body };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  return { file, freezeHash: out.freezeHash, preregCommit: commit, tasks, backup };
}
