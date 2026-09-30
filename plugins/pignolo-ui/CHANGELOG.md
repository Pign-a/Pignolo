# Changelog

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
