# Hito 4 del núcleo, parte 4a: sabotaje, integridad por diff, holdout, semilla, mutación y escritura por rol. Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo pueda demostrar el rojo sobre código ya commiteado sin dejar el árbol roto, detectar en el diff que un agente debilitó un test, guardar tests de aceptación donde el implementador no los vea, correr `on-done` con semilla registrada, enganchar una herramienta de mutación declarada por el humano y negar en el momento de la escritura lo que hoy solo se rechaza después.

**Arquitectura:** dos contratos en la ola 0 (`lib/test-integrity.js`, que lee el diff y devuelve debilitamientos; la clave `gates.mutation` en `project-config`). Encima, en paralelo: la compuerta y el `handback-gate` los usan (y la compuerta suma semilla y mutación), `scripts/sabotage.js` con su recuperación desde `SessionStart`, el almacén de holdout con su hook de lectura y su regla en la guardia, y `protect-paths` por rol. La ola 2 corre las pruebas de punta a punta de §15 (`sabotage`, `holdout`) y cierra.

**Stack:** Node ≥ 20 sin dependencias npm, `node:test`, git ≥ 2.31, hooks de Claude Code.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md`: §3.3 (interruptor), §8.2 (compuerta y sellos), §8.3 (hooks: escritura por rol, lectura de holdout y sellos), §9.1 (holdout, `Protects:`), §9.2 (sabotaje, integridad, semilla, mutación, `code-untested`), §9.3 (sin autorización nadie debilita un test), §9.4 (niveles), §11.6 (la guardia deja pasar `scripts/sabotage`), §15 (`sabotage`, `holdout`, tope de falsos positivos), §18 punto 4.

**Historia:** primera versión auditada por un opus independiente el 2026-09-30: `REQUEST_CHANGES` (1 crítico, 8 mayores, 5 menores, todos con evidencia medida). Esta versión los incorpora; la tabla del final dice dónde quedó cada uno.

## Alcance: por qué el hito 4 se parte en dos

Igual que el hito 3 (código determinista primero, texto y evals con costo después):

- **4a (este plan):** todo lo determinista. Termina con los tests `sabotage` y `holdout` de §15 en verde, sin evals y sin costo de tokens de agentes.
- **4b (se escribe cuando 4a esté en `main`):** la `test-card` en la plantilla de la tarjeta, las skills `daily` y `review` usando `sabotage` y la semilla, las cartas de `implementer`, `test-writer`, `review-testability` y `validator` (este último con `holdout.js run`), y las evals `agents` de `test-writer`, `implementer` ("intenta tocar un test") y `review-testability` ("test decorativo"). Las dos últimas tienen Bash: corren en WSL2, y su costo lo decide el autor.
- **Diferido con dueño:** la "repetición" de `pre-merge` (§9.4) va con la cola del hito 7, que es quien corre `pre-merge` antes de unir.

## Global Constraints

- Node ≥ 20, **sin dependencias npm**. Tests con `node:test`; la suite completa corre con `npm test`, nunca con `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits, escritos con `git commit -F <archivo>`.
- Archivos en LF y sin BOM. Nunca se pasa texto por comillas de la shell (regla 6 de `rules/core.md`): todo texto largo (parches, razones) entra por archivo.
- Comandos de test: los de `project.md` corren **con shell**, como `defaultExec` de `lib/gate.js`. En Windows `npm`/`npx` son shims `.cmd` y `spawn` sin shell da `ENOENT`/`EINVAL` (medido en la auditoría); ningún script de este plan lanza un comando de test sin shell.
- Hooks: forma exec con `node` y el launcher; `timeout` del host entre 30 y 60 s; plazo interno 3 s, que al vencer niega. **Callados en el éxito.** Cada bloqueo nombra una alternativa que funciona (`Alternativa:`).
- Interruptor (§3.3, decisión del autor): `/pignolo:off` y `PIGNOLO_DISABLED=1` apagan todos los hooks nuevos de este plan. Solo la guardia de git y los respaldos siguen activos, como hoy.
- Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js` (`tests/cleanup.test.js` falla si un test llama a `mkdtemp`/`tmpdir`). Los scripts limpian lo que crean en `os.tmpdir()`.
- Sello (§8.2): `{sha, tree-hash, comando, exit, hash del log, hora}` en `~/.pignolo/seals/<repo-id>/`. Los estados nuevos se suman a `STATUSES` de `lib/seals.js`; el `handback-gate` sigue aceptando solo `PASS` y `NO_TESTS` con razón.
- Nada de datos del proyecto del autor, personas ni credenciales en lo versionado. Fixtures sintéticos.

## Método de ejecución y economía de tests

El del hito 3 (olas, worktrees a mano desde la etiqueta del contrato, implementadores sonnet en background con brief e informe en archivo, sin revisión por tarea, una revisión final opus de `main..core/hito-4a`, una pasada de arreglos, una confirmación acotada):

- **Ola 0:** Tasks 1 y 2 en paralelo; se unen a `core/hito-4a` y se etiqueta `contract/hito-4a/v1`.
- **Ola 1:** Tasks 3 a 6 en paralelo, cada una en `git worktree add -b task/hito-4a/<NN>-<slug> <scratchpad>/wt-<NN> contract/hito-4a/v1`. Primer paso de cada una: `git merge-base --is-ancestor contract/hito-4a/v1 HEAD`; si falla, `BLOCKED`.
- **Ola 2:** Task 7 (punta a punta) y Task 8 (cierre), en serie.
- Tests primero desde el spec, de tabla, con el rojo mostrado una vez; handlers en proceso (`require(handler).run(input, ctx)`) y un solo test de humo por el launcher por hook nuevo; cada implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>`.
- **Todo test nuevo tiene que poder fallar sin la función que protege** (lo mira la revisión final). Un caso que ya pasa hoy no se escribe como test del plan.
- **Sin evals en 4a.** Costo de tokens de agentes = 0.

