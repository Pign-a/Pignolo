# Ficha: cuándo revisar al ejecutar un plan (`momento-de-revision`)

_Ficha escrita el 2026-10-02, antes de cualquier corrida (protocolo de pruebas, `docs/protocolo-de-pruebas.md`). Estado: **sin correr**. Las cifras marcadas (I) son estimaciones; las marcadas (M) salen de `git` sobre este repo._

## Resumen en llano

`execute-plan` (hito 7b, Task 12) hoy dice: sin revisión por tarea, una revisión al final del plan. Las alternativas son revisar tras cada tarea o revisar una sola vez un grupo de planes chicos. Esta prueba toma un plan ya ejecutado con defectos conocidos y arreglados (núcleo 7a) y tres planes chicos seguidos (pignolo-ui 0.7.3, 0.7.4 y 0.7.5), y mide **qué encuentra el mismo revisor** según cuándo mira.

Es una prueba **retrospectiva**: mide detección, costo y tiempo de revisar. **No puede medir** lo que se ahorra por arreglar antes, porque el código ya está escrito. Sobre eso hay un dato previo sin costo (§9): en estos hitos, casi ningún arreglo tuvo que tocar líneas escritas por una tarea posterior a la que introdujo el defecto (3 líneas en un caso).

## 1. Pregunta e hipótesis

**Pregunta.** Con el mismo revisor, ¿revisar tras cada tarea detecta más defectos importantes conocidos que una revisión al final del plan? ¿Y una sola revisión para un grupo de planes chicos detecta lo mismo que una por plan, por menos?

**Hipótesis (sentido esperado).**

- H1: por tarea detecta al menos 2 defectos más de los 11 del 7a que al final, porque cada revisión recibe un diff 5 a 10 veces más chico; pero pierde los defectos repartidos entre tareas (7a-I6, I7).
- H2: la revisión del grupo detecta a lo sumo 1 defecto menos de los 7 de pignolo-ui que las tres revisiones por plan, con al menos 30 % menos de costo.

## 2. Variable y lo que queda fijo

**Variable única:** el momento y el alcance de la revisión, o sea, qué commit se congela y qué diff recibe el revisor.

**Fijo:** el revisor (la lente `reliability`, carta de `main` `7cc2f03`, opus, nivel `high`), el texto del despacho, la forma de armar la instantánea, el calificador, la máquina. Entre brazos solo cambian el SHA, el diff y la tarjeta (la de la tarea, la del plan o las de los planes): esa diferencia **es** la variable.

**Por qué una sola lente.** Con dos o más, el presupuesto no alcanza para tres repeticiones. `reliability` está en todos los conjuntos candidatos de la ficha `lentes-reales`. Supuesto declarado: el efecto del momento no depende de la lente. Si `lentes-reales` decide mantener el conjunto completo, esta prueba vale igual para la comparación relativa entre momentos, pero no para el número absoluto de defectos.

**Fuera, y declarado:** `testability` (corre tests; los 2 defectos de test de 0.7.5 quedan fuera del alcance y se informan aparte), refutador, `fixer`, y el revisor generalista opus con Bash del método de desarrollo de este repo, que no es el del producto.

## 3. Casos

**Regla de elección (antes de ver resultados).** Para "por tarea contra al final": el hito con más defectos importantes arreglados con test y con un commit por tarea, que es el núcleo 7a (11). Para "grupo de planes chicos": la única secuencia del repo de planes chicos consecutivos con revisión y arreglos, que son pignolo-ui 0.7.3, 0.7.4 y 0.7.5 (los dos últimos se revisaron juntos en la realidad). El núcleo 8d (5 defectos, 10 tareas) queda como ampliación si sobra presupuesto (§11).

**Qué se revisa en el brazo por tarea.** Todo commit del plan que cambie al menos un archivo fuente que no sea de test. Los commits solo de tests, documentación o versión no llevan lente (en el producto son riesgo bajo: lectura estructural del orquestador), y cuentan con costo 0 y detección 0.

### Plan 7a (base `56799f1`, punta previa a los arreglos `c3e45af`; 49 archivos, +5543) (M)

