# Informe de ejecución del hito 6 (ejecutor único en serie)

## Task 1: almacén de estado (lib/state-store.js)
- Commit: `feat(state): almacén de entradas de estado con estados por tipo`.
- Tests: `tests/state-store.test.js` (12 casos: parseEntry, readEntries, writeEntry, setStatus).
- Rojo demostrado por mutación del lib (5 mutaciones, cada una tumba un test): sin chequeo `exists`; sin `terminal`; sin chequeo id/nombre; sin borrar el `.tmp` al fallar el rename; `setStatus` reescribiendo una línea extra.
- Ruling: `sessions` solo admite `closed`, `metrics` solo `recorded`, `archive` admite `closed|decided|superseded` — R-1 no fija estados para esos tipos y el archivado conserva el status — costo si está mal: una entrada de `sessions`/`metrics` con otro status se rechaza en `writeEntry` (se corrige en una línea).
- Ruling: `priority` inválida en `writeEntry` → `refused: 'invalid-priority'` (no previsto en la tarjeta, aditivo).
- Dudas: ninguna.

## Task 2: presupuesto de contexto (lib/context-budget.js)
- Commit: `feat(context-budget): nivel caliente con degradación ordenada`. Tag local `contract/hito-6a/v1`.
- Tests: `tests/context-budget.test.js` (9 casos).
- Rojo demostrado por mutación: sin degradación; nivel 2 que conserva un `normal`; conteo de `dropped` corrido en 1; sin orden estable; sin recorte final al `limit`.
- Ruling: "abierto" = status `open` o `proposed` (los demás solo cuentan) — R-3 habla de abiertos y de contadores por status — costo si está mal: una sección de más o de menos en el nivel caliente, cambio local.
- Ruling: el nivel 2 quita los `normal` de todas las secciones (también `work`); "trabajo en curso" = entradas `work` abiertas más la línea del flujo — R-3 no distingue — costo bajo.
- Ruling: si ni el nivel 4 entra, primero se quitan rama/next/flujo y después se corta el texto al `limit` (la tarjeta: "se recortan al final, nunca antes que los punteros").

## Task 3: índice y protección del estado
- Commit: `feat(state): índice generado y protección de INDEX.md, accepted/ y state/`.
- Tests: `tests/state-index.test.js` (6), `tests/protect-paths-state.test.js` (6).
- Rojo por mutación: sin regla INDEX.md; sin regla accepted/; sin regla de subagente; sin regla de worktree; `/pignolo:off` sin apagar (b)/(c); writeIndex que siempre escribe; `--check` que ignora el contenido; plan ilegible silencioso; entrada ilegible perdida; archive listado en vez de contado.
- Ruling: el puntero del índice lleva `[status]` al final (`- <id> — <título>: <línea> [status]`) y solo se listan las secciones con entradas o errores — R-2 no fija el formato exacto y así el diff del status cambia una sola línea — costo bajo.
- Ruling: `archive` sale como contador ("N entradas archivadas") — Task 7 lo exige — costo nulo.
- Ruling: (c) detecta "worktree que no es el principal" con `projectRoot(cwd) !== mainRoot(cwd)` (worktree enlazado real) o `cwd` bajo `.pignolo/worktrees/` — sin git ni procesos — costo si está mal: un falso deny desde un worktree enlazado que no es de tarea (la alternativa dice desde dónde escribir).
- Guarda de regresión corrida: protect-paths-roles, protect-run, guard-toggle-paths en verde.

