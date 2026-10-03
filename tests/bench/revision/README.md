# Preparación común de `lentes-reales` y `momento-de-revision`

Scripts sin dependencias (Node >= 22) que preparan, corren el procesamiento y arman los resultados de las dos pruebas con fichas previas:

- `tests/evals/RESULTS-lentes-reales.md` (cuántas lentes en la revisión de riesgo alto).
- `tests/evals/RESULTS-momento-de-revision.md` (cuándo revisar al ejecutar un plan).

**Nada de acá lanza agentes ni gasta dinero.** Los comandos pagos (`claude plugin eval`) y los agentes de la suscripción los corre quien controla la prueba; este directorio solo prepara las entradas y procesa las salidas. Todo lo generado (instantáneas, fichas de defecto, entradas de corrida, resultados) va **fuera del repo**, en una carpeta de trabajo que acá se llama `<work>`.

Las fichas son la fuente de verdad. `cases.json` copia de ellas los casos, los commits, los defectos, los brazos y las semillas; no se edita después de la primera corrida.

## Scripts

| Script | Qué hace |
|---|---|
| `cases.json` | Lista fija de los casos de las dos fichas: instantáneas (commit, padre, tarjeta), defectos con su arreglo y su test, menores conocidos, casos de `lentes`, bloques y comparaciones de `momento`. |
| `lib.js` | Utilidades comunes: `mulberry32`, barajado, código neutro de instantánea, mediana y rango. |
| `snapshot.js` | Arma por caso la carpeta congelada (ficha §5): `tree/` con `git archive` (sin `.git` ni historia posterior), `brief/diff.patch` (fuentes que no son de test, `padre..commit`), `brief/files.txt` (`--numstat` de todo) y `brief/task-card.md` (mensaje del commit y sección de tarea del plan, o el plan entero según el brazo). El nombre de la carpeta es un código neutro. Escribe aparte, en `_meta/`, los metadatos y el material de fuga. |
| `dispatch.js` | Imprime el texto de despacho de la ficha (§5) y, con `--lens`, antepone el cuerpo de la carta de la lente en el commit fijado (`7cc2f03`): el encargo de la etapa B. |
| `leak-check.js` | Revisa la transcripción o la salida de una corrida y sale con código 1 si el revisor vio el futuro: herramienta distinta de Read, Grep y Glob, ruta fuera de la instantánea, hash de un commit de arreglo, mensaje de un arreglo o texto de un test de arreglo. |
| `order.js` | Imprime el orden barajado de las corridas con la semilla de cada ficha (`mulberry32(20261002)` y `mulberry32(20261003)`). |
| `extract.js` | Toma el bloque `json` de cada corrida, borra `lens` e `id`, da un código al azar a cada hallazgo y mezcla los de un mismo lote. Escribe la clave (`findings-full.json`) aparte de lo que ve el calificador (`blind/<lote>.json`). En `momento` borra además los números de línea. |
| `prefilter.js` | Marca como candidato el hallazgo cuyo archivo es uno de los del defecto. No decide nada. |
| `defects.js` | Escribe una ficha por defecto (`<id>.json` y `<id>.md`): conducta errónea, código del test del arreglo, archivos y líneas en la instantánea, menores conocidos. Además `_batches.json` (defectos y menores por lote). |
| `redcheck.js` | Chequeo del rojo: el test del arreglo falla en la punta previa de la ficha y en el padre del arreglo, y pasa en el arreglo. Usa un worktree temporal; corre solo los archivos de test de los defectos. |
| `lentes-eval-cases.js` | Genera los 12 casos de `claude plugin eval` de la etapa A (D1, D2, D5 x 4 lentes x 1 corrida) con las instantáneas reales. No corre nada e imprime los comandos. |
| `assemble.js` | Después de calificar: arma los brazos y calcula las métricas de la ficha por repetición (mediana y rango), imprime la tabla y escribe el CSV. |

Pruebas: `node --test tests/bench-revision.test.js` (solo ese archivo).

## Formatos

**Manifiesto de corridas** (`runs.json`), entrada de `extract.js`:

```json
[{ "run": "D2|reliability|1", "file": "<salida o transcripción>", "minutes": 3.2, "turns": 14, "finalContext": 52000, "weighted": 41000, "usd": 0.31 }]
```

El id de corrida es `caso|lente|rep` (lentes) o `bloque|corrida|rep` (momento), el mismo que imprime `order.js`. `weighted` = entrada + 1,25 x escritura de caché + 0,1 x lectura (ficha §9). `extract.js` acepta una salida en texto con el bloque `json` o una traza `stream-json` (el informe del subagente llega como `tool_result` del `Agent`).

**Calificaciones** (`grades1.json`, `grades2.json`): `{ "<código>": "<id de defecto>" | "<id de menor>" | "ninguno" }`.

