'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, PLUGIN_ROOT } = require('./helpers');
const gate = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'present-gate.js'));

const SECRET_DATA = 'cliente-77-confidencial';

function project(md) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), md);
  return repo;
}
function startFlow(repo, over = {}) {
  const run = { v: 1, flow: 'daily', started: '2026-09-30T11:00:00.000Z', expires: new Date(Date.now() + 3600000).toISOString(), ...over };
  fs.writeFileSync(path.join(repo, '.pignolo', 'run.json'), JSON.stringify(run));
}
function html(repo, body, name = 'view.html') {
  const f = path.join(repo, name);
  fs.writeFileSync(f, `<!doctype html><p>${body}</p>`);
  return f;
}
const call = (repo, tool_input, env = {}) => gate.run({ hook_event_name: 'PreToolUse', tool_name: 'Artifact', tool_input, cwd: repo }, { env });
const MD = (extra = '') => `---\ntype: code-tested\n${extra}---\n`;

test('without a flow in progress it is silent even with presentation: text', () => {
  const repo = project(MD('presentation: text\n'));
  const r = call(repo, { file_path: html(repo, 'hola') });
  assert.deepEqual([r.exit, r.stdout, r.stderr], [0, undefined, undefined]);
});

test('flow in progress and presentation text: exit 2 with Alternativa', () => {
  const repo = project(MD('presentation: text\n'));
  startFlow(repo);
  const r = call(repo, { file_path: html(repo, 'hola') });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /Alternativa: mostralo como texto/);
});

test('ask with a pii-patterns hit: exit 2 and the message never repeats the data', () => {
  const repo = project(MD(`presentation: ask\npii-patterns:\n  - "cliente-[0-9]+-confidencial"\n`));
  startFlow(repo);
  const r = call(repo, { file_path: html(repo, `ver ${SECRET_DATA}`) });
  assert.equal(r.exit, 2);
  assert.ok(!r.stderr.includes(SECRET_DATA));
  assert.match(r.stderr, /pii/);
  assert.match(r.stderr, /Alternativa: sacá el dato/);
});

test('a secret blocks even without pii-patterns, and its value is not repeated', () => {
  const repo = project(MD('presentation: ask\n'));
  startFlow(repo);
  const key = 'AKIA1234567890ABCDEF';
  const r = call(repo, { file_path: html(repo, `clave ${key}`) });
  assert.equal(r.exit, 2);
  assert.ok(!r.stderr.includes(key));
  assert.match(r.stderr, /aws-access-key/);
});

test('clean html with ask is silent; a relative file_path resolves against cwd', () => {
  const repo = project(MD('presentation: ask\n'));
  startFlow(repo);
  html(repo, 'todo limpio', 'rel.html');
  const r = call(repo, { file_path: 'rel.html' });
  assert.deepEqual([r.exit, r.stdout, r.stderr], [0, undefined, undefined]);
});

test('type_url naming Design needs the project canvas consent', () => {
  const repo = project(MD('presentation: ask\n'));
  startFlow(repo);
  const f = html(repo, 'limpio');
  const r = call(repo, { type_url: 'https://claude.ai/artifact-types/design', file_path: f });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /Alternativa: pedile el consentimiento del proyecto al humano/);
  const repo2 = project(MD('presentation: ask\ncanvas-consent: true\n'));
  startFlow(repo2);
  const ok = call(repo2, { type_url: 'https://claude.ai/artifact-types/design', file_path: html(repo2, 'limpio') });
  assert.equal(ok.exit, 0);
  // otro tipo de artifact no pide el consentimiento
  assert.equal(call(repo, { type_url: 'https://claude.ai/artifact-types/slides', file_path: f }).exit, 0);
});

test('an unknown tool_input shape is silent (R-9)', () => {
  const repo = project(MD('presentation: ask\n'));
  startFlow(repo);
  for (const ti of [{}, { content: 'x' }, { file_path: 5 }, null, { file_path: path.join(repo, 'no-existe.html') }]) {
    const r = gate.run({ tool_name: 'Artifact', tool_input: ti, cwd: repo }, { env: {} });
    assert.equal(r.exit, 0, JSON.stringify(ti));
  }
});

test('an expired flow, /pignolo:off and PIGNOLO_DISABLED turn it off', () => {
  const repo = project(MD('presentation: text\n'));
  startFlow(repo, { expires: '2020-01-01T00:00:00.000Z' });
  const f = html(repo, 'hola');
  assert.equal(call(repo, { file_path: f }).exit, 0);
  startFlow(repo);
  assert.equal(call(repo, { file_path: f }).exit, 2);
  assert.equal(call(repo, { file_path: f }, { PIGNOLO_DISABLED: '1' }).exit, 0);
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  assert.equal(call(repo, { file_path: f }).exit, 0);
});
