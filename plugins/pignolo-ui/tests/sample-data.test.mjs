// Labelled sample data (spec §7.1, 0.7.3): what a script decides about the rule "data the user gave is literal; the rest
// is realistic sample data marked data-sample, with one visible line "Datos de muestra" per screen", and how the other
// pieces (options-check, approve, the canvas converter, the leak check, CONTENT-01) treat it. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkSampleData } from '../lib/sample-data.mjs';
import { checkOption, gitState } from '../lib/option-check.mjs';
import { saveApproved } from '../lib/approved.mjs';
import { toArtboard } from '../lib/canvas.mjs';
import { checkLeaks } from '../lib/leak-check.mjs';
import { makeRun, screenHtml } from './support/canvas-run.mjs';
import { FIXTURES, makeTempDir, writeTree, runScript, BRIEF_TEXT } from './helpers.mjs';

const doc = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;
const GOOD = doc('<main><h1>Mi cuenta</h1><p data-sample>$ 12.480,00</p><ul><li data-sample>Alquiler</li></ul></main><p>Datos de muestra</p>');
const codes = (html, opts) => checkSampleData(html, opts);

test('a screen with marked sample values and its line has no problem and no warning', () => {
  assert.deepEqual(codes(GOOD), { problems: [], warnings: [] });
  assert.deepEqual(codes(GOOD, { provided: [] }), { problems: [], warnings: [] });
});

test('no-sample-strip: data-sample without the visible line; a hidden, commented or attribute-only line does not count', () => {
  const body = '<main><h1>Mi cuenta</h1><p data-sample>$ 12.480,00</p></main>';
  assert.deepEqual(codes(doc(body)).problems, ['no-sample-strip']);
  for (const line of ['<!-- Datos de muestra -->', '<p hidden>Datos de muestra</p>', '<p aria-hidden="true">Datos de muestra</p>', '<p style="display:none">Datos de muestra</p>', '<p title="Datos de muestra">x</p>']) {
    assert.deepEqual(codes(doc(body + line)).problems, ['no-sample-strip'], line);
  }
  assert.deepEqual(codes(doc(body + '<footer>Datos  de\nmuestra</footer>')).problems, []);
  // a screen without sample values (everything came from the user) needs no line
  assert.deepEqual(codes(doc('<main><h1>Mi cuenta</h1></main>')).problems, []);
});

test('empty-sample: a data-sample element with no text says nothing', () => {
  assert.deepEqual(codes(doc('<main><p data-sample></p></main><p>Datos de muestra</p>')).problems, ['empty-sample']);
  assert.deepEqual(codes(doc('<main><input data-sample value="Ana" aria-label="x"></main><p>Datos de muestra</p>')).problems, []);
});

test('bare-placeholder: a lone ‹…› is no longer a sample value', () => {
  assert.deepEqual(codes(doc('<main><p>\u2039saldo\u203a</p></main>')).problems, ['bare-placeholder']);
});

test('real-looking-contact: an email outside the reserved domains and a phone number fail; reserved domains and amounts do not', () => {
  const page = (p) => doc(`<main><p data-sample>${p}</p></main><p>Datos de muestra</p>`);
  assert.deepEqual(codes(page('ana@empresa.com')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('+54 11 5555 1234')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('(011) 5555-1234')).problems, ['real-looking-contact']);
  assert.deepEqual(codes(page('ana@example.com')).problems, []);
  assert.deepEqual(codes(page('ana@correo.test')).problems, []);
  assert.deepEqual(codes(page('$ 1.234.567,89 el 2026-10-01')).problems, []);
});

test('unmarked-sample: with the literal values of the brief, an amount or a date outside data-sample must be one of them', () => {
  const page = doc('<main><p data-sample>$ 12.480,00</p><p>Vence el 05/11/2026</p><p>Saldo: $ 3.200,00</p></main><p>Datos de muestra</p>');
  assert.deepEqual(codes(page, { provided: ['$ 3.200,00'] }).problems, ['unmarked-sample']);
  assert.deepEqual(codes(page, { provided: ['$ 3.200,00', 'Vence el 05/11/2026'] }).problems, []);
  assert.deepEqual(codes(page, { provided: [] }).problems, ['unmarked-sample']);
  // the marked value and the line itself are never reported
  assert.deepEqual(codes(doc('<main><p data-sample>$ 12.480,00</p></main><p>Datos de muestra 2026-10-01</p>'), { provided: [] }).problems, []);
});

