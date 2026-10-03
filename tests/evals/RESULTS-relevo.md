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

## Ampliación de la ficha (2026-10-02, pedido del autor; escrita antes de lanzar los brazos nuevos)

El autor pidió comparar cuatro formas de ejecutar un plan y después probar combinaciones. Se suman dos brazos sobre **la misma tarea y el mismo commit de partida** (`c67aeee`), así los cuatro son comparables:

| Brazo | Ejecución | Reglas del ciclo | Estado al ampliar |
|---|---|---|---|
| `unico-v2` (control) | un ejecutor de punta a punta | `liviano-v2` | ejecución terminada |
| `relevo-tareas-v2` | relevo tras 3 tareas | `liviano-v2` | segundo tramo en curso |
| `unico-v1` | un ejecutor de punta a punta | `liviano-v1` | nuevo |
| `relevo-tokens-v2` | relevo por límite de tokens | `liviano-v2` | nuevo |

- **`liviano-v1` en la ejecución** es el encargo anterior: sin lista de autochequeo y con la suite completa (`npm test`) corrida por el propio ejecutor al final, repitiendo solos los archivos que fallen. Todo lo demás del encargo es igual.
- **Relevo por límite de tokens:** el controlador mide el contexto del agente en su transcripción cada 30 s; cuando pasa de **300 mil tokens** le avisa que entregue al cerrar la tarea en curso, y sigue un agente nuevo con la misma libreta de traspaso. Si nunca pasa del umbral, no hay relevo y se informa así.
- **Comparaciones planeadas:** `unico-v2` contra `relevo-tareas-v2` y contra `relevo-tokens-v2` (cambia solo la ejecución); `unico-v2` contra `unico-v1` (cambian solo las reglas del ciclo). Las combinaciones (por ejemplo relevo con `liviano-v1`) quedan para una segunda ronda, según lo que salga.
- **Ciclo completo por brazo:** después de ejecutar, cada brazo recibe su revisión opus y su pasada de arreglos con las reglas de su método (`v1`: informe en prosa, el que arregla reconstruye los casos, arregla también los menores y corre la suite completa; `v2`: hallazgos importantes como tests que fallan, solo críticos e importantes, sin suite completa). Los revisores no saben que hay un experimento ni de qué brazo es cada rama. Al final el controlador corre la suite completa una vez sobre cada rama.
- **Métricas por fase** (ejecución, revisión, arreglos) y del ciclo entero: tokens por tipo y costo ponderado, minutos de pared, usos de herramienta, contexto máximo; hallazgos críticos, importantes y menores; tests que pasan en la suite final. La velocidad (minutos de pared del ciclo) es la métrica que más le interesa al autor; el costo ponderado sigue siendo la de la regla de decisión original.
- **Regla de decisión, ampliada:** para cada comparación, la alternativa gana si es al menos 15 % mejor que el control en minutos de pared **o** en costo ponderado, sin ser 15 % peor en la otra, y sin más críticos ni más de un importante por encima del control. Si no, "sin diferencia demostrada" y queda lo más simple.
- **Carga:** los dos brazos nuevos corren a la vez y sin otros agentes, igual que corrió el primer par.
- **Sigue siendo nivel E2:** una corrida por brazo.
- **Presupuesto ampliado:** hasta ≈ 4 millones de tokens de contexto final sumando ejecuciones, revisiones y arreglos de los cuatro brazos. Sin dólares.

**Amenazas nuevas.** Los pares corren en momentos distintos (la máquina y los límites de uso pueden diferir); el segundo tramo de `relevo-tareas-v2` corrió sin compañía; la revisión de `unico-v1` tiene otro formato que las demás, así que sus conteos de hallazgos son menos comparables; el agente de `unico-v2` reenvió su informe varias veces después de terminar y ese gasto se descuenta (se toma su costo hasta la primera entrega).

## Resultados

_Pendiente: se completa al terminar las corridas._
