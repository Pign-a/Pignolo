# Comparación de Pignolo con superpowers y sin plugin: estudio A (flujo de trabajo invocado) y estudio B (revisión con defectos sembrados)

**Estado: preinscrita, pendiente de congelar.**

_Esta ficha se escribe y se commitea antes de cualquier corrida de validación, como pide `docs/protocolo-de-pruebas.md`. El autor fijó los campos y confirmó los márgenes el 2026-10-24; la preinscripción queda cerrada cuando se congela el conjunto de tareas (sección 12). Es el seguimiento de [`RESULTS-pignolo2.md`](RESULTS-pignolo2.md), cuya medición tuvo tres tareas en total y por eso solo permite afirmaciones exploratorias (ver su sección "Corrección de las etiquetas de evidencia (2026-10-23)"). Las corridas pagas esperan el OK explícito del autor._

**Por qué dos estudios.** El autor pidió diseñar la comparación para obtener datos reales y válidos sobre qué configuración es mejor **cuando las skills se usan**. La fase de desarrollo mostró que, con un prompt completo, ningún plugin se activa solo (0 activaciones en todas las corridas de desarrollo; ver la sección 2.1 y el apéndice). Un diseño autónomo mediría entonces al modelo base con distinto contexto cargado. Por eso la ficha se reestructuró en dos estudios bajo el mismo tope de gasto:

- **Estudio A, `work` con el método invocado a propósito:** implementar tareas reales con especificación cerrada, con cada método invocado de forma explícita.
- **Estudio B, revisión con defectos sembrados:** la prueba objetiva de `validate`, sobre diffs reales con defectos inyectados y verificados.

Los brazos autónomos (prompt sin prefijo y plugin instalado) quedan degradados a una **observación descriptiva de la fase de desarrollo** (sin activación), no a un análisis de este diseño.

## Campos que fijó el autor (decisiones del 2026-10-24)

| Campo | Valor |
|---|---|
| Tope de gasto total acumulado (USD), los dos estudios juntos | 75. El libro de gastos cuenta todos los experimentos: unos 29,2 USD ya se gastaron en el desarrollo y en mediciones anteriores (es un piso), así que quedan unos 45,8 USD para los estudios A y B, el juez y las repeticiones |
| Tope por corrida (USD) | 3 |
| Tareas del estudio A (N) | 12 (5 chicas y 7 medianas), elegidas por `tests/evals/select-validation.mjs` entre 20 candidatas empaquetadas (9 chicas y 11 medianas); las 8 no elegidas son una reserva ordenada (ver 4.2). N bajó de 16 a 12 porque el tope total también tiene que pagar el estudio B |
| Ítems del estudio B | 10 diffs reales con defectos sembrados: 8 con 2 a 3 defectos inyectados y verificados (18 o más en total) y 2 controles limpios sin defectos (ver 4.6) |
| Semilla de la selección de tareas del estudio A | 20261024 |
| Semilla del calendario del estudio A | 20261025 |
| Semilla del bootstrap | 20261026 |
| Semilla del sorteo de la revisión humana del juez (estudio A) | 20261027 |
| Semilla del sorteo de hallazgos sin coincidencia a revisar a mano (estudio B) | 20261028 |
| Semilla del calendario del estudio B | 20261029 |
| Márgenes marcados `[confirmado por el autor 2026-10-24]` | confirmados con los números propuestos (ver secciones 5, 7 y 8) |
| Hash de congelado (SHA-256 del archivo de congelado, ver sección 12) | `[lo escribe el comando de congelado / el commit de preinscripción]` |
| Commit de esta ficha (el que llena estos campos) | `[lo escribe el comando de congelado / el commit de preinscripción]` |

Las semillas y la confirmación de los márgenes hacen falta para que la preinscripción sea reproducible. Las reglas de la sección 8 fijadas para el estudio A (márgenes, cota t, puertas de calidad) son las que el autor confirmó el 2026-10-24; el estudio B (sección 8.2) es nuevo en esta revisión de la ficha y lo escribe el agente antes de cualquier corrida; el autor lo revisa antes del congelado.

## 1. Preguntas e hipótesis

**Pregunta A.** En tareas reales de una app privada del autor, con el mismo modelo y el mismo esfuerzo, cuando el método se invoca a propósito, ¿cuánto cuesta y qué calidad entrega un agente con Pignolo (`/pignolo:work`) comparado con (a) el mismo agente sin ningún plugin y con el prompt de la tarea tal cual, y (b) el mismo agente con superpowers, al que se le pide seguir su flujo (brainstorming, planes escritos y ejecución del plan)?

**Pregunta B.** Dado un diff real con defectos inyectados y verificados, ¿qué fracción de esos defectos encuentra y qué hallazgos de más agrega cada configuración al pedir una revisión en su forma natural: Pignolo (`validate`), superpowers (su skill de revisión de código), la revisión nativa `/code-review`, y el agente sin plugin?

El resultado puede ser que Pignolo cueste más, lo mismo o menos, y que la calidad sea peor, igual o mejor. **La ficha no supone que el plugin gane.** La evidencia previa apunta más bien a efectos chicos o negativos en el costo: los archivos de contexto para agentes sumaron alrededor de un 20 % de costo sin ganancia significativa (Gloaguen et al.), y las skills curadas ayudaron poco en ingeniería de software mientras las autogeneradas no ayudaron (SkillsBench).

### Estudio A

Brazos (sección 3): **N** (prompt tal cual, sin plugin), **S\*** (superpowers solo, prompt con el prefijo que pide su flujo) y **P\*** (Pignolo solo, prompt precedido por `/pignolo:work `). El asterisco marca que el método se invoca a propósito.

**Contrastes primarios (costo).** P\* contra N y P\* contra S\*.

- **H-NI (no inferioridad de costo).** El costo de P\* no supera 1,5 veces el del control: la cota superior unilateral del 95 % de la razón de medias geométricas de los costos por tarea (P\* sobre control) es menor que 1,5, y también la cota t adicional (7.3). Se evalúa en los dos contrastes primarios; ambos son coprimarios y cada uno se declara por separado (la unión de condiciones no requiere ajuste de alfa).
- **H-Dif (diferencia de costo).** Hay una diferencia de costo entre P\* y el control, en cualquier sentido. Se evalúa con permutación de signos, ajustada con Holm sobre los dos contrastes primarios.

**Secundarias.**

- **Éxito:** la aceptación oculta queda en verde (sí o no por corrida), P\* contra cada control.
- **Panel de calidad:** nota del juez a ciegas, tests de regresión, errores nuevos de `tsc` y de ESLint, alcance del cambio (ver sección 6).

**Exploratoria.** S\* contra N, con las mismas herramientas y sin regla de decisión: sirve para ubicar a superpowers, no para decidir sobre Pignolo.

### Estudio B

Brazos (sección 3): **N** (pedido simple de revisar los cambios del último commit como revisor de código), **S** (se pide la skill de revisión de código de superpowers), **P** (`Validá el código de los cambios del último commit`: `validate` se activa sola) y **C** (la revisión nativa `/code-review HEAD~1..HEAD`).

**Contrastes primarios (recall de defectos sembrados).** P contra N, P contra C y P contra S, con Holm sobre los tres. **Secundarios (rotulados exploratorios, sin regla de decisión):** C contra N y S contra N, que ubican a las herramientas respecto del agente sin plugin.

**Medidas secundarias:** hallazgos sin coincidencia (por ítem y en los controles limpios), costo, tiempo, turnos, agentes y costo por defecto encontrado.

## 2. Qué enseñó la medición anterior y qué se consultó

### 2.1 Lo que enseñó la medición anterior (RESULTS-pignolo2.md)

