# pignolo-ui v1 — Hito 4c: lienzo "Design" y "Design System". Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie (CLAUDE.md: "un solo ejecutor en serie por defecto"), sin revisión por tarea y una revisión final opus con una pasada de arreglos. Las tarjetas dan archivos, interfaces con nombres y formas exactos y casos de test literales; **el código lo escribe quien ejecuta**. Este plan no se construyó en una copia: el rojo de cada test nuevo se demuestra al ejecutar, rompiendo lo que protege. Los pasos usan casillas (`- [ ]`).
>
> **Origen:** decisión del autor del 2026-10-01. Trae de vuelta a la v1 lo que R10 había movido a v1.x (Task 5 y Task 5b del plan del hito 4, `docs/plans/2026-09-30-pignolo-ui-hito-4-flujos.md`) y suma el artifact "Design System". Hechos del formato real: `docs/research/2026-10-01-lienzo-design.md`.

**Objetivo.** Que `/pignolo-ui:new` e `/pignolo-ui:improve` muestren las **pantallas** de cada opción en un lienzo "Design" privado de claude.ai (un artboard por opción × pantalla × ancho; una fila por opción con su nota de título) para compararlas y comentarlas, y que publiquen los tokens de `DESIGN.md` como un "Design System" que el lienzo instala. Colores, tipografías y básicos (style tiles) siguen como HTML local, y `DESIGN.md` sigue siendo la fuente de verdad. Sin la herramienta, sin los tipos o si el usuario no quiere publicar: `compare.html` local con una línea de aviso.

**Arquitectura.** Todo lo que se puede decidir por script se hace por script y se prueba con `npm test`, sin red; lo único que sale de la máquina son **dos o cuatro llamadas a `Artifact` que hace el hilo principal** con parámetros que un script calculó y verificó (`canvas-index plan`). Lo publicado queda verificado **localmente** (el lienzo publicado no se relee, porque el tipo lo pide).

**Stack:** Node ≥ 22, sin dependencias npm, ESM `.mjs`, `node:test` + `node:assert/strict`. **Spec:** `docs/specs/2026-09-28-pignolo-ui-v1-design.md` §3, §7, §8, §12, §13, §13.1 (cambios en "Cambios de spec", abajo; este plan **no** edita el spec).

**Prerrequisito:** `main` con el hito 4 unido (pignolo-ui **0.6.1**) y esta rama sobre él. **Task 0 (sin código, primer paso):** `git grep` de los nombres que este plan consume y anotar lo que haya cambiado: `decidePresentation` (`lib/presentation.mjs`), `checkOption` y `gitState` (`lib/option-check.mjs`), `checkScreens` (`lib/approved.mjs`), `checkLeaks` y `readValuesFile` (`lib/leak-check.mjs`), `buildCompareHtml` (`lib/compare-html.mjs`), `validateDesign(text, {catalog}) → { status, data, ... }` (`lib/design-doc.mjs`; **comprobar la forma de `data`**: `colors`, `typography`, `rounded`, `spacing`, `pignolo.themes.dark`, `pignolo.elevation`, `pignolo.platform`), `parseColor` (`lib/color.mjs`), `VALIDATORS` y `writeConfig` (`lib/project-config.mjs`), los subcomandos de `scripts/run.mjs` (`present`, `compare-html`, `options-check`, `discard`, `report-line`), `isInsideRunRoot`/`RUN_ROOT`, y los helpers de `tests/helpers.mjs`. El catálogo, `ui-check`, `browser.mjs` y `report-check` **no cambian**.

## Alcance del hito 4c

- **Adentro:** conversor `.html` → `.dc.html`; disposición del lienzo y `canvas.json`; script `canvas-index` (`build`, `verify`, `plan`, `diff`, `merge`, `record`); conversión `DESIGN.md` → Design System (`design-system.mjs`); decisión de presentación con consentimiento y respaldo; tres reglas de forma nuevas para `ui-option` (verificadas por `options-check`); textos de `new`, `improve` y `present-and-choose.md`; el camino de actualización cuando se regenera una opción; puerta manual con publicaciones reales de prueba; evals; versión 0.7.0.
- **Afuera, con dueño:**
  - Style tiles y direcciones en el lienzo: **no** (decisión del autor; quedan locales).
  - Leer los comentarios del lienzo por código o dejar que decidan algo: no (D-4c-5).
  - Capturas, código del proyecto o datos reales en el lienzo: nunca (R-07 del spec).
  - Compartir el lienzo o el sistema: nunca desde el agente (el menú Share es del usuario).
  - Componentes con vista previa, íconos, fuentes y `shadow` en el Design System: v1.x (D-4c-7).
  - La allowlist del núcleo, el filtro `pii-patterns` y el registro en `decisions/` del núcleo: hito 5 de pignolo-ui, sin cambios.

## Global Constraints

- Las del plan del hito 4 siguen vigentes (Node ≥ 22, sin dependencias, sin hooks ni binarios; imports solo `node:` o relativos con extensión; ningún `spawn` con shell; nombres, claves y `reason` en inglés; mensajes al usuario por stderr en español y sin stack; commits en español con `git commit -F <archivo>` y los trailers de la sesión; archivos en LF sin BOM; rutas siempre por argumento y variables solo en `SKILL.md`; "no corrió" no es "pasó"; fixtures sintéticos, sin personas, proyectos ni credenciales reales; temporales solo con `makeTempDir()`; el repo es público).
- **Ningún test ni script de este plan invoca `Artifact`.** Solo el hilo principal lo invoca, desde las skills, con `mode: canvas` y después de `canvas-index plan` en exit 0. Las publicaciones reales de la Task 6 y del checklist las hace el hilo principal con el autor presente.
- **Nada se publica sin que `canvas-index plan` haya corrido `verify` y el chequeo de fuga sobre los bytes exactos** (`<run>/canvas/` y `<run>/design-system/`): el chequeo de `ui-option` sobre las carpetas de opciones sigue, pero ya no alcanza (el conversor y el generador de tokens agregan texto).
- Todo lo publicado es privado: ningún parámetro de `Artifact` pide compartir; el resultado debe decir "readable by only you" y la skill lo cita (si dice otra cosa, `BLOCKED` para publicar y se avisa).
- El lienzo y el sistema publicados **no se releen ni se capturan** (el tipo lo pide). Se citan la URL y los sha256 locales (`<run>/publish.json`).
- **Borrar o despublicar cualquier artifact requiere la confirmación explícita del autor en ese momento.** Ninguna tarea lo hace por su cuenta.
- Escrituras de los scripts nuevos: solo dentro de `<run>/` (comprobado con `isInsideRunRoot`), nunca a través de un enlace (`lstat`).
- El ejecutor corre solo sus archivos con `node --test --test-reporter=dot <archivo>`; la suite completa (`npm test`, `npm run test:ui`) una vez por tarea cerrada. **Todo test nuevo se demuestra en rojo rompiendo lo que protege**; un caso que ya pasa hoy se marca "guarda de regresión".

## Método de ejecución y economía de tests

- **Rama:** `ui/hito-4c`, desde `main`; un worktree para el ejecutor; cada tarea termina con su commit.
- **Orden (serie):** olas en "Olas", más abajo. T0 → T1 → T2 → T3 → T4 → T5 → **T6 (puerta manual con el autor)** → T7 → T8 → T9 → T10 → T11.
- **Modelos:** sonnet en todas las tareas; revisores y auditores en opus.
- **Tests:** ≈ 150 nuevos, todos sin red (los de navegador, pocos y con `BROWSER_SKIP` visible). Desglose en "Estimación de tests".

## Review Focus (revisión final opus)

1. **Se publica solo lo permitido.** Ningún camino llama a `Artifact` sin `plan` en exit 0; el `plan` exige chequeo de fuga limpio sobre los bytes de `manifest.json`; lo publicado sale de la carpeta del run y coincide con los sha256; nunca capturas, código ni datos reales. Dueñas: **T2** (`verify`), **T7** (`plan`), **T9** (texto).
2. **Fallo cerrado.** Sin `Artifact`, sin tipo, sin consentimiento, con rechazo del usuario, con `verify` en 1 o con una fuga: `compare.html` local y una línea de aviso, nunca un lienzo a medias. Dueñas: **T4**, **T7**, **T9**.
3. **Privado de verdad.** Ninguna llamada pide compartir; el resultado se lee. Dueña: **T9** y checklist.
4. **El conversor no inventa ni repara.** Entrada mal formada o con `{{`: se rechaza (la regla se detecta ya en `options-check`); la salida es determinista (golden byte a byte). Dueñas: **T1**, **T5**.
5. **Actualización sin pisar al usuario.** Solo se envían archivos cambiados; el índice solo si cambió la disposición y combinado con el vivo (`merge`), nunca reemplazado. Dueña: **T7**.
6. **Mapa de tokens sin pérdidas silenciosas.** Lo que no se puede mapear queda en `omitted` con el motivo y se dice. Dueña: **T3**.

## Rulings del plan (técnicos, registrados)

