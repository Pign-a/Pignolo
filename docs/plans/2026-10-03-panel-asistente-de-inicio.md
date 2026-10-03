# Panel de pignolo, etapa 3: asistente de inicio. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, una revisión final opus **propia** (toca `prompt.submit` y un hook de arranque del núcleo) con una pasada de arreglos (CLAUDE.md). Tarjetas con archivos, interfaces y casos de test literales. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Va después de la etapa 2** (`2026-10-03-panel-pestana-ui.md`, `pignolo-panel` 0.2.0, ya en `main`) y del init rápido (núcleo 0.17.0+). Toca el núcleo (script, lib, hook de arranque, skill `init`) **y** el panel.
>
> **Versiones:** `pignolo-panel` **0.3.0**. Núcleo **0.20.0** (hoy `main` está en 0.18.0 y la etapa 2 de la guardia va a ser 0.19.0). **El número del núcleo se renumera al unir**: es "la siguiente libre"; cambian solo `plugin.json`, el CHANGELOG y el texto de este plan (T6).
>
> **Pedido del autor (2026-10-03):** al abrir Claude Code en un proyecto que aún no usa pignolo (pignolo instalado, sin `.pignolo/project.md`), el panel se abre solo con un asistente de pocos pasos: cada uno con lo que pignolo detectó y la opción recomendada marcada; "vas haciendo clic y configurando todo el proyecto". **Lo más lindo posible**: bordes redondeados, todo ordenado en tamaños y visuales. El mockup del autor está aprobado y se respeta.

## Mockup aprobado (70 columnas, borde redondeado)

```
╭─ Empezar con pignolo ──────────────────────────────── paso 2 de 5 ─╮
│ ▰▰▱▱▱                                                              │
│ ¿Qué perfil de modelos usamos?                                     │
│                                                                    │
│  a  balanceado · recomendado    sonnet para construir, opus revisa │
│  b  económico                   todo en sonnet, ≈ 40 % menos       │
│  c  máximo                      opus en todo, el más caro          │
│                                                                    │
│ ← Esc atrás                                  Enter siguiente →     │
╰────────────────────────────────────────────────────────────────────╯
```

Pasos: **1** el proyecto (lenguaje, cómo se corren los tests, rama principal: confirmar o corregir), **2** perfil de modelos, **3** permisos (resumen llano por regla), **4** carpetas (estructura propuesta y lo que movería), **5** UI (solo con pignolo-ui: definir producto y diseño ahora o más tarde), **6** resumen y aplicar. Sin pignolo-ui son 5 pasos (el 5 es el resumen); con pignolo-ui, 6. Si no hay carpetas candidatas, el paso 4 se omite y la frase de las carpetas que se crean va dentro del resumen.

## Restricción de diseño (decidida): el panel no escribe nada

"Aplicar" envía las elecciones como **un solo mensaje del usuario**, dirigido a `/pignolo:init`, con el mismo patrón ya revisado: un único `prompt.submit` en `submitText`, una vez, releyendo antes, una línea y sin invisibles. **Quien escribe es `init`**, con sus controles de siempre (paso 0, vista previa, pantalla final de confirmación, cancelar deja todo igual). El mod no suma ninguna llamada que escriba o ejecute: la lista `calls:` queda igual (T6 lo prueba).

## Rulings técnicos

- **D-W1: la detección sale de `init.js`, no se reimplementa en el mod.** El mod no corre procesos (sin `process`, sin `$.exec`, sin `$.fs.write`). Un verbo nuevo **`init.js wizard-detect`** (solo lectura del proyecto) arma el resultado con las mismas funciones que `detect` (`detectProject`, `detectPlaces`, `blankProject`, `buildSummary`) y lo deja en un archivo que el mod lee con `$.fs.read`. Una sola fuente de verdad: lo que el asistente muestra es lo que `init` va a usar.
- **D-W2: dónde se escribe el resultado: `<main>/.git/pignolo/wizard-detect.json`** (esquema `pignolo-wizard-detect/1`). Razón: antes de activar pignolo no existe `.pignolo/`, y crearlo (o dejar un archivo suelto en el árbol) ensucia `git status` de un proyecto que todavía no pidió nada. Dentro de `.git/` no se versiona ni molesta. Límites: solo si `.git` es una carpeta (no un archivo de worktree ni de submódulo; ahí no se escribe nada y el asistente no se abre: queda `/pignolo:init`). Escritura por archivo temporal y renombre; nunca fuera de `<main>/.git/pignolo/`; una ruta con junction o symlink en el camino se rechaza (reusa `real-path.js`).
- **D-W3: quién dispara la detección: el hook `SessionStart` del núcleo.** Solo cuando **no** hay `.pignolo/project.md`, pignolo no está apagado y la fuente es `startup` o `resume`; con presupuesto propio de 3 s; al vencer o fallar, silencio y **sin archivo** (y se borra uno viejo para que no engañe). Nunca bloquea el arranque ni cambia su salida. Con `project.md` presente, el hook no hace nada nuevo (guarda de regresión).
- **D-W4: "una sola vez por proyecto" lo decide el hook, no el mod** (el mod no escribe). El archivo lleva `offer: true` **solo la primera vez**; en ese momento el hook deja el marcador `<main>/.git/pignolo/wizard-offered` y las sesiones siguientes escriben `offer: false`. El mod abre solo si `offer === true` y no lo abrió ya en esta sesión (`wizardOpened`, en memoria). Rechazar (Esc en el paso 1) también cuenta como visto. `/pignolo-panel wizard` lo abre a mano cuando el usuario quiera, sin importar `offer` (usa el archivo de la sesión; si no hay, avisa "corré /pignolo:init").
- **D-W5: el formato de las elecciones es un JSON compacto de una línea**, no una frase libre: **`/pignolo:init --choices <json>`**. Un archivo (`lib/init-choices.js`) lo valida y lo normaliza (T2); el mod lo arma desde un modelo puro (T3). Campos (`v`: 1):
  - `id`: el `id` de la detección que vio el usuario (12 hex). Si al correr `init` la detección actual da otro `id`, `init` lo dice y muestra la diferencia en la pantalla final.
  - `project`: `"confirm"` (adoptar lo detectado) o `"review"` (el usuario quiere corregir: `init` recorre "Review point by point" desde el tipo y los gates).
  - `profile`: `"balanced"|"economy"|"max"`.
  - `perms`: `"user"|"project"|"none"` (dónde agregar las reglas de permisos de pignolo; `user` recomendado).
  - `places`: `{ "<tipo>": "adopt"|"move"|"leave" }` solo para los tipos de `places.candidates`; ausente = lo recomendado por `summary.recommendedPlaces`.
  - `ui`: `"now"|"later"`, **solo** si el mod detectó pignolo-ui; `now` = al terminar `init`, ofrecer `/pignolo-ui:define` (el mod no lo envía junto: `init` lo ofrece como último paso y el usuario lo acepta).
  - `blank`: `true` en repo en blanco (el resto de los campos se ignora).
  - Largo máximo del mensaje: 700 caracteres; sin saltos de línea. Los valores son enumerados (nada de texto libre del usuario en v1): no hay camino para colar una instrucción por las elecciones.
