# Hito 3 del núcleo, parte 3a: núcleo determinista (riesgo, compuerta y sellos, handback-gate, marca de flujo, ledger). Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo tenga, en scripts y hooks sin dependencias, todo lo que el hito 3 necesita para decidir sin creerle a un agente: el piso de riesgo (`scripts/risk`), la compuerta con sello fuera de todo hook (`scripts/gate`), el `handback-gate` que acepta `DONE` solo con sello e integridad, el ciclo de vida de `.pignolo/run.json` y la lógica del ledger de revisión (refuters, Judgment Day, rondas). Las skills de carriles y de revisión (texto) quedan para la parte 3b, que las monta encima de esto.

**Arquitectura:** tres módulos de contrato en la ola 0 (`lib/yaml-lite.js` + `lib/globs.js` + `lib/project-config.js` para leer `.pignolo/project.md`; `lib/changes.js` + `lib/seals.js` para árbol, diff y sellos; `lib/project.js` con la raíz principal y el registro del flujo). Encima, en paralelo: `lib/risk.js` + `scripts/risk.js`, `lib/gate.js` + `scripts/gate.js`, el handler `handback-gate`, `scripts/run.js`, `lib/ledger.js` + `scripts/ledger.js` y el guardado de los conflictos de reglas de `setup`. Los handlers siguen el contrato del launcher: `run(input, ctx) → { exit, stdout?, stderr? }`, plazo interno de 3 s.

**Stack:** Node ≥ 20 sin dependencias npm, `node:test`, git ≥ 2.31, hooks de Claude Code.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md`: §1 (principios 1–3 y 5), §3.2 (`project.md`), §4.1–§4.4 (reservadas, detección, autónomas, categorías), §4.6 (dos capas en todo texto al humano), §5.1–§5.2 (carriles), §6 y §6.1 (marca `run.json`; `test-writer` sin Bash), §7 (parámetros por perfil), §8.2 (capa 2: compuerta y sellos), §8.3 (handback-gate), §9 (tests), §11.1 (nombres de rama), §11.5, §12 (revisión y ledger), §13, §15 (`risk`, `gates`, `agents`), §16 y §18, hito 3.

## Alcance: por qué el hito 3 se parte en dos

El hito 3 de §18 junta dos cosas de naturaleza distinta: código determinista (capa 2 y capa 3) y skills de texto con evals de agentes que cuestan dinero. En un solo plan serían ~16 tareas, dos tipos de revisión y una corrida de evals que necesita el OK de costo del autor en el medio. Se parte en:

- **3a (este plan):** todo lo determinista. Termina con los tests `risk` y `gates` de §15 en verde, sin evals y sin costo de tokens de agentes.
- **3b (en este mismo archivo, después de la parte 3a):** carriles `trivial`/`daily`, skill de revisión, Judgment Day como flujo, lazo del `fixer` y las evals `agents` (lentes, refuter, jueces, fixer).

Motivo del orden: §1.2 ("lo que se ejecuta manda") y el pedido de preferir la capa 2 antes que el texto. Las skills de 3b consumen interfaces fijas de 3a (JSON de `risk`, `gate`, `run`, `ledger`), así que 3b no puede empezar antes.

## Global Constraints

- Node ≥ 20, **sin dependencias npm**. Tests con `node:test`; la suite completa corre con `npm test` (o `npm run test:quiet`), nunca con `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits, escritos con `git commit -F <archivo>`.
- Archivos en LF y sin BOM. Nunca se pasa texto por comillas de la shell (regla 6 de `rules/core.md`).
- Hooks: forma exec con `node` y el launcher; `timeout` del host entre 30 y 60 s (lo valida `tests/hooks-json.test.js`); plazo interno 3 s, que al vencer niega. **Callados en el éxito**: sin `additionalContext` ni `systemMessage` si todo sale bien (§6.1, §8.3). Cada bloqueo nombra una alternativa que funciona.
- `/pignolo:off` apaga los hooks nuevos de este plan (`handback-gate`); `PIGNOLO_DISABLED=1` también. Nada de este plan toca la guardia, los respaldos ni el conjunto catastrófico.
- `project.md` (§3.2): `type` ∈ `code-tested | code-untested | docs | script`; `gates` con `on-edit`, `on-done`, `pre-merge` y opcional `live-check`; `test-paths` sin declarar = `*test*`, `*spec*`, `__snapshots__/`, `__mocks__/`, `fixtures/`, `test/`, `tests/` **con aviso**. Sin `project.md`: modo conservador (riesgo medio, sin paralelismo, sin `live-check`) y aviso para correr `/pignolo:init`.
- Tripwires de ruta (§4.2): manifiestos y lockfiles, IaC y CI, `.env*`, migraciones, borrados, `contracts`, `high-risk-paths`, `cost-paths`, `visible-paths`. De contenido en el diff: identificadores de modelos de IA, SDKs y endpoints de proveedores pagos, `setInterval`/cron/polling, reintentos y concurrencia, niveles de log, `pii-patterns`. **Un tripwire marca la decisión como reservada; el modelo solo puede sumar. Sin `visible-paths`, todo cambio de UI en `daily` sube a `plan`. Ante la duda, reservada.**
- Categorías de pregunta, lista cerrada (§4.4): las 8 reservadas (`identity`, `scope`, `costs`, `dependencies`, `irreversible`, `security`, `contract`, `rule-conflict`) + `scope-card`, `test-authorization`, `needs-review-batch`, `judge-conflict`, `live-check-input`, `quota`. Los nombres en inglés de las 8 reservadas los fija este plan (ruling abajo); `rule-conflict` es a la vez la 8.ª reservada y la categoría de §4.4.
- Sello (§8.2): `{sha, tree-hash, comando, exit, hash del log, hora}` en `~/.pignolo/seals/<repo-id>/`, `repo-id` = hash de la ruta de `git-common-dir` (`shadow.repoIdForGitDir`, ya existe). Integridad de tests contra un commit de referencia; **si falta la referencia, falla cerrado**.
- handback-gate (§8.3): `SubagentStop` con matcher `^pignolo:(implementer|fixer|test-writer)$` y `PreToolUse` sobre `SubagentHandback`. Acepta `DONE` solo con un sello exit 0 para el `tree-hash` del **worktree de la tarea** y la integridad en verde. **El hook nunca corre la suite.** Contador propio en `~/.pignolo/`; tras 8 bloqueos, la tarea queda `BLOCKED`, y el hilo principal se entera (no solo el humano).
- Revisión (§12, §7): bajo → lectura estructural; medio → `review-reliability` + `review-testability`; alto → lentes según perfil + refuter(s) + Judgment Day según perfil. `max`: 3 refuters en riesgo alto, cae si ≥ 2 `REFUTED`; `INCONCLUSIVE` y faltantes = queda en pie. Fix: máx. 2 rondas. BLOCKER/CRITICAL sin rojo reproducido baja a WARNING y queda en el ledger. El ledger se persiste aunque quede vacío.
- `.pignolo/run.json` (§6, decisión del autor 2026-09-29): con `expires` ISO en el futuro = flujo en curso; ilegible = en curso (falla cerrado, con el camino para limpiarlo); vencido = no cuenta. Lo escriben y borran las skills de los flujos y va en `.pignolo/.gitignore`.
- Nada de datos del proyecto del autor, personas ni credenciales en lo versionado (repo público). Fixtures con datos sintéticos (`example.invalid`, nombres inventados).

## Método de ejecución y economía de tests

Igual que el hito 2 (decisión técnica 2026-09-29, pedido del autor: "lo más rápido, en paralelo, sin gastar tokens de más"):