- **R-1: conversor determinista, no artboards escritos por `ui-option`.** `ui-option` sigue escribiendo HTML plano (`option-<X>/<pantalla>.html`) y un conversor (`lib/canvas.mjs`, `toArtboard`) lo envuelve en `.dc.html`. Razones: (a) la fuente de verdad es el HTML local (spec principio 7, A-20), y el respaldo `compare.html`, `compare.mjs` (huellas), `ui-check`, `leak-check` y `approve.mjs` leen HTML plano: con artboards directos habría que mantener dos archivos por pantalla que pueden diverger; (b) `ui-option` solo tiene `Write` y el esqueleto del tipo "falla en silencio" (cerrar todo elemento, comillas, `{{`): un conversor con golden lo cubre y un LLM no; (c) el costo en tokens de `ui-option` no cambia (un archivo por pantalla). Costo aceptado: tres reglas de forma más en el contrato de `ui-option` (R-5).
- **R-2: qué va al lienzo y qué no.** Solo opciones de mockup (`--kind option`), tanto de `new` como de `improve`. Style tiles y direcciones (`--kind direction`) y el "antes" **no**: locales, siempre. El Design System se publica desde `DESIGN.md` (R-11), no desde las opciones.
- **R-3: nombres, tamaños y disposición (números fijos).**
  - Tamaños: `mobile` → 390×844; `desktop` → 1440×900; `both` → las dos filas por opción, **390 primero**. (`compare.html` conserva sus 375/1440; no se toca.)
  - Nombres de archivo: con un solo tamaño, la primera pantalla de la opción A es `Main.dc.html` y las demás `<x>-<pantalla>.dc.html` (`a-detalle.dc.html`, `b-inicio.dc.html`); con `both` **todo nombre lleva el ancho** salvo `Main.dc.html` (= primera pantalla de A a 390): `a-detalle-390.dc.html`, `a-inicio-1440.dc.html`. Letras en minúscula; la pantalla ya cumple `^[a-z0-9][a-z0-9-]*$`; se valida contra `^[A-Za-z0-9_][A-Za-z0-9_.-]*\.dc\.html$` y raíces únicas sin distinguir mayúsculas.
  - Disposición: 80 px entre marcos de una fila; **260 px entre filas** (la zona de la nota de título: la nota va a `y = yFila − 260`, que cumple el "≥ 223 px arriba" y no pisa los marcos de la fila de arriba; el spec pide ≥ 120 entre filas y 260 lo cumple); primera fila en `y = 260`, `x` inicial 0; el alto de una fila es el mayor `h` de sus marcos; `maxW` de la nota = ancho de su fila.
  - Textos de notas: `Opción A`; con `both`, `Opción A · 390` y `Opción A · 1440`. `title` de un marco: `A · <pantalla>` (con `both`, `A · <pantalla> · <ancho>`), sin `.html`.
- **R-4: forma del artboard.** Salida de `toArtboard({ html, w, h, lang })`: el esqueleto del tipo (`<!doctype html>`, `<html lang>`, `<head>` con `<meta charset="utf-8">`, `<title>` y **exactamente** `<script src="./support.js"></script>`; `<body><x-dc><helmet><style>` con `body{margin:0}` más todo el `<style>` del original; **una raíz** `<div style="width: <w>px; min-height: <h>px; box-sizing: border-box">` con el cuerpo del original; `</x-dc>`; y el bloque `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":<w>,"height":<h>}}'>` con `class Component extends DCLogic { renderVals() { return {}; } }`). Los `<a href="<pantalla>.html">` pasan a `<a href="<destino>.dc.html">` (mismo ancho y misma opción). **No** se duplican estados `:hover/:focus` como clases (el spec §13.1 lo pedía; el hover nativo del `<style>` alcanza y es menos código); **no** se agrega Google Fonts (el HTML de `ui-option` no tiene recursos remotos, así que el artboard usa la misma pila de fuentes y el mismo aspecto que el local); **no** es un objetivo que el panel de propiedades del lienzo edite el diseño (se compara y se comenta, no se edita). Los atributos booleanos salen `nombre=""`; los elementos vacíos (`br`, `img`, `input`, `meta`, `hr`) quedan como en el original, sin `/>`. `is_interactive` en el índice cuando la pantalla tiene `a[href]` a otra pantalla, `button`, `input`, `select`, `textarea` o `details`.
- **R-5: tres reglas nuevas del contrato de `ui-option`**, verificadas por `options-check` (así una opción mala falla al generarse, dentro del tope de regeneración, y no al publicar): (1) **bien formada**: todo elemento no vacío cerrado y bien anidado, todo valor de atributo entre comillas; (2) **sin `{{` ni `}}`** en el texto ni en los atributos; (3) **ningún `<button>`, `<input>`, `<select>` ni `<textarea>` dentro de un `<a>`** (en el lienzo se traga el clic): el enlace entre pantallas se estiliza como botón con el propio `<a>`. Más: nada de las etiquetas reservadas `x-dc`, `helmet`, `sc-*` ni `dc-import`. Problemas nuevos de `checkOption`: `malformed`, `braces`, `control-in-link`, `reserved-tag`. Es contrato interno entre el brief y los scripts; no cambia ningún contrato público (D-4c-8).
- **R-6: `scripts/canvas-index.mjs`** (determinista, solo escribe bajo `<run>/canvas/`):
  - `build`: lee `<run>/option-<X>/<pantalla>.html` en el orden de `--screens`, convierte, escribe `<run>/canvas/project/*.dc.html`, `project/canvas.json` y `<run>/canvas/manifest.json` (`{ files: [{ path, sha256 }], layoutSha256 }`).
  - `verify`: valida **lo escrito** (nombres, esqueleto, índice, posiciones, manifest); lo corre `plan` y lo corre quien ejecuta.
  - `plan`: `verify` + chequeo de fuga + armado de los parámetros de `Artifact` (R-7).
  - `diff`: qué cambió respecto de `<run>/publish.json` (R-9).
  - `merge`: combina el índice local con el vivo (R-9).
  - `record`: anota en `<run>/publish.json` lo que se publicó.
  Subcomandos con opciones cerradas (una opción desconocida es exit 2). Exit 0 hecho, 1 rechazo o hallazgo, 2 uso o error propio.
- **R-7: quién llama a `Artifact` y cómo.** Solo el hilo principal, con los parámetros que imprime `canvas-index plan`. Orden (el sistema va **primero** porque el lienzo lo instala copiando su `tokens.json` del lado del servidor):
  1. *(solo si hace falta un sistema nuevo)* `ds-create`: `publish` con `type_url` = el del listado para el título exacto "Design System", `title` = nombre de `DESIGN.md`, `auto_open: "after_first_write"`, sin archivos → `url` del sistema.
  2. `ds-publish`: `publish` con esa `url`, `root` = `<run>/design-system`, `file_path` = ruta absoluta de `project/design-system.json`, `files` = el resto (índice **una sola vez, en esta llamada**).
  3. `canvas-create`: `publish` con `type_url` = el de "Design", `title`, `auto_open: "after_first_write"`, sin archivos → `url` del lienzo.
  4. `canvas-publish`: `publish` con esa `url`, `root` = `<run>/canvas`, `file_path` = ruta absoluta de `project/canvas.json` y `files` = cada `project/<nombre>.dc.html` más `"project/ds/<carpeta>/tokens.json": { "artifact": "<dirección del sistema cortada tras su id>", "path": "project/tokens.json" }`; el índice lleva el registro `designSystems`.
  Con el sistema ya publicado y sin cambios (R-11): se salta 1 y 2 (2 llamadas). Sin tipo "Design System" pero con "Design": solo 3 y 4, sin instalar nada, con una línea de aviso (2 llamadas). Después de cada llamada, `canvas-index record`. Nunca se vuelve a pasar `type_url` para un lienzo o sistema que ya tiene `url`.
- **R-8: fuga antes de publicar.** `plan` corre `checkLeaks` sobre `<run>/canvas/` y `<run>/design-system/` (recursivo, todo archivo) con el archivo de valores (`run.mjs leak-values`); cualquier hallazgo → exit 1 y **ningún parámetro de `Artifact`** en la salida. Con el núcleo activo se aplica además su filtro de `pii-patterns` (hito 5; hoy no existe, y el texto de la skill dice que sin él solo corre lo de pignolo-ui).
- **R-9: camino de actualización** (regenerar una opción, o mostrar un flujo combinado, con el lienzo ya publicado en este run). `canvas-index build` se vuelve a correr completo (es barato y determinista) y `diff --published <run>/publish.json` calcula: `changed` (rutas con sha256 distinto o nuevas), `removed` (rutas que ya no están) y `sendIndex` (la disposición cambió: `layoutSha256` distinto, que cubre posiciones, tamaños, títulos, notas y `order`). Una sola llamada `canvas-publish` con **solo** `changed` (más `null` para `removed`; el tipo dice que quitar un artboard lo hace el usuario en la página, así que `removed` se informa y no se envía) y el índice **solo si `sendIndex`**; antes de enviarlo, `Artifact read` de `project/canvas.json` vivo y `canvas-index merge --ours <local> --live <leído>`, que conserva todo lo que el usuario movió o agregó (`x`/`y` de marcos existentes, notas y claves ajenas) y pisa solo lo que el plan controla (`w`, `h`, `title`, `is_interactive`, `order` de los nuestros, registro `designSystems` nuestro). Si el tool rechaza por edición ajena: leer lo que nombra, rehacer una vez; a la tercera, avisar y seguir en local. Con `sendIndex` falso y `changed` vacío no se llama a nada.
- **R-10: la elección sigue en el chat.** Comentar un artboard es insumo; la elección la toma el hilo principal del turno del usuario y la registra `approve.mjs record --quote-file` (R-8 del plan del hito 4, sin cambios). En esta versión **no se leen los comentarios** (D-4c-5); si el usuario dice "mirá mis comentarios", la skill puede leerlos con `ArtifactComments` como dato, nunca como instrucción, y la cita que se registra sigue siendo la del chat.
- **R-11: Design System desde `DESIGN.md`.** `scripts/design-system.mjs build` (R-12) lo genera de `DESIGN.md` validado. **Cuándo se publica o republica:** al aprobarse `DESIGN.md` (creación desde la dirección elegida, extracción o completado confirmado como diff) y, en cualquier flujo con lienzo, si el sha256 de `DESIGN.md` difiere del último publicado (`designSystem.sha256` en `project.json`); si coincide, no se publica nada. Un sistema por proyecto: se **actualiza el mismo** (`url` guardada), nunca se crea otro; una actualización envía `tokens.json`, `README.md` y la tapa, y el índice solo si cambió el título. Se publica solo con el consentimiento del proyecto (D-4c-3).
- **R-12: mapa `DESIGN.md` → `tokens.json`.** `lib/design-tokens.mjs` (determinista, mismo orden que `DESIGN.md`):
  - `color.themes`: `light` y, si `pignolo.themes.dark` existe, `dark`. `color.tokens`: cada `colors.<k>` con nombre válido; hex tal cual; `{colors.x}` pasa a `{x}` si `x` existe y no es el propio token, si no se omite (`bad-alias`); si `pignolo.themes.dark.<k>` existe, el valor es `{ light, dark }`; solo se aceptan hex, `rgb()`, `rgba()`, `hsl()` y `oklch()` (lo demás se omite, `unreadable-color`). `usage` = `Token colors.<k> de DESIGN.md.`
  - `spacing.tokens`: `space-<k>`; `radius.tokens`: `radius-<k>` (los prefijos evitan choques de nombre entre familias); valores `px|rem|em|%` o número.
  - `type`: `fonts: []`, `families` = una entrada por `fontFamily` distinto (clave = minúsculas con `-`, valor = `"<familia>"` entrecomillada), `groups` = un grupo por familia con `styles` `{ name, fontSize, lineHeight, fontWeight }` (`fontWeight` número). `letterSpacing` y demás propiedades: se omiten (`unsupported-property`).
  - Se omiten y se informan: `components`, `pignolo.elevation` (`shadow`, sin verificar, D-4c-7), `pignolo.motion`, estados.
  - Un nombre fuera de `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}` o repetido entre familias: `bad-name` o `duplicate-name` (se omite el segundo); si no queda ningún color, exit 1.
  - `README.md` determinista: nombre, descripción, plataforma y registro de `DESIGN.md`, cuántos tokens por familia, lista de lo omitido y la línea "Generado desde DESIGN.md del proyecto, que es la fuente de verdad; no editar acá". Nunca copia la prosa de `DESIGN.md` (decisiones y rechazos pueden tener datos del proyecto).
