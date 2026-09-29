// design-md.mjs: validate | extract | patch (spec §4). The skill passes every path as an
// argument (${CLAUDE_PLUGIN_ROOT} and userConfig never reach the Bash environment).
// Prints one JSON object on stdout. Exit codes:
//   validate: 0 valid, 1 findings, 2 not verified (unsupported YAML) or own error
//   patch:    0 diff computed (written with --write), 1 refused or not applicable, 2 own error
//   extract:  0 proposal written to --out, 1 nothing to propose (DESIGN.md exists, unreadable or no tokens), 2 own error
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDesign } from '../lib/design-doc.mjs';
import { patchDesign, formatDiff } from '../lib/design-patch.mjs';
import { extractDesign } from '../lib/design-extract.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { runOfficialLint } from '../lib/official-lint.mjs';
import { readTokenSources } from '../lib/token-sources.mjs';

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

// Options each subcommand accepts: anything else is a usage error (a typo never goes unnoticed).
const ALLOWED = {
  validate: ['file', 'project', 'official', 'catalog'],
  patch: ['file', 'ops', 'project', 'write', 'catalog'],
  extract: ['project', 'out', 'date', 'catalog'],
};

// Options that take a value; the rest (official, write) are boolean flags.
const VALUE_OPTS = new Set(['file', 'ops', 'project', 'out', 'date', 'catalog']);

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  const allowed = ALLOWED[cmd];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (allowed && !allowed.includes(key)) {
      throw new UsageError(`opción desconocida ${a} para ${cmd}; opciones válidas: ${allowed.map((k) => `--${k}`).join(', ')}`);
    }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) {
      if (VALUE_OPTS.has(key)) throw new UsageError(`--${key} necesita un valor`);
      opts[key] = true;
    } else { opts[key] = next; i++; }
  }
  return { cmd, opts };
}

function readText(file, what) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new UsageError(`no se pudo leer ${what} ${file} (${e.code || e.message})`);
  }
}

// --date is a real calendar day written YYYY-MM-DD.
function isRealDate(v) {
  if (typeof v !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)) return false;
  const t = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(v);
}

function requireProjectDir(project) {
  let ok = false;
  try {
    ok = fs.statSync(project).isDirectory();
  } catch {
    // reported below
  }
  if (!ok) throw new UsageError(`--project no es una carpeta existente: ${project}`);
}

function loadCatalog(opts) {
  const file = opts.catalog || path.join(PLUGIN_ROOT, 'catalog', 'rules.json');
  return JSON.parse(readText(file, 'el catálogo'));
}

function cmdValidate(opts) {
  if (!opts.file) throw new UsageError('falta --file <DESIGN.md>');
  const text = readText(opts.file, 'el archivo');
  if (opts.project !== undefined) requireProjectDir(opts.project);
  const darkInCss = opts.project ? readTokenSources(opts.project).darkDetected : false;
  const r = validateDesign(text, { catalog: loadCatalog(opts), darkInCss });
  const { data, ...out } = r;
  // The official linter only informs: its warnings on a user's file never block (spec §4.2).
  if (opts.official) out.official = runOfficialLint(opts.file, { projectRoot: opts.project });
  return { out: { ...out, darkInCss }, code: r.status === 'valid' ? 0 : r.status === 'invalid' ? 1 : 2 };
}

// A malformed operation is a usage error (exit 2), not something for the patcher to trip over.
function checkOp(op, i) {
  const where = `operación ${i + 1} de --ops`;
  if (op === null || typeof op !== 'object' || Array.isArray(op)) throw new UsageError(`${where} debe ser un objeto { "op": ... }`);
  if (op.op === 'section-append') {
    if (typeof op.heading !== 'string' || !op.heading.trim()) throw new UsageError(`${where}: section-append necesita "heading" (texto no vacío)`);
    if (typeof op.text !== 'string') throw new UsageError(`${where}: section-append necesita "text" (texto)`);
  } else if (['set', 'append', 'remove-item'].includes(op.op) && !(Array.isArray(op.path) && op.path.length)) {
    throw new UsageError(`${where}: ${op.op} necesita "path" (lista no vacía)`);
  }
}