## Review Focus

1. **El sabotaje deja el árbol roto.** Un corte a mitad (Ctrl+C, `taskkill /F`, el plazo del Bash tool) después de aplicar el parche y antes de restaurar deja código saboteado que el siguiente commit se lleva. Capas: el hijo corre con `spawn` asíncrono y los handlers de señal matan su **árbol** y restauran; un candado en el **git-dir del worktree** (que git nunca muestra) lista los archivos, y el próximo `sabotage`, `--recover` o `SessionStart` (que recorre los worktrees del repo) los restaura. Dueña: **Task 4**; el corte real es de la **Task 7**.
2. **El sabotaje borra trabajo o miente.** Árbol sucio → se niega antes de tocar nada; la restauración nombra archivos concretos, nunca `.`. Y el rojo solo vale si **el mismo comando salió 0 sin el parche**: un test que ya fallaba no demuestra nada. Dueña: **Task 4**.
3. **Un test debilitado pasa como verde.** `it.skip`, `.only`, reintentos, aserciones borradas o snapshots regrabados. La compuerta los ve en el diff del implementer, y el `handback-gate` los ve en el del `test-writer` **antes** de que su commit pase a ser el `testRef` (si no, el debilitamiento queda dentro de la referencia y ningún diff posterior lo ve). Sin tarea, `pre-merge` compara contra la base que se le pasa, no contra `HEAD`. Dueñas: **Task 1** y **Task 3**.
4. **El holdout se ve por un camino lateral.** Por el propio `holdout.js` (`run -- cat`, `list`, `drop`), por un `Glob` con `path` en el home, un `Grep` desde la raíz o un `Get-ChildItem -Recurse`. La guardia niega `holdout.js` a todo subagente salvo el `validator`, y `private-reads` niega la lectura directa y la búsqueda recursiva que contiene el almacén. Dueña: **Task 5**; los caminos de §15 los recorre la **Task 7**.
5. **La negación por rol frena a quien no debe.** El hilo principal (sin `agent_type`) nunca recibe reglas por rol; el `test-writer` puede escribir en `.pignolo/tmp/holdout/`; la ruta se resuelve contra el worktree de la tarea, no contra el `cwd`; y sin proyecto activo no rige nada (sin `project.md`, `*test*` alcanzaría a `latest.js`). Dueña: **Task 6**.

## Rulings del plan (técnicos, registrados)

- **D-4-1: el `test-writer` sigue sin Bash** (spec §6: "se decide en el hito 4"). El flujo de 3b ya funciona así (el orquestador demuestra el rojo y commitea los tests, que pasan a ser el `testRef`), y darle Bash abriría escritura por shell fuera de `test-paths`. Se revisa si las evals de 4b muestran que no alcanza.
- **`private-reads` rige solo para subagentes, con pignolo activo en el proyecto y sin `/pignolo:off`.** La auditoría marcó que la versión "siempre activa" cambiaba el contrato del interruptor (§3.3, decisión del autor) y negaba al hilo principal en cualquier proyecto. El holdout solo existe dentro de un flujo de pignolo, que despacha subagentes, así que acotarlo no deja un hueco: el que no debe verlo es el `implementer`. Por no ser siempre activo, **no lleva canario** (daría falsa alarma con `/pignolo:off`).
- **`holdout.js` lo ejecuta solo el hilo principal o el `validator`.** Regla nueva en la guardia (`pignolo-holdout`), con la misma forma que `pignolo-run` (`lib/git-guard.js:835-854`).
- **El sabotaje entra por parche y corre el comando declarado.** `--patch <archivo>` con un diff unificado (`git apply --check` y después `git apply`); el comando es `gates.<nivel>` de `project.md` (`--gate on-edit`, por defecto `on-edit` si está declarado y si no `on-done`), leído desde `HEAD` y corrido con shell. Así no hay comillas (regla 6) y funciona con los shims de Windows.
- **El sabotaje no toca tests** (un parche en `test-paths` o `protected-test-config` se rechaza) **y exige verde previo** (el comando sin parche tiene que salir 0).
- **Candado del sabotaje en el git-dir del worktree** (`<gitdir>/pignolo-sabotage.json`, y el log al lado). Git no lo muestra ni lo commitea, y no depende de `.pignolo/.gitignore`, que no llega a los worktrees de tarea. La recuperación lo encuentra sin git: el git-dir del `cwd` y `<common>/worktrees/*/`, con la lógica de `gitCommon` de `lib/disabled.js`.
- **Semilla ofrecida:** la compuerta la elige (entero de 32 bits, o `--seed <n>`) y la pasa como `PIGNOLO_TEST_SEED`; el sello la guarda como `seedOffered`, porque pignolo no puede saber si el comando la usó. Cómo la usa el `on-done` del proyecto lo escribe `/pignolo:init` (hito 8). El type-check de tests también va dentro de `on-done`.
- **Mutación:** clave opcional `gates.mutation`. Solo en `pre-merge`, solo si `mutation: true` y el diff contra la base toca `high-risk-paths`. Sin comando → `NO_MUTATION_TOOL`; exit ≠ 0 → `MUTATION`. El umbral vive en la configuración de la herramienta, que `/pignolo:init` lista en `protected-test-config`. Las claves y variables nuevas (`gates.mutation`, `PIGNOLO_TEST_SEED`, `PIGNOLO_MUTATE_FILES`) son **aditivas y opcionales**: un `project.md` de hoy se lee igual y la compuerta se comporta igual si no se usan. Por eso se tratan como técnicas.
- **`pre-merge` sin tarea compara contra `--base <ref>`** (el que corre la compuerta pasa el merge-base con la rama destino). Sin `--base` y sin tarea, `weakened` y la mutación miran los cambios sin commitear contra `HEAD`, como hoy.
- **`Protects:`** se registra, no bloquea (`checks.noProtects`). Bloquear rompería helpers y fixtures en `test-paths`; lo lee `review-testability`.
- **Estados nuevos y prioridad del sello:** `NO_GATE` > `INTEGRITY_NO_REF` > `TREE_CHANGED` > `FAIL` > `INTEGRITY` > `SCOPE` > `NO_MUTATION_TOOL` > `MUTATION` > `NO_TESTS` > `PASS`.

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: `lib/test-integrity.js` (debilitamientos en el diff)

