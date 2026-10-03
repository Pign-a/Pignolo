'use strict';
// Arreglos de la revisión de la etapa 1 (RT1-01, RT1-02): la certeza de un `cd` exige una forma que no falla, y un `cd`
// dentro de código que corre en la shell actual (eval, source de stdin) deja el directorio desconocido. Falla cerrado.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const { makeRepo, git } = require('./helpers');

const posix = (p) => p.split(path.sep).join('/');
const sub = (command, o = {}) => evaluate(command, { shell: 'bash', mode: 'bypassPermissions', psTimeoutMs: 30000, subagent: true, agentType: 'pignolo:implementer', ...o });
const out = (v) => (v.decision === 'block' ? v.rule : v.decision);

const mainRepo = makeRepo();
const wt = makeRepo();
git(['checkout', '-q', '-b', 'plan/x'], wt);
const W = posix(wt);
const M = posix(mainRepo);

const DENY = [
  ['cd -L con un argumento de más', `cd -L "${W}" junk; git merge feat`, 'bash'],
  ['cd -- X con la opción', `cd -- "${W}"; git merge feat`, 'bash'],
  ['cd con redirección de duplicado', `cd "${W}" 2>&1; git merge feat`, 'bash'],
  ['chdir con un argumento de más', `chdir "${W}" junk; git merge feat`, 'bash'],
  ['Push-Location con un argumento de más', `Push-Location "${W}" junk; git merge feat`, 'powershell'],
  ['sl con -Path', `sl -Path "${W}"; git merge feat`, 'powershell'],
  ['cd W; eval "cd M"; merge', `cd "${W}"; eval "cd '${M}'"; git merge feat`, 'bash'],
  ['eval con pushd', `eval "pushd '${M}'" && git merge feat`, 'bash'],
  ['eval con cd tras otro comando', `eval "echo hi; cd '${M}'"; git merge feat`, 'bash'],
  ['eval con variable', `eval "cd $X"; git merge feat`, 'bash'],
  ['source - con un cd en el heredoc', `. /dev/stdin <<'EOS'\ncd '${M}'\nEOS\ngit merge feat`, 'bash'],
  ['Invoke-Expression', `Invoke-Expression "cd '${M}'"; git merge feat`, 'powershell'],
  ['iex', `iex "Set-Location '${M}'"; git merge feat`, 'powershell'],
];
// Un cd que falla solo importa desde main; un eval con cd, también desde la rama de tarea (corre en main).
for (const [name, cmd, shell] of DENY) {
  test(`se niega a un subagente: ${name}`, () => {
    for (const cwd of /eval|iex|Invoke|source|stdin/i.test(name) ? [mainRepo, wt] : [mainRepo]) {
      const v = sub(cmd, { cwd, shell });
      assert.notStrictEqual(v.decision, 'allow', `${cwd} ${cmd} -> ${JSON.stringify({ decision: v.decision, rule: v.rule })}`);
    }
  });
}

test('el uso normal del subagente en su rama sigue pasando', () => {
  for (const c of [`cd "${W}" && git status --short | head; git merge main`, `cd "${W}"; git merge main`, `pushd "${W}"; git merge main`, 'eval "echo hi"; git merge main',
    'eval "git status"; git merge main']) {
    assert.strictEqual(out(sub(c, { cwd: wt })), 'allow', c);
  }
  assert.strictEqual(out(sub(`Set-Location "${W}"; git merge main`, { cwd: mainRepo, shell: 'powershell' })), 'allow');
  assert.strictEqual(out(sub(`cd "${W}"; git merge main`, { cwd: mainRepo })), 'allow');
});

test('handler con agent_id: el cd con un argumento de más y el eval con cd se niegan', () => {
  for (const [cwd, command] of [[mainRepo, `cd "${W}" junk; git merge feat`], [wt, `eval "cd '${M}'" && git merge feat`]]) {
    const r = guard.run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd, agent_id: 'a1', agent_type: 'pignolo:implementer', permission_mode: 'bypassPermissions' }, { env: {}, snapshot: () => ({ ref: 'r' }) });
    assert.strictEqual(r.exit, 2, command);
    assert.match(r.stderr, /subagent-main|main/);
  }
});
