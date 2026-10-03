# Panel de pignolo, etapa 2: pestaña UI con recomendaciones de haiku. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, una revisión final opus con una pasada de arreglos (CLAUDE.md). Tarjetas con archivos, interfaces y casos de test literales. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Va después de la etapa 1** (`docs/plans/2026-10-03-panel-de-pignolo.md`, rama `feat/panel`): se ejecuta sobre `main` con la etapa 1 ya unida. Solo suma archivos nuevos en `plugins/pignolo-panel/` y toca tres de la etapa 1 para colgar la pestaña (`hooks/register.js`, `hooks/answer.js`, `tests/panel-trust.test.js`). No toca el núcleo ni `pignolo-ui`.
>
> **Versión:** `pignolo-panel` **0.2.0** (la etapa 1 es 0.1.0). Si la etapa 1 se une con otro número, solo cambian los números (T5). El núcleo y `pignolo-ui` no suben versión: no cambian.
>
> **Pedido del autor (2026-10-03):** con pignolo-ui instalado, una pestaña de UI con atajos a acciones ("mejorar tal pantalla", "crear tal panel", "auditar", "definir producto y diseño"), siempre recomendadas con IA. **Decisión:** las recomendaciones las genera haiku **al abrir la pestaña** (`$.model.complete`, ≈ 0,01 USD por llamada): ordena y redacta las 3 mejores acciones; se repite solo si cambió algo (hash de las entradas), con tope por sesión.

## Hechos de la doc de mods verificados (2026-10-03, Claude Code 2.1.287)

- `$.model.complete({ model: 'haiku', system, prompt, maxTokens, timeoutMs })` -> `{ isAnswered, text?, reason? }`. **No rechaza ante un fallo de la API**: hay que mirar `isAnswered`. Rechaza solo ante un pedido que Claude Code no envía (modelo bloqueado por la organización). Sin historial de conversación, **sin herramientas**: es una sola pregunta, no puede actuar. Usa el plan o la clave del usuario. `maxTokens` por defecto 1024 (máximo 64.000). Cada método es también un evento (`model.complete`), así que un mod anterior puede observarlo o negarlo: se maneja como fallo.
- Límites: un hook corre 10 s sin contar el tiempo dentro de llamadas a la API; `$.fs.read` 4 MiB por archivo; `$.ui.invalidate` redibuja a lo sumo 10 por segundo; un `Text` 10.000 caracteres.
- `crypto.subtle` existe en el módulo (sirve para el hash); no hay `process` ni timers globales (`$.clock.*`).
- Para saber si un plugin está instalado no hay un método propio; sí hay `$.settings.read` (lo que tienen los archivos de configuración, incluido `enabledPlugins`) y `$.command.list()`. Ver D-U5.

## Rulings técnicos

