# Estado de pignolo

_Última actualización: 2026-10-01, tarde._ Leer esto primero al retomar. Es corto a propósito: el estado vigente y punteros. Las decisiones y su detalle viven en los planes, auditorías y RESULTS (tabla de abajo). El estado anterior, completo, está en `docs/history/2026-10-01-estado-hasta-hoy.md`.

## Qué hay en `main`

Versiones leídas de los `plugin.json`.

- **Núcleo `pignolo` 0.12.1:** hitos 1 a 6, 8a y 8b. Guardia y respaldos (1), agentes, perfiles y `setup` (2), carriles, compuertas y revisión (3), tests, sabotaje y holdout (4), modo plan (5), continuidad (6), `/pignolo:init` (8a), evals del `debugger` y contrato con el banco (8b). Más las **reglas del brainstorming** en el paso 2 de la skill `plan` (sin skill nueva), `plan.js decision add`, el `spec-reviewer` con las decisiones del autor como segunda fuente y `CREDITS.md`. El agente `learning-validator` se borró.
- **`pignolo-ui` 0.7.2:** hitos 1 a 4 (flujos `new`, `improve`, `audit`), `ui-option` con reglas de oficio y modelo por perfil, **etapa 1 del lienzo "Design"** (conversor a artboards, índice, publicación con filtro de datos, clave `publish`, respaldo a HTML local) y el auditor con la gravedad de juicio acotada.
- Suite completa: 2948 en verde con la máquina tranquila; bajo carga fallan entre 1 y 30 tests de tiempo que pasan corridos solos (G8).

## En curso (cada uno en su rama, sin unir)

| Rama | Qué es | Estado |
|---|---|---|
| `core/hito-7a` | Hito 7a: ramas, worktrees por tarea, cola de integración, limpieza, `next` y `plan.js list` (0.13.0) | construido (dos ejecutores; el primero se cortó por límite); **revisión final opus en curso** |
| `core/hito-8d` | Hito 8d: estructura de carpetas (mapa `places`, esqueleto con README, adaptar un proyecto existente, mover seguro con deshacer) (0.13.0) | construido; **revisión final opus en curso**; al unir el segundo de los dos se renumera a 0.14.0 |
| `ui/option-candidata` | pignolo-ui 0.7.3: carta candidata de `ui-option` adoptada y datos de muestra rotulados en vez de marcadores | en construcción (sonnet) |
| `plan/ui-impeccable` | Planes 4e ampliado, 4f (contexto de producto) y 4g (opciones de un elemento) | en escritura (sonnet) |

Antes de retomar una rama, mirar su último commit y el informe por tarea en `docs/reports/` (los del 7a y de la etapa 1 del lienzo pueden seguir solo en el scratch de la sesión).

## Qué sigue, en orden

**Núcleo:** revisión y arreglos del 7a y del 8d → unir de a uno → 7b (skills `execute-plan` y `cleanup`, evals del integrador, medición del mecanismo de worktrees) → 8c (dos tareas que dependen del 7) → deuda técnica (un hook por evento, fusionar los dos jueces, `pignolo-launcher` que niega lecturas, G32).

**pignolo-ui:** unir 0.7.3 → **puerta manual con el autor** (publicación real de prueba: clases CSS, `@media`, fuentes, páginas; si las clases fallan se le consulta con el resultado) → 4f (`PRODUCT.md`, `brief.md`, pasada de veredicto) → etapas 2, 3 y 4 del lienzo (lienzo por proyecto y comentarios; Design System; modo explorar a ciegas) → 4g (opciones de un elemento dentro del sistema) → 4e (oficio y chequeos; la parte del auditor puede ir antes).

**Después:** usar pignolo en una sesión real y correr los checklists manuales; repetir las evals del `spec-reviewer` (cambió su contrato); revisión de la v1 por el autor; banco final.

## Reglas vigentes del autor

- Implementación y planes en sonnet; revisiones y auditorías en opus. No se usa Fable.
- Método liviano: planes en tarjetas, un ejecutor en serie por plan, una revisión opus por hito con una pasada de arreglos; planes de riesgo con auditoría previa en dos pasos. En el desarrollo de pignolo corren a la vez planes que no comparten archivos.
- **Todo benchmark, A/B o eval se documenta en el momento** en `tests/evals/RESULTS-*.md` y `docs/benchmarks.md`, con costo, velocidad y calidad.
- Las decisiones de diseño con alternativas se miden (A/B) antes de decidir; si no se puede medir: convención, pros y contras y un atacante por alternativa. Las decisiones grandes pasan por un debate de dos agentes opus.
- Banco final de ~62 USD: corre **solo con el OK explícito del autor**, tras revisar la v1.
- Sin planes en paralelo en el producto (un plan activo, en serie).
- Las compuertas fallan cerradas; las reglas nuevas de la guardia solo miran **ejecutar** un script desde un subagente, nunca leerlo; no se invierte más en PowerShell.
- El repo es público: sin datos privados, sin rutas del usuario, sin links de artifacts privados.
- Decisiones reservadas al autor (CLAUDE.md): identidad y alcance, costos, dependencias, push, publicar, borrar, cambiar un contrato, temas legales. Borrar algo siempre con su confirmación.

## Decisiones del 2026-10-01 (resumen; el detalle está en los archivos de la tabla)

