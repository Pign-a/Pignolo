# Changelog

## 0.2.0 — sin publicar

- Hito 2a: catálogo de reglas con checker y `ui-check` (`scripts/ui-check.mjs`): 25 reglas de accesibilidad, contraste, estilo, contenido, deriva y look de fábrica, más THEME-03 y 4 reglas de navegador para el hito 3; alcance nuevo/deuda con `--base`; rechazos traducidos del `DESIGN.md`; salida `ui-check.json` y códigos 0/1/2. El catálogo lleva ahora `checker`, `related`, `conflicts` y fuente con versión. Valores de terceros (MIT) en `catalog/` con su aviso en `CREDITS.md`.
- Motivo de subir a 0.2.0: hay una interfaz nueva (`ui-check` y su formato de salida) y el contrato del catálogo cambió (campos nuevos); el hito 1 solo traía el esqueleto y el formato.
- `ui-check` con `--base` inválida imprime ahora su mensaje en español (exit 2), sin "error interno" ni stack.
- El README genera su tabla de reglas desde el catálogo (`renderCatalogMarkdown`).

## 0.1.0 — sin publicar

- Hito 1: esqueleto del plugin, linter del plugin, parser YAML propio, colores, fuentes de tokens, `design-md` (`validate`, `extract`, `patch`), aprobados versionados (`approve`) y la plantilla `DESIGN.md`.