- **D-W6: `init` acepta las elecciones sin volver a preguntar lo ya elegido, pero la pantalla final no se salta.** Con `--choices` válido, `init` (a) corre `detect`, (b) arma el plan con esas respuestas (`answers.profile`, `answers.places`, `approved` = `summary.recommended`), (c) corre `preview`, (d) muestra **siempre una sola pantalla de confirmación** con lo que se va a escribir (de la vista previa) y lo que cambió respecto de lo que vio el asistente (`id` distinto, `refused` nuevos, mudanzas), con tres opciones: Aplicar / Revisar punto por punto / Cancelar. El "sí" del selector vale solo para esa pantalla (regla existente). Solo se siguen preguntando `public`, `piiPatterns` y `channel` (`summary.ask`), porque el asistente no los cubre: se hacen en **una** llamada de `AskUserQuestion` antes de la vista previa. Con `--choices` inválido o de versión desconocida: se ignora entero y corre el flujo de siempre (no se adivina nada).
- **D-W7: permisos y perfil los escribe `init` con los scripts de siempre.** Hoy perfil y permisos son de `setup`. Con `--choices`, `init` aplica `profile` y `perms` con `setup.js config --profile <p>` y `setup.js permissions --target <t> --apply` (los que `setup` ya usa, con su respaldo), **después** del "sí" de la pantalla final y dentro del mismo "Aplicar" del usuario. Sin `--choices`, `init` no cambia (guarda de regresión).
- **D-W8: el mensaje es un comando.** Lo que se envía empieza con `/pignolo:init --choices {…}`. **Hay que probar si `prompt.submit` con texto que empieza con `/` ejecuta el comando o llega como texto** (sonda W1). Si no ejecuta, el respaldo es la frase fija `Activá pignolo en este proyecto con estas elecciones: --choices {…}`, que la descripción de la skill `init` ya activa por lenguaje natural (el paso 0 pregunta confirmación: aceptable).
- **D-W9: sin `Raster`.** Todo el asistente es texto con los caracteres `▰▱╭╮╰╯│─←→▸` (una celda cada uno). Desktop sin `Raster` lo dibuja igual; un test lo fija.
- **D-W10: ancho fijo de 70 columnas** (como el mockup). Si el panel tiene menos de 72 columnas el asistente no se abre solo (se evita un dibujo roto) y `/pignolo-panel wizard` dice cuánto falta. La autoapertura reusa los mínimos de la de decisiones (`OPEN_FIRST_COLS`).
- **D-W11: la detección rota o faltante no deja nada a medias.** Sin archivo, con `schema` desconocida, JSON inválido, `id` ausente o un paso con forma imposible: el asistente **no se abre** y no hay mensaje de error (el panel normal sigue; queda `/pignolo:init` de siempre). Con `/pignolo-panel wizard` a mano sí avisa en una línea.

## Hechos de la doc de mods (a verificar en Task 0; no se asumen)

Fuente: `https://code.claude.com/docs/en/plugins/mods/interface`, `/api` y `/reference`. De la etapa 2 ya están verificados: `$.fs.read/exists/list`, `$.ui.open({ id, title, focus, closeOnEscape })`, `Box`, `Text`, `Button({ hotkey, plain, dimColor, onPress })`, `$.ui.invalidate('ui.render')`, `$.prompt.submit({ text, asUser: true })`, `$.plugin.root`, `$.session.cwd`. **Por verificar:** `Select` e `Input` (elementos de la doc de interfaz; el plan usa `Button` con `hotkey`, ya probado en el panel, y deja `Select` como mejora si la sonda W2 lo muestra mejor), cómo se reciben `Enter` y `Esc` con `closeOnEscape: false` y cómo se maneja el foco entre pasos.

## Task 0 (sin código): sondas y relectura

