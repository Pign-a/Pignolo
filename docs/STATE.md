# Estado de pignolo

Actualizado: 2026-10-26. Producto: Pignolo 2, plugin `pignolo` 1.1.0, **publicado** en `Pign-a/Pignolo` (`main` y etiquetas `v1.0.0` y `v1.1.0`; la etiqueta `legacy` guarda el plugin anterior). La 1.1.0 trae el recordatorio de sesión (hook `SessionStart`), las skills encadenadas y el kit de interfaz; el flujo de pantallas de `ui` quedó **pausado** y sin publicar (`docs/ui-flujo-pausado/`). El árbol de trabajo `D:/pignolo-wt/ui-flujo` sigue en la rama `ui-flujo` para iterar el flujo.

## Qué está hecho

- Un solo plugin `plugins/pignolo` con seis skills (`start`, `work`, `validate`, `session`, `ui`, `ui-audit`) y ocho agentes; el código de la auditoría de interfaz vive en `plugins/pignolo/ui-audit/`.
- Medición de la 1.0.0 contra superpowers y contra no usar plugin, hecha y documentada (2026-10-24):
  - Estudio A (`work` forzado, 16 tareas): cuesta lo mismo que sin plugin (razón 1,055) y un 25 % menos que superpowers; aceptación 47 de 48. Registro: `tests/evals/RESULTS-estudio-a-trabajo.md`.
  - Estudio B (revisión, 10 ítems con 20 defectos sembrados): 19/20 en Pignolo, superpowers y sin plugin, 17/20 en `/code-review`. Registro: `tests/evals/RESULTS-estudio-b-revision.md`.
  - Ningún estudio demostró una mejora de calidad: ambos están en el techo.
- Limpieza del plugin viejo en la máquina del autor hecha el 2026-10-24; la skill personal `document-session`, que tenía disparadores casi idénticos a los de `session`, quedó archivada.

