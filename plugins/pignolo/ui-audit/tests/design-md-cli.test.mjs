import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, makeTempDir, runScript } from './helpers.mjs';

const VALID = path.join(FIXTURES, 'design', 'valid.md');

// Files under dir (relative paths, sorted) so a case can prove that nothing was written.
function listTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

function assertUsageError(res, expected) {
  assert.equal(res.status, 2, res.stderr);
  assert.ok(res.stderr.startsWith('design-md: '), res.stderr);
  assert.ok(res.stderr.includes(expected), res.stderr);
  assert.ok(!res.stderr.includes('error interno'), res.stderr);
  assert.ok(!/^ {4}at /m.test(res.stderr), res.stderr);
}

const CASES = [
  {
    name: 'validate --project that does not exist',
    setup: (tmp) => ({ args: ['validate', '--file', VALID, '--project', path.join(tmp, 'nope')], expected: '--project no es una carpeta existente' }),
  },
  {
    name: 'validate --file without a value',
    setup: () => ({ args: ['validate', '--file'], expected: '--file necesita un valor' }),
  },
  {
    name: 'validate without --file',
    setup: () => ({ args: ['validate'], expected: 'falta --file' }),
  },
  {
    name: 'extract is not a subcommand of the audit',
    setup: (tmp) => ({ args: ['extract', '--project', tmp, '--out', path.join(tmp, 'p.md')], expected: 'uso: design-md.mjs <validate>' }),
  },
];

for (const c of CASES) {
  test(`usage error without stack: ${c.name}`, () => {
    const tmp = makeTempDir();
    const { args, expected, after } = c.setup(tmp);
    const filesBefore = listTree(tmp);
    assertUsageError(runScript('design-md.mjs', args), expected);
    assert.deepEqual(listTree(tmp), filesBefore);
    if (after) after();
  });
}