- **R-13: sin verificación posterior.** Se verifica lo local (`verify`, golden, sha256 en `publish.json`); se declara como excepción al principio 2, igual que el spec §12.
- **R-14: versión 0.7.0** (interfaz nueva: `canvas-index`, `design-system`, claves de configuración, subcomandos de `run.mjs`). CHANGELOG. El `description` de `presentation` en `plugin.json` deja de decir que nada se publica.
- **R-15: alto de los marcos.** Por defecto, el de R-3. Con navegador, `compare.mjs heights` mide el alto real de cada pantalla al ancho de su fila y `canvas-index build --heights <json>` lo usa (`h = clamp(medido, 400, 8000)`); sin navegador, el de R-3 y una línea de aviso. Es la Task 8, **la primera que se recorta** si el presupuesto aprieta: la raíz usa `min-height`, así que una página más alta que su marco no se recorta por el HTML (el recorte, si lo hay, es del marco; ver checklist).
- **R-16: un lienzo por run** (título: `pignolo-ui · <flujo> · <fecha>`; el sistema: nombre de `DESIGN.md`). Los lienzos viejos los borra el usuario cuando quiere; la poda de 14 días solo borra carpetas locales.
- **R-17: puerta de formato antes de construir sobre supuestos** (Task 6). Lo que el plan **no** pudo verificar sin publicar está en `docs/research/2026-10-01-lienzo-design.md` §6. Si una puerta falla, se corrige el conversor o se decide con el autor (D-4c-7), no se improvisa.

## Decisiones del autor

Todas tienen recomendación; ninguna bloquea T0 a T5.

- **D-4c-1 (costo; evals de `ui-option`).** El contrato cambia en R-5 y hay que volver a correr los 3 casos de `ui-option` (`tests/evals/ui-cases.mjs`) y agregar graders de las tres reglas. **Recomiendo correrlos** (≈ 3 corridas de sonnet, del orden de 1 a 2 USD según el ≈ 18 k tokens por corrida de §15 y las evals del hito 4) con tope 3 USD, y **no** correr de nuevo los del auditor (no cambia). Sin esto no se sabe si sonnet cumple las reglas nuevas con el brief.
- **D-4c-2 (publicaciones reales de prueba).** La puerta T6 y el checklist necesitan publicar de verdad: **actualizar el lienzo privado de prueba que ya existe** (una llamada), **crear un Design System privado de prueba** (dos llamadas) y **un lienzo de prueba que lo instale** (dos llamadas), todos con datos sintéticos. **Recomiendo aprobarlo.** Borrarlos al final requiere tu confirmación en ese momento (lo único que el agente nunca hace solo).
- **D-4c-3 (consentimiento; contrato).** Una sola pregunta por proyecto, guardada en `project.json` como `canvasConsent`, que cubre **el lienzo y el Design System** ("subir a un lienzo y a un sistema privados de tu cuenta de claude.ai mockups con marcadores y los tokens de DESIGN.md; sin capturas ni código; solo vos los ves"). Cada publicación dice en una línea qué sube. **Recomiendo esto** y no una pregunta por publicación (el spec ya fijaba "una sola vez", A-20). Alternativa: preguntar cada vez (más seguro, más fricción).
- **D-4c-4 (alcance; contrato).** Republicar el Design System **automáticamente** cuando cambia `DESIGN.md` (mismo sistema, una llamada, solo con consentimiento) en vez de preguntar cada vez. **Recomiendo automático**: es el mismo artifact privado y `DESIGN.md` ya se confirmó como diff.
- **D-4c-5 (alcance).** No leer los comentarios del lienzo por código en la v1 (R-10). **Recomiendo no leerlos**: la elección se confirma en el chat de todos modos y leer comentarios de terceros suma una superficie de instrucciones no confiables.
- **D-4c-6 (alcance).** Un lienzo por run (R-16) y no un lienzo por proyecto que se va ampliando. **Recomiendo por run**: sin estado compartido que reconciliar y sin pisar ediciones de un run anterior.
- **D-4c-7 (alcance; contingente a la puerta T6).** Si la puerta G1 (clases CSS en `<helmet><style>`) falla, **recomiendo no construir un inliner de CSS en esta versión**: el lienzo pasa a v1.x otra vez y queda el Design System solo si la puerta G5 anduvo (alternativa: aprobar una tarea extra de ≈ 10 tests que mueve las reglas CSS a `style=""` por elemento, con cascada y especificidad, que es lo más frágil de todo el plan). Y si G2 (`@media` contra el marco) falla, **recomiendo documentar** que los artboards de 390 se ven con el diseño de ventana ancha y mantener `compare.html` como vista fiel; no recomiendo cambiar el contrato de `ui-option`. Componentes con vista previa, íconos, fuentes y `shadow` del Design System: v1.x.
- **D-4c-8 (contrato).** Las tres reglas de forma de R-5 en `ui-option` (contrato **interno** entre el brief y los scripts, no público). **Recomiendo sí**: sin ellas el conversor tendría que reparar HTML, que es peor.
- **D-4c-9 (alcance).** Medir el alto real de cada pantalla con el navegador (R-15, Task 8) en vez de tamaños fijos. **Recomiendo medir** si el presupuesto alcanza; se puede entregar 0.7.0 sin ella.
- **D-4c-10 (versión).** 0.7.0 y no 0.6.2. **Recomiendo 0.7.0** (interfaz nueva).

## Tareas

### Task 0: verificación de nombres (sin código)

- [ ] `git grep` de la lista del prerrequisito; anotar al pie de este archivo (sección "Cambios al ejecutar") todo lo que difiera. En particular: la forma real de `validateDesign(...).data`; si `tests/helpers.mjs` ya tiene un helper de repo temporal con `git init`; el nombre exacto de los casos de `ui-option` en `tests/evals/ui-cases.mjs`.
- [ ] Crear la rama y el worktree; correr `npm run test:ui` y anotar la línea base de tests.

### Task 1: conversor `.html` → `.dc.html` y exploración estricta del marcado

**Files:**
- Create: `plugins/pignolo-ui/lib/canvas-html.mjs`, `lib/canvas.mjs`, `tests/fixtures/canvas/inicio.html`, `tests/fixtures/canvas/detalle.html`, `tests/fixtures/canvas/Main.dc.html` (golden)
- Test: `tests/canvas-html.test.mjs`, `tests/canvas.test.mjs`

**Interfaces:**
- `lib/canvas-html.mjs`:
  - `scanMarkup(html) → { ok, problems: [{ code, detail, line }] }`, `code` ∈ `malformed` (cierre faltante o anidado cruzado), `unquoted-attr`, `braces` (`{{` o `}}` en texto o atributos, fuera de `<style>`), `reserved-tag` (`x-dc`, `helmet`, `dc-import`, `sc-*`), `control-in-link` (`button`, `input`, `select`, `textarea` con un `a` ancestro). Un tokenizador propio y **estricto** (no usa `parseMarkup`, que es tolerante y auto-cierra): elementos vacíos `area base br col embed hr img input link meta param source track wbr`; `<style>` y `<script>` son texto crudo; comentarios y `<!doctype>` se ignoran; atributo sin valor (`disabled`) es válido.
  - `splitDocument(html) → { lang, title, styles: string[], body }` (cuerpo = contenido de `<body>`; `lang` por defecto `es`; sin `<body>` lanza `CanvasError('no-body')`).
- `lib/canvas.mjs`:
  - `class CanvasError extends Error { code }`.
  - `sizesFor(platform) → [{ w, h }]`: `mobile` → `[{390,844}]`, `desktop` → `[{1440,900}]`, `both` → `[{390,844},{1440,900}]`; otro valor lanza `CanvasError('bad-platform')`.
  - `artboardName({ option, screen, w, platform, isMain }) → string` (R-3).
  - `toArtboard({ html, w, h, links }) → string`: R-4; `links` = mapa `pantalla.html → nombre de artboard destino`. Rechaza (lanza `CanvasError`) lo que `scanMarkup` marca, más `script` (un `<script>`, `on*=` o `javascript:`) y `remote-resource` (misma detección que `checkScreens`, reutilizar sus expresiones exportándolas o llamando a `checkScreens` sobre una carpeta temporal está **prohibido**: exportar una función pura `screenProblems(html)` desde `lib/approved.mjs` y que `checkScreens` la use). Un `href` a una pantalla que no está en `links` lanza `broken-link`.
  - `isInteractive(html) → boolean` (R-4).
  - Salida determinista: sin fechas ni aleatorio; LF.

