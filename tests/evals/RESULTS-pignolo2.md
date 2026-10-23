# Medición de Pignolo 2 contra superpowers

**Estado: sin correr.**

_Esta ficha se escribió y se commiteó antes de cualquier corrida, como pide `docs/protocolo-de-pruebas.md`. Las corridas pagas esperan el OK explícito del autor para el gasto y son condición para publicar la 1.0.0 (diseño §9)._

## Aclaración previa (2026-10-23)

_Escrita **después** de que corriera el primer par mediano autónomo (una corrida por brazo, A y B) y motivada por lo que mostró: en las dos corridas hubo 0 llamadas a la herramienta `Skill`, es decir, con un prompt completo **ninguno de los dos plugins se activó por sí solo**. Esa observación es anterior a esta aclaración y la motivó; los umbrales de las reglas de abajo no cambian, pero sí cambia qué se compara y con qué pares, así que el lector debe tomarlo como una decisión posterior a mirar ese primer par, no como preinscripción pura._

- **Se informan dos pares**, cada uno con sus propias reglas de decisión:
  - **Autónomo (A contra B):** cada brazo tal como es, con el prompt de la tarea sin más; es lo que obtiene el usuario al instalar el plugin y pedir directamente.
  - **Forzado (AF contra BF):** el método invocado a propósito. AF es superpowers con un prefijo en el prompt que pide usar su flujo (brainstorming, writing-plans y después ejecutar el plan); BF es Pignolo 2 con el prefijo `/pignolo:work `. Es el mismo plugin que en el par autónomo (la variable sigue siendo qué plugin está activo); cambia solo el prompt.
- **Criterios de publicación:** (i) la no inferioridad de H1 en la tarea mediana, **en el par forzado**; (ii) la regla de la tarea chica, **en el par autónomo** (que el plugin no sume costo cuando no se usa); (iii) la prueba de detección de frentes en los repos de juguete (medición 3).
- Cada cifra que se publique lleva su par y su nivel de evidencia. Un par autónomo en el que ninguna corrida activó su plugin se informa como "mide al modelo base", no como una comparación de métodos.
- La prueba de detección (medición 3) corre en el arnés como tareas de tipo `fixture` con el brazo Pignolo 2.

## 1. Pregunta e hipótesis

**Pregunta.** ¿Pignolo 2 hace el mismo trabajo que superpowers con una calidad igual o mejor y sin gastar mucho más?

**Hipótesis.**
- H1 (feature mediana), de **no inferioridad**: Pignolo 2 no es peor que superpowers en gasto, es decir su mediana de tokens ponderados es como máximo 1,5 veces la de superpowers y su máximo es como máximo 1,5 veces el máximo de superpowers, y la calidad, juzgada a ciegas, es igual o mejor. H1 no afirma que Pignolo 2 gaste menos.
- H2 (tarea chica): en un bug y en un cambio de una frase, Pignolo 2 no tarda más ni gasta más que superpowers. Es la anti-meta principal: si falla, se recorta antes de publicar.
- H3 (detección de frentes): diciendo "validá" sin más contexto, `validate` elige exactamente los frentes escritos de antemano en cada repo de juguete y respeta un tope de agentes por repo: `cli-script` cero agentes en total, `landing-form` como máximo 2 agentes de frente, `app-db` no más de 5 agentes de frente.

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
| Tokens ponderados | tokens equivalentes | Cada tipo por su precio relativo y un factor por familia de modelo (los modelos de los revisores y subagentes difieren de la sesión principal); la tabla de pesos y de factores se fija en la calibración contra el costo en USD, antes de la primera corrida válida |
| Costo | USD, si el registro lo da | Tokens por tipo por tarifa vigente |
| Tiempo de pared | segundos | Del primer mensaje al mensaje final del agente |
| Calidad | hallazgos graves y nota 1 a 5 | Un revisor Opus a ciegas (nombres neutros, orden mezclado) revisa el resultado de cada corrida contra la consigna; más tests que pasan en el repo de la tarea |
| Hallazgos graves | cantidad | Solo lo que afecta corrección, datos o requisitos |
| Frentes elegidos | ids | Línea `Frentes:` de la salida de `validate`, comparada con `fronts-expected.json` por `tests/evals/compare-fronts.js` |
| Agentes lanzados | cantidad | Conteo de las invocaciones de la herramienta Agent en el registro, incluidas las que lanzan los comandos nativos (`/code-review`, `/security-review`); se informan aparte los agentes de frente y los de comandos nativos |

## 5. Medición 1: feature mediana

