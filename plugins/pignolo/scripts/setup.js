#!/usr/bin/env node
'use strict';
// Utilidad de /pignolo:setup: check (entorno), permissions (reglas del template) y config (perfil).
// Salida JSON por stdout; exit 0, o 1 con el mensaje en stderr.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { claudeDirs, userHomes, pignoloHome } = require('../lib/home');
const { readConfig, writeConfig } = require('../lib/profiles');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'permissions.json');
const PROBE_TIMEOUT = 8000;

// Ejecutable inyectable por PIGNOLO_SETUP_BIN_<NAME> (un .js se corre con node).
function bin(name, fallback, env) {
  return env[`PIGNOLO_SETUP_BIN_${name}`] || fallback;
}

function exec(cmd, args, opts = {}) {
  const [file, prefix] = /\.js$/i.test(cmd) ? [process.execPath, [cmd]] : [cmd, []];
  const r = spawnSync(file, [...prefix, ...args], { encoding: 'utf8', timeout: PROBE_TIMEOUT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return { ok: !r.error && r.status === 0, out: `${r.stdout || ''}`.trim() };
}

function gitInfo(env) {
  const git = bin('GIT', 'git', env);
  const v = exec(git, ['--version']);
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(v.out);
  if (!v.ok || !m) return { version: null, hooksOk: false, mergeTree: false };
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return { version: m[0], hooksOk: major > 2 || (major === 2 && minor >= 31), mergeTree: probeMergeTree(git) };
}

// Hipótesis de §14 (a verificar en el hito 7): merge-tree --write-tree responde en un repo temporal.
function probeMergeTree(git) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-setup-mt-'));
  try {
    const opts = { cwd: dir };
    if (!exec(git, ['init', '-q'], opts).ok) return false;
    // Repo temporal propio: sin los hooks de un core.hooksPath global del usuario.
    const cfg = ['-c', 'user.name=pignolo', '-c', 'user.email=pignolo@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', `core.hooksPath=${path.join(dir, 'sin-hooks')}`];
    if (!exec(git, [...cfg, 'commit', '-q', '--allow-empty', '-m', 'x'], opts).ok) return false;
    return exec(git, ['merge-tree', '--write-tree', 'HEAD', 'HEAD'], opts).ok;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* temporal */ }
  }
}

function hasSuperpowers(env) {
  for (const dir of claudeDirs(env)) {
    const cache = path.join(dir, 'plugins', 'cache');
    let entries = [];
    try { entries = fs.readdirSync(cache, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (e.isDirectory() && fs.existsSync(path.join(cache, e.name, 'superpowers'))) return true;
    }
  }
  return false;
}

// El ~/.claude que lee Claude Code: el de os.homedir(), que en Windows es USERPROFILE
// (no HOME, que puede diferir en Git Bash).
function userClaudeDir(env) {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) return env.CLAUDE_CONFIG_DIR;
  if (process.platform === 'win32') {
    const home = env.USERPROFILE && env.USERPROFILE.trim() ? env.USERPROFILE : os.homedir();
    return path.join(home, '.claude');
  }
  return path.join(userHomes(env)[0], '.claude');
}

// PowerShell 5.1 escribe UTF-8 con BOM: se quita antes de parsear.
function readText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

// Del más fuerte al más débil: local, proyecto, usuario. Un JSON ilegible se ignora.
function settingsChain(env, cwd) {
  const files = [
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(userClaudeDir(env), 'settings.json'),
  ];
  return files.map((f) => {
    try {
      const d = JSON.parse(readText(f));
      return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    } catch (_) { return {}; }
  });
}

function envValue(chain, key) {
  for (const s of chain) {
    const v = s.env && typeof s.env === 'object' ? s.env[key] : undefined;
    if (v !== undefined && v !== null) return String(v);
  }
  return undefined;
}

function check(env, cwd) {
  const chain = settingsChain(env, cwd);
  const teams = envValue(chain, 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS') ?? env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  const force = envValue(chain, 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE') ?? env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;
  const models = chain.map((s) => s.availableModels).find((m) => Array.isArray(m));
  return {
    node: process.version,
    git: gitInfo(env),
    gh: exec(bin('GH', 'gh', env), ['--version']).ok,
    powershell: exec(bin('POWERSHELL', process.platform === 'win32' ? 'powershell.exe' : 'pwsh', env),
      ['-NoProfile', '-Command', '$PSVersionTable.PSVersion']).ok,
    superpowers: hasSuperpowers(env),
    agentTeams: teams === '1',
    subagentModelForce: force === '1',
    availableModels: models ?? null,
    config: readConfig({ env }),
  };
}

