# Changelog

## 0.6.0 — sin publicar

Parte 4b del hito 4: agentes, skills y evals. Sube de 0.5.0 a 0.6.0 porque trae interfaz nueva para el usuario (los tres comandos y los dos agentes).

- **Tres comandos:** `/pignolo-ui:new`, `/pignolo-ui:improve` y `/pignolo-ui:audit`. Cada uno imprime primero `pignolo-ui <versión>` y su informe empieza con la primera línea de `run.mjs report-line` (degradaciones, subagentes lanzados de pedidos, modelo pedido). "Terminado" lo dice solo `run.mjs verdict`.
- **Dos agentes:** `ui-option` (sonnet, solo `Write`, sin CLAUDE.md, escribe una opción en una carpeta vacía) y `ui-auditor` (opus, solo lectura, cada hallazgo con evidencia, nunca `bloquea` sin evidencia de script o navegador).
- **Textos de apoyo en `reference/`** (`prepare-run`, `options`, `apply`, `present-and-choose`): usan los marcadores `<root>`, `<data>`, `<N>` y `<presentation>` porque las variables `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` y `${user_config.*}` solo se sustituyen en `SKILL.md`; un ajuste sin valor guardado llega literal y la skill usa el valor por defecto.
- **Lienzo "Design": fuera de la v1** (decisión del autor R10, 2026-10-01). Las opciones se comparan en `compare.html`, una página local; no se publica nada y no se invoca `Artifact`.
- **Costo por flujo** (tabla de la sección 15 del spec, con 3 opciones): `new` en proyecto vacío 7 corridas de agente (más hasta 2 de regeneración), con `DESIGN.md` 4, `improve` 4, `audit` 1.
- **Evals de agentes** (`tests/evals/ui-cases.mjs`): 8 casos del auditor (5 defectos sembrados y 3 páginas limpias), 3 de `ui-option` y 3 briefs de ablación, con fixtures armados por los scripts reales. Resultados de la corrida paga: pendientes (tope 22 USD aprobado, D-4-1).
- Permisos: se recomienda el modo `acceptEdits`; en `default` las escrituras de los subagentes piden permiso.

## 0.5.0 — sin publicar

Parte 4a del hito 4: todo lo determinista de los flujos. No gasta tokens de agentes. Sube de 0.4.1 a 0.5.0 porque trae interfaz nueva (`run.mjs`, `compare.mjs`, `catalog/symptoms.json`, `norms/base.md`).

- `scripts/run.mjs` con subcomandos: `env` (versión del plugin, de Node y de Claude Code, mínimo 2.1.271), `init` (carpeta del run con `run.json` y poda de más de 14 días que no atraviesa enlaces), `config` (`project.json` con claves cerradas), `present`, `norms`, `check` (un `--dom` por cada archivo de `dom.json`), `leak-values`, `git-state`, `options-check`, `discard`, `auditor-check`, `menu`, `report-skeleton`, `report-line`, `verdict` y `compare-html`.
- `scripts/compare.mjs`: huella estructural de mockups (bloques, titulares, columnas, acción primaria) y de style tiles (tono del primario, tipografía, radios); `options` dice qué opción regenerar, `approved` compara un aprobado con su implementación. Informativo: las diferencias nunca dan exit 1. **Medición de A-18: 0 de 6 diferencias falsas** sobre pares aprobado/implementación que solo cambian tokens.
- Diccionario de 11 síntomas (`catalog/symptoms.json`), normas base con 12 criterios de juicio `J-01` a `J-12` (`norms/base.md`) y normas del autor opcionales (`norms.md`; si son inválidas se ignoran enteras, con aviso).
- `verdict` decide "terminado", "BLOCKED" o "sin verificar" por script: `ui-check` sin bloqueantes nuevos en alcance, `report-check` en 0 y build verde si existe.
- El "después" de una confirmación vive en `<run>/after/`: medir otra vez en la misma carpeta deja `ui-check.json` desactualizado y `report-check` retira todo (R-13). Regenerar una opción mueve la anterior a `<run>/discarded/` (R-14).
- Lienzo "Design": **fuera de la v1** (decisión del autor, 2026-10-01); la presentación es siempre `compare.html` local y no se publica nada.
- `browser.mjs` exporta `createOpener` (sin cambio de comportamiento) para compartir la apertura con limpieza.

