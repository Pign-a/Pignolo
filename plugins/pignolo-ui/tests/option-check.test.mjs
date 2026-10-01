import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitState, checkOption } from '../lib/option-check.mjs';
import { makeTempDir, writeTree } from './helpers.mjs';

const page = (body, head = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;

function setup(files = {}) {
  const project = makeTempDir();
  execFileSync('git', ['init', '-q'], { cwd: project });
  fs.writeFileSync(path.join(project, 'README.md'), 'x\n');
  const dir = path.join(project, '.pignolo-ui', 'runs', 'r1', 'option-A');
  writeTree(dir, {
    'inicio.html': page('<a href="detalle.html">Ir</a>'),
    'detalle.html': page('<a href="inicio.html">Volver</a>'),
    ...files,
  });
  return { project, dir };
}
const EXPECTED = ['inicio.html', 'detalle.html'];
const problemsOf = (r) => r.problems.map((p) => p.problem);

test('a good option is ok', () => {
  const { project, dir } = setup();
  const r = checkOption({ dir, expected: EXPECTED, project, gitBefore: gitState(project) });
  assert.deepEqual([r.ok, r.problems, r.warnings], [true, [], []]);
});

test('each problem is reported and the option fails', () => {
  const cases = [
    ['missing', { 'detalle.html': undefined }, 'missing', (d) => fs.rmSync(path.join(d, 'detalle.html'))],
    ['empty-file', {}, 'empty-file', (d) => fs.writeFileSync(path.join(d, 'detalle.html'), '')],
    ['unexpected-file', { 'extra.html': page('x') }, 'unexpected-file', () => {}],
    ['no-charset', { 'inicio.html': '<!doctype html><html><head><title>t</title></head><body>x</body></html>' }, 'no-charset', () => {}],
    ['script', { 'inicio.html': page('<script>1</script>') }, 'script', () => {}],
    ['remote-resource', { 'inicio.html': page('<img src="https://x.test/a.png" alt="">') }, 'remote-resource', () => {}],
    ['broken-link', { 'inicio.html': page('<a href="paso-3.html">x</a>') }, 'broken-link', () => {}],
  ];
  for (const [name, files, expectedProblem, mutate] of cases) {
    const clean = Object.fromEntries(Object.entries(files).filter(([, v]) => v !== undefined));
    const { project, dir } = setup(clean);
    mutate(dir);
    const r = checkOption({ dir, expected: EXPECTED, project, gitBefore: gitState(project) });
    assert.equal(r.ok, false, name);
    assert.ok(problemsOf(r).includes(expectedProblem), `${name}: ${JSON.stringify(r.problems)}`);
  }
});

test('repo-changed: a new file outside .pignolo-ui fails; under .pignolo-ui it does not', () => {
  const { project, dir } = setup();
  const before = gitState(project);
  fs.writeFileSync(path.join(project, 'nuevo.txt'), 'x');
  const r = checkOption({ dir, expected: EXPECTED, project, gitBefore: before });
  assert.ok(problemsOf(r).includes('repo-changed'));
  fs.rmSync(path.join(project, 'nuevo.txt'));
  fs.mkdirSync(path.join(project, '.pignolo-ui', 'otra'), { recursive: true });
  fs.writeFileSync(path.join(project, '.pignolo-ui', 'otra', 'a.txt'), 'x');
  const ok = checkOption({ dir, expected: EXPECTED, project, gitBefore: before, ignoreUnder: ['.pignolo-ui/'] });
  assert.ok(!problemsOf(ok).includes('repo-changed'));
});

test('a missing option folder reports every expected file as missing', () => {
  const { project } = setup();
  const r = checkOption({ dir: path.join(project, 'nada'), expected: EXPECTED, project });
  assert.deepEqual(problemsOf(r), ['missing', 'missing']);
});