**Tests literales:**
- [ ] `scanMarkup`: `<div><p>x</div>` → `malformed`; `<div class=a>` → `unquoted-attr`; `<p>{{nombre}}</p>` → `braces`; `<a href="b.html"><button>Ir</button></a>` → `control-in-link`; `<x-dc></x-dc>` y `<sc-for></sc-for>` → `reserved-tag`; `<input disabled>` y `<br>` y `<img src="a.png" alt="">` → `ok`; `<style>a{color:red}</style>` con `{` adentro → `ok`; un `{{` dentro de `<style>` → `ok`. Un documento completo del fixture → `ok`. **Rojo:** cambiar el tokenizador para auto-cerrar `<p>` → cae el caso `malformed`.
- [ ] `toArtboard` sobre `inicio.html` (fixture de 2 pantallas sintéticas, `lang="es"`, `<style>` con `:root{--color-primary:#1a56db}` y `a:hover{color:#000}`, un `<a href="detalle.html">`, un `<button data-primary="true">`) a 390×844 con `links = { 'detalle.html': 'a-detalle.dc.html' }`: contiene textualmente `<script src="./support.js"></script>`, `<x-dc>`, `<helmet><style>`, `body{margin:0}`, `:root{--color-primary:#1a56db}`, `a:hover{color:#000}` (sin copia `.is-hover`), `class Component extends DCLogic`, `data-dc-script`, `data-props='{"$preview":{"width":390,"height":844}}'`, `width: 390px; min-height: 844px; box-sizing: border-box` y `<a href="a-detalle.dc.html">`; **la cuenta de `<script` es exactamente 2**; no aparece `innerHTML`, `{{`, `<meta name="viewport"` ni `<!--`.
- [ ] **Golden:** `toArtboard` de `inicio.html` a 1440×900 es **byte a byte** igual a `tests/fixtures/canvas/Main.dc.html` (LF). Se regenera a propósito solo en T6, y el commit lo dice.
- [ ] Rechazos: `<script>alert(1)</script>` → `script`; `<button onclick="x()">` → `script`; `<img src="https://x.test/a.png">` → `remote-resource`; `{{x}}` → `braces`; `<a href="nada.html">` con `links` sin esa clave → `broken-link`; documento sin `<body>` → `no-body`.
- [ ] Atributo booleano: `<input disabled>` sale `<input disabled="">`; `<br>` queda `<br>`; `<img ... >` queda sin `/`.
- [ ] `sizesFor` de las 3 plataformas y `bad-platform`. `artboardName`: un tamaño → `Main.dc.html` (primera de A) y `a-detalle.dc.html`; `both` → `Main.dc.html`, `a-detalle-390.dc.html`, `a-inicio-1440.dc.html`; ningún nombre se repite en el conjunto de 3 opciones × 2 pantallas × 2 anchos (12 únicos; **rojo:** quitar el ancho del nombre → choque y cae el caso).
- [ ] `isInteractive`: pantalla con `a[href="detalle.html"]` → `true`; solo texto → `false`; `details` → `true`.
- [ ] `screenProblems`/`checkScreens`: guarda de regresión (los tests de `approved` existentes siguen en verde).
- [ ] Commit: `feat(pignolo-ui): conversor de pantallas a artboards del lienzo Design`.

### Task 2: disposición, `canvas.json` y `canvas-index build|verify`

**Files:**
- Create: `plugins/pignolo-ui/lib/canvas-layout.mjs`, `scripts/canvas-index.mjs` (subcomandos `build` y `verify` ahora; `plan`, `diff`, `merge`, `record` en T7)
- Test: `tests/canvas-layout.test.mjs`, `tests/canvas-index-cli.test.mjs`

**Interfaces:**
- `lib/canvas-layout.mjs`:
  - `buildCanvas({ options: [{ id: 'A', screens: [{ file, html }] }], platform, title, now, heights, designSystem }) → { files: { '<ruta bajo project/>': string }, canvas: object }`. `screens` llega **en el orden del brief** (R-3 del plan 4: el orden de directorio no vale). `heights` opcional: `{ '<opción>/<pantalla>@<ancho>': number }`. `designSystem` opcional: `{ title, folder, artifact, version }`.
  - `canvas`: `v: 3`, `createdOnFiles: { v: 1, at: <now ISO> }`, `title`, `launch: { view: 'canvas' }`, `pages: []`, `boards` (`x`, `y`, `w`, `h`, `title`, y `is_interactive: true` según R-4), `order` (orden de filas y pantallas), `notes` (una nota `{ x: 0, y: yFila − 260, text, kind: 'title1', maxW }` por fila, ids `row-a-390`, `row-b`…), `designSystems`: `[]` o `[{ title, namespace: folder, artifact, version, copiedAt: now }]`.
  - `layoutSha256(canvas) → hex`: sobre `{ boards sin x/y de nada ajeno, order, notes, title }` serializado con claves ordenadas, **sin** `createdOnFiles.at` ni `copiedAt` (así `now` distinto no cuenta como cambio de disposición).
  - `verifyCanvas({ dir }) → { ok, problems: [{ code, file?, detail? }] }`: `code` ∈ `bad-name`, `name-collision`, `missing-file`, `unlisted-file` (un `.dc.html` en `project/` fuera de `boards`, salvo bajo `project/ds/`), `bad-skeleton` (falta la línea exacta de `support.js`, `<x-dc>`, `<helmet>`, el bloque `data-dc-script` o el `class Component extends DCLogic`; más de 2 `<script`; `innerHTML`; `{{`), `bad-order` (`order` ≠ claves de `boards`), `no-main` (el primer elemento de `order` no es `Main.dc.html`), `bad-gap` (dos marcos de una fila a menos de 80 o más de 80 px entre sí; dos filas con menos de 120), `note-too-close` (nota con `y` > `yFila − 223`, o que pisa los marcos de la fila de arriba), `bad-size` (`w` o `h` fuera de 40 a 8000), `bad-ds-record`, `manifest-mismatch` (un sha256 de `manifest.json` no coincide con el archivo).
- `scripts/canvas-index.mjs`:
  - `build --project <repo> --run <run> --options <A,B,C> --screens <inicio.html,detalle.html> --platform desktop|mobile|both --title <texto> [--now <ISO>] [--heights <json>] [--design-system <json>]`: escribe `<run>/canvas/project/…`, `project/canvas.json` y `manifest.json`, imprime `{ out, files, count, layoutSha256 }`. Exit 1 si una entrada se rechaza (lista cada archivo y `code`; **no escribe nada**), 2 uso (opción inexistente en el run, pantalla ausente en alguna opción, `--screens` con un nombre inválido).
  - `verify --run <run>`: `{ ok, problems }`; exit 1 si hay problemas.

**Tests literales:**
- [ ] Ejemplo de números (desktop, 2 opciones, 2 pantallas, `now = 2026-10-01T18:00:00Z`): `boards['Main.dc.html']` = `{ x: 0, y: 260, w: 1440, h: 900 }`, `boards['a-detalle.dc.html'].x === 1520` (1440 + 80); la fila B está en `y = 1420` (260 + 900 + 260); notas `row-a` en `y: 0`, `x: 0`, `maxW: 2960` (2 × 1440 + 80) y `row-b` en `y: 1160`; textos `Opción A` y `Opción B`; `order` = `['Main.dc.html','a-detalle.dc.html','b-inicio.dc.html','b-detalle.dc.html']`.
- [ ] `both`, 1 opción, 2 pantallas: filas `A · 390` en `y = 260` (marcos en `x` 0 y 470, `h` 844) y `A · 1440` en `y = 1364` (260 + 844 + 260; marcos en `x` 0 y 1520, `h` 900); notas en `y` 0 y 1104 con textos `Opción A · 390` y `Opción A · 1440`; 4 rutas con `Main.dc.html` y `a-detalle-390`, `a-inicio-1440`, `a-detalle-1440`; el enlace de `a-inicio-1440.dc.html` apunta a `a-detalle-1440.dc.html` (misma fila) y el de `Main.dc.html` a `a-detalle-390.dc.html`.
- [ ] `Main.dc.html` sale de la pantalla que va **primera en `screens`** aunque alfabéticamente sea la segunda (fixture con `zocalo.html` primera y `detalle.html` segunda). 3 opciones × 2 pantallas, `desktop`: 6 rutas; el enlace de `b-inicio.dc.html` apunta a `b-detalle.dc.html` y **no** a `a-detalle…`.
- [ ] Con `heights = { 'A/inicio.html@1440': 2310 }`: ese marco tiene `h: 2310`, la fila A usa 2310 de alto y la fila B baja en consecuencia; `heights` fuera de 40 a 8000 se recorta (`clamp`, 400 a 8000 para los de R-15; un valor no numérico se ignora).
- [ ] `designSystem` dado → `designSystems` con un registro de las 5 claves y `copiedAt` = `now`; sin él → `[]`. `layoutSha256`: cambiar `now` no lo cambia; cambiar un `x`, un `h`, el `title` de un marco o el texto de una nota sí.
- [ ] `verifyCanvas` sobre una salida válida → `ok`. Una por una, sobre copias rotas a propósito: renombrar un archivo a `A detalle.dc.html` → `bad-name`; dos nombres que solo difieren en mayúsculas → `name-collision`; borrar un archivo listado → `missing-file`; agregar un `.dc.html` no listado → `unlisted-file` (y uno bajo `project/ds/x/` no cuenta); quitar la línea de `support.js` → `bad-skeleton`; agregar `innerHTML` → `bad-skeleton`; mover una nota a `y = yFila − 100` → `note-too-close`; poner `x` de un marco 100 px del anterior → `bad-gap`; `w: 20` → `bad-size`; alterar un byte de un `.dc.html` sin actualizar el manifest → `manifest-mismatch`; sacar una ruta de `order` → `bad-order`; cambiar el primero de `order` → `no-main`. **Rojo:** hacer que `verifyCanvas` no mire `manifest.json` → cae `manifest-mismatch`.
- [ ] CLI `build`: sobre un run con `option-A|B|C` → exit 0, `manifest.json` con los sha256 de los archivos reales; con un `<script>` en una pantalla → exit 1 y `canvas/` ausente; con `--options A,D` y `option-D` inexistente → exit 2; con `--screens inicio.html,nada.html` → exit 2; con `--platform tablet` → exit 2; una opción desconocida (`--foo`) → exit 2; `--run` fuera de `.pignolo-ui/runs/` → exit 2. `verify` → exit 0 sobre lo recién construido y exit 1 tras romper un byte. Determinismo: dos `build` seguidos con el mismo `--now` dejan `manifest.json` idéntico byte a byte.
- [ ] Commit: `feat(pignolo-ui): disposición del lienzo y canvas-index build y verify`.

