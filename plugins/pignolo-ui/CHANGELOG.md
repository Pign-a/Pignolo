# Changelog

## 0.2.0 — sin publicar

- Hito 2a: catálogo de reglas con checker y `ui-check` (`scripts/ui-check.mjs`): 25 reglas de accesibilidad, contraste, estilo, contenido, deriva y look de fábrica, más THEME-03 y 4 reglas de navegador para el hito 3; alcance nuevo/deuda con `--base`; rechazos traducidos del `DESIGN.md`; salida `ui-check.json` y códigos 0/1/2. El catálogo lleva ahora `checker`, `related`, `conflicts` y fuente con versión. Valores de terceros (MIT) en `catalog/` con su aviso en `CREDITS.md`.
- Motivo de subir a 0.2.0: hay una interfaz nueva (`ui-check` y su formato de salida) y el contrato del catálogo cambió (campos nuevos); el hito 1 solo traía el esqueleto y el formato.
- `ui-check` con `--base` inválida es error de uso (exit 2, mensaje en español, sin "error interno" ni stack) y se valida antes de correr las reglas; `--design` tiene que estar dentro del proyecto, igual que `--files` y `--dom`.
- Ruling STATE-04 (técnico): cuenta como reposición del indicador una declaración que dibuja (`outline` u `outline-style` distinto de none, `box-shadow`, `border`) en la misma regla o en `:focus`/`:focus-visible` del mismo selector base, y una clase `focus:` o `focus-visible:` que dibuja (`ring*`, `outline-*`, `border*`, `shadow*`, salvo las formas `-0`/`-none`/`outline-hidden`). Antes solo valía `:focus-visible` y daba `bloquea` falso con el indicador en `:focus`.
- A11Y-39 y A11Y-04 en JSX: `{-1}`, números, `{true}` y `{false}` son valores estáticos, y un `aria-*` sin valor vale `"true"`; un carrusel con `tabIndex={-1}` dentro de `aria-hidden` ya no bloquea.
- Contraste: se compara el ratio sin redondear (4,49995 falla contra 4,5); solo se redondea lo que se muestra.
- MOTION-03 exime lo que está dentro de `@media (prefers-reduced-motion: no-preference)`. ICON-01 ya no toma ©, ® ni ™ como emoji. COPY-01 exige palabra entera. DEPTH-01 distingue "sombra literal con color de token" de "token de otra familia".
- Reglas de elemento sin costo cuadrático ni desborde de pila con anidamiento profundo.
- El arnés de fixtures exige que un caso `pass-*` tenga un pass emitido por la regla; el pass sintético del runner solo vale si el caso lo declara (`noFindingsPass`).
- CREDITS (Vite): el aviso MIT se tomó de la LICENSE de v8.3.1 y los valores provienen de v7.0.0; no se verificó que la LICENSE de v7.0.0 tenga el mismo texto.
- El README genera su tabla de reglas desde el catálogo (`renderCatalogMarkdown`).

## 0.1.0 — sin publicar

- Hito 1: esqueleto del plugin, linter del plugin, parser YAML propio, colores, fuentes de tokens, `design-md` (`validate`, `extract`, `patch`), aprobados versionados (`approve`) y la plantilla `DESIGN.md`.