- **D-U1: los datos se leen en el mod con `$.fs`, sin archivo intermedio.** Se evaluó que `pignolo-ui` escriba un resumen (`panel-summary.json`) al cerrar cada skill, como hace el núcleo con `panel-state.json`. Se descartó: obliga a tocar cuatro skills y un script de `pignolo-ui` (más versión y CHANGELOG), y el resumen queda viejo si el usuario edita `PRODUCT.md` a mano. Leer directo da datos siempre frescos y deja el cambio en un solo plugin. Costo: la lectura vive duplicada en `hooks/ui-input.js`; un test (T1) la fija contra una carpeta sintética con la forma real de `pignolo-ui` y la primera tarea del ejecutor es releer esas formas sobre `main` (ver Task 0).
- **D-U2: lo que va al modelo es un resumen compacto sin contenido.** Solo: secciones de `PRODUCT.md` que figuran como `undecided` (nombres fijos del vocabulario, nunca el texto), si `DESIGN.md` existe, nombres de pantallas (de `design/approved/<flujo>/*.html` y de los slugs de `.pignolo-ui/runs/*`), el comando y la fecha de las últimas corridas, y de `auditor.json` el conteo por severidad y hasta 5 ids de regla (`CONTRAST-02`, `J-1`). **Nunca** texto de un archivo del usuario (citas, brief, hallazgos, rutas, URL del lienzo, valores de diseño). Todo nombre pasa por `safeName` (`[a-z0-9._-]`, máximo 40, el resto se descarta). Máximo 12 pantallas y 5 corridas.
- **D-U3: el texto que se envía no lo escribe el modelo.** El modelo devuelve datos (acción, objetivo, porqué, prioridad). El mensaje que se envía al pulsar sale de una plantilla fija por acción con el objetivo ya validado (D-U6); el porqué solo se **muestra**. Así una pantalla con nombre hostil o una salida rara del modelo no puede colar instrucciones en el prompt (misma lógica que R-2 de la etapa 1).
- **D-U4: reglas antes de la IA, y las reglas son también el respaldo.** `rulesFor(input)` (puro) devuelve las recomendaciones sin modelo. Si falta `PRODUCT.md` o `DESIGN.md` decidido (existen y `Audience` y `First look` no son `undecided`), la **única** recomendación es `define` y no se llama al modelo. Sin datos (ni flujos aprobados ni corridas), solo los atajos fijos y no se llama al modelo. En los demás casos se llama a haiku; si la llamada falla, no valida o está topada, se muestran las de `rulesFor` **sin error a la vista** (una marca discreta "por reglas").
- **D-U5: detección de pignolo-ui sin `process`.** En este orden, la primera señal que se pueda leer gana: (1) `$.settings.read` y alguna clave de `enabledPlugins` que empiece con `pignolo-ui@` en `true`; (2) `$.command.list()` con algún nombre que empiece con `pignolo-ui`; (3) la carpeta `.pignolo-ui/` o `PRODUCT.md`/`DESIGN.md` existen en el proyecto. Cada lectura va en try/catch; si (1) y (2) fallan o no tienen la forma esperada (sonda U1 de la Task 0) cuenta solo (3). La pestaña aparece si alguna señal dice que sí; **no aparece** si (1) lee bien y dice que no. *Por qué no solo (3):* un proyecto sin `.pignolo-ui/` todavía (justo el caso de "definir") tiene que ver la pestaña con pignolo-ui instalado. Se evalúa una vez al cargar el mod y otra al abrir la pestaña.
- **D-U6: salida del modelo validada a mano** (sin dependencias). Un JSON `{ "recs": [ ... ] }`, 1 a 3 elementos, cada uno `{ action, target, why, priority }`: `action` ∈ `new|improve|audit|define`; `target` una cadena de `safeName` de hasta 60 caracteres; para `improve` y `audit` debe ser **una pantalla conocida** del resumen (si no, la recomendación se descarta); `new` admite un nombre libre válido o vacío; `define` no lleva objetivo; `why` una línea, 120 caracteres como máximo, sin saltos de línea ni rutas; `priority` entero 1 a 3 sin repetir. Se aceptan las que validan; si no queda ninguna, respaldo por reglas. Se recorta el texto antes de parsear a la primera llave `{` y última `}` (haiku a veces envuelve en un bloque de código).
- **D-U7: topes y momento de la llamada.** Se evalúa **solo** (a) al abrir la pestaña y (b) al volver a ella desde otra; nunca en `clock.every`, `turn.*`, `agent.*`, `session.measure` ni en el refresco del registro. Hash = sha256 (`crypto.subtle`) del resumen serializado de forma estable; si es igual al último que se consultó en la sesión se reusa la respuesta guardada en memoria y **no se llama**. Tope: **6 llamadas por sesión** y **1 por hash**; un fallo cuenta como llamada (no se reintenta solo; la tecla `r` reintenta, obedeciendo el tope). Un solo pedido en vuelo: abrir de nuevo mientras corre no lanza otro. Mientras tarda se muestra el respaldo por reglas con "pensando…" y se redibuja al llegar. `timeoutMs` 15.000, `maxTokens` 400. Con tope agotado: reglas, marca "tope de consultas de la sesión".
- **D-U8: costo mostrado.** Debajo de las recomendaciones: `IA: haiku · 1 consulta · ≈ 0,01 USD` (consultas de la sesión y costo). Si `$.session.usage().cost` es numérico, se muestra la diferencia medida entre antes y después de la llamada; si no, el valor fijo "≈ 0,01 USD" rotulado como estimado. Sin la llamada: `IA: no consultada (reglas)`.
- **D-U9: un atajo envía el pedido, y es el único lugar nuevo que envía.** Mismo patrón que las respuestas de "Te toca" (R-P9 de la etapa 1): `prompt.submit` sigue **una sola vez** en el paquete, dentro de `hooks/answer.js`, que pasa a exportar además `submitUiRequest($, action, target, context)`; solo se llama desde el manejador de pulsación de un botón de la pestaña UI. Texto exacto, plantilla fija:
  - `improve`: `Mejorá la pantalla <target>.` · `audit`: `Auditá la pantalla <target>.` · `new`: `Hagamos la pantalla <target>.` (sin objetivo: `Quiero armar una pantalla nueva.`) · `define`: `Definí el producto y el diseño.`
  - Los atajos fijos sin objetivo: `Quiero mejorar una pantalla.`, `Quiero auditar una pantalla.` (la skill pregunta cuál).
  - Con contexto, una línea más detrás de un espacio: `Contexto: <contexto>` con el `context` calculado **por reglas** (no del modelo): p. ej. `la última auditoría dejó 2 hallazgos altos (CONTRAST-02, J-1).` Máximo 160 caracteres.
  Estas frases son el lenguaje natural que ya activa las skills de `pignolo-ui` (activación 0.15.0 / pignolo-ui 0.10.0, `tests/evals/RESULTS-activacion.md`). Un test (T3) fija que las frases siguen en las descripciones de las skills, para que un cambio de ellas avise.

