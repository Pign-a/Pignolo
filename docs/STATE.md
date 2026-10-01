# Estado de pignolo

_Última actualización: 2026-10-01._ Leer esto primero al retomar. Es corto a propósito: el estado vigente y punteros. Las decisiones y su detalle viven en los planes, auditorías y RESULTS (tabla de abajo), no acá. El estado anterior, completo y sin editar, está en `docs/history/2026-10-01-estado-hasta-hoy.md` (historia; no se vuelve a tocar).

## Qué hay en `main`

Versiones leídas de los `plugin.json`.

- **Núcleo `pignolo` 0.11.1:** hitos 1 a 6 y 8a. Guardia y respaldos (1), agentes, perfiles y `setup` (2), carriles, compuertas y revisión (3), tests, sabotaje y holdout (4), modo plan (5), continuidad (6) y `/pignolo:init` (8a). El `learning-validator` se borró por decisión del autor.
- **`pignolo-ui` 0.6.2:** hitos 1 a 4 (reglas y formato, catálogo con SEO estático, navegador, flujos `new`, `improve`, `audit`), más `ui-option` con reglas de oficio y modelo por perfil.
- Documentos de diseño, planes de los hitos 7 y 8 y todos los A/B medidos ya están en `main`.

## En curso (cada uno en su rama, sin unir)

| Rama | Qué es | Estado |
|---|---|---|
| `core/hito-7a` | Hito 7 recortado (ramas y worktrees, sin planes en paralelo) | ejecutando |
| `core/hito-8b` | Hito 8b: evals del `debugger` y contrato con el arnés (0.12.1) | construido; evals pagas corridas (2,77 USD de 8): 9/15 por los graders, las 6 reprobadas son falsos rechazos (G33); falta que el autor decida relajar los graders y recalibrar, y la revisión final opus |
| `core/brainstorm-rules` | Reglas de brainstorming del núcleo (tras el A/B de `docs/benchmarks.md` 2f) | en curso |
| `plan/ui-hito-4c` | Plan del lienzo "Design" y el Design System de pignolo-ui | partiéndolo en 4 etapas; la etapa 1 es la siguiente |
| `evals/ui-4` | Evals pagas de pignolo-ui hito 4 (tope 22 USD) | corriendo |

Antes de retomar una rama, mirar su último commit y el informe por tarea en `docs/reports/`.

## Qué sigue, en orden

1. Terminar y unir el hito 7a y el 8b (revisión final opus, una pasada de arreglos, unión de a uno a `main`).
2. Cerrar el plan 4c por etapas, auditar y ejecutar la etapa 1; después las demás.
3. Hito 8c; evals pendientes (`ui-option` tope 3, `debugger` tope 8).
4. Revisión de la v1 por el autor.
5. Banco final (ver reglas).

## Reglas vigentes del autor

- Implementación y planes en sonnet; revisiones y auditorías en opus. No se usa Fable.
- Método liviano: planes en tarjetas, un ejecutor en serie, una revisión opus por hito, uno o dos frentes a la vez.
- Todo benchmark o A/B se documenta en `docs/benchmarks.md`, con costo, velocidad y calidad.
- Banco final de ~62 USD: corre solo con el OK explícito del autor, tras revisar la v1.
- Sin planes en paralelo en el producto (no hay multi-plan).
- pignolo-ui: el lienzo "Design" vuelve a la v1 para las pantallas; un lienzo por proyecto; aviso de una línea en vez de pedir consentimiento.
- `ui-option` en opus solo en el perfil `max`; sonnet en el resto.
- Decisiones reservadas al autor (CLAUDE.md): identidad y alcance, costos, dependencias, push, publicar, borrar, cambiar un contrato, temas legales.

## Decisión → dónde está escrita

No se repiten acá; abrir el archivo.

| Decisiones sobre | Dónde |
|---|---|
| Producto, alcance y diseño del núcleo | `docs/specs/2026-09-26-pignolo-v1-design.md`, `docs/specs/2026-09-26-pignolo-v1-scope-card.md` |
| Diseño de pignolo-ui | `docs/specs/2026-09-28-pignolo-ui-v1-design.md` |
| Cambios tras la auditoría de buenas prácticas (R1 a R10: 8a adelantado, sin multi-plan, guardia congelada, sin `learning-validator`, banco ~62 USD) | `docs/audits/2026-10-01-decisiones-auditoria.md`, `docs/audits/2026-10-01-auditoria-buenas-practicas.md` |
| Guardia, sombra, modelo de amenaza (decisiones del 2026-09-27) | `docs/research/2026-09-27-seguridad-agentes-*.md`, spec núcleo §11.6 |
| Hitos 1 a 6 del núcleo (D-3b, D-4, D-5, D-6) | secciones "Decisiones" de cada plan en `docs/plans/` |
| Hito 7 (D-7-x) | `docs/plans/2026-09-30-hito-7-ramas-y-paralelismo.md`; borrar ramas: `docs/research/2026-10-01-borrar-ramas-unidas.md` |
| Hito 8 (D-8-x) y banco (D-B-1) | `docs/plans/2026-10-01-hito-8-init-y-adopcion.md`, `docs/plans/2026-10-01-bench-pignolo-vs-base.md` |
| pignolo-ui hitos 1 a 4 (D-3-x, D-4-x, R10) | `docs/plans/*pignolo-ui-hito-*.md` |
| Lienzo "Design" y Design System | rama `plan/ui-hito-4c`; medición en `tests/evals/RESULTS-lienzo.md` |
| Método liviano, serie contra paralelo | `CLAUDE.md`, `tests/evals/RESULTS-ejecucion.md` |
| Validar planes, modelo de revisión | `tests/evals/RESULTS-planes.md`, `tests/evals/RESULTS.md` |
| Brainstorm antes del spec | `tests/evals/RESULTS-brainstorm.md` |
| Evals de agentes por hito | `tests/evals/RESULTS-hito-3.md`, `-hito-4.md`, `-hito-5.md`, `-hito-8.md` (debugger) |
| Decisiones anteriores a hoy | `docs/history/2026-10-01-estado-hasta-hoy.md` |

## Pendiente del autor

- Nombrar una app y su URL para la prueba real de pignolo-ui (D-4-4).
- Actualizar el plugin instalado (0.2.1) desde la terminal local, para probar la versión actual.
- R4: recomendar o no WSL2 con sandbox para los modos autónomos.
- R8: A/B de 2 lentes contra 4 en diffs reales (5 a 10 USD) antes de reducir el perfil de revisión.
- Después de `init`, correr `tests/manual/hito-8.md` en un proyecto real.

## Punteros

- Specs: `docs/specs/`. Planes: `docs/plans/`. Auditorías: `docs/audits/`. Investigaciones: `docs/research/`.
- Mediciones: `docs/benchmarks.md` y `tests/evals/RESULTS*.md`. Mejoras detectadas: `docs/gaps.md`.
- Informes por tarea: `docs/reports/`. Checklists manuales: `tests/manual/`.
- Historia: `docs/history/`. `local/` está fuera de git.
- Versiones y cambios: `CHANGELOG.md` y `plugins/pignolo-ui/CHANGELOG.md`.