| Tarea | Commit ← padre | Fuente | Defectos atribuidos |
|---|---|---|---|
| 1 | `79fa823` ← `8d4119f` | +79 | ninguno |
| 2 | `29ae5b1` ← `79fa823` | +238 | I10; I6 (por omisión: los lectores viejos de `run.task`) |
| 3 | `c8a4c30` ← `29ae5b1` | +262 | I11; I7 (compartido) |
| 4 | `025b2b0` ← `c8a4c30` | +233 | ninguno |
| 7 | `f10bf1d` ← `025b2b0` | +102 | ninguno importante (menor M8) |
| 8 | `26705eb` ← `f10bf1d` | +176 | I1, I2, I3 |
| 10/16 | `0fb7d94` ← `26705eb` | +110 | I6 (parte de `next.js`) |
| 5/6 | `f8222ec` ← `0fb7d94` | +798 | I5, I9; I7 (compartido) |
| 9 | `cd7f910` ← `f8222ec` | +418 | I4, I8; I7 (compartido) |
| sin lente | `f82ae76`, `c3e45af` (solo tests y documentación), `7fcba8f` (merge) | | |

Atribución: `git blame <arreglo>^` sobre las líneas de código que el arreglo borra o cambia (o las 3 de contexto de cada lado si solo agrega); si son anteriores al hito, el commit que nombra la revisión. De los 11 defectos, 9 son locales a una tarea y 2 están repartidos (I6, I7).

### Grupo pignolo-ui (base `69e4c44`, punta `12659b1`; 65 archivos, +1901) (M)

| Plan | Diff | Defectos |
|---|---|---|
| P1, 0.7.3 | `69e4c44..731ac8d` (un solo commit) | ui073-I1 a I6 |
| P2, 0.7.4 | `731ac8d..f80b6fd` (+134) | A-1 |
| P3, 0.7.5 | `f80b6fd..12659b1` (+1386) | B-1 y B-2, de test: fuera del alcance de la lente |

En `12659b1` siguen presentes los 9 defectos: los arreglos de 0.7.3 (`ce38376`, `d89c1f7`) entraron después. El brazo por tarea no se corre en este grupo: P1 es un solo commit (por tarea y al final son la misma corrida), y P2 y P3 suman un solo defecto al alcance de la lente.

## 4. Verdad de referencia y regla de emparejamiento

| Defecto | Arreglo | Test que falla sin él |
|---|---|---|
| 7a-I1, I2, I3 | `bfb52ba` | `tests/guard-queue.test.js` |
| 7a-I4 | `6e82bee` | `tests/branch-cleanup.test.js` |
| 7a-I5 | `e31531c` | `tests/queue.test.js` |
| 7a-I6 | `82fefa0` | `tests/multi-task-readers.test.js` |
| 7a-I7 | `bd760f3` | `tests/real-paths.test.js` |
| 7a-I8 | `a352045` | `tests/session-start-branches.test.js` |
| 7a-I9 | `81b70ee` | `tests/queue.test.js` |
| 7a-I10 | `fbe3df2` | `tests/run-lifecycle.test.js` |
| 7a-I11 | `a19abae` | `tests/worktree.test.js` |
| ui073-I1, I2 | `ce38376` | `plugins/pignolo-ui/tests/sample-data-fixes.test.mjs` |
| ui073-I3 a I6 | `d89c1f7` | mismo archivo |
| A-1 | `1e47b65` (test en `8da669f`) | `plugins/pignolo-ui/tests/review-keep-menu.test.mjs` |
| B-1, B-2 (fuera de alcance) | `3fa4ecc`, `79c820e` | `run-cli.test.mjs`, `hito-4f-acceptance.test.mjs` |

7a-I12 no entra: es una decisión del autor y no se arregló. **En alcance: 11 (7a) + 7 (pignolo-ui) = 18.**

Fichas de defecto, chequeo previo del rojo y regla de emparejamiento: los de la ficha `lentes-reales` §4, sin cambios (misma conducta errónea que comprueba el test del arreglo; "detectado" exige BLOCKER o CRITICAL). Un defecto cuenta como detectado por el brazo por tarea si empareja en la revisión de **cualquier** tarea. Los textos de las revisiones están en el scratch de la sesión y se copian a `local/` antes de correr.

