# Medición de Pignolo 2 contra superpowers

**Estado: sin correr.**

_Esta ficha se escribió y se commiteó antes de cualquier corrida, como pide `docs/protocolo-de-pruebas.md`. Las corridas pagas esperan el OK explícito del autor para el gasto y son condición para publicar la 1.0.0 (diseño §9)._

## 1. Pregunta e hipótesis

**Pregunta.** ¿Pignolo 2 hace el mismo trabajo que superpowers con una calidad igual o mejor y sin gastar mucho más?

**Hipótesis.**
- H1 (feature mediana): Pignolo 2 gasta como máximo 1,5 veces los tokens ponderados de superpowers y la calidad, juzgada a ciegas, es igual o mejor.
- H2 (tarea chica): en un bug y en un cambio de una frase, Pignolo 2 no tarda más ni gasta más que superpowers. Es la anti-meta principal: si falla, se recorta antes de publicar.
- H3 (detección de frentes): diciendo "validá" sin más contexto, `validate` elige exactamente los frentes escritos de antemano en cada repo de juguete y no lanza más de 5 agentes.

## 2. Variable y lo que se mantiene fijo

**Variable que cambia (una sola):** qué plugin está activo. Un solo plugin por brazo, nunca los dos (sus skills "obligatorias" compiten por la activación, diseño §8).

**Fijo:** mismo repo, mismo commit de partida (cada corrida en un worktree nuevo desde ese commit), misma consigna textual, mismo modelo y effort de la sesión principal, misma máquina. Lo que cada plugin lance por dentro (subagentes, modelos de sus revisores) es parte del brazo, no una variable controlada.

## 3. Brazos

| Brazo | Plugin activo | Rol |
|---|---|---|
| A (control) | superpowers solo | método vigente |
| B | Pignolo 2 solo | método a probar |

Para el revisor a ciegas los brazos se nombran `X` e `Y`, asignados al azar por corrida y presentados en orden mezclado.

## 4. Métricas

| Métrica | Unidad | Cómo se mide |
|---|---|---|
| Tokens por tipo | tokens (entrada, salida, caché leída, caché escrita) | Suma de los registros de uso de la sesión principal y de todos sus subagentes |
| Tokens ponderados | tokens equivalentes | Cada tipo por su precio relativo; la tabla de pesos se fija en la calibración, antes de la primera corrida válida |
| Costo | USD, si el registro lo da | Tokens por tipo por tarifa vigente |
| Tiempo de pared | segundos | Del primer mensaje al mensaje final del agente |
| Calidad | hallazgos graves y nota 1 a 5 | Un revisor Opus a ciegas (nombres neutros, orden mezclado) revisa el resultado de cada corrida contra la consigna; más tests que pasan en el repo de la tarea |
| Hallazgos graves | cantidad | Solo lo que afecta corrección, datos o requisitos |
| Frentes elegidos | ids | Línea `Frentes:` de la salida de `validate`, comparada con `fronts-expected.json` por `tests/evals/compare-fronts.js` |
| Agentes lanzados | cantidad | Conteo de subagentes en el registro |

## 5. Medición 1: feature mediana

**Tarea:** `[pendiente: la elige el autor]`. Una buena: una feature de 1 a 3 horas de trabajo humano en un repo real chico o mediano, con tests existentes, que toque más de un archivo, tenga criterio de aceptación verificable por script y una o dos decisiones de diseño reales; ni trivial ni que dependa de gusto visual. Se fija el commit de partida y la consigna textual antes de correr.

**Repeticiones:** 2 por brazo (4 corridas), intercaladas A, B, A, B para que la carga de la máquina pegue igual. El protocolo pide al menos 3 por brazo si la corrida cuesta menos de ~300 mil tokens; una feature mediana con subagentes cuesta más, así que se usan 2 y **la prueba baja a E2**. La conclusión vale solo si la diferencia es grande; con 2 repeticiones cualquier diferencia chica es ruido.

**Regla de decisión.** Pignolo 2 pasa si:
1. su mediana de tokens ponderados es como máximo 1,5 veces la mediana de superpowers, **y**
2. su calidad es igual o mejor (mediana de nota igual o mayor y no más hallazgos graves que el control), **y**
3. los rangos (mínimo a máximo) de los dos brazos no se pisan en la métrica en que se afirma una diferencia.

Si los rangos se pisan, el resultado es **"sin diferencia demostrada"** y se decide por lo más simple. Si pasa el umbral de tokens pero no la calidad, o al revés, no pasa. Se anota que no hay repetición suficiente para E3.

## 6. Medición 2: tarea chica (anti-meta principal)

Dos tareas en los dos brazos, mismo repo y commit:
- **T-bug:** un bug acotado, reproducible con un test que falla, de un solo archivo.
- **T-frase:** un cambio de una frase (texto de un mensaje o de un comentario de interfaz).

Las tareas concretas son `[pendiente: las elige el autor]` y se fijan antes de correr.

