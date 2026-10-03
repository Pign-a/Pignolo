# Estado de pignolo

_Última actualización: 2026-10-02._ Leer esto primero al retomar. Es corto a propósito: el estado vigente y punteros. Las decisiones y su detalle viven en los planes, auditorías y RESULTS (tabla de abajo). El estado anterior, completo, está en `docs/history/2026-10-01-estado-hasta-hoy.md`.

## Estado al 2026-10-03 (manda sobre todo lo de abajo)

- **En `main` y en GitHub (`071892e`):** núcleo **0.15.0** (guardia sin confirmar push ni merge, `subagent-main` con R6; skills en lenguaje natural con confirmación por `AskUserQuestion`) y pignolo-ui **0.10.0** (4h definición inicial, etapa 2 del lienzo 0.8.0, 4i todo en el lienzo 0.9.0, lenguaje natural 0.10.0). Prueba de activación: `tests/evals/RESULTS-activacion.md`.
- **Ramas sin unir:** `core/init-rapido` (falta revisión opus; su versión 0.15.0 choca y pasa a la siguiente libre), `ui/hito-4e-chequeos` (falta revisión opus), `plan/guardia-sin-tropiezos` (falta auditoría previa).
- **Panel (rama `feat/panel`, sobre el plan `docs/plans/2026-10-03-panel-de-pignolo.md`):** ejecutado en serie (T1 a T7), falta la revisión opus (`prompt.submit` y `UserPromptSubmit` van con revisión propia), una pasada de arreglos, la suite completa una vez y unir. Núcleo **0.18.0** y plugin `pignolo-panel` **0.1.0**; si cambia el orden de unión de las ramas de la guardia (0.16.x y 0.17.0), solo se renumera 0.18.0.
- **Panel, etapa 2 (rama `feat/panel-ui`, plan `docs/plans/2026-10-03-panel-pestana-ui.md`):** pestaña **UI** con recomendaciones de haiku al abrirla (`pignolo-panel` **0.2.0**, sobre `main` con el panel 0.1.0). Ejecutada en serie (T1 a T5, informe del ejecutor fuera del repo); falta la revisión opus propia (`prompt.submit` y datos al modelo), una pasada de arreglos, la suite completa una vez y unir. La ficha de medición (`tests/evals/RESULTS-panel-ui.md`) está escrita y **no se corrió** (necesita el OK del autor para el gasto). Hallazgos del Task 0 (sondas reales): `$` no cruza imports (las funciones con `$` viven en `register.js`), `settings.read` devuelve el objeto sin envoltorio, `session.usage().cost` no cambia con `model.complete`. Gaps G89 a G92.
- **Prototipo fuera de git (ya llevado al repo como `plugins/pignolo-panel/`):** `local/pignolo-panel/`, mod de Claude Code (≥ 2.1.287) con banda, panel `/pignolo-panel` (agentes, plan, costo) y fila del agente; validado y con 10 tests; falta que el autor lo vea en su terminal.
- **Propuesto, sin OK del autor:** mensajes de la guardia en lenguaje llano para el usuario (`deny` en JSON con `systemMessage` corto y el detalle técnico solo para Claude).
- **Decisiones abiertas del autor:** clave `brief` en el núcleo; si `entry` deriva la UI antes o después del piso de riesgo (gap de P-1); `test-paths` por defecto; G44.

## Estado al 2026-10-02

- **En `main`:** núcleo **0.14.0** (hitos 1 a 6, 7a, 8a, 8b y 8d) y pignolo-ui **0.7.5** (0.7.3 datos de muestra rotulados, 0.7.4 auditor con "cuándo aplica", tope de 3 y línea `keep`, 0.7.5 `PRODUCT.md`, brief sellado y pase de veredicto).
- **Ramas sin unir:** `ui/hito-4e-chequeos` (olas 2 a 4 de 4e, construidas, falta su revisión opus) y `exp/lienzo2-x` / `exp/lienzo2-y` (los dos brazos del experimento de relevo, etapa 2 del lienzo; ficha en `tests/evals/RESULTS-relevo.md`; se une el que salga mejor).
- **Método vigente:** `liviano-v2` (ver `CLAUDE.md`) y pruebas con `docs/protocolo-de-pruebas.md`. Cada fase que cierra suma su fila a `docs/ejecuciones.csv`.
- **Sigue:** revisión y unión de las olas 2 a 4 de 4e → resultado del experimento y unión de la etapa 2 del lienzo → etapas 3 y 4 → 4g → olas 5 y 6 de 4e. Núcleo: 7b → 8c → deuda técnica.
- **Decisiones abiertas del autor:** si el núcleo aprende la clave `brief` de las aprobaciones de pignolo-ui (hay un test pendiente que lo marca); los cinco patrones nuevos de `test-paths` por defecto (ya unidos; se revierten con el commit `9d6f84f`); G44 (un proyecto `code-untested` no puede integrar por la cola una tarea sin tests).
- **Sin pruebas del autor hasta cerrar la v1:** las puertas manuales del lienzo (T6, T6b, T6c) no se hacen; pasan a su revisión de la v1.

