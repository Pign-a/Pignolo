# pignolo v1 — Hito 1: esqueleto, interruptor, launcher, guardia de git y respaldos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar instalable el plugin pignolo con su marketplace, un launcher de hooks endurecido, la guardia de git con instantáneas del trabajo sin commitear, respaldo de refs al arrancar, canario, interruptor `/pignolo:off|on` y la plantilla de permisos.

**Architecture:** El repo es a la vez marketplace (`.claude-plugin/marketplace.json` en la raíz) y contiene el plugin en `plugins/pignolo/`. Toda la lógica vive en módulos puros de `plugins/pignolo/lib/` (testeables sin Claude Code); los hooks son handlers finos en `plugins/pignolo/hooks/handlers/` que un único `launcher.js` carga y ejecuta de forma sincrónica, saliendo con 2 ante cualquier error propio. Los tests usan `node:test` sobre los módulos y lanzan el launcher como subproceso con payloads JSON reales.

**Tech Stack:** Node.js ≥ 20 (probado con 24.13.1), `node:test` + `node:assert`, git ≥ 2.38, sin dependencias npm.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` (§3.3, §8.1, §8.3, §8.4, §11.6, §15, §18 hito 1).

## Global Constraints

- Sin dependencias npm en el plugin ni en los tests (spec §2: "Scripts y hooks sin dependencias: node estándar").
- Nombres de elementos en inglés; mensajes al humano en español (idioma del autor).
- Hooks en forma exec: `"command": "node"`, `"args": ["${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js", "<handler>"]` (spec §8.3: no `shell: powershell`).
- Todo handler es sincrónico y exporta `run(input, ctx)` → `{ exit: number, stdout?: string, stderr?: string }`.
- Ante cualquier error propio, el launcher sale con código 2 (spec §8.3).
- `PIGNOLO_DISABLED=1` en el entorno del proceso apaga guardia y respaldos; `/pignolo:off` no los apaga (spec §3.3).
- Los tests nunca tocan `~/.pignolo` real: usan `PIGNOLO_HOME` apuntando a un directorio temporal.
- Windows nativo: rutas con `path.join`, git vía `execFileSync('git', args)`, sin depender de bash.
- Commits en español, Conventional Commits, con trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` y `Claude-Session: https://claude.ai/code/session_01Av32QQNcuv6JcD3c4Cqvqp`.

## Review Focus

1. **Texto entre comillas que menciona comandos peligrosos** (`git commit -m "no usar --no-verify"`, `echo "git reset --hard"`): la guardia debe dejarlos pasar; en cambio `bash -c "git reset --hard"` debe bloquearse. → Task 3 (tests `quoted-*`).
2. **Directorio que no es un repo git o git ausente**: el handler de la guardia no debe fallar ni bloquear comandos inocuos; la instantánea se saltea. → Task 5 (test `guard handler outside a repo`).
3. **Falla de la instantánea WIP** (timeout, repo enorme): la decisión de la guardia se toma igual y el motivo queda en el mensaje. → Task 5 (test `snapshot failure does not change the decision`).
4. **Rutas de Windows con barras invertidas** al proteger los flags del interruptor (`.pignolo\.disabled`): bloqueadas igual que con `/`. → Task 6 (test `protect-paths backslash`).
5. **Sintaxis de PowerShell** (`& $git reset`, `Invoke-Expression`, `Start-Process git`): bloqueadas; en PowerShell el backtick es escape y no debe disparar la regla de sustitución de bash. → Task 3 (tests `ps-*`).

---

## File Structure

```
.claude-plugin/marketplace.json            marketplace (raíz del repo)
package.json                                script de tests
plugins/pignolo/.claude-plugin/plugin.json  manifiesto del plugin
plugins/pignolo/lib/home.js                 ruta de ~/.pignolo (o PIGNOLO_HOME)
plugins/pignolo/lib/disabled.js             estado del interruptor
plugins/pignolo/lib/git.js                  helper de git (execFileSync)
plugins/pignolo/lib/git-guard.js            evaluador puro de comandos
plugins/pignolo/lib/git-backup.js           instantánea WIP, respaldo de refs, política de reflog
plugins/pignolo/hooks/launcher.js           launcher endurecido
plugins/pignolo/hooks/hooks.json            registro de hooks
plugins/pignolo/hooks/handlers/guard.js     PreToolUse Bash|PowerShell
plugins/pignolo/hooks/handlers/protect-paths.js  PreToolUse Edit|Write|MultiEdit|NotebookEdit
plugins/pignolo/hooks/handlers/toggle.js    UserPromptExpansion
plugins/pignolo/hooks/handlers/session-start.js  SessionStart (canario + respaldo)
plugins/pignolo/skills/off/SKILL.md
plugins/pignolo/skills/on/SKILL.md
plugins/pignolo/skills/status/SKILL.md
plugins/pignolo/templates/permissions.json  plantilla deny/ask
tests/helpers.js                            repo temporal, launcher como subproceso
tests/*.test.js
tests/manual/hito-1.md                      checklist interactivo
README.md, CHANGELOG.md, THIRD_PARTY_NOTICES.md
```

Nota sobre el spec: §2 ubica `skills/`, `hooks/`, etc. en la raíz del plugin; acá la raíz del plugin es `plugins/pignolo/` porque el mismo repo es el marketplace y la doc oficial documenta rutas relativas `./plugins/<nombre>` (plugin-marketplaces.md, "Write relative paths from the marketplace root").

---

### Task 1: Esqueleto del marketplace, plugin y runner de tests

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/pignolo/.claude-plugin/plugin.json`
- Create: `package.json`
- Create: `tests/helpers.js`
- Create: `tests/manifest.test.js`
- Create: `README.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces: `tests/helpers.js` exporta `makeTempDir(prefix) -> string`, `makeRepo() -> string` (repo git con un commit inicial y `user.name`/`user.email` locales), `runLauncher(handler, payload, env = {}) -> { status, stdout, stderr }`, `PLUGIN_ROOT` (ruta absoluta a `plugins/pignolo`).

- [ ] **Step 1: Escribir el test que falla**

`tests/manifest.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const REPO_ROOT = path.join(__dirname, '..');

test('marketplace lists pignolo with a relative source', () => {
  const mk = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(mk.name, 'pignolo');
  const entry = mk.plugins.find((p) => p.name === 'pignolo');
  assert.ok(entry, 'plugin entry missing');
  assert.strictEqual(entry.source, './plugins/pignolo');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, entry.source)), 'source directory missing');
});

test('plugin manifest name matches the marketplace entry', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.strictEqual(pj.name, 'pignolo');
  assert.match(pj.version, /^\d+\.\d+\.\d+$/);
  assert.strictEqual(pj.license, 'MIT');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module './helpers'`.

- [ ] **Step 3: Implementación mínima**

`tests/helpers.js`:
```js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const PLUGIN_ROOT = path.join(__dirname, '..', 'plugins', 'pignolo');
const LAUNCHER = path.join(PLUGIN_ROOT, 'hooks', 'launcher.js');

function makeTempDir(prefix = 'pignolo-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo() {
  const dir = makeTempDir('pignolo-repo-');
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'pignolo-test'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'uno\n');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'inicial'], dir);
  return dir;
}

function runLauncher(handler, payload, env = {}) {
  const home = env.PIGNOLO_HOME || makeTempDir('pignolo-home-');
  const res = spawnSync(process.execPath, [LAUNCHER, handler], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, PIGNOLO_DISABLED: '', ...env, PIGNOLO_HOME: home },
    timeout: 20000,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

module.exports = { PLUGIN_ROOT, LAUNCHER, makeTempDir, makeRepo, runLauncher, git };
```

`.claude-plugin/marketplace.json`:
```json
{
  "name": "pignolo",
  "description": "Pignolo: metodología de desarrollo con agentes para Claude Code",
  "owner": { "name": "Ignacio Agustín Miste" },
  "plugins": [
    {
      "name": "pignolo",
      "source": "./plugins/pignolo",
      "description": "Autonomía acotada, verificación real y guardia de git para desarrollo con agentes"
    }
  ]
}
```

`plugins/pignolo/.claude-plugin/plugin.json`:
```json
{
  "name": "pignolo",
  "displayName": "Pignolo",
  "version": "0.1.0",
  "description": "Metodología de desarrollo con agentes: autonomía acotada, verificación real, guardia de git",
  "author": { "name": "Ignacio Agustín Miste" },
  "repository": "https://github.com/Pign-a/Pignolo",
  "license": "MIT",
  "keywords": ["methodology", "agents", "tdd", "git-guard"]
}
```

`package.json`:
```json
{
  "name": "pignolo-repo",
  "private": true,
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\""
  }
}
```

`README.md` (contenido inicial):
```markdown
# Pignolo

Plugin de Claude Code con una metodología de desarrollo con agentes. Estado: v0.1 en construcción (hito 1 de 8).

Diseño: `docs/specs/2026-09-26-pignolo-v1-design.md`.

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo

## Tests

    npm test
```

`CHANGELOG.md`:
```markdown
# Changelog

## 0.1.0 — sin publicar

- Hito 1: esqueleto, launcher de hooks, guardia de git, instantáneas WIP, respaldo de refs, canario, interruptor y plantilla de permisos. Motivo: lecciones del proyecto de origen (`git checkout --` que borró trabajo sin commitear; stash compartido entre worktrees).
```

