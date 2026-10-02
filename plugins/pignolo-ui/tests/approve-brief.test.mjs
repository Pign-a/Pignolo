import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIXTURES, makeTempDir, writeTree, runScript, writeBrief, BRIEF_TEXT } from './helpers.mjs';
import { saveApproved, verifyApproved, decisionEntry } from '../lib/approved.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const page = (title) => `<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body><main><h1 data-sample>${title}</h1><p>Datos de muestra</p></main></body>\n</html>\n`;

const screens = () => writeTree(makeTempDir(), { 'home.html': page('Inicio') });
const project = () => writeTree(makeTempDir(), { 'DESIGN.md': DESIGN });
const emptyValues = () => writeTree(makeTempDir(), { 'values.json': '[]' }) + '/values.json';

function save(root, { flow = 'home', extra = [], values = emptyValues() } = {}) {
  return runScript('approve.mjs', ['save', '--project', root, '--flow', flow, '--from', screens(), '--values-file', values, '--date', '2026-10-01', ...extra]);
}

// An approval registered in DESIGN.md, so that verify can run.
function registered(flow, brief) {
  const root = project();
  const saved = saveApproved({ projectRoot: root, flow, from: screens(), date: '2026-10-01', brief });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  fs.writeFileSync(path.join(root, 'DESIGN.md'), `${DESIGN}\n${decisionEntry({ ...saved, date: '2026-10-01', quote: 'ok' })}\n`);
  return { root, saved, dir: path.join(root, saved.path) };
}

test('save without --brief-file is a usage error for a screen flow and creates nothing', () => {
  const root = project();
  const r = save(root);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /falta --brief-file/);
  assert.equal(fs.existsSync(path.join(root, 'design')), false);
});

test('save with a brief seals brief.md byte by byte and verify passes', () => {
  const root = project();
  const file = writeBrief();
  const r = save(root, { extra: ['--brief-file', file] });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = path.join(root, r.json.path);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'brief.md')), fs.readFileSync(file));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.brief, { path: 'brief.md', sha256: sha(fs.readFileSync(file)) });
  assert.ok(!manifest.files.some((f) => f.path === 'brief.md'), 'the brief is not listed as a screen');
  const quote = path.join(makeTempDir(), 'q.txt');
  fs.writeFileSync(quote, 'ok');
  assert.equal(runScript('approve.mjs', ['record', '--project', root, '--path', r.json.path, '--quote-file', quote, '--write']).status, 0);
  assert.equal(runScript('approve.mjs', ['verify', '--project', root, '--path', r.json.path]).status, 0);
});

test('the direction flow saves without a brief and verifies', () => {
  const root = project();
  const r = save(root, { flow: 'direction' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.existsSync(path.join(root, r.json.path, 'brief.md')), false);
  const { root: r2, saved } = registered('direction', null);
  assert.equal(verifyApproved({ projectRoot: r2, approvedPath: saved.path }).status, 'ok');
});

test('integrity: a changed or deleted brief blocks verify; an extra file still does; an approval from before the brief still verifies', () => {
  const changed = registered('home', BRIEF_TEXT);
  assert.equal(verifyApproved({ projectRoot: changed.root, approvedPath: changed.saved.path }).status, 'ok');
  fs.appendFileSync(path.join(changed.dir, 'brief.md'), '\nextra line\n');
  const a = verifyApproved({ projectRoot: changed.root, approvedPath: changed.saved.path });
  assert.equal(a.status, 'BLOCKED');
  assert.ok(a.problems.some((p) => p.problem === 'brief-changed'), JSON.stringify(a.problems));

  const gone = registered('home', BRIEF_TEXT);
  fs.rmSync(path.join(gone.dir, 'brief.md'));
  assert.ok(verifyApproved({ projectRoot: gone.root, approvedPath: gone.saved.path }).problems.some((p) => p.problem === 'brief-missing'));

  // guard: any other file in the folder is still an extra-file, brief or not
  const extra = registered('home', BRIEF_TEXT);
  fs.writeFileSync(path.join(extra.dir, 'extra.txt'), 'x');
  assert.ok(verifyApproved({ projectRoot: extra.root, approvedPath: extra.saved.path }).problems.some((p) => p.problem === 'extra-file'));

  // guard: a folder written before this hito has no `brief` key (the direction flow writes the same shape)
  const old = registered('direction', null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(old.dir, 'manifest.json'), 'utf8')).brief, undefined);
  assert.deepEqual(verifyApproved({ projectRoot: old.root, approvedPath: old.saved.path }), { status: 'ok', problems: [] });

  // a brief.md that the manifest does not declare is an extra file (nobody can slip one into an old approval)
  fs.writeFileSync(path.join(old.dir, 'brief.md'), BRIEF_TEXT);
  assert.ok(verifyApproved({ projectRoot: old.root, approvedPath: old.saved.path }).problems.some((p) => p.problem === 'extra-file'));
});

test('an invalid or leaking brief refuses the save and leaves no half approval', () => {
  const root = project();
  const bad = writeBrief(makeTempDir(), 'brief.md', '## Screen\nOnly a screen.\n');
  const r = save(root, { extra: ['--brief-file', bad] });
  assert.equal(r.status, 1);
  assert.ok(r.json.problems.some((p) => p.file === 'brief.md' && p.problem === 'missing-first-look'), JSON.stringify(r.json));
  assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'home')), false);

  const leaky = writeBrief(makeTempDir(), 'brief.md', BRIEF_TEXT.replace('nothing', 'Tomas Rivera keeps the logo'));
  const values = writeTree(makeTempDir(), { 'values.json': JSON.stringify(['Tomas Rivera']) }) + '/values.json';
  const l = save(root, { extra: ['--brief-file', leaky], values });
  assert.equal(l.status, 1);
  assert.ok(l.json.problems.some((p) => p.file === 'brief.md' && p.problem === 'leak'));
  assert.ok(!l.stdout.includes('Tomas Rivera'));
  assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'home')), false);
});

test('run.mjs register: the brief wins, then DESIGN.md, then unset', () => {
  const withDesign = project(); // valid.md declares register: product
  const brand = writeBrief(makeTempDir(), 'brief.md', `${BRIEF_TEXT}Register: brand\n`);
  assert.deepEqual(runScript('run.mjs', ['register', '--project', withDesign, '--brief', brand]).json, { register: 'brand', source: 'brief' });
  assert.deepEqual(runScript('run.mjs', ['register', '--project', withDesign]).json, { register: 'product', source: 'design' });
  // a brief without a Register line leaves the DESIGN.md value
  assert.deepEqual(runScript('run.mjs', ['register', '--project', withDesign, '--brief', writeBrief()]).json, { register: 'product', source: 'design' });
  assert.deepEqual(runScript('run.mjs', ['register', '--project', makeTempDir()]).json, { register: 'unset', source: 'none' });
  const invalid = writeBrief(makeTempDir(), 'brief.md', '## Screen\nx\n');
  assert.equal(runScript('run.mjs', ['register', '--project', withDesign, '--brief', invalid]).status, 1);
});
