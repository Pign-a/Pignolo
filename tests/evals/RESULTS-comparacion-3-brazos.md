# Comparación de tres brazos: sin plugin, superpowers y Pignolo

**Estado: borrador, sin preinscribir.**

_Esta ficha se escribe y se commitea antes de cualquier corrida de validación, como pide `docs/protocolo-de-pruebas.md`. Hasta que el autor llene los campos de abajo y congele el conjunto de tareas, nada de lo que dice es una preinscripción. Es el seguimiento de [`RESULTS-pignolo2.md`](RESULTS-pignolo2.md), cuya medición tuvo tres tareas en total y por eso solo permite afirmaciones exploratorias (ver su sección "Corrección de las etiquetas de evidencia (2026-10-23)"). Las corridas pagas esperan el OK explícito del autor._

## Campos que fija el autor antes de congelar

| Campo | Valor |
|---|---|
| Tope de gasto total (USD) | `[a fijar]` |
| Número de tareas de validación N | `[a fijar]` (la ficha calcula costo y potencia para 20; la grilla de potencia va de 8 a 30) |
| Hash de congelado (SHA-256 del archivo de congelado, ver sección 12) | `[a fijar]` |
| Commit de esta ficha (el que llena estos campos) | `[a fijar]` |
| Semilla del calendario y del bootstrap | `[a fijar]` |
| Márgenes marcados `[propuesto, el autor confirma]` | confirmar o cambiar cada uno antes de congelar |

La semilla y la confirmación de los márgenes hacen falta para que la preinscripción sea reproducible.

## 1. Pregunta e hipótesis

**Pregunta.** En tareas reales de una app privada del autor, con el mismo modelo, el mismo esfuerzo y el mismo prompt, ¿cuánto cuesta y qué calidad entrega un agente de Claude Code con Pignolo instalado, comparado con (a) el mismo agente sin ningún plugin y (b) el mismo agente con superpowers instalado?

El resultado puede ser que Pignolo cueste más, lo mismo o menos, y que la calidad sea peor, igual o mejor. **La ficha no supone que el plugin gane.** La evidencia previa apunta más bien a efectos chicos o negativos en el costo: los archivos de contexto para agentes sumaron alrededor de un 20 % de costo sin ganancia significativa (Gloaguen et al.), y las skills curadas ayudaron poco en ingeniería de software mientras las autogeneradas no ayudaron (SkillsBench).

Brazos: **N** (sin plugin), **S** (superpowers solo), **P** (Pignolo solo).

**Contrastes primarios (costo).** P contra N y P contra S.

- **H-NI (no inferioridad de costo).** El costo de P no supera 1,5 veces el del control: la cota superior unilateral del 95 % de la razón de medias geométricas de los costos por tarea (P sobre control) es menor que 1,5. Se evalúa en los dos contrastes primarios; ambos son coprimarios y cada uno se declara por separado (la unión de condiciones no requiere ajuste de alfa).
- **H-Dif (diferencia de costo).** Hay una diferencia de costo entre P y el control, en cualquier sentido. Se evalúa con permutación de signos, ajustada con Holm sobre los dos contrastes primarios.

**Secundarias.**

- **Éxito:** la aceptación oculta queda en verde (sí o no por corrida), P contra cada control.
- **Panel de calidad:** nota del juez a ciegas, tests de regresión, errores nuevos de `tsc` y de ESLint, alcance del cambio (ver sección 6).

**Exploratoria.** S contra N, con las mismas herramientas y sin regla de decisión: sirve para ubicar a superpowers, no para decidir sobre Pignolo.

## 2. Qué enseñó la medición anterior y qué se consultó

### 2.1 Lo que enseñó la medición anterior (RESULTS-pignolo2.md)

1. **El plugin no se activó solo.** Con un prompt completo hubo 0 llamadas a la herramienta `Skill` en los pares autónomos. Esos pares medían al modelo base con distinto contexto cargado. Aquí la activación es una métrica de primera clase (ITT y por protocolo) y las variantes de invocación forzada quedan fuera del análisis primario.
2. **Repetir una tarea no es replicar.** Las tareas chicas tuvieron 3 a 6 repeticiones de una sola tarea cada una. Mide el ruido entre corridas, no la generalización de tarea a tarea. La unidad de análisis aquí es la tarea.
3. **El ruido entre corridas es grande para el tamaño de los efectos buscados.** La mediana de costo de una tarea trivial varió alrededor de un 20 % entre tandas de 3 repeticiones, y un resultado de "no pasa" (alrededor de un 20 % más de tokens) desapareció al repetir (small-2: de B/A = 1,21 con tres repeticiones a 1,07 con seis). El desvío del log del costo dentro de una misma tarea y brazo fue de aproximadamente 0,10 a 0,14 (estimación E1 sobre las corridas válidas de las dos tareas chicas).
4. **Se ajustó la skill mirando el conjunto de prueba** (detección de frentes, rondas 2 y 3) y se cambió el criterio después de ver los datos. Aquí hay un conjunto de desarrollo para ajustar y otro de validación congelado por hash antes de la primera corrida.
5. **El prompt de la tarea mediana casi especificaba la solución,** lo que deja poco lugar para que el método importe. Aquí hay una regla de auditoría del prompt.

### 2.2 Evidencia consultada

Resumen de lecturas, no de mediciones propias (nivel E0 en el sentido del protocolo). La credibilidad es la de la fuente (revisión por pares, autoría, método), según la lectura del autor de la ficha. No hay un estudio publicado y riguroso del plugin superpowers; lo que se sabe de él viene de su propio repositorio y de uso anecdótico.