1. **El plugin no se activó solo.** Con un prompt completo hubo 0 llamadas a la herramienta `Skill` en los pares autónomos: en la medición anterior **0 de 4 corridas autónomas de la tarea mediana activaron el plugin**, y en la fase de desarrollo ningún plugin se activó solo en ninguna corrida. Esos pares medían al modelo base con distinto contexto cargado. Por eso esta ficha **invoca los métodos a propósito** (estudio A: prefijo del método o `/pignolo:work`; estudio B: el pedido natural de cada herramienta de revisión), conserva la activación como métrica de primera clase por corrida y por brazo, y deja los brazos autónomos como una nota descriptiva, no como análisis.
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

**Variable que cambia (una sola por estudio):** qué configuración se usa y cómo se la invoca. Cada brazo lleva el pedido natural de su herramienta, así que el pedido forma parte de la variable (ver la limitación del estudio B más abajo).

### 3.1 Estudio A

| Brazo (id en la configuración) | Plugin activo | Prompt |
|---|---|---|
| N | ninguno; el mismo archivo de proyecto neutro | el prompt de la tarea, textual |
| S\* (`SF`) | superpowers solo | prefijo que pide su flujo (brainstorming, writing-plans y después ejecutar el plan) seguido del prompt de la tarea |
| P\* (`PF`) | Pignolo solo | `/pignolo:work ` seguido del prompt de la tarea |

El texto exacto del prefijo de S\* vive en la configuración (`promptPrefix`) y el congelado lo hashea. Que `claude -p` ejecute un prompt que empieza con `/pignolo:work` como comando de plugin ya lo mostró la primera corrida forzada de la medición anterior (sin llamada a `Skill` en el stream pero con el comando expandido; el arnés lo detecta por el texto del prefijo y por el `init`).

**Fijo en los tres brazos:** el prompt de la tarea (el mismo texto base; solo cambia el prefijo del método); el modelo y el esfuerzo; los topes por corrida y total; la máquina; la versión del CLI; un directorio de configuración limpio y dedicado a la medición; el `CLAUDE.md` neutro (el mismo en los tres); el contenido neutro sincronizado de la cuenta (skills y plugins que Claude Code baja al directorio de configuración al iniciar sesión), idéntico y declarado en cada corrida; la semilla del calendario. Un solo plugin por brazo, nunca dos (sus skills obligatorias compiten por la activación).

### 3.2 Estudio B

| Brazo | Plugin activo | Pedido (el texto exacto va en la configuración y lo hashea el congelado) |
|---|---|---|
| N | ninguno | pedido simple de revisar los cambios del último commit como revisor de código |
| S | superpowers solo | se pide usar la skill de revisión de código de superpowers sobre los cambios del último commit |
| P | Pignolo solo | `Validá el código de los cambios del último commit` (`validate` se activa sola) |
| C | ninguno; revisión nativa de Claude Code | `/code-review HEAD~1..HEAD` |

**Limitación declarada (confusión de redacción).** Cada brazo recibe el pedido natural de su herramienta, no un pedido idéntico: las diferencias entre brazos mezclan la herramienta con la redacción. Los contrastes responden "qué obtiene quien pide una revisión de la forma habitual con cada herramienta", no "qué hace la herramienta con un pedido idéntico". La verificación de que `/code-review` existe con el directorio de configuración limpio se hace antes del congelado (si no existe en el `init`, se descarta el brazo C y se avisa).

**Identidad de los plugins, congelada.** El archivo de congelado (sección 12) guarda el commit de Pignolo, la versión o el commit de superpowers, la versión del CLI y el identificador resuelto del modelo. Cualquier cambio posterior de esos valores invalida la preinscripción.

**Lo que cada plugin lance por dentro** (subagentes, revisores, modelos propios) es parte del brazo, no una variable controlada. Se registra: agentes lanzados, tokens por tipo.

### 3.3 Activación

Un brazo con plugin prueba el plugin solo si se activa. Se informa **por corrida** (llamadas a la herramienta `Skill`, skills propias del plugin, comando de barra) y por brazo (tasa de activación).

- **Estudio A (invocación forzada):** el diseño hace rara la no activación. Una corrida de S\* o P\* en la que el plugin no se activó **se informa** y se analiza **por protocolo** (excluida) como sensibilidad; el análisis primario cuenta cada corrida en el brazo asignado.
- **Estudio B:** en P se espera que `validate` se active sola y en S que se active la skill pedida; se informa por corrida igual. Una corrida sin activación de su herramienta se reporta y se analiza por protocolo como sensibilidad.
- **Brazos autónomos (sin prefijo, solo con el plugin instalado):** ya no forman parte del diseño. En la medición anterior, **0 de 4 corridas autónomas de la tarea mediana activaron el plugin**, y en la fase de desarrollo ningún plugin se activó solo en ninguna corrida; esa observación queda como nota descriptiva (sección 2.1 y apéndice), no como análisis.

## 4. Tareas

### 4.1 Conjunto de desarrollo (no entra en las conclusiones)

Las tres tareas de la medición anterior (una mediana y dos chicas, de la app privada) y los tres repos de juguete públicos de `tests/evals/fixtures`. Se usan para depurar el arnés y para ajustar el texto de los plugins. **Sus resultados no entran en ninguna conclusión de esta comparación.** Ninguna tarea de validación del estudio A ni ítem del estudio B puede coincidir con ellas ni con sus vecinas inmediatas en el historial (10 commits a cada lado).

### 4.2 Conjunto de validación del estudio A

**N = 12 tareas** (5 chicas y 7 medianas), elegidas con una **regla mecánica escrita antes de mirar resultados** a partir de commits reales de una rama de una app privada del autor. Las tareas se identifican con ids genéricos (`v01`, `v02`...); nada de nombres, rutas, funciones ni hashes de la app aparece en el repositorio.

**Cómo se armaron las 20 candidatas.**

1. **Estratos por tamaño del commit real:** **chica** = de 30 a 200 líneas cambiadas en el commit real; **mediana** = de 201 a 1200 líneas cambiadas. (No se definen por archivos ni por líneas de producción.)
2. **Regla mecánica de muestreo, escrita antes de mirar resultados:** entre los commits elegibles de cada estrato, ordenados por fecha, se toma uno de cada k, con **k = 2 en las chicas y k = 3 en las medianas**. Los commits del conjunto de desarrollo y sus vecinos quedan afuera.
3. **Verificación mecánica de cada candidata:** los tests ocultos (los del commit real, ver 4.3) fallan (rojo) en el commit padre y pasan (verde) en el commit real, y la suite completa del padre estaba en verde.
4. **Reemplazos antes de cualquier corrida con un modelo:** algunos commits con más de 100 aserciones nuevas, o cuyo padre no tenía la suite en verde, se reemplazaron por el siguiente elegible de su estrato. Ningún reemplazo dependió de resultados de los brazos, porque todavía no había corrido ninguno.
5. **Auditoría de cada aserción oculta contra el prompt** (ver 4.4): entre las 20 candidatas no quedó ninguna aserción subespecificada.

El resultado son **20 candidatas empaquetadas: 9 chicas y 11 medianas**. De ellas se eligen 12 (N bajó de 16 a 12 porque el mismo tope total tiene que pagar el estudio B).

**Selección final de las 12.** La hace `node tests/evals/select-validation.mjs --input <candidatas> --output <selección> --small 5 --medium 7 --seed 20261024`. El script ordena las candidatas de cada estrato por id, baraja cada estrato con Fisher-Yates y una PRNG con semilla (mulberry32, una por estrato derivada de la semilla: la semilla para las chicas y la semilla más 1 para las medianas) y elige las primeras 5 chicas y 7 medianas del estrato barajado. Las 8 que sobran (4 chicas y 4 medianas) son una **reserva en el orden del barajado**: sirven solo para reemplazar, en ese orden y dentro de su estrato, una tarea que se descubra inválida **antes del congelado**. Después del congelado no se reemplaza nada. Misma entrada y misma semilla dan siempre la misma selección; la salida guarda un hash de la entrada y el script solo imprime ids y conteos.