## Qué hay en `main`

- **HITO 7a CONSTRUIDO en `core/hito-7a`** (2026-10-01, núcleo **0.13.0** porque `main` ya trae 0.12.0 y 0.12.1 del brainstorming; sin unir a `main`, sin push; plan `docs/plans/2026-09-30-hito-7-ramas-y-paralelismo.md`, Tasks 1 a 11 y 16, un solo ejecutor serial). `run.json` v2 con varias tareas (lock corto, tope por perfil, `task-end`), `lib/branches.js`, `lib/worktrees.js` + `worktree.js` (mecanismo B hasta el A/B del 7b), `lib/waves.js` + `waves.js`, la cola (`lib/queue.js` + `queue.js`: `pre-merge` sellado con repetición D-7-3, `FLAKY` sellable no-PASS, avance por compare-and-swap, `revert`, lock), reglas `pignolo-queue`/`pignolo-worktree-tools`/`pignolo-protected-refs`, limpieza (`lib/branch-cleanup.js` + `cleanup.js`, aviso en `SessionStart`), `next` con la cola y `plan.js list`. Spec editado con los cambios aprobados (§3.2, §5.3, §6, §9.4, §10.1, §11.3, §11.5, §11.6). Informe por tarea fuera del repo (`h7a-report.md` del job).
  - **Falta (7b, con costo que decide el autor):** skills `execute-plan` y `cleanup`, edición de `plan`, carta del `integrator`, A/B medido del mecanismo de worktrees (D-7-1, `tests/manual/hito-7.md`) y evals `agents` (D-7-4, tope 5 USD). **Antes de empezar 7b:** verificar que el `PreToolUse` de Bash trae `agent_type` (si no, `pignolo-queue` niega al `integrator`).


Versiones leídas de los `plugin.json`.

- **Núcleo `pignolo` 0.13.1:** hitos 1 a 6, 8a, 8b y 8d (estructura de carpetas: mapa `places`, esqueleto, adaptar un proyecto existente, mover con deshacer). Guardia y respaldos (1), agentes, perfiles y `setup` (2), carriles, compuertas y revisión (3), tests, sabotaje y holdout (4), modo plan (5), continuidad (6), `/pignolo:init` (8a), evals del `debugger` y contrato con el banco (8b). Más las **reglas del brainstorming** en el paso 2 de la skill `plan` (sin skill nueva), `plan.js decision add`, el `spec-reviewer` con las decisiones del autor como segunda fuente y `CREDITS.md`. El agente `learning-validator` se borró.
- **`pignolo-ui` 0.7.2:** hitos 1 a 4 (flujos `new`, `improve`, `audit`), `ui-option` con reglas de oficio y modelo por perfil, **etapa 1 del lienzo "Design"** (conversor a artboards, índice, publicación con filtro de datos, clave `publish`, respaldo a HTML local) y el auditor con la gravedad de juicio acotada.
- Suite completa: 2948 en verde con la máquina tranquila; bajo carga fallan entre 1 y 30 tests de tiempo que pasan corridos solos (G8).

## En curso (cada uno en su rama, sin unir)

| Rama | Qué es | Estado |
|---|---|---|
| `core/hito-7a` | Hito 7a: ramas, worktrees por tarea, cola de integración, limpieza, `next` y `plan.js list` (0.13.0) | construido (dos ejecutores; el primero se cortó por límite); **revisión final opus en curso** |
| `ui/option-candidata` | pignolo-ui 0.7.3: carta candidata de `ui-option` adoptada y datos de muestra rotulados en vez de marcadores | en construcción (sonnet) |
| `exp/lienzo2-x` | pignolo-ui 0.8.0: etapa 2 del lienzo (un lienzo por proyecto, `merge` con el índice vivo sin pisar al usuario, límites, comentarios a pedido, alto real) | construido en serie (sonnet) sin la puerta T6b (decisión del autor); falta la revisión final opus y la unión (T11b) |

Antes de retomar una rama, mirar su último commit y el informe por tarea en `docs/reports/` (los del 7a y de la etapa 1 del lienzo pueden seguir solo en el scratch de la sesión).

## Qué sigue, en orden