**Files:**
- Create: `plugins/pignolo/lib/test-integrity.js`
- Test: `tests/test-integrity.test.js`

**Interfaces:**
- Consume: `addedLines({ cwd, base, tree })` (líneas con `sign: '+' | '-'`, `path`, `line`, `text`; `lib/changes.js:72-97`) y `changedFiles({ cwd, base, tree, sizes })` (con estado `D`; `lib/changes.js:42-46`); `matchAny` de `lib/globs.js`.
- Produce: `weakenings({ cwd, base, tree, testPaths, protectedTestConfig, timeoutMs }) → Array<{ path, line, kind, text }>`, `KINDS`, y la función pura `classify(lines, files, { testPaths, protectedTestConfig })` que hace el trabajo sin git.
- Todas las palabras clave llevan límite a la izquierda `(?<![\w.$])` salvo las que empiezan con `.` o `@` (así `process.exit(` no es `xit(` y `benefit(` no es `fit(`; medido en la auditoría: sin límite, 6 líneas de la suite actual darían `skip`).
- `kind` ∈ (lista cerrada):
  - `skip`: línea `+` en un archivo de test con `it.skip(`, `test.skip(`, `describe.skip(`, `xit(`, `xdescribe(`, `xtest(`, `it.todo(`, `test.todo(`, `skip: true` en opciones, `t.skip(`, `@pytest.mark.skip`, `@pytest.mark.xfail`, `pytest.skip(`, `@unittest.skip`, `@Disabled`, `[Ignore]`.
  - `only`: `it.only(`, `test.only(`, `describe.only(`, `fit(`, `fdescribe(`, `only: true`.
  - `retry`: `jest.retryTimes(`, `this.retries(`, `retries:` / `retry:` en un archivo de test o de `protected-test-config`, `@pytest.mark.flaky`, `--reruns`.
  - `snapshot-update`: línea `+` en `protected-test-config` o en un `package.json` con `--update`, `--update-snapshots`, `--snapshot-update`, o `-u` como argumento de `jest`/`vitest`.
  - `assertion-removed`: en un archivo de test que sigue existiendo, más líneas `-` que `+` con aserción (`expect(`, `assert.`, `assert(`, `.should`, `t.is(`, `t.deepEqual(`, `self.assert`, `\bassert\b` al comienzo de la línea en Python). Un registro por archivo, con las dos cuentas en `text`.
  - `test-deleted`: archivo en `test-paths` borrado.
  - `snapshot-changed`: archivo `.snap`, bajo `__snapshots__/`, o con `golden` en la ruta, modificado o borrado (agregado no cuenta).
- Solo mira archivos en `testPaths` o `protectedTestConfig` (más `package.json` para `snapshot-update`). Comentarios no se excluyen: heurística declarada, como los tripwires (§4.2).

- [ ] **Paso 1: tests primero** (tabla sobre `classify`, más un caso con `makeRepo()` sobre `weakenings`):
  - `+  it.skip('x', …)` en `tests/a.test.js` → `skip`; la misma línea en `src/a.js` → nada.
  - `+  process.exit(1)` y `+  benefit(x)` en `tests/a.test.js` → nada.
  - `+test('x', { skip: true }, …)` → `skip`; `+  it.only(` → `only`; `+jest.retryTimes(3)` → `retry`.
  - `package.json` con `+ "test": "jest -u"` → `snapshot-update`; `+ "test": "jest"` → nada.
  - `tests/a.test.js` con 2 líneas `-` de `expect(` y 1 `+` → un `assertion-removed`; 1 y 1 → nada; archivo borrado → `test-deleted` y no `assertion-removed`.
  - `tests/__snapshots__/a.snap` modificado → `snapshot-changed`; agregado → nada.
  - `+@pytest.mark.skip` en `tests/test_a.py` → `skip`.
  - Con `makeRepo()`: test commiteado, cambio a `it.skip` en la copia de trabajo, `weakenings({ base: HEAD, tree: workingTree(...) })` → un `skip` con la línea correcta.
- [ ] **Paso 2: rojo.** Solo este archivo; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(tests): detectar tests debilitados en el diff`.

### Task 2: clave `gates.mutation` en `project.md`

**Files:**
- Modify: `plugins/pignolo/lib/project-config.js` (`GATE_KEYS`)
- Test: `tests/project-config.test.js` (casos nuevos)

**Interfaces:**
- Produce: `config.gates.mutation` (texto o ausente), leído igual que `pre-merge` (desde la ref cuando se pasa `ref`).
- Hoy una clave desconocida en `gates` es un **aviso** (`project-config.js:63`), no un error: eso no cambia.
- [ ] **Paso 1: test primero:** `gates: { mutation: "npx stryker run" }` → `config.gates.mutation === 'npx stryker run'` y **sin** aviso de clave desconocida (hoy da el aviso: ese es el rojo).
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(config): comando de mutación en gates`.

