# Ficha: cuántas lentes en la revisión de riesgo alto (`lentes-reales`)

_Ficha escrita el 2026-10-02, antes de cualquier corrida (protocolo de pruebas, `docs/protocolo-de-pruebas.md`). Estado: **sin correr**. Las cifras marcadas (I) son estimaciones; las marcadas (M) salen de `git` sobre este repo._

## Resumen en llano

Hoy una revisión de riesgo alto despacha cinco lentes. La auditoría (R8) propuso dos (reliability + testability) y un refutador. La única medición que hay es sintética y está saturada (30/30). Esta prueba usa **defectos reales**: commits de tareas de este repo en los que la revisión final opus encontró defectos importantes que después se arreglaron con un test que falla sin el arreglo.

Lo que se puede y no se puede con el tope de 5 USD:

- Una corrida de lente sobre un diff real cuesta ≈ 0,25 a 0,45 USD (I), contra 0,08 a 0,12 en los fixtures sintéticos. **5 USD pagan ≈ 12 corridas**: una sola corrida por lente en 3 casos. Eso es **E2** y solo puede mostrar una diferencia grande.
- Para llegar a **E3** (3 repeticiones) hacen falta 84 corridas. La ficha las plantea con agentes de la suscripción (0 USD, ≈ 3,8 M de contexto final (I)). **Gastar ese cupo es decisión del autor.** Sin ese OK corre solo la etapa A y el resultado se publica como E2.

## 1. Pregunta e hipótesis

**Pregunta.** En una revisión de riesgo alto, ¿las lentes `risk`, `resilience` y `readability` encuentran defectos importantes reales que `reliability` no encuentra?

**Hipótesis (sentido esperado).** El conjunto reducido pierde a lo sumo 1 de los 14 defectos importantes conocidos frente al conjunto completo, en las tres repeticiones. Si la hipótesis se cumple, las tres lentes extra cuestan ≈ 3/5 del gasto de lentes sin detección que lo pague.

## 2. Variable y lo que queda fijo

**Variable única:** el conjunto de lentes cuyo resultado se une.

**Diseño anidado.** El conjunto reducido es un subconjunto del completo, y en el producto cada lente es un agente aparte que no ve a las otras (skill `review`, paso 5). Por eso no se corre "un brazo y después el otro": se corre **cada lente por separado** y los brazos se arman uniendo resultados. Ventajas: la lente común (`reliability`) es la misma corrida en los dos brazos, así que la varianza entre corridas no se confunde con el efecto; y no hay diferencia de encargo entre brazos, porque los brazos no reciben encargo.

**Fijo:** casos y sus commits (§3), carta de cada lente tal como está en `main` `7cc2f03` (último cambio de las cuatro cartas: `ea309a8`), modelo opus, nivel `high`, texto del despacho (§5), instantánea por caso, máquina.

**Fuera de la variable, y declarado:**

- `testability` está en los dos conjuntos (completo y R8) y corre tests con Bash: no cambia la diferencia entre brazos y no se corre. Consecuencia: la pérdida medida es una **cota superior** (un defecto que solo encontró una lente extra quizás también lo encontraba `testability`), o sea, sesgo **a favor** del conjunto completo. Los defectos de test (B-1 y B-2 de la revisión de 0.7.5) quedan fuera de la lista.
- El refutador: `balanced` y la propuesta R8 usan uno los dos, así que no es parte de esta variable. No se mide (ver §11).
- Jueces, `fixer`, `test-writer`: fuera.

## 3. Casos

**Regla de elección (escrita antes de ver ningún resultado).** Universo: los commits de tarea de los cuatro hitos con revisión final y arreglos con test (núcleo 7a, núcleo 8d, pignolo-ui 0.7.3, pignolo-ui 0.7.4 + 0.7.5).

1. *Atribución.* Un defecto importante arreglado pertenece al commit de tarea al que `git blame <arreglo>^` atribuye la mayoría de las líneas de código (no de test) que el arreglo borra o cambia; si el arreglo solo agrega, las 3 líneas de contexto de cada lado. Si esas líneas son anteriores al hito (defecto por omisión), pertenece al commit del hito que nombra la revisión. Un defecto repartido entre varias tareas cuenta en cada una ("compartido").
2. *Casos con defecto.* Commits con al menos un defecto importante atribuido, que no sea solo de test, y entre 100 y 450 líneas agregadas de código fuente (el rango en el que una revisión con lentes recibe el diff entero o casi). A lo sumo **2 por hito**: los de más defectos; en empate, el de menos líneas.
3. *Casos limpios.* Commits de los mismos hitos, 100 a 450 líneas de fuente, a los que ningún arreglo toca una línea y cuyo código nuevo no cita ningún hallazgo (importante o menor) de la revisión. Uno por hito, el primero en la historia.

