# Hito 8 del núcleo: `/pignolo:init`, adopción y medición. Plan de implementación (método liviano)

> **Para quien ejecute:** olas de a lo sumo dos tareas en paralelo (CLAUDE.md: "uno o dos frentes a la vez"), implementadores sonnet, sin revisión por tarea, una revisión final opus por parte con una pasada de arreglos. Casillas `- [ ]`. Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Lo que no se midió está marcado "a verificar" y tiene una tarea dueña.

**Este hito es RIESGOSO** (escribe `.git/config`, `.claude/settings.local.json`, `.gitattributes`, `.gitignore` y `project.md` en el repo de otra persona, copia datos privados de la auto-memoria a un repo que se versiona, agrega una regla a la guardia y su checklist de adopción incluye borrados en el entorno del autor). **Pide la auditoría previa en dos pasos** de las Tasks 4, 5, 6 y 8 (D-8-6) antes de ejecutarlas; el resto se cubre con la revisión final.

**Objetivo (spec §18 punto 8, §14, §10.5, §0):** que pignolo se pueda activar en un proyecto sin escribir `project.md` a mano y que el autor lo adopte en su entorno. `/pignolo:init` deduce `type`, `gates`, `test-paths` y rutas de riesgo de los archivos del proyecto y los confirma uno por uno; crea `.pignolo/`, `.gitattributes`, el `.gitignore` de `.pignolo/` y el `SECURITY.md` corto; fija la política de reflog; propone desactivar la auto-memoria y la migra a `learnings/proposed/`; lista las reglas existentes del proyecto como `domain-rules`; declara `gates.mutation` y `protected-test-config`; deja escrito cómo usa la semilla el `on-done`. Cierra los límites que los hitos 3b y 7 dejaron "para el hito 8" y mide el criterio de éxito de la v1 (§0).

**Arquitectura:** dos partes, como en los hitos 3 a 7. **8a** es todo lo determinista (librerías, el script `scripts/init.js`, la regla de la guardia, el marcador `{seed}`, tests de punta a punta y el kit de defectos sembrados): no gasta tokens de agentes. **8b** es la skill `init`, las plantillas, las evals `agents` del `debugger` (§18 punto 8), el checklist manual de adopción y la medición con un plan real, con costos que decide el autor.