`THIRD_PARTY_NOTICES.md`:
```markdown
# Third-party notices

- obra/superpowers — MIT License, Copyright (c) Jesse Vincent. Las skills de pignolo que derivan de superpowers conservan este aviso. (Se incorporan desde el hito 3.)
- Gentleman-Programming/gentle-ai — MIT. Inspiración de prácticas (ODD/RDD, lentes 4R, ledger, refuter, Judgment Day); texto propio.
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/`
Expected: PASS (2 tests).
Run: `claude plugin validate .`
Expected: validación sin errores del marketplace y del plugin.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin plugins package.json tests README.md CHANGELOG.md THIRD_PARTY_NOTICES.md
git commit -m "feat: esqueleto del marketplace y del plugin pignolo con runner de tests"
```

---

### Task 2: Launcher endurecido e interruptor (estado)

**Files:**
- Create: `plugins/pignolo/lib/home.js`
- Create: `plugins/pignolo/lib/disabled.js`
- Create: `plugins/pignolo/hooks/launcher.js`
- Create: `plugins/pignolo/hooks/handlers/_echo.js` (handler de prueba, solo para tests)
- Test: `tests/launcher.test.js`, `tests/disabled.test.js`

**Interfaces:**
- Consumes: `tests/helpers.js` (`runLauncher`, `makeTempDir`, `LAUNCHER`, `PLUGIN_ROOT`).
- Produces:
  - `home.js`: `pignoloHome(env = process.env) -> string` (`env.PIGNOLO_HOME` o `~/.pignolo`).
  - `disabled.js`: `readState({ env, cwd }) -> { guardOff: boolean, hooksOff: boolean, globalFlag: boolean, projectFlag: boolean }`; `flagPaths({ env, cwd }) -> { global: string, project: string }`.
  - `launcher.js`: `node launcher.js <handler>`; lee stdin JSON; carga `handlers/<handler>.js`; exige `run()` sincrónico que devuelve `{ exit:number }`; sale con 2 ante cualquier error.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/disabled.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { readState, flagPaths } = require('../plugins/pignolo/lib/disabled');

test('everything on by default', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const s = readState({ env, cwd: makeTempDir() });
  assert.deepStrictEqual(s, { guardOff: false, hooksOff: false, globalFlag: false, projectFlag: false });
});

test('project flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(flagPaths({ env, cwd }).project, 'x');
  const s = readState({ env, cwd });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('global flag turns hooks off but not the guard', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  fs.writeFileSync(flagPaths({ env, cwd: '.' }).global, 'x');
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.hooksOff, true);
  assert.strictEqual(s.guardOff, false);
});

test('PIGNOLO_DISABLED=1 turns everything off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '1' };
  const s = readState({ env, cwd: makeTempDir() });
  assert.strictEqual(s.guardOff, true);
  assert.strictEqual(s.hooksOff, true);
});

test('PIGNOLO_DISABLED with any other value does not turn the guard off', () => {
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: 'true' };
  assert.strictEqual(readState({ env, cwd: makeTempDir() }).guardOff, false);
});
```

`tests/launcher.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runLauncher, PLUGIN_ROOT } = require('./helpers');

const HANDLERS = path.join(PLUGIN_ROOT, 'hooks', 'handlers');

function withTempHandler(name, source, fn) {
  const file = path.join(HANDLERS, `${name}.js`);
  fs.writeFileSync(file, source);
  try { return fn(); } finally { fs.rmSync(file, { force: true }); }
}

test('runs a handler and propagates its exit and stdout', () => {
  const r = runLauncher('_echo', { hello: 'mundo' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(JSON.parse(r.stdout).hello, 'mundo');
});

test('invalid JSON on stdin exits 2', () => {
  const r = runLauncher('_echo', '{no es json');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /entrada JSON inválida/);
});

test('unknown handler exits 2', () => {
  assert.strictEqual(runLauncher('no-existe', {}).status, 2);
});

test('handler name with path traversal exits 2', () => {
  assert.strictEqual(runLauncher('../launcher', {}).status, 2);
});

test('handler with a syntax error exits 2', () => {
  withTempHandler('_tmp-syntax', 'exports.run = (', () => {
    assert.strictEqual(runLauncher('_tmp-syntax', {}).status, 2);
  });
});

test('handler that throws exits 2', () => {
  withTempHandler('_tmp-throw', 'exports.run = () => { throw new Error("boom"); };', () => {
    const r = runLauncher('_tmp-throw', {});
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /boom/);
  });
});

test('async handler (returns a promise) exits 2', () => {
  withTempHandler('_tmp-async', 'exports.run = async () => ({ exit: 0 });', () => {
    assert.strictEqual(runLauncher('_tmp-async', {}).status, 2);
  });
});

test('unhandled rejection inside a handler exits 2', () => {
  withTempHandler('_tmp-rej', 'exports.run = () => { Promise.reject(new Error("tarde")); return { exit: 0 }; };', () => {
    assert.strictEqual(runLauncher('_tmp-rej', {}).status, 2);
  });
});

test('handler returning an invalid result exits 2', () => {
  withTempHandler('_tmp-bad', 'exports.run = () => ({ ok: true });', () => {
    assert.strictEqual(runLauncher('_tmp-bad', {}).status, 2);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../plugins/pignolo/lib/disabled'` y el launcher no existe (status `null`/1 en vez de 0/2).

- [ ] **Step 3: Implementación mínima**

`plugins/pignolo/lib/home.js`:
```js
'use strict';
const os = require('node:os');
const path = require('node:path');

function pignoloHome(env = process.env) {
  return env.PIGNOLO_HOME && env.PIGNOLO_HOME.trim() ? env.PIGNOLO_HOME : path.join(os.homedir(), '.pignolo');
}

module.exports = { pignoloHome };
```

`plugins/pignolo/lib/disabled.js`:
```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pignoloHome } = require('./home');

function flagPaths({ env = process.env, cwd = process.cwd() } = {}) {
  return {
    global: path.join(pignoloHome(env), 'disabled'),
    project: path.join(cwd, '.pignolo', '.disabled'),
  };
}

// guardOff solo con PIGNOLO_DISABLED=1 en el entorno del proceso (spec §3.3).
// Los flags de /pignolo:off apagan los demás hooks, nunca la guardia ni los respaldos.
function readState({ env = process.env, cwd = process.cwd() } = {}) {
  const guardOff = env.PIGNOLO_DISABLED === '1';
  const p = flagPaths({ env, cwd });
  const globalFlag = fs.existsSync(p.global);
  const projectFlag = fs.existsSync(p.project);
  return { guardOff, hooksOff: guardOff || globalFlag || projectFlag, globalFlag, projectFlag };
}

module.exports = { readState, flagPaths };
```

`plugins/pignolo/hooks/launcher.js`:
```js
'use strict';
// Launcher endurecido (spec §8.3). Todo error propio sale con 2 para que el hook
// bloquee en vez de dejar pasar. Límite declarado: si este proceso no arranca o
// supera su timeout, Claude Code NO bloquea (doc oficial de hooks).
const fs = require('node:fs');
const path = require('node:path');

function fail(msg) {
  try { process.stderr.write(`pignolo: ${msg}\n`); } catch (_) { /* nada más que hacer */ }
  process.exit(2);
}

process.on('uncaughtException', (e) => fail(`error interno del hook (${e && e.message})`));
process.on('unhandledRejection', (e) => fail(`error interno del hook (${e && e.message})`));

const name = process.argv[2];
if (!name || !/^[a-z_][a-z0-9_-]*$/.test(name)) fail('nombre de hook inválido');

let input;
try {
  const raw = fs.readFileSync(0, 'utf8');
  input = raw.trim() ? JSON.parse(raw) : {};
} catch (e) {
  fail(`entrada JSON inválida (${e.message})`);
}

let handler;
try {
  handler = require(path.join(__dirname, 'handlers', `${name}.js`));
} catch (e) {
  fail(`no se pudo cargar el hook ${name} (${e.message})`);
}
if (!handler || typeof handler.run !== 'function') fail(`el hook ${name} no exporta run()`);

let result;
try {
  result = handler.run(input, { env: process.env });
} catch (e) {
  fail(`el hook ${name} falló (${e.message})`);
}
if (!result || typeof result.then === 'function' || typeof result.exit !== 'number') {
  fail(`el hook ${name} devolvió un resultado inválido`);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
// exitCode (no exit()) para que un unhandledRejection pendiente todavía pueda forzar el 2.
process.exitCode = result.exit;
```

`plugins/pignolo/hooks/handlers/_echo.js`:
```js
'use strict';
// Handler de prueba del launcher. No se registra en hooks.json.
exports.run = (input) => ({ exit: 0, stdout: JSON.stringify(input) });
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/`
Expected: PASS (todos los de `disabled` y `launcher`).

- [ ] **Step 5: Demostrar el rojo de las defensas del launcher**

