'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { mainRoot } = require('../plugins/pignolo/lib/disabled');
const project = require('../plugins/pignolo/lib/project');

const same = (a, b, msg) => assert.strictEqual(path.resolve(a), path.resolve(b), msg);

test('mainRoot', () => {
  const repo = makeRepo();
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'rama', wt], repo);
  const sub = path.join(repo, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const wtSub = path.join(wt, 'src');
  fs.mkdirSync(wtSub, { recursive: true });
  const bare = makeTempDir();
  const cases = [
    ['linked worktree', wt, repo],
    ['subdirectory of a linked worktree', wtSub, repo],
    ['main checkout', repo, repo],
    ['subdirectory of the main checkout', sub, repo],
    ['no repo', bare, bare],
  ];
  for (const [name, cwd, want] of cases) same(mainRoot(cwd), want, name);
  assert.strictEqual(project.mainRoot, mainRoot);
});

test('projectState reads project.md and the flag from the main checkout', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '# p\n');
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'rama', wt], repo);
  const env = { PIGNOLO_HOME: makeTempDir() };
  const s = project.projectState({ cwd: wt, env });
  same(s.main, repo);
  assert.strictEqual(s.active, true);
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), 'x');
  assert.strictEqual(project.projectState({ cwd: wt, env }).active, false);
});

const NOW = Date.parse('2026-09-29T12:00:00.000Z');
const task = (over = {}) => ({ id: 't1', worktree: path.resolve('/tmp/wt-x'), base: 'a'.repeat(40), files: ['a.js'], agents: ['pignolo:implementer'], ...over });
const valid = (over = {}) => ({
  v: 1, flow: 'daily', started: '2026-09-29T11:00:00.000Z', expires: '2026-09-29T13:00:00.000Z', task: task(), ...over,
});
const readWith = (content) => {
  const main = makeTempDir();
  fs.mkdirSync(path.join(main, '.pignolo'));
  if (content !== undefined) fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), typeof content === 'string' ? content : JSON.stringify(content));
  return project.readRun(main, NOW);
};

test('readRun', () => {
  const cases = [
    ['no file', undefined, { running: false }],
    ['current with task', valid(), { running: true, expired: false, id: 't1' }],
    ['current without task', valid({ task: undefined }), { running: true, expired: false }],
    ['unparsable', '{no', { running: true, malformed: true }],
    ['v2', valid({ v: 2 }), { running: true, malformed: true }],
    ['no flow', valid({ flow: undefined }), { running: true, malformed: true }],
    ['files not a list', valid({ task: task({ files: 'a.js' }) }), { running: true, malformed: true }],
    ['relative worktree', valid({ task: task({ worktree: 'wt' }) }), { running: true, malformed: true }],
    ['testAuthorization not boolean', valid({ task: task({ testAuthorization: 'si' }) }), { running: true, malformed: true }],
    ['testAuthorization true', valid({ task: task({ testAuthorization: true }) }), { running: true, expired: false, id: 't1' }],
    ['expired keeps its task', valid({ expires: '2026-09-29T11:30:00.000Z' }), { running: false, expired: true, id: 't1' }],
  ];
  for (const [name, content, want] of cases) {
    const r = readWith(content);
    assert.strictEqual(r.running, want.running, name);
    assert.strictEqual(r.malformed === true, want.malformed === true, name);
    if ('expired' in want) assert.strictEqual(r.expired, want.expired, name);
    assert.strictEqual(r.run && r.run.task ? r.run.task.id : undefined, want.id, name);
    assert.ok(r.file.endsWith('run.json'), name);
  }
});

test('runState stays as an alias of readRun', () => {
  assert.strictEqual(project.runState, project.readRun);
});
