# Hito 4 del núcleo, parte 4a: sabotaje, integridad por diff, holdout, semilla, mutación y escritura por rol. Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo pueda demostrar el rojo sobre código ya commiteado sin dejar el árbol roto, detectar en el diff que un agente debilitó un test, guardar tests de aceptación donde el implementador no los vea, correr `on-done` con semilla registrada, enganchar una herramienta de mutación declarada por el humano y negar en el momento de la escritura lo que hoy solo se rechaza después.

**Arquitectura:** dos contratos en la ola 0 (`lib/test-integrity.js`, que lee el diff y devuelve debilitamientos; la clave `gates.mutation` en `project-config`). Encima, en paralelo: la compuerta los usa (y suma semilla y mutación), `scripts/sabotage.js` con su recuperación desde `SessionStart`, el almacén de holdout con su hook de lectura, y `protect-paths` por rol. La ola 2 corre las pruebas de punta a punta de §15 (`sabotage`, `holdout`) y cierra.

**Stack:** Node ≥ 20 sin dependencias npm, `node:test`, git ≥ 2.31, hooks de Claude Code.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md`: §8.2 (compuerta y sellos), §8.3 (hooks: escritura por rol, lectura de holdout y sellos), §8.4 (canario), §9.1 (holdout, `Protects:`), §9.2 (sabotaje, integridad, semilla, mutación, `code-untested`), §9.3 (sin autorización nadie debilita un test), §9.4 (niveles), §11.6 (la guardia deja pasar `scripts/sabotage`), §15 (`sabotage`, `holdout`, `canary`), §18 punto 4.

## Alcance: por qué el hito 4 se parte en dos

Igual que el hito 3 (mismo motivo: código determinista primero, texto y evals con costo después):

- **4a (este plan):** todo lo determinista. Termina con los tests `sabotage` y `holdout` de §15 en verde, sin evals y sin costo de tokens de agentes.
- **4b (se escribe cuando 4a esté en `main`):** la `test-card` en la plantilla de la tarjeta, las skills `daily` y `review` usando `sabotage` y la semilla, las cartas de `implementer`, `test-writer` y `review-testability`, y las evals `agents` de `test-writer`, `implementer` ("intenta tocar un test") y `review-testability` ("test decorativo"). Las dos últimas tienen Bash: corren en WSL2, y su costo lo decide el autor.

## Global Constraints

- Node ≥ 20, **sin dependencias npm**. Tests con `node:test`; la suite completa corre con `npm test`, nunca con `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits, escritos con `git commit -F <archivo>`.
- Archivos en LF y sin BOM. Nunca se pasa texto por comillas de la shell (regla 6 de `rules/core.md`): todo texto largo (parches, razones) entra por archivo, y los comandos por argv después de `--`, sin shell.
- Hooks: forma exec con `node` y el launcher; `timeout` del host entre 30 y 60 s; plazo interno 3 s, que al vencer niega. **Callados en el éxito.** Cada bloqueo nombra una alternativa que funciona (`Alternativa:`).
- Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js` (`tests/cleanup.test.js` falla si un test llama a `mkdtemp`/`tmpdir`). Los scripts limpian lo que crean en `os.tmpdir()`.
- Sello (§8.2): `{sha, tree-hash, comando, exit, hash del log, hora}` en `~/.pignolo/seals/<repo-id>/`. Los estados nuevos de este plan se suman a `STATUSES` de `lib/seals.js`; el `handback-gate` sigue aceptando solo `PASS` y `NO_TESTS` con razón.
- Nada de datos del proyecto del autor, personas ni credenciales en lo versionado. Fixtures sintéticos.

## Método de ejecución y economía de tests

El del hito 3 (olas, worktrees a mano desde la etiqueta del contrato, implementadores sonnet en background con brief e informe en archivo, sin revisión por tarea, una revisión final opus de `main..core/hito-4a`, una pasada de arreglos, una confirmación acotada). Resumen de lo que cambia:

- **Ola 0:** Tasks 1 y 2 en paralelo; se unen a `core/hito-4a` y se etiqueta `contract/hito-4a/v1`.
- **Ola 1:** Tasks 3 a 6 en paralelo, cada una en `git worktree add -b task/hito-4a/<NN>-<slug> <scratchpad>/wt-<NN> contract/hito-4a/v1`. Primer paso de cada una: `git merge-base --is-ancestor contract/hito-4a/v1 HEAD`; si falla, `BLOCKED`.
- **Ola 2:** Task 7 (punta a punta) y Task 8 (cierre), en serie.
- Tests primero desde el spec, de tabla, con el rojo mostrado una vez; handlers en proceso (`require(handler).run(input, ctx)`) y un solo test de humo por el launcher por hook nuevo; cada implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>`.
- **Sin evals en 4a.** Costo de tokens de agentes = 0.

