# Registro de ejecuciones: qué costó cada hito y con qué método

Este registro guarda, para cada hito ya ejecutado de pignolo y de pignolo-ui, cuánto costó cada fase (plan, auditoría del plan, ejecución, revisión, arreglos, evals) y con qué método se hizo. Sirve para comparar: cuando un hito se ejecute con otro método, se agregan sus filas y se lee contra las de este archivo.

- Datos: [`ejecuciones.csv`](ejecuciones.csv), una fila por fase de cada hito (legible por máquina).
- Este archivo: las definiciones, los métodos, un resumen por hito y los pasos para agregar filas.
- Mediciones por tipo de trabajo (no por hito): [`benchmarks.md`](benchmarks.md), sección 2d.

**Reglas del registro**

1. Una celda vacía significa "sin dato". Nada se estima ni se inventa. Si una cifra es aproximada en su fuente, se copia y la nota dice `aprox.`.
2. Toda fila con algún número tiene `fuente`: el archivo y la sección del repo, o `scratch de la sesión` cuando el dato salió de los archivos de trabajo de la sesión (transcripciones de los agentes, informes de revisión). Ese material no está en el repo.
3. Puede haber más de una fila por hito y fase cuando el trabajo fue distinto (por ejemplo, el plan en dos versiones, o la revisión por tarea y la final). La `nota` dice cuál es cuál.
4. Solo se miden agentes. Lo que gastó la sesión principal (el orquestador) no está medido y no figura.

## Columnas del CSV

| Columna | Qué es | De dónde sale |
|---|---|---|
| `hito` | Identificador del hito. `5`, `7`, `8`, `4c` y `4e-4f-4g` agrupan el plan y la auditoría que sirvieron a varias partes (`5a`, `5b`, `7a`, `8a`, `8b`, `8d`, `4c-etapa1`). `7-multiplan` es una función que se retiró. `ab-...` son A/B de método, no hitos. | |
| `plugin` | `pignolo` (núcleo) o `pignolo-ui`. | |
| `fase` | `plan` (escribirlo, incluida la investigación previa), `auditoria-plan` (auditarlo y corregirlo con lo que se encontró), `ejecucion` (implementarlo), `revision` (la revisión opus), `arreglos` (la pasada que corrige la revisión, con su confirmación acotada si la hubo) y `evals` (las evals pagas de los agentes y lo que costó dejarlas medibles). | |
| `fecha` | Día (hora local del autor) en que empezó el primer agente de la fila, o el día de la medición si no hay agentes. | Transcripciones; `RESULTS-*.md` |
| `metodo` | Identificador del método de esa fase. Ver "Métodos". | |
| `modelo` | Modelo de los agentes de la fila; si hay varios, separados por `+`. | Transcripciones |
| `agentes` | Cantidad de agentes despachados en la fila. | Transcripciones o notificación |
| `tokens` | Tokens del agente al terminar, sumados. Es el tamaño final de su contexto, que es lo que informa cada agente. No es lo facturado: la relectura de contexto en caché se cobra aparte y no está incluida. Cuando no hubo notificación se usó el mismo valor medido en la transcripción, redondeado a miles; difiere de lo informado entre 1 y 3 %. | Notificación del agente; transcripción |
| `minutos` | Suma de los minutos de reloj de cada agente. Con agentes en paralelo suma más que el tiempo de pared del hito. Vacío si un agente de la fila estuvo esperando (límite, pausa), y la nota lo dice. | Notificación; transcripción |
| `usos_de_herramienta` | Llamadas a herramientas de los agentes, sumadas. | Notificación; transcripción |
| `lineas_sumadas`, `lineas_quitadas`, `archivos` | Líneas agregadas y quitadas, y archivos tocados (código, tests y docs, todo junto). Solo en `ejecucion` y `arreglos`. | git, ver abajo |
| `tests_nuevos` | Bloques de test nuevos: líneas agregadas que empiezan con `test(` o `it(` dentro de archivos de tests. | git, ver abajo |
| `hallazgos_criticos`, `hallazgos_importantes`, `hallazgos_menores` | Hallazgos del informe, solo en `revision` y `auditoria-plan`. Si el informe usa otra escala: "mayor" y "alto" cuentan como importante; "medio" y "bajo" como menor. Los de tipo "info" no se cuentan. | Informe de la revisión o de la auditoría |
| `cortes` | Veces que un agente de la fila se cortó por límite de uso o sobrecarga del servidor y hubo que retomarlo. Solo se anotan los cortes documentados; vacío no quiere decir que no hubo. | `docs/gaps.md` (G39), `docs/history/` |
| `corridas_suite_completa` | Veces que los agentes de la fila corrieron `npm test` sin filtrar archivos. No cuenta `npm run test:ui` ni corridas de un solo archivo. Vacío si la fila no tiene transcripciones. | Transcripciones |
| `usd_evals` | USD gastados en evals pagas (`claude plugin eval`) de ese hito, en la fila `evals`. | `tests/evals/RESULTS-*.md` |
| `fuente` | De dónde salió cada número, separado por `;`. | |
| `nota` | Lo que hay que saber para leer la fila: qué agentes entran, qué falta, si el dato es aproximado. | |