**Limitación declarada (la encontró quien armó las tareas).** Casi todos los prompts filtran buena parte de la solución, porque los tests ocultos aseveran textos exactos, HTML y firmas, y para que esas aserciones sean justas el prompt tiene que darlos. Por eso **este diseño mide qué tan bien cada configuración ejecuta una especificación cerrada, no qué tan bien planifica una abierta.** Las conclusiones valen para ese tipo de tarea y no para trabajo con requisitos ambiguos, que es donde un método de planificación podría ayudar más.

### 4.3 Tests de aceptación ocultos

Son los tests del commit real, adaptados solo en lo imprescindible. Para cada tarea:

- **Rojo en el padre:** fallan en el commit padre por la razón correcta (falta el comportamiento pedido, no un error ajeno).
- **Verde en el commit real:** pasan, corridos 3 veces para descartar tests inestables.
- **Interfaz fijada por el prompt:** el prompt declara los nombres y firmas que los tests necesitan y nada más. El prompt no copia la solución ni sus detalles internos.

### 4.4 Auditoría de validez por aserción (antes de congelar)

Cada aserción de los tests ocultos se clasifica: (a) exigida por el prompt, (b) implícita en lo que pide el prompt o en las convenciones del repo, (c) detalle arbitrario no derivable del prompt (un texto exacto, un orden interno, un nombre). Las de tipo (c) se eliminan o se pasan al prompt (de ahí la limitación declarada en 4.2: pasar al prompt textos exactos, HTML y firmas hace que el prompt filtre parte de la solución). Además se audita el prompt: si casi dicta la solución, se reescribe. La hace un agente Opus con registro y la revisa el autor. **Estado:** la auditoría de aserciones ya se hizo sobre las 20 candidatas y no dejó ninguna subespecificada; una tarea de la reserva que entre antes del congelado ya viene auditada. En una submuestra de 5 tareas, un agente independiente que no ve la solución real implementa el prompt y se comprueba que sus soluciones válidas pasan los tests ocultos (control de falsos rechazos; se descuenta del presupuesto, sección 11).

### 4.5 Congelado

El conjunto completo (prompts, commits padre, tests ocultos, auditoría, rúbricas del juez, calendario, identidades de plugins y CLI, scripts de análisis) se congela por hash **antes de la primera corrida de validación** (sección 12). **Después del congelado no se reajusta ningún texto de ningún plugin.** Si se modifica un plugin, el conjunto de validación pasa a ser de desarrollo y hay que reemplazarlo por tareas nuevas.

### 4.6 Ítems del estudio B (revisión con defectos sembrados)

**10 ítems** (`rev-01` a `rev-10`) armados a partir de diffs reales de la rama de la misma app privada (fuera del conjunto de desarrollo y de sus vecinos): **8 ítems con 2 a 3 defectos inyectados y verificados (18 o más defectos en total)** y **2 controles limpios** sin ningún defecto inyectado. Los arma un agente aparte, no quien analiza los resultados. El ítem es un repositorio con dos commits, el padre y el commit a revisar (el commit real con los defectos inyectados, no el original), de modo que `HEAD~1..HEAD` es el diff a revisar. Los defectos se inyectan sin dejar marcas (sin comentarios que los delaten ni mensaje de commit que los anuncie).

**Categorías de defecto** (cada defecto pertenece a una):

1. propiedad y autorización (ownership);
2. error de uno o de límite (off-by-one, borde);
3. `await` faltante o error tragado;
4. validación faltante o debilitada;
5. dato sensible en los logs o credencial falsa escrita en el código;
6. dinero en punto flotante o redondeo;
7. consulta dentro de un bucle;
8. código muerto o restos de depuración;
9. falta de revalidación de caché o de consistencia del dominio;
10. aserción de test debilitada.

**Verdad de base (archivo privado por ítem, fuera del repositorio).** Para cada defecto: categoría, archivo, rango de líneas, palabras clave, severidad (alta, media o baja) y si los tests existentes lo detectan. Además, la lista de rangos marcados `preexisting` (problemas que ya estaban en el código y no son sembrados). El constructor **verifica** que cada defecto está efectivamente en el diff y anota si la suite existente lo atrapa. El archivo de verdad de base entra en el congelado (hash).

**Lo que el estudio no usa:** ningún emparejamiento con modelo. La puntuación es determinista (6.2).

## 5. Diseño

Vale para los dos estudios salvo que se diga lo contrario. Los dos estudios comparten el mismo tope total de gasto, la misma máquina, el mismo modelo, el mismo esfuerzo y el mismo libro de gastos.

- **Una repetición por unidad y brazo.** La unidad es la tarea (estudio A) o el ítem (estudio B). Se justifica con la investigación (Miller: lo que se generaliza es el número de unidades, las repeticiones de una misma unidad no reducen la incertidumbre entre unidades) y con el ruido observado (sección 2.1). La simulación de potencia (sección 9) muestra que pasar de 1 a 2 repeticiones por tarea mejora poco, mientras que duplicar el costo de ejecución es seguro. **Desviación del protocolo:** `docs/protocolo-de-pruebas.md` pide al menos 3 repeticiones por brazo cuando la corrida cuesta menos de ~300 mil tokens; aquí la replicación es entre unidades. En esta ficha, "E3" significa replicación a nivel de unidad con n de 8 o más, y con menos de 8 unidades el resultado es exploratorio `[confirmado por el autor 2026-10-24]`.
- **Orden al azar con semilla.** El calendario baraja el orden de las unidades y, dentro de cada una, el orden de los brazos (3 en A, 4 en B). Se guarda el calendario completo.
- **Brazos intercalados en el tiempo.** Las corridas de una unidad van seguidas (bloque), de modo que la variación horaria de la API y de la máquina pega parecido a todos los brazos.
- **Espacio de trabajo limpio por corrida:** un árbol nuevo desde el commit padre (estudio A) o desde el repositorio del ítem (estudio B), sin restos de corridas anteriores.
- **Topes fijos:** 3 USD por corrida y 75 USD de gasto total acumulado (campos del autor). Una corrida que llega al tope por corrida (`budget_cap`) o se corta por tiempo mientras el modelo seguía trabajando **es un resultado**, no un fallo de infraestructura: en A cuenta como no verde y en B como una revisión incompleta (los defectos que no mencionó no se encontraron), con costo igual al tope (costo censurado, marcado) y **no se repite** `[confirmado por el autor 2026-10-24]`.
- **Fallos de infraestructura** (error de la API, límite de uso, caída del arnés, corte de red) son **inválidos**: se registran aparte con su motivo y se repiten hasta 2 veces por falla (`batch --retry-infra`, sección 12) `[confirmado por el autor 2026-10-24]`. **Nunca se repite una corrida por un mal resultado.** Un tope por corrida o un corte por tiempo del modelo es un resultado; una falla de infraestructura es inválida y se repite: esa es la línea que separa las dos cosas.
- **Sin mirar:** n fijo; no se agregan unidades ni repeticiones después de ver resultados. Una mirada intermedia está permitida solo para detectar fallas del arnés, se declara en el informe y no es confirmatoria.
- **Orden de los estudios y parada por presupuesto (declarada).** Se corre **primero el estudio B completo**, cuyos bloques son chicos y baratos, y después el estudio A en **bloques de tarea completos** (los tres brazos de una tarea). El arnés no lanza una corrida si lo gastado (de **todos** los experimentos) más 1,25 veces el tope por corrida pasa del tope total. Para que el tope no deje sin dinero al juez, el `totalCapUsd` del arnés durante el lote se fija en 75 menos una reserva para el juez y el control con soluciones alternativas (sección 11); esa reserva no se usa para más corridas del lote. Si el tope detiene el estudio A, **solo cuentan los bloques completos**, se informa **cuántos bloques se completaron** y el bloque incompleto se lista aparte. Como el orden es aleatorio, las tareas completas son una muestra válida. **Esa parada es por presupuesto, no por resultados, y está declarada.** Con menos de 8 unidades completas el resultado es exploratorio. No se amplía el tope para "rescatar" un resultado ni se agregan corridas con lo que sobre.