## Vista (mockup en texto)

```
 [1 Ahora] [2 Ramas] [3 Costo] [4 UI]            ← la pestaña UI solo si pignolo-ui está
 Recomendado para tu UI                      IA: haiku · 1 consulta · ≈ 0,01 USD
  a  Mejorar  login      Última auditoría: 2 hallazgos altos (CONTRAST-02).
  b  Auditar  precios    Se rehízo hace 3 días y no se volvió a medir.
  c  Nueva    ajustes    Está en el producto y no tiene pantalla.
 Atajos     n nueva pantalla · m mejorar · u auditar · d definir producto y diseño
 Pulsar una letra envía el pedido a Claude. r vuelve a consultar · Esc cierra
```

Sin `PRODUCT.md`/`DESIGN.md` decidido: una sola línea `a  Definir producto y diseño   Falta decidir: Audience, First look.` y la fila de atajos; sin "IA:" (no se consultó). Si falló la IA: las mismas filas por reglas y la marca `por reglas` en vez del costo. Las letras de las recomendaciones son `a`, `b`, `c`; las de atajos fijos `n`, `m`, `u`, `d` (no chocan con `r` ni con las teclas `0`..`4` de las pestañas de la etapa 1).

## Task 0 (sin código): sondas y relectura

- Releer sobre `main` con la etapa 1 ya unida: `hooks/register.js` (cómo se arman las pestañas y las teclas), `hooks/answer.js`, `tests/panel-trust.test.js`, `plugin.json` (`userConfig`) y la lista `calls:` permitida.
- Releer la forma real de lo que lee `hooks/ui-input.js` en `plugins/pignolo-ui/`: `lib/product-md.mjs` (secciones, `undecided`), `lib/design-doc.mjs` (qué hace que `DESIGN.md` esté "decidido": elegir la señal mínima y barata, p. ej. frontmatter presente y sin las claves vacías; **si no se puede decidir sin duplicar el validador, vale "existe y no está vacío"**), `lib/run-init.mjs` (nombre de la carpeta de corrida: `<fecha>-<comando>-<slug>`), `lib/approved.mjs` (`design/approved/<flujo>/*.html`), `lib/auditor-output.mjs` (forma de `auditor.json`: `findings[].id` y `severity` en `bloquea|alto|medio|detalle`).
- Sondas con `claude` real (a un archivo del job; lo que no se pueda obtener se anota "no probado" y manda lo conservador): **U1** forma de `$.settings.read()` y si trae `enabledPlugins`; forma de `$.command.list()` con pignolo-ui instalado; **U2** `claude plugin validate` con `model.complete`, `settings.read` y `command.list` en el código: qué imprime en la lista de llamadas y si pide algo; **U3** `$.model.complete({ model: 'haiku' })` desde `claude plugin test` con el método simulado, y una vez real y suelta (≈ 0,01 USD, dentro del tope de la ficha) para ver `isAnswered`, `reason` y si `usage().cost` cambia.

## Global Constraints

