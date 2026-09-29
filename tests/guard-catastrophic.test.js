'use strict';
// Conjunto catastrófico (spec §11.6): deny en todos los modos, también con
// PIGNOLO_DISABLED y con /pignolo:off. Se niega por forma, sin expandir globs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeRepo, makeTempDir, runLauncher } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const MODES = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions', 'dontAsk'];
// Plazo holgado para el parseo de PowerShell: con la suite en paralelo, los 2 s reales
// vencen de a ratos (auditoría 3, G13). El plazo real lo prueba tests/ps-ast.test.js.
const PS_T = 30000;

// [comando, shell]: borrados o movimientos de .git, ~/.pignolo, ~ o la raíz del repo,
// o con comodín o variable en la raíz, en .git o en ~/.pignolo.
const CATASTROPHIC = [
  ['rm -rf .git', 'bash'],
  ['rm -rf .gi?', 'bash'],
  ['rm -rf .g*', 'bash'],
  ['rm -rf *', 'bash'],
  ['rm -rf ./*', 'bash'],
  ['rm -rf "$X"', 'bash'],
  ['rm -rf .git/$X', 'bash'],
  ['rm -f .git/index.lock', 'bash'],
  ['rm -rf ../other/.git', 'bash'],
  ['rm -rf ~', 'bash'],
  ['rm -rf ~/.pignolo', 'bash'],
  ['rm -rf ~/.pignolo/shadow/x.git', 'bash'],
  ['rm -rf ~/*', 'bash'],
  ['rm -rf ..', 'bash'],
  ['rm -rf .', 'bash'],
  ['rm -rf /', 'bash'],
  ['rmdir .git', 'bash'],
  ['unlink .git', 'bash'],
  ['mv .git /tmp/x', 'bash'],
  ['mv * ../elsewhere/', 'bash'],
  ['find .git -delete', 'bash'],
  ['find . -name "*.tmp" -delete', 'bash'],
  ['find . -exec rm -rf {} +', 'bash'],
  ['cd "$d" && rm -rf .', 'bash'],
  ['cd "$d" && rm -rf *', 'bash'],
  ['cmd /c rd /s /q .git', 'bash'],
  ['robocopy empty . /MIR', 'bash'],
  ['sudo rm -rf .git', 'bash'],
  ['bash -c "rm -rf .g*"', 'bash'],
  ['echo x | xargs rm -rf', 'bash'],
  ['echo $(( $(rm -rf .git) ))', 'bash'],
  ['Remove-Item -Recurse -Force .gi*', 'powershell'],
  ['Remove-Item -Recurse -Force .git', 'powershell'],
  ['rm -r -fo .git', 'powershell'],
  ['Remove-Item -Recurse $dir', 'powershell'],
  ['Move-Item .git ..\\x', 'powershell'],
  ["[IO.Directory]::Delete('.git', $true)", 'powershell'],
];

const NOT_CATASTROPHIC = [
  ['rm -rf node_modules', 'bash'],
  ['rm -rf build/*', 'bash'],
  ['rm -f src/*.tmp', 'bash'],
  ['rm -rf .next test-results', 'bash'],
  ['rm -f "$CLAUDE_JOB_DIR/tmp/a.json"', 'bash'],
  ['rm -rf ~/.cache/x', 'bash'],
  ['rm -rf .claude/worktrees/x', 'bash'],
  ['mv a.txt b.txt', 'bash'],
  ['find src -name "*.tmp" -delete', 'bash'],
  ['find . -name "*.js"', 'bash'],
  ['Remove-Item -Recurse -Force node_modules', 'powershell'],
  ['Remove-Item "$env:TEMP\\x.log"', 'powershell'],
];

for (const [cmd, shell] of CATASTROPHIC) {
  test(`catastrophic in every mode: ${cmd}`, () => {
    for (const mode of MODES) {
      const v = evaluate(cmd, { shell, mode, psTimeoutMs: PS_T });
      assert.strictEqual(v.decision, 'block', `${mode}: ${JSON.stringify(v)}`);
      assert.strictEqual(v.catastrophic, true, `${mode}: ${v.rule}`);
    }
    assert.strictEqual(evaluate(cmd, { shell, onlyCatastrophic: true, psTimeoutMs: PS_T }).decision, 'block', 'con la guardia apagada');
  });
}

