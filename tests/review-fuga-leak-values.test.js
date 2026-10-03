'use strict';
// Revisión opus de la rama fix/fuga-leak-values (2026-10-03): hallazgos RL-02 a RL-06 como tests que fallan.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runGuard, makeRepo, git } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const bash = (command, cwd, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd, ...extra });
const put = (repo, rel, text = '["SECRETO-XYZ"]\n') => {
  const f = path.join(repo, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
const LEAK = '.pignolo-ui/runs/r1/leak-values.json';

test('RL-02: git add -f <privado> && git commit en un solo comando del hilo principal se frena (la compuerta mira el índice antes del add)', () => {
  const repo = makeRepo();
  put(repo, '.pignolo-ui/.gitignore', '*\n');
  put(repo, LEAK);
  assert.strictEqual(runGuard(bash('git add -f .pignolo-ui/runs && git commit -m resguardo', repo)).status, 2);
});

test('RL-03: git stage -f (sinónimo de git add) de un subagente se niega con add-force', () => {
  const v = evaluate('git stage -f .pignolo-ui/runs', { shell: 'bash', mode: 'bypassPermissions', subagent: true });
  assert.deepStrictEqual([v.decision, v.rule], ['block', 'add-force']);
});

test('RL-04: git commit -i/--include <ruta> lleva también lo que ya está en el índice: con un privado indexado se frena', () => {
  const repo = makeRepo();
  put(repo, '.pignolo-ui/.gitignore', '*\n');
  put(repo, LEAK);
  git(['add', '-f', LEAK], repo);
  put(repo, 'b.txt', 'b\n');
  git(['add', 'b.txt'], repo);
  assert.strictEqual(runGuard(bash('git commit -i -m x b.txt', repo)).status, 2);
  assert.strictEqual(runGuard(bash('git commit --include -m x b.txt', repo)).status, 2);
});

test('RL-05: en un repo sin commits la salida que sugiere la compuerta funciona y después el commit pasa', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-unborn-'));
  git(['init', '-q', '-b', 'main'], repo);
  put(repo, LEAK);
  put(repo, 'a.txt', 'a\n');
  git(['add', '-f', '.'], repo);
  const msg = runGuard(bash('git commit -m inicial', repo)).stderr;
  const cmd = /`(git [^`]*)`/.exec(msg)[1];
  // el comando del mensaje, tal cual (lo corre el humano o el agente en un comando aparte)
  execFileSync(process.platform === 'win32' ? 'bash' : 'sh', ['-c', cmd], { cwd: repo, stdio: 'pipe' });
  assert.strictEqual(runGuard(bash('git commit -m inicial', repo)).status, 0);
});

test('RL-06: daily, entry y close-session conservan su encabezado "## Steps" (la línea NO-RUNS-COMMIT lo reemplazó)', () => {
  for (const s of ['daily', 'entry', 'close-session', 'trivial']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'pignolo', 'skills', s, 'SKILL.md'), 'utf8');
    assert.ok(/^## Steps$/m.test(text), `${s} perdió "## Steps"`);
  }
});