## Secuencia de comandos

`<work>` es la carpeta de trabajo fuera del repo. Todos desde la raíz del repo.

### 0. Preparación (sin costo)

```
node tests/bench/revision/snapshot.js --all --out <work>/snapshots
node tests/bench/revision/defects.js --out <work>/defects --snapshots <work>/snapshots
node tests/bench/revision/redcheck.js --wt <work>/redwt --out <work> --remove
```

Copiar antes de correr las revisiones originales (el texto de las revisiones queda en el scratch de la sesión) a `local/`, que no se versiona.

### 1. `lentes-reales`

1. **Sonda** (suscripción, 1 corrida, `reliability` sobre D2). Armar el encargo y despachar un agente de propósito general en opus con él, en una sesión abierta en una carpeta vacía fuera del repo:

   ```
   node tests/bench/revision/dispatch.js --snapshot 7a-t8 --dir <work>/snapshots/<código de 7a-t8> --lens reliability --card-commit 7cc2f03
   ```

   Después: `node tests/bench/revision/leak-check.js --file <transcripción> --case 7a-t8 --work <work>` (debe salir 0), y comprobar que `extract.js` lee el bloque `json`.
2. **Etapa A paga** (tope 5 USD en total):

   ```
   node tests/bench/revision/lentes-eval-cases.js --work <work>
   ```

   imprime la sonda paga (`--max-cost-usd 0.6`) y la etapa (`--max-cost-usd 4.4 -j 2`) con las banderas de las otras evals pagas. Con `--keep-temp` cada corrida deja `%TEMP%/claude-eval-<id>/out/trace.jsonl`. Chequeo de fuga de cada una (la sesión principal despacha con `Agent`, por eso se permite):

   ```
   node tests/bench/revision/leak-check.js --file <temp>/out/trace.jsonl --case <id> --work <work> --root <temp> --allow-tools Read,Grep,Glob,Agent
   ```

3. **Etapa B** (solo con el OK del autor): `node tests/bench/revision/order.js lentes` da las 84 corridas en orden; cada una se despacha con el encargo de `dispatch.js --lens`. Chequeo de fuga por corrida.
4. **Extracción y calificación a ciegas:**

   ```
   node tests/bench/revision/extract.js --experiment lentes --manifest <work>/lentes/runs.json --out <work>/lentes
   node tests/bench/revision/prefilter.js --experiment lentes --batch D1 --blind <work>/lentes/blind/D1.json --defects <work>/defects --out <work>/lentes/blind/D1.prefilter.json
   ```

   El calificador 1 recibe por lote `blind/<lote>.json` y las fichas de `defects/` del lote (`_batches.json` dice cuáles y qué menores); nunca la ficha de la prueba. El calificador 2 califica el 30 % (mínimo 25 hallazgos, todos los casos), con la misma semilla.
5. **Armado de brazos y métricas:**

   ```
   node tests/bench/revision/assemble.js --experiment lentes --findings <work>/lentes/findings-full.json --runs <work>/lentes/runs-table.json --grades <work>/lentes/grades1.json --grades2 <work>/lentes/grades2.json --out <work>/lentes
   ```

   Imprime las tablas (todos los casos y sin D1) y escribe `metrics-lentes.csv` y `findings-graded-lentes.csv`. Con solo la etapa A (1 repetición) aplica la regla de E2.

### 2. `momento-de-revision`

1. `node tests/bench/revision/order.js momento` (30 corridas; `--include-reused` suma las 12 que se reusan de `lentes-reales` si esa etapa no corrió). El encargo de cada corrida: `dispatch.js --snapshot <id de instantánea> --dir ... --lens reliability`. La instantánea de cada corrida está en `cases.json` (`momento.blocks`).
2. Chequeo de fuga de cada corrida.
3. `extract.js --experiment momento ...` (las corridas reusadas se saltan; se califican en `lentes`), calificación a ciegas como arriba (lotes `7a` y `ui`).
4. Armado:

   ```
   node tests/bench/revision/assemble.js --experiment momento --findings <work>/momento/findings-full.json --runs <work>/momento/runs-table.json --grades <work>/momento/grades1.json --out <work>/momento --lentes-findings <work>/lentes/findings-full.json --lentes-runs <work>/lentes/runs-table.json --lentes-grades <work>/lentes/grades1.json
   ```

## Reglas que el código fija y la ficha no detalla

Ver las secciones "Desvíos de la ficha" del informe de preparación. En resumen: el barajado es Fisher-Yates descendente sobre la lista alfabética con `mulberry32(semilla)`; la fuente es todo `.js .mjs .cjs .ts .tsx .jsx .sh .ps1 .py` que no sea de test; un desacuerdo entre calificadores cuenta como no emparejado solo si el acuerdo es menor a 85 %, y las dos cifras se publican.
