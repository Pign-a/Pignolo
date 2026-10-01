# Hito 8d del núcleo: estructura de carpetas del proyecto. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie (CLAUDE.md, A/B del 2026-09-30), sin revisión por tarea, una revisión final opus con una pasada de arreglos. Casillas `- [ ]`. Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Lo que no se midió está marcado "a verificar" y tiene una tarea dueña. Cada tarea corre solo sus archivos con `node --test --test-reporter=dot <archivo>`; la suite completa corre una vez por ola cerrada y una vez al cierre.

**Este hito es RIESGOSO.** Por primera vez pignolo **mueve archivos del proyecto de otra persona** y **reescribe referencias** en sus archivos. Las Tasks 2, 3, 6 y 7 (marcadas RIESGOSA) piden la **auditoría previa en dos pasos** antes de ejecutarlas (como D-8-6 del hito 8). El resto se cubre con la revisión final.

**Objetivo.** Que cada proyecto tenga un lugar conocido para el material que no es código (specs, planes, investigaciones, referencias del cliente, diseño, privado) y que pignolo sepa dónde va cada cosa sin una ruta fija en sus skills. `/pignolo:init` (a) crea el esqueleto siempre, (b) en un proyecto existente **valida lo que hay y propone adaptarlo** (adoptar tal cual, mover con vista previa, o dejar) con movimientos que no rompen nada y se pueden deshacer, y (c) guarda el **mapa** `places:` en `.pignolo/project.md`. Un script contesta "¿dónde va esto?" y lista lo suelto y lo mal ubicado; avisa y ofrece mover, nunca bloquea.

**Stack:** Node ≥ 22 sin dependencias npm, `node:test`, git ≥ 2.31. **Spec:** `docs/specs/2026-09-26-pignolo-v1-design.md` §3.2 (`project.md`), §8.3 (guardia), §10.1 (`.pignolo/`), §14 (`/pignolo:init`). **Investigación (base de este plan):** `docs/research/2026-10-01-estructura-de-carpetas.md` (variables, fuentes, alternativas A a D, tabla de ataques y fallas de cada una). **Plan modelo y base de código:** `docs/plans/2026-10-01-hito-8-init-y-adopcion.md` (8a, ya en `main`: `lib/init-detect.js`, `lib/init-actions.js`, `scripts/init.js` con `detect|preview|apply|verify`, respaldos en `PIGNOLO_HOME/init-backup/`, `--expect <stamp>`).

**Dónde entra (decisión del autor, 2026-10-01):** hito 8d aparte y corto, **después del hito 7a**. Depende de 8a (en `main`), no de los hitos 6 ni 7. Sin A/B antes de construir.

## Decisiones del autor ya tomadas (2026-10-01, marcadas DECIDIDA)

- **D-FS-A: esqueleto SIEMPRE (DECIDIDA).** En proyecto nuevo y en existente, **solo para lo que no es código** (el framework manda en el código): `docs/specs/`, `docs/plans/`, `docs/research/`, `docs/references/` (material del cliente que se versiona; solo si el repo es privado: `init` pregunta si es público), `design/` (pignolo-ui), `local/` (privada, ignorada por su propio `.gitignore` con `*`; en equipo `init` muestra la línea para el `.gitignore` compartido y la agrega el humano) y `.pignolo/`. Cada carpeta creada lleva un README corto que dice qué va ahí (reemplaza al `.gitkeep`). Nombres en inglés por defecto.
- **D-FS-B: en un proyecto existente, `init` primero VALIDA y propone ADAPTAR (DECIDIDA).** El usuario elige por ítem entre: **adoptar** la carpeta existente como ese lugar (se anota en el mapa, no se mueve), **mover/renombrar** al lugar recomendado, o **dejarlo**. Un movimiento no rompe nada: vista previa con la lista exacta, `git mv` si está versionado (renombre simple si no), nunca pisa, nunca cruza un junction o symlink (`realpath`), se niega con el índice sucio en esas rutas, deja registro para **deshacer**, y **antes de mover** busca en el repo referencias a la ruta vieja (enlaces markdown, imports, configuración, CI, `.gitignore`, scripts de `package.json`) y las muestra: las que se pueden reescribir sin riesgo (enlaces relativos de markdown y el propio mapa) se reescriben en el mismo paso; **todo lo demás se lista y ese ítem queda por defecto en "adoptar en el lugar"** salvo que el usuario insista. **Nunca se mueven archivos de código.** Tras aplicar corre la compuerta o el comando de test que el proyecto declare; si falla, ofrece deshacer.
- **D-FS-C: el mapa (DECIDIDA).** Sección `places:` de `.pignolo/project.md` (tipo → carpeta) es la fuente de verdad. Un script contesta "¿dónde va esto?" y lista lo suelto (sin versionar y sin ignorar en la raíz) y los archivos de un tipo conocido fuera de su lugar. **Mal ubicados: avisa Y ofrece mover** con la misma maquinaria segura y el sí del usuario (informe en `/pignolo:status` y en `close-session`; nunca bloquea).
- **D-FS-D: la skill `plan` lee el mapa (DECIDIDA)** en vez de `docs/specs` y `docs/plans` fijos (cambio de contrato; los valores de hoy son los defaults).
- **D-FS-E: a los agentes se les dice el lugar por la tarjeta de tarea o el brief (una ruta), no con un árbol (DECIDIDA).**
- **Sin A/B antes de construir (DECIDIDA).**

## Global Constraints

- Node ≥ 22, sin dependencias npm. `npm test` para la suite completa, nunca `node --test tests/`.
- Nombres de elementos en inglés; texto interno de skills y agentes en inglés; mensajes al humano, commits y docs en español. Conventional Commits con `git commit -F <archivo>`; archivos LF sin BOM; nada de texto largo por comillas de la shell (regla 6 de `rules/core.md`).
- **Nada se borra, nada se pisa, nada se mueve sin vista previa y sin el sí.** Ningún código de este hito llama a `rm`, `unlink`, `rmSync` (salvo temporales de tests con `makeTempDir()`), `git reset`, `git checkout <ref> -- <ruta>`, `git clean`, `stash`, `commit`, `add` ni `push`. **Único movimiento permitido:** `git mv` o `fs.renameSync` dentro de `lib/safe-move.js`, y solo a un destino que **no existe**. Un test lee el registro de `run` de un flujo completo (después de afirmar que **no está vacío**) y afirma que los verbos de git usados están en la lista cerrada `status`, `ls-files`, `rev-parse`, `mv`, `worktree`, `check-ignore`, `config`, `diff`.
- **Todo archivo cuyo contenido cambie se respalda antes, fuera del árbol** (`backupFile` de `lib/init-actions.js`: `<PIGNOLO_HOME>/init-backup/<sha12 de la ruta del principal>/<ts>/<ruta relativa>`; nunca junto al original).
- **Todo movimiento deja un registro que permite deshacerlo, escrito ANTES del primer movimiento** (write-ahead): `<PIGNOLO_HOME>/init-backup/<sha12>/<ts>/moves.json`. Si un movimiento falla a la mitad, se revierten los ya hechos; si la reversión también falla, exit 3 con el registro en disco y la lista de lo que quedó.
- Scripts nuevos: salida JSON por stdout; exit 0 ok, 1 fallo con `kind` estructurado (`{ ok, refused?: '<motivo>', reason, ... }`), 2 uso incorrecto, **3 = no se pudo dejar el estado consistente**; cada fallo con `Alternativa:` en stderr. `places.js where` y `report` salen siempre 0 con el repo legible.
- Escrituras atómicas (temp + rename), LF sin BOM. Temporales solo con `makeTempDir()`/`makeRepo()` de `tests/helpers.js`; todo test usa `PIGNOLO_HOME` temporal.
- Todo git entra por un ejecutor inyectable (`opts.run`) y todo test que afirme "no se llamó a X" afirma antes que el registro no está vacío.
- **Raíz de trabajo = checkout principal** (`mainRoot(cwd)` de `lib/disabled.js`, R-2 del hito 8). Fuera de un repo: `refused: 'not-a-repo'`.
- **Windows primero** (la máquina del autor): `lstat` ve los junctions como enlaces; la comparación de rutas es insensible a mayúsculas; nombres reservados (`CON`, `NUL`, `AUX`, `PRN`, `COM1..9`, `LPT1..9`), rutas ≥ 260 caracteres y nombres con punto o espacio final se rechazan. Los tests de junction crean un junction real con `fs.symlinkSync(dest, link, 'junction')` y se saltan (`t.skip`, con la razón) solo si el sistema no permite crearlo.
- El repo es público: fixtures sintéticos; nada de datos del proyecto del autor.
- Claves nuevas **aditivas**: un `project.md` sin `places` se lee igual y las skills usan los defaults y lo dicen.
- Versión: la siguiente a la última publicada (hoy 0.11.1; ajustar al ejecutar según lo que salga antes, 7a y 8b) y entrada en el CHANGELOG (CLAUDE.md). **Unir y publicar son del autor.**

## Review Focus (la seguridad de los datos primero)

1. **Un movimiento pierde o pisa datos.** Destino que existe, destino dentro del origen, origen que es un enlace o contiene uno, dos movimientos que chocan, un movimiento a medias. Dueñas: **Tasks 2 y 6**. Revisar primero: `lib/safe-move.js` (`planMoves`, `applyMoves`, `undoMoves`) y su registro write-ahead.
2. **Un movimiento sale del proyecto por un junction o symlink** (la lección de pignolo-ui 0.6.1, C-1: una poda borraba carpetas de otro lugar porque `.pignolo-ui/runs` era un junction). Cada componente de la ruta de origen y de destino y cada archivo dentro del árbol movido se mira con `lstat` y con `realpath` contra `realpath(main)`. Dueña: **Task 2**; test con junction real en Windows.
3. **Una reescritura de referencias rompe algo que andaba.** Solo se reescribe lo que se prueba seguro (enlaces relativos de markdown que resuelven a lo movido; el mapa); todo lo demás se lista y frena el movimiento por defecto. Se rebasan también los enlaces relativos **de los archivos movidos hacia afuera** (cambió su profundidad). Dueña: **Task 3**.
4. **Un movimiento mueve código o rompe el proyecto.** Se rechaza si el árbol contiene archivos de código, coincide con `test-paths` o `high-risk-paths`, o es un nombre reservado de framework. Tras aplicar corre la compuerta declarada; si falla, el undo está a un comando. Dueñas: **Tasks 2, 6 y 7**.
5. **El deshacer pisa trabajo posterior.** `undo` se niega si un archivo reescrito cambió desde el registro (hash) o si el origen volvió a existir. Dueña: **Task 2** (`undoMoves`).
6. **El plan aprobado no es lo que corre** (preview viejo). `apply --expect <stamp>` se niega con `stale-preview` si cambiaron el plan, `HEAD`, el estado de las rutas o el contenido de los archivos a reescribir. Dueñas: **Tasks 6 y 7**.
7. **`local/` expone material privado.** Se niega si `local/` ya tiene archivos versionados; en equipo la línea para el `.gitignore` compartido la agrega el humano; el material privado dejado fuera de `local/` es un hueco declarado (el reporte lo marca alto si es `.env*`). Dueña: **Task 5**.
8. **Un subagente usa `fix` o `undo` para mover archivos.** Solo el hilo principal. Dueña: **Task 9**.

