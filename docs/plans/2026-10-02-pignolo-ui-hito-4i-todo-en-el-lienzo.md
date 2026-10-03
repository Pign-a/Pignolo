# pignolo-ui — Hito 4i: todo en el lienzo y un brief corto. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie, una revisión final opus con una pasada de arreglos (CLAUDE.md). Las tarjetas dan archivos, interfaces y casos de test literales; la prosa de las skills la escribe el ejecutor. Casillas `- [ ]`. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".
>
> **Origen:** uso real del autor (2026-10-02), `docs/gaps.md` G52 y G53: `new` muestra las opciones en el lienzo pero los cambios posteriores a la elección van a la copia HTML local y no ofrece seguir con otra pantalla; `define` publica su tablero en un artifact aparte; el brief que `new` pide confirmar son ~40 líneas con mucho ruido.

## Prerrequisitos (Task 0, sin código)

- `main` con la etapa 2 del lienzo (pignolo-ui **0.8.0**) y `2e6a8a0` o posterior. Este hito parte de ahí.
- Releer sobre `main` los nombres que el plan consume: `lib/canvas-merge.mjs` (`mergeIndex`, `diffPublished`), `lib/canvas-publish.mjs` (`planNext`, `assertParams`, `recordStep`, `mergeLive`), `lib/canvas-layout.mjs` (`buildCanvas`), `scripts/canvas-index.mjs` (`build`), `reference/present-and-choose.md` pasos 3 y 4, `reference/context.md` parte 2, `skills/define/SKILL.md` paso 5.
- **Tamaños:** `skills/define/SKILL.md` está en 11 959 de 12 000 caracteres y `reference/present-and-choose.md` en 13 037. El texto nuevo de `define` va a una referencia nueva; el de `present-and-choose.md` se paga recortando repeticiones del mismo archivo.

## Alcance

- **Adentro (6 tarjetas):** quitar del lienzo las opciones no elegidas (único código del hito, en `lib/` y `canvas-index.mjs`); textos de `new` y `present-and-choose.md` (afinar sobre el lienzo, quitar al elegir, seguir con otra pantalla); brief corto; tablero de `define` en el lienzo; versión y documentos; checklist manual.
- **Afuera:** evals pagas; etapas 3 y 4 del lienzo; cambios al auditor, a `ui-option` o a los validadores; borrar un lienzo o un artifact entero (decisión del usuario); que `improve` y `audit` adelgacen sus salidas (ver la pregunta Q4).

## Decisiones del autor (2026-10-02, G52 y G53)

- **D-4i-1:** todo lo de UI vive siempre en el lienzo del proyecto, nunca solo en la copia HTML local.
- **D-4i-2:** en `new`, los cambios que se piden después de elegir una opción se aplican a la opción elegida y se republican en el lienzo del proyecto (actualización en el lugar de la etapa 2). Al terminar, el lienzo queda con el estado final.
- **D-4i-3:** al cerrar una pantalla o componente, `new` pregunta si se arma otra u otro. Si sigue, lo nuevo se suma al mismo lienzo.
- **D-4i-4:** siempre se borran del lienzo las opciones no elegidas, **al elegir, no al final**. Lo que el usuario movió o agregó a mano en el lienzo no se pisa (regla de la etapa 2).
- **D-4i-5:** `define` muestra su tablero (colores, tipografía, estilo) en el lienzo del proyecto si el agente tiene acceso al tipo "Design"; si no, en un artifact privado aparte (como hoy). **Cambia** el "colores y fuentes en HTML local" de D-4c y el "artifact aparte" de 4h para ese caso.
- **D-4i-6 (G53):** en el chat queda solo lo que el usuario decide: una línea de qué se arma, las pantallas en una línea cada una y las preguntas con la recomendada primero (reglas del brainstorming del núcleo: no preguntar lo que está en el repo, lote corto de supuestos de bajo riesgo). El brief completo va a `brief.md` sin repetirlo en el chat.