## Ola 1 (en paralelo: Tasks 3 a 6, cada una en su worktree)

### Task 3: la compuerta y el `handback-gate` usan la integridad; semilla y mutación

**Files:**
- Modify: `plugins/pignolo/lib/gate.js`, `plugins/pignolo/scripts/gate.js`, `plugins/pignolo/lib/seals.js` (`STATUSES`), `plugins/pignolo/hooks/handlers/handback-gate.js` (rama `test-writer`)
- Test: `tests/gate.test.js`, `tests/handback-gate.test.js` (casos nuevos)

**Interfaces:**
- Consume: `weakenings` (Task 1), `config.gates.mutation` (Task 2), `config.highRiskPaths`, `config.mutation`.
- `runGate({ …, seed, base })`:
  - `seed` entero opcional; si falta, `crypto.randomInt(0, 2 ** 32)`. `exec(command, { cwd, timeoutMs, logFile, env })` recibe `env` = `{ ...process.env, PIGNOLO_TEST_SEED: String(seed) }` y el `exec` por defecto lo pasa a `spawnSync`. `seal.seedOffered` = la semilla, en todos los niveles.
  - `base` opcional: sin tarea, reemplaza a `headSha` como `baseRef` (Review Focus 3). Con tarea se ignora (manda `task.base`).
- `seal.checks` suma `weakened` (salida de `weakenings` contra `ref ?? baseRef` hasta `treeHash`), `noProtects` (archivos **agregados** en `testPaths` con extensión `.js .mjs .cjs .ts .tsx .jsx .py .go .rs .java .kt .cs .rb .php`, sin `Protects:` en sus primeras 20 líneas) y `mutation: { files, exit } | null`.
- `weakened` no vacío → `INTEGRITY`, salvo `task.testAuthorization === true`. Vale también con tarea de `test-writer` y sin tarea.
- Mutación (solo `pre-merge`): si `config.mutation` y algún cambiado contra `baseRef` cae en `highRiskPaths`: sin `gates.mutation` → `NO_MUTATION_TOOL`; con comando, corre **después** del comando de `pre-merge` y solo si éste salió 0, con `PIGNOLO_MUTATE_FILES` = rutas separadas por `\n` y la misma semilla; exit ≠ 0 → `MUTATION`. Su log se agrega al del sello tras `--- mutation ---`; el árbol se mide también después (cambio → `TREE_CHANGED`).
- `STATUSES` suma `NO_MUTATION_TOOL` y `MUTATION`; prioridad según el ruling.
- CLI: `--seed <n>` (entero ≥ 0; otro valor → exit 2) y `--base <ref>` (se resuelve con `git rev-parse --verify <ref>^{commit}`; si no existe → exit 2). Exit 0 sigue siendo solo `PASS` o `NO_TESTS` con razón. `ALTERNATIVES` suma:
  - `INTEGRITY` con `weakened`: "un test quedó debilitado (`kind` en `ruta:línea`). Alternativa: revertí ese cambio; si hace falta, pedí `test-authorization` al humano".
  - `NO_MUTATION_TOOL`: "`mutation: true` y el diff toca `high-risk-paths`, pero no hay `gates.mutation`. Alternativa: el humano agrega la herramienta y su comando a `project.md`, o pone `mutation: false`".
  - `MUTATION`: "sobrevivieron mutantes. Alternativa: un test nuevo que los mate, un equivalente justificado aprobado por un revisor, o deuda registrada".
- `handback-gate`, rama `test-writer` (hoy `handback-gate.js:192-199`): además de lo actual, `weakenings({ base: task.testRef ?? task.base, tree: <árbol del worktree de la tarea> })` no vacío → bloquea con la lista y la alternativa "escribí tests nuevos; no debilites los existentes", salvo `task.testAuthorization`.