- **Auditoría de buenas prácticas:** 8a adelantado; sin multi-plan ni informes con compuertas; sin `learning-validator` ni migración de la auto-memoria; banco a ~62 USD.
- **Brainstorming:** sin skill nueva; el paso actual más las reglas que funcionaron en el A/B (recomendada primero, no preguntar lo que está en el repo, lote de supuestos de bajo riesgo, un "Ok" no confirma supuestos, una decisión vieja no es un hecho, topes 3/6/10 y salida "suficiente").
- **Lienzo "Design" (pignolo-ui):** pantallas en el lienzo siempre que la cuenta tenga el tipo; colores y fuentes en HTML local; un lienzo por proyecto; aviso de una línea en vez de consentimiento, con clave `publish` para apagarlo; comentarios leídos solo a pedido; `DESIGN.md` publicado como Design System y republicado al cambiar; fuentes de Google solo en el lienzo; configuración de presentación ilegible = no publicar; el filtro de datos falla cerrado siempre; cuatro etapas.
- **`ui-option`:** opus solo en perfil `max`; carta candidata adoptada (reglas de oficio inspiradas en impeccable, las skills de Emil Kowalski y la guía de Apple, con texto propio); **datos de muestra completos y rotulados** en vez de marcadores sueltos.
- **`ui-auditor`:** un hallazgo de juicio sin evidencia de script o medición es a lo sumo `medio`; después, cada criterio dice cuándo aplica y hay un tope de 3 por pantalla (4e).
- **Modo explorar:** opción dentro de `improve`, 3 opciones por defecto, agentes ciegos al sistema y a la pantalla actual, rotuladas "fuera del sistema", nunca se aplican sin un cambio de `DESIGN.md` aprobado. Además, opciones de un elemento dentro del sistema (4g).
- **De impeccable (segunda pasada):** los cinco completos: `PRODUCT.md` y brief guardado, prueba de estrés por script, opciones de un elemento, capturas válidas y veredicto acotado, controles que desaparecen en celular y registro por pantalla. Sin hooks, sin modo `live`, sin listas de gusto como ley.
- **Estructura de carpetas (8d):** esqueleto siempre para lo que no es código, con README por carpeta; en un proyecto existente valida y propone adaptar, el usuario elige por ítem; mover sin romper (referencias, deshacer); archivos mal ubicados: avisa y ofrece moverlos; `local/` privada; el mapa vive en `project.md`.
- **Evals:** calificadores aflojados por decisión del autor en `spec-reviewer-clean` y en las páginas limpias del auditor; el resultado del `debugger` (9/15 por calificadores estrictos) se dejó como está.

## Decisión → dónde está escrita

| Decisiones sobre | Dónde |
|---|---|
| Producto, alcance y diseño del núcleo | `docs/specs/2026-09-26-pignolo-v1-design.md` y su scope-card |
| Diseño de pignolo-ui | `docs/specs/2026-09-28-pignolo-ui-v1-design.md` |
| Auditoría de buenas prácticas y debate (R1 a R10) | `docs/audits/2026-10-01-decisiones-auditoria.md`, `docs/audits/2026-10-01-auditoria-buenas-practicas.md` |
| Hitos del núcleo (D-3b a D-8-x, D-8d-x) | sección "Decisiones" de cada plan en `docs/plans/` |
| Borrar ramas unidas (D-7-7) | `docs/research/2026-10-01-borrar-ramas-unidas.md` |
| Estructura de carpetas | `docs/plans/2026-10-01-hito-8d-estructura-de-carpetas.md`, `docs/research/2026-10-01-estructura-de-carpetas.md` |
| Lienzo, Design System, modo explorar (D-4c-x) | `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`, `docs/research/2026-10-01-lienzo-design.md` |
| Oficio y chequeos, impeccable (D-4e, D-UX, D-IM) | `docs/plans/2026-10-01-pignolo-ui-hito-4e-oficio-y-chequeos.md`, `docs/research/2026-10-01-skills-de-diseno.md`; planes 4f y 4g en la rama `plan/ui-impeccable` |
| Banco final (D-B-1) | `docs/plans/2026-10-01-bench-pignolo-vs-base.md` |
| Método liviano, serie contra paralelo | `CLAUDE.md`, `tests/evals/RESULTS-ejecucion.md` |
| Validar planes | `tests/evals/RESULTS-planes.md` |
| Brainstorming | `tests/evals/RESULTS-brainstorm.md` |
| Lienzo contra HTML, modelo y carta de `ui-option`, `PRODUCT.md`, datos de muestra | `tests/evals/RESULTS-lienzo.md` |
| Evals de agentes | `tests/evals/RESULTS-hito-3.md`, `-hito-4.md`, `-hito-5.md`, `-hito-8.md`; `plugins/pignolo-ui/tests/evals/RESULTS-ui-hito-4.md` |
| Costos por tipo de trabajo y todas las mediciones | `docs/benchmarks.md` |

## Pendiente del autor

- **Prueba real del lienzo** (puerta manual): el agente publica una pantalla de prueba en el lienzo privado y el autor la mira.
- Nombrar una app y su URL para la prueba real de pignolo-ui (D-4-4).
- Actualizar el plugin instalado (0.2.1) desde la terminal local y correr `/pignolo:init` y los checklists de `tests/manual/`.
- R4 (recomendar WSL2 con sandbox) y R8 (A/B de 2 lentes contra 4, 5 a 10 USD): sin decidir.
- `files restore --delete-list` de pignolo-ui (cambia un contrato del hito 3): sin decidir.
- En su galería de claude.ai quedan lienzos privados de prueba: los borra cuando quiera.

## Punteros

- Specs: `docs/specs/`. Planes: `docs/plans/`. Auditorías: `docs/audits/`. Investigaciones: `docs/research/`.
- Mediciones: `docs/benchmarks.md` y `tests/evals/RESULTS*.md`. Mejoras detectadas: `docs/gaps.md`.
- Informes por tarea: `docs/reports/`. Checklists manuales: `tests/manual/`.
- Historia: `docs/history/`. `local/` está fuera de git.
- Versiones y cambios: `CHANGELOG.md` y `plugins/pignolo-ui/CHANGELOG.md`.