**Contratos que cambian** (van primero en el CHANGELOG): el tablero de `define` (D-4i-5); el brief que el usuario "acaba de confirmar" ahora se confirma en forma corta (Q2); `new` agrega afinar y seguir (límites, Q3).

## Rulings técnicos (registrados)

- **R-4i-1: quitar es un cambio de `merge`, no un script nuevo.** Rehacer `build --options <elegida>` (ya acepta un subconjunto de letras) deja fuera los marcos de las otras. `diffPublished` ya calcula `removed`, pero hoy solo informa. Con este hito `mergeIndex` saca de `boards` y `order` del índice vivo los marcos que **esta corrida publicó** (`published.files` y `published.boards`) y que ya no se construyen; `plan` manda `null` en `files` para esos caminos y `recordStep` los saca de `publish.json` y de las cifras del lienzo. *Por qué:* un solo camino de publicación (`build` → `plan` → `canvas-read-live` → `merge` → `plan` → `canvas-publish`), sin subcomando que se pueda llamar mal.
- **R-4i-2: qué se quita y qué no.** Solo lo que figura en `publish.json` de esta corrida: marcos y la nota de fila de las opciones descartadas. Un marco no elegido que el usuario **movió** se quita igual (moverlo no lo vuelve suyo); uno **editado a mano** (hash distinto) frena con `artboard-edited-by-hand` y pregunta, como en la etapa 2 (`--accept-overwrite` con su sí). Una nota de fila cuyo texto el usuario cambió se conserva. Marcos, notas y páginas que no están en `publish.json` no se tocan jamás.
- **R-4i-3: `null` en `files` solo para lo que se quita.** `assertParams` admite `null` únicamente como valor de `files` y únicamente para caminos de `removed`; cualquier otro `null` es `bad-params`. *Por qué:* la lista de claves prohibidas y el control de parámetros siguen cerrando lo que `plan` puede mandar.
- **R-4i-4: el orden al elegir.** Elegir en el chat (cita literal) → si combina, se construye y se publica la combinada (`option-D`, circuito de regenerar) y el usuario la confirma → recién entonces se quita lo no elegido → se afina (R-4i-5). Las carpetas locales `<run>/option-*` se conservan (`approve.mjs save` las usa).
- **R-4i-5: afinar.** Un cambio pedido después de elegir se aplica a `<run>/option-<X>/`, pasa `options-check` y `leak-check`, y se republica con el mismo circuito (`build --options <X>`, `plan`, lectura, `merge`, `plan`, publicación). Tope técnico: **3 rondas de afinado**; lo que sobra queda como pendiente. `approve.mjs save` corre **después** de la última ronda, así lo aprobado es el estado final del lienzo. Un cambio de aspecto pedido **después** de aprobar (por ejemplo al ver la app) repite afinar y guarda `<flow>-v2` (una decisión aprobada no se edita).
- **R-4i-6: otra pantalla = otra corrida, otra página del mismo lienzo.** La etapa 2 ya crece una página por corrida: no hace falta mecanismo nuevo. Al decir sí, `new` termina el informe de esta pantalla, crea una corrida nueva (`run.mjs init`), reutiliza `PRODUCT.md`, `DESIGN.md` y el lienzo registrado, y vuelve al paso 3 (brief corto) para lo nuevo.
- **R-4i-7: modo local.** Con `mode: local` (no hay tipo "Design", `publish: never`, `presentation = local`, "no publiques") el afinado y la limpieza se hacen sobre `compare.html` y nada se publica: la privacidad de D-4c manda sobre D-4i-1 (Q1).
- **R-4i-8: el tablero de `define` como una opción de una pantalla.** `canvas-index.mjs build` con una sola opción `A` y la pantalla `board.html` (un solo archivo, fuentes del sistema, sin script, como ya exige el paso 5 de `define`). Se decide con `present --kind option` (el modo `direction` es siempre local) y la nota de fila dice "Tablero" (`build --row-title`, opcional, hasta 40 caracteres; sin la opción sigue "Opción A"). Si `build` o `plan` salen con 1 o 2, el tablero va al artifact aparte de hoy (nunca los dos). Tras elegir una dirección, el tablero se reescribe con **solo** la elegida y se republica en el lugar (D-4i-4 también vale acá).
- **R-4i-9: el brief corto.** Forma del chat: (1) una línea `Armo: <qué es>`; (2) las pantallas en orden, una línea cada una; (3) un lote numerado de **a lo sumo 4** supuestos de bajo riesgo, cada uno con su fuente (`PRODUCT.md`, `DESIGN.md`, README, pantallas existentes), con la pregunta única "¿van así o cambiás alguno?"; (4) las preguntas que son del usuario (a lo sumo 3, con AskUserQuestion, recomendada primero, con "Otra" libre). `## First look` y `## Do not touch` salen de `PRODUCT.md` (ya los define) y solo se muestran si esta pantalla difiere o `PRODUCT.md` no los tiene. Todo lo demás (qué es, quién la usa, inventario de contenido, orden de lectura, datos de muestra, registro) se escribe en `<run>/brief.md` y el chat dice una sola línea con la ruta. Sin versión, sin "dónde se muestran las opciones" (lo dice el aviso del paso de presentar).
- **R-4i-10: ruido de otras salidas de `new`** (propuestas concretas, sin tocar avisos con contrato): (a) se va la línea `pignolo-ui <pluginVersion>` del chat de `new` y `define` (la versión ya va en la primera línea del informe, `report-line`); (b) los avisos previos al brief (la línea de `context`, el "se usa el valor por defecto" de `<N>`/`<profile>`, `sin navegador`) se juntan en **una** línea de avisos, y solo si hay alguno; (c) `compare.mjs approved` ("solo informativo") se dice solo si encontró diferencias; (d) el paso 8 no repite en prosa lo que ya dice la primera línea del informe. **Quedan como están:** el aviso de una línea de publicación (D-4c-3, `NOTICE`), la estimación `≈ N corridas de ~X k tokens`, `lienzo: local (<motivo>)` y los avisos de límites y de frenos. Si algo de esto choca con un contrato, es la pregunta Q4.

