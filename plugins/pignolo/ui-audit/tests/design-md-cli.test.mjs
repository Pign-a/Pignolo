import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';

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
    name: 'extract --out without a value',
    setup: (tmp) => ({ args: ['extract', '--project', tmp, '--out'], expected: '--out necesita un valor' }),
  },
  {
    name: 'extract --out is the run-folder .gitignore',
    setup: (tmp) => {
      writeTree(tmp, { 'app.css': ':root { --primary: #0b6bcb; }\n' });
      const out = path.join(tmp, '.pignolo-ui', '.gitignore');
      return {
        args: ['extract', '--project', tmp, '--out', out],
        expected: '.gitignore',
        after: () => assert.equal(fs.existsSync(path.join(tmp, '.pignolo-ui')), false),
      };
    },
  },
  {
    name: 'patch --project that does not exist',
    setup: (tmp) => {
      const file = path.join(tmp, 'DESIGN.md');
      fs.copyFileSync(VALID, file);
      const ops = path.join(tmp, 'ops.json');
      fs.writeFileSync(ops, JSON.stringify([{ op: 'set', path: ['name'], value: 'X' }]));
      const before = fs.readFileSync(file);
      return {
        args: ['patch', '--file', file, '--ops', ops, '--project', path.join(tmp, 'nope')],
        expected: '--project no es una carpeta existente',
        after: () => assert.ok(fs.readFileSync(file).equals(before)),
      };
    },
  },
  {
    name: 'validate --file without a value',
    setup: () => ({ args: ['validate', '--file'], expected: '--file necesita un valor' }),
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
