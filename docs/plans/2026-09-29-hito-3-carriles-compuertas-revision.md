# Hito 3 del núcleo, parte 3a: núcleo determinista (riesgo, compuerta y sellos, handback-gate, marca de flujo, ledger). Plan de implementación

> **Para quien ejecute:** usar superpowers:subagent-driven-development con el método de ejecución de abajo (olas en paralelo, sin revisión por tarea, una revisión final opus). Los pasos usan casillas (`- [ ]`).

**Objetivo:** que pignolo tenga, en scripts y hooks sin dependencias, todo lo que el hito 3 necesita para decidir sin creerle a un agente: el piso de riesgo (`scripts/risk`), la compuerta con sello fuera de todo hook (`scripts/gate`), el `handback-gate` que acepta `DONE` solo con sello e integridad, el ciclo de vida de `.pignolo/run.json` y la lógica del ledger de revisión (refuters, Judgment Day, rondas). Las skills de carriles y de revisión (texto) quedan para la parte 3b, que las monta encima de esto.

**Arquitectura:** tres módulos de contrato en la ola 0 (`lib/yaml-lite.js` + `lib/globs.js` + `lib/project-config.js` para leer `.pignolo/project.md`; `lib/changes.js` + `lib/seals.js` para árbol, diff y sellos; `lib/project.js` con la raíz principal y el registro del flujo). Encima, en paralelo: `lib/risk.js` + `scripts/risk.js`, `lib/gate.js` + `scripts/gate.js`, el handler `handback-gate`, `scripts/run.js`, `lib/ledger.js` + `scripts/ledger.js` y el guardado de los conflictos de reglas de `setup`. Los handlers siguen el contrato del launcher: `run(input, ctx) → { exit, stdout?, stderr? }`, plazo interno de 3 s.

**Stack:** Node ≥ 20 sin dependencias npm, `node:test`, git ≥ 2.31, hooks de Claude Code.

**Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md`: §1 (principios 1–3 y 5), §3.2 (`project.md`), §4.1–§4.4 (reservadas, detección, autónomas, categorías), §4.6 (dos capas en todo texto al humano), §5.1–§5.2 (carriles), §6 y §6.1 (marca `run.json`; `test-writer` sin Bash), §7 (parámetros por perfil), §8.2 (capa 2: compuerta y sellos), §8.3 (handback-gate), §9 (tests), §11.1 (nombres de rama), §11.5, §12 (revisión y ledger), §13, §15 (`risk`, `gates`, `agents`), §16 y §18, hito 3.

## Alcance: por qué el hito 3 se parte en dos

El hito 3 de §18 junta dos cosas de naturaleza distinta: código determinista (capa 2 y capa 3) y skills de texto con evals de agentes que cuestan dinero. En un solo plan serían ~16 tareas, dos tipos de revisión y una corrida de evals que necesita el OK de costo del autor en el medio. Se parte en:

- **3a (este plan):** todo lo determinista. Termina con los tests `risk` y `gates` de §15 en verde, sin evals y sin costo de tokens de agentes.
- **3b (plan siguiente, no escrito acá):** ver "Qué cubre la parte 3b" al final. Carriles `trivial`/`daily`, skill de revisión, Judgment Day como flujo, lazo del `fixer` y las evals `agents` (lentes, refuter, jueces, fixer).

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
  - `isFrozen(ledger, headSha) → boolean` (§12: "cambios posteriores invalidan la revisión").
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

---

## Qué cubre la parte 3b (plan siguiente)

Se escribe cuando 3a esté unido, sobre sus interfaces reales:

1. **Skill `entry`** (§5.1): ¿autoriza un cambio? → `scripts/risk.js --files-from` → carril. Un hallazgo nunca amplía la autorización.
2. **Skill `trivial`** (§5.2): `run.js start --flow trivial` → cambio → `gate.js --level on-done` → `risk.js --diff` (`maxRisk`; si sube, se frena y se cambia de carril) → commit → `run.js end`.
3. **Skill `daily`** (§5.2, §11.1): rama `task/daily/<fecha>-<slug>`; explorar inline (1–3 archivos) o `pignolo:explorer` (4+); **orden fijo de 3a**: `run.js task --id X --base <B> --file <tests…> --agent pignolo:test-writer` **antes** del `test-writer` → `test-writer` → el orquestador demuestra el rojo (el `test-writer` no tiene Bash) y commitea (T) → `run.js task --id X --test-ref T --file <src…> --agent pignolo:implementer` → `implementer` (con el handback-gate de 3a); **después de cada escritor, `run.js status`**: si el contador de la tarea está `blocked` o sin aceptar, la tarea es `BLOCKED` aunque el informe diga `DONE`; `run.js renew` antes de cada despacho; revisión según riesgo; commit por unidad de trabajo; merge a la rama de origen confirmado en lote, a `main` uno por uno (§4.4). Continuación automática como máximo 2 veces (§6.1).
4. **Skill `review`** (§12): candidato congelado (SHA), `ledger.js plan`, lentes en paralelo según perfil, `test-writer` convierte `repro-spec` en test y `applyRepro`, refuter(s) con `refutation`, lazo del `fixer` (máx. 2 rondas, re-revisión sobre ledger + delta), persistencia del ledger aunque quede vacío, refutados listados en el resumen.
5. **Skill `judgment`** (Judgment Day, §12, §7): dos jueces ciegos en paralelo sobre el mismo SHA; `ledger.js judgment`; `judge-conflict` como pregunta; `APPROVED | ESCALATED`.
6. **Plantillas** `templates/task-card.md` y `templates/review-ledger.md` (§2), y el formato de preguntas de §4.4 con las **dos capas** de §4.6 en todo texto al humano (pregunta, resumen de cierre, `needs-review-batch`).
7. **Decisiones autónomas** a `.pignolo/state/decisions/` (§4.3) en su forma mínima, si el hito 6 no la adelanta.
8. **Evals `agents`** de §15 para lentes (diff con defecto y diff limpio), refuter (hallazgo falso), jueces y fixer, con graders deterministas, `--ablation none`, ≥ 5 corridas por caso, y la corrida de revisores también en sonnet `high` (§7, §15). El `fixer` tiene Bash: su suite requiere WSL2 (§15). **Cada corrida necesita el OK de costo del autor.**
9. Checklist manual de los carriles en una sesión real.

**Pregunta al autor al escribir 3b (costo de las evals, no se decide en este plan).** Casos mínimos de §15: 4 lentes × (diff con defecto + diff limpio) = 8, refuter 1, jueces 2, fixer 1 → 12 casos × 5 corridas = 60 corridas; más la corrida de revisores en sonnet `high` (lentes, refuter y jueces: 11 casos × 5 = 55). Estimación gruesa (hipótesis, sin medir: el hito 2 costó 1,83 USD por 10 corridas de agentes livianos, y los revisores opus leen más): 20–40 USD en opus más 8–15 USD la comparación en sonnet. Opciones a presentar: A) todo, con tope de 60 USD; B) solo opus (tope 40 USD) y la comparación en sonnet cuando se quiera bajar `economy`; C) una corrida por caso primero (~10 USD) para calibrar y decidir el resto con la cifra real. Recomendación tentativa: C y después B.

## Decisiones que necesita el autor

**D1. Unión y push de 3a a `main`** (irreversible, §4.1.5). Opciones: unir y pushear al terminar la revisión final; unir en local sin push; dejar la rama. **Recomendación:** unir en local tras la revisión final; el push lo hace el orquestador solo con el OK del autor (junto con el hito 2, que también espera el push).