- Node ≥ 22, sin dependencias npm; `node:test` vía `npm test` (no `node --test tests/`); el código del mod en JS plano, igual que la etapa 1; nombres de elementos en inglés, mensajes al usuario en español, commits en español, LF sin BOM.
- El mod sigue sin `process`, sin red propia y sin escribir archivos. Lo único nuevo que sale del proceso es **una consulta a haiku por `$.model.complete`**, y solo con el resumen de D-U2.
- Un fallo de cualquier lectura, de la consulta o de la validación no tira el mod ni muestra un error: respaldo por reglas (D-U4).
- El repo es público: fixtures sintéticas, nada del proyecto del autor.

## Método de ejecución

- **Rama:** `feat/panel-ui` desde `main` (con la etapa 1 unida). Un commit por tarjeta. Un solo ejecutor en serie.
- **Orden:** Task 0 → T1 → T2 → T3 → T4 → T5 → revisión opus de `main..feat/panel-ui` (una sola, **propia**: toca `prompt.submit` y manda datos a un modelo) → una pasada de arreglos → suite completa una vez sobre la rama unida con `main` → unión → **pignolo-panel 0.2.0**.
- **Auditoría previa del plan:** no (no toca guardia ni borra; solo lee archivos).
- **Autochequeo del ejecutor (con evidencia, máximo 5):** (1) rutas con otra capitalización y symlinks/junctions: `PRODUCT.md`, `design.md` en minúscula (`findDesignFile` de pignolo-ui lo busca sin distinguir mayúsculas) y `.pignolo-ui/runs` enlazada fuera del proyecto no se leen; (2) archivos que no son UTF-8, vacíos, enormes (> 64 KB se recortan al leer) o con BOM no tiran el mod; (3) el resumen que va al modelo no contiene texto de archivos: un test con contenido centinela lo prueba; (4) `prompt.submit` aparece una sola vez en el paquete (`grep`); (5) cada afirmación del informe marcada "probado" o "no probado".

## Tarjetas

### T1: datos de entrada y reglas, sin modelo (`hooks/ui-input.js`, `hooks/ui-rules.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/ui-input.js`, `plugins/pignolo-panel/hooks/ui-rules.js` (el código del mod vive en `hooks/`, como en la etapa 1), `plugins/pignolo-panel/tests/ui-input.test.js` (node:test, con `$.fs` simulado sobre un árbol en memoria), `plugins/pignolo-panel/sample/ui/` (árbol sintético: `PRODUCT.md`, `DESIGN.md`, `design/approved/login/index.html`, `.pignolo-ui/runs/<corrida>/auditor.json`).
- [ ] **Interfaces:**
  - `readUiInput($, cwd) -> Promise<{ present: boolean, input: { product: { exists, undecided: string[] }, design: { exists, decided }, screens: [{ name, flow?, lastRun?: { command, date }, audit?: { bloquea, alto, medio, detalle, ids: string[] } }], recent: [{ command, screen, date }] } }>`. Usa solo `$.fs.exists`, `$.fs.list`, `$.fs.read`; nunca tira; recorta a 12 pantallas y 5 corridas; `safeName(s)`.
  - `hashInput(input) -> Promise<string>` (serialización estable con claves ordenadas, `crypto.subtle` sha256, hex).
  - `rulesFor(input) -> { recs: [{ action, target, why, priority, context }], onlyDefine: boolean, fixed: boolean }`. Orden de reglas: sin producto o diseño decidido -> solo `define` (`onlyDefine`); sin pantallas ni corridas -> `fixed` (sin recomendaciones, solo atajos); luego: (1) pantalla con hallazgos `bloquea`/`alto` en su última auditoría -> `improve`; (2) pantalla con flujo aprobado y sin auditoría posterior -> `audit`; (3) secciones de producto opcionales en `undecided` -> `define` (completar); (4) `new` con objetivo vacío. Máximo 3, prioridad 1 a 3.
