# Informe 8a (executor serial) - rama core/hito-8a, base main afc1086 (0.8.2)

Plan: version objetivo 0.9.0 (renumerado desde 0.8.2 publicado).

## Task 1 - init-detect
- Commit: feat(init): detección del tipo, las compuertas y las rutas de riesgo...
- Tests: tests/init-detect.test.js (14 tests/tabla).
- Rojo: placeholder no rechazado (2 fallos), mutation por runner (1), lectura de CLAUDE.md (1), package.json sin script real (1).
- Ruling: archivos de setup del runner no se agregan a testPaths — no se parsean configs de runner — costo: un setupFiles fuera de tests/ no queda protegido (R-8 igual protege la config).
- Ruling: dart puro usa stack 'flutter' con runner 'dart' — STACKS no tiene 'dart' — costo bajo.
- Ruling: varios stacks => gates del primero con warning — simple — costo: monorepos mixtos requieren edición manual.
- Ruling: comandos de mutación (stryker/mutmut/cargo-mutants) sin verificar contra docs — se marcan en Task 3? no; quedan "a verificar" — costo: comando propuesto incorrecto (la skill lo muestra al humano, que confirma).

## Task 2 - project-md
- Commit: feat(init): project.md desde una propuesta y fusión que no pisa lo declarado
- Tests: tests/project-md.test.js (10).
- Rojo: pisar un escalar declarado, normalizar notas/espacios finales, quitar la regla too-broad, final de línea CRLF forzado a LF.
- Ruling: valores con `"` se escriben siempre entre comillas simples (aun sin necesitarlas) — lo manda la tarjeta — costo nulo.
- Ruling: lista declarada que difiere = conflicto, nunca unión — R-4.

## Task 3 - {seed} + init-seed
- Commit: feat(gate): marcador {seed}...
- Tests: tests/gate-seed.test.js (7; incluye casos de seals y project-config en el mismo archivo en vez de gate.test.js/project-config.test.js).
- Rojo: no expandir en gate.js (2 fallos, incluido el de shell real), seals sin validar booleano, sin aviso en project-config, ignorar `verified`.
- Verificacion de semillas (Context7/web, 2026-10-01): vitest y jest verificados; pytest-randomly verificado solo `--randomly-seed` (README, flag `-p randomly` descartado por redundante); node --test sin opcion de semilla (verificado ausente); go (-shuffle existe, sintaxis con semilla no confirmada en docs) y flutter (no hallado) quedan verified:false => unused.
- Ruling: Detection.testScript agregado para decidir `script-not-runner` — costo nulo.
- Ruling: pytest solo aplica si pytest-randomly declarado (lo decide Task 7 con runners) — costo: sin plugin no hay semilla.

## Task 4 - init-actions (riesgosa)
- Commit: feat(init): reflog, gitattributes, ignores y SECURITY.md con respaldo fuera del repo y sin pisar
- Tests: tests/init-actions.test.js (10). Cubren tambien el `run` opcional de setReflogPolicy, PIGNOLO_IGNORED y la regresion de `run.js start` (en vez de editar git-backup.test.js/run-files.test.js, que siguen verdes).
- Rojo: setReflogPolicy ignorando `run` (2 fallos), respaldo junto al original (2), conflicto de .gitattributes no detectado, PIGNOLO_IGNORED sin worktrees/ (2), inyeccion de estructura en SECURITY.md, COPYFILE_EXCL quitado.
- Aditivo y aislado: git-backup.js (solo setReflogPolicy gana `run`), pignolo-gitignore.js (export nuevo), run.js (importa la constante). git-guard.js intacto.
- Ruling: cada paso acepta `dry:true` y devuelve 'would-do' (preview de Task 7 comparte codigo con apply) — costo nulo.
- Ruling: applySecurityMd recibe la plantilla como TEXTO — la lee el script — costo nulo.
- Ruling: ensureIgnored sin respaldo (A8-06) como manda la tarjeta.