Borrar temporalmente la línea `process.on('unhandledRejection', ...)` de `launcher.js`, correr `node --test tests/launcher.test.js` y verificar que falla `unhandled rejection inside a handler exits 2`. Restaurar con el editor (NO con `git checkout`: el archivo todavía no está commiteado) y verificar verde.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/lib plugins/pignolo/hooks tests/launcher.test.js tests/disabled.test.js
git commit -m "feat: launcher de hooks endurecido y estado del interruptor"
```

---

### Task 3: Evaluador de la guardia de git

**Files:**
- Create: `plugins/pignolo/lib/git-guard.js`
- Test: `tests/git-guard.test.js`

**Interfaces:**
- Produces: `evaluate(command: string, { shell = 'bash', branch = null } = {}) -> { decision: 'allow'|'ask'|'block', rule: string|null, reason: string, alternative: string }`. Puro: no toca disco ni procesos.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/git-guard.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const BLOCK = [
  ['stash bare', 'git stash'],
  ['stash pop', 'git stash pop'],
  ['stash drop', 'git stash drop stash@{0}'],
  ['stash clear', 'git stash clear'],
  ['checkout path', 'git checkout -- src/a.js'],
  ['checkout ref path', 'git checkout main -- src/a.js'],
  ['checkout dot', 'git checkout .'],
  ['restore', 'git restore src/a.js'],
  ['restore staged+worktree', 'git restore --staged --worktree a.js'],
  ['reset hard', 'git reset --hard HEAD~1'],
  ['clean f', 'git clean -fd'],
  ['clean force', 'git clean --force'],
  ['branch D', 'git branch -D feature'],
  ['worktree remove force', 'git worktree remove --force ../wt'],
  ['worktree remove f', 'git worktree remove -f ../wt'],
  ['no-verify commit', 'git commit --no-verify -m x'],
  ['commit -n', 'git commit -n -m x'],
  ['no-verify push', 'git push --no-verify'],
  ['gc prune', 'git gc --prune=now'],
  ['reflog expire', 'git reflog expire --all'],
  ['push force', 'git push --force origin main'],
  ['push -f', 'git push -f'],
  ['push force-with-lease', 'git push --force-with-lease'],
  ['push +ref', 'git push origin +main'],
  ['config alias', 'git config alias.x "!git reset --hard"'],
  ['git -C', 'git -C ../otro status'],
  ['chained', 'npm test && git reset --hard'],
  ['bash -c', 'bash -c "git reset --hard"'],
  ['sh -c', "sh -c 'git clean -fd'"],
  ['node -e', 'node -e "require(\'child_process\').execSync(\'git reset --hard\')"'],
  ['python -c', 'python -c "import os; os.system(\'git stash\')"'],
  ['cmd /c', 'cmd /c git reset --hard'],
  ['subst dollar', 'echo $(git stash)'],
  ['subst backtick', 'echo `git stash`'],
  ['protected flag', 'rm .pignolo/.disabled'],
  ['protected flag backslash', 'del .pignolo\\.disabled'],
];

const PS_BLOCK = [
  ['ps invoke-expression', 'Invoke-Expression "git reset --hard"'],
  ['ps iex', 'iex "git stash"'],
  ['ps start-process', 'Start-Process git -ArgumentList "reset --hard"'],
  ['ps call operator var', '& $g reset --hard'],
  ['ps call operator string', '& "git" reset --hard'],
];

const ASK = [
  ['push', 'git push origin feature'],
  ['branch d', 'git branch -d feature'],
  ['tag delete', 'git tag -d v1'],
  ['push delete', 'git push origin --delete feature'],
];

const ALLOW = [
  ['status', 'git status'],
  ['log', 'git log --oneline -5'],
  ['diff', 'git diff HEAD~1'],
  ['commit', 'git commit -m "feat: algo"'],
  ['stash list', 'git stash list'],
  ['stash show', 'git stash show -p'],
  ['stash create', 'git stash create'],
  ['stash push labeled', 'git stash push -m "wip-pignolo-1"'],
  ['stash apply sha', 'git stash apply 3f2a9c1e'],
  ['restore staged', 'git restore --staged a.js'],
  ['checkout branch', 'git checkout feature'],
  ['switch', 'git switch -c nueva'],
  ['reset soft', 'git reset --soft HEAD~1'],
  ['npm test', 'npm test'],
  ['quoted-commit-mention', 'git commit -m "no usar --no-verify ni git reset --hard"'],
  ['quoted-echo-mention', 'echo "git reset --hard es peligroso"'],
  ['show file', 'git show main:src/a.js'],
];

for (const [name, cmd] of BLOCK) {
  test(`blocks: ${name}`, () => {
    const v = evaluate(cmd, { shell: 'bash' });
    assert.strictEqual(v.decision, 'block', `${cmd} -> ${JSON.stringify(v)}`);
    assert.ok(v.alternative && v.alternative.length > 0, 'every block names an alternative');
  });
}

for (const [name, cmd] of PS_BLOCK) {
  test(`blocks (powershell): ${name}`, () => {
    assert.strictEqual(evaluate(cmd, { shell: 'powershell' }).decision, 'block', cmd);
  });
}

for (const [name, cmd] of ASK) {
  test(`asks: ${name}`, () => {
    assert.strictEqual(evaluate(cmd, { shell: 'bash' }).decision, 'ask', cmd);
  });
}

for (const [name, cmd] of ALLOW) {
  test(`allows: ${name}`, () => {
    assert.strictEqual(evaluate(cmd, { shell: 'bash' }).decision, 'allow', `${cmd} -> ${JSON.stringify(evaluate(cmd))}`);
  });
}

test('merge while on main asks', () => {
  assert.strictEqual(evaluate('git merge feature', { branch: 'main' }).decision, 'ask');
  assert.strictEqual(evaluate('git merge feature', { branch: 'feature-x' }).decision, 'allow');
});

test('checkout main then merge asks even without branch info', () => {
  assert.strictEqual(evaluate('git checkout main && git merge feature').decision, 'ask');
});

test('powershell backtick is an escape, not a bash substitution', () => {
  assert.strictEqual(evaluate('git commit -m "linea`nsegunda"', { shell: 'powershell' }).decision, 'allow');
});

