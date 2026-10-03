'use strict';
// T3 (D-G3): al vencer el plazo interno del launcher, un comando de solo lectura POR ESTRUCTURA pasa en los hooks
// guard y scope-gate; lo que escribe, borra o no se puede clasificar sigue negado. private-reads y plan-audit-gate nunca pasan.
const test = require('node:test');
const assert = require('node:assert');
const { isReadOnlyByStructure } = require('../plugins/pignolo/lib/read-only');
const fs = require('node:fs');
const path = require('node:path');
const { runLauncher, makeRepo, PLUGIN_ROOT } = require('./helpers');

const PASS_BASH = [
  'ls -la src', 'git status', 'git log --oneline -5 | head -3', 'cat a.txt | grep -n foo | wc -l', 'cd sub && ls && pwd',
  'grep -rn "deadline" plugins/ | head -20', 'git diff HEAD -- src/', 'git show HEAD:a.txt | head',
  'find . -name "*.js" -not -path "./node_modules/*"', 'git branch --show-current', 'git stash list', 'git worktree list', 'rg -n foo src',
  'git --no-pager log -3', 'git remote -v', 'git tag -l', 'git branch -a', 'ls 2>&1', 'ls >/dev/null 2>&1', 'cat < a.txt', 'echo hi 2>/dev/null',
  'git status\ngit log -1', 'ls || echo no', 'git stash show', 'sort a.txt', 'git branch',
];
const DENY_BASH = [
  'rm a.txt', 'echo x > a.txt', 'cat a.txt > b.txt', 'git status; rm a.txt', 'git status && git stash',
  'git checkout -- a.txt', 'git add a.txt', 'git commit -m x', 'git push', 'npm test', 'node x.js',
  'ls $(rm a.txt)', 'ls "$d"', 'FOO=1 ls', 'env ls', 'xargs ls', 'ls; (rm a.txt)', 'ls &', 'echo hi >> log.txt', '(ls)', '{ ls; }',
  'find . -delete', 'find . -exec rm {} +', 'find . -fprint out.txt', 'find . -ok rm {} ;',
  'git diff --output=out.patch', 'git diff --out=x', 'git log --ext-diff', 'git -c core.pager=less log', 'git -C sub log', 'git --git-dir=x log',
  'git diff -O orden.txt', 'git show --textconv HEAD:a', 'git grep --open-files-in-pager=vim foo',
  'git branch x', 'git branch -D x', 'git tag v1', 'git tag', 'git stash', 'git stash pop', 'git worktree add x', 'git remote add o u',
  'rg --pre ./f foo', 'rg --pre-glob=x foo', 'rg -nz foo', 'sort -o a.txt a.txt', 'sort --output=a.txt a.txt', 'sort --out=a a', 'sort -ro a a', 'sort --compress-program=sh a',
  'sed -i s/a/b/ a.txt', 'ls "unclosed', 'cat <<EOF\nx\nEOF', 'cat <<< hi', 'ls <(echo)', 'ls `pwd`', 'ls $HOME', 'ls ${X}', 'tee a.txt', 'tree -o x', 'file -C',
  'cat a.txt 2>err.txt', 'ls &>out', 'ls >&3', '', '   ', 'git status | sh', 'git status | xargs rm',
];
const PASS_PS = ['Get-ChildItem src', 'Get-Content a.txt -Tail 5', 'Test-Path a.txt', 'Select-String -Path a.txt -Pattern foo', 'git status',
  'git log --oneline -3', "Get-Content 'a b.txt'", 'Get-ChildItem "src"'];
const DENY_PS = ['Remove-Item a.txt', 'Get-Content a.txt | Set-Content b.txt', 'Get-ChildItem $env:TEMP', 'Get-ChildItem > out.txt', '& git status',
  'git status; Remove-Item a', 'git log @a', 'tree -o out.txt', 'file -C -m magic', 'git diff --output=x', 'git stash', 'git checkout -- a.txt',
  'Get-Content (Get-Item a)', 'Get-ChildItem {x}', "Get-Content 'a$b'", 'Get-ChildItem \\\\srv\\share', 'git -c core.pager=x log', 'git status & calc', 'Set-Content a.txt x', ''];

