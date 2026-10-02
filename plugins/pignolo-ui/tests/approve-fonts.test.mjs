import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIXTURES, makeTempDir, writeTree, runScript, BRIEF_TEXT, writeBrief } from './helpers.mjs';
import { saveApproved, verifyApproved, screenProblems, checkScreens } from '../lib/approved.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const FONTS = fs.readFileSync(path.join(FIXTURES, 'canvas', 'fuentes.html'), 'utf8');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function setup(files) {
  const from = writeTree(makeTempDir(), files);
  const project = writeTree(makeTempDir(), { 'DESIGN.md': DESIGN });
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, '[]');
  return { from, project, values };
}

test('approve save of an option with the three font links: exit 0, fontsRemoved 3, nothing remote stored, verify ok (A4C2-04)', () => {
  const { from, project, values } = setup({ 'fuentes.html': FONTS });
  const res = runScript('approve.mjs', ['save', '--project', project, '--flow', 'fuentes', '--from', from, '--values-file', values, '--brief-file', writeBrief(), '--date', '2026-10-01']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(res.json.fontsRemoved, 3);
  const dir = path.join(project, res.json.path);
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!text.includes('fonts.googleapis.com') && !text.includes('fonts.gstatic.com'), f);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files[0].sha256, sha(fs.readFileSync(path.join(dir, 'fuentes.html'))), 'the sha is the one of the copy');
  assert.equal(fs.readFileSync(path.join(from, 'fuentes.html'), 'utf8'), FONTS, 'the origin keeps its links');
  const entry = `\n## Decisions\n\n- 2026-10-01 — approved \`${res.json.path}/\` (manifest sha256 \`${res.json.manifestSha256}\`): "ok"\n`;
  fs.writeFileSync(path.join(project, 'DESIGN.md'), DESIGN + entry);
  assert.equal(verifyApproved({ projectRoot: project, approvedPath: res.json.path }).status, 'ok');
});

test('a font link of another host or any other remote stylesheet still refuses the save', () => {
  for (const link of ['<link rel="stylesheet" href="https://fonts.example.com/css2?family=A&display=swap">', '<link rel="stylesheet" href="https://cdn.x.test/a.css">']) {
    const { from, project, values } = setup({ 'a.html': FONTS.replace('</head>', `${link}\n</head>`) });
    const res = runScript('approve.mjs', ['save', '--project', project, '--flow', 'x', '--from', from, '--values-file', values, '--brief-file', writeBrief()]);
    assert.equal(res.status, 1, link);
    assert.ok(res.json.problems.some((p) => p.problem === 'remote-resource'), link);
  }
});

test('screenProblems and checkScreens: without allowFonts the allowed links are remote resources (guard)', () => {
  assert.ok(screenProblems(FONTS, { allowFonts: false }).some((p) => p.problem === 'remote-resource'));
  assert.deepEqual(screenProblems(FONTS, { allowFonts: true }), []);
  const { from } = setup({ 'fuentes.html': FONTS });
  assert.ok(checkScreens(from).problems.some((p) => p.problem === 'remote-resource'));
  assert.deepEqual(checkScreens(from, { allowFonts: true }).problems, []);
});

test('saving a screen without fonts keeps its bytes and reports fontsRemoved 0', () => {
  const { from, project } = setup({ 'a.html': FONTS.replace(/<link [^>]*>\n/g, '') });
  const r = saveApproved({ projectRoot: project, flow: 'plain', from, date: '2026-10-01', brief: BRIEF_TEXT });
  assert.equal(r.ok, true);
  assert.equal(r.fontsRemoved, 0);
  assert.equal(fs.readFileSync(path.join(project, r.path, 'a.html'), 'utf8'), fs.readFileSync(path.join(from, 'a.html'), 'utf8'));
});
