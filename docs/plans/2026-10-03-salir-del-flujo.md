# Salir del flujo de pignolo sin preguntar. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie; una revisión opus al final con una pasada de arreglos (CLAUDE.md). **No pasa por `plan-auditor`** (ver "Revisión"). Casillas `- [ ]` para marcar. **T5 y T6 gastan dinero: no se corren sin el OK del autor** (T1 a T4 cuestan 0 USD).
>
> **Versiones (renumerables al unir):** núcleo `pignolo` **0.23.0** (main está en 0.22.0 con su entrada "sin publicar"; el arreglo del panel trae 0.22.1: se asume que une primero, y 0.23.0 es el siguiente libre porque el cambio es de comportamiento, no un arreglo). `pignolo-ui` **0.12.0** (main: 0.11.0, la de la fuga, "sin publicar"). Cada paquete sube `version` en su `plugin.json` y suma su entrada al CHANGELOG (el del núcleo vive en la raíz; el de pignolo-ui en `plugins/pignolo-ui/CHANGELOG.md`; lo exige `tests/changelog-versions.test.js`).
>
> **Rama:** `feat/salir-del-flujo` desde `main`. Orden: T1 -> T2 -> T3 -> T4 (cero costo) y, solo con OK del autor, T5 -> T6.

## Incidente (uso real del autor, 2026-10-03; anónimo)

En un proyecto con pignolo activo, el autor pidió un cambio grande de interfaz a un prototipo. El agente no usó ningún flujo del núcleo:

- "armá un plan" no activó `pignolo:plan`; el plan se escribió en el chat.
- La implementación corrió como nueve agentes genéricos en paralelo, sin tarjeta de alcance, sin tests primero y sin revisión independiente.
- Su razón: los carriles del núcleo trabajan sobre una copia sacada de git; el prototipo vive en `.pignolo-ui/`, que git ignora a propósito, así que el archivo no existe en esa copia, y pignolo prohíbe commitear lo ignorado (`NO-RUNS-COMMIT`). Antes, para un arreglo de una línea, el autor había elegido "hacerlo directo"; el agente extendió ese permiso a todo el trabajo grande sin volver a preguntar, y tomó "implementar todo al prototipo directamente" como confirmación.
- Solo se usó pignolo-ui (opciones de diseño, lienzo, aprobados, scripts de auditoría).

Por qué pudo pasar (hechos de `main`, 2026-10-03):

- `entry` ya dice que "Hacerlo directo" elegido en la conversación se respeta "for this request" (paso 2, línea de pignolo-ui) y `pignolo-ui/reference/activation.md` lo repite, pero **ninguna regla pide preguntar al salir del flujo**: salir no es un evento que `entry` nombre. Y la frase "for this request" es fácil de leer como "para esta conversación".
- `entry` solo manda a pignolo-ui los pedidos de **pantalla** que autorizan un cambio; un archivo bajo `.pignolo-ui/` no tiene regla propia (el carril `daily` lo intentaría en su worktree, donde no existe).
- `entry` no tiene una regla de "armá un plan": el carril `plan` solo se alcanza por piso de riesgo o porque "the change needs a spec" (paso 7). Y `pignolo:plan` dice "Entered only through pignolo:entry", sin frases naturales.
- El freno de subagentes genéricos rige solo con un flujo abierto (spec §6.1); sin flujo, nueve agentes genéricos no chocan con nada. **Un aviso al despachar varios agentes sin flujo abierto fue propuesto y el autor lo descartó: no se hace.**

## Decisiones del autor ya tomadas (no se reabren)

1. **Salir del flujo se pregunta siempre.** Con pignolo activo y un pedido no trivial, `entry` pregunta con opciones (`AskUserQuestion`) antes de trabajar fuera de los flujos, dice en una línea llana qué se pierde (sin tests primero, sin revisión independiente) y el sí vale solo para ese pedido: un "hacelo directo" anterior no pasa a un pedido posterior ni a uno más grande, y la palabra "directamente" dentro del pedido no es esa confirmación.
2. **El trabajo sobre archivos de `.pignolo-ui/` pasa por pignolo-ui.** `entry` manda el pedido cuyo blanco es el prototipo de `.pignolo-ui/` a `pignolo-ui:improve` o `pignolo-ui:new` (que ya trabajan sobre el prototipo y verifican con evidencia de antes y después) en vez de probar los carriles basados en git.
3. **"armá un plan" activa `pignolo:plan`.** Se suman esa frase y sus variantes (castellano e inglés) a los casos de activación; la `description` de `plan` solo cambia si los casos muestran que hace falta.

