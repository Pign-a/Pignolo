// ui-check.mjs: deterministic checks of the v1 catalog (spec §5.3, §5.5).
//
// node <root>/scripts/ui-check.mjs [--project <repo root>] --run <folder in .pignolo-ui/>
//   (--files <path>)... [--files-from <list.json>] [--design <DESIGN.md>] [--base <ref>]
//   [--dom <file>]... [--url <development URL>]... [--gate]
//
// --url (at most 20, one origin, loopback only: nothing remote at run time) feeds the static
// SEO rules with what the development server returns; it needs --design (spec §5.4, A-06).
//
// --project defaults to `git rev-parse --show-toplevel` from the cwd, or the cwd without git.
// Writes <run>/ui-check.json ({ catalogVersion, inputs, base, entries }) and prints
// { out, counts: { pass, fail, unverified, blockingNew }, exitCode } on stdout; with --gate,
// only one summary line on stderr. Exit codes: 0 no new `bloquea` fail, 1 at least one,
// 2 own error (usage or internal), which counts as not verified.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../lib/ui-check.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { BaseRefError, assertRef } from '../lib/scope.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';

class UsageError extends Error {}

const VALUE_OPTS = new Set(['project', 'run', 'files', 'files-from', 'design', 'base', 'dom', 'url']);
const REPEATED = new Set(['files', 'dom', 'url']);
const MAX_URLS = 20;
const FLAGS = new Set(['gate']);

function parseArgs(argv) {
  const opts = { files: [], dom: [], url: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (FLAGS.has(key)) { opts[key] = true; continue; }
    if (!VALUE_OPTS.has(key)) {
      throw new UsageError(`opción desconocida ${a}; opciones válidas: ${[...VALUE_OPTS, ...FLAGS].map((k) => `--${k}`).join(', ')}`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    i++;
    if (REPEATED.has(key)) opts[key].push(next);
    else if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    else opts[key] = next;
  }
  return opts;
}

// Real path of `p` (long names, true case on Windows), also when its tail does not exist yet.
function canonical(p) {
  const abs = path.resolve(p);
  let head = abs;
  const tail = [];
  while (!fs.existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) return abs;
    tail.unshift(path.basename(head));
    head = parent;
  }
  return path.join(fs.realpathSync.native(head), ...tail);
}

function gitToplevel(cwd) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function insideProject(project, file) {
  const rel = path.relative(project, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function inputFile(project, p, what) {
  const abs = canonical(p);
  if (!isFile(abs)) throw new UsageError(`${what} no existe o no es un archivo: ${p}`);
  if (!insideProject(project, abs)) throw new UsageError(`${what} está fuera del proyecto ${project}: ${p}`);
  return abs;
}

function readFilesFrom(file) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new UsageError(`no se pudo leer --files-from ${file} (${e.code || e.message})`);
  }
  if (!Array.isArray(list) || !list.every((x) => typeof x === 'string' && x)) throw new UsageError('--files-from debe ser una lista JSON de rutas');
  return list;
}

function checkUrls(urls, design) {
  if (!urls.length) return [];
  if (!design) throw new UsageError('--url necesita --design: el SEO estático solo corre si DESIGN.md declara web.public');
  if (urls.length > MAX_URLS) throw new UsageError(`--url admite como mucho ${MAX_URLS} direcciones`);
  for (const u of urls) if (!isLoopbackUrl(u)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${u}`);
  const origin = new URL(urls[0]).origin;
  for (const u of urls) if (new URL(u).origin !== origin) throw new UsageError(`todas las --url deben tener el mismo origen (${origin}): ${u}`);
  return urls;
}

export async function main(argv, { cwd = process.cwd(), check = runCheck } = {}) {
  try {
    const opts = parseArgs(argv);
    const projectArg = opts.project !== undefined ? path.resolve(cwd, opts.project) : (gitToplevel(cwd) || cwd);
    let isDir = false;
    try { isDir = fs.statSync(projectArg).isDirectory(); } catch { /* reported below */ }
    if (!isDir) throw new UsageError(`--project no es una carpeta existente: ${projectArg}`);
    const project = canonical(projectArg);

    if (opts.run === undefined) throw new UsageError(`falta --run <carpeta de la corrida dentro de ${RUN_ROOT}/>`);
    const runDir = canonical(path.resolve(cwd, opts.run));
    if (!isInsideRunRoot(project, runDir)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/ del proyecto (${project})`);

    const listed = [...opts.files, ...(opts['files-from'] !== undefined ? readFilesFrom(path.resolve(cwd, opts['files-from'])) : [])];
    const files = listed.map((f) => inputFile(project, path.resolve(cwd, f), '--files'));
    const dom = opts.dom.map((f) => inputFile(project, path.resolve(cwd, f), '--dom'));
    const design = opts.design !== undefined ? inputFile(project, path.resolve(cwd, opts.design), '--design') : null;
    const urls = checkUrls(opts.url, design);
    if (!files.length && !dom.length && !design) throw new UsageError('falta --files, --dom o --design: no hay nada que chequear');

    const base = opts.base ?? null;
    if (base !== null) assertRef(project, base); // an invalid ref is a usage error, before any rule runs
    const result = await check({ project, files, design, base, dom, urls });

    ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
    fs.mkdirSync(runDir, { recursive: true });
    const out = path.join(runDir, 'ui-check.json');
    const report = { catalogVersion: loadCatalog().catalogVersion, inputs: result.inputs, base, entries: result.entries };
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

    const count = (s) => result.entries.filter((e) => e.status === s).length;
    const counts = {
      pass: count('pass'),
      fail: count('fail'),
      unverified: count('unverified'),
      blockingNew: result.entries.filter((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new').length,
    };
    if (opts.gate) {
      process.stderr.write(`ui-check: código ${result.exitCode}; ${counts.blockingNew} bloqueantes nuevos, ${counts.fail} fallas, ${counts.unverified} no verificados, ${counts.pass} pasan (${out})\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ out, counts, exitCode: result.exitCode }, null, 2)}\n`);
    }
    return result.exitCode;
  } catch (e) {
    process.stderr.write(`ui-check: ${e instanceof UsageError || e instanceof BaseRefError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