test('empty or non-string command is allowed', () => {
  assert.strictEqual(evaluate('').decision, 'allow');
  assert.strictEqual(evaluate(undefined).decision, 'allow');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/git-guard.test.js`
Expected: FAIL — `Cannot find module '../plugins/pignolo/lib/git-guard'`.

- [ ] **Step 3: Implementación**

`plugins/pignolo/lib/git-guard.js`:
```js
'use strict';
// Guardia de git (spec §11.6). Evaluador puro y best-effort: lee el texto del comando.
// En Windows nativo no hay sandbox; la garantía real la dan los respaldos y el reflog.

// Quita el contenido entre comillas para que un mensaje de commit o un echo que
// MENCIONA un comando peligroso no dispare las reglas directas. Las reglas
// indirectas (bash -c, node -e, cmd /c, ...) miran el texto completo.
function stripQuoted(cmd) {
  return cmd.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''");
}

const SEG = '[^;&|\\n]*'; // resto del mismo subcomando

function R(re) { return re; }

// Reglas directas: se evalúan sobre el texto sin comillas.
const DIRECT_BLOCK = [
  { rule: 'stash', re: R(new RegExp(`\\bgit\\s+stash\\b(?!\\s+(list|show|create)\\b)(?!\\s+push\\b${SEG}\\s(-m|--message)\\s)(?!\\s+apply\\s+[0-9a-f]{7,40}\\b)`, 'i')),
    reason: 'git stash sin etiqueta: el stash se comparte entre worktrees y se pierde trabajo',
    alternative: 'commiteá el trabajo (commit WIP) o usá `git stash push -m "<etiqueta>"` y aplicalo por SHA' },
  { rule: 'checkout-path', re: R(new RegExp(`\\bgit\\s+checkout\\b${SEG}\\s--(\\s|$)|\\bgit\\s+checkout\\s+\\.(\\s|$)`, 'i')),
    reason: 'git checkout con ruta sobrescribe cambios sin commitear',
    alternative: 'para ver otra versión usá `git show <ref>:<ruta>`; para descartar, commiteá primero' },
  { rule: 'restore', re: R(new RegExp(`\\bgit\\s+restore\\b(?!${SEG}--staged)|\\bgit\\s+restore\\b${SEG}(--worktree|\\s-W\\b)`, 'i')),
    reason: 'git restore sobre el árbol descarta cambios sin commitear',
    alternative: 'usá `git restore --staged <ruta>` para sacar del índice, o commiteá antes' },
  { rule: 'reset-hard', re: R(new RegExp(`\\bgit\\s+reset\\b${SEG}--hard\\b`, 'i')),
    reason: 'git reset --hard descarta cambios sin commitear',
    alternative: 'usá `git reset --soft` o `git revert`; si hace falta, commiteá WIP antes' },
  { rule: 'clean', re: R(new RegExp(`\\bgit\\s+clean\\b${SEG}(\\s-[a-z]*f|--force)`, 'i')),
    reason: 'git clean -f borra archivos sin seguimiento sin recuperación',
    alternative: 'revisá con `git clean -n` y borrá a mano lo que corresponda' },
  { rule: 'branch-force-delete', re: R(new RegExp(`\\bgit\\s+branch\\b${SEG}(\\s-D\\b|--delete${SEG}--force|\\s-d${SEG}\\s-f\\b)`)),
    reason: 'git branch -D borra una rama aunque tenga trabajo sin integrar',
    alternative: 'usá `git branch -d` (se niega si hay trabajo sin integrar) y respaldá con un tag antes' },
  { rule: 'worktree-remove-force', re: R(new RegExp(`\\bgit\\s+worktree\\s+remove\\b${SEG}(\\s-f\\b|--force)`, 'i')),
    reason: 'git worktree remove --force descarta cambios sin commitear del worktree',
    alternative: 'commiteá o respaldá el worktree y usá `git worktree remove` sin --force' },
  { rule: 'no-verify', re: R(new RegExp(`\\bgit\\b${SEG}--no-verify\\b|\\bgit\\s+commit\\b${SEG}\\s-n(\\s|$)`, 'i')),
    reason: '--no-verify saltea los hooks del repo',
    alternative: 'arreglá lo que el hook rechaza; si hay que saltearlo, es decisión del humano' },
  { rule: 'gc-prune', re: R(new RegExp(`\\bgit\\s+gc\\b${SEG}--prune`, 'i')),
    reason: 'git gc --prune elimina objetos inalcanzables (respaldos incluidos)',
    alternative: 'no hace falta podar; si es imprescindible, lo decide el humano' },
  { rule: 'reflog-expire', re: R(new RegExp(`\\bgit\\s+reflog\\s+(expire|delete)\\b`, 'i')),
    reason: 'expirar el reflog elimina la red de seguridad de commits',
    alternative: 'no se toca el reflog; es la última capa de recuperación' },
  { rule: 'push-force', re: R(new RegExp(`\\bgit\\s+push\\b${SEG}(\\s-f\\b|--force|\\s\\+\\S)`, 'i')),
    reason: 'push forzado reescribe historia remota',
    alternative: 'hacé un commit nuevo (revert o fix) y push normal' },
  { rule: 'config-alias', re: R(new RegExp(`\\bgit\\s+config\\b${SEG}\\balias\\.`, 'i')),
    reason: 'un alias de git puede esconder un comando destructivo',
    alternative: 'escribí el comando completo' },
  { rule: 'git-C', re: R(new RegExp(`\\bgit\\s+-C\\s`)),
    reason: 'git -C opera en otro directorio que la guardia no puede verificar',
    alternative: 'usá `cd <ruta> && git <comando>`' },
  { rule: 'protected-flag', re: R(/\.pignolo[\\/]+\.disabled|pignolo[\\/]+disabled\b/i),
    reason: 'los flags del interruptor solo los escribe /pignolo:off y /pignolo:on',
    alternative: 'pedile al humano que escriba /pignolo:off o /pignolo:on' },
];

// Reglas indirectas: se evalúan sobre el texto completo (con comillas).
const INDIRECT_BLOCK = [
  { rule: 'shell-c', re: /\b(bash|sh|zsh)(\.exe)?\s+-c\b[\s\S]*\bgit\b/i,
    reason: 'git dentro de otro intérprete no se puede verificar', alternative: 'ejecutá el comando git directamente' },
  { rule: 'interpreter-e', re: /\b(node|nodejs|deno|bun|python3?|py|ruby|perl)(\.exe)?\b[\s\S]*\s-(e|c|p|-eval)\b[\s\S]*\bgit\b/i,
    reason: 'git invocado desde un intérprete no se puede verificar', alternative: 'ejecutá el comando git directamente' },
  { rule: 'cmd-c', re: /\bcmd(\.exe)?\s+\/[ck]\b[\s\S]*\bgit\b/i,
    reason: 'git dentro de cmd /c no se puede verificar', alternative: 'ejecutá el comando git directamente' },
];

const BASH_ONLY_BLOCK = [
  { rule: 'substitution', re: /\$\([^)]*\bgit\b|`[^`]*\bgit\b[^`]*`/i,
    reason: 'git dentro de una sustitución de comando no se puede verificar', alternative: 'ejecutá el comando git directamente' },
];

const PS_ONLY_BLOCK = [
  { rule: 'ps-invoke-expression', re: /\b(invoke-expression|iex)\b/i,
    reason: 'Invoke-Expression ejecuta texto que la guardia no puede verificar', alternative: 'ejecutá el comando directamente' },
  { rule: 'ps-start-process-git', re: /\bstart-process\b[\s\S]*\bgit\b/i,
    reason: 'Start-Process git no se puede verificar', alternative: 'ejecutá git directamente' },
  { rule: 'ps-call-operator', re: /(^|[;\s(])&\s*(\$|["'])/,
    reason: 'el operador & con una variable o string no se puede verificar', alternative: 'ejecutá el comando por su nombre' },
  { rule: 'substitution', re: /\$\([^)]*\bgit\b/i,
    reason: 'git dentro de una sustitución no se puede verificar', alternative: 'ejecutá el comando git directamente' },
];

const ASK = [
  { rule: 'push', re: new RegExp(`\\bgit\\s+push\\b`, 'i'), reason: 'push al remoto' },
  { rule: 'branch-delete', re: new RegExp(`\\bgit\\s+branch\\b${SEG}(\\s-d\\b|--delete\\b)`, 'i'), reason: 'borrado de rama' },
  { rule: 'tag-delete', re: new RegExp(`\\bgit\\s+tag\\b${SEG}(\\s-d\\b|--delete\\b)`, 'i'), reason: 'borrado de tag' },
];

const MERGE = new RegExp(`\\bgit\\s+merge\\b`, 'i');
const SWITCH_TO_MAIN = new RegExp(`\\bgit\\s+(checkout|switch)\\s+(main|master)\\b`, 'i');

function evaluate(command, { shell = 'bash', branch = null } = {}) {
  if (typeof command !== 'string' || !command.trim()) {
    return { decision: 'allow', rule: null, reason: '', alternative: '' };
  }
  const full = command;
  const unquoted = stripQuoted(command);
  const block = (r) => ({ decision: 'block', rule: r.rule, reason: r.reason, alternative: r.alternative });

  for (const r of INDIRECT_BLOCK) if (r.re.test(full)) return block(r);
  for (const r of (shell === 'powershell' ? PS_ONLY_BLOCK : BASH_ONLY_BLOCK)) if (r.re.test(full)) return block(r);
  for (const r of DIRECT_BLOCK) if (r.re.test(unquoted)) return block(r);

  for (const r of ASK) {
    if (r.re.test(unquoted)) return { decision: 'ask', rule: r.rule, reason: `pignolo pide confirmación: ${r.reason}`, alternative: '' };
  }
  if (MERGE.test(unquoted) && (branch === 'main' || branch === 'master' || SWITCH_TO_MAIN.test(unquoted))) {
    return { decision: 'ask', rule: 'merge-main', reason: 'pignolo pide confirmación: merge sobre main', alternative: '' };
  }
  return { decision: 'allow', rule: null, reason: '', alternative: '' };
}

module.exports = { evaluate, stripQuoted };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/git-guard.test.js`
Expected: PASS. Si algún caso falla, corregir la regla (no el test) y registrar el cambio en el commit; si un caso del test resulta objetivamente mal planteado, explicarlo en el informe y consultar al revisor antes de cambiarlo.

- [ ] **Step 5: Demostrar el rojo de tres reglas**

Una por vez, sobre el archivo ya escrito (todavía sin commitear, así que restaurar con el editor):
1. Comentar la regla `reset-hard` → debe fallar `blocks: reset hard` (y seguir verde `chained`? No: `chained` también debe fallar). Restaurar.
2. Cambiar `evaluate` para usar `full` en vez de `unquoted` en `DIRECT_BLOCK` → deben fallar `allows: quoted-commit-mention` y `quoted-echo-mention`. Restaurar.
3. Quitar `ps-call-operator` → debe fallar `blocks (powershell): ps call operator var`. Restaurar.
Registrar en el informe qué falló en cada caso.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/lib/git-guard.js tests/git-guard.test.js
git commit -m "feat: evaluador de la guardia de git con reglas directas, indirectas y de PowerShell"
```

---

### Task 4: Instantánea WIP, respaldo de refs y política de reflog

**Files:**
- Create: `plugins/pignolo/lib/git.js`
- Create: `plugins/pignolo/lib/git-backup.js`
- Test: `tests/git-backup.test.js`

**Interfaces:**
- Consumes: `tests/helpers.js` (`makeRepo`, `makeTempDir`, `git`).
- Produces:
  - `git.js`: `gitRun(args: string[], cwd: string, { env, timeout = 5000 } = {}) -> string` (trim del stdout; lanza si git falla); `isRepo(cwd) -> boolean`; `currentBranch(cwd) -> string|null`.
  - `git-backup.js`:
    - `snapshotWip({ cwd, reason = 'manual', now = new Date() }) -> { ref, sha } | null` — commit huérfano con TODO el árbol de trabajo (modificados, borrados y nuevos no ignorados) bajo `refs/pignolo/wip/<stamp>-<pid>`, sin tocar índice ni árbol; `null` si no es repo o si el árbol está limpio.
    - `backupRefs({ cwd, now = new Date() }) -> { base, count } | null` — copia `refs/heads/*` y `refs/tags/*` bajo `refs/pignolo/backup/<stamp>/...`.
    - `setReflogPolicy({ cwd }) -> void` — `gc.reflogExpire=never` y `gc.reflogExpireUnreachable=never` en `.git/config` local.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/git-backup.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git } = require('./helpers');
const { snapshotWip, backupRefs, setReflogPolicy } = require('../plugins/pignolo/lib/git-backup');
const { isRepo, currentBranch } = require('../plugins/pignolo/lib/git');

test('isRepo and currentBranch', () => {
  const repo = makeRepo();
  assert.strictEqual(isRepo(repo), true);
  assert.strictEqual(isRepo(makeTempDir()), false);
  assert.strictEqual(currentBranch(repo), 'main');
});

test('clean tree produces no snapshot', () => {
  assert.strictEqual(snapshotWip({ cwd: makeRepo() }), null);
});

test('non-repo produces no snapshot', () => {
  assert.strictEqual(snapshotWip({ cwd: makeTempDir() }), null);
});

test('snapshot captures modified, deleted and untracked files without touching the tree or index', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'modificado\n');
  fs.writeFileSync(path.join(repo, 'nuevo.txt'), 'sin seguimiento\n');
  git(['add', 'nuevo.txt'], repo);
  git(['reset', '-q', 'nuevo.txt'], repo); // queda sin seguimiento, índice intacto
  const statusBefore = git(['status', '--porcelain'], repo);

  const snap = snapshotWip({ cwd: repo, reason: 'test' });
  assert.ok(snap && snap.ref.startsWith('refs/pignolo/wip/'), JSON.stringify(snap));
  assert.strictEqual(git(['status', '--porcelain'], repo), statusBefore, 'tree and index untouched');
  assert.strictEqual(git(['show', `${snap.sha}:a.txt`], repo), 'modificado');
  assert.strictEqual(git(['show', `${snap.sha}:nuevo.txt`], repo), 'sin seguimiento');
});

test('the snapshot survives a destructive command', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'trabajo valioso\n');
  const snap = snapshotWip({ cwd: repo, reason: 'antes-de-destruir' });
  git(['checkout', '--', 'a.txt'], repo); // simula el comando que la guardia no detectó
  assert.strictEqual(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8'), 'uno\n');
  assert.strictEqual(git(['show', `${snap.ref}:a.txt`], repo), 'trabajo valioso');
});

test('ignored files are not captured', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'secreto.env\n');
  git(['add', '.gitignore'], repo);
  git(['commit', '-q', '-m', 'ignore'], repo);
  fs.writeFileSync(path.join(repo, 'secreto.env'), 'CLAVE=x\n');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
  const snap = snapshotWip({ cwd: repo });
  assert.throws(() => git(['show', `${snap.sha}:secreto.env`], repo));
});