## Métodos

Cada fase de cada hito lleva el método con que se hizo. El método de una fila no es el del hito entero: el 4b, por ejemplo, tuvo el plan con un método y la ejecución con otro.

| Id | Cuándo | Qué es |
|---|---|---|
| `pesado` | Hasta el 2026-09-30 (los últimos planes con replay, el del 4b y el de pignolo-ui 3, son de esa tarde) | El plan se construye replicando el hito en una copia de trabajo (replay) para validarlo, con auditorías independientes por ronda. Se ejecuta con implementadores en paralelo por olas (sonnet, y opus en las tareas difíciles; en el hito 1 de pignolo-ui, en serie y con revisión opus por tarea), una revisión final opus de la rama, una pasada de arreglos y una confirmación acotada, a veces más de una. Referencia: `docs/benchmarks.md` sección 2 ("método anterior") y `docs/gaps.md` G1. |
| `liviano-v1` | Desde el 2026-09-30 | Decisión del autor, `CLAUDE.md`: planes en tarjetas (archivos, interfaces, casos de test literales) sin construir el hito en una copia; el rojo de cada test se demuestra al ejecutar; planes e implementación en sonnet con un solo ejecutor en serie; una revisión opus por hito al final, con una pasada de arreglos hecha por un agente nuevo (sonnet); auditoría previa del plan solo en hitos de riesgo (guardia, borrados, respaldos), en dos pasos: un revisor opus que lista los supuestos y otro agente que los prueba con experimentos. Uno o dos frentes a la vez. |
| `liviano-v1-fable` | 2026-10-01 | `liviano-v1` con Fable en algún agente de la fila (ejecución del hito 6, arreglos del 5b, corrección del plan de pignolo-ui 4, tarjetas de la función retirada del 7). Fable cortó también con el límite semanal y el autor decidió no usarlo más. Se asigna sola: cualquier fila `liviano-v1` con un agente Fable. |
| `liviano-paralelo` | 2026-09-30 y 2026-10-01 | `liviano-v1` pero con varios ejecutores en paralelo, uno por tarea. Se usó en la ejecución del 4b y en el brazo paralelo del A/B. Medido (`tests/evals/RESULTS-ejecucion.md`): ≈ 15 % más rápido y ≈ 2 veces los tokens de un ejecutor en serie, con la misma calidad. |
| `liviano-v2` | Se adoptó la noche del 2026-10-01 | Ciclo "ejecutar → revisar → arreglar" más corto (`CLAUDE.md`, validado en `tests/evals/RESULTS-metodo.md`): la suite completa corre una sola vez por rama, la corre el controlador con la máquina quieta, y los agentes solo corren los archivos de test que tocan; el revisor entrega cada hallazgo importante determinista como un test que falla; solo cuentan como hallazgo los que afectan corrección, datos o requisitos y los menores van a `docs/gaps.md`; una revisión opus por grupo de hasta 3 hitos chicos (~1.500 líneas); el revisor recibe el diff como archivo y tras los arreglos hay una sola re-revisión acotada en sonnet; el encargo del ejecutor lleva una lista de autochequeo de hasta 5 ítems. **Todavía no tiene filas**: los hitos de este registro se ejecutaron antes de adoptarlo. |

