// leak-check.mjs --dir <folder> [--values-file <json list>] (spec §7.4)
// Prints { ok, leaks } on stdout. Exit 0 clean, 1 at least one leak, 2 own error.
// The values (email, git name and email, OS user, home) come as a file argument: they
// never reach this script through the environment.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLeaks, readValuesFile } from '../lib/leak-check.mjs';

export function main(argv) {
  try {
    const opts = {};
    for (let i = 0; i < argv.length; i += 2) {
      if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`argumento inesperado: ${argv[i]}`);
      opts[argv[i].slice(2)] = argv[i + 1];
    }
    if (!opts.dir) throw new Error('falta --dir <carpeta>');
    const values = opts['values-file'] ? readValuesFile(opts['values-file']) : [];
    const { leaks } = checkLeaks(opts.dir, values);
    process.stdout.write(`${JSON.stringify({ ok: leaks.length === 0, leaks }, null, 2)}\n`);
    return leaks.length ? 1 : 0;
  } catch (e) {
    process.stderr.write(`leak-check: ${e.message}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
