# Resultados: activación de las skills con lenguaje normal

Estado: **corrida el 2026-10-03; resultados al final.** La ficha se commiteó antes de la primera corrida, como pide `docs/protocolo-de-pruebas.md`, y no se tocó después salvo esta línea; el control corrió con 3 repeticiones y no con 1 (ver Resultados).

## Pregunta e hipótesis

Decisión del autor (2026-10-03): las skills tienen que poder activarse con lenguaje normal, no solo con `/comando`. ¿Con las `description` nuevas ("Use when the user asks to ..." con frases en castellano rioplatense y en inglés), el modelo invoca la skill correcta ante una frase normal, y no invoca ninguna de las ocho ante un arreglo chico o una pregunta?

Hipótesis (sentido esperado): con el cambio, el modelo invoca la skill esperada en al menos 16 de 20 frases, y una de las ocho en a lo sumo 1 de 10 frases que no deben activar ninguna. Antes del cambio, 0 de 20 (las ocho llevaban `disable-model-invocation: true`, así que la herramienta Skill no las ofrecía al modelo): el brazo de control mide ese piso, no una competencia.

## Variable y lo fijo

- **Variable que cambia:** los plugins. Control = `main` en `3882ded` (antes del cambio; es el tip de `main` y el merge-base de la rama, verificado el 2026-10-03; se extrae con `git worktree add --detach`, sin tar). Tratamiento = la rama `feat/skills-lenguaje-natural`.
- **Fijo:** las 30 frases (`tests/evals/activation-cases.js`), el modelo (sonnet por defecto del runner; el autor puede pedir opus, que es el que usa a diario), `--max-turns 2`, una carpeta de proyecto vacía con `git init`, solo la herramienta Skill, sin ajustes de usuario (`--setting-sources project`), máquina.

## Brazos

| Brazo | Plugins | Repeticiones |
|---|---|---|
| Control | `git archive 3882ded plugins` | 1 por frase (30 corridas): confirma el piso en 0 |
| Tratamiento | este árbol | 3 por frase (90 corridas) |

Casos: 20 frases que deben activar una skill concreta (incluida "quiero que hagamos ahora el panel de datos de la app" → `pignolo-ui:new`; 5 `new`, 4 `improve`, 3 `audit`, 3 `define`, 1 `status`, 2 `close-session`, 1 `init`, 1 `setup`) y 10 que no deben activar ninguna de las ocho (arreglos chicos de CSS o de texto, un bug, preguntas, un diff para revisar).

## Métricas

Todas salen de `tests/evals/activation-run.js` (una fila por corrida en `<out>/<brazo>.metrics.jsonl`; la salida cruda de cada corrida queda en `<out>/raw/<brazo>-<caso>-r<n>.jsonl` para recalificar sin volver a gastar) sin intervención manual:

- **Acierto en positivas:** de las 20 frases, cuántas invocaron la skill esperada, por repetición (tres rondas de 20 en el tratamiento). Se miran **todas** las skills invocadas, en orden (no solo la primera): cuenta como acierto que la esperada se haya invocado y que antes de ella solo haya estado `pignolo:entry`. Con pignolo activo `entry` ("Use first for any request") manda un pedido de UI a pignolo-ui, así que `pignolo:entry` → `pignolo-ui:new` es el camino correcto; cualquier otra skill antes de la esperada, o ninguna, es fallo. Criterio fijado antes de la corrida (revisión RNL-05).
- **Falsa activación en negativas:** de las 10 frases, cuántas invocaron una de las ocho en cualquier punto de la lista (`pignolo:entry` no cuenta), por repetición.
- **Confusión entre skills:** en las positivas fallidas, cuál se invocó en su lugar (o ninguna), para ajustar las `description`.
- **Costo:** `total_cost_usd` de cada corrida; suma por brazo.

Lo que **no** mide: si la pregunta de confirmación (`AskUserQuestion`) aparece ni cómo se ve, ni si el paso 0 distingue bien el `/comando` de la activación sola (eso necesita una sesión interactiva; queda como prueba manual del autor).