## 5. Instantánea: que el revisor no vea el futuro

La de `lentes-reales` §5: carpeta fuera de todo repo con `tree/` (`git archive` del commit congelado, sin `.git`), `brief/diff.patch` (archivos fuente que no son de test), `brief/files.txt`, `brief/task-card.md`; sesión abierta en una carpeta vacía; chequeo de fuga por script sobre cada transcripción.

| Brazo | Commit congelado | Diff | Tarjeta |
|---|---|---|---|
| Por tarea | el de la tarea | padre..commit | mensaje del commit y sección de la tarea en el plan |
| Al final del plan | la punta del plan (`c3e45af`; `731ac8d`, `f80b6fd`, `12659b1`) | base del plan..punta | el plan entero (Review Focus y tareas) |
| Grupo | `12659b1` | `69e4c44..12659b1` | los tres planes |

En el brazo por tarea, `tree/` no contiene las tareas posteriores: es lo que habría visto una revisión hecha en ese momento. En ningún brazo están los arreglos ni las revisiones. El texto del despacho es el de `lentes-reales` §5, idéntico en los tres brazos.

## 6. Brazos

| Brazo | Qué es | Corridas por repetición |
|---|---|---|
| **F, control** | Una revisión al final de cada plan: lo que dice hoy la Task 12 | 7a: 1. pignolo-ui: 3 (P1, P2, P3) |
| **T** | Una revisión tras cada tarea con código | 7a: 9 |
| **G** | Una sola revisión para el grupo de planes chicos | pignolo-ui: 1 |

Comparaciones declaradas: **T contra F en el 7a** y **G contra F en pignolo-ui**. Ninguna otra.

## 7. Repeticiones, orden y máquina

**3 repeticiones por corrida de cada brazo.** Excepción: si la sonda de F-7a pasa de 300 mil de contexto final, F-7a corre 2 veces y esa comparación baja a E2, como manda el protocolo.

**Corridas que se reusan de `lentes-reales` etapa B** (mismas instantáneas, misma lente, mismo despacho): `reliability` × 3 sobre `26705eb`, `cd7f910`, `025b2b0` y `731ac8d`. Si esa etapa no corrió, se corren acá (+12 corridas, ≈ 0,5 M).

| Bloque | Corridas nuevas |
|---|---|
| T-7a | 6 tareas × 3 = 18 |
| F-7a | 3 (o 2) |
| F-ui | P2 y P3 × 3 = 6 (P1 se reusa) |
| G-ui | 3 |

**Sonda (1 corrida):** F-7a, repetición 1. Frenos: bloque `json` válido, chequeo de fuga, contexto final medido. Cuenta como repetición si pasa.

**Orden.** La lista `bloque|corrida|rep`, ordenada alfabéticamente, se baraja con `mulberry32(20261003)`. De a **2 agentes** a la vez como máximo, sin otros agentes en la máquina; si los hay, se anota cuántos. Como el orden está barajado, la carga pega parejo en los brazos. **Nunca a la vez que el experimento de ejecución.**

Nada se califica hasta que terminen todas las corridas.

## 8. Calificación a ciegas

El procedimiento de `lentes-reales` §8, con dos agregados:

- El script de extracción borra además el número de línea de cada `location` y deja archivo y función: los números de línea difieren entre el árbol de una tarea y la punta, y delatarían el brazo.
- Se mezclan en un mismo lote los hallazgos de T, F y G de un mismo plan. El calificador no sabe de qué brazo viene cada uno.

Calificador 2 sobre el 30 % (mínimo 25 hallazgos), acuerdo publicado; con menos de 85 %, califica todo y los desacuerdos cuentan como no emparejados.

Por repetición compuesta `r`: T = unión de los hallazgos de la repetición `r` de las 9 tareas; F-ui = unión de la repetición `r` de P1, P2 y P3.

## 9. Métricas