for (const [cmd, shell] of NOT_CATASTROPHIC) {
  test(`not catastrophic: ${cmd}`, () => {
    const v = evaluate(cmd, { shell, mode: 'bypassPermissions', psTimeoutMs: PS_T });
    assert.strictEqual(v.catastrophic, false, JSON.stringify(v));
    assert.strictEqual(v.decision, 'allow', JSON.stringify(v));
  });
}

test('the repo root is found from cwd: a glob is catastrophic at the root, not in a subdirectory', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'src'));
  assert.strictEqual(evaluate('rm -rf *', { cwd: repo }).rule, 'catastrophic-delete');
  assert.strictEqual(evaluate('rm -rf *', { cwd: path.join(repo, 'src') }).decision, 'allow');
  assert.strictEqual(evaluate('rm -rf ../*', { cwd: path.join(repo, 'src') }).rule, 'catastrophic-delete');
  assert.strictEqual(evaluate(`rm -rf "${repo.replace(/\\/g, '/')}"`, { cwd: makeTempDir() }).rule, 'catastrophic-delete');
});

// Protects: seguimiento del cd (G1, auditoría 3) · Breaks if: la guardia da por hecho
// que un cd cambió de directorio aunque pudo fallar o no correr, y evalúa lo que sigue
// en el directorio supuesto.
test('a cd that may fail or not run leaves the directory unknown: a glob or .g* after it is catastrophic', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'a.js'), 'x\n');
  for (const [cmd, shell = 'bash'] of [
    ['cd dist; rm -rf *'], ['cd dist; rm -rf .[!.]* *'], ['cd /no/existe; rm -rf .g*'], ['(cd /tmp); rm -rf .g*'],
    ['false && cd /tmp; rm -rf .g*'], ['cd /tmp | true; rm -rf .gi?'], ['cd /tmp & rm -rf .g*'], ['echo $(cd /tmp); rm -rf .g*'],
    ['env cd /tmp && rm -rf .g*'], ['pushd /tmp && popd && rm -rf *'], ['cd src\nrm -rf *'], ['cd src && (cd ..; rm -rf *)'],
    ['Set-Location dist; Remove-Item * -Recurse -Force', 'powershell'],
  ]) {
    assert.strictEqual(evaluate(cmd, { shell, cwd: repo, psTimeoutMs: PS_T }).rule, 'catastrophic-delete', cmd);
    assert.strictEqual(evaluate(cmd, { shell, cwd: repo, onlyCatastrophic: true, psTimeoutMs: PS_T }).decision, 'block', cmd);
  }
  // Tras `&&`, si lo que sigue corre es porque el cd funcionó: el directorio se conoce.
  for (const cmd of ['cd src && rm -rf *', 'cd /tmp && rm -rf .g*', 'cd src; ls', 'cd /tmp && (rm -rf *)']) {
    assert.strictEqual(evaluate(cmd, { cwd: repo, mode: 'bypassPermissions' }).decision, 'allow', cmd);
  }
  // Con el directorio desconocido, los candidatos siguen contando para las rutas literales.
  assert.strictEqual(evaluate('cd .git; echo x > config', { cwd: repo }).rule, 'protected-path');
  assert.strictEqual(evaluate('cd src; git checkout a.js', { cwd: repo }).rule, 'checkout-path');
  assert.strictEqual(evaluate(`cd ..; rm -rf ${path.basename(repo)}`, { cwd: repo }).rule, 'catastrophic-delete');
});

test('shell writes into protected paths are catastrophic (F11)', () => {
  for (const cmd of ['echo x > .git/HEAD', 'cp a ~/.gitconfig', 'touch ~/.pignolo/disabled', 'G=.git; echo x > $G/HEAD']) {
    const v = evaluate(cmd, { onlyCatastrophic: true });
    assert.strictEqual(v.decision, 'block', cmd);
    assert.strictEqual(v.rule, 'protected-path', cmd);
  }
  assert.strictEqual(evaluate('mkdir -p .claude/worktrees/x').decision, 'allow');
  assert.strictEqual(evaluate('cat .claude/settings.json').decision, 'allow');
});

