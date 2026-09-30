'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir, runLauncher, LAUNCHER } = require('./helpers');
const reads = require('../plugins/pignolo/hooks/handlers/private-reads');

const CORPUS = require('./guard/must-allow.json');
const MESSAGE = /pignolo bloqueó la lectura: el holdout y los sellos solo los lee el validator por los scripts de pignolo\. Alternativa: /;

// HOME temporal con el almacén adentro y un proyecto de pignolo bajo el home.
function setup() {
  const home = makeTempDir('pignolo-reads-home-');
  const env = { HOME: home, USERPROFILE: home, PIGNOLO_HOME: path.join(home, '.pignolo') };
  const store = path.join(env.PIGNOLO_HOME, 'holdout', 'repo1', 'p1');
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(path.join(store, 'acc.test.js'), 'x\n');
  const repo = path.join(home, 'proj');
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  return { home, env, repo, store };
}

const IMPL = { agent_id: 'a1', agent_type: 'pignolo:implementer' };
const payload = (s, tool, input, who = IMPL) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, cwd: s.repo, ...who });

test('private-reads denies subagents the holdout and seals store (table)', async (t) => {
  const s = setup();
  const rows = [
    ['Read of a holdout file', 'Read', { file_path: path.join(s.store, 'acc.test.js') }, IMPL, 2],
    ['Read as validator', 'Read', { file_path: path.join(s.store, 'acc.test.js') }, { agent_id: 'a2', agent_type: 'pignolo:validator' }, 0],
    ['Read from the main thread', 'Read', { file_path: path.join(s.store, 'acc.test.js') }, {}, 0],
    ['Read of a seal', 'Read', { file_path: path.join(s.env.PIGNOLO_HOME, 'seals', 'r', 'x.json') }, IMPL, 2],
    ['Read of a repo file', 'Read', { file_path: path.join(s.repo, 'a.js') }, IMPL, 0],
    ['Glob with path = home', 'Glob', { path: s.home, pattern: '**/*.test.js' }, IMPL, 2],
    ['Glob with path = repo', 'Glob', { path: s.repo, pattern: '**/*.test.js' }, IMPL, 0],
    ['Glob without path (cwd = repo)', 'Glob', { pattern: '**/*.test.js' }, IMPL, 0],
    ['Glob with path = repo and pattern ../**', 'Glob', { path: s.repo, pattern: '../**/*.test.js' }, IMPL, 2],
    ['Grep with path = ~/.pignolo', 'Grep', { path: path.join(s.home, '.pignolo'), pattern: 'x' }, IMPL, 2],
    ['Grep with path = repo', 'Grep', { path: s.repo, pattern: 'x', glob: '*.js' }, IMPL, 0],
    ['Grep with glob climbing out of the repo', 'Grep', { path: s.repo, pattern: 'x', glob: '../**/*.js' }, IMPL, 2],
    ['Bash cat ~/.pignolo/holdout/x', 'Bash', { command: 'cat ~/.pignolo/holdout/x' }, IMPL, 2],
    ['Bash with the absolute store path', 'Bash', { command: `cat "${path.join(s.env.PIGNOLO_HOME, 'seals', 'x')}"` }, IMPL, 2],
    ['Bash naming PIGNOLO_HOME', 'Bash', { command: 'ls "$PIGNOLO_HOME"' }, IMPL, 2],
    ['Bash find ~ -name', 'Bash', { command: 'find ~ -name "*.test.js"' }, IMPL, 2],
    ['Bash grep -rn over $HOME', 'Bash', { command: 'grep -rn holdout $HOME' }, IMPL, 2],
    ['Bash ls -R /', 'Bash', { command: 'ls -R /' }, IMPL, 2],
    ['Bash find . -name', 'Bash', { command: 'find . -name "*.test.js"' }, IMPL, 0],
    ['PowerShell Get-ChildItem -Recurse $env:USERPROFILE', 'PowerShell', { command: 'Get-ChildItem -Recurse $env:USERPROFILE' }, IMPL, 2],
    ['PowerShell gci -r C:\\', 'PowerShell', { command: 'gci -r C:\\ -Filter *.test.js' }, IMPL, 2],
    ['PowerShell Get-ChildItem -Recurse (cwd = repo)', 'PowerShell', { command: 'Get-ChildItem -Recurse -Filter *.js' }, IMPL, 0],
  ];
  for (const [name, tool, input, who, exit] of rows) {
    await t.test(name, () => {
      const r = reads.run(payload(s, tool, input, who), { env: s.env });
      assert.equal(r.exit, exit, r.stderr);
      if (exit === 2) assert.match(r.stderr, MESSAGE);
      else assert.ok(!r.stdout && !r.stderr);
    });
  }
});

