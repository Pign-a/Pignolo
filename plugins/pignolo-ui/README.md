# Pignolo UI

Plugin opcional de Claude Code, hermano de pignolo y en el mismo marketplace, para crear y mejorar interfaces web con **decisiones de diseño explícitas y verificadas**. Anda sin el núcleo. Estado: v0.7 en construcción (hito 4c, etapa 1: el lienzo "Design" básico sobre el hito 4; falta la convivencia con el núcleo, hito 5).

Diseño: `docs/specs/2026-09-28-pignolo-ui-v1-design.md`.

## Requisitos

- Node ≥ 22 para pignolo-ui (A-12), sin dependencias npm.
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).
- Chrome o Edge instalado para lo que mide en el navegador (`PIGNOLO_UI_BROWSER` fuerza la ruta). Sin navegador el flujo sigue en modo degradado y lo dice.
- Permisos: se recomienda el modo `acceptEdits`; los subagentes escriben solo en la carpeta del run.

## Comandos

- `/pignolo-ui:new <pantalla>`: confirma o crea `DESIGN.md`, escribe el brief con vos, genera opciones como HTML navegable, elegís, implementa sin romper y verifica con evidencia.
- `/pignolo-ui:improve <URL o ruta>`: inspecciona la pantalla (script y navegador), te muestra un menú de síntomas, genera versiones mejoradas, aplica la elegida y confirma con antes y después.
- `/pignolo-ui:audit <URL o ruta>`: una pasada de auditoría con evidencia; no cambia ningún archivo y no bloquea.

## Configuración (`userConfig`)

- `optionsPerDecision` (`1` o `3`, por defecto `3`): cuántas opciones se generan por decisión, cada una con su subagente. Con `1` las opciones salen en secuencia del hilo principal y el informe lo dice.
- `profile` (`max`, `balanced` o `economy`, por defecto `balanced`): modelo de los subagentes que generan las opciones. `max` usa opus; `balanced` y `economy` usan sonnet. Es un ajuste propio de este plugin y no depende del núcleo. Si el entorno fuerza el modelo de los subagentes (`CLAUDE_CODE_SUBAGENT_MODEL`), manda el entorno y el informe dice solo el modelo pedido.
- `presentation` (`auto` o `local`, por defecto `auto`): con `auto`, las opciones de mockup se publican en un lienzo privado de tu cuenta de claude.ai cuando la cuenta tiene el tipo "Design" (si no, `compare.html` local); con `local` no se publica nada. Un valor ilegible (el texto sin sustituir) cuenta como `local`.

Si Claude Code no sustituye un valor (un ajuste que nunca guardaste llega literal), la skill usa el valor por defecto y lo dice.

## Qué se publica y qué nunca

Con `auto` y una cuenta que tiene el tipo "Design", `/pignolo-ui:new` e `/pignolo-ui:improve` publican las opciones de mockup en un **lienzo privado de tu cuenta de claude.ai** (un lienzo por corrida, una fila por opción y pantalla, a 390 y 1440 px). **No hay pregunta de consentimiento: cada vez que se publica, una línea te avisa** qué se sube (mockups con marcadores, nunca capturas ni código) y cómo no publicar. Lo que se sube sale de una única puerta, `canvas-index.mjs plan`, que antes revisa que los bytes exactos no lleven tus datos (usuario del sistema, carpeta personal, nombre y correo de git, correo de la cuenta, rutas absolutas) y **falla cerrado**: con menos de dos valores conocidos, con git caído, con una carpeta vacía o con un enlace, no se publica y se usa `compare.html`. Lo publicado no se relee ni se captura; se verifica en local (`canvas-index.mjs verify` y los sha256 de `<run>/publish.json`).

Para no publicar: `node scripts/run.mjs config set --data <datos> --project <repo> --key publish --value never` (clave de proyecto, también se respeta un "no" heredado de la 0.6), `presentation = local` o decir "no publiques" en el chat (vale para esa corrida). En los tres casos ni siquiera se llama a la herramienta `Artifact`. Regenerar una opción abre un lienzo nuevo (el anterior queda en tu cuenta y lo borrás vos; el agente nunca borra ni comparte nada).