## Regla de decisión

Se adopta el texto si en el tratamiento la **mediana** de las tres rondas es ≥ 16/20 en positivas, el **mínimo** es ≥ 14/20, y las falsas activaciones tienen mediana ≤ 1/10 y máximo ≤ 2/10, **y** los rangos no se pisan con el control (0/20). Si no se cumple, se ajustan las `description` según la matriz de confusión y se repite solo el brazo de tratamiento. Una diferencia con rangos que se pisan es "sin diferencia demostrada" y se decide por lo más simple.

## Presupuesto

120 corridas (30 de control y 90 de tratamiento). Estimación del costo: **≈ 12 USD (rango 6 a 18)**, nivel **E0**: no hay medición de una corrida de una frase con la lista de skills cargada; sale de las corridas medidas de un solo agente en `docs/benchmarks.md` (0,05 a 0,15 USD por corrida de un turno). Tope del runner: 20 USD (`--cap 20`; el gasto se lee de los `metrics.jsonl`, vale entre invocaciones). Si se agota a mitad, se corta, se anota hasta dónde llegó cada brazo y el resultado baja a E2 sin repeticiones completas. Antes de gastar el total: `--probe` corre una sola corrida (P01) para validar el montaje (que la herramienta Skill invocada aparezca en el stream); costo ≈ 0,05 a 0,15 USD.

## Cómo correrla

```
node tests/evals/activation-run.js --arm treatment --probe
node tests/evals/activation-run.js --arm control --reps 1 --cap 20
node tests/evals/activation-run.js --arm treatment --reps 3 --cap 20
```

`--dry-run` cuenta las corridas sin gastar. Los temporales (incluido el worktree del control) se borran al terminar.

## Amenazas a la validez

- Una sola carpeta de proyecto vacía: la activación real ocurre con el contexto de un proyecto con `.pignolo/` y `CLAUDE.md`, que puede empujar a `pignolo:entry` en lugar de la skill de pignolo-ui.
- Sonnet como modelo de prueba; el autor usa opus: la activación puede diferir.
- Frases escritas por quien escribió las descriptions: favorece al tratamiento. Las 10 negativas se escribieron adrede cerca del límite (pantalla, texto, bug) para compensarlo.
- El control es una cota de 0 por construcción, no un competidor.
- No probado todavía: que `--tools Skill` y `--allowedTools Skill` dejen invocar skills de un plugin cargado con `--plugin-dir` en `claude -p`. Por eso existe `--probe`.

## Corrida descartada (antes de los arreglos de la revisión)

Hubo una primera corrida parcial, descartada: 19 corridas del brazo de tratamiento sobre el árbol anterior a estos arreglos (descriptions y paso 0 sin los arreglos RNL-01 a RNL-04, calificación de la primera skill), 0,82 USD, 19 de 19 correctas, sin salida cruda guardada. El control no llegó a correr: `tar` falló en Windows al tomar `C:` como host remoto. No cuenta como dato de la prueba. Archivo: `%TEMP%/claude-eval-activation/treatment-v1-parcial.metrics.jsonl` (suma 0,82 USD al gasto que lee el runner si se corre con el `--out` por defecto).

## Resultados

Corrida el 2026-10-03, sonnet, `--max-turns 2`. Los datos crudos (`control.metrics.jsonl`, `treatment.metrics.jsonl` y la salida de cada corrida en `raw/`) quedan en `%TEMP%/claude-eval-activation/`; no se versionan. Las cifras se recalcularon desde esos archivos. Control = `3882ded`; tratamiento = la rama `feat/skills-lenguaje-natural` antes de unir `main`.

**Desvío de la ficha:** el control corrió con 3 repeticiones por frase (90 corridas) en vez de 1 (30), así que ambos brazos son comparables ronda a ronda. Costó ≈ 1,33 USD más que lo presupuestado para el control.