## Rulings del plan

- **R1 qué es "salir del flujo".** Atender un pedido que autoriza un cambio y **no es trivial** sin pasar por ninguna de estas skills: `pignolo:trivial`, `pignolo:daily`, `pignolo:plan`, `pignolo-ui:*`. Es el único evento que dispara la pregunta nueva. **Nunca** se pregunta en: un pedido de solo lectura (paso 2), un pedido que `entry` entrega a un carril o a pignolo-ui, ni un pedido `trivial` (el carril `trivial` ya es el camino rápido; el piso de riesgo y la definición de "trivial" del paso 7 no cambian). Si un carril no puede hacer el trabajo (como en el incidente) **no se improvisa**: es salir del flujo y se pregunta.
- **R2 la respuesta es por pedido.** El registro de la elección es la línea de una frase que el agente dice al elegir (mecanismo que ya existe para pignolo-ui); la regla nueva fija que esa línea nombra **el pedido** ("para este pedido: <resumen corto>") y que un pedido distinto o más grande vuelve a preguntar. Un pedido "más grande" es uno con más archivos, otra carpeta o un cambio de tipo (de arreglo a pantalla entera): ante la duda, se pregunta.
- **R3 "Hacerlo directo" de pignolo-ui es la misma elección.** El paso 0 de `new`/`improve`/`audit`/`define` ya pregunta cuando la skill arrancó sola; su "Hacerlo directo" cuenta como la confirmación de R2 para ese pedido, y `entry` no repregunta (ni manda de vuelta) en ese pedido. Así una sola pregunta cubre cada camino.
- **R4 el blanco bajo `.pignolo-ui/` se detecta antes del piso de riesgo.** En el paso 2, cuando el pedido autoriza un cambio y los archivos que nombra (o que el paso 4 lista) están bajo `.pignolo-ui/`, se manda a pignolo-ui sin correr `risk.js` (el piso de riesgo mira el árbol de git, que no los ve). Si el pedido mezcla archivos del proyecto con el prototipo: lo que está fuera de `.pignolo-ui/` va por los carriles normales, el prototipo por pignolo-ui, un paso por mensaje y el orden se lo pregunta al humano (categoría `scope`).
- **R5 cómo encaja con "nunca se commitea lo ignorado".** No hay tensión: pignolo-ui trabaja sobre el archivo en disco y verifica con capturas y medidas, sin commit; `NO-RUNS-COMMIT` sigue entero. La regla nueva solo agrega que, **por ningún camino** (pignolo-ui, "directo" o carril), el trabajo sobre `.pignolo-ui/` se agrega a git ni se respalda por esa vía; el prototipo no queda en el historial salvo que el autor lo pida y lo vuelva parte del proyecto (p. ej. aprobados en `design/approved/`, que ya es otra carpeta y otro camino).
- **R6 sin pignolo-ui instalado** (sus skills no aparecen como `pignolo-ui:...`): ver D1 abajo. Lo que el plan hace por defecto: `entry` no manda el pedido a un carril basado en git (no puede ver el archivo) ni lo hace directo en silencio: es salir del flujo (R1) con la razón honesta en la línea ("pignolo no puede ver ese archivo porque git lo ignora y pignolo-ui, que sí, no está instalado"), la opción de instalar pignolo-ui como primera y "Hacerlo directo" como segunda.
- **R7 "armá un plan" va al carril `plan`.** Un pedido de plan o de especificación autoriza **producir un plan con `pignolo:plan`**, no código: `entry` lo entrega al paso 8 como carril `plan`, sin pasar por `risk.js` ni por la pregunta de R1 (ya está en un flujo), y el plan no se escribe en el chat. Ejecutar un plan ya escrito es otro pedido (cae en las reglas de siempre).

## Decisiones abiertas para el autor

