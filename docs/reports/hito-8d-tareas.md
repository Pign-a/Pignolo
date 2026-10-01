# Informe hito 8d (ejecutor serie)

## Task 0 (A8D-01, defaults de test-paths)
- Commit: fix(project-config) anclar defaults. DEFAULT_TEST_PATHS = **/*.test.*, **/*.spec.*, **/*_test.*, **/test_*.py, __tests__/, __snapshots__/, __mocks__/, fixtures/, test/, tests/.
- Tests: project-config.test.js (2 nuevos + constante 7->10). Rojo: volví la constante a `*test*`/`*spec*` -> falla "docs/specs/a.md no debe contarse como test"; restaurada.
- Ruling: se pierde que `*test*` casara `foo-test.js` / `testing/` — porque anclar es el pedido; costo si me equivoco: un proyecto sin test-paths declarado con tests nombrados `x-test.js` los verá como no-test hasta que declare test-paths (el aviso de project-config ya lo dice).
- Nota para CHANGELOG (Task 12): project.md existentes con test-paths declarado no cambian.

## Task 1 (lib/places.js, project-md, project-config)
- Commit: feat(places) clave places.
- Tests: tests/places.test.js (11 tests, tabla de rechazos como subtests), +3 en project-md.test.js (places, merge, revertPlaces), Task 0 ya tocó project-config.test.js.
- Rojo: (a) quitar el `testPathsDeclared` de declaredPatternFor -> falla el caso A8D-01 (agregué un config manual con testPaths `*spec*` sin declarar, porque con los defaults anclados de la Task 0 el rojo del plan ya no discriminaba); (b) revertPlaces sin comprobar `after` -> falla la tabla; (c) merge que pisa -> fallan los dos de merge.
- Ruling: orden de chequeos de validatePlacePath: test-paths declarado antes que framework-name (el plan pide `inside-test-paths` para `tests/docs/`) — costo si me equivoco: solo cambia el `reason` de un rechazo que igual se rechaza.
- Ruling: resolvePlaces, en una colisión pierde la ruta declarada que contiene a la otra (o la posterior si son iguales); también colisiona contra defaults de tipos no declarados — costo: un aviso de más.

## Task 2 (lib/safe-move.js) RIESGOSA
- Commit: feat(safe-move). 57 tests en tests/safe-move.test.js (los casos de guardas son subtests), hashTree en tests/helpers.js (salta .git por defecto, el índice cambia con git mv).
- Rojo mostrado: lstat->stat (fallan junction a/c y el test base); walkTree que sigue enlaces (falla el test base); ignoredByOutsideRule sin mirar `source` (fallan las 4 formas); `dirty` aplicado al deshacer (falla el test A8D-02); applyMoves sin re-planificar (fallan los 3 de vista previa vieja); sin `dest-exists` y sin `dirty` (fallan los subtests).
- No probado en rojo: write-ahead (el test lee el registro desde dentro del `run` al ver `mv`), batch-conflict, plan-open.
- Ruling: `plan-open` lee solo `spec` y `planFile` del plan.json (plan-state NO guarda planFile hoy: solo `spec`) — costo si me equivoco: un plan abierto cuyo archivo de plan esté en la carpeta a mover no frena.
- Ruling: `run-active` solo frena si run.json tiene una tarea con worktree == main cuyo archivo cae en el origen, o si run.json es ilegible (falla cerrada); una corrida activa sin relación con el origen NO frena — porque frenar toda corrida activa bloquearía init durante cualquier flujo; costo si me equivoco: mover una carpeta que usa una corrida en otro worktree (que conserva su layout igual).
- Ruling: sin tests de archivo bloqueado real (Node abre con share-all en Windows): t.skip con razón; el fallo de `mv` se simula con `run` inyectado (exit 128).
- Ruling: el índice de git se mira por case-collision solo en el primer componente y en la ruta entera (el disco se mira en todos): menos llamadas a git; costo: una colisión solo en un componente intermedio del índice y no en el disco pasa.
- Ruling: los temporales de escritura atómica quedan si el rename falla (el módulo no borra); costo: un `.tmp-*` suelto en caso raro.
- Doubt: 125 s para el archivo de tests (~10 git por ítem, máquina cargada); si molesta, bajar llamadas por ítem.

## Task 3 (lib/ref-scan.js) RIESGOSA
- Commit: feat(ref-scan). 14 tests en tests/ref-scan.test.js. safe-move exporta writeAtomic.
- Rojo: sin resolución markdown (fallan 6); offsets en caracteres y no en bytes (falla el de BOM); sin chequeo de enlaces (falla junction); listado sin -z (fallan 6); sin dirty-file (falla dirty).
- Ruling: la tabla del plan `relativeLink('docs/a','docs/b/c.md') -> 'b/c.md'` es incorrecta (desde la carpeta docs/a el relativo es `../b/c.md`); el test fija `../b/c.md` — costo si me equivoco: ninguno de comportamiento, solo el literal del test.
- Ruling: archivo "con cambios sin guardar" = `git status --untracked-files=no` (un archivo SIN versionar sí se reescribe, con respaldo): el plan pide leer/reescribir `docs/ñandú sin versionar.md` — costo: un archivo nuevo sin versionar se edita (queda respaldado en PIGNOLO_HOME).
- Ruling: binarios por extensión conocida no se abren (el test "no se abrió ningún binario" lo exige; detectar NUL obliga a abrir); un binario con extensión desconocida sí se abre 8 KB y se clasifica `binary`.
- Ruling: applyRewrites valida enlaces y hashes de TODOS los archivos antes de escribir el primero (refused 'file-changed' sin escrituras) — más estricto que el plan (por archivo); costo: ninguno.
- Ruling: una mención en un bloque de código de un .md es `markdown-text` (aviso, no frena).