**Núcleo:** revisión y arreglos del 7a y del 8d → unir de a uno → 7b (skills `execute-plan` y `cleanup`, evals del integrador, medición del mecanismo de worktrees) → 8c (dos tareas que dependen del 7) → deuda técnica (un hook por evento, fusionar los dos jueces, `pignolo-launcher` que niega lecturas, G32).

**pignolo-ui:** unir 0.7.3 → **puerta manual con el autor** (publicación real de prueba: clases CSS, `@media`, fuentes, páginas; si las clases fallan se le consulta con el resultado) → 4f (`PRODUCT.md`, `brief.md`, pasada de veredicto) → etapas 2, 3 y 4 del lienzo (lienzo por proyecto y comentarios; Design System; modo explorar a ciegas) → 4g (opciones de un elemento dentro del sistema) → 4e (oficio y chequeos; la parte del auditor puede ir antes).

**Después:** usar pignolo en una sesión real y correr los checklists manuales; repetir las evals del `spec-reviewer` (cambió su contrato); revisión de la v1 por el autor; banco final.

## Orden de ejecución de pignolo-ui (decidido 2026-10-01)

Planes: `docs/plans/2026-10-01-pignolo-ui-hito-4e-oficio-y-chequeos.md`, `...-4f-contexto-de-producto.md`, `...-4g-opciones-de-un-elemento.md` y el del lienzo (`...-4c-lienzo.md`). Un ejecutor en serie por hito; las versiones salen de este orden (si cambia el orden, solo cambian los números).

1. **Etapa 1 del lienzo** (hecha) y la **0.7.3** (carta candidata de `ui-option` y datos de muestra, la une el controlador).
2. **Puerta manual con el autor** (T6 de la etapa 1). Mientras dura, el ejecutor hace la **ola 1 de 4e** (auditor: tope de 3, "cuándo aplica", `keep`; 0.7.4 y eval E2): solo toca el auditor, así que no choca con lo que la puerta pueda cambiar.
3. **Hito 4f** (0.7.5): *por qué acá:* cambia `approve.mjs` y los textos de las tres skills una sola vez, antes de que las etapas 2 a 4 los sigan tocando (y sus tests de `save` pasan a llevar `--brief-file`).
4. **Etapa 2 del lienzo** (0.8.0), luego el **hito 4i** (0.9.0: todo en el lienzo y un brief corto; plan `docs/plans/2026-10-02-pignolo-ui-hito-4i-todo-en-el-lienzo.md`, entre la 0.8.0 y la etapa 3), 5. **etapa 3** (0.10.0) y 6. **etapa 4** (0.11.0), en ese orden (la 4 solo necesita la 1, pero va última del lienzo).
7. **Hito 4g** (0.12.0): *por qué después de la etapa 4:* reusa sus ids, su prefijo de carpetas y su comparación.
8. **Resto de 4e** (olas 2 a 6, 0.13.0): *por qué al final:* no depende del lienzo, el síntoma "sosa" necesita el modo explorar de la etapa 4 y sus reglas se miden mejor sobre la app real que el autor todavía no nombró (D-4-4). Es el único trabajo que puede abrirse en paralelo con las etapas 1 y 2 si hace falta ir más rápido (toca `lib/browser-*.mjs`, `lib/rules/` y `catalog/`); sus textos de skills esperan.

Mediciones aprobadas: tope de 14 USD para los hitos 4f y 4g (≈ 6,3 USD estimados) y ≈ 8,8 USD para el auditor de 4e. Datos de muestra rotulados y carta candidata: adoptados. Hooks fuera de la v1; la lista v1.x está en el plan 4e.

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
| Oficio y chequeos, impeccable (D-4e, D-UX, D-IM) | `docs/plans/2026-10-01-pignolo-ui-hito-4e-oficio-y-chequeos.md`, `docs/research/2026-10-01-skills-de-diseno.md`; planes 4f y 4g en `docs/plans/` |
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

## Decisión del 2026-10-01 (noche): todo pignolo-ui se implementa sin pruebas del autor

El autor no prueba nada hasta que la v1 esté terminada; después la prueba y da feedback. La **puerta manual del lienzo** (publicación real de prueba) deja de frenar: 4f, las etapas 2 a 4 del lienzo, 4g y 4e se ejecutan de corrido y la prueba real pasa a la revisión de la v1. Riesgo aceptado: si en el lienzo real fallan las clases CSS, el `@media` o las fuentes, el conversor y lo construido encima se corrigen después. En curso: rama `ui/hito-4e-chequeos` (olas 2 a 4 de 4e, en paralelo con el resto).

## Cierre de sesión del 2026-10-02 (madrugada): dónde quedó todo

Se frenaron todos los agentes porque el autor se quedaba sin cupo. Nada de lo de abajo está en `main` salvo que lo diga. **Retomar por acá.**