## Resumen por hito

Una fila por hito, con la suma de todas sus filas del CSV. Los tokens van en miles. "Plan y auditoría" suma `plan` y `auditoria-plan`; "revisión y arreglos" suma `revision` y `arreglos`. El total suma lo medido: si faltan fases (hitos con el plan compartido, o en curso), el total es parcial. "Minutos" es la suma de minutos de cada agente, sin las filas con espera. "Líneas" son las sumadas en ejecución y arreglos. "Hallazgos" son críticos, importantes y menores de la revisión final, con `?` cuando la fuente no los informa. "Evals" son los tokens de los agentes de las filas `evals`. "Cortes" y "USD" suman los de todas las filas.

| Plugin | Hito | Métodos | Plan y auditoría | Ejecución | Revisión y arreglos | Evals | Total | Minutos | Líneas | Hallazgos | Cortes | USD evals |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pignolo | 1 | pesado | 3.016 | 115 | 613 |  | 3.744 | 673 | 8.791 | ?/1/10 |  |  |
| pignolo | 2 | pesado | 153 | 645 | 375 |  | 1.173 | 47 | 2.157 | 1/5/? |  | 1,83 |
| pignolo | 3a | pesado | 440 | 1.140 | 466 |  | 2.046 | 100 | 4.177 | ?/5/10 |  |  |
| pignolo | 3b | pesado | 1.014 | 895 | 473 | 651 | 3.033 | 278 | 1.910 |  | 1 | 11,49 |
| pignolo | 4a | pesado | 319 | 1.026 | 749 |  | 2.094 | 208 | 2.589 | 1/4/10 |  |  |
| pignolo | 4b | pesado, liviano-v1, liviano-paralelo | 1.103 | 772 | 302 |  | 2.177 | 207 | 1.234 | 0/2/? |  | 7,53 |
| pignolo | 5 | pesado, liviano-v1 | 1.177 |  |  |  | 1.177 | 66 |  |  |  |  |
| pignolo | 5a | liviano-v1 |  | 777 | 336 |  | 1.113 | 96 | 5.237 | 0/3/6 |  |  |
| pignolo | 5b | liviano-v1, liviano-v1-fable |  | 274 | 550 | 211 | 1.035 | 109 | 1.475 | 0/6/7 | 1 | 6,07 |
| pignolo | 6 | liviano-v1, liviano-v1-fable | 704 | 864 | 466 |  | 2.034 | 168 | 3.646 | 1/4/7 | 1 |  |
| pignolo | 7 | liviano-v1 | 952 |  |  |  | 952 | 49 |  |  |  |  |
| pignolo | 7-multiplan | liviano-v1-fable, liviano-v1 | 691 |  |  |  | 691 | 30 |  |  |  |  |
| pignolo | 7a | liviano-v1 |  | 888 | 533 |  | 1.421 | 292 | 5.732 | 0/12/15 | 1 |  |
| pignolo | 8 | liviano-v1 | 738 |  |  |  | 738 | 31 |  |  |  |  |
| pignolo | 8a | liviano-v1 |  | 507 | 417 |  | 924 | 103 | 3.270 | 0/3/9 |  |  |
| pignolo | 8b | liviano-v1 |  | 262 |  |  | 262 | 58 | 869 |  |  | 2,77 |
| pignolo | brainstorm | liviano-v1 | 158 | 199 | 298 | 243 | 898 | 168 | 560 | 0/4/6 |  | 9,28 |
| pignolo | 8d | liviano-v1 | 1.176 | 701 | 536 |  | 2.413 | 219 | 5.474 | 0/5/9 | 1 |  |
| pignolo-ui | 1 | pesado | 665 | 1.092 | 1.196 |  | 2.953 | 298 | 5.548 |  |  |  |
| pignolo-ui | 2a | pesado | 418 | 1.526 | 604 |  | 2.548 | 67 | 7.243 |  |  |  |
| pignolo-ui | 2b | pesado | 1.039 | 715 | 593 |  | 2.347 | 102 | 4.518 |  |  |  |
| pignolo-ui | 3 | pesado, liviano-v1 | 401 | 143 | 347 |  | 891 | 144 | 2.311 |  |  |  |
| pignolo-ui | 4 | liviano-v1, liviano-v1-fable | 1.011 | 491 | 470 | 203 | 2.175 | 249 | 4.971 | 1/5/10 | 2 | 14,34 |
| pignolo-ui | ui-option-craft | liviano-v1 |  | 209 |  | 153 | 362 | 74 | 120 |  |  |  |
| pignolo-ui | auditor-juicio | liviano-v1 |  | 125 |  |  | 125 | 44 | 63 |  |  | 7,51 |
| pignolo-ui | 4c | liviano-v1 | 2.002 |  |  |  | 2.002 | 111 |  |  | 2 |  |
| pignolo-ui | 4c-etapa1 | liviano-v1 |  | 564 | 651 |  | 1.215 | 133 | 4.517 | 1/6/15 |  |  |
| pignolo-ui | 0.7.3 | liviano-v1 |  | 221 | 167 | 310 | 698 | 66 | 398 |  |  |  |
| pignolo-ui | 4e | liviano-v1 | 241 |  |  |  | 241 | 14 |  |  |  |  |
| pignolo-ui | 4e-4f-4g | liviano-v1 | 375 |  |  |  | 375 | 24 |  |  |  |  |

