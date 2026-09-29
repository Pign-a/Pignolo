# Pignolo UI

Plugin opcional de Claude Code, hermano de pignolo y en el mismo marketplace, para crear y mejorar interfaces web con **decisiones de diseño explícitas y verificadas**. Anda sin el núcleo. Estado: v0.2 en construcción (hito 2a de 5: catálogo y `ui-check`).

Diseño: `docs/specs/2026-09-28-pignolo-ui-v1-design.md`.

## Requisitos

- Node ≥ 22 para pignolo-ui (A-12), sin dependencias npm.
- Claude Code ≥ 2.1.271 (`userConfig` con `options`).

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
        [--base <ref>] [--dom <archivo>]... [--gate]

- `--project` es opcional: por defecto, la raíz de git desde el cwd (o el cwd sin git). `--files` se repite, una ruta por vez. Sin `--files` ni `--dom`, la corrida vale solo con `--design` (corren las reglas de proyecto); sin ninguno de los tres es error de uso.
- `--base <ref>` separa lo nuevo de la deuda: un hallazgo que ya estaba en la ref (contado como multiconjunto, sin depender del número de línea) es deuda (`alto`, no bloquea). Una ref inválida da exit 2 con un mensaje en español.
- `--dom` evalúa cada archivo como documento HTML, siempre como nuevo. `--gate` hace lo mismo sin JSON en stdout y con una línea de resumen en stderr.
- Códigos de salida: `0` ningún `fail` con severidad `bloquea` y alcance `new`; `1` al menos uno; `2` error propio.
- Salida: `<run>/ui-check.json` con `catalogVersion`, `inputs` (`{ file, sha256 }`), `base` y `entries` (`{ id, status, reason?, severity, scope, file?, line?, selector?, fingerprint, measure? }`); `status` es `pass | fail | unverified`. Cada regla aplicable deja al menos una entrada por archivo.
- `unverified` no bloquea porque no es un hallazgo: es una regla que corrió y no pudo decidir (extensión no soportada como `.astro`, JSX dinámico, `layout.tsx` de Next.js donde el `<title>` viene de `metadata`). Se lista como pendiente para la revisión del auditor o del navegador; nunca se cuenta como `pass`.
- Umbral de texto grande en tokens: sobre pares de tokens no se conoce la tipografía, así que COLOR-03 exige 4,5:1, salvo un componente con `typography` grande (`fontSize` ≥ 24px, o ≥ 18,66px con `fontWeight` ≥ 700) o un par de prosa marcado `(texto grande)`, que usan 3:1.
- Rechazos del `DESIGN.md` (`pignolo.rejections`) son piso: si reaparecen en algo nuevo, `bloquea`.

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
| SEO-02 | No accidental noindex: meta robots/googlebot, Next.js metadata.robots or X-Robots-Tag; in the source of a public page alto, seen only on the development URL detalle | document | no | alto | no | Google Search Central, robots meta tag and X-Robots-Tag, https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag (consulted 2026-09-29) | ui-check |
| SEO-04 | Exactly one link rel=canonical, with an absolute URL | document | no | medio | sí | RFC 6596 The Canonical Link Relation, https://www.rfc-editor.org/rfc/rfc6596 (consulted 2026-09-29) | ui-check |
| SEO-05 | The sitemap referenced by robots.txt exists and is well-formed XML with the sitemaps.org shape | document | no | medio | sí | sitemaps.org protocol 0.9, https://www.sitemaps.org/protocol.html (consulted 2026-09-29) | ui-check |
| SEO-06 | Title present, not empty and not repeated across the checked pages | document | no | medio | sí | HTML Living Standard, the title element, https://html.spec.whatwg.org/multipage/semantics.html#the-title-element (consulted 2026-09-29) | ui-check |
| SEO-09 | No a without href used as a link; no href="javascript:..." | document | no | medio | no | Google Search Central, link best practices (crawlable links), https://developers.google.com/search/docs/crawling-indexing/links-crawlable (consulted 2026-09-29) | ui-check |
| SEO-18 | og:title, og:type, og:image and og:url present | document | no | detalle | sí | The Open Graph protocol, https://ogp.me/ (consulted 2026-09-29) | ui-check |
<!-- catalog:end -->

## Instalar (desarrollo)

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo-ui

## Tests

    npm test          (todo el repo)
    npm run test:ui   (solo pignolo-ui)