| Fuente | Qué aporta al diseño | Credibilidad |
|---|---|---|
| Anthropic, "Demystifying evals for AI agents" (https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | Tareas inequívocas con solución de referencia, entorno limpio por corrida, calificadores deterministas siempre que se pueda y calificadores con modelo calibrados contra juicio humano, leer las transcripciones | Alta |
| Anthropic, "Quantifying infrastructure noise in agentic coding evals" (https://www.anthropic.com/engineering/infrastructure-noise) | La configuración de la infraestructura mueve los puntajes de evaluaciones de código agéntico: misma máquina, mismos límites y registro de la versión en todos los brazos | Alta |
| Miller, "Adding Error Bars to Evals" (https://arxiv.org/abs/2411.00640) | Los errores estándar deben agrupar por la unidad correlacionada (la tarea) y las comparaciones entre modelos deben ser apareadas por pregunta | Alta |
| Yao et al., tau-bench, pass^k (https://arxiv.org/pdf/2406.12045) | Con repeticiones, la consistencia (pass^k) es muy inferior al acierto en una corrida. Aquí hay una corrida por tarea y brazo, así que no se estima pass^k y se dice | Alta |
| Kapoor et al., "AI Agents That Matter" (https://arxiv.org/pdf/2407.01502) | Informar el costo junto con la exactitud (costo por tarea resuelta), no solo la exactitud | Alta |
| Zheng et al., MT-Bench (https://arxiv.org/pdf/2306.05685) | Sesgos del juez con modelo: posición, verbosidad y preferencia por lo propio. Mitigación: orden mezclado, dos pasadas, criterios concretos | Alta |
| Gloaguen et al., "Evaluating AGENTS.md" (https://arxiv.org/pdf/2602.11988) | Los archivos de contexto agregan alrededor de un 20 % de costo sin ganancia significativa. Leído solo el resumen | Alta (leído solo el resumen) |
| SkillsBench (https://arxiv.org/pdf/2602.12670) | Las skills curadas suman 4,5 puntos en ingeniería de software; las autogeneradas restan 1,3 | Media-alta |
| METR 2025, ensayo controlado (https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) | La percepción del desarrollador no es una métrica: la sensación de ir más rápido no coincidió con la medición | Alta |
| Kitchenham et al., EASE 2019, errores estadísticos en experimentos de ingeniería de software (https://keele-repository.worktribe.com/OutputFile/458269) | Errores típicos: comparaciones múltiples sin ajuste, tamaños de efecto ausentes, pruebas inadecuadas, parada opcional | Alta |
| Inozemtseva y Holmes, ICSE 2014 (https://cs.ubc.ca/~rtholmes/papers/icse_2014_inozemtseva.pdf) | La cobertura se relaciona débilmente con la capacidad de detectar fallos una vez controlado el tamaño de la suite | Alta |
| Just et al., FSE 2014 (https://homes.cs.washington.edu/~mernst/pubs/mutation-effectiveness-fse2014-abstract.html) | Los mutantes se relacionan con los fallos reales de forma mixta; el puntaje de mutación es un sustituto imperfecto | Alta |
| OpenAI, validez de los tests de SWE-bench Verified (https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) | Los tests de aceptación pueden rechazar soluciones válidas o exigir detalles no pedidos, y puede haber contaminación: de ahí la auditoría por aserción | Alta |

## 3. Variable, brazos y lo que se mantiene fijo

**Variable que cambia (una sola):** qué plugin está activo.

| Brazo | Plugin activo |
|---|---|
| N (control) | ninguno; el mismo archivo de proyecto neutro |
| S | superpowers solo |
| P | Pignolo solo |

**Fijo en los tres brazos:** el prompt de la tarea, textual y sin prefijo; el modelo y el esfuerzo; los topes por corrida y total; la máquina; la versión del CLI; un directorio de configuración limpio y dedicado a la medición; el `CLAUDE.md` neutro (el mismo en los tres); el contenido neutro sincronizado de la cuenta (skills y plugins que Claude Code baja al directorio de configuración al iniciar sesión), idéntico y declarado en cada corrida; la semilla del calendario. Un solo plugin por brazo, nunca dos (sus skills obligatorias compiten por la activación).

**Identidad de los plugins, congelada.** El archivo de congelado (sección 12) guarda el commit de Pignolo, la versión o el commit de superpowers, la versión del CLI y el identificador resuelto del modelo. Cualquier cambio posterior de esos valores invalida la preinscripción.

**Lo que cada plugin lance por dentro** (subagentes, revisores, modelos propios) es parte del brazo, no una variable controlada. Se registra: agentes lanzados, tokens por tipo.

**Activación.** Un brazo con plugin prueba el plugin solo si el modelo lo usa. Se informa por corrida (llamadas a la herramienta `Skill`, skills propias del plugin, comando de barra) y por brazo (tasa de activación).

- **ITT (análisis primario):** cada corrida cuenta en el brazo asignado, se haya activado el plugin o no. Responde "qué obtiene quien instala el plugin y pide la tarea".
- **Por protocolo (descriptivo):** solo las corridas donde el plugin se activó. La selección rompe el azar, así que es descriptivo y se acompaña de la tasa de activación.
- **Variantes forzadas** (prefijo en el prompt o `/pignolo:work`): fuera del análisis primario y fuera del presupuesto base. Si el autor las agrega, es un análisis aparte, rotulado, con su propio n fijo.

## 4. Tareas

### 4.1 Conjunto de desarrollo (no entra en las conclusiones)

Las tres tareas de la medición anterior (una mediana y dos chicas, de la app privada) y los tres repos de juguete públicos de `tests/evals/fixtures`. Se usan para depurar el arnés y para ajustar el texto de los plugins. **Sus resultados no entran en ninguna conclusión de esta comparación.** Ninguna tarea de validación puede coincidir con ellas ni con sus vecinas inmediatas en el historial (10 commits a cada lado).

### 4.2 Conjunto de validación

**N tareas** (`[a fijar]`; el costo y la potencia se calculan para 20) elegidas por una **regla mecánica escrita antes de mirar candidatos** a partir de commits reales de la app privada. Las tareas se identifican con ids genéricos (`v01`, `v02`...); nada de nombres, rutas ni funciones de la app aparece en el repositorio.

**Regla de selección.**

1. Universo: commits sin fusión de la rama principal, ordenados por fecha, sin los del conjunto de desarrollo ni sus vecinos.
2. Elegible si cumple todo esto: toca al menos un archivo de producción y al menos un archivo de test; el commit padre instala y su suite existente pasa (salvo fallas previas documentadas); los tests del commit corren sin red ni secretos en menos de 5 minutos; el cambio es de comportamiento (no es solo renombre, formato, documentación, dependencias o archivos generados); el diff de producción no pasa de 400 líneas sin contar archivos generados.
3. Estratos: **chica** = 1 o 2 archivos de producción y hasta 60 líneas de producción; **mediana** = 3 a 8 archivos y de 61 a 400 líneas. La mezcla propuesta para N = 20 es 8 chicas y 12 medianas `[propuesto, el autor confirma]`.
4. Muestreo: se baraja cada estrato con una PRNG con semilla registrada y se recorren los candidatos en ese orden hasta llenar la cuota. Un candidato que no pasa la verificación mecánica (4.3) o la auditoría (4.4) se reemplaza por el siguiente de la lista y el motivo queda anotado. El reemplazo no depende de ningún resultado de los brazos, porque todavía no corrió ninguno.

### 4.3 Tests de aceptación ocultos

Son los tests del commit real, adaptados solo en lo imprescindible. Para cada tarea:

- **Rojo en el padre:** fallan en el commit padre por la razón correcta (falta el comportamiento pedido, no un error ajeno).
- **Verde en el commit real:** pasan, corridos 3 veces para descartar tests inestables.
- **Interfaz fijada por el prompt:** el prompt declara los nombres y firmas que los tests necesitan y nada más. El prompt no copia la solución ni sus detalles internos.

### 4.4 Auditoría de validez por aserción (antes de congelar)

Cada aserción de los tests ocultos se clasifica: (a) exigida por el prompt, (b) implícita en lo que pide el prompt o en las convenciones del repo, (c) detalle arbitrario no derivable del prompt (un texto exacto, un orden interno, un nombre). Las de tipo (c) se eliminan o se pasan al prompt. Además se audita el prompt: si casi dicta la solución, se reescribe. La hace un agente Opus con registro y la revisa el autor. En una submuestra de 5 tareas, un agente independiente que no ve la solución real implementa el prompt y se comprueba que sus soluciones válidas pasan los tests ocultos (control de falsos rechazos; se descuenta del presupuesto, sección 11).

### 4.5 Congelado

El conjunto completo (prompts, commits padre, tests ocultos, auditoría, rúbricas del juez, calendario, identidades de plugins y CLI, scripts de análisis) se congela por hash **antes de la primera corrida de validación** (sección 12). **Después del congelado no se reajusta ningún texto de ningún plugin.** Si se modifica un plugin, el conjunto de validación pasa a ser de desarrollo y hay que reemplazarlo por tareas nuevas.

## 5. Diseño

- **Una repetición por tarea y brazo.** La tarea es la unidad. Se justifica con la investigación (Miller: lo que se generaliza es el número de tareas, las repeticiones de una misma tarea no reducen la incertidumbre entre tareas) y con el ruido observado (sección 2.1). La simulación de potencia (sección 9) muestra que pasar de 1 a 2 repeticiones por tarea mejora poco, mientras que duplicar el costo de ejecución es seguro. **Desviación del protocolo:** `docs/protocolo-de-pruebas.md` pide al menos 3 repeticiones por brazo cuando la corrida cuesta menos de ~300 mil tokens; aquí la replicación es entre tareas. En esta ficha, "E3" significa replicación a nivel de tarea con n de 8 o más, y con menos de 8 tareas el resultado es exploratorio `[propuesto, el autor confirma]`.
- **Orden al azar con semilla.** El calendario baraja el orden de las tareas y, dentro de cada tarea, el orden de los tres brazos. Se guarda el calendario completo en el archivo de congelado.
- **Brazos intercalados en el tiempo.** Las tres corridas de una tarea van seguidas (bloque de tarea), de modo que la variación horaria de la API y de la máquina pega parecido a los tres brazos.
- **Espacio de trabajo limpio por corrida:** un árbol nuevo desde el commit padre, sin restos de corridas anteriores.
- **Topes fijos** por corrida y total (campo del autor). Una corrida que llega al tope por corrida o se corta por tiempo por causa del modelo **es un resultado**, no un fallo de infraestructura: cuenta como no verde, con costo igual al tope (costo censurado, marcado) `[propuesto, el autor confirma]`.
- **Fallos de infraestructura** (error de la API, límite de uso, caída del arnés, corte de red) se registran aparte con su motivo y se repiten hasta 2 veces. **Nunca se repite una corrida por un mal resultado.**
- **Sin mirar:** n fijo; no se agregan tareas ni repeticiones después de ver resultados. Una mirada intermedia está permitida solo para detectar fallas del arnés, se declara en el informe y no es confirmatoria.
- **Si se agota el presupuesto:** se detiene en el límite de un bloque de tarea (el arnés no arranca un bloque si lo gastado más el tope de sus tres corridas pasa del total). Como el orden es aleatorio, las tareas completas son una muestra válida. Se publica con el n alcanzado; con menos de 8 tareas el resultado es exploratorio. No se amplía el tope para "rescatar" un resultado.

## 6. Métricas

Las deterministas deciden. El juez nunca decide solo.

| Métrica | Unidad | Cómo se mide | Tipo |
|---|---|---|---|
| Costo por tarea | USD | Costo total de la corrida que informa el CLI, sumando la sesión principal y todos los subagentes; se cruza con tokens por tipo y tarifa en la calibración | Automática |
| Tokens por tipo | tokens | Entrada, salida, caché leída y caché escrita, de la sesión principal y de los subagentes | Automática |
| Costo por tarea resuelta | USD por tarea con aceptación verde | Costo total del brazo dividido por el número de tareas verdes del brazo (Kapoor et al.); se informa junto con el éxito | Automática |
| Tiempo de pared | s | Del primer mensaje al mensaje final | Automática |
| Turnos y agentes lanzados | cantidad | Turnos del registro; invocaciones de la herramienta Agent, incluidas las de comandos nativos | Automática |
| Activación del plugin | sí o no por corrida | Llamadas a `Skill`, skills propias, comando de barra; tasa por brazo | Automática |
| Aceptación oculta | verde o no | Los tests ocultos (4.3) corren sobre el resultado; verde = el comando sale con código 0, ninguna suite falla y pasa al menos un test | Automática |
| Regresiones en la suite existente | tests, contra la línea base | Fallas de la suite existente en el resultado menos las que ya tenía el commit padre | Automática |
| Errores nuevos de `tsc` | cantidad | Errores del resultado menos los del padre | Automática |
| Errores nuevos de ESLint | cantidad | Ídem | Automática |
| Alcance fuera de la solución real | archivos y líneas | Archivos (y sus líneas) que el resultado cambió y que el commit real no tocó, sin contar generados ni bloqueos de dependencias | Automática, descriptiva |
| Tamaño del diff | líneas agregadas y quitadas | Contra el commit padre | Automática, descriptiva |
| Tests agregados | cantidad | Casos de test nuevos. **Proxy descriptivo solamente:** más tests no es mejor calidad | Automática, descriptiva |
| Cobertura de líneas nuevas y puntaje de mutación | % | Opcionales y solo descriptivos, con la cantidad de mutantes. La investigación muestra que la cobertura se relaciona débilmente con la detección de fallos y que el puntaje de mutación es mixto, y en diffs chicos hay pocos mutantes y las cifras son ruidosas | Automática, opcional |
| Panel del juez | proporción de criterios cumplidos | Ver abajo | Con modelo, a ciegas |

**El juez.** Rúbrica con criterios binarios concretos por tarea (por ejemplo "implementa el comportamiento pedido para el caso X", "maneja el caso borde Y que cubre la solución real", "no cambia comportamiento no pedido", "agrega un test que falla sin el cambio"), escrita a partir del prompt y de la solución real **antes de las corridas** y congelada. Cada pasada recibe el prompt, la solución real, la rúbrica y los resultados de los tres brazos con **nombres neutros, orden mezclado**. Dos pasadas por tarea, con asignación de etiquetas y orden distintos. La nota es la proporción de criterios cumplidos, promediando las dos pasadas; las discrepancias entre pasadas se informan.

**Limitación declarada:** el juez es de la misma familia de modelos que los ejecutores, y puede compartir sesgos y preferir su propio estilo (MT-Bench). Mitigaciones: criterios binarios contra la solución real, ciegas, orden mezclado, dos pasadas, el tamaño del diff informado al lado (sesgo de verbosidad), y **una revisión humana por muestreo**: el autor califica a mano una submuestra al azar (propuesta: 6 de 20 tareas, con semilla registrada) con la misma rúbrica y a ciegas. Se informa el acuerdo por criterio; si el acuerdo es menor al 80 %, el panel se informa como no confiable y no se usa para ninguna conclusión `[propuesto, el autor confirma]`.

## 7. Plan de análisis

Las cuentas las hace `node tests/evals/analysis-cli.mjs` (lo construye otro agente; esta ficha lo cita por su nombre y sus banderas `--csv`, `--contrasts`, `--margin`, `--seed`, `--grades` y `--json`). Ejemplo: `node tests/evals/analysis-cli.mjs --csv <csv de la comparación> --contrasts "P:N,P:S" --margin 1.5 --seed <semilla> --grades <notas> --json`. S contra N se pide aparte (`"S:N"`) y se rotula exploratorio.

1. **Colapsar repeticiones por tarea:** si una tarea y brazo tiene más de una corrida válida (por ejemplo una repetición por fallo de infraestructura), se usa la media geométrica del costo de esa tarea y brazo. Lo esperado es una corrida válida por celda.
2. **Costo.** Para cada contraste, razón de costos por tarea `c_P / c_control`, media del logaritmo, y de ahí la razón de medias geométricas (RMG). Intervalo por **bootstrap percentil sobre las tareas**: 10.000 remuestreos, semilla fija. Cota superior unilateral del 95 % (percentil 95) contra el margen 1,5 para la no inferioridad; intervalo del 90 % (percentiles 5 y 95) para la equivalencia descriptiva con margen 1,25 (el intervalo queda dentro de [0,8; 1,25]). Valor p de la **permutación de signos** sobre las diferencias de log, bilateral, **ajustado con Holm** sobre los dos contrastes primarios.
3. **Cota t adicional `[propuesto, el autor confirma]`.** La simulación de la sección 9 muestra que la cota percentil sola declara no inferioridad con un error tipo I de 5 a 9 % cuando la verdad está justo en el margen (nominal 5 %). Se calcula también la cota t sobre el log: `media + t(0,95; n-1) · s / raíz(n)`. La no inferioridad se declara solo si **las dos** cotas están por debajo de 1,5 (regla doble). Si el CLI no informa la cota t en el momento de congelar, se calcula con esta fórmula.
4. **Éxito.** Por brazo, k/n tareas verdes con intervalo de Wilson del 95 %. Por contraste, **McNemar exacto** sobre los pares discordantes por tarea.
5. **Panel del juez.** Notas apareadas por tarea, Wilcoxon de rangos con signo (exacto para n chico, ceros descartados), y conteos gana/empata/pierde.
6. **Se muestran siempre** el número de tareas, los intervalos y la tasa de activación por brazo. Con **menos de 8 tareas el resultado se rotula exploratorio** y no se dan veredictos.
7. **Descriptivos sin decisión:** tokens por tipo, costo por tarea resuelta, tiempo de pared, turnos, agentes, alcance fuera de la solución real, tamaño del diff, tests agregados, cobertura y mutación si se midieron; por brazo, mediana y rango.
8. **Sensibilidades declaradas, no decisivas:** sin las corridas de costo censurado, sin las tareas donde ningún brazo queda verde, por protocolo en vez de ITT.

## 8. Reglas de decisión

Se fijan antes de ver datos. Para cada contraste P contra X (X = N o S) y con n de 8 o más. Sea `m = max(1, parte entera de 0,10 · n)`: con n = 20, m = 2 tareas (10 puntos).

**Costo.**

| Resultado | Condición |
|---|---|
| **No inferior en costo** | Las dos cotas superiores del 95 % (percentil y t) de la RMG son menores que 1,5 |
| **Más caro demostrado** | El valor p ajustado con Holm es menor que 0,05 **y** el intervalo del 90 % no incluye 1 con la RMG por encima |
| **Más barato demostrado** | Ídem con la RMG por debajo |
| **Sin diferencia demostrada** | Ninguna de las dos diferencias demostradas |
| **Equivalente (descriptivo)** | El intervalo del 90 % queda dentro de [0,8; 1,25] |

Combinaciones: no inferior y sin diferencia demostrada; no inferior y más caro demostrado ("más caro dentro del margen"); no inferior y más barato demostrado; **no concluyente** (no se cumple la no inferioridad y tampoco hay diferencia demostrada); **peor en costo** (más caro demostrado y no se cumple la no inferioridad).

**Calidad.** Cada puerta se evalúa por contraste. `[propuesto, el autor confirma]` todos los márgenes, por estas razones: con n = 20 una tarea vale 5 puntos, una diferencia de una tarea está dentro del ruido y dos tareas (10 puntos) es lo mínimo que merece una alerta; el mismo margen proporcional para todas las puertas evita elegir márgenes distintos a la medida de cada resultado.

| Puerta | Pasa si |
|---|---|
| Q1, aceptación oculta | Tareas verdes de P >= tareas verdes de X menos m **y** el McNemar exacto bilateral no muestra a P peor (p >= 0,05 o P mejor) |
| Q2, regresiones | Tareas con al menos una regresión en la suite existente: P <= X más m |
| Q3, errores nuevos de `tsc` | Tareas con al menos un error nuevo: P <= X más m |
| Q4, errores nuevos de ESLint | Ídem |
| Panel del juez (secundario) | No decide solo: si el Wilcoxon bilateral da p < 0,05 con P peor y ninguna puerta determinista falló, el veredicto queda "con alerta del panel" y se revisa la submuestra humana |

**Veredicto global (por contraste).**

- **Pignolo no inferior a X:** no inferior en costo y las cuatro puertas pasan.
- **Pignolo peor que X:** "peor en costo", o el McNemar muestra a P peor (Q1), o dos o más puertas deterministas fallan; se nombra cuáles.
- **Pignolo mejor que X en costo:** más barato demostrado con las cuatro puertas en verde. "Mejor en éxito" solo si el McNemar muestra a P mejor.
- **Sin diferencia demostrada:** en todo otro caso; se decide por lo más simple, como pide el protocolo, y se informa.

**Límite de lo que puede decir la puerta Q1.** La simulación de la sección 9 muestra que el McNemar exacto casi no tiene potencia con tantas tareas: una caída de 20 puntos en el éxito (0,9 contra 0,7) se detecta con 19 % de probabilidad con 20 tareas. Q1 es una red de seguridad contra una caída grande, no una demostración de no inferioridad en éxito. Una respuesta de "sin pérdida de calidad observada" se escribe así y no como "calidad equivalente".

## 9. Potencia

`node tests/evals/power-sim.mjs` (Node 22 o más, sin dependencias; semilla, número de simulaciones y de remuestreos por bandera: `--seed`, `--sims`, `--boot`, `--quick`, `--json`; con los valores por defecto tarda unos 20 segundos). Lo prueba `tests/power-sim.test.js`.

**Modelo.** Log del costo = efecto de la tarea (sigma 0,6, común a los tres brazos) + interacción tarea por brazo (sigma_int en {0,15; 0,25; 0,40}) + ruido entre corridas (sigma 0,15, promediado en r repeticiones, r en {1, 2}) + efecto de P (razón verdadera 0,8, 1,0, 1,2 o 1,5; S tiene efecto 0). Tareas n en {8, 12, 16, 20, 24, 30}. El análisis simulado es el de la sección 7 (bootstrap percentil sobre las tareas). Los supuestos y su sostén:

- sigma_tarea = 0,6: las tres tareas de la medición anterior tuvieron costos medianos de 0,27, 0,60 y 0,72 USD, un desvío del log de alrededor de 0,5 (E1, tres tareas).
- sigma_corrida = 0,15: el observado fue de 0,10 a 0,14, así que 0,15 es algo conservador.
- **sigma_int no se conoce.** Es la cantidad que decide la potencia (si el plugin ayuda en unas tareas y estorba en otras) y por eso se barre la grilla completa. La corrida real la estimará a posteriori con el desvío de las diferencias de log por tarea.

**Cómo leer las tablas.** La razón de costos verdadera es la de P sobre el control. "NI" es la probabilidad de declarar no inferioridad con la cota percentil; "NI doble" exige además la cota t. Con razón verdadera 1,5 la columna NI es el error tipo I. Con razón 1,0, las columnas "Dif" son la tasa de falsa alarma. Detectar una razón de 0,8 (P un 20 % más barato; en sentido contrario equivale a un 25 % más caro) tiene exactamente la misma potencia que declarar no inferioridad con razón verdadera 1,2: es una identidad aritmética (ln 1,5 menos ln 1,2 es igual a ln 1,25, que es igual a menos ln 0,8), no una coincidencia de la simulación.

Salida de `node tests/evals/power-sim.mjs` con los valores por defecto (semilla 20261023, 1000 simulaciones por celda, 2000 remuestreos). El error de Monte Carlo de cada probabilidad es de menos de 1,6 puntos.

Semilla 20261023; 1000 simulaciones por celda; 2000 remuestreos bootstrap; sigma_tarea 0,60, sigma_corrida 0,15.

Columnas: **±%** semiancho mediano del IC 90 % de la razón de costos; **NI** probabilidad de declarar no inferioridad (cota superior unilateral del 95 % por bootstrap percentil < 1,5) según la razón verdadera P/control; **NI doble** lo mismo exigiendo además que la cota t (n-1 grados de libertad, en log) quede por debajo de 1,5; **Dif90** probabilidad de que el IC 90 % bilateral excluya 1; **DifHolm** igual con el IC 97,5 % (umbral del menor de los dos p con Holm); **Eq** probabilidad de que el IC 90 % quede dentro de [0,8; 1,25]. En la razón verdadera 1,5 las columnas NI son la tasa de error tipo I; en 1,0 las columnas Dif son la tasa de falsa alarma.

**r = 1, sigma_interacción = 0,15**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 17 | 99 | 69 | 8 | 57 | 4 | 69 | 18 | 62 | 53 | 43 |
| 12 | 14 | 100 | 85 | 8 | 80 | 5 | 85 | 15 | 69 | 72 | 67 |
| 16 | 12 | 100 | 92 | 7 | 89 | 5 | 92 | 12 | 81 | 77 | 83 |
| 20 | 11 | 100 | 96 | 7 | 94 | 5 | 96 | 13 | 86 | 88 | 90 |
| 24 | 10 | 100 | 98 | 6 | 97 | 5 | 98 | 12 | 91 | 92 | 95 |
| 30 | 9 | 100 | 99 | 6 | 99 | 5 | 99 | 13 | 95 | 97 | 98 |

**r = 1, sigma_interacción = 0,25**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 24 | 89 | 51 | 9 | 40 | 5 | 51 | 16 | 42 | 36 | 14 |
| 12 | 20 | 97 | 66 | 6 | 56 | 4 | 66 | 12 | 49 | 44 | 28 |
| 16 | 17 | 100 | 72 | 7 | 66 | 5 | 72 | 13 | 58 | 53 | 42 |
| 20 | 16 | 100 | 81 | 7 | 78 | 6 | 81 | 13 | 63 | 65 | 59 |
| 24 | 14 | 100 | 85 | 6 | 83 | 6 | 85 | 11 | 70 | 67 | 70 |
| 30 | 13 | 100 | 91 | 5 | 90 | 4 | 91 | 11 | 79 | 76 | 82 |

**r = 1, sigma_interacción = 0,40**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 36 | 65 | 36 | 8 | 26 | 5 | 37 | 16 | 30 | 23 | 2 |
| 12 | 31 | 77 | 41 | 9 | 34 | 6 | 41 | 16 | 32 | 24 | 3 |
| 16 | 26 | 87 | 47 | 6 | 43 | 4 | 47 | 13 | 37 | 29 | 6 |
| 20 | 24 | 92 | 55 | 7 | 50 | 6 | 55 | 13 | 39 | 34 | 10 |
| 24 | 22 | 95 | 59 | 5 | 55 | 4 | 59 | 12 | 45 | 36 | 19 |
| 30 | 19 | 99 | 67 | 5 | 64 | 5 | 67 | 11 | 52 | 46 | 32 |

**r = 2, sigma_interacción = 0,15**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 14 | 99 | 81 | 8 | 72 | 4 | 82 | 17 | 67 | 67 | 62 |
| 12 | 12 | 100 | 91 | 7 | 86 | 6 | 91 | 15 | 80 | 78 | 83 |
| 16 | 11 | 100 | 96 | 7 | 95 | 6 | 96 | 14 | 89 | 89 | 92 |
| 20 | 10 | 100 | 98 | 7 | 98 | 7 | 98 | 13 | 93 | 95 | 97 |
| 24 | 9 | 100 | 100 | 6 | 100 | 4 | 100 | 12 | 97 | 98 | 99 |
| 30 | 8 | 100 | 100 | 6 | 100 | 5 | 100 | 12 | 98 | 99 | 100 |

**r = 2, sigma_interacción = 0,25**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 22 | 93 | 55 | 7 | 42 | 5 | 56 | 14 | 45 | 38 | 19 |
| 12 | 18 | 98 | 69 | 7 | 61 | 5 | 69 | 15 | 53 | 48 | 37 |
| 16 | 16 | 100 | 76 | 6 | 71 | 4 | 76 | 12 | 61 | 58 | 52 |
| 20 | 14 | 100 | 83 | 7 | 81 | 4 | 83 | 12 | 68 | 68 | 65 |
| 24 | 13 | 100 | 88 | 7 | 86 | 5 | 88 | 14 | 76 | 73 | 76 |
| 30 | 12 | 100 | 95 | 5 | 94 | 5 | 95 | 10 | 83 | 84 | 89 |

**r = 2, sigma_interacción = 0,40**

| n | ±% | NI 1,0 | NI 1,2 | NI 1,5 (error I) | NI doble 1,2 | NI doble 1,5 (error I) | Dif90 0,8 | Dif90 1,0 (falsa alarma) | Dif90 1,2 | DifHolm 0,8 | Eq 1,0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 35 | 69 | 34 | 7 | 23 | 4 | 35 | 16 | 29 | 20 | 2 |
| 12 | 29 | 80 | 44 | 8 | 36 | 6 | 44 | 15 | 33 | 25 | 5 |
| 16 | 26 | 88 | 47 | 7 | 41 | 5 | 47 | 14 | 39 | 27 | 7 |
| 20 | 23 | 93 | 56 | 6 | 51 | 5 | 56 | 13 | 44 | 34 | 17 |
| 24 | 21 | 96 | 61 | 6 | 58 | 5 | 61 | 12 | 49 | 38 | 25 |
| 30 | 19 | 98 | 70 | 6 | 67 | 5 | 70 | 12 | 56 | 45 | 40 |

**Tareas mínimas de la grilla para potencia de al menos 0,8** (las probabilidades de las tablas anteriores, en %; "> 30" si ni 30 alcanza)

| r | sigma_interacción | NI si razón 1,0 | NI si razón 1,2 | NI en los dos contrastes si razón 1,0 | NI doble si razón 1,2 | Detectar -20 % (razón 0,8), IC 90 % | Detectar -20 %, Holm | Detectar +20 % (razón 1,2), IC 90 % |
|---|---|---|---|---|---|---|---|---|
| 1 | 0,15 | 8 | 12 | 8 | 12 | 12 | 20 | 16 |
| 1 | 0,25 | 8 | 20 | 8 | 24 | 20 | >30 | >30 |
| 1 | 0,40 | 16 | >30 | 20 | >30 | >30 | >30 | >30 |
| 2 | 0,15 | 8 | 8 | 8 | 12 | 8 | 16 | 12 |
| 2 | 0,25 | 8 | 20 | 8 | 20 | 20 | 30 | 30 |
| 2 | 0,40 | 16 | >30 | 16 | >30 | >30 | >30 | >30 |

**Éxito binario: McNemar exacto (potencia exacta, sin simulación; éxitos independientes dentro de la tarea; alfa bilateral 0,05).** "Rechaza" es cualquier rechazo; "P peor" y "P mejor" son rechazos en cada sentido.

| Escenario | n | Pares discordantes esperados | Rechaza | P peor | P mejor |
|---|---|---|---|---|---|
| 0,9 contra 0,9 | 8 | 1,4 | 0 | 0 | 0 |
| 0,9 contra 0,9 | 12 | 2,2 | 0 | 0 | 0 |
| 0,9 contra 0,9 | 16 | 2,9 | 0 | 0 | 0 |
| 0,9 contra 0,9 | 20 | 3,6 | 0 | 0 | 0 |
| 0,9 contra 0,9 | 24 | 4,3 | 1 | 0 | 0 |
| 0,9 contra 0,9 | 30 | 5,4 | 1 | 1 | 1 |
| P 0,7 contra N 0,9 | 8 | 2,7 | 1 | 1 | 0 |
| P 0,7 contra N 0,9 | 12 | 4,1 | 4 | 4 | 0 |
| P 0,7 contra N 0,9 | 16 | 5,4 | 11 | 11 | 0 |
| P 0,7 contra N 0,9 | 20 | 6,8 | 19 | 19 | 0 |
| P 0,7 contra N 0,9 | 24 | 8,2 | 26 | 26 | 0 |
| P 0,7 contra N 0,9 | 30 | 10,2 | 36 | 36 | 0 |
| P 0,9 contra N 0,7 | 8 | 2,7 | 1 | 0 | 1 |
| P 0,9 contra N 0,7 | 12 | 4,1 | 4 | 0 | 4 |
| P 0,9 contra N 0,7 | 16 | 5,4 | 11 | 0 | 11 |
| P 0,9 contra N 0,7 | 20 | 6,8 | 19 | 0 | 19 |
| P 0,9 contra N 0,7 | 24 | 8,2 | 26 | 0 | 26 |
| P 0,9 contra N 0,7 | 30 | 10,2 | 36 | 0 | 36 |

### Qué puede y qué no puede concluir el diseño

Lectura con r = 1 (una corrida por tarea y brazo, que es el diseño propuesto), cifras de las tablas anteriores:

- **Descartar un costo de 1,5 veces cuando no hay efecto real:** alcanza con 8 tareas si sigma_int es 0,15 o 0,25 (99 % y 89 % con el bootstrap solo) y hacen falta 16 con sigma_int de 0,40 (87 %).
- **Descartar 1,5 veces cuando el costo real de P es un 20 % mayor:** 12 tareas con sigma_int de 0,15; 20 con 0,25 (81 % con el bootstrap solo, 78 % con la regla doble, que llega al 83 % con 24); más de 30 con 0,40.
- **Detectar una diferencia de 0,8 (o su espejo de 1,25) con el IC del 90 %:** 12 tareas con sigma_int de 0,15; 20 con 0,25; más de 30 con 0,40. Con el umbral de Holm (IC del 97,5 %) hacen falta 20, más de 30 (76 % con 30) y más de 30.
- **Error tipo I:** el bootstrap solo en el margen da 5 a 9 % (nominal 5 %) y la regla doble 4 a 7 %. La falsa alarma de la diferencia con el IC del 90 % es de 10 a 18 % (nominal 10 %), peor con 8 y 12 tareas: por eso la afirmación de diferencia exige además la permutación de signos con Holm.
- **Equivalencia dentro de [0,8; 1,25]:** solo es alcanzable con sigma_int baja y 16 a 20 tareas o más (83 % con 0,15 y 16 tareas, 90 % con 20; con 20 tareas, 59 % con 0,25 y 10 % con 0,40). Es descriptiva, no una conclusión del diseño.
- **Dos repeticiones por tarea (r = 2) ayudan poco:** a igual n, la potencia sube unos pocos puntos (por ejemplo, con sigma_int de 0,25 y n = 20, "NI si razón 1,2" pasa de 81 a 83 %), porque la interacción tarea por brazo domina al ruido entre corridas. Duplicar el costo de las corridas rinde menos que agregar tareas.
- **Éxito binario:** el McNemar exacto tiene muy poca potencia. Con 20 tareas detecta una caída de 0,9 a 0,7 con 19 % de probabilidad, y con 30 tareas con 36 %. Si los dos brazos están cerca del techo (0,9 contra 0,9) hay solo unos 3,6 pares discordantes esperados con 20 tareas. **Con este tamaño no se puede afirmar no inferioridad ni diferencia en el éxito,** salvo diferencias muy grandes; el éxito es un chequeo de seguridad y un dato descriptivo.
- **Lo que el diseño no puede:** detectar efectos menores a ±15 a 20 % de costo, demostrar equivalencia con sigma_int de 0,25 o más, o probar que la calidad no cae.

## 10. Amenazas a la validez

| Amenaza | Mitigación o reconocimiento |
|---|---|
| El plugin no se activa | La activación se informa por corrida y por brazo; ITT es el primario; las variantes forzadas son análisis aparte y rotulado. Si la activación es baja, la comparación mide "instalar el plugin" y se dice |
| Prompts que casi dictan la solución | Auditoría del prompt (4.4); reglas del prompt: interfaz fijada, nada de la solución interna |
| Validez de los tests ocultos | Rojo en el padre, verde en el commit, repetido 3 veces; auditoría por aserción; control con soluciones alternativas en una submuestra (OpenAI sobre SWE-bench Verified) |
| Juez de la misma familia que los ejecutores | Declarado; criterios binarios; ciegas; dos pasadas; revisión humana de una submuestra; las métricas deterministas deciden |
| Una sola app privada y un solo ecosistema | Reconocido: no generaliza a otros lenguajes, stacks ni modelos |
| Ajuste de los plugins sobre las tareas de prueba | Conjunto de desarrollo separado del de validación; congelado por hash; sin reajuste después |
| Parada opcional | n fijo; ninguna tarea ni repetición se agrega después de ver resultados; la mirada intermedia solo para fallas del arnés, declarada |
| Comparaciones múltiples | Holm sobre los dos contrastes primarios; las demás cifras se rotulan secundarias o exploratorias (Kitchenham et al.) |
| Variación horaria de la API | Bloques de tarea con los tres brazos seguidos y en orden aleatorio |
| Ruido entre corridas | Reconocido (sección 2.1); la unidad es la tarea y el ruido entra en el error del contraste |
| Contaminación (el modelo puede conocer código público) | La app es privada; los commits no están en datos públicos que se sepan. No se descarta del todo |
| `bypassPermissions` en una exportación descartable | Detección de escapes de carpeta sin prevención; las corridas que escapan son inválidas |
| Contenido sincronizado de la cuenta en todos los brazos | Idéntico en los tres, declarado por corrida; suma contexto igual a todos y puede cambiar el costo absoluto |
| Costos censurados por el tope por corrida | Marcados; sensibilidad sin ellos |
| Percepción del desarrollador como métrica | No se usa (METR); solo mediciones |
| Cobertura y mutación como medidas de calidad | Solo descriptivas, con su incertidumbre |

**Lo que este diseño no mide:** el flujo interactivo y conversacional (`start`, lluvia de ideas, `session`, identidad de la interfaz), las sesiones largas, otros repos, otros stacks y otros modelos.

## 11. Presupuesto

Modelo de costo con las medianas observadas por corrida (E1, medición anterior): tareas chicas de 0,30 a 0,60 USD (central 0,45) y medianas de 0,70 a 1,10 USD (central 0,90); las corridas de superpowers con invocación forzada costaron un 15 a 25 % más. Mezcla propuesta para 20 tareas: 8 chicas y 12 medianas, 60 corridas.

| Concepto | Bajo | Central | Alto | Supuesto |
|---|---|---|---|---|
| 60 corridas de ejecución | 32,4 | 43,2 | 54,0 | 24 corridas chicas y 36 medianas con los costos de arriba |
| Sobrecosto si superpowers se activa | 0,0 | 2,9 | 4,5 | 0, 20 y 25 % sobre las 20 corridas de S |
| Repeticiones por fallos de infraestructura | 3,2 | 4,6 | 5,9 | 10 % del costo de ejecución (alrededor de 6 de 60 corridas) |
| Prueba del arnés en el conjunto de desarrollo y control con soluciones alternativas | 3,0 | 4,0 | 5,0 | 3 corridas de prueba y 5 de control (4.4) |
| Juez con modelo | 10,0 | 14,0 | 18,0 | 40 llamadas (20 tareas por 2 pasadas) de 0,25 a 0,45 USD. **Supuesto sin medir (E0):** se calibra con una llamada sobre el conjunto de desarrollo antes de congelar |
| **Total estimado** | **48,6** | **68,7** | **87,4** | |

Con N = 12 (5 chicas, 7 medianas) el total central baja a unos 43 USD. Las cifras del juez, la variación del sobrecosto de superpowers y la proporción de repeticiones son los supuestos más flojos.

**Tope de gasto total:** `[a fijar]`. Lo razonable es un tope que cubra al menos el escenario alto (alrededor de 90 USD para 20 tareas) o elegir un N menor. **Tope por corrida:** propuesto 3 USD, unas 3 veces el costo central de una mediana `[propuesto, el autor confirma]`. Qué se hace si se agota: sección 5. El gasto fuera del arnés (juez, controles) se registra en el mismo libro de gastos.

## 12. Procedimiento

1. **Construir las tareas** (carpeta privada, fuera del repositorio): aplicar la regla de selección (4.2), preparar el commit padre y el prompt, los tests ocultos (4.3), la auditoría (4.4) y la rúbrica del juez. No gasta tokens salvo la auditoría y el control (sección 11).
2. **Prueba del arnés** sobre el conjunto de desarrollo: una corrida por brazo para comprobar que los tres brazos corren, que la activación, el costo y los árboles se miden. Esas corridas no entran en las conclusiones.
3. **Calendario:** se genera con la semilla (tareas y brazos barajados) y se guarda completo.
4. **Congelado:** el arnés escribe un archivo con el hash del conjunto de tareas (prompts, commits padre, tests, rúbricas), las identidades de los plugins (commit de Pignolo, versión o commit de superpowers), la versión del CLI y el modelo resuelto, el hash del `CLAUDE.md` neutro y del contenido de la configuración, los topes, la semilla, el calendario, los hashes de los scripts de análisis y el commit de esta ficha. El comando es el del arnés de tres brazos `[a completar cuando el arnés lo defina]`. Se calcula el SHA-256 del archivo, se anota en los campos del autor y se crea una etiqueta de git (propuesta: `comparacion-3-brazos-preinscrita`; sin push). Las cuentas del arnés no cambian entre el congelado y el final.
5. **Lote:** corre el calendario completo con el OK del autor para el gasto. Cada bloque de tarea corre sus tres brazos seguidos; los fallos de infraestructura se anotan y se repiten; nada se descarta en silencio.
6. **Panel de calidad:** métricas deterministas sobre cada resultado; el juez en dos pasadas sobre el paquete a ciegas (nombres neutros, orden mezclado), y el autor califica a mano la submuestra.
7. **Paquete a ciegas:** el arnés arma el paquete y la clave aparte; el juez no sabe de qué brazo es cada resultado.
8. **Análisis:** `node tests/evals/analysis-cli.mjs ...` (sección 7) sobre el CSV de la comparación. Se guarda la salida `--json` junto con el CSV.
9. **Informe:** se publican todos los resultados, también los nulos o negativos, con el n, los intervalos y la tasa de activación. El CSV es el dato crudo, una fila por corrida. En el repositorio no hay contenido privado: ni nombres, ni rutas, ni archivos, ni commits de la app. Las tareas se describen de forma genérica ("commits reales de una app privada") y por id y estrato.
10. **Cambios a esta ficha después del congelado:** solo aclaraciones fechadas al final que no cambien reglas, umbrales ni el conjunto de tareas. Cualquier otro cambio invalida la preinscripción y se rotula como tal.