- Releer sobre `main`: `hooks/register.js` (`openPane`, `paneTree`, `checkNewDecisions`, `submitText`, `LETTERS`), `tests/panel-trust.test.js` (lista `ALLOWED`), `scripts/init.js` (`detect`, `main`, `parse`), `lib/init-summary.js`, `lib/init-blank.js`, `skills/init/SKILL.md`, `scripts/setup.js` (`check`, `config`, `permissions`), `templates/permissions.json` y `hooks/handlers/session-start.js`. Anotar cómo agrupa `setup.js permissions` las reglas "por propósito" (de ahí sale el texto del paso 3) y de dónde sale la rama principal (si `detectProject` no la trae, `wizard-detect` la lee con `git symbolic-ref --short HEAD` sobre `<main>`).
- Sondas con `claude` real (a un archivo del job; lo que no se pueda obtener se anota "no probado" y manda lo conservador):
  - **W1** `prompt.submit({ text: '/pignolo:init --choices {"v":1,"blank":true}', asUser: true })`: ¿ejecuta el comando o llega como texto del usuario? Decide D-W8.
  - **W2** teclas: con `closeOnEscape: false`, ¿cómo llegan `Esc` y `Enter` al mod (`Button` con `hotkey: 'escape'` / `'return'`, o un `Select`/`Input` con foco)? Si `hotkey` no admite esas teclas, el respaldo es `Button` con letras `a b c` para elegir, `n` siguiente y `p` anterior, y el pie dice esas teclas (el test de pie de T4 se adapta, no se afloja).
  - **W3** ¿`$.fs.read` lee dentro de `.git/`? ¿`$.fs.exists` sobre `.git` distingue carpeta de archivo? (D-W2). Si no, el respaldo es `<main>/.pignolo/wizard-detect.json` con un `.gitignore` propio de `*`, y se anota.
  - **W4** `claude plugin validate` con el código nuevo del mod (cero llamadas nuevas, en principio): confirmar que la lista `calls:` no cambia.
  - **W5** cuánto tarda `init.js wizard-detect` en un repo mediano (el presupuesto de D-W3 es 3 s).

## Global Constraints

- Node ≥ 22, sin dependencias npm; `node:test` vía `npm test` (no `node --test tests/`); código del mod en JS plano, igual que las etapas 1 y 2; nombres de elementos en inglés, mensajes al usuario en español, commits en español, LF sin BOM; un archivo de test por vez.
- El mod sigue sin `process`, sin red propia y sin escribir archivos. **Cero llamadas nuevas** en `$.*`.
- Un fallo de cualquier lectura no tira el mod ni muestra error: el asistente no se abre (D-W11).
- Todo texto de una línea y sin caracteres invisibles (`hasHiddenChars` de `state.js`), incluido el mensaje que se envía.
- El repo es público: fixtures sintéticas, nada del proyecto del autor.

## Método de ejecución

- **Rama:** `feat/panel-asistente` desde `main`. Un commit por tarjeta. Un solo ejecutor en serie.
- **Orden:** Task 0 → T1 → T2 → T3 → T4 → T5 → T6 → revisión opus de `main..feat/panel-asistente` (**propia**: hook de arranque del núcleo, `prompt.submit`, escritura dentro de `.git/`; no se agrupa) → una pasada de arreglos → suite completa una vez sobre la rama unida con `main` → unión → **pignolo-panel 0.3.0** y núcleo **0.20.0** (renumerar si cambió).
- **Auditoría previa del plan:** no es obligatoria. **Sí** si el ejecutor ve que T1 necesita escribir en un lugar distinto de `.git/pignolo/` (toca privacidad y escritura en el repo del usuario).
- **Autochequeo del ejecutor (con evidencia, máximo 5):** (1) `wizard-detect` solo escribe dentro de `<main>/.git/pignolo/`: con `.git` archivo (worktree), con `.git/pignolo` enlazado fuera por junction o symlink y con el proyecto en otra capitalización de ruta no escribe fuera; (2) un `wizard-detect.json` que no es UTF-8, vacío, enorme (> 64 KB) o con BOM no tira ni al mod ni al hook; (3) el lector del mod usa la forma nueva del archivo y `init` la misma validación (un solo `lib/init-choices.js`); (4) el JSON de las elecciones, en una carpeta con comillas, tildes o llaves en el nombre, sigue siendo una línea válida; (5) cada afirmación del informe marcada "probado" o "no probado".

## Vista de cada paso (texto)

Todas las pantallas comparten el marco del mockup (70 columnas). Las filas de opciones siempre llevan `letra`, columna 2 de 28 y columna 3 con el resto.

```
Paso 1  ¿Es así tu proyecto?
  Lenguaje        Node (TypeScript)
  Tests           npm test
  Rama principal  main
  a  sí, es así · recomendado    lo dejo como está detectado
  b  quiero corregir algo        te lo pregunto de a una cosa, en el chat

Paso 3  Permisos (lo que pignolo agrega a Claude Code)
  Bloquea       los comandos de git que pierden trabajo (reset --hard, push -f…)
  Pregunta      antes de borrar ramas y etiquetas
  No pregunta   push y merge normales
  a  para todos tus proyectos · recomendado    una vez y listo
  b  solo este proyecto                        queda en este repo
  c  ninguno                                   lo decidís más tarde con /pignolo:setup

Paso 4  Carpetas (solo si hay candidatas)
  docs/specs  ← diseno/     adoptar · recomendado    se usa donde está, no se mueve nada
  (a adoptar, m mover, d dejar, por fila)
  Sin candidatas: se omite y el resumen dice "Creo docs/specs, docs/plans, docs/research, design y local".

Paso 5  Interfaz (solo con pignolo-ui)
  a  más tarde · recomendado    al terminar te ofrezco definir producto y diseño
  b  definir ahora              /pignolo-ui:define al terminar init

Último paso  Resumen
  Proyecto · perfil · permisos · carpetas · UI, una línea cada uno
  Enter aplicar: manda tus elecciones a /pignolo:init; init muestra la vista previa y pide el sí
```