Lecturas que el cuadro permite, con las reservas de arriba:

- Hitos con todas sus fases medidas: con `liviano-v1`, el 6 (2,0 millones de tokens), el 8d (2,4) y pignolo-ui 4 (2,2); con `pesado`, el 1 del núcleo (3,7) y pignolo-ui 1 (3,0). Los hitos no tienen el mismo tamaño: no son una comparación directa.
- En el método liviano el plan y su auditoría pesan casi lo mismo que la ejecución o más (8d: 1,2 de 2,4 millones; 6: 0,7 de 2,0).
- En ninguna revisión final informada hubo 0 hallazgos importantes: van de 1 a 12.
- Los hitos 7a, 8d y pignolo-ui 0.7.3 siguen en curso: tienen rama sin unir (el 0.7.3 todavía sin la pasada de arreglos), por lo que sus filas son las de las fases terminadas.

**Mediciones A/B de método** (no son hitos; mismas 4 tareas del hito 4a, mismo plan y mismo modelo):

| Fila | Agentes | Tokens | Minutos de agentes | Tiempo de pared | Tests finales que pasan |
|---|---|---|---|---|---|
| `ab-4a-ola1`, `liviano-paralelo` | 4 | ~528 mil (el informe dice ~531 mil) | 88,6 | ~28 min | 148 de 180 |
| `ab-4a-ola1`, `liviano-v1` | 1 | ~270 mil (el informe dice ~272 mil) | 33,4 | ~32 min | 151 de 180 |

Hay además una fila `ab-lienzo` con los cuatro brazos del A/B de opciones de UI (HTML local o lienzo).

## Lo que este registro no tiene