- **Olas.** La ola 0 produce los contratos: dos tareas con archivos disjuntos que pueden correr en paralelo (1 y 2); se unen a `core/hito-3a` y se etiqueta `contract/hito-3a/v1`. La ola 1 corre **6 tareas en paralelo** (3 a 8), cada una en su worktree y con archivos disjuntos. La ola 2 une, corre el test de punta a punta de `gates` y cierra. Al unir cada ola, la suite completa corre **una vez**.
- **Worktrees creados a mano, no con `isolation: worktree`.** La doc oficial dice que la worktree de un subagente nace "branched by default from your default branch rather than the parent session's `HEAD`" (https://code.claude.com/docs/en/sub-agents), así que no tendría la ola 0.
  - El orquestador crea cada worktree con `git worktree add -b task/hito-3a/<NN>-<slug> <scratchpad>/wt-<NN> contract/hito-3a/v1` y le pasa la ruta en el brief.
  - El implementador edita con rutas absolutas dentro de esa worktree y corre cada comando como `cd <ruta> && <comando>` (mecanismo B de §11.2).
  - Primer paso de cada tarea de la ola 1: `git merge-base --is-ancestor contract/hito-3a/v1 HEAD`. Si falla, `BLOCKED`.
- **Despacho paralelo en background**, brief en archivo e informe en archivo aparte. Implementadores en sonnet (las tarjetas traen interfaces y casos literales). **Sin revisión por tarea.** Una sola revisión final opus de `main..core/hito-3a`, una pasada de arreglos y una confirmación acotada; después se clasifica (tope del hito 1).
- **Tests que valen lo que cuestan:**
  - Cada test protege un comportamiento del spec; nada de tests sobre texto libre, snapshots de mensajes ni getters. Los mensajes se prueban solo por la presencia de `Alternativa:` o de una palabra clave.
  - Tests **primero** desde el spec; el rojo es la primera corrida contra el código ausente y se muestra **una vez**. Romper el código para volver a ver rojo solo hace falta en un test agregado después del código.
  - Handlers **en proceso** (`require(handler).run(input, ctx)`); por el launcher corre **un solo** test de humo por hook nuevo.
  - Tests **de tabla** (un subtest por caso), así cada tarea filtra con `--test-name-pattern`.
  - Los implementadores corren **solo sus archivos** con `node --test --test-reporter=dot <archivo>` y pegan el resumen, nunca la salida TAP.
  - Repos temporales con `makeRepo()` y `makeTempDir()` de `tests/helpers.js` (ya aíslan `HOME` y `PIGNOLO_HOME`). Nada de `%TEMP%` sin limpiar.
- **Sin evals en 3a.** Ninguna tarea de este plan despacha agentes: costo de tokens de agentes = 0.

## Review Focus

Los cinco modos de falla reales más probables que el spec implica y que ningún test de tarjeta tocaría. La revisión final opus los mira primero.

1. **El comando de la compuerta cambia el árbol que sella.** Un `npm test` que escribe `coverage/`, `.tsbuildinfo` o regraba snapshots deja el árbol distinto del que el hook recalcula: o el sello nunca coincide (bucle de 8 bloqueos) o, peor, se sella un árbol que el propio comando modificó (un `--update` que "arregla" un snapshot). `gate` calcula el `tree-hash` antes y después y, si difieren, sella `TREE_CHANGED` con la lista de rutas y la alternativa ("agregá a `.gitignore` lo que genera la compuerta o corregí el comando"). Dueña: **Task 4**.
2. **El agente reescribe las reglas con las que se lo mide.** Un implementer puede editar `.pignolo/project.md` (cambiar `gates.on-done` por `true` o vaciar `test-paths`) y después correr `gate`. `gate` y `handback-gate` leen `project.md` desde el commit de referencia de la tarea (`git show <base>:.pignolo/project.md`), nunca de la copia de trabajo, y `.pignolo/project.md` cuenta siempre como `protected-test-config`. Dueñas: **Task 1** (lectura desde ref), **Task 4** y **Task 5** (la usan).
3. **El `cwd` de un worktree no ve la marca del flujo.** `.pignolo/run.json` está en `.gitignore`, así que no existe dentro de un worktree de tarea. Si los hooks la buscan con `projectRoot(cwd)` (hoy), desde un worktree no hay flujo: el handback-gate deja pasar todo y la allowlist de `Agent` no rige. Todos los consumidores la resuelven en el **checkout principal** a partir del archivo `.git` del worktree (`gitdir:` → `commondir`), sin lanzar git. Dueña: **Task 2**.
4. **Repo grande contra el plazo de 3 s.** El handback-gate calcula el `tree-hash` del worktree (`add -A` sobre una copia del índice + `write-tree`) y un diff contra la referencia. En 20.000 archivos eso tiene que entrar con margen. Se reutiliza la copia del índice real (stat cache); **todo** el trabajo git del hook, incluida la lectura de `project.md` desde la referencia, comparte un único `withDeadline(ctx.deadline − 400 ms)`; el hook pide `changedFiles` sin tamaños (no necesita `emptied`). El contador se incrementa y persiste **antes** de cualquier llamada a git, así un plazo vencido del launcher (que niega sin que el handler termine) también cuenta para el tope. Se mide en un repo sintético de 20.000 archivos y la cifra va al informe. Dueña: **Task 5**.
5. **Seguir en un bucle en vez de terminar.** Si el hook bloquea un `DONE` por algo que el agente no puede arreglar (sin sello porque el comando no existe, `project.md` sin commitear en la base, referencia faltante), el subagente gira hasta el tope gastando tokens. Cada motivo de bloqueo es accionable y nombra qué hacer o cuándo responder `BLOCKED`; `BLOCKED` y `NEEDS_CONTEXT` siempre pasan; `run.js task` rechaza de entrada una base sin `project.md` o sin `gates.on-done`; un contador por tarea en `~/.pignolo/handback/` corta a los 8, marca `BLOCKED` y un `PostToolUse` sobre `Agent` se lo dice al hilo principal, sin depender del tope nativo. Dueñas: **Tasks 5 y 6**.

## Rulings del plan (técnicos, registrados)

- **`tree-hash` = árbol de la copia de trabajo, no `HEAD^{tree}`.** Se calcula con una copia del índice del worktree + `add -A --ignore-errors` + `write-tree` (lo mismo que `inRepoSnapshot`), así incluye cambios sin commitear y archivos nuevos no ignorados. El sello guarda además `sha` = `HEAD`. Por qué: el `test-writer` no puede commitear y el orquestador no siempre commitea antes de la compuerta; con `HEAD^{tree}` un cambio sin commitear posterior al sello pasaría. Costo si está mal: ~0,3 s más por hook en repos grandes (medido en Task 5).
- **Integridad contra el árbol de trabajo, no `<ref>..HEAD`.** §8.2 escribe `git diff --name-only <ref>..HEAD`; con eso, un test alterado sin commitear no se ve. Se usa `git diff-tree -r --name-status <ref> <tree-hash>`. Es un superconjunto de lo que pide el spec. Costo si está mal: ninguno visible (detecta más).
- **La referencia de integridad es `task.testRef`** (el commit del `test-writer`, o el tag de contrato); sin `testRef`, se usa `task.base`; sin ninguno, falla cerrado (`INTEGRITY_NO_REF`).
- **Un solo `task` activo por flujo en 3a.** `run.json` lleva a lo sumo una tarea de escritura en curso (`daily` es serial, §5.2). El paralelismo con varias tareas llega en el hito 7, que extiende `task` a `tasks{}` con el vínculo por `agent_id`. Por qué: `SubagentStop` no trae el prompt del despacho, así que asociar un `agent_id` a una tarea necesita otro mecanismo que se diseña con los worktrees del hito 7. Costo si está mal: el hito 7 cambia el esquema de `run.json` (versión `v: 2`, compatibilidad con `v: 1`).
- **La tarea se registra antes del `test-writer` y se actualiza después.** Orden fijo que 3b tiene que seguir: `run.js task --id X --base <B> --file <tests…> --agent pignolo:test-writer` → `test-writer` → el orquestador demuestra el rojo y commitea (commit T) → `run.js task --id X --test-ref T --file <src…> --agent pignolo:implementer` (mismo `id`: actualiza la tarea y borra el contador). El alcance (`checks.scope`) y la integridad se miden contra `testRef ?? base`, así los tests commiteados entre `base` y `testRef` no cuentan como fuera de la tarea. Costo si está mal: toda tarea `daily` saldría `SCOPE`.
- **`stop_hook_active` no decide.** La doc de hooks dice que en `Stop` es "`true` when Claude Code is already continuing as a result of a stop hook" y que hay un tope de "8-consecutive-continuation"; para `SubagentStop` dice que usa "the same decision control format as Stop hooks", sin afirmar el tope (https://code.claude.com/docs/en/hooks, leído 2026-09-29). Si el hook dejara pasar con `stop_hook_active: true`, habría un solo reintento, no 8. Se registra el valor en el contador, pero el corte lo da el contador propio (8). *Hipótesis — verificar en la Task 10 (checklist manual):* que el tope nativo de 8 rige también en `SubagentStop`.
- **Contador del handback-gate.** Uno por tarea en `~/.pignolo/handback/<counterKey>/<taskId>.json`, con ruta, clave y forma fijadas en la ola 0 (Task 2). `counterKey(cwd)` sale **sin git** del `commondir` que ya parsea `mainRoot` (ruta absoluta resuelta, en minúsculas en win32, hasheada): el hook, `run.js` y un worktree dan la misma clave, y ninguno lanza git para el contador (ruling del orquestador). Los bloqueos sin tarea identificable usan claves fijas bajo la misma `counterKey`: `_malformed` (`run.json` ilegible) y `_noword` (sin palabra final válida), así el tope de 8 rige también ahí. Forma: `{ count, accepted, acceptedAgentId, blocked, lastReason, stopHookActive[] }`. En cada `DONE` a verificar, `count += 1` se persiste **antes** de tocar git; con `count >= 8` no se verifica: se marca `blocked` y se deja pasar. Aceptar pone `count: 0, accepted: true, acceptedAgentId: <agent_id>`. El salto del `SubagentStop` posterior a un `SubagentHandback` aceptado vale **solo para el mismo `agent_id`** (un segundo agente de la misma tarea se verifica de nuevo).
- **El hilo principal se entera del tope por `PostToolUse` sobre `Agent`.** La doc: en `PostToolUse`, `additionalContext` es "String added to Claude's context alongside the tool result", y para `SubagentStop` "To inject context into the parent session after a subagent returns, use a `PostToolUse` hook on the `Agent` tool instead" (https://code.claude.com/docs/en/hooks, leído 2026-09-29). El mismo handler, en `PostToolUse` con matcher `Agent`, solo si el despacho fue a un escritor pignolo y el contador de la tarea quedó sin aceptar tras al menos un rechazo (`blocked`, o `count > 0` y `accepted: false`, que cubre el corte por el tope nativo), agrega `additionalContext` `la tarea <id> no pasó el handback-gate (<motivo>); tratala como BLOCKED`. Callado en todo otro caso. Además, la interfaz para 3b fija que el orquestador corre `run.js status` después de cada escritor. *Hipótesis — verificar en la Task 10:* con un despacho en segundo plano, `PostToolUse` de `Agent` corre al lanzar y no al terminar; por eso `run.js status` es obligatorio.
- **Última palabra, antes que todo lo demás** (ruling del orquestador). Se toma la última línea no vacía del mensaje (`last_assistant_message` en `SubagentStop`, `tool_input.message` en `SubagentHandback`), sin `*`, `` ` `` ni puntuación final, y se evalúa **antes** de leer `run.json` o sellos. `BLOCKED` / `NEEDS_CONTEXT` → pasa siempre, aun con `run.json` ilegible. `DONE` → se verifica. Ninguna de las tres → se bloquea pidiendo cerrar con una de ellas (§6.1 "Cierre de turno"). La doc confirma los dos campos: "The report is that call's `message` input, which a `PreToolUse` or `PostToolUse` hook matched on `SubagentHandback` receives as `tool_input.message`" y "`last_assistant_message` field then holds the subagent's closing text, if any, which is not the delivered report" (https://code.claude.com/docs/en/hooks).
- **`test-writer` en el handback-gate** (técnico, ruling del orquestador 2026-09-29, opción A): no se le exige sello (no tiene Bash, §6.1); se le exige que todo archivo cambiado contra `testRef ?? base` esté en `test-paths` y que ninguno de `protected-test-config` cambie. Así el matcher de §8.3 se respeta sin un bloqueo imposible de cumplir. Costo si está mal: un `test-writer` que escribe un test decorativo pasa el hook; lo frena el rojo que demuestra el orquestador.
- **Fallar cerrado con los escritores pignolo.** Para `pignolo:implementer|fixer|test-writer` (y solo para ellos, sin fricción en despachos sueltos): un `run.json` ilegible bloquea el `DONE` con la ruta y cómo limpiarlo (`run.js end` o `start --replace`); con `run.task` presente se ignora `expires` (un implementer largo no pasa sin sello porque venció la marca). La allowlist de `Agent` sigue con la regla de `expires` de §6.
- **Carga perezosa en el handler.** `handback-gate` filtra por evento y `agent_type` antes de requerir los módulos de git. Límite declarado: en auto mode `PreToolUse` sobre `SubagentHandback` corre para todo subagente (el matcher no filtra por agente); si el launcher no arranca o falla, niega ese handback aunque el agente no sea de pignolo (falla cerrado de §8.3). Del mismo modo, `PostToolUse` sobre `Agent` corre en **todo** despacho, también los sueltos fuera de un flujo: cuesta el arranque del launcher y su worker en cada uno, y si el launcher falla se ve su `stderr` pero nunca bloquea (`PostToolUse` corre después de la herramienta). Por eso esa rama del handler es mínima (filtra `subagent_type` y lee solo el contador, sin git) y calla en el éxito.
- **Estado `NO_TESTS` en `code-untested`** (§9.2): si la compuerta pasa y ningún archivo cambiado está en `test-paths`, el sello queda `NO_TESTS` salvo que se pase `--no-tests-reason <archivo>` (texto registrado en el sello). El handback-gate acepta `PASS` y `NO_TESTS` con razón; rechaza `NO_TESTS` sin razón. Nunca "verde vacío".
- **Compuerta vacía** (sin comando para el nivel) → `NO_GATE`, exit 1, nunca verde (§15 `gates`), en todos los `type`.
- **Rama de nivel**: `gate` solo sella `on-done` y `pre-merge`; `on-edit` corre sin sello ("nunca cierra", §9.4). `live-check` queda para 3b/hito 5.
- **Nivel de riesgo (piso).** Con tripwire → `high` y `reserved: true`. Sin tripwire: `low` si hay 1 archivo y ≤ 10 líneas cambiadas; si no, `medium`. Sin `project.md` → piso `medium`. `maxRisk` combina el piso de la clasificación con el del diff real en `on-done` ("manda el máximo", §4.2). El modelo solo puede subir.
- **Piso de carril.** Sin tripwires y `low` → `trivial` permitido; cualquier tripwire → al menos `daily` y `reserved: true` (la skill pregunta con la categoría del hit antes de seguir); UI sin `visible-paths` → `plan`. Por qué: §5.2 define `trivial` "sin tripwire ni zona de riesgo" y deja el ascenso a `plan` para alcance y contrato; subir todo tripwire a `plan` haría preguntar de más.
- **Tripwires de contenido fuera de tests.** Los de contenido no miran archivos de `test-paths` (un `setInterval` en un test no es un costo), **salvo `pii`**, que mira todo (regla 5 de `core.md`: tampoco en fixtures).
- **Firma exportada** (§6.1 "un tripwire de contratos marca cambios de firma exportada"): dispara con una línea **quitada** (`-`) de `export …`, `module.exports`, `exports.x =` o `def`/`class` de nivel superior en Python, fuera de `test-paths`, o con una línea agregada (`+`) de esa forma cuyo nombre aparece también en una línea `-` del mismo archivo (firma cambiada). Un export nuevo no dispara: agregar API no rompe consumidores, y marcarlo haría reservada casi toda tarea. Tripwire `exported-signature`, categoría `contract`. Heurística declarada: no parsea lenguajes; un export renombrado sin quitar el viejo no se ve.
- **Categorías reservadas en inglés** (técnico, ruling del orquestador 2026-09-29, por la convención del repo de nombres de elementos en inglés): `identity`, `scope`, `costs`, `dependencies`, `irreversible`, `security`, `contract`, `rule-conflict`, en el orden de §4.1. El texto al humano las acompaña con su nombre en su idioma.
- **Los flags del interruptor viven en el checkout principal.** `flagPaths` usa `mainRoot(cwd)` (mismo criterio sin git de la Task 2: archivo `.git` → `gitdir:` → `commondir`; sin repo, el `cwd` como hoy), así `/pignolo:off` desde un worktree apaga lo mismo que `projectState.active` lee.
- **Mapeo de tripwire a categoría** (lista cerrada): `manifest` → `dependencies`; `iac-ci`, `migration`, `deletion` → `irreversible`; `env`, `high-risk`, `pii`, `claude-config` → `security`; `contracts`, `exported-signature` → `contract`; `cost-paths`, `ai-model`, `paid-sdk`, `polling`, `retry-concurrency`, `log-level` → `costs`; `visible-paths`, `ui-undeclared` → `scope`.
- **Glob propio, sin `path.matchesGlob`** (no está en Node 20). Semántica: patrón sin `/` = cualquier segmento (directorio o nombre) que lo cumpla; patrón terminado en `/` = algún directorio de la ruta lo cumple; patrón con `/` interno = anclado a la raíz, con `**` (cero o más segmentos), `*` y `?` dentro de un segmento. Sensible a mayúsculas (las rutas vienen de git).
- **YAML-lite** (§2: "subconjunto propio (`clave: escalar | lista`) con parser testeado"): claves de nivel superior con escalar, lista en bloque (`  - x`), o un mapa de un nivel (`  sub: escalar`, necesario para `gates`). Escalares entre comillas simples o dobles opcionales; `true`/`false` como booleanos; el resto, texto. Comentarios de línea completa con `#`. Tabs, más de un nivel o mezcla lista/mapa → error con número de línea.
- **`run.json` v1** y su vencimiento: `start` fija `expires` = ahora + 2 h; la skill llama `renew` antes de cada despacho. Por qué: una sesión cortada deja de bloquear en ≤ 2 h. Costo si está mal: una pausa de más de 2 h sin `renew` apaga la allowlist hasta el próximo paso.
- **Los subagentes no escriben `.pignolo/run.json`** con Edit/Write (`protect-paths`, solo si el payload trae `agent_id`). Desde la shell queda como riesgo residual declarado (modelo de amenaza §1.9: agente falible, no atacante).
- **El hook no escribe `run.json`.** El `BLOCKED` tras 8 bloqueos se guarda en el contador (`~/.pignolo/handback/<repo-id>/<task-id>.json`) y `scripts/run.js status` lo muestra. Por qué: un solo escritor para `run.json` (la skill).
- **Ledger en JSON**, no en Markdown: `{v:1, sha, level, profile, round, findings[]}`. El resumen al humano lo arma la skill (3b) con las dos capas de §4.6. Dónde se guarda lo decide 3b (el estado de `.pignolo/state/` es del hito 6); `lib/ledger.js` recibe la ruta.
- **Coincidencia de hallazgos entre jueces**: misma ruta y líneas a ≤ 3 de distancia. Ambos → `fix`; uno → `suspect`; mismo lugar con uno bloqueante (BLOCKER/CRITICAL) y otro no → `judge-conflict`.
- **Conflictos de reglas de `setup`** (pendiente del hito 2): se guardan en `~/.pignolo/rule-conflicts.json` con la fuente, el sha256 del texto citado de cada parte, la resolución y la fecha; si el texto citado cambia, el conflicto vuelve a preguntarse. Por qué a nivel de usuario: `~/.claude/CLAUDE.md` es de la cuenta; los de un proyecto llevan `project: <raíz>`.
- **Plan en tarjetas, no en código final** (§5.2). Los bloques de código son hipótesis hasta ejecutarlos; el plan fija interfaces, casos de test y valores literales.

---

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

Parten de `main`. Al terminar ambas: unir a `core/hito-3a`, `npm run test:quiet` una vez, tag `contract/hito-3a/v1`.

### Task 1: `project.md` legible (yaml-lite, globs, config del proyecto)

**Files:**
- Create: `plugins/pignolo/lib/yaml-lite.js`, `plugins/pignolo/lib/globs.js`, `plugins/pignolo/lib/project-config.js`
- Test: `tests/yaml-lite.test.js`, `tests/globs.test.js`, `tests/project-config.test.js`

**Interfaces que produce:**
- `yaml-lite.js`: `parseFrontmatter(text) → { data: object, body: string }`. Sin bloque `---` inicial → `{ data: {}, body: text }`. Error → lanza `YamlLiteError` (exportada) con `.line` (1-based) y mensaje `yaml-lite: línea <n>: <motivo>`.
- `globs.js`: `matchGlob(pattern: string, relPath: string) → boolean`, `matchAny(patterns: string[], relPath: string) → boolean`. `relPath` en posix, relativo a la raíz.
- `project-config.js`:
  - `DEFAULT_TEST_PATHS = ['*test*', '*spec*', '__snapshots__/', '__mocks__/', 'fixtures/', 'test/', 'tests/']` (congelado).
  - `TYPES = ['code-tested', 'code-untested', 'docs', 'script']`.
  - `readProjectConfig({ root, ref, timeoutMs = 1000, run }) → Config`. Con `ref`, lee `git show <ref>:.pignolo/project.md` con `cwd: root`; sin `ref`, lee `<root>/.pignolo/project.md`. Si se pasa `run` (un `withDeadline`), usa ese y no abre un plazo propio: así el handback-gate reparte un único plazo (Review Focus 4).
  - `Config = { found: boolean, conservative: boolean, type: string|null, gates: { 'on-edit'?: string, 'on-done'?: string, 'pre-merge'?: string, 'live-check'?: string }, testPaths: string[], testPathsDeclared: boolean, protectedTestConfig: string[], highRiskPaths: string[], contracts: string[], serialPaths: string[], costPaths: string[], visiblePaths: string[], piiPatterns: string[], depsInstall: string|null, domainRules: string[], mutation: boolean, language: string|null, profile: string|null, warnings: string[] }`.
  - `protectedTestConfig` incluye **siempre** `.pignolo/project.md` además de lo declarado (Review Focus 2).
  - Claves en `project.md` con guion (`test-paths`) → camelCase en `Config`. Una lista declarada como escalar (`test-paths: tests/`) se acepta como lista de uno.
  - Sin archivo (o `ref` sin el archivo) → `found: false, conservative: true`, listas vacías, `testPaths = DEFAULT_TEST_PATHS`, `warnings` con `sin .pignolo/project.md: modo conservador; corré /pignolo:init`.
  - `type` fuera de `TYPES`, `pii-patterns` con una regex inválida o un `YamlLiteError` → lanza `Error` con mensaje que empieza por `project.md inválido:`. Una clave desconocida → aviso en `warnings`, no error.

- [ ] **Paso 1: tests primero (de tabla).**
  - `yaml-lite`:
    - `---\ntype: code-tested\n---\nnotas` → `data.type === 'code-tested'`, `body === 'notas'`.
    - `gates:\n  on-done: npm run test:unit\n  pre-merge: "npm test -- --repeat 3"` → `data.gates['on-done'] === 'npm run test:unit'` (el `:` de adentro no corta).
    - `test-paths:\n  - tests/\n  - "*.spec.ts"` → lista de 2.
    - `mutation: false` → booleano `false`; `profile: 'max'` → `'max'`.
    - `# comentario` ignorado; línea vacía ignorada.
    - Tab al comienzo de línea → `YamlLiteError` con `line` correcto.
    - Dos niveles de anidación → error; mezcla `- x` y `k: v` bajo la misma clave → error.
    - Sin `---` → `data: {}`.
  - `globs` (tabla `[patrón, ruta, esperado]`):
    - `*test*`: `src/a.test.js` → sí; `tests/x.js` → sí; `src/latest.js` → sí (declarado: el default es amplio, como en §3.2); `src/app.js` → no.
    - `fixtures/`: `a/fixtures/b.json` → sí; `fixtures.js` → no.
    - `tests/`: `tests/a.js` → sí; `src/tests/a.js` → sí; `tests.js` → no.
    - `src/**/*.sql`: `src/db/m/1.sql` → sí; `src/1.sql` → sí; `lib/src/1.sql` → no.
    - `db/migrations/*`: `db/migrations/001.sql` → sí; `db/migrations/a/001.sql` → no.
    - `?.md`: `a.md` → sí; `ab.md` → no.
    - `Package.json` vs `package.json` → no (sensible a mayúsculas).
  - `project-config` (repo temporal con `makeRepo()`):
    - Sin archivo → `found:false`, `conservative:true`, `testPaths` = default, aviso presente.
    - Con `type: docs` y `test-paths: [tests/]` → `testPathsDeclared: true`, sin el aviso de default.
    - Sin `test-paths` → default y aviso `test-paths sin declarar`.
    - `type: other` → lanza `project.md inválido: type`.
    - `pii-patterns:\n  - "[unclosed"` → lanza `project.md inválido: pii-patterns`.
    - `protectedTestConfig` contiene `.pignolo/project.md` aun si `protected-test-config` no está declarado.
    - **Desde ref (Review Focus 2):** commit C1 con `gates.on-done: node check.js`; después se edita la copia de trabajo a `gates.on-done: "true"` sin commitear; `readProjectConfig({root, ref: C1})` devuelve `node check.js`.
    - `ref` inexistente → lanza (la ref no existe ≠ el archivo no existe).
- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot tests/yaml-lite.test.js tests/globs.test.js tests/project-config.test.js`. Falla por módulos ausentes. Anotar el resumen.
- [ ] **Paso 3: implementar** los tres módulos hasta el verde.
- [ ] **Paso 4: commit.** `feat(project): lectura de project.md con yaml-lite y globs propios`.

### Task 2: árbol, diff, sellos y marca del flujo desde el checkout principal

**Files:**
- Create: `plugins/pignolo/lib/changes.js`, `plugins/pignolo/lib/seals.js`, `plugins/pignolo/lib/handback-counter.js`
- Modify: `plugins/pignolo/lib/disabled.js` (`mainRoot`; `flagPaths` usa la raíz principal), `plugins/pignolo/lib/project.js` (registro del flujo), `plugins/pignolo/hooks/handlers/agent-gate.js` (usar la raíz principal para `runState`)
- Test: `tests/changes.test.js`, `tests/seals.test.js`, `tests/run-state.test.js`, `tests/handback-counter.test.js`; un caso más en `tests/agent-allowlist.test.js` y en `tests/disabled.test.js`

**Interfaces que produce:**
- `changes.js` (todas reciben `run` de `withDeadline` o `{ cwd, timeoutMs }`; ninguna toca el índice real ni el árbol):
  - `workingTree({ cwd, timeoutMs, run }) → string` (sha del árbol): copia `<git-dir>/index` a un índice temporal en `<git-dir>`, `add -A --ignore-errors`, `write-tree`, borra el temporal (y su `.lock`) en `finally`. Ignorados fuera. Fuera de un repo → lanza `Error('no es un repo git: <cwd>')`.
  - `changedFiles({ cwd, base, tree, timeoutMs, run, sizes = true }) → Array<{ path, status: 'A'|'M'|'D'|'R'|'T', emptied: boolean|null }>` con `git diff-tree -r -z --no-renames --name-status <base> <tree>`; con `sizes: true`, `emptied` = el archivo existe en `base` con tamaño > 0 y en `tree` con tamaño 0 (`ls-tree -r -l`); con `sizes: false` no se llama a `ls-tree` y `emptied` es `null` (el hook no lo necesita, Review Focus 4).
  - `addedLines({ cwd, base, tree, timeoutMs }) → Array<{ path, line, text, sign: '+'|'-' }>` desde `git diff-tree -r -p -U0 --no-renames <base> <tree>` (líneas agregadas y quitadas, con número de línea del lado que corresponde). Binarios omitidos.
  - `headSha({ cwd, timeoutMs }) → string|null`.
- `seals.js`:
  - `repoIdFor({ cwd, timeoutMs }) → string` (vía `rev-parse --path-format=absolute --git-common-dir` + `shadow.repoIdForGitDir`).
  - `sealDir(env, repoId) → string` = `<pignoloHome>/seals/<repoId>`.
  - `writeSeal({ env, repoId, seal, log }) → { file, logHash }`: escribe el log en `<sealDir>/logs/<sha256>.log` y el sello en `<sealDir>/<treeHash>-<level>-<stamp>.json`, en forma atómica (temporal + `rename`).
  - `findSeal({ env, repoId, treeHash, level }) → Seal|null`: el más nuevo para ese árbol y nivel (ordena por `time`).
  - `Seal = { v: 1, repoId, sha, treeHash, treeAfter, level, command, exit: number|null, status: 'PASS'|'FAIL'|'NO_GATE'|'NO_TESTS'|'TREE_CHANGED'|'SCOPE'|'INTEGRITY'|'INTEGRITY_NO_REF', logHash, time, task: string|null, noTestsReason: string|null, checks: { scope: string[], emptied: string[], integrity: string[], envDetect: Array<{path,line}> } }`.
  - `validateSeal(obj) → string[]` (errores; vacío = válido). `findSeal` ignora los inválidos.
- `disabled.js` (va acá y no en `project.js`, que ya requiere `disabled.js`; `project.js` lo reexporta):
  - `mainRoot(cwd) → string`: `projectRoot(cwd)`; si `<root>/.git` es un **archivo** `gitdir: X`, lee `X/commondir` (relativo a `X`) y devuelve el padre del directorio común cuando su nombre es `.git`. Sin git, sin procesos. Si algo falla (o no hay repo), devuelve `root`, como hoy.
  - `flagPaths` calcula el flag del proyecto sobre `mainRoot(cwd)`: `/pignolo:off` desde un worktree apaga el proyecto entero, y `toggle` (que usa `flagPaths`) lo sigue sin cambios.
- `project.js` (se agrega; `projectState` y `runState` conservan su forma actual para no romper consumidores):
  - `projectState` agrega `main: mainRoot(cwd)` al resultado; `active` se calcula sobre `main` (un worktree ve el `project.md` y el `.disabled` del checkout principal).
  - `readRun(main, now = Date.now()) → { running, expired, malformed?, file, run?: Run }` (sucesor de `runState`, que queda como alias). `expired: true` con `running: false` cuando venció: el handback-gate usa `run.task` aunque haya vencido (ruling "Fallar cerrado con los escritores pignolo").
  - `Run = { v: 1, flow: 'trivial'|'daily'|'review'|'plan', started: ISO, expires: ISO, task?: { id: string, worktree: string (absoluta), base: sha, testRef?: sha, files: string[], agents: string[], testAuthorization?: boolean } }`. `testAuthorization` (§9.3) lo escribe `run.js task --test-authorization` (Task 6) y lo leen `gate` (Task 4) y el handback-gate (Task 5).
  - `validateRun(obj) → string[]`; `readRun` trata un `run.json` que no valida como `malformed` (en curso, falla cerrado).
- `handback-counter.js` (lo escribe la Task 5 y lo leen o borran las Tasks 5 y 6):
  - `counterKey(cwd) → string`: **sin git**. Toma el directorio común que ya resuelve `mainRoot` (el `commondir` parseado del archivo `.git` de un worktree, o `<main>/.git` en el checkout principal; sin repo, el `cwd`), lo resuelve a ruta absoluta, lo pasa a minúsculas en win32 y devuelve los primeros 16 hex de su sha256. Es la única clave del contador: las Tasks 5 y 6 no usan `repoIdFor` ni git para el contador.
  - `counterPath(env, cwd, taskId) → <pignoloHome>/handback/<counterKey(cwd)>/<taskId>.json`. `taskId` es un id de tarea o una de las claves fijas `_malformed` y `_noword`.
  - `readCounter(env, cwd, taskId) → Counter` (ausente o ilegible → el valor inicial `{ count: 0, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] }`).
  - `writeCounter(env, cwd, taskId, counter)` atómico (temporal + `rename`); `clearCounter(env, cwd, taskId)`.
- `agent-gate.js`: usa `readRun(projectState(...).main)`. Sin otro cambio de comportamiento.

- [ ] **Paso 1: tests primero.**
  - `changes`:
    - Árbol limpio: `workingTree` === `git rev-parse HEAD^{tree}`.
    - Archivo modificado sin commitear → el árbol difiere de `HEAD^{tree}`; `git status --porcelain` igual antes y después (el índice real no se toca).
    - Archivo nuevo no ignorado → aparece en `changedFiles` como `A`; uno ignorado por `.gitignore` → no.
    - Archivo vaciado → `emptied: true`; borrado → `D`.
    - `addedLines` de `+export function f(a, b)` da `{ sign: '+', line: n }` correctos.
    - Fuera de un repo → lanza `no es un repo git`.
    - No quedan `pignolo-*index*` (ni su `.lock`) en el `git-dir` después de un fallo **a mitad**: se inyecta un `run` que delega en git real y lanza en `write-tree` (así el temporal ya existe y el `finally` se ejercita).
    - `changedFiles({ sizes: false })` no llama a `ls-tree` (el `run` inyectado lo registra) y devuelve `emptied: null`.
  - `seals`:
    - `writeSeal` + `findSeal` por `treeHash` y `level` devuelven el mismo objeto; otro `treeHash` → `null`; otro `level` → `null`.
    - Dos sellos del mismo árbol → gana el más nuevo.
    - Un JSON corrupto en el directorio → ignorado, sin lanzar.
    - `logHash` === sha256 del log.
    - `repoIdFor` de un worktree (`git worktree add`) === el del checkout principal.
  - `run-state` (tabla):
    - `mainRoot` desde un worktree creado con `git worktree add` → la raíz principal (Review Focus 3); desde un subdirectorio del principal → la raíz; sin repo → el `cwd`.
    - `run.json` vigente con `task` válida → `running: true`, `run.task.id` presente.
    - `run.json` con `v: 2`, sin `flow` o con `task.files` que no es lista → `malformed: true, running: true`.
    - Vencido → `running: false, expired: true`, con `run.task` presente.
    - `task.testAuthorization: "si"` (no booleano) → `malformed`.
  - `handback-counter`: `counterKey(<worktree>)` === `counterKey(<principal>)` === `counterKey(<subdirectorio del principal>)` para el mismo repo, y distinta para otro repo; se verifica sin git en el `PATH` del proceso (`env.PATH` vacío en un subproceso); sin archivo → valor inicial; escribir y leer da lo mismo; archivo corrupto → valor inicial; `clearCounter` lo borra.
  - `disabled`: `flagPaths({ cwd: <worktree> }).project` === `<principal>/.pignolo/.disabled`; sin repo, sigue siendo `<cwd>/.pignolo/.disabled`.
  - `agent-allowlist`: con `project.md` y `run.json` vigente **en el principal**, un `Explore` con `cwd` = la worktree se niega (hoy pasa); con `.pignolo/.disabled` en el principal y `cwd` = la worktree, pasa.
- [ ] **Paso 2: rojo.** Solo esos archivos. Anotar el resumen.
- [ ] **Paso 3: implementar** hasta el verde, más `tests/agent-allowlist.test.js`, `tests/disabled.test.js` y `tests/toggle.test.js` completos.
- [ ] **Paso 4: commit.** `feat(core): árbol de trabajo, sellos y marca del flujo leída desde el checkout principal`.

---

## Ola 1 (en paralelo: Tasks 3 a 8, cada una en su worktree)

Todas parten de `contract/hito-3a/v1`. Ninguna toca los archivos de la ola 0; si un contrato parece mal, responden `BLOCKED` sin cambiarlo. `hooks/hooks.json` lo toca solo la Task 5.

### Task 3: `scripts/risk` (piso de riesgo y tripwires)

**Files:**
- Create: `plugins/pignolo/lib/risk.js`, `plugins/pignolo/scripts/risk.js`
- Test: `tests/risk.test.js` (es el test `risk` de §15)

**Interfaces:**
- Consume: `readProjectConfig`, `matchAny`, `changedFiles`, `addedLines`, `workingTree`.
- `risk.js` (lib) exporta:
  - `TRIPWIRES`: tabla congelada `{ id, kind: 'path'|'content', category }` con los ids y categorías del ruling de mapeo.
  - `assessRisk({ files: Array<{path,status}>, lines: Array<{path,line,text,sign}>, config }) → { level: 'low'|'medium'|'high', reserved: boolean, laneFloor: 'trivial'|'daily'|'plan', hits: Array<{ tripwire, category, path, line?, detail }>, categories: string[] }`.
  - `maxRisk(a, b)`: combina dos resultados (máximo de `level` y de `laneFloor`, unión de `hits`, `reserved` = o lógico).
- Listas literales de ruta (basename salvo que se diga):
  - `manifest`: `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile`, `Pipfile.lock`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock`, `Gemfile`, `Gemfile.lock`, `composer.json`, `composer.lock`, `pubspec.yaml`, `pubspec.lock`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `*.csproj`.
  - `iac-ci`: `.github/workflows/**`, `.gitlab-ci.yml`, `.circleci/**`, `azure-pipelines.yml`, `Jenkinsfile`, `Dockerfile*`, `docker-compose*.yml`, `compose*.yml`, `*.tf`, `*.tfvars`, `Chart.yaml`, `serverless.yml`, `vercel.json`, `netlify.toml`, `fly.toml`.
  - `env`: `.env`, `.env.*`.
  - `migration`: segmento `migrations/` o `migrate/`, `prisma/migrations/**`, `*.sql` bajo `db/`.
  - `deletion`: `status === 'D'`.
  - `claude-config`: `.claude/**`, `CLAUDE.md`, `.pignolo/project.md`.
  - `contracts`, `high-risk`, `cost-paths`, `visible-paths`: los globs de `config`.
  - `ui-undeclared`: con `visiblePaths` vacío, `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.html`, `*.css`, `*.scss` → `laneFloor: 'plan'`.
- Contenido (solo líneas `+`, salvo `exported-signature`; fuera de `test-paths` salvo `pii`). Toda palabra suelta lleva `\b` y los nombres de modelo o de paquete van dentro de un string o de un import, para no pegar en `coherent`, `acronym` o `striped`:
  - `ai-model`: `/['"`](claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|o[134](-mini|-pro)?|gemini-[a-z0-9.-]+|mistral-[a-z0-9.-]+|llama-?\d[a-z0-9.-]*)['"`]/i` (el identificador tiene que estar entre comillas o backticks).
  - `paid-sdk`: `/@anthropic-ai\/|@google\/(generative-ai|genai)|@aws-sdk\/|@sendgrid\//`; `/(require\(|from\s+|import\s+)['"]?(openai|anthropic|cohere|stripe|twilio)\b/`; `/\bapi\.(anthropic|openai|stripe)\.com\b|\bgenerativelanguage\.googleapis\.com\b/`.
  - `polling`: `/\bsetInterval\s*\(/`, `/\b(node-)?cron\b/`, `/@Scheduled\b/`, `/\bschedule\s*\(/`, `/\bpoll(ing)?\b/i`.
  - `retry-concurrency`: `/\bretr(y|ies)\b/i`, `/\bbackoff\b/i`, `/\bPromise\.all(Settled)?\s*\(/`, `/\bconcurrency\b/i`, `/\bp-limit\b/`, `/\bnew\s+Worker\s*\(/`, `/\bThreadPool/`.
  - `log-level`: `/\bLOG_LEVEL\b/`, `/\blogLevel\b/`, `/\.setLevel\s*\(/`, `/\blevel\s*:\s*['"](debug|trace)['"]/`, `/\bconsole\.debug\s*\(/`.
  - `pii`: cada regex de `config.piiPatterns`.
  - `exported-signature` (ruling "Firma exportada"): forma `^\s*export\s+(default\s+)?(async\s+)?(function|class|const|let|interface|type|enum)\s+(\w+)`, `module\.exports`, `^\s*exports\.(\w+)\s*=`, `^(def|class)\s+(\w+)` (Python, nivel superior). Dispara con una línea `-` de esa forma, o con una `+` cuyo nombre aparece en una `-` del mismo archivo.
- CLI `scripts/risk.js`:
  - `--files-from <archivo>` (una ruta por línea, estado `M`; con `--deleted <ruta>` repetible para borrados planificados) o `--diff <base>` (árbol de trabajo contra `base`); `--cwd <dir>` opcional (por defecto el actual); `--ref <sha>` para leer `project.md` desde ese commit (por defecto `HEAD`).
  - Salida: el JSON de `assessRisk` + `{ config: { found, warnings } }`. Exit 0; uso inválido → exit 2 con el uso en stderr.

- [ ] **Paso 1: tests primero** (`tests/risk.test.js`, de tabla; `config` sintético salvo los del CLI):
  - **Un caso por tripwire** (§15 `risk`: "un diff plantado por cada tripwire → reservada"). El test **no** recorre `TRIPWIRES` del código (no podría fallar por omisión): lleva su propia tabla literal de los 18 ids con su categoría esperada y su disparador (`manifest`, `iac-ci`, `env`, `migration`, `deletion`, `claude-config`, `contracts`, `high-risk`, `cost-paths`, `visible-paths`, `ui-undeclared`, `ai-model`, `paid-sdk`, `polling`, `retry-concurrency`, `log-level`, `pii`, `exported-signature`). Cada disparador → `reserved: true`, `level: 'high'`, un hit con ese `tripwire` y su `category`; subtest `tripwire <id>`. Un subtest más compara el conjunto de ids de la tabla literal con el de `TRIPWIRES` (ni de más ni de menos).
  - Falsos positivos que no deben disparar: `coherent`, `acronym`, `striped`, `const o1 = 2`, `"claudette"`; un `export function nueva()` agregado sin ninguna línea `-` → sin hit `exported-signature`; `-export function f(a)` / `+export function f(a, b)` → hit.
  - Un cambio en `src/util.js` de 3 líneas sin nada → `level: 'low'`, `reserved: false`, `laneFloor: 'trivial'`.
  - Dos archivos sin nada → `medium`, `daily`.
  - Sin `project.md` (`config.found: false`) y un cambio chico → `medium` (piso conservador).
  - `setInterval(` en `tests/a.test.js` → sin hit (contenido fuera de tests); un email de `pii-patterns` en `tests/fixtures/u.json` → hit `pii`.
  - `Button.tsx` sin `visiblePaths` → `laneFloor: 'plan'`; con `visiblePaths: ['src/ui/']` y el archivo fuera → sin hit.
  - `maxRisk(low, high)` → `high` y la unión de hits.
  - CLI: `--diff <base>` en un repo temporal con `package.json` cambiado sin commitear → JSON con `manifest`; `--files-from` con una ruta de `.github/workflows/ci.yml` → `iac-ci`; sin argumentos → exit 2.
- [ ] **Paso 2: rojo.** Solo `tests/risk.test.js`; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(risk): piso de riesgo con tripwires de ruta y contenido`.

### Task 4: `scripts/gate` (compuerta fuera de hooks y sello)

**Files:**
- Create: `plugins/pignolo/lib/gate.js`, `plugins/pignolo/scripts/gate.js`
- Test: `tests/gate.test.js`

**Interfaces:**
- Consume: `readProjectConfig`, `matchAny`, `workingTree`, `changedFiles`, `addedLines`, `headSha`, `repoIdFor`, `writeSeal`, `readRun`, `mainRoot`.
- `lib/gate.js` exporta `runGate({ cwd, level, env, task, noTestsReason, timeoutMs, exec }) → Seal` (`exec` inyectable para tests: `(command, { cwd, timeoutMs, logFile }) → { exit }`; por defecto `spawnSync` con `shell: true`, `windowsHide: true` y `stdio: ['ignore', fd, fd]` sobre un archivo de log temporal abierto con `fs.openSync`, así la salida no pasa por el `maxBuffer` de 1 MB de `spawnSync` y una suite verbosa no da un `FAIL` falso por `ENOBUFS`; el hash y la cola de 40 líneas se leen del archivo).
- Orden dentro de `runGate`:
  1. `config` = `readProjectConfig({ root: cwd, ref: task ? (task.testRef ?? task.base) : undefined })` (Review Focus 2; `project.md` es `protected-test-config`, así que es igual en `base` y en `testRef`).
  2. `command = config.gates[level]`; vacío o ausente → sello `NO_GATE`, `exit: null`, sin ejecutar nada.
  3. `treeHash = workingTree(cwd)` (T0); se ejecuta; `treeAfter = workingTree(cwd)` (T1). T0 ≠ T1 → `TREE_CHANGED` y `checks.scope` lleva las rutas de `changedFiles(T0 → T1)` (Review Focus 1).
  4. Con `task`: `checks.scope` = cambiados contra `task.testRef ?? task.base` que no están en `task.files` (ruling "La tarea se registra antes del `test-writer`"); `checks.emptied` = vaciados; `checks.integrity` = cambiados contra `task.testRef ?? task.base` que caen en `testPaths` o `protectedTestConfig`, **salvo** los listados en `task.files` si la tarea es de `test-writer` (`task.agents` incluye `pignolo:test-writer`) o si tiene autorización (`task.testAuthorization: true`, §9.3). Sin `testRef` ni `base` → `INTEGRITY_NO_REF`.
  5. `checks.envDetect`: líneas `+` fuera de `test-paths` con `process.env.VITEST`, `JEST_WORKER_ID`, `NODE_ENV` comparado con `'test'`, `import.meta.vitest`, `PYTEST_CURRENT_TEST`, `"pytest" in sys.modules`. Solo marca (§8.2: "sospechoso"), no cambia el estado.
  6. `code-untested` y ningún cambiado en `testPaths` → `NO_TESTS` (con `noTestsReason` = contenido del archivo si se pasó; si no, `null`).
  7. Estado final por prioridad: `NO_GATE` > `INTEGRITY_NO_REF` > `TREE_CHANGED` > `FAIL` (exit ≠ 0) > `INTEGRITY` > `SCOPE` (scope o emptied) > `NO_TESTS` > `PASS`.
  8. `writeSeal` solo para `on-done` y `pre-merge`; `on-edit` devuelve el objeto sin escribir.
- CLI `scripts/gate.js --level on-edit|on-done|pre-merge [--cwd <dir>] [--task] [--no-tests-reason <archivo>] [--timeout-min <n>]`:
  - `--task` toma `run.task` de `readRun(mainRoot(cwd))`; sin flujo o sin `task` → exit 2 `no hay una tarea registrada en .pignolo/run.json`.
  - Con `--task` y sin `--cwd`, `cwd` = `task.worktree`.
  - Plazo por defecto 30 min por comando.
  - Salida: el sello en JSON (sin el log; el log queda en `logs/`, y se imprimen sus últimas 40 líneas en stderr si el estado no es `PASS`).
  - Exit: 0 con `PASS` o `NO_TESTS` con razón; 1 con cualquier otro estado; 2 uso inválido.

- [ ] **Paso 1: tests primero** (`tests/gate.test.js`; repos temporales; `exec` inyectado salvo en un caso real con `node check.js`):
  - **§15 `gates`: compuerta vacía en `code-untested` no da verde** → `NO_GATE`, exit del CLI 1.
  - `on-done: node check.js` con `check.js` que sale 0 → `PASS`, sello en `seals/<repoId>/`, `findSeal(T0)` lo encuentra, `logHash` = sha256 del log. Con salida 1 → `FAIL`.
  - Comando que crea `coverage/out.txt` no ignorado → `TREE_CHANGED`, `checks.scope` contiene `coverage/out.txt` (Review Focus 1).
  - `project.md` en la copia de trabajo cambiado a `on-done: "true"` con `task.base` = commit anterior → se ejecuta el comando del commit, no `true` (Review Focus 2); además `.pignolo/project.md` aparece en `checks.integrity`.
  - `task.files = ['src/a.js']` y un cambio en `src/b.js` → `SCOPE`; `src/a.js` vaciado → `SCOPE` con `emptied`.
  - `testRef` ≠ `base`: `tests/a.test.js` commiteado entre los dos, `task.files = ['src/a.js']`, cambio en `src/a.js` → `PASS` (no `SCOPE`).
  - Un `check.js` que escribe 3 MB a stdout y sale 0 → `PASS`, no `FAIL` (sin `ENOBUFS`).
  - Test cambiado en `tests/a.test.js` contra `testRef` → `INTEGRITY`; el mismo cambio con `task.agents = ['pignolo:test-writer']` y el archivo en `task.files` → no cuenta.
  - Sin `base` ni `testRef` con `--task` → `INTEGRITY_NO_REF`.
  - `process.env.VITEST` agregado en `src/a.js` → `envDetect` con esa línea, estado sin cambios.
  - `code-untested` con compuerta verde y sin archivos de test cambiados → `NO_TESTS`, exit 1; con `--no-tests-reason` → exit 0 y `noTestsReason` guardada.
  - `on-edit` → no escribe sello.
  - CLI `--task` sin `run.json` → exit 2 con el mensaje.
- [ ] **Paso 2: rojo.** Solo este archivo; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(gate): compuerta fuera de hooks con sello, alcance e integridad de tests`.

### Task 5: `handback-gate` (hook de `SubagentStop` y `SubagentHandback`)

**Files:**
- Create: `plugins/pignolo/hooks/handlers/handback-gate.js`
- Modify: `plugins/pignolo/hooks/hooks.json`: sumar `"SubagentStop": [{ "matcher": "^pignolo:(implementer|fixer|test-writer)$", "hooks": [launcher handback-gate, timeout 30] }]`; en `PreToolUse`, `{ "matcher": "SubagentHandback", "hooks": [launcher handback-gate, timeout 30] }`; y `"PostToolUse": [{ "matcher": "Agent", "hooks": [launcher handback-gate, timeout 30] }]`.
- Test: `tests/handback-gate.test.js`, `tests/fixtures/handback-lazy.js` (auxiliar del test de carga perezosa); en `tests/hooks-json.test.js`, un test que verifica los tres registros.

**Interfaces:**
- Consume: `projectState`, `readRun`, `readState`, `readProjectConfig` (con `run`), `workingTree`, `changedFiles` (`sizes: false`), `repoIdFor` (solo para los sellos), `findSeal`, `withDeadline`, `counterKey`/`readCounter`/`writeCounter` (Task 2; el contador nunca usa git).
- Produce: `run(input, ctx) → { exit, stdout?, stderr? }`. `ctx.now`, `ctx.deadline`, `ctx.env` y `ctx.run` (el `withDeadline`) inyectables. Los módulos de git se requieren **dentro** de `run`, después de los pasos 1 y 2 (carga perezosa, ruling).
- Decisión en `SubagentStop` / `SubagentHandback`, en orden:
  1. `tool_name === 'SubagentHandback'` → mensaje = `tool_input.message`; si no, `hook_event_name === 'SubagentStop'` → `last_assistant_message`. `PostToolUse` → ver abajo. Otro evento → exit 0.
  2. `agent_type` ∉ `{pignolo:implementer, pignolo:fixer, pignolo:test-writer}` → exit 0 (el matcher de `SubagentHandback` no filtra por agente).
  3. Proyecto no activo o hooks apagados → exit 0.
  4. **Última palabra primero** (ruling "Última palabra, antes que todo lo demás"): `BLOCKED`/`NEEDS_CONTEXT` → exit 0, sin leer `run.json` ni sellos (aun ilegible). Solo `DONE` o la ausencia de una palabra válida siguen.
  5. Sin `run.json` → exit 0. `run.json` ilegible → bloquear con la ruta y la alternativa `pedile al orquestador node "<plugin>/scripts/run.js" end (o start --replace)`, contando en la clave fija `_malformed` (pasos 7 y 12 con esa clave). Sin `run.task` → exit 0. Con `run.task`, `expires` no cuenta (ruling "Fallar cerrado con los escritores pignolo").
  6. `SubagentStop` con el contador de la tarea en `accepted: true` **y** `acceptedAgentId === input.agent_id` → exit 0 (ese reporte ya pasó por `SubagentHandback`; su texto de cierre puede no terminar en `DONE`). Otro `agent_id` → sigue. Sin palabra válida → bloquear con "terminá con DONE, BLOCKED o NEEDS_CONTEXT", contando en la clave fija `_noword`.
  7. **Antes de cualquier git:** en el contador de la clave que corresponda (`task.id`, `_malformed` o `_noword`; todas bajo `counterKey(cwd)`), `count += 1`, `stopHookActive.push(input.stop_hook_active === true)`, `accepted: false`, y `writeCounter`. Si `count >= 8` → no se verifica ni se bloquea: `blocked: true`, exit 0 con `systemMessage` `pignolo: la tarea <id> quedó BLOCKED tras 8 intentos rechazados del handback-gate (<último motivo>). Revisala antes de seguir.`
  8. Un solo `run = ctx.run ?? withDeadline(worktree, ctx.deadline − 400 ms − ahora)` para todo lo que sigue, incluida `readProjectConfig({ ref: testRef ?? base, run })`.
  9. `DONE` de `implementer`/`fixer`: `T = workingTree({ run })`; `seal = findSeal({ treeHash: T, level: 'on-done' })`. Sin sello → bloquear: `no hay un sello de on-done para el árbol actual de <worktree>. Alternativa: corré node "<plugin>/scripts/gate.js" --level on-done --task y, si falla, arreglalo o respondé BLOCKED con el motivo.` Sello con estado ≠ `PASS` y ≠ `NO_TESTS` con razón → bloquear nombrando el estado. Además se recalcula la integridad (cambiados contra `testRef ?? base`, con `sizes: false`, en `testPaths`/`protectedTestConfig`, salvo `task.testAuthorization`); no vacía → bloquear con la lista (§15 `gates`: "test o config protegidos alterados → handback-gate rechaza").
  10. `DONE` de `test-writer` (ruling A): todo cambiado contra `testRef ?? base` en `testPaths`, y nada en `protectedTestConfig`; si no → bloquear con la lista.
  11. Aceptado → contador `{ count: 0, accepted: true, acceptedAgentId: input.agent_id, blocked: false }` y exit 0 **sin salida**.
  12. Bloqueo = `lastReason` guardado y exit 2 con el motivo en `stderr` (la doc: para `SubagentStop`, "A hook that blocks by exiting 2 delivers its stderr message the same way", como instrucción siguiente del subagente; para `PreToolUse`, exit 2 "Blocks the tool call"; https://code.claude.com/docs/en/hooks).
  13. Error de git o plazo propio vencido → bloquear con `no se pudo verificar el sello dentro del plazo; se reintenta al próximo cierre`. El intento ya contó en el paso 7, también si el launcher corta antes (Review Focus 4). Nunca aceptar por error (N2).
- Decisión en `PostToolUse` con `tool_name: 'Agent'` (ruling "El hilo principal se entera del tope"): si `tool_input.subagent_type` es un escritor pignolo, hay flujo con `run.task` y el contador de esa tarea tiene `blocked: true`, o `count > 0` con `accepted: false` → exit 0 con `stdout` `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"pignolo: la tarea <id> no pasó el handback-gate (<lastReason>); tratala como BLOCKED y no la des por terminada."}}`. En todo otro caso, exit 0 sin salida. Nunca bloquea.

- [ ] **Paso 1: tests primero, en proceso y de tabla** (`tests/handback-gate.test.js`; repo temporal con `project.md` de `type: code-tested`, `run.json` vigente con `task` apuntando a una worktree real; sellos escritos con `writeSeal`):
  - §15 `gates`, **sello ausente** → exit 2, `stderr` con `Alternativa:`; **sello de otro `tree-hash`** (sellar, después modificar un archivo) → exit 2; **test protegido alterado** con sello `PASS` para ese árbol → exit 2 nombrando el archivo; **config protegida alterada** (`jest.config.js` en `protected-test-config`) → exit 2.
  - Sello `PASS` del árbol actual e integridad limpia → exit 0 y `stdout` vacío.
  - Sello `FAIL`, `NO_GATE`, `TREE_CHANGED` → exit 2 nombrando el estado; `NO_TESTS` sin razón → 2; con razón → 0.
  - Última palabra `BLOCKED` o `NEEDS_CONTEXT` sin sello → exit 0; `**DONE**` con sello → 0; texto sin palabra final → exit 2.
  - Mismo caso por los dos caminos: `SubagentStop` (`last_assistant_message`) y `PreToolUse` (`tool_name: 'SubagentHandback'`, `tool_input.message`) dan la misma decisión. Después de un `SubagentHandback` aceptado con `agent_id: 'a1'`, un `SubagentStop` de `a1` con texto de cierre sin `DONE` → exit 0.
  - **Otro agente de la misma tarea:** handback aceptado de `a1`; después, `SubagentStop` con `DONE` de `agent_id: 'a2'` sin sello para el árbol actual → exit 2.
  - `agent_type: 'pignolo:explorer'` por `SubagentHandback` → exit 0. `general-purpose` → exit 0, y el handler no requirió `lib/changes.js`. Este caso corre en un **subproceso** propio (un archivo auxiliar `tests/fixtures/handback-lazy.js`, no código inline, que requiere solo el handler, lo llama y escribe `JSON.stringify(Object.keys(require.cache))`), así el resultado no depende de lo que otros tests del mismo proceso ya cargaron. Mismo chequeo para `PostToolUse` con `subagent_type: 'Explore'`.
  - Sin `run.json`, con `/pignolo:off` o con `PIGNOLO_DISABLED=1` → exit 0 sin salida.
  - `run.json` ilegible con un `implementer` que dice `DONE` → exit 2 con la ruta, y el contador `_malformed` sube; el mismo `run.json` con `pignolo:explorer` → exit 0; **`BLOCKED` (y `NEEDS_CONTEXT`) de un `implementer` con `run.json` ilegible → exit 0** (la última palabra se evalúa primero).
  - Texto sin palabra final válida 8 veces seguidas → las 7 primeras exit 2 y la 8.ª exit 0 con `BLOCKED`, contando en `_noword`.
  - `run.json` vencido con `run.task` y `DONE` sin sello → exit 2 (no pasa por vencido).
  - `test-writer` con `DONE` que tocó solo `tests/a.test.js` → 0; que tocó `src/a.js` → 2.
  - **Tope:** 7 intentos rechazados y un 8.º `DONE` → exit 0 con `systemMessage` que contiene `BLOCKED`, y el contador queda `blocked: true` (Review Focus 5). `stop_hook_active: true` en el payload no cambia la decisión.
  - **Plazo a mitad (Review Focus 4):** `ctx.run` inyectado que lanza en `write-tree` → exit 2 con el motivo de plazo, y el contador quedó con `count` incrementado en disco. Con `ctx.deadline` ya vencido → exit 2, nunca 0.
  - `cwd` del payload = la worktree de la tarea → la marca del principal se encuentra (Review Focus 3).
  - `PostToolUse` de `Agent` con `subagent_type: 'pignolo:implementer'`: contador `blocked: true` → `additionalContext` con el id de la tarea y `BLOCKED`; contador aceptado → sin salida; `subagent_type: 'Explore'` → sin salida.
- [ ] **Paso 2: medición (Review Focus 4).** Script de medición (no test) en un repo sintético de 20.000 archivos creado en el scratchpad: tiempo del handler en proceso con sello presente, 5 corridas; anotar mediana y máximo en el informe. Si la mediana pasa de 1,5 s, `BLOCKED` con la cifra (se decide en la revisión final).
- [ ] **Paso 3: un solo test de humo por el launcher.** `runLauncher('handback-gate', { hook_event_name: 'SubagentStop', agent_type: 'pignolo:implementer', last_assistant_message: 'x\nDONE', cwd: <repo con flujo y sin sello>, stop_hook_active: false })` → status 2.
- [ ] **Paso 4: rojo.** Solo `tests/handback-gate.test.js` y `tests/hooks-json.test.js`; anotar.
- [ ] **Paso 5: implementar** hasta el verde.
- [ ] **Paso 6: commit.** `feat(hooks): handback-gate acepta DONE solo con sello e integridad de tests`.

### Task 6: ciclo de vida de `.pignolo/run.json`

**Files:**
- Create: `plugins/pignolo/scripts/run.js`, `plugins/pignolo/lib/pignolo-gitignore.js`
- Modify: `plugins/pignolo/hooks/handlers/protect-paths.js` (subagentes no escriben `run.json`), `plugins/pignolo/hooks/handlers/toggle.js` (usar `ensureIgnored` en la carpeta del flag, `path.dirname(flagPaths(...).project)`, que tras la Task 2 es la raíz principal: hoy escribe `.pignolo/.gitignore` en el `cwd`)
- Test: `tests/run-lifecycle.test.js`; un caso más en `tests/toggle.test.js`; casos en `tests/guard-toggle-paths.test.js` o un archivo nuevo `tests/protect-run.test.js` (preferido: archivo nuevo, disjunto)

**Interfaces:**
- Consume: `mainRoot`, `readRun`, `validateRun`, `pignoloHome`, `repoIdFor`, `readProjectConfig`, `readCounter`/`clearCounter` (Task 2, por `cwd`; el contador no usa `repoIdFor` ni git).
- `pignolo-gitignore.js`: `ensureIgnored(root, entries: string[])`: crea `<root>/.pignolo/.gitignore` si falta y agrega al final solo las líneas que faltan (comparación exacta por línea), en LF, sin tocar las demás.
- `scripts/run.js` (salida JSON por stdout; exit 0, 1 con motivo en stderr, 2 uso):
  - `start --flow trivial|daily|review|plan [--ttl-min 120] [--replace]`: escribe `<main>/.pignolo/run.json` `{v:1, flow, started, expires}` y `ensureIgnored(main, ['run.json', '.disabled'])`. Con un flujo vigente y sin `--replace` → exit 1 `ya hay un flujo en curso (<flow>) hasta <expires>`. Uno ilegible → exit 1 con la ruta y `--replace` como alternativa.
  - Alta: `task --id <id> --worktree <ruta> --base <sha> [--test-ref <sha>] --file <ruta> [--file …] [--agent pignolo:<rol> …] [--test-authorization]`. Actualización de la tarea en curso (mismo `id`): `task --id <id> [--worktree <ruta>] [--base <sha>] [--test-ref <sha>] [--file …] [--agent …] [--test-authorization]`, donde `--worktree` y `--base` son opcionales y se conservan si no se pasan; `--file`/`--agent`, si se pasan, reemplazan las listas. Un `id` distinto del de la tarea en curso exige la forma de alta completa (exit 2 si falta `--worktree` o `--base`). En los dos casos valida que `worktree` existe y es del mismo repo (`repoIdFor` igual), que `base` y `testRef` son commits y ancestros de `HEAD` de la worktree (`merge-base --is-ancestor`), y que `id` cumple `^[a-z0-9][a-z0-9-]{0,63}$`. Verifica además que `git show <testRef ?? base>:.pignolo/project.md` existe y declara `gates.on-done` (con `readProjectConfig({ ref })`); si no → exit 1 `la base <sha> no tiene .pignolo/project.md commiteado con gates.on-done; commitealo antes de registrar la tarea` (Review Focus 5: si no, cada `gate` sale `NO_GATE` y el escritor gira hasta el tope). Con el mismo `id` que la tarea en curso, **actualiza** (los campos pasados reemplazan a los anteriores; `base` se conserva si no se pasa), que es como 3b registra el `testRef` después del `test-writer`; un `id` distinto reemplaza la tarea. En los dos casos borra el contador de ese `id` con `clearCounter`.
  - `renew [--ttl-min 120]`: corre `expires`. Sin flujo → exit 1.
  - `status`: `{ running, malformed, run, handback: <contador de la tarea o null> }`.
  - `end`: borra `run.json` y el contador de la tarea. Sin flujo → exit 0 (idempotente).
- `protect-paths`: si el payload trae `agent_id` y el destino resuelto es `<mainRoot(cwd)>/.pignolo/run.json` → exit 2 `pignolo bloqueó la escritura: .pignolo/run.json lo escriben solo las skills de pignolo desde la conversación principal. Alternativa: devolvé BLOCKED y nombrá lo que haga falta cambiar.` El hilo principal (sin `agent_id`) no se bloquea; el conjunto catastrófico no cambia.

- [ ] **Paso 1: tests primero.**
  - `start` en un repo sin `.pignolo/.gitignore` → crea `run.json` válido (`validateRun` vacío) y `.gitignore` con `run.json` y `.disabled`; con un `.gitignore` previo `foo\n` → queda `foo\nrun.json\n.disabled\n`; una segunda corrida no duplica líneas.
  - `start` con uno vigente → exit 1; con `--replace` → 0; con uno ilegible → exit 1 nombrando la ruta.
  - `task` desde una worktree real: registra `worktree` absoluta; `base` que no es ancestro → exit 1; `id` inválido → exit 2; worktree de otro repo → exit 1.
  - `task` con una `base` donde `.pignolo/project.md` no está commiteado (solo en la copia de trabajo) → exit 1 con el motivo; con `project.md` commiteado sin `gates.on-done` → exit 1.
  - `task --id x --test-ref T` después de `task --id x --base B --file tests/a.test.js --agent pignolo:test-writer` → la tarea conserva `base: B`, gana `testRef: T` y los `files`/`agents` nuevos; el contador de `x` quedó borrado.
  - `task --test-authorization` → `run.task.testAuthorization === true` y `validateRun` vacío.
  - `renew` corre `expires` hacia adelante; `end` borra `run.json` y el contador; `end` repetido → 0.
  - Después de `start`, `git status --porcelain` no muestra `run.json` (el `.gitignore` funciona).
  - `protect-run`: `Write` a `.pignolo/run.json` con `agent_id` → exit 2 con `Alternativa:`; sin `agent_id` → 0; desde una worktree con `file_path` absoluto al `run.json` del principal y `agent_id` → 2.
  - `toggle`: `/pignolo:off` con `cwd` en un subdirectorio → `.gitignore` en `<raíz>/.pignolo/`, no en el subdirectorio; con `cwd` en una worktree → flag y `.gitignore` en el checkout principal.
- [ ] **Paso 2: rojo.** Solo esos archivos; anotar.
- [ ] **Paso 3: implementar** hasta el verde, más `tests/toggle.test.js` y `tests/guard-toggle-paths.test.js` completos.
- [ ] **Paso 4: commit.** `feat(run): ciclo de vida de .pignolo/run.json y protección frente a subagentes`.

### Task 7: ledger de revisión (lógica determinista)

**Files:**
- Create: `plugins/pignolo/lib/ledger.js`, `plugins/pignolo/scripts/ledger.js`
- Test: `tests/ledger.test.js`

**Interfaces:**
- Consume: `PROFILE_PARAMS` de `lib/roles.js`.
- `ledger.js` exporta:
  - `SEVERITIES = ['BLOCKER','CRITICAL','WARNING','SUGGESTION']`, `STATUSES = ['open','confirmed','unreproduced','refuted','suspect','fixed','escalated']`, `LENSES = ['risk','resilience','readability','reliability','testability','judge-a','judge-b']`.
  - `validateFinding(f) → string[]`: `id`, `lens` ∈ `LENSES`, `location` con forma `ruta:línea`, `severity` ∈ `SEVERITIES`, `status` ∈ `STATUSES`, `evidence` no vacía, `repro` (repro-spec) obligatorio para BLOCKER/CRITICAL.
  - `validateLedger(l) → string[]`: `{ v: 1, sha: /^[0-9a-f]{40}$/, level, profile, round: 0|1|2, findings: [] }`; `findings` vacío es válido (§12: "se persiste aunque quede vacío").
  - `reviewPlan({ level, profile }) → { lenses: string[], refuters: number, judgmentDay: boolean }`: `low` → `{ lenses: [], refuters: 0, judgmentDay: false }`; `medium` → `['reliability','testability']`, 0, false; `high` → `PROFILE_PARAMS[profile].lensesHighRisk`, `refutersHighRisk`, `judgmentDay` verdadero solo si el parámetro del perfil incluye `high-risk` (`max`).
  - `applyRepro(finding, { red: boolean }) → finding`: BLOCKER/CRITICAL con rojo → `confirmed`; sin rojo → `severity: 'WARNING'`, `status: 'unreproduced'`. WARNING/SUGGESTION no cambian.
  - `refutation(verdicts: Array<'CONFIRMED'|'REFUTED'|'INCONCLUSIVE'|any>, { profile, level }) → 'stands'|'refuted'`: cantidad esperada = `refutersHighRisk` en `high`, si no 1. Con 3 esperados: `refuted` solo si ≥ 2 son `REFUTED`. Con 1: `refuted` solo si es `REFUTED`. Faltantes, `INCONCLUSIVE` o valores malformados cuentan como "queda en pie".
  - `judgment(a: Finding[], b: Finding[]) → { fix: Finding[], suspect: Finding[], conflicts: Array<[Finding, Finding]> }` según el ruling de coincidencia.
  - `nextStep(ledger, { reopened: Finding[] }) → 'done'|'fix'|'escalate'`: sin confirmados abiertos → `done`; con confirmados y `round < 2` → `fix`; con `round >= 2` y algo abierto → `escalate` (§12: "máx. 2 rondas").
  - `isFrozen(ledger, headSha, { headTree, workingTree }) → boolean` (§12: "cambios posteriores invalidan la revisión"; también un árbol de trabajo sucio, arreglo M6 de la revisión final).
- CLI `scripts/ledger.js`: `validate <archivo>`; `plan --level <l> --profile <p>`; `judgment <a.json> <b.json>`; `refute --profile <p> --level <l> <verdicts.json>`. Salida JSON; exit 0, 1 si `validate` encuentra errores, 2 uso.

- [ ] **Paso 1: tests primero (de tabla):**
  - `reviewPlan`: (`low`, `balanced`) → sin lentes; (`medium`, `economy`) → reliability + testability; (`high`, `max`) → 5 lentes, 3 refuters, `judgmentDay: true`; (`high`, `balanced`) → 5, 1, `false`; (`high`, `economy`) → `['risk','testability']`, 1, `false`.
  - `refutation` con 3 esperados: `[REFUTED, REFUTED, CONFIRMED]` → `refuted`; `[REFUTED, INCONCLUSIVE, INCONCLUSIVE]` → `stands`; `[REFUTED, REFUTED]` (falta uno) → `refuted`; `[REFUTED]` → `stands`; `[REFUTED, 'refuted', null]` → `stands` (malformado no cuenta). Con 1: `[REFUTED]` → `refuted`; `[]` → `stands`.
  - `applyRepro` de un CRITICAL sin rojo → WARNING `unreproduced`.
  - `judgment`: mismo archivo, línea 10 y 12 → `fix`; línea 10 y 20 → dos `suspect`; BLOCKER vs SUGGESTION en la misma línea → `conflicts`.
  - `validateLedger` con `findings: []` → válido; un BLOCKER sin `repro` → error; `sha` corto → error.
  - `nextStep`: round 2 con un confirmado abierto → `escalate`.
  - CLI `validate` sobre un archivo inválido → exit 1 con la lista.
- [ ] **Paso 2: rojo.** Solo este archivo; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(review): lógica del ledger, refuters y Judgment Day`.

### Task 8: `setup` guarda los conflictos de reglas y repara una config inválida

**Files:**
- Modify: `plugins/pignolo/scripts/setup.js` (subcomando `conflicts`), `plugins/pignolo/lib/profiles.js` (`writeConfig` sobre una config inválida en disco), `plugins/pignolo/skills/setup/SKILL.md` (pasos 4 y 7)
- Test: casos en `tests/setup.test.js` y `tests/profiles.test.js`

**Interfaces:**
- `setup.js conflicts --list`: devuelve `{ file, entries }` de `~/.pignolo/rule-conflicts.json` (vacío si no existe).
- `setup.js conflicts --record <archivo.json>`: el archivo lo escribe la skill con Write (nunca por comillas de la shell). Formato: `[{ source: { path, quote }, pignolo: { rule: 1..6, quote }, resolution: 'human'|'pignolo'|'custom', note?: string, project?: string }]`. Valida cada entrada; guarda cada una con `sha256` de ambas citas y `recorded` ISO; una entrada con el mismo par de hashes se reemplaza, no se duplica. Inválido → exit 1 sin escribir.
- `setup.js conflicts --check <archivo.json>`: mismas entradas candidatas; devuelve las que **no** tienen resolución guardada con los mismos hashes (las que hay que preguntar).
- `writeConfig` con `config.json` inválido en disco: copia el archivo a `config.json.pignolo-bak-<stamp>`, y escribe los defaults mezclados con `partial` (hoy lanza sin poder repararlo, pendiente del hito 2).
- `SKILL.md`: el paso 4 arma las entradas, corre `--check` y pregunta solo las nuevas (una por mensaje, dos capas de §4.6); tras la respuesta escribe el archivo y corre `--record`. El paso 7 nombra `~/.pignolo/rule-conflicts.json`.

- [ ] **Paso 1: tests primero.**
  - `--record` de 2 entradas → archivo con 2 y hashes; repetir con una resolución distinta → sigue en 2, con la nueva.
  - `--check` con una cita cambiada en un carácter → la devuelve como pendiente; con las mismas → vacío.
  - Entrada con `rule: 7` o sin `resolution` → exit 1 y el archivo sin cambios (byte a byte).
  - `writeConfig({profile:'max'})` con `config.json` = `{roto` → existe el `.pignolo-bak-*` con `{roto` y la config nueva tiene `max`.
  - Forma de la skill: `SKILL.md` nombra `conflicts --check` y `conflicts --record` (solo forma, sin probar el texto libre).
- [ ] **Paso 2: rojo.** Solo `--test-name-pattern "conflicts|writeConfig"` en esos dos archivos; anotar.
- [ ] **Paso 3: implementar** hasta el verde.
- [ ] **Paso 4: commit.** `feat(setup): guarda la resolución de los conflictos de reglas y repara una config inválida`.

---

## Ola 2

### Unión de la ola 1

- [ ] Unir las Tasks 3 a 8 a `core/hito-3a`. Archivos disjuntos; un conflicto es un error del plan y se registra.
- [ ] `npm run test:quiet` una sola vez: verde completo.
- [ ] `claude plugin validate plugins/pignolo` sin errores (se tocó `hooks.json` y una skill).

### Task 9: test de punta a punta de `gates` (§15)

**Files:**
- Create: `tests/gates.test.js`

Con el código real unido, sin inyecciones, por los scripts y el launcher (un subproceso por paso: son pocos casos y es el único lugar donde se prueba la cadena completa):

- [ ] **Paso 1:** preparar un repo temporal: `project.md` con `type: code-tested`, `gates.on-done: node check.js`, `test-paths: [tests/]`, `protected-test-config: [check.js]`; commit C0; `scripts/run.js start --flow daily`; `git worktree add` de una rama `task/daily/<fecha>-demo` (nombre de §11.1). Se sigue el orden de 3b: `scripts/run.js task --id demo --worktree <wt> --base C0 --file tests/a.test.js --agent pignolo:test-writer`; se escribe `tests/a.test.js` en la worktree y se commitea (C1, `testRef` ≠ `base`); `scripts/run.js task --id demo --test-ref C1 --file src/a.js --agent pignolo:implementer`.
- [ ] **Paso 2: casos.**
  - `test-writer` `DONE` con solo `tests/a.test.js` cambiado (antes de C1) → handback 0.
  - Cambio en `src/a.js` después de C1 → `scripts/gate.js --level on-done --task` exit 0 con estado `PASS` (no `SCOPE`: el test commiteado entre `base` y `testRef` no cuenta) → `runLauncher('handback-gate', SubagentStop DONE de pignolo:implementer, cwd: <wt>)` → 0.
  - Después, otro cambio en `src/a.js` sin volver a sellar → handback 2 (**sello de otro tree-hash**).
  - Cambio en `tests/a.test.js` + gate → gate exit 1 `INTEGRITY` y handback 2 (**test protegido alterado**).
  - `check.js` cambiado (config protegida) → handback 2.
  - Un repo aparte con `project.md` commiteado de `type: code-untested` y `gates.on-done` vacío (`""`) → `run.js task` exit 1 (Review Focus 5); la misma base con `gates.on-done: node check.js` y el comando borrado después en un commit posterior usado como `testRef` también → exit 1. Directo por `lib/gate.js` sobre esa base: `NO_GATE`, y el handback con un sello `NO_GATE` escrito → 2 (**compuerta vacía no da verde**). Para este último caso el `run.json` con la `task` se escribe **a mano** en el test (con `validateRun` vacío), porque `run.js task` rechaza justamente esa base.
  - `scripts/run.js end` → handback 0 (sin flujo no hay compuerta).
- [ ] **Paso 3:** como es un test agregado después del código, **se demuestra el rojo rompiendo lo que protege**, una vez por caso: comentar la comparación de `treeHash` en el handler, la integridad en el handler, el uso de `testRef` en el alcance de `lib/gate.js` y el estado `NO_GATE` en `lib/gate.js`; ver cada caso en rojo; restaurar con `git restore --source=HEAD -- <archivo>` desde la conversación principal (no desde un agente) o, mejor, en una copia descartable de la worktree. Anotar las cuatro salidas.
- [ ] **Paso 4: commit.** `test(gates): compuertas, sellos y handback-gate de punta a punta (§15 gates)`.

### Task 10: cierre de la parte 3a

- [ ] **Spec** (sin cambiar contratos; lo que sí sería contrato va a "Decisiones que necesita el autor"):
  - §8.2: `tree-hash` = árbol de trabajo; integridad contra el árbol; `TREE_CHANGED`; `project.md` leído desde la referencia y siempre protegido.
  - §8.3: el handback-gate con su contador propio de 8 (incrementado antes del trabajo git), `stop_hook_active` registrado sin decidir, `SubagentStop` que pasa tras un `SubagentHandback` aceptado del mismo `agent_id`, `run.json` ilegible o vencido con tarea que no deja pasar a los escritores, el `PostToolUse` sobre `Agent` que avisa al hilo principal, y la regla del `test-writer` (sin sello, solo `test-paths`).
  - §6: la marca `run.json` y los flags del interruptor se resuelven en el checkout principal (también desde un worktree); esquema v1; subagentes no la escriben; `run.js task` exige `project.md` commiteado con `gates.on-done`.
  - §4.4: los nombres en inglés de las 8 categorías reservadas.
  - §4.2: mapeo tripwire → categoría, piso de nivel y de carril.
  - §14: `setup` guarda los conflictos en `~/.pignolo/rule-conflicts.json`.
- [ ] **Versión y docs:** `plugin.json` a `0.3.0`; entrada en el `CHANGELOG` con el motivo; README: una línea sobre `scripts/risk.js`, `scripts/gate.js` y `scripts/run.js` (qué hacen y que los usan las skills de 3b).
- [ ] **Checklist manual** `tests/manual/hito-3a.md` (sesión real, Windows nativo):
  1. `SubagentStop` real: despachar `pignolo:implementer` con un `run.json` y una `task` registrados a mano, sin sello: el subagente recibe el motivo y sigue; anotar el `agent_type` y el `cwd` que llegan.
  2. El mismo caso **en auto mode**: el reporte llega por `SubagentHandback` (requiere v2.1.271, doc tools-reference) y el hook lo frena; anotar si después dispara `SubagentStop` y con qué `last_assistant_message`.
  3. **Hipótesis a verificar:** el tope nativo de 8 continuaciones rige en `SubagentStop` (la doc lo afirma para `Stop`); anotar cuántas veces sigue el subagente con el hook bloqueando siempre, y si `stop_hook_active` llega `true` desde el segundo intento.
  4. `Explore` despachado desde una sesión cuyo `cwd` es una worktree con flujo en curso en el principal: se niega. `/pignolo:off` desde esa worktree: pasa.
  5. **Hipótesis a verificar:** `PostToolUse` sobre `Agent` corre al terminar un despacho en primer plano y el hilo principal recibe el `additionalContext` tras un tope; con un despacho en segundo plano, anotar si corre al lanzar (y entonces no avisa) o al terminar.
  6. Tiempo del handback-gate en el repo real más grande del autor (sin copiar datos del proyecto al repo de pignolo; solo la cifra).
- [ ] **Suite y revisión final:** `npm run test:quiet` completo; **una revisión final opus** de `main..core/hito-3a` con el Review Focus de arriba; una pasada de arreglos; una confirmación acotada.
- [ ] **Estado:** actualizar `docs/STATE.md` (qué quedó, decisiones del autor pendientes, siguiente: plan 3b).
- [ ] **Unión y push:** unir a `main` y hacer push **solo con el OK del autor**.

## Decisiones que necesita el autor (parte 3a)

**D1. Unión y push de 3a a `main`** (irreversible, §4.1.5). Opciones: unir y pushear al terminar la revisión final; unir en local sin push; dejar la rama. **Recomendación:** unir en local tras la revisión final; el push lo hace el orquestador solo con el OK del autor (junto con el hito 2, que también espera el push). Estado al escribir 3b: unida a `main` en local (`edb7d41`); el push sigue esperando el OK del autor.

---

# Hito 3 del núcleo, parte 3b: carriles `trivial` y `daily`, revisión, Judgment Day y evals. Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo con worktrees a mano, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`). Parte de `main` con la parte 3a unida (`edb7d41`, plugin 0.3.0).

**Objetivo:** que un pedido en un proyecto con pignolo activo recorra un carril real: la skill `entry` decide si hay autorización y el carril con `scripts/risk.js`; `trivial` cambia, sella y commitea; `daily` registra la tarea, despacha `test-writer` e `implementer` con el handback-gate de 3a, demuestra el rojo, revisa según el riesgo y mergea con confirmación; `review` y `judgment` llevan el ledger de §12 hasta `APPROVED | ESCALATED`. Las evals `agents` de §15 para lentes, refuter, jueces y fixer quedan escritas, baratas y con veredicto sobre lo que hizo el subagente; **correrlas espera la decisión de costo del autor**.

**Arquitectura:** poca lógica nueva y toda determinista: verbos nuevos de `scripts/ledger.js` (`build`, `repro`, `refute --ledger`, `round`, `next`, `frozen`, `save`), dos endurecimientos de `scripts/run.js task` (rutas `--file` normalizadas y archivos validados por rol), `.pignolo/.gitignore` que se ignora a sí mismo y cubre `tmp/` y `worktrees/`, y `scripts/setup.js models`. Los revisores entregan un bloque `json` que `ledger.js build` copia tal cual. Encima, texto: cinco skills (`entry`, `trivial`, `daily`, `review`, `judgment`) y tres plantillas (`question`, `task-card`, `review-summary`). Las evals salen de una sola tabla (`tests/evals/review-cases.js`) que genera los casos de `claude plugin eval`.

**Stack:** el de 3a (Node ≥ 20 sin dependencias npm, `node:test`, git ≥ 2.31) y `claude plugin eval` para las evals.

**Spec:** §1 (principios 1, 2 y 5), §2 (skills y plantillas), §3.2, §4.1–§4.4, §4.6 (dos capas), §5.1–§5.2 (entrada y carriles), §6 y §6.1 (agentes, marca `run.json`, cierre de turno, continuación máx. 2), §7 (modelo explícito por despacho), §8.2–§8.3, §9.1–§9.3, §11.1–§11.2 (nombres y mecanismo B), §12 (revisión, ledger, refuter, fixer, Judgment Day), §15 (`agents`: lentes, refuter, jueces, fixer), §18 hito 3.

## Qué se verificó al escribir este plan

Todo el código determinista de este plan (Tasks 11, 12, 13, 17 y 18, y las pruebas de forma de las Tasks 14 a 16) se ejecutó en una copia del repo (`git clone` de `main` en el scratchpad, nunca en `D:\pignolo`): cada test nuevo se vio **en rojo contra el código de `main`** y en verde con el código de su tarjeta; la suite completa de la copia quedó en **1180 tests, 1178 pasan y 2 saltados** (hoy en `main`: 1109, 1107 y 2 saltados; esta parte suma 71). `claude plugin validate plugins/pignolo` pasó con las skills nuevas. Las skills (texto) se validaron solo por forma: su comportamiento con agentes lo miden el checklist manual y, para los revisores, las evals.

Tres hallazgos de esa ejecución que cambiaron el diseño:

1. **Ningún cambio podía ser trivial.** `run.js start` crea `.pignolo/.gitignore` sin commitear; `risk.js --diff HEAD` lo cuenta como un segundo archivo y el piso sube a `medium`/`daily` siempre. Arreglo: el `.gitignore` de `.pignolo` se ignora a sí mismo (Task 12; `tests/flow-lanes.test.js` lo protege y se vio rojo sin la línea).
2. **Un `node --test` hijo lanzado desde la suite sale 0 aunque falle**, porque hereda `NODE_TEST_CONTEXT` y le reporta al runner padre. Todo test que lance una compuerta o un rojo con `node --test` borra esa variable del entorno del hijo (Task 18).
3. **`claude plugin eval` sí ve a los subagentes** (lectura del runner de Claude Code 2.1.285, no de su documentación): el grader `regex` con `target: trace` recorre los eventos stream-json uno por línea, y la lista de herramientas se arma sin filtrar por `parent_tool_use_id`. Por eso los graders de 3b exigen un evento `assistant` con `parent_tool_use_id` no nulo: la salida de la sesión principal no los aprueba. *Hipótesis — verificar en la sonda de la calibración (Task 19):* que el stream de una corrida no interactiva incluye los eventos del subagente.

## Global Constraints

Las de 3a (arriba) siguen todas. Además:

- **Solo el hilo principal opera `scripts/run.js`** (la regla `pignolo-run` de la guardia frena a los subagentes). Las skills registran la tarea **antes de cada despacho de un escritor** (`run.js task`), renuevan el flujo antes de cada despacho (`run.js renew`) y corren **`run.js status` después de cada escritor**: el escritor queda aceptado solo si `handback.accepted` es verdadero; si no, la tarea es `BLOCKED` aunque el informe diga `DONE`.
- **`--file` siempre relativo a la raíz de la worktree y con `/`.** El script normaliza `\` y `./`, rechaza rutas absolutas y `..`, y rechaza al registrar lo que el gate o el handback-gate rechazarían después (test-writer fuera de `test-paths`; implementer o fixer sobre tests sin `--test-authorization`).
- **Continuación automática como máximo 2 veces por escritor** (§6.1): antes de cada re-despacho se vuelve a correr el mismo `run.js task` (reinicia el contador del handback-gate).
- **Todo texto al humano en dos capas** (§4.6): "en pocas palabras" (1 a 3 líneas, sin jerga, rutas ni conteos) y abajo el detalle técnico; un paso por mensaje, a lo sumo una pregunta, siempre con una categoría de la lista cerrada de §4.4. La forma vive en `templates/question.md` y `templates/review-summary.md`; toda cifra sale de la salida JSON de un script.
- **El orquestador no califica hallazgos** (§12): copia el bloque `json` de cada revisor tal cual a un archivo y decide `ledger.js`.
- **Temporales de las skills en `<main>/.pignolo/tmp/`** (ignorado) y escritos con Write; mensajes de commit y de merge con `git commit -F` / `git merge -F`. Staging por ruta, nunca `git add -A` ni `git add .`.
- **Modelo explícito en cada despacho** (§7): `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" models` una vez por flujo.
- Texto interno de skills, agentes y plantillas en inglés; plan, commits y docs en español. Fixtures y evals con datos sintéticos.

## Método de ejecución y economía de tests

Aprobado por el autor y repetido de 3a:

- **Rama de integración** `core/hito-3b` desde `main`. **Olas** con archivos disjuntos dentro de cada ola: ola 0 (Tasks 11, 12 y 13, contratos) → unión, `npm run test:quiet` una vez, tag `contract/hito-3b/v1` → ola 1 (Tasks 14 a 18) → unión, suite una vez → ola 2 (Task 19, cierre).
- **Worktrees a mano**, no `isolation: worktree` (motivo en 3a): `git worktree add -b task/hito-3b/<NN>-<slug> <scratchpad>/wt-<NN> <core/hito-3b | contract/hito-3b/v1>`. El implementador trabaja con rutas absolutas dentro de su worktree y corre cada comando como `cd <ruta> && <comando>`. Primer paso de cada tarea de la ola 1: `git merge-base --is-ancestor contract/hito-3b/v1 HEAD`; si falla, `BLOCKED`.
- **Modelos:** sonnet en las Tasks 11, 12, 13, 14 y 18 (tarjetas con código completo); **opus en las Tasks 15 (`daily`), 16 (`review` y `judgment`) y 17 (evals)**, que son orquestación y graders donde un error no se ve en un test de forma. Revisión final en opus.
- **Sin revisión por tarea.** Una revisión final opus de `main..core/hito-3b` con el Review Focus de abajo, una pasada de arreglos y una confirmación acotada; lo que quede se clasifica (tope del hito 1).
- **Tests:** los de 3a (tests primero, de tabla, rojo una vez; solo los propios con `node --test --test-reporter=dot <archivos>`). Los tests de forma de las skills miran estructura (frontmatter, orden de pasos, que cada script, verbo y plantilla nombrados existan), nunca redacción.
- **Sin evals en la ejecución de las tareas.** La Task 17 escribe las evals y un test determinista de sus graders (costo 0); correrlas es la Decisión pendiente del autor.

## Review Focus

1. **La skill le cree al informe y no al hook.** Si `daily` o `review` toman el `DONE` del texto del escritor sin `run.js status`, el handback-gate de 3a queda decorativo en el camino real (un despacho en segundo plano ni siquiera dispara el aviso de `PostToolUse`). Dueñas: **Tasks 15 y 16** (texto) y la revisión final (leer cada paso "Accept").
2. **El orquestador reescribe o descarta hallazgos.** Resumir el informe de una lente en vez de copiar su bloque rompe §12 ("no califica ni descarta"). `ledger.js build` copia y valida; los refutados siempre van al resumen. Dueñas: **Tasks 11, 13 y 16**.
3. **Candidato no congelado.** Un commit de repro, un fix o un archivo sin commitear cambian el SHA revisado; `ledger.js frozen` antes de despachar y antes de aceptar, y `round` con el SHA nuevo. Dueñas: **Tasks 11 y 16**.
4. **Evals que miden la sesión principal** (defecto de las del hito 2). Cada grader de contenido exige un evento del subagente; `tests/eval-cases.test.js` prueba que la misma salida buena desde la sesión principal **no** aprueba. Dueña: **Task 17**.
5. **Flujo que queda abierto.** Un `daily` abandonado deja `run.json` y la allowlist de `Agent` activa hasta 2 h. Las skills cierran con `run.js end` al terminar, al escalar sin continuar y al abandonar. Dueñas: **Tasks 14 y 15**.

## Rulings del plan (técnicos, registrados)

- **Las skills de flujo (`entry`, `trivial`, `daily`, `review`, `judgment`) son invocables por el modelo** (sin `disable-model-invocation`). §2 pide ese flag "a los que tienen efectos", pero `entry` tiene que poder despachar a `trivial`/`daily`, y `review` a `judgment`, y un skill con el flag no lo puede invocar el modelo. Se lee "efectos" como cambios en la configuración de pignolo (`setup`, `on`, `off`, `init`): esas siguen solo para el humano. Lo irreversible de los flujos (merge a `main`, push, borrados) sigue detrás de la guardia, los permisos `ask` y la pregunta `irreversible`. Costo si está mal: pignolo arranca solo ante un pedido; se nota en el checklist manual (punto 1).
- **`entry` se dispara por su `description`** ("Use first for any request in a project where pignolo is active"). No hay hook que la fuerce: sería el primer hook que inyecta texto en cada pedido, contra "callados en el éxito" (§8.3). Riesgo residual: Claude puede no invocarla; se mide en el checklist.
- **Worktree de `daily` en `<main>/.pignolo/worktrees/<slug>`** (mecanismo B de §11.2, sin `WorktreeCreate`, que es del hito 7), y temporales en `<main>/.pignolo/tmp/`. `run.js start` agrega `.gitignore`, `run.json`, `.disabled`, `tmp/` y `worktrees/` a `.pignolo/.gitignore`: git no ve nada de eso y `.pignolo/.gitignore` sin commitear no infla el diff (hallazgo 1). `.claude/worktrees/` se descartó: aparece sin seguimiento en `git status` del checkout principal. Costo si está mal: `/pignolo:init` (hito 8) tendrá que commitear `.pignolo/.gitignore` con `git add -f`.
- **`trivial` trabaja en el checkout principal, sobre la rama actual**, sin tarea registrada (`gate.js` sin `--task`: no hay alcance ni integridad por tarjeta, solo la compuerta). Si el riesgo del diff real sube, la skill **deshace su propio cambio con Edit** (nunca `git restore`/`checkout -- <archivo>`/`stash`, que la guardia niega), cierra el flujo y pregunta si pasarlo a `daily`. Nunca commitea en ese caso.
- **`run.js task` normaliza y valida `--file`** (`\` → `/`, sin `./`; absoluta o con `..` → exit 2) y valida los archivos por rol al registrar (exit 1 con `Alternativa:`). El pendiente de la confirmación de 3a ("`--file` no normaliza") se cierra así en vez de confiar solo en el texto de la skill.
- **Salida de los revisores en un bloque `json`** con las claves del ledger en orden (`id, lens, location, severity, evidence, repro`; el refuter, `claim, verdict, reason`). `ledger.js build` pone `id` = `<lente>-<id>` (evita choques) y `status: open`, y valida; con `--judgment` arma el ledger de Judgment Day (`fix` → `open`, `suspect` → `suspect`, conflictos → `open` con `conflict`). El orden fijo de claves es además lo que hace posible un grader de eval sin parsear JSON.
- **El refuter va antes que la reproducción.** Es más barato que escribir un test por hallazgo, y un hallazgo con rojo reproducido ya es evidencia que no se refuta. Reclamos para el refuter: los `open` BLOCKER, CRITICAL y WARNING. Veredicto por hallazgo con `refutation()` de 3a (`max` en riesgo alto: cae con ≥ 2 `REFUTED` de 3; faltantes y malformados quedan en pie).
- **Riesgo bajo = lectura estructural del orquestador** (§12), sin lente en el ledger (`LENSES` no tiene una "estructural"). Si ve un defecto real, **sube el nivel a `medium`** y corre las lentes; si no, el ledger se guarda vacío.
- **Al fixer solo van BLOCKER/CRITICAL confirmados con rojo** (`nextStep` de 3a). Los WARNING, los no reproducidos y los sospechosos quedan en el ledger y en el resumen. Un hallazgo dentro de un test pide `test-authorization` antes de tocarlo (§9.3).
- **Re-revisión "ledger + delta"** (§12): solo las lentes que dieron confirmados, con los hallazgos previos y el diff `<SHA>..<SHA2>`; `ledger.js round` sube `round`, marca `fixed` los confirmados cuyo test pasó a verde y suma lo nuevo con prefijo `r<n>-`. Tercera ronda → el script la niega (exit 1) y se escala.
- **`judge-conflict`: primero la evidencia.** Un conflicto entre jueces pasa por la reproducción como cualquier BLOCKER/CRITICAL: con rojo queda confirmado; sin rojo baja a WARNING. Se pregunta al humano solo si no se puede escribir la reproducción. Principio 1 (verificar, no creer) antes que pedirle al humano que arbitre.
- **Ledger persistido por script en `~/.pignolo/reviews/<repo-id>/<sha>-<review|judgment>.json`** (`ledger.js save`). La skill no puede escribir ahí con Write (`protect-paths` protege `~/.pignolo/**`), y `.pignolo/state/` es del hito 6. Se guarda siempre, también vacío.
- **La plantilla `review-ledger` de §2 es `templates/review-summary.md`**: el ledger es JSON (ruling de 3a) y lo escribe `ledger.js`; lo que necesita plantilla es su resumen al humano en dos capas. `templates/question.md` fija el formato de §4.4 para todas las skills.
- **Decisiones autónomas (§4.3, `.pignolo/state/decisions/`) quedan para el hito 6**, que trae el estado. En 3b, lo que el humano autorizó va a la task-card y al cuerpo del commit, y el resumen de cierre lo repite.
- **Merge de `daily` siempre con pregunta `irreversible`**, también a una rama de origen que no es `main`: la "confirmación en lote" de §4.4 es, con una sola tarea, un lote de uno. Después, `git worktree remove` sin `--force`; la rama queda (la limpieza es del hito 7).
- **`laneFloor: plan` con el modo `plan` todavía sin construir** (hito 5): pregunta `scope` con dos opciones (seguir en `daily` con revisión de riesgo alto, o frenar).
- **`ledger.js plan` sin `--profile` lee el perfil del usuario**, y `setup.js models` da el modelo de cada rol: las skills no leen `~/.pignolo/config.json` a mano.
- **Evals** (§15 `agents`; decisiones técnicas, el costo es del autor):
  - 14 casos: 4 lentes (`risk`, `resilience`, `readability`, `reliability`) × {defecto plantado, diff limpio}, `judge-a` y `judge-b` × {defecto, limpio}, `refuter` con un hallazgo falso y uno cierto, y `fixer` con un hallazgo confirmado. `review-testability` es del hito 4.
  - **Recall:** el subagente reporta la ubicación plantada (±3 líneas, el mismo criterio que `judgment`) con severidad BLOCKER o CRITICAL (en `readability`, WARNING o más). **Falso positivo:** BLOCKER o CRITICAL en un diff limpio. Umbral de §0 d: ≥ 4 de 5 corridas por caso.
  - La sesión principal corre en **sonnet** (solo despacha y contesta `RELAYED`; no se evalúa) y pasa `model` explícito al revisor, como hace pignolo en uso real. La comparación de revisores en sonnet `high` (§7, §15) es la misma tabla con `--reviewer-model sonnet`.
  - Los fixtures y los diffs salen de una sola tabla (`tests/evals/review-cases.js`) que genera `tests/evals/generated/<modelo>/` (no se versiona). El fixer tiene Bash: su caso lleva la etiqueta `wsl2` y corre solo desde WSL2 (§15).
  - Un test determinista (`tests/eval-cases.test.js`) corre cada grader contra traces sintéticos: aprueba la salida buena del subagente, reprueba la mala y reprueba la buena **si viene de la sesión principal**.
- **Plan en tarjetas con código verificado**: los bloques de las Tasks 11 a 18 son los que corrieron en la copia; siguen siendo hipótesis para el implementador, que los vuelve a correr (rojo y verde) en su worktree.

---

## Ola 0 (contratos; Tasks 11, 12 y 13 en paralelo, archivos disjuntos)

Parten de `core/hito-3b` (= `main`). Al terminar las tres: unir a `core/hito-3b`, `npm run test:quiet` una vez, tag `contract/hito-3b/v1`.

### Task 11: verbos del ledger para las skills de revisión (sonnet)

**Files:**
- Modify: `plugins/pignolo/lib/ledger.js` (agrega `buildLedger` y `nextRound`), `plugins/pignolo/scripts/ledger.js` (reescrito, compatible con los verbos de 3a)
- Test: `tests/ledger-cli.test.js` (nuevo; `tests/ledger.test.js` de 3a sigue igual y en verde)

**Interfaces:**
- Consume: `validateLedger`, `applyRepro`, `refutation`, `judgment`, `nextStep`, `isFrozen` (`lib/ledger.js`, 3a); `readConfig` (`lib/profiles.js`); `headSha`, `workingTree` (`lib/changes.js`); `gitRun` (`lib/git.js`); `repoIdFor` (`lib/seals.js`); `pignoloHome` (`lib/home.js`).
- Produce (`lib/ledger.js`):
  - `buildLedger({ sha, level, profile, round = 0, reports = [], judgment = null }) → Ledger`: cada hallazgo con `id` = `<lens>-<id>` y `status: 'open'`; con `judgment` (salida de `judgment()`), `fix` → `open`, `suspect` → `suspect`, cada par de `conflicts` → los dos `open` con `conflict` = id del otro. Id repetido → lanza.
  - `nextRound(ledger, { sha, fixed = [], reports = [] }) → Ledger`: `sha` nuevo, `round + 1`, los `confirmed` de `fixed` → `fixed`, los nuevos con id `r<round+1>-<lens>-<id>`. Con `round >= 2` lanza.
- Produce (`scripts/ledger.js`; JSON por stdout; exit 0; 1 si el ledger no valida, si el candidato no está congelado o si ya hubo 2 rondas; 2 uso):
  - `plan --level <l> [--profile <p>]` (sin `--profile`, el de la config; antes era obligatorio).
  - `build --sha <sha> --level <l> [--profile <p>] [--round <n>] --out <archivo> [--judgment <j.json>] [<informe.json>...]` → `{ ok, file, findings }`; inválido → exit 1 sin escribir.
  - `refute --ledger <archivo> <verdicts.json>` con `{ "<id>": [veredictos] }` → marca `refuted` y devuelve `{ results }`. La forma de 3a (`--profile --level` y una lista) sigue.
  - `repro --ledger <archivo> --id <id> --red | --no-red` → `{ finding }`; id inexistente → 1; sin `--red`/`--no-red` → 2.
  - `round --ledger <archivo> --sha <sha> [--fixed <id>]... [<informe.json>...]` → `{ ok, round }`.
  - `next --ledger <archivo>` → `{ next: 'done'|'fix'|'escalate' }`.
  - `frozen --cwd <dir> --sha <sha>` → `{ frozen, head, reason }`; exit 0 si congelado, 1 si no.
  - `save --ledger <archivo> --cwd <dir> [--kind review|judgment]` → `{ ok, file }` con `file` = `<pignoloHome>/reviews/<repoId>/<sha>-<kind>.json`.
  - Los verbos con `--ledger` reescriben ese archivo en forma atómica. `validate` y `judgment` no cambian.

- [ ] **Paso 1: tests primero** (`tests/ledger-cli.test.js`, completo):

  ````js
  'use strict';
  // Verbos de ledger.js que usan las skills review y judgment (hito 3b).
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');

  const CLI = path.join(PLUGIN_ROOT, 'scripts', 'ledger.js');
  const cli = (args, opts = {}) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
    return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
  };
  const SHA = 'a'.repeat(40);
  const SHA2 = 'b'.repeat(40);
  const finding = (id, lens, location, severity, extra = {}) => ({
    id, lens, location, severity, evidence: 'observado', ...(severity === 'BLOCKER' || severity === 'CRITICAL' ? { repro: 'x' } : {}), ...extra,
  });
  const writeJson = (dir, name, obj) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, JSON.stringify(obj));
    return f;
  };
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

  function built(dir, reports, extra = []) {
    const files = reports.map((r, i) => writeJson(dir, `r${i}.json`, r));
    const out = path.join(dir, 'ledger.json');
    const r = cli(['build', '--sha', SHA, '--level', 'high', '--profile', 'max', '--out', out, ...extra, ...files]);
    assert.strictEqual(r.status, 0, r.stderr);
    return out;
  }

  test('build: prefija el id con la lente, deja todo open y valida', () => {
    const dir = makeTempDir();
    const out = built(dir, [[finding('1', 'reliability', 'src/a.js:3', 'CRITICAL')], [finding('1', 'risk', 'src/b.js:9', 'WARNING')]]);
    const l = read(out);
    assert.deepStrictEqual(l.findings.map((f) => [f.id, f.status]), [['reliability-1', 'open'], ['risk-1', 'open']]);
    assert.strictEqual(l.round, 0);
    assert.strictEqual(cli(['validate', out]).status, 0);
  });

  test('build: un informe vacío da un ledger válido sin hallazgos (§12: se persiste vacío)', () => {
    const dir = makeTempDir();
    const l = read(built(dir, [[]]));
    assert.deepStrictEqual(l.findings, []);
  });

  test('build: un hallazgo inválido (CRITICAL sin repro) → exit 1 y no escribe', () => {
    const dir = makeTempDir();
    const bad = writeJson(dir, 'bad.json', [{ id: '1', lens: 'risk', location: 'a.js:1', severity: 'CRITICAL', evidence: 'e' }]);
    const out = path.join(dir, 'ledger.json');
    const r = cli(['build', '--sha', SHA, '--level', 'high', '--profile', 'max', '--out', out, bad]);
    assert.strictEqual(r.status, 1);
    assert.ok(!fs.existsSync(out));
  });

  test('build --judgment: fix open, suspect suspect, conflictos open con el id del otro', () => {
    const dir = makeTempDir();
    const a = [finding('1', 'judge-a', 'src/a.js:10', 'BLOCKER'), finding('2', 'judge-a', 'src/c.js:1', 'WARNING'), finding('3', 'judge-a', 'src/d.js:5', 'BLOCKER')];
    const b = [finding('1', 'judge-b', 'src/a.js:12', 'CRITICAL'), finding('2', 'judge-b', 'src/d.js:5', 'SUGGESTION')];
    const j = cli(['judgment', writeJson(dir, 'a.json', a), writeJson(dir, 'b.json', b)]).out;
    const out = built(dir, [], ['--judgment', writeJson(dir, 'j.json', j)]);
    const byId = Object.fromEntries(read(out).findings.map((f) => [f.id, f]));
    assert.strictEqual(byId['judge-a-1'].status, 'open');
    assert.strictEqual(byId['judge-a-2'].status, 'suspect');
    assert.strictEqual(byId['judge-a-3'].conflict, 'judge-b-2');
    assert.strictEqual(byId['judge-b-2'].conflict, 'judge-a-3');
  });

  test('repro: CRITICAL con rojo → confirmed; sin rojo → WARNING unreproduced', () => {
    const dir = makeTempDir();
    const out = built(dir, [[finding('1', 'reliability', 'src/a.js:3', 'CRITICAL'), finding('2', 'risk', 'src/b.js:3', 'BLOCKER')]]);
    assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'reliability-1', '--red']).status, 0);
    assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'risk-2', '--no-red']).status, 0);
    const [f1, f2] = read(out).findings;
    assert.deepStrictEqual([f1.status, f1.severity], ['confirmed', 'CRITICAL']);
    assert.deepStrictEqual([f2.status, f2.severity], ['unreproduced', 'WARNING']);
    assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'nope', '--red']).status, 1);
    assert.strictEqual(cli(['repro', '--ledger', out, '--id', 'risk-2']).status, 2);
  });

  test('refute --ledger: con max hacen falta 2 REFUTED de 3; INCONCLUSIVE y faltantes quedan en pie', () => {
    const dir = makeTempDir();
    const out = built(dir, [[finding('1', 'risk', 'a.js:1', 'CRITICAL'), finding('2', 'risk', 'b.js:1', 'CRITICAL'), finding('3', 'risk', 'c.js:1', 'WARNING')]]);
    const v = writeJson(dir, 'v.json', { 'risk-1': ['REFUTED', 'REFUTED', 'CONFIRMED'], 'risk-2': ['REFUTED', 'INCONCLUSIVE'] });
    const r = cli(['refute', '--ledger', out, v]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(r.out.results, { 'risk-1': 'refuted', 'risk-2': 'stands' });
    assert.deepStrictEqual(read(out).findings.map((f) => f.status), ['refuted', 'open', 'open']);
  });

  test('round: sha nuevo, round + 1, los fixed pasan a fixed, suma lo nuevo; tope en 2', () => {
    const dir = makeTempDir();
    const out = built(dir, [[finding('1', 'reliability', 'a.js:1', 'CRITICAL')]]);
    cli(['repro', '--ledger', out, '--id', 'reliability-1', '--red']);
    assert.strictEqual(cli(['next', '--ledger', out]).out.next, 'fix');
    const fresh = writeJson(dir, 'n.json', [finding('1', 'reliability', 'a.js:7', 'WARNING')]);
    let r = cli(['round', '--ledger', out, '--sha', SHA2, '--fixed', 'reliability-1', fresh]);
    assert.strictEqual(r.status, 0, r.stderr);
    const l = read(out);
    assert.strictEqual(l.sha, SHA2);
    assert.strictEqual(l.round, 1);
    assert.deepStrictEqual(l.findings.map((f) => [f.id, f.status]), [['reliability-1', 'fixed'], ['r1-reliability-1', 'open']]);
    assert.strictEqual(cli(['next', '--ledger', out]).out.next, 'done');
    r = cli(['round', '--ledger', out, '--sha', SHA]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(cli(['round', '--ledger', out, '--sha', SHA2]).status, 1);
  });

  test('next: round 2 con un confirmado abierto → escalate', () => {
    const dir = makeTempDir();
    const l = { v: 1, sha: SHA, level: 'high', profile: 'max', round: 2, findings: [{ ...finding('x', 'risk', 'a.js:1', 'CRITICAL'), status: 'confirmed' }] };
    assert.strictEqual(cli(['next', '--ledger', writeJson(dir, 'l.json', l)]).out.next, 'escalate');
  });

  test('frozen: HEAD limpio → 0; otro sha o cambio sin commitear → 1 con el motivo', () => {
    const repo = makeRepo();
    const head = git(['rev-parse', 'HEAD'], repo);
    assert.strictEqual(cli(['frozen', '--cwd', repo, '--sha', head]).status, 0);
    const other = cli(['frozen', '--cwd', repo, '--sha', SHA]);
    assert.strictEqual(other.status, 1);
    assert.match(other.out.reason, /HEAD es/);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'cambio\n');
    const dirty = cli(['frozen', '--cwd', repo, '--sha', head]);
    assert.strictEqual(dirty.status, 1);
    assert.match(dirty.out.reason, /sin commitear/);
  });

  test('save: guarda el ledger en ~/.pignolo/reviews/<repo-id>/<sha>-<kind>.json; inválido → 1', () => {
    const repo = makeRepo();
    const dir = makeTempDir();
    const out = built(dir, [[]]);
    const r = cli(['save', '--ledger', out, '--cwd', repo]);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(r.out.file.startsWith(path.join(process.env.PIGNOLO_HOME, 'reviews')));
    assert.ok(r.out.file.endsWith(`${SHA}-review.json`));
    const j = cli(['save', '--ledger', out, '--cwd', repo, '--kind', 'judgment']);
    assert.ok(j.out.file.endsWith(`${SHA}-judgment.json`));
    assert.strictEqual(cli(['save', '--ledger', out, '--cwd', repo, '--kind', 'x']).status, 2);
    assert.deepStrictEqual(read(r.out.file), read(out));
    const bad = writeJson(dir, 'bad.json', { v: 1 });
    assert.strictEqual(cli(['save', '--ledger', bad, '--cwd', repo]).status, 1);
  });

  test('plan sin --profile usa el perfil de la config del usuario (balanced por defecto)', () => {
    const r = cli(['plan', '--level', 'high']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(r.out, { lenses: ['risk', 'resilience', 'readability', 'reliability', 'testability'], refuters: 1, judgmentDay: false });
  });
  ````

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot tests/ledger-cli.test.js`. Esperado (medido en la copia): fallan los 11 (verbos inexistentes; `plan` sin `--profile` sale 2). Anotar el resumen.
- [ ] **Paso 3: implementar.** En `lib/ledger.js`, antes de `module.exports`, y sumar `buildLedger, nextRound` a los exports:

  ````js
  // Ledger de una ronda a partir de los informes de las lentes, sin reescribir los
  // hallazgos: el id pasa a <lente>-<id> (evita choques entre lentes) y el estado a 'open'.
  // Con `judgment` (salida de judgment()), `fix` entra 'open', `suspect` entra
  // 'suspect' y cada par de `conflicts` entra 'open' con `conflict` = id del otro.
  function buildLedger({ sha, level, profile, round = 0, reports = [], judgment: j = null }) {
    const findings = [];
    const add = (f, status, extra = {}) => {
      if (!isObj(f)) throw new Error('un hallazgo no es un objeto');
      findings.push({ ...f, id: `${f.lens}-${f.id}`, status, ...extra });
    };
    for (const r of reports) {
      if (!Array.isArray(r)) throw new Error('cada informe debe ser una lista de hallazgos');
      r.forEach((f) => add(f, 'open'));
    }
    if (j) {
      (j.fix || []).forEach((f) => add(f, 'open'));
      (j.suspect || []).forEach((f) => add(f, 'suspect'));
      (j.conflicts || []).forEach(([a, b]) => {
        add(a, 'open', { conflict: `${b.lens}-${b.id}` });
        add(b, 'open', { conflict: `${a.lens}-${a.id}` });
      });
    }
    const seen = new Set();
    for (const f of findings) {
      if (seen.has(f.id)) throw new Error(`id repetido: ${f.id}`);
      seen.add(f.id);
    }
    return { v: 1, sha, level, profile, round, findings };
  }

  // Ronda siguiente tras el fixer (§12: re-revisión sobre ledger + delta): sha nuevo,
  // round + 1, los confirmados de `fixed` pasan a 'fixed' y se suman los hallazgos nuevos.
  function nextRound(ledger, { sha, fixed = [], reports = [] }) {
    if (ledger.round >= 2) throw new Error('máximo 2 rondas de fix (§12): lo abierto se escala');
    const fresh = buildLedger({ sha, level: ledger.level, profile: ledger.profile, reports }).findings
      .map((f) => ({ ...f, id: `r${ledger.round + 1}-${f.id}` }));
    const old = ledger.findings.map((f) => (fixed.includes(f.id) && f.status === 'confirmed' ? { ...f, status: 'fixed' } : f));
    return { ...ledger, sha, round: ledger.round + 1, findings: [...old, ...fresh] };
  }
  ````

  `scripts/ledger.js` completo:

  ````js
  'use strict';
  // CLI del ledger de revisión (spec §12). Salida JSON; exit 0; 1 si el ledger no valida o
  // el candidato no está congelado; 2 por uso incorrecto.
  // Uso:
  //   validate <archivo> | plan --level <l> [--profile <p>] | judgment <a.json> <b.json>
  //   refute --profile <p> --level <l> <verdicts.json>          (una lista de veredictos)
  //   refute --ledger <archivo> <verdicts.json>                 ({ "<id>": [veredictos] })
  //   build --sha <sha> --level <l> [--profile <p>] --out <archivo> [--judgment <j.json>] [<informe.json>...]
  //   repro --ledger <archivo> --id <id> --red | --no-red
  //   round --ledger <archivo> --sha <sha> [--fixed <id>]... [<informe.json>...]
  //   next --ledger <archivo>
  //   frozen --cwd <dir> --sha <sha>
  //   save --ledger <archivo> --cwd <dir> [--kind review|judgment]
  // Los verbos con --ledger reescriben ese archivo en el lugar (escritura atómica).
  const fs = require('node:fs');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const L = require('../lib/ledger');
  const { readConfig } = require('../lib/profiles');
  const { headSha, workingTree } = require('../lib/changes');
  const { gitRun } = require('../lib/git');
  const { repoIdFor } = require('../lib/seals');
  const { pignoloHome } = require('../lib/home');

  const GIT_MS = 60000;
  const VALUE = ['level', 'profile', 'sha', 'out', 'ledger', 'id', 'cwd', 'judgment', 'round', 'kind'];
  const MULTI = ['fixed'];
  const BOOL = ['red', 'no-red'];

  class Usage extends Error {}
  class Fail extends Error {}

  function parse(argv) {
    const o = { pos: [], fixed: [] };
    for (let i = 0; i < argv.length; i += 1) {
      const a = argv[i];
      if (!a.startsWith('--')) { o.pos.push(a); continue; }
      const k = a.slice(2);
      if (BOOL.includes(k)) { o[k] = true; continue; }
      if (!VALUE.includes(k) && !MULTI.includes(k)) throw new Usage(`opción desconocida: ${a}`);
      i += 1;
      if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
      if (MULTI.includes(k)) o[k].push(argv[i]);
      else o[k] = argv[i];
    }
    return o;
  }

  const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const print = (x) => process.stdout.write(`${JSON.stringify(x)}\n`);

  function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
      fs.renameSync(tmp, file);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  // Sin --profile, el del usuario (~/.pignolo/config.json; balanced por defecto).
  const profileOf = (o) => o.profile || readConfig().profile;

  function need(o, ...keys) {
    for (const k of keys) if (o[k] === undefined) throw new Usage(`falta --${k}`);
  }

  function checked(ledger) {
    const errors = L.validateLedger(ledger);
    if (errors.length) throw new Fail(`el ledger no valida: ${errors.join('; ')}`);
    return ledger;
  }

  // Congelado (§12): HEAD es el SHA revisado y la copia de trabajo es el árbol de ese commit.
  function frozen(cwd, sha) {
    const head = headSha({ cwd, timeoutMs: GIT_MS });
    let headTree = null;
    if (head) headTree = gitRun(['rev-parse', `${head}^{tree}`], cwd, { timeout: GIT_MS });
    const tree = workingTree({ cwd, timeoutMs: GIT_MS });
    const ok = L.isFrozen({ sha }, head, { headTree, workingTree: tree });
    let reason = null;
    if (!ok) reason = head !== sha ? `HEAD es ${head}, no ${sha}` : 'hay cambios sin commitear en la copia de trabajo';
    return { frozen: ok, head, reason };
  }

  const VERBS = {
    validate(o) {
      if (o.pos.length !== 1) throw new Usage('validate <archivo>');
      const errors = L.validateLedger(readJson(o.pos[0]));
      print({ ok: errors.length === 0, errors });
      return errors.length ? 1 : 0;
    },
    plan(o) {
      need(o, 'level');
      print(L.reviewPlan({ level: o.level, profile: profileOf(o) }));
      return 0;
    },
    judgment(o) {
      if (o.pos.length !== 2) throw new Usage('judgment <a.json> <b.json>');
      print(L.judgment(readJson(o.pos[0]), readJson(o.pos[1])));
      return 0;
    },
    refute(o) {
      if (o.pos.length !== 1) throw new Usage('refute ... <verdicts.json>');
      const verdicts = readJson(o.pos[0]);
      if (!o.ledger) {
        need(o, 'level', 'profile');
        print({ result: L.refutation(verdicts, { profile: o.profile, level: o.level }) });
        return 0;
      }
      const ledger = checked(readJson(o.ledger));
      if (verdicts === null || typeof verdicts !== 'object' || Array.isArray(verdicts)) {
        throw new Usage('con --ledger, verdicts.json es { "<id>": [veredictos] }');
      }
      const results = {};
      const findings = ledger.findings.map((f) => {
        if (!Object.prototype.hasOwnProperty.call(verdicts, f.id)) return f;
        results[f.id] = L.refutation(verdicts[f.id], { profile: ledger.profile, level: ledger.level });
        return results[f.id] === 'refuted' ? { ...f, status: 'refuted' } : f;
      });
      writeJson(o.ledger, { ...ledger, findings });
      print({ results });
      return 0;
    },
    build(o) {
      need(o, 'sha', 'level', 'out');
      const ledger = L.buildLedger({
        sha: o.sha, level: o.level, profile: profileOf(o), round: o.round === undefined ? 0 : Number(o.round),
        reports: o.pos.map(readJson), judgment: o.judgment ? readJson(o.judgment) : null,
      });
      checked(ledger);
      writeJson(o.out, ledger);
      print({ ok: true, file: path.resolve(o.out), findings: ledger.findings.length });
      return 0;
    },
    repro(o) {
      need(o, 'ledger', 'id');
      if (Boolean(o.red) === Boolean(o['no-red'])) throw new Usage('repro necesita --red o --no-red');
      const ledger = checked(readJson(o.ledger));
      const i = ledger.findings.findIndex((f) => f.id === o.id);
      if (i < 0) throw new Fail(`no hay un hallazgo ${o.id} en el ledger`);
      const finding = L.applyRepro(ledger.findings[i], { red: o.red === true });
      ledger.findings[i] = finding;
      writeJson(o.ledger, ledger);
      print({ finding });
      return 0;
    },
    round(o) {
      need(o, 'ledger', 'sha');
      const ledger = checked(readJson(o.ledger));
      if (ledger.round >= 2) throw new Fail('máximo 2 rondas de fix (§12): lo abierto se escala');
      const next = checked(L.nextRound(ledger, { sha: o.sha, fixed: o.fixed, reports: o.pos.map(readJson) }));
      writeJson(o.ledger, next);
      print({ ok: true, round: next.round });
      return 0;
    },
    next(o) {
      need(o, 'ledger');
      print({ next: L.nextStep(checked(readJson(o.ledger))) });
      return 0;
    },
    frozen(o) {
      need(o, 'cwd', 'sha');
      const r = frozen(path.resolve(o.cwd), o.sha);
      print(r);
      return r.frozen ? 0 : 1;
    },
    save(o) {
      need(o, 'ledger', 'cwd');
      const kind = o.kind || 'review';
      if (!['review', 'judgment'].includes(kind)) throw new Usage('--kind debe ser review o judgment');
      const ledger = checked(readJson(o.ledger));
      const repoId = repoIdFor({ cwd: path.resolve(o.cwd), timeoutMs: GIT_MS });
      const file = path.join(pignoloHome(), 'reviews', repoId, `${ledger.sha}-${kind}.json`);
      writeJson(file, ledger);
      print({ ok: true, file });
      return 0;
    },
  };

  try {
    const [verb, ...rest] = process.argv.slice(2);
    if (!VERBS[verb]) throw new Usage('uso: ledger.js validate|plan|judgment|refute|build|repro|round|next|frozen|save [opciones]');
    process.exitCode = VERBS[verb](parse(rest));
  } catch (e) {
    process.stderr.write(`pignolo ledger: ${e.message}\n`);
    process.exitCode = e instanceof Fail ? 1 : 2;
  }
  ````

- [ ] **Paso 4: verde.** `node --test --test-reporter=dot tests/ledger-cli.test.js tests/ledger.test.js` → todo verde (medido: 11 + los de 3a).
- [ ] **Paso 5: commit.** `feat(ledger): verbos build, repro, refute, round, next, frozen y save para las skills de revisión`.

### Task 12: `run.js` para las skills y `setup.js models` (sonnet)

**Files:**
- Modify: `plugins/pignolo/scripts/run.js`, `plugins/pignolo/scripts/setup.js`, `tests/run-lifecycle.test.js` (dos esperados del `.gitignore`)
- Test: `tests/run-files.test.js`, `tests/setup-models.test.js` (nuevos)

**Interfaces:**
- Consume: `matchAny` (`lib/globs.js`), `readProjectConfig` (ya usado), `resolveModel` (`lib/profiles.js`), `ROLES` (`lib/roles.js`).
- Produce:
  - `run.js start`: `ensureIgnored(main, ['.gitignore', 'run.json', '.disabled', 'tmp/', 'worktrees/'])`.
  - `run.js task`: cada `--file` normalizado (`\` → `/`, sin `./` inicial); vacío, absoluto o con `..` → exit 2. Con `--agent pignolo:test-writer`, todo archivo en `testPaths` y ninguno en `protectedTestConfig`; con `pignolo:implementer` o `pignolo:fixer` sin `--test-authorization`, ninguno en `testPaths` ni `protectedTestConfig`. Si no → exit 1 con la lista y `Alternativa:`. La validación usa la config leída de `testRef ?? base` (la misma que ya lee el script).
  - `setup.js models` → `{ profile, models: { <rol>: 'opus'|'sonnet' } }` para los 19 roles, con las sobrescrituras de `models` de la config.

- [ ] **Paso 1: tests primero.** `tests/run-files.test.js`:

  ````js
  'use strict';
  // run.js task: --file normalizado y archivos por rol (hito 3b).
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { PLUGIN_ROOT, makeRepo, makeTempDir, git } = require('./helpers');

  const SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'run.js');
  const run = (cwd, args) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
    return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
  };

  // Repo con project.md commiteado (test-paths: tests/, protected-test-config: check.js),
  // flujo daily y una worktree de tarea.
  function setup() {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, '.pignolo'));
    fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'),
      '---\ntype: code-tested\ngates:\n  on-done: node check.js\ntest-paths:\n  - tests/\nprotected-test-config:\n  - check.js\n---\n');
    git(['add', '-f', '.pignolo/project.md'], repo);
    git(['commit', '-q', '-m', 'project.md'], repo);
    const base = git(['rev-parse', 'HEAD'], repo);
    assert.strictEqual(run(repo, ['start', '--flow', 'daily']).status, 0);
    const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
    git(['worktree', 'add', '-q', '-b', 'task/daily/2026-09-30-demo', wt], repo);
    return { repo, wt, base };
  }
  const task = (s, ...extra) => run(s.repo, ['task', '--id', 'demo', '--worktree', s.wt, '--base', s.base, ...extra]);

  test('--file con barras invertidas y ./ se guarda con barras normales', () => {
    const s = setup();
    const r = task(s, '--file', 'tests\\a.test.js', '--file', './tests/b.test.js', '--agent', 'pignolo:test-writer');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(r.out.run.task.files, ['tests/a.test.js', 'tests/b.test.js']);
  });

  test('--file absoluta o con .. → exit 2', () => {
    const s = setup();
    assert.strictEqual(task(s, '--file', path.join(s.wt, 'src', 'a.js'), '--agent', 'pignolo:implementer').status, 2);
    assert.strictEqual(task(s, '--file', 'src/../../x.js', '--agent', 'pignolo:implementer').status, 2);
    assert.strictEqual(task(s, '--file', '/src/a.js', '--agent', 'pignolo:implementer').status, 2);
  });

  test('test-writer con un archivo fuera de test-paths o protegido → exit 1 con Alternativa', () => {
    const s = setup();
    const out = task(s, '--file', 'tests/a.test.js', '--file', 'src/a.js', '--agent', 'pignolo:test-writer');
    assert.strictEqual(out.status, 1);
    assert.match(out.stderr, /src\/a\.js/);
    assert.match(out.stderr, /Alternativa/);
    assert.strictEqual(task(s, '--file', 'check.js', '--agent', 'pignolo:test-writer').status, 1);
  });

  test('implementer o fixer con un test sin --test-authorization → exit 1; con autorización → 0', () => {
    const s = setup();
    assert.strictEqual(task(s, '--file', 'src/a.js', '--file', 'tests/a.test.js', '--agent', 'pignolo:implementer').status, 1);
    assert.strictEqual(task(s, '--file', 'check.js', '--agent', 'pignolo:fixer').status, 1);
    const ok = task(s, '--file', 'src/a.js', '--file', 'tests/a.test.js', '--agent', 'pignolo:implementer', '--test-authorization');
    assert.strictEqual(ok.status, 0, ok.stderr);
  });

  test('start agrega .gitignore, tmp/ y worktrees/ al .gitignore de .pignolo, y git no los ve', () => {
    const repo = makeRepo();
    assert.strictEqual(run(repo, ['start', '--flow', 'trivial']).status, 0);
    const gi = fs.readFileSync(path.join(repo, '.pignolo', '.gitignore'), 'utf8').split('\n');
    assert.ok(gi.includes('.gitignore') && gi.includes('tmp/') && gi.includes('worktrees/'));
    fs.mkdirSync(path.join(repo, '.pignolo', 'tmp'));
    fs.writeFileSync(path.join(repo, '.pignolo', 'tmp', 'x.json'), '{}');
    assert.ok(!git(['status', '--porcelain', '--untracked-files=all'], repo).includes('.pignolo/'), 'ni tmp/ ni el propio .gitignore');
  });
  ````

  `tests/setup-models.test.js`:

  ````js
  'use strict';
  // setup.js models: el modelo de cada rol según el perfil (§7), para los despachos de las skills.
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { makeTempDir } = require('./helpers');
  const { main } = require('../plugins/pignolo/scripts/setup');

  function envWith(config) {
    const home = path.join(makeTempDir(), '.pignolo');
    if (config) {
      fs.mkdirSync(home, { recursive: true });
      fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(config));
    }
    return { PIGNOLO_HOME: home };
  }

  test('models sin config: balanced, revisores en opus e implementer en sonnet', () => {
    const r = main(['models'], envWith(null));
    assert.strictEqual(r.profile, 'balanced');
    assert.strictEqual(r.models['review-risk'], 'opus');
    assert.strictEqual(r.models.implementer, 'sonnet');
  });

  test('models con max y una sobrescritura por rol', () => {
    const r = main(['models'], envWith({ profile: 'max', models: { fixer: 'sonnet' } }));
    assert.strictEqual(r.profile, 'max');
    assert.strictEqual(r.models.implementer, 'opus');
    assert.strictEqual(r.models.fixer, 'sonnet');
  });
  ````

  En `tests/run-lifecycle.test.js`, los dos esperados de `start` (líneas del test `start writes a valid run.json…` y `start with a gitignore that already has lines…`) pasan a `'.gitignore\nrun.json\n.disabled\ntmp/\nworktrees/\n'` y `'foo\n.gitignore\nrun.json\n.disabled\ntmp/\nworktrees/\n'`. Los de `ensureIgnored` directo no cambian.
- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot tests/run-files.test.js tests/setup-models.test.js tests/run-lifecycle.test.js`. Esperado (medido): 5 de `run-files`, 2 de `setup-models` y los 2 de `run-lifecycle` en rojo.
- [ ] **Paso 3: implementar.** En `scripts/run.js`:

  - Imports y constantes (después de `const MALFORMED = '_malformed';`); en `start`, `ensureIgnored(main, IGNORED)` reemplaza a `ensureIgnored(main, ['run.json', '.disabled'])`:

  ````js
  const { matchAny } = require('../lib/globs');

  // .pignolo/.gitignore: él mismo (sin commitear, contaría como un archivo más del diff y
  // ningún cambio sería trivial), la marca, el flag, los temporales de las skills y sus worktrees.
  const IGNORED = ['.gitignore', 'run.json', '.disabled', 'tmp/', 'worktrees/'];
  const WRITERS_NO_TESTS = ['pignolo:implementer', 'pignolo:fixer'];
  ````

  - Antes de `function task(`:

  ````js
  // --file: relativa a la raíz de la worktree y con '/' (las rutas de git). Se normaliza
  // '\' y un './' inicial; una ruta absoluta o con '..' es un error de uso.
  function normFile(p) {
    const s = String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '');
    if (s === '' || /^([a-zA-Z]:)?\//.test(s) || s.split('/').includes('..')) {
      throw new Usage(`--file debe ser una ruta relativa a la worktree, sin '..': ${p}`);
    }
    return s;
  }

  // Cada rol escribe solo donde el gate y el handback-gate lo van a aceptar (Review Focus 5
  // de 3a: fallar al registrar, no tras 8 rechazos).
  function checkFiles(t, cfg) {
    const tests = t.files.filter((f) => matchAny(cfg.testPaths, f) || matchAny(cfg.protectedTestConfig, f));
    if (t.agents.includes('pignolo:test-writer')) {
      const bad = t.files.filter((f) => !matchAny(cfg.testPaths, f) || matchAny(cfg.protectedTestConfig, f));
      if (bad.length) throw new Fail(`el test-writer solo escribe en test-paths y fuera de protected-test-config: ${bad.join(', ')}. Alternativa: elegí rutas de test-paths o registrá esos archivos para el implementer`);
    } else if (!t.testAuthorization && t.agents.some((a) => WRITERS_NO_TESTS.includes(a)) && tests.length) {
      throw new Fail(`el implementer y el fixer no tocan tests ni su configuración sin --test-authorization: ${tests.join(', ')}. Alternativa: registrá esos archivos para el test-writer`);
    }
  }
  ````

  - Dentro de `task`, en el armado de `t`:

  ````js
    t.files = o.multi.file ? o.multi.file.map(normFile) : ((prev && prev.files) || []);
    t.agents = o.multi.agent || (prev && prev.agents) || [];
    if (o['test-authorization'] || (prev && prev.testAuthorization)) t.testAuthorization = true;
    checkFiles(t, cfg);
  ````

  En `scripts/setup.js`:

  - Imports: `const { readConfig, writeConfig, resolveModel } = require('../lib/profiles');` y `const { ROLES } = require('../lib/roles');`.
  - Antes de `function parseArgs(`:

  ````js
  // Modelo de cada rol según el perfil del usuario (§7): las skills lo pasan explícito en
  // cada despacho.
  function models(env) {
    const cfg = readConfig({ env });
    const out = {};
    for (const role of Object.keys(ROLES)) out[role] = resolveModel(role, cfg);
    return { profile: cfg.profile, models: out };
  }
  ````

  - En `main`, después de la rama de `conflicts`: `if (cmd === 'models') return models(env);`, y `models` en el texto de uso.

- [ ] **Paso 4: verde.** Los tres archivos y además `tests/gates.test.js` y `tests/toggle.test.js` completos (usan `run.js task` y `.pignolo/.gitignore`).
- [ ] **Paso 5: commit.** `feat(run): rutas --file normalizadas, archivos por rol al registrar y temporales ignorados; setup.js models`.

### Task 13: salida `json` de los revisores, plantillas y ayuda de tests de forma (sonnet)

**Files:**
- Modify: `plugins/pignolo/agents/review-risk.md`, `review-resilience.md`, `review-readability.md`, `review-reliability.md`, `review-testability.md`, `judge-a.md`, `judge-b.md`, `refuter.md` (solo la sección `## Output`)
- Create: `plugins/pignolo/templates/question.md`, `plugins/pignolo/templates/task-card.md`, `plugins/pignolo/templates/review-summary.md`, `tests/skill-forms.js` (ayuda, no test)
- Test: `tests/agents-output.test.js`, `tests/templates.test.js`

**Interfaces:**
- Produce: el contrato de salida que consumen `ledger.js build` (Task 11), las skills (Tasks 15 y 16) y los graders (Task 17); las tres plantillas que nombran las skills; `readSkill(name)`, `brokenReferences(text)` y `VERBS` para los tests de forma de la ola 1 (`VERBS` lista los verbos de `run.js`, `ledger.js` y `setup.js` **después** de las Tasks 11 y 12).

- [ ] **Paso 1: tests primero.** `tests/agents-output.test.js`:

  ````js
  'use strict';
  // Forma de salida de los revisores (hito 3b): un bloque json que ledger.js build copia tal
  // cual. Solo forma, no el texto libre.
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { PLUGIN_ROOT } = require('./helpers');

  const agent = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'agents', `${name}.md`), 'utf8');
  const REVIEWERS = {
    'review-risk': 'risk', 'review-resilience': 'resilience', 'review-readability': 'readability',
    'review-reliability': 'reliability', 'review-testability': 'testability', 'judge-a': 'judge-a', 'judge-b': 'judge-b',
  };

  for (const [name, lens] of Object.entries(REVIEWERS)) {
    test(`${name}: hallazgos en un bloque json con las claves del ledger y su lente`, () => {
      const s = agent(name);
      assert.match(s, /one fenced `json` block/);
      assert.match(s, /keys in this order: `id`[^\n]*`lens` \(`[a-z-]+`\), `location` \(`path:line`[^\n]*`severity`, `evidence`[^\n]*`repro`/);
      assert.ok(s.includes(`\`lens\` (\`${lens}\`)`));
      assert.match(s, /APPROVE[^\n]*REQUEST_CHANGES[^\n]*ESCALATE/);
    });
  }

  test('refuter: veredictos en un bloque json claim, verdict, reason', () => {
    assert.match(agent('refuter'), /one fenced `json` block[^\n]*keys in this order: `claim`[^\n]*`verdict`, `reason`/);
  });
  ````

  `tests/templates.test.js`:

  ````js
  'use strict';
  // Plantillas de texto de las skills de carriles (hito 3b): forma, no texto libre.
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { PLUGIN_ROOT } = require('./helpers');

  const tpl = (n) => fs.readFileSync(path.join(PLUGIN_ROOT, 'templates', n), 'utf8');
  const CATEGORIES = ['identity', 'scope', 'costs', 'dependencies', 'irreversible', 'security', 'contract', 'rule-conflict',
    'scope-card', 'test-authorization', 'needs-review-batch', 'judge-conflict', 'live-check-input', 'quota'];

  test('question.md: dos capas, la lista cerrada de categorías completa, recomendación', () => {
    const t = tpl('question.md');
    for (const c of CATEGORIES) assert.ok(t.includes(c), c);
    assert.ok(t.indexOf('In plain words') < t.indexOf('Technical detail'));
    assert.match(t, /Recommendation/);
  });

  test('task-card.md: worktree, archivos, gate con --task, cierre con las tres palabras', () => {
    const t = tpl('task-card.md');
    for (const re of [/Worktree:/, /Files you may touch/, /gate\.js" --level on-done --task/, /DONE, BLOCKED or NEEDS_CONTEXT/, /forward slashes/]) {
      assert.match(t, re);
    }
  });

  test('review-summary.md: dos capas y los refutados siempre listados', () => {
    const t = tpl('review-summary.md');
    assert.ok(t.indexOf('In plain words') < t.indexOf('Technical detail'));
    for (const re of [/APPROVED \| ESCALATED/, /Refuted/, /Not reproduced/, /Suspect/, /ledger\.js save/]) assert.match(t, re);
  });
  ````

- [ ] **Paso 2: rojo.** `node --test --test-reporter=dot tests/agents-output.test.js tests/templates.test.js`. Esperado (medido): 8 y 3 en rojo.
- [ ] **Paso 3: implementar.**
  - En cada lente `review-<lens>.md` (`risk`, `resilience`, `readability`, `reliability`), reemplazar la línea `One block per finding with these fields: id, lens (<lens>), location (path:line), severity, evidence, repro-spec.` por el párrafo de abajo con su lente, y `With no findings, write "no findings" and say what you covered.` por `With no findings, say below the block what you covered.`. En `review-testability.md`, reemplazar `One block per finding: id, lens (testability), location, severity, evidence (the command you ran and its output, including the forged red), repro-spec.` por el mismo párrafo con `` `evidence` (the command you ran and its output, including the forged red), `` en lugar de `` `evidence`, ``. En `judge-a.md` y `judge-b.md`, reemplazar `Findings, each with: id, location, severity, evidence, and a repro-spec for BLOCKER and CRITICAL.` por el párrafo con `judge-a` o `judge-b`:

    ```
    Write the findings as one fenced `json` block: an array with one object per finding, keys in this order: `id` (short, unique in your report), `lens` (`<lens>`), `location` (`path:line`, a single line number), `severity`, `evidence`, `repro` (the repro-spec: input, action and the wrong observable result; only for BLOCKER and CRITICAL). With no findings the block is `[]`. Pignolo copies the block into the review ledger as is, so it must be valid JSON.
    ```

  - En `refuter.md`, reemplazar `For each claim: claim id, verdict, reason with evidence.` por:

    ```
    Write the verdicts as one fenced `json` block: an array with one object per claim, keys in this order: `claim` (the claim id from the brief), `verdict`, `reason` (the evidence: command and output, or file and line). Pignolo feeds the block to its refutation rule as is, so it must be valid JSON.
    ```

  - `templates/question.md`:

  ````markdown
  <!--
  pignolo question template (spec §4.4 and §4.6). Fill it in the human's language: every
  heading and sentence below is translated, the structure is kept. One question per message.

  Category: exactly one of the closed list, by its English name, followed by its name in the
  human's language:
    identity, scope, costs, dependencies, irreversible, security, contract, rule-conflict,
    scope-card, test-authorization, needs-review-batch, judge-conflict, live-check-input, quota
  A question without a category is a failure (spec §0 c).

  Options: complete, in the order they were found, never summarized or reordered. Each one says
  what happens, its cost and whether it can be undone.
  -->
  **<"In plain words" heading>**
  <1 to 3 short lines, no jargon, no paths, no counts: what is going on and what the human has to decide.>

  **<"Question" heading>** · category: `<category>` (<category name in the human's language>)
  <the question, in one line>

  1. <option: what happens · cost · reversible or not>
  2. <option: what happens · cost · reversible or not>

  <"Recommendation" label>: <option number>, because <evidence in one line>.

  **<"Technical detail" heading>**
  - <"Context" label>: <at most 2 lines>.
  - <"Evidence" label>: <commands run, files and lines, script output (risk hits, gate status, ledger ids)>.
  - <"Cost and reversibility" label>: <per option, one line each>.
  ````

  - `templates/task-card.md`:

  ````markdown
  <!--
  pignolo task-card template (spec §2, §5.2, §6.1). The orchestrator fills it, writes it to
  <main>/.pignolo/tmp/task-<id>.md and pastes it whole into the dispatch brief. Internal text:
  English. Every path is absolute or relative to the worktree root, always with forward slashes.
  -->
  # Task-card <id>

  - Goal: <one line, from the human's request>
  - Requirement (literal): <the human's words, quoted>
  - Role: <pignolo:test-writer | pignolo:implementer | pignolo:fixer>
  - Worktree: <absolute path>. Run every shell command as `cd "<worktree>" && <command>`; read and edit files only inside it.
  - Branch: task/daily/<YYYY-MM-DD>-<slug> · base: <sha> · test reference: <sha or "none yet">
  - Files you may touch (the gate rejects any other): <one per line, relative to the worktree root>
  - Tests that define done: <paths and test names, or "you write them" for the test-writer>
  - test-paths: <globs from project.md> · protected-test-config: <globs>
  - Gate: `node "<plugin root>/scripts/gate.js" --level on-done --task` (it runs `<gates.on-done from project.md>` and seals the result; the handback-gate accepts DONE only with that seal for the current tree)
  - Risk: <low | medium | high> · reserved decisions authorized by the human: <none, or category + what was authorized>
  - Approved visual (optional): <design/approved/<flow>/ with manifest.json, or "none">
  - Out of scope: <what not to touch or add>
  - Close with exactly one word on the last line: DONE, BLOCKED or NEEDS_CONTEXT.
  ````

  - `templates/review-summary.md`:

  ````markdown
  <!--
  pignolo closing summary of a review or Judgment Day (spec §4.6, §12). Fill it in the human's
  language: headings and sentences translated, structure kept. Every count and id comes from the
  ledger file (ledger.js output), never from memory. Refuted findings are always listed.
  -->
  **<"In plain words" heading>**
  <1 to 3 lines: whether the change is approved, what was fixed and what, if anything, is left for the human. Approving does not authorize delivering.>

  **<"Technical detail" heading>**
  - <"Result" label>: APPROVED | ESCALATED · SHA <sha> · level <low|medium|high> · profile <profile> · rounds <0-2>
  - <"Reviewed by" label>: <lenses run, refuters, judges; "structural reading" for low risk>
  - <"Confirmed and fixed" label>: <ledger id · location · severity · confirming test> (or "none")
  - <"Open or escalated" label>: <ledger id · location · severity · why> (or "none")
  - <"Refuted" label>: <ledger id · location · refuter reason> (or "none")
  - <"Not reproduced (lowered to WARNING)" label>: <ledger id · location> (or "none")
  - <"Suspect (one judge only)" label>: <ledger id · location> (or "none")
  - <"Ledger" label>: <path returned by ledger.js save>
  ````

  - `tests/skill-forms.js`:

  ````js
  'use strict';
  // Ayudas para los tests de forma de las skills de carriles (hito 3b). No es un test.
  const fs = require('node:fs');
  const path = require('node:path');
  const { PLUGIN_ROOT } = require('./helpers');
  const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');

  // Verbos que aceptan hoy los scripts que las skills operan.
  const VERBS = {
    'run.js': ['start', 'task', 'renew', 'status', 'end'],
    'ledger.js': ['validate', 'plan', 'judgment', 'refute', 'build', 'repro', 'round', 'next', 'frozen', 'save'],
    'setup.js': ['check', 'models', 'permissions', 'config', 'conflicts'],
  };

  function readSkill(name) {
    const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
    return { text, ...parseFrontmatter(text) };
  }

  // Todo script y plantilla que la skill nombra existe, y todo verbo de run/ledger/setup es real.
  function brokenReferences(text) {
    const out = [];
    for (const m of text.matchAll(/(?:\$\{CLAUDE_PLUGIN_ROOT\}|<P>)\/((?:scripts|templates)\/[\w.-]+)/g)) {
      if (!fs.existsSync(path.join(PLUGIN_ROOT, m[1]))) out.push(m[1]);
    }
    for (const m of text.matchAll(/\b(run\.js|ledger\.js|setup\.js)"? ([a-z][a-z-]*)/g)) {
      if (!VERBS[m[1]].includes(m[2])) out.push(`${m[1]} ${m[2]}`);
    }
    return out;
  }

  module.exports = { readSkill, brokenReferences, VERBS };
  ````

- [ ] **Paso 4: verde.** Los dos archivos, más `tests/agents-tools.test.js` y `tests/manifest.test.js` completos (frontmatter de los agentes intacto).
- [ ] **Paso 5: commit.** `feat(agents): los revisores entregan un bloque json para el ledger; plantillas de pregunta, tarjeta y resumen`.

---

## Ola 1 (en paralelo: Tasks 14 a 18, cada una en su worktree)

Todas parten de `contract/hito-3b/v1`. Ninguna toca archivos de la ola 0; si un contrato parece mal, `BLOCKED` sin cambiarlo. Las skills se escriben con los textos de abajo; el implementador puede ajustar redacción, nunca el orden de pasos ni los comandos (los fija el test de forma).

### Task 14: skills `entry` y `trivial` (sonnet)

**Files:**
- Create: `plugins/pignolo/skills/entry/SKILL.md`, `plugins/pignolo/skills/trivial/SKILL.md`
- Test: `tests/skill-lanes.test.js`

**Interfaces:**
- Consume: `run.js status|start|end`, `risk.js --files-from|--diff`, `gate.js --level on-done [--no-tests-reason]`, `setup.js models`, `templates/question.md`, `readSkill`/`brokenReferences`.
- Produce: `entry` invoca `pignolo:trivial` o `pignolo:daily` con el pedido literal, la ruta de la lista de archivos y el JSON de riesgo.

- [ ] **Paso 1: test primero** (`tests/skill-lanes.test.js`):

  ````js
  'use strict';
  // Forma de las skills entry y trivial (hito 3b). Solo forma: el comportamiento de los
  // scripts lo cubre tests/flow-lanes.test.js; el de los agentes, las evals y el checklist manual.
  const test = require('node:test');
  const assert = require('node:assert');
  const { readSkill, brokenReferences } = require('./skill-forms');

  for (const name of ['entry', 'trivial']) {
    test(`${name}: frontmatter invocable por el modelo y referencias reales`, () => {
      const s = readSkill(name);
      assert.strictEqual(s.data.name, name);
      assert.ok(s.data.description.length > 40);
      assert.strictEqual(s.data['disable-model-invocation'], undefined);
      assert.deepStrictEqual(brokenReferences(s.text), []);
    });
  }

  test('entry: dos capas con categoría, estado del flujo, piso de riesgo con barras normales', () => {
    const { text } = readSkill('entry');
    for (const re of [/templates\/question\.md/, /run\.js" status/, /risk\.js" --files-from/, /forward slashes/, /pignolo:trivial/, /pignolo:daily/]) {
      assert.match(text, re);
    }
  });

  test('trivial: gate on-done, riesgo sobre el diff real, commit -F y cierre del flujo', () => {
    const { text } = readSkill('trivial');
    for (const re of [/run\.js" start --flow trivial/, /gate\.js" --level on-done/, /risk\.js" --diff HEAD/, /git commit -F/, /run\.js" end/]) {
      assert.match(text, re);
    }
  });
  ````

- [ ] **Paso 2: rojo.** Solo este archivo: falla por los `SKILL.md` ausentes.
- [ ] **Paso 3: escribir las skills.** `skills/entry/SKILL.md`:

  ````markdown
  ---
  name: entry
  description: Use first for any request in a project where pignolo is active (a .pignolo/project.md exists and pignolo is not switched off). Decides whether the request authorizes a change and picks the lane (trivial or daily) from pignolo's risk floor.
  ---

  You are the orchestrator in the main conversation. Speak to the human in their language; this text is internal.

  ## Talking to the human

  Every message to the human follows the two layers of `${CLAUDE_PLUGIN_ROOT}/templates/question.md`: first "in plain words" (1 to 3 lines, no jargon, no paths, no counts), then the technical detail. One step per message, at most one question, and every question carries one category from the closed list in that template. Every count, path and status you state comes from a script's JSON output, never from memory.

  ## Steps

  1. **Is pignolo on here?** Find the project root: the nearest directory upward that holds `.pignolo/project.md` (stop at the first one that holds `.git`). If there is none, or `.pignolo/.disabled` exists there, pignolo is not active: say so in one line and handle the request normally, without pignolo's flows. Call that root `<main>` (for a git worktree, the main checkout that owns it).
  2. **Does the request authorize a change?** A question, an explanation or an investigation authorizes none: answer read-only. Something you notice while reading never widens the authorization: report it and stop there. A request to review without changing anything goes to the `pignolo:review` skill in report-only mode.
  3. **Is another flow running?** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" status --cwd "<main>"`. If `running` is true and the flow is not the one you are already in, stop and ask the human (category `scope`) whether to close it with `run.js end` or resume it. If `malformed` is true, show the path and offer `run.js end`.
  4. **What will change?** Read what you need to know which files the change touches: up to 3 files yourself; for 4 or more dispatch `pignolo:explorer` (model from `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" models`) and treat its report as claims to check. With the Write tool, write the list to `<main>/.pignolo/tmp/entry-files.txt`: one path per line, relative to `<main>`, with forward slashes (`src/app.js`, never `src\app.js`).
  5. **Risk floor.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/risk.js" --files-from "<main>/.pignolo/tmp/entry-files.txt" --cwd "<main>"`, adding `--deleted <path>` for each file the change deletes. The JSON gives `level`, `reserved`, `laneFloor`, `hits` and `categories`. The floor is a floor: you may only raise it, never lower it (spec §4.2).
  6. **Reserved decisions first.** If `reserved` is true, ask before anything else, one question per hit category (the category is the one in the hit), with the hit's path and detail in the technical part. Continue only with an explicit yes from the human in their own turn; carry what they authorized into the task-card.
  7. **Pick the lane** (spec §5.2), the higher of the floor and your judgment:
     - `trivial`: one line or a mechanical change you fully understand, `laneFloor` is `trivial`, no hit.
     - `daily`: everything else that fits one task.
     - `plan`: the floor says `plan` (a UI change without `visible-paths`), or the change needs a spec. Plan mode is not built yet: ask the human (category `scope`) whether to continue in `daily` with a high-risk review or to stop.
  8. **Hand over.** Invoke the `pignolo:trivial` or `pignolo:daily` skill with the request (quoted literally), the path of the file list and the risk JSON. Lanes only go up (trivial → daily → plan), never down.
  ````

  `skills/trivial/SKILL.md`:

  ````markdown
  ---
  name: trivial
  description: Use only when pignolo's entry skill picked the trivial lane. Makes a one-line or mechanical change in the main checkout, seals the on-done gate, re-checks the risk floor on the real diff and commits. No review.
  ---

  You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill. Talk to the human as the entry skill says: two layers (`${CLAUDE_PLUGIN_ROOT}/templates/question.md`), one step per message, a category on every question, facts only from script output.

  ## Steps

  1. **Open the flow.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" start --flow trivial --cwd "<main>"`. Exit 1 means another flow is running or `run.json` is unreadable: stop and tell the human what the message says.
  2. **Make the change** yourself, in the files of the entry list only, and nothing else.
  3. **Gate.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/gate.js" --level on-done --cwd "<main>"`.
     - Exit 0 (`PASS`): go on.
     - `FAIL`: read the log tail; if your change caused it, fix it once and run the gate again; otherwise stop and tell the human.
     - `NO_TESTS` (a `code-untested` project): if the change has nothing to test (a comment, a string), write the reason with Write to `<main>/.pignolo/tmp/no-tests-reason.txt` and run the gate again with `--no-tests-reason "<main>/.pignolo/tmp/no-tests-reason.txt"`; if it has behavior, the change is not trivial: go to step 4's escalation.
     - `NO_GATE` or `TREE_CHANGED`: the project's gate is missing or writes files; stop and tell the human the alternative the gate printed.
  4. **Risk on the real diff.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/risk.js" --diff HEAD --cwd "<main>"`. The lane stays trivial only if `level` is `low`, `laneFloor` is `trivial` and `reserved` is false. Otherwise escalate:
     - Undo your own edit with the Edit tool, restoring the exact previous text (never `git restore`, `git checkout -- <file>` or `git stash`).
     - `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`.
     - Ask the human (category: the hit's category; `scope` if the lane rose without a hit): 1) redo it in the daily lane (recommended), 2) leave it for them. Never commit here.
  5. **Commit.** Write the message with Write to `<main>/.pignolo/tmp/commit-msg.txt`: Conventional Commits in the human's language, then the trailers `Agent: orchestrator` and `Gates: on-done PASS`. Then `cd "<main>" && git add <each changed file by path> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Never `git add -A` or `git add .`.
  6. **Close.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.js" end --cwd "<main>"`, then a two-layer summary: what changed in plain words; below, the commit, the files and the gate status.
  ````

- [ ] **Paso 4: verde** y `claude plugin validate plugins/pignolo`.
- [ ] **Paso 5: commit.** `feat(skills): entry decide autorización y carril; trivial cambia, sella y commitea`.

### Task 15: skill `daily` (opus)

**Files:**
- Create: `plugins/pignolo/skills/daily/SKILL.md`
- Test: `tests/skill-daily.test.js`

**Interfaces:**
- Consume: `run.js start|task|renew|status|end`, `risk.js --diff`, `gate.js --level on-done --task`, `setup.js models`, `templates/task-card.md`, `templates/question.md`, `templates/review-summary.md`, la skill `pignolo:review` (Task 16; se invoca por nombre).
- Produce: el recorrido de §5.2 en el orden fijo de 3a (ruling "La tarea se registra antes del `test-writer`"), verificado de punta a punta por los scripts en la Task 18.

- [ ] **Paso 1: test primero** (`tests/skill-daily.test.js`):

  ````js
  'use strict';
  // Forma de la skill daily (hito 3b): el orden de 3a y las reglas de cada escritor.
  const test = require('node:test');
  const assert = require('node:assert');
  const { readSkill, brokenReferences } = require('./skill-forms');

  test('daily: frontmatter y referencias reales', () => {
    const s = readSkill('daily');
    assert.strictEqual(s.data.name, 'daily');
    assert.strictEqual(s.data['disable-model-invocation'], undefined);
    assert.deepStrictEqual(brokenReferences(s.text), []);
  });

  test('daily: orden de 3a (task del test-writer, rojo, testRef, implementer) hasta el merge', () => {
    const { text } = readSkill('daily');
    const order = [
      /run\.js" start --flow daily/,
      /git worktree add -b task\/daily\/<YYYY-MM-DD>-<slug> "<main>\/\.pignolo\/worktrees\/<slug>"/,
      /--agent pignolo:test-writer/,
      /Prove red yourself/,
      /--test-ref <T>[^\n]*--agent pignolo:implementer/,
      /risk\.js" --diff <base>/,
      /pignolo:review/,
      /git merge --no-ff -F/,
      /run\.js" end/,
    ];
    let at = 0;
    for (const re of order) {
      const m = re.exec(text.slice(at));
      assert.ok(m, `falta o está fuera de orden: ${re}`);
      at += m.index + m[0].length;
    }
  });

  test('daily: status tras cada escritor, re-registro, renew, barras normales, modelos y categorías', () => {
    const { text } = readSkill('daily');
    for (const re of [/run\.js" status/, /handback\.accepted/, /At most 2 automatic continuations/, /register the task again/,
      /run\.js" renew/, /uses `\/`/, /setup\.js" models/, /templates\/task-card\.md/, /category `irreversible`/]) {
      assert.match(text, re);
    }
  });
  ````

- [ ] **Paso 2: rojo.** Solo este archivo.
- [ ] **Paso 3: escribir la skill** (`skills/daily/SKILL.md`):

  ````markdown
  ---
  name: daily
  description: Use only when pignolo's entry skill picked the daily lane. Runs one task in its own branch and worktree - test-writer, red proved by you, implementer, sealed gate, review by risk - then merges into the origin branch with the human's confirmation.
  ---

  You are the orchestrator in the main conversation. `<main>` is the project root from the entry skill; `<P>` stands for `${CLAUDE_PLUGIN_ROOT}`. Talk to the human as the entry skill says: two layers (`<P>/templates/question.md`), one step per message, a category on every question, facts only from script output.

  ## Rules that hold in every step

  - **Only you run `run.js`.** Subagents cannot (the guard blocks them). You register the task before every writer dispatch, renew the flow before every dispatch, and run `status` after every writer.
  - **A report is not proof.** After each writer returns, run `node "<P>/scripts/run.js" status --cwd "<main>"`. The writer is accepted only if `handback.accepted` is true. Otherwise the task is BLOCKED whatever the report says; the reason is in `handback.lastReason`.
  - **Continue at most twice.** Compare the report with the task-card. If items are still open and the writer named no block, register the task again with the same `run.js task` command (that resets its handback counter) and dispatch the same writer once more, naming the open items. At most 2 automatic continuations per writer; after that, ask the human (category `scope`, or the reserved category if that is what blocks).
  - **Paths with forward slashes.** Every `--file` is relative to the worktree root and uses `/` (`tests/cart.test.js`, never `tests\cart.test.js`).
  - **Files and messages through Write.** Task-cards, commit messages and file lists go to `<main>/.pignolo/tmp/` with the Write tool; commits use `git commit -F <file>`. Stage by path; never `git add -A` or `git add .`.
  - **Models.** Run `node "<P>/scripts/setup.js" models` once at the start and pass `model: <models[role]>` on every dispatch.

  ## Steps

  1. **Open the flow.** `node "<P>/scripts/run.js" start --flow daily --cwd "<main>"`. Exit 1: stop and tell the human what the message says.
  2. **Branch and worktree** (spec §11.1, §11.2 mechanism B). Pick a slug (`[a-z0-9-]`, at most 40 characters) and today's date. From `<main>`: `git branch --show-current` is the origin branch; then `cd "<main>" && git worktree add -b task/daily/<YYYY-MM-DD>-<slug> "<main>/.pignolo/worktrees/<slug>" HEAD`. Call the worktree `<wt>` and its `git rev-parse HEAD` `<base>`. If the branch name exists, add `-2`, `-3`.
  3. **Explore** what the change needs: up to 3 files yourself, 4 or more through `pignolo:explorer`. Explorer reports are claims to check.
  4. **Task-card.** Fill `<P>/templates/task-card.md` for the test-writer and write it to `<main>/.pignolo/tmp/task-<slug>.md`. Pick the test files: inside `test-paths` (from `.pignolo/project.md`), next to the existing tests and following their naming. Skip steps 5 to 8 only when `project.md` says `type: docs` or `type: script`.
  5. **Register and dispatch the test-writer.**
     - `node "<P>/scripts/run.js" renew --cwd "<main>"`
     - `node "<P>/scripts/run.js" task --id <slug> --worktree "<wt>" --base <base> --file <test path> [--file <test path>]... --agent pignolo:test-writer --cwd "<main>"`. Exit 1 names the file that is outside `test-paths`: fix the list, never the check.
     - Dispatch `pignolo:test-writer` with the task-card and the literal requirement. It must not read the implementation.
  6. **Accept.** `run.js status` as in the rules above; continue at most twice.
  7. **Prove red yourself** (the test-writer has no Bash). Run the command it named: `cd "<wt>" && <command>`. The test must fail, and for the reason the test-writer stated. If it passes, it proves nothing: dispatch the test-writer again naming that (it counts as a continuation). Keep the failing output for the summary.
  8. **Commit the tests.** Write the message (`test: ...`, trailers `Agent: pignolo:test-writer` and `Gates: red proved by the orchestrator`), then `cd "<wt>" && git add <test paths> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`. Call the new `git rev-parse HEAD` `<T>`.
  9. **Register and dispatch the implementer.**
     - `node "<P>/scripts/run.js" renew --cwd "<main>"`
     - `node "<P>/scripts/run.js" task --id <slug> --test-ref <T> --file <source path> [--file <source path>]... --agent pignolo:implementer --cwd "<main>"` (same id: it keeps `worktree` and `base`, adds `testRef`, replaces files and agent, and resets the counter). A test path in this list is refused: implementers do not touch tests.
     - Update the task-card (role, files, test reference) and dispatch `pignolo:implementer`. The card tells it to run every command as `cd "<wt>" && <command>` and to close only after `node "<P>/scripts/gate.js" --level on-done --task` passes.
  10. **Accept.** `run.js status`; continue at most twice (register again before each re-dispatch).
  11. **Risk on the real diff.** `node "<P>/scripts/risk.js" --diff <base> --cwd "<wt>"`. The level of the task is the higher of this and the entry classification. A new reserved hit: stop and ask (the hit's category). `laneFloor` `plan`: stop and ask (category `scope`).
  12. **Commit the change.** Write the message (Conventional Commits in the human's language, trailers `Agent: pignolo:implementer` and `Gates: on-done PASS`), then `cd "<wt>" && git add <source paths> && git commit -F "<main>/.pignolo/tmp/commit-msg.txt"`.
  13. **Review.** Invoke the `pignolo:review` skill with `<wt>`, `<base>`, the level from step 11, the task-card path and `<slug>` as the task id. It returns APPROVED or ESCALATED and the ledger path. ESCALATED: show the summary and ask the human how to go on (category `scope`); do not merge.
  14. **Merge** (spec §4.4: into `main` one by one; into another origin branch as a routine confirmation). Ask the human (category `irreversible`), recommending the merge when the review is APPROVED. Only after an explicit yes in their own turn: write the merge message and run `cd "<main>" && git merge --no-ff -F "<main>/.pignolo/tmp/merge-msg.txt" task/daily/<YYYY-MM-DD>-<slug>`. Then `cd "<main>" && git worktree remove "<wt>"` (without `--force`; the branch stays).
  15. **Close.** `node "<P>/scripts/run.js" end --cwd "<main>"` and the closing summary with `<P>/templates/review-summary.md`, adding the red output of step 7 and the commits.

  If the human stops the task, or it ends BLOCKED and they do not want to go on, run `run.js end` so the flow stops restricting agents; the branch and the worktree stay for them.
  ````

- [ ] **Paso 4: verde**, `claude plugin validate plugins/pignolo`, y una lectura contra el Review Focus 1 y 5: cada despacho de un escritor tiene antes `renew` + `task` y después `status`, y toda salida del flujo pasa por `run.js end`.
- [ ] **Paso 5: commit.** `feat(skills): daily con test-writer, rojo demostrado, implementer sellado, revisión y merge confirmado`.

### Task 16: skills `review` y `judgment` (opus)

**Files:**
- Create: `plugins/pignolo/skills/review/SKILL.md`, `plugins/pignolo/skills/judgment/SKILL.md`
- Test: `tests/skill-review.test.js`

**Interfaces:**
- Consume: todos los verbos de `ledger.js` (Task 11), `run.js task|renew|status|start|end`, `setup.js models`, la salida `json` de los revisores (Task 13), `templates/review-summary.md`.
- Produce: para `daily`, `APPROVED | ESCALATED` y la ruta del ledger; `judgment` invocable desde `review` o a pedido del humano.

- [ ] **Paso 1: test primero** (`tests/skill-review.test.js`):

  ````js
  'use strict';
  // Forma de las skills review y judgment (hito 3b).
  const test = require('node:test');
  const assert = require('node:assert');
  const { readSkill, brokenReferences } = require('./skill-forms');

  for (const name of ['review', 'judgment']) {
    test(`${name}: frontmatter y referencias reales`, () => {
      const s = readSkill(name);
      assert.strictEqual(s.data.name, name);
      assert.strictEqual(s.data['disable-model-invocation'], undefined);
      assert.deepStrictEqual(brokenReferences(s.text), []);
    });
  }

  test('review: congelado, plan, build verbatim, refute, repro, next, round, save siempre', () => {
    const { text } = readSkill('review');
    for (const re of [/ledger\.js" frozen/, /ledger\.js" plan --level/, /ledger\.js" build --sha/, /ledger\.js" refute --ledger/,
      /ledger\.js repro --ledger/, /ledger\.js" next --ledger/, /ledger\.js" round --ledger/, /ledger\.js" save --ledger/,
      /verbatim/, /run\.js" task --id <task>-repro/, /--agent pignolo:fixer/, /pignolo:judgment/, /templates\/review-summary\.md/]) {
      assert.match(text, re);
    }
  });

  test('judgment: jueces ciegos en paralelo, judgment + build --judgment, judge-conflict, save --kind judgment', () => {
    const { text } = readSkill('judgment');
    for (const re of [/pignolo:judge-a/, /pignolo:judge-b/, /Never show one judge the other/, /ledger\.js" judgment/,
      /--judgment "<j\.json>"/, /category `judge-conflict`/, /--kind judgment/]) {
      assert.match(text, re);
    }
  });
  ````

- [ ] **Paso 2: rojo.** Solo este archivo.
- [ ] **Paso 3: escribir las skills.** `skills/review/SKILL.md`:

  ````markdown
  ---
  name: review
  description: Use when pignolo's daily skill reaches its review step, or when the human asks pignolo to review a commit. Reviews a frozen SHA with the depth its risk level sets - lenses, refuters, repro tests, at most two fixer rounds - and persists the ledger even when it is empty.
  ---

  You are the orchestrator in the main conversation. `<P>` stands for `${CLAUDE_PLUGIN_ROOT}`; `<main>` is the project root; `<wt>` is the worktree under review (the task worktree from daily, or `<main>` for a review the human asked for); `<base>` is the task base from daily, or the commit the human names (by default the parent of the reviewed commit); `<task>` is the daily task id, or `review-<first 7 of the SHA>`; `<L>` is `<main>/.pignolo/tmp/review-<first 7 of the SHA>/ledger.json`. Talk to the human as the entry skill says: two layers, one step per message, a category on every question, facts only from script output.

  ## Rules

  - **You never grade findings.** You copy each agent's `json` block verbatim into a file with Write and let `ledger.js` decide. You never drop, merge, reword or re-rate a finding (spec §12). Refuted findings are always listed in the summary.
  - **Frozen candidate.** The review is of one SHA. Before dispatching and before accepting any result, `node "<P>/scripts/ledger.js" frozen --cwd "<wt>" --sha <SHA>` must exit 0. If it exits 1, commit first or start over on the new SHA.
  - **Writers follow the daily rules:** `run.js renew` before each dispatch, `run.js task` before each writer, `run.js status` after each writer (accepted only with `handback.accepted`), at most 2 automatic continuations, `--file` relative with `/`.
  - **Models:** `node "<P>/scripts/setup.js" models`; pass `model` on every dispatch.
  - **Report-only mode** (the human asked only for a review): no test-writer and no fixer, so steps 7 and 9 are skipped; the result lists every finding still standing, and it is APPROVED only if no BLOCKER or CRITICAL stands.

  ## Steps

  1. **Flow.** Inside daily, the flow is already open. For a review the human asked for, `node "<P>/scripts/run.js" start --flow review --cwd "<main>"` (and `end` at the close).
  2. **Freeze.** `<SHA>` = `cd "<wt>" && git rev-parse HEAD`; run the frozen check.
  3. **Plan.** `node "<P>/scripts/ledger.js" plan --level <level>` returns `lenses`, `refuters` and `judgmentDay` for the user's profile.
  4. **Low risk (no lenses): structural reading.** Read `cd "<wt>" && git diff <base>..<SHA>` yourself against the task-card and N1 to N4 (the control is on the real path; no fail-open code; comments and commits are true; what is lost is declared). If you see a real defect, raise the level to `medium` and go back to step 3 (you may raise, never lower). If not, write `[]` to `<main>/.pignolo/tmp/review-<sha7>/structural.json` and build the ledger with it (step 5, last command).
  5. **Lenses (medium and high).** Dispatch every lens of the plan in parallel, in one message: `pignolo:review-<lens>`, each with the SHA, `<wt>` (its files are the SHA), the diff `<base>..<SHA>` (for more than 400 lines, the file list and the diff of the risky files), the task-card and the level. Write each lens's `json` block verbatim to `<main>/.pignolo/tmp/review-<sha7>/<lens>.json`. A lens whose block is missing or not valid JSON is dispatched once more naming that; if it fails again, ask the human (category `scope`). Then:
     `node "<P>/scripts/ledger.js" build --sha <SHA> --level <level> --out "<L>" <each lens file>`
  6. **Refuters (high risk, `refuters` > 0).** Claims = every finding in `<L>` with status `open` and severity BLOCKER, CRITICAL or WARNING, numbered by their ledger `id`. Dispatch `refuters` instances of `pignolo:refuter` in parallel, each with the SHA, `<wt>` and the claims (location, evidence, repro) and nothing else. Write each refuter's `json` block verbatim; build `<main>/.pignolo/tmp/review-<sha7>/verdicts.json` as `{ "<ledger id>": [<verdict of refuter 1>, <verdict of refuter 2>, ...] }` copying each `verdict` value as written (a missing claim is simply absent from its list). Then `node "<P>/scripts/ledger.js" refute --ledger "<L>" "<verdicts file>"`. Missing or malformed verdicts leave the finding standing.
  7. **Repro tests** for every finding still `open` with severity BLOCKER or CRITICAL (spec §12). Pick one test path per finding inside `test-paths`; register `node "<P>/scripts/run.js" task --id <task>-repro<round> --worktree "<wt>" --base <SHA> --file <test path>... --agent pignolo:test-writer --cwd "<main>"`, renew, and dispatch `pignolo:test-writer` with each finding's `repro` (header `Protects: <ledger id>`). After `run.js status` accepts it, run each test from `<wt>`: fails for the stated reason → `ledger.js repro --ledger "<L>" --id <id> --red`; passes or cannot run → `--no-red` (it drops to WARNING and stays in the ledger). Commit only the red tests (`test: repro <ids>`) and call that commit `<R>`; remove the files of the tests that did not go red.
     A finding located in a test file needs `test-authorization` from the human before any fix (spec §9.3): ask.
  8. **Next step.** `node "<P>/scripts/ledger.js" next --ledger "<L>"`: `done` → step 10; `escalate` → step 10 with the open findings; `fix` → step 9.
  9. **Fixer round** (at most 2 rounds; the script refuses a third).
     - `node "<P>/scripts/run.js" task --id <task>-fix<round + 1> --worktree "<wt>" --base <SHA> --test-ref <R> --file <source files of the confirmed findings> --agent pignolo:fixer --cwd "<main>"`, renew, dispatch `pignolo:fixer` (model from `models`) with the confirmed ledger entries, their confirming tests and the gate command. `run.js status` decides.
     - Run each confirming test from `<wt>`; the ones now green are fixed. Commit the fix (`fix: <ids>`, trailers `Agent: pignolo:fixer`, `Gates: on-done PASS`); the new HEAD is `<SHA2>`.
     - Re-review only the ledger plus the delta: dispatch the lenses that produced the confirmed findings with the previous findings and the diff `<SHA>..<SHA2>`, write their blocks verbatim, and run `node "<P>/scripts/ledger.js" round --ledger "<L>" --sha <SHA2> --fixed <each fixed id> <each new lens file>`. `<SHA>` becomes `<SHA2>`; freeze it and repeat steps 6 to 8 for the new open findings.
  10. **Judgment Day.** If the plan says `judgmentDay` (or the human asked for it), invoke the `pignolo:judgment` skill on the final SHA and merge its result into the outcome.
  11. **Persist.** `node "<P>/scripts/ledger.js" save --ledger "<L>" --cwd "<wt>"` always, also with no findings. Keep the returned path.
  12. **Result.** APPROVED when `next` is `done` and Judgment Day (if it ran) approved; otherwise ESCALATED. Summarize with `<P>/templates/review-summary.md`. Approving does not authorize delivering.
  ````

  `skills/judgment/SKILL.md`:

  ````markdown
  ---
  name: judgment
  description: Use when pignolo's review skill calls for Judgment Day (profile max on high risk) or the human asks for it. Two blind judges review the same frozen SHA in parallel; what both find is fixed, what one finds is suspect; the result is APPROVED or ESCALATED.
  ---

  You are the orchestrator in the main conversation. `<P>`, `<main>` and `<wt>` mean what they mean in the review skill; `<J>` is `<main>/.pignolo/tmp/judgment-<first 7 of the SHA>/ledger.json`. Same rules as the review skill: you never grade findings (verbatim `json` blocks, `ledger.js` decides), frozen SHA checked before dispatching and before accepting, writers registered and accepted through `run.js`, two layers and a category on every question.

  ## Steps

  1. **Freeze.** `node "<P>/scripts/ledger.js" frozen --cwd "<wt>" --sha <SHA>` must exit 0.
  2. **Judges, blind and in parallel.** In one message, dispatch `pignolo:judge-a` and `pignolo:judge-b` (models from `node "<P>/scripts/setup.js" models`), each with exactly the same brief: the SHA, `<wt>`, the task-card and the list of changed files. Never show one judge the other's report or a previous verdict.
  3. **Copy verbatim.** Write each judge's `json` block to `<main>/.pignolo/tmp/judgment-<sha7>/a.json` and `b.json`. A missing or invalid block: dispatch that judge once more; if it fails again, the result is ESCALATED.
  4. **Compare** (spec §12): `node "<P>/scripts/ledger.js" judgment "<a.json>" "<b.json>" > "<main>/.pignolo/tmp/judgment-<sha7>/j.json"`, then `node "<P>/scripts/ledger.js" build --sha <SHA> --level <level> --out "<J>" --judgment "<j.json>"`. Found by both (same file, lines at most 3 apart) → `open`; by one → `suspect`; one judge blocking and the other not on the same spot → both `open` with a `conflict` field.
  5. **Evidence settles conflicts first.** Every `open` BLOCKER or CRITICAL, conflicts included, goes through the repro step of the review skill (test-writer, red proved by you, `ledger.js repro --ledger "<J>" ...`). Ask the human with category `judge-conflict` only when a conflict cannot be reproduced either way (the test-writer ends BLOCKED or NEEDS_CONTEXT): one question per conflict, both judges' evidence quoted in the technical part.
  6. **Fix.** `node "<P>/scripts/ledger.js" next --ledger "<J>"`; on `fix`, run the fixer round of the review skill on `<J>`, then both judges again on the new SHA with the previous findings and the delta, and `ledger.js round --ledger "<J>" ...`. At most 2 rounds.
  7. **Persist.** `node "<P>/scripts/ledger.js" save --ledger "<J>" --cwd "<wt>" --kind judgment`.
  8. **Result.** APPROVED when `next` is `done` and no conflict is left unanswered; otherwise ESCALATED. Summarize with `<P>/templates/review-summary.md`, listing the suspects.
  ````

- [ ] **Paso 4: verde**, `claude plugin validate plugins/pignolo`, y una lectura contra el Review Focus 2 y 3 (ningún paso resume o re-califica un bloque; `frozen` antes de despachar y de aceptar; `round` con el SHA nuevo).
- [ ] **Paso 5: commit.** `feat(skills): review con lentes, refuters, repro y fixer (máx. 2 rondas); Judgment Day con jueces ciegos`.

### Task 17: evals `agents` de lentes, refuter, jueces y fixer (opus)

**Files:**
- Create: `tests/evals/review-cases.js` (tabla y generador), `tests/eval-cases.test.js`
- Modify: `.gitignore` (agrega `tests/evals/generated/` y `tests/evals/**/results/`)

**Interfaces:**
- Consume: el contrato de salida de la Task 13 (claves en orden, verdicto final en su propia línea), `parseFrontmatter` (`lib/yaml-lite.js`) para leer los graders en el test.
- Produce: `node tests/evals/review-cases.js --out <dir> [--reviewer-model opus|sonnet]` → un directorio por caso (`case.yaml`, `fixture.sh`, `prompt.md`, `graders/*.md`) para `claude plugin eval . --eval-dir <dir>`; `CASES`, `build`, `SUB` exportados.
- Formato de los graders (verificado contra el esquema de `claude plugin eval` 2.1.285: tipos `regex | tool_order | tool_used | file_exists | llm | baseline`; `regex` con `target: trace | last_message | files | mock_calls | {source: file, path}`, `flags`, `match: contains | not_contains | count:N`): `tool_used` sobre `Agent` con `subagent_type` y `model`; `regex` sobre `trace` con el prefijo `SUB` (evento `assistant` con `parent_tool_use_id` no nulo); para el fixer, además `regex` sobre el archivo corregido y sobre el test (que no cambió).

- [ ] **Paso 1: test primero** (`tests/eval-cases.test.js`):

  ````js
  'use strict';
  // Graders de las evals del hito 3b, sin gastar tokens: cada grader se corre contra un trace
  // sintético (eventos stream-json) y debe aprobar la salida buena del SUBAGENTE, reprobar la
  // mala y reprobar la misma salida buena si viene de la sesión principal (defecto de las
  // evals del hito 2: el grader miraba la sesión principal).
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { makeTempDir } = require('./helpers');
  const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
  const { CASES, build } = require('./evals/review-cases');

  const event = (text, parent) => JSON.stringify({
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, parent_tool_use_id: parent, session_id: 's',
  });
  const toolEvent = (name, input, parent) => JSON.stringify({
    type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name, input }] }, parent_tool_use_id: parent, session_id: 's',
  });
  const brief = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: 'toolu_p', session_id: 's' });

  function grade(g, { trace, files }) {
    const text = typeof g.target === 'object' ? files[g.target.path] : trace;
    const hit = new RegExp(g.pattern, g.flags || '').test(text);
    return g.match === 'not_contains' ? !hit : hit;
  }

  const out = makeTempDir('pignolo-evals-');
  build({ out, reviewerModel: 'opus' });
  const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
    .map((f) => parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data)
    .filter((g) => g.type === 'regex');

  for (const c of CASES) {
    test(`eval ${c.name}: estructura y fixture`, () => {
      for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, c.name, f)), f);
      const sh = fs.readFileSync(path.join(out, c.name, 'fixture.sh'), 'utf8');
      for (const content of Object.values(c.files)) assert.ok(sh.includes(content.replace(/\n$/, '')));
      const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
      assert.match(prompt, new RegExp(`subagent_type pignolo:${c.agent}`));
      assert.ok(fs.existsSync(path.join(out, c.name, 'graders', 'dispatched.md')));
    });

    test(`eval ${c.name}: los graders ven al subagente y no a la sesión principal`, () => {
      const gs = graders(c.name);
      assert.ok(gs.length > 0);
      // Traces: el brief del subagente siempre está (parent no nulo, tipo user) y no debe bastar.
      const tools = c.agent === 'fixer'
        ? [toolEvent('Edit', { file_path: '/w/src/pages.js' }, 'toolu_p'), toolEvent('Bash', { command: 'node --test tests/' }, 'toolu_p')]
        : [];
      const fixed = { 'src/pages.js': c.files['src/pages.js'] && c.files['src/pages.js'].replace('start + size - 1);', 'start + size);'), 'tests/pages.test.js': c.files['tests/pages.test.js'] };
      const good = { trace: [brief(c.brief), ...tools, event(c.samples.pass, 'toolu_p')].join('\n'), files: fixed };
      const bad = { trace: [brief(c.brief), event(c.samples.fail, 'toolu_p')].join('\n'), files: c.files };
      const fromMain = { trace: [brief(c.brief), event(c.samples.pass, null)].join('\n'), files: c.files };
      for (const g of gs) assert.ok(grade(g, good), `${c.name}: el grader ${g.pattern} reprueba la salida buena`);
      assert.ok(gs.some((g) => !grade(g, bad)), `${c.name}: ningún grader reprueba la salida mala`);
      assert.ok(gs.some((g) => !grade(g, fromMain)), `${c.name}: la salida buena desde la sesión principal aprueba`);
    });
  }

  test('evals: 14 casos (8 lentes, 4 jueces, refuter, fixer) y la rama sonnet solo cambia el modelo de los revisores', () => {
    assert.strictEqual(CASES.length, 14);
    const son = makeTempDir('pignolo-evals-sonnet-');
    build({ out: son, reviewerModel: 'sonnet' });
    const p = fs.readFileSync(path.join(son, 'review-risk-defect', 'prompt.md'), 'utf8');
    assert.match(p, /model sonnet/);
    assert.match(fs.readFileSync(path.join(son, 'review-risk-defect', 'graders', 'model.md'), 'utf8'), /"model":"sonnet"/);
    assert.doesNotMatch(fs.readFileSync(path.join(son, 'fixer-confirmed-finding', 'prompt.md'), 'utf8'), /model (opus|sonnet)\)/);
  });
  ````

- [ ] **Paso 2: rojo.** Falla por el módulo ausente.
- [ ] **Paso 3: implementar** `tests/evals/review-cases.js`:

  ````js
  'use strict';
  // Evals `agents` del hito 3b (§15): lentes, refuter, jueces y fixer. Una sola tabla genera
  // los casos de `claude plugin eval` (prompt.md, case.yaml, fixture.sh, graders/*.md).
  // Los graders miran lo que hizo el SUBAGENTE, no la sesión principal: una línea del
  // trace (un evento stream-json) cuenta solo si es de tipo assistant y trae un
  // parent_tool_use_id no nulo. La sesión principal solo despacha y contesta RELAYED.
  //
  // Uso: node tests/evals/review-cases.js --out <dir> [--reviewer-model opus|sonnet]
  // (la salida va a tests/evals/generated/, que no se versiona).
  const fs = require('node:fs');
  const path = require('node:path');

  const REPO = path.join(__dirname, '..', '..');
  const FAKE_SHA = '1111111111111111111111111111111111111111';

  // ---- fuentes sintéticas (sin datos reales) ----
  const PAGES = `'use strict';
  // Devuelve la página \`page\` (desde 1) de \`items\`, de a \`size\` elementos.
  function pageOf(items, page, size) {
    if (!Array.isArray(items)) throw new TypeError('items debe ser una lista');
    if (!(page >= 1) || !(size >= 1)) throw new RangeError('page y size empiezan en 1');
    const start = (page - 1) * size;
    return items.slice(start, start + size);
  }

  module.exports = { pageOf };
  `;
  const PAGES_BUG = PAGES.replace('start + size);', 'start + size - 1);');
  const PAGES_CLEAN = PAGES.replace('  const start = (page - 1) * size;\n', '  const start = (page - 1) * size; // índice del primer elemento\n');

  const STORE = `'use strict';
  const fs = require('node:fs');

  // Guarda \`rows\` como JSON en \`file\`. Devuelve true solo si quedó escrito.
  function saveRows(file, rows) {
    const tmp = \`\${file}.tmp\`;
    fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);
    return true;
  }

  module.exports = { saveRows };
  `;
  const STORE_BUG = STORE.replace(`  fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);
    return true;`, `  try {
      fs.writeFileSync(tmp, JSON.stringify(rows));
      fs.renameSync(tmp, file);
    } catch (e) {
      return true;
    }
    return true;`);
  const STORE_CLEAN = STORE.replace(`  fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);`, `  try {
      fs.writeFileSync(tmp, JSON.stringify(rows));
      fs.renameSync(tmp, file);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }`);

  const REPORT = `'use strict';
  const fs = require('node:fs');
  const path = require('node:path');

  const DIR = path.join(__dirname, '..', 'reports');

  // Lee el informe \`name\` de reports/ (solo nombres simples).
  function readReport(name) {
    if (!/^[a-z0-9-]+\\.txt$/.test(name)) throw new Error('nombre inválido');
    return fs.readFileSync(path.join(DIR, name), 'utf8');
  }

  module.exports = { readReport };
  `;
  const REPORT_BUG = REPORT.replace("  if (!/^[a-z0-9-]+\\.txt$/.test(name)) throw new Error('nombre inválido');\n", '');
  const REPORT_CLEAN = REPORT.replace("throw new Error('nombre inválido')", "throw new Error(`nombre de informe inválido: ${name}`)");

  const TOKEN = `'use strict';
  // true si el token ya venció.
  function isExpired(token, now = Date.now()) {
    return token.expiresAt <= now;
  }

  module.exports = { isExpired };
  `;
  const TOKEN_BUG = TOKEN.replace('// true si el token ya venció.', '// true si el token sigue vigente.');
  const TOKEN_CLEAN = TOKEN.replace('// true si el token ya venció.', '// true si el token ya venció (expiresAt en ms desde epoch).');

  const PAGES_TEST = `'use strict';
  const test = require('node:test');
  const assert = require('node:assert');
  const { pageOf } = require('../src/pages');

  // Protects: R1 · Breaks if: pageOf drops the last item of a page
  test('pageOf returns size items per full page', () => {
    assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 1, 2), [1, 2]);
    assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 3, 2), [5]);
  });
  `;

  // Diff unificado mínimo (una sola zona de cambio) entre dos versiones, para el brief.
  function diff(file, a, b) {
    const x = a.split('\n');
    const y = b.split('\n');
    let s = 0;
    while (s < x.length && x[s] === y[s]) s += 1;
    let e = 0;
    while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e += 1;
    const from = Math.max(0, s - 2);
    const oldEnd = x.length - e;
    const newEnd = y.length - e;
    const ctxEnd = Math.min(x.length, oldEnd + 2);
    const lines = [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${from + 1},${ctxEnd - from} +${from + 1},${ctxEnd - from + (newEnd - oldEnd)} @@`,
      ...x.slice(from, s).map((l) => ` ${l}`),
      ...x.slice(s, oldEnd).map((l) => `-${l}`),
      ...y.slice(s, newEnd).map((l) => `+${l}`),
      ...x.slice(oldEnd, ctxEnd).map((l) => ` ${l}`),
    ];
    return lines.join('\n');
  }

  // ---- graders ----
  // Línea de trace de un subagente (evento assistant con parent_tool_use_id no nulo).
  const SUB = '^(?=[^\\n]*"type":"assistant")(?=[^\\n]*"parent_tool_use_id":"[^"]+")[^\\n]*';
  // Separadores entre dos claves JSON dentro del texto del subagente (serializado: \" y \n).
  const SEP = '(?:,|\\s|\\\\[rn])*';
  const key = (k, v) => `\\\\"${k}\\\\":\\s*\\\\"${v}\\\\"`;
  const trace = (name, pattern, match = 'contains') => ({ name, type: 'regex', target: 'trace', flags: 'm', pattern: SUB + pattern, match });
  const finding = (file, lines, sev) => `${key('location', `${file.replace(/\./g, '\\.')}:(${lines})`)}${SEP}${key('severity', `(${sev})`)}`;
  const verdict = (word) => trace(`verdict-${word.toLowerCase()}`, `\\\\n${word}(\\\\n)*"`);
  const dispatched = (agent, model) => [
    { name: 'dispatched', type: 'tool_used', tool: 'Agent', input_match: `"subagent_type":"pignolo:${agent}"` },
    ...(model ? [{ name: 'model', type: 'tool_used', tool: 'Agent', input_match: `"model":"${model}"` }] : []),
  ];

  // ---- muestras para el test determinista de los graders (tests/eval-cases.test.js) ----
  const report = (findings, word) => `Review of ${FAKE_SHA}.\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\`\n${word}`;
  const f = (lens, location, severity) => ({ id: '1', lens, location, severity, evidence: 'observed in the file', ...(/BLOCKER|CRITICAL/.test(severity) ? { repro: 'call it and compare' } : {}) });

  const LENS_CASES = [
    { lens: 'reliability', file: 'src/pages.js', base: PAGES, bug: PAGES_BUG, clean: PAGES_CLEAN, lines: '[4-9]|10', sample: 7, sev: 'BLOCKER|CRITICAL', goal: 'pageOf returns page `page` (1-based) of `items`, `size` items per page.' },
    { lens: 'resilience', file: 'src/store.js', base: STORE, bug: STORE_BUG, clean: STORE_CLEAN, lines: '[8-9]|1[0-5]', sample: 11, sev: 'BLOCKER|CRITICAL', goal: 'saveRows writes rows atomically and returns true only when they were written.' },
    { lens: 'risk', file: 'src/report.js', base: REPORT, bug: REPORT_BUG, clean: REPORT_CLEAN, lines: '[6-9]|1[0-2]', sample: 9, sev: 'BLOCKER|CRITICAL', goal: 'readReport returns a report from reports/ by simple name; names come from HTTP requests.' },
    { lens: 'readability', file: 'src/token.js', base: TOKEN, bug: TOKEN_BUG, clean: TOKEN_CLEAN, lines: '[1-5]', sample: 2, sev: 'BLOCKER|CRITICAL|WARNING', goal: 'isExpired tells whether a token has expired.' },
  ];

  const reviewBrief = (goal, file, a, b) => [
    `Frozen SHA: ${FAKE_SHA} (the files in the current directory are that SHA).`,
    'Risk level: high.',
    `Task-card goal: ${goal}`,
    'Diff (base..SHA):',
    '```diff', diff(file, a, b), '```',
  ].join('\n');

  function lensCases() {
    const out = [];
    for (const c of LENS_CASES) {
      const agent = `review-${c.lens}`;
      out.push({
        name: `${agent}-defect`, agent, tags: ['agents', 'review', 'defect'], reviewer: true,
        files: { [c.file]: c.bug }, brief: reviewBrief(c.goal, c.file, c.base, c.bug),
        graders: [trace('finds-planted-defect', finding(c.file, c.lines, c.sev))],
        samples: {
          pass: report([f(c.lens, `${c.file}:${c.sample}`, c.lens === 'readability' ? 'WARNING' : 'CRITICAL')], 'REQUEST_CHANGES'),
          fail: report([f(c.lens, `src/other.js:7`, 'CRITICAL')], 'REQUEST_CHANGES'),
        },
      });
      out.push({
        name: `${agent}-clean`, agent, tags: ['agents', 'review', 'clean'], reviewer: true,
        files: { [c.file]: c.clean }, brief: reviewBrief(c.goal, c.file, c.base, c.clean),
        graders: [verdict('APPROVE'), trace('no-blocking-finding', `${SEP}${key('severity', '(BLOCKER|CRITICAL)')}`, 'not_contains')],
        samples: {
          pass: report([f(c.lens, `${c.file}:3`, 'SUGGESTION')], 'APPROVE'),
          fail: report([f(c.lens, `${c.file}:3`, 'CRITICAL')], 'REQUEST_CHANGES'),
        },
      });
    }
    return out;
  }

  function judgeCases() {
    const out = [];
    for (const j of ['judge-a', 'judge-b']) {
      out.push({
        name: `${j}-defect`, agent: j, tags: ['agents', 'judges', 'defect'], reviewer: true,
        files: { 'src/pages.js': PAGES_BUG }, brief: reviewBrief(LENS_CASES[0].goal, 'src/pages.js', PAGES, PAGES_BUG),
        graders: [trace('finds-planted-defect', finding('src/pages.js', '[4-9]|10', 'BLOCKER|CRITICAL')), verdict('REQUEST_CHANGES')],
        samples: { pass: report([f(j, 'src/pages.js:7', 'BLOCKER')], 'REQUEST_CHANGES'), fail: report([], 'APPROVE') },
      });
      out.push({
        name: `${j}-clean`, agent: j, tags: ['agents', 'judges', 'clean'], reviewer: true,
        files: { 'src/pages.js': PAGES_CLEAN }, brief: reviewBrief(LENS_CASES[0].goal, 'src/pages.js', PAGES, PAGES_CLEAN),
        graders: [verdict('APPROVE'), trace('no-blocking-finding', `${SEP}${key('severity', '(BLOCKER|CRITICAL)')}`, 'not_contains')],
        samples: { pass: report([], 'APPROVE'), fail: report([f(j, 'src/pages.js:7', 'CRITICAL')], 'REQUEST_CHANGES') },
      });
    }
    return out;
  }

  const claim = (id, v) => `${key('claim', id)}${SEP}${key('verdict', v)}`;
  const refuterCase = {
    name: 'refuter-false-finding', agent: 'refuter', tags: ['agents', 'refuter'], reviewer: true,
    files: { 'src/pages.js': PAGES, 'src/token.js': TOKEN },
    brief: [
      `SHA: ${FAKE_SHA} (the files in the current directory are that SHA; there is no git history).`,
      'Claims:',
      'C1. src/pages.js:6 — pageOf(items, 0, 2) computes a negative start and returns the wrong items. Repro-spec: call pageOf([1,2,3], 0, 2) and observe a non-empty result.',
      'C2. src/token.js:4 — isExpired returns true when expiresAt equals now. Repro-spec: isExpired({ expiresAt: 5 }, 5) returns true.',
    ].join('\n'),
    graders: [trace('refutes-false-claim', claim('C1', 'REFUTED')), trace('keeps-true-claim', claim('C2', 'REFUTED'), 'not_contains')],
    samples: {
      pass: `\`\`\`json\n${JSON.stringify([{ claim: 'C1', verdict: 'REFUTED', reason: 'line 5 throws' }, { claim: 'C2', verdict: 'CONFIRMED', reason: '<=' }], null, 2)}\n\`\`\``,
      fail: `\`\`\`json\n${JSON.stringify([{ claim: 'C1', verdict: 'CONFIRMED', reason: 'x' }, { claim: 'C2', verdict: 'REFUTED', reason: 'y' }], null, 2)}\n\`\`\``,
    },
  };

  // El fixer tiene Bash: su caso requiere WSL2 (§15); en Windows nativo el runner lo rechaza.
  const fixerCase = {
    name: 'fixer-confirmed-finding', agent: 'fixer', tags: ['agents', 'fixer', 'wsl2'], reviewer: false,
    files: { 'src/pages.js': PAGES_BUG, 'tests/pages.test.js': PAGES_TEST },
    brief: [
      'Task-card: fix the confirmed finding below. Files you may touch: src/pages.js. Gate: node --test tests/',
      'Ledger entry reliability-1 (confirmed): location src/pages.js:7, severity CRITICAL, evidence: slice end drops the last item of each full page.',
      'Confirming test (red against the frozen SHA): tests/pages.test.js.',
    ].join('\n'),
    allowedTools: ['Agent', 'Read', 'Edit', 'Write', 'Bash'],
    graders: [
      { name: 'fixed', type: 'regex', target: { source: 'file', path: 'src/pages.js' }, pattern: 'slice\\(start, start \\+ size\\)' },
      { name: 'test-untouched', type: 'regex', target: { source: 'file', path: 'tests/pages.test.js' }, pattern: 'pageOf\\(\\[1, 2, 3, 4, 5\\], 3, 2\\), \\[5\\]' },
      trace('subagent-edited-source', '"name":"(Edit|Write)"[^\\n]*src/pages\\.js'),
      trace('subagent-ran-tests', '"name":"Bash"[^\\n]*node --test'),
      trace('done', '\\\\nDONE(\\\\n)*"'),
    ],
    samples: { pass: 'RED: ... GREEN: ...\nDONE', fail: 'I could not run it.\nBLOCKED' },
  };

  const CASES = [...lensCases(), ...judgeCases(), refuterCase, fixerCase];

  // ---- escritura ----
  function yamlValue(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (/^[A-Za-z0-9_.:/-]+$/.test(v) && !/^(true|false)$/.test(v)) return v;
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  function graderMd(g) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(g)) {
      if (k === 'name') continue;
      if (v && typeof v === 'object') {
        lines.push(`${k}:`);
        for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${yamlValue(v2)}`);
      } else lines.push(`${k}: ${yamlValue(v)}`);
    }
    lines.push('---', '');
    return lines.join('\n');
  }

  function fixtureSh(files) {
    const out = ['#!/usr/bin/env bash', '# Synthetic fixture generated by tests/evals/review-cases.js (no real data).', 'set -e'];
    for (const [p, content] of Object.entries(files)) {
      if (content.includes('PIGNOLO_EOF')) throw new Error(`delimitador dentro de ${p}`);
      out.push(`mkdir -p ${path.posix.dirname(p)}`, `cat > ${p} <<'PIGNOLO_EOF'`, content.replace(/\n$/, ''), 'PIGNOLO_EOF');
    }
    return `${out.join('\n')}\n`;
  }

  function promptMd(c, caseDir, reviewerModel) {
    const plugin = path.relative(caseDir, path.join(REPO, 'plugins', 'pignolo')).split(path.sep).join('/');
    const model = c.reviewer ? reviewerModel : null;
    const tools = c.allowedTools || ['Agent', 'Read', 'Grep', 'Glob'];
    const how = model ? `subagent_type pignolo:${c.agent}, model ${model}` : `subagent_type pignolo:${c.agent}`;
    return [
      '---',
      `runs: 5`,
      `max_turns: ${c.reviewer ? 20 : 40}`,
      `timeout_seconds: ${c.reviewer ? 600 : 900}`,
      'model: sonnet',
      `plugins: ["${plugin}"]`,
      `tags: [${[...c.tags, model || 'frontmatter'].join(', ')}]`,
      `allowed_tools: [${tools.join(', ')}]`,
      '---',
      '',
      `Dispatch the pignolo:${c.agent} agent (${how}) with exactly the brief between the two lines of dashes. Do not read, run or change anything yourself. When the agent returns, reply with only the word RELAYED.`,
      '',
      '----------',
      c.brief,
      '----------',
      '',
    ].join('\n');
  }

  function build({ out, reviewerModel = 'opus' }) {
    if (!['opus', 'sonnet'].includes(reviewerModel)) throw new Error('--reviewer-model debe ser opus o sonnet');
    for (const c of CASES) {
      const dir = path.join(out, c.name);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${c.name}\ncontext:\n  scaffold_script: fixture.sh\n`);
      fs.writeFileSync(path.join(dir, 'fixture.sh'), fixtureSh(c.files));
      fs.writeFileSync(path.join(dir, 'prompt.md'), promptMd(c, dir, reviewerModel));
      const graders = [...dispatched(c.agent, c.reviewer ? reviewerModel : null), ...c.graders];
      for (const g of graders) fs.writeFileSync(path.join(dir, 'graders', `${g.name}.md`), graderMd(g));
    }
    return CASES.map((c) => c.name);
  }

  if (require.main === module) {
    const a = process.argv.slice(2);
    const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
    const out = get('--out');
    if (!out) {
      process.stderr.write('uso: node tests/evals/review-cases.js --out <dir> [--reviewer-model opus|sonnet]\n');
      process.exit(2);
    }
    const names = build({ out: path.resolve(out), reviewerModel: get('--reviewer-model') || 'opus' });
    process.stdout.write(`${JSON.stringify({ out: path.resolve(out), cases: names })}\n`);
  }

  module.exports = { CASES, build, SUB };
  ````

  y en `.gitignore`:

  ```
  tests/evals/generated/
  tests/evals/**/results/
  ```

- [ ] **Paso 4: verde** (29 subtests) y **rojo del test agregado sobre el grader**: con `const SUB = '';` en `review-cases.js`, el test debe fallar (medido: 13 de 29 en rojo, todos por "la salida buena desde la sesión principal aprueba"); restaurar.
- [ ] **Paso 5: generar y mirar un caso a mano** (sin correrlo): `node tests/evals/review-cases.js --out tests/evals/generated/opus` y leer `review-reliability-defect/prompt.md` y sus graders. **No correr `claude plugin eval`**: es la decisión de costo del autor (Task 19).
- [ ] **Paso 6: commit.** `test(evals): casos de lentes, refuter, jueces y fixer con graders sobre el subagente`.

### Task 18: carriles de punta a punta por los scripts (sonnet)

**Files:**
- Create: `tests/flow-lanes.test.js`

Es un test agregado después del código de la ola 0: sigue, comando por comando, lo que ejecutan `trivial` y `daily` desde el hilo principal (los escritores se simulan escribiendo los archivos; su cierre pasa por el launcher real del handback-gate).

- [ ] **Paso 1: escribir el test:**

  ````js
  'use strict';
  // Carriles trivial y daily de punta a punta por los scripts, en el orden exacto que
  // prescriben las skills (hito 3b): lo que el hilo principal ejecuta, sin agentes. Los
  // escritores se simulan escribiendo los archivos; su cierre pasa por el launcher real.
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { makeRepo, runLauncher, git, PLUGIN_ROOT } = require('./helpers');

  const SCRIPTS = path.join(PLUGIN_ROOT, 'scripts');
  const HOME = process.env.PIGNOLO_HOME;
  // Sin NODE_TEST_CONTEXT: si no, un `node --test` hijo (la compuerta, el rojo) le reporta al
  // runner de esta suite y sale 0 aunque sus tests fallen.
  const ENV = { ...process.env, PIGNOLO_HOME: HOME, PIGNOLO_DISABLED: '' };
  delete ENV.NODE_TEST_CONTEXT;

  function put(root, rel, text) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  function script(name, args, cwd) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, name), ...args], {
      cwd, encoding: 'utf8', env: ENV, timeout: 60000,
    });
    let json;
    try { json = JSON.parse(r.stdout); } catch (_) { json = undefined; }
    return { status: r.status, json, stderr: r.stderr };
  }
  let n = 0;
  const stop = (wt, agent) => {
    n += 1;
    return runLauncher('handback-gate', {
      hook_event_name: 'SubagentStop', agent_type: agent, agent_id: `a-${n}`,
      last_assistant_message: 'informe\nDONE', stop_hook_active: false, cwd: wt,
    }, { PIGNOLO_HOME: HOME });
  };

  function project() {
    const main = makeRepo();
    put(main, '.pignolo/project.md', [
      '---', 'type: code-tested', 'gates:', '  on-done: node --test', 'test-paths:', '  - tests/', '---', '',
    ].join('\n'));
    put(main, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a - b;\n}\nmodule.exports = sum;\n");
    put(main, 'tests/base.test.js', "'use strict';\nrequire('node:test')('base', () => {});\n");
    git(['add', '-A'], main);
    git(['commit', '-q', '-m', 'C0'], main);
    return main;
  }

  test('trivial: start, risk --files-from, cambio, gate on-done, risk --diff HEAD, commit, end', () => {
    const main = project();
    assert.strictEqual(script('run.js', ['start', '--flow', 'trivial', '--cwd', main], main).status, 0);
    put(main, '.pignolo/tmp/files.txt', 'src/sum.js\n');
    const before = script('risk.js', ['--files-from', path.join(main, '.pignolo/tmp/files.txt'), '--cwd', main], main);
    assert.strictEqual(before.status, 0, before.stderr);
    assert.strictEqual(before.json.laneFloor, 'trivial');
    put(main, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a + b;\n}\nmodule.exports = sum;\n");
    const gate = script('gate.js', ['--level', 'on-done', '--cwd', main], main);
    assert.strictEqual(gate.status, 0, gate.stderr);
    assert.strictEqual(gate.json.status, 'PASS');
    const after = script('risk.js', ['--diff', 'HEAD', '--cwd', main], main);
    assert.strictEqual(after.status, 0, after.stderr);
    assert.deepStrictEqual([after.json.level, after.json.laneFloor, after.json.reserved], ['low', 'trivial', false], JSON.stringify(after.json));
    git(['add', 'src/sum.js'], main);
    git(['commit', '-q', '-m', 'fix: suma'], main);
    assert.strictEqual(script('run.js', ['end', '--cwd', main], main).status, 0);
  });

  test('daily: worktree en .pignolo/worktrees, test-writer, rojo, implementer, gate, handback, ledger, merge', () => {
    const main = project();
    assert.strictEqual(script('run.js', ['start', '--flow', 'daily', '--cwd', main], main).status, 0);
    const wt = path.join(main, '.pignolo', 'worktrees', 'sum-fix');
    git(['worktree', 'add', '-q', '-b', 'task/daily/2026-09-30-sum-fix', wt, 'HEAD'], main);
    assert.strictEqual(git(['status', '--porcelain', '--untracked-files=all'], main).includes('.pignolo/worktrees'), false);
    const base = git(['rev-parse', 'HEAD'], wt);

    // 1. Registro del test-writer (barras invertidas: el script las normaliza).
    let r = script('run.js', ['task', '--id', 'sum-fix', '--worktree', wt, '--base', base, '--file', 'tests\\sum.test.js', '--agent', 'pignolo:test-writer', '--cwd', main], main);
    assert.strictEqual(r.status, 0, r.stderr);
    put(wt, 'tests/sum.test.js', "'use strict';\nconst assert = require('node:assert');\nconst sum = require('../src/sum');\nrequire('node:test')('sum', () => { assert.strictEqual(sum(2, 3), 5); });\n");
    assert.strictEqual(stop(wt, 'pignolo:test-writer').status, 0);
    r = script('run.js', ['status', '--cwd', main], main);
    assert.strictEqual(r.json.handback.accepted, true);

    // 2. Rojo demostrado por el orquestador y commit T.
    const red = spawnSync(process.execPath, ['--test'], { cwd: wt, encoding: 'utf8', env: ENV });
    assert.notStrictEqual(red.status, 0);
    git(['add', 'tests/sum.test.js'], wt);
    git(['commit', '-q', '-m', 'test: suma'], wt);
    const T = git(['rev-parse', 'HEAD'], wt);

    // 3. Implementer: registro con --test-ref, cambio, gate con --task, handback.
    r = script('run.js', ['task', '--id', 'sum-fix', '--test-ref', T, '--file', 'src/sum.js', '--agent', 'pignolo:implementer', '--cwd', main], main);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(stop(wt, 'pignolo:implementer').status, 2, 'sin sello no pasa');
    put(wt, 'src/sum.js', "'use strict';\nfunction sum(a, b) {\n  return a + b;\n}\nmodule.exports = sum;\n");
    const gate = script('gate.js', ['--level', 'on-done', '--task', '--cwd', wt], wt);
    assert.strictEqual(gate.status, 0, gate.stderr);
    assert.strictEqual(stop(wt, 'pignolo:implementer').status, 0);
    r = script('run.js', ['status', '--cwd', main], main);
    assert.strictEqual(r.json.handback.accepted, true);

    // 4. Piso de riesgo sobre el diff real.
    const risk = script('risk.js', ['--diff', base, '--cwd', wt], wt);
    assert.strictEqual(risk.json.reserved, false);

    // 5. Commit y revisión: congelado, ledger (vacío en riesgo bajo) y guardado.
    git(['add', 'src/sum.js'], wt);
    git(['commit', '-q', '-m', 'fix: suma'], wt);
    const sha = git(['rev-parse', 'HEAD'], wt);
    assert.strictEqual(script('ledger.js', ['frozen', '--cwd', wt, '--sha', sha], wt).status, 0);
    put(main, '.pignolo/tmp/lens-empty.json', '[]');
    const ledger = path.join(main, '.pignolo/tmp/ledger.json');
    r = script('ledger.js', ['build', '--sha', sha, '--level', risk.json.level, '--out', ledger, path.join(main, '.pignolo/tmp/lens-empty.json')], main);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(script('ledger.js', ['next', '--ledger', ledger], main).json.next, 'done');
    const saved = script('ledger.js', ['save', '--ledger', ledger, '--cwd', wt], main);
    assert.strictEqual(saved.status, 0, saved.stderr);
    assert.ok(fs.existsSync(saved.json.file));

    // 6. Merge a la rama de origen, fin del flujo, worktree fuera (limpia).
    put(main, '.pignolo/tmp/merge-msg.txt', 'merge: suma\n');
    git(['merge', '-q', '--no-ff', '-F', path.join(main, '.pignolo/tmp/merge-msg.txt'), 'task/daily/2026-09-30-sum-fix'], main);
    assert.strictEqual(git(['log', '-1', '--format=%s'], main), 'merge: suma');
    assert.strictEqual(script('run.js', ['end', '--cwd', main], main).status, 0);
    git(['worktree', 'remove', wt], main);
    assert.strictEqual(fs.readFileSync(path.join(main, 'src/sum.js'), 'utf8').includes('a + b'), true);
    assert.strictEqual(git(['status', '--porcelain'], main).includes('src/'), false);
  });
  ````

- [ ] **Paso 2: verde.** `node --test --test-reporter=dot tests/flow-lanes.test.js`.
- [ ] **Paso 3: rojo rompiendo lo que protege**, en una copia descartable de la worktree o restaurando desde la conversación principal: (a) quitar `'.gitignore'` de `IGNORED` en `scripts/run.js` → el caso `trivial` falla con `[ 'medium', 'daily', false ]` (medido); (b) quitar `.map(normFile)` → el caso `daily` falla al registrar el `test-writer` (`tests\sum.test.js` no está en `test-paths`; medido); (c) quitar `delete ENV.NODE_TEST_CONTEXT` → el rojo del orquestador sale 0 y el test falla en `assert.notStrictEqual(red.status, 0)` (medido). Anotar las tres salidas.
- [ ] **Paso 4: commit.** `test(flow): carriles trivial y daily de punta a punta por los scripts`.

---

## Ola 2

### Unión de la ola 1

- [ ] Unir las Tasks 14 a 18 a `core/hito-3b`. Archivos disjuntos; un conflicto es un error del plan y se registra.
- [ ] `npm run test:quiet` una vez: verde (esperado 1180 tests, 1178 pasan, 2 saltados).
- [ ] `claude plugin validate plugins/pignolo` sin errores.

### Task 19: cierre de la parte 3b

- [ ] **Spec** (sin cambiar contratos):
  - §2: las skills de flujo son invocables por el modelo; `disable-model-invocation` queda para las que cambian la configuración de pignolo (ruling).
  - §5.1–§5.2: cómo decide `entry`; `trivial` en el checkout principal y su escalamiento; `daily` con worktree en `.pignolo/worktrees/` y el orden de registro de 3a.
  - §6: `run.js task` valida y normaliza `--file`; `.pignolo/.gitignore` se ignora a sí mismo y cubre `tmp/` y `worktrees/`.
  - §12: salida `json` de los revisores; refuter antes de la reproducción; riesgo bajo sin lente; `judge-conflict` después de la evidencia; ledger en `~/.pignolo/reviews/`.
  - §15: diseño de las evals `agents` (graders sobre eventos del subagente, definición de recall y falso positivo, generador único, rama sonnet, fixer en WSL2) y el test determinista de los graders.
- [ ] **Versión y docs:** `plugin.json` a `0.4.0`; entrada `0.4.0` en el `CHANGELOG` con el motivo (los carriles existen y usan la capa 2 de 3a); README: qué hace cada carril en dos capas, que un flujo necesita `.pignolo/project.md` **commiteado** con `type` y `gates.on-done`, y que `.pignolo/worktrees/` y `.pignolo/tmp/` son de pignolo.
- [ ] **Checklist manual** `tests/manual/hito-3b.md` (sesión real, Windows nativo; sin datos del proyecto del autor en el repo):
  1. En un repo de prueba con `project.md` commiteado, un pedido de una línea: ¿Claude invoca `pignolo:entry` sin que se lo pidan, y `entry` elige `trivial`? Anotar si hubo que nombrarla.
  2. `trivial` completo: commit con trailers, `run.json` borrado al final, `git status` limpio (sin `.pignolo/.gitignore` a la vista).
  3. `daily` completo: worktree en `.pignolo/worktrees/`, `test-writer` sin Bash, rojo mostrado por el orquestador, `implementer` que corre `gate.js --task`, `run.js status` después de cada escritor, merge con pregunta `irreversible`.
  4. Un `implementer` que dice `DONE` sin sello: el handback-gate lo frena, y el orquestador lo trata como `BLOCKED` por `run.js status` aunque el informe diga `DONE`.
  5. Un subagente que intenta `node .../scripts/run.js end`: la guardia lo niega (regla `pignolo-run`).
  6. Riesgo `medium`: dos lentes en paralelo, sus bloques `json` copiados tal cual, ledger guardado en `~/.pignolo/reviews/`.
  7. Riesgo `high` con perfil `max`: 3 refuters, repro, un fixer y Judgment Day; resumen con los refutados listados.
  8. Cada mensaje al humano de los puntos 1 a 7 en dos capas, un paso por mensaje y con categoría. Anotar los que fallen.
  9. Abandonar un `daily` a mitad: la skill corre `run.js end` y `Explore` vuelve a pasar.
- [ ] **Suite y revisión final:** `npm run test:quiet`; una revisión final opus de `main..core/hito-3b` con el Review Focus; una pasada de arreglos; una confirmación acotada.
- [ ] **Evals — solo con la decisión del autor (abajo).** Con el tope que elija, en este orden y deteniéndose al primer problema:
  1. Generar: `node tests/evals/review-cases.js --out tests/evals/generated/opus`.
  2. **Sonda** (1 caso, 1 corrida, tope 1 USD): `claude plugin eval . --eval-dir tests/evals/generated/opus --case review-reliability-defect --runs 1 --ablation none --scaffold --trust-plugin --max-cost-usd 1 --json tests/evals/generated/probe.json`. Abrir el `trace_path` del resultado y contar las líneas con `"parent_tool_use_id":"toolu`: si son 0, el stream no trae al subagente, los graders no pueden aprobar y se frena todo (`BLOCKED`, sin más gasto). Verificar también que la sesión principal corrió en sonnet (`modelUsage`).
  3. **Calibración** (1 corrida por caso de revisor, 13 casos, tope 6 USD, incluida la sonda): `claude plugin eval . --eval-dir tests/evals/generated/opus --tag review --tag judges --tag refuter --runs 1 --ablation none --scaffold --trust-plugin --max-cost-usd 6 -j 2` (*hipótesis:* `--tag` repetido suma casos; si los intersecta, una corrida por etiqueta con el mismo tope total). Leer cada grader que falló en el trace antes de culpar al agente (un grader mal escrito se arregla en `review-cases.js` y en su test determinista). El caso del fixer, 1 corrida desde WSL2 con `--tag fixer --allow-tools Bash Edit Write`.
  4. **Corrida completa** (5 por caso) y **rama sonnet** (`--reviewer-model sonnet --out tests/evals/generated/sonnet`), solo si el autor las aprobó, con el tope que haya fijado y el costo por corrida medido en la calibración.
  5. Resultados en `tests/evals/RESULTS.md` (sección nueva: comando, casos, pasan/5, costo, modelo y effort), sin versionar `results/`.
- [ ] **Estado:** actualizar `docs/STATE.md` (qué quedó, resultado de las evals o su espera, siguiente: hito 4).
- [ ] **Unión y push:** unir a `main` en local; el push, como todo push del repo, solo con el OK del autor.

---

## Estimación de costo de las evals

*Hipótesis — sin medir en estas evals.* Tokens por corrida estimados a partir de la forma de cada caso (brief de ~2,5 k tokens, 1 a 3 archivos de ~15 líneas, 4 a 6 turnos del revisor; el fixer con ~12 turnos porque corre tests) y contrastados con lo medido en el hito 2 (explorer 0,11 USD por corrida, researcher opus 0,19). Precios de la API por millón de tokens (tabla de modelos de la skill `claude-api`, cacheada el 2026-09-25): **Opus 5.5** entrada 4, salida 20, lectura de caché 0,20; **Sonnet 5.5** entrada 2, salida 10, lectura de caché 0,20; escritura de caché = 1,25 × entrada.

| Parte de una corrida | Tokens (hipótesis) | Cálculo | USD |
|---|---|---|---|
| Sesión principal (sonnet): escritura de caché | 20 k | 20 k × 2,50 / M | 0,050 |
| Sesión principal: lecturas de caché y salida | 42 k lectura, 0,6 k salida | 42 k × 0,20 / M + 0,6 k × 10 / M | 0,014 |
| **Sesión principal** | | | **0,064** |
| Revisor opus `high`: escritura de caché | 16 k | 16 k × 5,00 / M | 0,080 |
| Revisor opus: lecturas de caché | 60 k | 60 k × 0,20 / M | 0,012 |
| Revisor opus: salida con razonamiento | 6 k | 6 k × 20 / M | 0,120 |
| **Caso de revisor en opus** | | 0,064 + 0,212 | **≈ 0,28** |
| **Caso de revisor en sonnet** | mismos tokens | 0,064 + (16 k × 2,50 + 60 k × 0,20 + 6 k × 10) / M | **≈ 0,18** |
| **Caso del fixer** (sonnet, `high`) | 25 k escritura, 200 k lectura, 8 k salida | 0,064 + (25 k × 2,50 + 200 k × 0,20 + 8 k × 10) / M | **≈ 0,25** |

| Corrida | Casos × corridas | Cálculo | Estimado | Rango (× 0,6 a × 1,5) | Tope propuesto |
|---|---|---|---|---|---|
| **Calibración** (incluye la sonda) | 13 revisores × 1 + fixer × 1 | 13 × 0,28 + 0,25 | **≈ 3,9 USD** | 2,3 a 5,8 | **6 USD** |
| **Completa en opus** | 13 × 5 + fixer × 5 | 65 × 0,28 + 5 × 0,25 | **≈ 19,5 USD** | 12 a 29 | **30 USD** |
| Rama sonnet (§7) | 13 × 5 | 65 × 0,18 | ≈ 11,7 USD | 7 a 18 | 18 USD |
| Todo | | 3,9 + 19,5 + 11,7 | ≈ 35 USD | 21 a 53 | 54 USD |

Lo que más mueve la cifra es la salida con razonamiento del revisor en `high` (43 % del caso en opus); la calibración la mide. El caso del fixer necesita WSL2: si no está, queda fuera y se descuentan 0,25 (calibración) o 1,25 USD (completa).

## Decisión pendiente del autor

**D-3b. Costo de las evals `agents` del hito 3** (§15; el costo es reservado, §4.1.3).

1. **Solo la calibración ahora** (tope 6 USD, ~3,9 estimado): sonda + 1 corrida por caso. Valida los graders y la hipótesis del trace y da el costo real por corrida; la corrida completa y la rama sonnet se deciden después con esa cifra. Reversible: no compromete nada más.
2. **Calibración + corrida completa en opus** (tope 36 USD, ~23 estimado): da el veredicto de §0 d (≥ 4 de 5 por caso) para lentes, refuter, jueces y fixer en este hito.
3. **Todo, con la rama sonnet** (tope 54 USD, ~35 estimado): además decide si `economy` puede pasar los revisores a sonnet (§7).

**Recomendación: 1.** La sonda frena el gasto en 1 USD si el trace no trae al subagente, y la calibración convierte esta tabla de hipótesis en una cifra medida antes de gastar el resto; lo que no aporte la corrida completa en este hito (los umbrales de §0 d se miden de nuevo en el hito 8) no se pierde por esperar.
