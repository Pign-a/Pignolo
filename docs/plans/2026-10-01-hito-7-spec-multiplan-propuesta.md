# Propuesta de cambios al spec: planes en paralelo, un plan en ejecución e informes por tarea (hito 7)

**Estado:** propuesta para revisión del autor. **No se editó el spec** (`docs/specs/2026-09-26-pignolo-v1-design.md`). Decidida el 2026-10-01 (D-7-8 del plan `docs/plans/2026-09-30-hito-7-ramas-y-paralelismo.md`, Tasks 16 a 19; rulings R-15 a R-19). Si el autor aprueba, el cierre de 7a edita el spec con este texto. Cada cambio da la sección, el texto de hoy ("antes") y el propuesto ("después"). Los cambios son aditivos salvo uno, marcado **[contrato]**.

## 1. §5.3 `next` (aditivo)

**Antes** (final del párrafo del hito 5a): "… plan sin cerrar según su etapa y el estado de la tarjeta, registro de plan ilegible) y un estado ilegible nunca se lee como "sin flujo". `SessionStart` suma su texto solo si hay algo en curso. `queue/` con conflicto no se cubre hasta el hito 7."

**Después** (reemplaza la última oración y agrega):
"… Con varios planes, el principal es el que está en ejecución; si ninguno, el primero de la cola de planes (§11.7); si ninguno, el que se está escribiendo más reciente. **Todos los demás planes salen como hechos** en `facts`, una línea cada uno (`Plan <p>: etapa <e>, escribiéndose | en la cola, posición <n> | activo | cerrado (merged|abandoned)`), hasta 8 líneas; `next --plan <p>` responde por ese plan (un plan en cola con otro activo dice que espera). El JSON suma `plans: [{ plan, stage, state, position? }]`. **Hito 7:** además de lo anterior, `next` cubre `queue/` con conflicto, el lock de la cola de un proceso muerto y la ola cortada (kinds `queue-conflict`, `queue-busy-dead`, `wave-partial`)."

## 2. §6 Agentes, cartas de rol (aditivo)

**Antes** (§6, párrafo "Cartas de rol", los que escriben): "Los que escriben (`implementer`, `fixer`, `test-writer`) agregan: rojo demostrado rompiendo lo que el test protege; … "

**Después** (agregar al final de ese párrafo):
"En tareas de un plan, el `implementer` y el `fixer` cierran con el **informe por tarea** (§11.7) antes de la palabra final: plantilla fija `templates/task-report.md` (cabecera `Task`, `Plan`, `Commit`, `Tree`, `Gate`; secciones `Tests added`, `Red shown`, `Rulings`, `Doubts`; cada una con contenido o `none: <motivo>`), a lo sumo 40 líneas y 3.000 caracteres. El informe es el mensaje final; no lo escribe en disco (un subagente no escribe `.pignolo/state/`)."

## 3. §8.3 hooks: `handback-gate` y `scope-gate` (aditivo)

**Antes** (`handback-gate`): "Acepta DONE solo si existe un sello con exit 0 para el `tree-hash` del **worktree de la tarea** (ruta registrada en la task-card) y la integ…"

**Después** (agregar al final de la entrada del `handback-gate`):
"**Hito 7 (técnico):** en una tarea de un plan, el `DONE` exige además que el mensaje final sea un informe válido de `templates/task-report.md` para esa tarea (formato, sin plantilla sin llenar); se cuenta en el tope de 8 intentos. En `daily` y `trivial` no cambia."

**Antes** (`scope-gate`): "`PreToolUse` git merge/push hacia `main`: `scope-gate` exige tarjeta aprobada."

**Después:**
"`PreToolUse` git merge/push hacia `main`: `scope-gate` exige tarjeta aprobada **y**, si el plan está en ejecución, que cada tarea registrada tenga su informe en `int/<plan>` (presencia, una sola llamada a git; la validación completa corre en `plan.js` y en la cola). Sin tareas registradas, no pasa. Registro o git ilegible: niega (falla cerrado)."

## 4. §10.1 Qué va dónde (aditivo, y un cambio de contrato)

**Antes** (viñeta del hito 5a): "El registro del plan vive en `.pignolo/state/plans/<plan>/` (`plan.json` y `scope-card.md`), lo escribe solo el hilo principal (`plan.js`, `plan-audit.js`; la guardia niega esos scripts a los subagentes) y se commitea en la rama del plan solo entre pasos."

**Después** (agregar):
"**Hito 7 (técnico).** Varios planes pueden coexistir en `plans/`; la **cola de planes** no tiene archivo propio: se deriva de `plan.json` (§11.7). Campos aditivos de `plan.json`: `origin`, `closedAs` (`merged` o `abandoned`), `closedReason`, `closedAt`. Al lado de `plan.json`, `reports/<task-id>.md`: el informe por tarea, que guarda el hilo principal con `scripts/report.js` (también negado a los subagentes) y se commitea en `int/<plan>` entre merges, como el resto del estado. **[contrato]** `plan.js advance --to closed` deja de existir: un plan se cierra con `plan.js close --as merged|abandoned` (§11.7)."