## Global Constraints

- Nada se escribe en el proyecto sin un diff confirmado; el agente no commitea; nunca se borra un lienzo o artifact entero.
- **Lo que el usuario hizo en el lienzo no se pisa** (regla de la etapa 2): marcos movidos, notas, páginas, artboards propios, claves desconocidas.
- Las skills siguen bajo 12 000 caracteres; los textos de referencia sin variables `${…}`.
- 4i solo agrega o mueve frases; **no rompe las cadenas que fijan los tests de las etapas del lienzo, de 4f y de 4h**, salvo las que este plan nombra.
- Hereda las restricciones del hito 4 (sin red, fixtures sintéticos, nombres en inglés, mensajes al usuario en español, commits en español, LF sin BOM, un archivo de test por vez).

## Método de ejecución

- **Rama:** `ui/hito-4i`, desde `main`. Un commit por tarjeta.
- **Orden:** T1 → T2 → T3 → T4 → T5 → T6 → revisión opus de `main..ui/hito-4i` (T1 toca el camino de publicación: revisión propia, no se agrupa) → una pasada de arreglos → suite completa una vez → unión → **0.9.0**.
- **Auditoría previa del plan:** no (no toca guardia ni respaldos; el borrado es de archivos del propio lienzo, con la guarda de R-4i-2).
- **Autochequeo del ejecutor (con evidencia, máximo 5):** (1) un `merge` con un marco del usuario que se llama igual que uno quitado, con mayúsculas distintas, no lo quita; (2) rutas `project/…` con `..` o con `\` en `removed` se rechazan; (3) `publish.json` de una corrida anterior (v2 sin esta lógica) sigue leyéndose; (4) las skills y referencias en UTF-8 sin BOM y bajo sus topes (`wc -c`); (5) cada afirmación del informe marcada "probado" o "no probado".

## Tarjetas

### T1 — quitar del lienzo lo no elegido (`merge`, `plan`, `record`)

- [ ] **Archivos:** `plugins/pignolo-ui/lib/canvas-merge.mjs`, `lib/canvas-publish.mjs`, `scripts/canvas-index.mjs` (solo para pasar `removed`), `tests/canvas-drop.test.mjs` (nuevo; usa `tests/support/canvas-plan.mjs` y `canvas-run.mjs`).
- [ ] **Interfaces:**
  - `mergeIndex({..., removed = []})`: `removed` son nombres (`r-…-b-inicio.dc.html`) y vienen de `diffPublished`. Salida `kept.dropped` (nombres sacados) y `kept.dropKept` (notas conservadas porque el usuario las cambió). Problemas nuevos: ninguno; un quitado editado a mano reusa `artboard-edited-by-hand` (con `--accept-overwrite` se quita).
  - `planNext`: el paso `canvas-publish` suma `files[<camino>] = null` por cada camino de `removed` que sigue en el índice vivo; `done` es falso mientras haya `removed`; los caminos quitados entran en la lectura del vivo (`knownFiles` ya los trae).
  - `assertParams`: `null` admitido solo como valor de `files` y solo para caminos de `removed` (R-4i-3).
  - `recordStep`: saca de `files`, `sizes`, `boards` y `notes` de `publish.json` lo quitado y baja `files` y `bytes` del registro `canvas` de `project.json` (no por debajo de 0).
- [ ] **Casos de test (nombres literales):**
  - `mergeIndex: a board of ours that is no longer built leaves boards and order of the live index`
  - `mergeIndex: a moved board that was not chosen is removed, a board of the user with another name is kept`
  - `mergeIndex: a removed board edited by hand stops with artboard-edited-by-hand and goes with --accept-overwrite`
  - `mergeIndex: the row note of a removed option is removed, unless the user changed its text`
  - `mergeIndex: a board that is not in publish.json is never removed`
  - `mergeIndex: names that differ only in capitals are not removed` (autochequeo 1)
  - `planNext: canvas-publish carries null for each removed path and for nothing else`
  - `assertParams: null is accepted only as a value of files, only for removed paths`
  - `planNext: a run whose only change is a removal is not done`
  - `recordStep: removed paths leave publish.json and lower the figures of the canvas record`
  - `canvas-index CLI: after publishing A,B,C, build --options B then plan, merge and plan sends nulls for A and C and keeps what the user added` (arma el vivo con un marco del usuario)
  - `diffPublished: removed lists the unchosen paths` (guarda de regresión)
- [ ] **Rojo:** hacer que `mergeIndex` ignore `removed`; dejar pasar cualquier `null` en `assertParams`; no sacar de `publish.json` en `recordStep`. Cada uno rompe su caso.

### T2 — afinar, quitar al elegir y seguir con otra pantalla (textos)

- [ ] **Archivos:** `reference/present-and-choose.md` (pasos 4 y 5; recortar repeticiones para no crecer), `skills/new/SKILL.md` (pasos 5 y 8, "Limits"), `skills/improve/SKILL.md` (una línea: sigue el paso 4 de `present-and-choose.md`, que ahora quita lo no elegido; R-4i-1 vale igual), `tests/skill-new.test.mjs`, `tests/skill-improve.test.mjs`.
- [ ] **Texto (R-4i-1, 4, 5, 6, 7):** al confirmar la elección se rehace `build --options <X>` (y `compare.mjs heights --options <X>`) y se corre el circuito; lo quitado se dice en una línea ("saqué del lienzo las opciones A y C; lo que moviste o agregaste sigue"); `artboard-edited-by-hand` sigue preguntando. Afinar con tope de 3 rondas antes de `approve.mjs save`. Paso nuevo de `new` tras el informe: `Next screen`, pregunta con AskUserQuestion "¿Armamos otra pantalla o componente?" (la recomendada primero: "Sí, otra" si el brief listaba más pantallas sin armar, si no "No, terminamos") y, con sí, corrida nueva en el mismo lienzo. "Limits": `refinement rounds` aparte de "one round of mockups".
- [ ] **Casos de test:**
  - `new: after the choice the canvas drops the unchosen options before refining, and approve.mjs save comes after the last refinement` (`indexOrder` sobre `present-and-choose.md`: `Drop the options not chosen`, `Refine`, `approve.mjs" save`; incluye `build ... --options <X>`).
  - `present-and-choose: a change after the choice is applied to the chosen option and republished, never only to the local copy` (incluye `never only` y `option-<X>`).
  - `present-and-choose: the text says that what the user moved or added is not touched and that an edited artboard asks` (guarda de regresión de la etapa 2, cadenas `artboard-edited-by-hand` y `no cambia` conservadas).
  - `new: a Next screen step asks with AskUserQuestion and a yes opens a new run in the same canvas` (`indexOrder`: `Report` → `Next screen`; incluye `same canvas`, `run.mjs" init`).
  - `new and improve: size under 12000 and every script call exists` (guarda de regresión).