| Métrica | Unidad | Cómo |
|---|---|---|
| **Principal: detección** | defectos importantes conocidos detectados (de 11 en el 7a; de 7 en pignolo-ui), por repetición compuesta | mediana y rango |
| Repartidos y locales | lo mismo, separando I6 e I7 (repartidos) de los 9 locales | script |
| Alarmas sin respaldo | BLOCKER o CRITICAL sin emparejar, por brazo y por repetición | script; repro a ciegas de hasta 12 solo si cambian la lectura |
| Costo | tokens ponderados y suma de contexto final por brazo | `usage.js` del scratch de la sesión, cortado en la primera entrega |
| Tiempo de revisar | minutos por brazo: en T y F-ui, la suma de sus corridas (cada revisión frena lo que sigue); en F y G, la corrida | transcripción |
| Momento de detección | para cada defecto que T detecta, en qué tarea | script |

**Unidad de costo: tokens ponderados de la transcripción**, la misma de `lentes-reales`. Acá no hay USD: todo corre con agentes de la suscripción. Para pasar a dinero se usa el cociente que mida la etapa A de `lentes-reales`. La salida no está medida.

**Lo que no se puede medir hacia atrás:**

- El ahorro por arreglar antes: retrabajo evitado y defectos que no se propagan a tareas posteriores.
- El costo de las rondas de `fixer` por tarea, y si un arreglo temprano cambia lo que escriben las tareas siguientes.
- Si el ejecutor trabaja distinto sabiendo que lo revisan tras cada tarea.
- El contexto que le suma al orquestador despachar 9 revisiones en vez de 1.

**Dato previo sobre el ahorro (E1, obtenido al atribuir los defectos, 0 tokens).** En los commits que arreglan los importantes de 7a, 8d y pignolo-ui 0.7.3 a 0.7.5, las líneas de código que cada arreglo cambió pertenecen a la tarea que introdujo el defecto o a código anterior al hito. Excepciones: 7a-I6, cuyo arreglo tocó además 3 líneas de una tarea posterior que repitió la forma vieja (`0fb7d94`); 8d-I-4, repartido entre tres tareas; y una línea de una skill en el arreglo de 0.7.3. De los 16 importantes de 7a y 8d, 12 son locales a una tarea y 4 están repartidos o son omisiones (7a-I6, I7; 8d-I-3, I-4). En esta muestra, entonces, arreglar al final casi no obligó a rehacer trabajo de tareas posteriores. Límite: son planes con tareas de archivos casi disjuntos, y el dato no ve el retrabajo que no dejó rastro en el arreglo.

**¿Parte prospectiva?** No ahora. Solo si T gana por detección: el primer plan real que corra `execute-plan` se ejecuta con revisión por tarea y se anotan las rondas de `fixer` y los minutos; es observación (E1), no experimento. Un A/B prospectivo pide ejecutar el mismo plan dos veces por brazo, y la varianza entre ejecuciones iguales ya medida (≥ 15 % en costo, ≥ 60 % en tiempo) se come el efecto.

## 10. Regla de decisión

**T contra F (7a, 11 defectos).**

- **Se adopta la revisión por tarea** si la mediana de T supera a la de F en al menos 2 defectos **y** el mínimo de T es mayor que el máximo de F. Si además T cuesta más de 3 veces lo que F en tokens ponderados, la decisión pasa al autor con las dos cifras (costo).
- **Queda la revisión al final** si F ≥ T o si los rangos se pisan: "sin diferencia demostrada", y se decide por lo más simple, que es lo que ya dice la Task 12 y lo que menos agentes despacha.
- Si T gana en los 9 locales y F en los 2 repartidos, se publica tal cual. La combinación "por tarea más una pasada final" no es un brazo de esta prueba: queda como hipótesis.

**G contra F (pignolo-ui, 7 defectos).**

- **Se permite agrupar planes chicos** si la mediana de G es ≥ la de F menos 1, los rangos se pisan **y** G cuesta a lo sumo 70 % de F.
- **No se agrupa** si G detecta 2 o más defectos menos con rangos que no se pisan, o si no ahorra el 30 %: una revisión por plan es lo más simple porque no pide un concepto nuevo en el producto.

## 11. Presupuesto, duración y alcance

| Bloque | Corridas | Contexto final (I) |
|---|---|---|
| T-7a | 18 | ≈ 0,95 M (≈ 45 mil por corrida; `f8222ec` ≈ 90 mil) |
| F-7a | 3 | ≈ 0,75 M (≈ 250 mil por corrida) |
| F-ui | 6 | ≈ 0,35 M |
| G-ui | 3 | ≈ 0,33 M |
| Calificación | 2 a 3 agentes | ≈ 0,25 M |
| **Total** | 30 + calificación | **≈ 2,6 M** (≈ 3,1 M si no hay corridas para reusar) |

