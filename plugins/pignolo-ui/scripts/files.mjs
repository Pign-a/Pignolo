// files.mjs: save | verify | restore of one batch of edits (spec §9).
//   save    --project <repo> --batch <folder in .pignolo-ui/runs/<run>/> --expected <list.json>
//           list = [{ "path", "exists": true|false, "change": "tokens"|"structure" }], at most 5
//           0 saved, 1 refused (see problems), 2 own error
//   verify  --project <repo> --batch <folder>
//           0 the delta is inside the expected list, 1 unexpected changes, 2 own error
//           (`warnings` source-moved: restore will delete no unexpected untracked file)
//   restore --project <repo> --batch <folder>
//           0 everything restored, 1 BLOCKED (something left alone; `restored` and `deleted`
//           still list what was done, `summary` says it in one line), 2 own error
// Prints one JSON object on stdout. Never runs destructive git.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { saveBatch, verifyBatch, restoreBatch, BatchError } from '../lib/batch-files.mjs';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';

class UsageError extends Error {}

const ALLOWED = { save: ['project', 'batch', 'expected'], verify: ['project', 'batch'], restore: ['project', 'batch'] };

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!ALLOWED[cmd]) throw new UsageError(`subcomando desconocido ${cmd ?? '(ninguno)'}; usá save, verify o restore`);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!ALLOWED[cmd].includes(key)) throw new UsageError(`opción desconocida ${a} para ${cmd}; opciones válidas: ${ALLOWED[cmd].map((k) => `--${k}`).join(', ')}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  const missing = ALLOWED[cmd].filter((k) => opts[k] === undefined);
  if (missing.length) throw new UsageError(`faltan ${missing.map((k) => `--${k}`).join(', ')}`);
  return { cmd, opts };
}

function toplevel(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const real = (p) => fs.realpathSync.native(p);

export function main(argv, { cwd = process.cwd() } = {}) {
  try {
    const { cmd, opts } = parseArgs(argv);
    const projectArg = path.resolve(cwd, opts.project);
    if (!fs.existsSync(projectArg) || !fs.statSync(projectArg).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    const top = toplevel(projectArg);
    if (!top || real(top) !== real(projectArg)) throw new UsageError('--project tiene que ser la raíz de un repo git');
    const project = real(projectArg);
    const batch = path.resolve(cwd, opts.batch);
    // inside a run (runs/<run>/<batch>): report-check only looks for files.json in its run
    const inRun = path.relative(path.join(project, RUN_ROOT), batch).split(path.sep);
    if (!isInsideRunRoot(project, batch) || inRun.length < 3 || inRun[0] !== 'runs') throw new UsageError(`--batch debe estar dentro de ${RUN_ROOT}/runs/<run>/ del proyecto`);
    let result;
    if (cmd === 'save') {
      let expected;
      try { expected = JSON.parse(fs.readFileSync(path.resolve(cwd, opts.expected), 'utf8')); } catch (e) { throw new UsageError(`no se pudo leer --expected (${e.code || e.message})`); }
      ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
      fs.mkdirSync(batch, { recursive: true });
      const r = saveBatch({ project, batch, expected });
      result = { ok: r.ok, problems: r.problems, files: r.ok ? r.record.files.map(({ path: p, existed, change }) => ({ path: p, existed, change })) : [] };
    } else if (cmd === 'verify') {
      result = verifyBatch({ project, batch });
    } else {
      result = restoreBatch({ project, batch });
      result.status = result.ok ? 'restored' : 'BLOCKED';
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof BatchError;
    process.stderr.write(`files: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