test('without the brief values the unmarked amount or date is only a warning: the script cannot tell the sample from what the user gave', () => {
  const page = doc('<main><p>Saldo: $ 3.200,00</p></main>');
  assert.deepEqual(codes(page), { problems: [], warnings: ['maybe-unmarked-sample'] });
});

// ---- options-check ---------------------------------------------------------------------------------------

function setup(files, folder = 'option-A') {
  const r = makeRun({ options: ['A'], git: true });
  const dir = path.join(r.run, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, html] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), html);
  return { ...r, dir };
}
const EXPECTED = ['inicio.html', 'detalle.html'];
const check = (s, over = {}) => checkOption({ dir: s.dir, expected: EXPECTED, project: s.project, gitBefore: gitState(s.project), ...over });
const names = (r) => r.problems.map((p) => p.problem);
const detalle = screenHtml('b', { link: 'inicio.html' });

test('options-check: a mockup with sample values and the line passes; each broken rule fails with its own problem', () => {
  assert.equal(check(setup({})).ok, true);
  const bad = {
    'no-sample-strip': screenHtml('a', { link: 'detalle.html' }).replace('<p>Datos de muestra</p>', ''),
    'bare-placeholder': screenHtml('a', { link: 'detalle.html', extra: '<p>\u2039saldo\u203a</p>' }),
    'empty-sample': screenHtml('a', { link: 'detalle.html', extra: '<p data-sample></p>' }),
    'real-looking-contact': screenHtml('a', { link: 'detalle.html', extra: '<p data-sample>ana@empresa.com</p>' }),
  };
  for (const [code, html] of Object.entries(bad)) {
    const r = check(setup({ 'inicio.html': html, 'detalle.html': detalle }));
    assert.equal(r.ok, false, code);
    assert.ok(names(r).includes(code), `${code}: ${names(r)}`);
  }
});

test('options-check: unmarked-sample only with provided; without it a warning; style tiles are not held to it', () => {
  const html = screenHtml('a', { link: 'detalle.html', extra: '<p>Saldo: $ 3.200,00</p>' });
  const s = setup({ 'inicio.html': html, 'detalle.html': detalle });
  const loose = check(s);
  assert.equal(loose.ok, true, JSON.stringify(loose.problems));
  assert.ok(loose.warnings.some((w) => w.warning === 'maybe-unmarked-sample'));
  assert.ok(names(check(s, { provided: [] })).includes('unmarked-sample'));
  assert.equal(check(s, { provided: ['$ 3.200,00'] }).ok, true);
  const tile = setup({ 'inicio.html': html.replace('<p>Datos de muestra</p>', '') }, 'direction-A');
  const r = check(tile, { expected: ['inicio.html'], kind: 'direction' });
  assert.deepEqual(names(r).filter((p) => ['no-sample-strip', 'unmarked-sample'].includes(p)), []);
});

test('run.mjs options-check --provided-file: the literal values of the brief change an unmarked amount into exit 1; a bad file is exit 2', () => {
  const html = screenHtml('a', { link: 'detalle.html', extra: '<p>Saldo: $ 3.200,00</p>' });
  const s = setup({ 'inicio.html': html, 'detalle.html': detalle });
  const before = path.join(s.run, 'git-before.txt');
  fs.writeFileSync(before, gitState(s.project));
  const args = ['options-check', '--project', s.project, '--run', s.run, '--option', 'A', '--expected', EXPECTED.join(','), '--git-before', before];
  const loose = runScript('run.mjs', args);
  assert.equal(loose.status, 0, loose.stdout + loose.stderr);
  assert.ok(loose.json.warnings.some((w) => w.warning === 'maybe-unmarked-sample'));
  const provided = path.join(s.run, 'provided.json');
  fs.writeFileSync(provided, '[]');
  const strict = runScript('run.mjs', [...args, '--provided-file', provided]);
  assert.equal(strict.status, 1);
  assert.ok(strict.json.problems.some((p) => p.problem === 'unmarked-sample'));
  fs.writeFileSync(provided, JSON.stringify(['$ 3.200,00']));
  assert.equal(runScript('run.mjs', [...args, '--provided-file', provided]).status, 0);
  fs.writeFileSync(provided, '{"no":"una lista"}');
  assert.equal(runScript('run.mjs', [...args, '--provided-file', provided]).status, 2);
});

// ---- approve keeps the marks ----------------------------------------------------------------------------------

