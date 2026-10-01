# Hito 7 del núcleo: ramas y paralelismo. Plan de implementación (método liviano)

> **Para quien ejecute:** olas de a lo sumo dos tareas en paralelo (CLAUDE.md: "uno o dos frentes a la vez"), implementadores sonnet, sin revisión por tarea, una revisión final opus por parte con una pasada de arreglos. Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Lo que no se midió está marcado "a verificar" y tiene una tarea o un experimento dueño.

**Objetivo:** que un plan se ejecute en olas sin pisarse: nombres y tags de §11.1, worktrees por tarea (mecanismo elegido con una medición A/B, Task 13), `run.json` siempre en v2 (una o varias tareas), modo serial por defecto y paralelo solo si el plan lo pide (G16, D-7-2), cola de integración operada por el `integrator` (`merge-tree` → `queue/<plan>` → `pre-merge` sellado → `--ff-only` + tag `cp/`), la **repetición** de `pre-merge` que el hito 4 difirió (§9.4), limpieza (§11.5) y `next` con "`queue/` con conflicto".

**Arquitectura:** dos partes como en los hitos 3 a 5. **7a** es todo lo determinista (librerías, scripts, la regla de la guardia, `run.json` v2, tests de §15 `queue`, `worktree`, `state-queue`, cobertura de `next`) y no gasta tokens de agentes. **7b** son las skills (`execute-plan`, `cleanup`, el paso de ejecución de `plan`), la carta del `integrator`, el checklist manual del mecanismo A y las evals `agents` del `integrator` y del `worktree`, con costo que decide el autor.