**Stack:** Node ≥ 22 sin dependencias npm, `node:test`, git ≥ 2.31. **Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` §0 (criterio de éxito), §3.2 (`project.md`), §3.3, §8.2 (compuerta, semilla, mutación), §8.3 (guardia), §10.1 y §10.5 (auto-memoria), §11.6 (reflog), §14 (`/pignolo:init`, seguridad, entorno del autor, convivencia), §15 (`agents` del `debugger`, checklist manual), §18 punto 8. **Gaps:** `docs/gaps.md` (G8, G9, G10, G14, G17).

## Alcance: por qué el hito 8 se parte en dos y de qué depende

- **8a (versión siguiente a la última publicada; hoy 0.7.1, y con 5b, 6a, 6b, 7a y 7b serían 0.8.0 a 0.12.0, así que 8a = 0.13.0 y 8b = 0.14.0: ajustar a lo publicado al ejecutar):** `lib/init-detect.js`, `lib/project-md.js`, `lib/init-seed.js`, `lib/init-actions.js`, `lib/auto-memory.js`, `lib/claude-settings.js`, `scripts/init.js`, `{seed}` en `lib/gate.js`, la regla `pignolo-init` de la guardia, `tests/e2e-hito-8.test.js` y el kit `tests/seeded-defects/`. Sin evals.
- **8b (8a + 0.1):** skill `init`, `templates/SECURITY.md`, README, evals del `debugger`, `tests/manual/hito-8.md` (adopción en el entorno del autor y medición del criterio de éxito con el plan real).
- **Dependencias (los hitos 6 y 7 NO están construidos; se usan sus nombres exactamente como los definen sus planes `2026-09-30-hito-6-continuidad.md` y `2026-09-30-hito-7-ramas-y-paralelismo.md`):**
  - **Hito 6 (requisito duro de la Task 5, parcial de las Tasks 9 y 11):** `lib/learnings.js` con `proposeLearning({ main, id, source, evidence, scope, body }) → ok|refused` (`source` ∈ `session | web | human`, `scope` ∈ `project | general`; sin `evidence` → `refused: 'no-evidence'`) y `scanLearning({ text, piiPatterns }) → { findings: [{ kind: 'pii'|'secret'|'permission'|'size', match }] }`; `lib/state-store.js` con `KINDS`, `stateDir(main, kind)` y `readEntries({ main, kind }) → { entries, errors }`; la skill `/pignolo:close-session` (la que valida lo migrado con el `learning-validator`); el hook de egreso (`hooks/handlers/egress.js`). Sin el hito 6 la Task 5 queda `BLOCKED` y los casos que lo usan se saltan con motivo; el resto del hito avanza.
  - **Hito 7 (requisito de la Task 1 y de la Task 9):** la clave aditiva `gates.pre-merge-files` (con el marcador `{files}`, R-6 del hito 7), `.pignolo/worktrees/<slug>` como ubicación de las worktrees de tarea, `contract/*`, `int/*`, `queue/*`. Si el hito 7 no está, `init` no escribe `pre-merge-files` (clave desconocida = aviso de `project-config`) y la Task 9 salta sus casos de worktree.
  - **Hito 5 (ya en `main`, 0.7.1):** `readProjectConfig` y `projectState` (la definición de "pignolo activo"), `lib/plan-check.js`, la regla `pignolo-plan` como modelo de la regla `pignolo-init`.
- **Fuera de este hito, con dueño:** `SECURITY-BASELINE.md` y la entrevista de seguridad son de la **v1.1** (decisión del autor, 2026-09-29); Engram no está en la v1 (D-6-1); `/pignolo:setup --upgrade` sigue sin existir.

## Global Constraints

- Node ≥ 22, sin dependencias npm. `npm test` para la suite completa, nunca `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits con `git commit -F <archivo>`; archivos LF sin BOM; nada de texto largo por comillas de la shell (regla 6 de `rules/core.md`).
- **Nada se borra, nada se pisa.** Ningún código de este hito llama a `rm`, `unlink`, `rmSync` (salvo temporales de tests con `makeTempDir()`), `git reset`, `branch -D`, `checkout ref -- path` ni `stash`. Todo archivo existente que cambie se respalda antes (`<archivo>.pignolo-bak-<ts>`, como `setup.js permissions --apply`). Nunca `commit` ni `push` desde un script: el commit lo propone la skill y lo da el humano.
- Todos los scripts nuevos: salida JSON por stdout; exit 0 ok, 1 fallo con `kind` estructurado (G7: `{ ok, refused?: '<motivo>', reason, ... }`, nunca solo texto), 2 uso incorrecto, **3 = no se pudo dejar el estado consistente**; cada fallo con `Alternativa:` en stderr.
- Escrituras atómicas (temp + rename), LF, sin BOM. Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js`. **Todo test que toque la configuración de Claude o la sombra usa `PIGNOLO_HOME` y `CLAUDE_CONFIG_DIR` temporales**: ninguno toca el `~/.claude` ni el `~/.pignolo` reales.
- Todo git del script entra por un ejecutor inyectable (`opts.run`, patrón de `readProjectConfig`), nunca por un envoltorio en el `PATH` (medido en el hito 7: un `git.cmd` primero en el `PATH` no lo usa `execFileSync('git')`). Todo test que afirme "no se llamó a X" afirma antes que el registro **no está vacío**.
- Los comandos de proyecto que `detect` propone se **muestran**, nunca se ejecutan para "probarlos" (un `npm test` de un proyecto ajeno puede tardar, borrar o publicar). `init` no instala nada: instalar una herramienta es una dependencia, decisión del humano (CLAUDE.md).
- El repo es público: fixtures sintéticos; nada del proyecto del autor, personas ni credenciales. Los informes de la medición con el plan real (Task 13) van a `local/` (fuera de git); a `docs/benchmarks.md` solo cifras agregadas.
- Claves y variables nuevas son **aditivas**: un `project.md` de hoy se lee igual y una compuerta sin `{seed}` no cambia (D-8-3).

## Método de ejecución y economía de tests

El de los hitos 4 a 7: worktrees a mano desde la etiqueta del contrato (`contract/hito-8a/v1` tras la ola 0), implementadores sonnet en segundo plano con brief e informe en archivo, **respondiendo una sola vez y sin procesos vivos** (G9). Cada implementador corre **solo sus archivos** con `node --test --test-reporter=dot <archivo>` (G8); la **suite completa corre una sola vez por unión**, con la máquina tranquila, y una vez al cierre. Tests de tabla desde el spec; handlers en proceso (`require(handler).run(input, ctx)`) y **un** test de humo por el launcher real por hook tocado (Task 8). Los tests de `init-actions`, `auto-memory` y `claude-settings` usan repos reales de `makeRepo()` y directorios de configuración temporales: el riesgo está en cómo responden git y el sistema de archivos. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión" y no cuenta. Primer paso de cada tarea de ola >= 1: `git merge-base --is-ancestor contract/hito-8a/v1 HEAD`; si falla, `BLOCKED`.

**Estimación de tests nuevos de 8a: ~174 subtests en 9 archivos** (`init-detect` 30, `project-md` 18, `gate-seed` 12, `init-actions` 26, `auto-memory` 24, `claude-settings` 14, `init-cli` 28, `guard-init` 12, `e2e-hito-8` 10), más los casos nuevos de `project-config.test.js` y `gate.test.js`. **8b: ~32** (`skill-init` 8, `seeded-defects` 14, `eval-debugger-cases` 10). **Total ≈ 206** (rango 165 a 260; hipótesis, sin medir). La línea base se mide en la rama al empezar la ola 0.

## Review Focus

1. **`init` escribe algo que el humano no aprobó, o pisa algo suyo.** Cada paso corre solo si su id está en `approved` del plan que el humano confirmó; `project.md` existente se fusiona sin tocar un valor ya declarado (R-3, R-4); `.git/config`, `.claude/settings.local.json` y `.gitattributes` se editan por clave o por línea, con respaldo y sin reescribir lo demás; un JSON inválido no se sobrescribe. Dueñas: **Tasks 2, 4 y 6**.
2. **La migración de la auto-memoria filtra datos.** La auto-memoria puede tener rutas, nombres, tokens o datos del dominio, y `learnings/` se versiona (el repo puede ser público o compartido). Todo archivo se escanea con `scanLearning` antes; con un hallazgo no se propone y el informe da el archivo y el tipo, **nunca el texto**; se copia, no se mueve ni se borra; lo propuesto lo valida `learning-validator` y lo acepta el humano antes de que valga algo (R-14). Dueña: **Task 5**.
3. **Una compuerta deducida que da verde sin probar nada.** `npm test` sin script real (`echo "Error: no test specified" && exit 1` es lo que trae `npm init`), un `on-done` que no corre tests, `type: code-tested` sin un solo test: todo eso debe caer en `code-untested` o quedar sin declarar con aviso, nunca en un `PASS`. Dueña: **Task 1** (y `gates` de §15 en el e2e de la **Task 9**).
4. **El `on-done` y la semilla.** `{seed}` se expande igual en `cmd.exe` y en `sh` (no se usa `%VAR%` ni `$VAR`); solo se emite para runners con la opción **verificada** contra su documentación; un comando sin `{seed}` sigue como hoy. Dueña: **Task 3**.
5. **Idempotencia, repos compartidos y worktrees.** Dos corridas seguidas dejan el repo idéntico (cero diff); `init` desde una worktree enlazada escribe en el checkout principal (`mainRoot`); fuera de un repo git, `refused: 'not-a-repo'`; en el repo compartido del proyecto de origen no commitea ni empuja (D-8-7). Dueñas: **Tasks 7 y 9**.
6. **Un subagente usa `init` para aflojar la protección.** `init.js` lo opera solo el hilo principal: la regla `pignolo-init` lo niega a todo subagente (modelo: `pignolo-plan`), y como `project.md` y `protected-test-config` son lo que protege los tests, un `apply` de un subagente sería la forma de desarmarlos. Dueña: **Task 8**.

## Rulings del plan (técnicos, registrados)

- **R-1: `init` es un script con subcomandos; la skill solo conversa.** `scripts/init.js` tiene `detect` (solo lectura), `preview` (lo que escribiría, sin escribir), `apply --plan <archivo>` (escribe) y `verify` (relee y mide). Las escrituras en `.git/config`, `.claude/` y `.pignolo/` las hace el script, no Edit/Write: `protect-paths` niega `.git` y `.claude` a Edit/Write incluso al hilo principal (§8.3) y la guardia niega `git config gc.*` (`CONFIG_ALLOW`: solo claves de una lista corta). Precedente: `setup.js permissions --apply` escribe `settings.json`. El script corre fuera de todo hook; lo que lo limita es R-3 y la regla de la Task 8.
- **R-2: raíz de trabajo = checkout principal.** Todo se calcula con `mainRoot(cwd)` de `lib/disabled.js`: desde una worktree enlazada se escribe en el principal (`project.md`, `/pignolo:off` y `run.json` se leen ahí). Fuera de un repo git: exit 1, `kind: "not-a-repo"`, `Alternativa:` "corré `git init` primero".
- **R-3: nada se escribe sin el sí del humano en su propio turno.** `apply --plan <archivo>` recibe un JSON `{ v: 1, approved: [<id de paso>], answers: { ... }, proposal: { ... } }` que la skill escribe con Write (nunca por comillas de la shell) después de que el humano confirmó cada paso. Los ids de paso: `project-md`, `reflog`, `gitattributes`, `ignores`, `security-md`, `auto-memory-off`, `migrate-memory`. **Un paso que no está en `approved` no corre** (`status: "skipped", reason: "not-approved"`), y un id desconocido es exit 2. `preview` produce exactamente el mismo informe sin escribir (el test de la Task 7 compara ambos). Nunca `commit` ni `push` (Global Constraints).
- **R-4: `project.md` existente se fusiona, no se reescribe.** `mergeProjectMd(existingText, proposal)` agrega las claves que faltan, deja intactos los valores declarados y el cuerpo de notas, y **lista `conflicts`** para las claves donde el humano declaró algo distinto de lo deducido (nunca las cambia). Un `project.md` ilegible (`YamlLiteError`) no se toca: `refused: 'invalid-project-md'`. Hay respaldo `project.md.pignolo-bak-<ts>` si cambia algo. Es lo que cubre la regla global del autor de no sobrescribir un archivo sin leerlo.
- **R-5: se deduce solo de archivos que existen, con la fuente de cada clave, y lo que no se puede deducir queda sin declarar.** Cada valor de `Detection` lleva `source` (archivo y clave de donde salió) y la skill se la muestra al humano. Nada se inventa: sin manifiesto reconocido, `type` queda sin declarar con aviso (el modo conservador de §3.2 sigue). **`pii-patterns` nunca se deduce**: son datos del dominio, se piden en la entrevista (R-15). Los globs usan la sintaxis de `lib/globs.js` y solo se emiten los que apuntan a algo que existe (un `fixtures/` que no existe no se declara).
- **R-6: reglas de `type` y de las compuertas deducidas (tabla literal en la Task 1).** `code-tested`: hay manifiesto, un comando de test que **no es el placeholder del instalador** (`/no test specified/i`, `/echo\s+"?Error/i`) y al menos un archivo que cae en `test-paths`; `code-untested`: hay manifiesto pero no se cumple lo anterior (`on-done` queda sin declarar: el hito 3a ya hace que una compuerta vacía en `code-untested` no dé verde); `docs`: solo `*.md`/`*.mdx`/`*.rst` y sin manifiesto; `script`: un solo archivo ejecutable sin manifiesto. `on-edit` es un chequeo corto (typecheck o lint si existe), `on-done` = tests + typecheck de tests, `pre-merge` = `on-done` + lint + build si existen, y `pre-merge-files` solo para runners cuyo comando acepta una lista de archivos (el hito 7 lo exige con el marcador `{files}`). Los comandos se encadenan con `&&` (válido en `cmd.exe` y en `sh`). Gestor de paquetes por lockfile; los scripts se llaman `<gestor> run <script>`.
- **R-7: `{seed}`, marcador nuevo y aditivo de los comandos de compuerta (D-8-3).** `lib/gate.js` lo reemplaza por la semilla elegida antes de lanzar el comando (el mismo entero que ya exporta como `PIGNOLO_TEST_SEED`). Razón: el comando corre con `shell: true`; en Windows nativo la shell es `cmd.exe` (`%VAR%`) y en WSL/macOS `sh` (`$VAR`): una variable de entorno en el texto del comando no es portable, un marcador sí. El sello gana `seedInCommand: boolean` (`true` si algún comando de la corrida lo traía): pignolo deja de ignorar si la semilla se usó (hito 4a: `seedOffered` sigue). Solo se emite `{seed}` para runners cuya opción se **verificó** (tabla `SEED_ARGS` de la Task 3, cada fila con `verified` y la URL de la documentación); los demás quedan `seedPlan: 'unused'` y la skill lo dice. **A verificar al ejecutar** (Task 3, paso 0): jest `--randomize --seed`, `node --test` (¿`--test-random-seed`?), pytest-randomly `-p randomly --randomly-seed`; vitest `--sequence.shuffle --sequence.seed`, `go test -shuffle=<n>` y `flutter test --test-randomize-ordering-seed` se consultan igual con Context7 o la web, no se toman de la memoria.
- **R-8: `protected-test-config` deducido.** Lista los archivos de configuración del runner **que existen** (`vitest.config.*`, `jest.config.*`, `playwright.config.*`, `cypress.config.*`, `pytest.ini`, `tox.ini`, `.coveragerc`, `conftest.py` de la raíz, `stryker.conf.*`, el archivo de umbral de mutación, `analysis_options.yaml` de Flutter) y **`package.json`** cuando tiene `scripts.test` real (R-10). `.pignolo/project.md` ya entra solo (`lib/project-config.js`). Es la lista que lee `lib/test-integrity.js` (hito 4a) para marcar debilitamientos, así que un umbral de mutación o un `coverageThreshold` en esos archivos queda protegido.
- **R-9: los runners que recorren el árbol y `.pignolo/worktrees` (límite b del hito 3b, que el hito 3b mandó al hito 7 y a este).** `init` **no edita la configuración del runner** (está en `protected-test-config` y es del proyecto): `detect` devuelve `runnerExcludes: [{ runner, walksDotDirs: 'yes'|'no'|'unknown', file, snippet }]` con el fragmento exacto (vitest `test.exclude` suma `'.pignolo/**'`; jest `testPathIgnorePatterns` suma `'/.pignolo/'`; pytest `norecursedirs` suma `.pignolo`; Go ignora los directorios que empiezan con `.`, así que `walksDotDirs: 'no'`; Flutter solo mira `test/`) y la skill se lo muestra; **lo aplica el humano**. `verify` avisa si el runner sigue sin excluirlo. Lo que no se sabe (`node --test`, `cargo`) queda `unknown` y se mide en `tests/manual/hito-8.md` punto 6 (el punto 11 del checklist del hito 3b, repetido con un runner real).
- **R-10: `package.json` entra por defecto en `protected-test-config` (técnica, reversible).** Razón: un `implementer` que cambia `"test": "echo ok"` en `scripts` desarma la compuerta sin tocar un solo test, y `weakenings` (hito 4a) solo mira lo que está en la lista. Costo: un `implementer` que necesita tocar `package.json` queda `BLOCKED` y lo escala, que ya es el camino para agregar una dependencia (decisión del humano). La skill lo muestra como "recomendado" y el humano puede sacar la línea de `project.md`.
- **R-11: `gates.mutation` y `mutation` (hito 4a), sin instalar nada.** `detect` reconoce la herramienta **solo si ya está instalada o declarada** en el proyecto: `@stryker-mutator/core` en `devDependencies`, `mutmut` en `requirements*`/`pyproject`, `cargo-mutants` (por `.cargo/mutants.toml`), `go-mutesting`. Si hay una, devuelve `mutation: { tool, command, configFile, configSnippet, thresholdFile }` con el comando de su documentación (a verificar en la Task 1) y el fragmento de configuración que lee `PIGNOLO_MUTATE_FILES` (uno por línea; p. ej. Stryker: `mutate: process.env.PIGNOLO_MUTATE_FILES?.split('\n')` en su config). **El script no edita la configuración de la herramienta**: la skill muestra el fragmento y el humano lo aplica; recién con su "listo" se declara `mutation: true` y `gates.mutation`. Sin herramienta: la clave **no se declara** y el informe dice "mutación sin declarar: instalar una herramienta es decisión suya (dependencia)"; así no aparece un `NO_MUTATION_TOOL` que bloquee un `pre-merge`. El archivo de umbral va a `protected-test-config` (R-8).
- **R-12: política de reflog con la función que ya existe.** El paso `reflog` llama a `setReflogPolicy({ cwd })` de `lib/git-backup.js` (escribe `gc.reflogExpire=never` y `gc.reflogExpireUnreachable=never` con `--local`) y antes lee los dos valores con `git config --local --get`: si ya valen `never`, `status: "skipped", reason: "already-set"`. Es lo único independiente de los hooks del respaldo (§11.6), por eso va en `init` y no en un hook. La guardia le niega `git config gc.*` a cualquier comando de un agente; por eso lo corre el script, con el sí del humano.
- **R-13: `.pignolo/.gitignore` ya versionado (límite a del hito 3b).** El paso `ignores` agrega con `ensureIgnored` (`lib/pignolo-gitignore.js`) las líneas que hoy escribe `run.js start`. Se **mueve la constante** `IGNORED` de `scripts/run.js` a `lib/pignolo-gitignore.js` como `PIGNOLO_IGNORED` y `run.js` la importa (un solo origen; guarda de regresión: `run.js start` no cambia). El informe dice si `.pignolo/.gitignore` está versionado y quedó modificado (`trackedModified: true`) y la skill propone commitearlo **junto con `project.md`, antes de abrir cualquier flujo**: así `run.js start` no lo vuelve a modificar y `risk.js --diff HEAD` no lo cuenta (el e2e de la Task 9 lo prueba con `git status --porcelain` vacío).
- **R-14: migración de la auto-memoria.** Ubicación (observada en esta sesión con la ruta de la memoria del autor): `<dir de config de Claude>/projects/<slug>/memory/`, con `slug` = la ruta absoluta del checkout principal con cada carácter no alfanumérico reemplazado por `-` (`D:\pignolo` → `D--pignolo`); `<dir de config>` sale de `claudeDirs(env)` de `lib/home.js` (incluye `CLAUDE_CONFIG_DIR`). **A verificar en la Task 5** contra la documentación de memoria de Claude Code (<https://code.claude.com/docs/en/memory>): el nombre exacto de la clave `autoMemoryEnabled` (R-16), si existe una clave para cambiar la carpeta, y el formato de los archivos (frontmatter `name`/`description`/`type`, e `MEMORY.md` como índice, que **no** se migra). Reglas: (1) se **copia**, nunca se mueve ni se borra el original; (2) cada archivo pasa por `scanLearning` y uno con hallazgos o con `size` **no se propone**: `skipped: { file, kinds: ['secret'] }`, sin texto; (3) lo que pasa se propone con `proposeLearning({ main, id, source: 'session', evidence: 'auto-memory:<archivo>#<sha12>', scope: 'project', body })` (la auto-memoria la escribió Claude en sesiones, a partir de lo que dijo el humano: `session`, no `web`; y el `learning-validator` igual la filtra); (4) idempotente por contenido: si ya hay una entrada (en `proposed/`, `accepted/` o `rejected/`) con el mismo `#<sha12>` en su `evidence`, `skipped: 'already-migrated'`; (5) el `id` es `<fecha de hoy>-automem-<slug del archivo>`; (6) lo migrado queda `status: proposed`: **no vale nada hasta que `/pignolo:close-session` (hito 6) lo valide y el humano lo acepte**. Los archivos de tipo `user` (preferencias de la persona) no son del proyecto: se **listan y no se migran** (van a `~/.claude/CLAUDE.md`, que es suyo). El paso es de dos fases con dos síes: `migrate-memory` solo copia, `auto-memory-off` solo cambia la clave; así se puede desactivar sin migrar y migrar sin desactivar.
- **R-15: `pii-patterns`, `language`, `profile` y el contacto de `SECURITY.md` salen de la entrevista, no de los archivos.** Un paso por mensaje, como `setup`. Cada `pii-pattern` se valida con `new RegExp` y `validatePiiPattern` rechaza uno que coincide con la cadena vacía o con una sola letra (`refused: 'too-broad'`: bloquearía todo por egreso del hito 6); un patrón inválido no llega a `project.md` (el hito 5 ya lo rechaza al leerlo; acá se frena antes).
- **R-16: `autoMemoryEnabled: false` en `.claude/settings.local.json` (§10.5).** `lib/claude-settings.js` lee el archivo (si no existe, parte de `{}`), fusiona **solo** esa clave (nombre en la constante `AUTO_MEMORY_KEY`, un único punto a corregir si la verificación de R-14 lo cambia), conserva el resto del JSON y su orden, respalda con `.pignolo-bak-<ts>` si el archivo existía, y escribe atómico. JSON inválido → `refused: 'invalid-json'` sin tocar nada. Si ya vale `false` → `skipped: 'already-set'`. `settings.local.json` es de la persona (Claude Code lo ignora en git por defecto: a verificar que `.gitignore` o `.git/info/exclude` lo cubran; si no, el informe lo avisa y no lo arregla).
- **R-17: `domain-rules` = rutas que existen, sin leer su contenido.** `detect` busca `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, `docs/sessions/*.md`, `docs/rules/*.md`, `CONTRIBUTING.md` y devuelve **la lista de rutas**; `init` no lee ni modifica su contenido (convivencia de §10.1/§14: pignolo lee `domain-rules` y no toca el repo compartido). Una ruta que apunta fuera del repo se descarta.
- **R-18: `SECURITY.md` solo si falta, desde plantilla, con una pregunta.** `templates/SECURITY.md` (Task 10) con tres marcadores (`{{project}}`, `{{supported}}`, `{{channel}}`). Si ya existe un `SECURITY.md` (o `.github/SECURITY.md`, o `docs/SECURITY.md`): `skipped: 'exists'`, nunca se pisa. El canal sale de la entrevista (una pregunta; sin respuesta, el texto "reporte privado de GitHub: habilitalo en Security → Report a vulnerability", que **lo habilita el humano**, §14). Lo legal se dice como "requisitos", nunca "cumple" (§14).
- **R-19: la adopción en el entorno del autor es una lista que ejecuta el humano, no un script (D-8-1).** Ningún código de este hito desinstala plugins, edita `~/.claude/settings.json` ni quita nada de ECC. `tests/manual/hito-8.md` (Task 13) la lista paso a paso, cada uno con su confirmación y el zip de respaldo de `~/.claude` primero; el único apoyo automático es `setup.js check` (ya detecta superpowers y la allowlist).
- **R-20: versiones y publicación.** 8a sube a la versión siguiente a la última publicada y 8b a la siguiente; cada una con su entrada en el CHANGELOG. **Unir las ramas `core/hito-8a` y `core/hito-8b` a `main` y publicar son del autor.** El plan no empuja nada.

## Qué se verificó al escribir este plan

Lectura del repo en `main` (plugin 0.7.1) y de los planes de los hitos 5, 6 y 7. **Repo:** `lib/project-config.js` ya lee `type`, `gates` (`on-edit`, `on-done`, `pre-merge`, `live-check`, `mutation`), todas las listas de §3.2, `deps-install`, `mutation`, `presentation` y `canvas-consent`, y avisa "corré /pignolo:init" sin `project.md` (el texto no cambia); `lib/yaml-lite.js` solo admite escalares, listas en bloque y mapas de un nivel (un valor que empieza con `[` o `{` es error, por eso `{files}` y `{seed}` van dentro de un comando que no empieza así y las comillas se eligen según el contenido); `lib/git-backup.js` **ya trae `setReflogPolicy`** y `tests/git-backup.test.js` lo prueba (R-12 lo reutiliza); `lib/pignolo-gitignore.js` (`ensureIgnored`) es el único escritor de `.pignolo/.gitignore` y `scripts/run.js` tiene la constante `IGNORED` (`.gitignore`, `run.json`, `.disabled`, `tmp/`, `worktrees/`); `lib/git-guard.js` solo deja a `git config` escribir claves de `CONFIG_ALLOW` y niega `gc.*` y `-c` con claves peligrosas; `protect-paths` niega Edit/Write a `.git` y `.claude` (R-1); `lib/gate.js` corre con `shell: true`, elige la semilla (`crypto.randomInt(0, 2 ** 32)`) y la exporta como `PIGNOLO_TEST_SEED` y la guarda en el sello como `seedOffered`, sin saber si se usó; `scripts/setup.js` ya hace respaldo `.pignolo-bak-<ts>` antes de escribir (modelo del respaldo de R-4 y R-16); `agents/debugger.md` existe (opus, effort high, Read/Grep/Glob/Bash, salida DONE/BLOCKED/NEEDS_CONTEXT) y `tests/evals/agents/` tiene `explorer-cites-lines` y `researcher-no-repo` como modelo de caso; `tests/manual/hito-3b.md` puntos 10 y 11 son los límites a y b que este hito cierra. **Planes 6 y 7 (sin construir):** los nombres de la sección de dependencias salen literalmente de ellos (el plan del hito 6 dice de `proposeLearning` que "es lo que usará `/pignolo:init` en el hito 8"). **Hipótesis, sin medir:** la clave `autoMemoryEnabled` y la carpeta de la memoria (R-14); las opciones de semilla de jest, pytest y `node --test` (R-7); el comando exacto de cada herramienta de mutación (R-11). Cada una tiene dueña: Tasks 1, 3 y 5.

---

# Parte 8a: determinista

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: detección del proyecto (`lib/init-detect.js`)

**Files:**
- Create: `plugins/pignolo/lib/init-detect.js`
- Test: `tests/init-detect.test.js`
- Fixtures: se arman en el test con `makeTempDir()` (manifiestos mínimos); nada de repos reales.

**Interfaces:**
- Consume: `parseFrontmatter` de `lib/yaml-lite.js` (solo para leer un `project.md` existente), `DEFAULT_TEST_PATHS` y `TYPES` de `lib/project-config.js`, el glob de `lib/globs.js`.
- Produce `STACKS` = `['node','python','go','rust','flutter','docs','script']`.
- `detectProject({ root, run }) → Detection`, solo lectura, sin ejecutar nada del proyecto. `Detection` = `{ root, stacks: string[], packageManager: 'npm'|'pnpm'|'yarn'|'bun'|'pip'|'uv'|'poetry'|null, type: 'code-tested'|'code-untested'|'docs'|'script'|null, gates: { 'on-edit'?: string, 'on-done'?: string, 'pre-merge'?: string, 'pre-merge-files'?: string }, testPaths: string[], protectedTestConfig: string[], highRiskPaths: string[], contracts: string[], serialPaths: string[], costPaths: string[], visiblePaths: string[], depsInstall: string|null, domainRules: string[], runners: string[], runnerExcludes: [{ runner, walksDotDirs, file, snippet }], mutation: null | { tool, command, configFile, configSnippet, thresholdFile }, seedPlan: { runner, flag: string|null, reason }, sources: { <clave>: string }, warnings: string[] }`.
- `isInstallerPlaceholder(cmd) → boolean` (R-6).
- Tabla `STACK_RULES` (literal; quien ejecuta la completa, estas son las filas obligatorias):

| Stack (archivo que lo dispara) | `on-edit` | `on-done` | `pre-merge` | `depsInstall` |
|---|---|---|---|---|
| node (`package.json`) | `<gestor> run typecheck` o, si no, `<gestor> run lint` (solo si el script existe) | `<gestor> run test` `&&` `<gestor> run typecheck` (cada parte solo si existe) | `on-done` `&&` `lint` `&&` `build` (solo los que existen) | npm: `npm ci` (con `package-lock.json`); pnpm: `pnpm install --frozen-lockfile`; yarn: `yarn install --frozen-lockfile`; bun: `bun install --frozen-lockfile`; sin lockfile: `null` |
| python (`pyproject.toml`, `pytest.ini`, `setup.cfg` o `requirements*.txt`) | `ruff check .` si hay ruff, si no `mypy .` si hay mypy | `python -m pytest -q` | `on-done` `&&` lint | `uv sync --frozen` (con `uv.lock`), `poetry install` (con `poetry.lock`), `pip install -r requirements.txt` (con el archivo), si no `null` |
| go (`go.mod`) | `go vet ./...` | `go test ./...` | `go vet ./...` `&&` `go test ./...` | `null` |
| rust (`Cargo.toml`) | `cargo check` | `cargo test` | `cargo clippy -- -D warnings` `&&` `cargo test` | `null` |
| flutter (`pubspec.yaml` con `flutter:`) | `flutter analyze` | `flutter test` | `flutter analyze` `&&` `flutter test` | `flutter pub get` |

- Listas por stack (solo lo que existe en disco): `testPaths` node = `**/*.test.*`, `**/*.spec.*`, `__tests__/`, `__mocks__/`, `**/__snapshots__/`, `test/`, `tests/`, `e2e/`, `cypress/`, `playwright/`, `**/fixtures/`, más los archivos de setup que nombre la configuración del runner; python = `tests/`, `test_*.py`, `*_test.py`, `conftest.py`, `**/fixtures/`; go = `*_test.go`, `testdata/`; rust = `tests/` (los `#[cfg(test)]` en línea no se pueden globar: `warnings` lo dice); flutter = `test/`, `integration_test/`, `**/goldens/`. `highRiskPaths` (los que existan): `auth/`, `**/auth/**`, `payments/`, `billing/`, `migrations/`, `prisma/`, `.github/workflows/`, `Dockerfile`, `docker-compose*.yml`, `.env*`. `contracts`: `openapi*.{yaml,yml,json}`, `swagger*.{yaml,yml,json}`, `**/*.proto`, `schema.graphql`, `prisma/schema.prisma`. `serialPaths`: los lockfiles y `migrations/`. `costPaths`: `terraform/`, `**/*.tf`, `infra/`, `serverless.yml`. `visiblePaths`: `src/app/`, `app/routes/`, `src/pages/`, `public/`, `locales/`, `i18n/`, `messages/`, `lib/**/screens/` (solo si existen). Todo con su `sources[clave]` (el archivo que lo hizo aparecer). Si `lib/globs.js` no admite alguna de estas formas (llaves `{a,b}`), se expande en el detector a un glob por extensión (a verificar con `tests/globs.test.js`).
- `seedPlan`: `{ runner, flag, reason }` desde `SEED_ARGS` de la Task 3 (la Task 1 deja `flag: null, reason: 'pending-task-3'`; la Task 7 une los dos).