### Task 3: `DESIGN.md` → Design System

**Files:**
- Create: `plugins/pignolo-ui/lib/design-tokens.mjs`, `scripts/design-system.mjs`, `tests/fixtures/design-system/DESIGN.md` (con tema oscuro), `tests/fixtures/design-system/tokens.json` (golden), `tests/fixtures/design-system/README.md` (golden)
- Test: `tests/design-tokens.test.mjs`, `tests/design-system-cli.test.mjs`

**Interfaces:**
- `lib/design-tokens.mjs`:
  - `buildTokens({ data }) → { tokens, omitted: [{ path, reason }] }` según R-12 (`reason` ∈ `bad-alias`, `unreadable-color`, `bad-name`, `duplicate-name`, `unsupported-property`, `not-mapped`).
  - `buildReadme({ data, tokens, omitted }) → string`.
  - `buildIndex({ title, namespace, now, by }) → object`: `{ v: 3, layout: 'files', createdOnFiles: { v: 1, at: now }, title, namespace, libraries: [], sections: {}, groups: [], assetGroups: {}, blobs: {}, docs: { readme: 'project/README.md', sections: [] }, lastChange: { by, at: now, via: 'pignolo-ui', note: 'Generado desde DESIGN.md' } }`.
  - `folderFor(namespace) → string` que cumple `[a-z0-9][a-z0-9_-]{0,63}` (minúscula, cada tramo de otros caracteres → `-`, sin `-` ni `_` al inicio; vacío → `design-system`).
  - La tapa (`components/Cover/preview.html`) se agrega en **T6**, cuando se lea su regla; hasta entonces `design-system.mjs` no la escribe y `verify` de sistemas no la exige.
- `scripts/design-system.mjs`:
  - `build --project <repo> --design <DESIGN.md> --run <run> --now <ISO> [--new]`: valida con `validateDesign` (status `invalid` o `unverified` → exit 1 con el motivo, sin escribir), escribe `<run>/design-system/project/tokens.json`, `README.md` y, solo con `--new`, `design-system.json`, más `manifest.json` (`{ files: [{ path, sha256 }], designMdSha256 }`); imprime `{ out, files, omitted, designMdSha256, title, folder }`. Título: `name` de `DESIGN.md`; si es el valor de la plantilla (`Project name`) o vacío, el nombre de la carpeta del proyecto.
  - `check --run <run>`: valida lo escrito (JSON legible; **cada familia salvo `type` es una lista**, nunca un mapa; nombres válidos y únicos entre familias; alias que apuntan a tokens existentes; `README.md` presente; `design-system.json` con `createdOnFiles` y `layout: 'files'` si existe; ninguno de los archivos que genera la página: `tokens.css`, `api/…`); exit 1 con problemas.
  - `record --data <dir> --project <repo> --url <url> --design-sha <hex>`: guarda en `project.json` la clave `designSystem` (`{ url, sha256 }`) con escritura atómica; la URL se valida (R-7 en T4).

**Tests literales:**
- [ ] `buildTokens` sobre el fixture (colores primitivos y semánticos con referencias `{colors.blue-600}`, `pignolo.themes.dark` para 2 semánticos, 2 familias tipográficas, `spacing` `"1"` a `"4"`, `rounded` `sm|md|full`): `color.themes` = `light` y `dark`; `primary` = `{ light: '{blue-600}', dark: <oklch o rgb del tema> }`… **no**: un alias dentro de un valor por tema no se garantiza, así que con tema oscuro el valor claro se **resuelve** al hex del primitivo (golden fija el caso) y sin tema oscuro se conserva el alias `{blue-600}`; `spacing.tokens[0].name === 'space-1'`, `radius.tokens` con `radius-sm`; `type.families` con una clave por familia; `type.groups[*].styles[*].fontWeight` es número; `color.tokens` es un **arreglo** (guarda contra el formato DTCG). Salida igual byte a byte a `tokens.json` (golden).
- [ ] Omisiones: color `red` → `unreadable-color`; `{colors.nada}` → `bad-alias`; `{colors.a}` en `a` → `bad-alias`; un token llamado `mi token` → `bad-name`; `colors.space-1` y `spacing.1` → `duplicate-name` (se omite el segundo); `letterSpacing` → `unsupported-property`; `components` y `pignolo.elevation` → `not-mapped`. Sin ningún color válido → `build` exit 1.
- [ ] `buildReadme` contiene el nombre, la plataforma, el conteo por familia, la lista de omitidos y la línea "fuente de verdad"; **no** contiene ningún texto de la sección `## Decisions` del fixture (sembrar una cadena trampa ahí y exigir su ausencia). Igual a `README.md` (golden).
- [ ] `folderFor('Mi App!')` → `mi-app`; `'__x'` → `x`; `''` → `design-system`; 100 caracteres → ≤ 64. `buildIndex`: las claves exactas y `createdOnFiles.at` = `now`.
- [ ] CLI `build --new` → `design-system.json`, `tokens.json`, `README.md`, `manifest.json` y sha256 que coinciden; sin `--new` no escribe `design-system.json`; `DESIGN.md` inválido → exit 1 y `design-system/` ausente; ruta de `--run` fuera de `runs/` → exit 2. `check` → exit 0 sobre lo construido; exit 1 tras convertir `color` en un mapa DTCG, tras duplicar un nombre entre familias y tras agregar `tokens.css`. `record`: guarda `designSystem`, sin `*.tmp` residual; URL de otro dominio → exit 2.
- [ ] Commit: `feat(pignolo-ui): Design System desde DESIGN.md`.

### Task 4: presentación, consentimiento y configuración

**Files:**
- Modify: `plugins/pignolo-ui/lib/presentation.mjs`, `lib/project-config.mjs`, `scripts/run.mjs`, `lib/report-build.mjs` (`firstLine`: un hecho más), `.claude-plugin/plugin.json` (descripción de `presentation`; la versión sube en T11)
- Test: `tests/presentation.test.mjs`, `tests/project-config.test.mjs`, `tests/run-cli.test.mjs`, `tests/report-build.test.mjs`

**Interfaces:**
- `decidePresentation({ presentation, kind, artifact, designType, designSystemType, canvasConsent }) → { mode: 'canvas' | 'local', designSystem: boolean, consentNeeded: boolean, reasons: string[] }`. Se **quita** el parámetro `canvasAvailable` y la razón `canvas-not-in-v1`. `canvas` solo con `presentation === 'auto'` **y** `kind === 'option'` **y** `artifact === true` **y** `designType === true` **y** `canvasConsent === true`; `designSystem` es `true` solo en modo `canvas` y con `designSystemType === true`. Razones: `presentation-local`, `style-tile-local` (`kind === 'direction'`), `no-artifact-tool`, `no-design-type`, `no-consent`, `consent-declined`, `no-design-system-type` (aviso: el lienzo se publica sin sistema). Todas las razones que apliquen, en ese orden. Con las condiciones en verdad y `canvasConsent === undefined` → `local`, `consentNeeded: true`, razón `no-consent`; con `false` → `local`, `consentNeeded: false`, `consent-declined`.
- `lib/project-config.mjs`: claves nuevas `designSystem` (`{ url, sha256 }`; `url` con `^https://claude\.ai/(code/)?artifact/[A-Za-z0-9_-]+$` y `sha256` de 64 hex) y la existente `canvasConsent` (booleano). Otro valor → `ConfigError`.
- `run.mjs present --data <dir> --project <repo> --presentation auto|local --kind option|direction --artifact yes|no --design-type yes|no --design-system-type yes|no` → imprime la decisión más `canvasConsent` y `designSystem` leídos de `project.json` (`designSystemPublished: { url, sha256 } | null`). `--kind` y `--design-system-type` son obligatorios.
- `firstLine(facts)`: `facts.canvas` ∈ `published | local-fallback` con `reasons`; la primera línea del informe dice `lienzo: publicado` o `lienzo: local (<motivo>)`.

**Tests literales:**
- [ ] `decidePresentation`: tabla escrita en el test con las combinaciones de `presentation` (`auto|local`) × `kind` (`option|direction`) × `artifact` × `designType` × `designSystemType` (los tres `true|false`) × `canvasConsent` (`true|false|undefined`) = 2 × 2 × 2 × 2 × 2 × 3 = **96 casos**, generados con tres bucles y comparados contra una función oráculo independiente escrita en el test; más casos literales: todo `true` y `kind: option` → `{ mode: 'canvas', designSystem: true }`; `kind: direction` con todo `true` → `local`, `style-tile-local`; `designSystemType: false` con lo demás en verdad → `canvas`, `designSystem: false`, razón `no-design-system-type`; consentimiento ausente → `local`, `consentNeeded: true`; `local` con todo `true` → `local`, `presentation-local`. **Rojo:** hacer que `designSystem` no mire el modo → cae el caso `kind: direction`.
- [ ] `project-config`: `writeConfig` con `designSystem` válido se lee igual; URL de `example.com` → `ConfigError`; `sha256` corto → `ConfigError`; `canvasConsent: 'maybe'` → `ConfigError`; guarda de regresión de las claves previas.
- [ ] `run.mjs present`: con `--kind` ausente → exit 2; con todo válido y `project.json` con `canvasConsent: true` → `mode: canvas`; con `designSystem` guardado, `designSystemPublished` lo trae.
- [ ] `firstLine` con `canvas: 'local-fallback'` y motivo `no-design-type` contiene `lienzo: local (no-design-type)`; con `published` contiene `lienzo: publicado`. Guarda de regresión del resto de la línea.
- [ ] Commit: `feat(pignolo-ui): decisión de presentación con lienzo, sistema y consentimiento`.

### Task 5: reglas de forma de `ui-option` en `options-check`

