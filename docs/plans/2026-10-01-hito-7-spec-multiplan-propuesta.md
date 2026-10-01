# Propuesta de cambios al spec: planes en paralelo, hasta N en ejecución sin solaparse, unión a `main` de a uno e informes por tarea (hito 7)

**Estado:** propuesta para revisión del autor. **No se editó el spec** (`docs/specs/2026-09-26-pignolo-v1-design.md`). Decidida el 2026-10-01 y corregida por el autor ese mismo día (D-7-8 del plan `docs/plans/2026-09-30-hito-7-ramas-y-paralelismo.md`, Tasks 16 a 19; rulings R-15 a R-20): la primera versión decía "un solo plan en ejecución"; la vigente permite varios, hasta el tope del perfil y solo sin solapamiento de archivos, con la unión a `main` de a uno. Si el autor aprueba, el cierre de 7a edita el spec con este texto. Cada cambio da la sección, el texto de hoy ("antes") y el propuesto ("después"). Los cambios son aditivos salvo uno, marcado **[contrato]** y todavía sin confirmar por el autor.

## 1. §5.3 `next` (aditivo)

**Antes** (final del párrafo del hito 5a): "… plan sin cerrar según su etapa y el estado de la tarjeta, registro de plan ilegible) y un estado ilegible nunca se lee como "sin flujo". `SessionStart` suma su texto solo si hay algo en curso. `queue/` con conflicto no se cubre hasta el hito 7."

**Después** (reemplaza la última oración y agrega):
"… Con varios planes, el principal es el que está en ejecución (si hay varios, el de etapa más avanzada: `final-review`, `validating`, `executing`; empate por aprobación más antigua); si ninguno, el primero de la cola de planes (§11.7); si ninguno, el que se está escribiendo más reciente. **Todos los demás planes salen como hechos** en `facts`, una línea cada uno (`Plan <p>: etapa <e>, escribiéndose | en la cola, posición <n> (puede ejecutarse | espera: tope | espera: archivos con <a>) | activo | cerrado (merged|abandoned)`), hasta 8 líneas; `next --plan <p>` responde por ese plan (un plan en cola que no puede ejecutarse dice por qué espera: el tope del perfil o los archivos que comparte y con quién). El JSON suma `plans: [{ plan, stage, state, position? }]`. **Hito 7:** además de lo anterior, `next` cubre `queue/` con conflicto, el lock de la cola de un proceso muerto y la ola cortada (kinds `queue-conflict`, `queue-busy-dead`, `wave-partial`)."

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
"`PreToolUse` git merge/push hacia `main`: `scope-gate` exige tarjeta aprobada **y**, si el plan está en ejecución, que cada tarea registrada tenga su informe en `int/<plan>` (presencia, una sola llamada a git; la validación completa corre en `plan.js` y en la cola) **y que `int/<plan>` contenga la punta de su rama de origen** (`git merge-base --is-ancestor`, una llamada; si no, `int-behind`: el plan se pone al día con `queue.js update`, §11.7). Sin tareas registradas, no pasa. Registro o git ilegible: niega (falla cerrado)."

## 4. §10.1 Qué va dónde (aditivo, y un cambio de contrato)

**Antes** (viñeta del hito 5a): "El registro del plan vive en `.pignolo/state/plans/<plan>/` (`plan.json` y `scope-card.md`), lo escribe solo el hilo principal (`plan.js`, `plan-audit.js`; la guardia niega esos scripts a los subagentes) y se commitea en la rama del plan solo entre pasos."

**Después** (agregar):
"**Hito 7 (técnico).** Varios planes pueden coexistir en `plans/`; la **cola de planes** no tiene archivo propio: se deriva de `plan.json` (§11.7). Campos aditivos de `plan.json`: `origin`, `closedAs` (`merged` o `abandoned`), `closedReason`, `closedAt`, y `tasks[].files` (los archivos que cada tarea declara en su tarjeta, `Create`/`Modify`/`Test`, relativos al repo; los escribe `plan.js tasks set` y son lo que la cola de planes compara, §11.7). `run.json` v2 lleva `plans: [<plan>]` (varios planes en ejecución; `plan` sigue como alias del primero) y `.pignolo/project.md` admite la lista `plan-overlap-ignore`. Al lado de `plan.json`, `reports/<task-id>.md`: el informe por tarea, que guarda el hilo principal con `scripts/report.js` (también negado a los subagentes) y se commitea en `int/<plan>` entre merges, como el resto del estado. **[contrato, sin confirmar por el autor]** `plan.js advance --to closed` deja de existir: un plan se cierra con `plan.js close --as merged|abandoned` (§11.7)."

