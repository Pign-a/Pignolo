'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { evaluate, RULES } = require('../plugins/pignolo/lib/git-guard');
// Plazo holgado para el parseo de PowerShell: con la suite en paralelo, los 2 s reales
// vencen de a ratos (auditoría 3, G13). El plazo real lo prueba tests/ps-ast.test.js.
const PS_T = 30000;

// Los bloqueos se evalúan en un modo autónomo: ahí lo no verificable también es deny.
const AUTO = 'bypassPermissions';

// [nombre, comando, regla esperada]
const BASH_BLOCK = [
  ['stash bare', 'git stash', 'stash'],
  ['stash pop', 'git stash pop', 'stash'],
  ['stash drop', 'git stash drop stash@{0}', 'stash'],
  ['stash clear', 'git stash clear', 'stash'],
  ['stash -u without label', 'git stash -u', 'stash'],
  ['stash apply by index', 'git stash apply stash@{0}', 'stash'],
  ['checkout path', 'git checkout -- src/a.js', 'checkout-path'],
  ['checkout ref path', 'git checkout main -- src/a.js', 'checkout-path'],
  ['checkout dot', 'git checkout .', 'checkout-path'],
  ['checkout HEAD file (no --)', 'git checkout HEAD a.js', 'checkout-path'],
  ['checkout ref file (no --)', 'git checkout main src/a.js', 'checkout-path'],
  ['checkout -f', 'git checkout -f', 'checkout-force'],
  ['switch -f', 'git switch -f main', 'switch-force'],
  ['switch --discard-changes', 'git switch --discard-changes main', 'switch-force'],
  ['restore', 'git restore src/a.js', 'restore'],
  ['restore staged+worktree', 'git restore --staged --worktree a.js', 'restore'],
  ['restore -SW', 'git restore -SW a.js', 'restore'],
  ['reset hard', 'git reset --hard HEAD~1', 'reset-hard'],
  ['reset hard abbreviated', 'git reset --har', 'reset-hard'],
  ['reset merge', 'git reset --merge', 'reset-hard'],
  ['clean f', 'git clean -fd', 'clean'],
  ['clean force', 'git clean --force', 'clean'],
  ['clean xdf', 'git clean -xdf', 'clean'],
  ['worktree remove force', 'git worktree remove --force ../wt', 'worktree-remove-force'],
  ['worktree remove f', 'git worktree remove -f ../wt', 'worktree-remove-force'],
  ['no-verify commit', 'git commit --no-verify -m x', 'no-verify'],
  ['no-verify abbreviated', 'git commit --no-verif -m x', 'no-verify'],
  ['commit -n', 'git commit -n -m x', 'no-verify'],
  ['commit -nm', 'git commit -nm x', 'no-verify'],
  ['no-verify push', 'git push --no-verify', 'no-verify'],
  ['no-verify push quoted', 'git push "--no-verify"', 'no-verify'],
  ['gc prune', 'git gc --prune=now', 'gc-prune'],
  ['prune', 'git prune', 'gc-prune'],
  ['reflog expire', 'git reflog expire --all', 'reflog-expire'],
  ['reflog delete', 'git reflog delete HEAD@{1}', 'reflog-expire'],
  ['push force', 'git push --force origin main', 'push-force'],
  ['push -f', 'git push -f', 'push-force'],
  ['push -uf', 'git push -uf origin x', 'push-force'],
  ['push force-with-lease', 'git push --force-with-lease', 'push-force'],
  ['push +ref', 'git push origin +main', 'push-force'],
  ['push "+ref" quoted', 'git push origin "+main"', 'push-force'],
  ['push mirror', 'git push --mirror', 'push-force'],
  ['config alias', 'git config alias.x "!git reset --hard"', 'config-write'],
  ['config hooksPath', 'git config core.hooksPath /dev/null', 'config-write'],
  ['config reflogExpire', 'git config gc.reflogExpire now', 'config-write'],
  ['config --unset gc', 'git config --unset gc.reflogExpireUnreachable', 'config-write'],
  ['update-ref -d pignolo', 'git update-ref -d refs/pignolo/wip/x', 'pignolo-ref'],
  ['update-ref --stdin', 'git for-each-ref --format="delete %(refname)" refs/pignolo | git update-ref --stdin', 'update-ref-stdin'],
  ['read-tree -u --reset', 'git read-tree -u --reset HEAD', 'read-tree-update'],
  ['checkout-index -f -a', 'git checkout-index -f -a', 'checkout-index-force'],
  ['rm -f', 'git rm -f a.js', 'rm-force'],
  ['git -C checkout (file or branch?)', 'git -C ../otro checkout feature', 'git-C'],
  ['git -c alias', 'git -c alias.x="reset --hard" x', 'git-config-override'],
  ['git -c hooksPath', 'git -c core.hooksPath=/dev/null commit -m x', 'git-config-override'],
  ['GIT_CONFIG env', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=x git x', 'git-env-config'],
  // H4: evasiones de la versión con regex
  ['quoted flag', 'git reset "--hard"', 'reset-hard'],
  ['single-quoted flag', "git reset '--hard'", 'reset-hard'],
  ['quoted program', '"git" reset --hard', 'reset-hard'],
  ['quoted subcommand', 'git "reset" --hard', 'reset-hard'],
  ['git.exe', 'git.exe reset --hard', 'reset-hard'],
  ['path to git', '/usr/bin/git reset --hard', 'reset-hard'],
  ['escaped letter', 'g\\it reset --hard', 'reset-hard'],
  ['--no-pager', 'git --no-pager reset --hard', 'reset-hard'],
  ['-c harmless then reset', 'git -c x=y reset --hard', 'reset-hard'],
  ['-c harmless then clean', 'git -c x=y clean -fd', 'clean'],
  ['-P stash', 'git -P stash', 'stash'],
  ['--work-tree', 'git --work-tree=. reset --hard', 'reset-hard'],
  ['GIT_DIR prefix', 'GIT_DIR=../o/.git git reset --hard', 'reset-hard'],
  ['env wrapper', 'env git reset --hard', 'reset-hard'],
  ['line continuation', 'git reset \\\n  --hard', 'reset-hard'],
  ['newline separator', 'npm test\ngit reset --hard', 'reset-hard'],
  ['chained', 'npm test && git reset --hard', 'reset-hard'],
  ['brace expansion', 'git {reset,--hard}', 'dynamic-argument'],
  // H3: comillas mezcladas
  ['dq inside sq', `echo '"'; git reset --hard; echo '"'`, 'reset-hard'],
  ['sq inside dq', `echo "it's"; git clean -fd; echo "it's"`, 'clean'],
  // H5: indirectas en bash (el código literal se evalúa; el dinámico no es verificable)
  ['bash -c', 'bash -c "git reset --hard"', 'reset-hard'],
  ['sh -c', "sh -c 'git clean -fd'", 'clean'],
  ['bash -lc', 'bash -lc "git stash"', 'stash'],
  ['bash -c dynamic', 'bash -c "$CMD"', 'hidden-code'],
  ['bash -c with an interpolated ref', 'bash -c "git reset --hard $REF"', 'reset-hard'],
  ['pwsh -c from bash', 'pwsh -c "git reset --hard"', 'reset-hard'],
  ['eval', 'eval "git reset --hard"', 'reset-hard'],
  ['eval dynamic', 'eval "$CMD"', 'hidden-code'],
  ['pipe to sh', 'echo "git reset --hard" | sh', 'hidden-code'],
  ['heredoc to bash', 'bash <<X\ngit reset --hard\nX', 'reset-hard'],
  ['variable as program', '$G reset --hard', 'dynamic-command'],
  ['variable assigned in the same command', 'G=git; $G reset --hard', 'reset-hard'],
  ['variable holding the target', 'F=.pignolo/.disabled; echo x > $F', 'protected-flag'],
  ['variable holding .git', 'G=.git; echo x > $G/HEAD', 'protected-path'],
  ['variable holding the launcher', 'L=x/hooks/launcher.js; echo {} | node "$L" toggle', 'pignolo-launcher'],
  ['xargs git', 'echo --hard | xargs git reset', 'dynamic-argument'],
  ['find -exec git', 'find . -name "*.js" -exec git checkout -- {} \\;', 'checkout-path'],
  ['node -e', 'node -e "require(\'child_process\').execSync(\'git reset --hard\')"', 'inline-code'],
  ['node -e spawning without naming git', 'node -e "require(\'child_process\').execSync(\'g\'+\'it stash\')"', 'inline-code'],
  ['python -c', 'python -c "import os; os.system(\'git stash\')"', 'inline-code'],
  ['cmd /c', 'cmd /c git reset --hard', 'reset-hard'],
  ['subst dollar', 'echo $(git stash)', 'stash'],
  ['subst backtick', 'echo `git stash`', 'stash'],
  ['subst in unquoted heredoc', 'cat <<EOF\n$(git reset --hard)\nEOF', 'reset-hard'],
  ['alias', "alias g='git reset --hard'", 'reset-hard'],
  ['unparseable with git', 'echo "x; git reset --hard', 'unparseable'],
  ['rm .git', 'rm -rf .git', 'catastrophic-delete'],
  ['write into .git', 'echo x > .git/HEAD', 'protected-path'],
  // H9: interruptor y launcher
  ['protected flag rm', 'rm .pignolo/.disabled', 'protected-flag'],
  ['protected flag backslash', "rm '.pignolo\\.disabled'", 'protected-flag'],
  ['protected flag touch', 'touch .pignolo/.disabled', 'protected-flag'],
  ['protected global flag', 'touch ~/.pignolo/disabled', 'protected-path'],
  ['protected flag redirect', 'echo x > .pignolo/.disabled', 'protected-flag'],
  ['protected flag after cd', 'cd .pignolo && touch .disabled', 'protected-flag'],
  ['protected flag via variable', 'F=.pignolo; touch $F/.disabled', 'protected-flag'],
  ['protected flag glob', 'rm .pignolo/.dis*', 'protected-flag'],
  ['protected dir removal', 'rm -r .pignolo', 'protected-flag'],
  ['protected flag trailing dot', 'touch .pignolo/.disabled.', 'protected-flag'],
  ['launcher toggle', `echo '{"hook_event_name":"UserPromptExpansion","prompt":"/pignolo:off"}' | node "C:/p/pignolo/hooks/launcher.js" toggle`, 'pignolo-launcher'],
  ['launcher with extra args', 'node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start extra', 'pignolo-launcher'],
];

const PS_BLOCK = [
  ['ps invoke-expression', 'Invoke-Expression "git reset --hard"', 'hidden-code'],
  ['ps iex', 'iex "git stash"', 'hidden-code'],
  ['ps start-process', 'Start-Process git -ArgumentList "reset --hard"', 'reset-hard'],
  ['ps call operator var', '& $g reset --hard', 'dynamic-command'],
  ['ps call operator string', '& "git" reset --hard', 'reset-hard'],
  ['ps call operator after assignment', '$x = & $g reset --hard', 'dynamic-command'],
  ['ps call Get-Command', '& (Get-Command git) reset --hard', 'dynamic-command'],
  ['ps dot-source git', '. git reset --hard', 'reset-hard'],
  ['ps pwsh -c', 'pwsh -c "git reset --hard"', 'reset-hard'],
  ['ps powershell -Command', 'powershell -Command "git reset --hard"', 'reset-hard'],
  ['ps encoded', 'powershell -EncodedCommand ZwBpAHQAIAByAGUAcwBlAHQAIAAtAC0AaABhAHIAZAA=', 'ps-encoded'],
  ['ps encoded short', 'pwsh -enc ZwBpAHQA', 'ps-encoded'],
  ['ps splat', '$a=@("reset","--hard"); git @a', 'dynamic-argument'],
  ['ps variable argument', 'git reset $h', 'dynamic-argument'],
  ['ps variable assigned in the same command', '$h="--hard"; git reset $h', 'reset-hard'],
  ['ps assignment from git', '$x = git reset --hard', 'reset-hard'],
  ['ps scriptblock', 'Invoke-Command -ScriptBlock { git reset --hard }', 'reset-hard'],
  ['ps subexpression', 'Write-Output $(git stash)', 'stash'],
  ['ps backslash is literal (H3)', 'git commit -m "C:\\"; git reset --hard; echo "x"', 'reset-hard'],
  ['ps backtick continuation', 'git reset `\n  --hard', 'reset-hard'],
  ['ps backtick inside words', 'git re`set --har`d', 'reset-hard'],
  ['ps stop-parsing', 'git --% reset --hard', 'reset-hard'],
  ['ps protected flag', 'Remove-Item .pignolo\\.disabled', 'protected-flag'],
  ['ps protected flag via Join-Path', "New-Item -Path (Join-Path .pignolo '.disabled') -Force", 'protected-flag'],
  ['ps protected flag ADS', 'Set-Content .pignolo\\.disabled::$DATA x', 'protected-flag'],
  ['ps launcher toggle', `'{}' | node "C:\\p\\pignolo\\hooks\\launcher.js" toggle`, 'pignolo-launcher'],
  ['ps GIT_CONFIG env', '$env:GIT_CONFIG_COUNT=1', 'git-env-config'],
  ['ps unparseable', 'git commit -m "a`"; git reset --hard', 'unparseable'],
];

// Recuperables por reflog y respaldo de refs: confirmación (spec §11.6).
const ASK = [
  ['push', 'git push origin feature', 'push'],
  ['push -u', 'git push -u origin feat', 'push'],
  ['branch d', 'git branch -d feature', 'branch-delete'],
  ['branch D', 'git branch -D feature', 'branch-delete'],
  ['branch -df', 'git branch -df x', 'branch-delete'],
  ['branch --delete -f', 'git branch --delete -f x', 'branch-delete'],
  ['branch --delete --force', 'git branch --delete --force x', 'branch-delete'],
  ['branch -f', 'git branch -f main HEAD~3', 'branch-force'],
  ['branch -M', 'git branch -M main', 'branch-force'],
  ['tag delete', 'git tag -d v1', 'tag-delete'],
  ['tag force', 'git tag -f v1', 'tag-force'],
  ['push delete', 'git push origin --delete feature', 'push-delete'],
  ['push :ref', 'git push origin :feature', 'push-delete'],
  ['update-ref -d branch', 'git update-ref -d refs/heads/main', 'ref-move'],
];

const BASH_ALLOW = [
  ['status', 'git status'],
  ['log', 'git log --oneline -5'],
  ['diff', 'git diff HEAD~1'],
  ['commit', 'git commit -m "feat: algo"'],
  ['commit -am', 'git commit -am "fix: -n no es opción acá"'],
  ['stash list', 'git stash list'],
  ['stash show', 'git stash show -p'],
  ['stash create', 'git stash create'],
  ['stash push labeled', 'git stash push -m "wip-pignolo-1"'],
  ['stash apply sha', 'git stash apply 3f2a9c1e'],
  ['restore staged', 'git restore --staged a.js'],
  ['restore -S', 'git restore -S a.js'],
  ['checkout branch', 'git checkout feature'],
  ['checkout -b from ref', 'git checkout -b feat main'],
  ['checkout --track', 'git checkout --track origin/feat'],
  ['switch', 'git switch -c nueva'],
  ['reset soft', 'git reset --soft HEAD~1'],
  ['reset path', 'git reset HEAD a.js'],
  ['clean dry run', 'git clean -nd'],
  ['config read alias', 'git config --get alias.co'],
  ['config user', 'git config user.name x'],
  ['git -c harmless', 'git -c color.ui=never log'],
  ['merge -n is --no-stat', 'git merge -n feature'],
  ['npm test', 'npm test'],
  ['quoted-commit-mention', 'git commit -m "no usar --no-verify ni git reset --hard"'],
  ['quoted-echo-mention', 'echo "git reset --hard es peligroso"'],
  ['show file', 'git show main:src/a.js'],
  ['log -- path', 'git log -- src/a.js'],
  // F12: -C / --git-dir con subcomandos de lectura
  ['git -C read', 'git -C ../otro status'],
  ['git -C dynamic read', 'git -C "$w" log --oneline -5'],
  ['git --git-dir read', 'git --git-dir=../o/.git log -1'],
  ['git -C add and commit', 'git -C ../otro add a.js && git -C ../otro commit -m x'],
  // H14: falsos positivos
  ['node script then mkdir and add', 'node scripts/x.js && mkdir -p dist && git add dist'],
  ['python script then add', 'python3 tools/gen.py && mkdir -p out; git add out'],
  ['cp -p then status', 'node build.js && cp -p a b && git status'],
  ['node -e without git', 'node -e "console.log(1)" && git status'],
  ['python -m pytest -c', 'python -m pytest -c setup.cfg && git diff'],
  ['bash -c without git', 'bash -c "npm test" && git status'],
  ['cmd /c without git', 'cmd /c dir && git status'],
  ['cd to toplevel', 'cd $(git rev-parse --show-toplevel)'],
  ['echo current branch', 'echo $(git branch --show-current)'],
  ['assignment from describe', 'VERSION=$(git describe --tags)'],
  ['backtick rev-parse', 'echo `git rev-parse HEAD`'],
  ['commit inside a substitution', 'echo $(git commit -m x)'],
  ['claude code commit heredoc', "git commit -m \"$(cat <<'EOF'\nfeat: algo\n\nno usar git stash ni git reset --hard\n\nCo-Authored-By: x <y@z>\nEOF\n)\""],
  ['backticks in single quotes', "git commit -m 'docs: `git stash`'"],
  ['read the flag', 'cat ~/.pignolo/disabled'],
  ['test the flag', 'test -f .pignolo/.disabled'],
  ['status skill form', `echo '{"source":"status","cwd":"D:/git/proj"}' | node "C:/Users/x/.claude/plugins/cache/pignolo/hooks/launcher.js" session-start`],
  ['grep for git words', 'grep -rn "git stash" docs'],
  ['python heredoc that edits a file', "python - <<'PY'\nimport io\ns=io.open('a.txt').read()\nio.open('a.txt','w').write(s.replace('a','b'))\nPY"],
  ['command -v in a loop', 'for c in py python3; do command -v $c; done'],
  ['node -e with an interpolated path', `node -e "const s=require('fs').readFileSync('$f','utf8')"`],
  ['bash -c with an interpolated dir', 'bash -c "cd $d && npm test"'],
  ['node -e with a JS object and a known variable', `T=abc; node -e 'x({a:"'$T'",b:1})'`],
  ['redirect under a known dir with a loop variable', 'DIR=/tmp/x; for N in a b; do awk 1 f > "$DIR/$N.md"; done'],
  ['node -e mentioning pignolo and disabled in prose', `node -e "console.log('pignolo: hooks disabled, guard on')"`],
  ['node -e with interpolated code naming the flag', `node -e "const s=require('fs').readFileSync('$P','utf8'); s.replace('.pignolo/.disabled', 'x')"`],
  ['node -e writing the flag: the toggle is not a boundary (§3.3)', "node -e \"require('fs').writeFileSync('.pignolo/'+'.disabled','')\""],
  ['redirect into the job dir', `cat > "$CLAUDE_JOB_DIR/tmp/x.txt" <<'EOF'\nhola\nEOF`],
  ['rm of a variable assigned from the job dir', 'J="$CLAUDE_JOB_DIR/tmp/a.json"; curl -s -o $J http://localhost; rm -f $J'],
];

const PS_ALLOW = [
  ['ps status', 'git status'],
  ['ps commit', 'git commit -m "feat: algo"'],
  ['ps commit with escaped newline', 'git commit -m "linea`nsegunda"'],
  ['ps restore -S', 'git restore -S a.js'],
  ['ps call node by path', '& "C:\\Program Files\\nodejs\\node.exe" -v'],
  ['ps start-process without git', 'Start-Process notepad; git status'],
  ['ps pipeline to Where-Object', 'git branch | Where-Object { $_ -match "feat" }'],
  ['ps string then git', '"$(Get-Date)"; git log -1'],
  ['ps literal string mentioning git', '$m = "git"; Write-Host $m'],
  ['ps status skill form', `'{"source":"status","cwd":"D:/proj"}' | node "C:\\Users\\x\\.claude\\plugins\\cache\\pignolo\\hooks\\launcher.js" session-start`],
  ['ps read flag', 'Get-Content .pignolo\\.disabled'],
  // F12: asignación con un CommandAst literal
  ['ps assignment from rev-parse', '$branch = git rev-parse --abbrev-ref HEAD'],
  ['ps assignment from status', '$s = git status --porcelain; if ($s) { Write-Host dirty }'],
  ['ps variable in read subcommand', 'git log -n $n --oneline'],
  ['ps redirect to $null', 'git status 2>$null'],
];

for (const [name, cmd, rule] of BASH_BLOCK) {
  test(`blocks: ${name}`, () => {
    const v = evaluate(cmd, { shell: 'bash', mode: AUTO });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify(v)}`);
    assert.strictEqual(v.rule, rule, cmd);
    assert.ok(v.alternative.length > 0, 'every block names an alternative');
  });
}

for (const [name, cmd, rule] of PS_BLOCK) {
  test(`blocks (powershell): ${name}`, () => {
    const v = evaluate(cmd, { shell: 'powershell', mode: AUTO, psTimeoutMs: PS_T });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify(v)}`);
    assert.strictEqual(v.rule, rule, cmd);
  });
}

