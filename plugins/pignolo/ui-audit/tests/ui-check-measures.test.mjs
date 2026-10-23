// ui-check --measures <browser.json> (spec §5.5): the browser entries join ui-check.json and
// its exit code, and browser.json is recorded in inputs so a later measure makes it stale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeTempDir, writeTree, runScript } from './helpers.mjs';

const entry = (over = {}) => ({
  id: 'COLOR-03', status: 'fail', severity: 'bloquea', scope: 'new', selector: '#low',
  fingerprint: 'COLOR-03|/|1440|light|#low', measure: { ratio: 2.32, required: 4.5, width: 1440, theme: 'light', page: '/' }, ...over,
});

function setup(entries) {
  const root = writeTree(makeTempDir(), { 'src/a.css': '.a { display: block; }\n' });
  const run = path.join(root, '.pignolo-ui', 'runs', 'r1');
  const measures = path.join(run, 'browser.json');
  writeTree(root, { '.pignolo-ui/runs/r1/browser.json': JSON.stringify({ version: 1, entries }) });
  return { root, run, measures };
}
const uiCheck = ({ root, run, measures }, extra = []) => runScript('ui-check.mjs', ['--project', root, '--run', run, '--measures', measures, ...extra], { cwd: root });
const readOut = (run) => JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));

test('a new bloquea from the browser makes ui-check exit 1; browser.json is an input', () => {
  const s = setup([entry(), entry({ id: 'NAV-01', status: 'pass', severity: 'bloquea', fingerprint: 'NAV-01|/|1440|light|checked', selector: undefined, measure: { checked: 3 } })]);
  const r = uiCheck(s, ['--files', 'src/a.css']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.json.counts.blockingNew, 1);
  const out = readOut(s.run);
  assert.deepEqual(out.entries.filter((e) => e.fingerprint.startsWith('COLOR-03|/')), [entry()]);
  assert.ok(out.entries.some((e) => e.fingerprint === 'NAV-01|/|1440|light|checked'));
  const sha = crypto.createHash('sha256').update(fs.readFileSync(s.measures)).digest('hex');
  assert.deepEqual(out.inputs.find((i) => i.file === '.pignolo-ui/runs/r1/browser.json'), { file: '.pignolo-ui/runs/r1/browser.json', sha256: sha });
});

test('browser debt does not block, and --measures alone is a valid run', () => {
  const s = setup([entry({ scope: 'debt', severity: 'alto' })]);
  const r = uiCheck(s);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readOut(s.run).entries.filter((e) => e.fingerprint.startsWith('COLOR-03|/')).map((e) => [e.scope, e.severity]), [['debt', 'alto']]);
});

test('a browser.json that is not the contract is a usage error (exit 2)', async (t) => {
  const CASES = [
    ['not JSON', '{nope', /browser\.json no es JSON válido/],
    ['no entries', JSON.stringify({ version: 1 }), /browser\.json no tiene la lista entries/],
    ['bad status', JSON.stringify({ entries: [entry({ status: 'ok' })] }), /browser\.json: entrada 1 inválida/],
    ['bad scope', JSON.stringify({ entries: [entry({ scope: 'old' })] }), /browser\.json: entrada 1 inválida/],
    ['no fingerprint', JSON.stringify({ entries: [entry({ fingerprint: undefined })] }), /browser\.json: entrada 1 inválida/],
  ];
  for (const [name, body, message] of CASES) {
    await t.test(name, () => {
      const s = setup([]);
      fs.writeFileSync(s.measures, body);
      const r = uiCheck(s);
      assert.equal(r.status, 2);
      assert.match(r.stderr, message);
      assert.doesNotMatch(r.stderr, /error interno/);
    });
  }
});

test('--measures outside the project is refused', () => {
  const s = setup([]);
  const outside = path.join(writeTree(makeTempDir(), { 'browser.json': JSON.stringify({ entries: [] }) }), 'browser.json');
  const r = uiCheck({ ...s, measures: outside });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--measures está fuera del proyecto/);
});