## 5. §11.3 Cola (aditivo)

**Antes:** "… Cambios en `.pignolo/state/` desde una tarea: rechazados. Regresión tardía en `int/`: revert primero."

**Después:**
"… Cambios en `.pignolo/state/` desde una tarea: rechazados. **Una tarea de un plan entra a la cola solo con su informe guardado, válido y de su árbol actual** (`report-missing`, `report-invalid`, `report-stale`; §11.7). Regresión tardía en `int/`: revert primero. **Poner un plan al día con su origen** (§11.7) también pasa por la cola: `queue.js update --plan <p>` une la rama de origen a `queue/<p>` (merge, nunca rebase: `int/` solo avanza en fast-forward y sus `cp/` quedan válidos), corre el mismo `pre-merge` sellado con repetición y avanza `int/<p>` por compare-and-swap con su `cp/`; un conflicto con el origen no lo resuelve la cola: vuelve como una tarea."

## 6. §11.7 nueva: Planes en paralelo, hasta N en ejecución sin solaparse, unión a `main` de a uno e informes por tarea

**Antes:** no existe.

**Después** (sección nueva, a continuación de §11.6):

"### 11.7 Planes en paralelo, hasta N en ejecución sin solaparse, unión a `main` de a uno e informes por tarea
**Planes en paralelo.** Varios planes pueden escribirse y auditarse a la vez (etapas `spec` a `audited`): cada uno tiene su carpeta y su etapa en `.pignolo/state/plans/<plan>/`. `next` y la skill `plan` muestran todos con su etapa y su estado.
**Hasta N planes en ejecución.** Cada plan está `writing` (antes de `audited`, o `audited` sin tarjeta aprobada), `queued` (`audited` con la tarjeta aprobada), `active` (`executing`, `validating` o `final-review`) o `closed`. La posición en la cola es el orden de aprobación de la tarjeta (`scopeCard.approved.at`; desempate por nombre) y es una sugerencia. **Pueden estar `active` a la vez hasta `activePlans` planes del perfil (`max` 3, `balanced` 2, `economy` 1; la forma de las olas, §4.5) y solo si sus archivos no se solapan:** los archivos de un plan son los que sus tarjetas de tarea declaran (`tasks[].files`, escritos por `plan.js tasks set`) más los que sus tareas registran en `run.json` al arrancar; `CHANGELOG.md` y `plugin.json` no cuentan (se resuelven al unir), y el proyecto puede sumar otros en `plan-overlap-ignore` de `project.md`. Pasar a `executing`, registrar una tarea de un plan (incluidas las anteriores a la aprobación de la tarjeta, §4.5) y `plan.js runnable` lo verifican: con el tope lleno **niegan** con `plan-busy` (los planes que ocupan el lugar y el tope); con un archivo en común con un plan activo, el plan sigue `queued` y **niegan** con `plan-overlap` (los archivos y el otro plan); un plan con tareas sin archivos declarados solapa con cualquier activo; un registro de otro plan ilegible ocupa un lugar y solapa (falla cerrado). Se comprueba primero el tope y después el solapamiento. Las salidas son siempre dos o tres: terminar y unir un plan activo, cerrarlo con `plan.js close --as abandoned --reason <texto>` o, solo con `plan-busy`, subir el perfil. Un lugar se libera solo cuando un plan se **unió** (`close --as merged`, que exige `int/<plan>` ya contenido en la rama de origen) o se **abandonó** de forma explícita y registrada. Dentro de cada plan, la ejecución es en serie por defecto (§11.4); el tope de tareas en paralelo del perfil es por proyecto, no por plan.
**Unión a `main` de a uno.** Cuando dos planes activos terminan, el primero se une a su rama de origen; el segundo no puede unirse hasta que `int/<plan>` contenga la punta del origen: `scope-gate` lo niega con `int-behind` y la única vía es `queue.js update --plan <plan>`, que une el origen a `int/<plan>` por la cola (§11.3) y repite el `pre-merge` sellado sobre ese merge. Así ningún plan entra a `main` sin haber pasado su compuerta sobre lo que el anterior dejó, y no hace falta un lock entre merges: la propia rama de origen los serializa.
**Informe por tarea (todos los planes).** Tras sellar la compuerta, el ejecutor entrega un informe corto (plantilla `templates/task-report.md`: tests agregados, rojo demostrado, rulings, dudas). El hilo principal lo guarda en `reports/<task-id>.md` del plan. **No hay revisión por tarea**: la única revisión opus del plan lee todos los informes juntos (`scripts/report.js bundle`) con el diff, y cruza `Red shown` con los sabotajes del ledger y los tests listados con los del diff (`crossCheck`). Tres compuertas: el `handback-gate` (formato al `DONE`), la cola (`report-missing`, `report-invalid`, `report-stale`: el `Tree` del informe debe ser el de la punta de la tarea y tener sello `on-done`) y el cierre (`plan.js advance --to final-review` y `close --as merged`, y `scope-gate` en el merge a `main`, niegan un plan con tareas sin informe o sin tareas registradas). **Límite (§1.9):** el informe lo escribe el mismo agente que el código; el formato y el cruce con el sello prueban que lo declaró y de qué árbol es, no que sea cierto. El solapamiento se mide sobre lo declarado y lo registrado, no sobre el diff real: una tarea que toca un archivo fuera de su lista la frena el `gate` (`checks.scope`), no la cola de planes."