// .claude/** se protege de escrituras solo por Edit/Write (§11.6); desde la shell
// solo es catastrófico borrar o mover .claude entero.
test('.claude from the shell: writing inside passes, deleting or moving .claude is catastrophic', () => {
  for (const cmd of ['mkdir -p .claude/skills/x', `echo '{}' > .claude/settings.local.json`, 'cp x .claude/agents/y.md']) {
    assert.strictEqual(evaluate(cmd, { mode: 'bypassPermissions' }).decision, 'allow', cmd);
  }
  for (const cmd of ['rm -rf .claude', 'mv .claude /tmp/x', 'rm -rf .claude/*', 'rm -rf ~/.claude']) {
    const v = evaluate(cmd, { onlyCatastrophic: true });
    assert.strictEqual(v.decision, 'block', cmd);
    assert.strictEqual(v.rule, 'catastrophic-delete', cmd);
  }
  assert.strictEqual(evaluate('rm -rf .claude/worktrees/x', { mode: 'bypassPermissions' }).decision, 'allow');
});

// Protects: ~/.claude del usuario (G5, auditoría 3) · Breaks if: desde la shell se puede
// escribir la configuración de Claude Code o el código instalado de pignolo.
test('the user ~/.claude settings and installed plugins are protected from shell writes; the rest of ~/.claude is not', () => {
  const home = makeTempDir();
  for (const cmd of [`echo '{}' > ~/.claude/settings.json`, 'cp x ~/.claude/settings.local.json',
    'touch ~/.claude/plugins/cache/pignolo/lib/git-guard.js', 'rm -f ~/.claude/plugins/installed_plugins.json',
    'rm -rf ~/.claude/plugins', 'echo x >> "$HOME/.claude/settings.json"', 'cp -t ~/.claude/plugins x.js',
    'cp x --target-directory=~/.claude/plugins/cache']) {
    assert.strictEqual(evaluate(cmd, { home, onlyCatastrophic: true }).rule, 'protected-path', cmd);
  }
  assert.strictEqual(evaluate('touch /cfg/settings.json', { home, claudeDirs: ['/cfg'] }).rule, 'protected-path', 'CLAUDE_CONFIG_DIR');
  // Leer (transcripciones, código de plugins) y escribir memoria, planes, CLAUDE_JOB_DIR,
  // skills o reglas que pide el humano pasa; `2>&1` no es escribir un archivo.
  for (const cmd of ['cat ~/.claude/projects/p/s.jsonl', 'grep -c x ~/.claude/projects/p/*.jsonl', 'ls ~/.claude/plugins',
    'cp ~/.claude/projects/p/s.jsonl /tmp/s.jsonl', 'cp ~/.claude/settings.json /tmp/settings.json',
    'echo x >> ~/.claude/projects/p/memory/MEMORY.md', `echo x > ~/.claude/plans/plan.md`, 'mkdir -p ~/.claude/skills/x',
    'echo x > ~/.claude/jobs/j/tmp/a.js', 'cd ~/.claude/plugins/cache && ls x 2>&1', 'cp .git/config /tmp/config']) {
    assert.strictEqual(evaluate(cmd, { home, mode: 'bypassPermissions' }).decision, 'allow', cmd);
  }
});