### Por ronda (E3: dos brazos, una sola variable, 3 repeticiones, métricas y criterio fijados antes de correr; con las amenazas de abajo)

| Brazo | Medida | Ronda 1 | Ronda 2 | Ronda 3 | Mediana | Rango |
|---|---|---|---|---|---|---|
| Control | Positivas (de 20) | 0 | 0 | 0 | 0 | 0 a 0 |
| Control | Falsas activaciones (de 10) | 0 | 0 | 0 | 0 | 0 a 0 |
| Tratamiento | Positivas (de 20) | 20 | 20 | 20 | **20** | 20 a 20 |
| Tratamiento | Falsas activaciones (de 10) | 0 | 0 | 0 | **0** | 0 a 0 |

Totales: control 0/60 en positivas y 30/30 negativas sin falsa activación; tratamiento 60/60 y 30/30. Por skill esperada, el tratamiento acertó todas las repeticiones: `pignolo-ui:new` 15/15, `improve` 12/12, `audit` 9/9, `define` 9/9, `pignolo:status` 3/3, `close-session` 6/6, `init` 3/3, `setup` 3/3.

### Regla de decisión aplicada

Mediana en positivas 20 (pide >= 16): cumple. Mínimo 20 (pide >= 14): cumple. Falsas activaciones, mediana 0 (pide <= 1) y máximo 0 (pide <= 2): cumple. Rangos contra el control (0/20): 20 a 20 contra 0 a 0, no se pisan: cumple. **Se adopta el texto de las `description`.** E3 para la diferencia (es total, 60/60 contra 0/60); no se generaliza a otros modelos ni a frases ajenas (ver amenazas).

### Qué otras skills aparecieron (E3, conteo de invocaciones en las 90 corridas de cada brazo)

- Control: `pignolo:entry` 36 (en 8 de las 10 negativas; no cuenta como falsa activación, y en las positivas se quedó ahí porque el modelo no podía ver las skills de pignolo-ui), `dataviz` 4, `run` 2, `update-config` 2, `code-review` 2, `security-review` 1. Son skills del entorno de la máquina de prueba que compiten por frases cercanas.
- Tratamiento: las ocho skills esperadas en las positivas; `pignolo:entry` solo 2 veces (una en una negativa, que no cuenta), `run` 1, `code-review` 2 (las dos en la negativa N10, "revisá este diff", donde invocar `code-review` es razonable y no es una de las ocho). Con las skills de pignolo-ui visibles el modelo fue directo a ellas, sin pasar por `entry` (0 de 60 positivas con `entry` primero).

### Los `exit 1`

Control 24 de 90, tratamiento 15 de 90 (E3, leído de la salida cruda de cada corrida). Todos son `subtype: error_max_turns` con `stop_reason: tool_use` en el turno 3: el modelo invocó la skill (turno 1), recibió su texto (turno 2) y quiso seguir con una herramienta, y `--max-turns 2` lo cortó. No es un fallo de la herramienta ni del plugin. **No afectan la calificación**: la invocación de la skill queda registrada antes del corte. En el tratamiento los 15 son corridas calificadas como correctas (13 positivas y 2 negativas sin falsa activación). En el control son 18 positivas y 6 negativas; las positivas eran fallo igual, porque no había skill de pignolo-ui que invocar. Hubo más cortes en el control porque `entry`, `run` y otras piden pasos de herramienta; el costo de esas corridas incluye el turno extra hasta el corte.

### Costo y duración

| Brazo | USD (E3, `total_cost_usd` de cada corrida) | Mediana por corrida | Rango por corrida | Suma de corridas |
|---|---|---|---|---|
| Control | 2,00 (1,14 / 0,44 / 0,42 por ronda) | 7,2 s | 2,6 a 19,4 s | 11,5 min |
| Tratamiento | 2,64 (1,52 / 0,59 / 0,54 por ronda) | 6,8 s | 4,0 a 17,6 s | 10,8 min |

