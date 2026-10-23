# Medición de Pignolo 2 contra superpowers

**Estado: medido (2026-10-23). Los resultados están en la sección 11, debajo del texto preinscrito, que no se tocó.**

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

_Todas las cifras salen de `node tests/evals/harness/run.mjs summary` sobre `tests/evals/pignolo2-runs.csv` (datos crudos, una fila por corrida, incluidas las repetidas). Mediana y rango siempre; el nivel de evidencia va en cada título. Los pesos de los tokens son los de la configuración actual del arnés._

**Lo medido y con qué.** La feature mediana es una feature de una app privada del autor (varios archivos, con tests de aceptación ocultos); las dos tareas chicas son de la misma app. Por eso no se nombran ni se describen más. Los tres repos de la detección de frentes son públicos (`tests/evals/fixtures`).

### 11.0 Cronología y corridas descartadas

La calibración (experimento `pignolo2-calib`, 0,92 USD, no entra en las cifras) y las primeras corridas reales encontraron errores del arnés. Cada uno se arregló en el arnés **antes** de las corridas válidas, y las corridas afectadas se repitieron (en el CSV figuran como `rerun`; las originales siguen en el archivo y el resumen las deja afuera):

1. Disposición mal armada de `node_modules` en la instantánea de la tarea: la calibración se descartó.
2. Falsa contaminación: el arnés tomó por contaminación los plugins integrados de Claude Code; se acotó la detección a plugins de los brazos.
3. Contenido sincronizado de la cuenta (skills y plugins de la cuenta que Claude Code baja al directorio de configuración): se declara en cada corrida (`neutral_config`) y se lo trata como contexto igual en los dos brazos.
4. Falso positivo de la detección de escape de carpeta (`escaped_cwd`): se corrigió la regla y se repitió la corrida afectada.
5. Encabezado del CSV: una columna nueva desalineó filas; se corrigió y se reconstruyó.
6. Activación por comando de barra mal contada: el arnés no contaba `/pignolo:work` como activación y subestimaba la del brazo BF; se corrigió y `remetric` recalculó las métricas desde el registro de cada corrida.
7. La línea `Frentes:` se buscaba solo en el mensaje final y no en todos los mensajes del asistente; se corrigió y se recalculó.
8. Ruido de fin de línea: la conversión de saltos de línea CRLF/LF aparecía como cambio de archivos; se separó en una nota informativa (`eol_converted_files`, `eol_only_files`) que no entra en las reglas.

Después se agregó (post hoc, ver la sección 11.3) una cifra secundaria de frentes medida por los agentes lanzados.

### 11.1 Feature mediana

#### Par autónomo A contra B (E2, n=2 por brazo)

| Medida | A superpowers | B Pignolo 2 |
|---|---|---|
| Tokens ponderados, mediana (rango) | 360.025 (340.224 a 379.827) | 373.311 (308.891 a 437.731) |
| Costo USD, mediana (rango) | 0,72 (0,67 a 0,77) | 0,73 (0,62 a 0,83) |
| Tiempo de pared s, mediana (rango) | 198 (163,6 a 232,4) | 185,1 (148,3 a 221,9) |
| Agentes lanzados | 0 | 0 |
| Aceptación (tests ocultos) | 146/148, 0 de 2 corridas verdes | 148/148, 2 de 2 corridas verdes |
| Plugin activado | 0 de 2 (el hook de SessionStart de superpowers sí corrió, 2/2) | 0 de 2 |

- B/A de tokens ponderados: mediana 1,04 y máximo 1,15 (umbral 1,5 en ambos).
- Calidad a ciegas: nota mediana 3,5 en los dos brazos; hallazgos graves, mediana 2 en A y 0,5 en B.
- **Veredicto del resumen: pasa. No inferioridad (H1): se cumple, con evidencia E2.** No se afirma superioridad: con n=2 los rangos se pisan.
- **Hecho que acota la lectura:** ninguna corrida de este par activó su plugin (0 llamadas a la herramienta `Skill`), de modo que **este par mide al modelo base con distinto contexto cargado**, no una comparación de métodos. Es lo que obtiene un usuario que instala el plugin y pide la tarea completa sin invocarlo.

#### Par forzado AF contra BF (E2, n=2 por brazo)

AF es superpowers con un prefijo en el prompt que pide su flujo; BF es Pignolo 2 invocado con el comando `/pignolo:work`. Los dos plugins se activaron en las 4 corridas (AF por la herramienta `Skill`, BF por el comando de barra).

