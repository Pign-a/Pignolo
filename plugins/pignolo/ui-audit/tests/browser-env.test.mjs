// Browser discovery, PNG validation and the width/theme plan (spec §11.1, §11.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { makePng, makeTempDir, writeTree } from './helpers.mjs';
import { findBrowser } from '../lib/browser-find.mjs';
import { checkPng } from '../lib/png.mjs';
import { shotPlan, planFromProject } from '../lib/shot-plan.mjs';

const existsIn = (list) => (p) => list.includes(p);

const win = (...parts) => path.win32.join(...parts);
const PF = win('C:/', 'Program Files');
const PF86 = win('C:/', 'Program Files (x86)');
const LOCAL = win('C:/', 'Users', 'u', 'AppData', 'Local');

test('discovery: PIGNOLO_UI_BROWSER wins, and a missing one is not replaced', () => {
  const forced = win('D:/', 'b', 'chrome.exe');
  const env = { PIGNOLO_UI_BROWSER: forced, ProgramFiles: PF };
  const edge = win(PF, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  assert.deepEqual(findBrowser({ platform: 'win32', env, exists: existsIn([forced, edge]) }), { path: forced, source: 'env' });
  const r = findBrowser({ platform: 'win32', env, exists: existsIn([edge]) });
  assert.equal(r.path, null);
  assert.match(r.reason, /PIGNOLO_UI_BROWSER/);
});

test('discovery: Windows standard folders, Edge before Chrome, per-user Chrome too', () => {
  const env = { ProgramFiles: PF, 'ProgramFiles(x86)': PF86, LOCALAPPDATA: LOCAL };
  const edge = win(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const chrome = win(PF, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const userChrome = win(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe');
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([chrome, edge]) }).path, edge);
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([chrome]) }).path, chrome);
  assert.equal(findBrowser({ platform: 'win32', env, exists: existsIn([userChrome]) }).path, userChrome);
});

test('discovery: macOS /Applications and Linux PATH', () => {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(findBrowser({ platform: 'darwin', env: {}, exists: existsIn([mac]) }).path, mac);
  const env = { PATH: '/usr/local/bin:/usr/bin' };
  assert.equal(findBrowser({ platform: 'linux', env, exists: existsIn(['/usr/bin/chromium']) }).path, '/usr/bin/chromium');
  assert.equal(findBrowser({ platform: 'linux', env, exists: existsIn(['/usr/bin/microsoft-edge']) }).path, '/usr/bin/microsoft-edge');
});

test('discovery: nothing installed gives a reason, never a guess', () => {
  const r = findBrowser({ platform: 'win32', env: { ProgramFiles: PF }, exists: () => false });
  assert.deepEqual(r, { path: null, reason: 'no Chrome or Edge found (set PIGNOLO_UI_BROWSER)' });
});

test('png: signature, sides at most 2000 px and sha256', () => {
  const png = makePng(40, 30);
  assert.deepEqual(checkPng(png), { ok: true, width: 40, height: 30, sha256: crypto.createHash('sha256').update(png).digest('hex') });
  assert.match(checkPng(Buffer.from('not a png at all, really')).reason, /not a PNG/);
  assert.match(checkPng(png.subarray(0, 20)).reason, /truncated/);
  assert.match(checkPng(makePng(2001, 1)).reason, /2001x1 exceeds 2000 px/);
  const zero = Buffer.from(png);
  zero.writeUInt32BE(0, 16);
  assert.match(checkPng(zero).reason, /empty image/);
});

test('plan: widths per platform (§11.3), dark only when declared or detected', () => {
  const w = (p) => shotPlan({ platform: p }).widths.map((x) => `${x.width}x${x.height}${x.capture ? '*' : ''}`);
  assert.deepEqual(w('desktop'), ['1440x900*', '320x640']);
  assert.deepEqual(w('mobile'), ['375x812*', '320x640']);
  assert.deepEqual(w('both'), ['1440x900*', '375x812*', '768x1024', '320x640']);
  assert.deepEqual(shotPlan({ platform: 'both' }).themes, ['light']);
  assert.deepEqual(shotPlan({ platform: 'both', dark: true }).themes, ['light', 'dark']);
  assert.throws(() => shotPlan({ platform: 'tv' }), /platform/);
});

test('plan from the project: DESIGN.md platform, dark from themes.dark or the CSS', () => {
  const plain = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\npignolo:\n  schema: 1\n  platform: mobile\n---\n', 'app.css': ':root { --bg: #fff; }\n' });
  assert.deepEqual(planFromProject({ project: plain, design: path.join(plain, 'DESIGN.md') }), { platform: 'mobile', dark: false });
  const css = writeTree(makeTempDir(), { 'app.css': ':root { --bg: #fff; }\n.dark { --bg: #000; }\n' });
  assert.deepEqual(planFromProject({ project: css, design: null }), { platform: 'both', dark: true });
  const declared = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\ncolors:\n  surface: "#FFFFFF"\npignolo:\n  schema: 1\n  platform: desktop\n  themes:\n    dark:\n      surface: "rgb(0 0 0)"\n---\n' });
  assert.deepEqual(planFromProject({ project: declared, design: path.join(declared, 'DESIGN.md') }), { platform: 'desktop', dark: true });
});
