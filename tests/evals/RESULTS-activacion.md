# Resultados: activación de las skills con lenguaje normal

Estado: **ficha escrita, sin correr** (2026-10-03). Correrla gasta, y gastar es decisión del autor. Esta ficha se commitea antes de la primera corrida, como pide `docs/protocolo-de-pruebas.md`; los resultados se agregan abajo sin tocar la ficha.

## Pregunta e hipótesis

Decisión del autor (2026-10-03): las skills tienen que poder activarse con lenguaje normal, no solo con `/comando`. ¿Con las `description` nuevas ("Use when the user asks to ..." con frases en castellano rioplatense y en inglés), el modelo invoca la skill correcta ante una frase normal, y no invoca ninguna de las ocho ante un arreglo chico o una pregunta?

Hipótesis (sentido esperado): con el cambio, el modelo invoca la skill esperada en al menos 16 de 20 frases, y una de las ocho en a lo sumo 1 de 10 frases que no deben activar ninguna. Antes del cambio, 0 de 20 (las ocho llevaban `disable-model-invocation: true`, así que la herramienta Skill no las ofrecía al modelo): el brazo de control mide ese piso, no una competencia.

## Variable y lo fijo

- **Variable que cambia:** los plugins. Control = `main` en `3882ded` (antes del cambio). Tratamiento = la rama `feat/skills-lenguaje-natural`.
- **Fijo:** las 30 frases (`tests/evals/activation-cases.js`), el modelo (sonnet por defecto del runner; el autor puede pedir opus, que es el que usa a diario), `--max-turns 2`, una carpeta de proyecto vacía con `git init`, solo la herramienta Skill, sin ajustes de usuario (`--setting-sources project`), máquina.

## Brazos

| Brazo | Plugins | Repeticiones |
|---|---|---|
| Control | `git archive 3882ded plugins` | 1 por frase (30 corridas): confirma el piso en 0 |
| Tratamiento | este árbol | 3 por frase (90 corridas) |

Casos: 20 frases que deben activar una skill concreta (incluida "quiero que hagamos ahora el panel de datos de la app" → `pignolo-ui:new`; 5 `new`, 4 `improve`, 3 `audit`, 3 `define`, 1 `status`, 2 `close-session`, 1 `init`, 1 `setup`) y 10 que no deben activar ninguna de las ocho (arreglos chicos de CSS o de texto, un bug, preguntas, un diff para revisar).

## Métricas

Todas salen de `tests/evals/activation-run.js` (una fila por corrida en `<out>/<brazo>.metrics.jsonl`) sin intervención manual:

- **Acierto en positivas:** de las 20 frases, cuántas invocaron exactamente la skill esperada, por repetición (tres rondas de 20 en el tratamiento).
- **Falsa activación en negativas:** de las 10 frases, cuántas invocaron una de las ocho, por repetición.
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

`--dry-run` cuenta las corridas sin gastar. Los temporales se borran al terminar.

## Amenazas a la validez

- Una sola carpeta de proyecto vacía: la activación real ocurre con el contexto de un proyecto con `.pignolo/` y `CLAUDE.md`, que puede empujar a `pignolo:entry` en lugar de la skill de pignolo-ui.
- Sonnet como modelo de prueba; el autor usa opus: la activación puede diferir.
- Frases escritas por quien escribió las descriptions: favorece al tratamiento. Las 10 negativas se escribieron adrede cerca del límite (pantalla, texto, bug) para compensarlo.
- El control es una cota de 0 por construcción, no un competidor.
- No probado todavía: que `--tools Skill` y `--allowedTools Skill` dejen invocar skills de un plugin cargado con `--plugin-dir` en `claude -p`. Por eso existe `--probe`.

## Resultados

_Sin correr._