- [ ] **Rojo:** mover `Drop the options not chosen` después de `approve.mjs save`; quitar `AskUserQuestion` del paso nuevo.

### T3 — brief corto y menos ruido en `new` (G53)

- [ ] **Archivos:** `skills/new/SKILL.md` (paso 1: sin la línea de versión; paso 3; paso 7: `compare.mjs approved`), `reference/context.md` (parte 2: "What the chat shows" con R-4i-9), `tests/skill-new.test.mjs`, `tests/skill-define.test.mjs` (la línea de versión).
- [ ] **Texto:** paso 3 pasa a `Brief, in chat and in a file`: forma de R-4i-9 con un límite de largo ("a lo sumo 12 líneas sin contar las preguntas"), `brief.md` escrito con el formato de siempre (`## Screen`, `## First look`, `## Do not touch`, `Register:` solo si difiere) y una línea con la ruta; `provided.json` y `data-sample` no cambian. El resto de R-4i-10 (a) a (d).
- [ ] **Casos de test:**
  - `new: the version line is not printed in the chat` (`!text.includes('pignolo-ui <pluginVersion>')`; `define` igual; `audit` conserva la suya: su test no se toca).
  - `new: the brief in the chat has a one-line summary, the screens, a batch of at most 4 assumptions and at most 3 questions with the recommended first` (cadenas: `Armo:`, `at most 4`, `at most 3`, `recommended`, `AskUserQuestion`).
  - `new: the full brief goes to brief.md and is not repeated in the chat` (`not repeated in the chat`; el orden `Brief, in chat and in a file` → `run.mjs" context` → `--brief-file` se conserva).
  - `context.md: First look and Do not touch come from PRODUCT.md and are shown only when they differ` (incluye `only when`).
  - `new: one line of notices at most` (incluye `one line of notices`; el aviso de publicación `privados de tu cuenta de claude.ai` sigue en `present-and-choose.md`: guarda de regresión).
  - `new: compare.mjs approved is said only when it finds a difference`.
  - Guardas de regresión de 4f: los tests existentes de `--brief-file` y `## First look` / `## Do not touch` siguen en verde sin cambios.