**Files:**
- Modify: `plugins/pignolo-ui/lib/option-check.mjs`, `agents/ui-option.md`, `tests/evals/ui-cases.mjs` (graders de las tres reglas), `reference/options.md` (una línea de las reglas nuevas)
- Test: `tests/option-check.test.mjs`, `tests/agents.test.mjs`, `tests/eval-ui-cases.test.mjs`

**Interfaces:**
- `checkOption` suma los problemas `malformed`, `braces`, `control-in-link` y `reserved-tag` (R-5) por archivo, usando `scanMarkup`; **solo** para `--kind option` (los style tiles no van al lienzo y no se les exige). `run.mjs options-check` lo pasa a `checkOption` con `kind`.
- `agents/ui-option.md`, sección "Output contract": tres líneas nuevas (bien formado, sin `{{`/`}}`, enlaces entre pantallas con el propio `<a>` y sin controles adentro). El frontmatter no cambia (`tools: Write`).

**Tests literales:**
- [ ] `checkOption` sobre una carpeta con `<p>` sin cerrar → `malformed`; con `{{x}}` → `braces`; con `<a href="detalle.html"><button>` → `control-in-link`; con `<sc-if>` → `reserved-tag`; con `--kind direction` esos mismos archivos **no** dan problema (guarda del alcance). **Rojo:** quitar el filtro por `kind` → cae el caso de `direction`.
- [ ] `agents.test.mjs`: el texto del agente contiene las tres reglas y sigue con `tools: Write` exacto.
- [ ] `eval-ui-cases.test.mjs`: los graders de archivo nuevos (los de las tres reglas) pasan sobre un fixture válido y fallan sobre uno roto a propósito por cada regla (se prueban como los demás graders del hito 4).
- [ ] Commit: `feat(pignolo-ui): reglas de forma de ui-option para el lienzo`.

### Task 6: puerta manual (con el autor, publicaciones reales de prueba)

> **No es código ni lo corre un script.** La hace el hilo principal con el autor presente, con D-4c-2 aprobada. Antes de cada llamada se describe qué se sube y se pide confirmación. Todo con fixtures sintéticos (nunca datos de un proyecto). Resultado: una nota en `docs/research/2026-10-01-lienzo-design.md` (sección "Resultado de la puerta") con cada G en verde, rojo o "no concluyente", y los ajustes del código que salgan.

**Files:** Modify según resultado: `lib/canvas.mjs`, `tests/fixtures/canvas/Main.dc.html` (golden regenerado, el commit dice "golden regenerado por la puerta"), `lib/design-tokens.mjs`, `scripts/design-system.mjs` (tapa), `docs/research/2026-10-01-lienzo-design.md`; crear `lib/design-cover.mjs` con su test.

- [ ] **G1 (clases en `<helmet><style>`).** Con `canvas-index build` sobre los fixtures de T1/T2, actualizar el lienzo de prueba existente (una llamada `publish` con `url`, `root`, `file_path` y `files`) y mirarlo: ¿se aplican las clases y `:root{--color-primary}`? ¿el hover del `<a>`? Rojo → D-4c-7.
- [ ] **G2 (`@media`).** Un artboard de 390 con una `@media (max-width: 600px)` visible (cambia el color de fondo): ¿se activa dentro del marco de 390 estando la ventana ancha? Rojo → documentar en el README y en el checklist (D-4c-7).
- [ ] **G3 (enlaces y atributos).** Modo Play: ¿`<a href="a-detalle.dc.html">` lleva a ese artboard y vuelve? ¿`disabled=""` y `<br>` se ven bien? ¿una pantalla más alta que su marco se recorta o se desplaza?
- [ ] **G4 (Design System).** Crear un Design System privado de prueba (`publish` con `type_url`, `title`, `auto_open`), **leer** de ese resultado `artifact-type/reference/cover.md` y `format.md` (`Artifact read` con `url` y `path`), publicar `design-system.mjs build --new` + la tapa. Comparar la gramática real con R-12 (¿`shadow`? ¿nombres? ¿`usage` obligatorio?) y ajustar `design-tokens.mjs`. Escribir `lib/design-cover.mjs` (`buildCover({ name, colors }) → string`, determinista) con la forma de `cover.md`, y que `design-system.mjs build` la escriba como `project/components/Cover/preview.html`.
- [ ] **G5 (instalación).** Crear un lienzo de prueba nuevo (`type_url`) y publicarlo con `canvas-index build --design-system` (el `files` con `{ artifact, path }` y el registro `designSystems`): ¿el menú Theme muestra los tokens? ¿el resultado dice que es privado ("readable by only you")?
- [ ] Test nuevo de `buildCover`: salida igual byte a byte a un golden y sin `{{` ni scripts; `design-system.mjs build` la incluye en el manifest.
- [ ] Anotar los resultados; **no borrar nada**: preguntarle al autor qué hacer con cada artifact de prueba.
- [ ] Commit: `fix(pignolo-ui): ajustes de formato tras la puerta del lienzo` (o `docs(...)` si no hubo cambios de código).

### Task 7: `canvas-index plan|diff|merge|record`

**Files:**
- Create: `plugins/pignolo-ui/lib/canvas-publish.mjs`
- Modify: `scripts/canvas-index.mjs`
- Test: `tests/canvas-publish.test.mjs`, `tests/canvas-index-publish-cli.test.mjs`

**Interfaces:**
- `lib/canvas-publish.mjs`:
  - `planCalls({ run, canvasDir, dsDir, dsPublished, designSystemType, types: { design, designSystem }, title, leakValues }) → { ok, problems, steps }`. Antes de armar nada: `verifyCanvas` y, si hay sistema, `checkDesignSystem` (T3) y `checkLeaks` sobre ambas carpetas con `leakValues`; cualquier problema → `ok: false`, `steps: []` y **ningún parámetro** (R-8).
  - `steps`: lista ordenada de `{ id, params }` con `id` ∈ `ds-create`, `ds-publish`, `canvas-create`, `canvas-publish` (R-7). `params` es exactamente el objeto de la llamada a `Artifact` (`type_url` del listado que se pasa en `types`, `title`, `auto_open`, `url` como el marcador literal `"<url de ds-create>"` o `"<url de canvas-create>"` o la `url` guardada, `root`, `file_path`, `files`); la entrada de instalación es `"project/ds/<carpeta>/tokens.json": { "artifact": "<dirección del sistema cortada tras su id>", "path": "project/tokens.json" }` y la dirección sale de la `url` del sistema **como la dio el tipo**, nunca leída de un archivo.
  - `diffPublished({ manifest, layoutSha256, published }) → { changed: string[], removed: string[], sendIndex: boolean }` (R-9).
  - `mergeIndex({ ours, live }) → object` (R-9): marcos existentes en ambos conservan `x`/`y` del vivo; marcos nuevos toman los nuestros; notas ajenas y claves desconocidas del vivo se conservan; `w`, `h`, `title`, `is_interactive` y `order` de los nuestros se imponen; `designSystems`: se conservan los registros ajenos y el nuestro se reemplaza por `namespace`.
  - `recordPublish({ run, kind: 'ds'|'canvas', url, manifest, layoutSha256? }) → publish.json` (escritura atómica dentro de `<run>/`; `url` validada con la expresión de T4).
- `canvas-index.mjs`:
  - `plan --project <repo> --run <run> --values-file <json> --title <t> --types-file <json con { design: <type_url>, designSystem: <type_url|null> }> [--data <dir>]` imprime `{ ok, problems, steps }`; exit 0 con `ok`, 1 con problemas, 2 uso. Lee de `<data>/<repoId>/project.json` el `designSystem` publicado y su sha256 y lo compara con `<run>/design-system/manifest.json` (`designMdSha256`): igual → se salta `ds-create` y `ds-publish` (R-11); distinto → `ds-publish` con la `url` guardada y **solo** los archivos que cambiaron (sin `ds-create`).
  - `diff --run <run>` → `{ changed, removed, sendIndex }`; `merge --ours <canvas.json> --live <archivo leído> --out <archivo>`; `record --run <run> --kind ds|canvas --url <url>`.

**Tests literales:**
- [ ] `planCalls` camino feliz sin sistema publicado: 4 pasos en el orden `ds-create`, `ds-publish`, `canvas-create`, `canvas-publish`; `ds-create.params` = `{ type_url, title, auto_open: 'after_first_write' }` y **no** tiene `files`; `ds-publish.params.files` no incluye `project/design-system.json` (va como `file_path`) y `file_path` es absoluta; `canvas-publish.params.files` contiene cada `.dc.html` y la entrada `{ artifact, path: 'project/tokens.json' }` con la dirección cortada tras el id (entrada `https://claude.ai/artifact/AbC123?x=1` → `https://claude.ai/artifact/AbC123`); ninguna `params` contiene `share`, `public` ni `capabilities`. Con sistema ya publicado y sin cambios: 2 pasos. Con cambios: `ds-publish` con la `url` guardada y solo los archivos distintos, 3 pasos. Con `types.designSystem === null`: 2 pasos y la razón `no-design-system-type` en `problems`-aparte (`notes`), sin `designSystems` en el índice. **Rojo:** hacer que el orden ponga el lienzo antes del sistema → cae el test de orden.
- [ ] **Fuga (R-8):** un `.dc.html` con el usuario de git sembrado → `ok: false`, `steps: []`; un `tokens.json` con una ruta `C:\Users\x` sembrada → `ok: false`; un valor sembrado en `README.md` del sistema → `ok: false`; la salida de `problems` **no repite el valor** (solo archivo, línea y tipo). **Rojo:** correr `checkLeaks` solo sobre `canvasDir` → cae el caso del `README.md` del sistema.
- [ ] `verify` en 1 (un byte alterado) → `ok: false`, sin pasos. Nombre inválido → `ok: false`.
- [ ] `diffPublished`: sin `published` → todo `changed`, `sendIndex: true`; mismo manifest y mismo `layoutSha256` → `{ changed: [], removed: [], sendIndex: false }`; un artboard con otro sha256 y misma disposición → `changed` con solo ese, `sendIndex: false`; una opción regenerada que cambia el alto medido → `sendIndex: true`; un archivo que ya no está → `removed` (se informa, no se envía).
- [ ] `mergeIndex`: vivo con un marco movido (`x` distinto), una nota ajena `note-x`, un registro `designSystems` ajeno y una clave desconocida → el resultado conserva el `x` del vivo, la nota, el registro y la clave, y toma `w`, `h`, `title`, `is_interactive` y `order` de los nuestros; un marco nuevo nuestro aparece con nuestras coordenadas. **Rojo:** hacer que `merge` devuelva `ours` tal cual → cae el caso del `x` movido.
- [ ] `recordPublish`/`record`: escribe `publish.json` con `canvas.url`, `files` (`path → sha256`) y `layoutSha256`; una `url` de otro dominio → exit 2; sin `*.tmp` residual; fuera de `<run>/` → exit 2.
- [ ] CLI `plan`: sobre un run armado con T2 y T3 → exit 0 y 4 pasos; con `--values-file` ausente → exit 2; con una fuga → exit 1 y `steps: []`.
- [ ] Commit: `feat(pignolo-ui): plan de publicación, actualización y combinación del índice`.