- [ ] **Paso 1: tests primero** (`exec` inyectado salvo donde se dice):
  - Con `exec` real y `check.js` que imprime `process.env.PIGNOLO_TEST_SEED`: `seed: 42` → el log contiene `42` y `seal.seedOffered === 42`.
  - `it.skip` agregado en `tests/a.test.js` con tarea `test-writer` y el archivo en `task.files` → `INTEGRITY` con `weakened[0].kind === 'skip'`; lo mismo con `testAuthorization: true` → `PASS`.
  - Sin tarea, `.only` sin commitear → `INTEGRITY`.
  - Sin tarea, `.only` **commiteado** en una rama y `base` = el commit anterior → `INTEGRITY`; sin `base` → `PASS` (comportamiento de hoy, declarado).
  - Test nuevo sin `Protects:` → `PASS` con `noProtects` que lo lista; con `// Protects: R1 · Breaks if: x` en la línea 1 → no aparece.
  - `pre-merge`, `mutation: true`, `high-risk-paths: [src/pay.js]`, cambio **commiteado** en `src/pay.js` y `base` = el commit anterior: sin `gates.mutation` → `NO_MUTATION_TOOL`; con un comando que sale 1 → `MUTATION`; que sale 0 → `PASS` y `checks.mutation.files` = `['src/pay.js']`; cambio fuera de `high-risk-paths` → `checks.mutation === null`.
  - `on-done` con `mutation: true` y el mismo cambio → `checks.mutation === null`.
  - CLI `--seed abc` → exit 2; `--base no-existe` → exit 2.
  - `handback-gate` en proceso, `test-writer` con `DONE`, un `it.skip` agregado en un test de su tarjeta → bloquea (hoy pasa: ese es el rojo); con un test nuevo sin debilitar → pasa.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(gate): tests debilitados, semilla ofrecida y mutación en pre-merge`.

### Task 4: `scripts/sabotage.js` (rojo sobre código commiteado)

**Files:**
- Create: `plugins/pignolo/lib/sabotage.js`, `plugins/pignolo/scripts/sabotage.js`
- Modify: `plugins/pignolo/hooks/handlers/session-start.js` (recuperación)
- Test: `tests/sabotage.test.js`

**Interfaces:**
- `lib/sabotage.js` exporta:
  - `async sabotage({ cwd, patchFile, level, timeoutMs, env }) → { red, greenBefore, exit, files, notRestored, newFiles, clean, logTail }`.
  - `recover({ cwd }) → { recovered: Array<{ worktree, files }> }` y `recoverAll({ cwd })`, que recorre el git-dir del `cwd` y `<common>/worktrees/*/` **sin lanzar git** mientras no haya candado (solo `fs.existsSync`).
  - `lockPath(gitdir) = <gitdir>/pignolo-sabotage.json`; el log va a `<gitdir>/pignolo-sabotage.log`.
- Candado `{ v: 1, pid, startedAt, expires, head, worktree, files, added }`, con `expires` = `startedAt` + plazo del comando + 10 min. Un candado es **viejo** si `process.kill(pid, 0)` lanza `ESRCH`, o si ya pasó `expires` (reutilización de `pid`). `EPERM` quiere decir vivo (medido en la auditoría con el pid 4 de Windows).
- Orden de `sabotage`:
  1. `recover` del worktree actual (un candado viejo se restaura antes de seguir; uno vivo → error "otro sabotaje en curso").
  2. Árbol limpio: `git status --porcelain --untracked-files=normal` vacío; si no, error "commiteá o guardá tus cambios (commit WIP) antes de sabotear". No se toca nada.
  3. Comando: `config.gates[level]` leído desde `HEAD` (`level` por defecto `on-edit` si está declarado, si no `on-done`); vacío → error, sin tocar nada.
  4. `git apply --check` y `git apply --numstat` sobre el parche → archivos. No aplica, lista vacía, alguno en `testPaths`/`protectedTestConfig` o fuera de la raíz → error, sin tocar nada.
  5. **Verde previo:** correr el comando sin parche. Exit ≠ 0 → error "el comando ya falla sin el parche: el rojo no demostraría nada", exit 2 del CLI.
  6. Escribir el candado y **después** `git apply`.
  7. Correr el comando con `spawn` asíncrono, `shell: true`, `windowsHide: true`, salida al log del git-dir, `detached: true` fuera de Windows (grupo propio). Plazo → matar el árbol.
  8. `finally`: `git restore --source=HEAD --staged --worktree -- <archivos que existían en HEAD>` y borrar los que el parche agregó; `notRestored` = los de la lista que siguen distintos de `HEAD`; `newFiles` = otros cambios que dejó el comando; `clean` = los dos vacíos. El candado se borra solo si `notRestored` está vacío.
  - `SIGINT`/`SIGTERM`/`SIGHUP` durante el paso 7: matar el árbol del hijo (`taskkill /T /F /PID <pid>` en Windows; `process.kill(-pid)` en POSIX), restaurar como en 8 y salir con 130.
  - `red` = el comando salió ≠ 0 **con el parche**. Un comando que no terminó por el plazo no es rojo.
- CLI `scripts/sabotage.js --patch <archivo> [--gate on-edit|on-done] [--cwd <dir>] [--timeout-min <n>]` y `scripts/sabotage.js --recover [--cwd <dir>]`. Salida JSON. Exit: 0 rojo demostrado y `notRestored` vacío; 1 el test siguió verde (no protege lo que dice); 2 uso inválido o negativa (incluido "ya estaba rojo"); 3 **no se pudo restaurar** (mensaje fuerte con los archivos y `git restore --source=HEAD -- <archivos>` para que lo corra el humano).
- `session-start`: llama a `recoverAll({ cwd })`; callado si no hubo nada; si restauró, `systemMessage` "pignolo restauró N archivos que un sabotaje interrumpido dejó rotos en <worktree>". Un error no rompe el arranque: se avisa.

- [ ] **Paso 1: tests primero** (repos con `makeRepo()`, `src/a.js` + `tests/a.test.js` + `.pignolo/project.md` con `gates.on-edit: node --test tests/a.test.js`, commiteados):
  - Parche que rompe `src/a.js` → `red: true`, `greenBefore: true`, exit del CLI 0, árbol limpio, `src/a.js` igual a `HEAD`, sin candado.
  - Parche inocuo (un comentario) → `red: false`, exit 1, árbol limpio.
  - Test que ya falla en `HEAD` → exit 2 "ya falla sin el parche", nada aplicado.
  - Árbol sucio (archivo nuevo sin commitear) → exit 2, el archivo sigue igual.
  - Parche que toca `tests/a.test.js` → exit 2; parche viejo que no aplica → exit 2; nada aplicado en los dos.
  - Parche que agrega `src/new.js` → después no existe.
  - Candado escrito a mano con un `pid` muerto (el de un `spawnSync` de `node -e ""` ya terminado) y `src/a.js` roto → `--recover` restaura y borra el candado; con `process.pid` y `expires` futuro → no hace nada; con `process.pid` y `expires` pasado → restaura.
  - El mismo candado en el git-dir de un **worktree de tarea** (`git worktree add`) y el handler `session-start` corrido desde el checkout principal → `systemMessage` y el worktree limpio; sin candado → sin `systemMessage`.
  - En Windows, un `gates.on-edit` que llama a un shim `.cmd` propio (`tools/t.cmd` que corre `node --test`) → funciona (`greenBefore: true`).
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(sabotage): rojo sobre código commiteado con verde previo, restauración y recuperación`.

### Task 5: holdout (almacén, regla en la guardia y lectura negada)

**Files:**
- Create: `plugins/pignolo/lib/holdout.js`, `plugins/pignolo/scripts/holdout.js`, `plugins/pignolo/hooks/handlers/private-reads.js`
- Modify: `plugins/pignolo/hooks/hooks.json` (entrada `PreToolUse` `Read|Grep|Glob|Bash|PowerShell` → `private-reads`), `plugins/pignolo/lib/git-guard.js` (regla `pignolo-holdout` en `RULES` y su chequeo junto a `checkRunScript`)
- Test: `tests/holdout.test.js`, `tests/private-reads.test.js`, `tests/guard.test.js` (casos nuevos)

**Interfaces:**
- `lib/holdout.js`: `holdoutDir({ env, cwd, plan })` = `<pignoloHome>/holdout/<repoIdFor({ cwd })>/<plan>`; `PLAN_RE = /^[a-z0-9][a-z0-9-]{0,63}$/`; `privateRoots(env)` = `[<pignoloHome>/holdout, <pignoloHome>/seals]`.
- `scripts/holdout.js`:
  - `save --plan <p> --from <dir>`: `<dir>` dentro de `<raíz>/.pignolo/tmp/holdout/`; copia sus archivos (rutas relativas conservadas) al almacén, rechaza si alguno ya existe allí con otro contenido, borra el origen. Salida `{ plan, files }`.
  - `list --plan <p>` → `{ plan, count }` (solo la cuenta).
  - `run --plan <p> [--ref <commit>] [--gate on-done]`: `git worktree add --detach <tmp> <ref ?? HEAD>` en `os.tmpdir()`; si `project.md` declara `deps-install`, lo corre primero con shell en `<tmp>` (falla → exit 1 con "no se pudieron instalar las dependencias"); copia el holdout con sus rutas; corre `gates.on-done` con shell en `<tmp>`; `git worktree remove --force <tmp>` y `git worktree prune` en `finally`. Salida `{ plan, ref, count, exit, pass, logTail }`. Exit 0 si pasa, 1 si falla, 2 uso. Nunca acepta un comando propio: solo el declarado.
  - `drop --plan <p>`: borra el almacén de ese plan (al cerrar el plan, hito 5).
- Guardia, regla `pignolo-holdout` (deny, `ctx.subagent` y `agent_type !== 'pignolo:validator'`): ejecutar el `holdout.js` de este plugin o uno bajo un directorio `pignolo`, con la misma detección que `checkRunScript` (`git-guard.js:838-854`). Alternativa: "el holdout lo corre el validator; pedile el resultado al hilo principal". Si `ctx` no trae `agent_type`, se usa el del payload (el handler `guard.js` lo pasa).
- `private-reads` (solo si el payload trae `agent_id`, pignolo está activo en el proyecto — `projectState(...).active` — y el agente no es `pignolo:validator`):
  - `Read` (`file_path`), `Glob` (`path`, y `pattern` resuelto contra `path`, que puede traer `..`) y `Grep` (`path` y `glob`): la ruta resuelta (con `resolveClean` de `lib/paths.js`, `~` del entorno) cae **dentro** de un `privateRoot`, o es un **ancestro** de uno (`Glob` y `Grep` son recursivos) → deny.
  - `Bash`/`PowerShell`: el texto menciona `.pignolo/holdout`, `.pignolo\holdout`, `.pignolo/seals`, `.pignolo\seals`, la ruta absoluta de un `privateRoot` o `PIGNOLO_HOME` → deny. Búsqueda recursiva (`find`, `rg`, `grep -r`/`-R`, `ls -R`, `tree`, `Get-ChildItem -Recurse`/`gci -r`/`dir -r`, `dir /s`) cuyo argumento de ruta es `~`, `$HOME`, `$env:USERPROFILE`, `/`, `C:\`, `/c/`, `/mnt/c` o un ancestro de `pignoloHome` → deny. Los scripts de pignolo no necesitan excepción: sus comandos no nombran esas rutas, y `holdout.js` lo cubre la guardia.
  - Mensaje: "pignolo bloqueó la lectura: el holdout y los sellos solo los lee el validator por los scripts de pignolo. Alternativa: trabajá con los tests del repo; si necesitás el resultado del holdout, pedíselo al hilo principal." Best-effort (§8.3): la protección fuerte es que el almacén vive fuera del repo y del worktree de la tarea.

- [ ] **Paso 1: tests primero:**
  - `holdout.js save` desde `.pignolo/tmp/holdout/p1/tests/acc.test.js` → queda en el almacén y el origen no existe; `--from` fuera de `.pignolo/tmp/holdout/` → exit 2; plan `../x` → exit 2; segundo `save` con otro contenido → exit 2 y el primero intacto.
  - `run` con un holdout que pasa contra `HEAD` → `pass: true`; con uno que falla → exit 1; con `deps-install` que sale 1 → exit 1; después no queda la worktree (`git worktree list` con una sola entrada) ni la carpeta temporal.
  - Guardia: `node <plugin>/scripts/holdout.js run --plan p1` con `subagent: true` y `agent_type: 'pignolo:implementer'` → deny en `default` y en `bypassPermissions`; con `agent_type: 'pignolo:validator'` → pasa; sin subagente → pasa.
  - `private-reads` (tabla, en proceso, `HOME` temporal y `PIGNOLO_HOME = <HOME>/.pignolo`, proyecto con `.pignolo/project.md`, `agent_id` y `agent_type: 'pignolo:implementer'`): `Read` de un archivo del holdout → deny; con `agent_type: 'pignolo:validator'` → pasa; sin `agent_id` (hilo principal) → pasa; `Glob` con `path` = home → deny; `Glob` con `path` = el repo → pasa; `Glob` con `path` = el repo y `pattern` = `../**/*.test.js` cuando el repo está bajo el home → deny; `Grep` con `path` = `<HOME>/.pignolo` → deny; `Bash` `cat ~/.pignolo/holdout/x` → deny; `Bash` `find ~ -name "*.test.js"` → deny; `Bash` `find . -name "*.test.js"` → pasa; `PowerShell` `Get-ChildItem -Recurse $env:USERPROFILE` → deny; con `/pignolo:off` → pasa.
  - Falsos positivos (§15): cada comando de `tests/guard/must-allow.json` pasado por `private-reads` como `pignolo:implementer` → 0 deny.
  - Un test de humo por el launcher (`runLauncher('private-reads', …)`) → exit 2 con el mensaje.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(holdout): almacén fuera del repo, script solo para el validator y lectura negada`.

