# Changelog

## 0.1.0 — sin publicar

Primera versión (decisión del autor, 2026-10-03; sale del prototipo aprobado). Plugin aparte del núcleo `pignolo`: la guardia no comparte archivo con el mod. Requiere Claude Code 2.1.287 o más nuevo.

- Banda sobre el prompt y panel `/pignolo-panel` (Ahora, Ramas, Costo) con cada bloque en un marco redondeado y atajos al pie.
- Lee un solo archivo, `.pignolo/panel-state.json` (`pignolo-panel-state/1`); sin él dice "pignolo no está activo en este proyecto".
- "Te toca": opciones con letra, pros y contras (`p`), dejar para después (`z`) y respuesta que se envía con contexto (`Respuesta a la decisión <id> ("<pregunta>"): <opción>.`); "Otra…" solo llena el prompt.
- `c` copia la rama o la ruta del informe de la fila elegida y `h` su hash.
- Se abre solo cuando aparece una decisión nueva (`autoOpen`, prendido por defecto): 144 columnas o más la primera vez, 110 después; una vez por decisión.
- Un único `prompt.submit`, dentro de `submitAnswer`; lo verifica `tests/panel-trust.test.js` sobre `claude plugin validate`.

**Arreglos de la revisión (RP-01, RP-03):**

- Una respuesta se envía una sola vez: la decisión queda «enviando…» (sin botones) antes de `prompt.submit`, que espera a la sesión, y una segunda pulsación no encola otro envío. Antes de enviar relee el registro: si la decisión ya no está abierta o cambió su pregunta u opciones, no envía y avisa («La decisión cambió»).
- El texto enviado es lo que se muestra, en una sola línea: los saltos de línea se aplanan; una pregunta u opción con caracteres de control o de más de 300 / 80 caracteres no se envía y avisa «Pregunta inválida».
- Tests: `tests/review.test.ts` (del revisor, sin editar) y `tests/answer.test.ts` (7).