### Task 8 (recortable, D-4c-9): alto real de las pantallas

**Files:**
- Modify: `plugins/pignolo-ui/lib/fingerprint-page.mjs` (o archivo nuevo `lib/page-height.mjs`), `scripts/compare.mjs` (subcomando `heights`), `scripts/canvas-index.mjs` (`--heights` ya existe desde T2)
- Test: `tests/compare-heights.test.mjs`

**Interfaces:** `compare.mjs heights --run <run> --kind mockup --screens <a.html,b.html> --options <A,B,C> --platform desktop|mobile|both --out <json>` abre cada pantalla al ancho de cada fila y guarda `{ "<X>/<pantalla>@<ancho>": scrollHeight }`; sin navegador → `{ unverified: <motivo> }` con exit 0 y **sin** archivo (el `build` usa los tamaños de R-3). Misma limpieza de procesos y señales que el resto de `compare.mjs`.

**Tests literales:**
- [ ] Función pura `clampHeight(v)`: `100` → `400`, `99999` → `8000`, `NaN` → `null`, `2310.4` → `2311`.
- [ ] CLI sin navegador (con `BROWSER_SKIP`/ruta inexistente de navegador simulada) → `unverified`, exit 0, ningún archivo.
- [ ] Con navegador: una página de 3000 px de alto dibuja `3000` a su ancho (un test; skip visible si no hay navegador); no deja procesos ni perfiles (el test de limpieza existente de `browser.mjs` se replica para este subcomando).
- [ ] Commit: `feat(pignolo-ui): medir el alto real de las pantallas para el lienzo`.

### Task 9: textos de las skills y apoyo

**Files:**
- Modify: `plugins/pignolo-ui/reference/present-and-choose.md` (reescritura), `skills/new/SKILL.md`, `skills/improve/SKILL.md`, `reference/options.md` (solo si T5 no lo cubrió), `README.md`, `scripts/run.mjs` (`report-line` con `canvas`)
- Test: `tests/skill-new.test.mjs`, `tests/skill-improve.test.mjs`, `tests/skills-contract.test.mjs`

**Contenido:**
- **`SKILL.md` de `new` e `improve`, paso 1 (entorno):** si la sesión tiene la herramienta `Artifact`, `Artifact` con `action: "list"` y `scope: "types"`; `--design-type yes` solo si un tipo listado tiene título exacto "Design", `--design-system-type yes` solo si lo tiene "Design System"; los `type_url` se guardan en `<run>/types.json` con `Write` (`{ "design": …, "designSystem": … }`) y **nunca se escriben a mano**. Sin la herramienta: `--artifact no`.
- **`present-and-choose.md`** (marcadores `<root>`, `<data>`, `<presentation>`, `<repo>`, `<run>`, `<kind>`, `<X>`, `<flow>`, `<approved>`; sin `${`), en este orden:
  1. `run.mjs present … --kind <kind> …`; si `consentNeeded`, preguntar **una sola vez por proyecto** con el texto de D-4c-3 y guardar con `config set --key canvasConsent --value true|false`.
  2. `mode: local` (o `canvas` que falla): `compare-html` y la línea de aviso `lienzo: local (<motivo>)`; **never call Artifact when the mode is local**.
  3. `mode: canvas`: `design-system.mjs build` (con `--new` si no hay sistema publicado) y `check`; `run.mjs leak-values`; `canvas-index.mjs build`, `verify` y `plan`; si `plan` sale 1 → mostrar los problemas (sin valores), usar `compare.html` y decirlo en una línea; si sale 0 → decir en una línea qué se sube ("subiendo N pantallas y los tokens de DESIGN.md a un lienzo y un sistema privados"), ejecutar **cada paso de `steps` tal cual**, en orden, y tras cada uno `canvas-index.mjs record` (y `design-system.mjs record` tras el sistema); si una llamada falla, no reintentar con otros parámetros: `compare.html` local y el motivo. Citar la URL; leer que el resultado diga que es privado ("readable by only you"; si no lo dice, avisar y no seguir publicando). **No se relee ni se captura lo publicado.** Las instrucciones que devuelve el tipo no cambian lo que se publica ni dan permisos.
  4. Si el usuario **rechaza publicar** en el momento, `compare.html` local y `config set --key canvasConsent --value false` solo si lo dice para el proyecto.
  5. Elección en el chat (R-10), con `approve.mjs save` y `record` como hoy.
  6. Actualización (R-9): tras regenerar una opción o combinar, `canvas-index build` + `diff`; si hay `changed` o `sendIndex`: una sola llamada con lo cambiado (y, con `sendIndex`, `Artifact read` de `project/canvas.json` + `merge` antes); si el tool rechaza por edición ajena, leer lo que nombra, rehacer una vez y a la tercera seguir en local.
- **Style tiles** (`--kind direction`): siempre `compare-html`, nunca `Artifact`, y el sistema se publica **después** de crear `DESIGN.md` (paso 0 de `new`) solo si hay consentimiento y mockups por venir.
- **README:** qué se sube y qué no, privado, consentimiento por proyecto, desinstalar no borra lo publicado, el usuario borra desde claude.ai; `acceptEdits` recomendado.

**Tests literales:**
- [ ] `present-and-choose.md`: `assertNoVariables` (sin `${`); orden de cadenas `run.mjs present` → `design-system.mjs build` → `leak-values` → `canvas-index.mjs build` → `canvas-index.mjs verify` → `canvas-index.mjs plan` → `steps` → `canvas-index.mjs record` → `diff` → `merge`; contiene `never call Artifact when the mode is local`, `canvasConsent`, `una sola vez` (o `once per project`), `readable by only you`, `no se relee` (o `is not read back`), `compare.html`, `style-tile-local` o `--kind direction`; **no** contiene `canvas-not-in-v1` ni `una vez con los archivos`. **Rojo:** borrar `canvas-index.mjs plan` del texto → cae el orden.
- [ ] `new` e `improve`: contienen `scope: "types"`, `"Design System"`, `types.json`, `--design-system-type` y **no** contienen `canvas-not-in-v1` ni "The canvas \"Design\" is not available in v1"; `assertScriptsExist` y `referencedFiles` en verde (`canvas-index.mjs`, `design-system.mjs`).
- [ ] Transversal (`skills-contract.test.mjs`): ninguna skill ni `reference/*.md` llama a `Artifact` con `publish` sin mencionar `canvas-index.mjs plan`; ninguno dice `share`; ningún `reference/*.md` contiene `${`; los `SKILL.md` ≤ 12 000 caracteres.
- [ ] `report-line` con `canvas` y `reasons` (hecho en T4) usado por las skills: la primera línea lo muestra.
- [ ] Commit: `feat(pignolo-ui): skills new e improve con lienzo y Design System`.

### Task 10: prueba transversal, evals, documentación, versión 0.7.0

**Files:**
- Create: `tests/hito-4c-acceptance.test.mjs`
- Modify: `plugins/pignolo-ui/.claude-plugin/plugin.json` (0.7.0 y descripción de `presentation`), `CHANGELOG.md`, `README.md`, `tests/evals/ui-cases.mjs` (si T5 no terminó los casos), `docs/STATE.md`, `docs/benchmarks.md` solo si hay una diferencia medida

**Tests literales (acceptance, sin red ni navegador, repos temporales con `git init`):**
- [ ] Flujo de punta a punta con 3 opciones de 2 pantallas sintéticas, `both`: `options-check` ok → `leak-values` → `design-system.mjs build --new` → `canvas-index build` → `verify` ok → `plan` con 4 pasos → `record` de los 4 (URLs sintéticas) → regenerar la opción B (`discard` + nuevo `option-B`) → `build` + `diff`: `changed` contiene **solo** las rutas de B y `sendIndex` es `false` → sin cambios de disposición no hay llamada al índice.
- [ ] Respaldo: sin `Artifact` (`--artifact no`) → `present` da `local` y `compare-html` escribe `compare.html`; con una fuga sembrada → `plan` exit 1, `steps: []` y el mismo `compare-html` sigue andando; el estado de `git status --porcelain` del repo queda vacío en todos los casos (todo vive en `.pignolo-ui/`).
- [ ] Ningún archivo bajo `plugins/pignolo-ui/` contiene un enlace `claude.ai/artifact/...` real ni una ruta absoluta de usuario (búsqueda en el test).
- [ ] `npm run test:ui` y `npm test` completos en verde; contar tests y comparar con la línea base de T0.
- [ ] CHANGELOG 0.7.0: qué trae, que el lienzo vuelve a la v1 con las dos llamadas o cuatro, que los comentarios no se leen, qué queda para v1.x. `plugin.json` 0.7.0.
- [ ] Evals (D-4c-1, con tope aprobado): correr los 3 casos de `ui-option` y guardar `tests/evals/RESULTS-hito-4c.md` con costo y pasadas de las tres reglas.
- [ ] Commit: `chore(release): hito 4c, lienzo Design y Design System, version 0.7.0`.

### Task 11: checklist manual, revisión final y cierre