1. **D1 sin pignolo-ui instalado, qué pasa con un pedido sobre `.pignolo-ui/`.** Recomendado: **R6** (preguntar con la razón, instalar primero, directo segundo). Alternativas razonables: (b) cortar y decir que hace falta pignolo-ui, sin ofrecer directo (más estricto, pero deja al autor sin salida para un archivo que solo él puede tocar); (c) hacerlo directo con aviso, sin preguntar (descartada: es exactamente el incidente).
2. **D2 `description` de `plan`.** Recomendado: **no tocarla** hasta que T5 muestre un acierto bajo en el control; entonces T6 prueba el texto nuevo. Si el autor prefiere ahorrar la medición y cambiarla ya, es una línea (`Use when the user asks to plan...`, y mantener "through pignolo:entry"), pero sin dato se arriesga a que `plan` se active solo en pedidos que `entry` mandaría a otro carril.
3. **D3 gastar en T5/T6.** Recomendado: autorizar solo **T5** (control + tratamiento A, ≈ 2,5 a 4 USD); T6 solo si T5 lo pide. El plan no supone que el OK esté dado.
4. **D4 "más grande" (R2).** Recomendado: criterio de R2 (más archivos, otra carpeta, otro tipo de cambio; ante la duda se pregunta). Un umbral numérico (p. ej. "más de 3 archivos") sería falso en ambas direcciones y `entry` no cuenta archivos hasta el paso 4.

---

## T1: `entry` pregunta al salir del flujo, por pedido (núcleo 0.23.0)

**Archivos:** `plugins/pignolo/skills/entry/SKILL.md`; test nuevo `tests/entry-leave-flow.test.js`; después, T4 sube la versión y el CHANGELOG.

**Texto a agregar** (inglés, una línea marcada, después de `NO-RUNS-COMMIT:` y antes de `## Steps`, como esa línea):

```
LEAVE-FLOW: never carry out a request that authorizes a non-trivial change outside pignolo's skills (trivial, daily, plan, pignolo-ui:*) without asking first, every time. Ask with AskUserQuestion (category `scope`): "Usar el flujo de pignolo (Recomendado)" first, then "Hacerlo directo"; say in one plain line what direct work loses (no tests first, no independent review) and, if a lane cannot do the job, the real reason. The answer covers this one request only: write "para este pedido: <short summary>" when you start. Never reuse an earlier "hacerlo directo" for a later or larger request (more files, another folder, a different kind of change: when in doubt, ask again), and never read "directamente", "do it directly", "just do it" or "implementá todo" inside the request as that confirmation. A trivial request, a read-only one and one you hand to a skill never get this question. If AskUserQuestion is not available, do not go on: say it needs the human's confirmation and stop.
```

Y en el paso 8 (`Hand over`), al final: `If no lane can take the request, that is leaving the flow: apply LEAVE-FLOW; never improvise a workaround.` Y en la línea de pignolo-ui del paso 2, reemplazar `for this request (the skill said it in one line)` por `for this request only (the skill said it in one line; a later or larger request asks again, LEAVE-FLOW)`. Mantener `Hacerlo directo` y `authorize` en esa línea (los exigen `tests/review-nl.test.js` RNL-02 y RNL-03).

**Casos de test literales** (`tests/entry-leave-flow.test.js`, patrón de `tests/skill-lanes.test.js`: `readSkill('entry')` de `./skill-forms`; cabecera con "Protege" y "Se rompe si"):

1. Hay exactamente una línea que empieza con `LEAVE-FLOW:` y contiene `AskUserQuestion`, `Hacerlo directo`, `no tests first`, `no independent review` y `this one request only`. **Rojo:** borrar la línea.
2. Esa línea contiene `later or larger request`, `directamente` y `just do it` (no se hereda ni se infiere de la redacción). **Rojo:** quitar la cláusula.
3. Esa línea contiene `A trivial request` y `never get this question` (lo trivial nunca la recibe), y el paso 7 sigue diciendo `one line or a mechanical change you fully understand` (no se ensanchó "trivial"). **Rojo:** quitar la cláusula o cambiar la definición.
4. La línea queda **antes** de `## Steps`, y algún paso numerado (el 8) contiene `LEAVE-FLOW`. **Rojo:** mover la línea al final o quitar la mención del paso.
5. La línea de pignolo-ui del paso 2 contiene `this request only`, `Hacerlo directo` y `authorize` (RNL-02/03 siguen valiendo). **Rojo:** volver al texto viejo.
6. Si `AskUserQuestion` no está, la línea dice `stop` (paralelo a RNL-04). **Rojo:** quitar la cláusula.

**Comando:** `node --test tests/entry-leave-flow.test.js tests/skill-lanes.test.js tests/review-nl.test.js tests/skill-natural-language.test.js tests/flow-lanes.test.js`. **Rojo:** los casos 1 a 6 fallan hoy (la línea no existe); se demuestra rompiendo cada cláusula como se indica.