## 6. Métricas

Las deterministas deciden. El juez nunca decide solo. Esta sección describe las métricas del estudio A y, en 6.2, las del estudio B.

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

**El juez.** Rúbrica de cinco criterios binarios (la lista está en la sección 6.1), concretados para cada tarea con el prompt y la solución real **antes de las corridas** y congelados. El comportamiento pedido lo decide la aceptación oculta, no el juez. Cada pasada recibe el prompt, la solución real, la rúbrica y los resultados de los tres brazos con **nombres neutros, orden mezclado**. Dos pasadas por tarea, con asignación de etiquetas y orden distintos. La nota es la proporción de criterios cumplidos, promediando las dos pasadas; las discrepancias entre pasadas se informan.

**Limitación declarada:** el juez es de la misma familia de modelos que los ejecutores, y puede compartir sesgos y preferir su propio estilo (MT-Bench). Mitigaciones: criterios binarios contra la solución real, ciegas, orden mezclado, dos pasadas, el tamaño del diff informado al lado (sesgo de verbosidad), y **una revisión humana por muestreo** (sección 6.1): el panel del juez solo cuenta si el acuerdo con el autor llega al 80 % `[confirmado por el autor 2026-10-24]`.

### 6.1 Revisión humana del juez

El autor califica a mano, a ciegas, una submuestra al azar de los paquetes que ve el juez, con la misma rúbrica, y se mide el acuerdo. El procedimiento queda escrito ahora, antes de las corridas.

**Muestra.** 8 de los 36 paquetes a ciegas del estudio A (12 tareas por 3 brazos). El sorteo es reproducible: se listan los 36 paquetes por su id (`<tarea>/pack-<k>`, con las etiquetas ya mezcladas por `blind` y sin la clave de brazos), se pasa la lista a `select-validation.mjs` como un solo estrato y se piden 8 con la semilla del sorteo: `node tests/evals/select-validation.mjs --input <paquetes> --output <sorteo> --small 8 --medium 0 --seed 20261027`. Los 8 ids de `selected` son los que revisa el autor, que califica antes de ver las notas del juez y sin la clave.

**Rúbrica (fija antes del congelado).** Cinco criterios binarios, sí o no, que el autor y el juez aplican a cada paquete comparando con la solución real:

1. Respeta las convenciones del repositorio que se ven en los archivos vecinos (nombres, estructura, estilo, manejo de errores).
2. No hay cambios no relacionados con la tarea (archivos o líneas ajenos al pedido).
3. No duplica una utilidad que ya existe en el repositorio.
4. Maneja los casos borde que enuncia el prompt.
5. No quedan restos de depuración (impresiones, código comentado, archivos temporales).

La rúbrica de cada tarea concreta esos cinco criterios con ejemplos tomados de la solución real (qué utilidad existente habría que reutilizar, qué casos borde enuncia el prompt) y se congela con el resto (sección 12).

**Acuerdo.** Para cada paquete sorteado y cada criterio se compara el veredicto del autor con el del juez; si las dos pasadas del juez no coinciden entre sí, el criterio cuenta como desacuerdo. Son 40 comparaciones (8 paquetes por 5 criterios). **El panel del juez cuenta solo si el acuerdo es de al menos 80 %** (32 de 40 o más) `[confirmado por el autor 2026-10-24]`. Se informa el acuerdo total y por criterio, y las discrepancias. Si queda por debajo, el panel se informa como no confiable y no se usa para ninguna conclusión; las métricas deterministas siguen decidiendo igual.

### 6.2 Métricas del estudio B (todas deterministas, sin emparejamiento con modelo)

Las corridas del estudio B no usan el juez con modelo. Sobre el texto del asistente de primer nivel (lo que el usuario ve: `assistant-text.txt`, sin los mensajes de subagentes), el puntaje decide:

**Regla de coincidencia.** Un defecto sembrado se considera **ENCONTRADO** si ese texto menciona el nombre base (basename) del archivo del defecto **y** además se cumple una de estas dos condiciones: (a) un número de línea dentro del rango del defecto más o menos 5 líneas, o (b) al menos 2 de sus palabras clave a menos de 300 caracteres de esa mención del archivo. Un número de línea cuenta si aparece como `archivo:N`, `archivo:N-M`, `línea(s) N` o `line(s) N` en los 300 caracteres siguientes a la mención del archivo. Las expresiones regulares exactas están en el script de puntaje (`run.mjs score`), que el congelado hashea.

| Métrica | Cómo se calcula |
|---|---|
| `defects_total`, `defects_found` | Defectos sembrados del ítem y los encontrados por la regla de arriba |
| Recall del ítem | `defects_found / defects_total`; es la cifra por ítem del análisis primario |
| `found_by_category` | Encontrados por categoría (las diez de 4.6); también por severidad |
| `findings_total` | Referencias distintas `archivo:línea` que aparecen en el texto |
| `findings_unmatched` | Referencias que no caen a menos de 5 líneas de ningún defecto sembrado del mismo archivo y no están en un rango `preexisting`. En los **controles limpios** toda referencia es un hallazgo sin coincidencia (falsos positivos por diff limpio) |
| Costo, tiempo de pared, turnos, agentes lanzados | Los de siempre (sección 6) |
| Costo por defecto encontrado | Costo del brazo dividido por los defectos que encontró |
| Activación | Como en 3.3 |

**Un hallazgo sin coincidencia NO es automáticamente un falso positivo.** Puede ser un problema real del código que el constructor no sembró ni marcó como preexistente. Por eso se informa como "sin coincidencia" y no como "falso positivo", salvo en los controles limpios, donde se informa como falso positivo del diff limpio con la misma salvedad. **El autor revisa a mano una muestra al azar de hallazgos sin coincidencia:** se sortean con la semilla 20261028 (12 hallazgos, o todos si hay menos) de la lista de todos los hallazgos sin coincidencia de las 40 corridas (si hay menos de 12, se revisan todos), usando `select-validation.mjs` con un solo estrato (como en 6.1); el autor los clasifica a ciegas del brazo como problema real, falso positivo o discutible, y después se tabula por brazo. Esta revisión es descriptiva y no cambia el recall.

## 7. Plan de análisis

### 7.1 Estudio A

Las cuentas las hace `node tests/evals/analysis-cli.mjs` (se está completando por separado; esta ficha lo cita por su nombre y sus banderas `--csv`, `--experiment`, `--contrasts`, `--primary`, `--margin`, `--seed`, `--task-set-file`, `--grades` y `--json`). Ejemplo: `node tests/evals/analysis-cli.mjs --csv <csv> --experiment <nombre del estudio A> --contrasts "PF:N,PF:SF,SF:N" --primary "PF:N,PF:SF" --margin 1.5 --seed 20261026 --task-set-file <selección> --grades <notas> --json`. `--primary` marca los dos contrastes primarios (los que entran en Holm y en la regla de decisión) y SF contra N queda exploratorio. La semilla del bootstrap es 20261026. En el texto, P\* es el brazo `PF` y S\* el brazo `SF`.