Repo en blanco (una sola pantalla, sin pasos): "Este proyecto está en blanco: no hay código ni configuración todavía. Solo puedo crear la estructura de carpetas." `a` crear la estructura (envía `{"v":1,"blank":true}`), `b` más tarde (cierra; cuando haya código, `/pignolo:init`).

## Tarjetas

### T1: detección para el asistente (núcleo: `lib/wizard-detect.js`, `scripts/init.js`, `hooks/handlers/session-start.js`)

- [ ] **Archivos:** `plugins/pignolo/lib/wizard-detect.js` (nuevo), `plugins/pignolo/scripts/init.js` (verbo `wizard-detect`, sin tocar los otros), `plugins/pignolo/hooks/handlers/session-start.js` (una llamada protegida), `tests/wizard-detect.test.js`, fixtures sintéticas (Node con tests, en blanco, con carpetas candidatas).
- [ ] **Interfaces:**
  - `buildWizardDetect({ main, run, env }) -> object`: `{ schema: 'pignolo-wizard-detect/1', id, blank, project: { type, stacks[], tests: { cmd|null, state: 'declared'|'none'|'placeholder' }, main: 'main'|null }, profiles: [{ id, label, line, recommended }], permissions: { groups: [{ id: 'blocks'|'asks'|'free', line }] }, places: { candidates: [{ kind, from, to, decision, moves: [{ from, to }], note|null }] }, offer }`. `id` = primeros 12 hex de sha256 del contenido estable (sin `offer`). Todo texto de una línea, sin rutas absolutas ni nombres de usuario; `line` en español llano (única fuente de las frases del asistente).
  - `writeWizardDetect(main, data) -> { path } | { skipped: reason }`: crea `<main>/.git/pignolo/` si hace falta; archivo temporal y renombre; `skipped` si `.git` no es una carpeta real o la ruta pasa por un enlace.
  - `offerFirst(main) -> boolean`: lee o crea `.git/pignolo/wizard-offered`; verdadero solo la primera vez.
  - `init.js wizard-detect [--cwd <dir>] [--write]`: sin `--write` imprime el JSON; con `--write` lo guarda e imprime la ruta. Código 0 salvo uso incorrecto (2). **No** escribe `.pignolo/` ni cambia nada de `detect`.
  - Hook: `if (!projectMd && !st.hooksOff && ['startup','resume'].includes(source))` -> `try { writeFor(main, { budgetMs: 3000 }) } catch { removeStale(main) }`. La salida del hook no cambia.
- [ ] **Casos de test (nombres literales):**
  - `wizard-detect: a Node project with a test script gives type, tests command and the three profiles with balanced recommended`
  - `wizard-detect: the permission groups come from the shipped permissions template and none has an absolute path`
  - `wizard-detect: a blank project gives blank true and no project, places or permissions detail`
  - `wizard-detect: folders that look like specs or plans appear as candidates with adopt as the decision and their moves listed`
  - `wizard-detect: the id changes when the detection changes and not when only offer changes`
  - `wizard-detect: write goes to .git/pignolo/wizard-detect.json by temporary file and rename and the file is valid JSON at every moment`
  - `wizard-detect: with .git as a file (worktree) nothing is written and the reason is reported`
  - `wizard-detect: with .git/pignolo as a junction or symlink outside the project nothing is written outside`
  - `wizard-detect: offerFirst is true once and false afterwards`
  - `wizard-detect: the verb never creates .pignolo and leaves git status clean`
  - `session-start: without project.md the detection file is written on startup and resume and not on clear, compact or status`
  - `session-start: with project.md present it writes nothing and the output is the same as before` (guarda de regresión)
  - `session-start: a failing or slow detection leaves no file and the hook output is unchanged`
  - `session-start: with pignolo off nothing is written`
- [ ] El rojo de los tests del hook se demuestra rompiendo la condición `!projectMd` y la de `source`.

### T2: formato de las elecciones e `init` que lo acepta (núcleo: `lib/init-choices.js`, `scripts/init.js`, `skills/init/SKILL.md`)

- [ ] **Archivos:** `plugins/pignolo/lib/init-choices.js` (nuevo), `plugins/pignolo/scripts/init.js` (verbo `choices`), `plugins/pignolo/skills/init/SKILL.md` (sección "With choices"), `tests/init-choices.test.js`, `tests/init-choices-skill.test.js`.
- [ ] **Interfaces:**
  - `parseChoices(line) -> { ok: true, choices } | { ok: false, reason }`: JSON de una línea, `v === 1`, claves conocidas, valores enumerados, `places` solo con tipos y decisiones válidos, máximo 700 caracteres, sin saltos de línea ni invisibles; cualquier otra clave o valor -> `ok:false` (no se descarta en silencio solo una parte: se ignora todo).
  - `toAnswers(choices, { summary }) -> { approved, answers, extras }`: `answers.profile`, `answers.places` (lo elegido; lo ausente, `summary.recommendedPlaces`), `extras: { perms, ui, review }`. En `blank`: `approved = summary.recommended`, sin `answers.places`.
  - `compareId(choices, currentId) -> { same, note }`.
  - `init.js choices --file <archivo> [--cwd]`: valida y devuelve `{ ok, answers, approved, extras, idSame }` (la skill escribe el JSON a un archivo con Write, como ya hace con el plan; **no** pasa texto libre por la línea de comandos). No escribe nada.
  - Skill, sección nueva "**With choices**" (el mensaje trae `--choices <json>`): escribir el JSON a un archivo temporal y correr `init.js choices --file`. Si no es `ok`, decirlo en una línea y seguir el flujo de siempre. Si es `ok`: no volver a preguntar lo que las elecciones ya contestan; preguntar solo `summary.ask` en UNA llamada de `AskUserQuestion`; armar el plan con `answers`, correr `preview` y mostrar UNA pantalla de confirmación (lo que se va a escribir según la vista previa, lo que cambió desde el asistente si `idSame` es falso, y el perfil y los permisos que se aplicarán) con Aplicar / Revisar punto por punto / Cancelar. Al aplicar: `apply`, luego `setup.js config --profile` y `setup.js permissions --target <perms> --apply` si las elecciones los traen, luego `verify`. Con `extras.ui === 'now'`, cerrar ofreciendo `/pignolo-ui:define`. Con `extras.review`, después de la pantalla elegir Revisar punto por punto desde el tipo y los gates. Cancelar no escribe nada. Mismas reglas del flujo rápido: nada se escribe sin el sí.