test('backupRefs copies branches and tags', () => {
  const repo = makeRepo();
  git(['branch', 'feature'], repo);
  git(['tag', 'v1'], repo);
  const b = backupRefs({ cwd: repo, now: new Date('2026-09-26T10:00:00Z') });
  assert.strictEqual(b.count, 3);
  const listed = git(['for-each-ref', '--format=%(refname)', b.base], repo).split('\n');
  assert.ok(listed.includes(`${b.base}/heads/main`));
  assert.ok(listed.includes(`${b.base}/heads/feature`));
  assert.ok(listed.includes(`${b.base}/tags/v1`));
});

test('setReflogPolicy writes never for both keys', () => {
  const repo = makeRepo();
  setReflogPolicy({ cwd: repo });
  assert.strictEqual(git(['config', '--local', 'gc.reflogExpire'], repo), 'never');
  assert.strictEqual(git(['config', '--local', 'gc.reflogExpireUnreachable'], repo), 'never');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/git-backup.test.js`
Expected: FAIL — `Cannot find module '../plugins/pignolo/lib/git-backup'`.

- [ ] **Step 3: Implementación**

`plugins/pignolo/lib/git.js`:
```js
'use strict';
const { execFileSync } = require('node:child_process');

function gitRun(args, cwd, { env = process.env, timeout = 5000 } = {}) {
  return execFileSync('git', args, {
    cwd, env, timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  }).trim();
}

function isRepo(cwd) {
  try { return gitRun(['rev-parse', '--is-inside-work-tree'], cwd) === 'true'; } catch (_) { return false; }
}

function currentBranch(cwd) {
  try {
    const b = gitRun(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    return b === 'HEAD' ? null : b;
  } catch (_) { return null; }
}

module.exports = { gitRun, isRepo, currentBranch };
```

`plugins/pignolo/lib/git-backup.js`:
```js
'use strict';
// Respaldos (spec §11.6). Los dispara un hook: son capa 3, best-effort.
const fs = require('node:fs');
const path = require('node:path');
const { gitRun, isRepo } = require('./git');

function stamp(now) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function headSha(cwd) {
  try { return gitRun(['rev-parse', '--verify', '-q', 'HEAD'], cwd); } catch (_) { return null; }
}

function snapshotWip({ cwd, reason = 'manual', now = new Date() } = {}) {
  if (!cwd || !isRepo(cwd)) return null;
  const gitDir = path.resolve(cwd, gitRun(['rev-parse', '--git-dir'], cwd));
  const tmpIndex = path.join(gitDir, `pignolo-wip-index-${process.pid}`);
  const realIndex = path.join(gitDir, 'index');
  try {
    if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tmpIndex);
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    gitRun(['add', '-A'], cwd, { env });
    const tree = gitRun(['write-tree'], cwd, { env });
    const head = headSha(cwd);
    if (head && gitRun(['rev-parse', `${head}^{tree}`], cwd) === tree) return null; // árbol limpio
    const args = ['commit-tree', tree, '-m', `pignolo wip: ${reason}`];
    if (head) args.splice(2, 0, '-p', head);
    const sha = gitRun(args, cwd, {
      env: { ...env, GIT_AUTHOR_NAME: 'pignolo', GIT_AUTHOR_EMAIL: 'pignolo@localhost',
        GIT_COMMITTER_NAME: 'pignolo', GIT_COMMITTER_EMAIL: 'pignolo@localhost' },
    });
    const ref = `refs/pignolo/wip/${stamp(now)}-${process.pid}`;
    gitRun(['update-ref', ref, sha], cwd);
    return { ref, sha };
  } finally {
    fs.rmSync(tmpIndex, { force: true });
  }
}

function backupRefs({ cwd, now = new Date() } = {}) {
  if (!cwd || !isRepo(cwd)) return null;
  const out = gitRun(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags'], cwd);
  const base = `refs/pignolo/backup/${stamp(now)}`;
  let count = 0;
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split(' ');
    gitRun(['update-ref', `${base}/${ref.replace(/^refs\//, '')}`, sha], cwd);
    count += 1;
  }
  return { base, count };
}

function setReflogPolicy({ cwd } = {}) {
  gitRun(['config', '--local', 'gc.reflogExpire', 'never'], cwd);
  gitRun(['config', '--local', 'gc.reflogExpireUnreachable', 'never'], cwd);
}

module.exports = { snapshotWip, backupRefs, setReflogPolicy };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/git-backup.test.js`
Expected: PASS.

- [ ] **Step 5: Demostrar el rojo**

Reemplazar temporalmente `gitRun(['add', '-A'], cwd, { env })` por `gitRun(['add', '-u'], cwd, { env })` → debe fallar `snapshot captures ... untracked`. Restaurar con el editor y verificar verde.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/lib/git.js plugins/pignolo/lib/git-backup.js tests/git-backup.test.js
git commit -m "feat: instantánea WIP sin tocar el árbol, respaldo de refs y política de reflog"
```

---

### Task 5: Handlers de la guardia y registro en hooks.json

**Files:**
- Create: `plugins/pignolo/hooks/handlers/guard.js`
- Create: `plugins/pignolo/hooks/handlers/protect-paths.js`
- Create: `plugins/pignolo/hooks/hooks.json`
- Test: `tests/guard-handler.test.js`, `tests/hooks-json.test.js`

**Interfaces:**
- Consumes: `evaluate` (Task 3), `snapshotWip` (Task 4), `readState`/`flagPaths` (Task 2), `currentBranch` (Task 4), `runLauncher`, `makeRepo`, `makeTempDir` (Task 1).
- Produces:
  - `guard.run(input, ctx)`: payload PreToolUse con `tool_name` `Bash`|`PowerShell` y `tool_input.command`. Salida: exit 2 + stderr para block; exit 0 + JSON `hookSpecificOutput.permissionDecision: "ask"` para ask; exit 0 vacío para allow. Opción de prueba: `ctx.snapshot` reemplaza a `snapshotWip`. Con `PIGNOLO_CANARY=1` no toma instantánea.
  - `protect-paths.run(input, ctx)`: payload PreToolUse Edit|Write|MultiEdit|NotebookEdit con `tool_input.file_path` (o `notebook_path`); exit 2 si apunta a un flag del interruptor.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/guard-handler.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runLauncher, makeRepo, makeTempDir, git } = require('./helpers');
const guard = require('../plugins/pignolo/hooks/handlers/guard');
const protect = require('../plugins/pignolo/hooks/handlers/protect-paths');

const bash = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

test('blocks a destructive command through the launcher (exit 2, alternative in stderr)', () => {
  const r = runLauncher('guard', bash('git reset --hard', makeRepo()));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Alternativa:/);
});

test('asks for push through the launcher', () => {
  const r = runLauncher('guard', bash('git push origin x', makeRepo()));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('allows a harmless command with empty output', () => {
  const r = runLauncher('guard', bash('git status', makeRepo()));
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});

test('guard handler outside a repo does not fail', () => {
  const r = runLauncher('guard', bash('ls', makeTempDir()));
  assert.strictEqual(r.status, 0);
});

test('takes a WIP snapshot before any shell command in a dirty repo', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'sin commitear\n');
  runLauncher('guard', bash('npm test', repo));
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/wip'], repo);
  assert.ok(refs.includes('refs/pignolo/wip/'), refs);
});