## 0.4.1 — sin publicar

Arreglos de la revisión final del hito 3 (navegador):

- Sin falsos `bloquea` en patrones comunes: el texto oculto a propósito (`sr-only` de Tailwind, `visually-hidden` de Bootstrap) ya no cuenta como texto recortado (LAYOUT-11); un grupo de radios con el mismo `name` se alcanza con un solo Tab y las flechas hacen el resto (NAV-01); un tooltip que aparece con `:hover` (`opacity: 0`) ya no falla MOTION-07, que solo marca el texto con opacidad > 0 en la carga normal ya asentada.
- LAYOUT-10 ya no da `pass` con un contenedor pintado de borde a borde: solo es "barra" un `header`, `nav` o `footer`, o una franja pintada de menos del 25 % del alto del viewport (el `min-h-screen bg-gray-50` de casi todo layout no lo es). Límite: una franja pintada corta con un solo párrafo pegado al borde sigue pasando.
- "Requiere sesión" ve una redirección del lado del cliente después de `load` (`history.replaceState('/login')`): la URL se lee de nuevo tras 0,5 s, tras los chequeos y tras la pasada de movimiento reducido; `dom` también la revisa. El camino del campo de contraseña visible ahora tiene su test.
- Una URL que cuelga ya no cuesta 4 min 28 s con `--platform both --dark`: tras el primer `PageLoadError` el resto de anchos y temas sale `unverified` con el mismo motivo, sin reintentar. Cada carga de `measure`, `capture` y `dom` espera 0,5 s para ver esas redirecciones (0,5 s por ancho y tema).
- Ctrl+C o SIGTERM sobre `browser.mjs` mata el navegador, intenta borrar el perfil e imprime `{ interrupted, cleanup, leftoverProfile? }` (exit 130 o 143). Un navegador que no arrancó ahora informa en `cleanup` si su perfil quedó sin borrar. Los dos caminos tienen test.
- Los tests de procesos huérfanos fallan si no pudieron medir (PowerShell sin arrancar o con plazo vencido): antes devolvían "sin huérfanos".

## 0.4.0 — sin publicar

- Hito 3: `scripts/browser.mjs` maneja el Chrome o Edge instalado por `--remote-debugging-pipe` (perfil temporal propio, nunca el del usuario) con tres subcomandos: `measure` (B1–B4: COLOR-03, STATE-04, NAV-01, LAYOUT-10, LAYOUT-11 y MOTION-07, en todos los anchos y temas de §11.3, a `browser.json`), `capture` (capturas de viewport validadas, con sha256, en la carpeta del run) y `dom` (DOM renderizado a `dom-<ancho>.html`, para las reglas `document` de `ui-check`). `ui-check --measures <browser.json>` suma esas entradas a su salida y a su código de salida.
- Motivo de subir a 0.4.0: interfaz nueva (`browser.mjs`, `--measures`) y `browser.json` con su contrato completo.
- Lo que cambia para el usuario: hace falta Chrome o Edge instalado para medir (`PIGNOLO_UI_BROWSER` fuerza la ruta); sin navegador, con la URL caída, con sesión requerida o con un plazo vencido todo sale "no verificado" con su motivo, nunca "pasa"; `--url` acepta solo direcciones locales; las capturas quedan en la carpeta del run; un perfil temporal que no se pudo borrar se informa con su ruta (`cleanup` y `leftoverProfile`), pero no se poda nada (decisión D-3-1 del orquestador).
- Los tests de navegador sin navegador salen como skip visible (`sin navegador: …`), nunca como verde.

## 0.3.1 — 2026-09-30

- Se quita la opción `language` de `userConfig`. Los textos para el usuario siguen el idioma de la conversación (el de Claude Code). Motivo: en `/config` aparecía una fila "Idioma" sin nada que elegir, y ningún código la leía (decisión del autor, 2026-09-30).