function permissions(args, env, cwd) {
  const target = args.target;
  if (target !== 'user' && target !== 'project') throw new Error('--target debe ser user o project');
  const file = target === 'user' ? path.join(userClaudeDir(env), 'settings.json') : path.join(cwd, '.claude', 'settings.json');
  const wanted = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8')).permissions;

  let settings = {};
  const exists = fs.existsSync(file);
  const raw = exists ? readText(file) : null;
  if (exists) {
    try {
      settings = JSON.parse(raw);
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('no object');
      const p = settings.permissions;
      if (p !== undefined && (!p || typeof p !== 'object' || Array.isArray(p))) throw new Error('permissions');
      for (const list of ['deny', 'ask']) {
        if (p && p[list] !== undefined && !Array.isArray(p[list])) throw new Error(list);
      }
    } catch (_) {
      throw new Error(`settings inválido: ${file}`);
    }
  }

  const add = { deny: [], ask: [] };
  let already = 0;
  for (const list of ['deny', 'ask']) {
    const have = new Set(settings.permissions?.[list] ?? []);
    for (const rule of new Set(wanted[list] ?? [])) {
      if (have.has(rule)) already += 1;
      else add[list].push(rule);
    }
  }
  const result = { file, add, already, applied: false, backup: null };
  if (!args.apply || (!add.deny.length && !add.ask.length)) return result;

  if (exists) {
    result.backup = `${file}.pignolo-bak-${Date.now()}`;
    fs.copyFileSync(file, result.backup);
  }
  settings.permissions = settings.permissions ?? {};
  for (const list of ['deny', 'ask']) {
    if (add[list].length) settings.permissions[list] = [...(settings.permissions[list] ?? []), ...add[list]];
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  result.applied = true;
  return result;
}

function config(args, env) {
  const partial = {};
  if (args.profile !== undefined) partial.profile = args.profile;
  if (args.presentation !== undefined) partial.presentation = args.presentation;
  if (args.language !== undefined) partial.language = args.language;
  return writeConfig({ env }, partial);
}

const RESOLUTIONS = ['human', 'pignolo', 'custom'];

function sha(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const isText = (v) => typeof v === 'string' && v.length > 0;

function normalizeCandidate(e, i) {
  const bad = (why) => new Error(`entrada ${i + 1} inválida: ${why}`);
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw bad('no es un objeto');
  if (!e.source || !isText(e.source.path) || !isText(e.source.quote)) throw bad('source.path y source.quote');
  if (!e.pignolo || !Number.isInteger(e.pignolo.rule) || e.pignolo.rule < 1 || e.pignolo.rule > 6 || !isText(e.pignolo.quote)) {
    throw bad('pignolo.rule (1 a 6) y pignolo.quote');
  }
  if (!RESOLUTIONS.includes(e.resolution)) throw bad('resolution debe ser human, pignolo o custom');
  if (e.note !== undefined && typeof e.note !== 'string') throw bad('note');
  if (e.project !== undefined && typeof e.project !== 'string') throw bad('project');
  const out = {
    source: { path: e.source.path, quote: e.source.quote },
    pignolo: { rule: e.pignolo.rule, quote: e.pignolo.quote },
    resolution: e.resolution,
  };
  if (e.note !== undefined) out.note = e.note;
  if (e.project !== undefined) out.project = e.project;
  out.sha256 = { source: sha(e.source.quote), pignolo: sha(e.pignolo.quote) };
  return out;
}

function readCandidates(file) {
  if (!file) throw new Error('falta el archivo de entradas');
  let data;
  try { data = JSON.parse(readText(file)); } catch (_) { throw new Error(`archivo de entradas ilegible: ${file}`); }
  if (!Array.isArray(data)) throw new Error('el archivo de entradas debe ser una lista');
  return data.map(normalizeCandidate);
}

function loadConflicts(env) {
  const file = path.join(pignoloHome(env), 'rule-conflicts.json');
  if (!fs.existsSync(file)) return { file, entries: [] };
  let data;
  try { data = JSON.parse(readText(file)); } catch (_) { throw new Error(`rule-conflicts.json inválido: ${file}`); }
  if (!data || !Array.isArray(data.entries)) throw new Error(`rule-conflicts.json inválido: ${file}`);
  return { file, entries: data.entries };
}

// El mismo conflicto: mismo proyecto (o ninguno), misma fuente y las mismas citas.
const sameHashes = (a, b) => a.sha256?.source === b.sha256.source && a.sha256?.pignolo === b.sha256.pignolo
  && (a.project ?? null) === (b.project ?? null) && a.source?.path === b.source.path;

// Resoluciones de conflictos de reglas (~/.pignolo/rule-conflicts.json). Si cambia una cita, vuelve a preguntarse.
function conflicts(args, env, cwd) {
  const resolve = (f) => path.resolve(cwd, f);
  if (args.list) return loadConflicts(env);
  if (args.check) {
    const saved = loadConflicts(env);
    const pending = readCandidates(resolve(args.check)).filter((c) => !saved.entries.some((e) => sameHashes(e, c)));
    return { file: saved.file, pending };
  }
  if (args.record) {
    const incoming = readCandidates(resolve(args.record));
    const saved = loadConflicts(env);
    const recorded = new Date().toISOString();
    let replaced = 0;
    let entries = saved.entries;
    for (const c of incoming) {
      const before = entries.length;
      entries = entries.filter((e) => !sameHashes(e, c));
      replaced += before - entries.length;
      entries.push({ ...c, recorded });
    }
    fs.mkdirSync(path.dirname(saved.file), { recursive: true });
    fs.writeFileSync(saved.file, JSON.stringify({ v: 1, entries }, null, 2) + '\n');
    return { file: saved.file, recorded: incoming.length, replaced, total: entries.length };
  }
  throw new Error('conflicts requiere --list, --check <archivo.json> o --record <archivo.json>');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (key === 'apply') args.apply = true;
    else if (key === 'list') args.list = true;
    else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`falta el valor de ${a}`);
      args[key] = v;
      i += 1;
    }
  }
  return args;
}

function main(argv, env = process.env, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const args = parseArgs(rest);
  if (cmd === 'check') return check(env, cwd);
  if (cmd === 'permissions') return permissions(args, env, cwd);
  if (cmd === 'config') return config(args, env);
  if (cmd === 'conflicts') return conflicts(args, env, cwd);
  throw new Error('uso: setup.js check | permissions --target user|project [--apply] | config --profile <p> [--presentation <x>] [--language <l>] | conflicts --list | --check <archivo.json> | --record <archivo.json>');
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { main };