**Tests literales (`tests/init-detect.test.js`, tabla; cada caso un directorio temporal nuevo):**
- [ ] `package.json` con `scripts: { test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' }`, `devDependencies: { vitest }`, `package-lock.json` y `src/a.test.ts` → `type: 'code-tested'`, `packageManager: 'npm'`, `gates['on-done'] === 'npm run test && npm run typecheck'`, `gates['pre-merge'] === 'npm run test && npm run typecheck && npm run lint'` (sin `build`: el script no existe), `gates['on-edit'] === 'npm run typecheck'`, `depsInstall === 'npm ci'`, `runners` incluye `'vitest'`, `sources.type` nombra `package.json`.
- [ ] El mismo con `pnpm-lock.yaml` en vez del lock de npm → `'pnpm run test && pnpm run typecheck'` y `depsInstall === 'pnpm install --frozen-lockfile'`; con `yarn.lock` → `yarn run`; con `bun.lock` → `bun run`. Sin lockfile → `depsInstall === null` y `packageManager: 'npm'`.
- [ ] **Placeholder del instalador (R-6, Review Focus 3):** `scripts.test === 'echo "Error: no test specified" && exit 1'` → `type: 'code-untested'`, **sin** `gates['on-done']`, y un `warnings` que lo nombra. Rojo: no rechazar el placeholder. Mismo caso con `src/a.test.ts` presente → sigue `code-untested` (el comando no es real).
- [ ] `package.json` con `scripts.test` real pero **ningún archivo** que caiga en `test-paths` → `code-untested` con aviso "hay script de test pero ningún test".
- [ ] `pyproject.toml` + `tests/test_a.py` + `uv.lock` → `type: 'code-tested'`, `on-done === 'python -m pytest -q'`, `depsInstall === 'uv sync --frozen'`, `testPaths` incluye `tests/` y `conftest.py` solo si existe.
- [ ] `go.mod` + `a_test.go` → `go test ./...`, `testPaths` incluye `*_test.go`; sin `testdata/` en disco no aparece `testdata/`. `Cargo.toml` + `tests/it.rs` → `cargo test`. `pubspec.yaml` con `flutter:` + `test/a_test.dart` → `flutter test` y `depsInstall === 'flutter pub get'`; un `pubspec.yaml` sin `flutter:` (Dart puro) → `dart test`.
- [ ] Solo `README.md` y `docs/a.md` → `type: 'docs'`, sin `gates`. Un solo `run.sh` sin manifiesto → `type: 'script'`. Directorio vacío → `type: null`, `stacks: []` y un `warnings` ("sin manifiesto reconocido: `type` queda sin declarar").
- [ ] `highRiskPaths` y `contracts`: con `prisma/schema.prisma`, `.github/workflows/ci.yml` y `openapi.yaml` en disco → `prisma/`, `.github/workflows/`, `prisma/schema.prisma`, `openapi.yaml` aparecen cada uno en la lista que corresponde; sin esos archivos → listas vacías (nada inventado).
- [ ] `protectedTestConfig` (R-8, R-10): con `vitest.config.ts` y `package.json` con `scripts.test` real → ambos en la lista; con `stryker.conf.json` → también; **sin** `scripts.test` real → `package.json` no entra.
- [ ] `domainRules` (R-17): con `CLAUDE.md`, `.claude/rules/a.md`, `docs/sessions/2026-01-01.md` → las tres rutas, **sin leer su contenido** (un `fs.readFileSync` envuelto con un registro no se llama con esas rutas: rojo si se leen; se afirma antes que el registro sí vio otras lecturas, p. ej. `package.json`); un enlace simbólico a un archivo fuera del repo → descartado.
- [ ] `runnerExcludes` (R-9): vitest → `walksDotDirs: 'yes'` y `snippet` que contiene `'.pignolo/**'`; jest → `'/.pignolo/'`; `go` → `walksDotDirs: 'no'`; `node --test` → `'unknown'`.
- [ ] `mutation` (R-11): `devDependencies` con `@stryker-mutator/core` → `mutation.tool === 'stryker'`, `configSnippet` contiene `PIGNOLO_MUTATE_FILES` y `thresholdFile` apunta al `stryker.conf.*` si existe; **sin** esa dependencia → `mutation === null`. Rojo: declararla por la sola presencia del runner.
- [ ] `detectProject` no ejecuta nada del proyecto: un `package.json` con `scripts.postinstall: 'node boom.js'` (y un `boom.js` que escribiría un archivo marcador) no dispara nada; el archivo marcador no existe tras detectar. Con `run` inyectado como registro, las únicas llamadas son de git de solo lectura (`ls-files`, `check-ignore`) y se afirma antes que el registro existe.
- [ ] `package.json` ilegible (JSON truncado) → `warnings` con "package.json ilegible" y `stacks` sin `node`; no tira excepción.
- [ ] Commit: `feat(init): detección del tipo, las compuertas y las rutas de riesgo con la fuente de cada una`.

