# Experimento: relevo del ejecutor por ola en un plan largo

_Ficha escrita y commiteada antes de la primera corrida, como pide `docs/protocolo-de-pruebas.md`. Id del experimento en `docs/ejecuciones.csv`: `relevo-ola-1`._

## Ficha (2026-10-02)

1. **Pregunta.** En un plan largo, ¿conviene relevar al ejecutor por un agente nuevo al cerrar una ola, en vez de un solo ejecutor de punta a punta?
   **Hipótesis.** El relevo baja el costo ponderado de la ejecución al menos 15 % sin subir los hallazgos graves de la revisión. Viene de una simulación sobre transcripciones (nivel E1, `tests/evals/RESULTS-metodo.md`): −10 a −38 % según el hito.
2. **Variable que cambia (una sola).** Cuántos agentes ejecutan el plan.
   **Fijo.** La tarea (etapa 2 del lienzo de pignolo-ui: T2b, T4b, T7d, T7b, T8, T9b y T10b del plan `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`, sin la puerta manual T6b), el commit de partida, el modelo (sonnet), el encargo salvo la regla de relevo, el método `liviano-v2` (cada agente corre solo los tests de lo que toca; lista de autochequeo), la máquina.
3. **Brazos.**
   - **control (`unico`):** un ejecutor en serie de la primera a la última tarea.
   - **`relevo`:** el mismo encargo más la regla: al cerrar una tarea con commit, si ya hizo 3 tareas o más y quedan 2 o más, entrega y sigue un agente nuevo. El traspaso es por commits y una libreta (`progress.md` fuera del repo: una línea por tarea con su commit, los rulings y las interfaces que cambiaron). El umbral de la simulación era de contexto (≈ 300 mil tokens); como el agente no ve su contexto, se usa la cuenta de tareas, que es lo que el producto podría aplicar.
4. **Métricas.**
   - **Costo:** tokens de entrada nueva, escritura de caché, lectura de caché y salida, sacados de las transcripciones; costo ponderado con entrada 1, escritura de caché 1,25, lectura 0,1 y salida 5. Es la métrica principal.
   - **Tiempo de pared:** minutos de agentes, sumados.
   - **Calidad:** hallazgos críticos e importantes de una revisión opus **a ciegas** (los brazos se le pasan como `x` e `y`, en orden sorteado, con el mismo encargo y sin mencionar el experimento); tests de pignolo-ui que pasan; cuántas tareas quedaron completas.
   - **Secundarias:** contexto máximo de cada agente, usos de herramienta, cortes.
5. **Repeticiones.** Una corrida por brazo: cada una pasa de 300 mil tokens, así que la prueba es de nivel **E2**.
6. **Regla de decisión.** Se adopta el relevo si el costo ponderado del brazo `relevo` es al menos 15 % menor que el de `unico` **y** no tiene más críticos ni más de un importante por encima del control. Con una corrida por brazo no hay rango: una diferencia menor al 15 % cuenta como "sin diferencia demostrada" y se queda el ejecutor único, que es lo más simple. Se une a `main` el brazo con menos hallazgos graves; a igualdad, el de control.
7. **Presupuesto.** Sin dólares: solo uso de la suscripción. Tope de ≈ 1,6 millones de tokens entre los dos brazos y las dos revisiones. Si un brazo se corta por límite de uso, se retoma una vez desde su último commit y se anota; si se corta dos veces, la prueba se informa como incompleta.

**Carga de la máquina.** Los dos brazos corren a la vez, en worktrees distintos y sin otros agentes, para que la carga les pegue igual.

**Amenazas a la validez, conocidas de antemano.** Una sola corrida por brazo y un solo hito; el brazo de control hace 7 tareas y puede no llegar a un contexto grande; el revisor es de la misma familia de modelos que los ejecutores; los dos brazos compiten por la máquina; el umbral por cuenta de tareas no es el de la simulación.

## Resultados

_Pendiente: se completa al terminar las corridas._