| Medida | AF superpowers | BF Pignolo 2 |
|---|---|---|
| Tokens ponderados, mediana (rango) | 543.229 (453.321 a 633.138) | 457.059 (450.248 a 463.869) |
| Costo USD, mediana (rango) | 1,00 (0,88 a 1,12) | 0,87 (0,86 a 0,87) |
| Tiempo de pared s, mediana (rango) | 327,8 (296,5 a 359,1) | 251,1 (231,8 a 270,5) |
| Agentes lanzados | 0 | 0 |
| Aceptación (tests ocultos) | 148/148, 2 de 2 corridas verdes | 148/148, 2 de 2 corridas verdes |

- BF/AF de tokens ponderados: mediana 0,84 y máximo 0,73 (umbral 1,5).
- Calidad a ciegas: nota mediana 3,5 en AF y 4 en BF; hallazgos graves, mediana 1,5 en AF y 0,5 en BF.
- **Veredicto del resumen: pasa. H1 se cumple, con evidencia E2.** BF queda por debajo de AF en la mediana, pero los rangos se pisan: **no se afirma superioridad**.

#### Calificación a ciegas

Un revisor Opus, en una sesión aparte, calificó las 8 corridas de la feature mediana (los dos pares) contra la consigna, con nombres neutros (`X`/`Y`) y orden mezclado; no reportó ninguna filtración de qué brazo era cuál. Resultado por brazo y repetición (corrección 1 a 5, calidad 1 a 5, hallazgos graves):

| Brazo | Rep. | Corrección | Calidad | Hallazgos graves |
|---|---|---|---|---|
| A | 1 | 3 | 3 | 2 |
| A | 2 | 3 | 4 | 2 |
| B | 1 | 5 | 4 | 0 |
| B | 2 | 2 | 3 | 1 |
| AF | 1 | 5 | 4 | 0 |
| AF | 2 | 2 | 3 | 3 |
| BF | 1 | 4 | 4 | 1 |
| BF | 2 | 5 | 4 | 0 |

Naturaleza de los hallazgos, solo en general: un caso de borde de formato de rótulos con años, un flujo de edición que convertía un tipo de evento en otro y otros defectos de integración que los tests no cubrían. No se reproduce su texto porque nombra código de la app privada (el archivo de calificaciones no se versiona). Con 2 corridas por brazo la dispersión entre repeticiones del mismo brazo (por ejemplo corrección 5 y 2) es tan grande como la diferencia entre brazos.

### 11.2 Tareas chicas, par autónomo (E3, n=3 por brazo)

| Tarea | Medida | A superpowers | B Pignolo 2 | Decisión |
|---|---|---|---|---|
| small-1 | Tokens ponderados, mediana (rango) | 311.526 (273.695 a 350.443) | 309.934 (275.787 a 361.529) | sin diferencia demostrada |
| small-1 | Tiempo de pared s, mediana (rango) | 157,1 (133,2 a 162,4) | 159,9 (133,6 a 160,5) | rangos pisados: riesgo abierto |
| small-1 | Costo USD, mediana | 0,60 | 0,60 | |
| small-1 | Aceptación | 114/114, 3 de 3 verdes | 114/114, 3 de 3 verdes | |
| small-2 | Tokens ponderados, mediana (rango) | 116.806 (108.351 a 118.159) | 141.110 (127.055 a 155.410) | **no pasa** |
| small-2 | Tiempo de pared s, mediana (rango) | 59,2 (52,2 a 61,2) | 53,0 (48,6 a 66,8) | |
| small-2 | Costo USD, mediana | 0,27 | 0,33 | |
| small-2 | Aceptación | 180/180, 3 de 3 verdes | 180/180, 3 de 3 verdes | |

- **small-1: empate.** La mediana de tiempo de B es apenas mayor pero los rangos se pisan; los tokens de B son iguales o menores. Se registra como riesgo abierto, no como aprobado.
- **small-2: la regla de la tarea chica falla en tokens.** B gasta alrededor de un 20 % más de tokens ponderados en la mediana (141.110 contra 116.806) y los rangos no se pisan. Ninguno de los dos brazos activó su plugin (0 de 3 en cada uno) y los dos resolvieron la tarea bien, así que la causa de la diferencia es desconocida (n=3). Es un resultado negativo y se publica como tal.
- En ninguna de las dos tareas se activó un plugin: ambas miden al modelo base con distinto contexto cargado.