- [ ] T1 hecha

## T2: `entry` manda `.pignolo-ui/` a pignolo-ui (núcleo 0.23.0, pignolo-ui 0.12.0)

**Archivos:** `plugins/pignolo/skills/entry/SKILL.md`; `plugins/pignolo-ui/reference/activation.md`; test nuevo en `tests/entry-leave-flow.test.js` (mismo archivo, bloque 2); lectura previa (sin editar salvo hallazgo) de `plugins/pignolo-ui/skills/improve/SKILL.md` y `new/SKILL.md`.

**Texto a agregar** en el paso 2, como segunda viñeta tras la de pignolo-ui (inglés). **Trampa:** `tests/skills-no-runs-commit.test.js` caso 2 rechaza cualquier línea (salvo `NO-RUNS-COMMIT:`/`NO-GIT-UI:`) que junte `.pignolo-ui` con `git add`, `commit`, `back up`, `stage` o `resguard` a menos de 80 caracteres. Por eso esta viñeta **no** usa esas palabras: remite a `NO-RUNS-COMMIT` para eso.

```
   - If the files the request names (or step 4 lists) are under `.pignolo-ui/` (the prototype and the canvas options), the git-based lanes cannot see them: git ignores that folder on purpose, so the copy a lane works on does not hold them. Do not run `risk.js` and do not try a lane. If `pignolo-ui` is installed, send the request to `pignolo-ui:improve` (change an existing screen) or `pignolo-ui:new` (a new one) and stop; they work on the file in place and verify with before and after evidence. If `pignolo-ui` is not installed, that is leaving the flow: apply LEAVE-FLOW and put the real reason in its line (pignolo cannot see that file because git ignores it, and pignolo-ui is not installed), with "Instalar pignolo-ui" first. If the request also touches files outside `.pignolo-ui/`, those go through the normal lanes and the prototype through pignolo-ui, one step per message; ask the human the order (category `scope`). NO-RUNS-COMMIT still holds for everything under `.pignolo-ui/`, on every path.
```

**`reference/activation.md`** (pignolo-ui, inglés), en la viñeta de la segunda opción, reemplazar `and `pignolo:entry` honors it for that request (it does not send it back to pignolo-ui)` por `and `pignolo:entry` honors it for that request only (it does not send it back to pignolo-ui, and it asks again for a later or larger request)`. Si al leer `improve`/`new` se ve que no aceptan como blanco un archivo bajo `.pignolo-ui/` (hoy `improve` dice "a local URL or a file"; `new` escribe opciones en el lienzo), el ejecutor **no inventa**: lo anota en el informe como "no probado" y agrega la mínima aclaración de una línea a esa skill (`the target may be a file under .pignolo-ui/`).

**Casos de test literales** (bloque 2 de `tests/entry-leave-flow.test.js`):

1. Alguna línea de `entry` contiene `.pignolo-ui/`, `pignolo-ui:improve`, `pignolo-ui:new`, `Do not run` + `risk.js` y `ignores`. **Rojo:** quitar la viñeta.
2. Esa viñeta contiene `LEAVE-FLOW` y `is not installed` (rama sin pignolo-ui pasa por la pregunta, no por el directo en silencio) y `NO-RUNS-COMMIT`. **Rojo:** quitar la rama.
3. Esa viñeta **no** contiene `commit`, `stage`, `git add` ni `back up` (guarda de la trampa; el caso 2 de `skills-no-runs-commit` también la cubre). **Rojo:** agregar "commit" a la viñeta y correr `tests/skills-no-runs-commit.test.js`: falla.
4. `activation.md` contiene `that request only` y `later or larger request`. **Rojo:** volver al texto viejo.
5. La viñeta aparece **antes** del paso 3 (`Is another flow running?`) y antes del paso 5 (`Risk floor`): el blanco ignorado nunca llega al piso de riesgo. **Rojo:** moverla al paso 8.

**Comando:** `node --test tests/entry-leave-flow.test.js tests/skills-no-runs-commit.test.js tests/review-fuga-leak-values.test.js tests/skill-natural-language.test.js tests/review-nl.test.js` y `npm run test:ui` (pignolo-ui toca `reference/activation.md`: corre sus tests de texto).

- [ ] T2 hecha