**Casos con defecto (5 casos, 14 defectos importantes).** (M)

| Caso | Commit ← padre | Hito | Fuente | Defectos conocidos (id de la revisión) | Arreglo y test que falla sin él |
|---|---|---|---|---|---|
| D1 | `731ac8d` ← `69e4c44` | pignolo-ui 0.7.3 | +111 | ui073-I1, I2 | `ce38376`, `plugins/pignolo-ui/tests/sample-data-fixes.test.mjs` |
| | | | | ui073-I3, I4, I5, I6 | `d89c1f7`, mismo archivo |
| D2 | `26705eb` ← `f10bf1d` | núcleo 7a | +176 | 7a-I1, I2, I3 | `bfb52ba`, `tests/guard-queue.test.js` |
| D3 | `cd7f910` ← `f8222ec` | núcleo 7a | +418 | 7a-I4 | `6e82bee`, `tests/branch-cleanup.test.js` |
| | | | | 7a-I8 | `a352045`, `tests/session-start-branches.test.js` |
| | | | | 7a-I7 (compartido con otras dos tareas) | `bd760f3`, `tests/real-paths.test.js` |
| D4 | `3cf2ea5` ← `efca017` | núcleo 8d | +359 | 8d-I-2 | `88a257b`, `tests/ref-scan.test.js` |
| D5 | `553541a` ← `54f86bc` | núcleo 8d | +141 | 8d-I-4 | `75c5089`, `tests/init-adapt.test.js`, `tests/init-cli.test.js`, `tests/skill-init.test.js` |

**Casos limpios (2).** L1 `025b2b0` ← `c8a4c30` (7a, `lib/waves.js`, +233). L2 `7a2f29f` ← `d6014c0` (8d, `lib/places.js` y el mapa de lugares, +178). pignolo-ui no tiene ninguno que cumpla la regla.

**Lo que la regla deja afuera, a la vista:** `f8222ec` (7a-I5, I9; +798) y `efca017` (8d-I-1; +605) por tamaño; `29ae5b1` y `c8a4c30` por el tope de 2 por hito; `d6014c0`, `859d5df`, `6bddedc` por tener menos de 100 líneas; `7bb593d` por tener solo defectos de test. Los cuatro primeros entran en la ficha `momento-de-revision`.

**Textos de las revisiones** (lista de defectos, causa y repro): están en el scratch de la sesión (`h7a-final-review.md`, `h8d-final-review.md`, `ui073-final-review.md`, `revui/review.md`), fuera del repo. Antes de correr se copian a `local/` (no versionado) junto con las fichas de defecto.

## 4. Verdad de referencia y regla de emparejamiento

**Ficha de defecto** (una por defecto, escrita antes de correr, por script más una frase copiada de la revisión): id; archivo y rango de líneas en la instantánea del caso (las líneas que el arreglo cambia, ± 10); una frase con la conducta errónea observable; el código del test del arreglo; y la lista de menores conocidos del mismo commit (7a-M5, M13, M15 en D3; 8d-M-3, M-9 en D4; 8d-M-1 en D5; los menores de `ui073` en D1).

**Chequeo previo, sin agentes:** las líneas defectuosas atribuidas al commit existen en `tree/` del caso; y, para cada defecto, el test del arreglo aplicado sobre la punta previa al arreglo (`c3e45af`, `46d6ac3`, `12659b1`) da rojo, y sobre el commit del arreglo da verde. Un defecto cuyo test no da rojo se saca de la lista y se anota.

**Regla.** Un hallazgo **empareja** con un defecto solo si describe la misma conducta errónea que comprueba el test del arreglo: el mismo camino de código y la misma condición que lo dispara (o una contenida en ella). No empareja el que nombra la función correcta con otra falla, ni una duda genérica ("puede fallar con entradas raras"). Un hallazgo empareja a lo sumo con un defecto. Para 7a-I1, que es una tabla de formas, alcanza con nombrar una forma que el test cubre.

- **Detectado (métrica principal):** emparejado y con gravedad BLOCKER o CRITICAL, que es lo único que en el producto llega al test de repro y al `fixer`.
- **Visto (secundaria):** emparejado con cualquier gravedad.