- [ ] **Rojo:** devolver la línea de versión; borrar `not repeated in the chat`.

### T4 — el tablero de `define` en el lienzo

- [ ] **Archivos:** `reference/define-board.md` (nuevo, sin variables, bajo 5 000), `skills/define/SKILL.md` (paso 1 lista los tipos como `new` y paso 5 "Show it" se reduce a una referencia; **debe quedar bajo 12 000**), `lib/canvas-layout.mjs` y `scripts/canvas-index.mjs` (`build --row-title`), `tests/fixtures/define-board.html` (nuevo, sintético), `tests/skill-define.test.mjs`, `tests/canvas-index-cli.test.mjs`.
- [ ] **Interfaz:** `canvas-index.mjs build ... [--row-title <texto de 1 a 40 caracteres, sin < ni >>]`; sin la opción, la nota dice `Opción A` como hoy.
- [ ] **Texto de `define-board.md`:** la decisión (`present --kind option`, `--design-type yes` solo con el tipo "Design" listado), `build` con `--options A --screens board.html --platform desktop --row-title "Tablero" --page-name "Definición · <fecha>"`, el circuito de `present-and-choose.md` paso 3 (se lo cita, no se copia), el aviso de una línea, qué viaja (los tokens y un encabezado y un párrafo del producto), la salida al artifact aparte con `file_path` `<run>/board/index.html` si `build` o `plan` fallan, "nunca los dos", y tras elegir la reescritura del tablero con solo la dirección elegida y la republicación en el lugar.
- [ ] **Casos de test:**
  - `define: the board goes to the canvas when the account has the Design type and to a separate private page when not` (`define-board.md` incluye `canvas-index.mjs" build`, `--row-title`, `present`, `--kind option`, `file_path`, `never both`).
  - `define: publish-gate comes before the types are listed, and before any Artifact call` (`indexOrder`: `publish-gate` → `scope: "types"`).
  - `define: size under 12000 and it loads define-board.md` (guarda del tope).
  - `define-board.md: no variables, under 5000 characters`.
  - `canvas-index build: the define board sample builds as one option with the row title Tablero` (la fixture pasa `scanMarkup` sin problemas; es la prueba temprana del riesgo R-1).
  - `canvas-index build: --row-title longer than 40 characters or with < is refused (exit 2)` y `canvas-index build: without --row-title the note says Opción A` (guarda de regresión).
  - `define: after the choice the board is rewritten with only the chosen direction and republished in place` (cadenas en `define-board.md`).
