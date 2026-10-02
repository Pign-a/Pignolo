// product-md.mjs: the optional PRODUCT.md of the project (hito 4f).
//   validate --project <repo> [--values-file <JSON list>]
//            0 ok or missing (the file is optional), 1 invalid, 2 own error
//   template  prints the template (five sections, each `undecided`)
//   create   --project <repo> --from <draft> [--values-file <JSON list>]
//            validates the draft and writes <repo>/PRODUCT.md with `wx`: never overwrites.
//            0 created, 1 exists or invalid draft (nothing written), 2 own error
// Prints one JSON object on stdout; a leak is reported by line and kind, never by value.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProduct, PRODUCT_TEMPLATE } from '../lib/product-md.mjs';
import { readValuesFile } from '../lib/leak-check.mjs';

class UsageError extends Error {}

const ALLOWED = {
  validate: ['project', 'values-file'],
  template: [],
  create: ['project', 'from', 'values-file'],
};

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  const allowed = ALLOWED[cmd];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    if (allowed && !allowed.includes(a.slice(2))) {
      throw new UsageError(`opción desconocida ${a} para ${cmd}; opciones válidas: ${allowed.map((k) => `--${k}`).join(', ') || '(ninguna)'}`);
    }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`${a} necesita un valor`);
    opts[a.slice(2)] = next;
    i++;
  }
  return { cmd, opts };
}

const need = (opts, ...keys) => {
  const missing = keys.filter((k) => !opts[k]);
  if (missing.length) throw new UsageError(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
};

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function findProduct(project) {
  const name = fs.readdirSync(project).find((n) => n.toLowerCase() === 'product.md');
  return name ? path.join(project, name) : null;
}

function leakValues(opts) {
  if (opts['values-file'] === undefined) return [];
  try {
    return readValuesFile(opts['values-file']);
  } catch {
    // never echo the file's content: it holds the user's own values
    throw new UsageError('--values-file debe ser un archivo JSON con una lista de textos');
  }
}

const report = (v) => ({ status: v.status, sections: Object.keys(v.sections), missing: v.missing, undecided: v.undecided, problems: v.problems });

function cmdValidate(opts) {
  need(opts, 'project');
  if (!isDir(opts.project)) throw new UsageError(`no existe el proyecto ${opts.project}`);
  const values = leakValues(opts);
  const file = findProduct(opts.project);
  if (!file) return { out: { status: 'missing' }, code: 0 };
  const v = validateProduct(fs.readFileSync(file, 'utf8'), { leakValues: values });
  return { out: report(v), code: v.status === 'ok' ? 0 : 1 };
}

function cmdTemplate() {
  const v = validateProduct(PRODUCT_TEMPLATE);
  return { out: { template: PRODUCT_TEMPLATE, ...report(v) }, code: 0 };
}

function cmdCreate(opts) {
  need(opts, 'project', 'from');
  if (!isDir(opts.project)) throw new UsageError(`no existe el proyecto ${opts.project}`);
  const values = leakValues(opts);
  let draft;
  try {
    draft = fs.readFileSync(opts.from, 'utf8');
  } catch (e) {
    throw new UsageError(`no se pudo leer --from ${opts.from} (${e.code || e.message})`);
  }
  if (findProduct(opts.project)) return { out: { created: false, error: 'exists' }, code: 1 };
  const v = validateProduct(draft, { leakValues: values });
  if (v.status !== 'ok') return { out: { created: false, ...report(v) }, code: 1 };
  try {
    fs.writeFileSync(path.join(opts.project, 'PRODUCT.md'), draft, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') return { out: { created: false, error: 'exists' }, code: 1 };
    throw e;
  }
  return { out: { created: true, ...report(v) }, code: 0 };
}

const COMMANDS = { validate: cmdValidate, template: cmdTemplate, create: cmdCreate };

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const run = COMMANDS[cmd];
    if (!run) throw new UsageError(`uso: product-md.mjs <${Object.keys(COMMANDS).join('|')}> [opciones]`);
    const { out, code } = run(opts);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    process.stderr.write(`product-md: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
