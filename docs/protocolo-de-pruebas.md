# Protocolo de pruebas

_Decisión del autor, 2026-10-01: las pruebas de método, de agentes y de diseño siguen un modelo más científico. Este protocolo rige para toda prueba nueva. Las anteriores quedan como están, marcadas con su nivel de evidencia._

## Niveles de evidencia

Toda cifra que se publique lleva uno de estos rótulos:

| Nivel | Qué es | Para qué alcanza |
|---|---|---|
| **E3, experimento controlado** | Brazos que difieren en una sola variable, misma tarea, repeticiones, métricas fijadas antes | Decidir |
| **E2, comparación única** | Dos brazos sobre la misma tarea, una corrida por brazo | Decidir solo si la diferencia es grande (ver "Regla de decisión") y se anota que no hay repetición |
| **E1, observación** | Datos de trabajo real, sin brazo de control (el registro `docs/ejecuciones.csv`, simulaciones sobre transcripciones) | Formular hipótesis y elegir qué probar; no decide solo |
| **E0, opinión** | Juicio de un agente o de fuentes externas sin medición propia | Contexto |

## Antes de correr: la ficha

Se escribe y se commitea **antes** de la primera corrida, en el `RESULTS-*.md` de la prueba:

1. **Pregunta e hipótesis**, con el sentido esperado ("partir por ola baja los tokens ponderados al menos 15 % sin subir los hallazgos graves").
2. **Variable que cambia** (una sola) y lo que se mantiene fijo: tarea, commit de partida, modelo, encargo salvo la variable, máquina.
3. **Brazos**, con uno de control que es el método vigente.
4. **Métricas**, con su unidad y cómo se miden: costo (tokens por tipo y ponderados por precio; USD si hay), tiempo de pared, calidad (tests que pasan, hallazgos graves de una revisión a ciegas, mutaciones en rojo) y las que pida la pregunta.
5. **Repeticiones**: mínimo 3 por brazo cuando la corrida cuesta menos de ~300 mil tokens; si cuesta más, 1 o 2 y la prueba baja a E2.
6. **Regla de decisión**, con el umbral. Sin umbral escrito no hay conclusión.
7. **Presupuesto** con tope, y qué se hace si se agota a mitad de camino.

## Durante

- **Mismo punto de partida**: cada corrida en un worktree nuevo desde el mismo commit.
- **Carga pareja**: las corridas que se comparan no comparten máquina con otros agentes, o corren intercaladas (A, B, A, B) para que la carga pegue igual en los dos brazos. Se anota cuántos agentes más había.
- **Calidad a ciegas**: el que califica (revisor opus o script) no sabe de qué brazo viene cada resultado; los brazos se le pasan con nombres neutros y en orden mezclado. Cuando califica el autor, igual.
- **Nada se descarta en silencio**: una corrida cortada o fallida se anota con su motivo; si se repite, las dos quedan en el registro.

## Después

- **Datos crudos**: una fila por corrida en `docs/ejecuciones.csv` (o en el CSV de la prueba), con el id del experimento, el brazo y el número de repetición.
- **Resultado**: por brazo, mediana y rango (mínimo a máximo); con 5 o más repeticiones, también el desvío. Nunca un solo número sin su dispersión.
- **Regla de decisión**: una diferencia cuenta si supera el umbral de la ficha **y** los rangos de los brazos no se pisan. Si se pisan, el resultado es "sin diferencia demostrada" y se decide por lo más simple.
- **Amenazas a la validez**, siempre: tamaño de muestra, una sola tarea o repo, carga de la máquina, calificador de la misma familia que el que ejecuta, lo que no se midió.
- **Resultados negativos también se publican.**

## Qué no cambia

- Toda prueba se documenta en el momento en `tests/evals/RESULTS-*.md` y en `docs/benchmarks.md`.
- Las corridas pagas llevan sondeo, calibración y tope en USD; el banco final corre solo con el OK del autor.
- Lo que no se puede medir se decide por convención, pros y contras y un atacante por alternativa, y se rotula E0.

## Nivel de lo ya publicado

- A/B de serie contra paralelo, de HTML contra lienzo, de modelo y carta de `ui-option`: **E2** (una corrida por brazo; la calidad visual la juzgó el autor sabiendo el brazo).
- A/B del brainstorming: **E2 a E3** (2 a 3 corridas por brazo, calificador por script).
- Evals de agentes con 3 a 5 corridas por caso: **E3** para la tasa de aciertos de cada caso.
- Costos por tipo de trabajo (§2d) y validación del ciclo (§2g): **E1**; los ahorros estimados ahí son hipótesis.