1. **Colapsar repeticiones por tarea:** si una tarea y brazo tiene más de una corrida válida (por ejemplo una repetición por fallo de infraestructura), se usa la media geométrica del costo de esa tarea y brazo. Lo esperado es una corrida válida por celda.
2. **Costo.** Para cada contraste, razón de costos por tarea `c_P* / c_control`, media del logaritmo, y de ahí la razón de medias geométricas (RMG). Intervalo por **bootstrap percentil sobre las tareas**: 10.000 remuestreos, semilla fija. Cota superior unilateral del 95 % (percentil 95) contra el margen 1,5 para la no inferioridad; intervalo del 90 % (percentiles 5 y 95) para la equivalencia descriptiva con margen 1,25 (el intervalo queda dentro de [0,8; 1,25]). Valor p de la **permutación de signos** sobre las diferencias de log, bilateral, **ajustado con Holm** sobre los dos contrastes primarios.
3. **Cota t adicional `[confirmado por el autor 2026-10-24]`.** La simulación de la sección 9 muestra que la cota percentil sola declara no inferioridad con un error tipo I de 5 a 9 % cuando la verdad está justo en el margen (nominal 5 %). Se calcula también la cota t sobre el log: `media + t(0,95; n-1) · s / raíz(n)`. La no inferioridad se declara solo si **las dos** cotas están por debajo de 1,5 (regla doble). Si el CLI no informa la cota t en el momento de congelar, se calcula con esta fórmula.
4. **Éxito.** Por brazo, k/n tareas verdes con intervalo de Wilson del 95 %. Por contraste, **McNemar exacto** sobre los pares discordantes por tarea.
5. **Panel del juez.** Notas apareadas por tarea, Wilcoxon de rangos con signo (exacto para n chico, ceros descartados), y conteos gana/empata/pierde.
6. **Se muestran siempre** el número de tareas (y de bloques completos), los intervalos y la tasa de activación por brazo. Con **menos de 8 tareas el resultado se rotula exploratorio** y no se dan veredictos.
7. **Descriptivos sin decisión:** tokens por tipo, costo por tarea resuelta, tiempo de pared, turnos, agentes, alcance fuera de la solución real, tamaño del diff, tests agregados, cobertura y mutación si se midieron; por brazo, mediana y rango.
8. **Sensibilidades declaradas, no decisivas:** sin las corridas de costo censurado, sin las tareas donde ningún brazo queda verde, y **por protocolo** (excluyendo las corridas en que el plugin no se activó). El análisis primario cuenta cada corrida en el brazo asignado.

### 7.2 Estudio B

La unidad de análisis es el **ítem**. Solo los 8 ítems con defectos entran en el recall; los 2 controles limpios se tratan aparte (falsos positivos). El análisis lo hace el modo de revisión de `analysis-cli.mjs` o un script aparte que se nombra y se hashea en el congelado (pendiente de construir por otro agente).

1. **Recall por ítem y brazo:** `defects_found / defects_total`, apareado entre brazos por ítem.
2. **Contraste:** para cada par, la diferencia de recall por ítem. **Valor p por permutación de signos** de la media de esas diferencias (bilateral, exacta con 2^8 asignaciones), **ajustado con Holm sobre los tres contrastes primarios** (P:N, P:C, P:S). Como sensibilidades: el Wilcoxon de rangos con signo y la prueba del signo sobre las diferencias (ceros descartados). Los otros contrastes (C:N, S:N) se informan sin ajuste y rotulados exploratorios.
3. **Recall agregado por defecto** (todos los defectos de los 8 ítems juntos) por brazo con **intervalo de Wilson del 95 %, solo descriptivo**: los defectos de un mismo ítem están agrupados y no son independientes, así que el intervalo es optimista.
4. **Recall por categoría y por severidad:** tabla descriptiva por brazo, con los conteos.
5. **Hallazgos:** `findings_total` y `findings_unmatched` por brazo y por ítem; en los controles limpios, los hallazgos por diff limpio. Costo, tiempo, turnos, agentes y costo por defecto encontrado. Recall separado según si los tests existentes atrapan el defecto o no (descriptivo).
6. **Revisión manual de hallazgos sin coincidencia:** muestra de 6.2, tabulada por brazo.
7. **Se muestran siempre** el número de ítems, los conteos de defectos encontrados por brazo y la tasa de activación por brazo.

## 8. Reglas de decisión

Se fijan antes de ver datos.

### 8.1 Estudio A

Para cada contraste P\* contra X (X = N o S\*) y con n de 8 o más tareas completas. Sea `m = max(1, parte entera de 0,10 · n)`: con n = 12, m = 1 tarea (8,3 puntos). Si el lote termina con menos tareas, se recalcula con el n alcanzado.

**Costo.**

| Resultado | Condición |
|---|---|
| **No inferior en costo** | Las dos cotas superiores del 95 % (percentil y t) de la RMG son menores que 1,5 |
| **Más caro demostrado** | El valor p ajustado con Holm es menor que 0,05 **y** el intervalo del 90 % no incluye 1 con la RMG por encima |
| **Más barato demostrado** | Ídem con la RMG por debajo |
| **Sin diferencia demostrada** | Ninguna de las dos diferencias demostradas |
| **Equivalente (descriptivo)** | El intervalo del 90 % queda dentro de [0,8; 1,25] |

Combinaciones: no inferior y sin diferencia demostrada; no inferior y más caro demostrado ("más caro dentro del margen"); no inferior y más barato demostrado; **no concluyente** (no se cumple la no inferioridad y tampoco hay diferencia demostrada); **peor en costo** (más caro demostrado y no se cumple la no inferioridad).

**Calidad.** Cada puerta se evalúa por contraste. Todos los márgenes están `[confirmado por el autor 2026-10-24]`, por estas razones: con n = 12 una tarea vale 8,3 puntos, y m = 1 es el piso de la fórmula (una diferencia de una tarea está dentro del ruido; más de una merece una alerta); el mismo margen proporcional para todas las puertas evita elegir márgenes distintos a la medida de cada resultado.

| Puerta | Pasa si |
|---|---|
| Q1, aceptación oculta | Tareas verdes de P\* >= tareas verdes de X menos m **y** el McNemar exacto bilateral no muestra a P\* peor (p >= 0,05 o P\* mejor) |
| Q2, regresiones | Tareas con al menos una regresión en la suite existente: P\* <= X más m |
| Q3, errores nuevos de `tsc` | Tareas con al menos un error nuevo: P\* <= X más m |
| Q4, errores nuevos de ESLint | Ídem |
| Panel del juez (secundario) | No decide solo: si el Wilcoxon bilateral da p < 0,05 con P\* peor y ninguna puerta determinista falló, el veredicto queda "con alerta del panel" y se revisa la submuestra humana. Cuenta solo si el acuerdo con el autor llega al 80 % (6.1) |

**Veredicto global (por contraste).**

- **Pignolo no inferior a X:** no inferior en costo y las cuatro puertas pasan.
- **Pignolo peor que X:** "peor en costo", o el McNemar muestra a P\* peor (Q1), o dos o más puertas deterministas fallan; se nombra cuáles.
- **Pignolo mejor que X en costo:** más barato demostrado con las cuatro puertas en verde. "Mejor en éxito" solo si el McNemar muestra a P\* mejor.
- **Sin diferencia demostrada:** en todo otro caso; se decide por lo más simple, como pide el protocolo, y se informa.

**Límite de lo que puede decir la puerta Q1.** La simulación de la sección 9 muestra que el McNemar exacto casi no tiene potencia con tan pocas tareas: una caída de 20 puntos en el éxito (0,9 contra 0,7) se detecta con 4 % de probabilidad con 12 tareas (11 % con 16 y 19 % con 20). Q1 es una red de seguridad contra una caída grande, no una demostración de no inferioridad en éxito. Una respuesta de "sin pérdida de calidad observada" se escribe así y no como "calidad equivalente".

### 8.2 Estudio B