### 11.3 Detección de frentes (E3, 3 repos x 3 repeticiones, solo brazo B)

Prompt: "Validá el código del proyecto." con Pignolo 2 activo. **`validate` se activó por sí sola en 9 de 9 corridas.**

| Repo | Frentes esperados | Corridas con la línea `Frentes:` correcta (regla preinscrita) | Veredicto preinscrito | Cifra secundaria: agentes lanzados con el conjunto esperado | Línea `Frentes:` impresa |
|---|---|---|---|---|---|
| `cli-script` | ninguno | 3/3 | **pasa** | 3/3 | 3/3 |
| `app-db` | `security, database, code, tests, hygiene` | 1/3 | **no pasa** | 3/3 | 1/3 |
| `landing-form` | `security, hygiene` | 0/3 | **no pasa** | 1/3 | 1/3 |

- Tokens ponderados, mediana (rango): `cli-script` 73.432 (72.992 a 79.395), `landing-form` 127.301 (126.510 a 139.264), `app-db` 275.957 (272.747 a 288.125). Agentes: mediana 0, 1 (rango 1 a 2) y 5 (rango 5 a 5) respectivamente.
- **La línea `Frentes:` se imprimió en 5 de 9 corridas** (3 de `cli-script`, 1 de `app-db`, 1 de `landing-form`). La regla preinscrita es sobre esa línea y por eso `app-db` y `landing-form` no pasan.
- **Cifra secundaria, agregada post hoc (después de ver las corridas) y por eso etiquetada así:** el conjunto de frentes medido por los agentes realmente lanzados coincide con el esperado en 3/3 en `app-db`, 3/3 en `cli-script` y 1/3 en `landing-form`. No cambia ningún veredicto preinscrito. En `landing-form` la higiene se delegó en 1 de 3 corridas; en las otras dos el hilo principal se ocupó solo de los archivos sueltos.

### 11.4 Conclusión

- **Feature mediana (H1):** la no inferioridad se cumple en el par forzado (BF/AF = 0,84 de mediana de tokens) y en el autónomo (B/A = 1,04), con calidad no peor, ambos en E2. No se afirma que Pignolo 2 sea mejor: los rangos se pisan.
- **Tarea chica (H2):** no se sostiene del todo. small-1 empata; small-2 falla en tokens (B alrededor de un 20 % más, sin activación de ninguno de los dos plugins, causa desconocida). Según la ficha, una falla de la anti-meta pide recortar antes de publicar; la decisión es del autor.
- **Detección de frentes (H3):** `cli-script` pasa; `app-db` y `landing-form` no pasan por la regla de la línea `Frentes:`, que se imprimió solo en 5 de 9 corridas. Con la cifra secundaria los agentes lanzados fueron los esperados en 7 de 9, pero eso no reemplaza el veredicto preinscrito.
- **Activación:** con prompts completos ningún plugin se activó por sí solo en los pares autónomos (0 llamadas a `Skill`); lo único que se activó solo fue `validate` ante "Validá el código del proyecto.".

### 11.5 Amenazas a la validez observadas

Se suman a la sección 10:

- n=2 en la feature mediana (E2) y una sola app privada del autor.
- El calificador es de la misma familia de modelos que el que ejecutó.
- El prompt de la feature mediana casi especifica la solución (rutas de módulos, firmas y textos exactos), lo que reduce el lugar para que el método importe.
- Skills de la cuenta sincronizadas y cargadas en los dos brazos.
- Las corridas usaron `bypassPermissions` en una exportación descartable, con detección de escape de carpeta pero sin prevención.
- Los pares autónomos miden al modelo base, no los métodos.
- El costo de la calificación a ciegas no está en el registro del arnés (corrió en una sesión Opus aparte).

### 11.6 Qué no se midió

- El flujo conversacional interactivo de `start` y de la lluvia de ideas (no hay usuario simulado).
- La activación real en sesiones interactivas.
- Trabajo de larga duración.
- Otros repos y otros modelos.

### 11.7 Gasto

32 corridas únicas, 16,00 USD en corridas (calibración 0,92; feature mediana 6,63; tareas chicas 5,41; detección 3,05), sobre un tope aprobado de 40. La calificación a ciegas corrió como sesión Opus aparte, con un costo que no está en el registro del arnés.

Datos crudos: [`pignolo2-runs.csv`](pignolo2-runs.csv). Para reproducir las cifras: `node tests/evals/harness/run.mjs summary`.