## T3: `entry` entrega "armá un plan" al carril `plan` (núcleo 0.23.0)

**Archivos:** `plugins/pignolo/skills/entry/SKILL.md`; bloque 3 de `tests/entry-leave-flow.test.js`. **No** se toca la `description` de `plan` (D2).

**Texto a agregar** en el paso 2, después de "A request to review without changing anything goes to ..." (inglés):

```
A request to plan or to write a spec or plan ('armá un plan', 'hacé un plan', 'planificá esto', 'make a plan', 'write up the plan', 'plan this') authorizes a plan, not code: hand it to the `pignolo:plan` skill (step 8) and never write the plan in the chat. Running a plan that already exists is a different request: it goes through the lanes as usual.
```

Y en el paso 7, en la viñeta `plan`, agregar al final: ` or the human asked for a plan or a spec`.

**Casos de test literales** (bloque 3):

1. `entry` contiene `armá un plan`, `make a plan`, `pignolo:plan` y `never write the plan in the chat` en una misma línea. **Rojo:** quitar la oración.
2. La viñeta `plan` del paso 7 contiene `asked for a plan or a spec`. **Rojo:** quitarla.
3. La oración está **antes** del paso 3 y no menciona `risk.js` ni `LEAVE-FLOW` (un pedido de plan no recibe la pregunta de salida). **Rojo:** agregar `LEAVE-FLOW` a la oración.
4. `Running a plan that already exists` está presente (ejecutar un plan no se confunde con pedir uno). **Rojo:** quitar la cláusula.

**Comando:** `node --test tests/entry-leave-flow.test.js tests/flow-lanes.test.js tests/skill-lanes.test.js` (`flow-lanes` ya protege que `entry` entregue a `pignolo:plan`).

- [ ] T3 hecha

## T4: casos de activación de `plan`, versiones y CHANGELOG (cero costo)

**Archivos:** `tests/evals/activation-cases.js`; `tests/evals/activation-run.js` (opción `--set plan`); `tests/eval-activation-cases.test.js`; `plugins/pignolo/.claude-plugin/plugin.json` y `CHANGELOG.md` (raíz); `plugins/pignolo-ui/.claude-plugin/plugin.json` y `plugins/pignolo-ui/CHANGELOG.md`.

**Casos** (conjunto aparte, para no tocar las 30 frases ya medidas ni el reparto 20/10 que fija el test actual): exportar `PLAN_CASES` y `PLAN = 'pignolo:plan'`. `grade` y `invokedSkill` no cambian (`entry -> plan` ya cuenta como acierto). En `activation-run.js`, `--set main|plan` (por defecto `main`, el comportamiento actual); con `plan` usa `PLAN_CASES`, **`--max-turns` por defecto 3** (entry primero y plan después necesitan dos invocaciones) y sin otro cambio.

Positivas (expect `pignolo:plan`), ids `Q01`..`Q10`: `armá un plan para el cambio grande del prototipo`; `armá un plan`; `hacé un plan de cómo migramos el login a otro proveedor`; `planificá la nueva pantalla de reportes antes de tocar nada`; `necesito un plan detallado para reescribir el módulo de facturación`; `escribí el plan y la especificación del buscador`; `make a plan for the checkout redesign`; `write up a plan to split the monolith, don't implement anything yet`; `plan this feature before we start: export to CSV`; `armemos el plan del cambio y después lo ejecutamos`.

Negativas (ninguna invoca `pignolo:plan`), ids `QN1`..`QN4`: `qué dice el plan del hito 3 sobre los permisos?`; `resumime el plan que está en docs/plans`; `cambiá el nombre del plan "Básico" a "Starter" en la página de precios`; `el cálculo del plan mensual da mal en febrero, arreglalo`.

`gradePlan(expect, invoked)`: positivas = `grade(PLAN, invoked)`; negativas = `!invoked.includes(PLAN)`.

**Versiones y CHANGELOG** (como piden CLAUDE.md y `tests/changelog-versions.test.js`): núcleo 0.22.0 -> **0.23.0**, entrada `## 0.23.0 — sin publicar` en `CHANGELOG.md` de la raíz (antes de `## 0.22.0`): pregunta al salir del flujo por pedido, `.pignolo-ui/` a pignolo-ui, "armá un plan" al carril `plan`, con el incidente anónimo en una línea y los tests nuevos. pignolo-ui 0.11.0 -> **0.12.0**, entrada breve en su CHANGELOG (la elección "Hacerlo directo" vale solo para ese pedido). Renumerar si el orden de unión cambia.