La primera ronda cuesta el doble o más que las otras dos en ambos brazos (la caché del prompt se arma ahí). El tratamiento cuesta ≈ 0,64 USD más porque lee y sigue el texto de cada skill invocada. La duración es la de `duration_ms` de la salida cruda, por corrida, no el tiempo de pared del lote.

**Gasto total de la prueba:** 5,59 USD = control 2,00 + tratamiento 2,64 + sondas 0,129 + corrida parcial descartada 0,82. Muy por debajo de los 12 USD estimados (E0) y del tope de 20.

### Amenazas que siguen en pie

Son las de la ficha y no se resolvieron: carpeta de proyecto vacía (la activación en un proyecto con `.pignolo/` y `CLAUDE.md` puede diferir), sonnet en vez de opus, frases escritas por quien escribió las descriptions (el 100 % de aciertos lo favorece; las negativas se escribieron cerca del límite y no hubo ninguna falsa activación), control como piso de 0 por construcción. Se suma que `--max-turns 2` mide la elección de la skill, no su ejecución. Queda pendiente la prueba manual del autor en una sesión interactiva (la pregunta de confirmación y la distinción entre `/comando` y activación sola).

---

# Activación de `plan` ("armá un plan")

Ficha escrita y commiteada antes de la primera corrida (2026-10-03). Plan: `docs/plans/2026-10-03-salir-del-flujo.md`, T5. Gasto aprobado por el autor el 2026-10-03.

## Pregunta e hipótesis

¿Un pedido normal de plan ("armá un plan" y variantes) llega a `pignolo:plan`, directo o tras `pignolo:entry`? Hipótesis: en `main` (control) llega en menos de 8 de 10 frases (lo sugiere el incidente de uso real, E1); con el texto nuevo de `entry` llega en al menos 9 de 10, sin que las falsas activaciones pasen de 1 de 4.

## Variable y lo fijo

Cambia una sola cosa: el árbol de plugins. Control = `main` en `2771d5b` (`--control 2771d5b`). Tratamiento A = la rama `core/salir-del-flujo` (T1 a T3; la `description` de `plan` no cambia). Fijo: las 14 frases de `PLAN_CASES` (10 positivas, 4 negativas con la palabra "plan"), modelo sonnet, `--max-turns 3`, carpeta de proyecto vacía con `git init`, solo la herramienta Skill, `--setting-sources project`.

## Brazos y repeticiones

Control 14 frases x 3 = 42 corridas; tratamiento A 42 corridas. 84 en total, más una sonda.

## Métricas

Todas salen de `activation-run.js`, sin intervención manual: positivas que llegan a `pignolo:plan` por ronda (de 10); falsas activaciones por ronda (de 4); qué skill se invocó en vez de `plan`, o ninguna; costo por corrida y por brazo (`total_cost_usd`).

## Regla de decisión

El texto de `entry` se adopta si en el tratamiento A la mediana de las 3 rondas es >= 9/10, el mínimo >= 8/10, las falsas activaciones tienen mediana <= 1/4 y máximo <= 1/4, y los rangos no se pisan con el control. Si el control ya da mediana >= 9/10 con mínimo >= 8/10, la causa del incidente no es la activación: se anota "sin diferencia demostrada" y no se toca la `description` de `plan`. Si el tratamiento A queda por debajo de 9/10 de mediana o de 8/10 de mínimo, o las falsas activaciones pasan de 1/4, corresponde T6 (otro cambio y otro gasto, con otro OK del autor).

## Presupuesto

Estimación: 3,4 a 4,2 USD (rango 2,5 a 6), nivel E0 para el total: el costo por corrida (≈ 0,03 USD, ≈ 0,05 en la primera ronda) es E3 pero de otra carga, de un turno menos. Tope del runner: `--cap 8`. Si se agota a mitad, se corta, se anota hasta dónde llegó cada brazo y el resultado baja a E2.

## Cómo correrla