## 5. Instantánea: que el revisor no vea el futuro

Por caso, un script arma una carpeta fuera de todo repositorio:

- `tree/`: `git archive <commit de la tarea>` desempaquetado. Sin `.git`. Es el árbol en el momento de la tarea: no contiene tareas posteriores, ni el arreglo, ni la revisión.
- `brief/diff.patch`: `git diff <padre>..<commit>` de los archivos fuente que no son de test. `brief/files.txt`: `--numstat` de todos los archivos. Es la forma que manda la skill para diffs de más de 400 líneas, aplicada igual a todos los casos.
- `brief/task-card.md`: el mensaje del commit y, si un plan dentro de `tree/` nombra esos archivos, su sección de tarea, extraída por script.

La sesión que despacha se abre en una carpeta vacía fuera del repo, sin flujo de pignolo abierto. El nombre de la carpeta del caso es un código neutro.

**Texto del despacho, idéntico en todas las corridas** (solo cambian los valores entre `<>`):

```
Review this change through your lens.
Frozen SHA: <sha>. Worktree (its files are that SHA): <dir>/tree
Risk level: high.
Task-card: <dir>/brief/task-card.md
Changed files: <dir>/brief/files.txt
Diff <base>..<sha> of the non-test source files: <dir>/brief/diff.patch
Read only inside <dir>. There is no git history here.
```

**Chequeo de fuga por script, sobre la transcripción de cada corrida:** toda ruta de Read, Grep o Glob cae dentro de `<dir>`, y no se usó otra herramienta. Si no, la corrida es inválida: se anota, se repite una vez y las dos quedan en el registro.

El repo es posterior a la fecha de corte del modelo, así que el arreglo no puede venir de su entrenamiento.

## 6. Brazos

| Brazo | Qué es | Se arma con |
|---|---|---|
| **A, control** | Vigente en `balanced` y `max`: todas las lentes | `reliability` ∪ `risk` ∪ `resilience` ∪ `readability` |
| **B, reducido** | Propuesta R8 | `reliability` |
| C, secundario | Lente base de `economy` | `risk` |

`testability` es común a todos y no se corre (§2). La diferencia exacta entre A y B es: se dejan de unir los hallazgos de `risk`, `resilience` y `readability`. Solo A, B y C están declarados. Cualquier otro subconjunto que se mire después es exploración (E1), porque elegir el mejor de 16 subconjuntos con los datos a la vista es sobreajuste.

## 7. Etapas, repeticiones y orden

**Sonda (suscripción, 1 corrida):** `reliability` sobre D2. Frenos: el bloque `json` vuelve y es válido; el script de uso lee la transcripción; el chequeo de fuga funciona; contexto final ≤ 90 mil. Si alguno falla, se frena y vuelve al autor.

**Etapa A, paga (tope 5 USD en total).** Vía `claude plugin eval`, que carga la carta real del agente con sus herramientas y su esfuerzo. Casos D1, D2 y D5 (el de más defectos de cada hito; en empate, el de menos líneas), 4 lentes, **1 corrida**: 12 corridas. Antes, una sonda paga de 1 corrida con `--max-cost-usd 0.6`; si cuesta más de 0,37 USD, la etapa baja a D1 y D2 (8 corridas). La etapa corre con `--max-cost-usd 4.4 -j 2 --keep-temp`. Los graders del caso solo comprueban el despacho y el bloque `json`; la detección se califica después, a ciegas, sobre las trazas. Hace falta un generador de casos como `tests/evals/review-cases.js` cuyo fixture sea la instantánea (trabajo previo, sin costo de agentes).

**Etapa B, suscripción (solo con el OK del autor).** 7 casos × 4 lentes × **3 repeticiones** = 84 corridas. Las cartas instaladas en la caché del plugin no son las de `main` (M: los archivos difieren), así que cada corrida es un agente de propósito general en opus cuyo encargo es el cuerpo de la carta de la lente en `7cc2f03` seguido del texto del despacho. Diferencia con el producto, igual para todas las lentes: las herramientas no están restringidas por la plataforma (se comprueba después por script) y el esfuerzo es el por defecto.

**Orden.** La lista de corridas `caso|lente|rep`, ordenada alfabéticamente, se baraja con `mulberry32(20261002)` y se corre en ese orden, de a 3 agentes a la vez como máximo. El barajado reparte por igual la carga de la máquina y el momento del día entre lentes y casos. Se anota cuántos agentes más había. **Nunca a la vez que el experimento de ejecución**, que mide tiempo.