### Task 6: `protect-paths` por rol (escritura de tests en el momento)

**Files:**
- Modify: `plugins/pignolo/hooks/handlers/protect-paths.js`
- Test: `tests/protect-paths.test.js` (casos nuevos)

**Interfaces:**
- Consume: `readRun`, `mainRoot`, `projectState` (`lib/project.js`), `readProjectConfig` (con `ref = task.testRef ?? task.base` si hay tarea; sin tarea, la copia de trabajo del checkout principal), `matchAny`.
- Regla nueva, después de las existentes, **solo si `projectState({ env, cwd }).active`** y el payload trae `agent_type`:
  - La ruta se hace relativa a `task.worktree` si el archivo está dentro de él; si no, al worktree que contiene el archivo (subiendo hasta el primer `.git`, sin git). Fuera de todo worktree → sin regla por rol.
  - `pignolo:implementer` o `pignolo:fixer`: ruta en `testPaths` o `protectedTestConfig` → deny, salvo `task.testAuthorization === true` y la ruta en `task.files`; `.pignolo/project.md` siempre deny.
  - `pignolo:test-writer`: ruta en `protectedTestConfig` → deny; ruta fuera de `testPaths` **y** fuera de `.pignolo/tmp/holdout/` → deny.
  - Otro `agent_type`, o sin `agent_type` (hilo principal) → sin regla por rol (queda la verificación posterior del `handback-gate` y la compuerta).
  - `project.md` ilegible con un escritor pignolo → deny con la ruta (falla cerrado, como el `handback-gate`).
