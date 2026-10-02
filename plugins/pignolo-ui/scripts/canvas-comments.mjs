// canvas-comments.mjs: leaves the raw comments of the canvas as bounded quotes (R-10). It calls nothing,
// interprets nothing and writes ONE file, <run>/comments.json. Without dependencies, without a child
// process and without network: what a comment says never reaches a command, a repo file or a parameter.
//
//   canvas-comments.mjs quote --run <run> --raw <file inside the run> [--max-block <n>] [--max-blocks <n>]
//
// Prints the quoted text (a fixed header, every line prefixed with "> "). Exit 0 done, 2 usage.
import fs from 'node:fs';
import path from 'node:path';
import { RUN_ROOT } from '../lib/run-folder.mjs';
import { runLinkProblem, samePath } from '../lib/link-guard.mjs';
import { quoteComments, renderQuoted } from '../lib/comments-quote.mjs';

class UsageError extends Error {}

const RAW_MAX = 200 * 1024;
const VALUE = ['run', 'raw', 'max-block', 'max-blocks'];

function parse(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!VALUE.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${VALUE.map((k) => `--${k}`).join(', ')}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  return opts;
}

// <project>/.pignolo-ui/runs/<id>
function resolveRun(cwd, opts) {
  if (opts.run === undefined) throw new UsageError('falta --run');
  const run = path.resolve(cwd, opts.run);
  const parts = run.split(path.sep);
  const at = parts.findIndex((p, i) => samePath(p, RUN_ROOT) && samePath(parts[i + 1] ?? '', 'runs'));
  if (at < 1 || parts.length !== at + 3) throw new UsageError(`--run debe ser una carpeta de ${RUN_ROOT}/runs/<id> del proyecto`);
  let st;
  try { st = fs.statSync(run); } catch { st = null; }
  if (!st || !st.isDirectory()) throw new UsageError(`--run no existe: ${opts.run}`);
  const link = runLinkProblem(run);
  if (link) throw new UsageError(`${path.basename(link)} es un enlace: se rechaza`);
  return run;
}

// The raw file: a regular file inside the run, never a link or behind one, up to 200 KB.
function rawFile(cwd, run, arg) {
  if (arg === undefined) throw new UsageError('falta --raw');
  const file = path.resolve(cwd, arg);
  const rel = path.relative(run, file);
  const inside = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && !(process.platform === 'win32' && /^[a-z]:/i.test(rel));
  if (!inside) throw new UsageError('--raw debe estar dentro de la carpeta de la corrida');
  let st;
  try { st = fs.lstatSync(file); } catch { throw new UsageError('--raw no existe'); }
  if (st.isSymbolicLink()) throw new UsageError('--raw es un enlace: se rechaza');
  if (!st.isFile()) throw new UsageError('--raw no es un archivo');
  if (st.size > RAW_MAX) throw new UsageError('--raw pesa más de 200 KB');
  try {
    if (!samePath(fs.realpathSync.native(file), path.join(fs.realpathSync.native(run), rel))) throw new Error('moved');
  } catch {
    throw new UsageError('--raw pasa por un enlace o una unión: se rechaza');
  }
  return file;
}

// UTF-8 (with or without BOM) or UTF-16 with BOM, which is what a shell redirection may leave.
function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buf.toString('utf8');
}

function intOpt(opts, key) {
  if (opts[key] === undefined) return undefined;
  if (!/^[1-9][0-9]{0,5}$/.test(opts[key])) throw new UsageError(`--${key} debe ser un entero positivo`);
  return Number(opts[key]);
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function main(argv, cwd) {
  const [cmd, ...rest] = argv;
  if (cmd !== 'quote') throw new UsageError('subcomando desconocido; el único es quote');
  const opts = parse(rest);
  const run = resolveRun(cwd, opts);
  const file = rawFile(cwd, run, opts.raw);
  const out = path.join(run, 'comments.json');
  try {
    if (fs.lstatSync(out).isSymbolicLink()) throw new UsageError('comments.json es un enlace: se rechaza');
  } catch (e) {
    if (e instanceof UsageError) throw e;
  }
  const limits = {};
  const maxBlock = intOpt(opts, 'max-block');
  const maxBlocks = intOpt(opts, 'max-blocks');
  if (maxBlock !== undefined) limits.maxBlock = maxBlock;
  if (maxBlocks !== undefined) limits.maxBlocks = maxBlocks;
  const quoted = quoteComments(decode(fs.readFileSync(file)), limits);
  writeAtomic(out, `${JSON.stringify(quoted, null, 2)}\n`);
  process.stdout.write(`${renderQuoted(quoted)}\n`);
}

try {
  main(process.argv.slice(2), process.cwd());
} catch (e) {
  if (e instanceof UsageError) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`error propio: ${e && e.message ? e.message : e}\n`);
  process.exit(2);
}