## Review Focus

1. **El sabotaje deja el árbol roto.** Un corte a mitad (Ctrl+C, `taskkill /F`, el plazo del Bash tool) después de aplicar el parche y antes de restaurar deja código saboteado que el siguiente commit se lleva. Tres capas: `finally` + señales en el proceso; un candado `.pignolo/tmp/sabotage.json` con la lista de archivos que el próximo `sabotage` (o `--recover`) restaura antes de hacer nada; y `SessionStart` que corre la recuperación y avisa solo si restauró algo. Dueña: **Task 4**; la prueba de corte real es de la **Task 7**.
2. **El sabotaje borra trabajo.** Si el árbol no estaba limpio, `git restore --source=HEAD` se lleva lo no commiteado. `sabotage` se niega con cualquier cambio (también archivos nuevos no ignorados) antes de tocar nada, y la restauración nombra archivos concretos, nunca `.`. Dueña: **Task 4**.
3. **Un test debilitado pasa como verde.** Un `it.skip`, un `.only`, un reintento, una aserción borrada o un snapshot regrabado hacen que la suite pase sin probar lo mismo. La compuerta los lee en el diff contra la referencia de la tarea y sella `INTEGRITY` (también para el `test-writer`, que escribe tests nuevos pero no debilita), salvo con `test-authorization`. Dueñas: **Task 1** y **Task 3**.
4. **El holdout se ve por un camino lateral.** Un `Glob` con `path` en `~`, un `Grep -r` desde la raíz del disco o un `Get-ChildItem -Recurse` sobre el home encuentran los tests aunque `Read` sobre la ruta exacta esté negado. El hook niega también la búsqueda recursiva cuya raíz contiene el almacén. Dueña: **Task 5**; los caminos de §15 los recorre la **Task 7**.
5. **La negación por rol frena al hilo principal.** Si `protect-paths` confunde el hilo principal con un subagente, el orquestador no puede commitear los tests del `test-writer` ni arreglar un fixture con autorización. Sin `agent_type` en el payload no se aplica ninguna regla por rol (queda la verificación posterior del `handback-gate` y la compuerta). Dueña: **Task 6**.

## Rulings del plan (técnicos, registrados)

- **D-4-1: el `test-writer` sigue sin Bash** (spec §6: "se decide en el hito 4"). El flujo de 3b ya funciona así (el orquestador demuestra el rojo y commitea los tests, que pasan a ser el `testRef`), y darle Bash abriría escritura por shell fuera de `test-paths`, que hoy solo se verifica después. Se revisa si las evals de 4b muestran que no alcanza.
- **La lectura del holdout y de los sellos se niega siempre**, también con `/pignolo:off` y `PIGNOLO_DISABLED=1`, como el conjunto catastrófico de escritura. Motivo: el holdout solo existe si un flujo de pignolo lo creó, y apagar pignolo no debe volverlo visible a un agente de ese flujo. Por eso lleva canario.
- **El sabotaje entra por parche, no por texto en la línea de comando.** `--patch <archivo>` con un diff unificado que aplica `git apply`; el comando del test va por argv después de `--`, sin shell. Así no hay comillas (regla 6) y el parche se puede revisar.
- **El sabotaje no toca tests.** Un parche que cambia algo en `test-paths` o `protected-test-config` se rechaza: romper un test no demuestra que el test proteja el código.
- **Semilla:** la compuerta la elige (entero de 32 bits, o `--seed <n>` para repetir) y la pasa al comando como `PIGNOLO_TEST_SEED`; queda en el sello. Cómo la usa el comando del proyecto (`--test-shuffle`, `--randomize --seed`, `-p randomly`) es del `on-done` que escribe `/pignolo:init` (hito 8); no hay clave nueva. El type-check de tests también va dentro de `on-done`.
- **Mutación:** clave nueva `gates.mutation` (comando). Solo en `pre-merge`, solo si `mutation: true` y el diff toca `high-risk-paths`. Sin comando → `NO_MUTATION_TOOL` (agregar la herramienta es decisión del humano, §9.2); exit ≠ 0 → `MUTATION` (sobrevivientes). El umbral vive en la configuración de la herramienta, que `/pignolo:init` lista en `protected-test-config`.
- **`Protects:`** se registra, no bloquea: `checks.noProtects` lista los archivos de test nuevos sin la cabecera en sus primeras 20 líneas. Bloquear rompería los helpers y fixtures que viven en `test-paths`; lo lee `review-testability`.
- **Estados nuevos y prioridad del sello:** `NO_GATE` > `INTEGRITY_NO_REF` > `TREE_CHANGED` > `FAIL` > `INTEGRITY` > `SCOPE` > `NO_MUTATION_TOOL` > `MUTATION` > `NO_TESTS` > `PASS`.

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: `lib/test-integrity.js` (debilitamientos en el diff)