## Task 4 (lib/places-detect.js, init.js detect)
- Commit: feat(places) detección. 11 tests en tests/places-detect.test.js + 1 en tests/init-cli.test.js.
- Rojo: misplaced sin exigir `declared` (falla A8D-20); sin isLinkOrOutside (falla junction); un readFileSync en detect (fallan 3, incl. "no abre documentos").
- Ruling: se agregan `doc/plans/` y `doc/research/` a las candidatas (R-15 listaba `doc/specs/` pero no `doc/plans/`, y el test de la tarjeta y la Task 3 usan `doc/plans/`) — costo si me equivoco: init ofrece adoptar o mover una carpeta `doc/plans` que el autor no quería tocar.
- Ruling: `existing` = hay commits O hay algo fuera de `.git/` y `.pignolo/`; el "repo sin candidatas: existing false" de la tarjeta solo vale sin commits ni archivos.
- Ruling: la ruta de una candidata es la del nombre real en el disco (readdir), no la del catálogo.

## Task 5 (lib/init-skeleton.js, templates/places/*.md)
- Commit: feat(init) esqueleto. 12 tests en tests/init-skeleton.test.js (20 con subtests).
- Rojo: sin los chequeos de enlace (fallan junction docs y local); `wx`->`w` (falla la carrera del README); `:(icase,literal)`->`:(literal)` (falla Local/x.txt); sin check-ignore en adopción (falla `private/` ignorada).
- Ruling: lo versionado de `private` se mira con `:(icase,literal)` y ANTES del chequeo de mayúsculas del disco, así `Local/x` versionado da `tracked-files` en Windows y en Linux — costo: en Windows un `Local/` sin versionados da case-collision y con versionados tracked-files.
- Ruling: `applySkeleton` recibe `places` como el mapa `resolvePlaces(...).places`; para `reference` usa la ruta declarada o RECOMMENDED_REFERENCE solo con answers.public === false (la Task 8 debe declararla en proyect.md en ese caso).
- Ruling: una `local/` existente ya ignorada por una regla (check-ignore) no recibe `.gitignore` propio (`ignored-already`) — igual que la adopción de private; el plan decía escribir `.gitignore` siempre en local/ sin .gitignore; costo: si el humano quita la regla de la raíz, local/ queda visible.

## Task 6 (lib/init-adapt.js) RIESGOSA
- Commit: feat(init) adaptar. 15 tests en tests/init-adapt.test.js (34 con subtests).
- Rojo: applyAdaptation que escribe project.md (fallan 3); force que pasa la guarda dura (fallan 5+ subcasos); sin validar tool-owned (falla bad-answer); stamp sin HEAD (falla "commit nuevo").
- Ruling (D-8d-2): `force` solo viene de `answers.places.<tipo>.force === true`, nunca se asume; nunca pasa una guarda dura (todas las de planMoves) — costo si me equivoco: ninguno de datos.
- Ruling: candidatas sin respuesta (carpeta existente fuera del lugar) van a leftKinds con una nota: no se crea la carpeta por defecto al lado en silencio — el plan solo lo decía para `leave`; costo: el humano debe contestar cada ítem.
- Ruling: `adopt` y `move` efectivos siempre quedan en `places` (también si el destino es el default) para que el mapa quede explícito; un `adopt` cuya ruta no valida o cuya mudanza se frenó por guarda (`refused`) NO entra en places y va a leftKinds.
- Ruling: writeAtomic de safe-move ahora quita su temporal PROPIO (unlinkSync de un archivo recién creado con wx) si el rename falla — excepción a "ningún unlink" porque el test del plan pide que tras un fallo a medias el undo deje el árbol idéntico y un `.tmp-*` suelto lo rompe; costo: ninguno de datos de usuario.
- Doubt: una mudanza con `force` y referencias manuales: `fixByHand` lista las referencias; el CLI/skill (Task 8/10) debe mostrarlas.

