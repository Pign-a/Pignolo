# Changelog

## 0.4.0 — sin publicar

Con el núcleo 0.22.1 (el núcleo no cambia). El panel muestra qué hace cada agente.

- **La pestaña `Ahora` pasa a llamarse `Live`** (misma tecla `1`).
- **TRABAJANDO muestra un renglón por agente:** la tarea (el tipo, tenue, si no es `general-purpose`), el modelo, el tiempo, los tokens y `ctx` (el tamaño de su contexto en el último paso); debajo, tenue, lo que hace ahora (la última herramienta y a qué apunta) y hace cuánto terminó ese paso. Un agente sin actividad hace más de 60 s sale con `◌` y "sin actividad hace …", y un contexto de 150k o más se marca, los dos en el color de aviso. Los agentes lanzados por otro agente van debajo de su padre (`└`). Primero los que piden atención, después el más reciente. A la derecha del título: cuántos agentes, los tokens y el tiempo del más largo.
- **Se adapta al alto y al ancho:** con lugar, tres filas por agente y el minigráfico en una fila; con poco, solo los que piden atención ocupan dos líneas y los demás una, con "+ N más, trabajando sin avisos" (los que piden atención nunca se esconden ahí); con ancho angosto (menos de 60 columnas dentro del bloque) se van primero el modelo, después los tokens y después el "hace n s".
- **Botón `s: resumen`:** llena el prompt con un pedido de resumen de lo que hace cada agente. Solo llena: no lo envía.
- **Sin la línea de atajos numéricos al pie del panel** (las pestañas ya muestran su número) y **sin la línea `→ siguiente:` de la banda** (el siguiente paso sigue en el bloque SIGUIENTE y como sugerencia tenue en el prompt).
- **Pestaña UI:** el título ya no dice `haiku · N consultas · ≈ costo`; cada recomendación es un botón con su título completo y el porqué debajo, sangrado y que baja de renglón en vez de cortarse; los atajos van en columnas alineadas (cuatro por fila desde 72 columnas, dos por fila si no) y `r: reconsultar` alineado con ellos.
- **Letras duplicadas:** los botones con tecla ya no repiten la letra en la etiqueta (la pantalla decía `a: a  Auditar…`). El asistente de inicio no cambia.
- `/pignolo-panel demo busy` muestra cuatro agentes con este detalle (uno parado, uno anidado, uno con contexto alto). El mod usa solo lo que ya leía (`turn.step` y `agent.spawn`): cero llamadas ni eventos nuevos, y no escribe ni envía nada más. Lo que muestra de cada herramienta se dibuja y no se guarda.

## 0.3.1 — sin publicar

Con el núcleo 0.22.1. "Activo" lo decide `.pignolo/project.md` (lo que usa el núcleo), no el registro: con `project.md` y sin registro (pignolo se activó a mitad de sesión) o con un registro ilegible, el panel dice "pignolo está activo; el panel se completa en unos segundos" en vez de "pignolo no está activo en este proyecto", y lo vuelve a leer con el reloj de siempre (cada 3 s) hasta que aparece. Sin `project.md` sigue diciendo que no está activo. Cero llamadas nuevas (solo `fs.exists`/`fs.read`); sigue sin `process` ni `http`.

## 0.3.0 — sin publicar

**Asistente de inicio** (decisión del autor, 2026-10-03): al abrir Claude Code en un proyecto que todavía no usa pignolo (sin `.pignolo/project.md`), el panel se abre solo con un asistente de pocos pasos: cada uno con lo que pignolo detectó y la opción recomendada marcada. Va con el núcleo 0.20.0 (que deja la detección y valida las elecciones).

