// approve.mjs: save | record | verify of approved visual decisions (spec §3.3).
//   save   --project <repo> --flow <slug> --from <folder with the chosen HTML> [--date YYYY-MM-DD]
//          --values-file <JSON list of user and machine values for the leak check; required, `[]` when there are none>
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
  save: ['project', 'flow', 'from', 'date', 'values-file'],
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

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function cmdSave(opts) {
  need(opts, 'project', 'flow', 'from', 'values-file');
  if (!isDir(opts.project)) throw new UsageError(`no existe el proyecto ${opts.project}`);
  if (!isDir(opts.from)) throw new UsageError(`no existe la carpeta de pantallas ${opts.from}`);
  const leakValues = readValuesFile(opts['values-file']);
  const r = saveApproved({ projectRoot: opts.project, flow: opts.flow, from: opts.from, date: opts.date || today(), leakValues });
  return { out: r, code: r.ok ? 0 : 1 };
}

function cmdRecord(opts) {
  need(opts, 'project', 'path', 'quote-file');
  if (!APPROVED_PATH.test(opts.path)) return { out: { written: false, error: 'bad-path' }, code: 1 };
  const designFile = findDesignFile(opts.project);
  if (!designFile) return { out: { written: false, error: 'no-design-md' }, code: 1 };
  let sha;
  try {
    sha = manifestSha(opts.project, opts.path);
  } catch {
    return { out: { written: false, error: 'manifest-unreadable' }, code: 1 };
  }
  const quote = fs.readFileSync(opts['quote-file'], 'utf8');
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