```
node tests/evals/activation-run.js --arm treatment --set plan --probe --cap 8 --out <dir>
node tests/evals/activation-run.js --arm control --set plan --reps 3 --cap 8 --control 2771d5b --out <dir>
node tests/evals/activation-run.js --arm treatment --set plan --reps 3 --cap 8 --out <dir>
```

`<dir>` es una carpeta nueva (`%TEMP%\claude-eval-activation-plan`), para que el tope no cuente el gasto de la prueba anterior.

## Amenazas a la validez

Carpeta de proyecto vacía, sin `.pignolo/`: `entry` no puede comprobar que pignolo está activo, así que se mide la elección de skill y no el flujo completo. Sonnet y no opus, que es lo que usa el autor. Frases escritas por quien escribió el texto. No mide la pregunta al salir del flujo ni el ruteo de `.pignolo-ui/`: necesitan una sesión interactiva (`tests/manual/salir-del-flujo.md`).

## Resultados

Corrida el 2026-10-05, sonnet, `--max-turns 3`, los tres comandos de la ficha sin desvíos. Datos crudos en `%TEMP%/claude-eval-activation-plan/` (no se versionan); las cifras se recalcularon desde los `metrics.jsonl`.

### Por ronda (E3: dos brazos, una sola variable, 3 repeticiones, criterio fijado antes)

| Brazo | Medida | Ronda 1 | Ronda 2 | Ronda 3 | Mediana | Rango |
|---|---|---|---|---|---|---|
| Control (`2771d5b`) | Positivas (de 10) | 0 | 0 | 0 | 0 | 0 a 0 |
| Control | Falsas activaciones (de 4) | 0 | 0 | 0 | 0 | 0 a 0 |
| Tratamiento A | Positivas (de 10) | 2 | 1 | 2 | **2** | 1 a 2 |
| Tratamiento A | Falsas activaciones (de 4) | 0 | 0 | 0 | **0** | 0 a 0 |

La sonda (Q01, una corrida, sin skill invocada) no cuenta en las rondas.

### Regla de decisión aplicada

Mediana 2/10 (pide >= 9) y mínimo 1/10 (pide >= 8): **no cumple**. Falsas activaciones 0: cumple. Los rangos no se pisan con el control (1 a 2 contra 0), así que el texto nuevo mejora, pero muy lejos del umbral. Según la ficha **corresponde T6** (otro cambio y otro gasto, con otro OK del autor). El texto de `entry` no queda "adoptado" por esta medición.

### Qué se invocó en las positivas (30 corridas por brazo)

- Control: ninguna skill 14, solo `pignolo:entry` 13, `entry` y después `status` 2, `update-config` 1. Nunca `pignolo:plan`.
- Tratamiento A: ninguna skill 18, solo `pignolo:entry` 6, `entry` → `plan` 5 (los cinco aciertos; uno siguió con otras skills hasta el corte de turnos), `entry` → `status` 1. Aciertos por frase: Q01 2 de 3, Q06, Q07 y Q09 1 de 3, las otras seis 0 de 3.

Lectura (E1, de la salida cruda de dos corridas): cuando no invoca nada, el modelo contesta con una pregunta ("¿un plan de qué?") porque el proyecto está vacío. Cuando pasa por `entry`, el texto nuevo lo lleva a `plan` en 5 de 12 (control: 0 de 16). El fallo dominante es anterior a `entry`: el modelo no invoca ninguna skill. Coincide con la primera amenaza de la ficha (carpeta vacía, sin `.pignolo/`, donde "un proyecto con pignolo activo" no se cumple), así que esta prueba no separa "la description de `plan` no alcanza" de "el montaje no parece un proyecto con pignolo". Un T6 debería medir con un proyecto que tenga `.pignolo/project.md`.

### Costo

| Brazo | USD (E3, `total_cost_usd`) |
|---|---|
| Control | 1,71 (0,71 / 0,67 / 0,33 por ronda) |
| Tratamiento A | 1,75 (0,76 / 0,68 / 0,30) más 0,05 de la sonda |

**Gasto total: 3,51 USD** (estimado 3,4 a 4,2; tope 8).