- [ ] **Casos de test (nombres literales):**
  - `ui-input: a missing project folder gives present false and no throw`
  - `ui-input: PRODUCT.md sections marked undecided are listed by name and their text is never read into the input`
  - `ui-input: DESIGN.md is found in any capitalization` (autochequeo 1)
  - `ui-input: screens come from design/approved flows and run slugs, with safeName and at most 12`
  - `ui-input: the last audit of a screen gives severity counts and at most 5 rule ids`
  - `ui-input: a file that is not UTF-8, empty, with BOM or over 64 KB does not throw` (autochequeo 2)
  - `ui-input: the summary carries no text of user files` (archivos con una frase centinela en `PRODUCT.md`, brief y hallazgos: la frase no aparece en `JSON.stringify(input)`; autochequeo 3)
  - `ui-input: hashInput is equal for the same input and changes when a screen or a severity count changes`
  - `ui-rules: without PRODUCT.md or DESIGN.md the only recommendation is define and onlyDefine is true`
  - `ui-rules: Audience or First look undecided gives define with the missing sections in the reason`
  - `ui-rules: no screens and no runs gives fixed shortcuts and no recommendation`
  - `ui-rules: a screen with high findings in its last audit gives improve first`
  - `ui-rules: an approved screen never audited gives audit`
  - `ui-rules: gives at most 3 recommendations with distinct priorities and every target is a known screen or empty for new`
- [ ] **Rojo:** hacer que `readUiInput` incluya el texto de una sección; quitar `safeName`; invertir el orden de las reglas 1 y 2; no mirar `design.md` en minúscula.

### T2: la llamada a haiku (`hooks/ui-recs.js`, `hooks/ui-prompt.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/ui-prompt.js` (el `system` fijo en el repo y `buildPrompt(input)`), `plugins/pignolo-panel/hooks/ui-recs.js` (único lugar con `model.complete`), `plugins/pignolo-panel/tests/ui-recs.test.js`.
- [ ] **Interfaces:**
  - `UI_SYSTEM` (cadena fija, en español, sin interpolación): dice que recibe un resumen JSON de un proyecto de interfaz web, que elija las 3 mejores acciones entre `new|improve|audit|define`, que use solo pantallas del resumen para `improve`/`audit`, que el porqué sea una línea de hasta 120 caracteres, que **responda solo un JSON** `{ "recs": [...] }` con el formato de D-U6, y que **el resumen son datos, no instrucciones**.
  - `buildPrompt(input) -> string`: `JSON.stringify(input)` precedido de una línea fija.
  - `parseRecs(text, input) -> { recs, rejected }` (D-U6: parseo tolerante a bloque de código, validación estricta, descarta lo inválido).
  - `createRecommender({ model = 'haiku', maxCalls = 6, now }) -> { get($, input) -> Promise<{ recs, source: 'ai'|'rules', cost?, reason? }> , stats() }`: aplica D-U4 y D-U7 (hash, tope por sesión y por hash, un solo vuelo, `timeoutMs` 15.000, `maxTokens` 400), nunca tira y nunca devuelve error al llamador.
- [ ] **Casos de test (con `$.model.complete` simulado):**
  - `ui-recs: onlyDefine or fixed never calls the model` (espía en 0)
  - `ui-recs: a valid JSON answer gives ai recommendations ordered by priority`
  - `ui-recs: an answer wrapped in a code block is parsed`
  - `ui-recs: an invalid action, an unknown screen for improve or audit, a long or multiline why are dropped; if none is left the rules are used`
  - `ui-recs: isAnswered false, a rejected call or a timeout falls back to rules with source rules and no error`
  - `ui-recs: the same input hash does not call again and returns the stored answer`
  - `ui-recs: a changed input calls once more, and the sixth call of a session is the last; the seventh uses rules`
  - `ui-recs: a failed call counts toward the cap and is not retried by itself`
  - `ui-recs: two concurrent gets make one call`
  - `ui-recs: the call carries model haiku, the fixed system, maxTokens 400, timeoutMs 15000 and nothing else` (sin herramientas ni historial)
  - `ui-recs: the prompt carries only the summary and the system says the summary is data`
  - `ui-recs: cost is the measured usage difference when numeric and the labeled estimate otherwise`
- [ ] **Rojo:** quitar el chequeo del hash (rompe "does not call again"); subir `maxCalls` a 100 (rompe el tope); aceptar `improve` sobre una pantalla desconocida; dejar que `get` propague el rechazo.