## Task 7 (scripts/places.js) RIESGOSA
- Commit: feat(places) script. 7 tests en tests/places-cli.test.js (CLI por spawn y `main` en proceso con `run` inyectado).
- Rojo: where sin isLinkOrOutside; fix apply sin exigir --expect; fix apply sin la regla de strays (fallan los tests respectivos).
- Ruling: `fix apply` aplica solo ítems `ok` sin referencias manuales (no hay `force` en fix: D-8d-2 lo deja solo como elección por ítem en init, nunca por defecto ni desde un subagente) — costo: un spec mal ubicado con una referencia de código no se mueve con fix; se mueve a mano.
- Ruling: un `approved` que no está en la vista previa ni es stray ni no-documento es exit 2; un stray o un no-documento aprobado se devuelve `refused` y los demás siguen (la tarjeta lo pide así).
- Ruling: `report` con project.md inválido sigue saliendo 0 (usa el mapa por defecto y agrega un warning), porque "siempre 0 con el repo legible".

## Task 8 (scripts/init.js: adapt, skeleton, --expect, verify)
- Commit: feat(init) pasos adapt y skeleton. 9 tests nuevos en tests/init-cli.test.js (prefijo "8d:"); el trabajo a medio hacer del ejecutor anterior (idempotencia `already-in-place`, `finalPlaces`, `placesVerify`, `readPlan`) se revisó y se conservó.
- Rojo mostrado: sin la exigencia de `--expect` (falla "preview no escribe..."); sin saltar los pasos tras un `adapt` fallido (falla "movimiento a medias"); `willExist` vacío en dry (falla "preview y apply listan los mismos ítems"); project-md sin el mapa final (falla "proyecto nuevo").
- Ruling: una respuesta que deja de ser válida entre preview y apply (p. ej. un `.js` creado dentro de la carpeta a mover) era un `bad-answer` exit 2 al recalcular el stamp; ahora el recálculo de `--expect` lo trata como `stale-preview` exit 1, como pide la tarjeta. Costo si me equivoco: un error real de respuesta se ve como "vista previa vieja" y el humano repite el preview, donde sí aparece el error.
- Ruling: tras un segundo `apply` idéntico, `adapt` reporta `nothing-to-adapt` (no quedan candidatas fuera de lugar) y no `already-in-place`; ambos son `skipped` y la tarjeta aceptaba los dos.
- Ruling: con un mapa declarado distinto (`places.spec: otro/specs/`), `project-md` conserva la línea y completa solo las claves que faltan; el test lo fija.
- Doubt: el stamp de `apply --expect` recorre todo `runSteps` en dry (git lento en Windows); 7 a 17 s por test del archivo.

## Task 9 (guardia)
- Commit: feat(guard) places.js. Los cuatro patrones pasan de `init` a `(?:init|places)` (con y sin `.js`, variable de plugin, `node -e`) y el mensaje del deny nombra ambos scripts; 3 tests en tests/guard-init.test.js, 6 entradas de lectura en tests/guard/must-allow.json y el límite declarado G35 en docs/gaps.md.
- Rojo: con git-guard.js de HEAD falla "a subagent cannot run places.js".
- Ruling: nombres parecidos (`places-detect.js`, `my-places.js`) no casan; un test lo fija.

## Task 10 (textos)
- Commit: docs(init) layout y esqueleto. Skill init de 12 a 14 pasos (Layout y Skeleton entre Paths y Sensitive data); plan (pasos 1 y 5) lee `places.js where`; status y close-session usan `places.js report`; README con "Dónde va cada archivo". 4 tests nuevos en tests/skill-init.test.js y el de pasos actualizado a 14.
- Rojo: restaurar `docs/plans/` en la skill plan y quitar `places.js` de status.
- Ruling: la oferta de `fix preview` en close-session queda como continuación del paso 5 y no como paso nuevo, para no renumerar el commit del estado.

## Task 11 (e2e y checklist manual)
- Commit: test(hito-8d) e2e. 5 recorridos en tests/e2e-hito-8d.test.js por los scripts reales (init, places, gate) y tests/manual/hito-8d.md (12 puntos).
- Hallazgo: `places.js report` avisaba como suelto el `.gitattributes` y el `SECURITY.md` recién escritos por init (línea de status justo tras init); ahora se ignoran. Rojo: el e2e de proyecto nuevo (`lines` 1 !== 0) y un test nuevo de findStray sin el filtro.
- Ruling: un junction como candidata no aparece en la detección (la Task 4 lo salta en silencio), así que ahí no hay `refused: link-in-path`; el e2e fija lo que importa: el junction queda intacto, afuera no cambia y nada de afuera entra al destino. Con `docs/` como junction, `skeleton` sí informa `link-in-path`.
- Ruling: la "compuerta que falla" del e2e de undo se simula rompiendo `check.js` (gate.js real, exit distinto de 0) y restaurándolo antes del undo.

## Task 12 (cierre)
- Versión 0.13.0 (main seguía en 0.12.1), CHANGELOG con límites A a H, STATE.md, gaps G35 a G37 y spec §3.2, §8.3, §10.1, §14 y §18 editados como "Hito 8d (técnico)". Unión con `main` limpia (solo pignolo-ui y docs de benchmarks).
- Pendiente del autor: revisión final opus de `main..core/hito-8d` (datos primero), unir y publicar. Dudas para esa revisión: G37 (anclar defaults de test-paths), la oferta de close-session sin paso propio y el costo en tiempo del stamp recalculado en `apply --expect`.