**Tarea:** `[pendiente: la elige el autor]`. Una buena: una feature de 1 a 3 horas de trabajo humano en un repo real chico o mediano, con tests existentes, que toque más de un archivo, tenga criterio de aceptación verificable por script y una o dos decisiones de diseño reales; ni trivial ni que dependa de gusto visual. Se fija el commit de partida y la consigna textual antes de correr.

**Repeticiones:** 2 por brazo (4 corridas), intercaladas A, B, A, B para que la carga de la máquina pegue igual. El protocolo pide al menos 3 por brazo si la corrida cuesta menos de ~300 mil tokens; una feature mediana con subagentes cuesta más, así que se usan 2 y **la prueba baja a E2**. La conclusión vale solo si la diferencia es grande; con 2 repeticiones cualquier diferencia chica es ruido.

**Regla de decisión (no inferioridad).** Pignolo 2 pasa si:
1. su mediana de tokens ponderados es como máximo 1,5 veces la mediana de superpowers, **y**
2. su máximo de tokens ponderados es como máximo 1,5 veces el máximo de superpowers, **y**
3. su calidad es igual o mejor (mediana de nota igual o mayor, no más hallazgos graves que el control y no menos corridas verdes en la aceptación).

La condición de que los rangos (mínimo a máximo) de los dos brazos no se pisen **vale solo para afirmar superioridad** (que Pignolo 2 es mejor que superpowers en una métrica), no para la no inferioridad. Con los rangos pisados y la mediana de Pignolo 2 por debajo, el resumen escribe "no se afirma superioridad"; y cuando se cumplen las tres condiciones de arriba lo informa como "no inferioridad (H1): se cumple". Si pasa el umbral de tokens pero no la calidad, o al revés, no pasa. Se anota que no hay repetición suficiente para E3.

Si todas las corridas de un brazo terminan sin cambios (por ejemplo se detiene a hacer una pregunta), eso es un resultado y no una espera: el resumen escribe "el brazo X termina sin cambios en todas las corridas: n/n". Si es Pignolo 2, la tarea no pasa; si es el control, no es comparable.

_Aclaración del 2026-10-23, escrita antes de cualquier corrida real: la versión anterior de esta regla pedía rangos separados también para pasar, lo que mezclaba la no inferioridad con la superioridad. Todavía no se corrió nada, así que el cambio no depende de ningún dato._

## 6. Medición 2: tarea chica (anti-meta principal)

Dos tareas en los dos brazos, mismo repo y commit:
- **T-bug:** un bug acotado, reproducible con un test que falla, de un solo archivo.
- **T-frase:** un cambio de una frase (texto de un mensaje o de un comentario de interfaz).

Las tareas concretas son `[pendiente: las elige el autor]` y se fijan antes de correr.

**Repeticiones:** 3 por brazo y por tarea (cada corrida chica cuesta mucho menos de 300 mil tokens), intercaladas. Nivel E3 para esta medición.

**Regla de decisión.** Pignolo 2 pasa si, en ambas tareas, su mediana de tiempo de pared y su mediana de tokens ponderados son menores o iguales que las de superpowers, y el resultado es correcto (el test pasa, el cambio es el pedido y nada más). "Correcto" se mide así: el comando de aceptación sale con código 0, ninguna suite falla (un archivo de test que no se puede importar es una suite fallida), ningún test falla y pasa al menos uno; y la suite completa del proyecto no tiene más fallas que el piso de la tarea (`baselineFull`, las fallas que ya tenía el commit base): si hay más fallas que el piso, falla la anti-meta. Cualquier exceso de la mediana de Pignolo 2 sobre la de superpowers cuenta como falla de la anti-meta, salvo que los rangos se pisen: en ese caso es "sin diferencia demostrada" y se registra como riesgo abierto, no como aprobado.

## 7. Medición 3: detección de frentes

Tres repos de juguete en `tests/evals/fixtures/` (ver su `README.md`), con lo esperado en `tests/evals/fronts-expected.json`. En cada uno, con Pignolo 2 activo, decir "validá" sin más contexto y comparar la salida con `node tests/evals/compare-fronts.js <fixture> <archivo>`.

| Repo de juguete | Frentes esperados | Por qué |
|---|---|---|
| `landing-form` | `security, hygiene` | 4 archivos, 26 líneas (diff chico por tamaño) con formulario y traza suelta: la evidencia de formulario y basura impide tratarlo como diff chico sin frentes |
| `app-db` | `security, database, code, tests, hygiene` | Supera el límite de diff chico (10 archivos, 134 líneas); esquema y migración, autenticación, runner de tests, trazas sueltas; `docs` no entra porque nada de lo que la documentación menciona se borró ni se renombró (sin evidencia) |
| `cli-script` | ninguno | 2 archivos, 12 líneas, sin formulario, basura, autenticación ni datos |