const project = () => writeTree(makeTempDir(), { 'DESIGN.md': fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8') });

test('approve: the saved screens keep every data-sample and the line, byte for byte; a screen that lost the line is not saved', () => {
  const from = writeTree(makeTempDir(), { 'home.html': GOOD.replace('</body>', '<a href="detail.html">Ver</a></body>'), 'detail.html': GOOD.replace('</body>', '<a href="home.html">Volver</a></body>') });
  const root = project();
  const r = saveApproved({ projectRoot: root, flow: 'cuenta', from, date: '2026-10-01', brief: BRIEF_TEXT });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  for (const f of ['home.html', 'detail.html']) {
    const saved = fs.readFileSync(path.join(root, r.path, f), 'utf8');
    assert.equal(saved, fs.readFileSync(path.join(from, f), 'utf8'));
    assert.ok(saved.includes('data-sample') && saved.includes('Datos de muestra'));
  }
  const lost = writeTree(makeTempDir(), { 'home.html': GOOD.replace('<p>Datos de muestra</p>', '') });
  const root2 = project();
  const refused = saveApproved({ projectRoot: root2, flow: 'cuenta', from: lost, date: '2026-10-01', brief: BRIEF_TEXT });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.problems, [{ file: 'home.html', problem: 'no-sample-strip' }]);
  assert.ok(!fs.existsSync(path.join(root2, 'design', 'approved', 'cuenta')), 'nothing is written');
});

// ---- the converter to artboards keeps them ------------------------------------------------------------------

test('canvas converter: the artboard keeps the data-sample attributes and the visible line', () => {
  const out = toArtboard({ html: screenHtml('a', { link: 'detalle.html' }), w: 390, h: 800, links: { 'detalle.html': 'Detalle (390)' } });
  assert.equal((out.match(/data-sample/g) ?? []).length, 1);
  assert.match(out, /<p data-sample(?:="")?>\$ 12\.480,00<\/p>/);
  assert.match(out, /<p>Datos de muestra<\/p>/);
});

// ---- the leak check -----------------------------------------------------------------------------------------

test('leak check: sample amounts, dates and neutral names do not trip it; the values of the user still do, marked or not', () => {
  const values = ['ana.perez@example.com', 'Ana Pérez', 'aperez'];
  const clean = writeTree(makeTempDir(), { 'a.html': GOOD.replace('Alquiler', 'Lucía Ramos, 12/10/2026') });
  assert.deepEqual(checkLeaks(clean, values).leaks, []);
  const leaky = writeTree(makeTempDir(), { 'a.html': doc('<p data-sample>Ana Pérez</p><p>Datos de muestra</p>') });
  assert.deepEqual(checkLeaks(leaky, values).leaks, [{ file: 'a.html', kind: 'value', index: 1, line: 1 }]);
  const path_ = writeTree(makeTempDir(), { 'a.html': doc('<p data-sample>C:\\Users\\x\\a</p><p>Datos de muestra</p>') });
  assert.equal(checkLeaks(path_, values).leaks[0].kind, 'path');
});

// ---- the texts that carry the rule ------------------------------------------------------------------------

const root = path.join(FIXTURES, '..', '..');
const text = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

test('no card, skill, reference or norm asks for the bare placeholder any more; the ones that state the rule name data-sample and the line', () => {
  for (const f of [['agents', 'ui-option.md'], ['agents', 'ui-auditor.md'], ['skills', 'new', 'SKILL.md'], ['skills', 'improve', 'SKILL.md'], ['norms', 'base.md']]) {
    assert.ok(!text(...f).includes('‹'), `${f.join('/')} still shows the bare marker`);
  }
  for (const f of [['agents', 'ui-option.md'], ['skills', 'new', 'SKILL.md'], ['reference', 'options.md'], ['norms', 'base.md']]) {
    const t = text(...f);
    assert.ok(t.includes('data-sample') && t.includes('Datos de muestra'), f.join('/'));
  }
  assert.ok(text('reference', 'options.md').includes('--provided-file'));
  assert.ok(!text('agents', 'ui-option.md').includes('Datos de ejemplo'));
});

test('the auditor card: a marked sample value is not invented content; an unmarked one is a CONTENT-01 finding', () => {
  const t = text('agents', 'ui-auditor.md');
  assert.match(t, /Sample data is not invented content/);
  assert.match(t, /no `data-sample` is a finding: id `CONTENT-01`/);
});

test('CREDITS.md names the three sources of the ui-option card with repo, license and date, and the card copies no sentence of them', () => {
  const t = text('CREDITS.md');
  for (const needle of ['github.com/pbakaus/impeccable', 'Apache-2.0', 'github.com/emilkowalski/skills', 'MIT', 'developer.apple.com/design/human-interface-guidelines', '2026-10-01']) assert.ok(t.includes(needle), needle);
});
