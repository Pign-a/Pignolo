// The audit lives apart from the rest of the plugin (design §5.4): the modules that the audit entry
// points import, followed to the end, must not include anything that belongs to publishing to a
// canvas (canvas-*, leak-*, link-guard, remote-*, presentation, approved, product-md).
// The check follows the real imports of the files, so a new import that drags one of them in fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, PLUGIN_ROOT } from './helpers.mjs';

const ENTRIES = ['scripts/audit.mjs', 'scripts/browser.mjs', 'scripts/ui-check.mjs', 'scripts/report-check.mjs', 'scripts/design-md.mjs'];
const FORBIDDEN = /^(canvas.*|leak-.*|link-guard|remote-.*|presentation|approved|product-md)$/;
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g;

// { files: sorted relative paths reached from the entries, dangling: [{ from, spec }] }
export function closure(root, entries) {
  const seen = new Set();
  const dangling = [];
  const visit = (abs, from) => {
    if (seen.has(abs)) return;
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { dangling.push({ from, spec: path.relative(root, abs).split(path.sep).join('/') }); return; }
    seen.add(abs);
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(IMPORT)) visit(path.resolve(path.dirname(abs), m[1]), path.relative(root, abs).split(path.sep).join('/'));
  };
  for (const e of entries) visit(path.resolve(root, e), '(entry)');
  return { files: [...seen].map((f) => path.relative(root, f).split(path.sep).join('/')).sort(), dangling };
}

export const forbiddenIn = (files) => files.filter((f) => FORBIDDEN.test(path.basename(f, '.mjs')));

test('the closure of the audit entry points holds no canvas, leak, link-guard, remote, presentation, approved or product-md module', () => {
  const { files } = closure(PLUGIN_ROOT, ENTRIES);
  assert.deepEqual(forbiddenIn(files), []);
});

test('every import of the closure resolves to a file that exists', () => {
  assert.deepEqual(closure(PLUGIN_ROOT, ENTRIES).dangling, []);
});

test('the closure holds what the audit measures with', () => {
  const { files } = closure(PLUGIN_ROOT, ENTRIES);
  for (const need of ['lib/browser-run.mjs', 'lib/cdp-pipe.mjs', 'lib/css-walk.mjs', 'lib/color.mjs', 'lib/catalog.mjs', 'lib/ui-check.mjs', 'lib/rules/contrast.mjs',
    'lib/norms.mjs', 'lib/auditor-output.mjs', 'lib/report-check.mjs', 'lib/report-build.mjs', 'lib/env-check.mjs', 'lib/run-init.mjs', 'lib/project-config.mjs', 'lib/design-doc.mjs']) {
    assert.ok(files.includes(need), `${need} is not reached from the entry points`);
  }
});

// The detector itself: a tree shaped like the old chain (an entry that reaches a leak module through a helper) is caught.
test('the detector flags a forbidden module reached through an intermediate one', () => {
  const root = makeTempDir();
  writeTree(root, {
    'scripts/audit.mjs': "import { a } from '../lib/helper.mjs';\n",
    'lib/helper.mjs': "import { findLeaks } from './leak-check.mjs';\nexport const a = findLeaks;\n",
    'lib/leak-check.mjs': 'export const findLeaks = () => [];\n',
  });
  const { files } = closure(root, ['scripts/audit.mjs']);
  assert.deepEqual(forbiddenIn(files), ['lib/leak-check.mjs']);
  for (const name of ['canvas-html', 'link-guard', 'remote-fonts', 'presentation', 'approved', 'product-md']) assert.ok(forbiddenIn([`lib/${name}.mjs`]).length === 1, name);
  assert.deepEqual(forbiddenIn(['lib/catalog.mjs', 'lib/report-check.mjs', 'lib/ui-check.mjs']), []);
});

test('a dangling import is reported', () => {
  const root = makeTempDir();
  writeTree(root, { 'scripts/audit.mjs': "import { x } from '../lib/gone.mjs';\n" });
  assert.deepEqual(closure(root, ['scripts/audit.mjs']).dangling, [{ from: 'scripts/audit.mjs', spec: 'lib/gone.mjs' }]);
});