test('snapshot failure does not change the decision', () => {
  const failing = () => { throw new Error('timeout simulado'); };
  const r = guard.run(bash('git reset --hard', makeRepo()), { env: {}, snapshot: failing });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /instantánea WIP falló/);
  const ok = guard.run(bash('git status', makeRepo()), { env: {}, snapshot: failing });
  assert.strictEqual(ok.exit, 0);
});

test('PIGNOLO_DISABLED=1 lets everything through', () => {
  const r = runLauncher('guard', bash('git reset --hard', makeRepo()), { PIGNOLO_DISABLED: '1' });
  assert.strictEqual(r.status, 0);
});

test('/pignolo:off project flag does NOT disable the guard', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), 'x');
  assert.strictEqual(runLauncher('guard', bash('git reset --hard', repo)).status, 2);
});

test('powershell tool name uses the powershell rules', () => {
  const r = guard.run({ tool_name: 'PowerShell', tool_input: { command: 'iex "git stash"' }, cwd: makeTempDir() }, { env: {} });
  assert.strictEqual(r.exit, 2);
});

test('merge while on main asks (branch read from the repo)', () => {
  const r = runLauncher('guard', bash('git merge feature', makeRepo()));
  assert.strictEqual(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('protect-paths blocks the project flag', () => {
  const cwd = makeTempDir();
  const r = protect.run({ tool_name: 'Write', tool_input: { file_path: path.join(cwd, '.pignolo', '.disabled') }, cwd }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 2);
});

test('protect-paths backslash', () => {
  const r = protect.run({ tool_name: 'Edit', tool_input: { file_path: 'C:\\repo\\.pignolo\\.disabled' }, cwd: 'C:\\repo' }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 2);
});

test('protect-paths blocks the global flag', () => {
  const home = makeTempDir();
  const r = protect.run({ tool_name: 'Write', tool_input: { file_path: path.join(home, 'disabled') }, cwd: makeTempDir() }, { env: { PIGNOLO_HOME: home } });
  assert.strictEqual(r.exit, 2);
});

test('protect-paths allows normal files', () => {
  const r = protect.run({ tool_name: 'Write', tool_input: { file_path: 'src/a.js' }, cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 0);
});
```

`tests/hooks-json.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');

const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;

function handlersFor(event) {
  return (hooks[event] || []).flatMap((m) => m.hooks.map((h) => ({ matcher: m.matcher, ...h })));
}

test('every hook uses exec form with node and the launcher', () => {
  for (const event of Object.keys(hooks)) {
    for (const h of handlersFor(event)) {
      assert.strictEqual(h.type, 'command');
      assert.strictEqual(h.command, 'node');
      assert.strictEqual(h.args[0], '${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js');
      assert.ok(fs.existsSync(path.join(PLUGIN_ROOT, 'hooks', 'handlers', `${h.args[1]}.js`)), h.args[1]);
      assert.ok(h.timeout && h.timeout <= 15, 'explicit short timeout');
      assert.strictEqual(h.shell, undefined);
    }
  }
});

test('guard is registered for Bash and PowerShell', () => {
  const g = handlersFor('PreToolUse').find((h) => h.args[1] === 'guard');
  assert.ok(g);
  assert.ok(/Bash/.test(g.matcher) && /PowerShell/.test(g.matcher));
});

test('protect-paths is registered for file-writing tools', () => {
  const p = handlersFor('PreToolUse').find((h) => h.args[1] === 'protect-paths');
  assert.ok(p);
  for (const t of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.ok(p.matcher.includes(t), t);
});

test('the test-only _echo handler is not registered', () => {
  for (const event of Object.keys(hooks)) {
    for (const h of handlersFor(event)) assert.notStrictEqual(h.args[1], '_echo');
  }
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/guard-handler.test.js tests/hooks-json.test.js`
Expected: FAIL — handlers y `hooks.json` no existen.

- [ ] **Step 3: Implementación**

`plugins/pignolo/hooks/handlers/guard.js`:
```js
'use strict';
const { evaluate } = require('../../lib/git-guard');
const { readState } = require('../../lib/disabled');
const { snapshotWip } = require('../../lib/git-backup');
const { currentBranch } = require('../../lib/git');

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = input.cwd || process.cwd();
  if (readState({ env, cwd }).guardOff) return { exit: 0 };

  const command = (input.tool_input && input.tool_input.command) || '';
  const shell = input.tool_name === 'PowerShell' ? 'powershell' : 'bash';

  // Instantánea antes de TODO comando de shell, sin clasificar (spec §11.6).
  let note = '';
  if (env.PIGNOLO_CANARY !== '1') {
    const snapshot = ctx.snapshot || snapshotWip;
    try { snapshot({ cwd, reason: 'antes-de-comando' }); } catch (e) { note = ` (instantánea WIP falló: ${e.message})`; }
  }

  const v = evaluate(command, { shell, branch: currentBranch(cwd) });
  if (v.decision === 'block') {
    return { exit: 2, stderr: `pignolo bloqueó el comando: ${v.reason}. Alternativa: ${v.alternative}.${note}\n` };
  }
  if (v.decision === 'ask') {
    return {
      exit: 0,
      stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: v.reason + note } }),
    };
  }
  return { exit: 0 };
};
```

`plugins/pignolo/hooks/handlers/protect-paths.js`:
```js
'use strict';
const path = require('node:path');
const { readState, flagPaths } = require('../../lib/disabled');

function norm(p) {
  return path.normalize(String(p)).replace(/\\/g, '/').toLowerCase();
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const cwd = input.cwd || process.cwd();
  if (readState({ env, cwd }).guardOff) return { exit: 0 };
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  if (!target) return { exit: 0 };

  const abs = norm(path.isAbsolute(target) ? target : path.join(cwd, target));
  const flags = flagPaths({ env, cwd });
  const protectedPaths = [norm(flags.global), norm(flags.project)];
  const endsWithProjectFlag = /\/\.pignolo\/\.disabled$/.test(abs);
  if (protectedPaths.includes(abs) || endsWithProjectFlag) {
    return { exit: 2, stderr: 'pignolo bloqueó la escritura: los flags del interruptor solo los escribe /pignolo:off y /pignolo:on. Alternativa: pedile al humano que escriba el comando.\n' };
  }
  return { exit: 0 };
};
```

`plugins/pignolo/hooks/hooks.json`:
```json
{
  "description": "pignolo: guardia de git, protección del interruptor, canario y respaldo",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js", "guard"], "timeout": 10 }
        ]
      },
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js", "protect-paths"], "timeout": 5 }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/`
Expected: PASS (toda la suite).

- [ ] **Step 5: Demostrar el rojo**

1. En `guard.js`, cambiar `if (readState({ env, cwd }).guardOff)` por `if (readState({ env, cwd }).hooksOff)` → debe fallar `/pignolo:off project flag does NOT disable the guard`. Restaurar.
2. En `protect-paths.js`, quitar `.replace(/\\/g, '/')` → debe fallar `protect-paths backslash`. Restaurar.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/hooks tests/guard-handler.test.js tests/hooks-json.test.js
git commit -m "feat: hooks de guardia de git e instantánea previa a cada comando de shell"
```

---

### Task 6: Interruptor `/pignolo:off` y `/pignolo:on`, y skill de estado

**Files:**
- Create: `plugins/pignolo/hooks/handlers/toggle.js`
- Create: `plugins/pignolo/skills/off/SKILL.md`, `plugins/pignolo/skills/on/SKILL.md`, `plugins/pignolo/skills/status/SKILL.md`
- Modify: `plugins/pignolo/hooks/hooks.json` (agregar `UserPromptExpansion`)
- Test: `tests/toggle.test.js`

**Interfaces:**
- Consumes: `flagPaths`, `readState` (Task 2); `pignoloHome` (Task 2).
- Produces: `toggle.run(input, ctx)` para `UserPromptExpansion` con `command_name` `pignolo:off|pignolo:on` (o `off|on` con `command_source: "plugin"`); `command_args` que contenga `global` elige el flag global; si no, el del proyecto. Escribe/borra el flag, crea `.pignolo/.gitignore` con `.disabled` si falta, y devuelve JSON con `systemMessage` y `hookSpecificOutput.additionalContext`.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/toggle.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir, runLauncher } = require('./helpers');
const toggle = require('../plugins/pignolo/hooks/handlers/toggle');
const { readState } = require('../plugins/pignolo/lib/disabled');

const exp = (command_name, cwd, command_args = '', command_source = 'plugin') => ({
  hook_event_name: 'UserPromptExpansion', expansion_type: 'slash_command', command_name, command_args, command_source, cwd,
});

test('off then on (project scope)', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  toggle.run(exp('pignolo:off', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, true);
  assert.strictEqual(fs.readFileSync(path.join(cwd, '.pignolo', '.gitignore'), 'utf8').trim(), '.disabled');
  toggle.run(exp('pignolo:on', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('off global', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  toggle.run(exp('pignolo:off', makeTempDir(), 'global'), { env });
  assert.strictEqual(readState({ env, cwd: makeTempDir() }).globalFlag, true);
});

test('bare off from this plugin works', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  toggle.run(exp('off', cwd), { env });
  assert.strictEqual(readState({ env, cwd }).projectFlag, true);
});

test('bare off from a non-plugin source is ignored', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  const r = toggle.run(exp('off', cwd, '', 'userSettings'), { env });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(readState({ env, cwd }).projectFlag, false);
});

test('other commands are ignored', () => {
  const env = { PIGNOLO_HOME: makeTempDir() };
  const cwd = makeTempDir();
  assert.deepStrictEqual(toggle.run(exp('review', cwd), { env }), { exit: 0 });
});

test('the message tells the user the guard stays on', () => {
  const r = runLauncher('toggle', exp('pignolo:off', makeTempDir()));
  assert.strictEqual(r.status, 0);
  assert.match(JSON.parse(r.stdout).systemMessage, /guardia de git y los respaldos siguen activos/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/toggle.test.js`
Expected: FAIL — `Cannot find module '../plugins/pignolo/hooks/handlers/toggle'`.

- [ ] **Step 3: Implementación**

`plugins/pignolo/hooks/handlers/toggle.js`:
```js
'use strict';
// Solo se dispara cuando el HUMANO escribe el comando (UserPromptExpansion no lo alcanza el modelo).
const fs = require('node:fs');
const path = require('node:path');
const { flagPaths } = require('../../lib/disabled');

function kind(input) {
  const name = String(input.command_name || '');
  const fromPlugin = input.command_source === 'plugin';
  if (name === 'pignolo:off' || (name === 'off' && fromPlugin)) return 'off';
  if (name === 'pignolo:on' || (name === 'on' && fromPlugin)) return 'on';
  return null;
}

exports.run = (input, ctx = {}) => {
  const env = ctx.env || process.env;
  const k = kind(input);
  if (!k) return { exit: 0 };
  const cwd = input.cwd || process.cwd();
  const scope = /\bglobal\b/i.test(String(input.command_args || '')) ? 'global' : 'project';
  const file = flagPaths({ env, cwd })[scope];

  if (k === 'off') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${new Date().toISOString()}\n`);
    if (scope === 'project') {
      const gi = path.join(cwd, '.pignolo', '.gitignore');
      if (!fs.existsSync(gi)) fs.writeFileSync(gi, '.disabled\n');
    }
  } else {
    fs.rmSync(file, { force: true });
  }

  const msg = k === 'off'
    ? `pignolo apagado (${scope === 'global' ? 'en toda la cuenta' : 'en este proyecto'}). La guardia de git y los respaldos siguen activos; para apagarlos hay que arrancar Claude Code con PIGNOLO_DISABLED=1.`
    : `pignolo encendido (${scope === 'global' ? 'en toda la cuenta' : 'en este proyecto'}).`;
  return {
    exit: 0,
    stdout: JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'UserPromptExpansion', additionalContext: msg } }),
  };
};
```

`plugins/pignolo/skills/off/SKILL.md`:
```markdown
---
name: off
description: Turn pignolo hooks off for this project (or the whole account with "global"). The git guard and backups stay on.
disable-model-invocation: true
---

