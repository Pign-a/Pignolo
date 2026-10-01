# pignolo-ui v1 — Hito 4: flujos (`ui-option`, `ui-auditor`, tres skills, `compare`, `run`, `to-canvas`, presentación, síntomas y evals). Plan de implementación (método liviano)

> **Para quien ejecute:** olas de a lo sumo dos tareas en paralelo (CLAUDE.md: "uno o dos frentes a la vez"), implementadores sonnet, sin revisión por tarea, una revisión final opus por parte con una pasada de arreglos. Los pasos usan casillas (`- [ ]`). Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Como las tarjetas piden criterio (G16), el modo es en olas paralelas y no un único ejecutor en serie.

**Objetivo:** cerrar el hito 4 de §17. Que `/pignolo-ui:new`, `/pignolo-ui:improve` y `/pignolo-ui:audit` anden de punta a punta sobre lo ya construido (catálogo, `ui-check`, `files`, `approve`, `report-check`, `browser`): carpeta del run y configuración del proyecto, agentes `ui-option` y `ui-auditor`, diversidad medible (`compare`), presentación en el lienzo "Design" o local, diccionario de síntomas, "terminado" honesto y evals de los dos agentes.

**Arquitectura:** dos partes, como en el núcleo. **4a (versión 0.5.0)** es todo lo determinista (librerías, `scripts/run.mjs`, `compare.mjs`, `to-canvas.mjs`, normas base y síntomas): no gasta tokens de agentes y se prueba con `npm test`. **4b (versión 0.6.0)** son las cartas de los dos agentes, las tres skills con su texto de apoyo, el checklist manual y las evals, con costo que decide el autor.