- **Sesión principal:** el trabajo del orquestador (lo que escribe y decide la sesión que despacha los agentes) no está medido.
- **Hito 1 del núcleo:** el plan original (2026-09-26) y las auditorías 1 y 2 no tienen medición; las filas del hito 1 cubren desde el 2026-09-28. Los agentes que corrigieron la auditoría ronda 2 se asignaron por descripción y fecha.
- **Hito 4a, plan:** lo escribió el orquestador; solo está el agente que mapeó el código.
- **Hito 2 del núcleo, Task 3:** no tiene agente medido.
- **Hallazgos sin informar:** revisión de 3b, pignolo-ui 1, 2a, 2b y 3 (solo hay totales en el historial o nada), menores del hito 2 y del 4b, críticos de los hitos 1 y 3a. Las auditorías de los planes de 2, 3a, 3b, 2a y 2b no cuentan sus hallazgos.
- **USD de evals no informados:** repetición del A/B de ui-option (ui-option-craft), tercera medición (0.7.3) y A/B del lienzo. El hito 3b no incluye una corrida completa en opus que se interrumpió sin informe de costo.
- **Cortes:** solo los documentados (G39 y el historial); el hito 4c tuvo dos errores 529 de servidor en la auditoría.
- **Hitos sin filas:** 7b, 8c, la comparación contra Claude Code solo, y la ejecución de 4e, 4f y 4g (en curso, no se incluyó). El 8b, ui-option-craft (0.6.2) y auditor-juicio (0.6.3) no tuvieron revisión final.
- **Tiempo de pared por hito:** el CSV tiene minutos de agentes, no el tiempo que tardó el hito de punta a punta.

## Cómo agregar una fila

Una fila por fase, al terminar la fase, con los datos que ya tiene el resultado del agente. Ningún número se calcula de memoria.

1. **Despachar.** Anotar para cada agente su descripción y el método que se está usando (ver "Métodos"). Si cambia el método dentro del hito, cada fase lleva el suyo.
2. **Tokens, minutos, usos de herramienta y modelo.** Salen del resultado que informa cada agente al terminar (tokens, tiempo y usos de herramienta) y del modelo con que se despachó. Se copian tal cual; con varios agentes en la fila se suman, y `agentes` es cuántos son. Si el agente quedó con espera (límite de uso, pausa), `minutos` queda vacío y la nota lo dice.
3. **Líneas, archivos y tests nuevos** (solo `ejecucion` y `arreglos`). Con la punta de la rama de ejecución (el último commit antes del primer arreglo de la revisión) y la punta final:
   - Ejecución: `git diff --numstat <main>...<punta-de-ejecucion>`. Sumar la primera columna (`lineas_sumadas`) y la segunda (`lineas_quitadas`); `archivos` es la cantidad de líneas de la salida.
   - Arreglos: `git log --first-parent --no-merges --numstat --format= <punta-de-ejecucion>..<punta-final>`, con las mismas sumas. El `--first-parent --no-merges` deja afuera lo que entró de `main` por un merge.
   - Tests nuevos: `git diff -U0 <mismo-rango> -- '*.js' '*.mjs'`, y contar las líneas agregadas (`+`) que empiezan con `test(` o `it(` dentro de archivos de tests.
   - Si la ejecución y los arreglos no se pueden separar, todo va en la fila de ejecución y la nota lo dice.
4. **Hallazgos.** Del encabezado del informe de la revisión o de la auditoría (críticos, importantes, menores). Si falta uno, la celda queda vacía.
5. **Cortes.** Un corte por cada vez que un agente se cortó por límite o sobrecarga y hubo que retomarlo. Anotar el motivo en la nota.
6. **Corridas de la suite completa.** Cuántas veces el agente corrió `npm test` sin filtro; sale de su transcripción.
7. **USD de evals.** De la tabla de costos del `RESULTS-*.md` del hito, en una fila `evals` (suma de sonda, calibración y completas).
8. **Fuente y nota.** En `fuente`, el archivo y la sección de donde salió cada número (`scratch de la sesión` si salió de archivos de trabajo que no están en el repo; la notificación del agente se cita con su fecha). En `nota`, lo que falta o es aproximado (`aprox.`).
9. **Verificar el CSV** antes de commitear: todas las filas deben tener las 22 columnas de la cabecera, y toda fila con un número debe tener `fuente`. Con Node, desde la raíz del repo:

   ```
   node -e "const L=require('fs').readFileSync('docs/ejecuciones.csv','utf8').trimEnd().split('\n').map(l=>l.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/));console.log(L.length-1+' filas, '+L.filter(r=>r.length!==L[0].length).length+' con otro largo')"
   ```

   El resultado debe decir `0 con otro largo`.
10. **Actualizar el resumen** de este archivo con la fila nueva del hito.