**Repeticiones:** 3 por repo, nivel E3 para la tasa de aciertos de cada caso. **Regla:** pasa si en todas las repeticiones de los tres repos la línea `Frentes:` coincide con lo esperado (`ok: true`) y se cumple el tope de agentes de cada repo (contando las invocaciones de la herramienta Agent del registro, también las de comandos nativos): `cli-script` cero agentes en total (con diff chico `validate` revisa en el hilo principal y no invoca `/code-review`), `landing-form` como máximo 2 agentes de frente, `app-db` no más de 5 agentes de frente (el subagente propio de `/code-review` se cuenta aparte y se nombra en la línea de costo). Una sola repetición con frentes distintos es un hallazgo a analizar, no se descarta.

## 8. Presupuesto

**Tope:** 40 USD en total (aprobado por el autor), con un tope por corrida que el arnés pasa a `claude -p`. El arnés se niega a lanzar una corrida si lo ya gastado más el tope por corrida pasa de 40. Lo gastado cuenta todas las filas del CSV, la calibración incluida.

Antes de correr se hace un sondeo de una corrida chica por brazo para calibrar el costo (con el experimento `pignolo2-calib`: queda en el mismo CSV y cuenta para el tope, pero no se mezcla en las cifras reales), y con eso se estima el total de las tres mediciones. **Si el gasto se agota a mitad de camino:** se detienen las corridas, se anota qué quedó sin correr y por qué, se publican los datos parciales con su nivel de evidencia, y se pide al autor decidir si amplía el tope o si se reduce el alcance (primero se recortan repeticiones de la medición 3, después las de la 1). Lo que no se midió se declara como no medido; la 1.0.0 no se publica con una medición obligatoria sin correr salvo decisión explícita del autor.

## 9. Durante y después

- Cada corrida en un worktree nuevo desde el mismo commit; carga pareja o corridas intercaladas, anotando cuántos agentes más había.
- Nada se descarta en silencio: una corrida cortada o fallida se anota con su motivo y, si se repite, las dos quedan en el registro. Una corrida inválida (cortada por tiempo, con error, que superó el tope por corrida, contaminada, que tocó fuera de su carpeta o que terminó sin cambios) sale de las cifras, se lista y deja la tarea pendiente hasta repetirla.
- Nivel de evidencia de cada cifra: E3 con 3 o más corridas válidas por brazo, E2 con 2, "sin evidencia" con 1 o menos (una sola corrida por brazo no muestra dispersión).
- Dónde quedó el código de cada corrida (carpeta, worktree o rama) se registra, y la aceptación y los conteos se miden en el árbol con más cambios contra el commit base.
- Datos crudos: una fila por corrida en el CSV de la prueba (id del experimento, brazo, repetición, métricas).
- Resultado por brazo: mediana y rango; nunca un número sin su dispersión. Resultados negativos también se publican.
- Se documenta en este archivo y en `docs/benchmarks.md`, con el nivel de evidencia de cada cifra.

## 10. Amenazas a la validez

- **Muestra chica:** 2 repeticiones en la feature mediana (E2) y 3 en el resto; el ruido entre corridas puede tapar diferencias reales.
- **Un solo repo y una sola tarea mediana:** no generaliza a otros lenguajes, tamaños ni tipos de trabajo; los repos de juguete son sintéticos y más fáciles que uno real.
- **Contenido sincronizado de la cuenta:** el contexto de cada brazo incluye también las skills y plugins que Claude Code sincroniza de la cuenta al directorio de configuración al correr con sesión iniciada (carpetas `skills/synced`, `plugins/synced` y `plugins/data`). Es igual en los dos brazos y refleja las sesiones reales del autor, pero suma contexto idéntico a ambos y puede cambiar el gasto absoluto. El arnés lo declara en cada corrida (`neutral_config` del CSV); y bloquea si ese contenido trae algo con el nombre de un plugin de los brazos. _Aclaración de preinscripción hecha antes de cualquier corrida válida._
- **Activación del plugin:** un brazo solo prueba su plugin si el modelo lo usa. El arnés cuenta, por corrida, las llamadas a la herramienta `Skill` y las de skills del propio plugin (`own_skill_calls`) y el resumen informa "activaron el plugin: n/m"; si ninguna corrida activó su plugin, la comparación de esa tarea mide al modelo base y se dice así. _Aclaración de preinscripción hecha antes de cualquier corrida válida._
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