**Files:**
- Create: `plugins/pignolo/lib/test-integrity.js`
- Test: `tests/test-integrity.test.js`

**Interfaces:**
- Consume: `addedLines({ cwd, base, tree })` y `changedFiles({ cwd, base, tree, sizes })` de `lib/changes.js` (las líneas traen `sign: '+' | '-'`, `path`, `line`, `text`); `matchAny` de `lib/globs.js`.
- Produce: `weakenings({ cwd, base, tree, testPaths, protectedTestConfig, timeoutMs }) → Array<{ path, line, kind, text }>` y `KINDS`. Una función pura aparte, `classify(lines, files, { testPaths, protectedTestConfig }) → Array<...>`, hace el trabajo sin git (la usan los tests de tabla).
- `kind` ∈ (lista cerrada):
  - `skip`: línea `+` en un archivo de test con `it.skip(`, `test.skip(`, `describe.skip(`, `xit(`, `xdescribe(`, `xtest(`, `it.todo(`, `test.todo(`, `{ skip: true }` / `skip: true` en opciones de `node:test`, `t.skip(`, `@pytest.mark.skip`, `@pytest.mark.xfail`, `pytest.skip(`, `@unittest.skip`, `@Disabled`, `[Ignore]`.
  - `only`: `it.only(`, `test.only(`, `describe.only(`, `fit(`, `fdescribe(`, `{ only: true }`.
  - `retry`: `jest.retryTimes(`, `this.retries(`, `retries:` / `retry:` en un archivo de test o de `protected-test-config`, `@pytest.mark.flaky`, `--reruns`.
  - `snapshot-update`: línea `+` en `protected-test-config` o en un `package.json` con `--update`, `-u` como argumento de jest/vitest, `--update-snapshots`, `--snapshot-update`.
  - `assertion-removed`: en un archivo de test que sigue existiendo, más líneas `-` que `+` con aserción (`expect(`, `assert`, `should`, `t.is(`, `t.deepEqual(`, `self.assert`, `\bassert\b` en Python). Un solo registro por archivo, con la cuenta en `text`.
  - `test-deleted`: archivo en `test-paths` borrado (`changedFiles` con estado `D`).
  - `snapshot-changed`: archivo `.snap`, bajo `__snapshots__/`, o con `golden` en la ruta, modificado o borrado (agregado no cuenta).
- Solo mira archivos en `testPaths` o `protectedTestConfig` (más `package.json` para `snapshot-update`). Comentarios no se excluyen: es una heurística declarada, igual que los tripwires (§4.2).

- [ ] **Paso 1: tests primero** (tabla sobre `classify`, más dos casos con `makeRepo()` sobre `weakenings`):
  - `+  it.skip('x', …)` en `tests/a.test.js` → `skip`; la misma línea en `src/a.js` → nada.
  - `+test('x', { skip: true }, …)` → `skip`; `+  it.only(` → `only`; `+jest.retryTimes(3)` → `retry`.
  - `package.json` con `+ "test": "jest -u"` → `snapshot-update`; `+ "test": "jest"` → nada.
  - `tests/a.test.js` con 2 líneas `-` de `expect(` y 1 `+` de `expect(` → un `assertion-removed`; 1 y 1 → nada; archivo borrado → `test-deleted` y no `assertion-removed`.
  - `tests/__snapshots__/a.snap` modificado → `snapshot-changed`; agregado → nada.
  - Python: `+@pytest.mark.skip` en `tests/test_a.py` → `skip`.
  - Con `makeRepo()`: commit con un test, cambio a `it.skip` en la copia de trabajo, `weakenings({ base: HEAD, tree: workingTree(...) })` → un `skip` con la línea correcta.
