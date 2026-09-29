'use strict';
// PowerShell por el AST nativo (spec §11.6, F5, F12). Cada evaluación lanza powershell.exe.
const test = require('node:test');
const assert = require('node:assert');
const { makeRepo, makeTempDir, runLauncher } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

// Plazo holgado para el parseo de PowerShell: con la suite en paralelo, los 2 s reales
// vencen de a ratos (auditoría 3, G13). El plazo real lo prueba tests/ps-ast.test.js.
const PS_T = 30000;
const ps = (cmd, mode = 'bypassPermissions', extra = {}) => evaluate(cmd, { shell: 'powershell', mode, psTimeoutMs: PS_T, ...extra });

// Código armado en texto (F5): no verificable (deny en modo autónomo).
const SINKS = [
  ["[scriptblock]::Create('gi'+'t reset --hard').Invoke()", 'ps-sink'],
  ["$ExecutionContext.InvokeCommand.InvokeScript('gi'+'t reset --hard')", 'ps-sink'],
  ["$ExecutionContext.InvokeCommand.NewScriptBlock('x')", 'ps-sink'],
  ["Set-Alias x Invoke-Expression; x ('gi'+'t reset --hard')", 'ps-sink'],
  ['New-Alias -Name g -Value git', 'ps-sink'],
  ["[System.Diagnostics.Process]::Start('gi'+'t', 'reset --hard')", 'ps-sink'],
  ['Invoke-Command -ScriptBlock ([scriptblock]::Create("gi"+"t stash"))', 'ps-sink'],
  ["[powershell]::Create().AddScript('x').Invoke()", 'ps-sink'],
  ['$o.$m()', 'ps-sink'],
  ["Start-Process ('gi'+'t') -ArgumentList 'reset','--hard'", 'dynamic-command'],
  ['& $cmd reset --hard', 'dynamic-command'],
  ['Invoke-Expression ("gi"+"t reset --hard")', 'hidden-code'],
  ["@'\ngit reset --hard\n'@ | iex", 'hidden-code'],
  ["$e='Invoke-Expression'; & $e 'gi'", 'hidden-code'],
  ['$x | powershell -', 'hidden-code'],
  ['powershell -EncodedCommand ZwBpAHQA', 'ps-encoded'],
];

for (const [cmd, rule] of SINKS) {
  test(`powershell sink (F5): ${cmd.replace(/\n/g, '⏎')}`, () => {
    const v = ps(cmd);
    assert.strictEqual(v.decision, 'block', JSON.stringify(v));
    assert.strictEqual(v.rule, rule);
    assert.strictEqual(ps(cmd, 'default').decision, 'ask');
  });
}

// Formas literales: se ve el comando y se aplican sus reglas.
const LITERAL = [
  ['Start-Process git -ArgumentList "reset --hard"', 'reset-hard'],
  ['cmd /c git reset --hard', 'reset-hard'],
  ['cmd /c --% git reset --hard', 'reset-hard'],
  ['git reset `\n--hard', 'reset-hard'],
  ['git status; git reset --hard', 'reset-hard'],
  // && y || son de PowerShell 7: el parser de 5.1 falla y queda no verificable.
  ['git status && git reset --hard', 'unparseable'],
  ['git status || git clean -fd', 'unparseable'],
  ['git status | git clean -fd', 'clean'],
  ["@'\ngit reset --hard\n'@ | powershell -", 'reset-hard'],
  ["@'\ngit reset --hard\n'@ | powershell", 'reset-hard'],
  ["& 'C:\\Program Files\\Git\\cmd\\git.exe' reset --hard", 'reset-hard'],
  ['Start-Job { git reset --hard }', 'reset-hard'],
  ['1..1 | ForEach-Object { git clean -fdx }', 'clean'],
  ['$null = git reset --hard', 'reset-hard'],
  ['git reset --hard 2>$null', 'reset-hard'],
  ['git reset -`-hard', 'reset-hard'],
  ['pwsh -c "git reset --hard"', 'reset-hard'],
  ['wsl git reset --hard', 'reset-hard'],
  ["'x' | Out-File .pignolo\\.disabled", 'protected-flag'],
  ["[IO.File]::WriteAllText('.pignolo\\.disabled','')", 'protected-flag'],
  ["[IO.File]::WriteAllText('.git\\HEAD','x')", 'protected-path'],
  ['Remove-Item -Recurse -Force .claude', 'catastrophic-delete'],
  ["$env:GIT_EDITOR = 'git reset --hard;'; git commit", 'reset-hard'], // G7, auditoría 3
];