**Casos de test literales** (`tests/eval-activation-cases.test.js`, bloque nuevo; los tests existentes no se tocan):

1. `PLAN_CASES` tiene 10 positivas y 4 negativas, ids y frases únicos, y **no se pisan** con las 30 de `CASES`. **Rojo:** duplicar una frase.
2. Cada positiva tiene `expect === 'pignolo:plan'` y `plugins/pignolo/skills/plan/SKILL.md` existe sin `disable-model-invocation`. **Rojo:** cambiar `expect` a una skill inexistente.
3. `gradePlan('pignolo:plan', ['pignolo:entry','pignolo:plan'])` es true; `['pignolo:daily','pignolo:plan']` es false; `['pignolo:entry']` es false; `[]` es false. Negativas: `[]` y `['pignolo:entry']` true; `['pignolo:entry','pignolo:plan']` false. **Rojo:** hacer que `gradePlan` ignore lo previo.
4. `node tests/evals/activation-run.js --arm treatment --set plan --dry-run` imprime `runs: 42` con 3 repeticiones por defecto (14 x 3) y no gasta; con `--set main` sigue imprimiendo `runs: 90`. **Rojo:** quitar `--set` y falla.
5. Es el mismo bloque `main` por defecto: sin `--set`, `--dry-run` da 90 (no se rompe la prueba ya publicada).

**Comando:** `node --test tests/eval-activation-cases.test.js tests/changelog-versions.test.js`.

- [ ] T4 hecha. Fin del trabajo a costo cero.

## T5: medición de la activación de `plan` (**gasta USD: requiere el OK del autor; no se asume**)

Se agrega como ficha a `tests/evals/RESULTS-activacion.md` (sección nueva "Activación de `plan`", **commiteada antes de la primera corrida**, como pide `docs/protocolo-de-pruebas.md`).

- **Pregunta e hipótesis.** ¿Un pedido normal de plan ("armá un plan", variantes) llega a `pignolo:plan` (directo o tras `pignolo:entry`)? Hipótesis: en `main` actual (control) llega en menos de 8 de 10 frases (el incidente lo sugiere, E1); con el texto de `entry` de T3 llega en al menos 9 de 10, sin subir las falsas activaciones por encima de 1 de 4.
- **Variable (una sola) y fijo.** Cambia el árbol de plugins: control = `main` en el commit de partida de esta rama (fijar el hash en la ficha; `CONTROL_COMMIT` se parametriza o se pasa por `--control <hash>`); tratamiento A = esta rama (T1 a T3, `description` de `plan` intacta). Fijo: `PLAN_CASES`, modelo sonnet (el autor usa opus: amenaza), `--max-turns 3`, carpeta de proyecto con `git init`, solo herramienta Skill, `--setting-sources project`, máquina sola o brazos intercalados.
- **Brazos y repeticiones.** Control 14 frases x 3 = 42 corridas; tratamiento A 42 corridas (mínimo 3 por brazo: cada corrida cuesta mucho menos de 300 mil tokens). 84 corridas en total.
- **Métricas** (todas de `activation-run.js`, sin intervención manual): positivas que llegan a `pignolo:plan` por ronda (de 10); falsas activaciones por ronda (de 4); confusión (qué skill se invocó en vez de `plan`, o ninguna); costo (`total_cost_usd` por corrida y por brazo).
- **Regla de decisión (fijada ahora).** El texto de `entry` (T1 a T3) **se adopta** si en el tratamiento A la mediana de las 3 rondas es >= 9/10, el mínimo >= 8/10, las falsas activaciones tienen mediana <= 1/4 y máximo <= 1/4, y los rangos no se pisan con el control; si el control **ya** da mediana >= 9/10 con mínimo >= 8/10, la causa del incidente no es la activación: no se toca la `description` y se anota "sin diferencia demostrada" (se decide por lo más simple). Si el tratamiento A queda por debajo de 9/10 de mediana o de 8/10 de mínimo, o las falsas activaciones pasan de 1/4, se corre **T6**.
- **Presupuesto y tope.** Costo por corrida medido en `RESULTS-activacion.md` (E3 en esa carga de 30 frases): tratamiento 2,64 USD / 90 corridas = ≈ 0,029 USD, control 2,00 / 90 = ≈ 0,022 USD, la primera ronda el doble o más por la caché (1,52 USD / 30 = ≈ 0,05 USD), y las corridas que pasan por `entry` costaron más. Con `--max-turns 3` y `entry` primero por frase, se estima **≈ 0,04 a 0,05 USD por corrida: T5 ≈ 3,4 a 4,2 USD** (84 corridas), **rango 2,5 a 6 USD**, nivel **E0 para el total** (no hay medición de corridas con plan de tres turnos; el por corrida sale de E3 de otra carga). Tope del runner: `--cap 8`; más sonda previa: `node tests/evals/activation-run.js --arm treatment --set plan --probe` (una corrida, ≈ 0,05 USD) para validar que `entry -> plan` aparece en el stream. Si se agota a mitad: se corta, se anota hasta dónde llegó cada brazo y el resultado baja a E2.
- **Cómo correrla (solo con OK):** `node tests/evals/activation-run.js --arm control --set plan --reps 3 --cap 8 --control <hash>` y `node tests/evals/activation-run.js --arm treatment --set plan --reps 3 --cap 8`.
- **Amenazas.** Las de la ficha original (proyecto vacío sin `.pignolo/`: en este montaje `entry` no puede comprobar que pignolo está activo, así que mide la elección de skill, no el flujo; sonnet y no opus; frases del mismo autor del texto). No mide la pregunta de R1 ni el ruteo de `.pignolo-ui/` (necesitan una sesión interactiva: prueba manual del autor, ver T7).