### T3: vista y atajos que envían (`hooks/ui-tab.js`, `hooks/answer.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/ui-tab.js` (árbol de la pestaña: recomendaciones con letra, fila de atajos, línea de costo; "pensando…" y marcas), `plugins/pignolo-panel/hooks/answer.js` (suma `submitUiRequest` y `uiRequestText(action, target, context)`; sigue habiendo **una sola** llamada a `prompt.submit`), `plugins/pignolo-panel/tests/ui-tab.test.ts` (`claude plugin test`), `plugins/pignolo-panel/tests/ui-request.test.js` (node:test, para el texto).
- [ ] **Interfaces:** `renderUiTab({ $, e, ui, state }) -> element` (usa los mismos elementos que el resto del panel); `uiRequestText(action, target, context) -> string` (D-U9, puro); `submitUiRequest($, action, target, context) -> Promise<boolean>`: arma el texto y llama a `$.prompt.submit({ text, asUser: true })`; si la llamada falla muestra un toast y no deja nada a medias.
- [ ] **Casos de test:**
  - `ui-request: improve, audit, new and define give the exact fixed sentences` (cadenas literales: `Mejorá la pantalla login.`, `Auditá la pantalla login.`, `Hagamos la pantalla ajustes.`, `Definí el producto y el diseño.`)
  - `ui-request: the fixed shortcuts without target give Quiero mejorar una pantalla. and Quiero auditar una pantalla.`
  - `ui-request: the context is one line of at most 160 characters and comes from the rules, never from the model answer`
  - `ui-request: the model why text never reaches the sent text` (por qué hostil: no aparece en el mensaje)
  - `ui-request: a target outside safeName is refused and nothing is sent`
  - `ui-request: the sentences still activate the pignolo-ui skills` (guarda de regresión: cada frase aparece como ejemplo en la `description` de `skills/<new|improve|audit|define>/SKILL.md` de `plugins/pignolo-ui`; si cambia la skill, el test avisa)
  - `ui tab: shows up to three recommendations with their reason and letters a, b and c and a row with the four fixed shortcuts n, m, u and d`
  - `ui tab: pressing a letter sends the exact text once with asUser true and shows a toast Enviado`
  - `ui tab: pressing a letter while a request is being sent does not send twice`
  - `ui tab: while the model call is pending the rules are drawn with pensando and redrawn when it ends`
  - `ui tab: a failed call draws the rules with the mark por reglas and no error text`
  - `ui tab: only define shows one line and the fixed shortcuts and no IA cost line`
  - `ui tab: the cost line shows consultas of the session and the cost or the estimate`
  - `ui tab: r asks again and obeys the cap and the hash`
  - `ui tab: the letters do not collide with 0 to 4, r and Esc`
- [ ] **Rojo:** hacer que el porqué del modelo entre en el texto; enviar sin `asUser`; segundo `prompt.submit` en `ui-tab.js` (rompe el estático de T4); no bloquear el doble envío.

### T4: detección, cableado y confianza (`hooks/ui-detect.js`, `hooks/register.js`, `plugin.json`, `tests/panel-trust.test.js`)

- [ ] **Archivos:** `plugins/pignolo-panel/hooks/ui-detect.js`, `plugins/pignolo-panel/hooks/register.js` (suma la pestaña **4 UI** solo si `detectUi` da `true`; evalúa al cargar y al abrir la pestaña; dispara `recommender.get` **solo** en abrir y volver a la pestaña), `plugins/pignolo-panel/.claude-plugin/plugin.json` (versión 0.2.0), `plugins/pignolo-panel/tests/ui-detect.test.js`, `tests/panel-trust.test.js` (extiende los estáticos de la etapa 1), `plugins/pignolo-panel/tests/ui-tab-wiring.test.ts` (`claude plugin test`).
- [ ] **Interfaz:** `detectUi($, cwd) -> Promise<{ installed: boolean, via: 'settings'|'commands'|'folder'|'none' }>` (D-U5, cada paso en try/catch).
- [ ] **Lista de `calls:` permitida (se suma a la de la etapa 1, y nada más):** `model.complete`, `settings.read`, `command.list`. Todo lo demás de la lista de la etapa 1 sigue igual. `model.fork` y `model.classify` **no** se permiten.
- [ ] **Casos de test de confianza (`node:test`, estáticos):**
  - `trust: model.complete appears only in ui-recs.js` (y `ui-prompt.js` no lo llama)
  - `trust: ui-recs get is called only from the tab-open and tab-return handlers` (no dentro de `clock.every`, `clock.after`, `turn.`, `agent.`, `session.`, `ui.render`, `classic.` ni del refresco del registro)
  - `trust: the declared calls list is a subset of the allowed list with model.complete, settings.read and command.list added` (reemplaza el caso de la etapa 1 con la lista ampliada)
  - `trust: model.fork, model.classify, tool.register, tool.call, process and http are never referenced`
  - `trust: prompt.submit appears exactly once in the package, inside answer.js` (guarda de regresión de la etapa 1, debe seguir verde)
  - `trust: submitUiRequest is referenced only inside the press handler of a UI tab button`
  - `trust: the model call has no tools and no conversation: the options object only has model, system, prompt, maxTokens and timeoutMs`