**Nada se califica hasta que terminen todas las corridas de la etapa** (no se mira el resultado para decidir si seguir).

## 8. Calificación a ciegas

1. **Script de extracción.** Toma el bloque `json` de cada corrida, borra `lens` e `id`, le pone a cada hallazgo un código al azar y guarda aparte la clave (corrida ↔ código). Mezcla los hallazgos de todas las lentes y repeticiones de un mismo caso.
2. **Script de prefiltro.** Marca como candidato el hallazgo cuyo archivo es uno de los del defecto. No decide nada: solo ordena el trabajo del calificador.
3. **Calificador 1 (opus, agente nuevo, sin esta ficha).** Recibe por caso las fichas de defecto y los hallazgos codificados. Por hallazgo responde: id del defecto emparejado, id de un menor conocido, o `ninguno`. No sabe la lente, la repetición ni la etapa. Como `reliability` está en los dos brazos, de un hallazgo suelto no se puede deducir el brazo.
4. **Calificador 2 (otro agente opus, independiente).** Califica una muestra del 30 % elegida con la misma semilla, con un mínimo de 25 hallazgos y todos los casos representados. Se publica el acuerdo (porcentaje y kappa de Cohen sobre "empareja con un importante: sí o no").
5. **Si el acuerdo es menor a 85 %,** el calificador 2 califica todo. Todo hallazgo en desacuerdo cuenta como **no emparejado** (regla conservadora y pareja para todas las lentes) y se publican las dos cifras.
6. **Script final.** Con la clave, arma por repetición `r` los brazos (A = unión de la repetición `r` de las cuatro lentes; B = la repetición `r` de `reliability`) y calcula las métricas.

## 9. Métricas

| Métrica | Unidad | Cómo |
|---|---|---|
| **Principal: pérdida** | defectos importantes conocidos detectados por A y no por B, por repetición compuesta | script final; mediana y rango de las 3 |
| Detección por brazo | detectados de 14; también "vistos" | ídem; además el valor esperado con las tasas por lente (1 − Π(1 − p)) |
| Único estable | defectos que una lente extra detecta en ≥ 2 de 3 y `reliability` en 0 de 3 | script final, con el nombre de la lente |
| Alarmas sin respaldo | hallazgos BLOCKER o CRITICAL sin emparejar (ni importante ni menor conocido), por revisión; en los casos limpios, todos | conteo por script |
| Costo | tokens ponderados por corrida (entrada + 1,25 × escritura de caché + 0,1 × lectura), suma de contexto final, y USD por corrida en la etapa A | script de uso del scratch de la sesión (`usage.js`), cortado en la primera entrega |
| Tiempo | minutos por corrida; por brazo, el máximo de sus lentes (despacho en paralelo) | transcripción |

**Unidad de costo elegida: tokens ponderados de la transcripción.** Es la única que existe en todas las corridas de las dos fichas y del experimento de ejecución. Los USD de la etapa A sirven de ancla: dan el precio real de una lente sobre un diff real y el cociente USD por token ponderado, que incluye la salida. Las transcripciones registran ≈ 34 tokens de salida por turno, un valor que no es creíble: el ponderado es, en la práctica, costo de entrada, y se dice así.

**Una alarma sin respaldo no es todavía una falsa alarma:** la verdad de referencia viene de un solo revisor. Solo si el conteo cambia la lectura, un agente opus con Bash intenta el repro de hasta 12 alarmas distintas sobre una copia de la instantánea, sin saber la lente: CONFIRMADA o NO CONFIRMADA. Las confirmadas de lentes extra se informan aparte, como defectos nuevos que el conjunto reducido habría perdido.

## 10. Regla de decisión

Sobre la etapa B (14 defectos, 3 repeticiones compuestas). Como B está contenido en A, la pérdida nunca es negativa: la regla del protocolo "los rangos no se pisan" se aplica a la pérdida, no a los totales.

- **Se mantiene el conjunto completo** si la mediana de la pérdida es ≥ 3 defectos (≈ 20 %), el mínimo es ≥ 2 y hay al menos 2 únicos estables.
- **Se reduce a `reliability` + `testability`** si el máximo de la pérdida es ≤ 1 y no hay ningún único estable.
- **En el medio: "sin diferencia demostrada".** Se decide por lo más simple, como manda el protocolo: conjunto reducido en `balanced`, conjunto completo solo en `max`. La lente que haya hecho las detecciones únicas queda anotada como hipótesis (E1) para una prueba propia.
- **Aviso aparte, cualquiera sea el resultado:** si A detecta menos de 5 de 14 en la mediana, se publica que las lentes, leyendo, no reemplazan a la revisión final opus con experimentos. En ese caso la elección del conjunto es casi solo una cuestión de costo.