### Task 2: `project.md` desde una propuesta y fusión (`lib/project-md.js`)

**Files:**
- Create: `plugins/pignolo/lib/project-md.js`
- Test: `tests/project-md.test.js`

**Interfaces:**
- Consume: `parseFrontmatter`, `YamlLiteError` de `lib/yaml-lite.js`; `readProjectConfig` solo en los tests (ida y vuelta).
- `renderProjectMd(proposal, { notes }) → string` (LF, sin BOM). `proposal` = el subconjunto de `Detection` más lo de la entrevista: `{ type, gates, testPaths, protectedTestConfig, highRiskPaths, contracts, serialPaths, costPaths, visiblePaths, piiPatterns, depsInstall, domainRules, mutation (bool), language, profile }`. Orden fijo de claves (el de §3.2), listas en bloque, mapa `gates` de un nivel. Comillas: el valor va **sin comillas** salvo que empiece con `[`, `{`, `"`, `'` o contenga `: ` o ` #`; entre comillas **simples** si contiene `"`; si contiene los dos tipos de comilla → `throw` con `kind: 'unquotable'` (yaml-lite no tiene escapes). Una clave con valor vacío no se escribe.
- `mergeProjectMd(existingText, proposal) → { ok: true, text, added: string[], kept: string[], conflicts: [{ key, existing, proposed }] } | { ok: false, refused: 'invalid-project-md', reason }` (R-4). Para una lista ya declarada que difiere, **no se une**: `conflicts` (el humano decide). Para `gates` (mapa): se fusiona por subclave. El cuerpo de notas posterior al frontmatter queda **byte a byte** igual; un `project.md` sin frontmatter se trata como solo notas (se antepone el frontmatter).
- `validatePiiPattern(pattern) → { ok: true } | { ok: false, refused: 'invalid-regex' | 'too-broad', reason }` (R-15).

**Tests literales:**
- [ ] **Ida y vuelta:** `renderProjectMd(P)` leído con `readProjectConfig` (vía un temp con el archivo) da `type`, `gates`, listas y `depsInstall` iguales a `P`, **sin `warnings`** salvo los de claves aditivas ausentes (una fila por cada clave de §3.2).
- [ ] Un comando con `"` (`node -e "1"`) → entre comillas simples y se lee igual; con ambas comillas → `kind: 'unquotable'`; un comando que contiene `{files}` y arranca con `node` se escribe sin comillas y se lee igual; una entrada de lista que empieza con `*` (`*test*`) se lee igual.
- [ ] `mergeProjectMd` sobre un `project.md` con `type: docs` y `proposal.type = 'code-tested'` → `conflicts` con `existing: 'docs'`, `proposed: 'code-tested'`, y el texto resultante **sigue diciendo `type: docs`** (rojo: pisar).
- [ ] Un `project.md` con `test-paths` declarados y otra lista propuesta → `conflicts`, lista intacta; sin `test-paths` en el existente → se agrega y `added` lo nombra.
- [ ] `gates` existente `{ on-done: 'make test' }` y propuesta `{ on-done: 'npm run test', pre-merge: 'make all' }` → `on-done` en `conflicts`, `pre-merge` agregado.
- [ ] Notas: un `project.md` con tres párrafos de notas debajo del frontmatter → idénticos tras la fusión (comparación de bytes). Sin frontmatter (solo una línea de notas) → frontmatter antepuesto y la línea conservada.
- [ ] Frontmatter ilegible (`gates: [a, b]` en línea) → `ok: false, refused: 'invalid-project-md'`, y no se devuelve texto.
- [ ] Idempotencia: `mergeProjectMd(mergeProjectMd(x, P).text, P)` → `added: []`, `conflicts: []` y texto idéntico.
- [ ] `validatePiiPattern('\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b')` → ok; `'('` → `invalid-regex`; `'.*'` y `'a'` → `too-broad` (coincide con vacío o con una sola letra); `''` → `too-broad`.
- [ ] CRLF en el archivo existente → las líneas que la fusión no toca conservan su final de línea y las nuevas usan el del archivo (a verificar; `.gitattributes` de la Task 4 normaliza después).
- [ ] Commit: `feat(init): project.md desde una propuesta y fusión que no pisa lo declarado`.

**Cierre de la ola 0:** unir, suite completa una vez, etiqueta `contract/hito-8a/v1`.

## Ola 1 (Tasks 3 y 4 en paralelo; cada una en su worktree)

### Task 3: `{seed}` en las compuertas y tabla de semillas verificadas (`lib/gate.js`, `lib/init-seed.js`) (D-8-3)

**Files:**
- Create: `plugins/pignolo/lib/init-seed.js`
- Modify: `plugins/pignolo/lib/gate.js`, `plugins/pignolo/lib/seals.js` (campo `seedInCommand`), `plugins/pignolo/lib/project-config.js` (aviso si `{seed}` aparece en una clave que no es un comando de compuerta)
- Test: `tests/gate-seed.test.js`; casos nuevos en `tests/gate.test.js` y `tests/project-config.test.js`

**Interfaces:**
- `expandSeed(command, seed) → string`: reemplaza **todas** las apariciones de `{seed}` por `String(seed)`; sin el marcador devuelve el comando igual.
- `runGate` (existente, `lib/gate.js`) expande `{seed}` en cada comando antes de `exec` y el sello gana `seedInCommand: boolean` (verdadero si algún comando lanzado traía el marcador). `PIGNOLO_TEST_SEED` se sigue exportando igual (compatibilidad con el hito 4a).
- `SEED_ARGS` (en `lib/init-seed.js`): `{ <runner>: { args: string|null, verified: boolean, source: string } }`. Filas obligatorias: `vitest` (`--sequence.shuffle --sequence.seed={seed}`), `jest` (`--randomize --seed={seed}`), `go` (`-shuffle={seed}`), `flutter` (`--test-randomize-ordering-seed={seed}`), `pytest` (`-p randomly --randomly-seed={seed}`, solo si `pytest-randomly` está declarado), `node-test` (sin fila hasta verificar), `cargo` (`args: null`: sin opción).
- `seedCommand(baseCommand, runner) → { command, seedPlan: 'applied'|'unused', reason }`: agrega `SEED_ARGS[runner].args` **solo si `verified: true`**; con un gestor de paquetes que reenvía argumentos usa el separador correcto por gestor (`npm run test -- <args>`, `pnpm run test <args>`, `yarn run test <args>`, `bun run test <args>`); si el script de test no es exactamente el runner (p. ej. `npm run test` corre `vitest run && playwright test`), `unused` con `reason: 'script-not-runner'`.

**Paso 0 (antes del código; verificación obligatoria, R-7):** consultar con Context7 o la documentación oficial cada fila de `SEED_ARGS` (flag exacto, versión mínima) y dejar en `source` la URL y la fecha de consulta; lo que no se pueda confirmar queda `verified: false`. Registrar el resultado en el informe del implementador.

**Tests literales:**
- [ ] `expandSeed('vitest run --sequence.seed={seed} {seed}', 42)` → las dos apariciones reemplazadas; sin marcador → igual; `{Seed}` (mayúscula) y `{seeds}` no se tocan.
- [ ] `runGate` con `exec` inyectado y un comando `echo {seed}`: el comando recibido por `exec` trae la semilla elegida (`--seed 7` → `echo 7`); `seal.seedOffered === 7` y `seal.seedInCommand === true`. Sin el marcador: `seedInCommand === false` y el comando llega idéntico (guarda de regresión del hito 4a).
- [ ] El `env` que recibe `exec` sigue trayendo `PIGNOLO_TEST_SEED === '7'` (guarda de regresión).
- [ ] **Misma expansión en ambas shells:** el test corre un comando real con shell: un script `node` en un archivo temporal que imprime `process.argv[2]`, invocado como `node <archivo> {seed}` con `--seed 123`, y la salida es `123` (en esta máquina `cmd.exe`; el mismo test corre en WSL2 con `sh`). Rojo: no expandir.
- [ ] `seedCommand('npm run test', 'vitest')` con `verified: true` → `npm run test -- --sequence.shuffle --sequence.seed={seed}`, `seedPlan: 'applied'`; con `verified: false` → comando igual, `unused`, `reason` que dice "no verificado"; runner `cargo` → `unused`; `pnpm` usa su separador; script que encadena dos runners → `unused`.
- [ ] `project-config`: `{seed}` en `gates.on-done` es válido; `{seed}` en `deps-install` o en `gates.mutation` → aviso (la mutación recibe archivos por `PIGNOLO_MUTATE_FILES`; la semilla no aplica) y se conserva el valor.
- [ ] `seals.js`: un sello con `seedInCommand` no booleano → inválido (el lector de sellos del hito 3 rechaza formas raras); un sello **sin** el campo (de un hito anterior) sigue válido.
- [ ] Commit: `feat(gate): marcador {seed} en los comandos de compuerta y semillas verificadas por runner`.

### Task 4: acciones sobre el repo (`lib/init-actions.js`) — RIESGOSA (auditar antes, D-8-6)

**Files:**
- Create: `plugins/pignolo/lib/init-actions.js`
- Modify: `plugins/pignolo/lib/pignolo-gitignore.js` (exporta `PIGNOLO_IGNORED`), `plugins/pignolo/scripts/run.js` (importa la constante en vez de la propia)
- Test: `tests/init-actions.test.js`, caso de regresión en `tests/run-files.test.js`

**Interfaces (todas devuelven `{ id, status: 'done'|'skipped'|'refused', reason?, ...datos }`, aceptan `opts.run` para git y `opts.now` para el sello de los respaldos):**
- `applyReflog({ root, run }) → step` (R-12): lee `gc.reflogExpire` y `gc.reflogExpireUnreachable` con `git config --local --get`; ambos `never` → `skipped: 'already-set'`; si no, `setReflogPolicy({ cwd: root })` de `lib/git-backup.js` y `done` con `{ before, after }`.
- `applyGitattributes({ root }) → step`: asegura la línea exacta `.pignolo/** text eol=lf` en `<root>/.gitattributes`: ausente el archivo → lo crea con esa línea; presente con la línea → `skipped: 'already-set'`; presente sin ella → **agrega al final** (respaldo antes) sin reordenar ni tocar el resto y conserva el final de línea del archivo. Si hay otra línea que ya cubre `.pignolo/**` con otro `eol` → `refused: 'conflicting-rule'` con la línea citada (no la pisa).
- `applyIgnores({ root, run }) → step`: `ensureIgnored(root, PIGNOLO_IGNORED)` (R-13); informa `{ added: [...], tracked: boolean, trackedModified: boolean }` mirando `git ls-files --error-unmatch .pignolo/.gitignore` y `git status --porcelain -- .pignolo/.gitignore`.
- `applySecurityMd({ root, template, answers }) → step` (R-18): si existe `SECURITY.md`, `.github/SECURITY.md` o `docs/SECURITY.md` → `skipped: 'exists'` con la ruta; si no, escribe `SECURITY.md` desde `template` reemplazando `{{project}}`, `{{supported}}`, `{{channel}}`; un marcador sin respuesta usa el texto por defecto de R-18; una respuesta con un salto de línea o con `{{` → `refused: 'invalid-answer'` (no se inyecta estructura).
- `backupFile(file, now) → string` (`<archivo>.pignolo-bak-<ts>`, `copyFile` con `COPYFILE_EXCL`; si el nombre existe, `-1`, `-2`…; nunca sobrescribe un respaldo).