- [ ] **Paso 2: rojo.** Solo este archivo; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(tests): detectar tests debilitados en el diff`.

### Task 2: clave `gates.mutation` en `project.md`

**Files:**
- Modify: `plugins/pignolo/lib/project-config.js` (`GATE_KEYS`)
- Test: `tests/project-config.test.js` (casos nuevos)

**Interfaces:**
- Produce: `config.gates.mutation` (texto o ausente), leído igual que `pre-merge` (desde la ref cuando se pasa `ref`).
- [ ] **Paso 1: tests primero:** `gates: { mutation: "npx stryker run" }` → `config.gates.mutation === 'npx stryker run'`; una clave desconocida en `gates` sigue dando el mismo error que hoy; `mutation: true` sin `gates.mutation` es válido (la compuerta decide, Task 3).
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(config): comando de mutación en gates`.

## Ola 1 (en paralelo: Tasks 3 a 6, cada una en su worktree)

### Task 3: la compuerta usa la integridad, la semilla y la mutación

**Files:**
- Modify: `plugins/pignolo/lib/gate.js`, `plugins/pignolo/scripts/gate.js`, `plugins/pignolo/lib/seals.js` (`STATUSES`)
- Test: `tests/gate.test.js` (casos nuevos)

**Interfaces:**
- Consume: `weakenings` (Task 1), `config.gates.mutation` (Task 2), `config.highRiskPaths`, `config.mutation`.
- `runGate({ …, seed })`: `seed` entero opcional; si falta, `crypto.randomInt(0, 2 ** 32)`. `exec(command, { cwd, timeoutMs, logFile, env })` recibe `env` = `{ ...process.env, PIGNOLO_TEST_SEED: String(seed) }` (el `exec` por defecto lo pasa a `spawnSync`). `seal.seed` = la semilla (también en `on-edit`).
- `seal.checks` suma `weakened: [...]` (salida de `weakenings` contra `ref ?? baseRef`), `noProtects: [...]` (archivos agregados en `testPaths`, con extensión `.js .mjs .cjs .ts .tsx .jsx .py .go .rs .java .kt .cs .rb .php`, sin `Protects:` en sus primeras 20 líneas) y `mutation: { ran, files, exit } | null`.
- `weakened` no vacío → `INTEGRITY`, salvo `task.testAuthorization === true`. Vale también para el `test-writer` y sin tarea (contra `HEAD`).
- Mutación (solo `pre-merge`): si `config.mutation` y algún cambiado contra `baseRef` cae en `highRiskPaths`: sin `gates.mutation` → `NO_MUTATION_TOOL`; con comando, se ejecuta **después** del comando de `pre-merge` y solo si éste salió 0, con `PIGNOLO_MUTATE_FILES` = rutas separadas por `\n` y el mismo `PIGNOLO_TEST_SEED`; exit ≠ 0 → `MUTATION`. Su log se agrega al log del sello con un separador `--- mutation ---`. Un árbol que cambia durante la mutación también es `TREE_CHANGED`.
- `STATUSES` suma `NO_MUTATION_TOOL` y `MUTATION`; prioridad según el ruling.
- CLI: `--seed <n>` (entero ≥ 0; otro valor → exit 2). Exit 0 sigue siendo solo `PASS` o `NO_TESTS` con razón. `ALTERNATIVES` suma:
  - `INTEGRITY` con `weakened`: "un test quedó debilitado (`kind` en `ruta:línea`). Alternativa: revertí ese cambio; si hace falta, pedí `test-authorization` al humano".
  - `NO_MUTATION_TOOL`: "`mutation: true` y el diff toca `high-risk-paths`, pero no hay `gates.mutation`. Alternativa: el humano agrega la herramienta y su comando a `project.md`, o pone `mutation: false`".
  - `MUTATION`: "sobrevivieron mutantes. Alternativa: un test nuevo que los mate, un equivalente justificado aprobado por un revisor, o deuda registrada".

