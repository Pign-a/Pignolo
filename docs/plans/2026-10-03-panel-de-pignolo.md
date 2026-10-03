# Panel de pignolo: del prototipo `local/pignolo-panel` al repo. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, una revisión final opus con una pasada de arreglos (CLAUDE.md). Las tarjetas dan archivos, interfaces y casos de test literales. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Origen:** prototipo aprobado visualmente por el autor (2026-10-03), fuera de git en `local/pignolo-panel/` (37 tests `claude plugin test`; informes `mod-panel-report.md` y `mod-panel-v2-report.md` del job). Mod de Claude Code ≥ 2.1.287: banda sobre el prompt, panel `/pignolo-panel` (Ahora, Ramas, Costo), sugerencia del siguiente paso. Solo lee y dibuja; **no toca lo que dibuja Claude Code**, no aprueba ni niega nada.
>
> **Versión:** núcleo **0.18.0** (main está en 0.15.0; los planes de la guardia en curso usan 0.16.x y 0.17.0). Si cambia el orden de unión, se renumera: solo cambian los números (T7). El plugin del panel arranca en **0.1.0** propio.

## Prerrequisitos (Task 0, sin código)

- `main` en `18f62d5` o posterior. Releer sobre `main`: `lib/next.js` (`deriveNext`, `planList`), `scripts/next.js`, `lib/project.js` (`readRun`, `taskList`), `lib/plan-state.js` (`writeAtomic`, `update`), `lib/decisions.js`, `lib/gate.js` / `lib/seals.js` (resultado de la suite), `lib/ledger.js` (veredicto de la revisión), `lib/queue.js` (`last.json`), `lib/pignolo-gitignore.js`, `hooks/hooks.json` y el handler de `SessionStart`.
- **Sondas con `claude` real (antes de T4, resultados a un archivo del job; son la base de la recomendación de dónde vive el mod):** (S1) un `hooks/hooks.json` con la clave `modules` cargado en un Claude Code **anterior** a 2.1.287: ¿ignora la clave, avisa o descarta **todo** el archivo (incluida la guardia)? (S2) `claude plugin validate` y `claude plugin test`: ¿piden red o sesión?, ¿qué imprime la lista `calls:`? (S3) ¿existe un campo de versión mínima de Claude Code en `plugin.json`? Un resultado que no se pueda obtener se anota "no probado" y manda la opción más conservadora.

## Alcance

- **Adentro (7 tarjetas):** registro de estado (`.pignolo/panel-state.json`, versionado, escritura atómica) y quién lo escribe; `/pignolo:status` en texto; reglas del siguiente paso en un solo lugar (núcleo) con test por regla; el mod como plugin del repo; respuesta de "Te toca" que se envía; tests de confianza; los cuatro pendientes del prototipo; versión y documentos.
- **Afuera:** que el mod apruebe, niegue, edite o ejecute algo; costo por agente estimado con una tabla de precios (R-P8); publicar el plugin en el marketplace (decisión del autor); abrir el panel solo (queda opcional, apagado: Q2); cambios a la guardia.

## Decisiones del autor ya tomadas

- **D-P1:** el mod solo lee y dibuja; no toca lo que dibuja Claude Code.
- **D-P2 (2026-10-03, corrección posterior):** al contestar una pregunta de "Te toca" la respuesta **se envía** (no se pega en el prompt), con contexto. Formato exacto: `Respuesta a la decisión <id> ("<pregunta>"): <opción elegida>.` enviada con `$.prompt.submit({ text, asUser: true })`. **Solo** para las respuestas de "Te toca": el siguiente paso sigue siendo sugerencia (`prompt.suggest`) y sus botones siguen llenando el prompt sin enviar.
- **D-P3:** la respuesta marca la decisión como respondida en el registro para que deje de aparecer (R-P4).

## Rulings técnicos (registrados)

