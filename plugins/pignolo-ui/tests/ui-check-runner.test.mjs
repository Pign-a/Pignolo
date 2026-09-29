// In-process tests of the ui-check runner (lib/ui-check.mjs) with injected rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { makeTempDir, writeTree } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { pass, fail, unverified } from '../lib/rules/api.mjs';

// Fails on every line of ctx.text with outline: none (comments are already stripped).
const outlineRule = {
  id: 'STATE-04',
  checkFile(ctx) {
    const out = [];
    ctx.text.split('\n').forEach((l, i) => { if (/outline:\s*none/.test(l)) out.push(fail(`outline-${i}`, { line: i + 1 })); });
    return out;
  },
};
const always = (id, finding = () => fail('k')) => ({ id, checkFile: () => [finding()] });

async function run(tree, { files = Object.keys(tree).filter((f) => f !== 'DESIGN.md'), design, ...opts } = {}) {
  const project = writeTree(makeTempDir(), tree);
  const r = await runCheck({ project, files, design: design ? path.join(project, design) : null, base: null, dom: [], ...opts });
  return { ...r, project };
}
const of = (entries, id) => entries.filter((e) => e.id === id);

const DESIGN_FLOOR_VS_INTENTIONAL = [
  '---',
  'pignolo:',
  '  schema: 1',
  '  intentional:',
  '    - id: MOTION-04',
  '      why: decidido',
  '  rejections:',
  '    - id: R-001',
  '      date: 2026-09-20',
  '      rule: MOTION-04',
  '      note: rechazado',
  '---',
  '',
].join('\n');

const designIntentional = (items) => ['---', 'pignolo:', '  schema: 1', ...(items.length ? ['  intentional:'] : []),
  ...items.flatMap(([id, why]) => [`    - id: ${id}`, `      why: "${why}"`]), '---', ''].join('\n');

test('comments are stripped before the rules: outline: none in a comment gives pass', async () => {
  const a = await run({ 'a.css': '.a { outline: none }\n' }, { inject: { rules: [outlineRule] } });
  assert.deepEqual(of(a.entries, 'STATE-04').map((e) => [e.status, e.file, e.line]), [['fail', 'a.css', 1]]);
  const b = await run({ 'a.css': '/* .a { outline: none } */\n' }, { inject: { rules: [outlineRule] } });
  assert.deepEqual(of(b.entries, 'STATE-04').map((e) => e.status), ['pass']);
});

test('document rules run only on documents', async () => {
  const rules = [always('A11Y-02')];
  const r = await run({ 'Card.tsx': 'export const C = () => <div>x</div>;\n', 'index.html': '<html><head></head><body></body></html>\n' }, { inject: { rules } });
  const card = of(r.entries, 'A11Y-02').find((e) => e.file === 'Card.tsx');
  assert.equal(card.status, 'unverified');
  assert.equal(card.reason, 'not a document');
  assert.equal(of(r.entries, 'A11Y-02').find((e) => e.file === 'index.html').status, 'fail');
});

test('routing: .vue runs only style rules, .astro nothing', async () => {
  const rules = [always('A11Y-04'), always('STATE-04')];
  const r = await run({ 'C.vue': '<template><button>x</button></template>\n', 'p.astro': '<button>x</button>\n' }, { inject: { rules } });
  const at = (id, file) => r.entries.filter((e) => e.id === id && e.file === file).map((e) => [e.status, e.reason ?? null]);
  assert.deepEqual(at('A11Y-04', 'C.vue'), [['unverified', 'unsupported extension .vue']]);
  assert.deepEqual(at('STATE-04', 'C.vue'), [['fail', null]]);
  assert.deepEqual(at('A11Y-04', 'p.astro'), [['unverified', 'unsupported extension .astro']]);
  assert.deepEqual(at('STATE-04', 'p.astro'), [['unverified', 'unsupported extension .astro']]);
});

test('a rule that throws becomes unverified and the others still run', async () => {
  const boom = { id: 'MOTION-04', checkFile() { throw new Error('boom'); } };
  const r = await run({ 'a.css': '.a { outline: none }\n' }, { inject: { rules: [boom, outlineRule] } });
  assert.deepEqual(of(r.entries, 'MOTION-04').map((e) => [e.status, e.reason]), [['unverified', 'rule error: boom']]);
  assert.equal(of(r.entries, 'STATE-04')[0].status, 'fail');
});