// Protects: borradores de paquetes y escritores en el lugar (G9, auditoría 3) · Breaks if:
// npx rimraf .git, sed -i/perl -pi/dd of=/tar -C sobre .git pasan.
test('package deleters and in-place writers reaching .git are catastrophic (G9)', () => {
  for (const [cmd, shell = 'bash'] of [['npx rimraf .git'], ['npx --yes rimraf@5 .git'], ['npx shx rm -rf .git'], ['npx del-cli .git'],
    ['pnpm dlx rimraf .git'], ['yarn dlx rimraf .git'], ['npm exec -- rimraf .git'], ['rimraf .git'], ['npx rimraf *'],
    ['npx rimraf .git', 'powershell']]) {
    assert.strictEqual(evaluate(cmd, { shell, onlyCatastrophic: true, psTimeoutMs: PS_T }).rule, 'catastrophic-delete', cmd);
  }
  for (const cmd of ["sed -i 's/a/b/' .git/config", "sed -i.bak -e 's/a/b/' .git/config", 'dd if=/dev/zero of=.git/index bs=1 count=1',
    "perl -pi -e 's/a/b/' .git/HEAD", 'tar -xf x.tar -C .git', 'tar xf x.tar --directory=.git', "sed -i 's/a/b/' .git/*"]) {
    assert.strictEqual(evaluate(cmd, { onlyCatastrophic: true }).rule, 'protected-path', cmd);
  }
  for (const cmd of ['npx rimraf dist', 'npx prettier --write .', "sed -i 's/a/b/' src/a.js", "sed -i 's/a/b/' \"$f\"",
    "sed -n 's/a/b/p' .git/config", "perl -pe 's/a/b/' .git/HEAD", 'tar -cf x.tar .git', 'tar -xf x.tar -C dist',
    'dd if=.git/index of=/tmp/x']) {
    assert.strictEqual(evaluate(cmd, { mode: 'bypassPermissions' }).decision, 'allow', cmd);
  }
});

// Protects: borrados desde código inline (I1, revisión final) · Breaks if: node -e/python -c
// con una API de borrado sobre .git, ~/.pignolo, ~ o la raíz pasan, o un borrado con
// destino calculado pasa sin confirmación.
test('inline interpreter code with a delete API on a protected target is catastrophic (I1)', () => {
  for (const cmd of [`node -e "require('fs').rmSync('.git',{recursive:true})"`, `python -c "import shutil; shutil.rmtree('.git')"`,
    `node -p "require('fs').rmSync('.', {recursive: true, force: true})"`, `python3 -c "import os; os.rename('.git', 'x')"`,
    `python -c "from pathlib import Path; Path('.git/index').unlink()"`, `ruby -e "FileUtils.rm_rf('.git')"`,
    `perl -e "unlink '.git/index'"`, `php -r "rmdir('.git');"`, `deno eval "Deno.removeSync('.git', {recursive: true})"`,
    `bun -e "require('fs').rmSync('~/.pignolo', {recursive: true})"`, `node -e "require('fs').rmSync(require('os').homedir(), {recursive: true})"`,
    `node -e "require('fs').rmSync('*')"`, `python -c "import shutil; shutil.rmtree('./')"`]) {
    for (const mode of MODES) assert.strictEqual(evaluate(cmd, { mode }).rule, 'catastrophic-delete', `${mode}: ${cmd}`);
    assert.strictEqual(evaluate(cmd, { onlyCatastrophic: true }).decision, 'block', `apagada: ${cmd}`);
  }
  // Destino calculado: no verificable (ask en interactivo, deny en los modos autónomos).
  for (const cmd of [`node -e "require('fs').rmSync(process.argv[1], {recursive: true})" x`, `python -c "import shutil,sys; shutil.rmtree(sys.argv[1])" x`]) {
    assert.deepStrictEqual([evaluate(cmd).decision, evaluate(cmd).rule], ['ask', 'inline-code'], cmd);
    assert.strictEqual(evaluate(cmd, { mode: 'bypassPermissions' }).decision, 'block', cmd);
    assert.strictEqual(evaluate(cmd, { onlyCatastrophic: true }).decision, 'allow', cmd);
  }
  for (const cmd of ['node -e "console.log(1)"', `node -e "require('fs').rmSync('dist', {recursive: true, force: true})"`,
    `python -c "import os; os.remove('build/out.txt')"`, `python -c "print(1)"`, `node -e "console.log('.git')"`]) {
    assert.strictEqual(evaluate(cmd, { mode: 'bypassPermissions' }).decision, 'allow', cmd);
  }
});

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