- **R-P1: un solo registro, que escribe pignolo y lee el mod.** `<main>/.pignolo/panel-state.json` (raíz principal vía `mainRoot`, así las worktrees de tareas escriben en el mismo). No va a git (se suma a `lib/pignolo-gitignore.js`). *Por qué:* el mod no tiene `process` ni escritura de archivos (R-P6); todo lo que necesita saber se lo deja pignolo hecho, incluida la sugerencia. El prototipo deja de leer `.git`, `run.json` y `plan.json` por su cuenta: una sola fuente, sin reglas duplicadas.
- **R-P2: lo derivable se recalcula, lo que no existe en otro lado se anota.** `refresh(main)` reconstruye plan, ramas, tarjetas y `next` desde las fuentes que pignolo ya guarda (`plan.json`, `run.json`, cola, ledger de revisión, sello de la suite, refs de git). Los eventos solo agregan lo que no se guarda en otro lado: decisiones pendientes y evidencia rojo/verde. *Por qué:* si a un script se le olvida llamar al registro, el estado igual sale bien en el siguiente `refresh`; un evento perdido nunca deja un estado mentiroso.
- **R-P3: formato `pignolo-panel-state/1`**, un objeto JSON, UTF-8 sin BOM, LF, máximo 64 KB (lo que pasa se recorta, nunca se rechaza todo):
  - `schema` (`"pignolo-panel-state/1"`), `updated` (ISO), `pluginVersion`.
  - `plan`: `{ slug, stage, request }` (`request` ≤ 160 caracteres) o `null`.
  - `decisions[]`: `{ id, question, options[≤4], recommended, context, status: "open"|"answered", askedAt, answeredAt?, answer? }`. `id` es `Q-<n>` (pignolo asigna el siguiente libre; no se pisa con las `D-<n>` de diseño de `plan.js decision`).
  - `branches[]`: `{ name, stage: plan|execution|review|fixes|suite|merge, review: none|APPROVE|CHANGES, suite: none|green|red, commits, waiting, merged, costOk?: { usd?, ok } }`.
  - `cards[]`: `{ id, plan, title, status: todo|running|done|failed, red, green, evidence }` (`red` y `green` una línea de ≤ 80 caracteres, p. ej. `falla: comillas` / `12/12`).
  - `main`: `{ ahead }` (commits de `main` sobre `origin/main`, o `null` si no se sabe).
  - `next`: `{ rule, key, text, prompt, costNote, why, alternatives[≤2] }` o `{ none: "busy"|"ambiguous"|"cost"|"attention"|"nothing" }`.
  - Sin datos privados: ninguna ruta absoluta, ni directorio del usuario, ni salida cruda de comandos (`sanitize` recorta a una línea y reemplaza rutas por su forma relativa); la fixture y los tests del repo son sintéticos (el repo es público). El archivo es local y está fuera de git.
- **R-P4: cómo se marca "respondida" y quién escribe.** El mod no escribe. Al apretar el botón, el mod (a) envía el mensaje (D-P2) y (b) oculta la decisión en memoria al instante (feedback). El que **escribe** en el registro es un handler de `UserPromptSubmit` del núcleo (`hooks/handlers/panel-answer.js`): si el texto del prompt cumple `^Respuesta a la decisión (Q-\d+) \("(.*)"\): (.+)\.$`, el `id` existe y está `open`, y la respuesta es una de sus `options` (o la opción libre "Otra"), pone `status: "answered"`, `answer` y `answeredAt` (momento: cuando el prompt llega, antes de que el agente lo procese). *Por qué un hook y no el agente:* no depende de que el modelo obedezca; también marca si el usuario escribe a mano ese texto (es un acto suyo). Es **mejor esfuerzo y falla abierto** (nunca niega ni demora un prompt; no es parte de la guardia). Respaldo: la skill `entry` dice que un mensaje que empieza con `Respuesta a la decisión` es la respuesta del usuario y se la trata como cita literal (si era una decisión de diseño, `plan.js decision add` la usa como `--quote-file`).
- **R-P5: quién escribe cada cosa** (todas por `lib/panel-state.js`, un solo módulo, no por scripts sueltos):
  | Dato | Escribe | Cuándo |
  |---|---|---|
  | decisión abierta | `scripts/panel.js ask --question-file --option ... --recommended --context-file` (la llaman las skills y agentes cuando algo es del autor y no bloquea el chat: costo sin OK, hallazgo que depende de él) | al detectarlo |
  | decisión respondida | handler `UserPromptSubmit` (R-P4) | al enviarse la respuesta |
  | plan y etapa | `refresh` desde `plan.js advance`, `plan.js new` | en cada avance |
  | ramas y etapas | `refresh` desde `run.js start/end/task-end`, `queue.js` (entrada, `pre-merge`, revert), `review` (veredicto al guardar el ledger), `gate.js` (sello de suite), `cleanup.js` | al terminar cada comando |
  | evidencia rojo/verde de una tarjeta | `panel.js evidence --card --red --green` llamado por `sabotage.js` (rojo) y `gate.js` (verde), con el resumen de una línea | al producirse |
  | ramas unidas | `refresh` (`merged` = `git branch --merged main`, solo lectura) | al unir por la cola |
  | `next` | `refresh` con `lib/next-steps.js` (R-P7) | siempre el último paso del `refresh` |