**Stack:** Node ≥ 22 sin dependencias npm, ESM `.mjs`, `node:test` + `node:assert/strict`. **Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md` §2, §3.2, §3.3, §5.7, §6, §7 a §10, §11.2, §12, §13, §13.1, §14 (solo lo que el hito consume), §15, §16.1, §16.3, §16.4, §17 punto 4.

**Prerrequisito:** `main` con el hito 3 unido (`ui/hito-3`, hoy `9a8c3a0`, más `ui/hito-3-fixes`) y `plugin.json` en 0.4.x. **Task 0 (sin código, primer paso obligatorio):** comprobar con `git grep` que existen los nombres que este plan consume; si alguno cambió en los arreglos del hito 3, ajustar la tarjeta y anotarlo, no improvisar:
- `scripts/browser.mjs capture|measure|dom --project --run (--url|--file) [--design] [--platform] [--dark] [--before]`; salidas `<run>/browser.json`, `captures.json`, `dom.json`, `dom-<ancho>.html`, `captures/<ancho>-<tema>-<n>.png`; exit 0/1/2.
- `lib/browser-session.mjs`: `openBrowser`, `withBrowser(opts, fn)`, `BrowserUnavailable` y la página con `setViewport`, `setMedia`, `navigate`, `waitReady`, `evaluate(fn, arg)`; `lib/browser-find.mjs`: `findBrowser()`; `lib/shot-plan.mjs`: `shotPlan({ platform, dark })`, `planFromProject({ project, design })`.
- `scripts/ui-check.mjs --project --run (--files)… [--dom]… [--design] [--base] [--measures] [--url]… [--gate]` → `<run>/ui-check.json { catalogVersion, inputs, base, entries }`.
- `scripts/files.mjs save|verify|restore`, `scripts/approve.mjs save|record|verify`, `scripts/report-check.mjs --project --run`, `scripts/leak-check.mjs --dir --values-file`; `lib/approved.mjs` (`checkScreens`, `saveApproved`, `verifyApproved`, `manifestSha`, `APPROVED_PATH`), `lib/run-folder.mjs` (`RUN_ROOT`, `ensureRunRoot`, `isInsideRunRoot`), `lib/design-doc.mjs` (`validateDesign`, `splitFrontmatter`), `lib/color.mjs` (`parseColor`, `toOklch`), `lib/site-fetch.mjs` (`isLoopbackUrl`), `lib/catalog.mjs` (`loadCatalog`), `lib/leak-check.mjs` (`MIN_VALUE_LENGTH`), `lib/ui-check.mjs` (`runCheck`), `tests/helpers.mjs` (`makeTempDir`, `writeTree`, `runScript`, `serveRoutes`, `BROWSER_SKIP`, `PLUGIN_ROOT`, `makePng`).
- `ui-check` ya trata `design/approved/**` y `.pignolo-ui/runs/**` como mockup (`lib/ui-check.mjs`, `isMockup`): CONTENT-01 da `detalle` ahí.

## Alcance del hito 4

- **Adentro:** todo lo de §17 punto 4 más lo que sus piezas necesitan y el spec ya fija: configuración del proyecto (`project.json`: URL de desarrollo, rutas confirmadas, ruta de referencia, `canvasConsent`; §3.2 y §11.2), chequeo de versión de Claude Code y primera línea del informe (§0, §12), verificación del archivo de cada opción y chequeo de fuga (§7.4), huella y diferencia de opciones y aprobado ↔ implementación (§7.5, §7 paso 5, A-18), generador del lienzo y `compare.html` (§13, §13.1), decisión de presentación y consentimiento (§13), menú de síntomas (§5.7, §8), normas base (§4.1) y evals (§16.3).
- **Afuera, con dueño:**
  - El cambio de la allowlist del núcleo (A-11) y el test de convivencia: **hito 5** de §17. Hasta entonces, con el núcleo activo el hook niega `pignolo-ui:ui-option` y la skill cae al camino secuencial (§7.5: "un hook lo niega"); el plan lo deja escrito en el texto de la skill.
  - El filtro `pii-patterns` del núcleo sobre lo que se publica (§13) y el registro en `decisions/` (§14): hito 5.
  - `stateUrls`, el artifact "Design System", axe, GEO y CRO: v1.1 (§18). Automatizar el login (§11.2) y levantar el servidor de desarrollo: nunca en v1.

## Global Constraints

- Node ≥ 22, sin dependencias npm, sin hooks y sin binarios. Imports solo `node:` o relativos con extensión; ningún `spawn` con shell, salvo el caso declarado en R-5. El linter del plugin (`tests/lint-plugin.test.mjs`) lo hace cumplir y valida `SKILL.md` (≤ 12 000 caracteres, descripción entre comillas, `disable-model-invocation: true`, sin `!` seguido de acento grave, sin `$<dígito>` sin escapar) y las cartas de agentes.
- Nombres de elementos, ids, claves y `reason` de JSON en inglés; texto interno de skills y agentes en inglés; mensajes al usuario por stderr en español y sin stack. Commits en español, Conventional Commits, con `git commit -F <archivo>` y los trailers de la sesión; archivos en LF sin BOM.
- **Rutas siempre por argumento:** `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` y `${user_config.<clave>}` se sustituyen en el texto de la skill (verificado en la documentación oficial de plugins el 2026-09-30: los `userConfig` no sensibles se sustituyen en skills y agentes) y **no** llegan al entorno de Bash; la skill se los pasa a los scripts como argumentos. Ningún script lee `process.env` para eso ni escribe en `~/.pignolo/**`.
- **"No corrió" no es "pasó"** (principio 1): lo que no se pudo medir, comparar o verificar sale `unverified` o "no verificado" con el motivo, nunca verde.
- Nada de red ni remoto en tiempo de ejecución; la suite corre sin red. Tests de navegador con `BROWSER_SKIP` (skip visible, nunca verde). Ningún fixture binario (PNG con `makePng`).
- Temporales solo con `makeTempDir()`. La poda y cualquier borrado de los scripts nuevos se limitan a `.pignolo-ui/runs/` (comprobado con `isInsideRunRoot`).
- Fixtures sintéticos: nada de personas, proyectos ni credenciales reales (el repo es público).
- Cada implementador corre solo sus archivos con `node --test --test-reporter=dot <archivo>`; la suite completa (`npm test`, `npm run test:quiet`, `npm run test:ui`) una vez por ola.

## Método de ejecución y economía de tests

- **Rama:** `ui/hito-4`, desde `main`. Worktrees a mano por tarea (`git worktree add -b task/ui-4/<NN> <scratchpad>/wt-4-<NN> ui/hito-4`); primer paso `git merge-base --is-ancestor <sha de la ola anterior> HEAD` o `BLOCKED`. Al terminar cada ola se une a `ui/hito-4` y `npm run test:ui` corre una vez.
- **Olas:** 0 (T1 ∥ T2) → 1 (T3 ∥ T4) → 2 (T5 ∥ T6) → 3 (T7, cierra 4a: revisión opus de `main..ui/hito-4`, pasada de arreglos, unión) → 4 (T8 ∥ T9) → 5 (T10 ∥ T11) → 6 (T12) → 7 (T13, cierra 4b: revisión opus, pasada de arreglos). Cada tarea trae sus propios archivos de test: no hay choques.
- **Modelos:** sonnet en todas las tareas. **Sin auditoría previa del plan en dos pasos** (CLAUDE.md: solo hitos de riesgo; acá no hay guardia, borrados nuevos ni respaldos nuevos); el borrado de la poda (T2) y `restore` (ya construido) quedan en el foco de la revisión final.
- **Tests que valen lo que cuestan:** ≈ 170 tests nuevos (≈ 100 en 4a, ≈ 70 en 4b), todos sin red; los de navegador (T4, T7) son pocos y con skip visible. **Todo test nuevo se demuestra en rojo rompiendo lo que protege** (lo mira la revisión final); un caso que ya pasa hoy se marca "guarda de regresión".

## Review Focus

1. **"Terminado" honesto.** Ningún texto de skill ni script lo permite sin `ui-check` = 0 en alcance, `report-check` = 0 y build verde si existe (§12). Dueñas: **T7** (acceptance), **T10** y **T11** (texto), `report-skeleton` en **T3**.
2. **Aislamiento y fuga de `ui-option`.** `tools: Write` y nada más, `omitClaudeMd`, brief sin rutas, `leak-check` antes de publicar o aprobar, el hilo principal verifica el archivo y `git status` sin cambios. Dueñas: **T3**, **T8**, **T10**.
3. **Se publica solo lo permitido.** El lienzo nunca lleva capturas, código ni datos reales; `Artifact` solo se invoca con `mode: canvas` (cuatro condiciones) y tras el chequeo de fuga; el generador rechaza scripts y recursos remotos. Dueñas: **T2** (`presentation`), **T5**, **T11**.
4. **La poda borra solo lo suyo.** Solo carpetas de `.pignolo-ui/runs/` de más de 14 días, nunca fuera ni a través de un enlace. Dueña: **T2**.
5. **`compare` inventa diferencias** (A-18, > 30 % → v1.1) o bloquea algo: es informativa y su exit nunca es 1 por diferencias. Dueña: **T4**.
6. **El auditor afirma lo que no puede.** Sin Bash ni MCP, cada hallazgo con evidencia que existe, `bloquea` solo con evidencia de script o navegador. Dueñas: **T3** (`auditor-output`), **T8**.

## Rulings del plan (técnicos, registrados)

- **R-1: `scripts/run.mjs` con subcomandos.** El spec lo describe como "carpeta del run, poda, `compare.html`, apertura"; se suman `env`, `config`, `present`, `leak-values`, `git-state`, `options-check`, `auditor-check`, `menu`, `report-skeleton`, `report-line` porque cada uno vuelve determinista algo que, hecho por el modelo, sería otra afirmación sin verificar. Un solo CLI fino sobre `lib/`.
- **R-2: versión.** 0.5.0 al cerrar 4a y 0.6.0 al cerrar 4b (interfaz nueva en ambos casos; CHANGELOG en cada una).
- **R-3: carpeta de cada opción.** `<run>/option-<A|B|C>/<pantalla>.html` (mockups) o `<run>/direction-<A|B|C>/<pantalla>.html` (style tiles); nombres de pantalla `^[a-z0-9][a-z0-9-]*\.html$` (los de `checkScreens`). La pantalla principal es la primera de la lista de pantallas del brief.
- **R-4: contrato de marcado de `ui-option` para poder medirlo.** La acción primaria lleva `data-primary="true"`; un style tile declara en `:root` las variables `--color-primary`, `--font-body` y `--radius-sm|md|lg`. Es contrato interno entre el brief y `compare`; no cambia ningún contrato público.
- **R-5: versión de Claude Code.** `claude --version` por `execFileSync('claude', ['--version'])`. En Windows, si falla por `ENOENT` o `EINVAL` (shim `.cmd` de npm), un segundo intento con `cmd.exe` y argumentos **fijos** `['/d','/s','/c','claude --version']` (ningún valor interpolado). Si no se puede leer, `ok: false` y la skill usa el camino secuencial (§0): falla cerrado. Mínimo `2.1.271`.
- **R-6: huella de mockup.** Se calcula en el navegador a 1440×900, tema claro, con una función de página que solo lee el DOM (`lib/fingerprint-page.mjs`). `blocks` = etiqueta en minúscula de cada hijo de primer nivel del `main` (o del `body` si no hay `main`), sin `script`, `style` ni elementos ocultos; `headings` = textos normalizados de `h1` a `h3`; `columns` = columnas de la grilla o del flex de primer nivel del contenido (≥ 1); `primary` = `{ row, col }` con `row` ∈ `top|middle|bottom` y `col` ∈ `left|center|right` por tercios del documento, tomado de `[data-primary="true"]` o, si no hay, del primer `button[type=submit]`, o del primer `button`/`a[role=button]` con fondo opaco distinto del de la página; `null` si no hay ninguno (`null` de cualquier lado cuenta como igual). Heurística de v1, medida con fixtures (A-18).
- **R-7: lienzo.** El formato sale de las instrucciones del tipo "Design" leídas el 2026-09-30 (`Artifact read` con `type_url`, sin crear nada): `project/canvas.json` (`{"v":3,"createdOnFiles":{"v":1,"at":"<ahora>"},"title","launch":{"view":"canvas"},"pages":[],"boards":{…},"order":[…],"notes":{…},"designSystems":[]}`), un `project/<nombre>.dc.html` por artboard, el primero llamado `Main.dc.html`, nombres con segmentos que empiezan con letra, dígito o `_`. **No verificado:** la sintaxis exacta de enlaces entre artboards y de estados forzados está en `artifact-type/reference/format.md`, que solo se sirve al crear un lienzo (D-4-2, aprobada el 2026-09-30: se crea un único lienzo privado de prueba de 2 pantallas para leerlo); hasta entonces se usa la forma del spec (`<a href="<archivo>.dc.html">`) y estados como clases duplicando el selector (`.x:hover, .x.is-hover`). Los artboards son de tamaño fijo (§13.1), no PAGE.
- **R-8: la elección no sale de un comentario ni de un script.** El hilo principal la toma del turno del usuario y la guarda con `approve.mjs record --quote-file` (cita literal). El registro en `decisions/` del núcleo es del hito 5.
- **R-9: auditor sin Bash.** Su salida lleva un bloque ```` ```json ```` con `{ findings, notVerified, independent }` (forma en T3). El hilo principal lo copia tal cual a `<run>/auditor.json` con `Write` y `run.mjs auditor-check` lo valida contra el run. Los hallazgos de juicio usan ids `J-nn` de `norms/base.md`.
- **R-10: las ~125 reglas sin checker no se escriben una por una** (pregunta abierta en STATE): el criterio escrito del auditor es `norms/base.md` con una sección "Judgment criteria" de ≤ 25 criterios `J-01…` (D-4-3).
- **R-11: sin `allowed-tools` en las skills.** No se verificó la sintaxis de reglas de Bash para scripts con ruta sustituida; el README documenta los permisos (modo `acceptEdits` recomendado, §3.2).

## Qué se verificó al escribir este plan

Solo lectura: spec, planes 2 y 3 de pignolo-ui, `docs/gaps.md`, `docs/STATE.md`, `main` (plugin 0.3.1) y `git show ui/hito-3:` de `scripts/browser.mjs` y de las cabeceras de `lib/browser-*.mjs`; documentación oficial de plugins por Context7 (sustitución de `${user_config.KEY}`, `${CLAUDE_PLUGIN_ROOT}` y `${CLAUDE_PLUGIN_DATA}` en skills); instrucciones del tipo "Design" por `Artifact read` con `type_url` (solo lectura; no se creó ningún artifact). **No verificado:** que los arreglos de `ui/hito-3-fixes` conserven las firmas de la Task 0; la sintaxis de enlaces y estados del lienzo (R-7, D-4-2); `${CLAUDE_PLUGIN_DATA}` con rutas con espacios en Windows (checklist, T13); Node 22 (sigue en el checklist, §16.4).

---

# Parte 4a: determinista (versión 0.5.0)

## Ola 0 (T1 ∥ T2, archivos disjuntos)

### Task 1: diccionario de síntomas y normas

**Files:**
- Create: `plugins/pignolo-ui/catalog/symptoms.json`, `lib/symptoms.mjs`, `norms/base.md`, `lib/norms.mjs`
- Test: `tests/symptoms.test.mjs`, `tests/norms.test.mjs`

**Interfaces:**
- `catalog/symptoms.json`: `{ "version": 1, "symptoms": [{ "id": "<kebab>", "label": "<frase llana en español>", "words": ["<minúsculas>"…], "rules": ["<id del catálogo o J-nn>"…], "fix": "<una línea: qué token o estructura tocar>" }] }`. Contenido inicial (11), con estas palabras y reglas: `flat` ("se ve plana", "sin profundidad"; DEPTH-01) · `black-borders` ("bordes negros", "bordes muy marcados"; COLOR-02) · `cramped` ("apretada", "sin aire"; LAYOUT-10) · `hard-to-read` ("texto gris difícil de leer", "poco contraste"; COLOR-03) · `generic` ("se ve genérica", "parece hecha por ia"; COLOR-11, COLOR-12, ICON-01, THEME-01, COPY-01) · `no-focus` ("no se ve dónde estoy con el teclado"; STATE-04, NAV-01) · `cut-off-mobile` ("se corta en el celular", "scroll horizontal"; LAYOUT-11) · `uneven-radii` ("bordes redondeados distintos"; LAYOUT-04) · `annoying-motion` ("animaciones molestas"; MOTION-03, MOTION-04, MOTION-07) · `no-hierarchy` ("no se sabe qué es lo principal"; J-01) · `dark-broken` ("el modo oscuro se ve mal"; THEME-03, COLOR-03).
- `lib/symptoms.mjs` produce:
  - `loadSymptoms(file = SYMPTOMS_FILE) → { symptoms }` y `checkSymptoms(dict, { catalog, judgmentIds }) → string[]` (vacío = válido): ids únicos y kebab, `words` no vacías y en minúscula, cada `rules[i]` está en el catálogo (`loadCatalog()`) o en `judgmentIds`.
  - `mergeUserSymptoms(dict, extra) → dict` (`extra` = `[{ id, words, label?, rules? }]` de `norms.md`: las palabras se suman a un id existente; un id nuevo exige `label` y `rules`).
  - `matchWords(text, symptoms) → string[]` (ids cuyas palabras aparecen; sin distinguir mayúsculas ni tildes).
  - `buildMenu({ symptoms, failedIds }) → [{ n, id, label, rules, preticked }]`: `n` desde 1 en el orden del archivo; `preticked` si alguna regla del síntoma está en `failedIds` (ids con `fail` en `ui-check.json`, `browser.json` o `auditor.json`; un `J-nn` cuenta igual).
- `norms/base.md`: ≤ 6 000 caracteres, en inglés, con las secciones `## Hierarchy`, `## Accessibility floor`, `## Platform (HIG, Fluent 2)`, `## Tone by register` y `## Judgment criteria`. Esta última tiene ≤ 25 líneas `- J-01: <criterio>` (jerarquía de texto, orden de lectura, **una** acción primaria, heurísticas de Nielsen, decisiones explícitas); `J-01` es "one primary action per screen and it is the most prominent element". Cita ids del catálogo solo si existen.
- `lib/norms.mjs` produce: `judgmentIds(baseText) → string[]` (los `J-nn`); `loadNorms({ baseFile, userFile, catalog }) → { base, user: null | { ok, symptoms?, body?, warning? } }` (sin `userFile` o inexistente, `user: null`; con frontmatter inválido —clave desconocida del esquema `pignolo:` o `symptoms` con una regla inexistente— `{ ok: false, warning: 'normas del autor ignoradas: <motivo>' }` y se usan solo las base: §3.2, nunca a medias); `extract({ base, user }) → string` (texto para el brief de `ui-option` y para el auditor: la sección `Tone by register`, los `J-nn` y el cuerpo del usuario si es válido, recortado a 4 000 caracteres).

**Tests literales:**
- [ ] `symptoms`: el archivo real pasa `checkSymptoms` (guarda de regresión). Casos rotos, uno por regla: id repetido; `words: []`; una palabra con mayúscula; `rules: ['NOPE-99']`; id no kebab. `matchWords('Se ve plana y apretada', …)` → `['flat','cramped']`; `matchWords('no se ve donde estoy con el teclado')` (sin tilde) → `['no-focus']`; `matchWords('hola')` → `[]`. `buildMenu` con `failedIds: ['COLOR-03']` → `hard-to-read` y `dark-broken` con `preticked: true`, el resto `false`, `n` de 1 a 11; con `failedIds: ['J-01']` → solo `no-hierarchy`. `mergeUserSymptoms` suma `"cartel feo"` a `flat`; un id nuevo sin `label` → error.
- [ ] `norms`: `norms/base.md` tiene las cinco secciones, ≤ 6 000 caracteres, ≥ 8 criterios `J-nn` con ids únicos y consecutivos, y todo id de la forma `[A-Z0-9]+-\d+` que cita (salvo los `J-nn`) existe en el catálogo. `loadNorms` sin archivo de usuario → `user: null`; con uno válido (frontmatter `pignolo: { schema: 1, register: product }` más `symptoms`) → `ok: true`; con `pignolo: { colour: red }` → `ok: false` y `warning` que empieza con "normas del autor ignoradas"; con `symptoms: [{ id: x, words: [a], rules: [NOPE-1] }]` → `ok: false`. `extract` con un cuerpo de usuario de 10 000 caracteres no pasa de 4 000 de ese cuerpo.
- [ ] Commit: `feat(pignolo-ui): síntomas y normas base`.

### Task 2: configuración del proyecto, entorno, carpeta del run y decisión de presentación

**Files:**
- Create: `plugins/pignolo-ui/lib/project-config.mjs`, `lib/env-check.mjs`, `lib/run-init.mjs`, `lib/presentation.mjs`
- Test: `tests/project-config.test.mjs`, `tests/env-check.test.mjs`, `tests/run-init.test.mjs`, `tests/presentation.test.mjs`

**Interfaces:**
- `lib/project-config.mjs`:
  - `repoIdFor(project, { run }) → string`: sha256 hex, primeros 16 caracteres, de `normPath(git rev-parse --path-format=absolute --git-common-dir)`, con `normPath` = `path.resolve`, `\` → `/`, sin `/` final y en minúscula en `win32` (la misma cuenta que el núcleo, `plugins/pignolo/lib/shadow.js`). Sin git, el mismo hash sobre `<project>/.git`.
  - `readConfig({ data, project }) → { repoId, file, config }` (archivo `<data>/<repoId>/project.json`; ausente → `config: {}`; ilegible → lanza `ConfigError`, nunca devuelve `{}`); `writeConfig({ data, project, key, value })` con escritura atómica (temp + rename) y claves cerradas: `devUrl` (solo `isLoopbackUrl`), `routes` (lista de rutas relativas dentro del proyecto, sin `..`), `referencePath` (ruta relativa dentro del proyecto), `canvasConsent` (booleano). Otra clave o valor → `ConfigError`.
- `lib/env-check.mjs`: `compareVersions(a, b) → -1|0|1`; `claudeVersion({ exec, platform }) → string | null` (R-5; `exec` y `platform` inyectables); `envReport({ pluginRoot, minClaude, exec, platform }) → { pluginVersion, node, claude: { version, ok, reason? } }` (`pluginVersion` de `.claude-plugin/plugin.json`; `ok` solo si `version` ≥ `minClaude`).
- `lib/run-init.mjs`: `makeRunId({ now, command, slug }) → '<AAAA-MM-DD-HHmm>-<comando>-<slug>'` (UTC; `slug` en minúsculas y `-`, ≤ 40; comando ∈ `new|improve|audit`, otro lanza); `initRun({ project, command, slug, now }) → { run, runId, pruned }`: `ensureRunRoot` antes de la primera escritura, crea `<run>` y **poda** las carpetas hijas directas de `.pignolo-ui/runs/` con mtime de más de 14 días respecto de `now`, sin seguir enlaces y comprobando `isInsideRunRoot`; `pruned` lista lo borrado.
- `lib/presentation.mjs`: `decidePresentation({ presentation, artifact, designType, canvasConsent }) → { mode: 'canvas' | 'local', consentNeeded: boolean, reasons: string[] }`. `canvas` solo con `presentation === 'auto'` **y** `artifact === true` **y** `designType === true` **y** `canvasConsent === true`. Si las tres primeras valen y `canvasConsent` es `undefined` → `local` con `consentNeeded: true`; con `false` → `local`, `consentNeeded: false`. `reasons` ∈ `presentation-local`, `no-artifact-tool`, `no-design-type`, `no-consent`, `consent-declined`.

**Tests literales:**
- [ ] `project-config`: `repoIdFor` de un repo temporal es un hex de 16 y es igual al calculado en el test con la fórmula de arriba; dos repos distintos → ids distintos; el mismo repo desde un subdirectorio → el mismo id. `writeConfig` con `devUrl: 'http://localhost:3000'` → se lee igual; `devUrl: 'https://example.com'` → `ConfigError`; `routes: ['../x']` → `ConfigError`; clave `foo` → `ConfigError`; `canvasConsent: 'maybe'` → `ConfigError` (la conversión de `'true'` es de la CLI, T6). Un `project.json` con JSON roto → `readConfig` lanza `ConfigError`. Tras `writeConfig` no queda ningún `*.tmp` en la carpeta.
- [ ] `env-check`: `compareVersions('2.1.284','2.1.271')` → 1; `'2.1.9'` contra `'2.1.10'` → -1; con `exec` que devuelve `'2.1.284 (Claude Code)'` → versión `'2.1.284'`, `ok: true`; con `'2.1.200'` → `ok: false`; con `exec` que lanza → `version: null`, `ok: false`, `reason` presente; en `win32` simulado con primer intento `ENOENT` y segundo que contesta → versión leída, y el segundo intento recibió exactamente los argumentos `['/d','/s','/c','claude --version']`. `pluginVersion` coincide con `plugin.json`.
- [ ] `run-init`: `makeRunId` con `now = 2026-09-30T14:05:00Z`, `command: 'audit'`, `slug: 'Cuenta Mensual!'` → `2026-09-30-1405-audit-cuenta-mensual`. `initRun` deja `.pignolo-ui/.gitignore` con `*\n` aun cuando falla a propósito al crear el run (slug que da un nombre inválido), y `git status --porcelain` del repo queda vacío. **Poda:** runs de 15 y 20 días se borran, uno de 13 días queda, un archivo suelto en `runs/` no se toca, una carpeta fuera de `runs/` con la misma edad (`.pignolo-ui/otra/`) queda; un enlace simbólico dentro de `runs/` que apunta fuera no se sigue ni se borra su destino (si el SO no deja crear enlaces, ese caso sale `skip` visible). **Rojo:** quitar la comprobación `isInsideRunRoot` y la edad → cae el caso de "fuera de runs".
- [ ] `presentation`: tabla de las 16 combinaciones de (`presentation`, `artifact`, `designType`, `canvasConsent`) con el resultado esperado escrito en el test; en particular `local` con todo `true` → `local`; `auto` con `artifact: false` → `local` sin `consentNeeded`; `auto` con las tres y consentimiento ausente → `local` con `consentNeeded: true`; las cuatro `true` → `canvas`.
- [ ] Commit: `feat(pignolo-ui): configuración del proyecto, entorno, run y presentación`.

**Tag de contrato:** unir T1 y T2 a `ui/hito-4` y etiquetar `contract/ui-4/v1`.

## Ola 1 (T3 ∥ T4)

### Task 3: verificación de opciones, fuga, informe y salida del auditor

**Files:**
- Create: `plugins/pignolo-ui/lib/option-check.mjs`, `lib/leak-values.mjs`, `lib/report-build.mjs`, `lib/auditor-output.mjs`
- Test: `tests/option-check.test.mjs`, `tests/leak-values.test.mjs`, `tests/report-build.test.mjs`, `tests/auditor-output.test.mjs`

**Interfaces:**
- `lib/option-check.mjs`: `gitState(project) → string` (`git status --porcelain --untracked-files=all` por `execFileSync`, plazo 60 s, líneas ordenadas); `checkOption({ dir, expected, project, gitBefore, ignoreUnder }) → { ok, problems: [{ file, problem }] }`. Reusa `checkScreens(dir)` de `lib/approved.mjs` (sus problemas: `subfolder`, `not-html`, `bad-name`, `empty`, `no-charset`, `script`, `remote-resource`, `broken-link`) y suma `missing` (un archivo de `expected` no está), `empty-file` (pesa 0 bytes), `unexpected-file` (un `.html` fuera de `expected`) y `repo-changed` (el `gitState` actual difiere de `gitBefore`, descontando lo que esté bajo `ignoreUnder`, p. ej. `.pignolo-ui/`). `ok` solo sin problemas. Una opción con un problema **falla**: no es un resultado (§7.4).
- `lib/leak-values.mjs`: `collectLeakValues({ project, email, exec, os }) → string[]`: `git config user.name` y `user.email` del proyecto, el `email` de la sesión si se pasa, el usuario del SO y el home (`os.userInfo().username`, `os.homedir()`); sin vacíos, sin duplicados y sin valores de menos de `MIN_VALUE_LENGTH`; `exec` y `os` inyectables.
- `lib/report-build.mjs`:
  - `firstLine(facts) → string`, con `facts = { pluginVersion, degraded: string[], subagents: { requested, launched, models: string[] }, sequential: boolean, notIndependentAudit: boolean }`. Forma exacta: `pignolo-ui <versión> · <degraded unidos por "; " o "sin degradaciones"> · subagentes: <launched> de <requested> (<modelos unidos por ", " o "ninguno">)`. Con `sequential: true` la **primera línea completa** es `opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron <launched> de <requested> subagentes` y la línea de versión va en la segunda; con `notIndependentAudit: true` se suma `auditoría no independiente` a `degraded`.
  - `reportSkeleton({ project, run, implementsPath }) → { version: 1, implemented, implements?, evidence, claims: [], candidates }`: `evidence` con el sha256 de `ui-check.json` y de `browser.json` si existen en el run; `candidates` = una `{ id, rule, status, measure, ref: { source: 'ui-check'|'browser', fingerprint } }` por cada entrada `fail` de esos dos archivos (el contrato de §5.9); `implements: { path, manifestSha256 }` y `implemented: true` solo si se pasa `implementsPath` (con `manifestSha` de `lib/approved.mjs`). **No escribe `report.json`:** la skill agrega `text` a los candidatos elegidos y escribe el archivo.
- `lib/auditor-output.mjs`: `extractJsonBlock(text) → object | null` (el último bloque ```` ```json ````); `validateFindings({ output, run, catalog, judgmentIds }) → { ok, problems: [{ index, problem }] }`. Forma: `{ findings: [{ id, severity, scope, plain, evidence, before?, after?, why? }], notVerified: [{ what, reason }], independent: boolean }`, con `severity` ∈ `bloquea|alto|medio|detalle`, `scope` ∈ `new|debt`, `evidence` = `{ kind: 'ui-check'|'browser', fingerprint }` o `{ kind: 'file', path, line }` o `{ kind: 'capture', path, sha256, measure? }`. Problemas: `bad-id` (ni del catálogo ni `J-nn`), `bad-severity`, `no-evidence`, `evidence-missing` (la huella no está en `ui-check.json`/`browser.json` del run, el `file:line` no existe o el sha256 de la captura no coincide con el archivo), `bloquea-without-script` (`bloquea` con evidencia que no sea `ui-check`/`browser` **con `status: fail`**), `judgment-above-alto` (un `J-nn` con `bloquea`), `self-grade` (cualquier campo `score`, `grade` o `rating`).

**Tests literales:**
- [ ] `option-check` (carpetas temporales): una opción buena (2 pantallas enlazadas, charset, sin scripts) → `ok`. Una por problema: archivo esperado ausente → `missing`; archivo de 0 bytes → `empty-file`; `.html` sobrante → `unexpected-file`; sin `<meta charset="utf-8">` → `no-charset`; `<script>` → `script`; `<img src="https://x.test/a.png">` → `remote-resource`; `<a href="paso-3.html">` a una pantalla inexistente → `broken-link` y la opción falla; `gitBefore` distinto del actual por un archivo nuevo fuera de `.pignolo-ui/` → `repo-changed`; el mismo cambio bajo `.pignolo-ui/` → sin problema.
- [ ] `leak-values`: con `exec`/`os` falsos devuelve exactamente `['Ana Ejemplo','ana@example.test','ana','/home/ana']` en ese orden y sin duplicados aunque el email de sesión repita el de git; un valor de 2 caracteres se descarta; si el `exec` lanza (sin git) igual devuelve los del SO.
- [ ] `report-build`: `firstLine` con `degraded: []` → `pignolo-ui 0.5.0 · sin degradaciones · subagentes: 3 de 3 (sonnet, sonnet, sonnet)`; con `degraded: ['sin navegador','lienzo no disponible']` los une con `; `; con `sequential: true`, `launched: 0`, `requested: 3` la primera línea es literalmente `opciones generadas en secuencia en el hilo principal: no son independientes; se lanzaron 0 de 3 subagentes` y la segunda empieza con `pignolo-ui`. `reportSkeleton` sobre un run con `ui-check.json` (un `fail` y un `pass`) y `browser.json` (un `fail`) → 2 candidatos y `evidence` con los dos sha256 correctos; sin `browser.json`, `evidence` solo con `ui-check.json`; con `implementsPath` de un aprobado válido → `implemented: true` y el `manifestSha256` correcto. **Round-trip:** una afirmación armada desde un candidato (agregándole `text`) sobrevive a `report-check` (exit 0) y una con el `measure` cambiado se retira (exit 1).
- [ ] `auditor-output`: un bloque válido con un hallazgo `COLOR-03`/`bloquea` que cita una huella `fail` del run → `ok`. Por problema: id `FOO-1`; severidad `critical`; sin `evidence`; huella inexistente → `evidence-missing`; `file:line` inexistente; sha256 de captura alterado; `bloquea` con evidencia `file` → `bloquea-without-script`; `bloquea` citando una entrada `pass` → `bloquea-without-script`; `J-01` con `bloquea` → `judgment-above-alto`; `score: 4` → `self-grade`. `extractJsonBlock` toma el **último** de dos bloques y devuelve `null` sin bloque o con JSON roto.
- [ ] Commit: `feat(pignolo-ui): verificación de opciones, fuga, informe y salida del auditor`.

### Task 4: huella y diferencia de opciones (`compare`)

**Files:**
- Create: `plugins/pignolo-ui/lib/fingerprint.mjs`, `lib/fingerprint-page.mjs`, `scripts/compare.mjs`
- Test: `tests/fingerprint.test.mjs`, `tests/compare-cli.test.mjs`

**Interfaces:**
- `lib/fingerprint.mjs` (puro, sin navegador):
  - `editDistance(a: string[], b: string[]) → number` (Levenshtein sobre listas); `normalizedDistance(a, b) → number` (`editDistance / max(len)`, 0 si ambas vacías).
  - `mockupDistance(fa, fb) → { coincide, distance, reasons }`: coinciden si `distance < 0.3` **y** `columns` iguales **y** `primary` igual (`null` de un lado cuenta como igual, R-6); `reasons` nombra qué coincidió (`blocks`, `columns`, `primary`). No mide tokens (§7.5).
  - `tileFingerprint(html) → { v: 1, kind: 'tile', primaryHue, fontFamily, radii }`: lee las variables de `:root` de R-4 (con `lib/css-walk.mjs` o `scanCss` de `lib/token-sources.mjs`): `primaryHue` = tono OKLCH (`parseColor` + `toOklch`) de `--color-primary` o `null`; `fontFamily` = primera familia de `--font-body` en minúscula y sin comillas, o `null`; `radii` = los px de `--radius-sm|md|lg`, ordenados y sin repetir.
  - `tileDistance(fa, fb) → { coincide, reasons }`: coinciden si el ΔH circular del primario es < 30° **y** misma familia **y** mismas `radii`; con `primaryHue` `null` de un lado **no** coinciden (`reasons: ['missing-primary']`: falta información).
  - `pairwise(fingerprints: { A, B, C }, distanceFn) → [{ a, b, coincide, distance?, reasons }]`.
- `lib/fingerprint-page.mjs`: `fingerprintPage(page) → Promise<{ v: 1, kind: 'mockup', width: 1440, blocks, headings, columns, primary }>` (R-6) con `page.evaluate(fn)` y una función que solo lee el DOM.
- `scripts/compare.mjs`:
  ```
  node <root>/scripts/compare.mjs fingerprint --kind mockup|tile (--file <html in project> | --url <local URL>) --out <json> [--project <repo>]
  node <root>/scripts/compare.mjs distance --a <fp.json> --b <fp.json>
  node <root>/scripts/compare.mjs options --run <run> --kind mockup|tile --main <screen.html> [--second-round]
  node <root>/scripts/compare.mjs approved --project <repo> --approved <design/approved/<flujo>> --map <json> --run <run>
  ```
  `fingerprint --kind tile` es estático; con `mockup` abre el navegador por `lib/browser-session.mjs` a 1440×900 con tema claro (`setMedia` explícito) y, sin navegador, escribe `{ unverified: '<motivo>' }` y sale 0. `options` calcula la huella de `<run>/option-*/<main>` (o `direction-*/` para `tile`), compara por pares y devuelve `{ pairs, regenerate: 'A'|'B'|'C'|null, warn: string[] }`: `regenerate` = la opción de menor diferencia dentro de la pareja coincidente (si coinciden varias parejas, la de menor `distance`; en `tile`, la letra mayor de esa pareja); con `--second-round` y una pareja que vuelve a coincidir, `warn: ['B y C son muy parecidas']` con las letras de esa pareja. `approved` lee el `manifest.json` y, por cada pantalla, compara su huella con la de la URL o ruta de `--map` (`{ "<pantalla>.html": "<URL local o ruta>" }`) y escribe `<run>/compare-approved.json { screens: [{ screen, differences: [{ kind: 'blocks'|'headings'|'columns'|'primary', a, b }], unverified? }] }`. **Exit 0 siempre que no haya error propio (2): las diferencias nunca dan 1** (§7 paso 5, A-18). Un cambio solo de tokens no produce diferencias.

**Tests literales:**
- [ ] `fingerprint` puro: `editDistance(['header','main','footer'], ['header','footer'])` → 1; `normalizedDistance([], [])` → 0. `mockupDistance` con bloques `['header','section','section','footer']` iguales, columnas 2 y primaria `{ row: 'middle', col: 'right' }` en ambos → `coincide: true`; con la primaria en `{ row: 'bottom', col: 'left' }` → `false` y `reasons` sin `primary`; con columnas 1 contra 2 → `false`; con 3 cambios sobre 10 bloques (0,3) → `false` (el límite es `< 0.3`) y con 2 sobre 10 → `true`; primaria `null` de un lado → `true`. `tileFingerprint` de un `:root` con `--color-primary: oklch(0.6 0.15 250)`, `--font-body: "Inter", sans-serif`, `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 8px` → `{ primaryHue: 250, fontFamily: 'inter', radii: [4, 8] }`. `tileDistance`: tonos 250 y 270, misma fuente y radios → coinciden; 250 y 290 → no; 350 y 10 (circular, ΔH = 20) → coinciden; tono `null` → no coinciden con `missing-primary`.
- [ ] `compare-cli` sin navegador: `distance` entre dos JSON de huella → exit 0 y `coincide` impreso; `options --kind tile` sobre `direction-A|B|C/` con style tiles sintéticos (A y B con primarios 250 y 262, misma fuente y radios; C con 20) → `pairs` con A–B coincidente y `regenerate: 'B'`; con `--second-round` → `warn: ['A y B son muy parecidas']` (el texto lleva las letras de la pareja que coincide); `fingerprint --kind tile` escribe el JSON; `fingerprint --kind mockup` con `PIGNOLO_UI_BROWSER` apuntando a un archivo inexistente → exit 0 con `unverified` que menciona el motivo y sin `blocks`. Opción desconocida o `--url` remota → exit 2.
- [ ] `compare-cli` con navegador (`BROWSER_SKIP`, páginas por `serveRoutes`): dos mockups de 4 bloques con la acción primaria en distinto lugar → no coinciden; el mismo mockup con colores distintos (solo tokens) → coinciden; `approved` sobre un aprobado y su implementación con un encabezado de más → `differences` con `headings` y exit 0; **la comparación nunca cambia el código de salida** (misma corrida con y sin diferencias → 0).
- [ ] **Medición de A-18** (no es un test que falla): el test imprime la tasa de diferencias falsas sobre 6 pares aprobado/implementación sintéticos que **deben** coincidir; el criterio de pasar es 0 de 6 y el número queda anotado en el CHANGELOG (si fixtures reales dan > 30 %, pasa a v1.1: decisión del autor).
- [ ] Commit: `feat(pignolo-ui): huella y diferencia de opciones (compare)`.

## Ola 2 (T5 ∥ T6)

### Task 5: generador del lienzo (`lib/canvas.mjs`, `scripts/to-canvas.mjs`)

**Files:**
- Create: `plugins/pignolo-ui/lib/canvas.mjs`, `scripts/to-canvas.mjs`
- Test: `tests/canvas.test.mjs`, `tests/to-canvas-cli.test.mjs`

**Interfaces:**
- `lib/canvas.mjs`:
  - `sizeFor({ platform }) → [{ w, h }]`: celular 390×844 y escritorio 1440×900; `both` devuelve los dos (una fila por tamaño y opción, §13).
  - `toArtboard({ html, w, h }) → string`: `.dc.html` de una pantalla. **Forma exacta** (la del skeleton del tipo): `<!doctype html>`, `<html lang="<el del original o es>">`, `<head>` con `<meta charset="utf-8">`, `<title>` y **exactamente** la línea `<script src="./support.js"></script>`; `<body><x-dc><helmet><style>` con `body{margin:0}` y todo el `<style>` del original (los tokens quedan como variables en `:root`) más los estados; un único `<div style="width: <w>px; height: <h>px; box-sizing: border-box; overflow: hidden">` con el cuerpo del original (raíz de tamaño fijo); `</x-dc>`; y el bloque `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":<w>,"height":<h>}}'>` con `class Component extends DCLogic { renderVals() { return {}; } }`. Nada más: ningún otro `<script>` y ningún `innerHTML`.
  - **Estados:** cada regla CSS con `:hover`, `:active` o `:focus`/`:focus-visible` duplica el selector con `.is-hover`, `.is-active`, `.is-focus` (`a:hover` → `a:hover, a.is-hover`) en el mismo `<style>` (R-7).
  - **Rechazos** (lanza `CanvasError` con `code`): `script` (un `<script>` o un `on*=`), `remote-resource` (misma detección que `checkScreens`), `braces` (el texto contiene `{{`, que el tipo interpreta como hueco), `no-body`.
  - `buildCanvas({ options: [{ id: 'A', screens: [{ file, html }] }], platform, title, now }) → { files: { '<ruta bajo project/>': string }, canvas: object }`: el primer artboard de la primera opción se llama `Main.dc.html` y los demás `<opción>-<pantalla>.dc.html` en minúscula (`a-detalle.dc.html`); reescribe cada `<a href="<pantalla>.html">` a `<a href="<archivo>.dc.html">` de **su** opción; `canvas` con `v: 3`, `createdOnFiles: { v: 1, at: <now ISO> }`, `title`, `launch: { view: 'canvas' }`, `pages: []`, `designSystems: []`, un `boards` por artboard (`x`, `y`, `w`, `h`, `title`, y `is_interactive: true` si la pantalla tiene un `a[href]` a otra pantalla, `button`, `input`, `select`, `textarea` o `details`), `order` y `notes` con **una** nota `{ kind: 'title1', text: 'Opción A', maxW }` por fila, a `y` = (`y` de su fila) − 223. Posiciones: 80 px entre artboards de una fila y 120 entre filas (contando el alto de la nota); una fila por opción.
