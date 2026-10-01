# Resultados: ejecutar un plan en serie o en paralelo, y con qué modelo

Fecha: 2026-09-30. Windows 11, Claude Code 2.1.285. Pedido del autor: medir velocidad, eficiencia, eficacia y costo de cada forma de ejecutar, con un plan real y A/B.

## Caso

La ola 1 del hito 4a de pignolo (Tasks 3 a 6: compuerta, sabotaje, holdout y escritura por rol), 4 tareas independientes. Las mismas tarjetas (`docs/plans/2026-09-30-hito-4-tests-sabotaje-holdout.md`, versión auditada) y la misma base (`contract/hito-4a/v1`) para todos los brazos.

**Cómo se califica la calidad:** los tests finales de esas cuatro tareas, tal como quedaron después de la revisión final opus y sus dos pasadas de arreglos (`22abe82`, 180 tests). Incluyen los defectos que la revisión encontró (recuperación que pisaba trabajo, mayúsculas en Windows, comodines en la shell). Se ponen encima del resultado de cada brazo y se cuentan los que pasan. Sobre el código final dan 179/180; sobre la base sin implementar, 80/180 (lo que ya pasaba antes).

## Resultados

| Brazo | Modelo de los implementadores | Tiempo de pared | Tokens de agentes | Tests finales que pasan |
|---|---|---|---|---|
| Paralelo, 4 agentes (A/B) | sonnet | ~28 min (la tarea más lenta) | ~531 mil | 148/180 |
| Serie, 1 agente (A/B) | sonnet | ~32 min | ~272 mil | 151/180 |
| Ejecución original del hito 4a (paralelo) | sonnet en T3 y T6, opus en T4 y T5 | ~22 min | ~0,58 millones | 150/180 |

Por tarea, los tres fallan lo mismo: T4 (sabotaje) 9–10 de 22, T5 (holdout) 43 de 57, T6 (escritura por rol) 10–11 de 14; T3 (compuerta) 86–87 de 87.

**Comparabilidad:** el A/B es directo (misma base, mismas tarjetas, mismo modelo, misma hora y la misma carga de la máquina). La ejecución original corrió otro día con otros procesos en paralelo; sirve como referencia.

## Qué dicen los datos

1. **El paralelo es ≈ 15 % más rápido y cuesta ≈ 2 veces más tokens** que un ejecutor en serie, con la misma calidad. Cada agente nuevo paga leer el contexto desde cero, y la tarea más lenta marca el ritmo.
2. **El modelo del implementador no cambió la calidad:** la ejecución original, con opus en las dos tareas más difíciles, saca lo mismo que sonnet.
3. **Lo que falta no lo pone la ejecución:** los ~30 tests que fallan en todos los brazos son casos que el plan no especificaba (por ejemplo, que la recuperación no pise una edición posterior) y que solo encontró la revisión final con experimentos. La calidad depende de cuánto se valida el plan antes y de la revisión después, no de cómo se reparte el trabajo ni de qué modelo escribe el código.
4. **Otro dato de la misma sesión, con plan en tarjetas real:** las Tasks 1 a 8 del hito 5 en serie costaron ~323 mil tokens y ~54 min; las 8 tareas del hito 4b en paralelo, ~780 mil y ~52 min.

## Recomendación

Ejecutar en serie por defecto con sonnet (la mitad de tokens, ~15 % más lento). Paralelo solo cuando el tiempo de pared importa más que el costo. Poner el esfuerzo (y opus) en validar el plan (dos pasos con experimentos, `RESULTS-planes.md`) y en la revisión final, que es donde se encuentran los defectos.

Gaps relacionados: G16 (serie contra paralelo) en `docs/gaps.md`.