for (const [cmd, rule] of LITERAL) {
  test(`powershell literal form: ${cmd.replace(/\n/g, '⏎')}`, () => {
    const v = ps(cmd);
    assert.strictEqual(v.decision, 'block', JSON.stringify(v));
    assert.strictEqual(v.rule, rule);
  });
}

// Protects: borrados de PowerShell sin operando literal (G2, auditoría 3) · Breaks if: pasa
// un borrado por pipeline, un .Delete()/.MoveTo() sobre un objeto o un alias a Remove-Item.
test('powershell deletes through the pipeline, FileSystemInfo methods and aliases to deleters (G2)', () => {
  for (const cmd of ['Get-ChildItem -Force | Remove-Item -Recurse -Force', 'gci -Force | ri -r -fo',
    'Get-Item .git -Force | Remove-Item -Recurse -Force', "'.git' | Remove-Item -Recurse -Force",
    'Get-ChildItem -Force | Where-Object { $_.Name -like ".g*" } | Remove-Item -Recurse -Force',
    'Get-ChildItem dist | ForEach-Object { $_ } | Remove-Item', '(Get-Item .git -Force).Delete($true)',
    "[IO.DirectoryInfo]::new('.git').Delete($true)", '$d = Get-Item .git -Force; $d.Delete($true)',
    "(Get-Item .git -Force).MoveTo('..\\x')"]) {
    const v = ps(cmd, 'default');
    assert.strictEqual(v.rule, 'catastrophic-delete', cmd);
    assert.strictEqual(v.decision, 'block', cmd);
  }
  assert.strictEqual(ps("(Get-Item a.txt).MoveTo('.git\\x')").rule, 'protected-path');
  assert.strictEqual(ps('Get-ChildItem .git -Recurse | Clear-Content').rule, 'protected-path');
  for (const cmd of ['Set-Alias g Remove-Item; g .git -Recurse -Force', 'New-Alias -Name d -Value del',
    'Set-Item alias:g Remove-Item', 'New-Item -Path alias:g -Value Move-Item']) {
    assert.strictEqual(ps(cmd).rule, 'ps-sink', cmd);
  }
  for (const cmd of ['Get-ChildItem dist -Recurse | Remove-Item -Recurse -Force',
    'Get-ChildItem dist | Where-Object { $_.Length -gt 0 } | Remove-Item', '(Get-Item dist\\x.txt).Delete()',
    "'hola' | Set-Content x.txt", 'Set-Alias ll Get-ChildItem']) {
    assert.strictEqual(ps(cmd).decision, 'allow', cmd);
  }
});

test('assignment with a literal CommandAst is allowed (F12)', () => {
  for (const cmd of ['$branch = git rev-parse --abbrev-ref HEAD', '$s = git status --porcelain; if ($s) { Write-Host dirty }',
    '$m = "C:\\tmp\\medir.ps1"; & $m -Archivo x.png', 'Set-Alias ll Get-ChildItem', 'Start-Process notepad']) {
    assert.strictEqual(ps(cmd).decision, 'allow', cmd);
  }
});

// Protects: tests estables con la máquina cargada (G13, auditoría 3) · Breaks if: el
// plazo del parseo que piden los tests no llega a powershell.exe.
test('evaluate passes psTimeoutMs to the PowerShell parser; running out of time is ps-unavailable', () => {
  const v = evaluate('Get-Date -Format plazo-de-un-ms', { shell: 'powershell', mode: 'default', psTimeoutMs: 1 });
  assert.deepStrictEqual([v.decision, v.rule], ['ask', 'ps-unavailable']);
});

test('powershell.exe that cannot start fails closed, by mode', () => {
  const opts = { psExe: 'pignolo-no-existe-powershell.exe' };
  const auto = ps('Get-Date', 'bypassPermissions', opts);
  assert.strictEqual(auto.decision, 'block');
  assert.strictEqual(auto.rule, 'ps-unavailable');
  assert.strictEqual(ps('Get-Date', 'default', opts).decision, 'ask');
});

test('through the launcher, without powershell.exe on PATH, PowerShell fails closed', () => {
  const empty = makeTempDir();
  const r = runLauncher('guard', { hook_event_name: 'PreToolUse', tool_name: 'PowerShell', permission_mode: 'bypassPermissions',
    tool_input: { command: 'Get-Date' }, cwd: makeRepo() }, { PATH: empty, Path: empty, SystemRoot: empty, windir: empty });
  assert.strictEqual(r.status, 2, r.stderr);
});