- `scripts/to-canvas.mjs`: `node <root>/scripts/to-canvas.mjs --project <repo> --run <run> --options <A,B,C> --platform desktop|mobile|both --title <texto> [--kind option|direction]` → lee `<run>/option-<X>/*.html` (o `direction-<X>`), escribe `<run>/canvas/project/…` y `<run>/canvas/manifest.json` (`{ files: [{ path, sha256 }] }`: exactamente los bytes que se publican, §12) e imprime `{ out, files, count }`. Exit 0 hecho; 1 una entrada rechazada (lista cada archivo y `code`; **no escribe nada** si alguna se rechaza); 2 uso o error propio.

**Tests literales:**
- [ ] `canvas` con un HTML de 2 pantallas y `mobile`: la salida contiene, textualmente, `<script src="./support.js"></script>`, `<x-dc>`, `<helmet><style>`, `class Component extends DCLogic`, `data-dc-script`, `data-props='{"$preview":{"width":390,"height":844}}'` y `width: 390px; height: 844px;`; **cuenta de `<script`: exactamente 2** (support y el bloque) y `innerHTML` no aparece. Tokens: un `:root{--color-primary:#1a56db}` del original queda dentro de `<helmet><style>`. Estados: `a:hover{color:#000}` → contiene `a:hover, a.is-hover{color:#000}`; `button:focus-visible{outline:2px solid}` → `button:focus-visible, button.is-focus{outline:2px solid}`; `button:active` → `.is-active`; una regla sin estado queda intacta (guarda de regresión).
- [ ] Rechazos: `<script>alert(1)</script>` → `script`; `<img src="https://x.test/a.png">` → `remote-resource`; texto `{{nombre}}` → `braces`; `<button onclick="x()">` → `script`.
- [ ] `buildCanvas` con 3 opciones de 2 pantallas (`inicio.html` enlaza a `detalle.html`): `files` tiene 6 rutas, `Main.dc.html`, `a-detalle.dc.html`, `b-inicio.dc.html`, `b-detalle.dc.html`, `c-inicio.dc.html`, `c-detalle.dc.html`; el enlace de `b-inicio.dc.html` apunta a `b-detalle.dc.html` y **no** a `a-detalle…`; en `canvas`: `v: 3`, `createdOnFiles.v: 1`, `order` con las 6 rutas, `boards['Main.dc.html'].is_interactive === true`, 3 notas `title1` con textos `Opción A|B|C`, `y` de cada nota = `y` de su fila − 223, `x` del segundo artboard de una fila = `x` del primero + `w` + 80. Con `platform: 'both'` hay dos filas por opción (390 y 1440 de ancho).
- [ ] CLI: sobre un run con `option-A|B|C` → exit 0 y `canvas/manifest.json` con 6 sha256 que coinciden con los archivos; **no se escribe nada** si una de las pantallas tiene un `<script>` (exit 1, carpeta `canvas/` ausente); `--options A,D` con `option-D` inexistente → exit 2. **Rojo:** quitar el rechazo de `script` → cae el test de CLI.
- [ ] Commit: `feat(pignolo-ui): generador del lienzo Design`.