test('PIGNOLO_DISABLED=1 turns the guard off but not the catastrophic set', () => {
  const repo = makeRepo();
  assert.strictEqual(runLauncher('guard', bash('git reset --hard', repo), { PIGNOLO_DISABLED: '1' }).status, 0);
  const r = runLauncher('guard', bash('rm -rf .g*', repo), { PIGNOLO_DISABLED: '1' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /pignolo bloqueó el comando/);
  assert.ok(fs.existsSync(path.join(repo, '.git')));
});

test('/pignolo:off does not turn off the catastrophic set', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'));
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), 'x');
  assert.strictEqual(runLauncher('guard', bash('find .git -delete', repo)).status, 2);
});

test('Edit/Write protection holds in every case, also with PIGNOLO_DISABLED', () => {
  const cwd = makeTempDir();
  const home = makeTempDir();
  for (const env of [{ PIGNOLO_HOME: home }, { PIGNOLO_HOME: home, PIGNOLO_DISABLED: '1' }]) {
    for (const file_path of ['.git/config', '.git/hooks/pre-commit', 'sub/.git/HEAD', '.claude/settings.json',
      '.claude/settings.local.json', '.claude/agents/x.md', '.gitconfig', path.join(os.homedir(), '.gitconfig'),
      path.join(home, 'config.json'), path.join(home, 'shadow', 'x')]) {
      const r = protect.run({ tool_name: 'Write', tool_input: { file_path }, cwd }, { env });
      assert.strictEqual(r.exit, 2, `${file_path} ${JSON.stringify(env)}`);
    }
    for (const file_path of ['.claude/worktrees/t/src/a.js', 'src/a.js', '.github/workflows/x.yml', '.gitignore',
      path.join(os.homedir(), '.claude', 'projects', 'p', 'memory', 'MEMORY.md')]) {
      const r = protect.run({ tool_name: 'Edit', tool_input: { file_path }, cwd }, { env });
      assert.strictEqual(r.exit, 0, file_path);
    }
  }
});

// Protects: ~/.claude del usuario por Edit/Write y por la guardia (G5, auditoría 3) ·
// Breaks if: Write sobre ~/.claude/settings.json o el código instalado del plugin pasa,
// o `~` no sale del HOME/USERPROFILE del entorno del hook.
test('Edit/Write and the guard protect the user ~/.claude settings and installed plugins, not the rest of ~/.claude', () => {
  const cwd = makeTempDir();
  const other = makeTempDir();
  const cfg = makeTempDir();
  const claude = (...p) => path.join(os.homedir(), '.claude', ...p);
  for (const env of [{}, { PIGNOLO_DISABLED: '1' }]) {
    for (const file_path of [claude('settings.json'), claude('settings.local.json'),
      claude('plugins', 'cache', 'pignolo', 'pignolo', '0.1.0', 'lib', 'git-guard.js'), claude('plugins', 'installed_plugins.json'),
      '~/.claude/settings.json']) {
      assert.strictEqual(protect.run({ tool_name: 'Write', tool_input: { file_path }, cwd }, { env }).exit, 2, file_path);
    }
    for (const file_path of [claude('projects', 'p', 'memory', 'MEMORY.md'), claude('plans', 'plan.md'), claude('jobs', 'j', 'tmp', 'a.js'),
      claude('skills', 'x', 'SKILL.md'), claude('CLAUDE.md')]) {
      assert.strictEqual(protect.run({ tool_name: 'Write', tool_input: { file_path }, cwd }, { env }).exit, 0, file_path);
    }
  }
  const env = { HOME: other, USERPROFILE: other, CLAUDE_CONFIG_DIR: cfg };
  for (const file_path of ['~/.claude/settings.json', path.join(other, '.claude', 'settings.json'), path.join(cfg, 'settings.json')]) {
    assert.strictEqual(protect.run({ tool_name: 'Write', tool_input: { file_path }, cwd }, { env }).exit, 2, file_path);
  }
  const repo = makeRepo();
  const r = runLauncher('guard', { ...bash(`echo '{}' > ~/.claude/settings.json`, repo), permission_mode: 'bypassPermissions' }, { HOME: other, USERPROFILE: other, PIGNOLO_DISABLED: '1' });
  assert.strictEqual(r.status, 2, r.stdout);
  assert.match(r.stderr, /~\/\.claude\/settings\*\.json/);
});
