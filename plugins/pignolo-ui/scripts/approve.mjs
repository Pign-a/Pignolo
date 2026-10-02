// approve.mjs: save | record | verify of approved visual decisions (spec §3.3).
//   save   --project <repo> --flow <slug> --from <folder with the chosen HTML> [--date YYYY-MM-DD]
//          --values-file <JSON list of user and machine values for the leak check; required, `[]` when there are none>
//          --brief-file <brief.md of the screen: sealed in the approved folder; required except for the `direction` flow>
//          0 saved, 1 refused (screens not self-contained or leaking data), 2 own error
//   record --project <repo> --path design/approved/<flow> --quote-file <file> [--date] [--write]
//          prints the diff of the "## Decisions" entry; writes DESIGN.md only with --write
//          0 ok, 1 not applicable, 2 own error
//   verify --project <repo> --path design/approved/<flow>
//          0 ok, 1 BLOCKED, 2 own error
// Prints one JSON object on stdout; paths always come as arguments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveApproved, verifyApproved, decisionEntry, findDesignFile, manifestSha, APPROVED_PATH } from '../lib/approved.mjs';
import { patchDesign } from '../lib/design-patch.mjs';
import { readValuesFile } from '../lib/leak-check.mjs';

class UsageError extends Error {}

// Options each subcommand accepts: anything else is a usage error, so a typo such as
// --value-file can never silently skip a check (spec §7.4).
const ALLOWED = {
  save: ['project', 'flow', 'from', 'date', 'values-file', 'brief-file'],
  record: ['project', 'path', 'quote-file', 'date', 'write'],
  verify: ['project', 'path'],
};

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  const allowed = ALLOWED[cmd];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    if (allowed && !allowed.includes(a.slice(2))) {
      throw new UsageError(`opción desconocida ${a} para ${cmd}; opciones válidas: ${allowed.map((k) => `--${k}`).join(', ')}`);
    }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[a.slice(2)] = true;
    else { opts[a.slice(2)] = next; i++; }
  }
  return { cmd, opts };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function need(opts, ...keys) {
  const missing = keys.filter((k) => !opts[k] || opts[k] === true);
  if (missing.length) throw new UsageError(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
}

// --date must be a real calendar day written YYYY-MM-DD; the manifest and DESIGN.md record it.
function checkDate(opts) {
  if (opts.date === undefined) return;
  const d = new Date(`${opts.date}T00:00:00Z`);
  const ok = typeof opts.date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(opts.date) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(opts.date);
  if (!ok) throw new UsageError('--date debe ser una fecha real con formato YYYY-MM-DD');
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function cmdSave(opts) {
  need(opts, 'project', 'flow', 'from', 'values-file');
  // style tiles (`direction`) have no first look; every other flow seals the brief of its screen
  if (opts.flow !== 'direction' && opts['brief-file'] === undefined) throw new UsageError('falta --brief-file');
  checkDate(opts);
  if (!isDir(opts.project)) throw new UsageError(`no existe el proyecto ${opts.project}`);
  if (!isDir(opts.from)) throw new UsageError(`no existe la carpeta de pantallas ${opts.from}`);
  let leakValues;
  try {
    leakValues = readValuesFile(opts['values-file']);
  } catch {
    // never echo the file's content: it holds the user's own values
    throw new UsageError('--values-file debe ser un archivo JSON con una lista de textos (usar [] si no hay valores)');
  }
  let brief = null;
  if (opts['brief-file'] !== undefined) {
    if (opts['brief-file'] === true) throw new UsageError('--brief-file necesita un archivo');
    try {
      brief = fs.readFileSync(opts['brief-file'], 'utf8');
    } catch (e) {
      throw new UsageError(`no se pudo leer --brief-file ${opts['brief-file']} (${e.code || e.message})`);
    }
  }
  const r = saveApproved({ projectRoot: opts.project, flow: opts.flow, from: opts.from, date: opts.date || today(), leakValues, brief });
  return { out: r, code: r.ok ? 0 : 1 };
}

function cmdRecord(opts) {
  need(opts, 'project', 'path', 'quote-file');
  checkDate(opts);
  let quote;
  try {
    quote = fs.readFileSync(opts['quote-file'], 'utf8');
  } catch (e) {
    throw new UsageError(`no se pudo leer --quote-file ${opts['quote-file']} (${e.code || e.message})`);
  }
  if (!APPROVED_PATH.test(opts.path)) return { out: { written: false, error: 'bad-path' }, code: 1 };
  const designFile = findDesignFile(opts.project);
  if (!designFile) return { out: { written: false, error: 'no-design-md' }, code: 1 };
  let sha;
  try {
    sha = manifestSha(opts.project, opts.path);
  } catch {
    return { out: { written: false, error: 'manifest-unreadable' }, code: 1 };
  }
  const entry = decisionEntry({ path: opts.path, manifestSha256: sha, date: opts.date || today(), quote });
  const text = fs.readFileSync(designFile, 'utf8');
  const r = patchDesign(text, [{ op: 'section-append', heading: 'Decisions', text: entry }]);
  if (!r.ok) return { out: { written: false, error: r.error }, code: 1 };
  if (opts.write) {
    fs.writeFileSync(designFile, r.text);
    if (fs.readFileSync(designFile, 'utf8') !== r.text) throw new Error('DESIGN.md escrito no coincide con el propuesto');
  }
  return { out: { written: Boolean(opts.write), entry, manifestSha256: sha, diff: r.diff }, code: 0 };
}

function cmdVerify(opts) {
  need(opts, 'project', 'path');
  const r = verifyApproved({ projectRoot: opts.project, approvedPath: opts.path });
  return { out: r, code: r.status === 'ok' ? 0 : 1 };
}

const COMMANDS = { save: cmdSave, record: cmdRecord, verify: cmdVerify };

export function main(argv) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const run = COMMANDS[cmd];
    if (!run) throw new UsageError(`uso: approve.mjs <${Object.keys(COMMANDS).join('|')}> [opciones]`);
    const { out, code } = run(opts);
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    process.stderr.write(`approve: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
