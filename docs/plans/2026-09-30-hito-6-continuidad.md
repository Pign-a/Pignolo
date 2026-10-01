# Hito 6 del núcleo: continuidad. Plan de implementación (método liviano)

> **Para quien ejecute:** olas de a lo sumo dos tareas en paralelo, implementadores sonnet, sin revisión por tarea, una revisión final opus por parte con una pasada de arreglos. Casillas `- [ ]`. Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege.

**Objetivo (spec §18, punto 6):** que una sesión nueva, un `/compact` o un subagente arranquen sabiendo dónde estaban: estado de juicio en `.pignolo/state/` con índice generado, nivel caliente con tope de 8.000 caracteres, `SubagentStart` que reinyecta la tarjeta, egreso de red acotado, `close-session` (aprendizajes filtrados por scripts y aceptados solo con el sí del humano, archivado, índice) con la poda de respaldos, el `gc` con heurística de la sombra (diferido del hito 1; rehacer el índice de la sesión se midió y se descartó, R-6). **Sin agente `learning-validator`** (R7, decisión del autor del 2026-10-01 tras la auditoría de buenas prácticas): los aprendizajes se proponen y se filtran con scripts deterministas y solo se aceptan con el sí del humano en `close-session`. **Engram queda fuera de la v1** (D-6-1, decidida el 2026-09-30): los aprendizajes viven en `learnings/accepted/`, en git.

**Arquitectura:** como los hitos 3 a 5. **6a** es lo determinista (librerías, scripts, hooks, tests de §15 `state`, `context-budget`, `egress`; no gasta tokens de agentes). **6b** son la skill `close-session` y la herramienta de trazas de corridas falladas (G17); **sin carta de agente ni evals pagas** (R7, D-6-5).

**Stack:** Node ≥ 22 sin dependencias npm, `node:test`, git ≥ 2.31. **Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` §6.1, §8.3 (`SessionStart`, `SubagentStart`, egreso), §10 completo, §11.6 (retención, `gc`, tamaño), §15 (`state`, `context-budget`, `egress`, `agents`), §18 punto 6.

## Alcance y dependencia del hito 5

- **6a (versión 0.9.0) y 6b (0.10.0).** Las versiones suponen que el hito 5 (0.7.0 y 0.8.0) ya está en `main`; si no, renumerar al ejecutar. Cada parte sube `version` en `plugin.json` y suma su entrada al CHANGELOG.
- **Se reutiliza del hito 5, sin duplicar y con sus nombres exactos:** `mainRoot` de `lib/disabled.js`; `readRun` de `lib/project.js`; `listPlans`/`readPlan` de `lib/plan-state.js` (el registro del plan vive en `.pignolo/state/plans/<plan>/plan.json` y **el índice lo lista sin moverlo**); `deriveNext({ cwd, env, now }) → { kind, text, facts }` de `lib/next.js` (el hito 5, Task 11, ya agrega su salida a `SessionStart`: el hito 6 **reemplaza ese punto de llamada** por el nivel caliente, que recibe el `text` de `deriveNext`; `next` no se llama dos veces); la regla `pignolo-plan` de la guardia (Task 12 del hito 5) que niega a subagentes los scripts que escriben estado.
- **Fuera de este hito, con dueño:** `/pignolo:init` (hito 8) **solo ofrece desactivar la auto-memoria y explica cómo copiar lo que se quiera a `learnings/`; no la migra** (R7, decisión del autor del 2026-10-01: D-8-2 cambia en consecuencia), así que `proposeLearning` (Task 5) ya no tiene ese cliente: lo usa solo `close-session`. Olas, `queue/` y su conflicto son del hito 7: `close-session` se niega con un merge en curso, no conoce la cola.
- **Orden de ejecución (decisión del autor, 2026-10-01, R1):** el hito 8a (`/pignolo:init`) se ejecuta **ahora, sobre `main` 0.8.1 y antes de la Task 8 de este hito** (el cableado de hooks), para poder usar pignolo de verdad y correr los checklists manuales; 8a no depende de nada de este hito (su Task 5 es solo de lectura y no migra). Las versiones de este plan (6a 0.9.0, 6b 0.10.0) se renumeran al ejecutar según lo que esté publicado.

## Global Constraints

- Node ≥ 22, sin dependencias npm. Tests con `node:test`; la suite completa es `npm test`, nunca `node --test tests/`. Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Commits Conventional con `git commit -F <archivo>`; archivos en LF sin BOM; nada de texto largo por comillas de la shell (regla 6 de `rules/core.md`).
- Comandos de test y experimentos **con shell** o por script, nunca `npm`/`npx` sin shell. Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js`; **todo test de la sombra usa `PIGNOLO_HOME` temporal**: ninguno toca `~/.pignolo` real. Escrituras atómicas (temp + rename).
- **G7 (gaps.md): todo script nuevo que una skill interpreta devuelve la razón en campos estructurados** (`{ ok, refused?: '<motivo>', reason, ... }`) además del exit; nunca un exit 2 mudo.
- Hooks: forma exec con `node` y el lanzador, `timeout` del host 30–60 s, plazo interno 3 s que al vencer niega (salvo `SubagentStart`, que **nunca niega**: ante un fallo calla), callados en el éxito salvo las dos inyecciones que son su razón de ser (R-4), cada bloqueo con `Alternativa:`. `/pignolo:off` y `PIGNOLO_DISABLED=1` los apagan (§3.3). Los hooks nuevos filtran evento y agente **antes** de cargar módulos de git.
- Lo que escribe estado (`state-index.js`, `close-session.js`) lo ejecuta **solo el hilo principal**. `INDEX.md` y `learnings/accepted/` los escriben solo los scripts, nunca Edit/Write.
- El repo es público: fixtures sintéticos; nada del proyecto del autor, personas ni credenciales.

## Método de ejecución y economía de tests