## Task 4: egreso (lib/egress.js, hooks/handlers/egress.js)
- Commit: `feat(egress): web solo para researcher, sin MCP en subagentes durante un flujo, filtro de consultas`.
- Tests: `tests/egress.test.js` (8 casos, tabla de §15 `egress` más la guarda del corpus de la guardia).
- Rojo por mutación: `malformed` tratado como ausente; sin chequeo del flujo; hilo principal atado; MCP permitido; web para todos; sin la grafía con `\`; identificadores cortos conservados; regex inválida silenciosa; solo campos conocidos del `tool_input`; pii ignorado.
- Ruling: `decideEgress` devuelve además `alternative` (aditivo a `{ allow, reason }`) para que el handler arme el bloqueo — costo nulo.
- Ruling: los worktrees se obtienen de `git worktree list --porcelain` (plazo 1 s) más `<main>/.pignolo/worktrees/*` sin git; si git falla quedan las rutas conocidas (best-effort declarado).
- Ruling: un `project.md` ilegible (regex inválida, YAML roto) niega al researcher con el motivo (falla cerrado), como pedía la tarjeta.

## Task 5: aprendizajes (lib/learnings.js)
- Commit: `feat(learnings): propuesta, piso mecánico y decisión de aceptación`.
- Tests: `tests/learnings.test.js` (6 casos; tabla de R-8 completa, scan, parse, propose, applyDecision con rename y con git mv).
- Rojo por mutación: web aceptado solo; piso ignorado; BLOCKED aceptado; reservadas ignoradas; sin promoteCandidate; tamaño ignorado; regex pii inválida silenciosa; primer bloque json en vez del último; id no pedido aceptado; `human` mueve; `git mv` siempre (`not under version control`); destino pisado.
- Ruling: `moveEntry` vive en `lib/state-store.js` (lo usan `applyDecision` y, en la Task 7, `archive`) — evita duplicar la lógica versionada/sin versionar — costo nulo.
- Ruling: `parseValidation(text, { ids })` recibe la lista opcional de ids pedidos para rechazar uno que no se pidió (la tarjeta lo exige y no decía de dónde salen).
- Ruling: `decideAcceptance` toma `pending` si el validador no informó el id; un `fail` gana sobre `web` (R-8 pone `rejected` antes que `human`).
- Ruling: `proposeLearning` guarda `scope` en el frontmatter (campo aditivo) y `created` por defecto hoy.

## Task 6: sombra al cerrar la sesión (lib/shadow.js, lib/git-backup.js)
- Commit: `feat(shadow): gc con heurística y poda con la sesión resuelta al cerrar la sesión`.
- Tests: `tests/shadow-close.test.js` (9 casos). `tests/shadow.test.js`, `tests/retention.test.js`, `tests/backup.test.js`, `tests/git-backup.test.js` siguen verdes sin tocarlos.
- Rojo por mutación: sin `refused: 'no-session'` (cae a sin-sesion → other-session-active); sin regla de sesiones vivas; gc que borra una ref; `prune` con su `gc --auto`; sin `gc.autoDetach=false`; sin adelantar el lock; gc con plazo; fallo del gc sin registrar; otras sesiones ignoradas; `--prune=now` (el reciente colgado se va); sin lock.
- Ruling: el mtime de `index-<clave>` se fija con el `now` de la siembra/instantánea (`touchIndex`), no con el reloj — así "sesión viva" y "otra sesión activa en 10 min" se miden con la misma fecha que la retención y los tests de retención existentes (que siembran con fechas pasadas) no cambian — costo si está mal: en producción `now` es el reloj real, equivalente.
- Ruling: el `gc --auto` de `prune` (cuando `gcAuto: true`, la siembra) también corre con `gc.autoDetach=false` (F2: en Linux/macOS el detach dejaba un gc detrás del lock) — costo: la siembra en segundo plano tarda lo que tarde el gc, ya corre fuera del hook.
- Ruling: `gcShadow` con `needsGc` en `none` no corre nada (ni `gc --auto`); el `gc --auto` queda solo para el caso `other-session-active`.
- Duda registrada: `CLAUDE_CODE_SESSION_ID` no está documentado; queda en `tests/manual/hito-6.md` (Task 9).

## Task 7: scripts/close-session.js y lib/archive.js
- Commit: `feat(close-session): evidencia, decisión de aprendizajes, archivado, índice y poda`.
- Tests: `tests/archive.test.js` (5), `tests/close-session.test.js` (8, por procesos nuevos; merge/cherry-pick/rebase armados con git de verdad).
- Rojo por mutación: learnings archivables; abiertas archivadas; edad ignorada; `--dry-run` que mueve; MERGE_HEAD leído a mano en `<main>/.git` (el worktree enlazado lo delata); solo merge; rechazos silenciosos; ilegibles silenciosas; `git mv` siempre; sin chequeo de merge en el script; `--days` ignorado; `decide` sin `scan`.
- Nota: la mutación "quitar el `no-session` del script" no tumba ningún test porque `closeShadow` (Task 6) también lo rechaza: defensa doble, la del script da el mensaje de uso del verbo.
- Ruling: `evidence --since` acepta un sha (7-40 hex → `since..HEAD` y `diff --name-only`) o una fecha ISO (`--since=` y `log --name-only`); un `since` que git no resuelve → `refused: 'git-failed'` exit 1.
- Ruling: una entrada cerrada sin `created` legible va a `refused` con `reason: 'no-created'` (no se adivina la edad).
- Ruling: `decide` devuelve además `validation` (`DONE` o `ilegible: <error>`) y `how` (`git-mv`/`rename`), aditivos.
- Ruling: `prune` fuera de un repo → `refused: 'not-a-repo'` exit 1 (la tarjeta no lo cubría).

## Decisión del autor R7 (2026-10-01), recibida durante la Task 7
- Se descarta la Task 10 (carta del `learning-validator` en opus, `roles.js`, trazas) y la Task 12 (evals del `learning-validator`). No se había empezado ninguna: nada que revertir. 6b queda con la skill `close-session` (Task 11) usando `scan` + sí del humano en vez del validador, y el cierre (Task 13) sin evals. `parseValidation`/`decideAcceptance` de la Task 5 quedan como funciones deterministas (el verbo `decide` sigue aceptando un informe escrito por el humano o por quien sea; sin informe, `pending`).

## Task 8: cableado (SubagentStart, nivel caliente, egreso, guardia)
- Commit: `feat(continuidad): SubagentStart, nivel caliente en SessionStart y egreso cableados` (5224ad8). Precondición: ancestro de `contract/hito-6a/v1`, `hook-fastpath.skips` e `isPlanScript` presentes.
- Tests: `tests/subagent-start.test.js` (5), `tests/session-start-hot.test.js` (6), `tests/e2e-hito-6a.test.js` (2: humo por el lanzador real de egress/subagent-start/session-start y resume desde worktree/subdirectorio/principal), casos nuevos en `hooks-json` (1), `hook-fastpath` (1), `launcher` (1), `guard-pignolo-plan` (1). Guardas de regresión en verde: session-start, e2e-hito-5, hooks-smoke-hito-5, sabotage, guard-corpus, egress, permissions, guard-explain-canaries, git-guard, protect-paths-state.
- Rojo por mutación (cada una tumba al menos un test): `task.agent` en vez de `agents.includes`; tarjeta a cualquier agente; run vencido leído; sin recorte; habla con `/pignolo:off`; sin filtro de prefijo; sin línea de rama; run leído desde `cwd`; FAIL_OPEN vacío; sin atajo de egress; matcher de SubagentStart y de egreso cambiados; nivel caliente en `systemMessage`; tope sin descontar los avisos; nivel caliente con `/pignolo:off`; ilegibles silenciosas; rama y entradas desde `cwd` (e2e).
- Mutación equivalente: quitar el filtro `kind !== 'nothing'` no tumba nada porque `deriveNext` devuelve `text: ''` en `nothing`; el filtro queda como defensa.
- Ruling: los casos de la regla de la guardia van en `tests/guard-pignolo-plan.test.js` (donde viven los de `pignolo-plan`), no en `git-guard.test.js` — costo nulo.
- Ruling: con `source: 'status'` el `next` sigue en `systemMessage` como hoy y no se emite nivel caliente (la tarjeta pide "no cambia nada respecto de hoy") — costo: `/pignolo:status` no muestra el nivel caliente.
- Ruling: el aviso de 400 caracteres de la tarjeta se arma con el canario caído en las 5 familias (~250 caracteres); el reparto del tope lo prueba un caso calibrado aparte (nivel caliente de 7.850-8.000 solo, que con avisos se degrada) — costo nulo.
- Ruling: el hecho de ilegibles es "N entradas de estado ilegibles (ver INDEX.md y .pignolo/state/)." al final del nivel caliente, dentro del tope.
- Ruling: `subagent-start` no exige `project.md` (todo agente `pignolo:*` recibe `core.md`); `ctx.corePath` solo para tests.
- Doble declarado en el e2e: con una tarea en curso `next` da `task-in-progress` (no la etapa del plan), y eso es lo que el nivel caliente muestra.
- `tests/manual/hito-6.md` entró en este commit (es de la Task 9).

## Task 9: cierre de 6a (0.9.0)
- Commit: `chore(release): hito 6a, versión 0.9.0`. `plugin.json` 0.7.1 → 0.9.0 (en esta rama no está el 0.8.x de 5b, que sí está en `main`: el CHANGELOG y `plugin.json` van a chocar al unir; la entrada 0.9.0 va arriba de 0.7.1 acá).
- `npm test` una vez: 2363 tests, 2357 pass, 4 fail, todos de carga (EPERM al borrar un perfil de navegador en `pignolo-ui/tests/browser-cleanup.test.mjs` ×2, `agent-allowlist` 4000 tags en 3076 ms > 3 s, un caso H13 de PowerShell de la guardia); re-corridos solos esos archivos: en verde (G8). Ninguno toca código de este hito.
- Spec actualizada: §6.1, §8.3, §10.1, §10.2, §11.6, §15. `tests/manual/hito-6.md` (7 puntos, sin correr) entró con la Task 8.
- Pendiente del caller: la revisión final opus de 6a (no la hago: sin subagentes).

## Task 11: skill close-session (6b)
- Commit: `feat(skills): close-session`.
- Tests: `tests/skill-close-session.test.js` (4), casos nuevos en `tests/learnings.test.js` (1, `decideByHuman`) y `tests/close-session.test.js` (1, `decide --human`).
- Rojo por mutación: skill invocable por el modelo; verbo inventado (`reindex`); sin parar con un merge; despacho de `pignolo:learning-validator`; Engram mencionado; cita resumida en vez de literal; Write en `accepted/`; sin `--human accept`. En el código: el sí gana al piso; `reject` que acepta; respuesta desconocida que mueve; sin `promoteCandidate`; uso no excluyente; `--human` ignorado.
- Ruling: R7 sin validador necesitaba un camino para el sí del humano: `close-session.js decide --id <id> --human accept|reject` (excluyente con `--validation-file`; `--reserved` solo con éste) y `decideByHuman` en `lib/learnings.js`. El piso mecánico gana aun con un sí; `source: web` se acepta solo con el sí explícito; `scope: general` → `promoteCandidate` — por qué: el `decide` de la Task 7 sin informe deja todo en `pending` y la skill no podría aceptar nada sin fabricar un informe del validador — costo si está mal: un verbo aditivo que se puede quitar; `--validation-file` sigue igual.
- Ruling: la skill no despacha ningún agente (el test de la tarjeta "el despacho usa pignolo:learning-validator" se reemplazó por "no nombra ningún `pignolo:*` ni el learning-validator") — R7.
- Ruling: los verbos de la skill se comparan contra el `uso:` del script en el test propio (no se tocó `tests/skill-forms.js`, que solo conoce run/ledger/setup) — costo nulo.
- Ruling: la pregunta de aceptación usa la categoría `scope` (o `rule-conflict` si contradice una regla o toca una reservada); la lista cerrada de `question.md` no tiene una categoría propia para aprendizajes — costo: una categoría discutible, cambio de una línea.
- Duda: el agente `pignolo:learning-validator` sigue existiendo (carta y `roles.js` sin cambios, sonnet en `balanced`/`economy`) aunque ya nada lo despacha; quitarlo o dejarlo es del autor.

## Task 13: cierre de 6b (0.10.0)
- Commit: `chore(release): hito 6b, versión 0.10.0`. Tasks 10 y 12 descartadas por R7 (sin carta en opus, sin `persistFailedTraces`, sin evals ni gasto: 0 USD).
- `npm test` una vez: 2370 tests, 2368 pass, 0 fail, 2 skip.
- Ruling: R-10/D-6-3(d) decían que la clave `engram` de la config no existe; seguía en `lib/profiles.js` (`engram: false` por defecto) y en el paso 5 de `/pignolo:setup`. Se quitaron, con test (`profiles` deepStrictEqual sin `engram`; `setup` sin la palabra Engram), rojo mostrado restaurando cada uno — costo si está mal: una config vieja con `engram` se sigue leyendo (no se valida esa clave), solo deja de devolverse.
- Spec: §10.4 (R7 y la skill), §10.5 (idea futura con lo verificado), §7 (fila del learning-validator: sin despachar), §14 (setup sin Engram), §15 (`agents` del learning-validator descartado), §18 punto 6 (hecho). STATE.md (entrada nueva arriba) y gaps G17 (sigue abierto, sin dueño).
- Doble para el caller: la rama tiene `plugin.json` 0.10.0 sobre 0.7.1 y `main` está en 0.8.1 (5b): conflicto esperable en `plugin.json`, CHANGELOG y STATE.md al unir. Revisión final opus de 6a/6b pendiente (sin subagentes acá). Etiqueta `contract/hito-6a/v2` no creada (el plan la pedía tras las Tasks 3-6; nadie la usa).

## Pasada de arreglos de la revisión final (2026-10-01, 0.10.1)

Corrige lo que este informe da por bueno y la revisión final desmintió: `decide --validation-file` y `--human` se reemplazan por `--answer yes|no` (C1); `findDuplicate`, `checkEvidence` y `flags` se implementan (I1); la Task 10 se hace como herramienta de trazas G17 (I2); el agente `learning-validator` se borró por decisión del autor. El detalle por hallazgo está en `CHANGELOG.md` (0.10.1).