- **R-P6: escritura atómica y concurrente.** Archivo temporal en el mismo directorio + `rename`; un lock corto `O_EXCL` (`.pignolo/tmp/panel.lock`, reintento hasta 2 s, vencido a los 10 s) para que dos tareas de una ola no se pisen; un archivo ilegible se reconstruye con `refresh` (las decisiones abiertas ilegibles se pierden: se avisa en stderr). Un fallo del registro **nunca** hace fallar el comando que lo llamó (try/catch, salida 0).
- **R-P7: un solo lugar para las reglas del siguiente paso.** `lib/next-steps.js` (puro): recibe los hechos del `refresh` y devuelve `next`. Reemplaza `next-rules.js` del prototipo (el mod ya no tiene reglas: muestra `next` del registro). `deriveNext` (texto de `next.js`/`status`) se mantiene y sus `kind` se mapean: los de "algo corre" (`task-in-progress`, `wave-partial`, `queue-busy-dead`) dan `none: "busy"`; los de "algo anda mal" (`task-blocked`, `queue-conflict`, `run-malformed`, `sabotage-pending`, `flow-expired-task`, `plan-unreadable`) dan `none: "attention"` (se muestran en "Te toca" como texto, nunca como sugerencia para enviar); los `plan-<etapa>` y las ramas dan reglas. Niveles: 1 decisión abierta, 2 unir (APPROVE y suite verde), 3 revisar (rama con commits sin revisión), 4 push de `main`, 5 tarjeta siguiente. **No sugiere** cuando: hay algo corriendo (agente, tarea, lock de cola vivo, tarjeta `running`); hay dos candidatos en el mismo nivel (ambiguo); el paso cuesta plata y no hay `costOk.ok` (con OK lo dice en `costNote`); la rama espera al usuario; no hay evidencia suficiente (p. ej. `main.ahead` desconocido). La sugerencia solo *llena* el cuadro: nunca se envía.
- **R-P8: costo por agente = tokens y minutos, sin plata inventada.** La API no da costo por agente; una tabla de precios en el repo queda vieja. El panel muestra tokens y minutos por agente y el costo real solo de la sesión (`session.usage`). Si el autor quiere una estimación, es otra decisión (Q5).
- **R-P9: la respuesta se envía una sola vez y solo desde el botón.** `prompt.submit` vive en un único archivo (`hooks/answer.js`, función `submitAnswer`), que solo se llama desde el manejador de pulsación del botón de una opción de "Te toca". El texto sale del registro (pregunta recortada a 120 caracteres, sin saltos de línea ni comillas dobles, opción tal cual); la opción libre "Otra" **no se envía**: llena el prompt con `Respuesta a la decisión <id> ("<pregunta>"): ` para que el usuario escriba y envíe. Tras enviar: toast "Enviado", la decisión se oculta en memoria (R-P4) y no se reenvía si el registro todavía la trae abierta (clave `id` + `answeredAt` local).

## Dónde vive el mod (recomendación) y versión mínima

**Recomendación: plugin aparte, `plugins/pignolo-panel/`, en el mismo repo y marketplace; el núcleo `pignolo` no lleva mod.** El registro y las reglas (lo que importa) viven en el núcleo y sirven sin el mod.

| | Dentro de `plugins/pignolo/` (`hooks.json` gana `modules`) | Plugin aparte `pignolo-panel` |
|---|---|---|
| A favor | una instalación; versión única | **la guardia no comparte archivo con el mod**: una clave desconocida en `hooks.json` en un Claude Code viejo no puede romper `hooks.json` entero (sonda S1); instalar el panel es opcional y explícito; su lista `calls:` se valida sola; versión y revisión propias; se apaga desinstalando sin tocar la guardia |
| En contra | si Claude Code viejo rechaza `modules`, **se cae la guardia** (riesgo inaceptable); todo usuario carga un mod que no pidió; el `calls:` del núcleo mezcla la guardia con la confianza del mod | dos instalaciones; dos versiones (`CHANGELOG` propio); el usuario sin núcleo ve un panel vacío (se lo dice: "pignolo no está activo en este proyecto") |