for (const [name, cmd, rule] of ASK) {
  test(`asks: ${name}`, () => {
    const v = evaluate(cmd, { shell: 'bash' });
    assert.strictEqual(v.decision, 'ask', `${cmd} -> ${JSON.stringify(v)}`);
    assert.strictEqual(v.rule, rule);
  });
}

for (const [name, cmd] of BASH_ALLOW) {
  test(`allows: ${name}`, () => {
    const v = evaluate(cmd, { shell: 'bash', mode: AUTO });
    assert.strictEqual(v.decision, 'allow', `${cmd} -> ${JSON.stringify(v)}`);
  });
}

for (const [name, cmd] of PS_ALLOW) {
  test(`allows (powershell): ${name}`, () => {
    const v = evaluate(cmd, { shell: 'powershell', mode: AUTO, psTimeoutMs: PS_T });
    assert.strictEqual(v.decision, 'allow', `${cmd} -> ${JSON.stringify(v)}`);
  });
}

test('merge while on main asks', () => {
  assert.strictEqual(evaluate('git merge feature', { branch: 'main' }).decision, 'ask');
  assert.strictEqual(evaluate('git merge feature', { branch: 'feature-x' }).decision, 'allow');
});

test('checkout main then merge asks even without branch info', () => {
  assert.strictEqual(evaluate('git checkout main && git merge feature').decision, 'ask');
});