**Tests literales (repos reales con `makeRepo()`):**
- [ ] `applyReflog` en un repo sin esas claves → `done`, y `git config --local --get gc.reflogExpire` da `never` y `gc.reflogExpireUnreachable` da `never`; segunda corrida → `skipped: 'already-set'`; con solo una de las dos fijada → `done` y las dos quedan en `never`. Un `run` inyectado que registra los argumentos: **ninguna** llamada trae `--global` ni `--system` (rojo: escribir fuera de `--local`); el registro no está vacío.
- [ ] `applyGitattributes`: sin archivo → crea con la línea y LF; con `* text=auto\n` → agrega la línea al final y la primera queda intacta (bytes); con CRLF en el archivo → la línea nueva usa CRLF; con la línea ya presente → `skipped` y **sin respaldo nuevo**; con `.pignolo/** -text` → `refused: 'conflicting-rule'`. Cada `done` sobre un archivo existente deja `.gitattributes.pignolo-bak-<ts>` con el contenido anterior.
- [ ] `applyIgnores`: repo sin `.pignolo/` → crea `.pignolo/.gitignore` con las cinco líneas de `PIGNOLO_IGNORED`; con el archivo **versionado** y sin `tmp/` ni `worktrees/` → agrega solo las faltantes y `trackedModified: true`; repetido → `added: []`. Guarda de regresión: `run.js start` sobre un repo donde `init` ya corrió y se commiteó **no modifica** `.pignolo/.gitignore` (`git status --porcelain` vacío tras `start`).
- [ ] `PIGNOLO_IGNORED` es el mismo arreglo que antes tenía `run.js` (`['.gitignore','run.json','.disabled','tmp/','worktrees/']`), y el test de `run-files.test.js` que ya miraba `.pignolo/.gitignore` sigue verde (guarda de regresión).
- [ ] `applySecurityMd`: sin ninguno → crea `SECURITY.md` con el nombre del proyecto y el canal; con `.github/SECURITY.md` existente → `skipped: 'exists'` y **no** se crea `SECURITY.md`; `answers.channel` con `\n## Inyectado` → `refused: 'invalid-answer'` y nada escrito; `{{channel}}` sin respuesta → el texto por defecto del reporte privado, sin marcadores sin reemplazar en el resultado.
- [ ] `backupFile` dos veces en el mismo milisegundo → dos nombres distintos; nunca pisa uno existente.
- [ ] Ningún paso ejecuta `commit`, `add` ni `push`: el registro de `run` de un `applyAll` sintético no contiene esos verbos (se afirma antes que no está vacío).
- [ ] Commit: `feat(init): reflog, gitattributes, ignores y SECURITY.md con respaldo y sin pisar`.

**Cierre de la ola 1:** unir las dos ramas, suite completa una vez.

## Ola 2 (Tasks 5 y 6 en paralelo) — RIESGOSAS (auditar antes, D-8-6)

### Task 5: migración de la auto-memoria (`lib/auto-memory.js`) — requiere el hito 6

**Files:**
- Create: `plugins/pignolo/lib/auto-memory.js`
- Test: `tests/auto-memory.test.js`

**Interfaces:**
- Consume: `proposeLearning`, `scanLearning` de `lib/learnings.js` y `readEntries` de `lib/state-store.js` (**hito 6**, nombres de su plan), `claudeDirs` de `lib/home.js`, `parseFrontmatter` de `lib/yaml-lite.js`, `mainRoot` de `lib/disabled.js`.
- `memorySlug(absRoot) → string` (cada carácter no `[A-Za-z0-9]` → `-`; `D:\pignolo` → `D--pignolo`; `/home/a/p` → `-home-a-p`).
- `findAutoMemory({ main, env }) → { dirs: string[], files: [{ file, rel, name, description, type, text, sha12 }], index: string|null, errors: [{ file, error }] }`: busca `<dir>/projects/<slug>/memory/*.md` en cada `claudeDirs(env)`; `MEMORY.md` se devuelve en `index` y **no** entra en `files`; un archivo ilegible va a `errors`.
- `planMigration({ main, files, piiPatterns, existing }) → { propose: [{ file, id, body, evidence }], skipped: [{ file, reason: 'finding'|'size'|'user-type'|'already-migrated'|'empty', kinds?: string[] }] }`: puro (no escribe). `existing` = lo que devuelve `readEntries` de `learnings/proposed`, `accepted` y `rejected`. **Ningún elemento de `skipped` contiene texto del archivo** (R-14, Review Focus 2).
- `migrateAutoMemory({ main, env, piiPatterns, now, apply }) → { ok, found, propose, skipped, written: string[] }`: con `apply: false` no escribe nada; con `apply: true` llama `proposeLearning({ main, id, source: 'session', evidence, scope: 'project', body })` por cada elemento de `propose` y devuelve los ids escritos; un `refused` de `proposeLearning` se informa por archivo y no frena a los demás.

**Paso 0 (verificar, R-14):** consultar <https://code.claude.com/docs/en/memory> y dejar en el informe el formato real de los archivos y la ubicación; si difiere del slug de R-14, corregir `memorySlug` y la constante `MEMORY_SUBDIR`.

**Tests literales (con `CLAUDE_CONFIG_DIR` temporal y un repo `makeRepo()`):**
- [ ] `memorySlug` tabla: `D:\pignolo` → `D--pignolo`; `C:\Users\a b\p` → `C--Users-a-b-p`; `/home/a/p` → `-home-a-p`.
- [ ] `findAutoMemory` con tres archivos y un `MEMORY.md` → `files.length === 3`, `index` apunta a `MEMORY.md`; carpeta ausente → `{ dirs: [], files: [] }` sin excepción; un archivo ilegible → en `errors`, los demás siguen.
- [ ] `planMigration`: un archivo `type: feedback` con 300 caracteres limpios → en `propose` con `id` que empieza con la fecha y `-automem-`; uno con `ghp_` + 36 letras → en `skipped` con `reason: 'finding'`, `kinds: ['secret']`, y **el objeto serializado (`JSON.stringify`) no contiene ni un fragmento del token** (rojo: incluir `match`); uno de 1.300 caracteres → `size`; uno con un `piiPatterns` que coincide → `finding` con `kinds: ['pii']`; uno `type: user` → `skipped: 'user-type'`; uno vacío → `empty`.
- [ ] Idempotencia: con `existing` que trae una entrada cuyo `evidence` contiene `#<sha12>` del archivo → `already-migrated`; si el archivo cambió (otro sha) → se propone de nuevo con otro id; el `existing` de `rejected/` también cuenta (un aprendizaje que el humano rechazó no vuelve a proponerse).
- [ ] `migrateAutoMemory({ apply: false })` → `written: []` y el directorio `learnings/proposed/` no existe; con `apply: true` → los archivos existen con `status: proposed`, `source: session` y `evidence` `auto-memory:<archivo>#<sha12>`; **los originales de la auto-memoria están byte a byte iguales** (hash antes y después: rojo: mover en vez de copiar).
- [ ] Un `proposeLearning` que devuelve `refused: 'exists'` para un id → ese archivo en el informe y el resto se escribe.
- [ ] Sin el hito 6 (`require('./learnings')` falla): `migrateAutoMemory` devuelve `{ ok: false, refused: 'missing-learnings', reason }` (carga perezosa) y los demás exports siguen funcionando: la ola avanza sin el hito 6 y la tarea queda marcada.
- [ ] Commit: `feat(init): migración de la auto-memoria a learnings/proposed sin mover ni filtrar texto`.

### Task 6: configuración local de Claude (`lib/claude-settings.js`) — RIESGOSA (auditar antes, D-8-6)

**Files:**
- Create: `plugins/pignolo/lib/claude-settings.js`
- Test: `tests/claude-settings.test.js`

**Interfaces:**
- `AUTO_MEMORY_KEY = 'autoMemoryEnabled'` (R-16; un único punto de corrección).
- `settingsLocalPath(main) → '<main>/.claude/settings.local.json'`.
- `planAutoMemoryOff({ main }) → { file, exists, current: boolean|undefined, change: 'set'|'none'|'refused', reason? }` (puro).
- `applyAutoMemoryOff({ main, now }) → { id: 'auto-memory-off', status: 'done'|'skipped'|'refused', backup?: string, reason? }`: lee el JSON (ausente → `{}`), fusiona solo `AUTO_MEMORY_KEY: false`, conserva el resto y el orden de claves, respalda si existía, escribe atómico con LF y la sangría que el archivo ya usaba (si no existía, 2 espacios).
- `gitIgnoredStatus({ main, run }) → { ignored: boolean|'unknown' }` (`git check-ignore`): informativo (R-16).

**Tests literales:**
- [ ] Archivo ausente → `done`, el contenido es `{ "autoMemoryEnabled": false }` y no hay respaldo; el directorio `.claude/` se crea si faltaba.
- [ ] Con `{ "permissions": { "deny": ["Bash(rm:*)"] }, "env": { "A": "1" } }` → `done`, el objeto resultante tiene `permissions` y `env` **idénticos** y la clave nueva; existe `settings.local.json.pignolo-bak-<ts>` con el contenido anterior byte a byte.
- [ ] Con la clave ya en `false` → `skipped: 'already-set'` y sin respaldo; con `true` → `done` (la cambia) y el respaldo guarda el `true`.
- [ ] JSON inválido (`{ "a": `) → `refused: 'invalid-json'`; el archivo queda **idéntico** (hash) y no se crea respaldo. Un JSON que no es objeto (`[]`) → `refused: 'not-an-object'`.
- [ ] Escritura atómica: con `rename` forzado a fallar, el archivo original sigue intacto y no queda un `.tmp` (guarda de regresión del patrón de `setup.js`).
- [ ] `gitIgnoredStatus` en un repo cuyo `.gitignore` ignora `.claude/settings.local.json` → `ignored: true`; sin esa línea → `false`; sin git → `'unknown'`.
- [ ] Ningún código escribe en `settings.json` del usuario ni en `~/.claude`: el test corre con `CLAUDE_CONFIG_DIR` temporal y verifica que **solo** cambió `<main>/.claude/settings.local.json` (listado de archivos antes/después).
- [ ] Commit: `feat(init): desactivar la auto-memoria del proyecto en settings.local.json con respaldo`.

**Cierre de la ola 2:** unir, suite completa una vez.

## Ola 3 (Tasks 7 y 8 en paralelo)

### Task 7: `scripts/init.js` (detect, preview, apply, verify)

**Files:**
- Create: `plugins/pignolo/scripts/init.js`
- Test: `tests/init-cli.test.js`

**Interfaces:**
- Consume: Tasks 1 a 6, `mainRoot`, `readProjectConfig`, `projectState`.
- `init.js detect [--cwd <ruta>]` → JSON `{ ok: true, root, detection: Detection, memory: { found, files: n, user: n, index: bool }, existing: { projectMd: bool, claudeSettingsLocal: bool, securityMd: bool, gitattributes: bool, pignoloGitignoreTracked: bool }, steps: [{ id, needsAnswer: string[] }] }` (solo lectura; une `seedPlan` de la Task 3 con `detection.gates` aplicando `seedCommand` al `on-done`).
- `init.js preview --plan <archivo>` → el mismo informe que `apply` pero cada paso con `status: 'would-do'|'skipped'|'refused'` y sin escribir (R-3).
- `init.js apply --plan <archivo>` → `{ ok, steps: [{ id, status, reason?, ...datos }], conflicts: [...], notes: [...] }`. Orden fijo de los pasos: `ignores`, `gitattributes`, `reflog`, `project-md`, `security-md`, `migrate-memory`, `auto-memory-off`. Un paso que falla (`refused`) **no frena** a los demás; el exit es 0 si ninguno falló escribiendo, 1 si alguno falló escribiendo (`kind: 'step-failed'`, con el id), 3 si dejó algo a medias. `plan.approved` decide qué corre (R-3); `plan.proposal` alimenta `project-md`; `plan.answers` (`channel`, `supported`, `piiPatterns`, `language`, `profile`) alimenta `security-md` y `project-md`.
- `init.js verify` → `{ ok, config: <resumen de readProjectConfig>, active: boolean, warnings, runnerExcludes: [{ runner, applied: boolean }], reflog: boolean, ignores: boolean, trackedModified: boolean, nextCommit: { files: string[], message: string } }`; `active` sale de `projectState` (el hook de `Agent` pasa a "pignolo activo").
- Códigos: 0, 1 (`kind`), 2 (uso: sin subcomando, plan inexistente, id de paso desconocido, `--plan` ilegible), 3.