Rama `ui-flujo` (2026-10-25 y 26), mejora del flujo de interfaz de `ui` (la 1.1.0 publica solo el kit, el recordatorio y las skills encadenadas; el flujo de ficha de pantalla, ficha de patrón y crítica está pausado):
- **Flujo de primera versión** en `plugins/pignolo/skills/ui` (sección "Building screens"): ficha de pantalla (usuario, trabajo, una acción principal, qué mide cada cifra, orden de importancia), ficha de patrón por pieza y crítica de 8 ítems con la lista de vicios por defecto (sin em dashes, sin píldoras salvo estados). Una línea en `work` lo invoca cuando el pedido toca interfaz.
- **15 fichas de patrón** con fuentes y confianza, más la ficha de movimiento con tres niveles de resorte (directo 0,22 s sin rebote, con peso 0,35 s rebote 0,2, datos 0,45 s) elegidos a ciegas por el autor y ajustados tras dos críticas. Son valores provisionales: salen de una persona, sin táctil.
- **Kit de 24 componentes React** (Motion, Radix, Tailwind v4) en `plugins/pignolo/skills/ui/kit/`, con tokens, paleta de gráficos, proveedor de movimiento y `CHECKLIST.md`. Incluye selector de fecha, de mes y de rango, campo de texto con etiqueta interna, desplegable sin bloqueo de scroll, hoja inferior, avisos con deshacer, reordenar con alternativa de teclado y cifras que ruedan.
- **Guía de stacks** (`references/stacks.md`) para Astro, Flutter, SwiftUI, Compose, React Native, Vue y Svelte. Flutter y Astro se probaron con código real; el resto sale de la documentación y no se ejecutó. La duración de Motion `visualDuration` por 1,2 es la duración de SwiftUI y Flutter.
- **Arnés de interfaz** en `tests/evals/harness/` (tarea `ui`, capturas, medidas en navegador con hover y foco forzados, paquete ciego, página de voto) y un armador de brazos (`tests/evals/ui-arms.mjs`, con el brazo `U3K` = flujo completo con kit).
- **Verificación al cierre de la etapa:** `npm test` 1167 de 1167; 52 de 52 comprobaciones del kit en navegador real (26 rutas, normales y con movimiento reducido), hechas en un proyecto de prueba que vive fuera del repo (`pignolo-eval (carpeta de trabajo fuera del repo)\kit-sandbox`, ver P2-48). El autor probó el kit a mano el 2026-10-25 y lo validó.
- **Paquete de traspaso** para otro agente en `pignolo-eval (carpeta de trabajo fuera del repo)\kit-handoff\` (se regenera con `node make-handoff.cjs`), con instrucciones para incorporar el kit a una app existente.
- Piloto de interfaz (3 pantallas, brazos sin plugin, 1.0.0 y flujo nuevo, voto a ciego del autor): el flujo nuevo quedó primero en 2 de 3 pantallas y pidió menos cambios (media 2,3 contra 3,7 sin plugin y 3,3 con la 1.0.0); perdió en el Simulador. Son indicios con una repetición por celda.
- Dos críticas independientes del kit (accesibilidad y diseño): registro en `docs/research/2026-10-25-critica-kit-ui.md`. Se arreglaron los hallazgos de confianza alta y las decisiones del autor; el resto está anotado en `docs/gaps.md` (P2-39 a P2-49).
- README con el banner y los gráficos de la medición (`node tests/evals/readme-charts.mjs` los regenera).
- Registros: `docs/sessions/2026-10-24.md` y `docs/sessions/2026-10-25.md`.

## Qué falta

- **Ronda 2 de pantallas hecha (2026-10-26, `tests/evals/RESULTS-ui-flujo-ronda2.md`): el flujo no superó a no usar plugin** (sin plugin primero en las 2 de validación; U3K tercero y cuarto) y el kit no se usó (repo en blanco, HTML estático). Decisión del autor el 2026-10-26: publicar el kit y el recordatorio de sesión y dejar el flujo pausado hasta iterarlo.
- **Recordatorio de sesión** (hook `SessionStart`, skills encadenadas, `work` hasta 920 palabras): probado en una sesión real de `claude -p`, efecto no medido en un entorno con cientos de skills (P2-50).
- **Iterar el flujo de pantallas** con un conjunto de desarrollo nuevo (P2-52) y **medir el kit en un proyecto React** (P2-51). Para reactivar el flujo: `docs/ui-flujo-pausado/README.md`.
- P2-48: mover las pruebas y las páginas del kit al repositorio (`tests/kit-sandbox/`), para poder repetir lo verificado.
- P2-49: `DateValue.month` va de 0 a 11 y el valor del formulario de 1 a 12; evaluar pasar la API a 1 a 12.
- Pendientes de confianza media: validar los niveles de movimiento con unas 5 personas, lector de pantalla real, Firefox y Safari, arrastre táctil, y los componentes que faltan (tabla de datos y validación de formularios primero). Ver P2-39 a P2-47.
- Corregir en el README que `legacy` ya no es una etiqueta local, y decidir si la etiqueta `v1.0.0` (en `d77fc5b`) se mueve.
- Los gaps abiertos de `docs/gaps.md` de la medición anterior: P2-33 (diffs de `work`), P2-34 (estudios en el techo), P2-35 (panel de jueces sin correr), P2-36 (detector `escaped_cwd` laxo) y P2-37 (activación espontánea sin medir).
- Confirmar en una ejecución real la sustitución de `${CLAUDE_PLUGIN_ROOT}` y `${CLAUDE_PLUGIN_DATA}` (P2-21).

## Necesita al autor

- Decidir si se arma la ronda 3 con proyecto React para medir el kit (P2-51) y cuándo se itera el flujo (P2-52).
- Probar el paquete de traspaso en su app real con su propio agente y pasar lo que encuentre.
- Limpiar `pignolo-eval (carpeta de trabajo fuera del repo)`: guarda datos privados de calificación y decenas de carpetas y archivos de trabajo (copias del proyecto de prueba, parches, registros). Borrar solo con su confirmación.
- Decidir qué hacer con `D:\pignolo\local\pignolo-*`, y borrar o archivar los scripts históricos que apuntan a código borrado (gaps P2-8).

## Decisiones ya tomadas

Están en el diseño, §8: reemplazo de superpowers sin guardia, un solo plugin, `ui-audit` solo a pedido, opciones de interfaz en HTML local. Del 2026-10-25, del autor: medir al cierre de etapas grandes y arreglar solo lo de confianza alta, rebote 0 en controles, desplegable corto sin retraso por ítem, campo de texto con la etiqueta adentro que sube y agranda el campo, sin elevación al pasar el mouse, formato del kit en React con Motion y Radix. Las de la comparación, en la ficha y en el registro del día.

## Ramas viejas

Quedan como ramas, sin unir: `core/ceremonia-segun-riesgo`, `core/guard-sin-confirmar-push`, `core/guardia-tropiezos-1` y `-2`, `bench/revision-prep` y las demás de `ab/` y `bench/`. Son del plugin anterior.

## Dónde mirar

- Diseño: `docs/specs/2026-10-23-pignolo-2-design.md`; diseño del flujo de interfaz: `docs/specs/2026-10-24-ui-flujo-design.md` (la sección 12 manda sobre las anteriores).
- Plan: `docs/plans/2026-10-23-pignolo-2.md`.
- Ficha y resultados de la comparación: `tests/evals/RESULTS-comparacion-3-brazos.md`, `RESULTS-estudio-a-trabajo.md`, `RESULTS-estudio-b-revision.md`; resumen en `docs/benchmarks.md`.
- Investigación de interfaz: `docs/research/2026-10-24-ui-ux-con-agentes.md` y `2026-10-25-critica-kit-ui.md`.
- Gaps abiertos: `docs/gaps.md`, sección "Pignolo 2 (1.0.0)".
- El registro de la ejecución del plan (`.superpowers/sdd/`) no está en git.