Contrastes primarios: **P:N, P:C y P:S**, con Holm sobre los tres. Se eligieron esos porque la pregunta es qué aporta `validate`; C:N y S:N solo ubican a las otras herramientas y son exploratorios.

| Veredicto | Condición |
|---|---|
| **P encuentra más defectos que X** | El valor p ajustado con Holm es menor que 0,05 y la media de las diferencias de recall por ítem es positiva |
| **P encuentra menos defectos que X** | Ídem con la media negativa |
| **Sin diferencia demostrada** | En todo otro caso. No es equivalencia: con 8 ítems la ausencia de diferencia demostrada no prueba que sean iguales |

**Calificación obligatoria del veredicto.** Si P gana en recall pero tiene más del doble de hallazgos sin coincidencia por ítem que X, el veredicto se escribe "más defectos sembrados encontrados, con más hallazgos sin confirmar"; se informa además la muestra revisada a mano (6.2) para saber cuántos de esos hallazgos eran problemas reales. Los controles limpios se reportan al lado y no cambian el veredicto de recall.

Con 8 ítems de defectos el estudio es exploratorio a moderado; lo que puede y no puede mostrar está en la sección 9.

## 9. Potencia

`node tests/evals/power-sim.mjs` (Node 22 o más, sin dependencias; semilla, número de simulaciones y de remuestreos por bandera: `--seed`, `--sims`, `--boot`, `--quick`, `--json`; con los valores por defecto tarda unos 20 segundos). Lo prueba `tests/power-sim.test.js`. La grilla es la del **costo del estudio A**; el estudio B se trata aparte al final de esta sección.

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
- **Con N = 12 (el estudio A), r = 1:** las tablas anteriores dan, para sigma_int de 0,15, 0,25 y 0,40: descartar 1,5 veces **cuando no hay efecto real** tiene 100 %, 97 % y 77 % de potencia; **si el costo real de P\* es un 20 % mayor**, 85 %, 66 % y 41 % con el bootstrap solo (80 %, 56 % y 34 % con la regla doble). **Diferencia detectable:** el IC del 90 % tiene un semiancho mediano de 14 %, 20 % y 31 %; detectar una diferencia de 0,8 (o su espejo de 1,25) tiene 85 %, 66 % y 41 % de potencia, y con el umbral de Holm 72 %, 44 % y 24 %. El error tipo I en el margen es de 8 %, 6 % y 9 % con el bootstrap solo y de 5 %, 4 % y 6 % con la regla doble; la falsa alarma de la diferencia es de 15 %, 12 % y 16 %. La equivalencia dentro de [0,8; 1,25] llega a 67 %, 28 % y 3 %. En éxito, el McNemar exacto detecta una caída de 0,9 a 0,7 con 4 % de probabilidad. **Consecuencia:** con N = 12 el estudio A solo permite afirmar no inferioridad de costo con confianza razonable si la interacción tarea por brazo es baja (sigma_int de 0,15) o si P\* cuesta lo mismo que el control; con sigma_int de 0,25 una diferencia real del 20 % se distingue solo en dos de cada tres casos, y con 0,40 apenas en dos de cinco. Se pierde potencia respecto de N = 16 (92 %, 72 % y 47 % para "+20 %") a cambio de poder pagar el estudio B con el mismo tope. Si el tope detiene el lote antes de las 12 tareas, la potencia es todavía menor (sección 11).
- **Éxito binario:** el McNemar exacto tiene muy poca potencia. Con 20 tareas detecta una caída de 0,9 a 0,7 con 19 % de probabilidad, y con 30 tareas con 36 %. Si los dos brazos están cerca del techo (0,9 contra 0,9) hay solo unos 3,6 pares discordantes esperados con 20 tareas. **Con este tamaño no se puede afirmar no inferioridad ni diferencia en el éxito,** salvo diferencias muy grandes; el éxito es un chequeo de seguridad y un dato descriptivo.
- **Lo que el diseño no puede:** detectar efectos menores a ±15 a 20 % de costo, demostrar equivalencia con sigma_int de 0,25 o más, o probar que la calidad no cae.

### Estudio B: qué puede y qué no puede mostrar con 8 ítems de defectos

El análisis del estudio B es de otro tipo (recall por ítem, no costo) y la grilla de arriba no lo cubre. Para ver su alcance se simuló el análisis de 7.2 (permutación de signos exacta sobre las diferencias de recall por ítem, 2^8 asignaciones, 4.000 simulaciones por escenario, semilla 20261031) con un modelo simple y **optimista**: 8 ítems (2 con 3 defectos y 6 con 2, 18 defectos en total), cada defecto encontrado con probabilidad independiente por brazo, sin efecto de ítem. Los recall por ítem toman pocos valores, así que hay muchos empates. Probabilidad de rechazar con p < 0,05 sin ajuste, y con p <= 0,0167 (el umbral del contraste más favorecido tras Holm sobre tres):

| Recall verdadero (P contra X) | p < 0,05 | p <= 0,0167 |
|---|---|---|
| 0,9 contra 0,3 | 84 % | 61 % |
| 0,8 contra 0,4 | 39 % | 17 % |
| 0,7 contra 0,4 | 18 % | 7 % |
| 0,8 contra 0,6 | 7 % | 2 % |
| 0,9 contra 0,7 | 7 % | 1 % |
| 0,6 contra 0,6 (sin diferencia) | 1 % | 0 % |

**Lo que puede mostrar:** diferencias muy grandes de recall (del orden de 50 a 60 puntos), y aun así con potencia moderada tras el ajuste de Holm. **Lo que no puede mostrar:** diferencias chicas o medianas (de 20 a 30 puntos casi no se detectan: 7 % a 18 %), equivalencia entre herramientas, ni efectos por categoría de defecto (los conteos por categoría son de pocos defectos; la tabla es descriptiva). Que la prueba sea conservadora (1 % de falsas alarmas con diferencia nula) significa que un resultado "sin diferencia demostrada" **no** indica que las herramientas sean iguales. El estudio B sirve sobre todo como **evidencia descriptiva** del tipo de defectos que cada herramienta encuentra o se pierde, con el recall agregado y su intervalo de Wilson (optimista, defectos agrupados) y las tablas por categoría.

### Brazos autónomos

La fase de desarrollo (apéndice) y la medición anterior mostraron que, con un prompt completo, ningún plugin se activa solo. Los brazos autónomos no están en este diseño: serían una comparación del modelo base con distinto contexto cargado. Quedan como nota descriptiva de esa observación, sin potencia calculada ni análisis.

## 10. Amenazas a la validez