- Mensajes con `Alternativa:`: implementer/fixer "un test cambia solo con `test-authorization`: devolvé BLOCKED y nombrá el test"; test-writer "escribí solo en `test-paths` o en `.pignolo/tmp/holdout/`; lo demás lo pide el hilo principal".

- [ ] **Paso 1: tests primero** (en proceso; repo con `project.md` que declara `test-paths: [tests/]`; `run.json` con tarea cuyo `worktree` es un worktree real):
  - `implementer` → `Write <worktree>/tests/a.test.js` deny (hoy pasa: ese es el rojo); `Write <worktree>/src/a.js` pasa; con `testAuthorization: true` y `tests/a.test.js` en `task.files` → pasa; con autorización y otra ruta de test → deny; `Edit <worktree>/.pignolo/project.md` con autorización → deny.
  - El mismo `Write` con `cwd` = el checkout principal y `file_path` absoluto en el worktree → deny (la ruta se resuelve contra el worktree).
  - `test-writer` → `Write src/a.js` deny; `Write tests/b.test.js` pasa; `Write .pignolo/tmp/holdout/p1/acc.test.js` pasa.
  - Proyecto sin `project.md` → `implementer` `Write latest.js` pasa.
  - Con `/pignolo:off` (flag del proyecto) → `implementer` `Write tests/a.test.js` pasa.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(protect-paths): escritura de tests por rol en el momento`.

## Ola 2

Unir las Tasks 3 a 6 a `core/hito-4a` (en ese orden; conflicto trivial esperado en `session-start.js` solo si la Task 5 lo tocara, y no lo toca). Suite completa una vez.

### Task 7: pruebas de punta a punta de §15 (`sabotage`, `holdout`)

**Files:**
- Create: `tests/e2e-hito-4a.test.js`

- [ ] **§15 `sabotage`: interrumpido a mitad → árbol restaurado.** Repo real; `gates.on-edit` = un `node` que, **solo con el parche aplicado** (lee una marca que el parche agrega), escribe un archivo-señal en la carpeta del test y duerme 30 s. `scripts/sabotage.js` lanzado con `spawn`; cuando aparece la señal, se mata **el árbol** (`taskkill /T /F /PID` en Windows, `process.kill(-pid)` con `detached` en POSIX), así ningún `finally` corre y no queda el nieto vivo. Después: el parche sigue aplicado y el candado existe en el git-dir; `scripts/sabotage.js --recover` → exit 0 y `git status --porcelain` vacío. Segundo caso: igual, pero en un worktree de tarea, y en vez de `--recover` se corre el handler `session-start` en proceso desde el checkout principal → worktree limpio y `systemMessage`.
- [ ] **§15 `holdout`: el implementer no lo encuentra ni lo lee con Glob, Grep, Read ni Bash.** `HOME` temporal y `PIGNOLO_HOME = <HOME>/.pignolo`; repo bajo el home con `project.md`; holdout guardado con `holdout.js save`. Por el **launcher real**, con `agent_id` y `agent_type: 'pignolo:implementer'`: `runLauncher('private-reads', …)` para `Read` de la ruta exacta, `Glob` `**/*.test.js` con `path` = home, `Grep` `Protects` con `path` = home y `Bash` `ls ~/.pignolo/holdout` → los cuatro exit 2; `runLauncher('guard', …)` para `Bash` `node <plugin>/scripts/holdout.js run --plan p1` → exit 2.
- [ ] **Compuerta con semilla:** `scripts/gate.js --level on-done --seed 7` dos veces sobre el mismo árbol → los dos sellos tienen `seedOffered: 7`.
- [ ] Commit: `test(e2e): sabotaje interrumpido y holdout invisible para el implementer`.

### Task 8: cierre de la parte 4a

- [ ] `plugins/pignolo/.claude-plugin/plugin.json` → `0.5.0`; entrada `## 0.5.0 — <fecha>` en `CHANGELOG.md` (sabotaje, integridad por diff, holdout, semilla, mutación, escritura por rol; D-4-1).
- [ ] Spec: §8.2 (estados nuevos y prioridad, `weakened`, `noProtects`, `seedOffered`, `--base`), §8.3 (`private-reads` solo para subagentes con pignolo activo, regla `pignolo-holdout`, `protect-paths` por rol y su límite sin `agent_type`), §9.2 (forma de `sabotage`: parche, verde previo, comando declarado, candado en el git-dir, recuperación en `SessionStart`), §9.4 (la repetición de `pre-merge` va al hito 7), §6 (D-4-1), §15 (`sabotage`, `holdout` con lo medido).
- [ ] `tests/manual/hito-4a.md`: en una sesión real, (1) un `implementer` intenta `Write` en `tests/` → negado en el momento (confirma `agent_type` en `PreToolUse` dentro de un subagente, hipótesis abierta desde 3a); (2) Ctrl+C durante un `sabotage` largo → árbol limpio, o restaurado al próximo arranque; (3) un `Glob` desde el home de un subagente → negado; (4) un subagente corre `holdout.js list` → negado.
- [ ] `npm test` completo verde; `docs/STATE.md` actualizado (qué quedó, siguiente: plan de 4b).
- [ ] Revisión final opus de `main..core/hito-4a`, pasada de arreglos, confirmación acotada; unión a `main` en local. El push, solo con el OK del autor.

## Decisiones que necesita el autor (parte 4a)

Ninguna para ejecutar 4a: no suma dependencias, no gasta tokens de agentes y no cambia contratos. `private-reads` se acotó para respetar el interruptor tal como lo decidió el autor (§3.3), y las claves nuevas son opcionales y aditivas. D-4-1 es técnica y queda registrada; si el autor prefiere darle Bash al `test-writer`, se cambia la tabla de §6 en 4b.

Para 4b sí: el costo de las evals de `test-writer`, `implementer` y `review-testability` (las dos últimas en WSL2, que todavía no está preparado).

## Auditoría de la primera versión y dónde quedó cada hallazgo

| # | Hallazgo (severidad) | Dónde se atendió |
|---|---|---|
| 1 | Un implementer lee el holdout por `holdout.js run -- cat`, `list` o `drop` (CRITICAL) | Task 5: `run` sin comando propio, `list` solo cuenta, regla `pignolo-holdout` en la guardia para todo subagente salvo el `validator` |
| 2 | El canario nuevo rompe la suite y alarma con `PIGNOLO_HOME` propio (MAJOR) | Sin canario (`private-reads` no es siempre activo); Task 7 fija `PIGNOLO_HOME = <HOME>/.pignolo` |
| 3 | Sin shell no se pueden lanzar `npm`/`npx` en Windows (MAJOR) | Sabotaje y holdout corren el comando declarado con shell; test con un shim `.cmd` (Task 4) |
| 4 | El candado ensucia el worktree de tarea y `SessionStart` no lo ve (MAJOR) | Candado en el git-dir; `recoverAll` recorre `<common>/worktrees/*/` (Task 4) |
| 5 | Rojo sin verde previo (MAJOR) | Paso 5 de `sabotage` y su test (Task 4) |
| 6 | Señales con `spawnSync`; `child.kill()` deja vivo al nieto (MAJOR) | `spawn` asíncrono, matar el árbol, log en el git-dir (Tasks 4 y 7) |
| 7 | Los debilitamientos del `test-writer` quedan dentro del `testRef` (MAJOR) | `handback-gate` los mira en la rama `test-writer` (Task 3) |
| 8 | La mutación y `weakened` no corren en `pre-merge` sin tarea sobre código commiteado (MAJOR) | `--base <ref>` y tests con el cambio commiteado (Task 3) |
| 9 | `protect-paths` choca con el holdout, el `cwd` del checkout principal y el interruptor (MAJOR) | `.pignolo/tmp/holdout/` permitido, ruta contra el worktree, solo con `projectState().active` (Task 6) |
| 10 | `private-reads` siempre activo era decisión del autor (MAJOR) | Acotado a subagentes con pignolo activo; corpus `must-allow` por el hook (Task 5) |
| 11 | Palabras clave sin límite dan falsos positivos en esta suite (MINOR) | Límite `(?<![\w.$])` y caso `process.exit(1)` (Task 1) |
| 12 | `--numstat` no prueba que el parche aplique; `EPERM` es vivo; reutilización de `pid` (MINOR) | `git apply --check`, `EPERM` = vivo, `expires` en el candado (Task 4) |
| 13 | Tests que no pueden fallar (MINOR) | Quitados o reescritos con su rojo nombrado (Tasks 2, 3, 6, 7) |
| 14 | `Grep.pattern` no es ruta, `..` en `Glob`, `clean` mezclado, dependencias del holdout, semilla, repetición (MINOR) | `Grep.glob`, `pattern` resuelto, `notRestored`/`newFiles`, `deps-install`, `seedOffered`, repetición al hito 7 |
