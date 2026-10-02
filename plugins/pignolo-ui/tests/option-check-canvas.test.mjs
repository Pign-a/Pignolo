// Form rules (R-5) and font rules (R-19) of checkOption, and run.mjs options-check --destination.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gitState, checkOption } from '../lib/option-check.mjs';
import { makeRun, screenHtml } from './support/canvas-run.mjs';
import { runScript } from './helpers.mjs';

const FONT_HEAD = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">\n';
const EXPECTED = ['inicio.html', 'detalle.html'];

function setup(files = {}, folder = 'option-A') {
  const r = makeRun({ options: ['A'], git: true });
  const dir = path.join(r.run, folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, html] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), html);
  return { ...r, dir };
}
const problemsOf = (r) => r.problems.map((p) => p.problem);
const check = (s, over = {}) => checkOption({ dir: s.dir, expected: EXPECTED, project: s.project, gitBefore: gitState(s.project), ...over });

test('mockup forms: an unclosed <p>, {{x}}, a button inside a link and a reserved tag are problems', () => {
  const cases = [
    ['malformed', screenHtml('a', { extra: '<p>sin cerrar\n' })],
    ['braces', screenHtml('a', { extra: '<p>{{x}}</p>\n' })],
    ['control-in-link', screenHtml('a', { extra: '<a href="detalle.html"><button>Ir</button></a>\n' })],
    ['reserved-tag', screenHtml('a', { extra: '<sc-if></sc-if>\n' })],
  ];
  for (const [code, html] of cases) {
    const s = setup({ 'inicio.html': html, 'detalle.html': screenHtml('b', { link: 'inicio.html' }) });
    const r = check(s);
    assert.equal(r.ok, false, code);
    assert.ok(problemsOf(r).includes(code), `${code}: ${problemsOf(r)}`);
  }
});

test('style tiles (--kind direction) are not held to the form rules (scope guard)', () => {
  const bad = screenHtml('t', { extra: '<p>sin cerrar\n<p>{{x}}</p>\n' });
  const s = setup({ 'inicio.html': bad }, 'direction-A');
  const r = check(s, { expected: ['inicio.html'], kind: 'direction' });
  assert.deepEqual(problemsOf(r).filter((p) => ['malformed', 'braces', 'control-in-link', 'reserved-tag'].includes(p)), []);
});

test('fonts: the three allowed links are fine with destination canvas, remote-font-local with local and in a style tile', () => {
  const files = { 'inicio.html': screenHtml('a', { link: 'detalle.html', head: FONT_HEAD }), 'detalle.html': screenHtml('b', { link: 'inicio.html' }) };
  const s = setup(files);
  assert.deepEqual(problemsOf(check(s, { destination: 'canvas' })), []);
  assert.ok(problemsOf(check(s, { destination: 'local' })).includes('remote-font-local'));
  assert.ok(problemsOf(check(s)).includes('remote-font-local'), 'local is the default');
  const tile = setup({ 'inicio.html': screenHtml('a', { head: FONT_HEAD }) }, 'direction-A');
  assert.ok(problemsOf(check(tile, { expected: ['inicio.html'], kind: 'direction', destination: 'canvas' })).includes('remote-font-local'));
});

test('fonts: another host is bad-font-link in both destinations; any other remote stylesheet is remote-resource', () => {
  const host = FONT_HEAD.replace('https://fonts.googleapis.com/css2', 'https://fonts.example.com/css2');
  const s = setup({ 'inicio.html': screenHtml('a', { link: 'detalle.html', head: host }), 'detalle.html': screenHtml('b', { link: 'inicio.html' }) });
  for (const destination of ['canvas', 'local']) assert.ok(problemsOf(check(s, { destination })).includes('bad-font-link'), destination);
  const cdn = setup({ 'inicio.html': screenHtml('a', { link: 'detalle.html', head: '<link rel="stylesheet" href="https://cdn.x.test/a.css">\n' }), 'detalle.html': screenHtml('b', { link: 'inicio.html' }) });
  assert.ok(problemsOf(check(cdn, { destination: 'canvas' })).includes('remote-resource'));
});

test('warnings come out in warnings and do not reject', () => {
  const s = setup({ 'inicio.html': screenHtml('a', { link: 'detalle.html', extra: '<div style="position:fixed">x</div>\n' }), 'detalle.html': screenHtml('b', { link: 'inicio.html' }) });
  const r = check(s);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(r.warnings.some((w) => w.warning === 'fixed-position'));
});

test('run.mjs options-check --destination: canvas accepts the fonts, local (the default) rejects them, anything else is exit 2', () => {
  const s = setup({ 'inicio.html': screenHtml('a', { link: 'detalle.html', head: FONT_HEAD }), 'detalle.html': screenHtml('b', { link: 'inicio.html' }) });
  const before = path.join(s.run, 'git-before.txt');
  fs.writeFileSync(before, gitState(s.project));
  const args = ['options-check', '--project', s.project, '--run', s.run, '--option', 'A', '--expected', EXPECTED.join(','), '--git-before', before];
  const canvas = runScript('run.mjs', [...args, '--destination', 'canvas']);
  assert.equal(canvas.status, 0, canvas.stdout + canvas.stderr);
  const local = runScript('run.mjs', args);
  assert.equal(local.status, 1);
  assert.ok(local.json.problems.some((p) => p.problem === 'remote-font-local'));
  assert.equal(runScript('run.mjs', [...args, '--destination', 'nube']).status, 2);
});