- [ ] **Casos de test (nombres literales):**
  - `init-choices: a valid line parses and an unknown version, key or value makes the whole thing invalid`
  - `init-choices: more than 700 characters, a line break or a hidden character is invalid`
  - `init-choices: places with a kind or decision that does not exist is invalid`
  - `init-choices: toAnswers keeps the chosen places and fills the missing ones with the recommended ones`
  - `init-choices: blank true gives only the blank steps and no places`
  - `init-choices: a different detection id is reported and the same one is not`
  - `init-choices: the verb choices writes nothing and exits 0 with ok false on bad input`
  - `init skill: has a With choices section that asks summary.ask once, always shows one confirmation screen and never applies without the yes`
  - `init skill: without --choices the fast flow and the review point by point are unchanged` (guarda de regresión: compara las secciones existentes con las de `main`)
  - `init skill: the profile and permissions are applied only after the confirmation screen and only when the choices carry them`
- [ ] El rojo se demuestra quitando del texto de la skill la frase de la pantalla de confirmación y sacando una validación de `parseChoices`.

### T3: modelo puro del asistente (panel: `hooks/wizard-model.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/wizard-model.js` (nuevo, sin `$`), `plugins/pignolo-panel/tests/wizard-model.test.ts`, `plugins/pignolo-panel/sample/wizard-detect.json` (fixture del modo demo), `tests/wizard-contract.test.js` (contrato con el núcleo).
- [ ] **Interfaces:**
  - `readWizardDetect(text) -> { ok: true, data } | { ok: false, reason }`: `JSON.parse` protegido, `schema === 'pignolo-wizard-detect/1'`, `id` de 12 hex, textos recortados a una línea y a su ancho; `ok:false` si tiene forma imposible; no tira nunca.
  - `stepsFor({ data, uiInstalled }) -> string[]`: `['project','profile','perms','places'?,'ui'?,'summary']`; `['blank']` si `data.blank`.
  - `initialState(steps, data) -> { i: 0, picks }` con las opciones recomendadas ya marcadas; `move(state, 'next'|'back'|'pick', arg) -> state` (puro; `back` en el paso 1 devuelve `{ closed: 'dismiss' }`; `next` en el último paso devuelve `{ done: true }`; elegir una letra inexistente no cambia nada).
  - `choicesOf(state, data, { uiInstalled }) -> object` con el esquema de D-W5; `choicesMessage(choices) -> string | null`: `'/pignolo:init --choices ' + JSON.stringify(choices)` (o la frase de respaldo si la sonda W1 lo exige); `null` si pasa de 700 caracteres o trae saltos de línea o invisibles.
- [ ] **Casos de test (nombres literales):**
  - `wizard-model: a valid detection file reads and one with another schema, a bad id, invalid JSON or an empty file gives ok false without throwing`
  - `wizard-model: steps are five without pignolo-ui and six with it, and the places step is omitted when there are no candidates`
  - `wizard-model: the recommended option is marked in every step at the start`
  - `wizard-model: next and back move one step, back on the first step dismisses, and next on the last step is done`
  - `wizard-model: picking a letter that does not exist changes nothing`
  - `wizard-model: going back keeps the pick of the step you left`
  - `wizard-model: choicesOf with everything recommended gives profile balanced, perms user, project confirm and no places key for adopt-only candidates`
  - `wizard-model: choicesOf has ui only when pignolo-ui is installed`
  - `wizard-model: the message is one line that starts with /pignolo:init --choices and the JSON after it parses back to the same choices`
  - `wizard-model: a message over 700 characters, with a line break or with a hidden character gives null`
  - `wizard-model: a project name with quotes, accents or braces keeps the message a single valid line`
  - `wizard-model: a blank detection gives the single blank step and the blank choices`
  - `wizard-contract: every message the panel can build for the fixtures is ok in parseChoices of the core` (el panel no importa el núcleo; este test, solo en `tests/`, sí: panel y núcleo no se desalinean en silencio)

### T4: dibujo y criterio visual (panel: `hooks/wizard-view.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/wizard-view.js` (nuevo; funciones puras que devuelven **líneas de texto** y, aparte, un árbol de `Box`/`Text`/`Button` que las usa), `plugins/pignolo-panel/tests/wizard-view.test.ts`, `plugins/pignolo-panel/tests/fixtures/mockup-paso-2.txt`.
- [ ] **Interfaces:**
  - `WIDTH = 70`. `frame({ title, right, body: string[], footerL, footerR }) -> string[]`: arma el borde redondeado, cada línea con exactamente `WIDTH` caracteres (se cuentan puntos de código; solo se usan caracteres de una celda).
  - `progressBar(i, n) -> string` (`▰` hechas, `▱` por hacer, `n` glifos).
  - `optionRows(options, { picked }) -> string[]`: columnas fijas: sangría 1, letra (1), 2 espacios, columna 2 de 28 (recortada con `…`), 1 espacio, columna 3 con el resto del ancho (recortada con `…`). El marcado de la fila elegida **no cambia el ancho** (se marca con color o negrita del árbol, no con caracteres que desplacen).
  - `stepView({ step, state, data, uiInstalled }) -> { lines: string[], rows: [...] }` por paso, con los textos del bloque "Vista de cada paso".
  - `wizardTree($, e, view)` arma el árbol de elementos con los botones (letras, siguiente, atrás) sobre esas líneas.