test('clasificador, Bash: lo de solo lectura pasa', () => {
  for (const c of PASS_BASH) assert.strictEqual(isReadOnlyByStructure(c, 'bash'), true, c);
});
test('clasificador, Bash: lo que escribe, ejecuta o no se puede clasificar no pasa', () => {
  for (const c of DENY_BASH) assert.strictEqual(isReadOnlyByStructure(c, 'bash'), false, JSON.stringify(c));
});
test('clasificador, PowerShell: lista cerrada por texto', () => {
  for (const c of PASS_PS) assert.strictEqual(isReadOnlyByStructure(c, 'powershell'), true, c);
  for (const c of DENY_PS) assert.strictEqual(isReadOnlyByStructure(c, 'powershell'), false, JSON.stringify(c));
});
test('clasificador: entrada que no es texto', () => {
  for (const x of [undefined, null, 5, {}, []]) assert.strictEqual(isReadOnlyByStructure(x, 'bash'), false);
});

const repo = makeRepo();
const hook = (tool_name, command, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input: { command }, cwd: repo, ...extra });
const FAST = { PIGNOLO_DEADLINE_MS: '1' };

test('launcher guard con plazo vencido: ls pasa con aviso, rm se niega con el plazo', () => {
  const a = runLauncher('guard', hook('Bash', 'ls'), FAST);
  assert.strictEqual(a.status, 0, a.stderr);
  assert.match(JSON.parse(a.stdout).systemMessage, /plazo/);
  const b = runLauncher('guard', hook('Bash', 'rm a.txt'), FAST);
  assert.strictEqual(b.status, 2);
  assert.match(b.stderr, /plazo interno/);
  const c = runLauncher('guard', hook('PowerShell', 'Get-ChildItem src'), FAST);
  assert.strictEqual(c.status, 0, c.stderr);
});

test('launcher scope-gate con plazo vencido: git log pasa, git merge se niega', () => {
  const a = runLauncher('scope-gate', hook('Bash', 'git log main..branch'), FAST);
  assert.strictEqual(a.status, 0, a.stderr);
  const b = runLauncher('scope-gate', hook('Bash', 'git merge x'), FAST);
  assert.strictEqual(b.status, 2);
  assert.match(b.stderr, /plazo interno/);
});

test('private-reads y plan-audit-gate nunca pasan al vencer el plazo, ni con un cat', () => {
  const a = runLauncher('private-reads', hook('Bash', 'cat a.txt', { agent_id: 'a1', agent_type: 'pignolo:implementer' }), FAST);
  assert.strictEqual(a.status, 2, a.stderr);
  assert.match(a.stderr, /plazo interno/);
  const b = runLauncher('plan-audit-gate', hook('Bash', 'cat a.txt', { agent_id: 'a1', agent_type: 'pignolo:plan-auditor' }), FAST);
  assert.strictEqual(b.status, 2, b.stderr);
});

test('PIGNOLO_DEADLINE_MS solo baja el plazo: 99999 no lo sube (un handler lento sigue negado a los ~3 s) y un valor inválido se ignora', () => {
  const file = path.join(PLUGIN_ROOT, 'hooks', 'handlers', '_tmp-slow-dl.js');
  fs.writeFileSync(file, 'exports.run = () => { const end = Date.now() + 8000; while (Date.now() < end) {} return { exit: 0 }; };');
  try {
    for (const v of ['99999', '0', 'abc', '-5', '1.5']) {
      const t0 = Date.now();
      const r = runLauncher('_tmp-slow-dl', {}, { PIGNOLO_DEADLINE_MS: v });
      assert.strictEqual(r.status, 2, v);
      assert.match(r.stderr, /plazo interno de 3000 ms/, v);
      assert.ok(Date.now() - t0 < 6000, v);
    }
  } finally { fs.rmSync(file, { force: true }); }
});

test('sin PIGNOLO_DEADLINE_MS el comando de lectura pasa por el handler, sin aviso de plazo', () => {
  const r = runLauncher('guard', hook('Bash', 'ls'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(!/plazo/.test(r.stdout + r.stderr));
});

test('los caminos de error del launcher siguen negando aunque el comando sea de solo lectura', () => {
  const a = runLauncher('guard', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }).slice(0, -3), FAST);
  assert.strictEqual(a.status, 2);
  const b = runLauncher('no-existe', hook('Bash', 'ls'), FAST);
  assert.strictEqual(b.status, 2);
});