The pignolo hook already changed the state before this prompt reached you. Tell the user, in one line and in their language, what the hook reported (it is in your context). Do not create, edit or delete any `.pignolo/.disabled` or `~/.pignolo/disabled` file yourself.
```

`plugins/pignolo/skills/on/SKILL.md`:
```markdown
---
name: on
description: Turn pignolo hooks back on for this project (or the whole account with "global").
disable-model-invocation: true
---

The pignolo hook already changed the state before this prompt reached you. Tell the user, in one line and in their language, what the hook reported (it is in your context). Do not create, edit or delete any pignolo flag file yourself.
```

`plugins/pignolo/skills/status/SKILL.md`:
```markdown
---
name: status
description: Show whether pignolo is on, whether the git guard is active, the plugin version and the result of the guard canary.
disable-model-invocation: true
---

Report pignolo's status to the user in their language:
1. Run `node "${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js" session-start` with stdin `{"source":"status","cwd":"<current directory>"}` and relay its message verbatim.
2. Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` and report the `version`.
Do not change any state.
```

Modify `plugins/pignolo/hooks/hooks.json` — agregar al objeto `hooks`:
```json
    "UserPromptExpansion": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js", "toggle"], "timeout": 5 }
        ]
      }
    ]
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Demostrar el rojo**

En `toggle.js`, cambiar `(name === 'off' && fromPlugin)` por `name === 'off'` → debe fallar `bare off from a non-plugin source is ignored`. Restaurar.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/hooks plugins/pignolo/skills tests/toggle.test.js
git commit -m "feat: interruptor /pignolo:off y /pignolo:on que no apaga la guardia"
```

---

### Task 7: SessionStart — canario, estado y respaldo de refs

**Files:**
- Create: `plugins/pignolo/hooks/handlers/session-start.js`
- Modify: `plugins/pignolo/hooks/hooks.json` (agregar `SessionStart`)
- Test: `tests/session-start.test.js`

**Interfaces:**
- Consumes: `readState` (Task 2), `backupRefs` (Task 4), `LAUNCHER` (Task 1).
- Produces: `sessionStart.run(input, ctx)`. Canario: lanza el launcher con el handler `guard`, un comando plantado (`git reset --hard HEAD`) y `PIGNOLO_CANARY=1`; espera exit 2. Opción de prueba: `ctx.canaryHandler` (nombre de handler a usar en lugar de `guard`). Con `source === 'startup'` y la guardia activa, respalda refs. Salida: exit 0 y JSON `{ systemMessage, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }` cuando hay algo que decir; vacío si todo está bien y no hubo respaldo.

- [ ] **Step 1: Escribir los tests que fallan**

`tests/session-start.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, git, PLUGIN_ROOT, runLauncher } = require('./helpers');
const ss = require('../plugins/pignolo/hooks/handlers/session-start');

test('healthy guard: no canary warning; startup backs up refs', () => {
  const repo = makeRepo();
  const r = ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 0);
  const out = JSON.parse(r.stdout);
  assert.doesNotMatch(out.systemMessage, /guardia de git NO/);
  assert.match(out.systemMessage, /respaldo de \d+ refs/);
  assert.ok(git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/backup'], repo).length > 0);
});

test('broken guard is reported by the canary', () => {
  const file = path.join(PLUGIN_ROOT, 'hooks', 'handlers', '_tmp-broken-guard.js');
  fs.writeFileSync(file, 'exports.run = () => ({ exit: 0 });');
  try {
    const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() }, canaryHandler: '_tmp-broken-guard' });
    assert.match(JSON.parse(r.stdout).systemMessage, /guardia de git NO bloqueó/);
  } finally { fs.rmSync(file, { force: true }); }
});

test('PIGNOLO_DISABLED=1 is reported in red and no backup is taken', () => {
  const repo = makeRepo();
  const r = ss.run({ source: 'startup', cwd: repo }, { env: { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '1' } });
  assert.match(JSON.parse(r.stdout).systemMessage, /PIGNOLO_DISABLED=1/);
  assert.strictEqual(git(['for-each-ref', '--format=%(refname)', 'refs/pignolo/backup'], repo), '');
});

test('/pignolo:off is reported, guard still on', () => {
  const cwd = makeTempDir();
  fs.mkdirSync(path.join(cwd, '.pignolo'));
  fs.writeFileSync(path.join(cwd, '.pignolo', '.disabled'), 'x');
  const r = ss.run({ source: 'resume', cwd }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.match(JSON.parse(r.stdout).systemMessage, /apagado.*siguen activos/);
});

test('resume in a healthy state outside a repo prints nothing', () => {
  const r = ss.run({ source: 'resume', cwd: makeTempDir() }, { env: { PIGNOLO_HOME: makeTempDir() } });
  assert.strictEqual(r.exit, 0);
  assert.strictEqual(r.stdout, '');
});

test('works through the launcher', () => {
  const r = runLauncher('session-start', { source: 'startup', cwd: makeRepo() });
  assert.strictEqual(r.status, 0);
  assert.ok(JSON.parse(r.stdout).systemMessage);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `node --test tests/session-start.test.js`
Expected: FAIL — `Cannot find module '../plugins/pignolo/hooks/handlers/session-start'`.

- [ ] **Step 3: Implementación**

`plugins/pignolo/hooks/handlers/session-start.js`:
```js
'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readState } = require('../../lib/disabled');
const { backupRefs } = require('../../lib/git-backup');

const LAUNCHER = path.join(__dirname, '..', 'launcher.js');

// Canario (spec §8.4): prueba de punta a punta del launcher + handler de la guardia.
// Límite declarado: no detecta si hooks.json dejó de registrar la guardia (eso lo cubre el checklist manual).
function canaryBlocks(env, cwd, handler) {
  const res = spawnSync(process.execPath, [LAUNCHER, handler], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' }, cwd }),
    encoding: 'utf8',
    env: { ...env, PIGNOLO_CANARY: '1', PIGNOLO_DISABLED: '' },
    timeout: 8000,
    windowsHide: true,
  });
  return res.status === 2;
}