- [ ] **Casos de test (nombres literales), el criterio visual como test:**
  - `wizard-view: the frame has rounded corners on all four corners and a straight line between them` (`╭ ╮ ╰ ╯`, `│` a los lados, `─` arriba y abajo)
  - `wizard-view: every line of every step has exactly 70 characters` (todos los pasos, con y sin pignolo-ui, y la pantalla de blanco)
  - `wizard-view: the title is on the top border on the left and the step counter on the right and both fit` (con un título largo se recorta con `…`, nunca pasa de 70)
  - `wizard-view: the progress bar has one glyph per step and as many filled as the current step`
  - `wizard-view: option columns are aligned: the letter, the second column and the third column start at the same position in every row` (con textos cortos, largos y con tildes)
  - `wizard-view: a long option text is cut with an ellipsis and the line keeps its width`
  - `wizard-view: marking the selected row does not change the position of any column`
  - `wizard-view: the footer shows the shortcuts: back with Esc on the left and next with Enter on the right, and the first step shows Esc as close`
  - `wizard-view: the last step footer says Enter apply instead of next`
  - `wizard-view: the recommended option says recommended in its second column and no other option does`
  - `wizard-view: the mockup step 2 renders literally as the approved mockup` (compara contra el bloque del mockup guardado como fixture; si el autor cambia el mockup, cambia el fixture)
  - `wizard-view: the tree has no Raster element`
  - `wizard-view: the project step shows language, tests and main branch from the detection and says "sin declarar" when the tests are missing`
  - `wizard-view: the blank screen says the project is blank and offers the folder structure or later`
  - `wizard-view: no line has a hidden character or a line break`

### T5: apertura, navegación, envío y caminos de falla (panel: `hooks/register.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/register.js` (acotado: estado del asistente, `openWizard`, `submitWizard`, rama nueva de `paneTree` y de `command.run`), `plugins/pignolo-panel/tests/wizard-flow.test.ts`.
- [ ] **Interfaces:**
  - Estado del módulo: `wizard = { open, state, data, steps, sending, sent }` y `wizardOpened` (una vez por sesión).
  - `readWizard($) -> data | null`: lee `<root>/.git/pignolo/wizard-detect.json` por `$.fs.read` solo si `!(await $.fs.exists(root + '/.pignolo/project.md'))`; `null` ante cualquier fallo (D-W11).
  - `checkWizard($)`: se llama desde el temporizador existente y desde `session.start` (sin temporizador nuevo). Abre el panel **solo** si `data.offer === true`, `!wizardOpened`, `autoOpen`, `lastCols >= OPEN_FIRST_COLS`, no hay modo demo y no hay una decisión "Te toca" abierta (la decisión tiene prioridad: no se pisa lo urgente). Abre con `$.ui.open({ id: 'pignolo-panel', title: 'pignolo', focus: true, closeOnEscape: <según sonda W2> })`.
  - `command.run` con `wizard`: `/pignolo-panel wizard` abre el asistente a mano; sin archivo, "No hay detección de este proyecto: corré /pignolo:init"; con `wizard demo`, usa `sample/wizard-detect.json` (nunca envía en demo: el botón final solo llena el prompt).
  - `submitWizard($)`: un solo manejador de botón. Si `wizard.sending` ya es verdadero, nada; marca `sending`; **relee** el archivo de detección y compara `id` (si cambió, toast "La detección cambió: mirá el asistente de nuevo", recarga datos y no envía); arma `choicesMessage`; si es `null`, toast "Elecciones inválidas: no se envía" y no envía; `await submitText($, message)`; ok -> `sent = true`, cierra el asistente y toast "Enviado: init te muestra la vista previa y te pide el sí"; falla -> `sending = false`, toast "No pude enviar; corré /pignolo:init". Una sola vez aunque se pulse dos veces.
  - Teclado según sonda W2: `Enter` siguiente o aplicar; `Esc` atrás (en el paso 1, cierra y cuenta como visto); letras eligen opción; en el paso de carpetas, `a`/`m`/`d` por fila con `Tab` para cambiar de fila (o una pregunta por fila si la sonda lo exige).
  - El asistente es un cuerpo aparte de `paneTree` (no suma una pestaña): mientras `wizard.open`, las pestañas normales no se dibujan; al cerrar vuelve el panel de siempre.
- [ ] **Casos de test (nombres literales):**
  - `wizard-flow: it opens by itself once when the project has no project.md and the detection says offer` (`$.ui.open` llamado una vez)
  - `wizard-flow: it does not open a second time in the same session`
  - `wizard-flow: it does not open when offer is false`
  - `wizard-flow: it does not open when project.md exists`
  - `wizard-flow: it does not open when autoOpen is off, the terminal is narrower than the minimum or the demo mode is on`
  - `wizard-flow: an open "Te toca" decision wins and the wizard waits`
  - `wizard-flow: Enter goes to the next step and Esc to the previous one, and Esc on the first step closes and the wizard does not open again`
  - `wizard-flow: a letter picks that option and the pick survives going back and forth`
  - `wizard-flow: Apply sends exactly one message and it is the right one` (`prompt.submit` llamado una vez, con `asUser: true` y `text` igual a `choicesMessage` del estado)
  - `wizard-flow: pressing Apply twice sends once`
  - `wizard-flow: Apply rereads the detection and does not send when the id changed`
  - `wizard-flow: a failed send shows the toast and allows trying again, and no second message is sent while the first was in flight`
  - `wizard-flow: nothing writes: $.fs.write, remove, mkdir and append are never called in any step` (espía de `$.fs`)
  - `wizard-flow: a blank project shows the blank screen and its option sends the blank choices`
  - `wizard-flow: a missing detection file does not open the wizard and shows nothing`
  - `wizard-flow: a broken detection (invalid JSON, another schema, no id) does not open the wizard and shows no error`
  - `wizard-flow: /pignolo-panel wizard without a detection says to run /pignolo:init`
  - `wizard-flow: demo wizard never sends and only fills the prompt`
  - `wizard-flow: without Raster in the host the wizard still draws every step` (host simulado sin `Raster`)
  - `wizard-flow: with pignolo-ui installed the UI step appears and its choice reaches the message, and without it the choice is absent`