**Fuentes.** Una opción para el lienzo puede pedir una familia de Google Fonts (las tres `<link>` exactas; la petición la hace el navegador de quien abre el lienzo). El HTML local (`compare.html`, style tiles) no pide nada a la red: usa copias sin esas `<link>` en `<run>/local/`. Lo aprobado en `design/approved/` se guarda también sin las `<link>`; llevar la fuente al código del proyecto es una decisión tuya, después.

Las capturas, el código y los datos de tu proyecto no se publican ni se suben a ningún servicio aparte de Claude Code (el modelo lee el código y las capturas para trabajar). Desinstalar el plugin borra las URLs y rutas confirmadas (`project.json`); `.pignolo-ui/` y `design/approved/` quedan en tu repo.

## Aviso

pignolo-ui no es asesoría legal ni certifica cumplimiento de ninguna norma. Referencias consultadas el 2026-10-01: WCAG 2.2 (https://www.w3.org/TR/WCAG22/), Apple Human Interface Guidelines (https://developer.apple.com/design/human-interface-guidelines/) y Fluent 2 (https://fluent2.microsoft.design/).

## Dónde queda cada cosa

- `<repo>/.pignolo-ui/` (se ignora a sí misma): `runs/<id>/` con `run.json`, `norms.md`, `browser.json`, `ui-check.json`, `captures/`, `option-A|B|C/` o `direction-A|B|C/`, `compare.html` con sus copias sin fuentes remotas en `local/`, `canvas/` (lo que se publica), `publish.json` (estado y sha256 de lo publicado), `auditor.json`, `report.json`. La confirmación de un cambio va en `<run>/after/` y lo descartado en `<run>/discarded/`. Los runs de más de 14 días se podan solos, solo dentro de `runs/` y sin seguir enlaces.
- `${CLAUDE_PLUGIN_DATA}/<repo-id>/project.json`: URL de desarrollo (solo local), rutas confirmadas y ruta de referencia. Desinstalar el plugin lo borra.
- `design/approved/<flujo>/`: lo que el usuario aprobó, con `manifest.json`; se versiona y nunca se edita (un cambio crea `<flujo>-v2`).

## Comandos de apoyo (`run.mjs` y `compare.mjs`)

    node scripts/run.mjs env | init | config | present | publish-gate | no-publish | norms | check | leak-values | options-check | discard | auditor-check | menu | report-skeleton | report-line | verdict | compare-html
    node scripts/canvas-index.mjs build | verify | plan | merge | record
    node scripts/compare.mjs fingerprint | distance | options | approved

Cada uno imprime un objeto JSON; exit 0 hecho, 1 hallazgo o rechazo, 2 error propio (`no verificado`). El JSON de entrada llega siempre por archivo. `verdict` es la única fuente de "terminado".

## Alias de nombres semánticos

Lo que genera pignolo-ui usa los nombres semánticos de Material 3 (`primary`, `on-surface`…). Al **leer** un `DESIGN.md` existente, estos nombres cuentan como su equivalente MD3, siempre que el nombre MD3 no esté definido también; `pignolo.aliases` completa o pisa este mapa. Cada alias usado sale como hallazgo `DESIGN-ALIAS` (`detalle`).

- `accent` → `primary`, `brand` → `primary`
- `on-accent` → `on-primary`, `accent-foreground` → `on-primary`, `primary-foreground` → `on-primary`
- `text` → `on-surface`, `label` → `on-surface`, `foreground` → `on-surface`, `fg` → `on-surface`, `card-foreground` → `on-surface`, `surface-foreground` → `on-surface`
- `secondary-foreground` → `on-secondary`
- `bg` → `background`, `card` → `surface`
- `muted-foreground` → `on-surface-variant`, `text-muted` → `on-surface-variant`
- `border` → `outline-variant`
- `danger` → `error`, `destructive` → `error`, `on-danger` → `on-error`, `destructive-foreground` → `on-error`

## Checker (`ui-check`)

**En palabras simples.** `ui-check` mira los archivos de interfaz que le indicás y te dice qué está mal, sin abrir un navegador y sin conexión. Revisa las reglas con checker del catálogo (tabla abajo): accesibilidad básica (idioma, título, nombres de botones), contraste de colores, transiciones, bordes y colores sueltos fuera de los tokens, textos de relleno y el "look de fábrica" de shadcn/ui, Tailwind o Bootstrap. Devuelve un número:

- `0`: no encontró nada grave y nuevo.
- `1`: encontró al menos un problema grave que agregaste vos (no uno que ya estaba).
- `2`: no pudo revisar (error de uso o error propio). Cuenta como "no verificado", nunca como "todo bien".

Cuando no puede saber algo (por ejemplo, un componente propio o una clase armada con variables), lo marca **no verificado** y te lo lista; no lo da por bueno ni por malo, y por eso no cambia el número que devuelve. Lo que ya fallaba antes de tu cambio aparece como deuda: se ve, pero no bloquea.

Ejemplo:

    node plugins/pignolo-ui/scripts/ui-check.mjs --run .pignolo-ui/runs/prueba --files src/Card.tsx --design DESIGN.md --base HEAD

Escribe `ui-check.json` dentro de la carpeta de la corrida (siempre bajo `.pignolo-ui/`) y muestra un resumen.

**Detalle técnico.**

    node <root>/scripts/ui-check.mjs [--project <raíz del repo>] --run <carpeta bajo .pignolo-ui/>
        (--files <ruta>)... [--files-from <lista.json>] [--design <DESIGN.md>]
        [--base <ref>] [--dom <archivo>]... [--url <URL de desarrollo>]... [--gate]

- `--project` es opcional: por defecto, la raíz de git desde el cwd (o el cwd sin git). `--files` se repite, una ruta por vez. Sin `--files` ni `--dom`, la corrida vale solo con `--design` (corren las reglas de proyecto); sin ninguno de los tres es error de uso.
- `--base <ref>` separa lo nuevo de la deuda: un hallazgo que ya estaba en la ref (contado como multiconjunto, sin depender del número de línea) es deuda (`alto`, no bloquea). Una ref inválida da exit 2 con un mensaje en español.
- `--dom` evalúa cada archivo como documento HTML, siempre como nuevo. `--gate` hace lo mismo sin JSON en stdout y con una línea de resumen en stderr.
- Códigos de salida: `0` ningún `fail` con severidad `bloquea` y alcance `new`; `1` al menos uno; `2` error propio.
- Salida: `<run>/ui-check.json` con `catalogVersion`, `inputs` (`{ file, sha256 }`), `base` y `entries` (`{ id, status, reason?, severity, scope, file?, line?, selector?, fingerprint, measure? }`); `status` es `pass | fail | unverified`. Cada regla aplicable deja al menos una entrada por archivo.
- `unverified` no bloquea porque no es un hallazgo: es una regla que corrió y no pudo decidir (extensión no soportada como `.astro`, JSX dinámico, `layout.tsx` de Next.js donde el `<title>` viene de `metadata`). Se lista como pendiente para la revisión del auditor o del navegador; nunca se cuenta como `pass`.
- Umbral de texto grande en tokens: sobre pares de tokens no se conoce la tipografía, así que COLOR-03 exige 4,5:1, salvo un componente con `typography` grande (`fontSize` ≥ 24px, o ≥ 18,66px con `fontWeight` ≥ 700) o un par de prosa marcado `(texto grande)`, que usan 3:1.
- Rechazos del `DESIGN.md` (`pignolo.rejections`) son piso: si reaparecen en algo nuevo, `bloquea`.
- `--url` (se repite, hasta 20, necesita `--design`) suma a la revisión de SEO las páginas que devuelve tu servidor de desarrollo. Solo se aceptan direcciones locales (`localhost`, `127.0.0.0/8`, `[::1]`), de un solo origen, por `http` o `https`; nada sale a internet. Cada pedido tiene 5 s y todo lo de `--url` tiene 60 s en total; lo que no llega queda no verificado con el motivo.
- SEO: las siete reglas (SEO-01, 02, 04, 05, 06, 09, 18) corren solo si el `DESIGN.md` declara `web.public: true`; si no, cada una deja un `pass` que dice por qué no aplica. Con `web.indexable: false` el `noindex` cuenta como declarado. **El SEO nunca bloquea ni cambia el código de salida**: lo que no se puede saber (metadatos generados en tiempo de ejecución, un `robots` condicional) queda no verificado.

### Catálogo

La tabla sale de `catalog/rules.json` (`lib/catalog.mjs`, `renderCatalogMarkdown`); un test verifica que este bloque es exactamente lo que genera.

<!-- catalog:start -->
| Id | Qué chequea | Nivel | Piso | Severidad | `intentional` | Fuente | Checker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A11Y-01 | &lt;html lang> present and a valid BCP 47 tag | document | sí | bloquea | no | WCAG 2.2 SC 3.1.1 (A); BCP 47 (RFC 5646) | ui-check |
| A11Y-02 | &lt;title> present and not empty | document | sí | bloquea | no | WCAG 2.2 SC 2.4.2 (A) | ui-check |
| A11Y-04 | Static accessible name for button, a, input and [role=button]; icon-only buttons have a name. Roles that do not take their name from content (combobox, listbox, textbox, searchbox, slider, spinbutton...) need aria-label, aria-labelledby or an associated label | element | sí | bloquea | no | WCAG 2.2 SC 4.1.2 (A); WAI-ARIA 1.2 (name from content) | ui-check |
| A11Y-05 | Exactly one main landmark | document | no | alto | no | WAI-ARIA 1.2 main landmark (good practice, not WCAG) | ui-check |
| A11Y-16 | input, select and textarea have a label (aria-hidden ones are skipped); a placeholder alone is a failure, stricter than axe and declared | element | sí | bloquea | no | WCAG 2.2 SC 1.3.1 / 4.1.2 (A) | ui-check |
| A11Y-26 | img has an alt attribute; svg[role=img] has a name (presence only) | element | sí | bloquea | no | WCAG 2.2 SC 1.1.1 (A) | ui-check |
| A11Y-28 | Viewport without user-scalable=no or maximum-scale below 2 | document | sí | bloquea | no | WCAG 2.2 SC 1.4.4 (AA) | ui-check |
| A11Y-39 | No focusable element inside aria-hidden="true"; never on body | element | sí | bloquea | no | WCAG 2.2 SC 4.1.2 (A); WAI-ARIA 1.2 aria-hidden | ui-check |
| COLOR-03 | Text contrast between token pairs: 4.5:1, or 3:1 for large text; alpha composited; both themes | style | sí | bloquea | no | WCAG 2.2 SC 1.4.3 (AA) | ui-check |
| COLOR-04 | Non-text contrast (functional border, focus ring) of 3:1 | style | sí | bloquea | no | WCAG 2.2 SC 1.4.11 (AA) | ui-check |
| STATE-04 | outline: none/0 without a :focus or :focus-visible indicator (same rule or same base selector) that draws | style | sí | bloquea | no | WCAG 2.2 SC 2.4.7 (AA) | ui-check |
| MOTION-03 | Animation or transform transition without @media (prefers-reduced-motion: reduce) | style | no | medio | no | WCAG 2.2 SC 2.3.3 (AAA); Media Queries Level 5 prefers-reduced-motion | ui-check |
| MOTION-04 | transition: all | style | no | medio | sí | CSS Transitions Level 1 transition-property; pignolo-ui spec 2026-09-28 §5.4 | ui-check |
| COLOR-02 | Color literals outside the token source, or a token of another family in a color property | style | no | medio | sí | Material Design 3 color roles (consulted 2026-09-28); pignolo-ui spec 2026-09-28 §4.5 | ui-check |
| DEPTH-01 | Literal box-shadow outside tokens, or a token that is not an elevation token | style | no | medio | sí | Fluent 2 elevation (consulted 2026-09-28) | ui-check |
| LAYOUT-04 | Literal border-radius outside tokens, or a token that is not a radius token (for example var(--space-2)) | style | no | medio | sí | Material Design 3 shape scale (consulted 2026-09-28) | ui-check |
| DRIFT-01 | DESIGN.md and CSS differ (through cssVars) | style | no | alto | no | pignolo-ui spec 2026-09-28 §4.5 | ui-check |
| THEME-01 | Primary, surface, radius or font are framework defaults and not declared | style | no | medio | sí | pignolo-ui spec 2026-09-28 §5.4; values in catalog/framework-defaults.json | ui-check |
| THEME-02 | shadcn: at least 80% of color variables match a published baseColor | style | no | medio | sí | shadcn/ui base colors (consulted 2026-09-29; version pinned in catalog/shadcn-base-colors.json) | ui-check |
| THEME-03 | Declared dark theme is complete: every semantic color defined in both themes | style | no | alto | no | pignolo-ui spec 2026-09-28 §4.3 (A-16) | design-md |
| COLOR-11 | Factory accent: primary with OKLCH hue 265-310 and chroma >= 0.12, or a blue to violet gradient | style | no | medio | sí | Prompting Claude Opus 5.5, Frontend design defaults (consulted 2026-09-28); pignolo-ui spec 2026-09-28 §7.4 | ui-check |
| COLOR-12 | Text with background-clip: text over a gradient (presence; contrast is reported as COLOR-03) | style | no | medio | sí | WCAG 2.2 SC 1.4.3 (AA), contrast part only | ui-check |
| ICON-01 | Emoji at the start of button, navigation link, h1-h6 or li text | element | no | medio | sí | pignolo-ui spec 2026-09-28 §5.4 (heuristic) | ui-check |
| CONTENT-01 | Markers (data-sample or ‹…›) block when taken to real code; filler heuristics are medio | element | sí | bloquea | no | pignolo-ui spec 2026-09-28 §7.1 | ui-check |
| COPY-01 | Marketing filler phrases (es/en); other lang is unverified | element | no | detalle | sí | pignolo-ui spec 2026-09-28 §5.4 (heuristic) | ui-check |
| META-01 | Template title, default favicon, generator attribution | document | no | medio | sí | pignolo-ui spec 2026-09-28 §5.4 (heuristic) | ui-check |
| NAV-01 | Keyboard: Tab reaches every focusable element (navigation menu button included) and focusing it changes its computed styles; disabled controls are exempt (browser check B2) | document | sí | bloquea | no | WCAG 2.2 SC 2.1.1 (A), keyboard part; floor | browser |
| LAYOUT-10 | Side margin of at least 16 px; edge-to-edge bars (for example the mobile nav) do not count (browser check B3) | document | no | alto | no | pignolo-ui spec 2026-09-28 §5.4 (16 px side margin) | browser |
| LAYOUT-11 | No text with scrollWidth > clientWidth + 1 without text-overflow and no horizontal scroll at 320 px (browser check B3) | document | sí | bloquea | no | WCAG 2.2 SC 1.4.10 (AA); floor | browser |
| MOTION-07 | With prefers-reduced-motion: reduce and no scroll, all text of the first two viewports has opacity > 0 (browser check B4) | document | no | alto | no | pignolo-ui spec 2026-09-28 §5.4 (B4) | browser |
| SEO-01 | robots.txt exists or answers 404 (everything allowed), does not block the public routes or the render assets of the checked pages, and references a sitemap | document | no | medio | sí | RFC 9309 Robots Exclusion Protocol, https://www.rfc-editor.org/rfc/rfc9309 (consulted 2026-09-29) | ui-check |
| SEO-02 | No accidental noindex: meta robots/googlebot, Next.js metadata.robots or X-Robots-Tag; in the source of a public page alto (medio in a Next.js page or layout that is not the root layout or the home), seen only on the development URL detalle | document | no | alto | no | Google Search Central, robots meta tag and X-Robots-Tag, https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag (consulted 2026-09-29) | ui-check |
| SEO-04 | Exactly one link rel=canonical, with an absolute URL | document | no | medio | sí | RFC 6596 The Canonical Link Relation, https://www.rfc-editor.org/rfc/rfc6596 (consulted 2026-09-29) | ui-check |
| SEO-05 | The sitemap referenced by robots.txt exists and is well-formed XML with the sitemaps.org shape | document | no | medio | sí | sitemaps.org protocol 0.9, https://www.sitemaps.org/protocol.html (consulted 2026-09-29) | ui-check |
| SEO-06 | Title present, not empty and not repeated across the checked pages | document | no | medio | sí | HTML Living Standard, the title element, https://html.spec.whatwg.org/multipage/semantics.html#the-title-element (consulted 2026-09-29) | ui-check |
| SEO-09 | No a without href used as a link; no href="javascript:..." | document | no | medio | no | Google Search Central, link best practices (crawlable links), https://developers.google.com/search/docs/crawling-indexing/links-crawlable (consulted 2026-09-29) | ui-check |
| SEO-18 | og:title, og:type, og:image and og:url present | document | no | detalle | sí | The Open Graph protocol, https://ogp.me/ (consulted 2026-09-29) | ui-check |
<!-- catalog:end -->

## Navegador (`browser.mjs`)

`node <root>/scripts/browser.mjs <capture|measure|dom> --run <carpeta> (--url <URL local> | --file <archivo>)` mide la página renderizada con el Chrome o Edge instalado (en Windows, Edge antes que Chrome). `PIGNOLO_UI_BROWSER` fuerza la ruta del ejecutable; si apunta a un archivo que no existe, el resultado es "sin navegador", no otro navegador.

- Siempre lanza el navegador con un perfil temporal propio y sin ventana (`--headless=new`, por pipe, sin puerto): nunca toca el navegador ni el perfil del usuario. No levanta el servidor de desarrollo: la URL tiene que estar respondiendo (solo `localhost`, `127.0.0.0/8` o `[::1]`; un archivo va por `--file`, dentro del proyecto).
- `measure` escribe `browser.json` (B1–B4 en cada ancho y tema), `capture` escribe `captures.json` y `captures/<ancho>-<tema>-<n>.png`, y `dom` escribe `dom.json` y `dom-<ancho>.html`. Todo queda en la carpeta del run; las capturas nunca van al repo.
- Si la página redirige a otra ruta (también con una redirección del lado del cliente poco después de cargar) o muestra un campo de contraseña, es "requiere sesión": todas las reglas salen "no verificado" y no se mide nada más. Lo que no se pudo medir (sin navegador, URL caída, plazo vencido) también sale "no verificado" con su motivo.
- `measure --before <browser.json>` marca como deuda las fallas que ya estaban en la medición anterior. `ui-check --measures <browser.json>` suma las entradas a `ui-check.json`.
- Si el perfil temporal no se pudo borrar (también si el navegador no llegó a arrancar, o se cortó con Ctrl+C), `browser.json` lo dice en `cleanup` y la CLI imprime `leftoverProfile`: no se borra nada que esta corrida no haya creado. Una URL que no carga cuesta un plazo de 30 s; el resto de anchos y temas sale "no verificado" sin reintentar.
- Los tests de navegador, sin navegador instalado, salen como skip visible.

## Aplicar sin romper (`files`)

**En palabras simples.** Antes de editar un lote de archivos (hasta 5), `files` guarda una copia de cada uno. Cuando terminás de editar, comprueba que solo cambiaron los archivos que anunciaste. Si algo sale mal, deshace el lote. Nunca borra ni pisa nada sin poder probar que ese archivo es el que dejó el lote; si no puede probarlo, lo deja como está y te avisa (`BLOCKED`).

**Cuidado:** `restore` borra los archivos nuevos que se crearon durante el lote, **incluidos los que no estaban en `expected.json`**, si nadie los tocó después de `verify`. Por eso conviene mirar la lista `unexpected` de `verify` antes de correr `restore`. **No toques el proyecto entre `save` y `restore`:** lo que crees en ese intervalo se trata como del agente y `restore` lo borra (no hay forma de distinguir quién lo creó).

**Detalle técnico.**

    node <root>/scripts/files.mjs save    --project <raíz del repo> --batch <carpeta bajo .pignolo-ui/runs/<run>/> --expected <expected.json>
    node <root>/scripts/files.mjs verify  --project <raíz del repo> --batch <carpeta>
    node <root>/scripts/files.mjs restore --project <raíz del repo> --batch <carpeta>

`expected.json` es una lista de 1 a 5 archivos:

    [
      { "path": "src/Save.tsx", "exists": true, "change": "structure" },
      { "path": "src/tokens.css", "exists": false, "change": "tokens" }
    ]

- `--batch` es una carpeta dentro de un run (`.pignolo-ui/runs/<run>/<lote>`): `report-check` busca los lotes solo dentro de su run. Otra ubicación es error de uso (exit 2).
- `save` copia byte a byte los archivos que existen (en `<lote>/copies/`) y anota el estado inicial de git (`status --porcelain`) y las rutas que git ignora en ese momento (sin leer su contenido). Se niega (exit 1, sin escribir nada) si una ruta sale del proyecto, está bajo `.git/` o `.pignolo-ui/`, se repite, pasa por un enlace simbólico o *junction* que sale del proyecto, difiere del disco en mayúsculas, tiene un `exists` que no coincide con el disco o tiene cambios sin commitear, o si el lote ya tiene registro.
- `verify` compara el estado de git con el inicial. Exit 0 si todo lo cambiado estaba en la lista; exit 1 y la lista `unexpected` si no. Informa las líneas cambiadas y `overLineLimit` (más de 200: informativo). Un archivo de la lista al que ahora se llega por un enlace que sale del proyecto aparece en `problems` (`not-in-project`) y también da exit 1. `warnings` lista cada origen que se movió (`source-moved`): un archivo ignorado que ya no está o cambió de tamaño o fecha, una carpeta ignorada que ya no está, o un archivo que ya estaba sucio o sin seguimiento antes de `save` y que desapareció o cambió. Mientras haya uno, `restore` no borra ningún archivo sin seguimiento inesperado, porque puede ser la única copia de lo que se movió (`mv secreto.txt otro.txt`, o `cp .env .env.example && rm .env`). `note` repite el aviso de no tocar el proyecto entre `save` y `restore`.
- `restore` exige `verify` previo. Restaura desde la copia los archivos que existían y borra los que se crearon, solo con prueba (sha256). Exit 0 si restauró todo; exit 1 si dejó algo (`BLOCKED`); exit 2 en error propio. Con `BLOCKED` puede haber restaurado o borrado otras cosas: `restored` y `deleted` lo listan y `summary` lo dice en una línea (por ejemplo `restaurados 1 (src/a.css); borrados 0; sin tocar 1 (notas2.md)`).
- `BLOCKED` y por qué: `changed-after-the-batch` (alguien editó el archivo después), `not-verified` (apareció algo después de `verify`), `not-in-project` (un enlace lleva fuera del proyecto), `unreadable` (la ruta sigue ahí pero no se puede leer), `existed-before-the-batch` (un archivo sin seguimiento que ya existía antes de `save`: estaba ignorado y dejó de estarlo, estaba en `HEAD`, se sacó del índice con `git rm --cached` o tiene el mismo sha256 que un archivo sucio o sin seguimiento de antes de `save`; nunca se borra), `source-moved` (un archivo sin seguimiento inesperado mientras algún origen se movió; nunca se borra; `sourcesChanged` nombra los orígenes) y `unexpected-change-not-restorable`: un cambio inesperado sobre un archivo con seguimiento, o que ya estaba sucio antes del lote, no tiene copia y git nunca se escribe, así que se le pregunta al usuario.
- Solo lee git (`status`, `rev-parse`, `diff --numstat`, `ls-files`, `ls-tree`); nunca `checkout`, `reset`, `clean` ni `stash`.
- Los archivos ignorados por git no aparecen en `git status`: un cambio en uno de ellos no se detecta como inesperado. Si durante el lote dejan de estar ignorados, `restore` no los borra (`existed-before-the-batch`). `save` anota el tamaño y la fecha de cada archivo ignorado (sin leerlo); dentro de una carpeta ignorada entera solo se mira que la carpeta siga existiendo, así que mover un archivo desde adentro de ella no se detecta. Un paso de build que reescribe un archivo ignorado suelto (por ejemplo `tsconfig.tsbuildinfo`) cuenta como origen movido: `restore` deja los archivos nuevos inesperados sin borrar y avisa.

## Informe verificado (`report-check`)

**En palabras simples.** El informe final no se cree: se cruza. Cada cosa que el informe afirma tiene que apuntar a una prueba (un resultado de `ui-check`, una captura o un archivo editado) y esa prueba tiene que decir lo mismo. Lo que no se sostiene se **retira** del informe antes de mostrarlo. Si el trabajo implementó un diseño aprobado, el informe tiene que citarlo y la cita tiene que coincidir con la que registra `DESIGN.md`.

**Detalle técnico.**

    node <root>/scripts/report-check.mjs --project <raíz del repo> --run <carpeta bajo .pignolo-ui/runs/>

Lee `<run>/report.json` y escribe `<run>/report-check.json` (`reportSha256`, `kept`, `retired`, `implements`, `exitCode`).

    {
      "version": 1,
      "implemented": true,
      "implements": { "path": "design/approved/checkout", "manifestSha256": "<64 hex>" },
      "evidence": { "ui-check.json": "<sha256>", "browser.json": "<sha256>" },
      "claims": [
        { "id": "c1", "text": "…", "rule": "A11Y-04", "status": "pass", "measure": { "ratio": 4.8 },
          "ref": { "source": "ui-check", "fingerprint": "A11Y-04|src/Save.tsx|button …", "line": 3 } },
        { "id": "c2", "text": "…", "ref": { "source": "capture", "path": "captures/home-1440.png", "sha256": "<64 hex>" } },
        { "id": "c3", "text": "…", "ref": { "source": "file", "path": "src/app/page.tsx", "sha256": "<64 hex>" } }
      ]
    }

- Cuatro fuentes de evidencia: `ui-check` (entradas de `ui-check.json`, citado por sha256), `browser` (entradas de `browser.json`, que llega con el hito 3; hasta entonces la afirmación se retira con `browser.json not in the run`), `capture` (un PNG dentro del run, con su sha256) y `file` (un archivo editado, con su sha256).
- Una afirmación con `rule`, `status` o `measure` tiene que citar `ui-check` o `browser`; con `capture` o `file` se retira (`rule claims need ui-check or browser evidence`). Se compara con la entrada citada: mismo id, mismo estado y, por cada clave de `measure` que trae, el mismo valor. `measure` no puede ser `{}`. Una entrada de una regla que no aplica (`measure.applicable: false`) no respalda nada.
- `ui-check.json` vencido (algún archivo de sus `inputs` cambió después de correrlo) retira toda afirmación que lo cita.
- `implemented` es obligatorio. Si el run tiene un lote (`files.json`, verificado o no), se trata como implementado aunque diga `false`. Con `implemented: true` hace falta `implements`, y su `manifestSha256` tiene que coincidir con el que registra `DESIGN.md`.
- Códigos: `0` no se retiró nada y la cita del aprobado está bien; `1` se retiró al menos una afirmación o falta o no coincide la cita (el informe se muestra depurado y el flujo no puede decir "terminado"); `2` error propio, cuenta como "sin verificar".
- "Retirada" quiere decir que la afirmación no se muestra como verdadera; el motivo queda en `retired` (por ejemplo `invalid claim`, `duplicate claim id`, `ui-check.json is stale: <archivo> changed after it ran`).

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo-ui

## Tests

    npm test          (todo el repo)
    npm run test:ui   (solo pignolo-ui)