exports.run = (input, ctx = {}) => {
  const env = { ...process.env, ...(ctx.env || {}) };
  const cwd = input.cwd || process.cwd();
  const st = readState({ env, cwd });
  const lines = [];

  if (!canaryBlocks(env, cwd, ctx.canaryHandler || 'guard')) {
    lines.push('⚠ pignolo: la guardia de git NO bloqueó el comando de prueba. Está caída: no confíes en ella hasta revisarla (/pignolo:status).');
  }
  if (st.guardOff) {
    lines.push('⚠ pignolo: PIGNOLO_DISABLED=1 — la guardia de git y los respaldos están APAGADOS en esta sesión.');
  } else if (st.hooksOff) {
    lines.push('pignolo: apagado con /pignolo:off. La guardia de git y los respaldos siguen activos.');
  }
  if (input.source === 'startup' && !st.guardOff) {
    try {
      const b = backupRefs({ cwd });
      if (b) lines.push(`pignolo: respaldo de ${b.count} refs en ${b.base}.`);
    } catch (e) {
      lines.push(`pignolo: no se pudo respaldar las refs (${e.message}).`);
    }
  }

  if (!lines.length) return { exit: 0, stdout: '' };
  const msg = lines.join('\n');
  return { exit: 0, stdout: JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }) };
};
```

Nota: `ctx.env` se mezcla con `process.env` para que el subproceso del canario tenga `PATH` (necesario en Windows para encontrar git).

Modify `plugins/pignolo/hooks/hooks.json` — agregar al objeto `hooks`:
```json
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/launcher.js", "session-start"], "timeout": 15 }
        ]
      }
    ]
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Demostrar el rojo**

En `session-start.js`, reemplazar `return res.status === 2;` por `return true;` → debe fallar `broken guard is reported by the canary`. Restaurar.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/hooks tests/session-start.test.js
git commit -m "feat: canario de la guardia, aviso de estado y respaldo de refs al arrancar"
```

---

### Task 8: Plantilla de permisos y checklist manual del hito

**Files:**
- Create: `plugins/pignolo/templates/permissions.json`
- Create: `tests/permissions.test.js`
- Create: `tests/manual/hito-1.md`
- Modify: `README.md` (sección "Hito 1: qué protege y qué no")

**Interfaces:**
- Consumes: `evaluate` (Task 3), para verificar coherencia entre plantilla y guardia.
- Produces: `templates/permissions.json` con `permissions.deny` y `permissions.ask` (reglas `Bash(...)` y `PowerShell(...)`), que `/pignolo:setup` (hito 2) propondrá con diff.

- [ ] **Step 1: Escribir el test que falla**

`tests/permissions.test.js`:
```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const tpl = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', 'permissions.json'), 'utf8')).permissions;

function ruleToSample(rule) {
  // "Bash(git reset --hard *)" -> "git reset --hard"
  const inner = rule.replace(/^(Bash|PowerShell)\(/, '').replace(/\)$/, '');
  return inner.replace(/\s\*$/, '').replace(/\*/g, 'x');
}

test('template has deny and ask arrays for both shells', () => {
  assert.ok(Array.isArray(tpl.deny) && tpl.deny.length > 0);
  assert.ok(Array.isArray(tpl.ask) && tpl.ask.length > 0);
  assert.ok(tpl.deny.some((r) => r.startsWith('PowerShell(')));
});

test('every deny rule is also blocked by the guard', () => {
  for (const rule of tpl.deny) {
    const sample = ruleToSample(rule);
    const shell = rule.startsWith('PowerShell(') ? 'powershell' : 'bash';
    assert.strictEqual(evaluate(sample, { shell }).decision, 'block', `${rule} -> "${sample}"`);
  }
});

test('every ask rule is asked (or blocked) by the guard', () => {
  for (const rule of tpl.ask) {
    const sample = ruleToSample(rule);
    const d = evaluate(sample).decision;
    assert.ok(d === 'ask' || d === 'block', `${rule} -> "${sample}" -> ${d}`);
  }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/permissions.test.js`
Expected: FAIL — `ENOENT ... permissions.json`.

- [ ] **Step 3: Implementación**

`plugins/pignolo/templates/permissions.json`:
```json
{
  "permissions": {
    "deny": [
      "Bash(git reset --hard *)",
      "Bash(git clean -f *)",
      "Bash(git clean -fd *)",
      "Bash(git clean --force *)",
      "Bash(git checkout -- *)",
      "Bash(git restore *)",
      "Bash(git stash pop *)",
      "Bash(git stash drop *)",
      "Bash(git stash clear *)",
      "Bash(git branch -D *)",
      "Bash(git worktree remove --force *)",
      "Bash(git push --force *)",
      "Bash(git push -f *)",
      "Bash(git push --force-with-lease *)",
      "Bash(git gc --prune *)",
      "Bash(git reflog expire *)",
      "Bash(git commit --no-verify *)",
      "Bash(git push --no-verify *)",
      "PowerShell(git reset --hard *)",
      "PowerShell(git clean -f *)",
      "PowerShell(git checkout -- *)",
      "PowerShell(git restore *)",
      "PowerShell(git stash pop *)",
      "PowerShell(git branch -D *)",
      "PowerShell(git push --force *)",
      "PowerShell(Invoke-Expression *)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git branch -d *)",
      "Bash(git tag -d *)",
      "PowerShell(git push *)",
      "PowerShell(git branch -d *)"
    ]
  }
}
```

Nota: `git restore --staged` queda cubierto por la regla `deny` `git restore *` en la plantilla (más estricta que la guardia, que lo permite). Es intencional: la plantilla es la capa autoritativa y conservadora; si el autor quiere permitirlo, lo decide en `/pignolo:setup`.

`tests/manual/hito-1.md`:
```markdown
# Checklist manual — hito 1

Correr en una sesión INTERACTIVA de Claude Code, en Windows nativo, con el plugin instalado desde el marketplace local (`/plugin marketplace add ./` en la raíz del repo, `/plugin install pignolo`). Registrar fecha, versión de Claude Code y resultado de cada punto.

1. [ ] Al arrancar aparece el mensaje de respaldo de refs (`pignolo: respaldo de N refs`) y ningún aviso de canario.
2. [ ] Pedirle a Claude "corré `git reset --hard HEAD`": el comando se bloquea y el mensaje trae una alternativa.
3. [ ] Pedirle "corré `git push`": aparece un pedido de confirmación con la etiqueta `[plugin:pignolo]`.
4. [ ] Escribir `/pignolo:off`: aparece el mensaje de apagado; existe `.pignolo/.disabled`; `git reset --hard` sigue bloqueado.
5. [ ] Pedirle a Claude que borre `.pignolo/.disabled` con Bash y con Write: ambos se bloquean.
6. [ ] Escribir `/pignolo:on`: el flag desaparece.
7. [ ] Verificar el valor real de `command_name` que recibe `UserPromptExpansion` para una skill de plugin (activar `claude --debug` y buscar el payload): anotar si es `pignolo:off` u `off`. (Afirmación clave del hito.)
8. [ ] Verificar que `systemMessage` de SessionStart y de UserPromptExpansion se muestra al usuario. (Afirmación clave del hito.)
9. [ ] Pedirle a Claude que el modelo invoque `/pignolo:off` por su cuenta: no puede (skill con `disable-model-invocation`).
10. [ ] Arrancar con `PIGNOLO_DISABLED=1`: aparece el aviso en rojo y `git reset --hard` pasa.
11. [ ] Modificar un archivo, pedirle a Claude cualquier comando de shell, y verificar que existe una ref nueva en `refs/pignolo/wip/` que contiene el cambio.
12. [ ] Renombrar temporalmente `hooks/handlers/guard.js` y arrancar: el canario avisa que la guardia está caída. Restaurar.
```

Modify `README.md` — agregar:
```markdown
## Hito 1: qué protege y qué no

- Protege (best-effort): comandos git destructivos directos e indirectos conocidos; toma una instantánea del trabajo sin commitear antes de cada comando de shell (`refs/pignolo/wip/*`) y respalda las refs al arrancar (`refs/pignolo/backup/*`).
- Declarado: en Windows nativo no hay sandbox; un hook que no arranca o vence su timeout NO bloquea. La capa autoritativa es la plantilla de permisos (`templates/permissions.json`), que `/pignolo:setup` propondrá en el hito 2.
- Borrados que no pasan por git (`rm`, `Remove-Item`, `Write`) solo quedan cubiertos por las instantáneas previas.
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test`
Expected: PASS (toda la suite).
Run: `claude plugin validate .`
Expected: sin errores.

- [ ] **Step 5: Demostrar el rojo**

Agregar temporalmente `"Bash(git status *)"` al array `deny` de la plantilla → debe fallar `every deny rule is also blocked by the guard`. Quitarlo.

- [ ] **Step 6: Commit**

```bash
git add plugins/pignolo/templates tests/permissions.test.js tests/manual README.md
git commit -m "feat: plantilla de permisos coherente con la guardia y checklist manual del hito 1"
```

---

## Cierre del hito 1

- [ ] `npm test` en verde y `claude plugin validate .` sin errores.
- [ ] Checklist manual `tests/manual/hito-1.md` completo, con los resultados de los puntos 7 y 8 anotados en el spec como afirmaciones verificadas (o corregidas).
- [ ] Actualizar `CHANGELOG.md` con lo entregado y las afirmaciones verificadas.
- [ ] Revisión del hito completo por un revisor opus (rama entera), con foco en §Review Focus.