## 0.3.0 — sin publicar

- Hito 2b: SEO estático en `ui-check` (SEO-01, 02, 04, 05, 06, 09, 18; solo con `web.public: true` en el `DESIGN.md`, nunca bloquean; `--url` para revisar la URL de desarrollo local), `files.mjs` (`save | verify | restore`, §9) y `report-check.mjs` (§12).
- Motivo de subir a 0.3.0: interfaces nuevas (`files`, `report-check`, `--url`, `report.json`) y 7 reglas más en el catálogo (`catalogVersion` 0.3.0).
- Lo que cambia para el usuario: SEO-01 sin `robots.txt` pasa (todo permitido) y SEO-05 queda no verificado; `--url` acepta solo direcciones locales (`localhost`, `127.0.0.0/8`, `[::1]`); en `restore`, un cambio inesperado sobre un archivo con seguimiento (o que ya estaba sucio) queda `BLOCKED` y se le pregunta al usuario, en lugar de revertirse (decisión del autor D-2b-1, 2026-09-29); `restore` borra los archivos nuevos que se crearon durante el lote, también los que quedaron fuera de la lista, si nadie los tocó después de `verify`; los archivos ignorados por git no se vigilan (pero `restore` nunca borra uno que ya existía).
- Arreglos de la revisión final del hito 2b:
  - `restore` nunca borra un archivo sin seguimiento que ya existía antes de `save`: uno ignorado que deja de estarlo durante el lote (`save` anota las rutas ignoradas sin leerlas), uno que estaba en `HEAD` o uno sacado del índice con `git rm --cached`. Queda `BLOCKED` con `existed-before-the-batch`. Antes se borraba (pérdida de datos del usuario).
  - `restore` no dice `restored` si una ruta creada sigue ahí pero no se puede leer: `BLOCKED` con `unreadable`. `verify` avisa en `problems` (y sale 1) si a un archivo esperado ahora se llega por un enlace que sale del proyecto.
  - `restore` nunca borra la única copia de algo que el agente movió o copió: si un origen se movió (un archivo ignorado que ya no está o cambió de tamaño o fecha, una carpeta ignorada que ya no está, o un archivo sucio o sin seguimiento de antes de `save` que desapareció o cambió), ningún archivo sin seguimiento inesperado se borra (`BLOCKED` con `source-moved`) y `verify` lo avisa en `warnings`. Antes `mv secret.txt otro.txt`, `cp .env .env.example && rm .env` o `mv notas.md notas2.md` terminaban con la única copia borrada. Un archivo sin seguimiento con el mismo sha256 que uno de antes de `save` queda `existed-before-the-batch`. `save` anota tamaño y fecha de los archivos ignorados (sin leerlos).
  - La salida de `restore` dice exactamente qué hizo: `summary` en una línea (restaurados, borrados, sin tocar); con `BLOCKED`, `restored` y `deleted` pueden no estar vacíos. Antes el texto de ayuda decía que con `BLOCKED` no se borraba nada.
  - Límite declarado: lo que el usuario crea entre `save` y `restore` se trata como del agente y se borra; `verify` lo recuerda en `note`.
  - SEO-09 sin falsos fail: un `a` sin `href` dentro de un `Link` (o con `passHref`/`legacyBehavior` en el padre), con `role` distinto de `link` o con `tabIndex` negativo ya no falla; `tabIndex` ≥ 0 y `role="link"` siguen fallando.
  - `files.mjs` exige `--batch` dentro de `.pignolo-ui/runs/<run>/`; `report-check` trata como implementado todo run con un `files.json`, aunque no se haya corrido `verify`.
  - `report-check` retira una afirmación con `rule`, `status` o `measure` que cita un archivo o una captura (`rule claims need ui-check or browser evidence`).
  - SEO: las páginas y layouts de Next.js con `metadata` (sin `<html>`) ahora se revisan con SEO-02, 04, 06 y 18, y SEO-09 revisa también los componentes; antes no daban ninguna entrada. SEO-02 ve `'index': false` con comillas. Ruling del orquestador: un `noindex` en una página o layout de Next.js que no es el layout raíz ni la home da `medio` (suele ser intencional, como `/admin`, y la regla no acepta `intentional`); en el raíz o la home sigue `alto`.