**Stack:** Node ≥ 22 sin dependencias npm, `node:test`, git ≥ 2.31 (el mínimo del spec; ver R-5 sobre `merge-tree`), hooks de Claude Code. **Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` §11 (11.1 a 11.6), §6 (`integrator`, marca `run.json`), §8.3, §9.4 (repetición), §10.1 (estado), §15 (`queue`, `worktree`, `state-queue`, `agents`), §18 punto 7. **Gaps:** G16 (serial vs paralelo) y G8 (suites en paralelo dan fallas de tiempo), `docs/gaps.md`.

## Alcance: por qué el hito 7 se parte en dos

- **7a (versión siguiente a la última publicada; hoy 0.6.2, y con 5a, 5b y 6 serían 0.7.0, 0.8.0 y 0.9.0, así que 7a = 0.10.0: ajustar a lo publicado):** `lib/branches.js`, `lib/worktrees.js`, `lib/waves.js`, `lib/queue.js`, `lib/branch-cleanup.js` y sus scripts, `run.json` v2, `gate`/`handback-gate`/`protect-paths` con varias tareas, reglas `pignolo-queue` y `pignolo-worktree-tools` de la guardia, `next`, aviso de ramas viejas en `SessionStart`. Sin evals.
- **7b (7a + 0.1):** skills `execute-plan` y `cleanup`, edición de la skill `plan` (reemplaza R-11 del hito 5: ejecución serial), carta del `integrator`, checklist manual `tests/manual/hito-7.md` (incluye el A/B medido del mecanismo de worktrees), evals.
- **Dependencias:** parte de `main` con 5a y 5b unidos (usa `lib/next.js`, `skills/plan` y `isCardPlan` de `lib/plan-check.js`). Del hito 6 no usa código: los tests de `.pignolo/state/` crean archivos sintéticos en esa ruta; si el 6 ya está, no cambia nada.
- **Diferido, con dueño:** `/pignolo:init` y la medición con el plan real (hito 8). Agent teams siguen sin soporte (§6).

## Global Constraints

- Node ≥ 22, sin dependencias npm. `npm test` para la suite completa, nunca `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits con `git commit -F <archivo>`; archivos LF sin BOM; nada de texto largo por comillas de la shell (regla 6 de `rules/core.md`).
- Los scripts que lanzan comandos del proyecto (compuertas, `deps-install`) lo hacen **con shell** (shims `.cmd` de Windows, medido), con plazo y matando el árbol, como `lib/gate.js`.
- Los scripts nuevos son CLIs fuera de todo hook; salida JSON por stdout; exit 0 ok, 1 fallo con `kind` estructurado (G7: `refused`, `kind`, `conflicts`, nunca solo texto), 2 uso incorrecto, **3 = no se pudo dejar el estado consistente** (como `sabotage.js`). Cada fallo con `Alternativa:` en stderr.
- Hooks: forma exec con el launcher, plazo interno 3 s que al vencer niega, callados en el éxito, filtran evento y agente antes de cargar módulos de git. `/pignolo:off` apaga lo nuevo (§3.3); la guardia de git y los respaldos no.
- Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js`. Escrituras atómicas (temp + rename). Datos de ejemplo sintéticos (el repo es público).
- **Nunca** `push`, `--force`, `worktree remove --force`, `branch -D`, `checkout ref -- path` ni `stash`: ni en los scripts ni en las skills. Lo que borra ramas o worktrees solo corre con una lista que el humano aprobó (D-7-5).
- Claves nuevas de `project.md` (`gates.repeat`) y de `run.json` (`tasks`, `v: 2`) son **aditivas**: un archivo de hoy se lee igual.

## Método de ejecución y economía de tests

El de los hitos 4 y 5: worktrees a mano desde la etiqueta del contrato (`contract/hito-7a/v1` tras la ola 0), implementadores sonnet en segundo plano con brief e informe en archivo, **respondiendo una sola vez y sin procesos vivos** (G9). Cada implementador corre **solo sus archivos** con `node --test --test-reporter=dot <archivo>` (G8); la **suite completa corre una sola vez por unión**, con la máquina tranquila, y una vez al cierre. Tests de tabla desde el spec, handlers en proceso (`require(handler).run(input, ctx)`) y **un** test de humo por el launcher real por hook tocado (Task 8); los de `queue` y `worktree` usan repos reales de `makeRepo()` (git de verdad, sin dobles: el riesgo está en cómo git responde). **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión" y no cuenta. Primer paso de cada tarea de ola ≥ 1: `git merge-base --is-ancestor contract/hito-7a/v1 HEAD`; si falla, `BLOCKED`.

**Estimación de tests nuevos de 7a: ~150 subtests en 12 archivos** (`branches` 14, `run-tasks` 14, `worktree` 14, `waves` 22, `queue` 30, `state-queue` 5, `handback-tasks` 10, `guard-queue` 8, `branch-cleanup` 14, `next-queue` 6, `session-start-branches` 4, `e2e-hito-7` 4 por el launcher real). Más ~10 casos de grader en 7b (costo 0).

## Review Focus

1. **La cola deja en `int/` algo que no estaba sellado, o pierde trabajo.** El avance de `int/<plan>` es lo único irreversible local: compare-and-swap sobre el sha viejo, solo con el sello `pre-merge` del **árbol exacto** de `queue/<plan>`, y un commit de estado entre dos merges no lo rompe (`state-queue`). Dueñas: **Tasks 5 y 6**.
2. **Un conflicto "trivial" que no lo es.** La clasificación es mecánica (bloques solo con inserciones de ambos lados, tamaño acotado, fuera de `contracts`/`serial-paths`/tests protegidos) y la resolución conserva ambos lados; lo que falle la compuerta vuelve a la tarea. Un conflicto de lógica nunca lo resuelve nadie en la cola. Dueña: **Task 5**.
3. **Dos implementadores se pisan o uno escribe en el checkout principal.** Edit/Write de un escritor con `run.tasks` no vacío solo entra en la worktree de alguna tarea registrada; los archivos de cada tarea se miden contra su propia worktree (`checks.scope`). Límite declarado: asociar un `agent_id` a una tarea exacta no es posible con lo que trae el payload (hito 3a); el `handback-gate` resuelve la tarea por la línea `Task: <id>` del informe (a verificar, R-3). Dueñas: **Tasks 2 y 7**.
4. **La ola decide mal el modo y cuesta de más (G16).** Medido: 7 tareas con un ejecutor serial ≈ 145 mil tokens; 8 en paralelo ≈ 780 mil (≈ 21 mil contra ≈ 97 mil por tarea). El modo por defecto es serial; el paralelo solo corre para tarjetas `judgment` con `Parallel: yes` que cumplen §11.4 y dentro del tope del perfil. Un plan sin `Kind` o sin `Parallel` va a serial. Dueña: **Task 4**.
5. **La limpieza borra lo que no debe.** `cleanup` propone enseguida solo ramas ya unidas a su destino (`git branch --merged <destino>` explícito, nunca contra HEAD), informa sin proponer las no unidas, ejecuta la lista mostrada con un solo sí, con respaldo de refs antes, `worktree remove` sin `--force` y `branch -d` (nunca `-D`): un `-d` rechazado se informa y no se fuerza. Dueña: **Task 9**.
6. **La repetición de `pre-merge` duplica el costo o llama flaky a una carga.** Corre solo cuando el diff toca tests (D-7-3), con la cola sola en la máquina (G8) y un resultado que cambia entre corridas es `FLAKY`, no rojo ni verde. Dueña: **Task 6**.

## Rulings del plan (técnicos, registrados)

- **R-1: el mecanismo principal de worktrees lo decide una medición A/B (D-7-1, decidida el 2026-09-30; Task 13).** A = `isolation: worktree` con un hook `WorktreeCreate` de pignolo; B = worktree a mano (`worktree.js create`). Hasta medir, 7a implementa la **interfaz única** `createTaskWorktree` con B, que es el respaldo en cualquier caso, y marca el **punto de elección** (`MECHANISM` en `lib/worktrees.js`). Evidencia corregida (consultada el 2026-09-30): (a) `worktree.baseRef` acepta **solo `"fresh"` o `"head"`** (<https://code.claude.com/docs/en/worktrees>): la worktree nativa de un subagente no nace de `contract/<plan>/v<N>`, que es lo que §11.2 necesita; A sin hook no sirve; (b) los worktrees nativos traen **controles de aislamiento**: bloquean Edit/Write al checkout principal, el `cwd` fuera de la worktree y `git -C`/`GIT_DIR`; B no los tiene y pignolo los reemplaza con la regla de escritura de la Task 7 y la guardia; (c) el hook `WorktreeCreate` recibe un payload con `worktree_name` y `base_branch` (<https://code.claude.com/docs/en/hooks>) y puede crear la worktree desde el contrato; lo que **no está medido** es si, con el hook reemplazando la creación nativa, el subagente trabaja en la ruta devuelta y **conserva esos controles**; (d) los hitos 2 a 5 se ejecutaron con B (`skills/daily` paso 2, worktrees en `<main>/.pignolo/worktrees/`, ya ignoradas por `.pignolo/.gitignore`) sin incidentes. **Regla de decisión (Task 13):** si A arranca de la base correcta (el tag) **y** conserva los tres controles, A es el principal y B queda de respaldo; si no, B es el principal. Esto puede cambiar el texto de §11.2 ("Mecanismo A (principal)") solo si A gana la medición.
- **R-2: `run.json` se escribe siempre en v2** (D-7-2, decidida el 2026-09-30). `{ v: 2, flow, plan?, started, expires, tasks: { <id>: task } }` con la `task` de hoy dentro, para una o varias tareas; `validateRun` acepta `v: 1` (con `task`) y `v: 2` (con `tasks`): **un archivo v1 existente se sigue leyendo**; `readRun` normaliza a `run.tasks` y expone `run.task` como alias de solo lectura cuando hay exactamente una tarea (compatibilidad con los lectores de los hitos 3 y 4; nunca se escribe). `run.js task` escribe v2 desde la primera tarea y convierte un v1 al tocarlo. Máximo de tareas simultáneas: `PROFILE_PARAMS[profile].parallel` (3/2/1). Anticipado en el ruling del hito 3a.
- **R-3: la tarea del handback-gate se resuelve por `Task: <id>`.** El informe del escritor trae como primera línea `Task: <id>` (lo exige su carta, Task 12). `handback-gate` toma la primera línea que cumpla `^Task:\s*([a-z0-9][a-z0-9-]{0,63})\s*$`; con una sola tarea en `run`, la falta de la línea no bloquea (como hoy); con ≥ 2 bloquea pidiéndola, contado en el tope de 8 bajo la clave fija `_notask`. Una línea con un id ajeno solo puede aceptar si el sello de **esa** tarea es válido para su árbol: no abre nada que la compuerta no abriera. **A verificar** (Task 13): que `SubagentStop` entrega `last_assistant_message` completo y que `agent_type` llega en `PreToolUse` de Edit/Write de un subagente.
- **R-4: `queue/<plan>` se reconstruye en cada entrada.** Cada entrada parte de la punta **actual** de `int/<plan>`: un commit de estado entre merges no deja la cola atrasada. Si `int/` se movió durante la compuerta (el compare-and-swap falla): exit 1 `kind: "int-moved"` y se repite la entrada una vez; la segunda vez, `NEEDS_CONTEXT`.
- **R-5: ¿`merge-tree` o merge directo?** §11.3 pide `git merge-tree --write-tree` (git ≥ 2.38; el spec lo marca hipótesis y su mínimo es 2.31). Este plan lo usa **solo como previsión** (lista de conflictos sin tocar nada); el merge real corre igual en la worktree de la cola, que también detecta conflictos. Con git < 2.38 la previsión se omite (`mergeTree: "unavailable"` en la salida) y no se sube el mínimo. **A verificar por experimento (Task 5, paso 1):** en esta máquina `git version 2.52.0.windows.1` (medido); falta confirmar códigos de salida (0 limpio, 1 con conflictos), `--name-only` y `--no-messages`, y repetirlo en el git del WSL2 del autor (Task 13).
- **R-6: la repetición de `pre-merge` (§9.4) es de la cola.** `gates.repeat` (entero 1 a 5) en `project.md`; sin declarar, la política por defecto es 2 corridas si el diff `int..queue` toca `test-paths` y 1 si no (D-7-3). Corridas distintas con resultados distintos → `FLAKY` (no se sella, la cola no avanza, la tarea vuelve con los tests que difirieron).
- **R-7: modo en serie por defecto; paralelo solo si el plan lo pide** (G16, D-7-2). Medido en G16: el paralelo cuesta ≈ 5× los tokens. `Kind` por tarjeta: `verified-code` o `judgment`; línea opcional `**Parallel:** yes` (el plan pide paralelo para esa tarea). Todas las tareas van **en serie**, una worktree a la vez en el orden del plan, salvo las `judgment` con `Parallel: yes` que cumplan §11.4, sin solape de archivos y con retrabajo previo <= 1: esas van en tandas de a lo sumo `PROFILE_PARAMS[profile].parallel` (el tope del perfil). Sin `Kind` o sin `Parallel` → serial. El serial no evita la cola: cada rama pasa igual por `queue/<plan>`.
- **R-8: la cola es de un solo escritor.** Lock por plan `<main>/.pignolo/tmp/queue/<plan>.lock` (creación exclusiva con `pid` y latido, como `sabotage.js`); un lock vivo da exit 2 `kind: "busy"`; uno con latido viejo y `pid` muerto se toma. La regla `pignolo-queue` limita quién ejecuta `queue.js` (Task 8).
- **R-9: cambios en `.pignolo/state/` desde una tarea: rechazados** (§11.3). `kind: "state-change"` con la lista, antes de mergear. El estado entra a `int/` solo por commits del hilo principal entre merges.
- **R-10: trailers y presupuesto de revisión son señales.** La salida de `queue` trae `missingTrailers` (commits de la tarea sin `Agent:` y `Gates:`) y `diffLines` con `overBudget` (> 400 líneas, §11.1); no bloquean, el `validator` y la revisión final los leen.
- **R-11: `cleanup` propone enseguida lo ya unido y nunca borra en automático** (§11.5, D-7-5 decidida el 2026-09-30). `report` es solo lectura: propone de inmediato las ramas **ya unidas a su destino** (verificado con `git branch --merged <destino>` con el destino como ref explícito, **nunca contra HEAD**) y **solo informa**, sin proponerlas, las no unidas con más de 7 días. El humano aprueba **la lista mostrada con un solo sí** (`apply --proposal <id>`; si el estado cambió desde el reporte, `stale-proposal` y no se toca nada). Por rama: `status --porcelain` limpio → respaldo de refs una vez (`lib/git-backup.js`) → `worktree remove` sin `--force` → `branch -d`. Nunca `--force`, nunca `-D`, nunca `push`; un `-d` que git rechaza se informa con su motivo y **nunca escala**. Las ramas `contract/*`, `cp/*`, `backup/*` y la rama de origen no se proponen nunca.

## Qué se verificó al escribir este plan

Solo lectura del repo en `main` (plugin 0.6.2) y de los planes de los hitos 2 a 5. **Medido:** `git version 2.52.0.windows.1` en esta máquina; `agents/integrator.md` existe con `tools: Read, Bash`, sonnet, effort low y dice que `scripts/queue` "arrives in milestone 7"; `run.js task` guarda **una** `task` y limpia el contador al cambiar de id (por eso R-2); `gate.js --task` toma `run.task`; el sello se guarda por `tree-hash` y nivel (`lib/seals.js`); `lib/holdout.js` ya corre `deps-install` y limpia (se reutiliza); la regla `pignolo-holdout` vive en `lib/git-guard.js` (líneas 61 y 878: modelo de `pignolo-queue`); `protect-paths` ya deja pasar `.claude/worktrees/`; costo de evals con agentes con shell en WSL2: 35 corridas = 5,28 USD (≈ 0,15 por corrida, `tests/evals/RESULTS-hito-4.md`). **No verificado**, cada uno con dueño: R-3 (payloads de subagente, Task 13); R-5 (`merge-tree`, Task 5 y 13); el mecanismo A (Task 13); y que dos worktrees de un mismo repo corran `deps-install` y compuertas a la vez sin pelear cachés (se mide en la Task 11; §11.2 dice que no se comparten puertos ni datos, pero 7a no tiene con qué hacerlo cumplir: queda declarado).

---

# Parte 7a: determinista

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: nombres, tags y validadores (`lib/branches.js`)

**Files:**
- Create: `plugins/pignolo/lib/branches.js`
- Modify: `plugins/pignolo/scripts/run.js` (importa `ID_RE` desde la librería nueva sin cambiar su valor)
- Test: `tests/branches.test.js`

**Interfaces:**
- Consume: `mainRoot` de `lib/disabled.js`.
- Produce: `PLAN_RE = ^[a-z0-9][a-z0-9-]{0,63}$` (la `ID_RE` de `scripts/run.js`, exportada también como `ID_RE`), `SLUG_RE = ^[a-z0-9][a-z0-9-]{0,39}$`, `NN_RE = ^\d{2}$`.
  - `intBranch(plan)` → `int/<plan>`; `queueBranch(plan)` → `queue/<plan>`; `taskBranch({ plan, nn, slug })` → `task/<plan>/<NN>-<slug>`; `dailyBranch({ date, slug })` → `task/daily/<YYYY-MM-DD>-<slug>`; `contractTag(plan, n)` → `contract/<plan>/v<N>`; `cpTag(plan, n)` → `cp/<plan>/<n>`; `backupTag({ date, reason })` → `backup/<fecha>-<motivo>`. Todas lanzan `Error('nombre inválido: …')` si un componente no cumple su regla; el plan `daily` está reservado.
  - `parseBranch(name) → { kind: 'int'|'queue'|'task'|'daily'|'other', plan?, nn?, slug?, date? }`.
  - `nextCp({ refs, plan }) → number` (máximo `cp/<plan>/<n>` existente + 1; 1 si no hay), `latestContract({ refs, plan }) → { tag, n } | null`.
  - `taskWorktreePath(main, plan, nn, slug)` → `<main>/.pignolo/worktrees/<plan>-<nn>-<slug>` (absoluta, con `path.join`).
- Los trailers `Agent:`/`Gates:` los lee `queue` (Task 5), no esta librería.

**Tests literales (de tabla):**
- [ ] Válidos: `taskBranch({plan:'hito-7',nn:'03',slug:'cola'})` = `task/hito-7/03-cola`; `cpTag('hito-7',2)` = `cp/hito-7/2`; `contractTag('hito-7',1)` = `contract/hito-7/v1`; `dailyBranch({date:'2026-09-30',slug:'x'})` = `task/daily/2026-09-30-x`.
- [ ] Inválidos (cada uno lanza): plan `Hito7`, plan `daily`, plan con `/`, `nn: '3'`, `nn: '003'`, slug vacío, slug de 41 caracteres, `n: 0`, `n: 1.5`, fecha `2026-9-3`.
- [ ] `parseBranch`: `task/daily/2026-09-30-x` → `daily` (no `task`); `task/p/01-a-b` → `{kind:'task',plan:'p',nn:'01',slug:'a-b'}`; `feature/x` → `other`; `int/p/extra` → `other`.
- [ ] `nextCp`: sin refs → 1; con `cp/p/1` y `cp/p/3` → 4 (el máximo, no la cuenta); un `cp/otro/9` no cuenta. `latestContract` con `v1`, `v10`, `v2` → `v10` (numérico, no alfabético).
- [ ] `taskWorktreePath` es absoluta y no contiene `..` con un slug válido. **Guarda de regresión:** `tests/run-lifecycle.test.js` verde con `ID_RE` importada.
- [ ] Commit: `feat(ramas): nombres, tags y validadores de §11.1`.

### Task 2: `run.json` v2 con varias tareas (`lib/project.js`, `scripts/run.js`)

**Files:**
- Modify: `plugins/pignolo/lib/project.js` (`validateRun`, `readRun`), `plugins/pignolo/scripts/run.js` (`task`, `task-end`, `status`, `end`)
- Test: `tests/run-tasks.test.js` (nuevo); `tests/run-state.test.js` y `tests/run-lifecycle.test.js` siguen verdes; solo se ajusta lo que mira la forma del archivo escrito (`v: 1`/`task` pasa a `v: 2`/`tasks`) y se lee por `readRun`, sin cambiar ninguna aserción de comportamiento

**Interfaces:**
- `validateRun(obj)` acepta `v: 1` con `task` opcional **o** `v: 2` con `tasks` objeto (`{ <id>: { id, worktree, base, testRef?, files[], agents[], testAuthorization?, branch? } }`, con la clave igual a `task.id` y las mismas reglas de campos de hoy) y `plan` opcional (`PLAN_RE`). `v: 2` con `task`, o `v: 1` con `tasks`, es un error.
- `readRun(main)` devuelve además `run.tasks` normalizado (objeto) en ambos esquemas; `run.task` es alias de solo lectura cuando hay exactamente una tarea (R-2). Helpers exportados: `taskList(run) → task[]`, `taskById(run, id) → task | undefined`.
- `run.js task --id X …` (opciones de hoy, más `--branch <nombre>` y `--plan <plan>` al crear): **escribe siempre v2** (D-7-2): desde la primera tarea, `tasks: { X: … }`; sobre un v1 existente lo convierte (mueve `task` a `tasks`); si la tarea ya existe la actualiza (no cuenta de más). Más tareas que `PROFILE_PARAMS[profile].parallel` (perfil de `~/.pignolo/config.json` vía `readConfig`) → exit 1 `kind: "too-many-tasks"` con el tope y `Alternativa: cerrá una tarea (run.js task-end) o bajá la ola`.
- `run.js task-end --id X [--cwd]`: saca la tarea y limpia su contador; el archivo sigue en v2 aunque quede una sola tarea o ninguna (`tasks: {}`). Id inexistente → exit 1 `kind: "no-such-task"`.
- `run.js status` suma `tasks: { <id>: { …task, handback } }` (contadores por tarea) y sigue dando `run.task` (alias, R-2) cuando hay una sola tarea. `run.js end` limpia los contadores de **todas** las tareas.

**Tests literales:**
- [ ] Un v1 de hoy (escrito a mano en el fixture) se lee igual (`readRun` → `run.tasks` con una entrada, `run.task` intacto). Un `run.js task --id a` nuevo escribe `v: 2` con una sola tarea y `readRun().task` es el alias de `a` (rojo: escribir v1 con una sola tarea). `v: 2` válido; `v: 2` con `task`; `v: 1` con `tasks`; clave distinta de `task.id`; `tasks: []` → cada caso con su resultado.
- [ ] `task --id a` → archivo v2 con `tasks.a`; `task --id b` → `tasks.a` y `tasks.b` con el contador de `a` intacto; `task --id a` otra vez actualiza sin duplicar. Sobre un v1 existente, `task --id b` lo convierte a v2 conservando la tarea vieja.
- [ ] Perfil `economy` (`parallel: 1`): la segunda tarea distinta → exit 1 `too-many-tasks`; con `balanced` (2): la tercera. Sin config → `balanced`.
- [ ] `task-end --id a` con `a` y `b` → queda v2 con solo `b` (no vuelve a v1); `task-end` de la última → v2 con `tasks: {}`; id inexistente → exit 1.
- [ ] `end` con tres tareas borra los tres contadores (mirar `~/.pignolo/handback/` del `PIGNOLO_HOME` de test).
- [ ] Un v2 con una worktree relativa → ilegible (`malformed`), cuenta como flujo en curso.
- [ ] Commit: `feat(run): run.json v2 con varias tareas y tope por perfil`.

**Tag de contrato:** unir Tasks 1 y 2 a `core/hito-7a` y etiquetar `contract/hito-7a/v1`.

## Ola 1 (Tasks 3 y 4 en paralelo; cada una en su worktree)

### Task 3: worktrees por tarea, interfaz única y mecanismo B (`lib/worktrees.js`, `scripts/worktree.js`)

**Files:**
- Create: `plugins/pignolo/lib/worktrees.js`, `plugins/pignolo/scripts/worktree.js`
- Modify: `plugins/pignolo/lib/holdout.js` (importa el instalador de dependencias extraído a `lib/worktrees.js`, sin cambiar su comportamiento)
- Test: `tests/worktree.test.js`

**Interfaces:**
- Consume: Task 1 (`taskBranch`, `taskWorktreePath`, `contractTag`, `latestContract`, `intBranch`), `lib/git.js` (`withDeadline`), `lib/project-config.js` (`deps-install`).
- Produce (`lib/worktrees.js`):
  - **PUNTO DE ELECCIÓN del mecanismo (D-7-1, Task 13):** `createTaskWorktree` es la **única** interfaz que usan el resto del plan y las skills; `MECHANISM = 'B'` en `lib/worktrees.js` hasta que la Task 13 mida A contra B. Aquí se implementa B (`git worktree add` a mano), que queda de respaldo aunque A gane; si A gana, el hook `WorktreeCreate` llama a esta misma función y ningún otro código distingue el mecanismo.
  - `installDeps({ cwd, command, env, timeoutMs }) → { ok, logTail }` (el de `lib/holdout.js`, con shell, plazo y árbol muerto al vencer).
  - `createTaskWorktree({ main, plan, nn, slug, from, depsInstall = true, env, timeoutMs }) → { worktree, branch, base }`: `git worktree add -b <rama> <ruta> <from>`, con `from` = `contract/<plan>/v<N>` si existe uno (el más alto) o `int/<plan>`, salvo que se pase `from`. Verifica `merge-base --is-ancestor <from> HEAD` dentro de la worktree creada (§11.2) e instala dependencias con `deps-install` **dentro** de ella. Si algo falla después de crearla, **no borra nada**: devuelve el error con la ruta (`kind: "partial"`) y deja que el humano o `cleanup` decida.
  - `listTaskWorktrees({ main }) → [{ path, branch, head, dirty, plan, nn, slug }]` desde `git worktree list --porcelain` más `status --porcelain` por cada una (solo lectura).
  - `tagContract({ main, plan, n, ref }) → { tag, sha }`: crea `contract/<plan>/v<N>` en `ref` (por defecto la punta de `int/<plan>`); exige que `n` sea el siguiente (`latestContract + 1`) y que esa punta ya tenga un `cp/<plan>/*` (o sea, que entró por la cola). Nunca mueve un tag existente.
  - `resolveWorktree({ main, filePath, tasks }) → { worktree, task } | null`: dado un archivo, la worktree de `tasks` que lo contiene (la de ruta más larga que sea prefijo; compara con `path.relative` y, en win32, sin distinguir mayúsculas).
- CLI `node worktree.js create --plan P --nn 03 --slug cola [--from <ref>] [--no-deps] | list | tag-contract --plan P --n 1 [--ref <ref>] [--cwd]`; JSON por stdout; `kind` en los fallos: `exists`, `not-ancestor`, `deps-failed`, `partial`, `contract-order`, `no-cp`.

**Tests literales (repos reales):**
- [ ] `create` sobre un repo con `int/p` y `contract/p/v1` (con `int/p` un commit adelantado): la worktree nace del **tag** (`base` = sha del tag, no de `int/p`); la rama es `task/p/03-cola`; la ruta está bajo `.pignolo/worktrees/`; `merge-base --is-ancestor contract/p/v1 HEAD` = 0 dentro de ella.
- [ ] Sin contrato nace de `int/p`; con `from` explícito, de ese ref.
- [ ] `create` dos veces con el mismo nn/slug → exit 1 `exists` y no toca la primera. Con un `deps-install` que falla (un `node` sobre un archivo de fixture que sale 1): `deps-failed`, la worktree sigue ahí (`partial`) y el mensaje trae la ruta.
- [ ] `deps-install` corre con el cwd de la worktree (el fixture escribe `process.cwd()` en un archivo; coincide).
- [ ] `list`: una worktree sucia sale `dirty: true`, una limpia `false`; la principal no sale como de tarea.
- [ ] `tag-contract`: `n: 2` sin `v1` → `contract-order`; sin `cp/` en la punta → `no-cp`; con ambos en orden → crea el tag; repetir → error y el tag no se movió.
- [ ] `resolveWorktree`: un archivo dentro de `wt-a` → `a`; `wt-a` y `wt-ab` (prefijos parecidos) no se confunden; un archivo del checkout principal → `null`; mayúsculas distintas en win32 → mismo resultado.
- [ ] **Guarda de regresión:** `tests/holdout.test.js` verde con el instalador extraído.
- [ ] Commit: `feat(worktree): worktrees por tarea desde el contrato y tag de contrato`.

### Task 4: olas y modo según el tipo de plan (`lib/waves.js`, `scripts/waves.js`)

**Files:**
- Create: `plugins/pignolo/lib/waves.js`, `plugins/pignolo/scripts/waves.js`
- Test: `tests/waves.test.js`

**Interfaces:**
- Consume: `PROFILE_PARAMS` de `lib/roles.js` (`parallel`), `matchAny` de `lib/globs.js`, `readProjectConfig` (`contracts`, `serialPaths`), `isCardPlan` de `lib/plan-check.js` (hito 5a).
- Líneas nuevas opcionales en las tarjetas de un plan, junto a `Files`/`Interfaces`: `**Kind:** verified-code | judgment`, `**Depends:** Task 2, Task 3`, `**External:** yes` (toca un sistema externo real) y `**Contract:** yes` (produce contrato) y `**Parallel:** yes` (el plan pide paralelo para esa tarea; D-7-2). Sin ellas: `kind` desconocido (→ serial, R-7), sin dependencias, sin contrato, sin `Parallel` (→ serial).
- Produce (`lib/waves.js`):
  - `parsePlanTasks(planText) → [{ id, title, files: string[] (Create + Modify + Test, normalizados), depends: string[], kind: 'verified-code'|'judgment'|'unknown', contract: boolean, external: boolean, parallel: boolean }]`; el `id` es el número de `### Task <n>`; si el plan no está en tarjetas, `[]`.
  - `overlaps(a, b) → string[]`: pares de rutas que se pisan (igualdad, una es directorio-prefijo de la otra, o `matchAny` en cualquier sentido).
  - `planWaves({ tasks, profile, contracts = [], serialPaths = [], rework = 0 }) → { waves: [{ n, mode: 'contract'|'serial'|'parallel', tasks: id[], reasons: string[] }], notParallel: [{ task, why }], cost: { serialTokens, parallelTokens } }`. Reglas literales: ola 0 = tareas `contract: true` o que tocan `contracts`, siempre serial; luego capas topológicas de `depends`; dentro de una capa, las `serial-paths` o `external` salen a olas serial de a una; las `verified-code` van a un ejecutor serial (R-7); **el modo por defecto es serial** (D-7-2): las `judgment` con `parallel: true` van en paralelo solo si no se pisan archivos entre ellas y `rework <= 1` (`rework` = tareas devueltas por la cola en este plan: retrabajo previo mayor fuerza serial), en tandas de a lo sumo `PROFILE_PARAMS[profile].parallel` (el tope del perfil); todo lo demás va a olas `serial`. Un ciclo en `depends` → error `kind: "cycle"`.
  - `COST_HINT = { serialPerTask: 21000, parallelPerTask: 97000 }` (de G16: 145 mil / 7 y 780 mil / 8; son órdenes de magnitud y la skill lo dice al mostrarlos).
- CLI `node waves.js --plan-file <ruta> [--profile <p>] [--rework <n>] [--cwd]` → el JSON de `planWaves` (solo lectura). **Antes de cada ola** la skill muestra `cost` y pregunta al humano si el perfil no es `max`: presupuesto y cuota no se pueden medir por script y este no afirma que "hay cuota".

**Tests literales:**
- [ ] `parsePlanTasks` sobre `docs/plans/2026-09-30-hito-5-modo-plan.md` y sobre una tarjeta sintética con `Kind`/`Depends`: ids, archivos (`Create:` + `Modify:` + `Test:` partidos por coma y por línea), `depends: ['1','2']`; sobre un plan en prosa → `[]`.
- [ ] `overlaps`: `lib/a.js` vs `lib/a.js` → 1; `lib/` vs `lib/a.js` → 1; `lib/a.js` vs `lib/b.js` → 0; `tests/*.test.js` vs `tests/x.test.js` → 1.
- [ ] Seis tareas `judgment` sin dependencias y de archivos disjuntos, **todas con `Parallel: yes`**: `balanced` → tres olas `parallel` de 2; `max` → dos de 3; `economy` → seis olas de una (`mode: 'serial'`). **Las mismas seis sin `Parallel`** → seis olas `serial` (rojo: ignorar `parallel` y agrupar por independencia).
- [ ] Cuatro `judgment` con `Parallel: yes`, la 3 y la 4 con un archivo en común → `[1,2]` en una ola `parallel` y `[3]` y `[4]` en olas `serial` aparte (no coinciden en una ola). Dos `judgment` con `Parallel: yes` y `rework: 2` → ninguna ola `parallel`. Una `judgment` sola con `Parallel: yes` → `serial` (no hay con quién).
- [ ] Todas `verified-code` → un solo ejecutor serial en el orden del plan (`mode: 'serial'`, `serialTokens` < `parallelTokens`). Sin `Kind` → serial.
- [ ] Una tarea `contract: true` → ola 0 sola, las siguientes después y `reasons` lo dice; una cuyo archivo cae en `contracts` → igual; una en `serial-paths` o `external` → sola.
- [ ] `rework: 2` → ninguna ola `parallel`. Ciclo `1→2→1` → error `cycle`. Misma entrada dos veces → mismo JSON (determinismo).
- [ ] Commit: `feat(olas): planWaves con modo por tipo de plan (G16)`.

## Ola 2 (Tasks 5 y 7 en paralelo)

### Task 5: cola, parte 1: sincronizar, prever, mergear y clasificar conflictos (`lib/queue.js`, `scripts/queue.js`)

**Files:**
- Create: `plugins/pignolo/lib/queue.js`, `plugins/pignolo/scripts/queue.js`
- Test: `tests/queue.test.js` (casos de esta tarea; la Task 6 agrega los suyos al mismo archivo)

**Interfaces:**
- Consume: Task 1, `lib/git.js` (`withDeadline`), `lib/project-config.js`, `mainRoot`.
- **Paso 1 (experimento, antes de escribir código):** en una copia, correr `git merge-tree --write-tree --name-only --no-messages <a> <b>` con un caso limpio y uno con conflicto y anotar en la cabecera de `tests/queue.test.js` el código de salida y la forma de la salida; si no coinciden con R-5, ajustar `parseMergeTree` y avisar al orquestador.
- Produce (`lib/queue.js`):
  - `syncQueue({ main, plan }) → { worktree, branch: 'queue/<plan>', intSha }`: crea (o reutiliza, nunca borra) la worktree `<main>/.pignolo/worktrees/queue-<plan>` y deja `queue/<plan>` en la punta actual de `int/<plan>` (R-4) con `git switch -C` dentro de ella; con cambios sin commitear en esa worktree → `kind: "queue-dirty"` y no los pisa.
  - `precheck({ main, plan, task }) → { ok, kind?, files? }`: la rama existe, su `merge-base` con `int/<plan>` incluye `contract/<plan>/v<N>` si hay contrato (`kind: "not-ancestor"`), y el diff `<base>..<rama>` no toca `.pignolo/state/` (`kind: "state-change"`, R-9).
  - `previewMerge({ main, plan, task, gitVersion }) → { mergeTree: 'clean'|'conflicts'|'unavailable', conflicts: string[] }` (R-5).
  - `mergeIntoQueue({ main, plan, task, resolveTrivial }) → { status: 'merged'|'conflict', sha?, trivial: [{ path }], logic: [{ path, why }] }`: `git merge --no-ff --no-commit <rama>` en la worktree de la cola; con conflicto, `classifyConflict` por archivo; con `resolveTrivial` y **todos** los archivos triviales, resuelve (ambos lados, el de `int/` primero) y commitea `merge(<plan>): task <NN> (conflictos triviales: <n>)`; si alguno es de lógica, **aborta el merge** (`git merge --abort`), deja la cola limpia y devuelve `status: 'conflict'` con la lista (la tarea vuelve a su rama: rebase en su worktree y falla del plan, §11.3).
  - `classifyConflict({ base, ours, theirs, path, contracts, serialPaths, protectedPaths }) → { trivial: boolean, why }`: trivial solo si `path` no está en `contracts`, `serial-paths` ni tests protegidos, y todos los bloques de `git merge-file --diff3` tienen la sección base **vacía** (solo inserciones de ambos lados), cada lado ≤ 20 líneas y todas las líneas insertadas son importación, entrada de lista o línea en blanco (`^\s*(import |from |export |const .*=\s*require\(|["'\w./@-]+,?\s*$|[-*] .*|)$`). Un archivo binario, borrado/modificado o renombrado es lógica.
- CLI `node queue.js sync|preview|merge --plan P --task <rama|nn> [--resolve-trivial] [--cwd]`. Esta tarea no avanza `int/`.

**Tests literales (repos reales):**
- [ ] `syncQueue` tras mover `int/p` (un commit de estado nuevo) apunta a la punta nueva (R-4); con la worktree de la cola sucia → `queue-dirty` y no toca nada; dos llamadas seguidas no fallan.
- [ ] `precheck`: una tarea que cambió `.pignolo/state/x.md` → `state-change` con la lista; una que no, ok; una rama que no contiene el contrato → `not-ancestor`.
- [ ] `previewMerge`: ramas con archivos distintos → `clean`; las dos agregan una línea distinta en el mismo lugar → `conflicts` con la ruta; con `gitVersion` simulado < 2.38 → `unavailable` y el resto sigue andando.
- [ ] `classifyConflict` (tabla): dos importaciones agregadas en el mismo punto → trivial; dos viñetas agregadas a una lista de un `.md` → trivial; un lado modifica una línea que el otro también → lógica (base no vacía); cada lado agrega 21 líneas → lógica; el archivo está en `contracts` → lógica; un archivo de `test-paths` protegido → lógica; binario → lógica.
- [ ] `mergeIntoQueue`: dos tareas con importaciones adyacentes + `resolveTrivial` → `merged`, el archivo trae **ambas** líneas, el commit existe. Sin `resolveTrivial` → `conflict`, la cola queda limpia y sin merge en curso (`git status` limpio, sin `MERGE_HEAD`). Un conflicto trivial y uno de lógica en la misma tarea → `conflict` y **ninguno** queda resuelto.
- [ ] Commit: `feat(cola): sincronizar, prever, mergear y clasificar conflictos`.

### Task 7: varias tareas en `gate`, `handback-gate` y `protect-paths`

**Files:**
- Modify: `plugins/pignolo/scripts/gate.js` (`--id <tarea>`), `plugins/pignolo/hooks/handlers/handback-gate.js` (resolución por `Task:`), `plugins/pignolo/hooks/handlers/protect-paths.js` (escritor fuera de su worktree), `plugins/pignolo/lib/handback-counter.js` (clave `_notask`)
- Test: `tests/handback-tasks.test.js`, casos nuevos en `tests/protect-paths-roles.test.js` y en `tests/gate.test.js`

**Interfaces:**
- Consume: Task 2 (`taskById`, `taskList`) y Task 3 (`resolveWorktree`; la ola 1 ya está unida).
- `gate.js --task [--id <tarea>]`: con v1 o una sola tarea, como hoy; con ≥ 2 tareas y sin `--id` → exit 2 `kind: "ambiguous-task"` listando los ids. Con `--id`, usa `taskById`. El sello es por árbol y nivel (no cambia).
- `handback-gate` (R-3): extrae el id de `Task: <id>` **antes** de leer sellos; con una sola tarea registrada la falta no bloquea; con ≥ 2 bloquea con `Alternativa: empezá el informe con "Task: <id>"` y cuenta bajo `_notask`; un id que no está en `run.tasks` bloquea con la lista de ids válidos; un `agent_type` que no es el rol registrado para esa tarea (`task.agents`) bloquea. El resto (sello del árbol de **esa** worktree, `scope`, integridad) es la lógica de hoy aplicada a `taskById(run, id)`. `BLOCKED` y `NEEDS_CONTEXT` siguen pasando siempre. El contador es por tarea.
- `protect-paths`: si el payload trae `agent_id` y `agent_type` ∈ {`pignolo:implementer`, `pignolo:fixer`, `pignolo:test-writer`} y `run.tasks` no está vacío, un Edit/Write/MultiEdit/NotebookEdit solo se permite si `resolveWorktree` da una worktree de `run.tasks`; si no, deny con `Alternativa: editá con la ruta absoluta dentro de tu worktree (<ruta>)` (§15 `worktree`: no en el checkout principal). Sin `run.tasks` o sin `agent_id` (hilo principal), como hoy. Si el payload no trae `agent_type`, no se aplica (falla abierto, R-3 declarado) y el `scope` de la compuerta sigue siendo la red. **Punto de elección (D-7-1, Task 13):** con B esta regla es el único control de escritura; si A gana y conserva los controles nativos, queda como red redundante (no se quita).

**Tests literales:**
- [ ] `gate.js --task` con dos tareas y sin `--id` → exit 2 `ambiguous-task`; con `--id b` sella el árbol de la worktree de `b` (el sello lleva el `tree-hash` de `b`, distinto del de `a`).
- [ ] Informe `Task: a` + `DONE` con el sello válido de `a` → pasa; el mismo informe con solo el sello de `b` → bloquea; sin la línea con dos tareas → bloquea y cuenta `_notask`; sin la línea con una → como hoy (guarda de regresión); `Task: zz` desconocido → bloquea con la lista; `BLOCKED` sin línea → pasa.
- [ ] Contadores independientes: 8 rechazos de `a` no cortan a `b`.
- [ ] `protect-paths`: un implementer con `run.tasks` {a, b} que escribe en el checkout principal → deny; dentro de la worktree de `a` → pasa (la de `b` también: límite declarado, lo ata el `scope`); el hilo principal escribe en el principal → pasa; sin `agent_type` → pasa; con `run.tasks` vacío → pasa (guarda de regresión del hito 4).
- [ ] Commit: `feat(tareas): gate, handback-gate y protect-paths con varias tareas`.

**Unión de la ola 2:** `queue.test.js`, `handback-tasks.test.js` y la suite completa **una vez**; etiquetar `contract/hito-7a/v2` (lo que las Tasks 6 y 8 consumen de la 5 y la 7).

## Ola 3 (Tasks 6 y 8 en paralelo)

### Task 6: cola, parte 2: `pre-merge` sellado con repetición, avance `--ff-only`, tag `cp/`, revert y lock

**Files:**
- Modify: `plugins/pignolo/lib/queue.js`, `plugins/pignolo/scripts/queue.js`, `plugins/pignolo/lib/project-config.js` (clave `gates.repeat`, entero 1 a 5)
- Test: `tests/queue.test.js` (casos nuevos), `tests/state-queue.test.js`, `tests/project-config.test.js` (la clave nueva)

**Interfaces:**
- Consume: Task 5, `runGate` de `lib/gate.js` (`level: 'pre-merge'`, `cwd` = worktree de la cola, sin `task`), `findSeal` de `lib/seals.js`, `installDeps` (Task 3), `backupRefs` de `lib/git-backup.js`, `lib/ledger.js` para anotar la falla del plan.
- `integrate({ main, plan, task, resolveTrivial, env, timeoutMs }) → result` con la secuencia de §11.3; **cada paso corta con su `kind`**:
  1. lock (R-8) → `syncQueue` → `precheck` → `previewMerge` → `mergeIntoQueue`; `conflict` → exit 1 con la lista, **sin** tocar `int/`; escribe `<main>/.pignolo/tmp/queue/<plan>.last.json` (`status`, `task`, `conflicts`) para `next`.
  2. `installDeps` en la worktree de la cola; `pre-merge` con `runGate` (suite completa **una vez**, G8). Repetición (R-6): `repeatCount({ config, diffFiles })` = `gates.repeat` si está, si no 2 cuando `diffFiles` toca `test-paths`, si no 1; las corridas extra repiten el comando; resultados distintos entre corridas → `status: 'FLAKY'` con los tests que difirieron (`unknown` si el comando no los lista) y exit 1 `kind: "flaky"`. Rojo → exit 1 `kind: "gate-failed"` con el sello; la tarea vuelve (falla del plan).
  3. Solo con sello `PASS` **del `tree-hash` actual** de `queue/<plan>` (se recalcula y se compara con `findSeal`; si difiere, `kind: "seal-mismatch"`): avanzar `int/<plan>` a la punta de la cola por compare-and-swap sobre el sha de `syncQueue`. Si `int/` está en uso en una worktree, `git merge --ff-only queue/<plan>` allí (con `status --porcelain` limpio); si no, `git update-ref refs/heads/int/<plan> <nuevo> <viejo>`. CAS fallido → `kind: "int-moved"` (R-4).
  4. `backupRefs` antes de avanzar; tag `cp/<plan>/<n>` con `nextCp` en la nueva punta.
  - Salida: `{ ok, status, plan, task, merged: sha, cp: tag, trivial: [...], repeat: { runs, same }, missingTrailers: [sha], diffLines, overBudget }` (R-10).
- `revertOnInt({ main, plan, commit })`: "regresión tardía en `int/`: revert primero" (§11.3): `git revert --no-edit` (con `-m 1` si es un merge) en la worktree de la cola sincronizada y **el mismo pipeline** (compuerta, avance, tag). Un commit que no está en `int/<plan>` → `kind: "not-on-int"`.
- Lock: `acquireQueueLock({ main, plan, now }) → { release }` (creación exclusiva con `{ pid, heartbeat }`); vivo → exit 2 `kind: "busy"`; `pid` muerto o latido > 10 min → se toma.
- CLI: `node queue.js run --plan P --task <rama|nn> [--resolve-trivial] | revert --plan P --commit <sha> | status --plan P` (`status` es de solo lectura: lock, `queue/<plan>` contra `int/<plan>`, últimas tags `cp/`).

**Tests literales (repos reales; `gates.pre-merge` = un script `node` de fixture que lee un archivo para decidir su salida y anota cada ejecución en un log):**
- [ ] Camino feliz: dos tareas con archivos distintos pasan una tras otra → `int/p` avanza dos veces, `cp/p/1` y `cp/p/2` están en las puntas correctas, `queue/p` = `int/p` y la historia de `int/p` es lineal (`--ff-only`).
- [ ] Compuerta roja: `int/p` **no se mueve** (mismo sha antes y después), no hay tag, exit 1 `gate-failed`; la cola queda utilizable (una tarea buena después pasa).
- [ ] Sello de otro árbol: si entre la compuerta y el avance cambia un archivo de la worktree de la cola → no avanza (`seal-mismatch`).
- [ ] Repetición: diff que toca un archivo de `test-paths` y un fixture que alterna verde/rojo entre corridas → `FLAKY`, `int/` quieto; sin tests en el diff → una sola ejecución (se cuenta en el log); `gates.repeat: 3` → tres.
- [ ] `int-moved`: un commit hecho sobre `int/p` **durante** la compuerta (lo hace el fixture) → no avanza, `kind: "int-moved"`; reintentar la entrada pasa.
- [ ] Lock: dos `integrate` a la vez sobre el mismo plan (el segundo mientras el fixture duerme) → el segundo exit 2 `busy`; un lock con `pid` muerto → se toma.
- [ ] `revertOnInt`: tras integrar una tarea que rompe, el revert pasa por la compuerta y deja un commit nuevo en `int/` (no reescribe historia: el sha anterior sigue siendo ancestro); un commit ajeno → `not-on-int`.
- [ ] `state-queue` (§15): integrar A; commitear `.pignolo/state/plans/p/plan.json` en `int/p` (como hace el hilo principal entre merges); integrar B → `--ff-only` anda, el commit de estado sigue en la historia, `cp/p/2` apunta a la punta. Mismo caso con `int/p` **en uso** en el checkout principal (el merge se hace allí). Caso inverso: una **tarea** que toca `.pignolo/state/` → rechazada (`state-change`) y `int/` quieto. Un estado commiteado durante la compuerta → `int-moved`, reintento ok.
- [ ] `missingTrailers` lista el commit de una tarea sin `Agent:`; `overBudget` con un diff de 401 líneas; ninguno bloquea (exit 0).
- [ ] Commit: `feat(cola): pre-merge sellado con repetición, avance ff-only y tag cp`.

### Task 8: reglas `pignolo-queue` y `pignolo-worktree-tools` de la guardia y humo por el launcher

**Files:**
- Modify: `plugins/pignolo/lib/git-guard.js` (dos entradas nuevas en la tabla de reglas y su detección, modelo `pignolo-holdout`), `plugins/pignolo/hooks/handlers/guard.js` (solo si hace falta pasar `agent_type`), `tests/permissions.test.js` (la tabla de reglas que dependen del payload)
- Create: `tests/guard-queue.test.js`, `tests/e2e-hito-7.test.js` (con el caso por el launcher; la Task 11 lo completa)

**Interfaces:**
- Regla `pignolo-queue` (`deny`): ejecutar `scripts/queue.js` lo puede hacer **solo el hilo principal y `pignolo:integrator`**; cualquier otro subagente → deny con `Alternativa: la cola la opera el integrator; pedile la integración al hilo principal`. Regla `pignolo-worktree-tools` (`deny`): `worktree.js create|tag-contract` y `cleanup.js apply` solo el hilo principal. Los subcomandos de lectura (`worktree.js list`, `queue.js status`, `cleanup.js report`, `waves.js`) los puede correr cualquiera.
- Detección **estructural** (argv de `node` cuyo primer operando termina en esas rutas, con y sin `cd … &&`), como `pignolo-holdout`; **no** un grep del texto: un `grep queue.js` o un `cat` no disparan.
- Límite declarado: lo que hace el script por dentro no lo ve la guardia (§1.9), y la regla depende del `agent_type` del payload.

**Tests literales:**
- [ ] Deny: implementer, fixer, test-writer, review-risk y validator ejecutando `node <P>/scripts/queue.js run --plan p --task 01` (con y sin `cd "<wt>" &&`, en Bash y en PowerShell). Pasa: hilo principal (sin `agent_id`) y `pignolo:integrator`.
- [ ] `worktree.js create` desde un `pignolo:implementer` → deny; `worktree.js list` → pasa; `cleanup.js apply` desde cualquier subagente → deny; `cleanup.js report` → pasa.
- [ ] Corpus `must-allow` de la guardia: ningún deny nuevo (`tests/guard-corpus.test.js` verde sin cambios), más `grep -n queue.js docs/x.md`, `cat scripts/queue.js` y `git log --oneline queue/p` → pasan (umbral de falsos positivos, guarda de regresión).
- [ ] Humo por el launcher real: un `implementer` con `agent_id` ejecutando `queue.js` sale con exit 2 y `Alternativa:`.
- [ ] Commit: `feat(guardia): reglas pignolo-queue y pignolo-worktree-tools`.

## Ola 4 (Tasks 9 y 10 en paralelo)

### Task 9: limpieza de ramas y worktrees (`lib/branch-cleanup.js`, `scripts/cleanup.js`, aviso en `SessionStart`) — RIESGOSA (auditar antes, D-7-6)

**Files:**
- Create: `plugins/pignolo/lib/branch-cleanup.js`, `plugins/pignolo/scripts/cleanup.js`
- Modify: `plugins/pignolo/hooks/handlers/session-start.js` (un aviso corto, callado si no hay nada)
- Test: `tests/branch-cleanup.test.js`, `tests/session-start-branches.test.js` (no confundir con `tests/cleanup.test.js`, que protege los temporales de los tests)

**Interfaces:**
- Consume: Task 1 (`parseBranch`), Task 3 (`listTaskWorktrees`), `lib/git-backup.js`, `lib/disabled.js`.
- `findCandidates({ main, now, days = 7 }) → { merged: [{ name, kind, target, sha, lastCommit, worktree? }], unmerged: [{ name, kind, lastCommit, ageDays }], dirtyWorktrees: [path] }` (D-7-5, R-11): solo lectura; considera ramas `task/*`, `int/*` y `queue/*` (nunca `contract/*`, `cp/*`, `backup/*`, la rama actual ni la de origen del plan) y las worktrees sucias de `.pignolo/worktrees/`. `targetOf(name, { main })`: `task/<p>/…` y `queue/<p>` → `int/<p>`; `int/<p>` → la rama de origen del plan (registro del plan del hito 5); sin destino conocido la rama no es candidata. `merged` = las que figuran en `git branch --merged <destino>` con **el destino como ref explícito** (nunca contra HEAD) y con la worktree limpia; `unmerged` = no unidas con más de `days` días sin actividad (la mayor entre el último commit y el último cambio de la worktree): **solo se informan, nunca se proponen**; una worktree sucia va a `dirtyWorktrees` y no a `merged`.
- `report(...)` = `findCandidates` + `{ proposal: { id, items }, text }`: la propuesta es **la lista de `merged`**, mostrada con una línea por ítem (qué se quitaría y de qué destino está unida); `proposal.id` = sha1 de las líneas `<rama> <sha> <destino>` ordenadas. `apply({ main, proposalId, env }) → { removed: [{ branch, worktree? }], refused: [{ branch, why }] }`: recalcula la propuesta y, si el id no coincide, `refused: 'stale-proposal'` sin tocar nada; si coincide, `backupRefs` **una vez** antes de la primera y, por rama: `status --porcelain` limpio (si no, `refused: dirty`) → `worktree remove <ruta>` sin `--force` → `branch -d`; si git rechaza el `-d`, `refused` con **el motivo que dio git** y se sigue con las demás: nunca `-D`, nunca otro flag, nunca reintento que escale.
- CLI `node cleanup.js report [--days n] | apply --proposal <id>` (`apply` sin `--proposal` → exit 2). El humano aprueba la lista mostrada con **un solo sí**.
- `SessionStart`: una línea `N ramas ya unidas para limpiar, M sin unir de más de 7 días (solo informadas) y K worktrees con cambios; /pignolo:cleanup las lista` solo si N + M + K > 0; dentro del plazo del hook (`for-each-ref` y `worktree list --porcelain`; `status` solo de las worktrees de `.pignolo/worktrees/`); sin proyecto activo o con `/pignolo:off`, nada.

**Tests literales (repos reales, fechas con `GIT_COMMITTER_DATE`):**
- [ ] `findCandidates`: una `task/p/01-a` ya unida a `int/p` (de cualquier edad) → en `merged` con `target: int/p`; una `task/p/02-b` **sin unir** de hace 8 días → en `unmerged` y **no** en `merged`; sin unir de hace 6 → en ninguna; una `contract/p/v1` vieja → nunca; la rama actual → nunca; una unida con la worktree sucia → en `dirtyWorktrees`. **Destino explícito:** una rama unida a `int/p` pero no a `main`, con HEAD parado en `main` → aparece en `merged` (rojo: `git branch --merged` sin argumento).
- [ ] `apply --proposal <id>` con una rama unida y limpia → la worktree y la rama desaparecen y existe un juego `refs/pignolo/backup/*` con el sha de la rama; un id viejo (se creó otra rama unida después del reporte) → `stale-proposal` y no se tocó nada; una rama cuyo `-d` git rechaza (se simula con un `git` envoltorio que sale 1 con un motivo) → `refused` con ese motivo, **ningún** segundo intento con otro flag, y las demás se procesan; una con la worktree que se ensució después del reporte → `refused: dirty`; `apply` sin `--proposal` → exit 2.
- [ ] Ningún comando de git que lance `apply` lleva `--force` ni `-D` (un `git` envoltorio en el `PATH` del test registra el argv).
- [ ] `SessionStart`: con una rama ya unida el contexto trae la línea; con todo reciente y sin ramas unidas, silencio; con `/pignolo:off` (flag de proyecto) también silencio.
- [ ] Commit: `feat(limpieza): ramas ya unidas propuestas, no unidas informadas, con un solo sí`.

### Task 10: `next` con la cola y las olas (`lib/next.js`)

**Files:**
- Modify: `plugins/pignolo/lib/next.js` (hito 5a, Task 8)
- Test: `tests/next-queue.test.js`

**Interfaces:**
- Nuevos `kind` en el orden de prioridad de `next` (después de `task-blocked`, antes de `flow-expired-task`): `queue-conflict`, `queue-busy-dead`, `wave-partial`. Solo lectura (nada que mute; el lock y las ramas se leen con `rev-parse`/`for-each-ref`).
  - `queue-conflict`: la worktree de la cola tiene `MERGE_HEAD` (un merge cortado) o `queue/<plan>.last.json` (Task 6) dice `conflict`: "La cola de <plan> quedó con un conflicto de lógica en <tarea> (<archivos>); la próxima acción registrada es devolver la tarea a su rama para rebasarla y registrarlo como falla del plan."
  - `queue-busy-dead`: lock con `pid` muerto: "El lock de la cola de <plan> es de un proceso que ya no existe; la próxima acción registrada es correr `queue.js status` y retomar la entrada."
  - `wave-partial`: `run.tasks` con ≥ 2 tareas y alguna sin aceptar en su contador mientras otras sí: "La ola tiene <n> tareas; <ids> aceptadas y <ids> pendientes; la próxima acción registrada es esperar o revisar `run.js status`."
- `SessionStart` ya muestra `next` (R-10 del hito 5): sin cambios, solo los kinds nuevos.

**Tests literales (§15 `next`: "ola cortada, `queue/` con conflicto"):**
- [ ] Un merge cortado en la worktree de la cola → `queue-conflict` con los archivos; con `last.json` en `conflict` → mismo kind; con `last.json` en `merged` → no.
- [ ] Lock con `pid` inexistente → `queue-busy-dead`; con el `pid` del propio proceso de test → no.
- [ ] Dos tareas en `run.tasks`, una aceptada → `wave-partial`; las dos aceptadas → no; una sola tarea → no (guarda de regresión).
- [ ] Prioridad: `sabotage-pending` sigue primero; un `task-blocked` gana a `queue-conflict`. **Solo lectura:** árbol y refs idénticos antes y después de llamar a `deriveNext`.
- [ ] Commit: `feat(next): conflicto de cola, lock muerto y ola cortada`.

## Ola 5: cierre de 7a

### Task 11: pruebas de punta a punta de §15 (`queue`, `worktree`, `state-queue`) y cierre de 7a

**Files:**
- Modify: `tests/e2e-hito-7.test.js`, `CHANGELOG.md`, `plugins/pignolo/.claude-plugin/plugin.json` (versión), `docs/STATE.md`, `docs/gaps.md` (G8 y G16 a "en plan" o "hecho" según lo medido)

**Casos (repos reales y el launcher real, sin agentes):**
- [ ] **Plan de 6 tareas.** Un plan sintético en tarjetas (contrato + 4 `judgment` independientes con `Parallel: yes` + una `serial-paths`): `waves.js` → ola 0 serial, tag de contrato, ola paralela de 2 (perfil `balanced`) con **dos worktrees reales** creadas por `worktree.js create` y `run.js task` para las dos; el "implementer" es un script que edita y corre `gate.js --task --id` dentro de su worktree; los dos sellos son de árboles distintos (§15 `worktree`: el sello corresponde a ese árbol). Cada rama entra por `queue.js run`; `int/p` termina con todas, historia lineal, `cp/p/1..N`.
- [ ] **Edición fuera de la worktree.** Por el launcher real un `pignolo:implementer` con `run.tasks` {a, b} que escribe en el checkout principal → exit 2 con `Alternativa:` (§15 `worktree`).
- [ ] **Conflicto trivial y de lógica** en una misma corrida de cola: el trivial pasa con `--resolve-trivial`, el de lógica vuelve con `status: 'conflict'` y `next` lo describe (`queue-conflict`).
- [ ] **Estado entre merges** con el launcher y el plan completo (`state-queue`).
- [ ] **Medición (G8 y lo no verificado):** correr `queue.js run` con la máquina tranquila y anotar la duración de una entrada con una compuerta de fixture de 3 s; **no** correr dos suites a la vez. Medir `deps-install` de dos worktrees creadas seguidas y anotar si algo se pisa.
- [ ] Suite completa **una vez** con `npm test`; versión (`0.10.0`) y entrada de CHANGELOG en español; `docs/STATE.md` con el estado. Commit: `chore(hito-7a): versión, changelog y estado`.
- **Revisión final opus de `main..core/hito-7a`** (Review Focus 1 a 3, 5 y 6 primero) y una pasada de arreglos; tag `core/hito-7a/done`. Unir a `main` es del autor.

---

# Parte 7b: skills, carta del integrator, A/B de worktrees y evals

**Orden de ejecución de 7b:** la Task 13 (A/B medido, D-7-1) va **primero**: decide el mecanismo principal que consumen las Tasks 12 y 14.

### Task 12: skills `execute-plan` y `cleanup`, edición de `plan`, cartas (opus para las skills, sonnet para las cartas)

**Files:**
- Create: `plugins/pignolo/skills/execute-plan/SKILL.md`, `plugins/pignolo/skills/cleanup/SKILL.md`
- Modify: `plugins/pignolo/skills/plan/SKILL.md` (el paso de ejecución: reemplaza R-11 del hito 5 por "invocar `execute-plan`"), `plugins/pignolo/agents/integrator.md`, `plugins/pignolo/agents/implementer.md` (primera línea del informe `Task: <id>`, R-3), `plugins/pignolo/templates/task-card.md` (campos `Kind`, `Depends`, `Branch` y la línea `Report starts with: Task: <id>`)
- Test: `tests/skill-execute-plan.test.js`, `tests/skill-cleanup.test.js` (formas, como `tests/skill-lanes.test.js`); `tests/agents-tools.test.js` y `tests/agents-output.test.js` siguen verdes

**Interfaces (texto exacto que importa):**
- `execute-plan` (la invoca `plan`; `daily` no cambia): 1) `waves.js` con el plan y el perfil (**serial por defecto; paralelo solo para lo que el plan pide con `Parallel: yes`**), mostrar `cost` y las razones; si el perfil no es `max`, confirmar con el humano (categoría `cost`); 2) por ola: `worktree.js create` por tarea (**PUNTO DE ELECCIÓN D-7-1:** si la Task 13 elige A, el despacho usa `isolation: worktree` y el hook `WorktreeCreate` llama a la misma `createTaskWorktree`; el resto del paso no cambia), `run.js task --id … --worktree … --base … --branch …` (hasta el tope), despacho con la task-card que trae `Task: <id>`, `run.js status` tras cada escritor, `gate`, `risk`, sabotaje y revisión como en `daily` pero **por tarea**, `run.js task-end`; 3) por tarea terminada, `integrator` con la task-card de cola (rama, orden, `--resolve-trivial` solo si el plan lo permite) y lectura del JSON de `queue.js`: `conflict` o `flaky` → devolver la tarea y registrar la falla del plan; `int-moved` → reintentar una vez; 4) tras la ola de contrato, `worktree.js tag-contract`; 5) al final, `int/<plan>` a la rama de origen con pregunta `irreversible` (sin push, nunca) y `scope-gate`; 6) `cleanup` se ofrece, no se ejecuta.
- `cleanup` (`disable-model-invocation: true`): `report`; muestra la lista propuesta (las ramas **ya unidas a su destino**) y, aparte, las no unidas que solo se informan; **pregunta una vez** si se aplica la lista mostrada (categoría `irreversible`: borrado de ramas); con el sí, `apply --proposal <id>` con el id del reporte; un `refused` se muestra con su motivo; nunca `-D`, nunca `--force`, nunca `push`.
- `integrator.md`: reemplaza "the script arrives in milestone 7" por el uso real (`queue.js run|revert|status`, exit codes y `kind`); pasa `--resolve-trivial` solo si la tarjeta lo dice; `conflict` → `NEEDS_CONTEXT` con los archivos; `gate-failed`/`flaky` → `BLOCKED` con el `kind`; sigue sin otro comando.

**Tests literales:**
- [ ] Cada skill existe con su frontmatter (`name`, `description`), `cleanup` con `disable-model-invocation: true`; los scripts y subcomandos citados existen en `scripts/`; ninguna contiene `git push`, `--force`, ` -D`, `stash` ni `--no-verify`.
- [ ] `integrator.md` sigue con `tools: Read, Bash` y sin `Agent`; la carta nombra `queue.js` y sus tres verbos.
- [ ] `task-card.md` trae los campos nuevos; `plan-check` sobre este plan sigue sin falsas alarmas.
- [ ] Commit: `feat(skills): execute-plan, cleanup y cartas del integrator e implementer`.

### Task 13: A/B medido del mecanismo de worktrees y checklist de payloads (`tests/manual/hito-7.md`)

**Va primero en 7b:** decide el mecanismo principal que consumen las Tasks 12 y 14 (D-7-1).

**Files:**
- Create: `tests/manual/hito-7.md` (lo corre el autor en una sesión interactiva; **no** se ejecuta `claude -p`), `tests/manual/worktree-ab/worktree-create-probe.js` (hook de prueba descartable, **fuera** del plugin: registra el payload completo y crea la worktree llamando a `createTaskWorktree`)
- Modify: `plugins/pignolo/lib/worktrees.js` (el valor de `MECHANISM`, el **punto de elección**); **solo si A gana:** `plugins/pignolo/hooks/hooks.json` (`WorktreeCreate`), `plugins/pignolo/hooks/handlers/worktree-create.js`, `tests/worktree-create.test.js`

**Interfaces:**
- Una sola interfaz para ambos mecanismos: `createTaskWorktree({ main, plan, nn, slug, from, ... }) → { worktree, branch, base }` (Task 3). **A** = `isolation: worktree` con un `WorktreeCreate` de pignolo que lee del payload `worktree_name` y `base_branch` (<https://code.claude.com/docs/en/hooks>), llama a `createTaskWorktree` y devuelve la ruta. **B** = `worktree.js create` a mano y el implementer trabaja con `cd <ruta> &&` y rutas absolutas.
- Mismo repo descartable para ambos: `int/p` un commit por delante de `contract/p/v1`, un subagente `pignolo:implementer` con una tarea mínima (crear un archivo y correr `gate`).

**Mediciones (casillas con el resultado a completar; ninguno se inventa):**
- [ ] **M1 base:** `git rev-parse HEAD` dentro de la worktree = sha de `contract/p/v1` (no el de `int/p`), en A y en B.
- [ ] **M2 payload (solo A):** copiar el payload completo de `WorktreeCreate`; `worktree_name` identifica la tarea sin ambigüedad (permite derivar `nn` y `slug`) y `base_branch` llega.
- [ ] **M3 cwd (solo A):** el subagente trabaja en la ruta que devolvió el hook (su `pwd` y las rutas de sus Edit coinciden).
- [ ] **M4 controles de aislamiento (A, con el hook reemplazando la creación nativa):** el subagente intenta (i) Edit/Write sobre un archivo del checkout principal, (ii) un `Bash` con `cwd` fuera de su worktree y (iii) `git -C <principal>` y `GIT_DIR=<principal>/.git`: anotar por cada uno si se bloquea. En B, anotar lo que bloquean la regla de la Task 7 y la guardia.
- [ ] **M5 cierre:** qué pasa con la worktree al terminar el subagente (se conserva con cambios, la borra el cliente, quién la quita) y si el `deps-install` corrió dentro de ella.
- [ ] **Decisión (regla de R-1):** **A es el principal si M1, M2 y M3 pasan y M4 bloquea los tres (i, ii, iii); si no, B.** Anotar el resultado, fijar `MECHANISM` y reescribir R-1 con lo medido. Si A gana: handler `worktree-create` (en proceso, `require(handler).run(input, ctx)`) con un payload sintético `{ worktree_name: '03-cola', base_branch: 'contract/p/v1' }` → llama a `createTaskWorktree` con `from` = el tag y devuelve su ruta (rojo: ignorar `base_branch`); payload sin `worktree_name` → falla con `Alternativa:` (no inventa un nombre); un humo por el launcher real; `/pignolo:off` lo apaga.
- [ ] Ajustar §11.2 del spec según el resultado: si A gana, queda como está ("Mecanismo A (principal)") con la medición como evidencia; si gana B, pasa a "Mecanismo B (principal)".

**Resto del checklist:**
- [ ] **R-3:** en un despacho real de un implementer, registrar si `PreToolUse` de Edit trae `agent_type` y si `SubagentStop` trae `last_assistant_message` con la línea `Task: <id>` íntegra; con dos implementers en paralelo, si los `agent_id` difieren y si hay un campo con el prompt o la descripción.
- [ ] **R-5 en el git del autor:** `git --version` de Windows y de WSL2 y el resultado del experimento de `merge-tree` (Task 5) en ambos.
- [ ] **Una ola real de 2 tareas** con `execute-plan` sobre un plan pequeño sintético (con `Parallel: yes`): tiempos, tokens y `queue.js` de punta a punta; copiar el `cost` previsto contra el gastado (alimenta `COST_HINT`).
- [ ] Commit: `docs(manual): A/B del mecanismo de worktrees y checklist del hito 7`.

### Task 14: evals `agents` del `integrator` y del `worktree` (opus escribe los casos; costo del autor, D-7-4)

**Files:**
- Create: `tests/evals/integration-cases.js`, `tests/eval-integration-cases.test.js` (graders contra traces sintéticos, costo 0), `tests/evals/RESULTS-hito-7.md` (al correr)

**Interfaces:**
- Casos (`--model` fija el modelo del agente; reglas de graders de los hitos 3 y 4: estrictos donde una máquina parsea, tolerantes con la redacción):
  - `integrator-trivial` (WSL2): cola con dos tareas con importaciones adyacentes; el `integrator` recibe la task-card con `--resolve-trivial`. Graders: corrió `queue.js run` y ningún otro comando de shell (ni `git`), el informe cita el comando y su salida, resolvió el trivial **vía el script** (no tiene `Edit`), cierra `DONE`, y `int/<plan>` avanzó (se mira el repo temporal).
  - `integrator-logic` (WSL2): conflicto de lógica; graders: **no** resuelve ni edita, cierra `NEEDS_CONTEXT` nombrando los archivos, `int/<plan>` quieto.
  - `implementer-worktree` (WSL2; **PUNTO DE ELECCIÓN D-7-1:** si la Task 13 elige A, el caso usa `isolation: worktree` con el hook y los graders no cambian): un implementer con dos worktrees registradas y la task-card de la `a`; graders: editó solo dentro de la worktree de `a` (rutas absolutas), cada `Bash` empezó con `cd "<wt>" &&`, el sello del `gate` es del árbol de `a`, abre el informe con `Task: a`, cierra `DONE`, el checkout principal quedó intacto.
- El test determinista corre cada grader contra traces sintéticos buenos y malos (un `integrator` que corre `git merge` falla el grader; un implementer que edita el principal falla).

**Tests literales:** [ ] cada grader tiene un trace bueno que pasa y uno malo que falla (rojo = romper el grader); [ ] los casos no contienen datos del proyecto del autor.

### Task 15: cierre de 7b y evals por etapas

**Files:**
- Modify: `CHANGELOG.md`, `plugin.json` (`0.11.0`), `docs/STATE.md`, `docs/gaps.md`, `tests/evals/RESULTS-hito-7.md`, `tests/manual/hito-7.md` (con lo que el autor complete)

- [ ] Etapas con tope por corrida y `--json --keep-temp --no-publish` (como el hito 4b), **D-7-4 aprobada, tope 5 USD**: sonda (1 corrida de `integrator-trivial`) → calibración (1 por caso) → 5 corridas por caso (umbral 4/5, §0d). Copiar toda traza fallada a una carpeta persistente al terminar (G13, G17).
- [ ] Suite completa **una vez**. **Revisión final opus de `main..core/hito-7b`**, una pasada de arreglos, confirmación acotada; luego se clasifica (tope del hito 1).
- [ ] Commit: `chore(hito-7b): versión, changelog, estado y resultados de evals`.

---

## Estimación de costo de las evals

*Base medida:* WSL2, agentes con shell, hito 4b: 35 corridas = 5,28 USD, **≈ 0,15 USD por corrida** (`tests/evals/RESULTS-hito-4.md`); el `integrator` es sonnet con effort low, no se espera más. *Hipótesis, sin medir en estos casos.*

| Etapa | Corridas | Cálculo | Estimado | Tope |
|---|---|---|---|---|
| Sonda (`integrator-trivial`) | 1 | 1 × 0,15 | 0,15 | 0,4 |
| Calibración | 3 | 3 × 0,15 | 0,45 | 0,9 |
| Completa | 15 | 3 casos × 5 × 0,15 | 2,25 | 3,3 |
| **Total** | 19 | | **≈ 2,9 USD** (rango × 0,6 a × 1,5: 1,7 a 4,4) | **4,6** |

El tope de 5 USD de D-7-4 deja ≈ 0,4 para las corridas en vuelo al cortar. Costo de tokens de agentes de **7a: 0** (ninguna tarea despacha agentes). La ejecución de este plan (implementadores sonnet y las dos revisiones opus) se estima como la del hito 5, ≈ 0,3 a 0,5 millones de tokens por parte.

## Decisiones del autor (decididas el 2026-09-30, salvo D-7-3)

**D-7-1. Mecanismo de worktrees: DECIDIDA el 2026-09-30 (cambio de contrato posible de §11.2): se mide A contra B antes de elegir.** Debate de dos agentes opus. R-1 corrige la evidencia (`worktree.baseRef` acepta solo `"fresh"` o `"head"`: <https://code.claude.com/docs/en/worktrees>; los worktrees nativos traen controles de aislamiento; el hook `WorktreeCreate` trae `worktree_name`/`base_branch`: <https://code.claude.com/docs/en/hooks>). La Task 13 es un A/B medido (A con el hook `WorktreeCreate` contra B): si A arranca de la base correcta y conserva esos controles, A es el principal; si no, B. Las tareas que dependen del mecanismo comparten una sola interfaz (`createTaskWorktree`) con el punto de elección marcado (Tasks 3, 7, 12, 13 y 14).

**D-7-2. `run.json` y modo de ejecución: DECIDIDA el 2026-09-30 (cambio de contrato de §6, aditivo).** `run.json` se escribe **siempre en v2** (una o varias tareas) y se sigue leyendo v1 (R-2, Task 2). Modo **en serie por defecto** (G16: el paralelo cuesta ≈ 5× los tokens); paralelo solo cuando el plan lo pide (`Parallel: yes`) y dentro del tope del perfil (R-7, Task 4).

**D-7-3. Política de la repetición de `pre-merge` (§9.4; costo, reservada): ABIERTA, pendiente de un experimento aislado en curso (2026-09-30); no se cambia todavía.** El spec no da el número. Mientras tanto el plan conserva R-6 tal como está: `gates.repeat` configurable; por defecto 2 corridas si el diff toca tests y 1 si no (cada corrida extra cuesta tiempo de la suite, no tokens). Alternativas: siempre 1 (la repetición queda declarada y sin efecto) o siempre 3 (detecta más, triplica el costo de cada merge y contradice G8). Se resuelve con el resultado del experimento.

**D-7-4. Evals de 7b: DECIDIDA el 2026-09-30 (reservada, §4.1.3): aprobadas, tope 5 USD** (estimado ≈ 2,9; por etapas como el hito 4b: sonda, calibración, completa, en WSL2).

**D-7-5. Borrado de ramas y worktrees por `cleanup apply`: DECIDIDA el 2026-09-30 (reservada: borra).** `cleanup` propone enseguida las ramas **ya unidas** a su destino (verificado con `git branch --merged <destino>` explícito, no contra HEAD); las no unidas de más de 7 días solo se informan; el humano aprueba la lista mostrada con **un solo sí**; respaldo de refs antes; nunca `--force`, nunca `-D`, nunca `push`; un `-d` rechazado se informa con su motivo y nunca escala (R-11, Task 9, skill de la Task 12).

**D-7-6. Auditoría previa: DECIDIDA el 2026-09-30 (costo): aprobada, en dos pasos, de las Tasks 5, 6, 8 y 9** (una auditoría opus con la receta medida, ≈ 1,5 a 2,5 USD, antes de ejecutarlas; la Task 7 la necesita solo si el checklist de R-3 sale distinto, y el resto se cubre con la revisión final). Esas tareas tocan el avance de `int/`, el borrado de ramas y worktrees y la guardia.

**Registradas como técnicas (sin pedir):** R-2 a R-11 (salvo lo que D-7-1, D-7-2 y D-7-5 anotan; D-7-3 sigue abierta), el modo por tipo de plan (G16, R-7), que `merge-tree` es solo previsión y no sube el mínimo de git (R-5) y la versión de 7a y 7b (a ajustar a lo publicado). **El plan no empuja nada ni borra ramas; unir `core/hito-7a` y `core/hito-7b` a `main` y publicar son del autor.**

## Auditoría de esta versión y dónde quedó cada hallazgo

Sin auditar todavía (D-7-6 aprobada el 2026-09-30: las Tasks 5, 6, 8 y 9 no se ejecutan antes de su auditoría en dos pasos). Esta sección se llena cuando exista: hallazgo, resultado y la tarea donde quedó.
