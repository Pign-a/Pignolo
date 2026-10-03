# Changelog

## 0.2.0 — sin publicar

Pestaña **UI** (decisión del autor, 2026-10-03): con pignolo-ui instalado, una cuarta pestaña (tecla `4`) con las 3 mejores acciones para tu interfaz y atajos que envían el pedido.

- **Aparece sola** si pignolo-ui está habilitado (`enabledPlugins` de la configuración; si no se puede leer, los comandos registrados o la carpeta `.pignolo-ui/`). Sin pignolo-ui no hay pestaña ni consulta.
- **Recomendaciones**: haiku ordena y redacta las 3 mejores acciones (`model.complete`, ≈ 0,01 USD) **solo al abrir la pestaña**, al volver a ella o con `r`; nunca en un temporizador, un turno o un refresco. Tope de 6 consultas por sesión y una por cada estado del proyecto; sin caché entre sesiones. Si falla, el modelo está bloqueado o la salida no valida, se muestran las de reglas (marca "por reglas") sin error a la vista. Sin producto o diseño definidos, la única recomendación es definir y no se llama al modelo.
- **Qué sale al modelo**: un resumen sin contenido de archivos: secciones de PRODUCT.md sin decidir (por nombre), si DESIGN.md existe, nombres de pantallas (filtrados a `[a-z0-9._-]`), comando y fecha de las últimas corridas y de la última auditoría el conteo por severidad y hasta 5 ids de regla. Nunca texto de tus archivos. Sin herramientas ni historial.
- **Atajos que envían**: `a`/`b`/`c` (las recomendaciones) y `n` nueva, `m` mejorar, `u` auditar, `d` definir envían el pedido como mensaje tuyo con una frase fija (`Mejorá la pantalla <nombre>.`, `Auditá…`, `Hagamos…`, `Definí el producto y el diseño.`) y, si hay, una línea de contexto calculada por reglas. El texto no lo escribe el modelo. Una sola vez, releyendo antes; una sola línea y sin caracteres invisibles. Sigue habiendo un único `prompt.submit` en el paquete (`submitText`).
- Opción `uiRecommendations` (prendida por defecto): en `false` la pestaña usa solo reglas y nunca consulta al modelo.
- Llamadas nuevas del mod: `model.complete`, `settings.read`, `command.list` y `fs.list` (solo para leer las carpetas de pignolo-ui). `model.fork` y `model.classify` no se usan.
- En modo demo la pestaña usa un árbol de muestra (`sample/ui`) y solo reglas.

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