El de los hitos 3 a 5: worktrees a mano desde la etiqueta del contrato (`contract/hito-6a/v1` tras la ola 0), implementadores sonnet con brief e informe en archivo, **responder una sola vez y no dejar procesos vivos** (G9), cada implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>` y la suite completa corre **una vez al unir, con la máquina tranquila** (G8). Handlers en proceso (`require(handler).run(input, ctx)`) y un solo test de humo por el lanzador real (Task 8). Todo test nuevo se demuestra en rojo rompiendo lo que protege; un caso que ya pasa hoy es "guarda de regresión" y no cuenta. Primer paso de cada tarea de ola >= 1: `git merge-base --is-ancestor contract/hito-6a/v1 HEAD`; si falla, `BLOCKED`.

## Review Focus

1. **La poda o el `gc` pierden una copia única** (Tasks 6 y 7). `gc` con poda corta solo bajo el lock de la siembra (un solo lock alrededor de `prune` y `gc`), con la sesión resuelta (sin `CLAUDE_CODE_SESSION_ID` ni `--session` se rechaza, nunca `sin-sesion`) y sin otra sesión activa; una sesión viva (índice tocado en los últimos 14 días) conserva su última ref; nada borra una ref cuyo sha no esté en otro almacén (regla ya vigente de §11.6: no se afloja).
2. **El archivado mueve lo que no debe** (Task 7). `learnings/rejected/` y `learnings/accepted/` **no se archivan nunca** (el filtro de novedad lee `rejected/`); `git mv` si está versionada y `rename` si no, nunca borrado; con un merge, cherry-pick o rebase en curso en el checkout principal se niega.
3. **El egreso frena de más o deja pasar** (Task 4). Falso deny sobre el hilo principal o fuera de un flujo de pignolo (sin `run.json` vigente); falso abierto con una consulta que lleva un dato del proyecto o con un MCP en un subagente. Es lista, no clasificador (best-effort, declarado).
4. **El nivel caliente se pasa de tope o se lee como orden** (Tasks 2 y 8). <= 8.000 caracteres con 500 entradas, redacción como hechos (§10.3), sin `systemMessage` de 8.000 caracteres.
5. **Un aprendizaje se acepta cuando no debe** (Task 5). Nada se acepta sin el sí del humano en su propio turno (R7: no hay agente validador que acepte solo); `source: web` nunca solo; un hallazgo del piso mecánico (secreto, dato personal, permiso ampliado, tamaño), un duplicado o una evidencia inexistente se rechazan o se marcan **antes** de preguntar.
6. **Escrituras de estado desde donde no se puede** (Task 8): un worktree de tarea o un subagente escribiendo `.pignolo/state/`; `INDEX.md` o `accepted/` editados a mano.

## Rulings del plan (técnicos, registrados)

- **R-1: entradas de estado.** Un archivo por entrada en `.pignolo/state/<tipo>/` con `<tipo>` en `work`, `decisions`, `issues`, `learnings/proposed`, `learnings/accepted`, `learnings/rejected`, `sessions`, `metrics`, `archive`; `plans/` es del hito 5 y solo se lista. Nombre `YYYY-MM-DD-<slug>.md`, frontmatter con `id` (igual al nombre sin extensión), `status`, `evidence`, `source`, `superseded_by`, `created`, `review_after`, más **`priority: high|normal` opcional y aditivo** (el spec habla de "abiertos de prioridad alta" sin decir dónde vive; sin el campo, `normal`). Estados por tipo: `work`/`issues`: `open`, `closed`; `decisions`: `open`, `decided`, `superseded`; `learnings/*`: `proposed`, `accepted`, `rejected`. Cerrar es cambiar `status`; nunca se reescribe el cuerpo.
- **R-2: `INDEX.md`** lo genera `scripts/state-index.js`: encabezado `<!-- generado por pignolo state-index; no editar a mano -->`, una sección por tipo, un puntero por entrada (`id`, título, una línea), orden estable (tipo, `status`, `id`), LF, sin fecha de generación (mismo estado, mismo archivo: así el diff del commit es solo lo que cambió).
- **R-3: nivel caliente** (§10.2). `buildHot` es una función pura de entradas ya leídas; contenido en orden: rama actual, `next` (hechos), trabajo en curso, abiertos de prioridad alta, contadores (abiertos por tipo). Degradación ordenada y cada paso solo si no entra: (1) todo con punteros; (2) sin los `normal`; (3) los `high` solo con `id` y título; (4) solo contadores; siempre queda la línea "…y N más: ver INDEX.md". Tope `HOT_LIMIT = 8000` (el límite duro de `additionalContext` es 10.000).
- **R-4: inyecciones y "callados en el éxito".** Las únicas dos excepciones de §8.3 son el nivel caliente (`SessionStart`, solo en `additionalContext`, **no** en `systemMessage`) y la tarjeta (`SubagentStart`); ambas callan si no hay nada que dar. Texto en forma de hechos, no imperativo.
- **R-5: `SubagentStart` nunca niega, y es lo único que inyecta `rules/core.md`.** Para todo agente `pignolo:*` inyecta `rules/core.md` (<= 1.600 caracteres; spec §6.1 y §8.3 lo asignan a este hito) y, si `readRun` (objeto, nunca nulo: `const r = readRun(main); const t = r.running && r.run && r.run.task`) trae una tarea y `t.agents.includes(agent_type)`, la tarjeta `<main>/.pignolo/tmp/task-<t.id>.md` (tope 6.000 caracteres) con worktree y rama (`git -C t.worktree`). Cualquier error, ausencia o plazo: calla con exit 0; y el lanzador sale con 0 (nunca 2) ante un fallo o plazo de este hook (conjunto `FAIL_OPEN`), porque la doc dice que `SubagentStart` no bloquea y un exit 2 solo mostraría un aviso engañoso. Un `run.json` ilegible o vencido cuenta como "sin tarjeta" (solo `core.md`). **No verificado:** la forma del payload y de la salida de `SubagentStart` (la doc dice que lleva `agent_id`, `agent_type` con el prefijo del plugin y `cwd`, y que `additionalContext` llega al subagente) y que cubra la auto-compactación de un subagente (la frase de §8.3 es una hipótesis): se mide en `tests/manual/hito-6.md`; si no cubre la compactación, se corrige el texto del spec en el cierre.
- **R-6: `gc` al cerrar la sesión (diferido del hito 1); rehacer el índice, descartado.** `needsGc({ loose, lastGcAt, now, looseLimit = 2000 }) → { run, reason }` (más de 2.000 objetos sueltos **o** más de 24 h desde el último `gc`). Se corre al cerrar la sesión, **bajo un solo `acquireLock`** que envuelve `prune` y el `gc` (spec §11.6: la poda corre bajo el lock) y **solo si ninguna otra sesión tocó su índice en los últimos 10 minutos**; la poda corta es `-c gc.autoDetach=false gc --prune=1.day.ago` (el vencimiento es el `mtime` del objeto suelto, no la fecha del commit; la ventana entre `commit-tree` y `update-ref` dura milisegundos). Si no hay exclusividad, cae a `gc --auto` y lo informa (`ran: false, reason: 'other-session-active'`); el `prune` del cierre no corre su propio `gc --auto` (`gcAuto: false`). **La clave de sesión se resuelve, no se supone** (hallazgo F1, medido C1/C2): `--session <id>` o `CLAUDE_CODE_SESSION_ID` del entorno de Bash (observado en Claude Code 2.1.285; **no documentado**: el camino documentado es un hook `SessionStart` que lo escriba en `CLAUDE_ENV_FILE`, que el plan no usa por ser más complejo; se declara y se verifica en `tests/manual/hito-6.md`); sin ninguno, `refused: 'no-session'`, porque con la clave equivocada el propio índice de la sesión cuenta como "otra sesión" y el `gc` nunca corre. **Sin plazo para el `gc`** (C5, medido): un plazo mata solo `git.exe` y deja `repack` huérfano y `gc.pid`; el `mtime` del lock se adelanta mientras corre para que no se lo roben a los 10 min. **Sesiones vivas (F16):** `prune` conserva la última ref de todo grupo con `index-<clave>` tocado en los últimos 14 días. **Rehacer el índice: descartado** (C6, medido con 20.000 archivos: mismo tamaño y mismo árbol, ~1,8 s; no reduce nada). Se anota en §11.6 como medido y descartado.
- **R-7: egreso acotado a los subagentes mientras hay un flujo en curso** (D-6-3.a, decidida el 2026-09-30). `PreToolUse` sobre `WebSearch|WebFetch|mcp__.*`: **mientras haya un flujo de pignolo en curso (`run.json` vigente, `readRun`)** rige para **todo** subagente (cualquier `agent_id`, no solo `pignolo:*`; mismo alcance que el deny de `Agent`): ninguno usa `WebSearch`/`WebFetch` salvo `pignolo:researcher`; **ninguno** usa `mcp__*` (tampoco el `researcher`). **Fuera de un flujo (sin `run.json` vigente) no rige.** El hilo principal no tiene restricción (declarado en §8.3). A `pignolo:researcher` se le filtra la consulta (`query`, `url`, `prompt`) contra `piiPatterns` del proyecto y contra identificadores del proyecto = la ruta absoluta del checkout principal y de cada worktree (con `/` y con `\`) y la ruta del `origin` sin el host; un acierto niega con la alternativa "reformulá la pregunta en abstracto". **No verificado:** los nombres de los campos de `tool_input` (`query`, `url`, `prompt`), que el matcher `mcp__.*` sea regex del host y qué considera `readRun` "vigente" para un `run.json` viejo (el hito 5: `running` = existe y no venció; ilegible = `running` con `malformed`: **falla cerrado**, la regla rige); el hook lee con tolerancia (campo desconocido = se mira todo valor de texto del `tool_input`) y el chequeo manual lo confirma.
- **R-8: aceptación de aprendizajes** (§10.4 paso 4; REESCRITA el 2026-10-01 por R7: sin `learning-validator`), función pura `decideAcceptance`. Orden: un hallazgo del piso mecánico (R-9) → `rejected` con el motivo, **sin preguntar**; un duplicado exacto normalizado de una entrada de `accepted/`, `rejected/` o de otra `proposed/` (`findDuplicate`) → `rejected`; la respuesta `no` del humano → `rejected`; la respuesta `yes` del humano → `accepted`; **sin respuesta → `human`** (se le pregunta con `templates/question.md`), con `flags`: `web` (la fuente es `source: web`: nunca se acepta sin el sí), `reserved` (toca reservadas o contradice una regla) y `evidence-unverified` (`checkEvidence` no pudo comprobar `ruta:línea` ni un sha). **Nada se acepta solo, ni siquiera un `session` limpio.** Lo general (`scope: general`) aceptado suma `promoteCandidate: true`. Subir al plugin sigue siendo del humano.
- **R-9: piso mecánico y comprobaciones deterministas (sin agente).** `scanLearning` (script, sin modelo) corre sobre la entrada propuesta: coincidencia con `piiPatterns`, patrones de secretos (claves `AKIA…`, `ghp_…`, `sk-…`, `-----BEGIN … PRIVATE KEY-----`, `password\s*[:=]`), frases que amplían permisos ("bypass", "dangerously", "allow all", "skip permission", `--no-verify`), tamaño > 1.200 caracteres. Además `findDuplicate` (texto igual tras minúsculas y sin espacios ni puntuación de más) y `checkEvidence` (cada `ruta:línea` citada existe dentro del repo y un sha citado existe como commit). **No hay segunda opinión de un agente** (R7): el script y el sí del humano son todo el filtro; lo que un validador habría juzgado con criterio (contradicciones, alcance) lo juzga el humano al ver la pregunta.
- **R-10: Engram fuera de la v1** (D-6-1, decidida el 2026-09-30). El hito no lo instala, no lo integra ni lo menciona en `setup`, skills ni config: no hay `lib/engram.js`, ni opción de setup, ni `engramSaveArgs`, ni clave `engram` en `~/.pignolo/config.json`. Los aprendizajes aceptados viven en `.pignolo/state/learnings/accepted/` (en git) y esa es la memoria de pignolo (§10.5). §10.5 del spec se corrige en el cierre de 6b como **idea futura**, con lo verificado abajo como punto de partida.
- **R-11: `close-session` es un script con verbos y una skill que lo orquesta.** El script no commitea ni propone aprendizajes (eso es juicio de la skill); se niega con una operación de git en curso en el checkout principal (`merge`, `cherry-pick` o `rebase`, vía `git rev-parse --git-path`) con `refused: 'merge-in-progress'`; un merge que corre en otro worktree enlazado (la cola) es del hito 7. Mueve (`archive`, `decide`) con `git mv` si la entrada está versionada y con `rename` si no (el script nunca commitea); archiva plano en `archive/<archivo>`. La rechazada entera sale exit 1 y las entradas rechazadas una a una (`exists`, ilegible) salen en `refused: []` con exit 0.
- **R-12: `run.json` ilegible y los hooks de este hito.** `readRun` (hito 5) lo devuelve como `running: true, malformed: true` (falla cerrado). El egreso lo trata como flujo en curso (rige, igual que `agent-gate`); `SubagentStart` y el nivel caliente, que no son compuertas, lo tratan como "sin tarea" y no leen la tarjeta (solo `core.md`; el nivel caliente sin `flow`).

## Qué se verificó al escribir este plan

Lectura del repo en `main` (plugin 0.6.2, más el plan del hito 5) y la web. **Repo:** `hooks.json` no registra `SubagentStart` ni egreso; `protect-paths.js` no tiene ninguna regla sobre `.pignolo/state/`, `INDEX.md` ni `accepted/` (§8.3 las declara y hoy no existen); `session-start.js` arma una sola cadena y la emite en `systemMessage` y en `additionalContext`; `lib/shadow.js` ya tiene `prune`, `retentionPrune`, `sizeWarnings` (aviso de 1 GB con los 5 archivos más pesados: ya hecho, no se repite) y solo `gc --auto`; el lock `acquireLock` y el índice por sesión `index-<clave>` existen; la tarjeta se escribe en `<main>/.pignolo/tmp/task-<id>.md` (`templates/task-card.md`); `learning-validator` existe con `Read, Grep, Glob`, `effort: medium` y perfil opus/sonnet/sonnet, y su salida es texto libre (sin bloque `json`); **queda sin usar en el flujo** (R7): ninguna skill lo despacha y su archivo no se toca.

**Engram (consultado el 2026-09-30; insumo de la idea futura de §10.5, ya fuera de este hito por D-6-1):**
- <https://github.com/Gentleman-Programming/engram> (README): MIT; binario Go con SQLite + FTS5, servidor MCP, API HTTP, CLI y TUI; base local `~/.engram/engram.db` ("autoridad"); "Git Sync" exporta fragmentos comprimidos; "Engram Cloud" es opcional; herramientas MCP `mem_save`, `mem_search`, `mem_context`, `mem_session_summary`, `mem_save_prompt` ("preserve the user's request"); una referencia a "stable v1.20.0" en la instalación con Homebrew.
- <https://github.com/Gentleman-Programming/engram/blob/main/docs/AGENT-SETUP.md>: Claude Code admite tres vías: A) `claude plugin marketplace add Gentleman-Programming/engram` + `claude plugin install engram` (solo archivos del plugin, **no registra el MCP**); B) además `engram setup claude-code` (requiere `jq` y `curl`; escribe `mcpServers.engram` en `~/.claude.json`); C) MCP a mano: `claude mcp add --transport stdio --scope user engram -- <ruta> mcp --tools=agent`. El plugin instala **dos hooks** (`PreToolUse`: niega herramientas de escritura/sesión de Engram si el registro de sesión no está confirmado; `UserPromptSubmit`: inyecta un "Memory Protocol"). Cloud solo con `ENGRAM_CLOUD_AUTOSYNC=1`, `ENGRAM_CLOUD_TOKEN`, `ENGRAM_CLOUD_SERVER`. `.engram/config.json` con `project_name` fija el proyecto por defecto. Variables `ENGRAM_URL`, `ENGRAM_BIN`, `ENGRAM_PROJECT`.
- <https://pkg.go.dev/github.com/Gentleman-Programming/engram/v2/cmd/engram>: el módulo figura también como `/v2`.

**Hallazgos para corregir §10.5 como idea futura:** la opción **`capture_prompt: false` de §10.5 no aparece en esa documentación** (hipótesis — no verificada; el equivalente real parece ser no instalar el hook `UserPromptSubmit` ni usar `mem_save_prompt`, es decir la vía C); lo que `engram sync` escribe en `.engram/` y si el proyecto lo crea solo **no está documentado en esas páginas** (hipótesis — no verificada: se mantiene `.engram/` en `.gitignore` como guarda); el contenido del perfil `--tools=agent` y los argumentos exactos de `mem_save` no están verificados; la versión mayor (v1.x contra `/v2`) hay que fijarla al ejecutar. **No verificado en general:** todo comportamiento de Engram dentro de una sesión de pignolo.

---

# Parte 6a: determinista

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: almacén de estado (`lib/state-store.js`)

**Files:**
- Create: `plugins/pignolo/lib/state-store.js`
- Test: `tests/state-store.test.js`

**Interfaces:**
- Consume: `parseFrontmatter` de `lib/yaml-lite.js`; `mainRoot` de `lib/disabled.js`.
- Produce: `KINDS` = `['work','decisions','issues','learnings/proposed','learnings/accepted','learnings/rejected','sessions','metrics','archive']`; `STATUSES` por tipo (R-1); `ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,60}$/`; `stateDir(main, kind)`; `parseEntry(text) → { ok: true, entry: { id, status, priority, title, line, fields } } | { ok: false, error }` (`title` = primer encabezado `# ` del cuerpo, `line` = primera línea de texto que no es encabezado, recortada a 140 caracteres); `readEntries({ main, kind }) → { entries: [{ kind, file, ...entry }], errors: [{ file, error }] }` (una entrada ilegible va a `errors` y **no** se omite en silencio); `writeEntry({ main, kind, id, fields, body }) → { ok: true, file } | { ok: false, refused, reason }` (crea; si existe, `refused: 'exists'`; kind o id inválido, `refused: 'invalid-kind' | 'invalid-id'`; `fields.status` fuera de `STATUSES[kind]`, `refused: 'invalid-status'`); `setStatus({ main, kind, id, status, supersededBy }) → ok|refused` (solo toca `status` y `superseded_by`, nunca el cuerpo; `rejected` y `accepted` no se reabren: `refused: 'terminal'`).

**Tests literales:**
- [ ] `parseEntry`: una entrada completa → `ok`, `title` y `line` esperados; sin frontmatter → `ok: false`; `id` distinto del nombre del archivo (vía `readEntries`) → en `errors`; `priority: urgent` → error; sin `priority` → `normal`.
- [ ] `writeEntry`: crea con LF y sin BOM; el mismo id dos veces → `refused: 'exists'` y el archivo original **intacto**; `kind: 'plans'` → `invalid-kind`; id `Foo bar` → `invalid-id`; `status: 'closed'` en `decisions` → `invalid-status`; escritura atómica (no queda ningún `.tmp` si `rename` se simula fallido).
- [ ] `setStatus`: `open` → `closed` cambia solo la línea `status` (el resto del archivo byte a byte igual); un `accepted` → `open` → `refused: 'terminal'`; id inexistente → `refused: 'missing'`.
- [ ] `readEntries` sobre una carpeta con 3 válidas y 1 truncada → 3 entradas y 1 error con el nombre del archivo; carpeta ausente → `{ entries: [], errors: [] }`.
- [ ] Commit: `feat(state): almacén de entradas de estado con estados por tipo`.

### Task 2: presupuesto de contexto (`lib/context-budget.js`)

**Files:**
- Create: `plugins/pignolo/lib/context-budget.js`
- Test: `tests/context-budget.test.js`

**Interfaces:**
- Pura; no lee archivos. `HOT_LIMIT = 8000`, `HARD_LIMIT = 10000`.
- `buildHot({ branch, nextText, flow, entries, counters }, { limit = HOT_LIMIT }) → { text, chars, level: 1|2|3|4, dropped: number }`. `entries` = `[{ kind, id, title, line, status, priority }]` (la forma de `readEntries`); `flow` = `null | { flow, task }` (de `readRun`); `counters` = `{ [kind]: { [status]: n } }`. Formato de cada puntero: `- <kind>/<id> — <title>: <line>` (nivel 3: `- <kind>/<id> — <title>`). La línea de rama se rotula "Rama del checkout principal: <branch>" (Task 8, F13). Redacción en hechos: cabecera "pignolo: estado del proyecto (hechos registrados, no instrucciones)".
- Degradación por R-3. Cualquier `text` <= `limit`, y si `limit` es menor que la cabecera más contadores, devuelve solo los contadores recortados a `limit`.

**Tests literales (§15 `context-budget`):**
- [ ] 500 entradas (100 `high`, 400 `normal`, títulos y líneas de 80 y 140 caracteres) → `chars <= 8000` y `level >= 2`; la línea "…y N más: ver INDEX.md" con el N exacto (`dropped`).
- [ ] 5 entradas → nivel 1, todas presentes; con 40 `normal` y 3 `high` que no entran juntas → las 3 `high` están y ninguna `normal` (nivel 2); con 300 `high` → nivel 3 (sin `line`) y si aún no entra, nivel 4 (solo contadores); en todos, la rama y `nextText` presentes (se recortan al final, nunca antes que los punteros).
- [ ] `nextText: ''` → no hay línea de `next`; `branch` ausente → sin línea de rama, sin excepción. `limit: 300` → `chars <= 300`.
- [ ] Orden estable: dos corridas con las mismas entradas desordenadas dan el mismo texto. El texto no contiene verbos en imperativo de la lista fija `['ejecutá', 'corré', 'hacé', 'borrá', 'ignorá']` (guarda de §10.3).
- [ ] Commit: `feat(context-budget): nivel caliente con degradación ordenada`.

**Tag de contrato:** unir Tasks 1 y 2 a `core/hito-6a` y etiquetar `contract/hito-6a/v1`.

## Ola 1 (Tasks 3 y 4 en paralelo)

### Task 3: índice y protección del estado (`lib/state-index.js`, `scripts/state-index.js`, `protect-paths`)

**Files:**
- Create: `plugins/pignolo/lib/state-index.js`, `plugins/pignolo/scripts/state-index.js`
- Modify: `plugins/pignolo/hooks/handlers/protect-paths.js`
- Test: `tests/state-index.test.js`, `tests/protect-paths-state.test.js`

**Interfaces:**
- `buildIndex({ main }) → { text, errors }` (R-2; incluye `plans/` leyendo `listPlans`/`readPlan` del hito 5, una línea `plan <slug> — etapa <stage>`; un plan ilegible sale como línea "registro ilegible", no se omite); `writeIndex({ main }) → { ok, file, changed: boolean }` (atómica; `changed: false` si el texto es idéntico: no toca el archivo). CLI `node state-index.js [--cwd <dir>] [--check]`: sin `--check` escribe y devuelve `{ ok, changed, errors }`; con `--check` no escribe y sale 1 con `{ ok: false, refused: 'stale-index' }` si difiere.
- `protect-paths`, reglas nuevas (§8.3 las declara y hoy no están implementadas), con la alternativa en cada bloqueo: (a) **nadie** escribe `<main>/.pignolo/state/INDEX.md` ni `<main>/.pignolo/state/learnings/accepted/**` con Edit/Write (alternativa: `node <plugin>/scripts/state-index.js` o `close-session.js decide`); (b) un payload con `agent_id` (subagente) no escribe `.pignolo/state/**` en ninguna copia; (c) el hilo principal tampoco escribe `.pignolo/state/**` desde un worktree que no es el checkout principal (`cwd` dentro de `.pignolo/worktrees/` o de un worktree de tarea). Con `PIGNOLO_DISABLED=1` rige solo lo que ya rige hoy (rutas protegidas del conjunto catastrófico); `/pignolo:off` apaga (b) y (c) pero **no** (a) (decisión técnica: son archivos generados, no el interruptor).

**Tests literales (§15 `state`):**
- [ ] Índice: 4 entradas de 3 tipos → texto con las 3 secciones, orden estable, encabezado exacto; dos corridas seguidas → `changed: false` la segunda y `mtime` sin cambio. Cambiar un `status` → `changed: true` y solo esa línea difiere. Una entrada truncada → aparece en `errors` y en el índice como "ilegible", no se pierde.
- [ ] Plan del hito 5 en `plans/` → línea del plan; `plan.json` truncado → línea "registro ilegible".
- [ ] `--check` con `INDEX.md` editado a mano → exit 1 y `refused: 'stale-index'`.
- [ ] **`INDEX.md` no editable:** Write sobre `INDEX.md` por el hilo principal → exit 2 con la alternativa; Write sobre `learnings/accepted/x.md` → exit 2; Write sobre `learnings/proposed/x.md` por el hilo principal → pasa. Subagente (con `agent_id`) escribiendo `work/x.md` → exit 2; el mismo path con el hilo principal → pasa.
- [ ] **Worktree de tarea no escribe `.pignolo/state/`:** `cwd` dentro de `.pignolo/worktrees/<t>` y ruta `<worktree>/.pignolo/state/work/x.md` → exit 2; la misma ruta en el checkout principal → pasa. Con `/pignolo:off`, (b) y (c) pasan y (a) sigue negando.
- [ ] Guarda de regresión (ya pasa hoy): Write sobre `src/a.js` y sobre `.pignolo/project.md` por el hilo principal no cambian de resultado.
- [ ] Commit: `feat(state): índice generado y protección de INDEX.md, accepted/ y state/`.

### Task 4: egreso (`lib/egress.js`, `hooks/handlers/egress.js`)

**Files:**
- Create: `plugins/pignolo/lib/egress.js`, `plugins/pignolo/hooks/handlers/egress.js`
- Test: `tests/egress.test.js`

**Interfaces:**
- Consume: `piiPatterns` de `lib/project-config.js`; `mainRoot`, `readState` de `lib/disabled.js`; `readRun` de `lib/project.js` (flujo vigente); "activo en el proyecto" de `lib/project.js` (definición del hito 2).
- `lib/egress.js` produce: `classifyTool(name) → 'web' | 'mcp' | 'other'` (`WebSearch`/`WebFetch` → `web`; `mcp__*` → `mcp`); `projectIdentifiers({ main, worktrees, originPath }) → string[]` (rutas con `/` y con `\`, en minúscula para comparar; descarta identificadores de menos de 6 caracteres); `textOf(toolInput) → string[]` (todo valor de texto del `tool_input`, a cualquier profundidad: R-7); `checkQuery({ texts, piiPatterns, identifiers }) → null | { reason, match }`; `decideEgress({ tool, agentType, hasAgentId, flow, toolInput, project }) → { allow: true } | { allow: false, reason }` (puro, sin E/S; `flow` = lo que devuelve `readRun`, `null` si no hay flujo vigente).
- Handler `egress`: sin `agent_id` → exit 0 (hilo principal libre); sin flujo vigente (`readRun` es un objeto, nunca nulo: `!r.running`, o sea sin `run.json` o vencido) → exit 0 (fuera de un flujo no rige); un `run.json` ilegible es `running` con `malformed` y **rige** (falla cerrado, igual que `agent-gate`, R-12); resto por `decideEgress` para **todo** subagente, sea cual sea su `agent_type` (R-7); bloqueo = exit 2 con `Alternativa:`. Registro del hook en Task 8.

**Tests literales (§15 `egress`; tabla, un caso por fila):**
- [ ] `pignolo:researcher` + `WebSearch` con una consulta limpia ("how does git worktree prune work") → permite. Con la ruta absoluta del checkout principal en la consulta → niega. Con un dato que coincide con un `pii-patterns` (`\b\d{2}\.\d{3}\.\d{3}\b` y la consulta "cliente 20.123.456") → niega. `WebFetch` con `url` limpia y `prompt` con la ruta de un worktree escrita con `\` → niega.
- [ ] `pignolo:implementer` + `WebFetch` → niega; `pignolo:researcher` + `mcp__foo__bar` → niega; `pignolo:explorer` + `mcp__x__y` → niega ("ningún subagente usa MCP"). Todos estos casos con flujo vigente.
- [ ] **Hilo principal y fuera de flujo libres:** sin `agent_id`, `WebSearch` y `mcp__x__y` con una consulta que contiene la ruta del repo → permite (con y sin flujo). **Con flujo vigente** (`run.json` con una tarea), `pignolo-ui:ui-option` + `mcp__playwright__browser_navigate` → niega, y un agente `general-purpose` + `WebFetch` → niega (R-7: todo subagente). **Sin `run.json`**, esos mismos dos casos → permite (rojo: quitar el chequeo del flujo).
- [ ] Sin pignolo activo en el proyecto, o sin flujo en curso (`run.json` ausente o vencido: el hook calla y permite) → permite todo; con un `run.json` ilegible (`malformed`) rige como con flujo vigente (rojo: tratar `malformed` como ausente). Con `/pignolo:off` o `PIGNOLO_DISABLED=1` → permite todo.
- [ ] `tool_input` con un campo que no se conoce (`{ q: '<ruta del repo>' }`) → niega al `researcher` (lee todo valor de texto); `tool_input` ausente o no objeto → permite sin excepción.
- [ ] Identificadores cortos (`C:\a`) no generan falsos denies: una consulta con "a" y "c" → permite. Un `piiPatterns` con regex inválida ya no llega acá (lo rechaza `project-config`); si llega, el hook **niega** (falla cerrado) con el motivo.
- [ ] Guarda de regresión (corpus de la guardia): el hook no cambia el resultado de ningún comando de `tests/guard/` (no mira `Bash`).
- [ ] Commit: `feat(egress): web solo para researcher, sin MCP en subagentes durante un flujo, filtro de consultas`.

## Ola 2 (Tasks 5 y 6 en paralelo)

### Task 5: aprendizajes (`lib/learnings.js`)

**Files:**
- Create: `plugins/pignolo/lib/learnings.js`
- Test: `tests/learnings.test.js`

**Interfaces:**
- Consume: Task 1 (`writeEntry`, `readEntries`, `setStatus`).
- `proposeLearning({ main, id, source, evidence, scope, body }) → ok|refused` (escribe en `learnings/proposed/`, `status: proposed`; `source` ∈ `session | web | human`, `scope` ∈ `project | general`; sin `evidence` → `refused: 'no-evidence'`). Lo usa `close-session`; `/pignolo:init` ya no migra la auto-memoria (R7).
- `scanLearning({ text, piiPatterns }) → { findings: [{ kind: 'pii'|'secret'|'permission'|'size', match }] }` (R-9).
- `findDuplicate({ body, existing }) → { duplicate: boolean, of?: string }` (R-9): compara el texto normalizado (minúsculas, sin espacios ni puntuación de más) contra `existing` (lo que devuelve `readEntries` de `learnings/accepted`, `learnings/rejected` y las demás de `learnings/proposed`, sin la propia).
- `checkEvidence({ main, evidence, run }) → { verified: boolean, checked: [{ ref, kind: 'file-line'|'commit', ok }] }` (R-9): reconoce `<ruta>:<línea>` (ruta relativa sin `..` ni absoluta; la línea existe en el archivo) y shas de 7 a 40 hexadecimales (`git cat-file -e <sha>^{commit}` por el ejecutor `run`); sin ninguna referencia reconocible → `verified: false`. Nunca lee fuera del repo.
- `decideAcceptance({ entry, scan, duplicate, evidence, reservedMatch, answer }) → { decision: 'rejected' | 'human' | 'accepted', reason, promoteCandidate, flags: string[] }` (R-8, en ese orden); `applyDecision({ main, id, decision }) → ok|refused` mueve el archivo con `git mv` si el repo es git (si no, `rename`) de `proposed/` a `accepted/` o `rejected/` y fija el `status`; para `human` no mueve nada.

**Tests literales:**
- [ ] `decideAcceptance` (tabla, una fila por regla de R-8): todo limpio, `session`, sin `answer` → `human` (**nunca** `accepted`; rojo: auto-aceptar); `answer: 'yes'` → `accepted`; `answer: 'no'` → `rejected` (`human-no`); un hallazgo de `scanLearning` con `answer: 'yes'` → `rejected` (el piso gana al sí); `duplicate: true` → `rejected`; `source: web` sin `answer` → `human` con `flags` que incluye `web`; `reservedMatch: true` → flag `reserved`; `evidence.verified: false` → flag `evidence-unverified` y sigue `human`; `scope: general` + `yes` → `promoteCandidate: true`.
- [ ] `scanLearning`: una clave `ghp_` + 36 letras → `secret`; `AKIA` + 16 → `secret`; "usá --no-verify en los commits" → `permission`; un texto de 1.300 caracteres → `size`; un `piiPatterns` que coincide → `pii`; un texto limpio de 300 caracteres → `findings: []`. Una regex de `piiPatterns` inválida → excepción con el patrón nombrado (no pasa en silencio).
- [ ] `findDuplicate`: el mismo texto con otra capitalización, espacios y puntuación → `duplicate: true` con el `of`; un texto distinto → `false`; compara contra `accepted/`, `rejected/` y otras de `proposed/`, nunca contra sí misma (rojo: incluir `proposed/` entera).
- [ ] `checkEvidence`: `src/a.js:3` con un archivo de 5 líneas → `verified: true`; `src/a.js:99` → `false`; una ruta con `..` o absoluta → `false` y el archivo de afuera no se lee (se afirma con un archivo marcador fuera del repo); un sha de commit real (repo de `makeRepo()`) → `ok`; un sha inexistente → `false`; evidencia sin referencia reconocible → `verified: false`.
- [ ] `applyDecision`: `accepted` mueve de `proposed/` a `accepted/` con `status: accepted` y el original ya no está en `proposed/`; `human` no mueve; mover un id que ya existe en `accepted/` → `refused: 'exists'` sin perder el original.
- [ ] `proposeLearning` sin `evidence` → `refused`; con `source: 'other'` → `refused`.
- [ ] Commit: `feat(learnings): propuesta, piso mecánico, duplicados, evidencia y decisión con el sí del humano`.

### Task 6: sombra al cerrar la sesión (`lib/shadow.js`, `lib/git-backup.js`) — RIESGOSA (auditar antes)

**Files:**
- Modify: `plugins/pignolo/lib/shadow.js` (agrega `needsGc`, `gcShadow`, `closeSession`; `prune` gana el parámetro `gcAuto` y la regla de sesiones vivas, R-6), `plugins/pignolo/lib/git-backup.js` (exporta `closeShadow({ cwd, env, sessionId, now })`)
- Test: `tests/shadow-close.test.js` (casos nuevos; `tests/shadow.test.js` y `tests/backup.test.js` no se tocan)

**Interfaces:**
- `needsGc({ loose, lastGcAt, now, looseLimit = 2000 }) → { run: boolean, reason: 'loose' | 'age' | 'none' }` (R-6; `lastGcAt` ausente cuenta como "nunca" → `age`).
- `closeShadow({ cwd, env = process.env, sessionId, now }) → { ok, refused?, reason?, pruned, gc } | null`. **Clave de sesión (R-6, hallazgo F1):** `sessionId` = el argumento, o si falta `env.CLAUDE_CODE_SESSION_ID` (observado en Claude Code 2.1.285: es el mismo id que reciben los hooks y da la misma `sessionKey`; **no está documentado**, se verifica en `tests/manual/hito-6.md`); si no hay ninguno → `{ ok: false, refused: 'no-session', reason, pruned: null, gc: null }` y **no hace nada**: nunca cae a `sessionKey(undefined)` ('sin-sesion'). Fuera de un repo → `null`. Resuelve `info` y `key` como `seedShadow`, con `withDeadline(cwd, 120000)` para todo salvo el `gc`.
- `closeSession({ run, runGc, env, info, key, now }) → { pruned, gc }`: **toma `acquireLock(p.lock)` una sola vez** y lo suelta en `finally` (si no lo logra: `{ pruned: null, gc: { ran: false, reason: 'busy' } }` y no corre nada); dentro, en este orden, **`prune({ ..., gcAuto: false })` → `gcShadow`**, cada uno en su try/catch (uno que falla no corta al otro; el error va a `recordFailure` y al resultado, nunca en silencio). Sin sombra sembrada → `{ pruned: null, gc: null }` sin crearla.
- `prune` (existente): parámetro nuevo `gcAuto = true` (si es `false`, no corre su `gc --auto` final). **Sesiones vivas (F16):** además de lo vigente, un grupo cuyo `index-<clave>` se tocó hace menos de 14 días cuenta como vivo y se conserva su última ref (una sesión que sigue abierta con el árbol sin cambios reutiliza su ref vieja). Sin `index-<clave>` el comportamiento no cambia (los tests de `tests/shadow.test.js` siguen verdes).
- `gcShadow({ run, runGc, p, key, now, looseLimit }) → { ran: boolean, reason: string, looseBefore: number, looseAfter: number | null }` (corre **dentro** del lock de `closeSession`, no toma uno propio): cuenta con `count-objects -v`; `needsGc`; mira el `index-<otra clave>` más reciente (< 10 min → `ran: false, reason: 'other-session-active'` y cae a `gc --auto`); corre con `runGc` **`-c gc.autoDetach=false gc --quiet --prune=1.day.ago`**; guarda `own/last-gc`. Nunca borra refs. **Plazo del `gc` (C5, medido):** un `gc` cortado por plazo mata solo `git.exe`; `repack` sigue huérfano, deja `gc.pid` y termina después de soltar el lock. Por eso `runGc` es `gitRun(args, cwd, { timeout: 0 })` (sin plazo), y mientras corre el `mtime` del directorio del lock se adelanta (`fs.utimesSync` a `now + 2 h`) para que `acquireLock` (lo da por viejo a los 10 min, `SEED_STALE_MS`) no se lo robe a una siembra; el `gc.pid` que quede es inocuo (el siguiente `gc` sigue). La skill invoca el verbo con el plazo de Bash al máximo (Task 11).

**Tests literales (§15 `backup`: retención en el cierre; todos con `PIGNOLO_HOME` temporal):**
- [ ] `needsGc`, tabla: `loose: 2001` → `loose`; `loose: 2000, lastGcAt: hace 25 h` → `age`; `loose: 10, lastGcAt: hace 1 h` → `none`; `lastGcAt` ausente y `loose: 10` → `age`.
- [ ] **Clave de sesión (F1; a nivel de `closeShadow`, no de `gcShadow` con la clave a mano):** sombra sembrada y una instantánea con `sessionId: 's'`; `closeShadow({ cwd, env: { PIGNOLO_HOME, CLAUDE_CODE_SESSION_ID: 's' } })` sin `sessionId` → corre el `gc` (`gc.ran: true`: el `index-<clave de 's'>` propio recién tocado no cuenta como otra sesión); sin `sessionId` ni la variable → `refused: 'no-session'` y la sombra intacta (rojo: quitar el rechazo y que caiga a 'sin-sesion' → `other-session-active`).
- [ ] `gcShadow` real con `looseLimit: 5`: una sombra con 8 objetos sueltos → `ran: true`, `looseAfter < looseBefore`, y **todas las refs `refs/pignolo/*` existen con los mismos shas** (rojo: reemplazar la poda por una que borre refs). Con otro `index-<otra clave>` modificado hace 1 min → `ran: false, reason: 'other-session-active'` y las refs intactas. Con el lock tomado por otro proceso → `closeSession` devuelve `gc.reason: 'busy'` sin correr nada.
- [ ] **Sin colisión con el `gc` en segundo plano (F2):** con un `run` espía que registra los argumentos, `closeSession` no emite ningún `gc --auto` antes del `gc` completo y todo `gc` lleva `gc.autoDetach=false` (rojo: quitar `gcAuto: false` o el `-c`). En Git for Windows el `gc --auto` corre en primer plano (C3, medido: la colisión no se reproduce acá); el espía protege a Linux y macOS.
- [ ] **Poda por antigüedad del objeto (F3, C4):** `git prune` vence por el **`mtime` del archivo suelto**, no por la fecha del commit. El test crea con `commit-tree` un commit sin ref y le pone el `mtime` a hace 2 días con `fs.utimesSync` **antes de cualquier `gc`** (después de uno el objeto ya está en un pack "cruft" y el archivo suelto no existe) → tras `gcShadow`, `git cat-file -e` falla. Otro commit sin ref con `mtime` de hace 5 minutos → sigue presente. Un objeto alcanzable solo desde `refs/pignolo/wip/*` con `mtime` de hace 2 días sobrevive: **guarda de regresión** (es garantía de git; solo falla si la implementación borra refs).
- [ ] **Plazo y lock (F5, C5):** `gcShadow` no pasa plazo al `gc` (el espía ve `timeout: 0`) y durante el `gc` el `mtime` del lock está en el futuro (rojo: quitar el `utimes` y comprobar que un `acquireLock` de otro proceso lo toma pasados 11 minutos simulados con `utimes` al pasado).
- [ ] `closeSession`: con `gcShadow` forzado a fallar, `prune` igual corrió y el resultado trae el error de `gc`, que queda en `backup-failures.log`. Una sombra sin sembrar → `{ pruned: null, gc: null }` sin crearla (no siembra).
- [ ] Retención en el cierre (§11.6, ya vigente en `prune`): con instantáneas de 10 y 20 días de 5 sesiones, `closeSession` conserva la actual y las 3 previas, borra el resto y **no** borra una ref de `refs/pignolo/backup/*` cuyo sha no está en la sombra (guarda de regresión; el caso ya está en `tests/shadow.test.js` y se repite por el camino de `closeSession`). **Sesión viva (F16):** una sesión con su única ref de hace 20 días y su `index-<clave>` tocado hoy, fuera de las 3 más nuevas → su ref sobrevive (rojo: quitar la regla de sesiones vivas); con el `index-<clave>` de hace 20 días → se poda como siempre.
- [ ] Commit: `feat(shadow): gc con heurística y poda con la sesión resuelta al cerrar la sesión`.

**Rehacer el índice de la sesión: descartado (R-6, C6).** Se midió con 20.000 archivos: el índice reconstruido pesa lo mismo que el incremental y da el mismo árbol; no hay nada que ganar y `seedShadow` ya arma el suyo en cada sesión nueva. No se implementa `rebuildSessionIndex`; el cierre de 6a lo anota en §11.6 como medido y descartado.

**Tag de contrato:** unir Tasks 3 a 6 y etiquetar `contract/hito-6a/v2`.

## Ola 3 (Task 7, sola) — RIESGOSA (auditar antes)

### Task 7: `scripts/close-session.js` (evidencia, decisión, archivado, índice, poda)

**Files:**
- Create: `plugins/pignolo/scripts/close-session.js`, `plugins/pignolo/lib/archive.js`
- Test: `tests/close-session.test.js`, `tests/archive.test.js`

**Interfaces:**
- Consume: Tasks 1, 3, 5, 6; `lib/seals.js` (`sealDir`, `repoIdFor`); `git` solo con `log`, `diff --name-only`, `mv`, `status --porcelain`, `ls-files --error-unmatch` y `rev-parse --git-path`.
- CLI `node close-session.js <verbo> [--cwd <dir>] [--session <id>]`, JSON por stdout. **Salida:** exit 0 (éxito, aun con entradas rechazadas una a una: van en `refused: [{ id, reason }]`), exit 1 (el verbo entero se rechaza: `{ ok: false, refused: '<motivo>', reason }`) o exit 2 (uso). **Sesión (F1):** `--session`, o `CLAUDE_CODE_SESSION_ID` del entorno; solo `prune` la necesita y sin ninguna de las dos → exit 1 `refused: 'no-session'` (nunca 'sin-sesion'). Todos los verbos se niegan con `refused: 'merge-in-progress'` si hay un merge, rebase o cherry-pick **del checkout principal** (R-11); que un subagente no ejecute el script lo hace cumplir la regla de la guardia (Task 8), no el script.
  - `evidence --since <iso|sha>`: `{ commits: [{ sha, subject }], files: string[], seals: string[], run: <resultado de readRun> }` de lo que **sí** se puede derivar (commits y archivos desde `--since`; `seals` = nombres de archivo de `sealDir(env, repoIdFor({ cwd }))`, `[]` si el directorio no existe; `run` tal cual lo devuelve `readRun`, que nunca es nulo); no inventa decisiones del humano (eso es de la skill, con cita).
  - `scan --id <id>`: `scanLearning`, `findDuplicate` y `checkEvidence` sobre una propuesta, con `{ findings, duplicate, evidence }`; `decide --id <id> [--answer yes|no] [--reserved]`: llama a `decideAcceptance` + `applyDecision`; devuelve `{ decision, reason, promoteCandidate, flags }`. **Sin `--answer`** nunca acepta: devuelve `human` con los `flags` y no mueve nada (los hallazgos del piso y los duplicados sí se rechazan, sin preguntar). El `--answer` lo pasa la skill con lo que el humano respondió en su propio turno (R7).
  - `archive [--days 14] [--dry-run]`: nunca borra. Elegibles (`lib/archive.js`): entradas de `work`, `decisions` e `issues` con `status` `closed`/`decided`/`superseded` y `created` de más de `days` días (el frontmatter de R-1 no tiene fecha de cierre: la edad es `created`); **destino plano `archive/<archivo>`** (los ids ya llevan la fecha; `readEntries({ kind: 'archive' })` de la Task 1 lee un directorio sin subcarpetas y el índice cuenta `archive` solo como contador). **Cómo se mueve (F6, C7 medido):** si la entrada está versionada (`git ls-files --error-unmatch`) → `git mv` (figura como `R`); si no (la crea una skill y el script no commitea, R-11) → `fs.renameSync`; en un directorio sin git, `fs.renameSync`. **Nunca** `learnings/proposed`, `learnings/accepted`, `learnings/rejected`, `plans` ni `sessions`. Con `--dry-run` lista y no mueve. Un destino que ya existe → entrada en `refused` con `reason: 'exists'` y sigue con las demás (exit 0).
  - `index`: llama a `writeIndex` (Task 3). `prune`: llama a `closeShadow` (Task 6) con la sesión resuelta y devuelve su resultado.
- **Operación en curso (F8, C8 medido):** `lib/archive.js` exporta `gitOperationInProgress(main)` → `'merge' | 'cherry-pick' | 'rebase' | null`, con `git rev-parse --git-path MERGE_HEAD | CHERRY_PICK_HEAD | rebase-merge | rebase-apply` desde el checkout principal y `fs.existsSync` de cada ruta (no `<main>/.git/MERGE_HEAD` a mano: en un worktree enlazado vive en `.git/worktrees/<n>/`). **Límite declarado:** un merge que corre en otro worktree enlazado (la cola del hito 7) no lo ve este script; es del hito 7.

**Tests literales (§15 `state`: archivado):**
- [ ] `archive` con una entrada `work` `closed` de hace 20 días, una `closed` de hace 3, una `open` de hace 40, una `learnings/rejected` de hace 60 y una `learnings/accepted` de hace 60 → mueve **solo la primera** a `archive/<archivo>`; las otras 4 siguen donde estaban (rojo: quitar el filtro de tipos). `--dry-run` → misma lista y ningún archivo se movió.
- [ ] **Versionada y sin versionar (F6):** la entrada elegible commiteada → `git status --porcelain` la muestra como `R`; la elegible **sin commitear** (recién creada) → se mueve por `rename` sin error y el índice de git no cambia (rojo: usar `git mv` siempre → `fatal: not under version control`); en un directorio sin git → `rename`.
- [ ] Un destino repetido → esa entrada en `refused` con `reason: 'exists'`, la otra elegible igual se mueve, exit 0. Una entrada ilegible no se archiva y se informa en `refused`.
- [ ] **Operación real en curso (F8):** repo con un `git merge --no-commit` en conflicto en el checkout principal → **cada** verbo sale 1 con `refused: 'merge-in-progress'` y no toca nada (armado con git de verdad, no con un archivo a mano); lo mismo con un `cherry-pick` en conflicto y con un rebase detenido. Con el merge en un worktree enlazado y el script en el principal → no se rechaza (límite declarado; guarda de regresión).
- [ ] **Sesión (F1):** `prune` sin `--session` ni `CLAUDE_CODE_SESSION_ID` → exit 1 `refused: 'no-session'`; con `--session <id>` y la sombra sembrada con ese id (la guardia acaba de tocar su índice) → el `gc` corre (`gc.ran: true`); con la variable de entorno en vez del flag → igual.
- [ ] `decide`: una propuesta limpia con `source: session` y **sin `--answer`** → sigue en `proposed/` con `decision: 'human'` (rojo: auto-aceptarla); con `--answer yes` → queda en `accepted/`; con `--answer no` → en `rejected/`; la misma con `source: web` y sin `--answer` → `human` con el flag `web`; con un `scan` que encuentra `ghp_…` → queda en `rejected/` aun con `--answer yes`; un duplicado de una entrada de `rejected/` → `rejected` sin preguntar. Si la propuesta no está versionada, el movimiento es `rename` (F6).
- [ ] `evidence` sobre un repo con 2 commits desde `--since` → los 2 con su asunto; sin sellos → `seals: []`; con un sello escrito por `writeSeal` → su nombre de archivo en `seals`; `run` con la forma de `readRun` (`running: false` sin `run.json`).
- [ ] `index` tras `archive` → `INDEX.md` sin las entradas movidas y con `archive` solo como contador **de 1** (rojo: destino en subcarpeta → contador 0 o errores de lectura). `prune` en una sombra sin sembrar → `{ pruned: null, gc: null }` y exit 0.
- [ ] Commit: `feat(close-session): evidencia, decisión de aprendizajes, archivado, índice y poda`.

## Ola 4 (Task 8, sola)

### Task 8: cableado (`SubagentStart`, nivel caliente en `SessionStart`, egreso, regla de la guardia)

**Files:**
- Create: `plugins/pignolo/hooks/handlers/subagent-start.js`
- Modify: `plugins/pignolo/hooks/hooks.json` (suma `SubagentStart` con matcher `^pignolo:` y `PreToolUse` `WebSearch|WebFetch|mcp__.*` → `egress`, sin filtro de `agent_type`), `plugins/pignolo/hooks/handlers/session-start.js`, el lanzador `plugins/pignolo/hooks/launcher.js` (conjunto `FAIL_OPEN`), `plugins/pignolo/lib/hook-fastpath.js` (atajo de `egress`), `plugins/pignolo/lib/git-guard.js` (regla `pignolo-plan`: sumar `close-session.js` y `state-index.js` a la lista de scripts que un subagente no ejecuta)
- Test: `tests/subagent-start.test.js`, `tests/session-start-hot.test.js`, `tests/hooks-json.test.js`, `tests/hook-fastpath.test.js` y `tests/git-guard.test.js` (casos nuevos), el test del lanzador, `tests/e2e-hito-6a.test.js`

**Precondición (primer paso, además del ancestro del contrato):** en la rama del hito 5 existen `lib/hook-fastpath.js` (`skips(name, input)`) y la regla `pignolo-plan` en `lib/git-guard.js` (`isPlanScript`); si falta cualquiera → `BLOCKED` (el hito 6 depende del hito 5 también en estos dos puntos).

**Forma real de `readRun` (hito 5, `lib/project.js`; hallazgo F10, C13 medido):** devuelve **siempre un objeto**, nunca `null`: `{ running, expired, file, run?, malformed? }`. Sin `run.json` → `{ running: false, expired: false, file }`; ilegible o que no valida → `{ running: true, malformed: true, file }` (**falla cerrado**, sin `run`); vencido → `{ running: false, expired: true, run }`. `run.task` tiene `{ id, worktree, base, files, agents }` con **`agents` lista** (no existe `task.agent`) y no tiene rama. En todo el hito: `const r = readRun(main); const t = r.running && r.run && r.run.task;` y el agente de la tarea es `t.agents.includes(agent_type)`.

**Interfaces:**
- `subagent-start` (R-5): `agent_type` empieza con `pignolo:` (lo filtra el matcher; el handler lo vuelve a comprobar). Devuelve `{ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext } }` con **(1) el texto de `rules/core.md`** (<= 1.600 caracteres, 1.316 hoy: spec §6.1 y §8.3 lo asignan a este hito) **y (2) la tarjeta** si `t && t.agents.includes(agent_type)` y existe `<main>/.pignolo/tmp/task-<t.id>.md` (<= 6.000 caracteres recortada con "[recortada]", más "Worktree: <t.worktree>" y "Rama: <rama>" con `git -C t.worktree rev-parse --abbrev-ref HEAD` y plazo de 1 s; si git falla, se omite la línea de rama). Con `run.json` ilegible (`malformed`), vencido o sin tarjeta: solo `core.md`. Si `core.md` no se lee → exit 0 sin salida. Nunca exit 2. Con `/pignolo:off` o `PIGNOLO_DISABLED=1` → sin salida.
- **El lanzador nunca niega `SubagentStart` (R-5, F11b):** `launcher.js` suma `const FAIL_OPEN = new Set(['subagent-start'])`; en `fail()` (plazo vencido, error del Worker, entrada inválida), si el hook está en el conjunto, escribe el motivo a stderr y sale con **0** (la doc: `SubagentStart` no puede bloquear; un exit 2 solo muestra un aviso engañoso y pierde la inyección).
- **Egreso sin costo en el hilo principal (F11a):** `lib/hook-fastpath.js` suma a `skips`: `egress` → `true` si `!input.agent_id`. C12 midió 0 denies en 40 corridas bajo `npm test` (máx. 308 ms): el atajo no corrige una falla demostrada, es el mismo patrón que `private-reads` y deja el hilo principal libre por construcción.
- `session-start` (R-3, R-4): el bloque del hito 5 que agrega `deriveNext` se reemplaza por `buildHot`. Condiciones: **no corre con `hooksOff`** (`/pignolo:off`; guarda de regresión del hito 5); `nextText` = `deriveNext(...).text` **solo si** `kind !== 'nothing'` y no empieza con `sabotage` (el sabotaje ya lo informó el bloque de arriba); `flow` = `r.running && r.run ? { flow: r.run.flow, task: r.run.task } : null`; `branch` = la rama del **checkout principal** (`git -C <mainRoot> rev-parse --abbrev-ref HEAD`; el estado vive ahí, spec §10.1), que `buildHot` rotula "Rama del checkout principal" (F13: la rama de `cwd` cambia entre un worktree y el principal y rompería el "mismo texto"); entradas de `readEntries`. **Salida:** `systemMessage` = solo los avisos (como hoy); `additionalContext` = avisos + nivel caliente con `limit = 8000 − longitud(avisos)` (F14: nunca pasa de 8.000, tope duro 10.000). Sin avisos y con nivel caliente → se emite solo `hookSpecificOutput` (sin `systemMessage`). Sin entradas, sin flujo y sin `next` → no agrega nada (callado). Los errores de `readEntries` se suman como un hecho "N entradas de estado ilegibles".
- Ninguna otra salida de `session-start` cambia (guarda de regresión: `tests/session-start.test.js` pasa entero sin tocar).
- **Regla de la guardia y su límite (F15):** cubre solo **ejecutar** `close-session.js` y `state-index.js` desde un subagente. `INDEX.md` y `learnings/accepted/` los protege `protect-paths` contra Edit/Write; **Bash y PowerShell (`cp`, `>`, `Set-Content`, `git mv`) no están cubiertos**: un cambio así llega a `main` solo por la revisión del diff/cola (límite declarado en §8.3, Task 9).

**Tests literales:**
- [ ] `subagent-start`: con `run.json` con la tarea `T1` (`agents: ['pignolo:implementer']`) y su tarjeta escrita → `additionalContext` contiene `core.md` **y** el `Goal` de la tarjeta; `agent_type: 'pignolo:explorer'` en el mismo flujo → solo `core.md` (sin tarjeta); sin `run.json` → solo `core.md`; tarjeta ausente → solo `core.md`; `run.json` ilegible (`malformed`) y vencido → solo `core.md`, exit 0; tarjeta de 9.000 caracteres → su parte <= 6.000 + marca; con `/pignolo:off` → sin salida; `agent_type` sin el prefijo `pignolo:` → sin salida. **Rojo del cableado:** comparar con `agent_type === task.agent` haría fallar el primer caso.
- [ ] **Lanzador y `FAIL_OPEN`:** el lanzador real con `subagent-start` y stdin inválido → exit **0** con el motivo en stderr; con `egress` y stdin inválido → exit 2 (rojo: quitar `subagent-start` del conjunto).
- [ ] `hook-fastpath`: `skips('egress', { tool_name: 'mcp__x__y' })` → `true`; con `agent_id` → `false`; los casos de `plan-audit-gate` y `scope-gate` no cambian.
- [ ] `session-start`: con 3 entradas y un plan en `audited` → `additionalContext` con "Rama del checkout principal", el `text` de `deriveNext` y los punteros, y `systemMessage` **sin** ese texto; con 500 entradas y **con** un aviso de la guardia de 400 caracteres → `additionalContext` <= 8.000 y `systemMessage` es solo el aviso; sin nada → stdout vacío; `deriveNext` con `kind: 'nothing'` o `sabotage…` → su texto no aparece en el nivel caliente; con `/pignolo:off` → sin nivel caliente (y el test del hito 5 sigue verde); una entrada ilegible → el hecho "1 entradas de estado ilegibles"; `source: 'status'` → no cambia nada respecto de hoy.
- [ ] `hooks.json`: `SubagentStart` con matcher `^pignolo:` y el hook de egreso con el matcher exacto `WebSearch|WebFetch|mcp__.*`; todo hook nuevo con `timeout` entre 30 y 60.
- [ ] Regla de la guardia: un subagente que ejecuta `node <plugin>/scripts/close-session.js archive` o `state-index.js` → deny con la alternativa; el hilo principal → pasa; guarda de regresión: el corpus `must-allow` sin un solo deny nuevo.
- [ ] **Humo por el lanzador real** (uno por hook nuevo, procesos nuevos): `egress` (researcher con la ruta del repo y flujo vigente → exit 2 con el mensaje de pignolo, no un exit 2 por handler faltante; sin `agent_id` → exit 0), `subagent-start` (JSON válido con `core.md`), `session-start` (nivel caliente en `additionalContext`).
- [ ] **`resume` con estado:** repo con un plan en `audited`, 2 entradas abiertas y una tarea en curso; el nivel caliente y `next` desde el worktree, desde un subdirectorio y desde el checkout principal, en procesos nuevos → el mismo texto, **incluida la línea de rama** (la del checkout principal, rotulada: C14 midió que la de `cwd` difiere). Rojo: leer la rama o las entradas desde el `cwd` en vez de `mainRoot`.
- [ ] Commit: `feat(continuidad): SubagentStart, nivel caliente en SessionStart y egreso cableados`.

## Ola 5 (Task 9, sola)

### Task 9: cierre de la parte 6a

- [ ] `npm test` completo, una vez, con la máquina tranquila; fallas intermitentes por carga se re-corren solas antes de culpar al código (G8).
- [ ] `plugin.json` a `0.9.0`; entrada `## 0.9.0 — <fecha>` en `CHANGELOG.md`.
- [ ] Spec: §8.3 (egreso acotado a los subagentes mientras hay un flujo en curso y con filtro; `SubagentStart` con lo que se midió; reglas de `protect-paths` sobre `state/`, `INDEX.md` y `accepted/`), §10.1 (`priority`, estados por tipo, `plans/` listado), §6.1 y §8.3 (`SubagentStart` inyecta `core.md` y la tarjeta; el lanzador nunca niega `SubagentStart`), §8.3 (límite declarado: `INDEX.md` y `accepted/` son escribibles por Bash/PowerShell; solo los cubre la revisión del diff), §10.2 (degradación en 4 niveles; la rama es la del checkout principal), §11.6 (el `gc` deja de estar diferido: R-6 con lo medido; rehacer el índice de sesión, medido y descartado), §15 (`state`, `context-budget`, `egress`: qué se midió y qué no).
- [ ] `tests/manual/hito-6.md` (checklist sin correr): forma del payload y de la salida de `SubagentStart` y si cubre la compactación; nombres de campos de `tool_input` de `WebSearch`/`WebFetch`/`mcp__*` y el matcher; que `mcp__.*` se dispare para un MCP real y que `agent_id`/`agent_type` lleguen en un subagente (y también en el hilo principal de una sesión `--agent`); que `CLAUDE_CODE_SESSION_ID` de Bash sea el `session_id` de los hooks; que un exit 2 de `SubagentStart` no bloquee; el nivel caliente en una sesión real tras `/compact`.
- [ ] Revisión final opus de `main..core/hito-6a` y una pasada de arreglos.
- [ ] Commit: `chore(release): hito 6a, versión 0.9.0`.

---

# Parte 6b: carta, skill y evals

## Ola 6 (Tasks 10 y 11 en paralelo)

### Task 10: herramienta de trazas de corridas falladas (G17) (la carta del `learning-validator` en opus, `roles.js` y su bloque `json` quedan RETIRADOS el 2026-10-01, R7)

**Files:**
- Create: `tests/evals/keep-failed-traces.js`
- Test: `tests/keep-failed-traces.test.js`

**Interfaces:**
- `persistFailedTraces({ resultsJson, tempRoot, outDir }) → { copied: string[], missing: string[] }` (**G17**): para cada caso fallado del JSON de resultados de `claude plugin eval` copia su traza a `<outDir>/<caso>-<n>.jsonl` (`outDir` = `tests/evals/generated/traces/<run>/`, ya fuera de git); una traza que ya no está en `tempRoot` va a `missing` (no excepción). **La forma del JSON de resultados y la ubicación de la traza se toman de los `tests/evals/generated/*.json` existentes y de `traces.js` al ejecutar** (no se asumen aquí). Se invoca con `--keep-temp`; los temporales `%TEMP%\claude-eval-*` se borran sin preguntar tras copiar (memoria del autor). La usan las evals de los hitos 7 y 8.
- **El agente `learning-validator` no se toca:** su archivo y su fila de `lib/roles.js` quedan como están en `main` y ninguna skill lo despacha (R7). Quitarlo del plugin es una limpieza aparte, no de este hito.

**Tests literales:**
- [ ] `persistFailedTraces` con un resultado sintético de 3 casos (1 fallado) y su traza en un temporal → copia exactamente una; con la traza borrada → `missing` con el caso; con 0 fallados → `copied: []`.
- [ ] Commit: `feat(evals): trazas de corridas falladas (G17)`.

### Task 11: skill `close-session`

**Files:**
- Create: `plugins/pignolo/skills/close-session/SKILL.md`
- Test: `tests/skill-close-session.test.js` (mismo estilo que `tests/skill-lanes.test.js` y `tests/skill-forms.js`)

**Interfaces:**
- La skill se invoca por el humano (`disable-model-invocation: true`: decide el autor al cerrar, no el modelo). Texto interno en inglés; pasos de §10.4 con los verbos del script (R-11): (0) `git status` y aviso de cambios sin commitear; un merge en curso = parar; (1) `close-session.js evidence --since <inicio de la sesión>` y la **cita literal** de las decisiones del humano de esta conversación; (2) escribir entradas nuevas con `Write` (solo en `learnings/proposed/`, `decisions/`, `work/`, `sessions/`; nunca editar existentes, nunca `INDEX.md` ni `accepted/`); (3) `scan` por propuesta (piso mecánico, duplicados y evidencia, R-9): lo que el piso rechaza se informa y no se pregunta; **no se despacha ningún agente** (R7); (4) por cada propuesta que pasó, la pregunta de `templates/question.md` con la propuesta, su evidencia, los `flags` y una recomendación, y `decide --id <id> --answer yes|no` **solo con lo que el humano respondió en su propio turno** (nunca un sí supuesto); los `promote-candidate` se presentan aparte; (5) `archive --dry-run` mostrado al humano y luego `archive`, `index`, `prune`; (6) un commit propio de `.pignolo/state/` con `git commit -F`.
- La skill es texto; sus tests miran estructura (el comportamiento lo prueba el script, Task 7).

**Tests literales:**
- [ ] El frontmatter tiene `disable-model-invocation: true`; los pasos nombran exactamente los verbos `evidence`, `scan`, `decide`, `archive`, `index`, `prune`; la skill nunca manda editar `INDEX.md` ni escribir en `accepted/`; contiene la instrucción de parar con un merge en curso y la de citar al humano literalmente; la skill **no despacha ningún agente** (ni `pignolo:learning-validator`) y pide el sí del humano antes de `decide --answer yes`; la palabra Engram no aparece (D-6-1).
- [ ] Todo `node <plugin>/scripts/...` de la skill existe y su verbo figura en el uso del script (guarda contra verbos inventados).
- [ ] Commit: `feat(skills): close-session`.

## Ola 7: RETIRADA (R7, 2026-10-01)

### Task 12: evals `agents` del `learning-validator` — RETIRADA

Sin agente validador no hay evals de agentes en este hito (R7, D-6-5). El `learning-validator` no se despacha; los casos `learning-validator-*`, `tests/evals/learning-cases.js` y `tests/learning-cases.test.js` no se escriben. El número 12 no se reutiliza. G14 y G10 (que esta tarea cubría) pasan a las evals del hito 8 (el `debugger`).

---

## Ola 8 (Task 13, sola)

### Task 13: cierre de la parte 6b

- [ ] `npm test` completo; `plugin.json` a `0.10.0`; entrada `## 0.10.0 — <fecha>` en el CHANGELOG (skill `close-session` y herramienta de trazas).
- [ ] **Sin evals por etapas** (R7, D-6-5: no hay agente nuevo; el tope de 8 USD de D-6-2 queda sin usar). Los temporales de `--keep-temp` de otros hitos se borran tras leerlos (con `persistFailedTraces` antes, G17).
- [ ] Spec: §10.4 (verbos del script y la skill; la aceptación es del humano, sin validador), §6 y §7 (el `learning-validator` queda sin uso en la v1: R7; se corrige donde el spec lo describe como parte del flujo), §10.5 (Engram pasa a idea futura: `capture_prompt` no verificado, vía C, versión fijada, con lo verificado en este plan como punto de partida; la v1 no lo usa; y la auto-memoria no se migra: D-8-2), §15 (`state`, `context-budget`, `egress` medidos), §18 punto 6 con lo hecho; **STATE.md** y `docs/gaps.md` (G17 a "hecho (versión)").
- [ ] Revisión final opus de `main..core/hito-6b` y una pasada de arreglos.
- [ ] Commit: `chore(release): hito 6b, versión 0.10.0`.

---

## Estimación de tests

*Hipótesis, sin medir; la línea base se mide en la rama al empezar la ola 0.* **6a ≈ 173 tests nuevos** (Task 1: 17; 2: 14; 3: 20; 4: 22; 5: 22, con `findDuplicate` y `checkEvidence` en lugar de `parseValidation`; 6: 16; 7: 26; 8: 24). **6b ≈ 11** (Task 10: 2, solo trazas; 11: 7; 12: retirada; la Task 13 es de cierre, sin tests propios). **Total ≈ 184** (rango 150 a 230; antes del R7 eran ≈ 207). Suite esperada: línea base + 184. Sin Engram (D-6-1) desaparece la Task 10 anterior (8 tests) y las 4 tareas siguientes se renumeran 10 a 13: 13 tareas, una de ellas retirada (la 12).

## Estimación de costo de las evals

**0 USD (R7, 2026-10-01).** Sin agente `learning-validator` nuevo no hay evals de agentes en este hito: el tope de 8 USD de D-6-2 (≈ 3,4 USD estimados) queda sin usar. Costo de tokens de agentes de 6a y 6b: ninguno en tiempo de ejecución del producto (la skill `close-session` no despacha agentes); la ejecución del plan (implementadores sonnet y las revisiones opus) se estima como la de los hitos 5 y 7.

## Decisiones del autor (todas decididas el 2026-09-30)

**D-6-1. Engram: DECIDIDA el 2026-09-30 (reservada: dependencias): FUERA de la v1.** Debate de dos agentes opus (a favor / en contra); el autor decide sacarlo. Se corrige §10.5 del spec como idea futura y se quita del plan `lib/engram.js`, la opción de `setup`, `engramSaveArgs`, la clave `engram` y todo lo que dependía (los aprendizajes viven en `learnings/accepted/`, en git). Lo verificado contra su documentación queda arriba como insumo de esa idea futura.

**D-6-2. Evals de 6b: DECIDIDA el 2026-09-30 (reservada: costos): aprobadas, tope 8 USD, por etapas con frenos — RETIRADA el 2026-10-01 (R7, D-6-5): sin agente nuevo no hay evals; no se gasta nada.** (Texto original: ≈ 3,4 USD estimados sin rama sonnet; las corría la Task 13.)

**D-6-3. Contratos que se tocan: DECIDIDA el 2026-09-30 (reservada: cambiar un contrato).** (a) §8.3: las reglas de egreso rigen para **todo** subagente mientras haya un flujo de pignolo en curso (`run.json` vigente), con el mismo alcance que el deny de `Agent`; fuera de un flujo no rigen (R-7, Task 4). (b) y (c) RETIRADOS el 2026-10-01 (R7, D-6-5): ya no se cambia la salida del `learning-validator` (bloque `json`) ni su modelo (opus en todos los perfiles); el agente queda como está y sin uso. (d) Campo aditivo `priority` en las entradas de estado (R-1); la clave `engram` ya no existe (D-6-1).

**D-6-4. Auditoría previa de las Tasks 6, 7 y 8: DECIDIDA el 2026-09-30 (costo): aprobada, en dos pasos** (una auditoría opus con la receta medida: revisor + sondas fijas + experimentos puntuales, `tests/evals/RESULTS-planes.md`, ~1,5 a 2,5 USD, acotada a esas tres, antes de ejecutarlas; el resto, solo la revisión final opus de 6a). Esas tres tocan la sombra (`gc` con poda y reconstrucción del índice), mueven archivos de estado (`archive`) y cablean hooks y la guardia.

**D-6-5. Corte intermedio de la continuidad (R7): DECIDIDA por el autor el 2026-10-01 (reservada: alcance), tras la auditoría de buenas prácticas y un debate pro/contra (`docs/audits/2026-10-01-decisiones-auditoria.md`).** El hito 6 **no construye el agente `learning-validator`** (Task 10 original y sus evals, Task 12): los aprendizajes se proponen y se filtran con scripts deterministas (`scanLearning`, `findDuplicate`, `checkEvidence`) y se aceptan solo con el sí del humano en `close-session` (R-8, R-9). Se conserva de la Task 10 solo la herramienta de trazas (G17), que usan las evals de los hitos 7 y 8. Se mantienen Engram fuera (D-6-1) y el resto del hito. Consecuencia en el hito 8: `init` no migra la auto-memoria (D-8-2 revisada). Ahorro estimado: un agente opus, ≈ 3,4 USD de evals (tope 8) y ≈ 20 tests.

**Registradas como técnicas (sin pedir):** R-1 a R-12 (R-10: Engram fuera; R-8 y R-9 reescritas por R7), el reparto 6a/6b, la reconstrucción del índice de la sesión (medida en la auditoría y descartada, R-6), `INDEX.md` sin fecha, la protección de `INDEX.md` y `accepted/` aun con `/pignolo:off`.

## Gaps de `docs/gaps.md` que entran aquí

- **G17** (traza de corridas falladas): Task 10 (`persistFailedTraces`); pasa a "en plan (hito 6)".
- **G14** (`--case` toma solo el último): ya no entra aquí (la Task 12 se retiró, R7); pasa a las evals del hito 8.
- **G7** (razones estructuradas en los scripts): Global Constraints y Tasks 3, 6 y 7 (`refused`, `reason`).
- **G8, G9** (suite una vez al unir, informe único): Método de ejecución.
- **G10** (graders estrictos donde parsea una máquina): ya no entra aquí (Task 12 retirada); pasa a las evals del hito 8.
- No entran: G1 a G6 (método de planes: hito 5), G11, G12, G13 (hechos), G15, **G16** (modo de ejecución según el plan: hito 7).

## Auditoría de esta versión y dónde quedó cada hallazgo

Sin auditar las Tasks 1 a 5 y 9 a 13 (D-6-4: solo 6, 7 y 8; el resto, la revisión final opus de 6a). La de las Tasks 6, 7 y 8 está en la tabla de abajo.

### Auditoría de las Tasks 6, 7 y 8 y dónde quedó cada hallazgo

Auditoría opus en dos pasos del 2026-09-30 (paso 1: revisión, 2 CRITICAL, 10 IMPORTANT, 4 MINOR y 14 afirmaciones; paso 2: experimentos). Rulings nuevos: R-5, R-6, R-11 reescritos y R-12 (egreso con `run.json` ilegible rige: falla cerrado).

| Hallazgo | Severidad | Resultado | Dónde quedó |
|---|---|---|---|
| F1: `close-session` sin clave de sesión: el `gc` nunca corre | CRITICAL | Confirmado (C2). C1 desmentida la premisa: Bash tiene `CLAUDE_CODE_SESSION_ID` y da la misma clave que los hooks (no documentado) | R-6; Task 6 (`closeShadow`: argumento, luego variable, si no `refused: 'no-session'`; test a nivel `closeShadow`); Task 7 (`--session`, verbo `prune`, test CLI); Task 9 (chequeo manual de la variable) |
| F2: `gc --auto` del `prune` choca con el `gc` completo; `prune` fuera del lock | IMPORTANT | La colisión no se reproduce en Git for Windows (C3, `gc --auto` en primer plano); el resto vale | R-6; Task 6 (`gcAuto: false`, `-c gc.autoDetach=false` portable, un solo lock alrededor de `prune` y `gc`, test con `run` espía) |
| F3: el test de poda por fecha de commit no puede fallar | IMPORTANT | Confirmado (C4): vence el `mtime` del objeto suelto; después de un `gc` queda en un pack cruft | Task 6 (`utimesSync` antes de cualquier `gc`; el caso "alcanzable sobrevive" marcado como guarda de regresión) |
| F4: `rebuildSessionIndex` no aporta | IMPORTANT | Confirmado (C6): mismo tamaño y mismo árbol; el tiempo (~1,8 s) no era el problema | R-6 y Task 6: eliminado; Task 9 lo anota en §11.6 como medido y descartado |
| F5: sin plazo del `gc`; lock robable; procesos huérfanos | IMPORTANT | Confirmado (C5): el plazo mata solo `git.exe`, `repack` sigue y deja `gc.pid` | R-6; Task 6 (`gc` sin plazo con `timeout: 0`, `mtime` del lock adelantado, `gc.pid` inocuo, test) |
| F6: `git mv` falla con entradas sin versionar | IMPORTANT | Confirmado (C7) | R-11; Task 7 (versionada: `git mv`; si no: `rename`; `ls-files --error-unmatch`; ambos tests, también en `decide`) |
| F7: destino `archive/<mes>/` que `readEntries` no lee | IMPORTANT | Confirmado por lectura de la Task 1 | Task 7 (destino plano `archive/<archivo>`; test "índice tras archivar cuenta 1") |
| F8: merge en curso solo detecta `<main>/.git/MERGE_HEAD` | IMPORTANT | Confirmado (C8): en un worktree enlazado vive en `.git/worktrees/<n>/` | R-11; Task 7 (`gitOperationInProgress` con `rev-parse --git-path`: merge, cherry-pick, rebase; tests con git real; límite del worktree enlazado, del hito 7) |
| F9: elegibilidad, mes, exit parcial y `seals` sin definir | MINOR | Confirmado | Task 7 (edad = `created`; sin mes; rechazos por entrada en `refused` con exit 0; `seals` = nombres de archivo de `sealDir`) |
| F10: `readRun` nunca es nulo y `task.agents` es lista | CRITICAL | Confirmado (C13); un `run.json` ilegible cuenta como en curso | Task 8 (sección "Forma real de `readRun`", `t.agents.includes`, test con el rojo del cableado); R-5 y R-7 corregidos; Task 4 (handler y test: ilegible rige, R-12); la rama sale de `git -C t.worktree` |
| F11: el lanzador niega con exit 2 por plazo en `egress` y en `SubagentStart` | IMPORTANT | (a) No reproducido (C12: 0 denies en 40 corridas, máx. 308 ms); (b) la doc dice que `SubagentStart` no bloquea (C10) | Task 8 (atajo `egress` sin `agent_id` en `hook-fastpath`, por construcción y no por una falla demostrada; `FAIL_OPEN` para `subagent-start` en el lanzador; tests; precondición del hito 5) |
| F12: nada inyecta `rules/core.md` en los agentes | IMPORTANT | Confirmado por spec §6.1, §8.3 y línea 217 (asignado a este hito) | R-5 y Task 8 (`subagent-start` inyecta `core.md` a todo `^pignolo:` más la tarjeta; tests); Task 9 corrige §6.1 |
| F13: "mismo texto" con la rama de `cwd` | IMPORTANT | Confirmado (C14) | Task 8 (rama del checkout principal, rotulada; el E2E incluye la línea de rama); Task 2 (rótulo); Task 9 (§10.2) |
| F14: avisos más nivel caliente pasan de 8.000; `sabotage` y `nothing`; `hooksOff` | MINOR | Confirmado por lectura del `session-start` del hito 5 | Task 8 (`limit = 8000 − avisos`, filtro de `nothing` y `sabotage*`, sin nivel caliente con `hooksOff`, tests) |
| F15: la regla de la guardia solo cubre ejecutar los scripts | MINOR | Confirmado; la regla `pignolo-plan` y `hook-fastpath` ya existen en `core/hito-5` | Task 8 (precondición BLOCKED, límite declarado); Task 9 (§8.3) |
| F16: una sesión viva idle pierde su última ref por la retención | MINOR | Confirmado por lectura de `retentionPrune` | R-6; Task 6 (`prune` conserva el grupo con `index-<clave>` tocado en 14 días; test con rojo) |
| C1 (variable de sesión en Bash) | afirmación | Falsa: existe `CLAUDE_CODE_SESSION_ID`, no documentada | R-6, Task 6, Task 7, Task 9 (manual) |
| C2 | afirmación | Verdadera | F1 |
| C3 (`gc` ya corriendo) | afirmación | Falsa en Windows | F2 (guarda portable y declarada) |
| C4 | afirmación | Verdadera | F3 |
| C5 | afirmación | Verdadera | F5 |
| C6 | afirmación | Falsa (mismo tamaño, ~1,8 s) | F4 |
| C7 | afirmación | Verdadera | F6 |
| C8 | afirmación | Verdadera | F8 |
| C9 (payload de `SubagentStart`) | afirmación | No verificable sin costo; la doc la apoya | R-5 (hipótesis declarada); `tests/manual/hito-6.md` |
| C10 (exit 2 no bloquea `SubagentStart`) | afirmación | No verificable sin costo; la doc la apoya | R-5 (`FAIL_OPEN`); `tests/manual/hito-6.md` |
| C11 (matcher `mcp__.*` y `agent_id`) | afirmación | No verificable sin costo; la doc la apoya (`agent_id` también aparece en el hilo principal de una sesión `--agent`) | R-7 (hipótesis declarada); `tests/manual/hito-6.md` |
| C12 | afirmación | Falsa (0/40) | F11 (el atajo se mantiene como patrón, no como arreglo) |
| C13 | afirmación | Verdadera | F10 |
| C14 | afirmación | Verdadera | F13 |