**Tests literales (repos temporales; CLI por proceso real con `node scripts/init.js`):**
- [ ] `detect` en un repo node mínimo → JSON con `detection.type`, `steps` con los siete ids y `needsAnswer` no vacío para `security-md` (`['channel']`) y `project-md` (`['piiPatterns']`); **no crea ningún archivo** (listado del repo antes/después idéntico: rojo si escribe).
- [ ] `apply` con `approved: []` → todos `skipped: 'not-approved'`, repo idéntico, exit 0. Con `approved: ['reflog']` solo corre el reflog (rojo: correr todo).
- [ ] `apply` con un id desconocido (`'delete-all'`) → exit 2 y nada escrito (ni los pasos válidos de la misma lista).
- [ ] `preview` con el mismo plan que un `apply` posterior: los estados de `preview` son `would-do` exactamente donde `apply` da `done`, y `skipped`/`refused` con el mismo `reason` donde corresponde (comparación paso a paso); el repo no cambió tras `preview`.
- [ ] **Idempotencia (Review Focus 5):** `apply` con todos los pasos dos veces seguidas: la segunda da todos `skipped` (`already-set`/`exists`/`already-migrated`) y `git status --porcelain` más el listado de archivos son idénticos entre la primera y la segunda corrida.
- [ ] `apply` desde una worktree enlazada (`git worktree add`) escribe en el checkout principal y no en la worktree (rojo: usar `cwd`). Fuera de un repo → exit 1, `kind: 'not-a-repo'`, `Alternativa:` en stderr.
- [ ] `project-md` con un `project.md` existente `type: docs` y propuesta `code-tested` → `conflicts` en la salida, el archivo conserva `type: docs`, hay respaldo. Con un `project.md` ilegible → ese paso `refused: 'invalid-project-md'` y los otros pasos aprobados corren igual.
- [ ] `apply` con `answers.piiPatterns: ['.*']` → `project-md` `refused: 'too-broad'` y **no** se escribe `project.md` con ese patrón; con un patrón válido se escribe en `pii-patterns`.
- [ ] `verify` tras un `apply` completo + commit sintético: `active: true`, `warnings: []`, `reflog: true`, `ignores: true`; antes del `apply`: `active: false` y el aviso de modo conservador. Con un runner sin opción de semilla verificada → el informe lo dice en `notes`.
- [ ] `verify` con vitest sin exclusión en `vitest.config.ts` → `runnerExcludes: [{ runner: 'vitest', applied: false }]`; con `'.pignolo/**'` en el `exclude` → `applied: true`.
- [ ] Salida: JSON válido por stdout y **nada** de lo detectado por stderr salvo `Alternativa:`; ningún campo del JSON contiene el texto de un archivo de la auto-memoria (se arma una memoria con un token falso y se busca en toda la salida: rojo si aparece).
- [ ] Commit: `feat(init): scripts/init.js con detect, preview, apply y verify`.

### Task 8: regla `pignolo-init` de la guardia y cableado — RIESGOSA (auditar antes, D-8-6)

**Files:**
- Modify: `plugins/pignolo/lib/git-guard.js` (regla nueva; modelo: `pignolo-plan` y `isPlanScript`)
- Test: `tests/guard-init.test.js`; humo por el launcher real