**Repeticiones:** 3 por brazo y por tarea (cada corrida chica cuesta mucho menos de 300 mil tokens), intercaladas. Nivel E3 para esta medición.

**Regla de decisión.** Pignolo 2 pasa si, en ambas tareas, su mediana de tiempo de pared y su mediana de tokens ponderados son menores o iguales que las de superpowers, y el resultado es correcto (el test pasa, el cambio es el pedido y nada más). Cualquier exceso de la mediana de Pignolo 2 sobre la de superpowers cuenta como falla de la anti-meta, salvo que los rangos se pisen: en ese caso es "sin diferencia demostrada" y se registra como riesgo abierto, no como aprobado.

## 7. Medición 3: detección de frentes

Tres repos de juguete en `tests/evals/fixtures/` (ver su `README.md`), con lo esperado en `tests/evals/fronts-expected.json`. En cada uno, con Pignolo 2 activo, decir "validá" sin más contexto y comparar la salida con `node tests/evals/compare-fronts.js <fixture> <archivo>`.

| Repo de juguete | Frentes esperados | Por qué |
|---|---|---|
| `landing-form` | `security, hygiene` | Diff chico (4 archivos, 30 líneas) con formulario y traza suelta: la evidencia de formulario y basura impide tratarlo como diff chico sin frentes |
| `app-db` | `security, database, code, tests, hygiene` | Supera el límite de diff chico (10 archivos); esquema y migración, autenticación, runner de tests, trazas sueltas; `docs` queda fuera por el tope de 5 |
| `cli-script` | ninguno | 2 archivos, 14 líneas, sin formulario, basura, autenticación ni datos |

**Repeticiones:** 3 por repo, nivel E3 para la tasa de aciertos de cada caso. **Regla:** pasa si en todas las repeticiones de los tres repos la línea `Frentes:` coincide con lo esperado (`ok: true`) y `validate` no lanza más de 5 agentes. Una sola repetición con frentes distintos es un hallazgo a analizar, no se descarta.

## 8. Presupuesto

**Tope:** `[pendiente: lo fija el autor]` USD.

Antes de correr se hace un sondeo de una corrida chica por brazo para calibrar el costo, y con eso se estima el total de las tres mediciones. **Si el gasto se agota a mitad de camino:** se detienen las corridas, se anota qué quedó sin correr y por qué, se publican los datos parciales con su nivel de evidencia, y se pide al autor decidir si amplía el tope o si se reduce el alcance (primero se recortan repeticiones de la medición 3, después las de la 1). Lo que no se midió se declara como no medido; la 1.0.0 no se publica con una medición obligatoria sin correr salvo decisión explícita del autor.

## 9. Durante y después

- Cada corrida en un worktree nuevo desde el mismo commit; carga pareja o corridas intercaladas, anotando cuántos agentes más había.
- Nada se descarta en silencio: una corrida cortada o fallida se anota con su motivo y, si se repite, las dos quedan en el registro.
- Datos crudos: una fila por corrida en el CSV de la prueba (id del experimento, brazo, repetición, métricas).
- Resultado por brazo: mediana y rango; nunca un número sin su dispersión. Resultados negativos también se publican.
- Se documenta en este archivo y en `docs/benchmarks.md`, con el nivel de evidencia de cada cifra.

## 10. Amenazas a la validez

- **Muestra chica:** 2 repeticiones en la feature mediana (E2) y 3 en el resto; el ruido entre corridas puede tapar diferencias reales.
- **Un solo repo y una sola tarea mediana:** no generaliza a otros lenguajes, tamaños ni tipos de trabajo; los repos de juguete son sintéticos y más fáciles que uno real.
- **Calificador de la misma familia:** el revisor Opus a ciegas es de la misma familia que el modelo que ejecuta; puede compartir sesgos y preferir su propio estilo.
- **Carga de la máquina:** las corridas comparten máquina y red; se mitiga intercalando, no se elimina.
- **No se midió:** satisfacción del usuario, mantenibilidad a largo plazo, costo de aprender cada método.
- **Pesos de los tokens:** dependen de las tarifas vigentes y de la calibración.
- **Un solo plugin por brazo** aísla la variable pero no mide la coexistencia, que no se soporta.

## 11. Resultados

_Sin correr. Las secciones siguientes se llenan después de las corridas, con mediana y rango por brazo._

### 11.1 Feature mediana (E2)

| Brazo | Rep. | Tokens ponderados | Tiempo (s) | Nota | Hallazgos graves | Agentes |
|---|---|---|---|---|---|---|
| A superpowers | 1 | `[sin correr]` | | | | |
| A superpowers | 2 | `[sin correr]` | | | | |
| B Pignolo 2 | 1 | `[sin correr]` | | | | |
| B Pignolo 2 | 2 | `[sin correr]` | | | | |

Mediana y rango por brazo: `[sin correr]`. Decisión: `[sin correr]`.

### 11.2 Tarea chica (E3)

`[sin correr]`

### 11.3 Detección de frentes (E3)

`[sin correr]`

### 11.4 Conclusión

`[sin correr]`