- Límite declarado con `--base`: la base no ve un sitemap en una ruta no estándar ni lo que generan `app/robots.ts` o `app/sitemap.ts`; esos hallazgos de SEO-01 y SEO-05 pueden salir `new` en lugar de `existing`. Como el SEO nunca bloquea, solo cambia el alcance informado, no el código de salida.

## 0.2.0 — sin publicar

- Hito 2a: catálogo de reglas con checker y `ui-check` (`scripts/ui-check.mjs`): 25 reglas de accesibilidad, contraste, estilo, contenido, deriva y look de fábrica, más THEME-03 y 4 reglas de navegador para el hito 3; alcance nuevo/deuda con `--base`; rechazos traducidos del `DESIGN.md`; salida `ui-check.json` y códigos 0/1/2. El catálogo lleva ahora `checker`, `related`, `conflicts` y fuente con versión. Valores de terceros (MIT) en `catalog/` con su aviso en `CREDITS.md`.
- Motivo de subir a 0.2.0: hay una interfaz nueva (`ui-check` y su formato de salida) y el contrato del catálogo cambió (campos nuevos); el hito 1 solo traía el esqueleto y el formato.
- `ui-check` con `--base` inválida es error de uso (exit 2, mensaje en español, sin "error interno" ni stack) y se valida antes de correr las reglas; `--design` tiene que estar dentro del proyecto, igual que `--files` y `--dom`.
- Ruling STATE-04 (técnico): cuenta como reposición del indicador una declaración que dibuja (`outline` u `outline-style` distinto de none, `box-shadow`, `border`) en la misma regla cuando la parte del selector que quita el outline es `:focus`/`:focus-visible` (no dentro de `:not(`), o en `:focus`/`:focus-visible` del mismo selector base; `.c { outline: none; border: 1px solid #ccc }` sigue bloqueando. También cuenta una clase `focus:` o `focus-visible:` que dibuja (`ring*`, `outline-*`, `border*`, `shadow*`, salvo las formas `-0`/`-none`/`outline-hidden`, los `ring-offset-*`/`outline-offset-*` y los colores `*-transparent`). Antes solo valía `:focus-visible` y daba `bloquea` falso con el indicador en `:focus`.
- A11Y-39 y A11Y-04 en JSX: `{-1}`, números, `{true}` y `{false}` son valores estáticos, y un `aria-*` sin valor vale `"true"`; un carrusel con `tabIndex={-1}` dentro de `aria-hidden` ya no bloquea. `disabled={false}` no cuenta como deshabilitado.
- Contraste: se compara el ratio sin redondear (4,49995 falla contra 4,5); solo se redondea lo que se muestra.
- MOTION-03 exime lo que está dentro de `@media (prefers-reduced-motion: no-preference)`. ICON-01 ya no toma ©, ® ni ™ como emoji. COPY-01 exige palabra entera. DEPTH-01 distingue "sombra literal con color de token" de "token de otra familia".
- Reglas de elemento sin costo cuadrático ni desborde de pila con anidamiento profundo.
- El arnés de fixtures exige que un caso `pass-*` tenga un pass emitido por la regla; el pass sintético del runner solo vale si el caso lo declara (`noFindingsPass`) y la regla tiene un caso `fail-*` hermano.
- CREDITS (Vite): el aviso MIT se tomó de la LICENSE de v8.3.1 y los valores provienen de v7.0.0; no se verificó que la LICENSE de v7.0.0 tenga el mismo texto.
- El README genera su tabla de reglas desde el catálogo (`renderCatalogMarkdown`).

## 0.1.0 — sin publicar

- Hito 1: esqueleto del plugin, linter del plugin, parser YAML propio, colores, fuentes de tokens, `design-md` (`validate`, `extract`, `patch`), aprobados versionados (`approve`) y la plantilla `DESIGN.md`.