**En `main`:** núcleo 0.14.0, pignolo-ui 0.7.5, protocolo de pruebas, registro `docs/ejecuciones.csv`, fichas de los tres experimentos.

**Ramas listas o casi, por orden de cierre:**

| Rama | Qué es | Estado exacto | Falta |
|---|---|---|---|
| `exp/lienzo2-x` (`f19d341`) | Etapa 2 del lienzo, pignolo-ui 0.8.0 | ejecutada, revisada (2 críticos y 6 importantes) y arreglada; 1240 de 1242 tests de pignolo-ui | re-revisión acotada al arreglo (se cortó a mitad), unir `main`, suite completa, unir |
| `core/init-rapido` (`91816de`) | `init` y `setup` rápidos, repo en blanco, núcleo 0.15.0 | ejecutada; 328 tests de lo que toca | revisión opus (se cortó), arreglos, suite, unir |
| `core/guard-sin-confirmar-push` (`61dc844`) | La guardia no pregunta en push ni merge; regla `subagent-main`; núcleo 0.14.1 | revisada: 3 críticos y 5 importantes; los 57 tests del revisor ya están en la rama y **fallan**; el arreglo de R1 quedó **sin commitear** en el worktree de la sesión | pasada de arreglos (R1 a R5, R7, R8; R6 queda como gap), suite, unir |
| `ui/hito-4e-chequeos` (`5c02540`) | Olas 2 a 4 de 4e | ejecutada | revisión opus, arreglos, unir |
| `plan/guardia-sin-tropiezos` (`76f5d4c`) | Plan de 13 tarjetas y auditoría de reglas (núcleo 0.16.0) | plan escrito | auditoría previa opus (se cortó), partir en etapas, ejecutar |
| `bench/revision-prep` (`d4d3606`) | Scripts de las pruebas de revisión | lista | unir a `main` |
| `exp/lienzo2-y` (`f2166df`) | Brazo de relevo del experimento | ejecutada | no se une; queda como dato |

**Experimentos (fichas en `tests/evals/RESULTS-relevo.md`, `-lentes-reales.md`, `-momento-de-revision.md`):**

- **Ejecución (único contra relevo):** una corrida por brazo. Único: 7 tareas, 43 min, ≈ 7,7 M ponderado. Relevo: 7 tareas, 65 min, ≈ 6,75 M. La auditoría del diseño dice que con una corrida no se concluye; el protocolo recomendado (tramo final con repeticiones, más el brazo "un agente por tarea") **no se corrió**.
- **Lentes reales:** sonda paga hecha (1,07 USD por corrida; la etapa paga se canceló por costo). La etapa con suscripción (84 corridas) **se cortó a mitad**; se retoma con el mismo workflow, que reusa las corridas terminadas. Después: chequeo de fuga, extracción, calificación a ciegas, armado de brazos.
- **Momento de la revisión:** sin correr.

**Decisiones del autor de hoy:** la guardia frena solo lo realmente peligroso; sin confirmación en push ni merge; solo el hilo principal pushea y mergea a `main`; ajustes D-G1 a D-G4 (ver el plan); `init` rápido, con opciones y "avisar y salir" en repo en blanco; suite completa solo antes de unir; la forma de ejecutar un plan se elige por la más rápida medida.

**Decisiones abiertas del autor:** clave `brief` en el núcleo; `test-paths` por defecto (commit `9d6f84f`); G44 (`code-untested`); si `subagent-main` se extiende a `commit`, `pull`, `rebase` y similares sobre `main`; `git branch -d` sin confirmar, `--force-with-lease`, `navigate`; un solo proceso por evento de hook.

**Comentarios del autor tras usar pignolo-ui (2026-10-02, se van sumando en `docs/gaps.md` desde G49):** hito **4h, definición inicial** (plan `docs/plans/2026-10-02-pignolo-ui-hito-4h-definicion-inicial.md`; **construido en la rama `ui/hito-4h`, pignolo-ui 0.7.6, sin commitear**; falta revisión opus, checklist manual y reconciliar con la etapa 2 del lienzo al unir): skill nueva `/pignolo-ui:define`, compuerta escrita en las skills (sin script) que insiste y solo se saltea por pedido explícito, con el pendiente anotado en el `CLAUDE.md` del proyecto; `PRODUCT.md` obligatorio. El tablero de colores, tipografía y estilo va a un artifact privado (decisión del autor; reemplaza "HTML local" de D-4c para `define`).

**Sin anotar todavía en `docs/ejecuciones.csv`:** ejecuciones y revisión de la etapa 2 del lienzo, `init` rápido, cambio de la guardia y su revisión, auditoría de reglas, plan de la guardia, preparación de las pruebas.