| Amenaza | Mitigación o reconocimiento |
|---|---|
| El plugin no se activa | Los métodos se invocan a propósito (A: prefijo o `/pignolo:work`; B: pedido natural de cada herramienta). La activación se informa por corrida y por brazo; una corrida sin activación se reporta y se analiza por protocolo como sensibilidad. En la medición anterior 0 de 4 corridas autónomas activaron el plugin, y los brazos autónomos quedaron fuera del diseño |
| Prompts que casi dictan la solución | Auditoría del prompt (4.4); reglas del prompt: interfaz fijada. **Limitación que no se mitiga y se declara (4.2):** como los tests ocultos aseveran textos exactos, HTML y firmas, casi todos los prompts filtran parte de la solución; el diseño mide ejecución de una especificación cerrada, no planificación de una abierta |
| Validez de los tests ocultos | Rojo en el padre, verde en el commit, repetido 3 veces; auditoría por aserción; control con soluciones alternativas en una submuestra (OpenAI sobre SWE-bench Verified) |
| Juez de la misma familia que los ejecutores | Declarado; criterios binarios; ciegas; dos pasadas; revisión humana de una submuestra; las métricas deterministas deciden |
| Una sola app privada y un solo ecosistema | Reconocido: no generaliza a otros lenguajes, stacks ni modelos. Las 12 tareas del estudio A y los 10 ítems del estudio B salen de una sola rama de una app, con un único modelo y esfuerzo |
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
| Estudio B: confusión de redacción | Cada brazo recibe el pedido natural de su herramienta; las diferencias mezclan herramienta y redacción. Se declara y los textos exactos van en la configuración, hasheados por el congelado |
| Estudio B: defectos inyectados | Los defectos sembrados son artificiales y de diez categorías elegidas de antemano; no representan la distribución de defectos reales. Se verifican y se registra si los tests existentes los atrapan |
| Estudio B: coincidencia por reglas | La regla de coincidencia (nombre de archivo más línea o palabras clave) es determinista pero puede perder un hallazgo mal redactado o aceptar uno casual; se declara, se hashea el script y los hallazgos sin coincidencia se revisan por muestreo (no se llaman falsos positivos) |
| Estudio B: pocos ítems | 8 ítems con defectos: solo diferencias grandes de recall son detectables (sección 9); lo demás es descriptivo |
| Estudio A: N = 12 y parada por presupuesto | Menos potencia que con 16 (sección 9); si el tope detiene el lote, solo cuentan los bloques completos y se informa cuántos fueron (sección 11) |

**Lo que este diseño no mide:** el flujo interactivo y conversacional (`start`, lluvia de ideas, `session`, identidad de la interfaz), las sesiones largas, otros repos, otros stacks y otros modelos.

## 11. Presupuesto

Un solo tope para los dos estudios y el juez. Modelo de costo con las corridas observadas (E1; la fase de desarrollo y la medición anterior): tareas chicas de 0,30 a 0,75 USD (punto medio 0,525) y medianas de 0,65 a 0,90 USD (punto medio 0,775); las corridas de superpowers con invocación forzada costaron un 15 a 25 % más; las de `validate` de 0,18 a 0,55 USD; las demás revisiones se **suponen** de 0,20 a 0,50 USD (**supuesto sin medir, E0**; la revisión nativa puede lanzar varios agentes y costar más). Estudio A: 12 tareas (5 chicas y 7 medianas) por 3 brazos, 36 corridas. Estudio B: 10 ítems por 4 brazos, 40 corridas (10 de `validate` y 30 de las otras tres herramientas).

| Concepto | Bajo | Central | Alto | Supuesto |
|---|---|---|---|---|
| Estudio A, 36 corridas | 18,2 | 24,2 | 30,2 | por brazo, 5 chicas y 7 medianas con el extremo bajo, el punto medio o el extremo alto de los rangos |
| Sobrecosto de S\* (invocación forzada) | 0,9 | 1,6 | 2,5 | 15, 20 y 25 % sobre las 12 corridas de S\* |
| Estudio B, 40 corridas | 7,8 | 14,2 | 20,5 | 10 corridas de `validate` a 0,18 / 0,365 / 0,55 USD y 30 de las otras a 0,20 / 0,35 / 0,50 USD |
| Juez del estudio A | 6,0 | 8,4 | 10,8 | 24 llamadas (12 tareas por 2 pasadas) de 0,25 a 0,45 USD. **Supuesto sin medir (E0):** se calibra con una llamada sobre el conjunto de desarrollo antes de congelar. El estudio B no usa juez |
| Repeticiones por fallos de infraestructura | 2,7 | 4,0 | 5,3 | 10 % del costo de las corridas de los dos estudios |
| Control con soluciones alternativas (4.4) | 1,5 | 2,5 | 3,8 | 5 corridas |
| **Total estimado** | **37,1** | **54,9** | **73,1** | Las pruebas del arnés en desarrollo ya están dentro de los 29,2 USD gastados |

**Tope de gasto total acumulado: 75 USD** `[confirmado por el autor 2026-10-24]`, para los dos estudios. El libro de gastos cuenta todos los experimentos; ya se gastaron unos 29,2 USD en el desarrollo y en mediciones anteriores (**es un piso**: el gasto real puede ser algo mayor), así que **quedan unos 45,8 USD**, o menos. Contra esa cifra el escenario bajo (37,1) entra con unos 8,7 USD de holgura, el central (54,9) la pasa en unos 9 USD y el alto (73,1) en unos 27. Las cifras del juez, del costo de las revisiones y la proporción de repeticiones son los supuestos más flojos.

**Qué pasa cuando el libro de gastos detiene el lote (regla declarada, por presupuesto y no por resultados).**

- Se corre **primero el estudio B completo** (bloques chicos y baratos) y después el estudio A en bloques de tarea completos, en el orden aleatorio del calendario.
- Se reserva dinero para el juez y el control con soluciones alternativas en su escenario alto (10,8 + 3,8 = 14,6 USD): el `totalCapUsd` del arnés durante el lote es **75 − 14,6 = 60,4 USD acumulados**, es decir unos **31,2 USD para el lote** (60,4 menos los 29,2 ya gastados). El arnés no lanza una corrida si lo gastado más 1,25 veces el tope por corrida pasa de esa cifra. Lo que no se gaste de la reserva no se usa para agregar corridas.
- Si el tope detiene el estudio A, **solo cuentan los bloques completos** y la ficha informa **cuántos bloques de tarea se completaron** (el bloque incompleto se lista aparte). Con menos de 8 bloques completos el estudio A se rotula exploratorio.
- Con esa regla y los costos de arriba, el estudio A completaría aproximadamente: **12 bloques en el escenario bajo, alrededor de 6 en el central (exploratorio) y alrededor de 2 en el alto**; el estudio B se completa en los tres escenarios. Si el gasto previo es mayor que 29,2 USD, serán menos. Es el costo de haber pagado dos estudios con un solo tope y se declara aquí antes de empezar.

**Tope por corrida: 3 USD**, unas 3 veces el costo central de una mediana `[confirmado por el autor 2026-10-24]`. El gasto fuera del arnés (juez, controles) se registra en el mismo libro de gastos.

## 12. Procedimiento

Los comandos son los del arnés (`tests/evals/harness/README.md`) salvo los marcados como **a construir por otro agente**. Todos menos `batch`/`run` son locales y gratis. `batch` y `run` gastan tokens y no corren sin el OK explícito del autor para el gasto.