- [ ] **Casos de test de detección y cableado:**
  - `ui-detect: enabledPlugins with a pignolo-ui key set to true gives installed via settings`
  - `ui-detect: enabledPlugins readable and without pignolo-ui gives not installed even if a .pignolo-ui folder exists`
  - `ui-detect: settings.read failing falls to command.list and then to the folder`
  - `ui-detect: nothing readable and no folder gives not installed`
  - `ui-detect: a throw in any of the three never reaches the caller`
  - `ui wiring: without pignolo-ui the tab 4 does not exist and the model is never called`
  - `ui wiring: opening the tab calls the recommender once and drawing again without a change does not call`
  - `ui wiring: the clock tick, a turn, an agent event and a registry refresh never call the model` (espía en 0)
  - `ui wiring: going to another tab and coming back with the same input does not call and with a changed input calls once`
- [ ] **Rojo:** llamar a `recommender.get` desde un `$.clock.every` (rompe el estático y el espía); agregar `model.fork`; mostrar la pestaña sin mirar `enabledPlugins`.

### T5: versión, documentos, ficha de medición y checklist

- [ ] **Archivos:** `plugins/pignolo-panel/.claude-plugin/plugin.json` (**0.2.0**), `plugins/pignolo-panel/CHANGELOG.md` (entrada 0.2.0: pestaña UI, `model.complete`, qué sale al modelo), `plugins/pignolo-panel/README.md` (qué se envía a haiku y cuánto cuesta, cómo apagarlo), `plugins/pignolo-panel/.claude-plugin/plugin.json` `userConfig.uiRecommendations` (booleano, `true` por defecto: en `false` la pestaña usa solo reglas y nunca llama al modelo; test `ui wiring: userConfig uiRecommendations false never calls the model`), `docs/STATE.md`, `docs/gaps.md` (ver abajo), `tests/evals/RESULTS-panel-ui.md` (la ficha, sin resultados), `plugins/pignolo-panel/tests/manual/ui.md`.
- [ ] **Test:** el que compara `plugin.json` con el CHANGELOG (de la etapa 1) pasa a exigir `## 0.2.0` (en rojo si falta; guarda de regresión).
- [ ] **`docs/gaps.md`:** lectura duplicada de `pignolo-ui` en el mod (D-U1) con la salida "si crece, que `pignolo-ui` escriba un resumen"; sin caché entre sesiones (cada sesión que abre la pestaña con datos nuevos paga ≈ 0,01 USD); costo real depende de que `usage().cost` cambie.
- [ ] **Checklist manual (queda escrito; el autor no prueba hasta cerrar la v1):** con pignolo-ui instalado la pestaña aparece, sin él no; sin `PRODUCT.md` la única recomendación es definir y no hay consulta; con datos, las recomendaciones llegan y muestran el costo; apagar la red y abrir: reglas sin error; pulsar `a` envía el pedido y la skill de pignolo-ui correspondiente se activa; pulsar `n` pregunta qué pantalla; `uiRecommendations` en `false` no consulta; abrir y cerrar la pestaña diez veces sin cambios gasta una consulta.

#### Ficha de medición (`tests/evals/RESULTS-panel-ui.md`, según `docs/protocolo-de-pruebas.md`; se commitea antes de correr y **no se corre en esta etapa**)

