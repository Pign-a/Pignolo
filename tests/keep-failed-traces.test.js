'use strict';
// tests/evals/keep-failed-traces.js (G17). Resultado sintético con la forma real de `claude plugin eval`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const { persistFailedTraces } = require('./evals/keep-failed-traces');

function fixture() {
  const tempRoot = makeTempDir('pignolo-evtmp-');
  const trace = (n, text) => {
    const dir = path.join(tempRoot, `claude-eval-${n}`, 'out');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'trace.jsonl');
    fs.writeFileSync(file, text);
    return file;
  };
  const run = (passed, tracePath, extra = {}) => ({ score: passed ? 1 : 0, passed, error: null, tracePath, graders: [], ...extra });
  const resultsJson = {
    schemaVersion: 1,
    cases: [
      { name: 'case-a', arms: { with: [run(true, trace('aaa', 'A\n'))] } },
      { name: 'case-b', arms: { with: [run(true, trace('bbb', 'B1\n')), run(false, trace('bbc', 'B2 fallada\n'))] } },
      { name: 'case-c', arms: { with: [run(true, trace('ccc', 'C\n'))] } },
    ],
  };
  return { tempRoot, resultsJson, trace, run };
}

// Protects: G17 (la traza de una corrida fallada sobrevive a la limpieza de %TEMP% o /tmp) · Breaks if:
// se copian también las que pasaron, no se copia la fallada, o una traza que ya no está lanza.
test('persistFailedTraces copies exactly the failed run, names it <case>-<n>, and reports a vanished trace in missing', () => {
  const { tempRoot, resultsJson } = fixture();
  const outDir = path.join(makeTempDir('pignolo-out-'), 'traces', 'run1');
  const r = persistFailedTraces({ resultsJson, tempRoot, outDir });
  assert.deepStrictEqual(r.copied, [path.join(outDir, 'case-b-2.jsonl')]);
  assert.deepStrictEqual(r.missing, []);
  assert.strictEqual(fs.readFileSync(r.copied[0], 'utf8'), 'B2 fallada\n');
  assert.deepStrictEqual(fs.readdirSync(outDir), ['case-b-2.jsonl'], 'las que pasaron no se copian');
  fs.rmSync(path.join(tempRoot, 'claude-eval-bbc'), { recursive: true, force: true });
  const out2 = path.join(makeTempDir('pignolo-out-'), 'run2');
  const gone = persistFailedTraces({ resultsJson, tempRoot, outDir: out2 });
  assert.deepStrictEqual([gone.copied, gone.missing], [[], ['case-b-2']]);
});

test('persistFailedTraces with no failed run copies nothing and creates no folder', () => {
  const { tempRoot, resultsJson } = fixture();
  resultsJson.cases[1].arms.with[1].passed = true;
  const outDir = path.join(makeTempDir('pignolo-out-'), 'none');
  assert.deepStrictEqual(persistFailedTraces({ resultsJson, tempRoot, outDir }), { copied: [], missing: [] });
  assert.ok(!fs.existsSync(outDir));
});

test('a run with an error counts as failed even if passed is true; a trace recorded with another path style is found under tempRoot; the CLI reads the JSON file', () => {
  const { tempRoot, resultsJson, trace, run } = fixture();
  const real = trace('eee', 'E\n');
  resultsJson.cases.push({ name: 'case-e', arms: { with: [run(true, real, { error: 'timeout' })], without: [run(false, 'C:\\Users\\x\\AppData\\Local\\Temp\\claude-eval-eee\\out\\trace.jsonl')] } });
  const outDir = path.join(makeTempDir('pignolo-out-'), 'run3');
  const r = persistFailedTraces({ resultsJson, tempRoot, outDir });
  assert.deepStrictEqual(r.copied.map((f) => path.basename(f)).sort(), ['case-b-2.jsonl', 'case-e-1.jsonl', 'case-e-without-1.jsonl']);
  const json = path.join(makeTempDir('pignolo-cli-'), 'res.json');
  fs.writeFileSync(json, JSON.stringify(resultsJson));
  const out = path.join(path.dirname(json), 'out');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'evals', 'keep-failed-traces.js'), json, '--temp-root', tempRoot, '--out', out], { encoding: 'utf8' });
  assert.strictEqual(cli.status, 0, cli.stderr);
  assert.strictEqual(JSON.parse(cli.stdout).copied.length, 3);
  assert.strictEqual(spawnSync(process.execPath, [path.join(__dirname, 'evals', 'keep-failed-traces.js')], { encoding: 'utf8' }).status, 2);
});