- **La guardia no depende del mod:** los mods se apagan con `--safe-mode` o `disableAllHooks`; el panel no es parte de ninguna garantía. Un test de regresión confirma que `plugins/pignolo/hooks/hooks.json` no tiene `modules` (T4).
- **Versión mínima 2.1.287** (la del prototipo). Declarada donde Claude Code lo permita (sonda S3) y siempre en el README y en `userConfig` descripción. **Con una versión vieja** el mod no carga (o la clave se ignora) y nada se rompe: el plugin aparte no tiene hooks de settings, así que no hay nada más que pueda fallar; el registro y `/pignolo:status` siguen andando. Se prueba en S1/S2 y la prueba manual de T7.
- Si S1 muestra que una clave `modules` desconocida es inofensiva, la opción "dentro" sigue sin ganar (el segundo y tercer "en contra" valen igual): la recomendación no cambia salvo decisión del autor (Q1).

## Global Constraints

- Node ≥ 22, **sin dependencias npm**; tests del repo con `node:test` vía `npm test` (no `node --test tests/`); nombres de elementos en inglés, mensajes al usuario en español, commits en español, LF sin BOM, un archivo de test por vez.
- El registro nunca guarda rutas absolutas, nombres de usuario, credenciales ni salida cruda; el mod no manda nada afuera.
- Un fallo del registro no rompe ningún comando existente. Un `refresh` es idempotente.
- Lo que el usuario ya tiene en `.pignolo/` no se reescribe salvo `panel-state.json` y el lock.

## Método de ejecución

- **Rama:** `core/panel` desde `main` (núcleo) y, tras T3, T4 a T6 sobre la misma rama (un solo ejecutor en serie). Un commit por tarjeta.
- **Orden:** T1 → T2 → T3 → T4 → T5 → T6 → T7 → revisión opus de `main..core/panel` (T2 toca `UserPromptSubmit` y la guardia convive en `hooks.json`; T5 toca `prompt.submit`: **revisión propia, no se agrupa**) → una pasada de arreglos → suite completa una vez, sobre la rama unida con `main` → unión → **0.18.0**.
- **Auditoría previa del plan:** no (no toca guardia ni borra; el hook nuevo falla abierto y solo lee el prompt). Si la revisión ve que `UserPromptSubmit` roza la guardia, se pide.
- **Autochequeo del ejecutor (con evidencia, máximo 5):** (1) rutas con otra capitalización, junctions y symlinks: `panel-state.json` no se escribe fuera de `<main>/.pignolo/`; (2) un `panel-state.json` que no es UTF-8, vacío o con otra `schema` no tira ni al script ni al mod; (3) lectores con la forma vieja: el mod no lee `.pignolo/run.json`, `plan.json` ni `.git` (`grep` sin resultados); (4) `hooks.json` del núcleo sigue válido y sin `modules`; (5) cada afirmación del informe marcada "probado" o "no probado".

## Tarjetas

### T1 — registro de estado (`lib/panel-state.js`, `scripts/panel.js`)

- [ ] **Archivos:** `plugins/pignolo/lib/panel-state.js`, `plugins/pignolo/scripts/panel.js`, `plugins/pignolo/lib/pignolo-gitignore.js` (suma `panel-state.json`), `tests/panel-state.test.js`, `tests/panel-script.test.js`, `tests/fixtures/panel-state.sample.json` (sintética, la del prototipo adaptada a `schema`).
- [ ] **Interfaces:**
  - `lib/panel-state.js`: `read(main) -> { state, problems[] }` (nunca tira; sin archivo = estado vacío); `normalize(raw)` (recorta y descarta lo que no tiene forma; `schema` distinta = estado vacío + problema `schema-unknown`); `sanitize(text, { max })` (una línea, rutas absolutas fuera); `update(main, fn)` (lock + temporal + `rename`, R-P6); `ask(main, {...}) -> { id }`; `answer(main, { id, answer, now }) -> { ok, reason? }`; `evidence(main, { card, red, green })`; `refresh(main, { now, git }) -> state` (R-P2).
  - `scripts/panel.js`: `show [--json|--text]`, `refresh`, `ask`, `answer`, `evidence`. Salida 0 salvo uso incorrecto (2).