1. **Pregunta e hipótesis:** ¿las 3 recomendaciones de haiku son mejores que las de reglas (`rulesFor`)? Hipótesis: a igual entrada, haiku sube la calidad percibida al menos 0,5 puntos (mediana, escala 1 a 5) sin subir el costo por encima de 0,02 USD por consulta ni superar 8 s de pared.
2. **Variable:** quién genera las recomendaciones (reglas contra haiku). Fijo: las entradas, el prompt de `ui-prompt.js` en un commit dado, `maxTokens` 400, la máquina.
3. **Brazos:** A (control) reglas, método vigente de respaldo; B haiku (`$.model.complete` con el prompt real).
4. **Entradas:** 4 resúmenes sintéticos: pocos datos (1 pantalla); con deuda (varias auditorías con hallazgos altos); con producto a medias (secciones opcionales en `undecided`); proyecto grande (12 pantallas). Los resúmenes pasan por `readUiInput` desde árboles sintéticos del repo.
5. **Métricas:** calidad a ciegas (relevancia, accionabilidad, orden, una escala de 1 a 5 cada una; califica el autor o un juez opus que no sabe de qué brazo viene cada conjunto, con nombres neutros y orden mezclado); costo (USD medido por la diferencia de `usage().cost` o por los tokens de la respuesta); tiempo de pared; tasa de salida válida (D-U6) y de caída al respaldo; recomendaciones descartadas por pantalla desconocida.
6. **Repeticiones:** B 3 por entrada (12 corridas, cuestan menos de 300 mil tokens: nivel E3); A es determinista, 1 por entrada.
7. **Regla de decisión:** haiku gana si la mediana de calidad supera a la de reglas en ≥ 0,5 puntos **y** los rangos no se pisan **y** la tasa válida es ≥ 95 % **y** el costo mediano ≤ 0,02 USD. Si los rangos se pisan: "sin diferencia demostrada" y se decide por lo más simple (**reglas**, `uiRecommendations` por defecto en `false` en 0.2.1). Resultados negativos también se publican.
8. **Presupuesto:** ≈ 0,15 USD de haiku (12 corridas) + ≈ 1 a 2 USD del juez opus; **tope 3 USD**; si se agota, se reportan las entradas completas hasta ahí. **El gasto lo aprueba el autor antes de correr.**
9. **Amenazas a la validez:** entradas sintéticas (no un proyecto real), cuatro tareas, juez de la familia del modelo (por eso el autor es el calificador preferido), `usage().cost` puede no ser fino a este costo.

## Review Focus (revisión final)

1. **Qué sale al modelo:** que el resumen solo tenga lo de D-U2 (test del centinela) y que nada de los archivos del usuario llegue a `ui-prompt.js` por otro camino.
2. **Cuándo se llama:** solo al abrir o volver a la pestaña; tope por sesión y por hash; un solo vuelo; nunca en un timer, turno o refresco (T4 estático y espía).
3. **El texto que se envía:** plantilla fija, objetivo validado, el porqué del modelo nunca entra; `prompt.submit` una sola vez en el paquete y solo desde un botón.
4. **Respaldo por reglas:** cualquier fallo (API, JSON, tope, política de la organización) cae a reglas sin error a la vista.
5. **Detección:** que una lectura rota no tire el mod ni muestre la pestaña por error cuando `enabledPlugins` dice que no está.

## Riesgos

- **R-1: la forma de `$.settings.read()` o de `$.command.list()` no es la supuesta.** Sonda U1; sin ellas cae a la carpeta (D-U5) y se anota.
- **R-2: texto hostil en nombres de pantallas** (los nombres vienen de archivos del proyecto). `safeName`, validación de objetivo contra pantallas conocidas, plantilla fija (D-U3, D-U6).
- **R-3: un mod anterior o la organización puede negar `model.complete`.** Se trata como fallo: reglas.
- **R-4: la lectura duplicada se desfasa de `pignolo-ui`.** Test con árbol sintético con la forma real; el CHANGELOG de `pignolo-ui` debería avisar si cambia el formato (anotado en gaps).
- **R-5: gasto sin control** si se reabre muchas veces: el hash y el tope de 6 por sesión lo acotan a ≈ 0,06 USD por sesión.

## Decisiones abiertas del autor

- **Q-U1: ¿recomendaciones de haiku encendidas por defecto?** El plan las enciende (`uiRecommendations: true`), según su pedido; la medición de T5 puede dar razones para apagarlas.
- **Q-U2: caché entre sesiones.** El plan no guarda (cada sesión nueva con la pestaña abierta y datos nuevos cuesta ≈ 0,01 USD). Alternativa: `$.store` con el último hash y las recomendaciones (ahorra una llamada por sesión sin cambios; suma `store.get`/`store.set` a la lista de `calls:`).
- **Q-U3: ¿lectura directa (D-U1) o resumen escrito por `pignolo-ui`?** El plan lee directo por simplicidad y frescura; el resumen escrito exigiría subir `pignolo-ui` (0.11.0) y cambiar cuatro skills.