- [ ] **Paso 1: tests primero** (`exec` inyectado salvo donde se dice):
  - Con `exec` real y `check.js` que imprime `process.env.PIGNOLO_TEST_SEED`: `seed: 42` → el log contiene `42` y `seal.seed === 42`; sin `seed`, `seal.seed` es entero en `[0, 2**32)`.
  - `it.skip` agregado en `tests/a.test.js` con tarea `test-writer` y el archivo en `task.files` → `INTEGRITY` con `weakened[0].kind === 'skip'`; lo mismo con `testAuthorization: true` → `PASS`.
  - Sin tarea, `.only` sin commitear → `INTEGRITY`.
  - Test nuevo sin `Protects:` → `PASS` con `noProtects` que lo lista; con `// Protects: R1 · Breaks if: x` en la línea 1 → no aparece.
  - `pre-merge`, `mutation: true`, cambio en `src/pay.js` con `high-risk-paths: [src/pay.js]`, sin `gates.mutation` → `NO_MUTATION_TOOL`; con comando que sale 1 → `MUTATION`; que sale 0 → `PASS` y `checks.mutation.files` = `['src/pay.js']`; cambio fuera de `high-risk-paths` → la mutación no corre (`checks.mutation === null`).
  - `on-done` con `mutation: true` → la mutación no corre.
  - CLI `--seed abc` → exit 2.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(gate): tests debilitados, semilla registrada y mutación en pre-merge`.

### Task 4: `scripts/sabotage.js` (rojo sobre código commiteado)

**Files:**
- Create: `plugins/pignolo/lib/sabotage.js`, `plugins/pignolo/scripts/sabotage.js`
- Modify: `plugins/pignolo/hooks/handlers/session-start.js` (recuperación)
- Test: `tests/sabotage.test.js`

**Interfaces:**
- `lib/sabotage.js` exporta:
  - `sabotage({ cwd, patchFile, argv, timeoutMs, env }) → { red, exit, files, restored, clean, logTail }`.
  - `recover({ cwd }) → { recovered: boolean, files }`: si existe el candado y su `pid` no está vivo (`process.kill(pid, 0)` lanza `ESRCH`), restaura los archivos que lista y borra el candado; con el `pid` vivo no hace nada.
  - `LOCK = '.pignolo/tmp/sabotage.json'` (relativo a la raíz del worktree; `.pignolo/tmp/` ya está en `.pignolo/.gitignore` desde 3b, y `ensureIgnored` lo asegura).
- Orden de `sabotage`:
  1. `recover` (un candado viejo se restaura antes de seguir; si el `pid` está vivo → error "otro sabotaje en curso").
  2. Árbol limpio: `git status --porcelain --untracked-files=normal` vacío; si no, error con la alternativa "commiteá o guardá tus cambios (commit WIP) antes de sabotear". No se toca nada.
  3. `git apply --numstat` sobre el parche → lista de archivos. Vacía, o alguno en `testPaths`/`protectedTestConfig` (config leída desde `HEAD`), o fuera de la raíz → error, sin tocar nada.
  4. Escribir el candado `{ v: 1, pid, head, files, time }` y **después** `git apply`.
  5. Correr `argv` con `spawnSync(argv[0], argv.slice(1), { shell: false, cwd, timeout, stdio: [ignore, fd, fd] })` sobre un log temporal (mismo patrón que la compuerta, sin `maxBuffer`).
  6. `finally`: `git restore --source=HEAD --staged --worktree -- <archivos que existían en HEAD>` y borrar los que el parche agregó; verificar `git status --porcelain` vacío (`clean`); borrar el candado solo si `clean`.
  - `SIGINT`/`SIGTERM`/`SIGHUP` durante el paso 5: matar al hijo, restaurar como en 6 y salir con 130.
  - `red` = el comando salió ≠ 0 **con el parche aplicado** (un comando que no arranca, `exit` null, no es rojo: `red: false` y error "el comando no arrancó").
- CLI `scripts/sabotage.js --patch <archivo> [--cwd <dir>] [--timeout-min <n>] -- <comando> [args…]` y `scripts/sabotage.js --recover [--cwd <dir>]`. Salida JSON. Exit: 0 rojo demostrado y árbol limpio; 1 el test siguió verde (no protege lo que dice); 2 uso inválido o negativa; 3 **no se pudo restaurar** (mensaje fuerte, con los archivos y el comando `git restore --source=HEAD -- <archivos>` para que lo corra el humano).
- `session-start`: llama a `recover({ cwd })` (sin git si no hay candado: solo `fs.existsSync`); callado si no hubo nada; si restauró, `systemMessage` "pignolo restauró N archivos que un sabotaje interrumpido dejó rotos". Un error de `recover` no rompe el arranque: se avisa.

- [ ] **Paso 1: tests primero** (repos con `makeRepo()`, `src/a.js` + `tests/a.test.js` commiteados; el comando es `process.execPath` con `--test tests/a.test.js`):
  - Parche que rompe `src/a.js` → `red: true`, exit del CLI 0, árbol limpio después, `src/a.js` igual a `HEAD`.
  - Parche inocuo (un comentario) → `red: false`, exit 1, árbol limpio.
  - Árbol sucio (un archivo nuevo sin commitear) → exit 2, el archivo sigue ahí sin cambios.
  - Parche que toca `tests/a.test.js` → exit 2, nada aplicado.
  - Parche que agrega `src/new.js` → después no existe.
  - Candado con un `pid` muerto (se escribe a mano con el `pid` de un proceso que ya salió) y `src/a.js` roto → `--recover` restaura y borra el candado; con `pid` vivo (`process.pid`) → no hace nada.
  - `argv` inexistente (`no-such-binary-xyz`) → `red: false`, error "no arrancó", árbol limpio.
  - `session-start` en proceso con un candado de `pid` muerto → `systemMessage` presente y árbol limpio; sin candado → sin `systemMessage`.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(sabotage): rojo sobre código commiteado con restauración y recuperación`.

