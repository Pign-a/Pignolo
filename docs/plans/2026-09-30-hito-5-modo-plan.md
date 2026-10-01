# Hito 5 del núcleo: modo `plan`. Plan de implementación (método liviano)

> **Para quien ejecute:** olas de a lo sumo dos tareas en paralelo (CLAUDE.md: "uno o dos frentes a la vez"), implementadores sonnet, sin revisión por tarea, una revisión final opus por parte con una pasada de arreglos. Los pasos usan casillas (`- [ ]`). Las tarjetas dan archivos, interfaces con nombres y formas exactos, y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege.

**Objetivo:** que el carril `plan` exista de punta a punta: lista de afirmaciones clave, `spec-reviewer` y scope-card, `scope-gate` (sin tarjeta aprobada, nada llega a `main`), `plan-auditor` con la receta medida (revisor opus, sondas fijas precisas, experimentos forzados por hook), `validator` por tanda, `next`, presentación visual (artifact o texto) y aprobados visuales versionados con el mismo formato que pignolo-ui §3.3.

**Arquitectura:** dos partes, como en los hitos 3 y 4. **5a** es todo lo determinista (librerías, scripts, hooks, tests de §15 `scope-gate`, `next`, `resume`, `present`) y no gasta tokens de agentes. **5b** son las cartas de los agentes, las skills `plan` y `present`, las plantillas visuales y las evals `agents` de `spec-reviewer`, `plan-auditor` y `validator`, con costo que decide el autor.