test('exit code: a new floor fail gives 1, only unverified gives 0', async () => {
  const r1 = await run({ 'a.css': '.a { outline: none }\n' }, { inject: { rules: [outlineRule] } });
  assert.equal(r1.exitCode, 1);
  assert.equal(of(r1.entries, 'STATE-04')[0].severity, 'bloquea');
  assert.equal(of(r1.entries, 'STATE-04')[0].scope, 'new');
  const r0 = await run({ 'a.css': '.a {}\n' }, { inject: { rules: [always('STATE-04', () => unverified('dynamic class'))] } });
  assert.equal(r0.exitCode, 0);
});

test('floor on debt: bloquea becomes alto, a CONTENT-01 medio heuristic stays medio', async () => {
  const rules = [outlineRule, always('CONTENT-01', () => fail('lorem', { severity: 'medio' }))];
  const classifyScope = (current) => current.map((e) => ({ ...e, scope: 'debt' }));
  const r = await run({ 'a.css': '.a { outline: none }\n', 'b.html': '<p>lorem ipsum</p>\n' }, { inject: { rules, classifyScope } });
  assert.deepEqual(of(r.entries, 'STATE-04').filter((e) => e.status === 'fail').map((e) => [e.file, e.severity, e.scope]), [['a.css', 'alto', 'debt']]);
  assert.deepEqual(of(r.entries, 'CONTENT-01').map((e) => [e.status, e.severity]), [['fail', 'medio']]);
  assert.equal(r.exitCode, 0);
});

test('ids outside the catalog need their own severity', async () => {
  const add = (extra) => (entries) => [...entries, { id: 'R-001', status: 'fail', floor: true, key: 'k', ...extra }];
  const r = await run({ 'a.css': '.a {}\n' }, { inject: { rules: [], applyRejections: add({ severity: 'bloquea' }) } });
  assert.deepEqual(of(r.entries, 'R-001').map((e) => [e.status, e.severity]), [['fail', 'bloquea']]);
  assert.equal(r.exitCode, 1);
  const r2 = await run({ 'a.css': '.a {}\n' }, { inject: { rules: [], applyRejections: add({}) } });
  assert.deepEqual(of(r2.entries, 'R-001').map((e) => [e.status, e.reason]), [['unverified', 'finding without catalog rule or severity']]);
  assert.equal(r2.exitCode, 0);
});

test('intentional never lowers a floored finding (rejection on MOTION-04 plus intentional MOTION-04)', async () => {
  const floorMotion = (entries) => entries.map((e) => (e.id === 'MOTION-04' && e.status === 'fail' ? { ...e, floor: true, reason: 'rejected R-001' } : e));
  const r = await run({ 'a.css': '.a { transition: all 1s }\n', 'DESIGN.md': DESIGN_FLOOR_VS_INTENTIONAL },
    { design: 'DESIGN.md', inject: { rules: [always('MOTION-04')], applyRejections: floorMotion } });
  assert.deepEqual(of(r.entries, 'MOTION-04').map((e) => [e.status, e.severity]), [['fail', 'bloquea']]);
  assert.equal(r.exitCode, 1);
  assert.equal(of(r.entries, 'DESIGN-INVALID').length, 0);
});

test('applyRejections sees the rule findings and one ctx per file; severity is computed after it', async () => {
  let seen = null;
  const applyRejections = (entries, design, fileCtxs) => {
    seen = { entries, design, fileCtxs };
    return entries.map((e) => (e.id === 'MOTION-04' ? { ...e, floor: true } : e));
  };
  const r = await run({ 'a.css': '.a { color: red }\n', 'b.html': '<style>.b { color: blue }</style><p>x</p>\n' },
    { inject: { rules: [always('MOTION-04')], applyRejections } });
  assert.deepEqual(seen.entries.filter((e) => e.id === 'MOTION-04').map((e) => [e.status, e.file]).sort(), [['fail', 'a.css'], ['fail', 'b.html']]);
  assert.equal(seen.design, null);
  const byFile = Object.fromEntries(seen.fileCtxs.map((c) => [c.file, c]));
  assert.deepEqual(Object.keys(byFile).sort(), ['a.css', 'b.html']);
  assert.equal(byFile['a.css'].markup, null);
  assert.equal(byFile['a.css'].css.decls[0].property, 'color');
  assert.ok(byFile['b.html'].markup.elements.some((el) => el.tag === 'p'));
  assert.equal(byFile['b.html'].css.decls[0].value, 'blue');
  assert.deepEqual(of(r.entries, 'MOTION-04').map((e) => e.severity), ['bloquea', 'bloquea']);
});