- [ ] El rojo se demuestra rompiendo `wizardOpened`, quitando la bandera `sending` y cambiando la relectura del `id`.

### T6: confianza, versiones, documentación y checklist (`tests/panel-trust.test.js`, `plugin.json`, CHANGELOGs, README)

- [ ] **Archivos:** `tests/panel-trust.test.js` (cambia poco), `plugins/pignolo-panel/.claude-plugin/plugin.json` (0.3.0), `plugins/pignolo-panel/CHANGELOG.md`, `plugins/pignolo-panel/README.md`, `plugins/pignolo/.claude-plugin/plugin.json` (0.20.0, renumerable), `plugins/pignolo/CHANGELOG.md`, `plugins/pignolo-panel/tests/manual/wizard.md` (el checklist de abajo), `docs/STATE.md`, `docs/gaps.md` si queda algo.
- [ ] **Confianza:** la lista `ALLOWED` **no crece**; el test existente que compara contra la lista de `claude plugin validate` sigue verde sin tocarlo. `ui.*` entra entero (ya permitido): `Button`, `Text` y `Box` no suman nada.
- [ ] **Casos de test (nombres literales):**
  - `trust: the wizard adds no call to the mod: the declared calls list equals the one of 0.2.0` (compara con la lista fijada en el test)
  - `trust: the new mod files never reference fs.write, fs.remove, fs.mkdir, fs.append, process, spawn or exec` (la regex `BAD` ya recorre `hooks/*.js`; se suman los dos archivos nuevos a la lista de archivos esperados)
  - `trust: prompt.submit still appears exactly once in the package, inside submitText` (guarda de regresión: el asistente usa `submitText`)
  - `trust: submitWizard is called from one button handler only and never from an event, a timer or the refresh`
  - `trust: the wizard message goes through submitText and is checked for line breaks and hidden characters before sending`
  - `trust: the core hook and wizard-detect write only under .git/pignolo` (busca en el código toda ruta de escritura)
  - `trust: plugins/pignolo/hooks/hooks.json has no new event and no modules key` (guarda de regresión)
  - `versions: pignolo-panel is 0.3.0 and the core version is higher than on main, and both CHANGELOGs have the entry`
- [ ] **Versiones y docs:** `pignolo-panel` **0.3.0** (`plugin.json`, CHANGELOG, README: asistente, `/pignolo-panel wizard`, cómo apagarlo con `autoOpen`). Núcleo **0.20.0** (CHANGELOG: `init.js wizard-detect`, `init.js choices`, `init --choices`, hook de arranque; "se renumera al unir"). `docs/STATE.md` actualizado.

## Checklist manual corto (`tests/manual/wizard.md`, con `claude` real; marcar "probado" o "no probado")

- [ ] Proyecto nuevo sin `.pignolo/project.md`, pignolo y pignolo-panel instalados: al abrir Claude Code el asistente aparece solo, con el marco redondeado y el paso 1 con lo detectado.
- [ ] Cerrar y abrir de nuevo Claude Code en el mismo proyecto: **no** se abre solo; `/pignolo-panel wizard` sí.
- [ ] Recorrer con Enter, Esc y las letras: 5 pasos (6 con pignolo-ui), la barra avanza, la opción recomendada viene marcada y nada se desalinea en una terminal de 144 columnas y en una de 100.
- [ ] Aplicar: llega **un** mensaje con `/pignolo:init --choices …`; `init` muestra la pantalla de confirmación con la vista previa; Cancelar deja el proyecto igual (`git status` limpio y sin `.pignolo/`).
- [ ] Aplicar y aceptar: aparece `.pignolo/project.md`, el perfil y los permisos elegidos y la estructura de carpetas; el panel vuelve a ser el de siempre.
- [ ] Repo en blanco: el asistente lo dice y ofrece solo la estructura; en Desktop (sin `Raster`) todo se ve igual.
- [ ] Borrar `.git/pignolo/wizard-detect.json` o dejarlo con basura: el asistente no se abre y no hay errores.

## Resultados del Task 0 y de la ejecución (2026-10-03)