**Stack:** Node ≥ 22 sin dependencias npm, `node:test`, git ≥ 2.31, hooks de Claude Code. **Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` §4.5, §4.6, §5.2, §5.3, §6, §6.1, §8.3 (`scope-gate`), §9.1 (holdout), §10 (solo lo que `next` necesita), §15, §18 punto 5; `docs/specs/2026-09-28-pignolo-ui-v1-design.md` §3.3 (A-19) y §13. **Receta del `plan-auditor`:** `tests/evals/RESULTS-planes.md` (la medida: M6 opus 38 %, M7 opus 45 %, sonnet no alcanza).

## Alcance: por qué el hito 5 se parte en dos

- **5a (versión 0.7.0):** registro del plan y de la tarjeta, sondas, estado de la auditoría, aprobados, lógica de presentación, `next`, los hooks `scope-gate`, `plan-audit-gate` y `present-gate`, la regla de la guardia, el cableado y los tests de punta a punta. Sin evals.
- **5b (versión 0.8.0):** cartas de `spec-reviewer`, `plan-auditor` e `implementer` (aprobado visual), skills `plan` y `present`, plantillas visuales con `APPROVALS.md` vacío, y evals.
- **Diferido con dueño:** olas, `queue/` y el worktree por tarea con `isolation` son del **hito 7**; `next` no cubre "`queue/` con conflicto" hasta entonces. El estado completo (`INDEX.md`, nivel caliente, `close-session`) es del **hito 6**: en 5 el registro del plan vive en `.pignolo/state/plans/` y el 6 lo indexa sin moverlo. `/pignolo:init` (que escribe `presentation` y `canvas-consent` en `project.md`) es del hito 8.

## Global Constraints

- Node ≥ 22, sin dependencias npm. Tests con `node:test`; la suite completa corre con `npm test`, nunca con `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits con `git commit -F <archivo>`; archivos en LF sin BOM; nada de texto largo por comillas de la shell (regla 6 de `rules/core.md`).
- Los comandos de test y los experimentos corren **con shell** o por script, nunca `npm`/`npx` sin shell (shims `.cmd` en Windows, medido).
- Hooks: forma exec con `node` y el launcher, `timeout` del host 30 a 60 s, plazo interno 3 s que al vencer niega, **callados en el éxito**, cada bloqueo con `Alternativa:`. `/pignolo:off` y `PIGNOLO_DISABLED=1` apagan todos los hooks nuevos (§3.3). Los hooks nuevos filtran evento y agente **antes** de cargar módulos de git (el hook de `Bash` corre en cada comando), y el filtro de solo-payload (`lib/hook-fastpath.js`) lo consulta el launcher **antes de crear el Worker**, como ya hace con `private-reads` (R-15).
- Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js`. Escrituras atómicas (temp + rename) como `writeRun` de `scripts/run.js`, **salvo los contadores que escriben los hooks**: son logs de solo-agregar (`appendFileSync`, una línea por evento), porque la lectura-modificación-escritura pierde incrementos bajo llamadas paralelas y el rename da `EPERM` en Windows con un lector (254 de 2000 intentos, medido: R-15).
- Todo lo que escribe estado (`plan.js`, `plan-audit.js`, `approved.js`) lo ejecuta **solo el hilo principal** (regla `pignolo-plan` de la guardia, Task 12). `next.js`, `approved-verify.js`, `plan-check.js` y `present.js check` son de lectura y los puede correr cualquiera.
- Las claves nuevas de `project.md` (`presentation`, `canvas-consent`) y de `run.json` (`plan`) son **aditivas y opcionales**: un archivo de hoy se lee igual.
- Datos de ejemplo de plantillas y fixtures: sintéticos; nada del proyecto del autor, personas ni credenciales en lo versionado (el repo es público).

## Método de ejecución y economía de tests

El de los hitos 3 y 4 con el método liviano: worktrees a mano desde la etiqueta del contrato (`contract/hito-5a/v1` tras la ola 1), implementadores sonnet en segundo plano con brief e informe en archivo, una revisión final opus de `main..core/hito-5a` y otra de `main..core/hito-5b`, una pasada de arreglos cada una. Tests de tabla desde el spec, handlers en proceso (`require(handler).run(input, ctx)`) y **un** test de humo por el launcher real por hook nuevo (Task 12); cada implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege** (lo mira la revisión final); un caso que ya pasa hoy se marca "guarda de regresión" y no cuenta como test del plan. Primer paso de cada tarea de ola ≥ 1: `git merge-base --is-ancestor contract/hito-5a/v1 HEAD`; si falla, `BLOCKED`.

## Review Focus

1. **`scope-gate` falla abierto o frena de más.** Es texto sobre comandos de `git merge`/`git push` (Bash y PowerShell): un plan sin tarjeta aprobada llega a `main` si la detección se escapa, y un `daily` suelto queda trabado si es demasiado ancha. Dueñas: **Task 9** (decisión) y **Task 13** (recorridos). Debe fallar cerrado dentro de un plan (registro ilegible, tarjeta cambiada, rama actual ilegible, comando que no se parsea) y callar sin plan. Los destinos y verbos que la guardia ya entiende (`checkout main &&`, `cd <main> &&`, `pull`, `rebase`, `fetch . x:main`, `branch -f`, `update-ref`) se miran con el parser de la guardia, no con una regex (R-14).
2. **El forzado de experimentos se evade o cuelga la sesión.** `plan-audit-gate` niega `Bash` al `plan-auditor` en modo `review`, cuenta experimentos en `verify` (en `PostToolUse` **y** en `PostToolUseFailure`: un `Bash` que falla no dispara el primero; con un log de solo-agregar, no un contador que se reescribe) y bloquea el cierre hasta uno por afirmación (como mucho 2 veces: lo medido; el intento se cuenta antes de cualquier otro trabajo). Un `mode.json` viejo no puede dejar al `plan-auditor` sin Bash para siempre (TTL 30 min y `plan-audit.js end`), y fuera de una auditoría el hook no hace nada. Dueña: **Task 10**.
3. **Las sondas disparan por lo que no deben o "confirman" lo que no probaron.** En una auditoría real dispararon sobre afirmaciones ajenas porque el disparador miraba todo el texto de la tarea del plan y palabras genéricas (`shell`, `launch`, `child`, `timeout`, `git apply`; `tests/bench/plans/probes.js`, `runProbes`). Aquí el disparador mira **solo el texto de la afirmación**, con dos condiciones a la vez, y una sonda **solo refuta**: que no falle no cierra la afirmación. Dueña: **Task 2**.
4. **Un aprobado visual se puede pisar o no coincide con pignolo-ui.** Inmutabilidad (`-v2`), verificación de sha256 por archivo y manifest, y formato idéntico al de `approve.mjs`: una carpeta guardada por uno tiene que verificar con el otro. Dueña: **Task 6**.
5. **La presentación publica lo que no debe.** `presentation: text` nunca publica; un dato de `pii-patterns` o un secreto bloquea; el lienzo "Design" exige consentimiento del proyecto; el artifact lleva exactamente las opciones del texto. El hook sobre `Artifact` depende de la forma del `tool_input`, que **no se verificó** (ruling R-9): por eso hay una segunda capa en la skill. Dueñas: **Tasks 7 y 11**.
6. **`next` escribe o contradice al estado.** Es solo lectura (nada de `git` que mute, `recoverAll` con `restore: false`), una única acción, y un estado ilegible nunca se lee como "sin flujo". Dueña: **Task 8**.

## Rulings del plan (técnicos, registrados)

- **R-1: una sola `plan-auditor`, dos modos, y un archivo de modo.** Sin rol nuevo. El orquestador escribe `<main>/.pignolo/tmp/plan-audit/<plan>/mode.json` (`plan-audit.js begin-review|begin-verify`) y los hooks deciden por él. Paso 1 = `review` (sin Bash: lo hace cumplir el hook, no el texto); paso 2b = `verify` (con Bash y con escritura acotada al `scratch/` de esa carpeta). Las sondas (2a) las corre el orquestador, no un agente. La carpeta está bajo `tmp/` (autoignorada, `.pignolo/.gitignore`).
- **R-2: el contador de experimentos es el de la medición.** `PostToolUse` y `PostToolUseFailure` sobre `Bash|PowerShell` suman una llamada (R-15) y anotan el comando en `bash-calls.log`; no se lee la transcripción (con `-p --no-session-persistence` no se escribe; `RESULTS-planes.md`). El bloqueo es `{"decision":"block","reason":…}` en `SubagentStop`, **hasta 2 veces** (`MAX_BLOCKS = 2`) y después deja terminar con `incomplete: true`, que el veredicto convierte en `ESCALATE` (`claims-not-verified`), nunca en `APPROVE`. Se agrega lo que la medición no tenía: el último mensaje tiene que traer una entrada por afirmación (`id`, `verdict`, `experiment`); si falta, cuenta como faltante igual que un experimento.
- **R-3: una sonda solo refuta.** `falsified: true` cierra la afirmación como hallazgo; cualquier otra cosa la deja para el paso 2b. Las cinco sondas del banco (`npm-without-shell`, `kill-leaves-grandchild`, `spawnsync-blocks-loop`, `git-apply-numstat`, `kill0-eperm`) se portan a `lib/plan-probes.js` con disparadores precisos (Task 2). La lista crece con cada error nuevo que aparezca en un plan real. **Límite declarado:** salen de errores ya vistos; miden cobertura de riesgos conocidos, no el caso general.
- **R-4: `plan-check` solo con planes en tarjetas** (`isCardPlan`: un `### Task` con `**Files:**` o `**Interfaces:**` cerca). Ya ignora lo que una tarjeta marca como `Create`/`Test` (se midió con una tarjeta de 10 líneas contra este repo: un solo problema, la ruta que de verdad no existe); falta el detector y la opción `--require-cards`. Sin replay, nunca.
- **R-5: el registro del plan.** `<main>/.pignolo/state/plans/<plan>/plan.json` (esquema en Task 1) y `scope-card.md` al lado; se commitea en la rama del plan solo entre pasos (§10.1) y solo lo escribe el hilo principal. Etapas (lista cerrada, en orden): `spec`, `claims`, `spec-review`, `scope-card`, `plan-written`, `audited`, `executing`, `validating`, `final-review`, `closed`. Avanzar exige la precondición de la etapa; volver atrás solo con `reopen` y borra la aprobación y la auditoría.
- **R-6: la tarjeta aprobada se ata a su texto.** La aprobación guarda el sha256 de `scope-card.md` y la cita literal del humano; si el archivo cambia, el estado pasa a `changed` y hay que aprobar de nuevo. Los ejemplos de aceptación se validan mecánicamente: de 3 a 7, cada uno con una cita entre comillas que aparece **literal** (sin mayúsculas ni espacios de más) en el pedido original guardado en el plan.
- **R-7: `scope-gate` solo mira los planes que el comando toca.** Un plan es relevante si el comando nombra `int/<p>`, `queue/<p>` o `task/<p>/…` (no `task/daily/`), o si el flujo en curso (`run.json.plan`) es ese plan. Un `daily` suelto no se toca. Un flujo `plan` sin plan registrado también se niega. Merge hacia ramas que no son `main`/`master` no se mira (límite declarado, R-14). La guardia sigue pidiendo confirmación del merge a `main`: `scope-gate` es un piso, no lo reemplaza.
- **R-8: presupuesto previo a la aprobación, decidido por el autor (D-5-3, 2026-09-30): una ola por perfil, `max` 3, `balanced` 2, `economy` 1.** `runnableBeforeApproval(plan, { limit })` recibe el tope; el valor por perfil es `preApprovalTasks` en `PROFILE_PARAMS` (`lib/roles.js`). Sin perfil o con tope 0 no corre ninguna tarea antes de la aprobación. Una tarea que nombra una `A<n>` (esté o no en la tarjeta) depende de ella y no corre (falla cerrado).
- **R-9: el hook de `Artifact` es best-effort.** El `tool_input` de la herramienta (`file_path`, `type_url`) viene de la descripción de la herramienta, no de un payload medido. `present-gate` lo lee con tolerancia (si no entiende la forma, calla) y la skill `present` corre `present.js check` **antes** de publicar: esa es la capa que no depende del hook. Chequeo manual en `tests/manual/hito-5.md`.
- **R-10: `next` y el arranque.** `SessionStart` suma la salida de `next` como hechos solo si hay algo en curso (plan sin cerrar, flujo vigente o vencido con tarea, tarea BLOCKED, sabotaje pendiente) y calla si no. El nivel caliente (§10.2) es del hito 6.
- **R-11: ejecución en `plan` hasta el hito 7.** Serial: la skill crea `int/<plan>` desde la rama actual y cada tarea sigue los pasos de `daily` (worktree, test-card, sabotaje, `on-done`, riesgo) en la rama `task/<plan>/<NN>-<slug>` desde `int/<plan>`, con merge a `int/<plan>` confirmado y merge de `int/<plan>` a la rama de origen con pregunta `irreversible` y `scope-gate`. El hito 7 lo reemplaza por olas, contrato y cola.
- **R-12: aprobados.** Mismo formato que pignolo-ui §3.3: `design/approved/<flujo>/` (`^design/approved/[a-z0-9][a-z0-9-]{0,63}$`), un HTML por pantalla, `manifest.json` = `{ flow, version, date, files: [{ path, sha256 }] }`, inmutable (`-v2`, `-v3`…), verificación con los mismos problemas (`manifest-sha-mismatch`, `file-changed`, `extra-file`, `missing-file`, `manifest-unreadable`). El núcleo trae su propio escritor (no depende de pignolo-ui); si pignolo-ui está, lo que guardó su `approve.mjs` verifica igual aquí. La decisión se registra en `.pignolo/state/decisions/<fecha>-<flujo>.md` (frontmatter `id`, `status`, `source`, `evidence`, `created`).
- **R-13: contratos tocados, todos sin reducir nada.** `run.json` suma `plan` opcional; `hooks.json` suma tres hooks (seis entradas, con `PostToolUseFailure`) que solo actúan dentro de un flujo `plan` o de una auditoría, y el launcher gana atajos de solo-payload; `protect-paths` suma una regla por rol (`pignolo:plan-auditor`). **Lo único que cambia una tabla del spec es el `Write` del `plan-auditor` (D-5-1, del autor).**
- **R-14: `scope-gate` reutiliza el parser de la guardia y falla cerrado (auditoría 5a, F1, F2, F3, F15).** En lugar de una regex propia, `git-guard.js` exporta `gitCommands` (`sub`, `onMain`, `cwdChanged`, `positionals` por invocación de `git`) y `scope-gate` clasifica por subcomando. Mira `merge`, `pull`, `rebase`, `cherry-pick`, `push`, `fetch` (con refspec a `main`), `branch -f main`, `update-ref refs/heads/main` y `reset` que nombra una rama del plan; lo que no mira se declara y se fija con un test. Dentro de un plan, una rama actual ilegible o detached cuenta como `main`, un `cd`/`-C` previo en el mismo comando cuenta como destino `main` (el `cwd` del hook es el de la sesión, C9), y un `run.json` o un `plan.json` ilegible niega. Se eligió esto y no guardar la rama de origen en `plan.json` (F15): es lo más simple y el hueco queda declarado (el merge a una rama de origen que no es `main` no se mira; la guardia sigue preguntando).
- **R-15: contadores de hooks como logs de solo-agregar, dos eventos y atajos del launcher (auditoría 5a, F5, F6, F7, F4; C5, C6, C7, C8).** (i) `experiments` = líneas de `bash-calls.log`, los intentos de cierre = líneas de `stops.log`, `incomplete` = una línea en `stops.log`: ningún hook reescribe `mode.json` (lo escribe `plan-audit.js`, hilo principal); así no se pierden incrementos y no hay rename (`EPERM` medido). (ii) Un `Bash` con código distinto de cero dispara `PostToolUseFailure` y no `PostToolUse` (medido en el código del host): `plan-audit-gate` se registra en los dos. (iii) `readMode` busca `plan-audit/*/mode.json`, ignora vencidos e ilegibles y, con varios vivos, toma el de `started` más reciente; devuelve `plan`. (iv) `lib/hook-fastpath.js` (`skips`) hace salir al launcher con 0 antes de crear el Worker cuando el payload no puede concernir al hook (agente que no es de la auditoría; comando sin `git` y sin verbo gated): con cuatro launchers por `Bash` y `npm test` en paralelo se midieron 3,5 s contra el plazo de 3 s. (v) `SubagentStop` cuenta el intento antes de cualquier otro trabajo; un fallo del launcher antes de llegar al handler lo acota solo el tope nativo (8 seguidos, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`; límite declarado en la spec).
- **R-16: una sola interfaz para "el agente que corre experimentos" (D-5-1 sigue abierta; auditoría 5a, F11).** `lib/plan-agents.js` exporta `REVIEW_AGENT` (`pignolo:plan-auditor`, paso 1) y `VERIFY_AGENT` (paso 2b). El handler, `protect-paths`, el matcher de `hooks.json` y los tests usan esas constantes. Con la opción (a) de D-5-1 las dos son `pignolo:plan-auditor`; con la (b), `VERIFY_AGENT` es `pignolo:plan-verifier` y el cambio es la constante, el matcher, el rol y su carta (Task 10 detalla la lista). Hasta que el A/B decida, la Task 10 se escribe y se ejecuta igual con cualquiera de las dos.

## Qué se verificó al escribir este plan

Solo lectura del repo en `core/hito-4b` (plugin 0.6.0), más una corrida de `plan-check` sobre una tarjeta de 10 líneas. Medido: (a) `plan-check` ya ignora `Create`/`Test` (R-4); (b) la causa de las sondas de más (Review Focus 3) está en el código del banco; (c) `plan-auditor` tiene `Read, Grep, Glob, Bash` y **ningún `Write`** (`lib/roles.js:28`), y la guardia niega `node -e` con procesos: por eso el paso 2b de la medición usaba `Write` para el script de cada experimento, y por eso D-5-1 existe. **No verificado** (se mide al ejecutar o en el checklist): la forma del `tool_input` de `Artifact` (R-9); que `SubagentStop` entregue `last_assistant_message` para `pignolo:plan-auditor` (sí lo hace para los escritores: `handback-gate.js`); que un hook `PostToolUse` sobre `Bash` reciba `agent_type` dentro de un subagente (hipótesis abierta desde 3a, la confirma el checklist del 4a); el comportamiento de los agentes con las cartas nuevas (evals).

---

# Parte 5a: determinista

## Ola 0 (contratos; Tasks 1 y 2 en paralelo, archivos disjuntos)

### Task 1: registro del plan y tarjeta de alcance (`lib/plan-state.js`, `lib/scope-card.js`)

**Files:**
- Create: `plugins/pignolo/lib/plan-state.js`, `plugins/pignolo/lib/scope-card.js`
- Test: `tests/plan-state.test.js`, `tests/scope-card.test.js`

**Interfaces:**
- Consume: `mainRoot` de `lib/disabled.js`; `matchAny` no hace falta. Slug de plan: `^[a-z0-9][a-z0-9-]{0,63}$` (la misma `ID_RE` de `scripts/run.js`).
- `lib/scope-card.js` produce:
  - `SECTIONS = ['Goal', 'Acceptance examples', 'Request to spec', 'Not included or reinterpreted', 'Added without being asked', 'Out of scope', 'Reserved decisions', 'Cost estimate']`: encabezados `## <nombre>` exactos, una vez cada uno y en ese orden.
  - `parseScopeCard(text) → { sections: { [name]: string }, examples: [{ text, quote }], added: [{ id, text }], errors: string[] }`.
  - `validateScopeCard(text, { request }) → string[]` (vacío = válida). Reglas literales: `Goal` es una línea no vacía; `Acceptance examples` tiene de 3 a 7 ítems (`- ...`), cada uno con **un** fragmento entre comillas rectas o tipográficas cuyo texto, normalizado (minúsculas, espacios colapsados), aparece dentro del `request` normalizado; `Added without being asked` es el único ítem `none` o ítems `A<n>: <texto>` con ids consecutivos desde `A1`.
- `lib/plan-state.js` produce (todas con `main` = raíz del checkout principal):
  - `STAGES` (R-5), `planDir(main, plan)`, `listPlans(main) → string[]`.
  - `readPlan({ main, plan }) → { ok: true, plan } | { ok: false, error, missing?: true }` (un `plan.json` que no parsea o no valida es `ok: false` sin `missing`: quien lo consulta falla cerrado).
  - `newPlan({ main, plan, request, spec, now })`, `setClaims({ main, plan, claims, noneReason })`, `resolveClaim({ main, plan, id, status, source, by, note, superseded })`, `claimsOpen(planObj) → [{id,status}]` (los `open` y los `refuted` sin `superseded`).
  - `saveScopeCard({ main, plan, text })` (valida con `validateScopeCard`, escribe `scope-card.md`, guarda `scopeCard.sha256` y `added`, borra una aprobación previa), `approveScopeCard({ main, plan, quote, now })`, `scopeCardState({ main, plan }) → 'none' | 'draft' | 'approved' | 'changed'`.
  - `recordAudit({ main, plan, audit })`, `auditState({ main, plan, planFile }) → 'none' | 'stale' | 'incomplete' | 'ok'`.
  - `advance({ main, plan, to, reopen, planFile, now })` con las precondiciones: `claims` ← la spec registrada existe; `spec-review` ← sin `claimsOpen`; `scope-card` ← hay tarjeta guardada; `plan-written` ← `planFile` existe; `audited` ← `auditState === 'ok'` (el sha256 del plan coincide con `audit.planSha256`); `executing` ← `scopeCardState === 'approved'`; el resto, solo en orden. Saltar una etapa es error.
  - `runnableBeforeApproval(planObj, { limit }) → tasks[]`: las tareas de `planObj.tasks` (`{ id, added: [] }`) que no dependen de ninguna `A<n>` que exista en la tarjeta, en orden, hasta `limit`.
- Esquema de `plan.json` (`v: 1`): `plan`, `created`, `stage`, `request` (literal), `spec`, `claims` (`[{ id, text, system, status: 'open'|'corroborated'|'refuted'|'inconclusive'|'hypothesis', source, by, note, superseded }]`), `claimsNone` (motivo), `scopeCard` (`{ sha256, added: [{id,text}], approved?: { at, quote, sha256 } }`), `tasks`, `audit` (`{ verdict, at, planSha256, incomplete, findings }`).

**Tests literales (de tabla; rojo = quitar la función que protege):**
- [ ] `scope-card`: una tarjeta con los 8 encabezados, 3 ejemplos y citas presentes en el pedido → `[]`. Casos que fallan, uno por regla: falta `Out of scope`; dos encabezados invertidos; 2 ejemplos; 8 ejemplos; un ejemplo sin comillas; una cita que no está en el pedido (cambiar una palabra); una cita que sí está pero con otra mayúscula y dos espacios → **válida**; `Added…` con `A2` sin `A1`; `Added…` con `none` y un ítem más.
- [ ] `plan-state`: `newPlan` con slug `Foo` → error; el mismo slug dos veces → error `exists`. `advance` a `spec-review` con un claim `open` → error que nombra el id; con `refuted` sin `superseded` → error; con `hypothesis` → pasa. A `claims` con `claims: []` sin `noneReason` → error; con motivo → pasa. Saltar de `spec` a `audited` → error. `approveScopeCard` con `quote: ''` → error; aprobar y después editar `scope-card.md` → `changed`; `saveScopeCard` otra vez → `draft` sin aprobación. `advance` a `executing` con `draft` o `changed` → error; con `approved` → pasa. `auditState`: tras `recordAudit` con `planSha256` y cambiar un byte del plan → `stale`; `incomplete: true` → `incomplete`. `reopen` borra `scopeCard.approved` y `audit`. `runnableBeforeApproval` con `T1{added:[]}`, `T2{added:['A1']}`, `T3{added:[]}`: `limit: 1` → `[T1]`; `limit: 5` → `[T1, T3]`; `limit: 0` → `[]`. Un `plan.json` truncado → `readPlan` da `ok: false` sin `missing`.
- [ ] Commit: `feat(plan): registro del plan, etapas y tarjeta de alcance`.

### Task 2: sondas fijas con disparadores precisos y detector de planes en tarjetas

**Files:**
- Create: `plugins/pignolo/lib/plan-probes.js`
- Modify: `plugins/pignolo/lib/plan-check.js` (agrega y exporta `isCardPlan`), `plugins/pignolo/scripts/plan-check.js` (opción `--require-cards`)
- Test: `tests/plan-probes.test.js`, `tests/plan-check.test.js` (casos nuevos)

**Interfaces:**
- `lib/plan-probes.js` produce: `PROBES` = lista de `{ id, keywords, triggers: RegExp, run() → { falsified: boolean, evidence: string } }` con los cinco ids de R-3 (portar `run` de `tests/bench/plans/probes.js` sin cambios de lógica); `triggerText(claim) → string` = `claim.claim + '\n' + claim.how`, **sin** el texto de la tarea; `runProbes({ claims, probes = PROBES }) → { results: [{ claimId, probe, falsified, evidence }], closed: string[], findings: [{ task, kind: 'probe <id>', evidence, keywords }] }`. Cada sonda corre a lo sumo una vez por llamada; `closed` tiene solo los ids de afirmaciones donde una sonda dio `falsified: true`.
- Disparadores (el texto exacto importa; dos condiciones a la vez con lookahead, límites de palabra, `i`):
  - `npm-without-shell`: `/^(?=[\s\S]*\bnp[mx]\b)(?=[\s\S]*\b(spawn\w*|execFile\w*|child_process|shell\s*:\s*false|without (a )?shell|sin shell)\b)/i`
  - `kill-leaves-grandchild`: `/^(?=[\s\S]*\bkill\w*)(?=[\s\S]*\b(grandchild|nieto|descendants?|process tree|árbol de procesos)\b)/i`
  - `spawnsync-blocks-loop`: `/^(?=[\s\S]*\b(spawnSync|execSync|execFileSync)\b)(?=[\s\S]*\b(setTimeout|setInterval|timers?|heartbeat|event loop|watchdog|SIGINT|SIGTERM)\b)/i`
  - `git-apply-numstat`: `/git apply[\s\S]{0,40}--numstat|--numstat[\s\S]{0,60}\b(apply|applies|aplica)\b/i`
  - `kill0-eperm`: `/kill\(\s*\w+\s*,\s*0\s*\)|\bEPERM\b/`
- `lib/plan-check.js`: `isCardPlan(planText) → boolean` (hay un `### Task` y, en las 60 líneas siguientes, una línea `**Files:**` o `**Interfaces:**`). `scripts/plan-check.js --require-cards` sale con **2** y `el plan no está en tarjetas (Files/Interfaces): plan-check no aplica` si no lo es.

**Tests literales:**
- [ ] Disparadores, con sondas inyectadas (`run` falso que cuenta llamadas): cada sonda con un caso que dispara y uno que no. `npm-without-shell`: dispara con "`spawn('npm', ['test'])` runs without a shell on Windows"; **no** con "the plan documents the npm test script" ni con "run npm test in a shell"; `kill-leaves-grandchild`: dispara con "killing the child also kills its grandchild"; no con "the child timed out" ni "kill the stale lock file"; `spawnsync-blocks-loop`: dispara con "spawnSync does not block the heartbeat timer"; no con "spawnSync runs the gate"; `git-apply-numstat`: dispara con "`git apply --numstat` proves the patch applies"; no con "`git apply --check` validates the patch" ni con "git apply" a secas; `kill0-eperm`: dispara con "`process.kill(pid, 0)` throws only if the process is dead"; no con "the pid is stored".
- [ ] **No dispara por la tarea:** una afirmación "the helper returns the list sorted" dentro de un plan cuya tarea menciona `spawn npm` y `kill` → `results` vacío (con el disparador del banco habría corrido).
- [ ] **Una sonda solo refuta:** una sonda inyectada con `falsified: false` que dispara → el id no está en `closed` y no hay hallazgo.
- [ ] Reales en esta máquina: `git-apply-numstat` y `kill0-eperm` (sin `process.platform` condicional salvo la propia sonda); `npm-without-shell`: en `win32` `falsified === true`, en otro SO `false`. Las otras dos corren reales en la Task 13 (llevan temporizadores).
- [ ] `isCardPlan`: una tarjeta de 3 líneas → `true`; un plan en prosa con bloques de código → `false`; `### Task 1` sin Files ni Interfaces → `false`; `--require-cards` sobre prosa → exit 2. **Guarda de regresión (ya pasa hoy):** `Create: lib/x.js` y `Produce: x()` no se marcan como inexistentes.
- [ ] Commit: `feat(plan): sondas fijas con disparadores precisos y detector de tarjetas`.

**Tag de contrato:** unir Tasks 1 y 2 a `core/hito-5a` y etiquetar `contract/hito-5a/v1`.

## Ola 1 (Tasks 3 y 6 en paralelo)

### Task 3: estado de la auditoría (`lib/plan-audit.js`)

**Files:**
- Create: `plugins/pignolo/lib/plan-audit.js`
- Test: `tests/plan-audit.test.js`

**Interfaces:**
- Consume: nada de `plan-state` (esta librería es pura salvo el archivo de modo).
- Produce:
  - `MAX_CLAIMS = 8`, `MAX_BLOCKS = 2`, `TTL_MIN = 30`, `auditDir(main, plan)` = `<main>/.pignolo/tmp/plan-audit/<plan>`.
  - `parseReview(text) → { findings, claims, error }`: el **último** bloque ```json del texto, objeto `{ findings: [{ task, kind, evidence, keywords? }], claims: [{ id, task, claim, how }] }`; ids de afirmación únicos y no vacíos, `claim` y `how` no vacíos, a lo sumo 8; si no, `error` con el motivo.
  - `parseVerification(text, claims) → { entries, missing, error }`: último bloque ```json, lista de `{ id, verdict: 'holds'|'false'|'inconclusive', experiment, evidence }`; `missing` = ids de `claims` sin entrada válida (con `experiment` no vacío).
  - `beginMode({ main, plan, mode: 'review'|'verify', claims, planSha256, now, ttlMin }) → modeObj` (escribe `mode.json`: `v, plan, mode, started, expires, claims, planSha256`; **no** guarda contadores, R-15), `readMode({ main, now }) → { active: true, plan, mode, dir, claims, started, expires, planSha256, experiments, attempts, incomplete } | { active: false }` (busca `plan-audit/*/mode.json`; vencido, ausente o ilegible = inactivo, **no** bloquea: ver Review Focus 2; con varios vivos, el de `started` más reciente; `experiments` = líneas no vacías de `bash-calls.log`, `attempts` = líneas `stop` de `stops.log`, `incomplete` = hay una línea `incomplete`), `recordExperiment({ main, plan, command })` (un `appendFileSync` a `bash-calls.log`; el comando en una sola línea), `recordStop({ main, plan }) → attempt` (agrega `stop` a `stops.log` y devuelve el número de intento), `markIncomplete({ main, plan })`, `endMode({ main, plan })`. `plan-audit.js` reescribe `mode.json` con un reintento corto ante `EPERM`/`EBUSY`; ningún hook lo reescribe.
  - `stopDecision({ mode, lastMessage, attempt }) → null | { block: true, reason } | { block: false, incomplete: true }`: en `verify`, bloquea si `experiments < claims.length` o si `parseVerification(...).missing.length > 0`, con el texto "You ran N experiment(s) for M claim(s): K still missing; for each remaining claim (ids) write a script in <scratch> with Write, run it with Bash, and give the final json array again"; en `review`, bloquea si `parseReview(lastMessage).error`; con `attempt > MAX_BLOCKS` y algo todavía faltante devuelve `{ block: false, incomplete: true }` (quien llama hace `markIncomplete`). Es pura: no escribe nada.
  - `buildAudit({ review, probe, verification, planCheck, mode, now }) → { verdict, findings, incomplete, reason? }`: los hallazgos del paso 1, los de las sondas (`probe <id>`), los de `verification` con `verdict: 'false'` (`kind: 'experiment-false'`, `task` de la afirmación) y los problemas de `planCheck` (`toFindings` de `lib/plan-check.js`); veredicto `REQUEST_CHANGES` si hay algún hallazgo; si no, `ESCALATE` con `reason: 'claims-not-verified'` si hay una afirmación `inconclusive` o sin entrada o `incomplete`; si no, `APPROVE`.

**Tests literales:**
- [ ] `parseReview`: un informe con dos bloques ```json toma el último; un objeto sin `claims` → `error`; 9 afirmaciones → `error`; dos con el mismo id → `error`; `how` vacío → `error`; sin bloque → `error`.
- [ ] `parseVerification` con 3 afirmaciones y entradas para `C1` y `C3` → `missing: ['C2']`; una entrada con `experiment: ''` cuenta como faltante; `verdict: 'maybe'` → faltante.
- [ ] Contadores: 5 procesos concurrentes que llaman a `recordExperiment` → `experiments === 5`; `recordStop` devuelve 1, 2, 3. Dos carpetas de modo (una vencida) → `readMode` da la viva; dos vivas → la de `started` más reciente.
- [ ] Modo: `beginMode` y `readMode` con `now` dentro del plazo → activo; con `now` pasados 30 min → `{ active: false }`; un `mode.json` con JSON roto → `{ active: false }`.
- [ ] `stopDecision`: `verify` con 3 afirmaciones y 1 experimento → `block`, y el texto nombra `K = 2` y los ids; con 3 experimentos pero el mensaje sin entradas → `block`; tercer intento (`attempt: 3`) → `{ block: false, incomplete: true }`; con 3 experimentos y entradas completas → `null`. `review` con mensaje sin bloque → `block`, con bloque válido → `null`.
- [ ] `buildAudit`: sin hallazgos y todas `holds` → `APPROVE`; una `false` → `REQUEST_CHANGES` con un hallazgo `experiment-false`; una `inconclusive` → `ESCALATE` con `reason`; `incomplete` y un hallazgo → `REQUEST_CHANGES` (el hallazgo manda); un problema de `planCheck` → `REQUEST_CHANGES`.
- [ ] Commit: `feat(plan): estado de la auditoría y bloqueo de cierre sin experimentos`.

### Task 6: aprobados visuales (`lib/approved.js`, `scripts/approved.js`, `scripts/approved-verify.js`)

**Files:**
- Create: `plugins/pignolo/lib/approved.js`, `plugins/pignolo/scripts/approved.js`, `plugins/pignolo/scripts/approved-verify.js`
- Test: `tests/approved.test.js`

**Interfaces:**
- Produce en `lib/approved.js`: `APPROVED_PATH = /^design\/approved\/[a-z0-9][a-z0-9-]{0,63}$/`; `saveApproved({ projectRoot, flow, from, date, piiPatterns = [] }) → { ok: true, path, version, manifestSha256 } | { ok: false, problems }` (copia el HTML de `from` a `design/approved/<flow>/`, o a `<flow>-v2`, `-v3`… si ya existe; **nunca** escribe sobre una carpeta existente; manifest con `flag: 'wx'`); `manifestSha(projectRoot, approvedPath)`; `verifyApproved({ projectRoot, approvedPath, expectedManifestSha? }) → { ok, problems: [{ file?, problem }] }`; `recordDecision({ projectRoot, path, manifestSha256, quote, date }) → { id, file }` (escribe `.pignolo/state/decisions/<fecha>-<flujo>.md`).
- Chequeos de `saveApproved` (autocontenido, R-12): solo `.html`; ningún `src`/`href`/`url()` con `http:`, `https:` o `//`; los enlaces relativos resuelven dentro de la carpeta; sin coincidencia con `piiPatterns`. Falla con `problems` y no escribe nada.
- `scripts/approved.js save|record` (JSON por stdout; exit 0 ok, 1 rechazado, 2 uso o error) lo ejecuta solo el hilo principal; `scripts/approved-verify.js --path design/approved/<flujo> [--project <raíz>] [--sha <manifest sha>]` es de lectura: exit 0 ok, **1 `BLOCKED`** con los problemas. Sin `--sha`, el esperado sale del registro en `.pignolo/state/decisions/*` o, si no, de `## Decisions` de `DESIGN.md` (misma expresión que `registeredManifestSha` de pignolo-ui; el último gana).

**Tests literales:**
- [ ] `save` de una carpeta con `a.html` y `b.html` enlazados (`<a href="b.html">`) → `design/approved/checkout/` con ambos y `manifest.json` con sha256 correcto; `verify` → ok.
- [ ] Segundo `save` del mismo flujo → `checkout-v2/` y `checkout/` intacta (mismos bytes); tercero → `-v3`.
- [ ] Editar un byte de `a.html` → `file-changed`; agregar `c.html` → `extra-file`; borrar `b.html` → `missing-file`; alterar el manifest → `manifest-sha-mismatch`; `verify` de ruta fuera de `APPROVED_PATH` (`design/approved/../x`) → exit 2 o problema, nunca ok.
- [ ] Rechazos de `save`: `<script src="https://cdn.x/y.js">` → `problems`, sin carpeta creada; un enlace `href="../fuera.html"` → rechazado; un dato que coincide con un `pii-patterns` del proyecto → rechazado.
- [ ] **Compatibilidad con pignolo-ui** (el test importa `plugins/pignolo-ui/lib/approved.mjs`): una carpeta guardada por `saveApproved` del núcleo la verifica `verifyApproved` de pignolo-ui (con el sha registrado en un `DESIGN.md` de prueba) y a la inversa. Rojo: cambiar el formato del manifest.
- [ ] `recordDecision` escribe el archivo con el frontmatter `id`, `status: accepted`, `source: human`, `evidence` (ruta y sha) y la cita; `approved-verify` sin `--sha` lo encuentra por ahí.
- [ ] Commit: `feat(plan): aprobados visuales versionados con el formato de pignolo-ui`.

## Ola 2 (Tasks 4 y 7 en paralelo)

### Task 4: `scripts/plan.js` y el campo `plan` de `run.json`

**Files:**
- Create: `plugins/pignolo/scripts/plan.js`
- Modify: `plugins/pignolo/lib/project.js` (`validateRun` acepta `plan` opcional con la forma del slug), `plugins/pignolo/scripts/run.js` (`start --plan <slug>`; `--flow plan` sin `--plan` es exit 2)
- Test: `tests/plan-cli.test.js`, `tests/run.test.js` (casos nuevos)

**Interfaces:**
- Consume: Task 1 entera. CLI `node plan.js <verbo> --plan <slug> [opciones] [--cwd <dir>]`, JSON por stdout, exit 0; 1 con el motivo en stderr; 2 por uso (como `run.js`).
- Verbos: `new --request-file <f> [--spec <ruta>]`; `claims set --file <claims.json> | --none-reason <texto>`; `claims resolve --id <K> --status <estado> [--source <s>] [--by <quién>] [--note <t>] [--superseded]`; `claims check` (exit 1 si `claimsOpen`); `scope-card save --file <md>` (imprime `errors` y sale 1 si no valida); `scope-card approve --quote-file <f>`; `scope-card status`; `tasks set --file <tasks.json>`; `runnable [--profile <p>]` (con el valor de `preApprovalTasks` del perfil: 3/2/1, D-5-3; R-8); `advance --to <etapa> [--reopen] [--plan-file <ruta>]`; `status`.
- `run.json`: `{ …, plan: '<slug>' }` opcional; `run.js status` lo muestra.

**Tests literales:**
- [ ] Recorrido por la CLI con un repo de `makeRepo()`: `new` → `claims set` → `claims resolve` → `advance --to spec-review` → `scope-card save` con una tarjeta válida → `scope-card approve` → `scope-card status` dice `approved`. Cada verbo con un argumento faltante → exit 2. `scope-card save` con una cita inventada → exit 1 y el error nombra el ejemplo.
- [ ] `runnable` sin perfil con tope → lista vacía (R-8); `scope-card approve` desde un worktree de tarea resuelve el registro del checkout principal (no crea otro).
- [ ] `run.js start --flow plan` sin `--plan` → exit 2; con `--plan p1` → `run.json.plan === 'p1'` y `validateRun` lo acepta; `--plan 'A b'` → exit 2. Un `run.json` de hoy (sin `plan`) sigue válido.
- [ ] Commit: `feat(plan): plan.js y el campo plan del flujo`.

### Task 7: presentación (`lib/present.js`, `scripts/present.js`, claves de `project.md`)

**Files:**
- Create: `plugins/pignolo/lib/present.js`, `plugins/pignolo/scripts/present.js`
- Modify: `plugins/pignolo/lib/project-config.js` (claves `presentation: ask|artifact|text` y `canvas-consent: true|false`, aditivas, con aviso si el valor es inválido, no error)
- Test: `tests/present.test.js`, `tests/project-config.test.js` (casos nuevos)

**Interfaces:**
- Consume: `readConfig` de `lib/profiles.js` (ya resuelve `presentation` con el default por perfil: `text` en `economy`, `ask` en los otros).
- Produce: `FORMATS = ['simple', 'ui', 'infra', 'decision']`; `resolvePresentation({ userConfig, projectConfig, artifactToolAvailable }) → { mode: 'text'|'artifact'|'ask', notice? }` (el proyecto pisa al usuario; `artifact` sin herramienta → `text` con `notice` de una línea; nunca `artifact` si no está habilitado); `templateApproved({ pluginRoot, format }) → { approved: boolean, reason? }` lee `templates/present/APPROVALS.md` (líneas `- <formato> v<N> — aprobado <AAAA-MM-DD> — sha256 <hash>`) y exige que `N` sea el de `<!-- pignolo-present: formato=<f> version=<N> -->` del archivo y que el sha256 coincida con el del archivo; `canvasAllowed({ projectConfig, designTypeAvailable }) → boolean` (ambos); `sameOptions(textOptions, html) → { same, extra, missing }` (`textOptions` = `[{ id, label }]`; el HTML las declara con `data-option="<id>"` y el texto del elemento es el rótulo; comparación exacta de ids y rótulos normalizados); `scanPublishable(html, { piiPatterns }) → [{ kind: 'pii'|'secret', match }]` (los secretos: `AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `gh[pousr]_[A-Za-z0-9]{36,}`, `sk-[A-Za-z0-9]{20,}`, `xox[baprs]-[A-Za-z0-9-]{10,}`, `(password|passwd|secret|token)\s*[:=]\s*\S{6,}`).
- `scripts/present.js decide|check`: `decide --cwd <dir> [--tool-available] [--design-available]` imprime `{ mode, canvas, formats: { simple: bool, … } }`; `check --html <archivo> [--options-file <json>] [--cwd <dir>]` sale 0 si publicable y 1 con los problemas.

**Tests literales (los de §15 `present`):**
- [ ] `presentation: text` en el proyecto, `artifact` en el usuario → `text`; `ask` por defecto con `balanced`, `text` con `economy`; `artifact` sin herramienta → `text` con aviso.
- [ ] `sameOptions` con `[{1,'Opción A'},{2,'Opción B'}]` y un HTML con las dos → `same`; con una tercera `data-option="3"` → `extra: ['3']`; con la segunda con otro rótulo → no `same`; con una menos → `missing`.
- [ ] `scanPublishable` con un patrón `\b\d{2}\.\d{3}\.\d{3}\b` y un HTML que lo contiene → un `pii`; con `AKIAABCDEFGHIJKLMNOP` → un `secret`; con texto limpio → `[]`.
- [ ] `canvasAllowed`: sin `canvas-consent` → `false`; con consentimiento y tipo no disponible → `false`; los dos → `true`.
- [ ] `templateApproved`: con `APPROVALS.md` vacío → `false` para los cuatro; con una línea cuyo sha256 no coincide con el archivo (cambiar una letra de la plantilla) → `false` con `reason`; con versión distinta → `false`; con todo coincidente → `true`.
- [ ] `project-config`: `presentation: bogus` → aviso, no error; sin la clave → igual que hoy.
- [ ] Commit: `feat(present): decisión de presentación, aprobación de plantillas y filtro de datos`.

## Ola 3 (Tasks 5 y 8 en paralelo)

### Task 5: `scripts/plan-audit.js` (la receta de tres pasos, de punta a punta)

**Files:**
- Create: `plugins/pignolo/scripts/plan-audit.js`
- Test: `tests/plan-audit-cli.test.js`

**Interfaces:**
- Consume: Tasks 1, 2 y 3; `checkPlan`, `toFindings`, `isCardPlan` de `lib/plan-check.js`. CLI `node plan-audit.js <verbo> --plan <slug> [opciones] [--cwd <dir>]`, JSON por stdout; exit 0, 1 (motivo en stderr), 2 (uso).
- Verbos, en el orden de la receta:
  - `check --plan-file <md> [--root <dir>]`: si `isCardPlan`, corre `checkPlan({ runTests: true })` y devuelve `{ applies: true, findings }` (las de `toFindings`); si no, `{ applies: false }` y exit 0. Es lo que recibe el paso 1 como evidencia.
  - `begin-review --plan-file <md>`: `beginMode` en `review` con el sha256 del plan.
  - `review-done --report-file <md>`: `parseReview`; guarda `review.json` en `auditDir`; exit 1 con el `error` si no parsea.
  - `probes`: `runProbes` sobre las afirmaciones de `review.json`; guarda `probes.json` y devuelve `{ closed, remaining }`.
  - `begin-verify`: `beginMode` en `verify` con las `remaining`, crea `scratch/`, imprime su ruta. **Sin afirmaciones restantes no hay paso 2b** (`{ skipped: true }`).
  - `finish --report-file <md>`: `parseVerification`; arma `buildAudit`; la guarda con `recordAudit`; borra el modo (`endMode`); imprime el veredicto. Un `incomplete` que el hook dejó en `mode.json` se respeta.
  - `end`: borra el modo (limpieza tras un corte).

**Tests literales:**
- [ ] Recorrido completo con informes de archivo (sin agentes): `check` sobre una tarjeta de este repo → `applies: true`; `begin-review` → `mode.json` en `review`; `review-done` con 3 afirmaciones, una de ellas "`git apply --numstat` proves the patch applies" → `begin-verify` después de `probes` deja 2 restantes (la tercera la cerró la sonda) y `scratch/` existe; `finish` con una entrada `false` → `audit.verdict === 'REQUEST_CHANGES'`; el registro existe pero `auditState` no es `ok` y `plan.js advance --to audited` falla (Task 1: `ok` exige veredicto `APPROVE` y el sha256 vigente del plan).
- [ ] `check` sobre un plan en prosa → `applies: false`, exit 0. `begin-verify` sin `review.json` → exit 1. `finish` con `incomplete: true` en el modo y sin hallazgos → `ESCALATE`. `end` borra el modo y es idempotente.
- [ ] Commit: `feat(plan): plan-audit.js con sondas y experimentos forzados`.

### Task 8: `next` (`lib/next.js`, `scripts/next.js`)

**Files:**
- Create: `plugins/pignolo/lib/next.js`, `plugins/pignolo/scripts/next.js`
- Test: `tests/next.test.js`

**Interfaces:**
- Consume: `readRun` de `lib/project.js`, `readCounter` de `lib/handback-counter.js`, `recoverAll({ restore: false })` de `lib/sabotage.js`, `readPlan`/`listPlans`/`scopeCardState`/`auditState` de Task 1, `mainRoot`. Lee git solo con `status --porcelain` y `worktree list --porcelain` (nada que mute).
- Produce: `deriveNext({ cwd, env, now }) → { kind, text, facts: string[] }` (una sola acción) y `node next.js [--cwd <dir>] [--text]` (JSON `{ kind, text, facts }`; con `--text`, solo `text`; exit 0 siempre salvo uso).
- Orden de prioridad (la primera que aplica): `sabotage-pending` > `run-malformed` > `task-blocked` > `flow-expired-task` > `task-in-progress` > `plan-<etapa>` del plan sin cerrar más reciente > `nothing`. Redacción como hechos (spec §10.3: no imperativo), `text` en español:
  - `task-blocked`: "La tarea <id> está BLOCKED en el handback-gate tras <n> intentos (último motivo: <m>); la próxima acción registrada es escalarla al humano."
  - `flow-expired-task`: "El flujo <flow> venció el <iso> con la tarea <id> sin cerrar; la próxima acción registrada es renovarlo (`run.js renew`) y revisar `run.js status`."
  - `run-malformed`: "El marcador del flujo (<archivo>) está ilegible; la próxima acción registrada es limpiarlo con `run.js end` o `run.js start --replace`."
  - `sabotage-pending`: "Hay un sabotaje interrumpido en <worktree> (archivos: <lista>); la próxima acción registrada es restaurarlo con `sabotage.js --recover`."
  - `plan-<etapa>`: "El plan <p> está en la etapa <etapa>; la próxima acción registrada es <X>" con `X` por etapa: `spec` → escribir la lista de afirmaciones clave; `claims` → verificar cada afirmación y resolverla; `spec-review` → correr el `spec-reviewer` y guardar la tarjeta; `scope-card` → pedirle al humano la aprobación de la tarjeta (`draft`), o presentarla de nuevo porque cambió (`changed`), o escribir el plan (`approved`); `plan-written` → auditar el plan; `audited` → ejecutar las tareas (sin aprobación, solo las que `runnable` permite); `executing` → la siguiente tarea sin cerrar; `validating` → correr el `validator` sobre la tanda; `final-review` → la revisión final.
- Solo lectura: no crea archivos, no corre `recoverAll` con restauración, no llama a `run.js`.

**Tests literales (§15 `next` y `resume`; cada uno en rojo rompiendo la rama que protege):**
- [ ] Sin `run.json` ni planes ni sabotaje → `kind: 'nothing'` y `text` vacío.
- [ ] Un `run.json` con tarea y el contador `blocked: true`, `count: 8`, `lastReason: 'tests rojos'` → `task-blocked` con exactamente la frase de arriba. Con el flujo vencido y la tarea sin contador → `flow-expired-task` (la "ola cortada" del 5). Con `run.json` ilegible (`{`) → `run-malformed`, **nunca** `nothing`. Con un candado de sabotaje vivo de un pid muerto → `sabotage-pending`, y `next` no restauró nada (el archivo saboteado sigue igual).
- [ ] Un plan en cada etapa (tabla de 10 filas) → el `text` de esa fila; el plan con la tarjeta `draft` y el mismo con `approved` y con `changed` (editar el archivo) dan tres textos distintos en `scope-card`.
- [ ] Prioridad: plan en `audited` y tarea BLOCKED a la vez → `task-blocked`; sabotaje pendiente y tarea BLOCKED → `sabotage-pending`.
- [ ] **`resume`:** repo con un plan en `audited` y `.pignolo/worktrees/x`; `deriveNext` llamado desde el worktree, desde un subdirectorio y desde el checkout principal, en **procesos nuevos** (sin estado de sesión, como tras `/compact`) → el mismo `text`. Rojo: leer desde el `cwd` en vez de `mainRoot`.
- [ ] Un `plan.json` truncado → un hecho "el registro del plan <p> está ilegible", no una excepción.
- [ ] Commit: `feat(next): próxima acción derivada del estado, solo lectura`.

## Ola 4 (Tasks 9 y 11 en paralelo)

### Task 9: `scope-gate` (`lib/scope-gate.js`, `hooks/handlers/scope-gate.js`)

**Files:**
- Create: `plugins/pignolo/lib/scope-gate.js`, `plugins/pignolo/hooks/handlers/scope-gate.js`
- Modify: `plugins/pignolo/lib/git-guard.js` (solo **exporta** `gitCommands`; `evaluate` no cambia)
- Test: `tests/scope-gate.test.js`, `tests/git-guard.test.js` (casos de `gitCommands`)

**Interfaces:**
- Consume: Task 1 (`readPlan`, `scopeCardState`, `listPlans`), `readRun`/`projectState` de `lib/project.js`, `currentBranch` de `lib/git.js` (siempre con `{ timeout: 1000 }`, como `guard.js`: el plazo del launcher es 3 s y el valor por defecto de `currentBranch` es 5 s).
- `git-guard.js` exporta `gitCommands(command, { shell: 'bash' | 'powershell' }) → [{ sub, args, positionals, onMain, cwdChanged }] | null` (R-14): una entrada por cada `git` del comando, con **la misma tokenización y el mismo estado** que usa `evaluate` (ps-ast en PowerShell). `sub` = primera palabra que no es opción tras `git` (se saltean `-C <dir>`, `-c k=v`); `onMain` = un `checkout`/`switch` a `main`/`master` ya ocurrió antes en el mismo comando (el `st.onMain` de la guardia); `cwdChanged` = un `cd`, `pushd`, `Set-Location` o `git -C` precede a ese `git`. `null` = no se pudo parsear.
- Produce: `decide({ command, cwd, env, deps }) → null | { reason, plans, alternative }` (`deps.currentBranch` inyectable en tests) y `exports.run(input, ctx)` del handler (`PreToolUse` sobre `Bash|PowerShell`, exit 2 con `Alternativa:` al negar, silencio si no aplica).
- Reglas (R-7 y R-14), en este orden. Hasta la regla 3 no se carga nada de git:
  1. Proyecto no activo o `/pignolo:off` → `null`.
  2. Contexto de plan: hay `<main>/.pignolo/state/plans/` **o** `run.json.plan` **o** `flow: 'plan'`. Sin nada de eso → `null`. Un `run.json` ilegible (`malformed`) con `plans/` presente → negar `unreadable-run` (falla cerrado); un `run.json` vencido (`expired`) se usa igual por su campo `plan`.
  3. Prefiltro de texto, el mismo que usa el launcher (`lib/hook-fastpath.js`, Task 12): `/\bgit\b/` y `/\b(merge|push|pull|rebase|fetch|branch|update-ref|reset|cherry-pick)\b/i`; si no, `null`.
  4. `gitCommands(command)`; `null` (no se pudo parsear) → negar `unparseable`. Se clasifica por `sub`, **no** por palabras sueltas: `git log --grep merge` y `git commit -F f` no son merges.
  5. Verbos mirados y destino `main`/`master` por verbo (la rama actual sale de `currentBranch(cwd, { timeout: 1000 })`; **rama ilegible o detached (`null`) cuenta como `main`**, como en la guardia):
     - `merge`, `pull`, `rebase`, `cherry-pick`: destino = la rama actual. Es `main` si `onMain`, o `cwdChanged` (el `cwd` del hook es el de la sesión y el `cd` aún no corrió, C9: se asume lo peor), o la rama actual es `main`/`master`/`null`.
     - `reset`: solo cuando un argumento nombra una rama del plan (`git reset --soft int/p1`), con el mismo criterio de destino.
     - `push`: destino = el lado derecho de cada refspec (`origin main`, `HEAD:main`, `:main`, `refs/heads/main`); sin refspec, con `HEAD`, `--all` o `--mirror`, el destino es la rama actual.
     - `fetch`: solo con un refspec cuyo destino es `main`/`master`/`refs/heads/main` (`git fetch . int/p1:main`).
     - `branch` con `-f`/`--force`/`-M` y `main`/`master` como primer argumento; `update-ref` con `refs/heads/main` o `refs/heads/master`.
     - Cualquier otro `sub` no se mira. Si ninguna invocación apunta a `main` → `null`.
  6. Planes relevantes = los que nombran las ramas `int/<p>`, `queue/<p>`, `task/<p>/` (excepto `task/daily/`) en el comando ∪ `run.json.plan` ∪ el plan de la rama actual si es `int/<p>`, `queue/<p>` o `task/<p>/`. Con `flow: 'plan'` y ninguno → negar `no-plan`. Sin `flow: 'plan'`, sin `run.json.plan` y sin plan relevante → `null` (un `daily` suelto no se toca).
  7. Para cada plan relevante: `readPlan` con `ok: false` y `missing: true` → negar `unregistered` **solo** si `flow === 'plan'` o `run.json.plan` está puesto (si no, `null`); `ok: false` sin `missing` → negar `unreadable`; `scopeCardState !== 'approved'` → negar (`none`, `draft` o `changed`). `alternative`: "mostrale la tarjeta al humano y registrá su aprobación con `plan.js scope-card approve`" (para `changed`: "la tarjeta cambió después de aprobarla: presentala de nuevo").
- **Límites declarados (van a la spec §8.3, Task 14):** (a) texto, no parser de shell completo: una variable que esconda `main`, un alias o un script que corre `git` no se ve; (b) un plan que arrancó en otra rama de origen (`develop`, una rama de feature) solo se mira cuando el destino es `main`/`master`: el merge a esa rama de origen no se mira (la guardia sigue pidiendo confirmación) y un merge posterior de esa rama a `main` no nombra el plan; (c) `scope-gate` es un piso: la guardia sigue pidiendo confirmación del merge a `main`.

**Tests literales (de tabla; el handler en proceso, repo de `makeRepo()`; la rama actual se fija con la rama real del repo o con `deps.currentBranch`):**
- [ ] Sin carpeta `plans/` ni `run.json`: `git merge int/p1` en `main` → `null` (un `daily` suelto no se toca); mismo comando con `PIGNOLO_DISABLED=1` → `null`.
- [ ] Plan `p1` registrado, tarjeta `draft`: `git merge int/p1` estando en `main` → negado `draft`; `git push origin main` con `run.json.plan = 'p1'` → negado; `git push origin task/p1/01-x` (no es `main`) → `null`; `git merge x` estando en `int/p1` → `null`.
- [ ] Tarjeta `approved` → `null`; editar `scope-card.md` → `changed` (negado); `plan.json` truncado → negado `unreadable` (falla cerrado).
- [ ] `flow: 'plan'` en `run.json` sin `plan` → negado `no-plan`. `git merge task/daily/2026-09-30-x` en `main` con un plan `draft` pero sin `run.json.plan` → `null`.
- [ ] **Destinos que la regex del primer borrador dejaba pasar** (cada uno con `p1` en `draft`, negado): `git checkout main && git merge int/p1` estando en `int/p1`; `git switch main; git merge int/p1`; `git merge int/p1` con rama actual `null` (detached; `deps.currentBranch` devuelve `null`) y con un `currentBranch` que agota su plazo; `cd <main> && git merge int/p1` estando en `task/p1/01-x`; `git push` a secas estando en `main` con `run.json.plan = 'p1'`; `git push origin HEAD` en `main`; `git push origin HEAD:main` estando en `int/p1` sin `run.json.plan`.
- [ ] **Verbos que también aterrizan en `main`** (negados con `p1` en `draft`, estando en `main` salvo que se diga): `git pull . int/p1`; `git rebase int/p1`; `git cherry-pick int/p1~3..int/p1`; `git fetch . int/p1:main`; `git branch -f main int/p1`; `git update-ref refs/heads/main int/p1`; `git reset --soft int/p1`. Un verbo fuera de la lista (por ejemplo `git stash`) → `null`, y ese límite queda fijado por un test.
- [ ] **Clasificación por subcomando:** `git log --grep merge` y `git commit -F msg.txt` (con un mensaje que menciona `merge`) estando en `main` dentro de un plan `draft` → `null`.
- [ ] **Estados del registro y de `run.json`:** rama `int/foo` sin plan registrado y con `plans/` de otro plan: con `flow: 'plan'` o `run.json.plan` → negado `unregistered`; sin ellos → `null`. `run.json` truncado con `plans/` presente → negado `unreadable-run`. `run.json` vencido con `plan: 'p1'` en `draft` → negado (se usa su campo `plan`). Un comando que no se puede parsear dentro de un plan → negado `unparseable`.
- [ ] PowerShell: `git merge int/p1` con `; ` y `|` alrededor → mismo veredicto que en Bash; `git checkout main; git merge int/p1` → negado. Comando que no es git (`echo merge main`) → `null`.
- [ ] `gitCommands`: `git -C x merge a` → `sub: 'merge'`, `cwdChanged: true`; `git checkout main && git merge a` → el segundo con `onMain: true`; Bash y PowerShell dan el mismo resultado para el mismo comando. Rojo: devolver la rama actual en vez de `onMain`. Guarda de regresión: la suite existente de `git-guard` sigue verde (la exportación no cambia `evaluate`).
- [ ] Commit: `feat(scope-gate): sin tarjeta aprobada nada llega a main en un plan`.

### Task 11: `present-gate` y la línea de `next` en `SessionStart`

**Files:**
- Create: `plugins/pignolo/hooks/handlers/present-gate.js`
- Modify: `plugins/pignolo/hooks/handlers/session-start.js` (suma la salida de `next`, R-10)
- Test: `tests/present-gate.test.js`, `tests/session-start.test.js` (casos nuevos)

**Interfaces:**
- `present-gate`: `PreToolUse` sobre `Artifact`. Solo actúa con pignolo activo y un flujo en curso (`run.json` vigente) y solo mira `tool_input.file_path` y `tool_input.type_url` si existen (R-9: lee con tolerancia, si no entiende la forma calla). Niega: (a) `resolvePresentation` da `text`; (b) `scanPublishable` del HTML da algo (el motivo nombra el tipo, nunca el dato); (c) el tipo es Design (`type_url` que lo nombra) y `canvasAllowed` es falso. Cada negación con `Alternativa:` ("mostralo como texto" / "sacá el dato" / "pedile el consentimiento del proyecto al humano").
- `session-start`: con `deriveNext(...).kind !== 'nothing'` y `/pignolo:off` sin poner, suma el `text` a las líneas del mensaje; si no, nada (callado en el éxito). Con `source: 'compact'` incluido.

**Tests literales:**
- [ ] `present-gate`: sin flujo en curso → silencio aun con `presentation: text`; con flujo y `text` → exit 2; con flujo y `ask` y un HTML con un patrón de `pii-patterns` → exit 2 y el mensaje **no** contiene el dato; HTML limpio con `ask` → silencio; `type_url` con "Design" sin `canvas-consent` → exit 2, con consentimiento → silencio; un `tool_input` sin `file_path` → silencio.
- [ ] `session-start`: con un plan en `audited` y `source: 'startup'` → `additionalContext` incluye "El plan p1 está en la etapa audited"; sin nada en curso → salida igual a la de hoy (el test existente sigue verde); con `/pignolo:off` → no la incluye.
- [ ] Commit: `feat(present): hook de publicación y próxima acción al arrancar`.

## Ola 5 (Task 10, sola: depende de D-5-1)

### Task 10: `plan-audit-gate` (hooks de la auditoría) y escritura acotada del agente que experimenta

> **No corre hasta que el autor resuelva D-5-1** (quién escribe los scripts de los experimentos). Sin eso, el paso 2b no puede escribir el script de cada experimento (la guardia niega `node -e`, y la regla 6 prohíbe pasar texto por la shell). **Punto de elección D-5-1:** la tarea está escrita con **una sola interfaz**, el agente que corre experimentos (`VERIFY_AGENT`, R-16). La opción (a) (`Write` en `pignolo:plan-auditor`) y la (b) (un rol `pignolo:plan-verifier` nuevo) se distinguen solo en el bloque "Si D-5-1 elige (b)" de abajo.

**Files:**
- Create: `plugins/pignolo/hooks/handlers/plan-audit-gate.js`, `plugins/pignolo/lib/plan-agents.js` (sin dependencias, lo carga el launcher: exporta `REVIEW_AGENT = 'pignolo:plan-auditor'` y `VERIFY_AGENT`; con (a) `VERIFY_AGENT = 'pignolo:plan-auditor'`)
- Modify: `plugins/pignolo/hooks/handlers/protect-paths.js` (regla por rol para `VERIFY_AGENT`), `plugins/pignolo/lib/roles.js` (con (a): `plan-auditor` agrega `Write`), `plugins/pignolo/agents/plan-auditor.md` (frontmatter `tools`; el resto es de la Task 15)
- Test: `tests/plan-audit-gate.test.js`, `tests/protect-paths-roles.test.js` (casos nuevos), `tests/agents-tools.test.js` (el test que compara `roles.js` con el frontmatter pasa a esperar `Write`)

**Interfaces:**
- Consume de Task 3 (contrato fijado en R-15; ver los cambios de Task 3): `readMode({ main, now })`, `recordExperiment({ main, plan, command })`, `recordStop({ main, plan })`, `markIncomplete({ main, plan })`, `stopDecision({ mode, lastMessage, attempt })`, `auditDir`; y `projectState`.
- `readMode` mira `<main>/.pignolo/tmp/plan-audit/*/mode.json`, ignora los vencidos o ilegibles y devuelve `{ active: true, plan, mode, dir, claims, experiments, attempts, incomplete, … }` o `{ active: false }`. Con más de un modo vivo (dos planes, o restos de una auditoría anterior no vencidos) gana el de `started` más reciente; los otros no deciden nada.
- Los contadores **no** viven en `mode.json` (R-15): `bash-calls.log` (una línea por llamada, `appendFileSync`; `experiments` = líneas no vacías) y `stops.log` (una línea `stop` por intento de cierre y una línea `incomplete` al dejar pasar). Ningún hook reescribe `mode.json`: lo escribe solo `plan-audit.js` (hilo principal, Task 5).
- `plan-audit-gate` es un handler con cuatro eventos (como `handback-gate`): `PreToolUse` sobre `Bash|PowerShell`, `PostToolUse` sobre `Bash|PowerShell`, **`PostToolUseFailure`** sobre `Bash|PowerShell` y `SubagentStop`. Todos filtran **primero** por `agent_type` (`REVIEW_AGENT` en `review`, `VERIFY_AGENT` en `verify`) y por modo activo; con otros agentes o sin modo, `exit 0` sin hacer nada. El launcher ya no arranca el handler si el `agent_type` no es ninguno de los dos (Task 12).
  - `PreToolUse`, agente `REVIEW_AGENT` en modo `review`: exit 2, "el paso 1 lee y no ejecuta. Alternativa: listá la afirmación en `claims` del bloque json y el paso 2b la verifica." En `verify`: no decide (la guardia sigue).
  - `PostToolUse` **y `PostToolUseFailure`**, agente `VERIFY_AGENT` en modo `verify`: `recordExperiment`. Un `Bash` que sale con código distinto de cero dispara `PostToolUseFailure`, no `PostToolUse` (C5, verificado), y esa es justo la refutación típica (`node fail.js` sale 1): contar solo `PostToolUse` dejaría toda auditoría en `incomplete` → `ESCALATE`. Nunca bloquea.
  - `SubagentStop` (matcher `^<VERIFY_AGENT>$`): **lo primero** es `recordStop` (el intento queda contado aunque algo falle después); luego `stopDecision({ mode, lastMessage, attempt })`. Bloquea con `{"decision":"block","reason":…}` por stdout en los intentos 1 y 2 (`MAX_BLOCKS`); en el 3.º deja pasar y `markIncomplete`; con todo completo calla. Si el launcher falla antes de llegar al handler (exit 2), el tope es el nativo de Claude Code (8 seguidos, C11); se declara en la spec.
- `protect-paths` para `VERIFY_AGENT`: `Write`/`Edit`/`MultiEdit` permitido solo bajo `auditDir(main, mode.plan)/scratch/` **del plan del modo vivo** y solo con ese modo en `verify`; todo lo demás, negado con `Alternativa:` ("escribí el script en el `scratch/` del modo `verify`"). La ruta se resuelve con `rawResolve`/`resolveClean` y se compara con `isWithin`, sin distinguir mayúsculas en `win32` como hace `roleRule` (`protect-paths.js:68`). El hilo principal (sin `agent_type`) nunca recibe esta regla.
- **Límite declarado (D-5-1 y spec §8.3):** el confinamiento cubre la herramienta `Write` (y `Edit`) mientras pignolo esté encendido y `agent_type` llegue en el payload. El `Bash` del mismo agente en `verify` puede escribir en otras rutas (`echo x > src/a.js`; la guardia solo niega el conjunto protegido), igual que el resto de los roles con `Bash`; con `/pignolo:off`, `PIGNOLO_DISABLED` o sin `agent_type` el `Write` no se confina. La protección real es la carta del agente y el chequeo del diff final.
- **Si D-5-1 elige (b)** (rol nuevo `pignolo:plan-verifier`): `VERIFY_AGENT = 'pignolo:plan-verifier'`; se agrega `agents/plan-verifier.md` y su fila en `roles.js` (con `Write`; el test "sin agentes sueltos" de `agents-tools.test.js` lo exige), `plan-auditor` queda sin `Write`; el matcher de `SubagentStop` en `hooks.json` y el payload del humo (Task 12) y de la Task 13 pasan a `plan-verifier`; la tabla de §6 y la de modelos de §7 suman la fila. La lógica de esta tarea no cambia.

**Tests literales:**
- [ ] `PreToolUse`: `REVIEW_AGENT` con modo `review` y `Bash` → exit 2 y el mensaje contiene `Alternativa:`; con modo `verify` → exit 0; con modo vencido (31 min) → exit 0; otro agente (`pignolo:implementer`) con modo `review` → exit 0; el hilo principal (sin `agent_type`) → exit 0; con `/pignolo:off` → exit 0.
- [ ] Contador, por el handler: tres `PostToolUse` de `VERIFY_AGENT` en `verify` → `experiments === 3` y tres líneas en `bash-calls.log`; **un `PostToolUseFailure` también suma** (payload con `hook_event_name: 'PostToolUseFailure'`; rojo: ignorar ese evento); un `Read` no suma; en `review` no suma; un comando con saltos de línea queda en una sola línea.
- [ ] Concurrencia: 5 procesos de `node` que llaman a `recordExperiment` a la vez → `experiments === 5` (el contador de lectura-modificación-escritura daba 1 con la misma carga, C6). `readMode` en un bucle mientras tanto no falla ni devuelve inactivo.
- [ ] Modos: dos carpetas `p1` (viva) y `p2` (vencida) → `readMode` devuelve `p1`; dos vivas → la de `started` más reciente; un `mode.json` ilegible junto a uno vivo → el vivo.
- [ ] `SubagentStop`: tabla de Task 3 por el handler (3 afirmaciones, 1 experimento → bloquea con `decision: 'block'`; segundo intento → bloquea; **tercero → deja pasar** y `stops.log` termina con `incomplete`; con todo completo → silencio). Un `last_assistant_message` ausente en `verify` cuenta como sin entradas. El intento queda contado aunque `stopDecision` lance una excepción (se simula).
- [ ] `protect-paths`: `Write` de `VERIFY_AGENT` a `<main>/.pignolo/tmp/plan-audit/p1/scratch/exp1.js` con `verify` de `p1` → permitido; `Edit` y `MultiEdit` a ese mismo archivo → permitidos; mismo `Write` con `review` → negado. **Negados** (todos con `Alternativa:`): `<main>/src/a.js`; `…/p1/review.json`; traversal `…/p1/scratch/../review.json`; el `scratch/` de **otro plan** (`…/p2/scratch/x.js` mientras el modo vivo es `p1`); mayúsculas en `win32` (`.PIGNOLO/TMP/plan-audit/p1/review.json`); ruta Git Bash (`/c/…/review.json`) fuera del `scratch/`. **Permitida**: la misma ruta del `scratch/` de `p1` escrita con otras mayúsculas en `win32` o como `/c/…`. El hilo principal → permitido.
- [ ] `agents-tools`: `roles.js` y `plan-auditor.md` listan `Read, Grep, Glob, Bash, Write` (con (b): lo mismo para `plan-verifier`). Rojo: quitar `Write` de uno.
- [ ] Commit: `feat(plan): hooks de la auditoría (experimentos forzados) y escritura acotada`.

## Ola 6 (Task 12, sola)

### Task 12: cableado: `hooks.json`, atajos del launcher, regla `pignolo-plan` de la guardia y humo por el launcher

**Files:**
- Create: `plugins/pignolo/lib/hook-fastpath.js` (sin dependencias salvo `lib/plan-agents.js`)
- Modify: `plugins/pignolo/hooks/hooks.json`, `plugins/pignolo/hooks/launcher.js` (consulta `skips` antes de crear el Worker), `plugins/pignolo/lib/git-guard.js` (regla `pignolo-plan`)
- Test: `tests/hooks-json.test.js` (casos nuevos), `tests/hook-fastpath.test.js`, `tests/guard-pignolo-plan.test.js`, `tests/hooks-smoke-hito-5.test.js`

**Interfaces:**
- `hooks.json` suma seis entradas, misma forma exec, `timeout` 30:
  - `PreToolUse` `Bash|PowerShell` → `scope-gate`
  - `PreToolUse` `Bash|PowerShell` → `plan-audit-gate`
  - `PostToolUse` `Bash|PowerShell` → `plan-audit-gate`
  - **`PostToolUseFailure` `Bash|PowerShell` → `plan-audit-gate`** (un `Bash` con código distinto de cero no dispara `PostToolUse`: C5; sin esta entrada los experimentos que fallan, la refutación típica, no se cuentan)
  - `SubagentStop` `^<VERIFY_AGENT>$` (hoy `^pignolo:plan-auditor$`; el test arma el matcher con la constante de `lib/plan-agents.js`) → `plan-audit-gate`
  - `PreToolUse` `Artifact` → `present-gate`

  `scope-gate` va como entrada **aparte** de la guardia: si la guardia pide confirmación (`ask`) y `scope-gate` sale con 2, gana la negación (C12, verificado en el código del host).
- `lib/hook-fastpath.js` produce `skips(name, input) → boolean` (R-15). El launcher lo llama **antes** de crear el Worker, como ya hace con `private-reads`, y sale con 0 sin cargar nada si da `true`. Reglas, solo de payload:
  - `plan-audit-gate`: `true` salvo que `input.agent_type` sea `REVIEW_AGENT` o `VERIFY_AGENT`.
  - `scope-gate`: `true` salvo que `input.tool_input.command` sea un string que cumpla `/\bgit\b/` y `/\b(merge|push|pull|rebase|fetch|branch|update-ref|reset|cherry-pick)\b/i` (el mismo prefiltro que la regla 3 de la Task 9; una sola constante).
  - Cualquier otro nombre, o un payload sin la forma esperada: `false` (sigue el camino de siempre y el handler decide).
  - Motivo: medido bajo `npm test`, cuatro launchers por `Bash` llegaron a 3,5 s (C8) y al vencer el plazo interno el launcher niega con exit 2 **cualquier** comando; dos handlers más por `Bash` sin atajo sumaban denegaciones al azar de comandos ajenos y, en `SubagentStop`, un exit 2 que bloquea sin pasar por `MAX_BLOCKS`.
- Regla de la guardia `'pignolo-plan': ['deny', 'un subagente no opera el plan de pignolo (plan.js, plan-audit.js, approved.js): solo el hilo principal', 'respondé BLOCKED o NEEDS_CONTEXT y nombrá lo que haga falta cambiar en el plan']`. `checkRunScript` pasa a una tabla de scripts: `run.js` → `pignolo-run` (**comportamiento actual intacto**); `plan.js`, `plan-audit.js`, `approved.js` → `pignolo-plan`. Se deniega solo cuando el script **se ejecuta** (no cuando se lee) y solo para subagentes. **No** entran `next.js`, `approved-verify.js`, `plan-check.js` ni `present.js`. Detección para los scripts nuevos (más estrecha que la de `run.js`, R-14):
  - literal: la ruta de la caché del plugin (`.claude/plugins/cache/<mercado>/pignolo/<versión>/scripts/<script>`, con `/` o `\`) o `plugins/pignolo/scripts/<script>`;
  - dinámica: solo palabras que empiezan con `${CLAUDE_PLUGIN_ROOT}` o `$CLAUDE_PLUGIN_ROOT` (en PowerShell, `${env:CLAUDE_PLUGIN_ROOT}` y `$env:CLAUDE_PLUGIN_ROOT`). **No** se aplica la regla dinámica de `run.js` (`scripts/run.js` en cualquier carpeta): `plan.js` es un nombre común y negaría `node "$X/scripts/plan.js"` de cualquier proyecto; y tampoco el patrón `(^|/)pignolo/(?:[^/]+/)*scripts/…`, que coincidiría con cualquier repo cuya carpeta se llame `pignolo`.

**Tests literales:**
- [ ] `hooks-json`: se afirma contra una **lista esperada explícita** (el patrón `deepStrictEqual` del test de hoy): `scope-gate` (`PreToolUse`, `Bash|PowerShell`), `plan-audit-gate` (`PreToolUse`, `PostToolUse` y `PostToolUseFailure`, `Bash|PowerShell`; `SubagentStop`, `^<VERIFY_AGENT>$`) y `present-gate` (`PreToolUse`, `Artifact`), cada una con `timeout` entre 30 y 60. `hooks/handlers/_echo.js` sigue sin estar registrado (el test de hoy lo exige: no se escribe "todo handler está registrado"). Rojo: quitar la entrada de `PostToolUseFailure`.
- [ ] `hook-fastpath`, tabla de `skips`: `plan-audit-gate` con `agent_type` ausente, con `pignolo:implementer` y con el hilo principal → `true`; con `REVIEW_AGENT` y `VERIFY_AGENT` → `false`. `scope-gate` con `ls -la` → `true`; con `git status` → `true`; con `git merge x`, `git push`, `git -C d pull`, `git update-ref …` → `false`; con un comando de PowerShell que llama `git merge` → `false`; con `tool_input` sin `command` → `false`. Rojo: hacer que `skips` devuelva siempre `false`.
- [ ] Por el launcher real (`runLauncher`): un `Bash` de un subagente que no es de la auditoría contra `plan-audit-gate`, y `git status` contra `scope-gate`, salen con 0 y sin salida en un proyecto con un plan en `draft` (el handler, de correr, no negaría; el test que prueba que **no** se carga el Worker es el de `skips`).
- [ ] Guardia, como `pignolo:implementer` con `agent_id`: `node <plugin>/scripts/plan.js status --plan p` → deny con "Alternativa:"; lo mismo con `plan-audit.js` y `approved.js`; `node <plugin>/scripts/next.js` y `approved-verify.js` → pasan; `cat <plugin>/scripts/plan.js` → pasa; el hilo principal ejecutando `plan.js` → pasa; `run.js` sigue negando como hoy (guarda de regresión, las mismas cuatro formas que hoy).
- [ ] Guardia, **rutas reales (C10)**: `node "C:/Users/<u>/.claude/plugins/cache/pignolo/pignolo/0.7.0/scripts/plan.js" status`, la misma con barras invertidas, y `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan.js" status` y `node "$CLAUDE_PLUGIN_ROOT/scripts/plan.js" status` → deny `pignolo-plan`.
- [ ] Guardia, **no se pasa de ancha**: subagente con `node "$X/scripts/plan.js" status` (variable ajena) y con `node D:/pignolo/scripts/plan.js` (un repo cuya carpeta se llama `pignolo`, sin `plugins/pignolo/` en la ruta) → pasan.
- [ ] Guardia, **PowerShell**: `& node "<plugin>/scripts/plan.js" status` como subagente → deny `pignolo-plan`; `& node "$env:CLAUDE_PLUGIN_ROOT/scripts/plan.js" status` → deny; `Get-Content <plugin>/scripts/plan.js` → pasa; `& node "<plugin>/scripts/run.js" status` sigue negando como hoy (guarda de regresión de la tabla).
- [ ] Humo por el launcher real, un caso por hook nuevo (`runLauncher`): `scope-gate` niega con exit 2 un merge a `main` de `int/p1` con tarjeta `draft`; `plan-audit-gate` niega `Bash` a `REVIEW_AGENT` en `review`, **y cuenta un `PostToolUseFailure` de `VERIFY_AGENT` en `verify`**; `present-gate` niega con `text`; los tres con un payload sin nada que hacer salen 0 sin salida.
- [ ] Commit: `feat(plan): cablear scope-gate, plan-audit-gate y present-gate; atajos del launcher; regla pignolo-plan`.

## Ola 7 (Task 13, sola)

### Task 13: pruebas de punta a punta de §15 (`scope-gate`, `next`, `resume`, `present`) y de la auditoría

**Files:**
- Create: `tests/e2e-hito-5.test.js`

- [ ] **`scope-gate` (§15: merge a `main` sin tarjeta → bloqueado).** Repo real con `main`, `int/p1` con un commit y un plan `p1` en `scope-card`: por el launcher, `git merge int/p1` desde `main` → exit 2; después `plan.js scope-card approve` y el mismo comando → exit 0 del `scope-gate` (la guardia puede pedir confirmación aparte: se prueba el handler `scope-gate`, no la guardia).
- [ ] **`next` y `resume`.** Un plan recorrido por `plan.js` hasta `audited` (con un informe de auditoría de archivo), luego un proceso nuevo por cada consulta: `next.js` y el handler `session-start` con `source: 'compact'` desde un worktree dan la misma frase.
- [ ] **`present`.** Con `presentation: text` el hook niega la publicación; con un patrón de `pii-patterns` en el HTML, `present.js check` sale 1; un aprobado guardado dos veces da `-v2` y verifica; editado a mano da `BLOCKED` por `approved-verify.js`.
- [ ] **La receta de la auditoría sin agentes.** `plan-audit.js` de punta a punta con las cinco sondas **reales** de `PROBES` sobre afirmaciones que las disparan (en `win32` las cinco refutan; en otro SO se aceptan las que no aplican con el `evidence` que lo dice) y el hook `plan-audit-gate` por el launcher en los tres eventos: el `plan-auditor` simulado hace 1 de 3 experimentos → `SubagentStop` bloquea dos veces y la tercera deja pasar con `incomplete`; `finish` da `ESCALATE`.
- [ ] Commit: `test(e2e): scope-gate, next, resume, present y auditoría de planes`.

## Ola 8 (Task 14, sola)

### Task 14: cierre de la parte 5a

- [ ] `plugin.json` a `0.7.0`; entrada `## 0.7.0 — <fecha>` en `CHANGELOG.md` (registro del plan y tarjeta, `scope-gate`, auditoría de tres pasos con experimentos forzados y sondas precisas, aprobados, presentación, `next`; D-5-1 resuelta como la decidió el autor).
- [ ] Spec, sin cambiar contratos del autor salvo lo que D-5-1 resolvió: §4.5 (tarjeta validada mecánicamente, R-6), §4.6 (aprobados: `approved.js`, decisión en `state/decisions/`, hook de `Artifact` best-effort), §5.2 (etapas, R-5, R-11), §5.3 (`next`: qué lee, prioridades, solo lectura), §6 (tabla del `plan-auditor` con `Write` si D-5-1 fue a favor, dos modos), §8.3 (`scope-gate` con su regla y sus límites declarados: variables, alias y scripts; rama de origen que no es `main`; verbos no mirados; el confinamiento de `Write` del agente que experimenta no cubre su `Bash`; fallo del launcher en `SubagentStop` acotado solo por el tope nativo de 8;  `plan-audit-gate`, `present-gate`, regla `pignolo-plan`, `protect-paths` del `plan-auditor`), §10.1 (`state/plans/` en 5), §15 (`scope-gate`, `next`, `resume`, `present`: qué se midió y qué no: `queue/` con conflicto es del 7).
- [ ] `tests/manual/hito-5.md` (sesión real, repo de prueba sin datos del autor): (1) un merge a `main` con un plan sin tarjeta aprobada → negado, y con la tarjeta aprobada pide la confirmación habitual; (2) un `plan-auditor` en `review` que intenta `Bash` → negado en el momento, y en `verify` el `SubagentStop` lo hace volver; (3) **`PostToolUse` de `Bash` recibe `agent_type` dentro de un subagente** (hipótesis abierta desde 3a); (4) la forma real del `tool_input` de `Artifact` (R-9) y que `present-gate` lo niega con `presentation: text`; (5) `/compact` en medio de un plan y `next` da la acción correcta; (6) cada mensaje al humano en dos capas y con categoría.
- [ ] `npm run test:quiet` verde; `docs/STATE.md` actualizado (qué quedó, siguiente: 5b).
- [ ] Revisión final opus de `main..core/hito-5a` con el Review Focus (puntos 1 a 4 y 6), pasada de arreglos, confirmación acotada; unión a `main` en local. El push, solo con el OK del autor.

---

# Parte 5b: cartas, skills, plantillas y evals

> Se escribe en detalle cuando 5a esté en `main`, igual que 4b; esto fija el alcance, las interfaces y los tests para que el autor decida costos ahora.

## Ola 9 (Tasks 15 y 17 en paralelo)

### Task 15: cartas de `spec-reviewer`, `plan-auditor` e `implementer`

**Files:**
- Modify: `plugins/pignolo/agents/spec-reviewer.md`, `plugins/pignolo/agents/plan-auditor.md`, `plugins/pignolo/agents/implementer.md`, `plugins/pignolo/templates/task-card.md` (línea de verificación del aprobado)
- Test: `tests/agents-output.test.js`, `tests/agents-tools.test.js`, `tests/templates.test.js` (casos nuevos)

**Interfaces (lo que cada carta tiene que decir; el texto es inglés):**
- `spec-reviewer`: escribe la tarjeta con **exactamente** los 8 encabezados de `SECTIONS` (Task 1), en el idioma del humano pero con los encabezados en inglés; cada ejemplo de aceptación termina con la cita literal entre comillas; `Added without being asked` es `none` o `A1: …`; salida: hallazgos, preguntas (máx. 5), la tarjeta, y la última línea sola con `APPROVE`, `REQUEST_CHANGES` o `ESCALATE`.
- `plan-auditor`: **dos modos** que le dice el brief. `review`: solo lectura, sin Bash (el hook lo niega), recibe el informe de `plan-check` como evidencia (hay que descartar lo que ve como falsa alarma), busca contradicciones entre tareas, tests que no ejercen lo que dicen, supuestos de plataforma falsos, comandos que no pueden correr tal cual, diseños que no pueden funcionar con el código existente; lista aparte, como máximo 8, las afirmaciones que **solo se verifican ejecutando**; termina con **un** bloque ```json `{ findings, claims }` (formas de `parseReview`). `verify`: su única tarea es un experimento por afirmación: escribe un script en el `scratch/` con `Write`, lo corre con `Bash` (`node <archivo>` o un comando simple; la guardia niega código en línea que lanza procesos), mata lo que lance, y termina con **un** bloque ```json (lista de `{ id, verdict, experiment, evidence }`); sabe que no puede terminar con menos experimentos que afirmaciones. Sin copia ni replay del plan.
- `implementer`: si la task-card trae `Approved visual`, antes de escribir corre `node "<plugin>/scripts/approved-verify.js" --path <ruta>` y, con exit 1, responde `BLOCKED` (no implementa sobre una carpeta cambiada); la carpeta es su fuente de verdad, no la edita.
- `task-card.md`: la línea `Approved visual` agrega el comando de verificación.

**Tests literales:**
- [ ] Las cartas nombran los encabezados de `SECTIONS` (un test importa `SECTIONS` y busca cada uno en `spec-reviewer.md`: rojo al renombrar uno), los dos modos y las formas de los dos bloques ```json (un test extrae del ejemplo de la carta el objeto y lo pasa por `parseReview` y por `parseVerification`: rojo si el ejemplo no parsea); `implementer.md` nombra `approved-verify.js`; la última línea de `spec-reviewer` es una palabra sola. `plan-auditor.md` ya no manda copiar bloques a una copia del repo (el replay): el test busca su ausencia.
- [ ] `agents-tools` sigue verde con `Write` en el `plan-auditor` (Task 10).
- [ ] Commit: `feat(agents): cartas de spec-reviewer, plan-auditor (dos modos) e implementer (aprobado visual)`.

### Task 17: skill `present`, plantillas visuales y `APPROVALS.md`

**Files:**
- Create: `plugins/pignolo/skills/present/SKILL.md`, `plugins/pignolo/templates/present/simple.html`, `ui.html`, `infra.html`, `decision.html`, `plugins/pignolo/templates/present/APPROVALS.md` (solo el encabezado: **sin aprobaciones**)
- Test: `tests/skill-present.test.js`, `tests/present-templates.test.js`

**Interfaces:**
- La skill (invocable por el modelo, solo por las demás skills y por el pedido de presentar): corre `present.js decide`; si `mode` es `ask`, ofrece "1) artifact / 2) texto" con una línea del costo relativo (§4.6); elige la forma según el contenido (simple, UI, infra, decisión); **antes de publicar** corre `present.js check --html <archivo> --options-file <json>` y publica solo con exit 0 (la capa que no depende del hook, R-9); publica privado con la herramienta Artifact; contenido idéntico al texto (misma lista, sin resumir); la respuesta del humano va en la conversación; sin herramienta, avisa en una línea y usa texto; el formato sin aprobación (`formats.<f> === false`) cae a texto; el lienzo "Design" solo con `canvas` verdadero, y si no, el mismo prototipo como HTML local.
- Plantillas: HTML autocontenido (sin recursos remotos), con `<!-- pignolo-present: formato=<f> version=1 -->`, datos de ejemplo sintéticos y las opciones como elementos `data-option="<id>"`. Se publican con sus datos de ejemplo para que el autor las revise (D-5-4).

**Tests literales:**
- [ ] La skill menciona `present.js decide`, `present.js check` antes de publicar, la elección `artifact`/`texto`, la caída a texto sin aprobación, sin herramienta y sin consentimiento de lienzo, y "identical options" (rojo al quitar cada frase).
- [ ] Cada plantilla: pasa `scanPublishable` (sin recursos remotos ni datos), declara su formato y versión y tiene al menos dos `data-option`; con `APPROVALS.md` vacío, `templateApproved` da `false` para los cuatro (**ningún formato queda aprobado sin el autor**); un HTML con la cabecera de versión distinta de la de `APPROVALS.md` → `false`.
- [ ] Commit: `feat(present): skill y plantillas visuales (sin aprobaciones)`.

## Ola 10 (Tasks 16 y 18 en paralelo)

### Task 16: skill `plan` y entrada al carril

**Files:**
- Create: `plugins/pignolo/skills/plan/SKILL.md`
- Modify: `plugins/pignolo/skills/entry/SKILL.md` (el carril `plan` entrega a `pignolo:plan` en vez de preguntar), `plugins/pignolo/skills/daily/SKILL.md` (el paso 11: `laneFloor: plan` con modo `plan` construido ofrece pasar a `plan`, ya no "todavía no existe")
- Test: `tests/flow-plan.test.js`, `tests/flow-lanes.test.js` (casos nuevos)

**Interfaces (los pasos de la skill, en orden; los comandos exactos):**
1. `run.js start --flow plan --plan <slug>` y `plan.js new` con el pedido literal; `next.js` al retomar y tras cada paso.
2. Brainstorm y spec (`pignolo` no inventa alcance: lo reservado se pregunta con categoría); **lista de afirmaciones clave** (sistemas externos: plataforma, APIs, SO; cada una con su sistema) a `plan.js claims set`, o `--none-reason`.
3. Autorrevisión, `spec-reviewer` y, sobre cada afirmación, `researcher` (pregunta abstracta, sin repo, fuente original obligatoria) y **`refuter` siempre sobre la lista** (afirmaciones y SHA, no prosa); cada resultado a `plan.js claims resolve`; `claims check` exit 0 antes de seguir.
4. La tarjeta: `spec-reviewer` la genera, `plan.js scope-card save` la valida (rechazo = vuelve al `spec-reviewer` con los errores), se presenta con `pignolo:present` (categoría `scope-card`; las decisiones reservadas detectadas, una por una) y **solo la aprobación del humano en su turno** corre `scope-card approve` con su cita literal.
5. El plan (decisiones y task-cards, no código final) en `docs/plans/`; `plan.js advance --to plan-written`.
6. **Auditoría de tres pasos** (sección propia, comandos de Task 5): `plan-audit.js check`; `begin-review` y `pignolo:plan-auditor` en `review` con el informe de `check` en el brief; `review-done`; `probes`; `begin-verify` y `pignolo:plan-auditor` en `verify` con las afirmaciones restantes y la ruta de `scratch/`; `finish`; `plan.js advance --to audited` solo con `APPROVE`. `REQUEST_CHANGES` vuelve al plan; `ESCALATE` al humano. **Nunca replay.** Un `Agent` por modo y modelo explícito (`setup.js models`).
7. Antes de la aprobación: solo `plan.js runnable` (R-8). Con la tarjeta aprobada: `advance --to executing`; ejecución serial (R-11) con los pasos de `daily`; los escritores con `run.js task` y las reglas de continuación de 3b.
8. Por tanda: `pignolo:validator` (con `holdout.js run` solo ahí); holdout preparado como en 4b; revisión final con la skill `review`; cierre con el resumen (`pignolo:present`).
9. Aprobados visuales: cuando el humano elige entre opciones visuales, `approved.js save` y `approved.js record` con su cita; la ruta va a la task-card del `implementer` (`Approved visual`).

**Tests literales:**
- [ ] La skill pinneada: contiene en este orden `plan.js claims set`, `refuter`, `scope-card save`, `scope-card approve`, `plan-audit.js begin-review`, `probes`, `begin-verify`, `finish`, `advance --to audited`, `plan.js runnable`, `validator`; contiene "never replay" y "only the human's approval in their own turn"; no contiene `git checkout -- ` ni `git stash` (rojo al quitar o reordenar).
- [ ] `entry` ya no dice "Plan mode is not built yet" y nombra `pignolo:plan`; `daily` paso 11 ofrece pasar a `plan`. Los tests de carril de hoy siguen verdes.
- [ ] Commit: `feat(plan): skill plan y entrada al carril`.

### Task 18: evals `agents` de `spec-reviewer`, `plan-auditor` y `validator`

**Files:**
- Create: `tests/evals/plan-cases.js`
- Test: `tests/eval-plan-cases.test.js` (determinista, costo 0)

**Interfaces:** mismo patrón que `tests/evals/testing-cases.js` (graders sobre el trace con `tests/evals/traces.js`, `--out`, etiquetas `windows`/`wsl2`, fixtures sintéticos). Casos (7):
- `spec-reviewer-added-scope` (`windows`): un spec que agrega "exportar a CSV" que el pedido no pidió → la tarjeta lista `A1` bajo "Added without being asked", sus ejemplos de aceptación citan el pedido literal (la validación de `validateScopeCard` pasa), última línea `REQUEST_CHANGES` o `ESCALATE`, no `APPROVE`.
- `spec-reviewer-clean` (`windows`): spec que calza → `Added…` = `none`, `APPROVE`, sin hallazgos bloqueantes.
- `plan-auditor-review-defect` (`wsl2`): un plan con un bloque que no compila, un test que no puede fallar y la afirmación "`git apply --numstat` prueba que el parche aplica" → encuentra los dos defectos por tarea, la lista de afirmaciones trae la de `--numstat`, **cero** `Bash` del subagente, un solo bloque ```json que `parseReview` acepta.
- `plan-auditor-review-clean` (`wsl2`): un plan sano → sin hallazgo bloqueante y un bloque que `parseReview` acepta.
- `plan-auditor-verify-claim` (`wsl2`): dos afirmaciones dadas → ≥ 1 `Bash` por afirmación (script escrito con `Write`), y reporta como `false` la de `--numstat` y como `holds` la verdadera, con un bloque que `parseVerification` acepta sin faltantes. (El hook de cierre no corre en la eval: lo mide el combo de abajo y los tests de la Task 10.)
- `validator-drift` (`wsl2`): una tanda con un archivo que nadie pidió y un informe que dice "tests pasan" sin que pasen → `REQUEST_CHANGES` que nombra el archivo y el informe falso, y el holdout ausente como "not verified".
- `validator-no-holdout` (`wsl2`): tanda limpia sin holdout guardado → no `APPROVE`: `ESCALATE` que nombra el holdout ausente.
- [ ] Test determinista: cada grader contra traces sintéticos (uno que aprueba y uno que reprueba por grader, como `eval-testing-cases.test.js`); `node tests/evals/plan-cases.js --out <dir>` genera los 7 casos y los valida contra el esquema que lee el runner.
- [ ] Commit: `test(evals): casos de spec-reviewer, plan-auditor y validator`.

## Ola 11 (Task 19, sola)

### Task 19: cierre de la parte 5b y evals por etapas

- [ ] `plugin.json` a `0.8.0` y `CHANGELOG`; spec (§5.2 y §6 con lo medido de las cartas, §15 `agents` con los casos nuevos y los resultados); README: la sección "Métricas de las evals" suma los tres agentes y "Validación de planes" apunta al `plan-auditor` real.
- [ ] `tests/manual/hito-5.md` suma: (7) un `/pignolo:plan` completo en un repo de prueba; (8) el aprobado visual llega a la task-card y el `implementer` lo verifica; (9) un artifact publicado con `ask` y elegido `artifact` contiene las mismas opciones que el texto (si el autor aprobó una plantilla).
- [ ] `npm run test:quiet` verde, revisión final opus de `main..core/hito-5b`, pasada de arreglos, confirmación acotada, unión local. Push solo con el OK del autor.
- [ ] **Evals por etapas (D-5-2).** Toda corrida con `--max-cost-usd`, `--json`, `--keep-temp` y `--no-publish`; los cinco frenos del hito 4 (sonda con ≥ 1 evento SUB; graders sin cambios desde la calibración, `git diff --quiet`; la calibración trae exactamente los casos de la etapa y todos aprobados; 5 × calibración ≤ tope de la completa). Un tope o un freno que corta se anota y se vuelve al autor. **Windows:** `spec-reviewer` (2 casos). **WSL2** (ya preparado el 2026-09-30): `plan-auditor` (3) y `validator` (2) con `--allow-tools Bash Edit Write`. Todos en opus (revisores y auditores, siempre).
- [ ] **Medición de la combinación 2a + 2b sobre un plan real nuevo** (la que `RESULTS-planes.md` dejó pendiente): el plan del hito 6, una corrida con el `plan-auditor` real y los hooks reales; se anotan tokens, minutos, hallazgos y cuántos vienen de la sonda, del experimento forzado o del paso 1.
- [ ] Resultados públicos, buenos o malos, en `tests/evals/RESULTS-hito-5.md` (versionado; comando, fecha, `claude --version`, aciertos por caso, grader que falló, costo total y por corrida, freno), tabla del README y `docs/STATE.md`. Los `%TEMP%\claude-eval-*` se borran tras leerlos.

---

## Estimación de tests

*Hipótesis, sin medir; la línea base se mide en la rama al empezar la ola 0.* **5a ≈ 235 tests nuevos** (Task 1: 34; 2: 20; 3: 24; 4: 18; 5: 12; 6: 20; 7: 21; 8: 18; 9: 16; 10: 21; 11: 12; 12: 10; 13: 8). **5b ≈ 52** (Task 15: 10; 16: 14; 17: 12; 18: 16). **Total ≈ 285** (rango 230 a 340). Suite esperada: línea base + 285.

## Estimación de costo de las evals

*Hipótesis, sin medir en estas evals.* Base medida en el hito 3 (Windows, 2.1.285, sesión principal sonnet incluida): un revisor opus costó 0,077 a 0,116 USD por corrida (media ≈ 0,089) y un `test-writer` opus 0,085 (hito 4); el banco de planes dio 0,148 USD por revisor opus en planes chicos (M3) y M6 + M7 opus 1,45 y 0,92 USD por plan real. Todo en opus, sin rama sonnet (son revisores y auditores, y la medición dice que sonnet no alcanza para planes). Supuestos por corrida: `spec-reviewer` ≈ 0,13 (escribe la tarjeta: × 1,5 del revisor); `plan-auditor` en `review` ≈ 0,15 y en `verify` ≈ 0,20 (corre experimentos: el `review-testability` del hito 4 se estimó en 0,20); `validator` ≈ 0,25 y 0,20 (corre el holdout y las compuertas: como el `implementer` estimado en 0,25).

| Etapa | Corridas | Cálculo | Estimado | Tope |
|---|---|---|---|---|
| Windows: sonda (1) | 1 | 1 × 0,13 | 0,13 | 0,4 |
| Windows: calibración (2 casos) | 2 | 2 × 0,13 | 0,26 | 0,5 |
| Windows: completa (2 × 5) | 10 | 10 × 0,13 | 1,30 | 2,1 |
| WSL2: sondas (`plan-auditor-verify-claim`, `validator-drift`) | 2 | 0,20 + 0,25 | 0,45 | 0,8 |
| WSL2: calibración (5 casos) | 5 | 0,15 + 0,15 + 0,20 + 0,25 + 0,20 | 0,95 | 1,5 |
| WSL2: completa (5 × 5) | 25 | 5 × 0,95 | 4,75 | 7,7 |
| Combo 2a + 2b sobre un plan real (1 corrida) | 1 | M6 opus 1,45 + M7 opus 0,92 como cota | ≈ 2,4 | 4,0 |
| **Total** | | | **≈ 10,3 USD** (rango × 0,6 a × 1,5: 6,2 a 15,5) | **17,0** |

Los topes suman 17 y dejan poco margen para lo único que un tope no frena (las corridas en vuelo, a lo sumo 2 con `-j 2`, ≤ 0,3 cada una): por eso la propuesta es **tope total 17 USD** y no menos. Si un tope corta una etapa, se frena y se vuelve al autor.

## Decisiones que necesita el autor

**D-5-1. Agregar `Write` al `plan-auditor` (cambio de contrato: tabla de §6; reservada, §4.1.7).** El paso 2b de la receta medida necesita que el agente escriba un script por experimento (la guardia niega `node -e` con procesos y la regla 6 prohíbe pasar texto por la shell), y hoy `plan-auditor` no tiene `Write`. **Recomendación: aprobarla**, acotada por `protect-paths` al `scratch/` de una auditoría en modo `verify` (Task 10): una herramienta a un rol, con la escritura limitada por un hook, en vez de un rol nuevo. Alternativas: (b) un rol `plan-verifier` nuevo (el 20.º agente; más superficie y otra fila en los perfiles, mismo `Write`); (c) que el orquestador escriba los scripts (el agente deja de ser el que experimenta, y la medición no cubre eso). **Límite declarado:** el confinamiento cubre la herramienta `Write` mientras pignolo esté encendido y `agent_type` llegue en el payload; el `Bash` del mismo agente en `verify` puede escribir en otras rutas, como el de los demás roles con `Bash`; la protección real es la carta y el chequeo del diff final. **Mientras el A/B decide, la Task 10 está escrita con una sola interfaz (`VERIFY_AGENT`, R-16): (a) y (b) cambian una constante, el matcher, el rol y la carta.** **La Task 10 no corre hasta que la resuelva**; sin ella la auditoría queda en los pasos 1 y 2a (lo que M3 y M7 sin 2b dieron: ~33 % a 45 %, sin experimentos propios), y el resto de 5a corre igual.

**D-5-2. Costo de las evals de 5b (reservada, §4.1.3).** Propuesta: por etapas como en el hito 4: Windows (`spec-reviewer`, 2 casos, ≈ 1,7 USD) → WSL2 (`plan-auditor` y `validator`, 5 casos, ≈ 6,2 USD) → combo sobre un plan real (≈ 2,4 USD). **Total ≈ 10,3 USD, tope 17.** Se pide ahora porque la Task 19 las corre; pueden quedar para después, como la etapa WSL2 del hito 4.

**D-5-3. Presupuesto de tareas antes de la aprobación de la tarjeta, por perfil (reservada: costo).** El spec dice "las tareas que no dependen de un ítem agregado sin pedirlo y entran en el presupuesto del perfil", y no hay número. **Decidida por el autor (2026-09-30): una ola por perfil, igual al paralelismo máximo: `max` 3, `balanced` 2, `economy` 1.** `preApprovalTasks` está en `PROFILE_PARAMS` con su test; sin perfil el valor es 0 (R-8).

**D-5-4. Aprobación de las cuatro plantillas visuales (§4.6: "cada formato lo revisa y aprueba el autor").** Las plantillas se publican con datos de ejemplo, el autor las mira y se registra su aprobación (fecha, versión, sha256) en `templates/present/APPROVALS.md`. Publicar un artifact con la herramienta es una acción externa (queda privado; compartirlo es del autor): pedir confirmación al ejecutar la Task 17. **Hasta entonces los cuatro formatos caen a texto**, que es lo que el spec manda; no bloquea la ejecución.

**D-5-5. Auditoría previa de 5a (recomendada; costo).** CLAUDE.md pide auditoría previa solo en hitos de riesgo (guardia, borrados, respaldos). Este hito toca la guardia (regla `pignolo-plan`), `protect-paths` y tres hooks nuevos. **Recomendación:** una sola auditoría opus con la receta medida (revisor + experimentos puntuales, ~1,5 a 2,5 USD) acotada a las Tasks 9, 10 y 12, antes de ejecutarlas; el resto, no. Si el autor prefiere ahorrarla, queda cubierta por la revisión final opus de 5a.

**Registradas como técnicas (sin pedir):** R-1 a R-16. En particular, ningún contrato del autor cambia salvo lo de D-5-1; las claves nuevas son aditivas.

## Auditoría de esta versión y dónde quedó cada hallazgo

Auditoría opus de las Tasks 9, 10 y 12 (D-5-5, hecha el 2026-09-30): paso 1 (revisor) con 0 CRITICAL, 7 IMPORTANT, 8 MINOR y 12 afirmaciones; paso 2 (experimentos del auditor y lectura del binario del host, Claude Code 2.1.285). Todo hallazgo y toda afirmación relevante quedó corregido en el texto de esas tareas; lo que no se pudo medir en vivo queda como "estática" y va al checklist `tests/manual/hito-5.md`.

| Hallazgo o afirmación | Resultado | Dónde quedó |
|---|---|---|
| F1 (IMPORTANT): la regla (4) de `scope-gate` se escapaba con `checkout main &&`, rama ilegible, `cd <main> &&`, `push` a secas | Confirmado | Task 9 reglas 4 a 6 y tests "destinos"; `gitCommands` (R-14) con `onMain`/`cwdChanged`; rama `null` = `main`; `currentBranch` con `timeout: 1000` |
| F2 (IMPORTANT): `pull`, `rebase`, `fetch . x:main`, `branch -f`, `update-ref`, `reset`, `cherry-pick` también aterrizan en `main` | Confirmado | Task 9 regla 5 (un destino por verbo) y tests "verbos"; lo no mirado queda fijado por un test; prefiltro igual en Task 12 |
| F3 (MINOR): clasificación por palabras; `plan.json` faltante, `run.json` ilegible o vencido sin especificar | Confirmado | Task 9 reglas 2, 4 y 7 (por `sub`; `unregistered`, `unreadable-run`, `expired` usa su `plan`) y test "estados del registro" |
| F4 (IMPORTANT): `readMode`/`countExperiment` sin `plan`; `mode.json` es por plan | Confirmado | R-15 (iii); Task 3 (`readMode` escanea `*/mode.json`, devuelve `plan`, el más reciente gana); Task 10 interfaces y tests "Modos" y `p2/scratch` |
| F5 (IMPORTANT): contador en `mode.json` pierde incrementos; rename `EPERM` | Confirmado (C6, C7) | R-15 (i); Global Constraints (excepción de los contadores); Task 3 y 10: logs `bash-calls.log` y `stops.log`; test de 5 procesos concurrentes |
| F6 (IMPORTANT): un `Bash` que falla no cuenta | Confirmado (C5 falsa) | R-2 y R-15 (ii); Task 10 (`PostToolUseFailure` en el handler y test); Task 12 (entrada en `hooks.json`, pinneada) |
| F7 (IMPORTANT): dos handlers más por `Bash` y exit 2 del launcher sin pasar por `MAX_BLOCKS` | Confirmado (C8: 3,5 s bajo carga) | R-15 (iv, v); Task 12 `lib/hook-fastpath.js` + launcher antes del Worker, tabla `skips`; Task 10 `SubagentStop` cuenta el intento primero; límite del tope nativo declarado |
| F8 (MINOR): textos de negación sin `Alternativa:` | Confirmado | Task 10 (texto de `review` y de `protect-paths`; test con `Alternativa:`) |
| F9 (MINOR): faltaban traversal, otro plan, mayúsculas, `/c/…`, `Edit`/`MultiEdit` | Confirmado | Task 10 test de `protect-paths` y la regla de resolución |
| F10 (MINOR): el `Bash` del agente que experimenta escribe fuera del `scratch/` | Confirmado, límite declarado | Task 10 "Límite declarado", D-5-1, spec §8.3 (línea de la Task 14) |
| F11 (MINOR): D-5-1(b) cambiaría muchos puntos | Confirmado | R-16 y Task 10 (`lib/plan-agents.js`, `VERIFY_AGENT`, bloque "Si D-5-1 elige (b)"); matcher de la Task 12 armado con la constante |
| F12 (MINOR): detección dinámica de `plan.js` demasiado ancha | Confirmado | Task 12 (solo caché del plugin, `plugins/pignolo/…` y `CLAUDE_PLUGIN_ROOT`; `run.js` intacto) y test "no se pasa de ancha" |
| F13 (MINOR): sin casos de PowerShell | Confirmado | Task 12 test de guardia "PowerShell" |
| F14 (MINOR): "todo handler registrado" choca con `_echo.js` | Confirmado | Task 12 test `hooks-json` contra lista esperada explícita |
| F15 (MINOR): plan que arrancó en otra rama no se mira | Confirmado, límite declarado (se prefirió lo simple) | R-14, R-7, Task 9 límite (b), spec §8.3 |
| C1: `PostToolUse` trae `agent_type` dentro del subagente | Verdadera (estática; sin observar el valor `pignolo:plan-auditor` en vivo) | Sin cambio de texto; sigue en el checklist manual |
| C2: exit 2 de `PreToolUse` en un subagente impide el comando y llega el motivo | Verdadera (observada en esta auditoría) | Sin cambio |
| C3: `SubagentStop` con matcher por agente y `last_assistant_message` | Verdadera (estática) | Sin cambio (Task 10 ya trata el mensaje ausente como sin entradas) |
| C4: `decision: block` en `SubagentStop` hace continuar al subagente | Verdadera (estática) | Sin cambio |
| C5: `PostToolUse` dispara con `Bash` de salida distinta de cero | **Falsa**: dispara `PostToolUseFailure` | R-2, R-15 (ii), Task 10, Task 12 |
| C6: la lectura-modificación-escritura pierde incrementos | Verdadera en local (contador 1, log 5); que el host dispare en paralelo no se midió en vivo | R-15 (i), Task 10 (test concurrente) |
| C7: `renameSync` da error con un lector abierto en Windows | Verdadera: `EPERM` (254 a 1999 de 2000), `EBUSY` no | R-15 (i), Global Constraints, Task 3 (reintento del único escritor) |
| C8: cuatro launchers por `Bash` bajo carga terminan antes del plazo | Verdadera con margen delgado (0/400 denegaciones, máximo 3,55 s) | R-15 (iv), Task 12 (atajos), Review Focus 2 |
| C9: el `cwd` del payload es el de la sesión, no el del `cd` del comando | Verdadera (estática) | Task 9 (`cwdChanged` cuenta como destino `main`) |
| C10: la ruta real de la caché y `CLAUDE_PLUGIN_ROOT` coinciden con la regla nueva | Verdadera con el detector de hoy | Task 12 (tests con rutas reales, barras y `$env:`; detección estrechada por F12) |
| C11: el tope nativo es 8 y un exit 2 cuenta | Verdadera (variable `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` puede subirlo o desactivarlo) | R-15 (v), spec §8.3 |
| C12: un `deny` de `scope-gate` gana a un `ask` de la guardia | Verdadera (estática; el "sin pregunta" no se vio en vivo) | Task 12 (entrada aparte en `hooks.json`), checklist manual |

**Pendientes de esta auditoría:** el valor en vivo de `agent_type` en `PostToolUse` (C1), el cierre en paralelo del host (C6) y la ausencia de pregunta en C12 se miden en `tests/manual/hito-5.md`; D-5-1 sigue abierta (R-16).