test('checkout of an existing file in cwd is blocked; a branch name is not', () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, 'a.js'), 'x');
  fs.mkdirSync(path.join(cwd, 'src'));
  assert.strictEqual(evaluate('git checkout a.js', { cwd }).rule, 'checkout-path');
  assert.strictEqual(evaluate('git checkout src', { cwd }).rule, 'checkout-path');
  assert.strictEqual(evaluate('git checkout feature', { cwd }).decision, 'allow');
  assert.strictEqual(evaluate('cd src && git checkout a.js', { cwd }).decision, 'allow');
});

// Protects: el conjunto catastrófico ante un fallo de parseo (G6, auditoría 3) · Breaks if:
// con la guardia encendida, un borrado catastrófico que no se pudo analizar sale ask.
test('unparseable text: fail-closed by mode; text that looks like a catastrophic delete is denied in every mode', () => {
  const cmd = 'rm -rf .g* "sin cerrar';
  for (const opts of [{}, { mode: AUTO }, { onlyCatastrophic: true }]) {
    const v = evaluate(cmd, opts);
    assert.strictEqual(v.decision, 'block', JSON.stringify(opts));
    assert.strictEqual(v.rule, 'catastrophic-delete', JSON.stringify(opts));
  }
  const ps = { shell: 'powershell', psExe: 'pignolo-no-existe-powershell.exe' };
  assert.strictEqual(evaluate('Remove-Item .git -Recurse -Force', ps).rule, 'catastrophic-delete');
  assert.strictEqual(evaluate('Get-Date', ps).decision, 'ask');
  assert.strictEqual(evaluate('echo "sin cerrar').rule, 'unparseable');
  assert.strictEqual(evaluate('echo "sin cerrar', { onlyCatastrophic: true }).decision, 'allow');
});