- [ ] **Rojo:** quitar `--row-title` de `build`; mover `publish-gate` después de `scope: "types"`.

### T5 — versión, documentos y renumeración

- [ ] **Archivos:** `plugins/pignolo-ui/.claude-plugin/plugin.json` (**0.9.0**), `plugins/pignolo-ui/CHANGELOG.md` (los contratos que cambian primero; **la etapa 3 del lienzo pasa a 0.10.0**), `README.md` (el flujo de `new` y el tablero), `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md` (nota de renumeración: etapa 3 = 0.10.0, etapa 4 = 0.11.0), `docs/plans/2026-10-01-pignolo-ui-hito-4g-opciones-de-un-elemento.md` (4g = 0.12.0), plan 4e (el resto de 4e = 0.13.0), `docs/gaps.md` (G52 y G53 a "hecho"), `docs/STATE.md` (orden: 4i entre la 0.8.0 y la etapa 3).
- [ ] **Test:** el que ya compara `plugin.json` con el CHANGELOG (guarda de regresión; en rojo si el CHANGELOG no tiene `## 0.9.0`).

### T6 — checklist manual

- [ ] **Archivo:** `plugins/pignolo-ui/tests/manual/hito-4i.md` (el autor no prueba hasta cerrar la v1; queda escrito, como `hito-4h.md`). Casos, cada uno con "pasa" o "falla" y qué se vio:
  - `new` de una pantalla: el chat muestra una línea de qué se arma, la lista de pantallas, a lo sumo 4 supuestos y las preguntas con la recomendada primero; ni línea de versión ni inventario completo; `brief.md` tiene todo.
  - Elegir una opción: el lienzo pierde las otras antes de afinar; un marco que el usuario movió y una nota que agregó siguen ahí.
  - Mover a mano una opción no elegida antes de elegir: igual se quita; editarla a mano: pregunta antes.
  - Pedir un cambio tras elegir: se ve en el lienzo (misma dirección), no solo en el HTML local; tras tres rondas, lo que sobra queda pendiente.
  - Cerrar la pantalla: pregunta si se arma otra; con sí, aparece una página nueva en el mismo lienzo; con no, el lienzo queda con una opción por pantalla.
  - Con `publish: never`: nada se publica, afinado y limpieza sobre `compare.html`.
  - `define` con tipo "Design": el tablero aparece en el lienzo; sin el tipo, en un artifact privado aparte; tras elegir, el tablero queda con la dirección elegida.
  - Un aviso de comentario sobre el lienzo no dispara cambios solo.