### Task 5: holdout (almacén y lectura negada)

**Files:**
- Create: `plugins/pignolo/lib/holdout.js`, `plugins/pignolo/scripts/holdout.js`, `plugins/pignolo/hooks/handlers/private-reads.js`
- Modify: `plugins/pignolo/hooks/hooks.json` (entrada `PreToolUse` `Read|Grep|Glob|Bash|PowerShell` → `private-reads`), `plugins/pignolo/lib/git-guard.js` (`CANARIES` suma `{ family: 'private-read', handler: 'private-reads', payload: { tool_name: 'Read', tool_input: { file_path: '~/.pignolo/holdout/canary/x' } } }`), `plugins/pignolo/hooks/handlers/session-start.js` (`FAMILY_LABEL` del canario nuevo)
- Test: `tests/holdout.test.js`, `tests/private-reads.test.js`

**Interfaces:**
- `lib/holdout.js`: `holdoutDir({ env, cwd, plan })` = `<pignoloHome>/holdout/<repoIdFor({ cwd })>/<plan>`; `PLAN_RE = /^[a-z0-9][a-z0-9-]{0,63}$/`; `privateRoots(env)` = `[<pignoloHome>/holdout, <pignoloHome>/seals]`.
- `scripts/holdout.js`:
  - `save --plan <p> --from <dir>`: `<dir>` tiene que estar dentro de `<raíz>/.pignolo/tmp/holdout/`; copia sus archivos (rutas relativas conservadas) al almacén, rechaza si alguno ya existe allí con otro contenido (no sobrescribe), borra el origen. Salida `{ plan, files }`.
  - `list --plan <p>` → `{ plan, files }` (solo nombres; lo usa el hilo principal para contar, no para leer).
  - `run --plan <p> [--ref <commit>] -- <comando> [args…]`: `git worktree add --detach <tmp> <ref ?? HEAD>` en `os.tmpdir()`, copia el holdout con sus rutas, corre argv sin shell en `<tmp>`, `git worktree remove --force <tmp>` y `git worktree prune` en `finally`. Salida `{ plan, ref, files, exit, pass, logTail }`. Exit 0 si pasa, 1 si falla, 2 uso.
  - `drop --plan <p>`: borra el almacén de ese plan (al cerrar el plan, hito 5).