- **Marco redondeado de 70 columnas** (`╭─ Empezar con pignolo ─ … paso 2 de 5 ─╮`), barra de progreso, opciones con letra en columnas fijas (letra, 28, resto) con la recomendada marcada, y el mismo ancho en todos los pasos; todo texto, sin `Raster` (Desktop lo dibuja igual). El criterio visual está fijado como test (`tests/wizard-view.test.ts`, el mockup del paso 2 en `tests/fixtures/`).
- **Pasos:** 1 el proyecto (lenguaje, tests, rama principal: confirmar o pedir corregir), 2 perfil de modelos, 3 permisos (resumen llano por regla), 4 carpetas (si hay candidatas; por fila: adoptar, mover o dejar), 5 interfaz (solo con pignolo-ui), y el resumen. Repo en blanco: una sola pantalla ("crear solo la estructura" o "más tarde").
- **Teclas** (según la doc de mods; `Esc` no se puede capturar): una letra elige, `Enter` presiona el botón de seguir (tiene el foco), `p` vuelve, `Esc` cierra el panel (y el asistente no vuelve a abrirse solo en la sesión), en el paso de carpetas el número de la fila cambia su decisión.
- **Aplicar envía UN mensaje** como tuyo: la frase `Activá pignolo en este proyecto con estas elecciones: --choices {json}` (una sola vez aunque se pulse dos veces; relee la detección y no envía si cambió; una línea y sin invisibles, por `submitText`). **Quien escribe es `/pignolo:init`**, con sus controles de siempre: vista previa y una pantalla final de confirmación; cancelar deja todo igual. El panel no escribe nada. (`prompt.submit` rechaza un texto que empiece con `/`, por eso no es el comando.)
- **"No usar pignolo acá"** (RW-02, opción `c` del paso 1 y de la pantalla de repo en blanco): envía UNA frase fija (`No quiero usar pignolo en este proyecto: --decline`) y `init` guarda una marca bajo `.git/pignolo/` (nada más); desde entonces no se ofrece solo. `/pignolo-panel wizard` y `/pignolo:init` siguen funcionando a mano. El perfil que se marca como recomendado es el que ya tenés configurado (RW-01).
- **Se ofrece una vez por sesión hasta que actives pignolo o elijas "no usar pignolo acá"** (lo decide el hook de arranque del núcleo: `offer`), con `autoOpen` prendido y la terminal de 144 columnas o más; cede ante una decisión "Te toca" abierta. `/pignolo-panel wizard` lo abre a mano (retoma donde quedó) y `/pignolo-panel wizard demo` lo muestra con datos de muestra (solo llena el prompt, nunca envía).
- **Lee** `.git/pignolo/wizard-detect.json` (solo si no hay `.pignolo/project.md`). Archivo ausente, roto, de otra versión o sin `id`: el asistente no se abre y no hay mensaje de error.
- **Cero llamadas nuevas** del mod (la lista de `calls:` es la de 0.2.0; cerrar el asistente vuelve al panel de siempre y `Esc` cierra el panel). Sigue habiendo un único `prompt.submit` (`submitText`).

## 0.2.0 — sin publicar

Pestaña **UI** (decisión del autor, 2026-10-03): con pignolo-ui instalado, una cuarta pestaña (tecla `4`) con las 3 mejores acciones para tu interfaz y atajos que envían el pedido.

- **Aparece sola** si pignolo-ui está habilitado (`enabledPlugins` de la configuración; si no se puede leer, los comandos registrados o la carpeta `.pignolo-ui/`). Sin pignolo-ui no hay pestaña ni consulta.
- **Recomendaciones**: haiku ordena y redacta las 3 mejores acciones (`model.complete`, ≈ 0,01 USD) **solo al abrir la pestaña**, al volver a ella o con `r`; nunca en un temporizador, un turno o un refresco. Tope de 6 consultas por sesión y una por cada estado del proyecto; sin caché entre sesiones. Si falla, el modelo está bloqueado o la salida no valida, se muestran las de reglas (marca "por reglas") sin error a la vista. Sin producto o diseño definidos, la única recomendación es definir y no se llama al modelo.
- **Qué sale al modelo**: un resumen sin contenido de archivos: secciones de PRODUCT.md sin decidir (por nombre), si DESIGN.md existe, nombres de pantallas (filtrados a `[a-z0-9._-]`), comando y fecha de las últimas corridas y de la última auditoría el conteo por severidad y hasta 5 ids de regla. Nunca texto de tus archivos. Sin herramientas ni historial.
- **Atajos que envían**: `a`/`b`/`c` (las recomendaciones) y `n` nueva, `m` mejorar, `u` auditar, `d` definir envían el pedido como mensaje tuyo con una frase fija (`Mejorá la pantalla <nombre>.`, `Auditá…`, `Hagamos…`, `Definí el producto y el diseño.`) y, si hay, una línea de contexto calculada por reglas. El texto no lo escribe el modelo. Una sola vez, releyendo antes; una sola línea y sin caracteres invisibles. Sigue habiendo un único `prompt.submit` en el paquete (`submitText`).
- Opción `uiRecommendations` (prendida por defecto): en `false` la pestaña usa solo reglas y nunca consulta al modelo.
- Llamadas nuevas del mod: `model.complete`, `settings.read`, `command.list` y `fs.list` (solo para leer las carpetas de pignolo-ui). `model.fork` y `model.classify` no se usan.
- En modo demo la pestaña usa un árbol de muestra (`sample/ui`) y solo reglas.
- Revisión opus (RU-01 a RU-03): `DESIGN.md` con la marca `extraídos, no decididos` no cuenta como decidido (misma regla que la compuerta de pignolo-ui); en `new` el objetivo solo puede ser una pantalla leída del proyecto y sin versión aprobada (si no, la recomendación sale sin objetivo y el texto enviado tampoco lo lleva); `submitText` rechaza también U+2028/U+2029.

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
