// pignolo-ui 0.7.5, fix pass over the 0.7.3 final review (I1-I6): flow blockers and detection precision of lib/sample-data.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkSampleData } from '../lib/sample-data.mjs';
import { checkOption, gitState } from '../lib/option-check.mjs';
import { saveApproved } from '../lib/approved.mjs';
import { makeRun } from './support/canvas-run.mjs';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';

const doc = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>t</title></head><body>${body}</body></html>`;
const STRIP = '<p>Datos de muestra</p>';
const page = (inner) => doc(`<main>${inner}</main>${STRIP}`);
const problems = (html, opts) => checkSampleData(html, opts).problems;
const root = path.join(FIXTURES, '..', '..');
const text = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

// ---- I1 -------------------------------------------------------------------------------------------------------

test('I1: a --provided-file that does not exist is reported as missing (exit 2), not as invalid JSON; options.md passes it only when the file exists', () => {
  const r = makeRun({ options: ['A'], git: true });
  const dir = path.join(r.run, 'option-A');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'inicio.html'), doc('<main><h1>Hola</h1></main>'));
  const before = path.join(r.run, 'git-before.txt');
  fs.writeFileSync(before, gitState(r.project));
  const res = runScript('run.mjs', ['options-check', '--project', r.project, '--run', r.run, '--option', 'A', '--expected', 'inicio.html', '--git-before', before, '--provided-file', path.join(r.run, 'provided.json')]);
  assert.equal(res.status, 2);
  assert.match(res.stderr + res.stdout, /does not exist/);
  assert.doesNotMatch(res.stderr + res.stdout, /not valid JSON/);
  const opt = text('reference', 'options.md');
  assert.match(opt, /--provided-file <run>\/provided\.json`?[^\n]*only (?:when|if)[^\n]*(?:exists|written)/i);
});

// ---- I2 -------------------------------------------------------------------------------------------------------

test('I2: a style tile that options-check accepts is also saved by approve --flow direction', () => {
  const tile = doc('<main><h1>Tile</h1><p data-sample>$ 12.480,00</p></main>');
  const r = makeRun({ options: ['A'], git: true });
  const dir = path.join(r.run, 'direction-A');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tile.html'), tile);
  const c = checkOption({ dir, expected: ['tile.html'], project: r.project, gitBefore: gitState(r.project), kind: 'direction' });
  assert.equal(c.ok, true, JSON.stringify(c.problems));
  const proj = writeTree(makeTempDir(), { 'DESIGN.md': fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8') });
  const s = saveApproved({ projectRoot: proj, flow: 'direction', from: dir, date: '2026-10-01' });
  assert.equal(s.ok, true, JSON.stringify(s.problems));
  // a mockup flow still needs the line
  const from = writeTree(makeTempDir(), { 'home.html': tile });
  const m = saveApproved({ projectRoot: writeTree(makeTempDir(), { 'DESIGN.md': fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8') }), flow: 'cuenta', from, date: '2026-10-01', brief: '## First look\nx\n\n## Do not touch\nnothing\n' });
  assert.deepEqual(m.problems.map((p) => p.problem).filter((p) => p === 'no-sample-strip'), ['no-sample-strip']);
});