### Task 6: `compare.html`, apertura y CLI `scripts/run.mjs`

**Files:**
- Create: `plugins/pignolo-ui/lib/compare-html.mjs`, `scripts/run.mjs`
- Test: `tests/compare-html.test.mjs`, `tests/run-cli.test.mjs`

**Interfaces:**
- `lib/compare-html.mjs`: `buildCompareHtml({ options: [{ id, screens: string[] }], platform, title }) → string`: página HTML autocontenida (charset, estilos inline, **sin scripts ni recursos remotos**) con una fila por opción ("Opción A"…) y, por pantalla, un `<iframe src="option-<id>/<pantalla>.html">` de ancho 1440 o 375 según `platform` (`both` pone los dos) y alto 900 u 812, con el nombre de la pantalla encima; las pantallas siguen enlazadas porque cada iframe navega su carpeta. `openFile(file, { platform, spawn }) → void`: abre con `explorer.exe` (win32), `open` (darwin) o `xdg-open`, siempre `spawn` sin shell, `detached`, `stdio: 'ignore'`, `unref()`; `spawn` inyectable.
- `scripts/run.mjs` (CLI fina; cada subcomando imprime **un objeto JSON** en stdout y sale 0 hecho, 1 rechazo o hallazgo, 2 uso o error propio):
  ```
  run.mjs env [--claude-min <x.y.z>]
  run.mjs init --project <repo> --command new|improve|audit --slug <slug> [--now <ISO>]
  run.mjs config get|set --data <dir> --project <repo> [--key <k> --value <v>]
  run.mjs present --data <dir> --project <repo> --presentation auto|local --artifact yes|no --design-type yes|no
  run.mjs leak-values --project <repo> --out <file> [--email <correo>]
  run.mjs git-state --project <repo> --out <file>
  run.mjs options-check --project <repo> --run <run> --option <A|B|C> [--kind option|direction] --expected <a.html,b.html> --git-before <file>
  run.mjs auditor-check --project <repo> --run <run>
  run.mjs menu --run <run> [--norms <file>] [--extra-symptoms <json>]
  run.mjs report-skeleton --project <repo> --run <run> [--implements <design/approved/flujo>]
  run.mjs report-line --facts <json file>
  run.mjs compare-html --run <run> --platform desktop|mobile|both [--no-open]
  ```
  - `env` → `envReport` (T2) con `pluginRoot` calculada desde `import.meta.url` y `--claude-min` por defecto `2.1.271`. `config set --value true|false` convierte `canvasConsent`; `routes` recibe una lista separada por comas. `present` imprime `decidePresentation` con `canvasConsent` leído de `project.json`.
  - `options-check` corre `checkOption` sobre `<run>/<option|direction>-<X>/` y además **corre `ui-check`** sobre sus archivos (`runCheck`, con `--design` si existe `DESIGN.md`) y devuelve `contradicted: [<ids con fail>]` para que la skill retire las citas de reglas que el script contradice (§7 paso 2).
  - `auditor-check` lee `<run>/auditor.json`, valida con `validateFindings` (T3) e imprime `{ ok, problems }`; exit 0, 1 si hay problemas, 2 si falta el archivo o no parsea.
  - `menu` → `buildMenu` (T1) con `failedIds` de `ui-check.json`, `browser.json` y `auditor.json` del run, y las normas del autor si se pasa `--norms` (inválidas → se ignoran y sale `warning`).
  - `compare-html` escribe `<run>/compare.html`, lo abre salvo `--no-open` e imprime `{ out, opened }`; las opciones salen de las carpetas `option-*` del run.