1. **Candidatas del estudio A e ítems del estudio B** (carpeta privada, fuera del repositorio): las 20 candidatas ya están armadas y auditadas (4.2 a 4.4); los 10 ítems del estudio B los arma un agente aparte con su verdad de base privada (4.6). Una tarea de revisión se declara en la configuración como `{ "kind": "review", "item": "rev-NN", "set": "validation" }` (**a construir por otro agente**).
2. **Prueba del arnés** sobre el conjunto de desarrollo: ya hecha (apéndice). Esas corridas no entran en las conclusiones.
3. **Commit de preinscripción:** el commit de esta ficha. Su hash es el que recibe el congelado.
4. **Selección de las 12 tareas del estudio A:** `node tests/evals/select-validation.mjs --input <candidatas> --output <selección> --small 5 --medium 7 --seed 20261024` (4.2). Si una tarea elegida resulta inválida antes del congelado, la reemplaza la primera de la reserva de su estrato y el motivo queda anotado. Las 12 se declaran en la configuración local del arnés con `set: "validation"`; los brazos `SF` y `PF` llevan su `promptPrefix`.
5. **Rúbrica del juez** (6.1) concretada por tarea, y **verdad de base del estudio B**: se fijan antes del congelado.
6. **Congelado:** `node tests/evals/harness/run.mjs freeze --prereg <hash del commit de preinscripción>` escribe `freeze.json` en la carpeta privada con el hash de las tareas de validación (prompt, commit base, tests ocultos, comandos de aceptación y de la suite, archivos de alcance), la identidad de los plugins (el hash del árbol git de la carpeta del plugin), el hash del texto de cada prefijo de brazo, la versión del CLI, el modelo y el esfuerzo. `node tests/evals/harness/run.mjs freeze --check` verifica sin escribir; `run` se niega, antes de gastar, a lanzar una tarea de validación si algo cambió. El congelado cubre los dos estudios a la vez, antes de la primera corrida de cualquiera de los dos. Para las tareas de revisión tiene que hashear también la verdad de base, el pedido de cada brazo y el script de puntaje (**a construir por otro agente**). **Lo que el congelado del arnés no hashea** (la rúbrica del juez, los calendarios, los scripts de análisis y el `CLAUDE.md` neutral) se fija de otra manera: los scripts y el `CLAUDE.md` neutral están en el repositorio en el commit de preinscripción o en uno anterior, y el SHA-256 de la rúbrica y de los calendarios se anotan en una aclaración fechada al final de esta ficha (no cambia reglas). El SHA-256 de `freeze.json` y el commit de preinscripción se anotan en los campos del autor del mismo modo, y se crea una etiqueta de git (propuesta: `comparacion-3-brazos-preinscrita`; sin push). Las cuentas del arnés no cambian entre el congelado y el final.
7. **Calendarios:**
   - Estudio A: `node tests/evals/harness/run.mjs schedule --tasks <las 12 ids> --arms N,SF,PF --seed 20261025` escribe `schedule-20261025.json`.
   - Estudio B: `node tests/evals/harness/run.mjs schedule --tasks rev-01,...,rev-10 --arms N,S,P,C --seed 20261029` escribe `schedule-20261029.json`.
   Misma semilla y mismos argumentos dan el mismo orden.
8. **Lote (primero B, después A):** para cada estudio, `node tests/evals/harness/run.mjs batch --schedule <calendario> --experiment <nombre> --dry-run` muestra el plan, el gasto acumulado, el peor caso y el estado del congelado sin gastar. Con el OK del autor se repite sin `--dry-run`: corre, en serie y por entrada, `prepare`, `run`, `accept` (con el panel de calidad, estudio A) o `score` (estudio B, **a construir por otro agente**) y `row`; se detiene en el primer error del arnés y se puede relanzar con el mismo calendario. Los fallos de infraestructura se repiten con `batch --schedule <calendario> --experiment <nombre> --retry-infra` (**a construir por otro agente**), hasta 2 veces por falla. Nada se descarta en silencio. El `totalCapUsd` del lote es el de la sección 11 (60,4 USD acumulados).
9. **Puntaje del estudio B:** `node tests/evals/harness/run.mjs score --task rev-NN --arm X --rep 1` (**a construir por otro agente**) aplica la regla de 6.2 sobre `assistant-text.txt` y escribe `review_score.json` y las columnas del CSV `defects_total, defects_found, found_by_category, findings_total, findings_unmatched`.
10. **Reglas de lectura de las corridas inválidas** (iguales a las de la sección 5):
    - **Fallo de infraestructura** (error de la API, límite de uso, caída del arnés, corte de red, falla nativa del proceso): es **inválido** y se repite con `--retry-infra`, hasta 2 veces.
    - **Tope por corrida (`budget_cap`) o corte por tiempo del modelo:** es un **resultado**, no se repite. Cuenta como no verde (A) o como revisión incompleta (B), con costo censurado (igual al tope, marcado). El arnés las registra como inválidas con ese motivo; al analizar se reclasifican como resultado censurado y no se repiten ni se esconden.
    - **Nunca se repite una corrida por un mal resultado.**
11. **Panel de calidad del estudio A:** métricas deterministas sobre cada resultado (corre dentro de `accept`); `blind` arma el paquete a ciegas con nombres neutros y la clave aparte, el juez califica en dos pasadas y `unblind` pasa las notas a `pignolo2-grades.json`; el autor califica la submuestra del sorteo de 6.1.
12. **Análisis:**
    - Estudio A: `node tests/evals/analysis-cli.mjs --csv tests/evals/pignolo2-runs.csv --experiment <estudio A> --contrasts "PF:N,PF:SF,SF:N" --primary "PF:N,PF:SF" --margin 1.5 --seed 20261026 --task-set-file <selección> --grades tests/evals/pignolo2-grades.json --json` (sección 7.1). SF contra N queda exploratorio.
    - Estudio B: análisis de 7.2 sobre las filas del estudio B del CSV, con los contrastes primarios P:N, P:C y P:S (modo de revisión del mismo CLI o script aparte, **a construir por otro agente** y hasta entonces no ejecutable).
    - Se guarda la salida `--json` junto con el CSV. La revisión a mano de hallazgos sin coincidencia (6.2) se sortea con `node tests/evals/select-validation.mjs --input <hallazgos> --output <sorteo> --small 12 --medium 0 --seed 20261028`.
13. **Informe:** se publican todos los resultados, también los nulos o negativos, con el n (y los bloques completos del estudio A), los intervalos y la tasa de activación. El CSV es el dato crudo, una fila por corrida. En el repositorio no hay contenido privado: ni nombres, ni rutas, ni archivos, ni commits de la app, ni la verdad de base de los ítems de revisión. Las tareas y los ítems se describen de forma genérica ("commits reales de una app privada") y por id y estrato.
14. **Cambios a esta ficha después del congelado:** solo aclaraciones fechadas al final que no cambien reglas, umbrales ni el conjunto de tareas. Cualquier otro cambio invalida la preinscripción y se rotula como tal.

## Apéndice: Fase de desarrollo (no entra en las conclusiones)

Resultados de la fase de desarrollo, que sirvió para depurar el arnés. Se anotan por transparencia y **no cuentan en ninguna conclusión** de esta comparación.

- **Corridas:** 9 válidas, 3 tareas de desarrollo por los 3 brazos con 1 repetición. La corrida mediana de superpowers se cortó con un código de salida nativo de Windows y se repitió (fallo de infraestructura).
- **Razones de costo (IC 95 %):** P sobre N 1,045 (0,96 a 1,10); S sobre N 0,977 (0,78 a 1,13); P sobre S 1,070 (0,91 a 1,39).
- **Dispersión:** la dispersión de los log-cocientes de costo apareados por tarea fue de 0,07 a 0,22 según el contraste. Con n = 3 no es una estimación confiable de la interacción tarea por brazo.
- **Activación:** ningún plugin se activó solo en ninguna corrida de desarrollo (coincide con la medición anterior, sección 2.1). Es la razón por la que la ficha pasó a invocar los métodos a propósito.
- **Hipótesis posterior a ver los datos (no es un resultado):** un test oculto de la tarea mediana de desarrollo, sobre etiquetas de fechas que cruzan de año, falló en todas las corridas de esa tarea en que no había Pignolo ni un plan forzado, y pasó en todas las corridas con Pignolo cargado. Los conteos **no salen solo de la fase de desarrollo**: vienen de **dos experimentos y de más de 10 corridas de la misma tarea**. En la primera medición (experimento `pignolo2`): el brazo de superpowers autónomo falló en las repeticiones 1 y 2, el de Pignolo pasó en las repeticiones 1 y 2, y las dos variantes forzadas (superpowers y Pignolo) pasaron en ambas repeticiones. En la fase de desarrollo: sin plugin y superpowers fallaron, Pignolo pasó. Es decir, falló 4 de 4 veces sin Pignolo y sin plan forzado, y pasó 5 de 5 con Pignolo cargado (y 2 de 2 con superpowers forzado). Como todo viene de **una sola tarea**, la muestra efectiva es una tarea. Sigue siendo una **hipótesis post hoc para examinar en la validación**, no un resultado.
- **Panel de calidad:** `tsc` real (42 errores preexistentes) y ESLint corrieron en el panel de calidad de esas corridas.
