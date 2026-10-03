# Changelog

## 0.1.0 — sin publicar

Primera versión (decisión del autor, 2026-10-03; sale del prototipo aprobado). Plugin aparte del núcleo `pignolo`: la guardia no comparte archivo con el mod. Requiere Claude Code 2.1.287 o más nuevo.

- Banda sobre el prompt y panel `/pignolo-panel` (Ahora, Ramas, Costo) con cada bloque en un marco redondeado y atajos al pie.
- Lee un solo archivo, `.pignolo/panel-state.json` (`pignolo-panel-state/1`); sin él dice "pignolo no está activo en este proyecto".
- "Te toca": opciones con letra, pros y contras (`p`), dejar para después (`z`) y respuesta que se envía con contexto (`Respuesta a la decisión <id> ("<pregunta>"): <opción>.`); "Otra…" solo llena el prompt.
- `c` copia la rama o la ruta del informe de la fila elegida y `h` su hash.
- Se abre solo cuando aparece una decisión nueva (`autoOpen`, prendido por defecto): 144 columnas o más la primera vez, 110 después; una vez por decisión.
- Un único `prompt.submit`, dentro de `submitAnswer`; lo verifica `tests/panel-trust.test.js` sobre `claude plugin validate`.