## Review Focus (revisión final)

1. **Borrado acotado** (T1): nada que no esté en `publish.json` de esta corrida se quita; un artboard editado a mano frena; el `null` solo viaja para lo quitado.
2. **El camino de publicación sigue cerrado:** claves prohibidas, fuga sobre los bytes exactos, límites por llamada y `plan`/`record` consistentes tras una quita.
3. **El orden al elegir** (R-4i-4) y que `approve.mjs save` guarda el estado final.
4. **El brief corto no pierde lo sellado:** `brief.md` sigue con sus dos partes obligatorias y `context --brief` lo valida.
5. **Cadenas de las etapas del lienzo, 4f y 4h en pie**, salvo las nombradas.

## Riesgos

- **R-1: el tablero de `define` puede no convertirse a artboard** (clases CSS, `@media`, fuentes: ya fueron riesgo de la etapa 1). Se prueba temprano con la fixture de T4; el artifact aparte es el respaldo explícito.
- **R-2: `files: { <camino>: null }` con `root` en la herramienta real no está verificado.** Si no borra el archivo pero el índice ya no lo lista, el marco desaparece del lienzo y el archivo queda huérfano e invisible: aceptable; se anota como supuesto sin puerta (como los de la etapa 2) y se mira en la revisión de la v1.
- **R-3: `present-and-choose.md` ya pasa de 13 000 caracteres** y es lo que más lee el agente: crece solo si se recorta lo repetido, y la revisión lo mide.
- **R-4: el brief corto puede dejar pasar un supuesto que el usuario no leyó.** Se limita a bajo riesgo y con fuente; lo irreversible, de costo o de seguridad sigue siendo pregunta (regla del brainstorming).
- **R-5: más rondas, más tokens.** Cada afinado cuesta una publicación y una lectura; el tope de 3 lo acota.

## Qué no entra

Medición paga (queda el checklist de T6; si el autor quiere medir, ficha según `docs/protocolo-de-pruebas.md`); borrar un lienzo; mover lo que el usuario puso; mismas salidas más cortas en `improve` y `audit`; el modo explorar y el Design System (etapas 3 y 4).

## Preguntas abiertas al autor

- **Q1.** "Siempre en el lienzo" y `publish: never` / `presentation = local` / "no publiques" chocan. El plan hace que el opt-out de privacidad (D-4c) gane y que ese caso trabaje sobre `compare.html`. ¿Es lo que querés?
- **Q2.** El `brief.md` sellado ya no es "el texto que el usuario acaba de confirmar" entero: `First look` y `Do not touch` salen de `PRODUCT.md` y no se repiten en el chat. ¿Está bien, o preferís que esas dos partes se muestren siempre en una línea cada una?
- **Q3.** El afinado después de elegir agrega rondas que el spec §6 no cuenta (hoy: una ronda más una regeneración). El plan pone tope técnico de 3 rondas. ¿Otro número?
- **Q4.** Recortes que tocan avisos con contrato: el `NOTICE` de publicación (D-4c-3, ~300 caracteres) es "una línea" pero larga; el plan **no lo toca**. La línea de versión se va solo de `new` y `define` (la de `audit` está fijada por su test). ¿Se acortan el aviso y las salidas de `improve` y `audit` en otro hito?

## Cambios de spec (los aplica el controlador al unir)

`docs/specs/2026-09-28-pignolo-ui-v1-design.md`: el tablero de `define` al lienzo con respaldo; `new` quita lo no elegido al elegir, afina sobre el lienzo y pregunta por otra pantalla; el brief se confirma en forma corta y se guarda completo en `brief.md`.