**Tests literales:**
- [ ] `compare-html`: con 2 opciones de 2 pantallas y `desktop` → 4 `<iframe`, anchos `1440`, cero `<script`, cero `http`, contiene `Opción A` y `Opción B`; `both` → 8 iframes (1440 y 375); `openFile` con `spawn` falso en `win32` llama `explorer.exe` con la ruta como **argumento** y `detached: true`; en `linux`, `xdg-open`.
- [ ] CLI (procesos reales sobre repos temporales): `env` imprime `pluginVersion` igual al de `plugin.json` y `claude.ok` booleano; `init` crea el run bajo `.pignolo-ui/runs/` y `git status --porcelain` queda vacío; `config set --key devUrl --value https://example.com` → exit 2 con mensaje en español; `config set --key canvasConsent --value true` y `config get` → `config.canvasConsent === true`; `present … --presentation auto --artifact yes --design-type yes` sin consentimiento → `{ mode: 'local', consentNeeded: true }` y, tras `set canvasConsent true`, `{ mode: 'canvas' }`; con `--presentation local` → `local` aunque haya consentimiento (§16.1: nunca se invoca `Artifact`). `leak-values --out f` escribe una lista JSON que `scripts/leak-check.mjs --values-file` acepta (round-trip con una carpeta que contiene el email de git → exit 1). `git-state` + `options-check` con una opción con `<script>` → exit 1 con `problem: 'script'`; con una opción buena → exit 0 y `contradicted: []`; con un `<img>` sin `alt` → `contradicted` incluye `A11Y-26`. `auditor-check`: un `auditor.json` válido sobre un run sintético → exit 0; un `bloquea` con evidencia `file` → exit 1 con `bloquea-without-script`; sin archivo → exit 2. `menu` sobre un run con un `fail` de `COLOR-03` → `hard-to-read` con `preticked: true`. `report-skeleton` y `report-line` imprimen lo que define T3. `compare-html --no-open` → `compare.html` existe y `opened: false`. Opción desconocida en cualquier subcomando → exit 2.
- [ ] **Rojo** (rompiendo lo que protege): `present` que ignora `--presentation local` → cae el caso de `local`; `options-check` que no ejecuta `ui-check` → cae el caso de `A11Y-26`; `auditor-check` que no llama a `validateFindings` → cae el caso de `bloquea-without-script`.
- [ ] Commit: `feat(pignolo-ui): run.mjs (entorno, configuración, presentación, verificación) y compare.html`.

## Ola 3: cierre de 4a

### Task 7: prueba transversal, documentación, versión 0.5.0

**Files:**
- Test: `plugins/pignolo-ui/tests/hito-4a-acceptance.test.mjs`
- Modify: `plugins/pignolo-ui/.claude-plugin/plugin.json` (`version` 0.5.0), `CHANGELOG.md`, `README.md`, `docs/specs/2026-09-28-pignolo-ui-v1-design.md` (§5.10 nueva con las aclaraciones técnicas del hito 4 y la forma real del lienzo en §13.1), `docs/STATE.md`.

- [ ] **Paso 1: test transversal** (por las CLIs, sin modelo): `run.mjs init` → una "opción" escrita a mano en `option-A/` (2 pantallas) → `git-state` + `options-check` (exit 0) → `leak-check` sin fuga → `approve.mjs save` + `record --write` + `verify` → un lote `files.mjs save`/`verify` sobre un archivo del proyecto → `run.mjs report-skeleton --implements <aprobado>` → `report.json` armado con un candidato → `report-check` exit 0. Variantes de "terminado honesto" (§12, un fixture por condición): sin la cita `implements` → `report-check` 1; con el sha del manifest cambiado → 1; con una afirmación contradicha → 1 y retirada; con `ui-check` en exit 1 (un `bloquea` nuevo) el test arma el veredicto con la lógica que describe el texto de las skills (T10) y espera `BLOCKED`. `to-canvas` sobre el mismo run → `manifest.json` con los sha256; una opción con `<script>` → exit 1 y sin carpeta `canvas/`. `compare.mjs options --kind tile` sobre tres tiles → `regenerate`.
- [ ] **Paso 2: con navegador** (`BROWSER_SKIP`): `browser.mjs measure` y `compare.mjs fingerprint --kind mockup` sobre una página servida por `serveRoutes`; `run.mjs menu` toma el `fail` de `browser.json`.
- [ ] **Paso 3: documentación** (español): CHANGELOG `0.5.0 — sin publicar` (qué trae, por qué 0.5.0, la tasa de diferencias falsas de A-18 medida en T4); README: "Antes de usar" (Node ≥ 22, Claude Code ≥ 2.1.271, el navegador instalado), "Dónde queda cada cosa" (carpeta del run, `project.json` y que desinstalar lo borra, aprobados), permisos (`acceptEdits` recomendado); spec §5.10 con R-3, R-4, R-6, R-7; `docs/STATE.md`.
- [ ] **Paso 4: suite completa.** `npm run test:ui` y `npm test` en verde; sin navegador (`PIGNOLO_UI_BROWSER=Z:/none/chrome.exe`) los tests de navegador salen `skip` visible; ningún `pignolo-ui-browser-*` nuevo en `%TEMP%`.
- [ ] **Paso 5: commit** `docs(pignolo-ui): hito 4a, versión 0.5.0`, y **revisión final opus** de `main..ui/hito-4` (foco: Review Focus 1, 3, 4 y 5; y que un `patch` de `DESIGN.md` con dos operaciones muestre bien las líneas del diff, deuda anotada), una pasada de arreglos y una confirmación acotada antes de unir.

---

# Parte 4b: agentes, skills y evals (versión 0.6.0)

## Ola 4 (T8 ∥ T9)

### Task 8: cartas de `ui-option` y `ui-auditor`

**Files:**
- Create: `plugins/pignolo-ui/agents/ui-option.md`, `agents/ui-auditor.md`
- Test: `tests/agents.test.mjs`

