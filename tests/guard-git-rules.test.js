'use strict';
// Reglas de git del spec §11.6: deny lo no recuperable localmente o que pierde
// trabajo sin commitear; ask lo recuperable por reflog y respaldo de refs (F8, F12).
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const check = (cmd, decision, rule, opts = {}) => {
  const v = evaluate(cmd, { mode: 'bypassPermissions', ...opts });
  assert.strictEqual(v.decision, decision, `${cmd} -> ${JSON.stringify(v)}`);
  if (rule !== undefined) assert.strictEqual(v.rule, rule, cmd);
};

test('F8: not recoverable locally is denied', () => {
  check('git send-pack --force origin main', 'block', 'send-pack');
  check('git push --mirror origin', 'block', 'push-force');
  check('git push origin +main', 'block', 'push-force');
  check('git push --prune origin', 'block', 'push-force');
  check('git -c remote.origin.mirror=true push origin', 'block', 'git-config-override');
  check('git fetch -u origin +main:main', 'block', 'fetch-force-head');
  check('git fetch --update-head-ok -f origin main:main', 'block', 'fetch-force-head');
});

test('F8: --no-verify is denied in commit, merge, rebase, am, cherry-pick and push', () => {
  for (const cmd of ['git commit --no-verify -m x', 'git commit -n -m x', 'git merge --no-verify feature', 'git rebase --no-verify main',
    'git am --no-verify x.patch', 'git cherry-pick --no-verify abc123', 'git push --no-verify']) check(cmd, 'block', 'no-verify');
  check('git merge -n feature', 'allow'); // -n es --no-stat
  check('git push -n origin x', 'allow'); // -n es --dry-run
});

test('F8: ref moves recoverable by reflog ask', () => {
  check('git update-ref refs/heads/main HEAD~5', 'ask', 'ref-move');
  check('git update-ref -d refs/heads/x', 'ask', 'ref-move');
  check('git symbolic-ref HEAD refs/heads/other', 'ask', 'ref-move');
  check('git checkout -B main HEAD~3', 'ask', 'ref-move');
  check('git switch -C main HEAD~3', 'ask', 'ref-move');
  check('git fetch origin +main:main', 'ask', 'ref-move');
  check('git fetch -f origin main:main', 'ask', 'ref-move');
  check('git branch -D feature', 'ask', 'branch-delete');
  check('git branch -f main HEAD~1', 'ask', 'branch-force');
  check('git symbolic-ref HEAD', 'allow');
  check('git symbolic-ref --short HEAD', 'allow');
  check('git fetch origin main', 'allow');
  check('git fetch --prune', 'allow');
});

test('refs/pignolo/* (the backups) are denied', () => {
  check('git update-ref refs/pignolo/wip/x HEAD', 'block', 'pignolo-ref');
  check('git update-ref -d refs/pignolo/backup/x', 'block', 'pignolo-ref');
  check('git symbolic-ref refs/pignolo/x refs/heads/main', 'block', 'pignolo-ref');
  check('git update-ref --stdin', 'block', 'update-ref-stdin');
});

test('git config writes only keys of the allowlist; reads pass', () => {
  for (const ok of ['git config --global user.email a@b.c', 'git config user.name "A B"', 'git config core.autocrlf false',
    'git config --global --add safe.directory D:/x', 'git config pull.rebase true', 'git config set user.name x',
    'git config --list', 'git config --get-regexp alias', 'git config --get user.name', 'git config user.name',
    'git config get user.name', 'git config --show-origin --list']) check(ok, 'allow');
  for (const bad of ['git config core.editor vim', 'git config core.hooksPath x', "git config remote.origin.fetch '+refs/*:refs/*'",
    'git config alias.co checkout', 'git config --global alias.x "!sh"', 'git config gc.reflogExpire now', 'git config --edit',
    'git config set core.pager less', 'git config --unset gc.auto', 'git config --remove-section user', 'git config include.path x']) {
    check(bad, 'block', 'config-write');
  }
});

test('F12: -C / --git-dir / --work-tree pass with reads and keep the rules of the rest', () => {
  for (const ok of ['git -C ../x status', 'git -C ../x log -5', 'git -C ../x diff --stat', 'git -C ../x show HEAD',
    'git -C ../x rev-parse HEAD', 'git -C ../x branch', 'git -C ../x branch -a', 'git -C ../x stash list', 'git -C ../x worktree list',
    'git -C ../x config --get user.name', 'git --git-dir=../x/.git log -1', 'git --work-tree=. --git-dir=.git status',
    'GIT_DIR=../x/.git git log -1', 'git -C ../x add a.js', 'git -C ../x commit -m x', 'git -C "$w" status --short']) check(ok, 'allow');
  check('git -C ../x reset --hard', 'block', 'reset-hard');
  check('git -C ../x clean -fd', 'block', 'clean');
  check('git -C ../x checkout feature', 'block', 'git-C');
  check('git -C ../x checkout -b feat', 'allow');
  check('git -C ../x merge feature', 'allow');
  check('git -C ../x push', 'allow');
  check('git -C ../x push --force', 'block', 'push-force');
  check('git -C ../x push origin --delete x', 'ask', 'push-delete');
  check('git -C ../x branch -D x', 'ask', 'branch-delete');
});