- [ ] **Casos de test (nombres literales):**
  - `panel-state: read of a missing file gives an empty state without throwing`
  - `panel-state: a file that is not UTF-8, empty or with another schema gives an empty state and a problem`
  - `panel-state: normalize drops items without id or question and clips options to 4 and text to its limits`
  - `panel-state: sanitize keeps one line and replaces absolute paths and the user directory` (autochequeo 1)
  - `panel-state: update writes through a temporary file and rename, and the file is valid JSON at every moment` (lector en bucle mientras se escribe)
  - `panel-state: two concurrent updates both survive` (dos procesos hijos, lock)
  - `panel-state: a stale lock of 10 seconds is taken over`
  - `panel-state: ask assigns the next free Q-id and never reuses an answered one`
  - `panel-state: answer needs an open id and an answer that is one of its options or the free one`
  - `panel-state: answer twice leaves the first answer and reports already-answered`
  - `panel-state: evidence keeps one line of 80 characters for red and green`
  - `panel-state: refresh derives plan, branches and cards from the real stores and survives a missing event` (proyecto sintético con `plan.json`, `run.json`, cola y refs)
  - `panel-state: refresh marks merged only for branches already in main`
  - `panel-state: the file stays under 64 KB with 200 branches`
  - `panel script: show --text prints plan, open decisions and next in plain text`
  - `panel script: a failing registry exits 0 when called from another command` (guarda: R-P6)
  - `gitignore: panel-state.json is ignored by the pignolo ignore block` (guarda de regresión)
- [ ] **Rojo:** escribir directo sin temporal (rompe "valid JSON at every moment"); quitar el lock (rompe "both survive"); `answer` sin chequear la opción.

### T2 — quién escribe: llamadas desde los scripts, `UserPromptSubmit` y `/pignolo:status`

- [ ] **Archivos:** llamadas de una línea (`panelRefresh(main)`, protegida) en `scripts/plan.js`, `scripts/run.js`, `scripts/queue.js`, `scripts/gate.js`, `scripts/sabotage.js`, `scripts/cleanup.js` y donde se guarda el ledger de revisión; `plugins/pignolo/hooks/handlers/panel-answer.js`, `hooks/launcher.js` (evento `panel-answer`), `hooks/hooks.json` (suma `UserPromptSubmit`; **convive** con los hooks actuales, no los toca), `skills/status/SKILL.md` (paso 4: `panel.js show --text`, solo si hay algo), `skills/entry/SKILL.md` (una línea: R-P4 respaldo), tests `tests/panel-writers.test.js`, `tests/panel-answer-hook.test.js`, `tests/hooks-json.test.js` (existente, se extiende).
- [ ] **Casos de test:**
  - `writers: plan.js advance, run.js start, queue.js pre-merge and gate.js each leave panel-state.json refreshed` (uno por comando)
  - `writers: sabotage.js records the red line and gate.js the green line for the card of the task`
  - `writers: a card closed during executing shows done after run.js task-end` (cierra el pendiente 4 del prototipo, R-P2)
  - `writers: a broken panel-state.json does not change the exit code of plan.js advance`
  - `panel-answer hook: a prompt that matches the format marks the decision answered with answer and answeredAt`
  - `panel-answer hook: an unknown id, an answer that is not an option or text that only looks similar leaves the state untouched`
  - `panel-answer hook: it never denies, never rewrites the prompt and exits 0 on any input` (JSON roto, vacío, no UTF-8)
  - `panel-answer hook: the free option Otra is accepted as answer`
  - `hooks.json: UserPromptSubmit is added and every guard hook it had before is still there unchanged` (guarda de regresión: compara la lista previa)
  - `status skill: shows the panel text only when there is something and still only reads`
- [ ] **Rojo:** hacer que el hook devuelva `deny` en un error; quitar un hook previo de `hooks.json`; sacar la llamada de `gate.js`.

### T3 — las reglas del siguiente paso en un solo lugar (`lib/next-steps.js`)

- [ ] **Archivos:** `plugins/pignolo/lib/next-steps.js`, `plugins/pignolo/lib/next.js` (usa `kind` → regla, R-P7), `plugins/pignolo/scripts/next.js` (suma `suggest` al JSON), `tests/next-steps.test.js`, `tests/next.test.js` (extiende).
- [ ] **Interfaz:** `nextStep(facts) -> { main, alternatives, none }` (puro; `facts`: `busy`, `decisions[]`, `branches[]`, `main`, `plan`, `cards[]`, `attention[]`); `suggestionText(step)`; niveles `decision < merge < review < push < card`.
- [ ] **Casos de test (uno por regla y por "no sugerir"):**
  - `next-steps rule decision: an open decision gives its question with the recommended answer`
  - `next-steps rule merge: APPROVE with a green suite gives "uní <rama> a main"`
  - `next-steps rule merge: APPROVE with a red or missing suite does not suggest merging`
  - `next-steps rule review: a branch with commits and no review gives "revisá <rama>" and says the review costs an opus run`
  - `next-steps rule push: main ahead of origin and nothing running gives "hacé push de main"`
  - `next-steps rule push: unknown ahead does not suggest`
  - `next-steps rule card: the first todo card gives "seguí con <id>" when nothing is before it`
  - `next-steps does not suggest while an agent, a task, a live queue lock or a running card exists` (`none: "busy"`)
  - `next-steps does not suggest with two candidates at the top level` (`none: "ambiguous"`; dos ramas sin revisar, dos decisiones)
  - `next-steps does not suggest a step with new cost and no approval, and says the cost when approved` (`none: "cost"`)
  - `next-steps does not suggest for a branch that waits for the user`
  - `next-steps: attention kinds (task-blocked, queue-conflict, run-malformed, sabotage-pending, flow-expired-task, plan-unreadable) never become a suggestion` (`none: "attention"`, una fila por `kind`)
  - `next-steps: the order is decision, merge, review, push, card and gives at most 2 alternatives`
  - `next.js: the JSON keeps kind, text and facts as before and adds suggest` (guarda de regresión de los tests existentes de `deriveNext`)