## Task 5 - auto-memory (solo lectura)
- Commit: feat(init): ubicar la auto-memoria del proyecto sin leerla
- Tests: tests/auto-memory.test.js (6 tests con varias afirmaciones: slug/hash 'wkpu26' correcto, configDir unico, conteo, worktree/subdir, override, no-lectura).
- Rojo: leer contenido para contar (2), sin tope/hash, sin mainRoot, union con ~/.claude.
- Paso 0 (docs https://code.claude.com/docs/en/memory, 2026-10-01): confirma `<config>/projects/<project>/memory/`, `autoMemoryEnabled`, `autoMemoryDirectory` (ruta absoluta o `~/`), `CLAUDE_CODE_DISABLE_AUTO_MEMORY`. DIFERENCIAS: (1) existe `CLAUDE_CODE_PROJECT_DIR_NAME` (v2.1.234+) que reemplaza el nombre del directorio de proyecto: lo agregue a la nota 'env-override' (limite declarado, no se resuelve); (2) las docs dicen que `autoMemoryDirectory` se lee de cualquier scope (tambien el settings.json versionado del proyecto, bajo confianza de workspace); el plan decia que Claude Code lo ignora del versionado: se mantiene el plan (solo settings.local.json y el de usuario), limite declarado.
- Ruling: slug se calcula sobre la ruta tal como la da mainRoot (sin realpath) — realpath en Windows expande nombres 8.3 y cambia caja — costo: si Claude Code canonicaliza distinto, no se encuentra la carpeta y `tried` lo dice.

## Task 6 - claude-settings (riesgosa)
- Commit: feat(init): desactivar la auto-memoria del proyecto en settings.local.json con respaldo fuera del repo
- Tests: tests/claude-settings.test.js (9).
- Rojo: escritura directa al destino (falla atomicidad y 3 mas), BOM sin quitar, JSON invalido tratado como {} (pisaba), respaldo junto al archivo, fusion que descarta el resto del JSON.
- Ruling: rename fallido => status 'refused' con reason 'write-failed: ...' (el respaldo ya hecho se informa) — la tarjeta lo permite — costo nulo.
- Ruling: sangria detectada por la primera linea indentada; claves enteras (numeric-like) podrian reordenarse por JS — improbable en settings — costo bajo.
- Duda para checklist manual (ya en plan): C-05, escribir settings.local.json con la sesion abierta.

## Task 7 - scripts/init.js
- Commit: feat(init): scripts/init.js con detect, preview, apply y verify (incluye templates/SECURITY.md minimo, que la Task 10 revisa).
- Tests: tests/init-cli.test.js (12, por proceso real).
- Rojo (8 mutaciones): ignorar `approved`, usar cwd en vez de mainRoot, nextCommit incluye .pignolo/.gitignore sin seguimiento, detect escribe, preview escribe, id desconocido no rechazado, validatePiiPattern anulado, detect leyendo un archivo de la memoria.
- Rulings: (a) apply/preview comparten codigo con `dry` (preview == apply por construccion); (b) exit 1 solo para write-failed, exit 3 para excepciones inesperadas, los `refused` por entrada (invalid-project-md, too-broad, conflicting-rule) no son fallo del script (exit 0) — la tarjeta dice "fallo escribiendo"; (c) nextCommit se calcula de git status (archivos sin commitear), no de lo que hizo apply — asi tras commit queda vacio; (d) verify.runnerExcludes omite runners sin archivo o con walksDotDirs 'no'; (e) seed: pytest solo si pytest-randomly declarado.
- Duda: el campo `detection.seedPlan` de la Task 1 (pending-task-3) se reemplazo en init.js por {runner, flag, plan, reason}.

## Task 8 - regla pignolo-init (riesgosa)
- Commit: feat(guard): regla pignolo-init anclada al plugin, un subagente no opera init.js
- Cambios aditivos y aislados para el merge con core/hito-6: git-guard.js (1 entrada en el mapa de familias tras 'pignolo-plan', 1 linea en checkRunScript, y un bloque nuevo `isInitScript` con 3 regex propias antes del bloque del holdout; no se toco isPlanScript); protect-paths.js (funcion nueva `projectMdRule` y un `||` en el return final).
- Tests: tests/guard-init.test.js (10): denies por forma, ajeno permite, must-allow de lectura (cat/grep/head/sed -n/Get-Content/Select-String), hilo principal, /pignolo:off, humo por launcher, A8-09 por rol.
- Rojo: deteccion textual (rompe el caso ajeno), sin la regla (4 fallos), `executes` siempre verdadero (rompe los must-allow de lectura), restringir a 3 roles, quitar el chequeo de agent_id (rompe hilo principal).
- A8-09 implementado (decision del autor): deny de Edit/Write sobre `.pignolo/project.md` a todo subagente con el proyecto activo; el mensaje empieza `<agente> no escribe .pignolo/project.md` (compatible con los tests existentes). Cualquier ruta que termine en `/.pignolo/project.md` cuenta (tambien de worktrees de tarea).
- Ruling: PowerShell reutiliza la deteccion existente (`& node "..."`), sin familias nuevas (R-23).
- Ruling: los casos de la tarjeta de `roleRule` con texto real quedaron cubiertos por el mensaje compatible; el caso "general-purpose permite hoy" se invirtio por la decision A8-09.
- Corpus (tests/guard/*.json) sin cambios: evaluate() del corpus no tiene contexto de subagente; los suites existentes pasan.

## Task 9 - e2e
- Commit: test(init): pruebas de punta a punta de init (tambien nota en tests/manual/hito-3b.md puntos 10 y 11, y el texto de la nota de apply sobre settings.local.json).
- Tests: tests/e2e-hito-8.test.js (11).
- Rojo: placeholder no rechazado (rompe stacks y gates §15), gate sin expandir {seed}, nombre `proposeLearning` agregado a un archivo de init (R-21).
- HALLAZGO real (doubt para el autor): `init` con el paso `auto-memory-off` deja `.claude/settings.local.json` sin seguimiento y el tripwire `claude-config` de `risk.js` sube el piso del primer flujo de `trivial` a `daily` (hits: claude-config, security). Mitigacion hecha: la nota de apply lo avisa y dice como ignorarlo (excludes global o .git/info/exclude). Decision pendiente del autor: que `init` agregue la linea a `.git/info/exclude` (toca .git, no lo hice) o que risk.js ignore ese archivo.
- Ruling: el test del limite (a) aprueba todos los pasos salvo auto-memory-off por lo anterior.
- Ruling: NODE_TEST_CONTEXT se limpia del entorno de los tests que corren `node --test` por la compuerta (heredado del runner hace que el hijo salga 0 siempre).

## Task 10 - skill init, plantilla, README
- Commit: feat(init): skill init, plantilla de SECURITY.md y README (la plantilla se creo en la Task 7 porque apply la lee).
- Tests: tests/skill-init.test.js (7). skill-forms.js ahora verifica los verbos de init.js.
- Rojo: `git push` en la skill, Edit sobre project.md, `git commit` sin pedir sí, verbo inexistente de init.js, marcador extra y la palabra "cumple" en la plantilla, README con "Hasta que exista".
- Ruling: el test "la skill aparece donde manifest.test.js enumera skills" no existe (manifest.test.js no enumera skills): se reemplazó por una comprobación de que skills/init existe y que cada skill tiene SKILL.md.
- Ruling: skill status no menciona activación a mano; sin cambios. README mantiene la nota "a mano también sirve".

## Task 13 - checklist manual
- Commit: docs(init): checklist manual de adopción y medición del hito 8. Sin tests (es un documento); sin "rojo".
- Agregados a los puntos del plan: CLAUDE_CODE_PROJECT_DIR_NAME, el aviso del tripwire claude-config (hallazgo de la Task 9), y verificar `go -shuffle` y flutter (verified:false).

## Task 15 - cierre de 8a
- Commit: chore(hito-8a): versión, changelog y estado (0.9.0; spec editado: §8.2 `{seed}`, §8.3 A8-09 y pignolo-init, §10.5, §14, §18 punto 8; docs/STATE.md; docs/gaps.md G30-G32; tests/permissions.test.js declara pignolo-init como no expresable).
- `npm test` una vez: 2461 tests, 2446 pasan, 13 fallan. Una era real (permissions.test.js: la regla nueva `pignolo-init` necesitaba su razon declarada; arreglado y verde). Las otras 12 son de tiempo bajo la carga de la suite completa (`git ETIMEDOUT` en scope-gate G19, handback/gates/flow-lanes, --explain, PowerShell forms de plan); las 12 pasan al correr sus archivos solas (scope-gate, handback-gate, handback-counter, gates, flow-lanes, guard-handler, guard-explain-canaries, guard-pignolo-plan, guard-init, permissions). No se repitio `npm test` completo (una sola corrida, como se pidio).
- Revision final opus de `main..core/hito-8a`: NO hecha (la tarea la pide al orquestador/autor; el ejecutor serie no despacha agentes). Review Focus 1, 3, 4, 5 y 6 primero.
- Version: 0.9.0 (plan: 0.8.1 -> 0.9.0; main esta en 0.8.2; core/hito-6 usa 0.10.0: renumerar al unir).
- Unir y publicar son del autor. No se hizo push.

## Unión con main (hito 6)

`git merge main` (d0213e8) en `core/hito-8a`. Conflictos y resolución:

- `plugins/pignolo/.claude-plugin/plugin.json`: version 0.11.0.
- `CHANGELOG.md`: entradas 0.10.1 y 0.10.0 de main intactas; la de 8a renumerada de 0.9.0 a 0.11.0 arriba de ellas (la 0.9.0 de main sigue en su lugar).
- `lib/git-guard.js`: `pignolo-plan` con el texto de main (suma close-session.js y state-index.js) más `pignolo-init` de 8a.
- `hooks/handlers/protect-paths.js`: `stateRule` (hito 6) y `projectMdRule` (8a) conviven; el orden de reglas es stateRule, planAuditRule, projectMdRule, roleRule.
- `docs/specs/...-design.md`: §10.5 con el texto de main (Engram fuera, sin learning-validator) más la nota de 8a (init no migra la auto-memoria); párrafo de `setup` con el de main y la viñeta `/pignolo:init` con la de 8a.
- `docs/STATE.md` (auto-fusionado): texto de main más las notas de 8a; actualizado a 0.11.0 y a "conflictos resueltos".
- `learning-validator` sigue borrado (sin referencias en plugins).
- Caminos "degradar si no existe el hito 6": no existen en el código de 8a (init no usa proposeLearning/scanLearning/readEntries/close-session, por la decisión de no migrar la auto-memoria), así que no hubo que ajustar ni agregar tests.
- `npm test`: 2714 tests, 2712 pass, 0 fail, 2 skipped.

## Pasada de arreglos (revisión final opus, REQUEST_CHANGES: 0 críticos, 3 importantes, 9 menores; 0.11.0 -> 0.11.1)

Una sola pasada, en la rama `core/hito-8a`, sin subagentes. Los tests nuevos se escribieron primero y se corrieron en rojo contra el código de 0.11.0: **19 tests fallaban** (guard-init 2, project-md 3, init-detect 2, init-actions 1, claude-settings 4, init-cli 7), y después del arreglo todos pasan. Ningún test toca el HOME ni `CLAUDE_CONFIG_DIR` reales: usan `PIGNOLO_HOME` y `CLAUDE_CONFIG_DIR` temporales (`makeTempDir`) y repos temporales.

| Hallazgo | Arreglo | Test (rojo antes) |
|---|---|---|
| I-1 sangría del mapa y `ok: true` con resultado inválido | `mergeProjectMd` usa la sangría de la primera línea hija (sin contar comentarios); `projectMdStep` vuelve a parsear el resultado antes de escribir y, si no parsea, `refused: invalid-result` (también en preview, sin respaldo ni escritura) | `project-md.test.js` (3 y 4 espacios), `init-cli.test.js` (4 espacios de punta a punta con `verify` sin `configError`; clave `[bad` -> `invalid-result` en preview y apply) |
| I-2 regla `pignolo-init` abierta | `init(?:\.js)?` en `INIT_JS_LITERAL`, `INIT_JS_DYN` e `INIT_JS_OWN`; `EVAL_INIT_SCRIPT` niega `node -e/-p/-r` con el script (misma lógica que `namesStateScript`, devuelve `pignolo-init`); leer el script (`cat`, `grep`, `head`, `node --check`) y la lib siguen permitidos | `guard-init.test.js`: 10 formas negadas (sin `.js`, `cd` + `./init`, `$CLAUDE_PLUGIN_ROOT` y `${...}`, PowerShell, `-e`, `-p`, `-r`) y must-allow de lectura |
| I-3 compuerta que da verde sin probar | `isInstallerPlaceholder` incluye comandos triviales (`exit 0`, `true`, `:`, `echo ...`, encadenados con `&&`/`;`): `code-untested` con aviso; `scripts.test` sin runner reconocido: aviso "confirmá" y `sources.testScript` | `init-detect.test.js` (5 scripts triviales; `node check-all.js` con aviso; `mocha` y `vitest` sin aviso) |
| G31 (decisión del autor 2026-10-01) | `auto-memory-off` agrega `/.claude/settings.local.json` a `git rev-parse --git-path info/exclude` si no está versionado ni ignorado; en preview `exclude: true`, idempotente, conserva CRLF y líneas previas; versionado: no toca `.git` (`excludeSkipped: tracked`) | `claude-settings.test.js` (preview, apply, segunda corrida, ya ignorado, versionado, worktree enlazada), `init-cli.test.js` (de punta a punta), `e2e-hito-8.test.js` (`risk --diff HEAD`: `laneFloor: trivial`, `hits: []`) |
| m-1 preview vencido | `preview` devuelve `stamp` (sha del plan y del resultado por paso); `apply --expect <stamp>` -> `refused: stale-preview`, exit 1, nada escrito | `init-cli.test.js` |
| m-2 `verify` exit 0 con `ok: false` | exit 1, `kind: invalid-config` y `Alternativa:` | `init-cli.test.js` |
| m-3 `settings.local.json` normalizado a LF | conserva el EOL detectado y la falta de salto final | `claude-settings.test.js` |
| m-4 `.pignolo/.gitignore` CRLF mezclado | `ensureIgnored` agrega con el EOL del archivo | `init-actions.test.js` |
| m-5 clave declarada vacía | el valor se escribe en la misma línea (`language: es`), con CRLF si corresponde | `project-md.test.js` |
| m-6 A8-09 léxico | `projectMdRule` mira también `realpathSync.native` cuando el archivo existe | `guard-init.test.js` (alias por junction; hilo principal y otro archivo no se ven afectados) |
| m-7 patrón que casa todo | `validatePiiPattern` rechaza lo que casa tres líneas comunes (espacio, `..`, `\s`, `[a-z ]`); `\b\d{8}\b`, `@example\.com` pasan | `project-md.test.js` |
| m-8 nota con archivo versionado | la nota dice que está versionado y que el paso lo dejó modificado; la de "sin seguimiento" solo sale si `init` no pudo agregar la exclusión | `init-cli.test.js` |
| m-9 `quote()` sin escape | `refused: unquotable` (exit 0, nada escrito, el resto de los pasos corre) | `init-cli.test.js` |

Rulings:
- Un tab como sangría no vale en `yaml-lite`: el test de I-1 usa 3 y 4 espacios.
- G31 se hace solo cuando `auto-memory-off` escribe (no cuando ya estaba `autoMemoryEnabled: false`): atarlo a la escritura mantiene el paso `skipped` idempotente.
- El e2e del límite (a) sigue sin `auto-memory-off` (mira solo el `.pignolo/.gitignore` versionado); G31 tiene su propio e2e.
- La skill `init` usa `--expect <stamp>` en el apply y avisa de `stale-preview` e `invalid-config`; spec §8.3 y §15 actualizadas; gap G31 pasa a hecho.
- `PIGNOL~1` (nombre 8.3) se cubre por `realpathSync.native`; el test usa una junction porque el 8.3 puede estar apagado en el volumen.
- Versión 0.11.1 y entrada en el CHANGELOG. No se hizo push.
- `npm test` una vez al final: 2735 tests, 2733 pass, 0 fail, 2 skipped.
