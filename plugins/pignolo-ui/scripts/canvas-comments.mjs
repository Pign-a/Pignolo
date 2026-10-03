// canvas-comments.mjs: leaves the raw text of the canvas comments as bounded quotes (R-10). It does not
// call anything and does not read a comment as an instruction: the main thread saved what the comments
// tool returned in a file of the run and this prints it quoted.
//
//   canvas-comments.mjs quote --run <run> --raw <file inside the run, up to 200 KB> [--max-block <n>] [--max-blocks <n>]
//   Writes ONLY <run>/comments.json and prints the quoted text. Exit 0 done, 2 usage or own error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quoteComments, renderQuoted } from '../lib/comments-quote.mjs';
import { RUN_ROOT } from '../lib/run-folder.mjs';
import { isLink, runLinkProblem, samePath } from '../lib/link-guard.mjs';

class UsageError extends Error {}

export const RAW_MAX = 200 * 1024;
const SPEC = { value: ['run', 'raw', 'max-block', 'max-blocks'] };

function parse(argv) {
  const [name, ...rest] = argv;
  if (name !== 'quote') throw new UsageError('falta el subcomando: quote');
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!SPEC.value.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${SPEC.value.map((k) => `--${k}`).join(', ')}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  return opts;
}

const count = (v, name) => {
  if (v === undefined) return undefined;
  if (!/^[1-9][0-9]{0,3}$/.test(v)) throw new UsageError(`${name} debe ser un entero entre 1 y 9999`);
  return Number(v);
};

function resolveRun(cwd, value) {
  if (value === undefined) throw new UsageError('falta --run');
  const run = path.resolve(cwd, value);
  const parts = run.split(path.sep);
  const at = parts.findIndex((p, i) => samePath(p, RUN_ROOT) && samePath(parts[i + 1] ?? '', 'runs'));
  if (at < 1 || parts.length !== at + 3) throw new UsageError(`--run debe ser una carpeta de ${RUN_ROOT}/runs/<id> del proyecto`);
  let st = null;
  try { st = fs.statSync(run); } catch { /* missing */ }
  if (!st || !st.isDirectory()) throw new UsageError(`--run no existe: ${value}`);
  const link = runLinkProblem(run);
  if (link) throw new UsageError('la carpeta de la corrida es un enlace: se rechaza');
  return run;
}

export function main(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  try {
    const opts = parse(argv);
    const run = resolveRun(cwd, opts.run);
    if (opts.raw === undefined) throw new UsageError('falta --raw');
    const maxBlock = count(opts['max-block'], '--max-block');
    const maxBlocks = count(opts['max-blocks'], '--max-blocks');
    const raw = path.resolve(cwd, opts.raw);
    const rel = path.relative(run, raw);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new UsageError('--raw debe estar dentro de la carpeta de la corrida');
    let st;
    try { st = fs.lstatSync(raw); } catch { throw new UsageError('--raw no existe'); }
    if (st.isSymbolicLink() || !st.isFile()) throw new UsageError('--raw es un enlace o no es un archivo: se rechaza');
    // a folder inside the run that leads somewhere else is as bad as a link on the file
    const inside = path.relative(fs.realpathSync.native(run), fs.realpathSync.native(raw));
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) throw new UsageError('--raw resuelve fuera de la carpeta de la corrida');
    if (st.size > RAW_MAX) throw new UsageError('--raw pesa más de 200 KB');
    const text = fs.readFileSync(raw).toString('utf8').replace(/^﻿/, '');
    const quoted = quoteComments(text, { ...(maxBlock ? { maxBlock } : {}), ...(maxBlocks ? { maxBlocks } : {}) });
    const out = path.join(run, 'comments.json');
    if (isLink(out)) throw new UsageError('comments.json es un enlace: se rechaza');
    const tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(quoted, null, 2)}\n`);
    fs.renameSync(tmp, out);
    stdout.write(`${renderQuoted(quoted)}${quoted.blocks.length ? '' : '\n> (sin comentarios)'}\n`);
    return 0;
  } catch (e) {
    process.stderr.write(`canvas-comments: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