- [ ] **Rojo:** invertir el orden de dos niveles; quitar el chequeo de `costOk`; tratar `ambiguous` como el primero.

### T4 — el mod pasa al repo como plugin `pignolo-panel`

- [ ] **Archivos:** `plugins/pignolo-panel/.claude-plugin/plugin.json` (0.1.0, `userConfig.demo` y `userConfig.autoOpen` default `false`), `plugins/pignolo-panel/hooks/hooks.json` (`{"modules": ["./register.js"]}`), `hooks/register.js` (del prototipo, **sin** lectura de `.git`, `run.json` ni `plan.json`; lee solo `panel-state.json` y su `schema`), `hooks/model.js`, `hooks/state.js` (queda con `normalize` del registro, barras, etapas y minigráfico; `deriveGit`, `parseHead`, `parsePackedRefs`, `parseReflog` y `next-rules.js` **se borran**: viven en el núcleo), `plugins/pignolo-panel/sample/panel-state.json` (= la fixture de T1), `plugins/pignolo-panel/README.md`, `.claude-plugin/marketplace.json` (entrada **solo con OK del autor**, Q1: se publica en T7 únicamente si lo da), `tests/panel-plugin-layout.test.js`.
- [ ] **Comportamiento:** banda y panel como en el prototipo (Ahora, Ramas, Costo; tecla `0` reabre, `Esc` cierra); "Siguiente" muestra `state.next` y deja `prompt.suggest` con su texto; sin `panel-state.json` o con una `schema` desconocida dibuja una sola línea "pignolo no está activo en este proyecto" (o "actualizá el panel", si la `schema` es mayor). El panel no se abre solo salvo `autoOpen` y terminal ancha (Q2).
- [ ] **Casos de test:**
  - `layout: plugin.json has name, version 0.1.0 and no settings hooks` (`hooks/hooks.json` solo tiene `modules`)
  - `layout: the core hooks.json has no modules key` (guarda de que la guardia no comparte archivo con el mod)
  - `layout: the mod reads only panel-state.json` (`grep` sobre `register.js`/`state.js`: ni `.git` ni `run.json` ni `plan.json`; autochequeo 3)
  - `mod: no registry gives one line saying pignolo is not active here and draws nothing else`
  - `mod: an unknown or greater schema gives a one-line notice and does not throw`
  - `mod: the band shows plan, progress, agents, open decisions, cost and next step` (portados de los del prototipo)
  - `mod: next comes from the registry and the mod has no rule of its own` (no existe `next-rules.js`)
  - `mod: auto-open is off by default and opens only with autoOpen on a wide terminal`
- [ ] **Rojo:** volver a leer `.git` desde el mod; agregar `modules` al `hooks.json` del núcleo.