test('private-reads is off with /pignolo:off and outside a pignolo project', () => {
  const s = setup();
  const p = payload(s, 'Bash', { command: 'cat ~/.pignolo/holdout/x' });
  fs.writeFileSync(path.join(s.repo, '.pignolo', '.disabled'), '');
  assert.equal(reads.run(p, { env: s.env }).exit, 0);
  fs.rmSync(path.join(s.repo, '.pignolo'), { recursive: true });
  assert.equal(reads.run(p, { env: s.env }).exit, 0);
});

// Falsos positivos (§15): el corpus de comandos que la guardia deja pasar.
test('private-reads lets the must-allow corpus through for an implementer', () => {
  const s = setup();
  const denied = CORPUS.filter((c) => reads.run(payload(s, c.shell === 'powershell' ? 'PowerShell' : 'Bash', { command: c.command }), { env: s.env }).exit !== 0);
  assert.deepEqual(denied.map((c) => c.command), []);
});

// Protects: comodines de shell · Breaks if: un comodín en la ruta (~/.pignolo/*/..., ~/.pign*/...)
// llega al almacén sin nombrar "holdout" ni "seals" en el texto.
test('private-reads denies shell wildcards whose static prefix is the store or an ancestor', async (t) => {
  const s = setup();
  const rows = [
    ['cat ~/.pignolo/*/*/*/*.js', 'Bash', 2],
    ['cat ~/.pign*/hold*/*/*/*', 'Bash', 2],
    ['head -n 5 $HOME/.pignolo/h*/*/*/*', 'Bash', 2],
    ['Get-Content $HOME/.pignolo/h*/*/*/*', 'PowerShell', 2],
    ['Get-Content $env:USERPROFILE\\.pignolo\\s*\\*\\*', 'PowerShell', 2],
    ['cat ../.pign*/*/*/*/*', 'Bash', 2],
    ['cat src/*.js', 'Bash', 0],
    ['grep -n "a.*b" src/a.js', 'Bash', 0],
    ['ls tests/*.test.js', 'Bash', 0],
  ];
  for (const [command, tool, exit] of rows) {
    await t.test(command, () => assert.equal(reads.run(payload(s, tool, { command }), { env: s.env }).exit, exit));
  }
});

// Protects: falso positivo · Breaks if: la palabra PIGNOLO_HOME sola (sin usarla como ruta) se niega.
test('private-reads lets the bare word PIGNOLO_HOME through and denies it as a path', async (t) => {
  const s = setup();
  const rows = [
    ['grep -rn PIGNOLO_HOME plugins/', 'Bash', 0],
    ['rg PIGNOLO_HOME', 'Bash', 0],
    ['cat $PIGNOLO_HOME/holdout/x', 'Bash', 2],
    ['cat ${PIGNOLO_HOME}/x', 'Bash', 2],
    ['type %PIGNOLO_HOME%\\x', 'Bash', 2],
    ['Get-Content $env:PIGNOLO_HOME/x', 'PowerShell', 2],
  ];
  for (const [command, tool, exit] of rows) {
    await t.test(command, () => assert.equal(reads.run(payload(s, tool, { command }), { env: s.env }).exit, exit));
  }
});

// Protects: el hilo principal bajo carga · Breaks if: el launcher carga el worker y el handler
// para un payload sin agent_id (si el plazo de 3 s vence antes, niega en cualquier proyecto).
test('launcher lets private-reads without agent_id through without loading the handler', () => {
  const dir = makeTempDir('pignolo-fastpath-');
  fs.mkdirSync(path.join(dir, 'hooks', 'handlers'), { recursive: true });
  fs.copyFileSync(LAUNCHER, path.join(dir, 'hooks', 'launcher.js'));
  fs.writeFileSync(path.join(dir, 'hooks', 'handlers', 'private-reads.js'), "throw new Error('no se debía cargar');\n");
  const run = (p) => spawnSync(process.execPath, [path.join(dir, 'hooks', 'launcher.js'), 'private-reads'], { input: JSON.stringify(p), encoding: 'utf8', timeout: 20000 });
  const main = run({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } });
  assert.equal(main.status, 0, main.stderr);
  assert.equal(main.stdout + main.stderr, '');
  const sub = run({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' }, agent_id: 'a1' });
  assert.equal(sub.status, 2);
  assert.match(sub.stderr, /no se pudo cargar el hook private-reads/);
});

test('private-reads blocks through the launcher (exit 2 with the message)', () => {
  const s = setup();
  const r = runLauncher('private-reads', payload(s, 'Read', { file_path: path.join(s.store, 'acc.test.js') }), s.env);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, MESSAGE);
});