test('repack keeps everything reachable from refs and reflog: allowed (declared residual)', () => {
  check('git repack -a -d', 'allow');
  check('git gc', 'allow');
  check('git gc --prune=now', 'block', 'gc-prune');
});

// Protects: programas que git ejecuta por -c, por entorno o por opción, y reflogs
// descartados (G7, G10, auditoría 3) · Breaks if: pasan en modo autónomo.
test('git runs programs from -c keys, environment variables and pack options; refs migrate --no-reflog (G7, G10)', () => {
  for (const cmd of ["git -c difftool.x.cmd='git reset --hard' difftool -y --tool=x HEAD", "git -c protocol.allow=always fetch 'ext::sh -c x'",
    "git -c help.browser=x -c browser.x.cmd='x' help -w log", "git -c gpg.format=ssh -c gpg.ssh.defaultKeyCommand='x' commit -S -m x",
    'git -c remote.origin.push=+refs/heads/*:refs/heads/* push origin', 'git -c mergetool.x.cmd=x mergetool']) {
    check(cmd, 'block', 'git-config-override');
  }
  check("GIT_ALLOW_PROTOCOL=ext git fetch 'ext::sh -c x'", 'block', 'git-env-config');
  for (const cmd of ["git fetch --upload-pack='git reset --hard; git-upload-pack' .", 'git ls-remote --upload-pack=x .',
    "git clone -u 'x' . ../copia", "git archive --remote=. --exec='x' HEAD", 'git push --receive-pack=x origin main']) {
    check(cmd, 'block', 'git-shell');
  }
  check("GIT_EDITOR='git reset --hard;' git commit", 'block', 'reset-hard');
  check("EDITOR='git reset --hard;' git commit", 'block', 'reset-hard');
  check("GIT_SEQUENCE_EDITOR='git stash;' git rebase -i HEAD~1", 'block', 'stash');
  check("GIT_EXTERNAL_DIFF='git clean -fdx;' git diff", 'block', 'clean');
  check("env GIT_SSH_COMMAND='git reset --hard;' git fetch origin", 'block', 'reset-hard');
  check("export GIT_EDITOR='git reset --hard;'; git commit", 'block', 'reset-hard');
  check('GIT_EDITOR="$X" git commit', 'block', 'hidden-code');
  check('git refs migrate --ref-format=reftable --no-reflog', 'block', 'reflog-expire');
  for (const cmd of ['GIT_EDITOR=true git rebase --continue', "GIT_SEQUENCE_EDITOR=\"sed -i 's/^pick/squash/'\" git rebase -i HEAD~3",
    'EDITOR=vim git commit', 'git refs migrate --ref-format=reftable', 'git fetch origin', 'git clone https://example.invalid/x.git']) {
    check(cmd, 'allow');
  }
});

// Protects: git -c con claves que ejecutan programas fuera de la lista negra (M1, revisión
// final) · Breaks if: `git -c submodule.x.update='!…'` o `-c core.alternateRefsCommand=…`
// pasan: fuera de la lista corta, la clave es no verificable.
test('git -c with a key outside the short allow list is unverifiable (M1)', () => {
  for (const cmd of ["git -c submodule.x.update='!git reset --hard' submodule update", "git -c sendemail.sendmailcmd='git reset --hard' send-email x",
    "git -c core.alternateRefsCommand='rm -rf .git' fetch", 'git --config-env=core.alternateRefsCommand=X fetch', 'git -c x=y status']) {
    check(cmd, 'ask', 'git-config-unknown', { mode: 'default' });
    check(cmd, 'block', 'git-config-unknown');
  }
  for (const cmd of ['git -c core.autocrlf=false checkout feature', 'git -c user.name=x -c user.email=y commit -m z', 'git -c color.ui=never log',
    'git -c core.safecrlf=false add .', 'git -c core.quotepath=off status', 'git -c commit.gpgsign=false commit -m x']) {
    check(cmd, 'allow');
  }
  check('git -c alias.x=y x', 'block', 'git-config-override'); // la lista negra sigue siendo deny
  check('git -c x=y reset --hard', 'block', 'reset-hard', { mode: 'default' });
});

// Protects: la lista corta de git -c compara claves con puntos literales (0.2.3) · Breaks if:
// un punto sin escapar en OVERRIDE_ALLOW deja pasar una clave parecida (`diffXcontext`).
test('git -c override allow list matches literal dots only', () => {
  for (const cmd of ['git -c diffxcontext=3 diff', 'git -c i18nxxfoo=1 log', 'git -c statusxshowuntrackedfiles=no status',
    'git -c grepxlinenumber=true grep x', 'git -c packxthreads=1 log', 'git -c corexabbrev=12 log', 'git -c mergexrenames=true log']) {
    check(cmd, 'block', 'git-config-unknown');
  }
  for (const cmd of ['git -c diff.context=3 diff', 'git -c i18n.logOutputEncoding=utf-8 log', 'git -c status.showUntrackedFiles=no status',
    'git -c grep.lineNumber=true grep x', 'git -c pack.threads=1 log', 'git -c core.abbrev=12 log', 'git -c merge.renames=true log']) {
    check(cmd, 'allow');
  }
});