## 5. §11.3 Cola (aditivo)

**Antes:** "… Cambios en `.pignolo/state/` desde una tarea: rechazados. Regresión tardía en `int/`: revert primero."

**Después:**
"… Cambios en `.pignolo/state/` desde una tarea: rechazados. **Una tarea de un plan entra a la cola solo con su informe guardado, válido y de su árbol actual** (`report-missing`, `report-invalid`, `report-stale`; §11.7). Regresión tardía en `int/`: revert primero."

## 6. §11.7 nueva: Planes en paralelo, un plan en ejecución e informes por tarea

**Antes:** no existe.

**Después** (sección nueva, a continuación de §11.6):

"### 11.7 Planes en paralelo, un plan en ejecución e informes por tarea
**Planes en paralelo.** Varios planes pueden escribirse y auditarse a la vez (etapas `spec` a `audited`): cada uno tiene su carpeta y su etapa en `.pignolo/state/plans/<plan>/`. `next` y la skill `plan` muestran todos con su etapa y su estado.
**Un plan en ejecución.** Cada plan está `writing` (antes de `audited`, o `audited` sin tarjeta aprobada), `queued` (`audited` con la tarjeta aprobada), `active` (`executing`, `validating` o `final-review`) o `closed`. La posición en la cola es el orden de aprobación de la tarjeta (`scopeCard.approved.at`; desempate por nombre) y es una sugerencia. **Solo un plan puede estar `active`.** Pasar a `executing`, registrar una tarea de un plan (incluidas las anteriores a la aprobación de la tarjeta, §4.5) y `plan.js runnable` lo verifican y, si otro plan está activo o su registro es ilegible, **niegan** con `plan-busy` y dos salidas: terminar y unir el activo, o cerrarlo con `plan.js close --as abandoned --reason <texto>`. El siguiente plan arranca solo después de que el anterior se **unió** (`close --as merged`, que exige `int/<plan>` ya contenido en la rama de origen) o se **abandonó** de forma explícita y registrada. Dentro del plan, la ejecución es en serie por defecto (§11.4).
**Informe por tarea (todos los planes).** Tras sellar la compuerta, el ejecutor entrega un informe corto (plantilla `templates/task-report.md`: tests agregados, rojo demostrado, rulings, dudas). El hilo principal lo guarda en `reports/<task-id>.md` del plan. **No hay revisión por tarea**: la única revisión opus del plan lee todos los informes juntos (`scripts/report.js bundle`) con el diff, y cruza `Red shown` con los sabotajes del ledger y los tests listados con los del diff (`crossCheck`). Tres compuertas: el `handback-gate` (formato al `DONE`), la cola (`report-missing`, `report-invalid`, `report-stale`: el `Tree` del informe debe ser el de la punta de la tarea y tener sello `on-done`) y el cierre (`plan.js advance --to final-review` y `close --as merged`, y `scope-gate` en el merge a `main`, niegan un plan con tareas sin informe o sin tareas registradas). **Límite (§1.9):** el informe lo escribe el mismo agente que el código; el formato y el cruce con el sello prueban que lo declaró y de qué árbol es, no que sea cierto."

## 7. §15 Pruebas del plugin (aditivo)

**Antes** (lista de §15; entradas `next` y `scope-gate`): "- `next`: recorridos interrumpidos (ola cortada, `queue/` con conflicto, tarea BLOCKED, compactación). …" y "- `scope-gate`: merge a `main` sin tarjeta → bloqueado. …"

**Después** (agregar dos entradas y ampliar dos):
- "`plan-queue`: dos planes aprobados, el segundo no pasa a `executing` mientras el primero está activo; un registro ilegible ocupa; `close --as merged` solo con `int/<plan>` unido; `abandoned` libera la cola; `advance --to closed` rechazado."
- "`report`: informe válido e inválido (tabla de reglas, cada una en rojo); informe de un árbol anterior es `report-stale`; la cola, el cierre y `scope-gate` niegan un plan con una tarea sin informe; `bundle` y `crossCheck`."
- `next` suma: "varios planes: el principal y los hechos de los demás, `next --plan`".
- `scope-gate` suma: "merge a `main` de un plan en ejecución con una tarea sin informe → bloqueado."

## 8. §18 Construcción, punto 7 (aditivo)

**Antes:** "7. Ramas y paralelismo: nombres, contrato, worktrees (mecanismo A verificado o B), cola, olas, cleanup. Tests: `queue`, `worktree`, `state-queue`, `agents` (integrator)."

**Después:** "7. Ramas y paralelismo: nombres, contrato, worktrees (mecanismo A verificado o B), cola, olas, cleanup, planes en paralelo con un solo plan en ejecución e informes por tarea (§11.7). Tests: `queue`, `worktree`, `state-queue`, `plan-queue`, `report`, `agents` (integrator)."

## Qué no cambia

Las etapas del registro (`STAGES`) siguen siendo las mismas diez; la cola de planes no suma archivo ni etapa. La serie por defecto dentro del plan (D-7-2) y el modo `daily` (sin informes, sin cola de planes) quedan como están.