- [ ] T5 **solo con OK del autor**

## T6: cambio de la `description` de `plan` y su medición (**gasta USD; solo si T5 lo pide y con otro OK**)

Solo si la regla de T5 manda correrla. **Archivos:** `plugins/pignolo/skills/plan/SKILL.md` (frontmatter), `tests/flow-lanes.test.js` o `tests/entry-leave-flow.test.js` (test de forma), `RESULTS-activacion.md`. **Texto candidato** (inglés): `Use when the user asks to plan or to write a spec or plan, in Spanish or English: 'armá un plan', 'hacé un plan de esto', 'make a plan', 'write up the plan'. Normally reached through pignolo:entry, which picks the plan lane; takes a request from key claims, spec review and an approved scope-card, through a three-step plan audit, to serial execution with a validator per batch and a final review.` (tope de 1536 caracteres; mantiene `pignolo:entry`).

- **Brazos:** tratamiento B = A + la `description` nueva, contra A y el control de T5 (ya medidos; no se vuelven a correr). 42 corridas, **≈ 1,7 a 2,1 USD** (rango 1,2 a 3), E0 el total, tope `--cap 4`.
- **Regla:** se adopta B si supera a A por rangos que no se pisan en positivas **y** las falsas activaciones no pasan de mediana 1/4 (de 4); si hay solapamiento, no se adopta (lo más simple). Además se vuelven a correr las 10 negativas de `CASES` (`--only N01,...,N10`, 3 repeticiones = 30 corridas, ≈ 0,5 USD, dentro del tope) para ver que `plan` no se active en arreglos chicos; las 20 positivas de pignolo-ui no se repiten (la `description` de `plan` no compite con ellas, riesgo anotado como no medido).
- Versión: si se adopta, es parte de 0.23.0 (no sube otra).

- [ ] T6 **solo si T5 lo pide y con OK**

## T7: verificación manual del autor (no la corre el ejecutor)

El comportamiento de la pregunta (R1, R2) y del ruteo (R4) necesita una sesión interactiva con `AskUserQuestion`: no se puede probar con `claude -p`. Lista corta para el autor, en un proyecto con pignolo activo y pignolo-ui instalado:

1. "Cambiá un color en una línea" -> carril `trivial`, **sin** pregunta de salida.
2. "Hacé este cambio grande directamente, sin pignolo" -> **pregunta igual** (la palabra "directamente" no cuenta).
3. Tras elegir "Hacerlo directo" en (2), pedir otro cambio, más grande -> **vuelve a preguntar**.
4. "Mejorá este prototipo" con el archivo bajo `.pignolo-ui/` -> `pignolo-ui:improve`, sin copia de git ni `risk.js`.
5. Lo mismo con pignolo-ui desinstalado (o `claude --plugin-dir` solo del núcleo) -> pregunta con la razón y "Instalar pignolo-ui" primero.
6. "armá un plan" -> `pignolo:plan` y el plan no sale en el chat.