// Shows the diff; writes only with --write (after the user confirmed it) and never when the
// patch introduces a finding that rejects the file (for example intentional on the floor).
function cmdPatch(opts) {
  if (!opts.file || !opts.ops) throw new UsageError('faltan --file <DESIGN.md> y --ops <ops.json>');
  if (opts.project !== undefined) requireProjectDir(opts.project);
  const text = readText(opts.file, 'el archivo');
  let ops;
  try {
    ops = JSON.parse(readText(opts.ops, 'las operaciones'));
  } catch (e) {
    if (e instanceof UsageError) throw e;
    throw new UsageError(`--ops no es JSON válido (${e.message})`);
  }
  if (!Array.isArray(ops)) throw new UsageError('--ops debe ser una lista de operaciones');
  ops.forEach((op, i) => checkOp(op, i));
  const r = patchDesign(text, ops);
  if (!r.ok) return { out: { written: false, error: r.error, op: r.op }, code: 1 };
  const catalog = loadCatalog(opts);
  const darkInCss = opts.project ? readTokenSources(opts.project).darkDetected : false;
  const before = validateDesign(text, { catalog, darkInCss });
  const after = validateDesign(r.text, { catalog, darkInCss });
  const known = new Set(before.findings.filter((f) => f.rejects).map((f) => `${f.id} ${f.path}`));
  const introduced = after.findings.filter((f) => f.rejects && !known.has(`${f.id} ${f.path}`));
  const validation = { status: after.status, findings: after.findings };
  if (introduced.length) return { out: { written: false, refused: introduced, diff: r.diff, validation }, code: 1 };
  if (opts.write) {
    fs.writeFileSync(opts.file, r.text);
    if (fs.readFileSync(opts.file, 'utf8') !== r.text) throw new Error('el archivo escrito no coincide con el propuesto');
  }
  return { out: { written: Boolean(opts.write), diff: r.diff, hunks: r.hunks, validation }, code: 0 };
}

// Writes a proposal inside the run folder (never DESIGN.md itself, never over an existing file); the diff is shown
// and the user confirms it before the flow copies it to DESIGN.md.
function cmdExtract(opts) {
  if (!opts.project || !opts.out) throw new UsageError('faltan --project <raíz del repo> y --out <archivo de propuesta>');
  requireProjectDir(opts.project);
  if (opts.date !== undefined && !isRealDate(opts.date)) {
    throw new UsageError('--date debe ser una fecha real con formato YYYY-MM-DD');
  }
  // DESIGN.md changes only through the diff the user confirms, and a proposal lives in the run folder.
  if (path.basename(opts.out).toLowerCase() === 'design.md') throw new UsageError('--out no puede llamarse DESIGN.md: extract solo escribe una propuesta');
  // The run folder's own .gitignore is created by ensureRunRoot; writing a proposal over it would collide.
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  if (norm(opts.out) === norm(path.join(opts.project, RUN_ROOT, '.gitignore'))) throw new UsageError(`--out no puede ser ${RUN_ROOT}/.gitignore: es el archivo que ignora la carpeta de corridas`);
  if (!isInsideRunRoot(opts.project, opts.out)) throw new UsageError(`--out debe estar dentro de ${RUN_ROOT}/ del proyecto (carpeta de la corrida)`);
  if (fs.existsSync(opts.out)) throw new UsageError(`${opts.out} ya existe: extract nunca sobrescribe`);
  const existing = fs.readdirSync(opts.project).find((n) => n.toLowerCase() === 'design.md');
  if (existing) return { out: { mode: 'exists', file: existing }, code: 1 };
  const r = extractDesign(opts.project, opts.date ? { date: opts.date } : {});
  if (!r.text) return { out: { mode: r.mode, unsupported: r.unsupported, unverified: r.unverified }, code: 1 };
  ensureRunRoot(opts.project); // .gitignore before the first write (spec §3.2)
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, r.text, { flag: 'wx' });
  const v = validateDesign(r.text, { catalog: loadCatalog(opts), darkInCss: r.darkDetected });
  const diff = formatDiff([{ line: 1, removed: [], added: r.text.replace(/\n$/, '').split('\n') }]);
  return {
    out: {
      mode: r.mode, out: opts.out, from: r.from, extracted: r.extracted, renamed: r.renamed, darkDetected: r.darkDetected,
      unsupported: r.unsupported, unverified: r.unverified, validation: { status: v.status, findings: v.findings }, diff,
    },
    code: 0,
  };
}

const COMMANDS = { validate: cmdValidate, patch: cmdPatch, extract: cmdExtract };

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const run = COMMANDS[cmd];
    if (!run) throw new UsageError(`uso: design-md.mjs <${Object.keys(COMMANDS).join('|')}> [opciones]`);
    const { out, code } = run(opts);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    process.stderr.write(`design-md: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