test('scopeRun gets an evaluate that runs the injected rules with project-relative files', async () => {
  let got = null;
  const baseDir = writeTree(makeTempDir(), { 'src/a.css': '.a { outline: none }\n.b { outline: none }\n' });
  const scopeRun = (args) => {
    got = { args, base: args.evaluate(baseDir, args.relFiles) };
    return got.base;
  };
  let classified = null;
  const classifyScope = (current, base) => { classified = base; return current.map((e) => ({ ...e, scope: 'new' })); };
  await run({ 'src/a.css': '.a { outline: none }\n' }, { base: 'HEAD', inject: { rules: [outlineRule], scopeRun, classifyScope } });
  assert.equal(got.args.base, 'HEAD');
  assert.deepEqual(got.args.relFiles, ['src/a.css']);
  assert.ok(got.args.sourceFiles.includes('src/a.css'));
  assert.deepEqual(got.base.filter((e) => e.id === 'STATE-04').map((e) => [e.status, e.file, e.line]), [['fail', 'src/a.css', 1], ['fail', 'src/a.css', 2]]);
  assert.ok(got.base.every((e) => typeof e.fingerprint === 'string' && !e.fingerprint.includes(baseDir)));
  assert.equal(classified, got.base);
});

test('files: [] runs only project rules', async () => {
  const rules = [always('A11Y-04'), { id: 'COLOR-03', checkProject: (p) => (p.design ? [fail('on-surface/surface/light')] : []) }];
  const r = await run({ 'DESIGN.md': designIntentional([]), 'a.css': '.a { outline: none }\n' }, { files: [], design: 'DESIGN.md', inject: { rules } });
  assert.deepEqual(r.entries.map((e) => [e.id, e.status, e.file ?? null]), [['COLOR-03', 'fail', null]]);
  const empty = await run({}, { files: [], inject: { rules } });
  assert.ok(empty.entries.every((e) => e.file === undefined));
  assert.equal(empty.exitCode, 0);
});

test('intentional turns a fail into pass even when DESIGN.md misses content; a rejected DESIGN.md ignores the list', async () => {
  const rules = [always('MOTION-04'), always('A11Y-04')];
  const ok = await run({ 'b.html': '<p>x</p>\n', 'DESIGN.md': designIntentional([['MOTION-04', 'microinteracción decidida']]) },
    { design: 'DESIGN.md', inject: { rules } });
  assert.deepEqual(of(ok.entries, 'MOTION-04').map((e) => [e.status, e.reason]), [['pass', 'intentional: microinteracción decidida']]);
  const bad = await run({ 'b.html': '<p>x</p>\n', 'DESIGN.md': designIntentional([['MOTION-04', 'x'], ['A11Y-04', 'y']]) },
    { design: 'DESIGN.md', inject: { rules } });
  assert.deepEqual(of(bad.entries, 'MOTION-04').map((e) => e.status), ['fail']);
  assert.deepEqual(of(bad.entries, 'DESIGN-INVALID').map((e) => [e.status, e.file]), [['unverified', 'DESIGN.md']]);
});

test('equal unverified findings of one file are aggregated with a count', async () => {
  const many = { id: 'A11Y-04', checkFile: () => Array.from({ length: 40 }, (_, i) => unverified('component', { key: `c${i}`, line: i + 1 })) };
  const r = await run({ 'a.tsx': 'export const A = () => <Button />;\n' }, { inject: { rules: [many] } });
  const e = of(r.entries, 'A11Y-04');
  assert.equal(e.length, 1);
  assert.equal(e[0].line, 1);
  assert.deepEqual(e[0].measure, { count: 40 });
});

test('mockup: design/approved and .pignolo-ui/runs files, not src', async () => {
  const mock = {};
  const spy = { id: 'CONTENT-01', checkFile: (ctx) => { mock[ctx.file] = ctx.mockup; return [pass('x')]; } };
  await run({ 'design/approved/home/index.html': '<p>x</p>\n', '.pignolo-ui/runs/r1/option-a/home.html': '<p>x</p>\n', 'src/home.html': '<p>x</p>\n' },
    { inject: { rules: [spy] } });
  assert.deepEqual(mock, { 'design/approved/home/index.html': true, '.pignolo-ui/runs/r1/option-a/home.html': true, 'src/home.html': false });
});