Con solo la etapa A (10 defectos, 1 corrida por lente, E2): se mantiene el conjunto completo si la pérdida es ≥ 3 de 10. Con menos, el resultado es "sin diferencia demostrada, sin repetición", y la reducción queda como recomendación débil a confirmar con la etapa B. La etapa A no puede demostrar que reducir es inocuo.

## 11. Presupuesto, duración y alcance

| Etapa | Corridas | Costo (I) | Duración (I) |
|---|---|---|---|
| Sonda | 1 | ≈ 45 mil de contexto | 5 min |
| A, paga | 1 + 12 | ≤ 5 USD (0,25 a 0,45 por corrida) | 20 a 30 min |
| B, suscripción | 84 | ≈ 3,8 M de contexto final (rango 2,5 a 5,9 M) | ≈ 2 h de a 3 |
| Calificación | 2 a 3 agentes | ≈ 0,25 M | 30 a 40 min |

**Si se agota:** la etapa A la corta el tope del comando; lo que haya corrido se publica con su número de corridas. En la etapa B, si tras las primeras 12 corridas la proyección pasa de 4,5 M, se quitan D5 y L2 (los dos casos más chicos de 8d) y se anota; si aun así no entra, se corre solo la repetición 1 de todo y la etapa baja a E2.

**Alternativa barata:** solo la sonda y la etapa A (≤ 5 USD, sin cupo de suscripción). Nivel E2.

**Qué puede concluir.** Si en diffs reales de este repo, de 100 a 450 líneas de fuente, las tres lentes extra agregan detección de defectos importantes sobre `reliability`, con qué dispersión entre corridas, y cuánto cuesta cada lente en un diff real. Nivel: **E3** con la etapa B; **E2** solo con la A.

**Qué no puede concluir.** Nada sobre `testability` ni sobre el refutador (para medir al refutador: una instancia sobre los hallazgos de la repetición 1 de cada caso y contar cuántos emparejados refuta; no entra en este presupuesto). Nada sobre diffs de más de 450 líneas, otros repos, otros lenguajes o lentes en sonnet. Tampoco el efecto sobre las rondas del `fixer`.

## 12. Amenazas a la validez

- **Verdad de referencia de un solo revisor opus.** Los defectos que nadie encontró no existen para la prueba. Además, el revisor original era generalista y probaba con experimentos: sus hallazgos se parecen más al foco de `reliability` que al de `resilience` o `readability`, lo que sesga **a favor de reducir**. Contrapeso parcial: las alarmas sin respaldo confirmadas (§9).
- **Misma familia de modelos** en el revisor original, las lentes y los calificadores. El ancla objetiva es el test del arreglo, y el acuerdo entre calificadores se publica.
- **Varios defectos no se ven leyendo** (7a-I7 e I8 salieron de experimentos con git real y con reloj): bajan la detección de los dos brazos por igual.
- **Muestra:** 5 commits, 14 defectos, un repo, un autor, JavaScript. D1 aporta 6 de los 14: se publica también el resultado sin D1.
- **Tamaño:** la regla deja afuera los commits grandes, donde la detección puede ser distinta.
- **Emparejamiento de repeticiones:** la repetición `r` de cada lente se une con la `r` de las otras por convención; las lentes son independientes, y por eso se publica también el valor esperado.
- **Vía de corrida:** la etapa B no usa la carta instalada ni restringe herramientas por plataforma; la etapa A sí. Las dos se publican por separado y no se suman como repeticiones.
- **Costo:** la salida no está medida en las transcripciones; los USD salen de 12 corridas.
- **Carga de la máquina:** afecta al tiempo, no a la detección; el tiempo es secundario y no decide.
- **`testability` sin correr:** la pérdida es una cota superior.

## Registro

Una fila por corrida en el CSV de la prueba: `experimento, etapa, caso, lente, rep, orden, inicio, minutos, turnos, contexto_final, ponderado, usd, valida, motivo`. Una fila por hallazgo en otro CSV: `codigo, caso, gravedad, emparejado_con, calificador_1, calificador_2`. Resultados, también los negativos, en este archivo y en `docs/benchmarks.md` §3.