test('empty or non-string command is blocked (H13)', () => {
  for (const bad of ['', '   ', undefined, null, ['git', 'status'], { command: 'x' }, 42]) {
    assert.strictEqual(evaluate(bad).rule, 'invalid-input', JSON.stringify(bad));
  }
});

test('every rule in the catalog has a class, a reason, and every non-ask an alternative', () => {
  for (const [id, [cls, reason, alternative]] of Object.entries(RULES)) {
    assert.ok(['catastrophic', 'deny', 'ask', 'unverifiable'].includes(cls), id);
    assert.ok(reason, id);
    if (cls !== 'ask') assert.ok(alternative, id);
  }
});

// ---- gitCommands (R-14): el parser de la guardia expuesto a scope-gate
const { gitCommands } = require('../plugins/pignolo/lib/git-guard');

test('gitCommands: -C marks cwdChanged and sub is the first non-option word', () => {
  const r = gitCommands('git -C x merge a', { shell: 'bash' });
  assert.equal(r.length, 1);
  assert.equal(r[0].sub, 'merge');
  assert.equal(r[0].cwdChanged, true);
  assert.deepEqual(r[0].positionals, ['a']);
  const c = gitCommands('git -c core.autocrlf=false commit -F f', { shell: 'bash' });
  assert.equal(c[0].sub, 'commit');
  assert.equal(c[0].cwdChanged, false);
});