Se registra el resultado en `tests/manual/` si el autor quiere dejarlo (no se agrega archivo sin pedido).

## Riesgos

- **Que `entry` pregunte demasiado** (el autor valora la velocidad). Cómo lo evita el plan: (1) la pregunta nace **solo** en R1 (pedido no trivial que quedaría fuera de toda skill); no cuelga de un paso por el que pase todo pedido; (2) lo trivial no cambia: la definición del paso 7 queda intacta y el caso 3 de T1 la protege, y la línea dice que lo trivial, lo de solo lectura y lo entregado a una skill nunca reciben la pregunta; (3) un pedido que va a pignolo-ui o a `plan` ya tiene su camino y no suma pregunta (la de pignolo-ui del paso 0 ya existía y R3 la reutiliza como la confirmación, sin duplicar); (4) una sola pregunta por pedido (no se repregunta dentro del mismo pedido). Costo aceptado: un pedido distinto o más grande vuelve a preguntar, que es lo que decidió el autor.
- **Que el agente siga tomando "directamente" como sí.** Mitiga el texto (R2) y lo vigila el test del caso 2 de T1, pero un texto no es una guardia: es una instrucción que el modelo puede seguir mal. Queda **E0** hasta que el autor haga T7 (puntos 2 y 3) y, si hace falta, una medición con sesión interactiva. No se agrega un hook (el aviso por agentes sin flujo se descartó).
- **Que la viñeta de `.pignolo-ui/` rompa `skills-no-runs-commit`** por las palabras `commit`/`stage` cerca de la ruta: el texto está escrito sin ellas y el caso 3 de T2 lo prueba.
- **Que `improve`/`new` no admitan como blanco un archivo bajo `.pignolo-ui/`:** se lee en T2 y, si es así, se agrega una línea; si no se puede comprobar sin correr la skill, queda "no probado" y T7 punto 4 lo cubre.
- **Que `plan` se active en frases que no piden un plan** ("el plan del hito 3", "el plan Básico"): T4/T5 incluyen cuatro negativas con la palabra "plan" y T6 solo cambia la `description` si hace falta.
- **El tratamiento de `entry` no se puede medir con el montaje actual** (proyecto vacío, solo herramienta Skill): T5 mide qué skill se elige, no que el flujo posterior se respete. Declarado.

## Revisión (reglas del repo)

- **Qué toca:** textos de `entry` (núcleo) y de `activation.md` (pignolo-ui), casos de evals, versiones. **No toca la guardia de git, borrados, movimientos ni privacidad** (`NO-RUNS-COMMIT` queda igual; solo se remite a él).
- **Auditoría previa del plan (`plan-auditor`): no corresponde.** CLAUDE.md la reserva para hitos de riesgo (guardia, borrados, respaldos); este plan cambia texto de una skill y casos de prueba, con tests de forma cuyo rojo se demuestra rompiendo la cláusula. Si el autor quiere un freno extra, es opcional y barato (≈ 1,5 a 2,5 USD, `tests/evals/RESULTS-planes.md`).
- **Revisión opus única al final**, sobre el diff armado por script (CLAUDE.md), con una pasada de arreglos de críticos e importantes (menores a `docs/gaps.md`). Pedir al revisor, como test que falla, lo determinista (p. ej. una cláusula que permita heredar el "directo"); lo que dependa de una decisión del autor, en prosa.
- **Suite completa una sola vez por rama** (`npm test`), la corre el controlador con la máquina quieta, sobre la rama unida con `main` y después de los arreglos. Cada ejecutor corre solo los archivos nombrados en cada tarjeta. Nunca `node --test tests/`.
- **Autochequeo del ejecutor (máx. 5, con evidencia):** (1) cada línea nueva de skill está en inglés y ninguna junta `.pignolo-ui` con `commit`/`stage`/`git add`/`back up` (correr `tests/skills-no-runs-commit.test.js`); (2) `RNL-02`/`RNL-03`/`RNL-04` siguen verdes; (3) los archivos tocados son UTF-8 y conservan los acentos (`armá`, `hacé`); (4) ningún lector quedó con la forma vieja: `grep` de `for this request (` en `entry` y de `honors it for that request (` en `activation.md`; (5) cada afirmación del informe marcada "probado" o "no probado" (la pregunta real y el ruteo real, no probados hasta T7).