- `private-reads` (siempre activo, como la escritura protegida; negar a cualquiera salvo `agent_type === 'pignolo:validator'`):
  - `Read` (`file_path`), `Grep`/`Glob` (`path`, y `pattern` si es absoluto o empieza con `~`): la ruta resuelta (con `resolveClean` de `lib/paths.js`, `~` del entorno) cae **dentro** de un `privateRoot`, o es un **ancestro** de uno y la búsqueda es recursiva (`Glob` siempre; `Grep` siempre, porque recorre) → deny.
  - `Bash`/`PowerShell`: el texto del comando menciona `.pignolo/holdout`, `.pignolo\holdout`, `.pignolo/seals`, `.pignolo\seals`, la ruta absoluta de un `privateRoot`, o `PIGNOLO_HOME` → deny; salvo que el comando sea exactamente `node <ruta>/scripts/(holdout|gate|sabotage).js …` con `<ruta>` = raíz del plugin (`CLAUDE_PLUGIN_ROOT` o la del propio handler). Búsqueda recursiva (`find`, `rg`, `grep -r`/`-R`, `ls -R`, `tree`, `Get-ChildItem -Recurse`/`gci -r`/`dir -r`, `dir /s`, `Select-String` con `-Path` recursivo) cuyo argumento de ruta es `~`, `$HOME`, `$env:USERPROFILE`, `/`, `C:\`, `/c/`, `/mnt/c` o un ancestro de `pignoloHome` → deny. Límite declarado en el mensaje del spec: es best-effort (§8.3); la protección fuerte es que el holdout vive fuera del repo y del worktree de la tarea.
  - Mensaje: "pignolo bloqueó la lectura: el holdout y los sellos solo los lee el validator por los scripts de pignolo. Alternativa: trabajá con los tests del repo; si necesitás el resultado del holdout, pedíselo al hilo principal."

- [ ] **Paso 1: tests primero:**
  - `holdout.js save` desde `.pignolo/tmp/holdout/p1/tests/acc.test.js` → queda en `holdoutDir(p1)/tests/acc.test.js`, el origen no existe; `--from` fuera de `.pignolo/tmp/holdout/` → exit 2; plan `../x` → exit 2; segundo `save` con el mismo archivo y otro contenido → exit 2 y el primero intacto.
  - `run` con un holdout que pasa contra `HEAD` → `pass: true`; con uno que falla → exit 1; después no queda la worktree (`git worktree list` con una sola entrada) ni la carpeta temporal.
  - `private-reads` (tabla, en proceso, `env` con `PIGNOLO_HOME` y `HOME` temporales): `Read` de un archivo del holdout → deny; el mismo con `agent_type: 'pignolo:validator'` → pasa; `Glob` con `path` = home → deny; `Glob` con `path` = raíz del repo → pasa; `Grep` con `path` = `<home>/.pignolo` → deny; `Bash` `cat ~/.pignolo/holdout/x` → deny; `Bash` `find ~ -name "*.test.js"` → deny; `Bash` `find . -name "*.test.js"` → pasa; `Bash` `node <plugin>/scripts/holdout.js run --plan p1 -- node --test` → pasa; `PowerShell` `Get-ChildItem -Recurse $env:USERPROFILE` → deny; con `PIGNOLO_DISABLED=1` sigue negando.
  - Canario: `canaryDown` con el handler real → sin la familia `private-read`; con un handler que siempre pasa → la informa.
  - Un test de humo por el launcher (`runLauncher('private-reads', …)`) → exit 2 con el mensaje.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(holdout): almacén fuera del repo y lectura negada salvo al validator`.

### Task 6: `protect-paths` por rol (escritura de tests en el momento)

**Files:**
- Modify: `plugins/pignolo/hooks/handlers/protect-paths.js`
- Test: `tests/protect-paths.test.js` (casos nuevos)

**Interfaces:**
- Consume: `readRun`, `mainRoot` (`lib/project.js`), `readProjectConfig` (con `ref = task.testRef ?? task.base` si hay tarea; sin tarea, la copia de trabajo), `matchAny`.
- Regla nueva, después de las existentes y solo si el proyecto no está apagado (`guardOff` → pasa, como hoy) y el payload trae `agent_type`:
  - `pignolo:implementer` o `pignolo:fixer`: ruta (relativa a la raíz del worktree del `cwd`) en `testPaths` o `protectedTestConfig` → deny, salvo `task.testAuthorization === true` y la ruta en `task.files`; `.pignolo/project.md` siempre deny.
  - `pignolo:test-writer`: ruta fuera de `testPaths`, o en `protectedTestConfig` → deny.
  - Otro `agent_type`, o sin `agent_type` (hilo principal, o un payload que no lo trae) → sin regla por rol (Review Focus 5; la verificación posterior sigue en el `handback-gate` y la compuerta).
  - Un `project.md` ilegible con un escritor pignolo → deny con la ruta (falla cerrado, como el `handback-gate`).
- Mensajes con `Alternativa:`: implementer/fixer "un test cambia solo con `test-authorization`: devolvé BLOCKED y nombrá el test"; test-writer "escribí solo en `test-paths`; lo demás lo pide el hilo principal".

- [ ] **Paso 1: tests primero** (en proceso; repo con `project.md` que declara `test-paths: [tests/]`):
  - `implementer` → `Write tests/a.test.js` deny; `Write src/a.js` pasa; con `testAuthorization: true` y `tests/a.test.js` en `task.files` → pasa; con autorización y otra ruta de test → deny; `Edit .pignolo/project.md` con autorización → deny.
  - `test-writer` → `Write src/a.js` deny; `Write tests/b.test.js` pasa.
  - Sin `agent_type` → `Write tests/a.test.js` pasa.
  - `agent_type: 'pignolo:explorer'` → pasa (no escribe, pero la regla no es suya).
  - `/pignolo:off` activo → pasa.
