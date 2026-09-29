// Translated rejections (spec §5.6), in process through runCheck with an injected MOTION-04.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, writeTree, FIXTURES } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { fail } from '../lib/rules/api.mjs';

const FX = path.join(FIXTURES, 'rules-rejections');
const read = (name) => fs.readFileSync(path.join(FX, name), 'utf8');
const DESIGN = read('DESIGN.md');

// Stand-in for the real MOTION-04 (Task 7): fails on every `transition: all`.
const motion04 = {
  id: 'MOTION-04',
  checkFile(ctx) {
    return ctx.css.decls
      .filter((d) => d.property === 'transition' && /^all\b/.test(d.value))
      .map((d) => fail(`${d.selector}|transition|${d.value}`, { line: d.line, selector: d.selector }));
  },
};

async function run(tree, { design = DESIGN, files } = {}) {
  const project = writeTree(makeTempDir(), { 'DESIGN.md': design, ...tree });
  const r = await runCheck({
    project,
    files: files ?? Object.keys(tree),
    design: path.join(project, 'DESIGN.md'),
    base: null,
    dom: [],
    inject: { rules: [motion04] },
  });
  return r;
}
const of = (entries, id) => entries.filter((e) => e.id === id);

// Design with only the rejections given, as raw yaml lines.
const designWith = (lines) => ['---', 'version: alpha', 'name: Fixture', 'pignolo:', '  schema: 1', '  rejections:', ...lines, '---', ''].join('\n');
const patternItem = (id, kind, value) => [`    - id: ${id}`, '      date: 2026-09-20', '      pattern:', `        kind: ${kind}`, `        value: ${JSON.stringify(value)}`, '      note: n'];

test('rule rejection: a fail of MOTION-04 becomes a floor, bloquea, rejected R-001', async () => {
  const r = await run({ 'card.css': read('card.css') });
  const [e] = of(r.entries, 'MOTION-04').filter((x) => x.status === 'fail');
  assert.equal(e.severity, 'bloquea');
  assert.equal(e.reason, 'rejected R-001');
  assert.equal(r.exitCode, 1);
});

test('without the rejection the same fail stays medio and exit is 0', async () => {
  const r = await run({ 'card.css': read('card.css') }, { design: designWith(patternItem('R-002', 'text', 'zzz')) });
  const [e] = of(r.entries, 'MOTION-04').filter((x) => x.status === 'fail');
  assert.equal(e.severity, 'medio');
  assert.equal(r.exitCode, 0);
});

test('text pattern: matches the static text, not another text', async () => {
  const r = await run({ 'cta.html': read('cta.html') });
  const [e] = of(r.entries, 'R-002');
  assert.equal(e.status, 'fail');
  assert.equal(e.severity, 'bloquea');
  assert.equal(e.file, 'cta.html');
  assert.equal(e.line, 1);
  assert.equal(r.exitCode, 1);
  const ok = await run({ 'cta-ok.html': read('cta-ok.html') });
  assert.deepEqual(of(ok.entries, 'R-002').filter((x) => x.status === 'fail'), []);
  assert.equal(ok.exitCode, 0);
});

test('property pattern: matches "property: value" of a declaration', async () => {
  const r = await run({ 'btn.css': read('btn.css') });
  const [e] = of(r.entries, 'R-003');
  assert.equal(e.status, 'fail');
  assert.equal(e.severity, 'bloquea');
  assert.equal(e.line, 1);
  assert.equal(r.exitCode, 1);
});

test('selector pattern: matches a selector from the css walk', async () => {
  const design = designWith(patternItem('R-004', 'selector', '^\\.hero\\b'));
  const r = await run({ 'a.css': '.hero { color: red; }\n.other { color: red; }\n' }, { design });
  const hits = of(r.entries, 'R-004').filter((x) => x.status === 'fail');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].selector, '.hero');
});

test('an invalid regex is unverified (invalid pattern), never pass', async () => {
  const r = await run({ 'cta.html': read('cta.html') }, { design: designWith(patternItem('R-002', 'text', '([')) });
  const [e] = of(r.entries, 'R-002');
  assert.equal(e.status, 'unverified');
  assert.match(e.reason, /invalid pattern/);
  assert.equal(r.exitCode, 0);
});

test('a value longer than 200 characters is unverified', async () => {
  const r = await run({ 'cta.html': read('cta.html') }, { design: designWith(patternItem('R-002', 'text', 'a'.repeat(201))) });
  const [e] = of(r.entries, 'R-002');
  assert.equal(e.status, 'unverified');
  assert.match(e.reason, /invalid pattern/);
});

test('a rejection reappearing in a mockup still blocks', async () => {
  const file = '.pignolo-ui/runs/r1/option-a/home.html';
  const r = await run({ [file]: read('cta.html') });
  const [e] = of(r.entries, 'R-002');
  assert.equal(e.status, 'fail');
  assert.equal(e.severity, 'bloquea');
  assert.equal(e.file, file);
  assert.equal(r.exitCode, 1);
});

test('intentional never lowers a rejected rule', async () => {
  const design = DESIGN.replace('  rejections:', '  intentional:\n    - id: MOTION-04\n      why: decidido\n  rejections:');
  const r = await run({ 'card.css': read('card.css') }, { design });
  assert.equal(of(r.entries, 'MOTION-04').filter((x) => x.status === 'fail').length, 1);
});

test('no DESIGN.md rejections: entries pass through untouched', async () => {
  const r = await run({ 'card.css': read('card.css') }, { design: '---\nversion: alpha\nname: F\n---\n' });
  assert.equal(of(r.entries, 'MOTION-04')[0].severity, 'medio');
  assert.deepEqual(r.entries.filter((e) => /^R-/.test(e.id)), []);
});

// Needs Task 10 (scope by base): a rejected pattern already in the base is debt, alto, exit 0.
test('rejection in the base is debt (alto, exit 0)', { todo: 'needs Task 10 (scope); completed in Task 12' }, () => {});
