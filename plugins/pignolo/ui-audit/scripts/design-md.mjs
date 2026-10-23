// design-md.mjs: validate (the audit validates the project's design.md before measuring against it).
// The skill passes every path as an argument (${CLAUDE_PLUGIN_ROOT} and userConfig never reach the Bash
// environment). Prints one JSON object on stdout. Exit codes:
//   validate: 0 valid, 1 findings, 2 not verified (unsupported YAML) or own error
//   node design-md.mjs validate --file <design.md> [--project <repo>] [--official] [--catalog <rules.json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDesign } from '../lib/design-doc.mjs';
import { runOfficialLint } from '../lib/official-lint.mjs';
import { readTokenSources } from '../lib/token-sources.mjs';

const PLUGIN_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

// Options each subcommand accepts: anything else is a usage error (a typo never goes unnoticed).
const ALLOWED = {
  validate: ['file', 'project', 'official', 'catalog'],
};

// Options that take a value; the rest (official) are boolean flags.
const VALUE_OPTS = new Set(['file', 'project', 'catalog']);

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
  if (!opts.file) throw new UsageError('falta --file <design.md>');
  const text = readText(opts.file, 'el archivo');
  if (opts.project !== undefined) requireProjectDir(opts.project);
  const darkInCss = opts.project ? readTokenSources(opts.project).darkDetected : false;
  const r = validateDesign(text, { catalog: loadCatalog(opts), darkInCss });
  const { data, ...out } = r;
  // The official linter only informs: its warnings on a user's file never block (spec §4.2).
  if (opts.official) out.official = runOfficialLint(opts.file, { projectRoot: opts.project });
  return { out: { ...out, darkInCss }, code: r.status === 'valid' ? 0 : r.status === 'invalid' ? 1 : 2 };
}

const COMMANDS = { validate: cmdValidate };

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