- [ ] **Paso 2: rojo.** **Paso 3: implementar.** **Paso 4: commit.** `feat(protect-paths): escritura de tests por rol en el momento`.

## Ola 2

Unir las Tasks 3 a 6 a `core/hito-4a` (en ese orden; conflictos triviales en `session-start.js`, que tocan la 4 y la 5). Suite completa una vez.

### Task 7: pruebas de punta a punta de §15 (`sabotage`, `holdout`)

**Files:**
- Create: `tests/e2e-hito-4a.test.js`

- [ ] **§15 `sabotage`: interrumpido a mitad → árbol restaurado.** Repo real; `scripts/sabotage.js` lanzado con `spawn` y un comando que escribe un archivo-señal y duerme 30 s; cuando aparece la señal, `child.kill()` (en Windows es `TerminateProcess`: ningún `finally` corre). Después: el árbol tiene el parche aplicado **y** el candado; `scripts/sabotage.js --recover` → exit 0 y `git status --porcelain` vacío. Segundo caso: igual, pero en vez de `--recover` se corre el handler `session-start` en proceso → árbol limpio y `systemMessage`.
- [ ] **§15 `holdout`: el implementer no lo encuentra ni lo lee con Glob, Grep, Read ni Bash.** Holdout guardado con `holdout.js save`; por el **launcher real** (`runLauncher('private-reads', …)`) con `agent_type: 'pignolo:implementer'` y `cwd` = el repo: `Read` de la ruta exacta, `Glob` `**/*.test.js` con `path` = home, `Grep` `Protects` con `path` = home, `Bash` `ls ~/.pignolo/holdout`, `Bash` `find ~ -name "*.test.js"` → los cinco exit 2. Y `Glob` `**/*.test.js` sobre el repo → exit 0 y la lista no contiene el archivo del holdout (el almacén está fuera del repo).
- [ ] **Guardia (§11.6):** `runGuard` con `node <plugin>/scripts/sabotage.js --patch p.diff -- node --test tests/a.test.js` en `default`, `acceptEdits`, `auto` y `bypassPermissions` → pasa; `git restore --source=HEAD -- src/a.js` directo sigue negado.
- [ ] **Compuerta con semilla:** `scripts/gate.js --level on-done --seed 7` dos veces sobre el mismo árbol → los dos sellos tienen `seed: 7`.
- [ ] Commit: `test(e2e): sabotaje interrumpido, holdout invisible y guardia del sabotaje`.

### Task 8: cierre de la parte 4a

- [ ] `plugins/pignolo/.claude-plugin/plugin.json` → `0.5.0`; entrada `## 0.5.0 — <fecha>` en `CHANGELOG.md` (sabotaje, integridad por diff, holdout, semilla, mutación, escritura por rol; D-4-1).
- [ ] Spec: §8.2 (estados nuevos y prioridad, `weakened`, `noProtects`, semilla), §8.3 (`private-reads` siempre activo; `protect-paths` por rol y su límite sin `agent_type`), §9.2 (forma de `sabotage`: parche, argv, candado, recuperación en `SessionStart`), §6 (D-4-1), §15 (`sabotage`, `holdout` con lo medido).
- [ ] `tests/manual/hito-4a.md`: en una sesión real, (1) un `implementer` intenta `Write` en `tests/` → negado en el momento (confirma `agent_type` en `PreToolUse` dentro de un subagente, hipótesis abierta desde 3a); (2) Ctrl+C durante un `sabotage` largo → árbol limpio o restaurado al próximo arranque; (3) un `Glob` desde el home de un subagente → negado; (4) el canario muestra la familia nueva sana.
- [ ] `npm test` completo verde; `docs/STATE.md` actualizado (qué quedó, siguiente: plan de 4b).
- [ ] Revisión final opus de `main..core/hito-4a`, pasada de arreglos, confirmación acotada; unión a `main` en local. El push, solo con el OK del autor.

## Decisiones que necesita el autor (parte 4a)

Ninguna para ejecutar 4a: no suma dependencias, no gasta tokens de agentes y no cambia un contrato público (los estados nuevos del sello son internos; `gates.mutation` es opcional y no hace nada sin `mutation: true`). D-4-1 es técnica y queda registrada; si el autor prefiere darle Bash al `test-writer`, se cambia la tabla de §6 en 4b.

Para 4b sí: el costo de las evals de `test-writer`, `implementer` y `review-testability` (las dos últimas en WSL2, que todavía no está preparado).
