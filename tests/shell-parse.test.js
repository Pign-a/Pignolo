'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseBash, ParseError, mentionsGit } = require('../plugins/pignolo/lib/shell-parse');

const argvs = (cmds) => cmds.map((c) => c.words.map((w) => w.value));
const top = (cmds) => cmds.filter((c) => !c.sub);
const subs = (cmds) => cmds.filter((c) => c.sub);

test('bash: splits on ; && || | & and newline', () => {
  assert.deepStrictEqual(argvs(parseBash('a 1; b && c || d | e & f\ng')), [['a', '1'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g']]);
});

// Protects: el seguimiento del cd (G1, auditoría 3) · Breaks if: se pierde qué operador
// precede a cada comando o en qué subshell corre.
test('bash: each command records the operator before it, its subshells and whether it pipes out', () => {
  const cmds = parseBash('cd x && echo $(rm *) ; (a | b) & c');
  assert.deepStrictEqual(cmds.map((c) => [c.words[0].value, c.sep, c.scopes.length, c.pipeOut, c.async]), [
    ['cd', null, 1, false, false], ['rm', '&&', 2, false, false], ['echo', '&&', 1, false, false],
    ['a', ';', 2, true, false], ['b', '|', 2, false, false], ['c', '&', 1, false, false]]);
  assert.strictEqual(parseBash('cd x & y')[0].async, true);
});

test('bash: quotes are removed and joined into one word', () => {
  assert.deepStrictEqual(argvs(parseBash(`"git" "re"'set' '--hard'`)), [['git', 'reset', '--hard']]);
});

test('bash: a double quote inside single quotes does not open a string', () => {
  assert.deepStrictEqual(argvs(parseBash(`echo '"'; git reset --hard; echo '"'`)), [['echo', '"'], ['git', 'reset', '--hard'], ['echo', '"']]);
});

test('bash: backslash escapes and line continuation', () => {
  assert.deepStrictEqual(argvs(parseBash('g\\it reset \\\n  --hard')), [['git', 'reset', '--hard']]);
  assert.deepStrictEqual(argvs(parseBash('echo "a \\" b"')), [['echo', 'a " b']]);
});

test('bash: $(...) and backticks become separate sub commands', () => {
  const cmds = parseBash('echo $(git rev-parse HEAD) `git log -1`');
  assert.deepStrictEqual(argvs(subs(cmds)), [['git', 'rev-parse', 'HEAD'], ['git', 'log', '-1']]);
  const echo = top(cmds)[0];
  assert.strictEqual(echo.words[1].dyn, true);
});

test('bash: nested substitutions and ${var:-$(...)}', () => {
  assert.deepStrictEqual(argvs(subs(parseBash('echo $(echo $(git stash))'))), [['git', 'stash'], ['echo', '$()']]);
  assert.deepStrictEqual(argvs(subs(parseBash('echo ${X:-$(git stash)}'))), [['git', 'stash']]);
});

// Protects: sustituciones dentro de $(( )) (G3, auditoría 3) · Breaks if: el cuerpo
// aritmético se saltea entero y lo que bash ejecuta adentro no se ve.
test('bash: substitutions inside $(( )) are parsed as sub commands', () => {
  assert.deepStrictEqual(argvs(subs(parseBash('echo $(( $(rm -rf .git) ))'))), [['rm', '-rf', '.git']]);
  assert.deepStrictEqual(argvs(subs(parseBash('x=$(( `git reset --hard` + ${Y:-$(git stash)} ))'))), [['git', 'reset', '--hard'], ['git', 'stash']]);
  assert.deepStrictEqual(argvs(subs(parseBash('echo "$(( (1 + 2) * $(git stash) ))"'))), [['git', 'stash']]);
  assert.deepStrictEqual(argvs(parseBash('echo $(( (1 + 2) * $((3)) )) fin')), [['echo', '$(())', 'fin']]);
  // `$((x) )` no cierra con `))`: bash lo lee como $( (x) ), una sustitución. No verificable.
  assert.throws(() => parseBash('echo $((git stash) )'), ParseError);
});

test('bash: quoted heredoc body is data', () => {
  const cmds = parseBash("cat <<'EOF'\n$(git stash)\ngit reset --hard\nEOF\necho fin");
  assert.deepStrictEqual(argvs(cmds), [['cat'], ['echo', 'fin']]);
});

test('bash: unquoted heredoc body still runs its substitutions', () => {
  assert.deepStrictEqual(argvs(subs(parseBash('cat <<EOF\nhola $(git stash)\nEOF'))), [['git', 'stash']]);
});

test('bash: the Claude Code commit heredoc parses with the message as one dynamic word', () => {
  const cmds = parseBash("git commit -m \"$(cat <<'EOF'\nfeat: algo\n\nno usar git stash ) (\nEOF\n)\"");
  assert.deepStrictEqual(argvs(subs(cmds)), [['cat']]);
  const commit = top(cmds)[0];
  assert.deepStrictEqual(commit.words.slice(0, 3).map((w) => w.value), ['git', 'commit', '-m']);
  assert.strictEqual(commit.words[3].dyn, true);
});

test('bash: redirects are not arguments; descriptors are dropped', () => {
  const [c] = parseBash('echo hi > out.txt 2>&1');
  assert.deepStrictEqual(c.words.map((w) => w.value), ['echo', 'hi']);
  assert.deepStrictEqual(c.redirects.map((r) => [r.op, r.target.value]), [['>', 'out.txt'], ['>&', '1']]);
});

test('bash: piped input, herestring and stdin redirect are recorded', () => {
  const cmds = parseBash('echo x | sh');
  assert.strictEqual(cmds[1].pipedIn, true);
  assert.strictEqual(parseBash('bash <<< "x"')[0].stdin, 'herestring');
  assert.strictEqual(parseBash('bash < s.sh')[0].stdin, 'file');
});

test('bash: variables, brace expansion and globs are marked', () => {
  const [c] = parseBash('$G {a,b} *.js plain');
  assert.deepStrictEqual(c.words.map((w) => [w.dyn, w.glob]), [[true, false], [true, false], [false, true], [false, false]]);
});

test('bash: comments are skipped', () => {
  assert.deepStrictEqual(argvs(parseBash('git status # git reset --hard')), [['git', 'status']]);
});

test('bash: unparseable input throws ParseError', () => {
  for (const bad of ['echo "abierto', "echo 'abierto", 'echo $(git stash', 'echo `x', 'cat <<EOF\nsin fin', 'echo )']) {
    assert.throws(() => parseBash(bad), ParseError, bad);
  }
});

test('mentionsGit finds git as a program name only', () => {
  for (const yes of ['git status', 'iex "git stash"', '(Get-Command git)', 'C:\\Git\\cmd\\git.exe reset', "x='git'"]) assert.ok(mentionsGit(yes), yes);
  for (const no of ['github', '.gitignore', 'D:/git/proj', 'digit', 'git-lfs']) assert.ok(!mentionsGit(no), no);
});
