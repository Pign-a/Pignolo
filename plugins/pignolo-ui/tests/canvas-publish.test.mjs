import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeIndex, callLimitProblems, LIMITS } from '../lib/canvas-publish.mjs';
import { collectLeakOrigins } from '../lib/leak-values.mjs';
import { buildCanvas } from '../lib/canvas-layout.mjs';
import { screenHtml } from './support/canvas-run.mjs';

const ours = () => buildCanvas({
  options: [{ id: 'A', kind: 'option', screens: [{ file: 'inicio.html', html: screenHtml('A', { link: 'detalle.html' }) }, { file: 'detalle.html', html: screenHtml('B') }] }],
  platform: 'desktop', pageId: 'r1', pageName: 'new · 2026-10-01', canvasTitle: 'Proyecto', first: true,
}).fragment;

test('mergeIndex from scratch: v3, createdOnFiles.at = now, one page, launch.view canvas, no mutation of ours', () => {
  const fragment = ours();
  const snapshot = JSON.stringify(fragment);
  const r = mergeIndex({ ours: fragment, live: null, title: 'Proyecto', now: '2026-10-01T18:00:00Z' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.index.v, r.index.createdOnFiles, r.index.title, r.index.launch.view], [3, { v: 1, at: '2026-10-01T18:00:00Z' }, 'Proyecto', 'canvas']);
  assert.deepEqual(r.index.pages, [{ id: 'r1', name: 'new · 2026-10-01' }]);
  assert.deepEqual(r.index.order, fragment.order);
  assert.deepEqual(Object.keys(r.index.boards), Object.keys(fragment.boards));
  assert.deepEqual(r.index.designSystems, []);
  assert.equal(JSON.stringify(fragment), snapshot);
  r.index.boards['Main.dc.html'].x = 99;
  assert.equal(JSON.stringify(fragment), snapshot, 'the index is a copy');
});

test('mergeIndex with a live index is unsupported-live in stage 1 and gives no index', () => {
  const r = mergeIndex({ ours: ours(), live: { v: 3 }, title: 'x', now: '2026-10-01T18:00:00Z' });
  assert.deepEqual([r.ok, r.index, r.problems.map((p) => p.code)], [false, null, ['unsupported-live']]);
});

test('limits of one call (A4C-15, A4C2-18): 255 entries, a 17 MB file, two 9 MB files', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(callLimitProblems({ entries: 254, sizes: [] }), []);
  assert.deepEqual(callLimitProblems({ entries: 255, sizes: [] }).map((p) => p.code), ['too-many-paths']);
  assert.deepEqual(callLimitProblems({ entries: 1, sizes: [{ path: 'a', size: 17 * MB }] }).map((p) => p.code), ['file-too-big', 'call-too-big']);
  assert.deepEqual(callLimitProblems({ entries: 2, sizes: [{ path: 'a', size: 9 * MB }, { path: 'b', size: 9 * MB }] }).map((p) => p.code), ['call-too-big']);
  assert.deepEqual(callLimitProblems({ entries: 2, sizes: [{ path: 'a', size: 8 * MB }, { path: 'b', size: 8 * MB }] }), []);
  assert.equal(LIMITS.call, 16 * MB);
});

const fakeOs = { userInfo: () => ({ username: 'usuario-ejemplo' }), homedir: () => '/home/usuario-ejemplo' };
const gitAnswers = (answers) => (args) => {
  const a = answers[args[1]];
  if (a instanceof Error) throw a;
  return a;
};

test('collectLeakOrigins: which origins gave a value and how git behaved (ok, unset, failed)', () => {
  const ok = collectLeakOrigins({ project: '/p', email: 'cuenta@ejemplo.test', exec: gitAnswers({ 'user.name': 'Persona Ejemplo\n', 'user.email': 'persona@ejemplo.test\n' }), os: fakeOs });
  assert.deepEqual(ok, { 'os-user': true, home: true, 'git-name': true, 'git-email': true, 'account-email': true, git: 'ok' });
  const unsetErr = Object.assign(new Error('exit 1'), { status: 1 });
  const unset = collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': unsetErr, 'user.email': unsetErr }), os: fakeOs });
  assert.equal(unset.git, 'unset');
  assert.deepEqual([unset['git-name'], unset['git-email'], unset['account-email']], [false, false, false]);
  const noGit = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
  const failed = collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': noGit, 'user.email': noGit }), os: fakeOs });
  assert.equal(failed.git, 'failed');
  const timeout = Object.assign(new Error('timed out'), { status: null, signal: 'SIGTERM' });
  assert.equal(collectLeakOrigins({ project: '/p', exec: gitAnswers({ 'user.name': timeout, 'user.email': 'a@b.test' }), os: fakeOs }).git, 'failed');
});
