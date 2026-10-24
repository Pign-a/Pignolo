# Estado de pignolo

Actualizado: 2026-10-24. Producto: Pignolo 2, plugin `pignolo` 1.0.0, **publicado** en `Pign-a/Pignolo` (`main` y etiqueta `v1.0.0`; la etiqueta `legacy` guarda el plugin anterior). Rama de trabajo: `pignolo-2`, igual a `main`.

## Qué está hecho

- Un solo plugin `plugins/pignolo` con seis skills (`start`, `work`, `validate`, `session`, `ui`, `ui-audit`) y ocho agentes; el código de la auditoría de interfaz vive en `plugins/pignolo/ui-audit/`.
- Plan de 10 tareas ejecutado y revisado; la medición contra superpowers y contra no usar plugin está hecha (diseño §9).
- Comparación de tres brazos preinscrita y congelada (`tests/evals/RESULTS-comparacion-3-brazos.md`, hash del congelado `e5f364110627`):
  - Estudio A (`work` forzado, 16 tareas): cuesta lo mismo que sin plugin (razón 1,055, no inferior al margen de 1,5) y un 25 % menos que superpowers; aceptación 47 de 48. Registro: `tests/evals/RESULTS-estudio-a-trabajo.md`.
  - Estudio B (revisión, 10 ítems con 20 defectos sembrados): 19/20 en Pignolo, superpowers y sin plugin, 17/20 en `/code-review`; costo por corrida de 0,14 a 0,42 USD. Registro: `tests/evals/RESULTS-estudio-b-revision.md`.
  - Ningún estudio demostró una mejora de calidad: ambos están en el techo. `work` hace diffs y toca archivos fuera de alcance más que sin plugin.
- Limpieza del plugin viejo en la máquina del autor hecha el 2026-10-24 (`pignolo-ui`, estado global, restos en proyectos); la skill personal `document-session`, que tenía disparadores casi idénticos a los de `session`, quedó archivada.
- README con el banner y los gráficos de la medición (`node tests/evals/readme-charts.mjs` los regenera).
- Registro del día: `docs/sessions/2026-10-24.md`.

## Qué falta

- Los gaps abiertos de `docs/gaps.md`, sección "Pignolo 2 (1.0.0)", en especial P2-33 (diffs de `work`), P2-34 (estudios en el techo), P2-35 (panel de jueces sin correr), P2-36 (detector `escaped_cwd` laxo) y P2-37 (activación espontánea sin medir).
- Confirmar en una ejecución real la sustitución de `${CLAUDE_PLUGIN_ROOT}` y `${CLAUDE_PLUGIN_DATA}` (P2-21); la carga de skills y agentes ya se vio al instalar 1.0.0.
- Corregir en el README que `legacy` ya no es una etiqueta local.

## Necesita al autor

- Elegir el siguiente paso: acotar `work` y volver a medir (P2-33, la recomendada), medir la activación espontánea (P2-37) o no gastar más. Quedan unos 30,8 USD del tope de 100 USD y cualquier tanda nueva necesita su OK.
- Borrar `C:\Users\pigna\pignolo-eval` (≈970 MB, con los datos privados de calificación) cuando ya no hagan falta, y decidir qué hacer con `D:\pignolo\local\pignolo-*`.
- Borrar o archivar los scripts históricos que apuntan a código borrado (gaps P2-8).

## Decisiones ya tomadas

Están en el diseño, §8: reemplazo de superpowers sin guardia, un solo plugin, `ui-audit` solo a pedido, opciones de interfaz en HTML local, y las que marcó el agente (frentes de `validate`, base de datos y otras). Las de la comparación, en la ficha y en el registro del día.

## Ramas viejas

Quedan como ramas, sin unir: `core/ceremonia-segun-riesgo`, `core/guard-sin-confirmar-push`, `core/guardia-tropiezos-1` y `-2`, `bench/revision-prep` y las demás de `ab/` y `bench/`. Son del plugin anterior.

## Dónde mirar

- Diseño: `docs/specs/2026-10-23-pignolo-2-design.md`.
- Plan: `docs/plans/2026-10-23-pignolo-2.md`.
- Ficha y resultados de la comparación: `tests/evals/RESULTS-comparacion-3-brazos.md`, `RESULTS-estudio-a-trabajo.md`, `RESULTS-estudio-b-revision.md`; resumen en `docs/benchmarks.md`.
- Gaps abiertos: `docs/gaps.md`, sección "Pignolo 2 (1.0.0)".
- El registro de la ejecución del plan (`.superpowers/sdd/`) no está en git.