**Interfaces (frontmatter exacto, §7.4 y §10; la descripción va entre comillas por el linter):**
```yaml
name: ui-option
description: "Generates one static HTML option (mockup or style tile) along an assigned axis. No repo access."
tools: Write
model: sonnet
effort: medium
omitClaudeMd: true
```
```yaml
name: ui-auditor
description: "Audits one web screen from a prepared run folder against DESIGN.md, the rule catalog and written criteria; every finding cites evidence."
tools: Read, Grep, Glob
model: opus
effort: medium
```
- **Cuerpo de `ui-option` (inglés, ≤ 6 000 caracteres):** (1) la carta de patrones a evitar sin dirección de diseño: fondo crema u off-white; palabras en itálica dentro de titulares; rótulos numerados "01 / 02 / 03"; rótulos en monoespaciada; botones píldora; y las reglas de look del catálogo (THEME, COLOR-11/12/13, ICON-01, TYPE, LAYOUT-12, COPY-01), con la prioridad "`DESIGN.md` and its `intentional` decisions win over this list; the project's rejections come in the brief"; (2) las tres reglas del brief: do not invent content; no personal data or credentials; write only to the given path; (3) el contrato de salida R-3/R-4: un archivo por pantalla `option-<X>/<pantalla>.html` con `<meta charset="utf-8">`, sin scripts ni recursos remotos, enlaces `<a href="<pantalla>.html">`, `data-sample` y marcador visible `‹…›` en todo lo no provisto, franja "Datos de ejemplo", `data-primary="true"` en la acción primaria y, en style tiles, `:root` con `--color-primary`, `--font-body` y `--radius-sm|md|lg`; (4) no escribir titulares ni propuestas de valor de marca salvo que el brief los dé; (5) responder con una sola línea `done: <archivos>`.
- **Cuerpo de `ui-auditor` (inglés, ≤ 7 000 caracteres):** las 5 fases fijas (preparación, render, interacción, script, juicio con las normas), la salida de R-9 (bloque ```` ```json ```` con `findings`, `notVerified`, `independent`), y las reglas: never `bloquea` without script or browser evidence; no self-grade 1–5; hover, press and empty/loading/error states not reached from the URL go to `notVerified`; you read only the run folder and the screen files and cannot run scripts or the browser; what you say about the "look" never approves on its own.

**Tests literales (`tests/agents.test.mjs`):**
- [ ] El frontmatter de cada carta, parseado línea a línea, es **igual** al de arriba (clave por clave, incluido `tools: Write` sin más herramientas y `omitClaudeMd: true`). `ui-option` no menciona `Read`, `Bash`, `Grep`, `Agent` ni `mcp__` en `tools`; `ui-auditor` no tiene `Bash`, `Write`, `Edit`, `Agent` ni `mcp__`. **Rojo:** agregar `Read` a `tools` de `ui-option` → cae.
- [ ] `ui-option`: el cuerpo contiene (sin distinguir mayúsculas) los cinco patrones, las tres reglas, `data-primary="true"`, `--color-primary`, `--font-body`, `--radius-sm`, `<meta charset="utf-8">` y `Datos de ejemplo`; no tiene ninguna ruta absoluta.
- [ ] `ui-auditor`: contiene las cinco fases, las claves de hallazgo `id`, `severity`, `scope`, `plain`, `evidence`, `why`, además de `notVerified`, `independent` y las reglas. **El ejemplo JSON del cuerpo pasa `validateFindings`** (T3) contra un run sintético armado en el test (guarda de que la carta y el validador no divergen).
- [ ] El linter del plugin sigue en verde (nombres, descripción entre comillas, tamaños).
- [ ] Commit: `feat(pignolo-ui): cartas de ui-option y ui-auditor`.

### Task 9: skill `audit` y preparación compartida del run

**Files:**
- Create: `plugins/pignolo-ui/skills/audit/SKILL.md`, `skills/audit/reference/prepare-run.md`, `tests/support/skill-checks.mjs`
- Test: `tests/skill-audit.test.mjs`

**Interfaces:**
- `tests/support/skill-checks.mjs` (ayudas de los tres tests de skills): `readSkill(name) → { frontmatter, body, text }`; `scriptCalls(text) → [{ script, sub }]` (cada `node "${CLAUDE_PLUGIN_ROOT}/scripts/<x>.mjs" <sub>` que aparece); `assertScriptsExist(calls)` (el script existe y, para `run.mjs`, `design-md.mjs`, `files.mjs`, `approve.mjs`, `compare.mjs` y `browser.mjs`, el subcomando está en su lista de permitidos); `referencedFiles(text) → string[]` (rutas `${CLAUDE_PLUGIN_ROOT}/…` que la skill carga; deben existir).
- `skills/audit/SKILL.md` (inglés, ≤ 12 000 caracteres): frontmatter `name: audit`, `description` entre comillas, `disable-model-invocation: true`. Pasos: (1) `run.mjs env`, y **la primera línea impresa es `pignolo-ui <pluginVersion>`**; si `claude.ok` es falso lo avisa y marca "auditoría no independiente"; (2) cargar `reference/prepare-run.md` con comando `audit` (sin cambiar ningún archivo del proyecto); (3) lanzar el auditor con `subagent_type: "pignolo-ui:ui-auditor"`, `model: "opus"` y **solo la ruta de la carpeta del run**; (4) copiar su bloque JSON tal cual a `<run>/auditor.json` con `Write` y correr `run.mjs auditor-check`; los hallazgos con problemas se retiran del informe y se cuentan; (5) informe: severidades y deuda rotulada, **no bloquea**, primera línea de `run.mjs report-line`; sin tool Agent, o si un hook niega el despacho, el hilo principal audita y dice "auditoría no independiente".
- `skills/audit/reference/prepare-run.md`: el procedimiento compartido por las tres skills, en pasos: `run.mjs init`; `run.mjs config get` y, si falta `devUrl`, pedirla una vez y guardarla con `config set` (`browser.mjs` hace el `fetch` previo con plazo de 5 s; `--url` solo local); archivo en lugar de URL con la ruta confirmada por el usuario una sola vez; `design-md.mjs validate` (o `extract` si no hay `DESIGN.md` pero hay estilos: **como diff que el usuario confirma**, tokens marcados "extraídos, no decididos"); `browser.mjs measure`, `capture` y `dom` (en ese orden, mismo `--run`); `ui-check.mjs --dom <run>/dom-*.html --measures <run>/browser.json --run <run>`; sin navegador o con la URL caída, **flujo degradado dicho en la primera línea** (solo script sobre archivos) y respaldo con el MCP de navegador solo desde el hilo principal, confirmando cada paso con `location.href` y título, y lo que no permita queda "no verificado"; "requiere sesión" → "no verificado (requiere sesión)", sin automatizar el login; **presupuesto: como mucho 8 imágenes al contexto por comando**, el resto por ruta y sha256; las capturas nunca van al repo ni se publican.

**Tests literales (`tests/skill-audit.test.mjs`):**
- [ ] El frontmatter cumple el linter y `disable-model-invocation: true`; `SKILL.md` ≤ 12 000 caracteres; todo `scriptCalls` y `referencedFiles` existe (`assertScriptsExist`); la primera instrucción de los pasos es `run.mjs env` y el texto contiene literalmente `pignolo-ui <pluginVersion>`, `"pignolo-ui:ui-auditor"` y `model: "opus"`; **no** aparece `ui-auditor` sin el prefijo `pignolo-ui:` en una llamada; contiene `no bloquea` (o `does not block`) y `auditoría no independiente`, y ninguna ocurrencia de `Bash(`, `fullPage` ni de `!` seguido de acento grave.
- [ ] `prepare-run.md` menciona, en este orden, `run.mjs init`, `config get`, `design-md.mjs validate`, `browser.mjs measure`, `browser.mjs capture`, `browser.mjs dom`, `ui-check.mjs`; contiene `8` imágenes y `requiere sesión`.
- [ ] **Rojo:** quitar `auditor-check` del texto de la skill → cae el test de pasos.
- [ ] Commit: `feat(pignolo-ui): skill audit y preparación del run`.

**Tag de contrato:** unir T8 y T9 a `ui/hito-4` y etiquetar `contract/ui-4/v2`.

## Ola 5 (T10 ∥ T11)

### Task 10: skill `improve`, apoyo de opciones y de aplicar sin romper

**Files:**
- Create: `plugins/pignolo-ui/skills/improve/SKILL.md`, `skills/new/reference/options.md`, `skills/new/reference/apply.md`
- Test: `tests/skill-improve.test.mjs`

> **Nota de olas:** `options.md` y `apply.md` (compartidos con `new`) los escribe T10; T11 solo los referencia y escribe `present-and-choose.md`, que `improve` también carga. Ninguna tarea toca los archivos de la otra.

**Interfaces:**
- `skills/improve/SKILL.md` (≤ 12 000 caracteres). Pasos, en el orden de §8: (1) `env` y primera línea; (2) `prepare-run.md` con comando `improve`: URL o ruta, **inspección en lote** (`measure`, `capture`, `dom`, `ui-check`), el "antes", y el auditor sobre la carpeta del run + `auditor-check`; (3) **menú de síntomas en el chat**: `run.mjs menu --run <run>`, lista numerada pre-tildada con los ids entre paréntesis al final, y la respuesta va en el turno del usuario (sus palabras se traducen con `matchWords`); (4) N versiones con `options.md`; (5) presentación y elección con `present-and-choose.md` (T11); lo elegido se guarda con `approve.mjs save` + `record` (diff confirmado); (6) aplicar con `apply.md`; (7) **confirmación (≤ 1):** repetir `ui-check`, `measure --before <browser.json del antes>` y `capture` con los mismos anchos y temas, y armar el antes/después con hallazgos cerrados (cada uno citando el dato de la segunda lectura), hallazgos nuevos (los de piso **bloquean**), deuda sin tocar y la comparación estructural con el aprobado (`compare.mjs approved`, solo informativa); (8) informe y `report-check`. Topes de §6 en el texto: 1 inspección en lote → 1 ronda de versiones (+ ≤ 1 regeneración) → 1 lote de arreglos → ≤ 1 confirmación; "al llegar al tope, lo que queda se informa como pendiente". Si el problema está en `DESIGN.md`, primero se propone completarlo como diff. Cada versión (mockup, captura y diff) queda en el run.
- `skills/new/reference/options.md`: cómo lanzar las N opciones. Reglas literales: antes de la ronda, la **estimación** `≈ N corridas de ~X k tokens` con X de §15 (mockup en sonnet ≈ 13,5 k de entrada y 4,4 k de salida); en la instrucción de cada despacho, el texto `The user asked for ${user_config.optionsPerDecision} subagents for this decision.`; despacho **solo** con `subagent_type: "pignolo-ui:ui-option"` y `model: "sonnet"`, en paralelo y en un solo mensaje, con el **brief en el prompt, sin rutas** (brief confirmado, extracto de normas de `lib/norms.mjs`, tokens, eje asignado, rechazos, la carpeta de escritura `option-<X>/` y, en `improve`, los hallazgos elegidos más un **resumen en texto** de la captura "antes", nunca la imagen); ejes: mockups A densidad, B estructura, C énfasis; style tiles A contención, B calidez o editorial, C contraste alto (en `product`, B y C quedan en "contención con un acento" y varían tipografía y densidad); por opción, `run.mjs git-state` antes y `run.mjs options-check` después, y `leak-values` + `leak-check.mjs`; una opción que falla **no es un resultado**; `compare.mjs options` y, si dos coinciden, **regenerar una sola vez** la indicada en `regenerate`; si vuelve a coincidir, mostrarla con el aviso `B y C son muy parecidas`; **camino secuencial** cuando `optionsPerDecision` es `1`, no hay tool Agent, el modelo no delega, un hook niega el despacho (con el núcleo activo, hasta el hito 5) o `claude.ok` es falso: el hilo principal genera las opciones una tras otra, cada una con su eje, y la primera línea del informe es la de `report-line` con `sequential: true`; el conteo de subagentes sale de las llamadas a `Agent` que devolvieron resultado y el modelo real de `tool_response.resolvedModel` (si difiere del pedido, el informe lo dice).
- `skills/new/reference/apply.md`: §9 en pasos. (0) `approve.mjs verify` del aprobado (`BLOCKED` si algo no coincide). (1) Lista de archivos esperados (existe o se crea, tokens o estructura; **tope 5 archivos y 200 líneas por lote**; si no alcanza se parte en lotes y se avisa). (2) Si un archivo esperado tiene cambios sin commitear, pedir al usuario que commitee: **el agente no commitea**; fijar `<base>`. (3) `files.mjs save`. (4) Editar la fuente de tokens que ya existe. (5) `files.mjs verify` (delta contra el estado inicial), releer lo editado y correr el primer script que exista entre `typecheck`, `build` y `lint` (si no hay: "no verificado: el proyecto no declara build"). (6) **Revertir** si falla o el usuario rechaza: **mostrar al usuario la lista `unexpected` de `verify` antes de correr `restore`** (porque `restore` borra los archivos nuevos que el agente creó fuera de la lista) y nunca git destructivo. **"Terminado"** = `ui-check` en 0 en alcance (`--base <base>`) **y** `report-check` en 0 **y** build verde si existe; un `bloquea` en alcance, `report-check` en 1 o build roto → `BLOCKED` con la lista; salida 2 de `ui-check` o `report-check` → "sin verificar" con el motivo; los "no verificado" sueltos no impiden "terminado" pero se listan. `report.json` se arma con `run.mjs report-skeleton --implements <aprobado>` y debe citar el aprobado.

**Tests literales (`tests/skill-improve.test.mjs`):**
- [ ] `improve`: frontmatter y tamaño; las cadenas aparecen en este orden: `run.mjs env`, `prepare-run.md`, `run.mjs menu`, `options.md`, `run.mjs present`, `approve.mjs save`, `apply.md`, `compare.mjs approved`, `report-check.mjs`; contiene `--before`, `solo informativa` (o `informational only`) y los topes de §6; `assertScriptsExist` y `referencedFiles` en verde (el archivo `present-and-choose.md` de T11 puede faltar en la rama de la tarea: ese `referencedFiles` sale `skip` visible hasta la unión de la ola y corre completo después).
- [ ] `options.md`: contiene literalmente `The user asked for ${user_config.optionsPerDecision} subagents for this decision.`, `subagent_type: "pignolo-ui:ui-option"`, `model: "sonnet"`, `≈ N corridas de ~X k tokens`, `B y C son muy parecidas`, `sequential: true`, `resolvedModel`; **no** contiene `ui-option` sin el prefijo `pignolo-ui:` en una llamada de despacho ni ninguna ruta absoluta; `leak-check.mjs` aparece antes que `approve.mjs save`.
- [ ] `apply.md`: contiene `5 archivos` (o `5 files`) y `200`, `files.mjs save`, `files.mjs verify`, `unexpected` en una posición **anterior** a `files.mjs restore`, `BLOCKED`, `no verificado: el proyecto no declara build`, `report-check` e `implements`; no contiene `git reset`, `git checkout --`, `git clean` ni `git commit` salvo en la frase "does not commit".
- [ ] Commit: `feat(pignolo-ui): skill improve, opciones y aplicar sin romper`.

### Task 11: skill `new` y presentación/elección

**Files:**
- Create: `plugins/pignolo-ui/skills/new/SKILL.md`, `skills/new/reference/present-and-choose.md`
- Test: `tests/skill-new.test.mjs`

**Interfaces:**
- `skills/new/SKILL.md` (≤ 12 000 caracteres). Pasos de §7: (1) `env` y primera línea; (2) paso 0 `DESIGN.md`: si existe, `design-md.mjs validate` y completar como diff; si no existe y hay estilos, `extract` como diff, **sin direcciones nuevas salvo que el usuario las pida**; si el proyecto está vacío, N style tiles con `options.md` (`--kind direction`) y `present-and-choose.md`, **sin ronda de afinado**, y la elegida se guarda como `design/approved/direction/` con sus tokens pasando a `DESIGN.md` como diff; (3) **brief en texto** (qué es, quién la usa, acción principal, inventario de contenido **real**, orden de lectura) que el usuario confirma en su turno; lo que falta va como marcador `‹…›` con `data-sample`, nunca testimonios, logos, métricas, precios ni personas, y sin titulares de marca salvo que el usuario los dé (a pedido, 2 o 3 propuestas rotuladas); (4) N opciones, cada una un flujo navegable (`options.md`), con `ui-check` sobre cada pantalla; (5) elegir o combinar (`present-and-choose.md`); (6) implementar con `apply.md`, pasándole la ruta del aprobado; (7) verificación: `ui-check`, `browser.mjs` a los anchos del mockup, `compare.mjs approved` (informativa) y el auditor (como en `audit`); (8) informe y `report-check`. Topes de §6: 1 ronda de direcciones solo si el proyecto está vacío; 1 ronda de mockups (+ ≤ 1 regeneración); 1 implementación; 1 chequeo en lote; 1 lote de arreglos; ≤ 1 confirmación. Con el núcleo activo (completa el hito 5): el `implementer` del núcleo recibe la ruta del aprobado y la lista de archivos esperados; mientras el hook niegue `ui-option`, camino secuencial.
- `skills/new/reference/present-and-choose.md`: (a) `run.mjs present --presentation ${user_config.presentation}` con `--artifact yes|no` y `--design-type yes|no` según lo que tenga la sesión; si `consentNeeded`, preguntar **una sola vez por proyecto** ("subir mockups con marcadores, sin capturas ni código, a un lienzo privado") y guardar la respuesta con `config set --key canvasConsent --value true|false`; (b) con `mode: canvas`: `leak-values` y `leak-check.mjs` sobre las carpetas de opciones, después `to-canvas.mjs` y solo entonces invocar `Artifact` **una vez** con los archivos de `<run>/canvas/` (los mismos bytes del `manifest.json`), privado, y citar la URL en el informe; el lienzo publicado **no se relee** (única excepción al principio 2, declarada); con `mode: local`: `run.mjs compare-html` y decir la ruta en una línea; **never call Artifact when the mode is local**; (c) la **elección se confirma en el chat**: el comentario de un artboard sirve de insumo, pero se registra desde el turno del usuario con la cita literal; si combina, el hilo principal arma el flujo combinado, lo pasa por `ui-check` y lo muestra antes de implementar; (d) aprobar: `leak-check.mjs`, `approve.mjs save --flow <flujo>` y `approve.mjs record --quote-file` (diff mostrado y confirmado por el usuario, luego `--write`); el aprobado **no se edita nunca** (un cambio crea `<flujo>-v2`) y el agente no commitea.

**Tests literales (`tests/skill-new.test.mjs`):**
- [ ] `new`: frontmatter y tamaño; las cadenas aparecen en este orden: `run.mjs env`, `design-md.mjs`, `brief`, `options.md`, `present-and-choose.md`, `apply.md`, `compare.mjs approved`, `ui-auditor`, `report-check.mjs`; contiene `sin ronda de afinado` (o `no refinement round`), `‹`, `data-sample`, `design/approved/direction` y los topes de §6; `assertScriptsExist` y `referencedFiles` en verde.
- [ ] `present-and-choose.md`: el orden de las cadenas es `run.mjs present` → `leak-check.mjs` → `to-canvas.mjs` → `Artifact`; contiene `never call Artifact when the mode is local`, `canvasConsent`, `una sola vez` (o `once per project`), `no se relee` (o `is not read back`), `cita literal` (o `literal quote`) y `-v2`; en la lista de lo que se publica no figura la palabra `capture` en afirmativo (se revisa en la revisión final).
- [ ] **Contrato transversal de las tres skills** (en este archivo): ninguna usa `${CLAUDE_PLUGIN_DATA}` fuera de un argumento `--data`; el único `${user_config.*}` dentro de una línea de comando es `--presentation ${user_config.presentation}` (valor de la lista cerrada `auto|local`); las tres dicen "terminado" solo junto a `report-check` (las de `new` e `improve`; `audit` no dice "terminado"); ninguna dice `ui-option` o `ui-auditor` sin el prefijo `pignolo-ui:` en un despacho.
- [ ] Commit: `feat(pignolo-ui): skill new y presentación`.

## Ola 6

### Task 12: casos de eval de `ui-auditor` y `ui-option` (la corrida es decisión del autor)

**Files:**
- Create: `plugins/pignolo-ui/tests/evals/ui-cases.mjs`
- Modify: `.gitignore` de la raíz (`plugins/pignolo-ui/tests/evals/generated/`, si `tests/evals/generated/` no la cubre ya)
- Test: `tests/eval-ui-cases.test.mjs`

**Interfaces:** `node tests/evals/ui-cases.mjs --out <dir> [--agent auditor|option|ablation]` genera, a la manera de `tests/evals/review-cases.js` del núcleo, una carpeta por caso con `case.yaml` (`schema_version: "1.1"`, `context.scaffold_script: fixture.sh`), `prompt.md`, `fixture.sh` y `graders/*.md`; la salida va a `tests/evals/generated/`, que no se versiona. Los fixtures son **sintéticos** y los PNG no se versionan: el `fixture.sh` arma el run con **los scripts reales** (`ui-check.mjs`, `browser.mjs measure|capture|dom`) sobre páginas escritas por el generador; sin navegador, el generador falla con un mensaje claro (la eval se corre en la máquina del autor).
- **Auditor** (entradas congeladas, §16.3): 5 casos con defecto sembrado y 3 páginas limpias, cada uno con una carpeta del run completa. Defectos: `COLOR-03` (texto gris sobre blanco; evidencia en `browser.json`), `STATE-04` (`outline: none` sin foco), `LAYOUT-11` (scroll horizontal a 320 px), `J-01` (dos acciones primarias iguales: solo juicio, evidencia de captura o `file:line`), `A11Y-16` (campo con solo placeholder). Graders: **recall** = el bloque JSON del informe trae un hallazgo con el `id` sembrado (regex sobre el `tool_result` del `Agent`, como los graders del núcleo); **forma** = el bloque trae las claves obligatorias; **falso positivo en página limpia** = ningún hallazgo con `severity` `bloquea` o `alto`; y de proceso (despachó `pignolo-ui:ui-auditor` con `opus`, una sola vez, y no usó `Bash`, `Write` ni `Edit`).
- **`ui-option`** (solo chequeos de forma, §16.3): 3 casos (mockup de 2 pantallas, style tile, versión de `improve` con resumen de la captura "antes") con el brief en el prompt; el fixture trae un **archivo trampa** en el repo con un token inventado (`PIGNOLO_TRAP_7f3a`) que no puede aparecer en ninguna salida. Graders: archivos esperados existen y pesan > 0, charset, sin scripts, enlaces internos resueltos, `data-sample` en lo no provisto, el token trampa **no** aparece, y la diferencia entre las 3 opciones sobre el umbral de §7.5 (un grader final corre `compare.mjs options` sobre el fixture de cierre).
- **Ablación** (informativa): el mismo brief con y sin el plugin, ≥ 5 corridas, medida con los chequeos deterministas (`ui-check` y `options-check`); no es compuerta (§0.1 punto 7).
- La rama sonnet del auditor no se corre (revisores y auditores en opus, CLAUDE.md).

**Tests literales (`tests/eval-ui-cases.test.mjs`, sin red y sin gastar nada):**
- [ ] Con `--out` temporal y navegador disponible: se generan 8 casos de auditor, 3 de `ui-option` y 1 de ablación; cada uno tiene `case.yaml`, `prompt.md`, `fixture.sh` y ≥ 1 grader; los ids de defecto sembrados son exactamente `COLOR-03`, `STATE-04`, `LAYOUT-11`, `J-01`, `A11Y-16`. Sin navegador → `skip` visible.
- [ ] **Los fixtures sembrados disparan lo que dicen** (lo que hace útil la eval): se ejecuta el `fixture.sh` de cada caso de auditor en una carpeta temporal y se comprueba, con las CLIs reales, que `ui-check.json` o `browser.json` traen un `fail` del id sembrado en los casos de script o navegador, y **ningún `fail` de piso** en las 3 páginas limpias (si no, la página "limpia" no lo es). Con `BROWSER_SKIP` para los de navegador.
- [ ] Los graders de recall **aceptan** un informe de ejemplo con el hallazgo correcto y **rechazan** uno sin él (se ejecuta la regex del grader sobre dos cadenas armadas en el test); el grader de falso positivo rechaza un informe con un `alto` en página limpia. **Rojo:** quitar el id del regex de un grader → cae el caso que lo acepta.
- [ ] El token trampa aparece en el fixture de los casos de `ui-option` y en ningún archivo bajo `agents/`, `skills/` ni `catalog/` del plugin.
- [ ] Commit: `test(pignolo-ui): casos de eval de ui-auditor y ui-option`.
- [ ] **D-4-1 aprobada (tope 22 USD): la corrida de evals se ejecuta después del 5 de octubre, no antes.** Orden fijo con los frenos del hito 4b del núcleo (sonda → calibración → completa → ablación, cada etapa con tope propio; si un tope o un freno corta una corrida se frena y se vuelve al autor): `claude plugin eval . --eval-dir <generated> --case <caso> --runs 1 --ablation none --scaffold --trust-plugin --keep-temp --max-cost-usd <tope> --json <archivo>` (una corrida por caso, G14; trazas copiadas a una carpeta persistente, G13 y G17). Resultados a `plugins/pignolo-ui/tests/evals/RESULTS.md`.

## Ola 7: cierre de 4b

### Task 13: checklist manual, documentación y versión 0.6.0

**Files:**
- Create: `plugins/pignolo-ui/tests/manual/hito-4.md`
- Modify: `plugins/pignolo-ui/.claude-plugin/plugin.json` (`version` 0.6.0), `CHANGELOG.md`, `README.md`, `docs/STATE.md`
- Test: `tests/hito-4b-acceptance.test.mjs`

- [ ] **Paso 1: test transversal de 4b** (sin modelo): para cada skill, `scriptCalls` y `referencedFiles` existen; `plugin.json` conserva `optionsPerDecision` y `presentation` con sus `options` y valores por defecto (`"3"`, `"auto"`) y **no** tiene `language` ni `dependencies`; los dos agentes existen y el linter del plugin sigue en verde; el CHANGELOG tiene la entrada `0.6.0` y la versión de `plugin.json` coincide con la de esa entrada.
- [ ] **Paso 2: checklist manual** `tests/manual/hito-4.md` (Windows nativo, sesión real; es la §16.4, no una lista nueva): `new`, `improve` y `audit` de punta a punta; en Opus 5 y en otro modelo, cuántos subagentes se lanzaron y con qué modelo; camino secuencial forzado (`optionsPerDecision = 1`); con y sin la herramienta Artifact o el tipo "Design", con y sin consentimiento (se pide una vez por proyecto; sin él, el prototipo local con su aviso); **lienzo:** navegar las opciones en modo Play, comentar un artboard y confirmar que la elección se registra desde el turno del chat, **y confirmar la sintaxis de enlaces y estados del generador (R-7, D-4-2)**; pantalla detrás de login → "no verificado (requiere sesión)"; sin navegador ni MCP → degradado en la primera línea; Claude Code por debajo de 2.1.271 → aviso y camino secuencial; instalación y actualización real (cambia la versión impresa); `${CLAUDE_PLUGIN_DATA}` con una ruta con espacios; `node` con permiso negado → mensaje claro; en modo `default` las escrituras de los subagentes piden permiso; pipe y `npm test` en Node 22; prueba con lector de pantalla (A11Y-40, recomendada, nunca compuerta). Las filas "con el núcleo instalado" quedan para el hito 5.
- [ ] **Paso 3: documentación:** CHANGELOG `0.6.0 — sin publicar` (agentes, skills, motivo del salto, qué cambia para el usuario: tres comandos, permisos, costo por flujo con la tabla de §15 y las corridas por flujo con 3 opciones: `new` en proyecto vacío 7 (+ hasta 2), con `DESIGN.md` 4, `improve` 4, `audit` 1); README: los tres comandos, `userConfig`, qué se publica y qué nunca, "desinstalar borra las URLs y rutas confirmadas", y el aviso legal de A-08 con sus enlaces oficiales fechados si el README del hito 1 aún no los trae; `docs/STATE.md` (hito 4 construido y qué sigue: hito 5).
- [ ] **Paso 4: suite completa** `npm test` en verde (núcleo incluido) y sin restos de procesos ni carpetas temporales.
- [ ] **Paso 5: commit** `docs(pignolo-ui): hito 4b, versión 0.6.0`, y **revisión final opus** de `ui/hito-4` desde la etiqueta de 4a (foco: Review Focus 1, 2, 3 y 6; que los textos de las skills no se contradigan entre sí; que los topes de §6 estén en las tres), una pasada de arreglos y una confirmación acotada.

---

## Decisiones del autor (todas decididas el 2026-09-30)

**D-4-1 — Costo de las evals de agentes (§16.3): DECIDIDA el 2026-09-30: aprobadas, tope total de 22 USD, a correr después del 5 de octubre.** Estimación a partir de lo medido (`tests/evals/RESULTS-hito-3.md`: revisores opus 0,077 a 0,116 USD por corrida con entradas chicas; `RESULTS-hito-4.md`: test-writer en sonnet ≈ 0,03 a 0,06 USD por corrida; tokens de §15: auditor ≈ 20 k de entrada y 3,2 k de salida en opus, `ui-option` en sonnet ≈ 13,5 k y 4,4 k). El auditor trae una carpeta del run completa, así que se espera **0,15 a 0,25 USD por corrida**; `ui-option` 0,06 a 0,10; la ablación (en la sesión principal, con y sin plugin) 0,10 a 0,15. Son extrapolaciones, no mediciones: la sonda las corrige.

| Etapa | Corridas | USD estimados |
|---|---|---|
| Sondas y calibración (1 por caso: 8 de auditor, 3 de `ui-option`, con reintentos) | ≈ 16 | 2 a 3,5 |
| Completa del auditor (8 casos × 5) | 40 | 6 a 10 |
| Completa de `ui-option` (3 casos × 5) | 15 | 0,9 a 1,5 |
| Ablación (3 briefs × 5 × con y sin plugin) | 30 | 3 a 4,5 |
| **Total** | ≈ 100 | **≈ 12 a 19,5** |

- **Decidido:** **tope total de 22 USD** con topes por etapa (sonda 1, calibración 4, auditor 12, `ui-option` 2, ablación 5) y los frenos del hito 4b del núcleo; se corre **después del reinicio del 5 de octubre** (uso semanal del autor al 88 %, STATE), no antes. Si el recall del auditor < 80 % y sube a `effort: high`, esa etapa cuesta ≈ 1,5× y se vuelve al autor si el tope no alcanza.
- *Descartada:* la alternativa barata (solo auditor y `ui-option`, sin ablación, ≈ 9 a 15 USD, tope 16); la ablación es informativa (§0.1 punto 7), no compuerta, y queda dentro del tope aprobado.
- Las evals corren en Windows, como las del `test-writer` (los dos agentes no tienen Bash); §16.3 dice WSL2 por los agentes con shell, y allí no está el navegador de Windows que arma los fixtures.

**D-4-2 — Lienzo privado de prueba en claude.ai: DECIDIDA el 2026-09-30: aprobado crear UN lienzo privado de prueba, de 2 pantallas.** Las instrucciones del tipo "Design" ya se leyeron (solo lectura), pero la sintaxis exacta de enlaces entre artboards y de estados forzados vive en `artifact-type/reference/format.md`, que **solo se sirve al crear un lienzo** (R-7). Un solo lienzo privado con 2 pantallas sintéticas del propio generador (sin datos de ningún proyecto), para leer `format.md` y ajustar `lib/canvas.mjs` antes de la revisión final de 4b; borrarlo al terminar sigue requiriendo la confirmación del autor en ese momento.

**D-4-3 — Alcance del criterio escrito del auditor (R-10): DECIDIDA el 2026-09-30: aprobado, v1 con `norms/base.md` y ≤ 25 criterios `J-nn`.** El catálogo trae 37 reglas con checker; el resto de las ~125 de guía no se escriben una por una. Los criterios de juicio `J-nn` (jerarquía, orden de lectura, una acción primaria, heurísticas de Nielsen, decisiones explícitas) se miden en la eval (recall ≥ 80 %); ampliar el catálogo queda fuera del hito.

**D-4-4 — Probar `improve` en una app real antes de unir: DECIDIDA el 2026-09-30: aprobado, una app real del autor.** Al llegar a ese punto (después de T7 y antes de la revisión final de 4a) **se le pide al autor cuál app y la URL**; no se asume ninguna. Resultados solo en `local/`. Cubre A-18: si la diferencia falsa de `compare` pasa de 30 %, pasa a v1.1.

**Revisado contra lo reservado (sin otra decisión):**
- *Costos:* solo las evals (D-4-1, aprobada con tope de 22 USD); los scripts y el SEO no gastan tokens, y el costo en uso real es el de §15 (la estimación se muestra al usuario antes de cada ronda, §7.2).
- *Publicar artifacts o el lienzo:* ningún test ni script del plan invoca `Artifact`; la skill solo lo invoca con `mode: canvas` (cuatro condiciones, consentimiento por proyecto, A-20), tras `leak-check` y solo con mockups con marcadores. Crear el lienzo de prueba es D-4-2.
- *Dependencias:* ninguna (sin npm ni binarios; el navegador es el instalado, A-07).
- *Cambios de contrato:* ninguno público. `browser.mjs`, `ui-check`, `report.json`, `browser.json` y el esquema `pignolo:` no cambian; se agregan archivos internos (`project.json`, `auditor.json`, `canvas/manifest.json`) y subcomandos de `run.mjs`. **La allowlist del núcleo (A-11) no se toca:** es del hito 5, con la decisión de contrato ya tomada por el autor (2026-09-28).
- *Push, borrar y legal:* nada se empuja; el único borrado nuevo es la poda de `.pignolo-ui/runs/` de más de 14 días (spec §3.2, ya decidida), y `restore` ya existe (§9: se muestra la lista antes). El aviso legal de A-08 solo va en el README.

## Contradicciones y huecos del spec encontrados

1. **§13.1 "los detalles del formato los fija el plan"** y §7.5 "pantalla principal" sin definirla: R-3 (la primera del brief) y R-7 (formato del tipo "Design", con lo no verificado marcado).
2. **§7.5 "columnas a 1440 px" y "posición de la acción primaria"** no dicen cómo medirlas ni qué hacer sin acción primaria: R-6 (`data-primary`, heurística, `null` cuenta como igual).
3. **§7.5 style tiles** (ΔH del primario, familia tipográfica, escala de radios) no dice de dónde salen los valores de un HTML: R-4 (variables de `:root` con nombres fijos).
4. **§13 vs el tipo "Design":** el tipo exige que la entrada se llame `Main.dc.html` y que los nombres no se repitan entre opciones; se resolvió con `Main.dc.html` = primera pantalla de la opción A y `<opción>-<pantalla>.dc.html` para el resto (T5).
5. **§10 "cada hallazgo cita evidencia"** no fija un formato de salida que el hilo principal pueda validar sin un LLM: R-9 y `auditor-output`.
6. **§12 "el informe se escribe como `report.json` más texto"** deja a la skill armar a mano un contrato con sha256: `report-skeleton` genera candidatos y evidencias; la skill solo agrega el texto.
7. **§11.2 "la URL se pide la primera vez y se guarda"** necesita un escritor de `project.json` (§3.2 "solo los scripts"): `run.mjs config` (T2, T6).
8. **§0 "al arrancar, cada comando corre `claude --version`"** choca con el shim `.cmd` de Windows: R-5.
9. **Deuda anotada en STATE "antes del hito 4"** que este plan no absorbe: líneas del diff de varias operaciones en `design-patch` (afecta lo que se muestra al usuario en `new` paso 0; la revisión final de 4a lo verifica con un `patch` de dos operaciones y, si falla, lo arregla en la pasada) y el frontmatter de skills (lo cubren T8 a T11: el linter ya lo exige).
10. **El filtro `pii-patterns` del núcleo (§13) y el registro en `decisions/` (§14)** necesitan el núcleo: hito 5; hoy el texto de las skills se limita a `leak-check` y a la elección en el chat.