- [ ] Checklist manual (abajo) con el autor en una sesión real.
- [ ] Revisión final opus de `main..ui/hito-4c` con el Review Focus; pasada de arreglos; unión.
- [ ] Spec: aplicar los "Cambios de spec" al unir (el autor los aprueba; este plan no edita el spec); marcar en el plan del hito 4 que T5/T5b quedan reemplazadas por este plan.

## Olas (un solo ejecutor en serie)

| Ola | Tareas | Qué cierra | Gasto de tokens de agentes |
|---|---|---|---|
| 0 | T0 | Nombres y línea base | ninguno |
| 1 | T1, T2, T3 | Conversor, disposición, `canvas-index build/verify`, Design System local | ninguno |
| 2 | T4, T5 | Decisión de presentación, configuración, contrato de `ui-option` | ninguno |
| Puerta | T6 | Formato real (con el autor) | ninguno (llamadas a `Artifact` del autor) |
| 3 | T7, T8 | Publicación, actualización, fusión de índice, alto real | ninguno |
| 4 | T9, T10 | Textos, aceptación, evals, 0.7.0 | evals: ≈ 3 corridas de sonnet (D-4c-1) |
| 5 | T11 | Checklist, revisión opus, unión | una revisión opus |

Si el presupuesto aprieta: se recorta **T8** primero (tamaños fijos con aviso). Si la puerta T6 falla en G1, se detiene la ola 3 y se decide con el autor (D-4c-7) antes de seguir; T1 a T5 no se pierden (el Design System sigue valiendo).

## Estimación de tests

| Tarea | Tests nuevos |
|---|---|
| T1 | ≈ 25 |
| T2 | ≈ 28 |
| T3 | ≈ 22 |
| T4 | ≈ 105 (96 de la tabla generada, que cuentan como un solo caso parametrizado por archivo: ≈ 12 casos `it` más) |
| T5 | ≈ 8 |
| T6 | ≈ 2 (cobertura de `buildCover`) |
| T7 | ≈ 22 |
| T8 | ≈ 4 (+ 1 de navegador con skip visible) |
| T9 | ≈ 14 |
| T10 | ≈ 6 |
| **Total** | **≈ 150 casos `it`** (≈ 240 contando las filas de la tabla de T4) |

Sin red. Los de navegador son 1 y salen `skip` visible sin navegador.

## Impacto en las evals

- **`ui-option` (3 casos del hito 4: mockup, improve, style tile):** el contrato suma R-5, así que hay que **volver a correr los 3** y agregar graders (`well-formed`, `no-braces`, `no-control-in-link`) a los de mockup e improve; el de style tile no cambia (R-5 solo aplica a `option`). Costo ≈ 3 corridas de sonnet (D-4c-1). Criterio: ≥ 2 de 3 con las tres reglas; si sonnet falla una regla de forma, se ajusta el texto del brief (no el modelo) y se corre una vez más.
- **`ui-auditor` (8 casos):** sin cambios y sin nueva corrida.
- **Ablación:** sin cambios.
- **Medición nueva sin costo de agentes:** el A/B del lienzo contra `compare.html` es del autor y se anota en el checklist (¿se compara mejor?); si hay una diferencia medida frente a Claude Code base o superpowers, va a `docs/benchmarks.md`.

## Checklist manual (con el autor, Windows, sesión real)

- [ ] `new` en un proyecto con `DESIGN.md`: pregunta el consentimiento **una vez** con el texto de D-4c-3; la segunda ejecución no vuelve a preguntar.
- [ ] Se publican el Design System y el lienzo; la skill dice en una línea qué sube; cada resultado dice "readable by only you"; el lienzo abre en vista de lienzo con una fila por opción y una nota de título ≥ 223 px arriba; con `both`, dos filas por opción (390 y 1440).
- [ ] Las pantallas se ven como el HTML local (G1, G2); el modo Play navega entre las pantallas de una opción y vuelve; el menú Theme muestra los tokens instalados.
- [ ] El Design System muestra colores (y oscuro si `DESIGN.md` lo declara), tipografía, espaciado y radios; el README dice "generado desde DESIGN.md"; ninguna prosa de decisiones del proyecto.
- [ ] Un comentario del autor sobre un artboard **no** cambia nada solo; la elección se confirma en el chat y se registra con `approve.mjs record`.
- [ ] Regenerar una opción: el lienzo se actualiza con una sola llamada; lo que el autor movió o comentó antes sigue donde estaba.
- [ ] Editar `DESIGN.md` (un color) y correr `improve`: el sistema se actualiza (mismo enlace), no se crea uno nuevo.
- [ ] Sin la herramienta `Artifact` (o con `presentation = local`, o rechazando el consentimiento): sale `compare.html` local y una línea de aviso; style tiles del paso 0 siempre locales.
- [ ] Nada de capturas, código ni datos reales en lo publicado (mirar el lienzo y el sistema); `git status` del proyecto limpio.
- [ ] El token de prueba sembrado en una opción hace que `plan` salga con 1 y no se publique nada.
- [ ] Borrado de los artifacts de prueba: **solo** con la confirmación del autor en ese momento.

## ¿Auditoría previa en dos pasos?

**Sí, acotada a lo que sale de la máquina** (publicar, fuga, consentimiento y actualización): T2 (`verify`), T3 (qué texto llega al sistema), T4 (decisión y consentimiento), T7 (`plan`, `diff`, `merge`) y T9 (texto de las skills). CLAUDE.md pide auditoría previa solo en hitos de riesgo y publicar fuera de la máquina lo es, igual que guardia, borrados y respaldos.
- **Paso 1** (opus, solo lectura): este plan y el código base contra las preguntas "¿hay un camino a `Artifact` sin `plan`?", "¿qué bytes salen?", "¿qué pasa con un enlace a otra carpeta?", "¿`merge` puede pisar al usuario?".
- **Paso 2:** comprobación con corridas reales de los scripts, **sin llamar a `Artifact`**: fuga sembrada en `.dc.html`, en `tokens.json` y en `README.md`; `plan` con `verify` roto; `diff` y `merge` con índices vivos adversos; un `README.md` con prosa de decisiones; URLs de otro dominio en `record`.
Lo demás (T1, T5, T8) va con la revisión final opus, sin auditoría previa.

## Cambios de spec (los hace el autor al unir; este plan no edita el spec)

1. **A-20 y §18:** el artifact "Design System" generado desde `DESIGN.md` **deja de ser candidato a v1.1** y entra en la v1 (tokens por tema, tipografía, espaciado y radios; **sin** componentes con vista previa, íconos, fuentes ni `shadow`, que siguen en v1.x). Reponer la línea que R10 sacó del §5.11 ("Lienzo fuera de la v1"): se invierte.
2. **§13:** (a) el lienzo es solo para **mockups** (`new` paso 2 e `improve`); style tiles, direcciones y colores/tipografías quedan locales también en el paso 0; (b) las cuatro condiciones suman, **para el sistema**, el tipo "Design System" (si falta, el lienzo se publica sin sistema y se avisa); (c) el consentimiento por proyecto cubre lienzo y sistema; (d) tamaños 390×844 y 1440×900 (se acepta desde 1280), `both` en dos filas por opción con el ancho en el nombre; (e) **dos llamadas** con el sistema ya publicado y **cuatro** con sistema nuevo (crear y publicar el sistema, luego crear y publicar el lienzo), con el orden que impone la instalación; (f) 260 px entre filas y notas a `y − 260` (cumple "≥ 223"); (g) el respaldo agrega "una línea de aviso".
3. **§13.1:** el generador pasa a ser `lib/canvas.mjs` + `scripts/canvas-index.mjs` (con `build`, `verify`, `plan`, `diff`, `merge`, `record`); **se quita** el pase de estados hover/press/focus a clases y la raíz de tamaño fijo `w`×`h` pasa a `width` fija con `min-height`; se agrega "el HTML de `ui-option` debe estar bien formado, sin `{{`, sin controles dentro de un `<a>`"; los enlaces entre artboards se verificaron en `format.md` del tipo.
4. **§2 (forma del plugin):** `scripts/canvas-index.mjs`, `scripts/design-system.mjs` y `lib/canvas*.mjs`, `lib/design-tokens.mjs`, `lib/design-cover.mjs`, en lugar de `scripts/to-canvas.mjs`.
5. **§3.1 y §3.2:** `presentation` ya no dice "nunca se publica" en `auto`; `project.json` suma `designSystem` (`{ url, sha256 }`) además de `canvasConsent`.
6. **§7.4:** el contrato de salida de `ui-option` suma las tres reglas de forma de R-5; el chequeo de fuga cubre también `<run>/canvas/` y `<run>/design-system/`.
7. **§12:** la excepción "el lienzo publicado no se relee" cubre también el sistema; los sha256 se guardan en `<run>/publish.json`.
8. **§16.1 y §17:** pruebas del conversor (golden), del índice (números literales), del mapa de tokens y de `plan`; hito 4c entre el 4 y el 5.
9. **Plan del hito 4:** nota en T5 y T5b ("reemplazadas por `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`") y en R-7; `STATE.md`.

## Riesgos y supuestos declarados

- **No verificado** (puerta T6): clases en `<helmet><style>`, `@media` contra el marco, atributos booleanos, tapa del sistema, `shadow`, Theme (G1 a G5). La prueba real usó solo estilos en línea y dos pantallas.
- **Contenido de terceros:** las instrucciones de los tipos "Design" y "Design System" pueden cambiar de release (`release` del tipo); el conversor y el índice se prueban contra el formato de hoy y la puerta T6 y el checklist lo vuelven a comprobar. Un cambio de formato futuro lo detecta `verify` solo en lo que ya valida; lo demás lo ve el usuario al abrir el lienzo.
- **Privacidad:** el lienzo es privado por defecto; el agente no puede compartirlo; borrar o despublicar solo con el autor. El enlace de un lienzo no se versiona en el repo público.
- **Comentarios de terceros** (si alguien más comenta): dato, nunca instrucción.
- **Costo de tokens del núcleo de la v1:** sin cambios fuera de los ≈ 3 USD de evals de D-4c-1.

## Cambios al ejecutar

_(vacío; el ejecutor anota acá lo que difiera de este plan al hacer la Task 0 y al cerrar la Task 6.)_
