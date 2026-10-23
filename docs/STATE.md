# Estado de pignolo

Actualizado: 2026-10-23. Rama de trabajo: `pignolo-2` (sin push). Producto: Pignolo 2, plugin `pignolo` 1.0.0.

## Qué está hecho

- Un solo plugin `plugins/pignolo` con seis skills (`start`, `work`, `validate`, `session`, `ui`, `ui-audit`) y ocho agentes (`review-security`, `review-database`, `review-code`, `review-tests`, `review-hygiene`, `review-docs`, `ui-option`, `ui-auditor`).
- El código aislado de la auditoría de interfaz está en `plugins/pignolo/ui-audit/`; `plugins/pignolo-ui` y `plugins/pignolo-panel` se retiraron.
- Tareas T1 a T8 del plan hechas (T8: CHANGELOG, README, CLAUDE.md, SECURITY, este estado, gaps; incluye su ronda de arreglos).
- T9 (revisión final de la rama) hecha y su pasada de arreglos aplicada (F1 a F15, ver `docs/gaps.md`).
- T10 hecha (commit 3e25531): el kit de medición contra superpowers está escrito (ficha `tests/evals/RESULTS-pignolo2.md`, repos de juguete en `tests/evals/fixtures/`, `tests/evals/compare-fronts.js`) y sin correr.
- El plugin anterior está en la etiqueta local `legacy`; el estado anterior, en `docs/history/2026-10-23-estado-pignolo-0x.md`.

## Qué falta

- Correr la medición contra superpowers (diseño §9) con el kit de T10: necesita el OK del autor para el gasto, la tarea mediana y las tareas chicas que elige él.
- Verificar la carga real del plugin en Claude Code (descubrimiento de skills y agentes, sustitución de `${CLAUDE_PLUGIN_ROOT}`): hoy solo lo prueban los tests de archivos.
- Los gaps que siguen abiertos en `docs/gaps.md`, sección "Pignolo 2 (1.0.0)".

## Necesita al autor

- Desinstalar de su propia máquina los plugins viejos `pignolo-ui` y `pignolo-panel`, y tener en cuenta que su skill personal `document-session` tiene disparadores casi idénticos a los de `session`: con las dos activas pueden competir por el mismo pedido.

- Aprobar el gasto de la medición antes de correrla.
- Decidir cuándo se publica la 1.0.0 (después de la medición).
- El push de la rama `pignolo-2` y de la etiqueta `legacy`.
- El merge a `main`.
- Borrar o archivar los scripts históricos que apuntan a código borrado (gaps P2-8).

## Decisiones ya tomadas

Están en el diseño, §8: reemplazo de superpowers sin guardia, un solo plugin, `ui-audit` solo a pedido, opciones de interfaz en HTML local, y las que marcó el agente (frentes de `validate`, base del diff, piso de riesgo).

## Ramas viejas

Quedan como ramas, sin unir: `core/ceremonia-segun-riesgo`, `core/guard-sin-confirmar-push`, `core/guardia-tropiezos-1` y `-2`, `bench/revision-prep` y las demás de `ab/` y `bench/`. Son del plugin anterior.

## Dónde mirar

- Diseño: `docs/specs/2026-10-23-pignolo-2-design.md`.
- Plan: `docs/plans/2026-10-23-pignolo-2.md`.
- Gaps abiertos: `docs/gaps.md`, sección "Pignolo 2 (1.0.0)".
- El registro de la ejecución del plan (`.superpowers/sdd/`) no está en git.
