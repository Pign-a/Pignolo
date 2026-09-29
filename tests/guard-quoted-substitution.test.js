'use strict';
// Sustitución de comandos dentro de un argumento entre comillas dobles de
// -c/-e/-m/--message (decisión técnica 2026-09-28). Incidentes: anthropics/claude-code
// #81273 (python -c con backticks → rm -rf /*), #84429 (backticks que desaparecen del
// texto escrito), openai/codex #12288 (git commit -m con `script/ci` lo ejecutó) y el
// propio de pignolo (node -e con backticks → rm -rf .git).
// Protects: quoted-substitution · Breaks if: el texto con backticks o $(...) dentro de
// comillas dobles de -c/-e/-m/--message pasa sin confirmación.
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const INTERACTIVE = ['default', 'acceptEdits', 'plan'];
const AUTONOMOUS = ['auto', 'bypassPermissions', 'dontAsk'];

function flagged(cmd) {
  for (const mode of INTERACTIVE) {
    const v = evaluate(cmd, { mode });
    assert.strictEqual(v.decision, 'ask', `${mode}: ${cmd} -> ${JSON.stringify(v)}`);
    assert.strictEqual(v.rule, 'quoted-substitution', `${mode}: ${cmd}`);
  }
  for (const mode of AUTONOMOUS) {
    const v = evaluate(cmd, { mode });
    assert.strictEqual(v.decision, 'block', `${mode}: ${cmd}`);
    assert.strictEqual(v.rule, 'quoted-substitution', `${mode}: ${cmd}`);
  }
}

test('backticks inside a double-quoted -c/-e/-m argument are unverifiable', () => {
  flagged('python -c "x = \'`echo hola`\'; print(x)"');
  flagged('python -c "print(\'avant `X.md` apres\')"');
  flagged('node -e "require(\'fs\').writeFileSync(\'a.md\', \'ver `script/ci`\')"');
  flagged('git commit -m "Add ci script that runs `script/ci`"');
  flagged('git tag -a v1 -m "release `notas`"');
});

test('$(...) inside a double-quoted -c/-e/-m/--message argument is unverifiable', () => {
  flagged('git commit -m "fix $(date)"');
  flagged('git commit --message "fix $(date)"');
  flagged('git commit --message="fix $(date)"');
  flagged('git commit -am "fix `date`"');
  flagged('bash -lc "echo $(id)"');
  flagged('node -e "console.log(\'$(whoami)\')"');
});

// El único $(...) que no cuenta: `cat` leyendo un heredoc con delimitador entre comillas
// (texto literal; es la forma de commit de Claude Code y una de las mitigaciones).
test('only $(cat <<\'X\' … X) with a quoted delimiter is exempt', () => {
  const quoted = "git commit -m \"$(cat <<'EOF'\nfeat: ver `script/ci`\nEOF\n)\"";
  for (const mode of [...INTERACTIVE, ...AUTONOMOUS]) assert.strictEqual(evaluate(quoted, { mode }).decision, 'allow', mode);
  flagged('git commit -m "$(cat <<EOF\nfeat: ver `script/ci`\nEOF\n)"');
  flagged('git commit -m "$(cat <<EOF\nfeat: sin sustituciones\nEOF\n)"'); // delimitador sin comillas: bash expande el cuerpo
  flagged("git commit -m \"$(cat <<'EOF'\nfeat\nEOF\n) $(date)\"");
  flagged("git commit -m \"$(cat <<'EOF' | tee x\nfeat\nEOF\n)\"");
});

test('the reason carries the hint to write the text with Write or -F', () => {
  const v = evaluate('git commit -m "runs `script/ci`"', { mode: 'default' });
  assert.match(v.alternative, /escribí el archivo o el mensaje con Write o con `-F archivo`; no pases texto con backticks por la shell/);
});

test('literal text, variables and substitutions outside -c/-e/-m are not this rule', () => {
  for (const cmd of [
    "git commit -m 'Add `script/ci`'",
    'git commit -m "fix $HOME"',
    'git commit -m "fix $((1 + 2))"',
    'git commit -m fix',
    'echo "hoy es $(date)"',
    'git log --since "$(date +%F)"',
    'python -c "print(1)"',
    'git commit -F msg.txt',
  ]) {
    const v = evaluate(cmd, { mode: 'bypassPermissions' });
    assert.notStrictEqual(v.rule, 'quoted-substitution', `${cmd} -> ${JSON.stringify(v)}`);
  }
});
