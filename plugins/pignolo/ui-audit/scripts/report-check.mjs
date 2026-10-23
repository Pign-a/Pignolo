// report-check.mjs: cross-check of the final report against its evidence (spec §12).
//   node <root>/scripts/report-check.mjs --project <repo> --run <folder in .pignolo-ui/runs/>
// Reads <run>/report.json, writes <run>/report-check.json ({ reportSha256, kept, retired,
// implements, exitCode }) and prints { out, kept, retired, implements, exitCode } on stdout.
// Exit codes: 0 no claim retired and the approved is cited when something was implemented;
// 1 at least one claim retired or the approved citation is missing or wrong; 2 own error
// (counts as not verified).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import { isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

class UsageError extends Error {}
const ALLOWED = ['project', 'run'];

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!ALLOWED.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: --project, --run`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    opts[key] = next;
    i++;
  }
  for (const k of ALLOWED) if (opts[k] === undefined) throw new UsageError(`falta --${k}`);
  return opts;
}

export function main(argv, { cwd = process.cwd() } = {}) {
  try {
    const opts = parseArgs(argv);
    const project = path.resolve(cwd, opts.project);
    if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    const run = path.resolve(cwd, opts.run);
    if (!isInsideRunRoot(project, run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/ del proyecto`);
    const file = path.join(run, 'report.json');
    if (!fs.existsSync(file)) throw new UsageError(`no existe ${path.join(opts.run, 'report.json')}`);
    const buf = fs.readFileSync(file);
    let report;
    try { report = JSON.parse(buf.toString('utf8')); } catch { throw new ReportError('report.json no es JSON válido'); }
    const result = checkReport({ project, run, report });
    const out = path.join(run, 'report-check.json');
    const body = { reportSha256: crypto.createHash('sha256').update(buf).digest('hex'), ...result };
    fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ out, kept: result.kept.length, retired: result.retired, implements: result.implements.status, exitCode: result.exitCode }, null, 2)}\n`);
    return result.exitCode;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof ReportError;
    process.stderr.write(`report-check: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