test('gitCommands: onMain is the state before the command, not the current branch', () => {
  const r = gitCommands('git checkout main && git merge a', { shell: 'bash' });
  assert.deepEqual(r.map((c) => c.sub), ['checkout', 'merge']);
  assert.equal(r[0].onMain, false);
  assert.equal(r[1].onMain, true);
  const sw = gitCommands('git switch master; git merge a', { shell: 'bash' });
  assert.equal(sw[1].onMain, true);
  const none = gitCommands('git merge a', { shell: 'bash' });
  assert.equal(none[0].onMain, false);
});

test('gitCommands: cd before git marks cwdChanged; one entry per git; non-git gives []', () => {
  const r = gitCommands('cd /tmp/x && git merge a; git log --grep merge', { shell: 'bash' });
  assert.deepEqual(r.map((c) => [c.sub, c.cwdChanged]), [['merge', true], ['log', true]]);
  assert.deepEqual(gitCommands('echo merge main', { shell: 'bash' }), []);
});

test('gitCommands: unparseable or hidden commands give null', () => {
  assert.equal(gitCommands('git merge "a', { shell: 'bash' }), null);
  assert.equal(gitCommands('$g merge a', { shell: 'bash' }), null);
  assert.equal(gitCommands('git $x', { shell: 'bash' }), null);
  assert.equal(gitCommands('', { shell: 'bash' }), null);
});

test('gitCommands: PowerShell gives the same result as Bash', () => {
  const cmd = 'git checkout main; git merge a';
  const b = gitCommands(cmd, { shell: 'bash' });
  const p = gitCommands(cmd, { shell: 'powershell', psTimeoutMs: PS_T });
  assert.deepEqual(p.map((c) => [c.sub, c.onMain, c.cwdChanged, c.positionals]), b.map((c) => [c.sub, c.onMain, c.cwdChanged, c.positionals]));
});
