import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions, claudeVersion, envReport } from '../lib/env-check.mjs';
import { PLUGIN_ROOT } from './helpers.mjs';

const pluginVersion = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;

test('compareVersions compares numerically', () => {
  assert.equal(compareVersions('2.1.284', '2.1.271'), 1);
  assert.equal(compareVersions('2.1.9', '2.1.10'), -1);
  assert.equal(compareVersions('2.1.271', '2.1.271'), 0);
});

test('envReport reads the version with a single exec call', () => {
  const calls = [];
  const exec = (file, args) => { calls.push([file, args]); return '2.1.284 (Claude Code)\n'; };
  const r = envReport({ exec, platform: 'win32' });
  assert.equal(r.claude.version, '2.1.284');
  assert.equal(r.claude.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(r.pluginVersion, pluginVersion);
});

test('an old Claude Code is not ok; an unreadable one fails closed with a reason', () => {
  const old = envReport({ exec: () => '2.1.200 (Claude Code)' });
  assert.equal(old.claude.ok, false);
  assert.ok(old.claude.reason);
  const broken = envReport({ exec: () => { throw new Error('boom'); }, platform: 'linux' });
  assert.equal(broken.claude.version, null);
  assert.equal(broken.claude.ok, false);
  assert.ok(broken.claude.reason);
});

test('win32 retries through cmd.exe with fixed arguments after ENOENT', () => {
  const calls = [];
  const exec = (file, args) => {
    calls.push([file, args]);
    if (calls.length === 1) { const e = new Error('nope'); e.code = 'ENOENT'; throw e; }
    return '2.1.290';
  };
  assert.equal(claudeVersion({ exec, platform: 'win32' }), '2.1.290');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], ['cmd.exe', ['/d', '/s', '/c', 'claude --version']]);
});

test('linux does not retry after ENOENT', () => {
  let n = 0;
  const exec = () => { n++; const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
  assert.equal(claudeVersion({ exec, platform: 'linux' }), null);
  assert.equal(n, 1);
});

test('win32 does not retry for an unrelated error', () => {
  let n = 0;
  const exec = () => { n++; const e = new Error('denied'); e.code = 'EACCES'; throw e; };
  assert.equal(claudeVersion({ exec, platform: 'win32' }), null);
  assert.equal(n, 1);
});