## 7. §15 Pruebas del plugin (aditivo)

**Antes** (lista de §15; entradas `next` y `scope-gate`): "- `next`: recorridos interrumpidos (ola cortada, `queue/` con conflicto, tarea BLOCKED, compactación). …" y "- `scope-gate`: merge a `main` sin tarjeta → bloqueado. …"

**Después** (agregar tres entradas y ampliar dos):
- "`plan-queue`: tope por perfil (3/2/1: el plan de más da `plan-busy` y nombra a los que ocupan el lugar); dos planes con un archivo en común no se ejecutan a la vez (`plan-overlap` con los archivos; `CHANGELOG.md` y `plugin.json` no cuentan; `plan-overlap-ignore` suma otros); un plan con tareas sin archivos declarados solapa con todo; un registro ilegible ocupa y solapa; `close --as merged` solo con `int/<plan>` unido; `abandoned` libera el lugar; `advance --to closed` rechazado."
- "`queue-update`: `queue.js update` une el origen a `int/<plan>` con el `pre-merge` sellado sobre el merge y su `cp/`; origen ya contenido no toca nada; conflicto o compuerta en rojo dejan `int/` quieto."
- "`report`: informe válido e inválido (tabla de reglas, cada una en rojo); informe de un árbol anterior es `report-stale`; la cola, el cierre y `scope-gate` niegan un plan con una tarea sin informe; `bundle` y `crossCheck`."
- `next` suma: "varios planes: el principal y los hechos de los demás, con el motivo de espera (tope o archivos), `next --plan`".
- `scope-gate` suma: "merge a `main` de un plan en ejecución con una tarea sin informe → bloqueado; merge a `main` de un `int/<plan>` que no contiene la punta de su origen → bloqueado (`int-behind`)."

## 8. §18 Construcción, punto 7 (aditivo)

**Antes:** "7. Ramas y paralelismo: nombres, contrato, worktrees (mecanismo A verificado o B), cola, olas, cleanup. Tests: `queue`, `worktree`, `state-queue`, `agents` (integrator)."

**Después:** "7. Ramas y paralelismo: nombres, contrato, worktrees (mecanismo A verificado o B), cola, olas, cleanup, planes en paralelo con hasta N en ejecución sin solaparse, unión a `main` de a uno e informes por tarea (§11.7). Tests: `queue`, `worktree`, `state-queue`, `plan-queue`, `queue-update`, `report`, `agents` (integrator)."

## 9. §4.5 Perfiles (aditivo)

**Antes:** la tabla de perfiles trae el paralelismo máximo (3/2/1) y, desde el hito 5, las tareas previas a la aprobación (3/2/1, D-5-3).

**Después** (agregar una fila o una frase): "`activePlans`, planes en ejecución a la vez: `max` 3, `balanced` 2, `economy` 1 (§11.7). Sin perfil configurado vale el de `balanced`, como en el tope de tareas."

## Qué no cambia

Las etapas del registro (`STAGES`) siguen siendo las mismas diez; la cola de planes no suma archivo ni etapa. La serie por defecto dentro de cada plan (D-7-2), el modo `daily` (sin informes, sin cola de planes), los informes por tarea con sus tres compuertas y `next` mostrando todos los planes quedan como en la primera versión de esta propuesta. **Pendiente del autor:** el cambio de contrato `advance --to closed` → `plan.js close` (§10.1) no se le volvió a preguntar.