### T5 — responder desde "Te toca" y tests de confianza

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/answer.js` (único lugar con `prompt.submit`), `hooks/register.js` (botón por opción de cada decisión abierta; "Otra" llena el prompt), `plugins/pignolo-panel/tests/panel.test.ts` (portado: 37 del prototipo + los nuevos), `tests/panel-trust.test.js` (node:test, sin Claude Code).
- [ ] **Interfaz:** `submitAnswer($, decision, option) -> Promise<boolean>`: arma el texto `Respuesta a la decisión <id> ("<pregunta>"): <opción>.` (R-P9) y llama a `$.prompt.submit({ text, asUser: true })`; `answered` en memoria evita el reenvío.
- [ ] **Lista de `calls:` permitida** (lo que `claude plugin validate` debe mostrar, y nada más): `fs.read`, `fs.exists`, `fs.list`, `clock.now`, `clock.every`, la interfaz (`ui.*`, `session.cwd`, `plugin.root`), `prompt.suggest`, `prompt.fill`, `prompt.submit`, `session.usage`.
- [ ] **Casos de test de confianza (`node:test`, estáticos; el repo no necesita Claude Code para correrlos):**
  - `trust: the mod sources never reference process, http, fetch, shell, spawn, tool.check, tool.approve or tool.deny` (regex sobre todo `hooks/*.js`; falla si aparece alguno)
  - `trust: prompt.submit appears exactly once in the package, inside answer.js`
  - `trust: submitAnswer is referenced only inside the press handler of a decision option button` (no dentro de un `$.on(`, de `clock.every`, de `prompt.suggest`, del refresco ni del código del siguiente paso)
  - `trust: the declared calls list is a subset of the allowed list` (lee la salida de `claude plugin validate` si `claude` existe; si no, la deduce del código y lo dice)
  - `trust: the package has no network access and no dependencies` (sin `package.json` con `dependencies`)
- [ ] **Casos de test en `claude plugin test` (`panel.test.ts`):**
  - `answer: pressing an option sends the exact text with asUser true and calls submit once` (compara con la cadena literal `Respuesta a la decisión Q-1 ("¿...?"): plantilla corta.`)
  - `answer: the question is clipped to 120 characters and loses newlines and double quotes`
  - `answer: the option Otra fills the prompt and sends nothing`
  - `answer: after sending, the decision disappears and a second press does not send again`
  - `answer: turn, agent.spawn, agent end events and the clock tick never call submit` (espía en 0)
  - `answer: the next-step button and its alternatives fill or suggest and never call submit`
  - `answer: a prompt that cannot be submitted shows a toast and keeps the decision`
- [ ] **Rojo:** llamar a `submit` desde el handler del botón del siguiente paso (rompe "never call submit" y el estático); poner `prompt.submit` en un segundo archivo.

### T6 — correr los tests, y lo que el prototipo dejó sin resolver

- [ ] **Archivos:** `tests/panel-plugin-cli.test.js` (envoltorio `node:test`), `package.json` (script `test:panel`), `plugins/pignolo-panel/tests/panel.test.ts`, `docs/gaps.md`, `plugins/pignolo-panel/README.md` ("Sin resolver").
- [ ] **Cómo encaja con `npm test`:** `npm test` **no** requiere Claude Code. `panel-plugin-cli.test.js` hace `skip` con motivo visible si `claude` no está en el PATH o es < 2.1.287; si está, corre `claude plugin validate plugins/pignolo-panel` y `claude plugin test plugins/pignolo-panel` y exige exit 0. Los tests estáticos de confianza (T5) corren siempre. `npm run test:panel` los corre juntos. **Costo:** `claude plugin test` corre sin sesión (el prototipo lo hizo así) y no consume tokens; si la sonda S2 muestra que pide red o login, queda solo en `test:panel` local, nunca en CI, y el envoltorio lo marca. En CI (si existe) basta con los estáticos.
- [ ] **Pendientes del prototipo (cada uno con su salida decidida):**
  - **Costo por agente:** R-P8: tokens y minutos; el costo de sesión de `session.usage`; sin tabla de precios. Test `mod: the agent row shows minutes and tokens and no money figure`.
  - **Clave de color `warning`:** el mod usa `warning` si el tema la expone y cae a `claude` si no; test `mod: a theme without warning falls back without throwing` (tema simulado). La prueba del color real en la terminal del autor va en el checklist (T7).
  - **Tab sobre la sugerencia:** probar con `claude plugin test` si el motor acepta la sugerencia con Tab; si se puede, test `mod: Tab accepts the suggestion` y el texto de la banda lo dice; si **no** se puede verificar, la banda no promete Tab (dice "tecla 0 abre el panel") y queda en `docs/gaps.md`. Un test garantiza que la banda no menciona Tab sin esa prueba.
  - **Tarjetas cerradas durante `executing`:** resuelto en T2 por el registro (`task-end` y `merged`); test portado `mod: a closed card during executing is drawn done`.
- [ ] **Casos de test:** `plugin cli: validate and test pass for plugins/pignolo-panel or skip with a reason` (guarda); los cuatro de arriba.
- [ ] **Rojo:** romper un test de `.ts` a propósito y ver que `test:panel` falla (no se confía en un envoltorio que siempre pasa).

### T7 — versión, documentos y checklist manual

- [ ] **Archivos:** `plugins/pignolo/.claude-plugin/plugin.json` (**0.18.0**), `plugins/pignolo/CHANGELOG.md` (primero: el contrato nuevo, el registro `pignolo-panel-state/1`, el hook `UserPromptSubmit`, `next.js` con `suggest`), `plugins/pignolo-panel/CHANGELOG.md` (0.1.0), `README.md` (qué es el panel, que es opcional y de solo lectura), `docs/specs/2026-09-26-pignolo-v1-design.md` (sección del registro y de `next`), `docs/gaps.md` (Tab, color, costo por agente), `docs/STATE.md` (el panel en el orden; nota: "0.18.0 se renumera si cambia el orden de unión de las ramas de la guardia"), `plugins/pignolo-panel/tests/manual/panel.md`.
- [ ] **Test:** el que compara `plugin.json` con el CHANGELOG, para los dos plugins (en rojo si el CHANGELOG no tiene `## 0.18.0` / `## 0.1.0`; guarda de regresión).
- [ ] **Checklist manual (queda escrito; el autor no prueba hasta cerrar la v1):** terminal ancha y angosta; colores del tema (`warning`); responder una decisión desde "Te toca": llega el mensaje con el formato, el agente lo trata como la respuesta y la decisión desaparece; **con Claude Code < 2.1.287 el panel no aparece y la guardia sigue funcionando (`git push --force` a `main` se niega igual)**; con `--safe-mode` no hay panel y la guardia sigue; `/pignolo:status` muestra el estado en texto; con `autoOpen` apagado el panel no se abre solo.

## Review Focus (revisión final)

1. **`prompt.submit`:** un solo lugar, un solo disparador (el botón de una opción), texto exacto, sin envío desde eventos, timers ni el siguiente paso (T5).
2. **El hook `UserPromptSubmit`:** falla abierto, no niega, no reescribe, no se confunde con texto parecido; `hooks.json` del núcleo conserva todos los hooks de la guardia (T2).
3. **Registro:** escritura atómica y concurrente, sin datos privados, sin rutas absolutas, tamaño acotado; un evento perdido no deja un estado mentiroso (T1).
4. **Reglas del siguiente paso:** una sola fuente; los casos de "no sugerir" (corriendo, ambiguo, costo sin OK, atención) y que una sugerencia nunca se envía (T3).
5. **La guardia no depende del mod** y el núcleo no lleva `modules` (T4).

## Riesgos

- **R-1: una clave `modules` en una versión vieja** podría invalidar un `hooks.json`. Mitigado por el plugin aparte; la sonda S1 lo mide.
- **R-2: el mensaje enviado lo procesa el modelo.** La respuesta entra a la conversación como un mensaje del usuario (D-P2). Si el texto de la pregunta o de las opciones viene de un agente, un texto hostil podría quedar en el prompt: por eso se recorta, se limpia y viene siempre de opciones del registro, no de texto libre; la revisión mira este punto.
- **R-3: `claude plugin test` no verificado sin red** (S2). Mitigado: los tests de confianza son estáticos y el envoltorio se salta con motivo.
- **R-4: Tab y `prompt.suggest`** pueden no comportarse como el prototipo supone; mitigado en T6 (no se promete).

## Decisiones abiertas para el autor (recomendación primero)

- **Q1: ¿plugin aparte o dentro del núcleo?** Recomendado: **aparte** (`plugins/pignolo-panel/`). Alternativa: dentro de `plugins/pignolo/` con `modules` en `hooks.json`. También decide acá si se suma ya a `marketplace.json` (publicar es tuyo): recomendado **sí, al unir**, no antes.
- **Q2: ¿el panel se abre solo en terminales anchas?** Recomendado: **no** por defecto; opción `autoOpen` apagada, y el botón y la tecla `0` alcanzan.
- **Q3: ¿el hook `UserPromptSubmit` del núcleo marca la respuesta, o el agente?** Recomendado: **el hook** (no depende del modelo, falla abierto). Alternativa: solo la skill `entry` con `panel.js answer`.
- **Q4: ¿"Otra" (respuesta libre) se envía o llena el prompt?** Recomendado: **llena** (el usuario escribe y envía él); una respuesta libre enviada sin que la vea sería la única que no eligió de una lista.
- **Q5: ¿estimar el costo por agente con una tabla de precios?** Recomendado: **no** (queda vieja, mentiría); tokens y minutos.