- **W1 (probado con `claude` real):** `prompt.submit({ text: '/pignolo:…', asUser: true })` **se rechaza**: "a text beginning with / would run a command as the user; run one with $.command.run({ command }) (host check)". Aplica D-W8: el mensaje es la frase fija `Activá pignolo en este proyecto con estas elecciones: --choices {json}` (activa la skill `init` por lenguaje natural; su paso 0 pregunta). `$.command.run` sería una llamada nueva: no se usa.
- **W2 (doc de mods, no probado en una terminal):** con `closeOnEscape: true` Esc cierra el panel y sin él vuelve el foco al prompt: el mod nunca recibe Esc; un `hotkey` es un dígito o una letra minúscula; `Enter` presiona el `Button` con el foco (`autoFocus: true`). Respaldo aplicado: letras eligen, `p` vuelve, Enter sigue (botón con foco), Esc cierra; el pie dice `← p atrás   Esc cierra` y `Enter siguiente →`. Un `Button` con `hotkey` y `plain` dibuja `<tecla>: <texto>` (galería de la doc): el marco no depende de eso (cada celda de botón tiene ancho fijo).
- **W3 (probado):** `$.fs.read` y `$.fs.exists` leen dentro de `.git/`; `$.fs.stat` distingue `kind: 'dir'`. Se queda Q1 (`.git/pignolo/`). El mod usa `fs.exists` (sin `stat`) para no sumar una llamada.
- **W4 (probado):** `claude plugin validate` con el código nuevo: la lista `calls:` queda igual que la de 0.2.0 (se evitó `ui.close`: cerrar el asistente vuelve al panel de siempre). Hace falta `claude` con red al menos una vez para que `claude plugin test` corra (interruptor remoto).
- **W5 (medido):** `wizard-detect` tarda 0,3 a 0,6 s en un repo de ~1.200 archivos y 2,1 s en frío: más que el 1 s del umbral del plan, así que **la detección va en un proceso desacoplado** (el riesgo del plan ya previsto), no dentro del hook.
- Cambios sobre el plan: el mockup del paso 2 lleva `sonnet en lo seguro, el más barato` y `opus casi en todo, el más caro` (la cifra «≈ 40 % menos» no está medida) y el pie cambia por la sonda W2; `wizardTree` no recibe `$` (no cruza imports); la plantilla de la skill vive en `templates/init-choices.md` (la skill tiene un tope de largo); el contrato de mockup literal lo corre `tests/panel-wizard-mockup.test.js` (un test del motor no lee archivos).

## Decisiones abiertas para el autor (recomendación primero)

- **Q1: ¿dónde vive el resultado de la detección?** Recomendado: `.git/pignolo/wizard-detect.json` (D-W2: no ensucia el repo ni crea `.pignolo/` antes de tiempo). Alternativa: `.pignolo/wizard-detect.json` con un `.gitignore` propio (más visible; crea la carpeta de pignolo en un proyecto que todavía no la pidió). Si la sonda W3 dice que el mod no lee `.git/`, pasa a la alternativa.
- **Q2: ¿el mensaje es el comando `/pignolo:init --choices {json}`?** Recomendado: sí, si la sonda W1 muestra que `prompt.submit` lo ejecuta; si no, la frase de respaldo (activa la skill por lenguaje natural y `init` hace su paso 0). Alternativa: una frase legible sin JSON (más amable de ver en el chat, más difícil de validar).
- **Q3: ¿`init` aplica perfil y permisos cuando vienen en las elecciones?** Recomendado: sí (D-W7), con los scripts de `setup` y su respaldo, tras el sí de la pantalla final: el asistente configura todo en un solo camino. Alternativa: `init` solo hace lo suyo y el asistente envía además `/pignolo:setup` (dos mensajes y dos confirmaciones: contradice "un solo mensaje").
- **Q4: ¿apagado propio?** Recomendado: reusar `autoOpen` (un solo interruptor del panel). Alternativa: una opción aparte `autoOpenWizard`.
- **Q5: ¿corregir lo detectado?** Recomendado para 0.3.0: "quiero corregir algo" manda `project: review` y `init` pregunta de a una cosa en el chat (sin cajas de texto en el panel: menos superficie y un solo camino de validación). Alternativa: `Input` para tests y rama principal en el paso 1, con topes de largo; más lindo, pero suma foco de teclado, texto libre al mensaje y una sonda más.
- **Q6: repo en blanco.** Recomendado: una pantalla con "crear solo la estructura" o "más tarde" (el mismo camino que `init` ya tiene para el blanco). Alternativa: solo avisar y cerrar, sin ofrecer crear nada (el "avisar y salir" literal).
- **Q7: ¿el asistente cede ante una decisión "Te toca" abierta?** Recomendado: sí (no pisa lo urgente). Alternativa: el asistente primero.

## Riesgos

- **El hook de arranque es del núcleo y corre siempre.** Falla abierto, 3 s de tope, sin salida nueva; revisión opus propia. Si la medida W5 da más de 1 s en repos grandes, se mueve a un proceso desacoplado (como la siembra del repo sombra) y el asistente se abre en la sesión siguiente.
- **Teclas (W2) y `closeOnEscape`.** Si Esc no se puede capturar se pierde el "Esc atrás" del mockup; el respaldo cambia las letras del pie, pero **no** el marco ni las columnas. Se avisa al autor en el informe.
- **`prompt.submit` con `/` (W1).** Si el texto llega como mensaje y no como comando aplica la frase de respaldo (un paso más de confirmación en `init`, no un cambio de seguridad).
- **Detección vieja.** El archivo puede quedar desactualizado entre el arranque y "Aplicar": la relectura con `id` en `submitWizard` y la comparación en `init` lo cubren; `init` siempre vuelve a detectar.
- **Dos paquetes que deben coincidir** (panel y núcleo comparten el esquema de las elecciones sin importarse): el test de contrato de T3 es la guarda; sin él, un cambio de un lado rompe en silencio al otro.
- **Texto largo o con tildes rompe columnas.** Todos los caracteres usados son de una celda; los textos se recortan con `…`; los tests de ancho cuentan puntos de código. No se usan emojis ni anchos dobles (no hay cómo medirlos sin `$`).
- **Autoapertura molesta.** Solo la primera vez por proyecto y apagable con `autoOpen`; Esc la cierra y no vuelve.
- **El plan no se construyó en una copia** (método liviano): lo que depende de la API real (`Select`, `Input`, teclas, `.git/`) está en las sondas de Task 0 y puede mover una tarjeta, no las decisiones.