## Rulings del plan (técnicos, registrados)

- **R-1: seis tipos cerrados, en inglés.** `spec`, `plan`, `research`, `reference`, `design`, `private`. Defaults: `docs/specs/`, `docs/plans/`, `docs/research/`, `docs/references/`, `design/`, `local/`. No entran: el código y los tests (los decide el framework; ya están en `test-paths` y `visible-paths`), `scripts/` (es código), las decisiones (viven en `.pignolo/state/decisions/`; no se duplica un `docs/decisions/`) y `.pignolo/`, que es siempre `.pignolo/` y no está en el mapa. Un tipo desconocido en `places` se ignora con aviso (como cualquier clave desconocida de `project-config`).
- **R-2: el mapa es `places:` en `project.md`, mapa de un nivel de `yaml-lite`** (tipo → ruta escalar con `/` y barra final), como `gates`. Se agrega la entrada `['places', 'places', 'map']` a `KEYS` de `lib/project-md.js` y `places` a `KNOWN` de `lib/project-config.js`. Las rutas de ejemplo con `docs/` caben sin comillas en `yaml-lite`. La fusión (R-4 del hito 8) **no cambia un valor ya declarado**: si `places.spec` ya existe con otro valor y `init` propone otro, va a `conflicts`.
- **R-3: validación de una ruta del mapa (`validatePlacePath`).** Relativa; separador `/` (un `\` se rechaza); sin `..`, sin `.` como segmento, sin segmentos vacíos, sin letra de unidad (`C:`), sin raíz; ≤ 100 caracteres; cada segmento sin nombre reservado de Windows, sin punto ni espacio final, sin caracteres `<>:"|?*`; **no** dentro de `.pignolo/`, `.git/`, `.claude/` ni `node_modules/`; **no** igual ni dentro de un nombre que reserva un framework (`src`, `app`, `pages`, `public`, `lib`, `test`, `tests`, `cmd`, `internal`, `packages`, `apps`, `bin`, `build`, `dist`) ni de un valor de `test-paths`/`high-risk-paths`; normaliza con una barra final. Dos tipos con la misma ruta (sin distinguir mayúsculas) o uno dentro del otro se rechazan (`docs/specs/` y `docs/specs/old/` no; `docs/` como `spec` y `docs/plans/` como `plan` tampoco: el primero contendría al segundo). El valor inválido de un tipo se descarta con aviso y se usa el default.
- **R-4: el lugar de un tipo.** `resolvePlaces(config)` devuelve para cada tipo `{ kind, path, source: 'declared'|'default' }`. Quitar un tipo del mapa lo deja en `default` y las skills lo dicen. `reference` por defecto **no se declara** cuando el humano dijo que el repo es público (entonces `source: 'undeclared'`, `path: null`, y `where reference` sale con `declared: false` y aviso).
- **R-5: el esqueleto crea lo que no existe, nunca lo que ya hay.** Por tipo declarado (o adoptado) cuya carpeta no existe: la crea con un `README.md` corto (plantilla `templates/places/<kind>.md`, texto en el idioma de `project.md#language`, inglés si falta). Si la carpeta existe: no escribe nada (ni README: es del humano). Sin `.gitkeep`. Una carpeta cuyo nombre solo difiere en mayúsculas de otra existente (`Docs/` y `docs/`) se rechaza (`case-collision`): en Windows son la misma. `design/` se crea con su README **pero `design/approved/` es de pignolo-ui y no se crea**.
- **R-6: `local/` (el tipo `private`).** Contenido mínimo: `local/.gitignore` con exactamente `*\n` (se ignora a sí mismo, así que nunca aparece en `git status` ni viaja con el repo: por clon, falla declarada de la investigación §4) y `local/README.md` (también ignorado; ayuda al humano de ese clon). Si `local/` **ya tiene archivos versionados** (`git ls-files -- local/` no vacío) → `refused: 'tracked-files'` con la lista: un `.gitignore` nuevo no los saca de git y nunca se destrackea nada. Si `local/.gitignore` existe con otro contenido → no se pisa (`refused: 'gitignore-exists'`) y se muestra. En equipo, `init` muestra la línea `/local/` para el `.gitignore` compartido y **no la agrega**.
- **R-7: movimiento = una operación atómica por ítem, con orden y reversión.** `planMoves` valida todo antes de tocar nada y devuelve la lista exacta; `applyMoves` escribe el registro, mueve en orden y, si uno falla, revierte los hechos. Ítems: `{ kind: 'dir'|'file', from, to }` (rutas relativas a `main`, con `/`). Un directorio se mueve **entero** (incluye lo ignorado y lo sin versionar que contenga). `tracked` = `git ls-files -- from` no vacío: `git mv from to`; si no, `fs.renameSync`. Crea los directorios padre del destino que falten (solo dentro de `main`, comprobando `realpath` del primer ancestro existente). Renombrar solo cambiando mayúsculas (`Docs` → `docs`): `refused: 'case-only'` (en Windows el `git mv` falla a medias); la skill ofrece adoptar.
- **R-8: guardas de un movimiento (`planMoves`, todas por ítem; cualquiera da `refused` con su `reason`).**
  1. `not-found`: el origen no existe. 2. `dest-exists`: el destino existe (sea archivo, carpeta o vacía): nunca se pisa ni se mezcla. 3. `dest-inside-source` / `source-inside-dest`. 4. `outside-project`: `realpath` del origen o del primer ancestro existente del destino no está dentro de `realpath(main)`. 5. `link-in-path`: algún componente de la ruta de origen o de destino (desde `main`) es symlink o junction (`lstat().isSymbolicLink()`), **o** hay un symlink/junction en cualquier parte del árbol que se mueve (recorrido con `lstat`, sin seguir enlaces). 6. `dirty`: `git status --porcelain --untracked-files=no -- <from> <to>` no vacío (índice o árbol modificados en esas rutas; lo sin versionar no cuenta: se mueve con la carpeta). 7. `contains-code`: el árbol contiene archivos con extensión de código (lista cerrada `CODE_EXT`: `js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp cs php dart vue svelte sh ps1 bat cmd sql`), o el origen coincide con `test-paths`, `high-risk-paths`, `contracts` o `serial-paths` de `project.md`. 8. `reserved-source`: el origen es `.git`, `.pignolo`, `.claude`, `node_modules`, `.github` o una carpeta de la lista de R-3. 9. `merge-in-progress`: hay merge, rebase, cherry-pick o bisect en curso (`MERGE_HEAD`, `rebase-merge`, `rebase-apply`, `CHERRY_PICK_HEAD`, `BISECT_LOG` en el gitdir). 10. `long-path`: algún destino resultante ≥ 240 caracteres. 11. `batch-conflict`: dos ítems con el mismo destino (sin distinguir mayúsculas) o uno dentro del origen de otro.
  Otros worktrees (`git worktree list`) no se mueven: la skill avisa que conservan el layout viejo hasta que integren.
- **R-9: referencias (`scanReferences`), qué se busca y dónde.** Archivos a mirar: `git ls-files -co --exclude-standard` (versionados y sin versionar no ignorados) más `.gitignore`, `.github/**`, `.gitlab-ci.yml`, `package.json`, **excluyendo** los binarios (byte NUL en los primeros 8 KB), los de > 1 MB y todo lo que esté dentro de `.pignolo/state/` (historia propia de pignolo, no se reescribe). Para cada ruta vieja `from` se buscan ocurrencias como segmento completo: la ruta con `/`, con `\`, con `./` delante y sin barra final, delimitada por inicio, comillas, espacio, `(`, `[`, `=`, `:` o `/` antes y por `/`, comillas, `)`, `#`, espacio o fin después. **Clases:** `markdown-link` (en `.md`/`.mdx`, dentro de `](...)` o de una definición `[x]: ...`, destino relativo que resuelve, desde el directorio del archivo, a algo dentro de lo movido) → **reescribible**; `places-map` (la propia entrada de `project.md`) → **reescribible**; `markdown-text` (mención en prosa, no enlace), `code` (imports, `require`, rutas en archivos de código), `config`, `ci`, `gitignore`, `package-json` y `other` → **manual**. Además, **enlaces relativos que salen de lo movido**: cada archivo `.md` dentro del árbol movido con un enlace relativo cuyo destino resuelve a algo **fuera** del árbol se reescribe (se recalcula el relativo desde la ubicación nueva) → reescribible. Enlaces con destino que no existe se dejan como están. Enlaces con ancla (`#x`) y consulta conservan su sufijo.
- **R-10: cuándo se reescribe y cuándo no.** Solo se reescribe un archivo **limpio** (`git status --porcelain -- <archivo>` vacío); un archivo con cambios sin guardar pasa a **manual** (`reason: 'dirty-file'`). Todo archivo reescrito se respalda antes (`backupFile`), se escribe atómico conservando el final de línea y el BOM del original, y su hash posterior va al registro (`rewrites[].sha256After`). Una reescritura que no cambia ningún byte no se cuenta. **Una referencia manual frena el movimiento de ese ítem**: queda `decision: 'adopt'` por defecto con `blockedBy: [<referencias>]`; solo se mueve si el plan trae `force: true` para ese ítem (el usuario insiste); aun así las manuales quedan listadas en el informe como "arreglar a mano" y `verify` las vuelve a buscar.
- **R-11: la compuerta después de mover.** Si `project.md` declara `gates.on-done` (o, si no, `gates.pre-merge`), `apply` ofrece correrla **con el sí del humano en el mismo paso** (`answers.runGate: true`; es un comando del proyecto que él declaró y confirmó en 8a, a diferencia de los que `detect` propone y solo muestra). Se corre con la función de `lib/gate.js` que ejecuta una compuerta declarada (nombre exacto a leer al ejecutar la Task 6). El resultado va al informe (`gate: { ran, exitCode, command }`); un fallo da `ok: false, kind: 'gate-failed'` **sin deshacer solo**: la skill ofrece `places.js undo` y espera el sí. Sin compuerta declarada: `gate: { ran: false, reason: 'not-declared' }` y se dice que las referencias manuales son el único chequeo.
- **R-12: registro y deshacer (`moves.json`).** `{ v: 1, ts, main, head, items: [{ kind, from, to, tracked, status: 'pending'|'done'|'reverted' }], rewrites: [{ file, backup, sha256After }], mapChange: { kind, before, after }|null, gate: object|null }`. Se escribe antes del primer movimiento (write-ahead) y se actualiza por ítem. `undoMoves({ record })` revierte en orden inverso con las mismas guardas (R-8 con los roles invertidos), restaura cada archivo reescrito **solo si su hash actual es `sha256After`** (si cambió: `refused: 'modified-since'`, se detiene **antes de mover nada** y lista los archivos), revierte `mapChange` en `project.md` (por el mismo mecanismo de restauración con respaldo) y marca el registro `undone`. Los registros no se podan automáticamente.
- **R-13: el mapa se escribe junto con el movimiento, y solo el de los ítems de este paso.** Adoptar o mover un tipo escribe `places.<tipo>` en `project.md` con la ruta final, en el mismo paso `adapt`; **si `places.<tipo>` ya está declarado distinto → el ítem va a `conflicts` y no se mueve ni se adopta** (nunca se cambia un valor declarado: R-4 del hito 8). Si `project.md` aún no existe, el paso `project-md` (que corre después) lo crea con `places` incluido.
- **R-14: "dejar" no escribe nada.** Un tipo dejado queda sin declarar y las skills usan el default; el informe de `places.js report` lo muestra como `undeclared` con el aviso. No se vuelve a preguntar en la misma corrida; sí en la siguiente `init` (la fusión es idempotente).
- **R-15: detección de lo que ya hay (`detectPlaces`).** Candidatas por tipo, solo carpetas que existen y **no** contienen código (R-8.7): `spec` ← `docs/specs/`, `doc/specs/`, `specs/`, `docs/superpowers/specs/`, `openspec/specs/`, `docs/design/`; `plan` ← `docs/plans/`, `plans/`, `docs/superpowers/plans/`, `openspec/changes/`; `research` ← `docs/research/`, `research/`, `docs/audits/`, `docs/notes/`; `reference` ← `docs/references/`, `references/`, `docs/client/`, `client/`, `briefs/`; `design` ← `design/`, `designs/`, `docs/design/` (**solo adopción en el lugar o creación**: R de D-8d-1); `private` ← `local/`, `private/`, `.private/`. Más las carpetas de documentación generales (`doc/`, `docs/`, `documentation/`) como **contexto** (para sugerir un padre), no como candidatas. Cada candidata: `{ kind, path, files: n, trackedFiles: n, why }`; dos o más para el mismo tipo → `ambiguous: true` y se pregunta; ninguna → se propone el default y se dice que se crea. **Hallazgos adicionales:** carpetas con material no-código que no calzan con ningún tipo (se listan en `unmapped`, sin proponer nada), y `case-collisions` (dos rutas que solo difieren en mayúsculas).
- **R-16: lo suelto y lo mal ubicado (`classifyFile` y `report`).** `stray` = archivos de la **raíz** sin versionar y sin ignorar (`git ls-files -o --exclude-standard` con profundidad 0), con `severity: 'high'` si coincide con `.env*`, `*.pem`, `*.key`, `*.p12`, `id_rsa*` (se sugiere `private`) y `'info'` si no (`Makefile` o `vercel.json` sin versionar son un aviso, no un error: el informe lo dice). `misplaced` = archivos **versionados o no** fuera del lugar de su tipo, clasificados **solo por nombre** con una tabla cerrada y conservadora (`NAME_RULES`): `spec` ← `^\d{4}-\d{2}-\d{2}-.+-design\.md$`; `plan` ← `^\d{4}-\d{2}-\d{2}-.+-plan\.md$` y los que cuelgan de `plan` en `.pignolo/state/plans/` con `planFile` (a verificar al ejecutar la Task 4 contra `lib/plan-state.js`); `research` ← `^\d{4}-\d{2}-\d{2}-.+\.md$` dentro de una carpeta cuyo nombre sea `audits`, `research` o `notes`. No se clasifica por contenido. Se ignoran `.git/`, `.pignolo/`, `node_modules/`, el lugar de cada tipo y las rutas de `visible-paths`/`test-paths`. Cada hallazgo trae `suggest: { from, to } | null` con el destino exacto `<lugar del tipo>/<nombre>`; si el destino existe: `suggest: null, reason: 'dest-exists'`. `report` también lista `missing` (tipo declarado cuya carpeta no existe) y `case-collisions`. Sale siempre 0.
- **R-17: el informe en `/pignolo:status` y `close-session` es una línea, y solo si hay algo.** `report.summary` es `""` si no hay nada que avisar (no entra al contexto caliente). Con algo: `"<n> archivos sueltos o mal ubicados: corré \`places.js report\` para verlos y moverlos"`. En `close-session` la skill, tras el informe, ofrece mover con `places.js fix` y el sí del humano; **nunca bloquea el cierre**.
- **R-18: `fix` mueve los mal ubicados con la misma maquinaria.** `places.js fix preview` produce el plan (lista exacta, referencias, `stamp`); `places.js fix apply --moves <archivo> --expect <stamp>` mueve **solo los ítems que el humano aprobó** (`{ v: 1, approved: [<from>...] }` escrito con Write). Mismas guardas (R-8), referencias (R-9, R-10) y registro (R-12). Un archivo de código o dentro de `test-paths` no se ofrece nunca.
- **R-19: la guardia.** La familia `pignolo-init` se extiende (modelo: `pignolo-plan` y R-22 del hito 8): los subcomandos que escriben (`places.js fix apply`, `places.js undo`, `init.js apply`) los niega a todo subagente; `places.js where`, `places.js report` y `places.js fix preview` los puede correr cualquiera. **La regla solo casa EJECUTAR, nunca leer el script** (`cat`, `grep`, `head`, `Get-Content`, `Select-String` sobre `places.js` desde un subagente pasan; un test `must-allow` por cada deny). Límite declarado: un `node -e "require('…/lib/safe-move')"` saltea la regla (spec §8.3), igual que con `init`.
- **R-20: las skills reciben el lugar por ruta.** La skill `plan` pregunta `places.js where spec` y `where plan` y pasa **esa ruta** en el brief y la tarjeta; ningún agente recibe un árbol ni el mapa entero. El texto de `init` sugiere al humano, **como opcional**, una línea para su `CLAUDE.md`: "Dónde va cada archivo: `.pignolo/project.md`, clave `places`" (`init` no edita `CLAUDE.md`).
- **R-21: orden de los pasos de `init`.** `STEP_IDS` queda `['ignores','gitattributes','reflog','adapt','skeleton','project-md','security-md','auto-memory-off']`: `adapt` y `skeleton` van **antes** de `project-md`, que recibe el mapa final (`proposal.places`) de lo que ellos adoptaron, movieron o crearon. `adapt` solo existe si hay algo que validar (proyecto existente con candidatas); en un proyecto nuevo corre solo `skeleton`.
- **R-22: las respuestas del plan de `init` suman `answers.public: boolean`** (¿el repo es público?: decide `reference`), `answers.places: { <kind>: { decision: 'adopt'|'move'|'leave', from?: <ruta>, to?: <ruta>, force?: boolean } }` y `answers.runGate: boolean`. Una respuesta mal formada es exit 2 (como un id desconocido, R-3 del hito 8).
- **R-23: sin lectura de contenido de documentos salvo para reescribir enlaces.** `scanReferences` lee el texto de los archivos de proyecto (necesario) pero **no** loguea fragmentos más allá de la línea y 80 caracteres de contexto, y nunca lee `.env*`, `*.pem`, `*.key` ni lo que `git check-ignore` marque como ignorado.
- **R-24: Windows y mayúsculas.** Las rutas del mapa se guardan como el humano las escribió; las comparaciones (colisiones, "¿está dentro de?") usan `toLowerCase()` en Windows y macOS y exactas en Linux solo si `fs` lo confirma (`process.platform === 'linux'`). `where` devuelve la ruta tal cual está en el mapa.

## Qué se verificó al escribir este plan

Lectura del repo en `main` (núcleo 0.11.1): `lib/init-actions.js` (`backupFile`, `atomicWrite`, `applyGitattributes`, `applyIgnores`, `mkStep` y el patrón `dry`/`would-do`), `scripts/init.js` (`STEP_IDS`, `runSteps`, `stampOf` y `--expect`/`stale-preview`, `resolveRoot` por `mainRoot`), `lib/init-detect.js` (`detectProject({ root, run, fs })`, `listFiles`), `lib/project-md.js` (`KEYS`, fusión por clave sin pisar), `lib/project-config.js` (`KNOWN` y avisos de clave desconocida), `lib/yaml-lite.js` (mapas de un nivel) y `skills/plan/SKILL.md` líneas 22 y 26 (**las dos únicas apariciones de `docs/specs`/`docs/plans` en el núcleo**; ningún `lib/` ni `scripts/` las usa). La lección de pignolo-ui 0.6.1 C-1 (`run.mjs init` se niega si `.pignolo-ui` o `runs` es symlink o junction, y la poda exige `realpath` dentro del proyecto; probado con un junction real en Windows) es el modelo de R-8.4 y R-8.5. **Hipótesis, sin medir, con dueña:** que `lstat` marque un junction como enlace en esta versión de Node en Windows (Task 2, paso 0: un test lo crea y lo comprueba antes de depender de él); que `git mv` de un directorio parcialmente versionado deje las carpetas sin versionar en su lugar nuevo (Task 2, caso 3); el nombre de la función de `lib/gate.js` que corre una compuerta declarada y la forma de `planFile` en `lib/plan-state.js` (Tasks 6 y 4).

---

# Ola 0 (contratos; Tasks 1 y 2, en serie)

## Task 1: el mapa en `project.md` (`lib/places.js`, `lib/project-md.js`, `lib/project-config.js`)

**Files:**
- Create: `plugins/pignolo/lib/places.js`
- Modify: `plugins/pignolo/lib/project-md.js` (`KEYS` suma `['places','places','map']`), `plugins/pignolo/lib/project-config.js` (`KNOWN` suma `places`; la config gana `places: { <kind>: <ruta> }` y `placesWarnings` en `warnings`)
- Test: `tests/places.test.js`, casos nuevos en `tests/project-md.test.js` y `tests/project-config.test.js`

**Interfaces:**
- `PLACE_KINDS = ['spec','plan','research','reference','design','private']` (congelado). `PLACE_DEFAULTS = { spec: 'docs/specs/', plan: 'docs/plans/', research: 'docs/research/', reference: 'docs/references/', design: 'design/', private: 'local/' }` (congelado).
- `validatePlacePath(raw, { reserved = [], testPaths = [] } = {}) → { ok: true, path } | { ok: false, reason: 'absolute'|'backslash'|'dot-segment'|'empty-segment'|'drive'|'too-long'|'reserved-name'|'bad-char'|'trailing-dot-or-space'|'inside-protected'|'framework-name'|'inside-test-paths' }` (R-3). `path` normalizado con barra final.
- `resolvePlaces(config, { public = false } = {}) → { places: { [kind]: { kind, path, source: 'declared'|'default'|'undeclared' } }, warnings: string[] }` (R-1, R-4). Valida cada tipo declarado y las colisiones entre tipos (R-3); inválido → default y aviso con el motivo.
- `placeFor(config, kind, opts) → { kind, path, source }`; tipo desconocido lanza `Error` con `kind: 'unknown-kind'`.
- `samePath(a, b) → boolean` y `isInside(child, parent) → boolean` (R-24: insensibles a mayúsculas según plataforma, ambas con la barra final normalizada).

**Tests literales (`tests/places.test.js`):**
- [ ] `validatePlacePath` rechaza, uno por caso, con el `reason` exacto: `/abs/x`, `C:/x`, `a\\b`, `a/../b`, `a//b`, `./a`, `docs/CON/`, `docs/nul.txt/`, `x?`, `docs./`, `docs /`, `.pignolo/x/`, `.git/x/`, `src/`, `public/x/`, una ruta de 101 caracteres; acepta `docs/specs`, `docs/specs/`, `doc/especificaciones/` y devuelve la barra final.
- [ ] Un valor de `test-paths` (`tests/**` como `testPaths: ['tests/**']`) hace rechazar `tests/docs/` con `inside-test-paths`.
- [ ] `resolvePlaces` sin nada declarado → los seis tipos en `default` con las rutas de `PLACE_DEFAULTS`; con `{ public: true }` → `reference` en `undeclared` con `path: null`.
- [ ] `resolvePlaces` con `spec: 'docs/'` y `plan: 'docs/plans/'` → `spec` vuelve a `default` y `warnings` nombra la colisión (`docs/` contiene `docs/plans/`); `Docs/specs/` y `docs/specs/` declarados para dos tipos distintos → el segundo vuelve a `default` (`case-collision`).
- [ ] `placeFor(config, 'x')` lanza con `kind: 'unknown-kind'`.
- [ ] Guarda de regresión: ningún valor de `PLACE_DEFAULTS` es rechazado por `validatePlacePath`.

**Tests (`project-md`/`project-config`):**
- [ ] `buildProjectMd({ places: { spec: 'doc/specs/' } })` escribe `places:\n  spec: doc/specs/` (formato exacto del bloque, orden de `KEYS`); `readProjectConfig` lo lee de vuelta como `places: { spec: 'doc/specs/' }` sin avisos.
- [ ] `mergeProjectMd` sobre un `project.md` con `places:\n  spec: docs/specs/` y propuesta `{ places: { spec: 'doc/specs/', plan: 'docs/plans/' } }` → agrega `plan`, **deja `spec` intacto** y lista `conflicts` con `spec` (bytes del resto sin cambio). Rojo: hacer que la fusión pise el valor.
- [ ] Un `project.md` sin `places` se lee igual que antes (todos los casos viejos siguen verdes, sin aviso nuevo); `places.espec: x` → aviso `places: tipo desconocido "espec" (se ignora)`.
- [ ] Commit: `feat(places): clave places del mapa, validación de rutas y lugares por defecto`.

## Task 2: movimientos seguros (`lib/safe-move.js`) — RIESGOSA (auditar antes)

**Files:**
- Create: `plugins/pignolo/lib/safe-move.js`
- Test: `tests/safe-move.test.js`

**Interfaces (todas aceptan `opts.run` para git, `opts.env` para `PIGNOLO_HOME`, `opts.now`, `opts.fs` inyectable):**
- `CODE_EXT` (arreglo congelado de R-8.7) y `RESERVED_SOURCES`.
- `planMoves({ main, items, config, run, fs }) → { ok, items: [{ kind, from, to, tracked, files: n, status: 'ok'|'refused', reason?, detail? }], batch: { ok, reason? } }`: aplica R-8 por ítem y `batch-conflict` (R-8.11). `config` es la de `readProjectConfig` (para `test-paths`, etc.). No escribe nada.
- `applyMoves({ main, plan, env, now, run, fs }) → { ok, record: <ruta de moves.json>, items: [...con status 'done'|'reverted'|'failed'], rolledBack: boolean }`: se niega (`refused: 'plan-not-ok'`) si algún ítem del plan está `refused`; escribe el registro write-ahead (R-12) **antes** del primer movimiento; mueve con `git mv` o `renameSync` (R-7) y actualiza el registro por ítem; si falla uno, revierte los hechos y devuelve `rolledBack: true` (o exit 3 desde el CLI si la reversión también falla: `kind: 'inconsistent'` con la lista).
- `undoMoves({ record, main, env, run, fs }) → { ok, items, restored: [file], refused?: 'modified-since'|'source-exists'|'dest-missing'|…, files?: [file] }` (R-12). **Primero valida todo, después mueve**: si algo está `modified-since`, no mueve nada.
- `recordPath({ main, env, now }) → string` (misma raíz que `backupFile`, `moves.json` dentro de `<ts>/`).
- `isLinkOrOutside(main, rel, fs) → { bad: false } | { bad: true, reason: 'outside-project'|'link-in-path', at }`: la guarda de realpath/lstat (R-8.4 y R-8.5) que usan los demás módulos.

**Tests literales (repos reales con `makeRepo()`, `PIGNOLO_HOME` temporal):**
- [ ] **Paso 0 (hipótesis):** crear un junction real con `fs.symlinkSync(destino, enlace, 'junction')` y afirmar que `lstatSync(enlace).isSymbolicLink()` es `true` y que `realpathSync(enlace)` apunta afuera. Si no se puede crear, `t.skip` con la razón (y el resto de los casos de junction también).
- [ ] Movimiento feliz de un directorio versionado `doc/` → `docs/specs/` (con `docs/` inexistente): `git mv` se usó (el registro de `run` lo contiene), `git status --porcelain` muestra renombres `R`, el contenido de los archivos es idéntico byte a byte y `moves.json` existe **antes** del primer `mv` (se afirma con un `run` que, al ver `mv`, lee el registro del disco y comprueba que ya está).
- [ ] Directorio **sin versionar**: se mueve con `renameSync` (el registro de `run` **no** contiene `mv`) y los archivos llegan intactos.
- [ ] Directorio **parcialmente versionado** (un archivo versionado y uno sin versionar): llega todo al destino y `git status` no muestra nada raro (hipótesis del plan; si falla, la regla pasa a mover por archivo y se anota).
- [ ] Un archivo suelto `spec.md` (`kind: 'file'`): versionado → `git mv`; sin versionar → rename.
- [ ] Una guarda por caso, con el `reason` exacto y **nada movido** (se afirma el árbol antes y después con un hash recursivo): `dest-exists` (archivo, carpeta con contenido y carpeta **vacía**), `dest-inside-source`, `source-inside-dest`, `not-found`, `dirty` (archivo versionado modificado dentro del origen; y otro con el destino modificado), `contains-code` (un `.js` dentro del origen; y un origen que coincide con `test-paths`), `reserved-source` (`.github`, `src`), `merge-in-progress` (se crea `MERGE_HEAD` en el gitdir), `long-path`, `batch-conflict` (dos ítems al mismo destino, uno con otra capitalización), `case-only` (`Docs` → `docs`).
- [ ] **Junction (lección de pignolo-ui C-1):** (a) un origen que **es** un junction hacia una carpeta de afuera → `refused: 'link-in-path'` y la carpeta de afuera sigue intacta; (b) un origen real que **contiene** un junction a afuera → `link-in-path` (nunca se recorre ni se mueve a través de él); (c) un destino cuyo padre existente es un junction hacia afuera (`docs` → afuera) → `link-in-path` y no se crea nada en la carpeta de afuera; (d) un `main` dado por una ruta que pasa por un junction pero cuyo `realpath` coincide con el real → se acepta (no es "afuera"); (e) lo mismo con symlink cuando el sistema lo permite. Rojo: reemplazar `lstat` por `existsSync` → (a) a (c) fallan.
- [ ] Mitad de un lote: dos ítems válidos, el segundo falla en `git mv` (un `run` inyectado lo hace lanzar) → el primero queda **revertido**, `rolledBack: true`, el árbol vuelve a ser idéntico (hash) y el registro marca `reverted`. Con una reversión que también falla (el `run` falla en el segundo `mv`) → el resultado trae `kind: 'inconsistent'` con la lista de lo que quedó.
- [ ] `undoMoves` tras un `applyMoves` feliz: el árbol vuelve a ser idéntico al original (hash recursivo) y `git status` no muestra diferencias respecto del estado previo; el registro pasa a `undone`.
- [ ] `undoMoves` con un archivo reescrito que cambió desde el registro (hash distinto) → `refused: 'modified-since'` con el archivo en `files` y **ningún** movimiento revertido; con el origen vuelto a crear → `source-exists`.
- [ ] Ningún flujo ejecuta `commit`, `add`, `push`, `reset`, `checkout`, `clean` ni `stash`: el registro de `run` de un flujo completo (feliz + deshacer), tras afirmar que no está vacío, tiene solo verbos de la lista cerrada de los Global Constraints.
- [ ] Commit: `feat(safe-move): movimientos seguros con realpath, registro write-ahead y deshacer`.

# Ola 1 (Tasks 3 y 4, en serie)

## Task 3: referencias y reescritura segura (`lib/ref-scan.js`) — RIESGOSA (auditar antes)

**Files:**
- Create: `plugins/pignolo/lib/ref-scan.js`
- Test: `tests/ref-scan.test.js`

**Interfaces:**
- `scanReferences({ main, moves, run, fs, config }) → { refs: Ref[], rewritable: Ref[], manual: Ref[] }` con `Ref = { file, line, col, text: <línea recortada a 80 caracteres alrededor>, move: <índice del ítem>, class: 'markdown-link'|'outbound-link'|'places-map'|'markdown-text'|'code'|'config'|'ci'|'gitignore'|'package-json'|'other', rewritable: boolean, reason?: 'dirty-file'|'not-a-link'|'unresolvable' }` (R-9). `moves` = los ítems de `planMoves` (solo los `ok`).
- `planRewrites({ main, moves, refs, fs }) → { files: [{ file, before: sha256, after: sha256, edits: n }] }`: calcula los textos nuevos **sin escribir**; `before`/`after` entran al stamp del preview.
- `applyRewrites({ main, rewrites, env, now, fs }) → { files: [{ file, backup, sha256After }] }`: respaldo con `backupFile`, escritura atómica conservando final de línea y BOM (R-10); si el hash del archivo cambió desde `planRewrites` → `refused: 'file-changed'` y no escribe ese archivo.
- `relativeLink(fromFileDir, targetPath) → string`: relativo con `/`, sin `./` sobrante, conservando `#ancla` y `?consulta` (función pura, la usan los dos sentidos de R-9).

**Tests literales (repos reales, fixtures sintéticos):**
- [ ] `docs/index.md` con `[x](../doc/specs/a.md)` y mover `doc/specs/` → `docs/specs/`: `scanReferences` lo marca `markdown-link`, `rewritable: true`; `planRewrites` da `../docs/specs/a.md`; tras `applyRewrites` el enlace resuelve a un archivo que existe en el árbol movido (se comprueba con `fs.existsSync` sobre la resolución).
- [ ] Enlaces con ancla y consulta (`a.md#seccion`, `a.md?x=1`), definición de referencia (`[x]: ../doc/specs/a.md`), con `./` y con `\` → todos reescritos conservando el sufijo; un enlace a algo que no existe (`../doc/specs/falta.md`) no se toca y no se cuenta.
- [ ] **Enlaces que salen de lo movido:** `doc/specs/a.md` contiene `[r](../../README.md)`; al mover a `docs/specs/` (misma profundidad: sin cambio) no se reescribe; al mover a `documentation/especificaciones/`... a una profundidad distinta (`docs/design/specs/`) el enlace saliente pasa a `../../../README.md` (`class: 'outbound-link'`) y resuelve a `README.md`. Rojo: ignorar los enlaces salientes → el test falla porque el enlace queda roto.
- [ ] Referencias **manuales** (frenan el ítem): un `require('../doc/specs/x')` en un `.js` → `code`; `"docs": "cat doc/specs/a.md"` en `package.json` → `package-json`; `doc/` en `.gitignore` → `gitignore`; `paths: [doc/**]` en `.github/workflows/ci.yml` → `ci`; una mención en prosa ("ver doc/specs") en un `.md` → `markdown-text`. Ninguna se reescribe y todas salen en `manual`.
- [ ] Delimitado por segmento: `adoc/specs` o `doc/specsX` **no** son referencias a `doc/specs`; sí `"doc/specs"`, `(doc/specs/a.md)` y `doc/specs` al final de línea.
- [ ] Archivo con cambios sin guardar (`git status` no vacío) que contiene un enlace reescribible → pasa a `manual` con `reason: 'dirty-file'`; no se escribe.
- [ ] Binarios (byte NUL), archivos > 1 MB, `.pignolo/state/**`, `node_modules/` y archivos ignorados: no se leen (un `fs` que registra lecturas afirma, tras comprobar que el registro no está vacío, que ninguno de ellos aparece; `.env` no se abre aunque esté sin ignorar... y `.env` sí se abre si **no** hace falta? no: nunca, R-23).
- [ ] `applyRewrites` conserva CRLF y BOM del original (bytes), respalda en `PIGNOLO_HOME` (no junto al original) y deja `git status --porcelain --untracked-files=all` sin archivos nuevos del respaldo; un archivo que cambió entre `planRewrites` y `applyRewrites` → `file-changed`, sin escribir.
- [ ] `relativeLink` (tabla): `('docs/a', 'docs/b/c.md')` → `b/c.md`; `('docs/a', 'docs/a/x.md')` → `x.md`; `('docs/a', 'README.md')` → `../../README.md`; con `#x` y `?y` los conserva.
- [ ] Commit: `feat(ref-scan): referencias a rutas movidas y reescritura segura de enlaces markdown`.

## Task 4: detección de lo que ya hay y de lo suelto (`lib/places-detect.js`)

**Files:**
- Create: `plugins/pignolo/lib/places-detect.js`
- Modify: `plugins/pignolo/scripts/init.js` (`detect` suma `places` al JSON; sin escribir)
- Test: `tests/places-detect.test.js`, caso nuevo en `tests/init-cli.test.js`

**Interfaces:**
- `CANDIDATES` (R-15, congelado, tipo → rutas) y `NAME_RULES` (R-16, congelado, tipo → regex).
- `detectPlaces({ root, run, fs, config }) → { candidates: [{ kind, path, files, trackedFiles, containsCode, why }], ambiguous: [kind], context: [path], unmapped: [path], caseCollisions: [[a,b]], existing: boolean }`. `existing` = el repo tiene commits o archivos fuera de `.pignolo/` y `.git/` (decide si hay "algo que validar").
- `classifyFile(rel) → kind | null` (R-16, solo por nombre).
- `findStray({ root, run, fs, config }) → { stray: [{ path, severity: 'high'|'info', suggest: {kind,to}|null, note? }], misplaced: [{ path, kind, expected, suggest: {from,to}|null, reason? }] }`.

**Tests literales:**
- [ ] Repo con `doc/specs/` (solo `.md`) y `doc/plans/`: candidatas `spec` → `doc/specs/` y `plan` → `doc/plans/` con `trackedFiles` correctos; `context` incluye `doc/`.
- [ ] Dos candidatas para `spec` (`docs/specs/` y `specs/`): `ambiguous: ['spec']`; una candidata con un `.js` adentro: `containsCode: true` (la Task 6 la deja solo adoptable).
- [ ] Repo vacío o solo con `.git`: `existing: false`, sin candidatas.
- [ ] `Docs/` y `docs/` en el mismo repo (sobre un sistema que lo permite, o simulado por el `fs` inyectable): `caseCollisions` los lista.
- [ ] `classifyFile`: `2026-10-01-foo-design.md` → `spec`; `2026-10-01-foo-plan.md` → `plan`; `README.md`, `notas.md`, `design.md` → `null`; `2026-10-01-x.md` suelto → `null`.
- [ ] `findStray` en una raíz con `.env` sin versionar y sin ignorar → `severity: 'high'`, `suggest.kind: 'private'`; con `Makefile` sin versionar → `info` con la nota de falso positivo posible; con `.env` ignorado o versionado → no aparece como suelto (versionado: la Task 7 lo avisa aparte, fuera de este hito; ver "Fuera de este hito").
- [ ] `misplaced`: `2026-10-01-x-design.md` en la raíz con `places.spec = docs/specs/` → `suggest: { from: '2026-10-01-x-design.md', to: 'docs/specs/2026-10-01-x-design.md' }`; el mismo archivo ya en `docs/specs/` → no aparece; con el destino ocupado → `suggest: null, reason: 'dest-exists'`; un `.js` o algo dentro de `test-paths` jamás aparece.
- [ ] `init.js detect` trae `places` con las claves de arriba y **no escribe nada** (`git status --porcelain` igual antes y después); un repo sin candidatas devuelve `existing: false` y `candidates: []`.
- [ ] Rojo de la guarda de lectura: un `fs` que registra lecturas afirma (tras comprobar que no está vacío) que `detectPlaces` no abre el contenido de ningún `.md` (solo lista y cuenta).
- [ ] Commit: `feat(places): detección de carpetas existentes, archivos sueltos y mal ubicados`.

**Cierre de la ola 1:** suite completa una vez.

# Ola 2 (Tasks 5 y 6, en serie)

## Task 5: el esqueleto (`lib/init-skeleton.js`, plantillas)

**Files:**
- Create: `plugins/pignolo/lib/init-skeleton.js`, `plugins/pignolo/templates/places/{spec,plan,research,reference,design,private}.md` (cada uno ≤ 6 líneas, en inglés; la traducción por `language` es del texto ya escrito: un `.es.md` por cada uno)
- Test: `tests/init-skeleton.test.js`

**Interfaces (devuelven `{ id: 'skeleton', status: 'done'|'skipped'|'refused'|'would-do', created: [path], skipped: [{ path, reason }], refused: [{ kind, reason }], sharedIgnoreLine?: '/local/', notes: [] }`; aceptan `dry`, `run`, `fs`, `env`):**
- `applySkeleton({ root, places, answers, config, run, dry }) → step`: `places` = `resolvePlaces` ya con lo adoptado/movido por `adapt`. Por cada tipo con `source !== 'undeclared'`: carpeta inexistente → crea con README (R-5); existente → `skipped: 'exists'`; `case-collision` (R-5) → refused. `reference` con `answers.public === true` → no se crea y la nota dice "repo público: el material del cliente no se versiona; usá `local/`". `private` → R-6.
- `skeletonPlan(...)`: lo mismo con `dry: true` (la vista previa lista exactamente qué crearía).
- `sharedIgnoreLine` = `'/local/'` solo cuando el repo tiene más de un autor de commits (`git shortlog -sn HEAD` con más de una línea) o `answers.team === true`: la skill la muestra; **ningún código la escribe**.

**Tests literales:**
- [ ] Repo nuevo (sin commits): crea `docs/specs/`, `docs/plans/`, `docs/research/`, `docs/references/`, `design/` y `local/` cada una con su `README.md`; **ningún `.gitkeep`** en todo el árbol; `design/approved/` no existe; `.pignolo/` no la crea este paso.
- [ ] `local/.gitignore` contiene exactamente `*\n`; `git status --porcelain --untracked-files=all` **no muestra nada de `local/`** (el contenido de `local/` queda ignorado, incluido el propio `.gitignore`); `git check-ignore -v local/README.md` lo confirma.
- [ ] `local/` ya con un archivo **versionado** → `refused: 'tracked-files'` con la lista, y **nada** escrito dentro de `local/` (ni `.gitignore`); `local/.gitignore` existente con otro contenido → `gitignore-exists`, no se pisa.
- [ ] Carpeta existente con contenido (`docs/specs/` con un `.md`): `skipped: 'exists'`, **su contenido y la ausencia de README quedan intactos** (hash).
- [ ] `Docs/` existente (simulado o real) y se pide `docs/specs/` → `refused: 'case-collision'`, nada creado.
- [ ] `answers.public: true` → `docs/references/` no se crea y `where reference` (Task 7) dirá `undeclared`; `public: false` → se crea.
- [ ] Idempotencia: dos corridas seguidas → la segunda `skipped` en todo y `git status` idéntico (cero diff); un README borrado a mano por el humano **no** se recrea si la carpeta existe (R-5).
- [ ] Equipo (`answers.team: true` o dos autores en el log): `sharedIgnoreLine: '/local/'` y el `.gitignore` del repo (si existe) queda **sin tocar** (hash).
- [ ] `dry: true` → mismo informe con `would-do` y el árbol sin cambios.
- [ ] Commit: `feat(init): esqueleto de carpetas con README, local/ privada y sin .gitkeep`.

## Task 6: adaptar lo que ya hay (`lib/init-adapt.js`) — RIESGOSA (auditar antes)

**Files:**
- Create: `plugins/pignolo/lib/init-adapt.js`
- Modify: `plugins/pignolo/lib/project-md.js` (exporta `setPlace({ text, kind, path }) → { text, conflict? }`: escribe/ajusta una sola entrada de `places` por el mismo mecanismo de inserción de la fusión, sin pisar un valor declarado distinto)
- Test: `tests/init-adapt.test.js`

**Interfaces:**
- `proposeAdaptation({ detection, config }) → { items: [{ kind, candidate: {path, files, trackedFiles, containsCode}|null, recommended: <default>, options: ['adopt','move','leave'], moveBlockedBy?: 'contains-code'|'design-fixed'|…, ambiguous?: boolean }] }`: lo que la skill le muestra al humano. `design` solo admite `adopt`/`leave` (D-8d-1).
- `planAdaptation({ main, answers, config, run, fs }) → { ok, decisions: [{ kind, decision, from, to, moveStatus, blockedBy: Ref[], effective: 'adopt'|'move'|'leave', forced: boolean }], moves: <planMoves>, refs: <scanReferences>, rewrites: <planRewrites>, mapChanges: [{ kind, before, after }], conflicts: [...], stamp }`: valida cada decisión `move` con `planMoves` (R-8) y `scanReferences` (R-9); un ítem con referencias manuales o con una guarda en `refused` queda `effective: 'adopt'` con `blockedBy` (R-10) salvo `force: true` **y** sin guarda `refused` (una guarda dura nunca se fuerza); `adopt` en el lugar: `from` = `to`. Calcula el `stamp` = sha256 de `{ HEAD, plan, rutas+hash de archivos a reescribir, `git status --porcelain` de las rutas }`.
- `applyAdaptation({ main, plan, answers, env, now, run, fs }) → step { id: 'adapt', status, items, rewrites, mapChanges, record, gate, notes }`: (1) respaldo del `project.md` si existe, (2) `applyMoves` (Task 2) con el registro, (3) `applyRewrites` (Task 3), (4) `setPlace` por ítem efectivo, (5) compuerta si `answers.runGate` (R-11), (6) devuelve el resumen. Una falla en (3) o (4) tras mover **revierte los movimientos** (`undoMoves`) y devuelve `refused` con el motivo; sin dejar nada a medias.
- `runDeclaredGate({ main, config, run, runGate }) → { ran, exitCode?, command?, reason? }` (R-11; `runGate` inyectable para los tests).

**Tests literales:**
- [ ] Proyecto con `doc/specs/` y `doc/plans/` (versionados, solo `.md`), `answers.places = { spec: { decision: 'move', from: 'doc/specs/', to: 'docs/specs/' }, plan: { decision: 'adopt' } }`: `planAdaptation` da `spec` move `ok`, `plan` adopt, el `stamp`; `applyAdaptation` mueve `doc/specs` → `docs/specs`, deja `doc/plans` en su lugar, `project.md` queda con `places.spec: docs/specs/` y `places.plan: doc/plans/`, los enlaces markdown que apuntaban a `doc/specs/` quedan reescritos, y `git status` muestra solo renombres y los archivos reescritos.
- [ ] `leave`: nada se mueve, nada se escribe en `places` para ese tipo (R-14); `adopt` no mueve ni reescribe nada y solo escribe la entrada del mapa.
- [ ] **Referencia manual frena el movimiento:** un `require('../doc/specs/x')` en un `.js` → `effective: 'adopt'`, `blockedBy` lo cita, no se mueve nada; con `force: true` se mueve y el informe lista la referencia como "arreglar a mano"; con `force: true` **y** una guarda dura (`link-in-path`, `contains-code`, `dest-exists`, `dirty`) → sigue `adopt` (una guarda dura nunca se fuerza).
- [ ] Carpeta candidata con código adentro → `moveBlockedBy: 'contains-code'`, solo `adopt`/`leave`; `design` → `moveBlockedBy: 'design-fixed'`.
- [ ] `places.spec` ya declarado distinto en `project.md` → `conflicts` con el ítem, **no se mueve ni se adopta** y el archivo `project.md` queda idéntico (hash).
- [ ] **Preview viejo:** tras `planAdaptation`, modificar un archivo a reescribir (o un commit nuevo) → `applyAdaptation` con el `stamp` anterior se niega con `stale-preview` y no escribe nada (el CLI lo exige en la Task 8; acá la función recibe `expect`).
- [ ] **Atomicidad:** un fallo al reescribir (el `fs` inyectado hace fallar la segunda escritura) revierte los movimientos y restaura los archivos ya reescritos; el árbol y `project.md` quedan idénticos al inicio (hash recursivo). Rojo: quitar la llamada a `undoMoves` del camino de error.
- [ ] **Compuerta:** con `gates.on-done` declarada y `runGate` falso que devuelve exit 1 → `ok: false, kind: 'gate-failed'`, **nada se deshace solo** (los movimientos siguen hechos) y el informe trae la ruta del registro para `places.js undo`; con exit 0 → `gate.ran: true, exitCode: 0`; sin compuerta declarada → `gate: { ran: false, reason: 'not-declared' }`; `answers.runGate` ausente → no se corre (se afirma que el `runGate` falso **no** fue llamado, tras comprobar que en el caso anterior sí).
- [ ] `applyAdaptation` en un repo con el índice sucio en las rutas → `refused: 'dirty'` por ítem y **cero cambios** (hash).
- [ ] Idempotencia: aplicar de nuevo sobre el resultado → todos los ítems `adopt` ya en su lugar (`skipped: 'already-in-place'`), sin movimientos, sin diff.
- [ ] Commit: `feat(init): adaptar carpetas existentes (adoptar, mover o dejar) con referencias y deshacer`.

**Cierre de la ola 2:** suite completa una vez.

# Ola 3 (Tasks 7, 8 y 9, en serie)

## Task 7: `scripts/places.js` (`where`, `report`, `fix`, `undo`) — RIESGOSA (auditar antes: `fix` y `undo` escriben)

**Files:**
- Create: `plugins/pignolo/scripts/places.js`
- Test: `tests/places-cli.test.js`

**Interfaces (JSON por stdout; `--cwd <dir>` opcional como en los demás scripts):**
- `places.js where <kind> [--cwd]` → `{ ok: true, kind, path, source: 'declared'|'default'|'undeclared', declared: boolean, exists: boolean, warnings }`; tipo desconocido exit 2; `undeclared` sale exit 0 con `path: null` y aviso. **No crea nada** (la carpeta nace con el primer archivo que se guarde o con `init`).
- `places.js report [--cwd]` → `{ ok: true, places: [{ kind, path, source, exists }], missing: [kind], stray: [...], misplaced: [...], caseCollisions: [...], summary: string, lines: number }` (R-16, R-17). Siempre exit 0 con el repo legible; solo lectura.
- `places.js fix preview [--cwd]` → `{ ok, items: [<mal ubicado con suggest>], moves: <planMoves>, refs, rewrites, stamp }` (R-18; sin escribir).
- `places.js fix apply --moves <archivo> --expect <stamp> [--cwd]` → ejecuta solo los `approved` del archivo `{ v: 1, approved: [<from>...] }`; `stale-preview` si el stamp ya no coincide; devuelve `{ ok, record, items, rewrites, notes }`.
- `places.js undo --record <moves.json> [--cwd]` → `undoMoves` (R-12); `--record` debe estar bajo `PIGNOLO_HOME/init-backup/` (si no: exit 2).

**Tests literales:**
- [ ] `where spec` sin `project.md` → `docs/specs/`, `source: 'default'`; con `places.spec: doc/specs/` → `doc/specs/`, `declared`, `exists` según el disco; `where reference` con el tipo `undeclared` → `path: null`; `where cosa` → exit 2; `where` no crea ninguna carpeta (`git status`/hash del árbol igual).
- [ ] `report` en un repo limpio con todo en su lugar → `summary: ""`, `lines: 0`; con `.env` suelto → `stray[0].severity: 'high'` y `summary` no vacío con la forma de R-17; con un spec fuera de lugar → `misplaced` con `suggest`; con el tipo declarado cuya carpeta no existe → en `missing`; **sale siempre 0** (incluso con hallazgos). Solo lectura (hash del árbol igual).
- [ ] `fix preview` → lista exacta y `stamp`; `fix apply` con un `approved` parcial mueve solo ese ítem y deja el otro; con un stamp viejo (un archivo cambió) → exit 1 `kind: 'stale-preview'` y nada movido; un `approved` que no está en la vista previa → exit 2.
- [ ] `fix apply` rechaza un archivo de código o dentro de `test-paths` aunque venga en `approved` (`refused: 'contains-code'` para ese ítem, los demás siguen su curso).
- [ ] `undo --record <ruta de un registro real>` → deshace; `--record` fuera de `PIGNOLO_HOME/init-backup/` → exit 2; un registro con archivo reescrito modificado → exit 1 `modified-since`, nada revertido.
- [ ] Ningún subcomando ejecuta `commit`/`add`/`push` (registro de `run` no vacío afirmado antes).
- [ ] Salida de error: cada exit 1 trae `kind` y `Alternativa:` en stderr; fuera de un repo → exit 1 `not-a-repo`.
- [ ] Commit: `feat(places): script where, report, fix y undo`.

## Task 8: cableado en `init` (`scripts/init.js`)

**Files:**
- Modify: `plugins/pignolo/scripts/init.js` (`STEP_IDS` según R-21; `NEEDS`; `runSteps` llama a `applyAdaptation` y `applySkeleton` y pasa `proposal.places` a `projectMdStep`; `readPlan` valida `answers.public`, `answers.places`, `answers.runGate` (R-22); `stampOf` incluye el `stamp` de `planAdaptation`; `verify` suma: rutas del mapa que ya no existen, referencias manuales que quedan, `local/` con versionados), `plugins/pignolo/lib/init-adapt.js` (solo cableado, si hace falta)
- Test: casos nuevos en `tests/init-cli.test.js`, `tests/e2e-hito-8d.test.js` (Task 11)

**Tests literales:**
- [ ] `STEP_IDS` es exactamente `['ignores','gitattributes','reflog','adapt','skeleton','project-md','security-md','auto-memory-off']`; un id fuera de `approved` no corre (`skipped: 'not-approved'`); un id desconocido sigue siendo exit 2 (guarda de regresión de 8a).
- [ ] Proyecto nuevo (sin commits): con `skeleton` y `project-md` aprobados, `project.md` sale con `places:` con los seis tipos (o cinco con `answers.public: true`) y las carpetas con sus README; **`adapt` no corre** (`skipped: 'nothing-to-adapt'`).
- [ ] Proyecto existente con `doc/specs/`: `preview` muestra la lista exacta de movimientos y referencias **sin escribir** (hash del árbol igual) y devuelve un `stamp`; `apply --expect <stamp>` mueve y escribe el mapa; con el árbol cambiado entre ambos → `stale-preview`, nada escrito.
- [ ] `preview` y `apply` coinciden: el informe de `preview` (con `dry`) y el de `apply` listan los mismos ítems (rojo: hacer que `apply` mueva algo que `preview` no listó).
- [ ] **Idempotencia:** dos corridas seguidas de `apply` con el mismo plan dejan el repo idéntico (cero diff) y la segunda reporta `skipped: 'already-in-place'`/`already-set` en todo.
- [ ] Un `project.md` con `places.spec` declarado distinto → `conflicts` en el informe y `project.md` intacto (guarda de la Task 6 vista desde el CLI).
- [ ] `verify` tras un movimiento con una referencia manual forzada → exit 0 con `notes` que listan la referencia pendiente; con una ruta del mapa inexistente → `notes` la nombra.
- [ ] Desde una worktree enlazada, `init` mueve y escribe en el checkout principal (R-2 del hito 8); la worktree conserva su layout (se afirma y la nota lo dice).
- [ ] Commit: `feat(init): pasos adapt y skeleton, respuestas de lugares y verificación del mapa`.

## Task 9: regla de la guardia (`lib/…` de la familia `pignolo-init`)

**Files:**
- Modify: el módulo de la regla `pignolo-init` de la guardia (leer al ejecutar: es el de `tests/guard-init.test.js`; mismo lugar donde `isPlanScript` y la regla de `init.js` se definen), `docs/gaps.md` (límite declarado)
- Test: casos nuevos en `tests/guard-init.test.js`

**Interfaces:** la regla casa **ejecutar** `places.js` con los subcomandos `fix apply` y `undo` (y `fix` sin subcomando reconocible, por prudencia), invocado con `node`, con `&` o con comillas de PowerShell (la forma `& node "…"` ya cubierta; sin familias nuevas, R-23 del hito 8), para todo subagente; `where`, `report` y `fix preview` pasan. Los deny traen el mensaje de la guardia con `Alternativa:`.

**Tests literales:**
- [ ] Un subagente (`pignolo:implementer`) ejecutando `node "<P>/scripts/places.js" fix apply …` y `… undo …` → deny; el hilo principal → allow; `where`, `report` y `fix preview` desde un subagente → allow.
- [ ] **`must-allow` de lectura (R-19), uno por cada deny:** `cat`, `grep`, `head`, `sed -n` y `Get-Content`/`Select-String` sobre `places.js` desde un subagente → allow.
- [ ] Forma PowerShell `& node "…\places.js" fix apply` desde un subagente → deny; la misma forma con `where` → allow.
- [ ] `init.js apply` sigue negado a un subagente (guarda de regresión de 8a).
- [ ] Commit: `feat(guard): fix apply y undo de places.js solo para el hilo principal`.

**Cierre de la ola 3:** suite completa una vez.

# Ola 4 (Tasks 10, 11 y 12, en serie)

## Task 10: textos (skills `init`, `plan`, `status`, `close-session`; plantillas; README)

**Files:**
- Modify: `plugins/pignolo/skills/init/SKILL.md` (opus escribe el texto de la skill; el resto, sonnet), `plugins/pignolo/skills/plan/SKILL.md` (líneas 22 y 26), `plugins/pignolo/skills/status/SKILL.md`, `plugins/pignolo/skills/close-session/SKILL.md`, `plugins/pignolo/README.md`
- Test: casos nuevos en el test de skills que ya fija textos (leer al ejecutar: `skill-init`/`flow-plan.test.js`/`flow-lanes.test.js`; los que fijen "`docs/plans/`" o "`docs/specs/`" se actualizan con la skill, no se borran)

**Qué cambia (en inglés, en el texto de las skills):**
- **`init`**, dos pasos nuevos entre "Paths" y "Sensitive data", con el formato de dos partes de siempre (en pocas palabras, detalle técnico, una pregunta por mensaje): **Layout (adapt)** (solo con `places.existing` y candidatas: por cada ítem, "adopt / move / leave" con la lista exacta de movimientos y las referencias reescribibles y manuales; nunca mover sin vista previa; un ítem con referencias manuales se recomienda "adopt"; mencionar que el movimiento se deshace con `places.js undo`; preguntar si corre la compuerta declarada) y **Skeleton** (pregunta una vez si el repo es público, muestra qué carpetas se crean y con qué README, muestra la línea `/local/` para el `.gitignore` compartido en equipo y la deja al humano, sugiere la línea opcional para su `CLAUDE.md`, R-20). El paso 10 (plan y preview) suma `adapt` y `skeleton` a los ids y las respuestas `public`, `places`, `runGate`. El paso de commit propone los renombres (`git mv` ya los dejó en el índice) en una rama `chore/pignolo-layout` si el repo es compartido, y **nunca** `local/` (ignorada).
- **`plan`**: la ruta del spec y del plan sale de `node "<P>/scripts/places.js" where spec --cwd "<main>"` y `where plan`; esa ruta (no el mapa) va en el brief de cada agente y en la tarjeta de tarea; si `where` dice `source: 'default'`, se dice una vez ("no hay `places` declarado: uso `docs/specs/`").
- **`status`**: paso 3: `node "<P>/scripts/places.js" report --cwd "<current directory>"`; si `lines > 0`, repetir `summary`; si no, no decir nada.
- **`close-session`**: tras la evidencia, correr `places.js report`; si hay `misplaced`/`stray`, mostrar y **ofrecer** `places.js fix preview` → mover con el sí del humano; nunca bloquea el cierre y la skill sigue sin agentes.
- **README**: sección "Dónde va cada archivo" (seis tipos, el mapa, `where`, `report`, qué hace `init` en un proyecto existente, el undo).

**Tests literales:**
- [ ] La skill `init` nombra `adapt`, `skeleton`, `places.js undo`, `answers.public` y `runGate`; no contiene un árbol de carpetas ni una ruta absoluta de usuario.
- [ ] La skill `plan` ya no contiene la ruta fija `docs/plans/` en el paso 5 ni `docs/specs/` en el paso 1 y contiene `places.js" where spec` y `where plan` (rojo: restaurar la ruta fija).
- [ ] `status` y `close-session` nombran `places.js" report`; `close-session` nombra `fix preview` y dice que no bloquea.
- [ ] Contexto caliente: el texto que `report` emite para `status` mide ≤ 200 caracteres y es `""` sin hallazgos (el presupuesto de `tests/context-budget.test.js` sigue verde).
- [ ] Commit: `docs(init): pasos de layout y esqueleto, plan y status leen el mapa`.

## Task 11: pruebas de punta a punta y checklist manual (`tests/e2e-hito-8d.test.js`, `tests/manual/hito-8d.md`)

**Files:**
- Create: `tests/e2e-hito-8d.test.js`, `tests/manual/hito-8d.md`

**e2e (repos reales de `makeRepo()`, `PIGNOLO_HOME` temporal, por los scripts reales):**
- [ ] Proyecto nuevo: `init.js detect` → plan → `preview` → `apply --expect` → `verify`: carpetas con README, `local/` ignorada, `project.md` con `places`, `places.js report` con `lines: 0` y `where` coherente con el disco.
- [ ] Proyecto existente con `doc/specs/` + enlaces + una referencia manual: `preview` lista movimientos y referencias; con `adopt` por defecto para el ítem bloqueado → nada se mueve y el mapa apunta a `doc/specs/`; con `force: true` y el resto sin guardas duras → se mueve, los enlaces se reescriben, `runGate` falso verde → `gate.ran: true`.
- [ ] Mover, que falle la compuerta y `places.js undo`: el árbol vuelve **idéntico** (hash recursivo) y `git status` igual al previo.
- [ ] Junction de punta a punta: una carpeta candidata que es un junction a afuera → `refused: 'link-in-path'`, nada movido y la carpeta de afuera intacta (se salta con la razón si el sistema no crea junctions).
- [ ] Mal ubicado: un `…-design.md` en la raíz → `report.misplaced` → `fix preview` → `fix apply` con el sí → el archivo en `docs/specs/` y `report.lines: 0`.
- [ ] Un proyecto con el árbol sucio en el origen → `init` ofrece `adopt` y no mueve nada.

**Checklist manual (`tests/manual/hito-8d.md`), con la regla de siempre: cada punto con su resultado esperado y lo que se anota:**
1. Proyecto real **nuevo**: correr `init` con esqueleto; abrir `local/` y comprobar que `git status` no la muestra y que un archivo de prueba ahí no se versiona; en repo público decir "sí" y comprobar que `docs/references/` no se crea.
2. Proyecto real **existente** con `docs/`/`doc/`: correr `init`; en el paso Layout elegir `move` en un ítem, mirar la lista de referencias, aplicar, abrir los enlaces markdown reescritos a mano y correr la compuerta del proyecto; luego `places.js undo` y comprobar `git status` y un `diff -r` contra una copia hecha antes.
3. Probar con un junction real a otra unidad o carpeta de afuera y comprobar que `init` se niega.
4. Dejar un `.env` y un `…-design.md` sueltos en la raíz: `/pignolo:status` muestra la línea y `close-session` ofrece mover.
5. Un proyecto con Next.js/Django/Go: comprobar que `init` no propone mover `src/`, `app/`, `public/` ni nada de código.
6. Dos clones del mismo repo: confirmar que `local/` no viaja y que la línea `/local/` para el `.gitignore` compartido se muestra y no se escribe sola.
- [ ] Commit: `test(hito-8d): pruebas de punta a punta y checklist manual`.

## Task 12: cierre (versión, CHANGELOG, suite y revisión final)

**Files:**
- Modify: `plugins/pignolo/.claude-plugin/plugin.json` (`version`), `CHANGELOG.md`, `docs/STATE.md`, `docs/gaps.md`

**Pasos (después de la Task 11):**
- [ ] Suite completa **una vez** con `npm test`.
- [ ] Versión: la siguiente a la última publicada (hoy 0.11.1 → 0.12.0, ajustar a lo publicado al ejecutar) y entrada en el CHANGELOG: clave `places`, `places.js` (`where`, `report`, `fix`, `undo`), pasos `adapt` y `skeleton` de `init`, movimientos seguros con registro y deshacer, `plan` lee el mapa; límites declarados (A: `node -e require(lib/safe-move)` saltea la regla; B: otros worktrees conservan el layout viejo; C: lo suelto y lo mal ubicado se detecta solo por nombre y por la raíz; D: `local/` es por clon; E: el material privado fuera de `local/` solo se avisa si es `.env*`/claves).
- [ ] **Revisión final opus de `main..core/hito-8d`**, Review Focus 1, 2, 3, 5 y 6 primero (datos), y una pasada de arreglos.
- [ ] `docs/STATE.md`: "hito 8d unido: `init` crea el esqueleto, adapta proyectos existentes y guarda el mapa `places`"; `docs/gaps.md`: los límites declarados y "pignolo-ui lee `design/approved` fijo, no el mapa" (D-8d-1).
- [ ] Commit: `chore(hito-8d): versión, changelog y estado`. **Unir `core/hito-8d` a `main` y publicar son del autor.**

---

## Waves para un solo ejecutor en serie

| Ola | Tasks | Notas |
|---|---|---|
| 0 | 1, 2 | Contratos. **Auditoría previa de la Task 2** antes de ejecutarla. Etiqueta `contract/hito-8d/v1` al cerrar. |
| 1 | 3, 4 | **Auditoría previa de la Task 3.** Primer paso de cada tarea: `git merge-base --is-ancestor contract/hito-8d/v1 HEAD`; si falla, `BLOCKED`. |
| 2 | 5, 6 | **Auditoría previa de la Task 6.** |
| 3 | 7, 8, 9 | **Auditoría previa de la Task 7** (`fix` y `undo`). |
| 4 | 10, 11, 12 | Revisión final opus de `main..core/hito-8d` y una pasada de arreglos. |

**Auditoría previa en dos pasos de las Tasks 2, 3, 6 y 7 (RIESGOSAS):** una auditoría opus con la receta medida (`lib/plan-check.js` en evidencia, revisión, sondas y verificación de las afirmaciones) **antes** de ejecutarlas; si el autor la prefiere más acotada, la Task 2 y la Task 6 son las que no se omiten. Costo estimado ≈ 1,5 a 2,5 USD (como D-8-6), hipótesis sin medir.

## Estimación de tests nuevos (hipótesis, sin medir)

| Tarea | Tests |
|---|---|
| 1 `places` + `project-md`/`project-config` | 18 |
| 2 `safe-move` | 30 |
| 3 `ref-scan` | 22 |
| 4 `places-detect` | 16 |
| 5 `init-skeleton` | 14 |
| 6 `init-adapt` | 22 |
| 7 `places-cli` | 14 |
| 8 cableado en `init` | 12 |
| 9 guardia | 10 |
| 10 textos | 8 |
| 11 e2e | 6 (más el checklist manual de 6 puntos) |
| **Total** | **≈ 172** (rango 140 a 220), en 9 archivos nuevos y casos nuevos en 5 existentes. Línea base: se mide en la rama al empezar la ola 0. |

Una revisión opus al final; sin evals pagas ni A/B (decisión del autor). Un ejecutor sonnet en serie.

## Decisiones del autor

*Las de la sección "Decisiones del autor ya tomadas" están DECIDIDAS (2026-10-01). Queda una nueva, pequeña, que solo bloquea la Task 6 (`design` en `adapt`) y la Task 10.*

**D-8d-1. El tipo `design` no se mueve ni se renombra en 8d (reservada: cambia un contrato de pignolo-ui).** pignolo-ui lee y escribe `design/approved/<flujo>/` y `DESIGN.md` con la ruta **fija** (spec de pignolo-ui). Si `init` moviera `design/` a otro lugar sin que pignolo-ui leyera el mapa, se rompería el flujo de pantallas aprobadas. **Recomendación: `design` solo admite crear en `design/`, adoptar en el lugar o dejar** (R-15, Task 6, Task 10); que pignolo-ui lea `places.design` es un cambio posterior de su propio plan (queda en `docs/gaps.md`). Alternativa: que 8d agregue ya la lectura del mapa en pignolo-ui (toca otro plugin y su versión; más alcance y más riesgo en un hito que ya es riesgoso).

**Registradas como técnicas (sin pedir):** R-1 a R-24: seis tipos cerrados; el mapa como mapa de un nivel de `yaml-lite`; validación estricta de rutas; esqueleto sin `.gitkeep` y sin pisar; `local/` con `*` propio y negativa si hay versionados; movimiento atómico con guardas, registro write-ahead y deshacer con hashes; escaneo y reescritura de referencias solo de lo probado seguro (incluidos los enlaces salientes de lo movido); referencias manuales frenan por defecto; compuerta con el sí del humano y sin deshacer solo; clasificación de mal ubicados solo por nombre; `fix` y `undo` solo del hilo principal; las skills reciben una ruta, no un árbol; orden de pasos de `init`; Windows y mayúsculas. **El plan no empuja nada ni borra nada; unir y publicar son del autor.**

## Cambios de spec y de contratos (a editar en el spec al cerrar el hito; este plan no lo edita)

- **§3.2 (`project.md`):** clave nueva `places` (mapa tipo → carpeta; tipos `spec`, `plan`, `research`, `reference`, `design`, `private`; aditiva; sin ella se usan los defaults y se avisa).
- **§10.1 (`.pignolo/` y estructura del proyecto):** el esqueleto de carpetas para lo que no es código (`docs/specs|plans|research|references`, `design/`, `local/`) y su regla de README sin `.gitkeep`; `local/` privada con `.gitignore` propio.
- **§14 (`/pignolo:init`):** pasos nuevos `adapt` (validar y adaptar lo existente: adoptar, mover, dejar; movimientos con vista previa, `git mv`, sin pisar, sin enlaces, con registro y deshacer, reescritura segura de referencias, compuerta después de mover) y `skeleton`; `answers.public`, `answers.places`, `answers.runGate`; el nuevo `STEP_IDS`; el registro `moves.json` en `PIGNOLO_HOME/init-backup/`.
- **§8.3 (guardia):** la familia `pignolo-init` suma `places.js fix apply` y `places.js undo`; `where`, `report` y `fix preview` quedan libres.
- **Contrato de la skill `plan` (§ del flujo plan):** la ruta del spec y del plan sale de `places.js where`, con `docs/specs/` y `docs/plans/` como defaults (D-FS-D).
- **Contrato de `/pignolo:status` y `close-session`:** una línea de informe de lo suelto o mal ubicado, solo si hay algo, y la oferta de mover en el cierre; nunca bloquea.
- **§18:** agregar el hito 8d (esqueleto, mapa y adaptación) y `tests/manual/hito-8d.md`.
- **Aditivos, sin romper nada:** la clave `places`, `scripts/places.js`, los ids de paso `adapt` y `skeleton`, los archivos `lib/places.js`, `lib/safe-move.js`, `lib/ref-scan.js`, `lib/places-detect.js`, `lib/init-skeleton.js`, `lib/init-adapt.js` y `templates/places/`.

## Fuera de este hito, con dueño

- pignolo-ui leyendo `places.design` (D-8d-1; plan propio de pignolo-ui).
- Avisar de un `.env*` **versionado** (hoy `report` solo mira lo sin versionar y sin ignorar de la raíz): lo cubre la guardia de egreso del hito 6, no este hito.
- Monorepos con un `places` por paquete: un solo mapa en la raíz (límite declarado de la investigación §4).
- Mover código, tests o carpetas de framework: nunca, por diseño.