Tope: 3,0 M (3,3 M sin reuso). Duración (I): ≈ 1,5 a 2 h de corridas de a 2, más 30 min de calificación.

**Si se agota:** tras F-7a y las primeras 6 corridas de T se proyecta el total. Si pasa del tope, se recorta en este orden: F-7a a 2 repeticiones (E2); después, el grupo de pignolo-ui a 2 repeticiones. Lo cortado se anota.

**Ampliación si sobra** (declarada ahora, para no elegirla después): T contra F sobre el núcleo 8d (base `6d7917b`, punta `46d6ac3`, 5 defectos: I-1 a I-5), con la misma regla, como réplica en un segundo plan. ≈ 1,7 M (I).

**Alternativa barata (≈ 1,0 M, E2):** solo el 7a, 1 corrida de F y, de T, 1 corrida de las 5 tareas con defectos atribuidos. Decide solo si la diferencia es de 4 defectos o más.

**Mínimo sin tokens (E1):** el dato previo de §9, que ya está: 12 de 16 defectos eran locales a una tarea y solo un arreglo tocó trabajo de una tarea posterior (3 líneas).

**Qué puede concluir.** Si la lente `reliability`, leyendo, detecta más defectos importantes conocidos con un diff por tarea que con el diff entero de un plan de 9 tareas y +5543 líneas, y a qué costo; y si revisar tres planes chicos juntos pierde detección frente a revisarlos uno por uno. Nivel: **E3 acotado** (3 repeticiones, una variable, calificación a ciegas; un plan y un grupo) o **E2** en la comparación que quede con 2 repeticiones.

**Qué no puede concluir.** El ahorro por arreglar antes (solo el dato E1); nada con el conjunto completo de lentes ni con `testability`; planes de otro tamaño, otros repos; el efecto sobre el ejecutor; el costo del orquestador.

## 12. Amenazas a la validez

- **Un plan y un grupo.** El 7a decide solo T contra F; el resultado puede depender de ese plan. Mitigación declarada: la ampliación con 8d.
- **Retrospectivo:** el brazo T revisa un código que nunca recibió arreglos tempranos. En un flujo real, lo que T encuentra en la tarea 2 cambiaría las tareas 3 a 9.
- **Verdad de referencia de un solo revisor opus generalista**, que revisó el diff entero al final. Sus hallazgos pueden parecerse más a lo que ve una revisión al final, lo que sesga **a favor de F**. Los defectos que nadie encontró no cuentan; las alarmas sin respaldo de T pueden ser defectos reales nuevos (por eso el repro a ciegas).
- **Más corridas, más chances:** T tiene 9 corridas por repetición y F una. Es parte del método que se compara, no un error; por eso se informan el costo y las alarmas junto a la detección.
- **Dilución en F:** un diff de 5543 líneas puede pasar el contexto útil de la lente. Es un efecto real del brazo, pero depende de cómo se le entrega el diff (acá: lista de archivos y diff de las fuentes, como manda la skill).
- **Una sola lente** y sin `testability`: 2 de los 9 defectos de pignolo-ui quedan fuera de alcance.
- **P1 domina el grupo:** 6 de los 7 defectos de pignolo-ui vienen de un solo commit.
- **Calificador de la misma familia**; el acuerdo se publica y el ancla es el test del arreglo.
- **Carga de la máquina:** afecta al tiempo, que es secundario y no decide.
- **Costo:** la salida no está medida; no hay USD.
- **Corridas reusadas de otra prueba:** mismas instantáneas y despacho, pero otro día y otra carga.

## Registro

Una fila por corrida en el CSV de la prueba: `experimento, bloque, brazo, plan, commit, rep, orden, inicio, minutos, turnos, contexto_final, ponderado, valida, motivo, reusada_de`. Una fila por hallazgo: `codigo, plan, gravedad, emparejado_con, calificador_1, calificador_2`. Resultados, también los negativos, en este archivo y en `docs/benchmarks.md`.