**Interfaces:**
- Familia nueva `'pignolo-init'`: `['deny', 'un subagente no opera init.js: solo el hilo principal y con el sí del humano', 'respondé BLOCKED o NEEDS_CONTEXT y nombrá lo que haga falta cambiar en project.md']`. Detección **estrecha**: un comando cuyo ejecutable es `node` (o `node.exe`) con un argumento que termina en `scripts/init.js` (separador `/` o `\`), en el mismo estilo que `isPlanScript`, solo cuando hay `agent_id`/`agent_type` de subagente. El hilo principal no se afecta.
- El deny de Edit/Write sobre `.claude/settings.local.json` y `.pignolo/project.md` **ya existe** (`protected-path` y `protectedTestConfig`); la tarea lo **comprueba** con un caso, no lo reimplementa.

**Tests literales (tabla; handlers en proceso y un humo por el launcher):**
- [ ] Subagente `pignolo:implementer` + Bash `node "/x/plugins/pignolo/scripts/init.js" apply --plan p.json` → deny con `Alternativa:`; mismo comando con `node.exe` y ruta con `\` → deny; `pignolo:fixer` y `general-purpose` → deny.
- [ ] El **hilo principal** (sin `agent_id`) con el mismo comando → permite (rojo: negar al principal, que rompería la skill). Un subagente + `node scripts/init.js detect` → deny también (la regla es por script, no por subcomando: `detect` lista rutas del usuario).
- [ ] Un subagente + `node tests/helpers/my-init.js` (nombre parecido) → permite; `cat scripts/init.js` → permite (leer no es operar).
- [ ] Un subagente + Edit sobre `.claude/settings.local.json` → deny (`protected-path`); sobre `.pignolo/project.md` → deny (`protected-test-config`): guardas de regresión que fijan R-1 y Review Focus 6.
- [ ] Corpus: ningún comando de `tests/guard/` (`must-allow`) cambia de resultado (guarda de regresión; el recuento de `must-block` sube solo por los casos nuevos).
- [ ] Humo por el launcher real, como `pignolo:implementer`: exit 2, mensaje `pignolo bloqueó` y `Alternativa:`; con `/pignolo:off` la regla **sigue rigiendo** (es de guardia, como `pignolo-plan`; verificar contra `tests/guard-pignolo-plan.test.js` y copiar su comportamiento).
- [ ] Commit: `feat(guard): regla pignolo-init, un subagente no opera init.js`.

**Cierre de la ola 3:** unir, suite completa una vez.

## Ola 4 (Task 9, sola)

### Task 9: pruebas de punta a punta y cierre de 8a (`tests/e2e-hito-8.test.js`)

**Files:**
- Create: `tests/e2e-hito-8.test.js`
- Modify: `plugins/pignolo/.claude-plugin/plugin.json` (`version`), `CHANGELOG.md`, `tests/manual/hito-3b.md` (nota en los puntos 10 y 11: "resuelto por `init`, ver `hito-8.md`")

**Tests literales (cada uno por los scripts y el launcher reales; `PIGNOLO_HOME` y `CLAUDE_CONFIG_DIR` temporales):**
- [ ] **De cero a activo (por stack):** para cada stack de la Task 1 (node con vitest, python con pytest, go, rust, flutter): repo sintético → `detect` → `apply` de todos los pasos → commit sintético → `readProjectConfig` sin `warnings`, `projectState.active === true`, y el hook de `Agent` por el launcher real, como `pignolo:implementer`, ya no cae en el aviso de modo conservador.
- [ ] **`gates` de §15 con lo deducido (Review Focus 3):** en el repo node con `scripts.test` placeholder, `init` deja `type: code-untested` sin `on-done`, y `gate.js --level on-done` da `NO_GATE`/`NO_TESTS`, **nunca `PASS`**. En el repo node real, un test que falla deliberadamente hace que `gate.js --level on-done` dé `FAIL` con el comando deducido (la compuerta deducida corre de verdad; el runner es `node --test` sobre un archivo sintético para no depender de instalar nada).
- [ ] **Semilla:** con un comando `on-done` que lleva `{seed}` (un script `node` sintético que imprime su argumento y falla si no es un entero), `gate.js --seed 99` da `PASS` y el sello trae `seedOffered: 99` y `seedInCommand: true`; sin `{seed}` el sello trae `seedInCommand: false`.
- [ ] **Límite a del hito 3b cerrado:** repo con `.pignolo/.gitignore` versionado sin `tmp/` ni `worktrees/` → `init apply` + commit → `run.js start` (como en `trivial`) → `git status --porcelain` **vacío**, y `risk.js --diff HEAD` no cuenta `.pignolo/.gitignore` (el carril sigue `trivial`).
- [ ] **Límite b del hito 3b, parte determinista:** `verify` avisa `applied: false` si un `vitest.config.ts` no excluye `.pignolo/**`; con la exclusión aplicada pasa a `true`. (La medición con un runner real es el punto 6 de `tests/manual/hito-8.md`.)
- [ ] **Reflog independiente de hooks:** tras `apply`, con `PIGNOLO_DISABLED=1` en el entorno, `git config --local --get gc.reflogExpire` sigue en `never` (la política vive en `.git/config`, no en un hook).
- [ ] **Auto-memoria de punta a punta (requiere hito 6):** una memoria sintética de tres archivos (uno limpio, uno con un token falso, uno `user`) → `apply` con `migrate-memory` y `auto-memory-off` → una sola entrada en `learnings/proposed/`, el informe sin texto del archivo con token, `settings.local.json` con la clave, y los tres originales intactos; si el hito 6 no está, el caso se salta con `skip` y motivo explícito.
- [ ] **Worktree enlazada y repo compartido:** `apply` desde una worktree de tarea escribe en el principal; `init` no hace commit ni deja nada en el índice (`git diff --cached --name-only` vacío tras `apply`).
- [ ] **Convivencia (§14):** un repo con `docs/sessions/`, `.claude/rules/` y un `CLAUDE.md` → `domain-rules` los lista y, tras `apply`, **ninguno** de esos archivos cambió (hash antes y después).
- [ ] Cierre de 8a: versión y CHANGELOG (entrada con lo nuevo, el campo `seedInCommand`, el marcador `{seed}`, la regla `pignolo-init` y los límites declarados: R-9 `unknown`, R-11 sin instalar, R-14 sin `learning-validator` hasta el hito 6), suite completa una vez, revisión final opus de 8a con una pasada de arreglos.
- [ ] Commit: `test(init): pruebas de punta a punta de init y cierre de 8a`.

---

# Parte 8b: skill, plantillas, evals y adopción

## Ola 5 (Tasks 10 y 11 en paralelo)

### Task 10: skill `init`, `templates/SECURITY.md` y README (opus escribe la skill; la plantilla y el README, sonnet)

**Files:**
- Create: `plugins/pignolo/skills/init/SKILL.md`, `plugins/pignolo/templates/SECURITY.md`
- Modify: `README.md` (la sección "Activar pignolo en un proyecto" pasa a decir `/pignolo:init`; se quita "Hasta que exista"), `plugins/pignolo/skills/status/SKILL.md` solo si menciona la activación a mano
- Test: `tests/skill-init.test.js` (forma, como `tests/skill-forms.js`)

**Interfaces:**
- Skill `init`: frontmatter `name: init`, `description` en inglés (humano solamente), `disable-model-invocation: true`. Texto en inglés; habla con el humano en su idioma. **Un paso por mensaje, a lo sumo una pregunta, dos capas** ("En pocas palabras" y "Detalle técnico", como `setup`; §4.6). Pasos, en este orden:
  1. **Detect.** Corre `init.js detect`; en pocas palabras qué encontró (stack, si ya hay `project.md`); detalle: la tabla de `sources` por clave.
  2. **Tipo y compuertas.** Muestra `type` y los tres `gates` con su fuente; pregunta si confirma o corrige (si `type` es `code-untested` por el placeholder del instalador, lo dice y que la compuerta vacía no da verde).
  3. **Rutas.** `test-paths`, `protected-test-config` (con el aviso de R-10 sobre `package.json`), `high-risk-paths`, `contracts`, `serial-paths`, `cost-paths`, `visible-paths`: agrupadas por propósito, nunca la lista cruda; el humano agrega o quita.
  4. **Datos sensibles.** Una pregunta sobre qué datos maneja el dominio; arma `pii-patterns` (cada uno con `validatePiiPattern`); sin respuesta, ninguno.
  5. **Semilla y mutación.** Muestra `seedPlan` (aplicada / no usada y por qué) y, si hay herramienta de mutación instalada, el `configSnippet` para que el humano lo aplique y diga "listo"; si no hay herramienta, dice que no se declara (dependencia: decisión suya).
  6. **Runners y `.pignolo/worktrees`.** Muestra `runnerExcludes` con el fragmento exacto; lo aplica el humano.
  7. **Reglas del proyecto.** Muestra `domain-rules` (solo rutas) y pregunta si las deja.
  8. **Git y seguridad.** Reflog (`never`, con la razón en una línea), `.gitattributes`, `.gitignore`; `SECURITY.md` con la pregunta del canal (R-18); habilitar el reporte privado del hosting lo hace él.
  9. **Auto-memoria.** Cuenta de archivos, cuántos se migran y cuántos se saltean y **por qué tipo** (nunca el texto); pregunta aparte por migrar y por desactivar (dos síes, R-14).
  10. **Plan y vista previa.** Escribe el plan con **Write** (nunca por comillas de la shell) a un archivo temporal, corre `init.js preview --plan <archivo>`, muestra el resultado y pide el sí.
  11. **Apply y verify.** Solo tras el sí explícito del humano en su propio turno corre `init.js apply --plan <archivo>` y luego `init.js verify`; informa `conflicts`, `notes` y `trackedModified`.
  12. **Commit propuesto.** Muestra `nextCommit.files` y el mensaje en español y **pregunta**; commitea solo con un sí (y en el repo compartido del proyecto de origen, según D-8-7). Nunca `push`. Cierra con la próxima acción: "corré `/pignolo:close-session` para validar lo migrado" si migró.
- Reglas de la skill: nunca editar `project.md`, `.claude/` ni `.git/config` con Edit/Write (lo hace el script); nunca correr `apply` sin `approved` explícito; cada conteo y ruta sale del JSON del script; si `detect` da `refused`, mostrar `reason` y `Alternativa:` y parar.
- `templates/SECURITY.md`: el `SECURITY.md` corto (versiones con soporte, canal privado, qué esperar, alcance) con `{{project}}`, `{{supported}}`, `{{channel}}`; sin promesas legales (R-18); partir del `SECURITY.md` de este repo.

**Tests literales (`tests/skill-init.test.js`; forma, sin agentes):**
- [ ] El frontmatter tiene `disable-model-invocation: true` y `name: init`; el texto menciona los 12 pasos en el orden dado (se verifica por los comandos del script que cada uno nombra: `detect` antes de `preview`, `preview` antes de `apply`, `apply` antes de `verify`).
- [ ] La skill **no contiene** ninguna instrucción de escribir `project.md`, `.git/config` ni `.claude/settings` con Edit/Write, ni `git push`, ni `commit` sin pregunta (búsqueda de patrones prohibidos: rojo agregando una línea que lo diga).
- [ ] `templates/SECURITY.md` contiene los tres marcadores exactos y ningún otro `{{...}}`; no contiene la palabra "cumple" (R-18).
- [ ] `README.md` ya no dice "Hasta que exista `/pignolo:init`" (guarda de regresión del cambio) y nombra `/pignolo:init`.
- [ ] Los textos de los pasos que hablan al humano traen las dos capas (el test busca los dos encabezados que `setup` usa, en el mismo estilo que `tests/skill-lanes.test.js`).
- [ ] La skill `init` aparece donde `tests/manifest.test.js` enumera las skills (se actualiza; guarda de regresión).
- [ ] Commit: `feat(init): skill init, plantilla de SECURITY.md y README`.

### Task 11: llamada al arnés de medición del criterio de éxito (`tests/seeded-defects.test.js`) (D-8-5, movida al plan de la comparación)

El kit de defectos sembrados, sus detectores y la medición con el plan real **ya no se construyen en este hito**: son del arnés de `docs/plans/2026-10-01-bench-pignolo-vs-base.md` (tarjeta B3 para los detectores y semillas; B8 para el contrato). Este hito solo llama.

**Files:** Create `tests/seeded-defects.test.js` (contrato mínimo, sin agentes).

**Interfaces (nombres exactos del arnés; si cambian, gana el que se una primero a `main`):**
- Detectores y semillas gratis: `tests/bench/vs-base/grade.js` (`gradeRun`), `tests/bench/vs-base/detectors/*.js`, `tests/bench/vs-base/seeds/seeds.json`; se prueban con `npm test` (`tests/bench-vsbase-grade.test.js`).
- Corrida paga (la lanza el autor, ver Task 13 punto 10): `node tests/bench/vs-base/run.js --suite seeded --arm pignolo-balanced --reps 5 --stage 3 --out results/<campaña>` y `node tests/bench/vs-base/run.js --suite real-plan --arm pignolo-balanced --seeds all --reps 1 --stage 4 --out results/<campaña>`.
- Salida que se lee: `results/<campaña>/seeded.json` y `results/<campaña>/real-plan.json`, con `seededReached[]` (`{ id, kind, reached, why }`) y `questions.uncategorized`.

**Tests literales:**
- [ ] `tests/seeded-defects.test.js` verifica que existen `tests/bench/vs-base/run.js` y `seeds/seeds.json` y que `seeds.json` trae los cinco tipos de §0 (`decorative-test`, `dead-defense`, `indirect-destructive-command`, `sensitive-learning`, `project-data-query`); si el arnés no está en la rama, el test se salta con `skip` y motivo (no define sembrados propios).
- [ ] Rojo: quitar un tipo de `seeds.json` hace fallar el test.
- [ ] Commit: `test(seeded): contrato con el arnés de medición del criterio de éxito`.

**Cierre de la ola 5:** unir, suite completa una vez.

## Ola 6 (Task 12, sola)

### Task 12: evals `agents` del `debugger` (opus escribe los casos; costo del autor, D-8-4)

**Files:**
- Create: `tests/evals/agents/debugger-wrong-suspect/`, `tests/evals/agents/debugger-off-by-one/`, `tests/evals/agents/debugger-not-reproducible/` (cada uno con su `eval.json`/`prompt.md`/repo mínimo, en el formato de `explorer-cites-lines` y `researcher-no-repo`), `tests/evals/debugger-cases.js` (grader), `tests/eval-debugger-cases.test.js` (valida los graders sin gastar tokens)
- Modify: `tests/evals/RESULTS-hito-8.md` (lo crea la Task 14 con las cifras)

**Interfaces / casos (cada defecto plantado es conocido por quien escribe el caso; el `debugger` no lo ve):**
- `debugger-off-by-one`: un módulo de 40 líneas con un test que falla y un error de límite (`<` por `<=`) en `src/range.js:<línea>`; la tarjeta no sugiere área. Éxito: la causa en el archivo y la línea correctos, con la salida del test citada.
- `debugger-wrong-suspect`: la tarjeta sugiere un área equivocada ("sospecho de `src/cache.js`") y la causa real está en `src/parse.js`. Éxito: encuentra `src/parse.js:<línea>` **y** dice que el área sospechada no es la causa, con evidencia (la carta lo pide: "tratar la sospecha como una afirmación a verificar").
- `debugger-not-reproducible`: el fallo depende de un reloj/estado que la tarjeta describe mal y **no** reproduce. Éxito: lo dice, no inventa una causa, rotula "hypothesis — not verified" y cierra `BLOCKED` o `NEEDS_CONTEXT`.
- Graders (puros, en `debugger-cases.js`): `graderFor(case)(output, repoDir) → { pass, why }` mira (a) causa con `ruta:línea` igual a la plantada (tolerancia de ±2 líneas), (b) evidencia con un bloque de salida citado, (c) **cero archivos modificados** (`git status --porcelain` del repo del caso vacío: el `debugger` no escribe), (d) última palabra ∈ `DONE|BLOCKED|NEEDS_CONTEXT`, (e) en `not-reproducible`, ausencia de una causa afirmada sin la marca "hypothesis — not verified" (G10: grader estricto donde parsea una máquina).
- Umbral (§0, criterio d): recall >= 80 % en los defectos plantados y <= 20 % de falsos positivos en diffs limpios en 5 corridas por caso; los casos 1 y 2 miden recall, el 3 mide el falso positivo (afirmar causa donde no hay).
- Una corrida por caso en el script de la etapa (G14: `--case` toma solo el último); trazas de las corridas falladas con `persistFailedTraces` (hito 6, G17) si existe.

**Tests literales (`tests/eval-debugger-cases.test.js`; graders sobre salidas sintéticas, sin agentes):**
- [ ] Salida que cita `src/range.js:12` (plantada en 12) con bloque de test → `pass`; la misma con `src/range.js:30` → fallo (rojo: tolerancia infinita); sin bloque de salida citado → fallo (b).
- [ ] `wrong-suspect`: una salida que confirma `src/cache.js` → fallo; una que da `src/parse.js:<línea>` pero no descarta la sospecha → fallo (la mitad del criterio); las dos cosas → `pass`.
- [ ] `not-reproducible`: una salida con causa afirmada y `DONE` → fallo; con "hypothesis — not verified" y `BLOCKED` → `pass`; con causa sin marca y `NEEDS_CONTEXT` → fallo.
- [ ] Un repo del caso con un archivo modificado tras la corrida (el `debugger` escribió) → fallo (c) sea cual sea el resto.
- [ ] Una salida sin palabra final o que termina ofreciendo seguir ("¿querés que lo arregle?") → fallo (d).
- [ ] Los repos de los casos 1 y 2 arman un `test` que falla antes de la corrida (el fallo es real: el test lo corre con `node --test` y espera exit 1) y pasa al aplicar el arreglo conocido (que el test **puede** pasar: rojo/verde del caso mismo).
- [ ] Commit: `test(evals): casos y graders del debugger`.

## Ola 7 (Tasks 13 y 14 en paralelo)

### Task 13: checklist manual de adopción y medición del criterio de éxito (`tests/manual/hito-8.md`) (D-8-1, D-8-5, D-8-7)

**Files:**
- Create: `tests/manual/hito-8.md`

**Contenido (se corre en sesión INTERACTIVA, Windows nativo, con el plugin de 8b instalado; registrar fecha, versión de Claude Code y resultado de cada punto; los resultados con datos del proyecto de origen van a `local/`, nunca a git):**
1. [ ] `/pignolo:init` en un repo de prueba **nuevo** (node con vitest): un paso por mensaje, dos capas, una pregunta por mensaje; nada escrito antes del sí; el `preview` coincide con lo que después hace `apply`. Anotar los mensajes que fallen.
2. [ ] Lo mismo en un repo con `project.md` ya escrito a mano: aparecen `conflicts`, el archivo conserva sus valores y hay respaldo.
3. [ ] `/pignolo:init` desde una **worktree** de tarea: escribe en el principal.
4. [ ] Un `implementer` real intenta `node …/scripts/init.js apply`: la guardia lo niega (regla `pignolo-init`) con `Alternativa:`.
5. [ ] Auto-memoria: en un proyecto con memoria real de prueba (no la del proyecto de origen): migrar, ver `learnings/proposed/`, correr `/pignolo:close-session` (hito 6) y confirmar que el `learning-validator` filtra; desactivar y comprobar que Claude Code **ya no escribe** memoria nueva (a verificar: el nombre de la clave; si no surte efecto, corregir `AUTO_MEMORY_KEY`).
6. [ ] **Límite b del hito 3b con un runner real:** un repo con vitest (y otro con jest) y un `daily` abierto con su worktree en `.pignolo/worktrees/`; correr la compuerta en `<main>` y mirar si el runner levanta tests de la worktree, con y sin la exclusión del fragmento de `init`. Anotar también `node --test`, `pytest` y `cargo` (los `unknown` de R-9) y pasar el resultado a la tabla de `runnerExcludes`.
7. [ ] **Semilla:** con un proyecto vitest, correr la compuerta dos veces con `--seed 1` y `--seed 2` y comprobar que el orden de los tests cambia (el `{seed}` llega al runner); `seedInCommand: true` en el sello.
8. [ ] **Adopción en el entorno del autor (D-8-1; cada paso destructivo con confirmación y el respaldo primero):** (a) zip de respaldo de `~/.claude` y registro de dónde quedó; (b) instalar y probar pignolo en un plan real **con superpowers aún instalado**; (c) desinstalar superpowers; (d) quitar de ECC lo roto (`/orch-*`, `/epic-*`, `/loop-*`) y lo riesgoso (`/santa-loop`, `/multi-*`, `/checkpoint`); (e) limpiar la allowlist global (`git push origin main`, `prisma migrate reset --force`, `node -e`, `Bash(claude:*)`) y `autoMode.environment`. Cada ítem se ejecuta **por el humano** o con su "sí, borralo" explícito ítem por ítem; ningún agente lo hace por su cuenta.
9. [ ] **Convivencia en el proyecto de origen (D-8-7):** `init` en el repo compartido: pignolo lee `docs/sessions/` y `.claude/rules/` y escribe `.pignolo/state/` en paralelo, sin borrar ni mover nada del repo; verificar con `git status` que no cambió ningún archivo ajeno; decidir con el autor si `.pignolo/` y `SECURITY.md` se versionan en una rama propia.
10. [ ] **Criterio de éxito de la v1 (§0, D-8-5 movida al plan de la comparación):** se mide **solo** llamando al arnés de `docs/plans/2026-10-01-bench-pignolo-vs-base.md`, en sus etapas y con su tope (D-B-1), que el autor aprueba antes de cada corrida paga. Orden: (i) `npm test` (detectores y semillas, gratis); (ii) `node tests/bench/vs-base/run.js --suite seeded --arm pignolo-balanced --reps 5 --stage 3 --out results/<campaña>`; (iii) `node tests/bench/vs-base/run.js --suite real-plan --arm pignolo-balanced --seeds all --reps 1 --stage 4 --out results/<campaña>` (plan real del proyecto de origen con los cinco sembrados; solo con permiso expreso, D-B-4). Se lee `seeded.json` y `real-plan.json`: (a) ningún `seededReached` de tipo `decorative-test` o `dead-defense` con `reached: true` sin haber sido detectado; (c) `questions.uncategorized` = 0. Los criterios (b) (`tests/backup`) y (d) (evals de agentes, Task 12 y hitos anteriores) no son del arnés. Los informes con datos del proyecto van a `local/`, nunca a git.
- Un `dead-defense` que llega a `int/` es un hallazgo (gap de `docs/gaps.md`), no un fallo del plan.

### Task 14: cierre de 8b, resultados y documentos (`docs/`, `CHANGELOG.md`, `plugin.json`)

**Files:**
- Create: `tests/evals/RESULTS-hito-8.md`
- Modify: `docs/gaps.md`, `docs/benchmarks.md` (solo cifras agregadas sin datos del proyecto, por la memoria del autor: sumar cada diferencia medida frente a Claude Code base o a superpowers), `docs/STATE.md`, `CHANGELOG.md`, `plugin.json`; el spec **solo con la autorización del autor** (ver "Cambios de spec")

**Pasos:**
- [ ] Evals del debugger por etapas (D-8-4), en WSL2: sonda (1 corrida de `debugger-off-by-one`), calibración (1 por caso), completa (5 por caso). **Frenos:** si la sonda no pasa, parar y revisar el caso; si la calibración da recall 0 en un caso, parar; si el gasto acumulado pasa el tope de la etapa, parar y reportar. Una corrida por caso (G14), `-j 2` como mucho. Resultados con costo real en `RESULTS-hito-8.md`.
- [ ] Registrar en `docs/gaps.md` lo que `init` y la adopción mostraron que pignolo podría hacer mejor (con dato y costo, como pide la memoria del autor), y la lista de los límites declarados de R-9, R-11 y R-14.
- [ ] Versión y CHANGELOG de 8b; suite completa una vez; revisión final opus de 8b con una pasada de arreglos.
- [ ] El checklist `tests/manual/hito-8.md` queda **listo para correr**; correrlo (y registrar `hito-8-resultados.md`) es del autor.
- [ ] Commit: `docs(init): resultados del hito 8, gaps y benchmarks`.

---

## Estimación de costo de las evals

*Base medida:* WSL2, agentes con shell, hito 4b: 35 corridas = 5,28 USD, **≈ 0,15 USD por corrida** (`tests/evals/RESULTS-hito-4.md`) con sonnet; el `debugger` es **opus con `effort: high` y Bash**, que cuesta más: se supone **0,30 USD por corrida**. *Hipótesis, sin medir en estos casos.*

| Etapa | Corridas | Cálculo | Estimado | Tope |
|---|---|---|---|---|
| Sonda (`debugger-off-by-one`) | 1 | 1 × 0,30 | 0,30 | 0,6 |
| Calibración (1 por caso) | 3 | 3 × 0,30 | 0,90 | 1,5 |
| Completa (3 casos × 5) | 15 | 15 × 0,30 | 4,50 | 6,0 |
| **Total** | 19 | | **≈ 5,7 USD** (rango × 0,6 a × 1,5: 3,4 a 8,6) | **8,0** |

El tope de 8 USD de D-8-4 deja ≈ 0,5 para las corridas en vuelo al cortar. Costo de tokens de agentes de **8a: 0**. La **auditoría previa en dos pasos** (D-8-6) de las Tasks 4, 5, 6 y 8 se estima en 1,5 a 2,5 USD (receta medida, `tests/evals/RESULTS-planes.md`). La **ejecución** de este plan (implementadores sonnet y las dos revisiones opus) se estima como la de los hitos 5 y 7, ≈ 0,3 a 0,5 millones de tokens por parte. La **medición del criterio de éxito** ya no se estima aquí: está en la tabla de costos del plan de la comparación (`docs/plans/2026-10-01-bench-pignolo-vs-base.md`, D-B-1).

## Decisiones del autor

*Estado al 2026-10-01: D-8-1, D-8-2, D-8-3 y D-8-7 APROBADAS por el autor tal como se recomendaban; D-8-4 (evals del debugger, tope 8 USD) y D-8-6 (auditoría previa en dos pasos) APROBADAS; D-8-5 MOVIDA al plan de la comparación (`docs/plans/2026-10-01-bench-pignolo-vs-base.md`). No queda decisión abierta en este hito; el costo de la medición es la decisión D-B-1 de aquel plan.*

**D-8-1. Adopción en el entorno del autor: lista manual, sin script que borre (reservada: borra; no bloquea el código).** **[APROBADA por el autor como se recomendaba, 2026-10-01]** El spec §14 manda: instalar y probar pignolo con superpowers aún instalado, desinstalarlo, quitar de ECC lo roto y lo riesgoso, limpiar la allowlist global y `autoMode.environment`, con backup zip de `~/.claude` primero y cada paso destructivo con confirmación. **Recomendación: sí, como lista de `tests/manual/hito-8.md` punto 8 que ejecuta el humano (o que autoriza ítem por ítem), sin ninguna automatización** (R-19): ningún código de este hito borra nada. Alternativa: un subcomando `setup.js adopt --dry-run` que solo liste lo que quitaría; no se recomienda en v1 (más superficie sobre la configuración del usuario, que es de la persona).

**D-8-2. `init` escribe `.claude/settings.local.json` y migra la auto-memoria (reservada: cambia un contrato de §10.5 y toca datos del usuario; bloquea las Tasks 5 y 6).** **[APROBADA por el autor como se recomendaba, 2026-10-01]** §10.5 dice que `init` "propone `autoMemoryEnabled: false` y migra la auto-memoria". **Recomendación: sí, con estas salvaguardas (R-14, R-16):** dos síes separados (migrar, desactivar); se **copia** y nunca se mueve ni se borra la memoria original; todo archivo se escanea y el que tenga un secreto, un dato del dominio o más de 1.200 caracteres **no se propone** y se informa sin texto; lo migrado queda `proposed` y vale solo después de `/pignolo:close-session`; los archivos de tipo `user` no se migran. Alternativa: no migrar nunca y dejar solo la desactivación (más simple y sin riesgo de fuga, pero se pierde lo aprendido).

**D-8-3. Marcador `{seed}` en los comandos de compuerta (reservada: cambio aditivo de contrato de §8.2; bloquea la Task 3).** **[APROBADA por el autor como se recomendaba, 2026-10-01]** El hito 4a ofrece la semilla como `PIGNOLO_TEST_SEED`, pero una variable de entorno en el texto del comando no es portable entre `cmd.exe` y `sh`, así que `init` no podría escribir un `on-done` que la use. **Recomendación: sí, `{seed}` expandido por `lib/gate.js` y `seedInCommand` en el sello** (R-7): una compuerta sin el marcador no cambia, y pignolo pasa a saber si la semilla se usó. Alternativa: dejar la semilla en la variable y que `init` documente por runner cómo leerla (cada proyecto escribiría su propio puente; no portable).

**D-8-4. Evals del `debugger` (reservada: costos, §4.1.3): tope 8 USD, por etapas con frenos** **[APROBADA por el autor, 2026-10-01]** (≈ 5,7 USD estimados, tabla arriba; opus con `effort: high`). **Recomendación: aprobar.** §18 punto 8 y el criterio (d) de §0 exigen `agents` (debugger) con recall >= 80 %. Alternativa: 3 corridas por caso en vez de 5 (≈ 3,5 USD) con menos confianza estadística.

**D-8-5. Medición del criterio de éxito de la v1 (MOVIDA al plan de la comparación, 2026-10-01).** El autor unificó este plan con `docs/plans/2026-10-01-bench-pignolo-vs-base.md`: la medición (detectores y semillas gratis primero, después el plan real con los cinco sembrados; ≈ 1 a 2 millones de tokens por corrida real) la hace ese arnés, con su tabla de costos y su tope (D-B-1, decisión abierta del autor allí). Este hito solo llama al arnés (Tasks 11 y 13 punto 10, nombres exactos allí) y no define sembrados, detectores ni calificador propios. El manejo de datos del proyecto de origen (informes en `local/`, solo cifras agregadas a `docs/benchmarks.md`) pasa a D-B-4. *Referencias que quedan por limpiar tras la auditoría paralela de este plan (esta pasada solo tocó las tarjetas de D-8-5 y las decisiones): el kit y la medición aún se nombran en la cabecera, 8a/8b, las restricciones, el conteo de tests de 8a y "Cambios de spec" (§18 punto 8 y la lista de decisiones del autor).*

**D-8-6. Auditoría previa en dos pasos de las Tasks 4, 5, 6 y 8 (costo; recomendada porque el hito es riesgoso).** **[APROBADA por el autor, 2026-10-01]** Tocan `.git/config` y el respaldo (4), datos privados de la auto-memoria (5), la configuración del usuario (6) y la guardia (8). **Recomendación: aprobar** (≈ 1,5 a 2,5 USD, una auditoría opus con la receta medida, antes de ejecutarlas; el resto, la revisión final de cada parte). Alternativa: solo la revisión final (ahorra el costo, con el riesgo de que un fallo de las Tasks 4 a 6 aparezca recién con datos reales del usuario).

**D-8-7. Qué se versiona en el repo compartido del proyecto de origen (reservada: cambia el repo de otros; bloquea solo el paso de commit de la skill).** **[APROBADA por el autor como se recomendaba, 2026-10-01]** Para que la cola lea la configuración de la compuerta de la punta de `int/<plan>` (R-12 del hito 7), `.pignolo/project.md` tiene que estar commiteado; lo mismo `.pignolo/.gitignore`, `.gitattributes` y `SECURITY.md`. En un repo que comparte con otros eso agrega archivos al repositorio ajeno. **Recomendación: versionarlos, en una rama propia (`chore/pignolo-init`), sin push, y que el autor decida el merge.** Alternativa: dejarlos fuera de git con `.git/info/exclude`: `project.md` no estaría en las refs y pignolo caería en modo conservador dentro de `queue/` e `int/`.

**Registradas como técnicas (sin pedir):** R-1 a R-20 (salvo lo que D-8-1 a D-8-7 anotan): `init` como script con subcomandos y `apply` por pasos aprobados; la fusión de `project.md` sin pisar; la deducción con fuente y sin inventar; `pii-patterns` y el canal de `SECURITY.md` desde la entrevista; `package.json` en `protected-test-config` por defecto (R-10, reversible por el humano); la mutación sin instalar nada (R-11); el reflog con `setReflogPolicy` (R-12); la constante `PIGNOLO_IGNORED` compartida con `run.js` (R-13); el reparto 8a/8b y las versiones (a ajustar a lo publicado). **El plan no empuja nada ni borra nada; unir `core/hito-8a` y `core/hito-8b` a `main` y publicar son del autor.**

## Cambios de spec y de contratos para el autor (ninguno se editó en este plan)

- **§14, párrafo de `/pignolo:init`:** pasar de "propone desactivar la auto-memoria y migrarla" a lo decidido (D-8-2: copia, escaneo, `proposed`), y listar los pasos reales (`project-md`, `reflog`, `gitattributes`, `ignores`, `security-md`, `migrate-memory`, `auto-memory-off`). Lo autoriza el autor.
- **§8.2 (compuerta, semilla):** agregar el marcador `{seed}` y el campo `seedInCommand` del sello (D-8-3, aditivo); el párrafo del hito 4a dice "cómo la usa el `on-done` lo escribe `/pignolo:init`": queda cumplido.
- **§10.5:** la frase sobre Engram ya está desfasada (D-6-1); la parte de la auto-memoria pasa a describir la migración a `learnings/proposed/` con `source: session`.
- **§3.2:** sin cambios de contrato (todas las claves ya existen); `gates.pre-merge-files` es del hito 7.
- **§18 punto 8:** agregar el kit de defectos sembrados y `tests/manual/hito-8.md` a la lista de pruebas del hito.
- **Aditivos, sin romper nada:** `PIGNOLO_IGNORED` (movida), `seedInCommand` en sellos, la familia `pignolo-init` de la guardia, los ids de paso de `init`.
- **D-8-2, D-8-3, D-8-5 y D-8-7** son las que piden al autor una decisión de contrato, costo o alcance.

## Auditoría de esta versión y dónde quedó cada hallazgo

**Pendiente.** Este plan se escribió por lectura del repo y de los planes 5, 6 y 7, sin auditoría independiente. Por el riesgo del hito (D-8-6), la auditoría en dos pasos (revisor `plan-auditor` en modo `review`, luego `verify` con sondas fijas y un experimento por afirmación; `scripts/plan-audit.js`) debe correr sobre las Tasks 4, 5, 6 y 8 **antes de ejecutarlas**, y esta sección se completa con la tabla de hallazgos, su gravedad, dónde quedó cada uno y el test que lo fija (formato del hito 7). Las afirmaciones que el paso 2 debe medir primero: (1) que `setReflogPolicy` y `ensureIgnored` hacen lo que R-12 y R-13 les atribuyen; (2) que `protect-paths` niega `.claude/settings.local.json` y `.pignolo/project.md` a Edit/Write incluso al hilo principal (R-1); (3) que la guardia hoy deja pasar `node scripts/init.js` a un subagente (rojo de la regla); (4) la ubicación y el formato de la auto-memoria y el nombre de `autoMemoryEnabled` (R-14, R-16); (5) las opciones de semilla de cada runner (R-7); (6) que `readEntries`, `proposeLearning` y `scanLearning` del hito 6 existen con las formas que este plan supone cuando el hito 6 esté construido.
