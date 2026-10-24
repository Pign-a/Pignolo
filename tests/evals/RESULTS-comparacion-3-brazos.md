# Comparación de tres brazos: sin plugin, superpowers y Pignolo

**Estado: preinscrita, pendiente de congelar.**

_Esta ficha se escribe y se commitea antes de cualquier corrida de validación, como pide `docs/protocolo-de-pruebas.md`. El autor fijó los campos y confirmó los márgenes el 2026-10-24; la preinscripción queda cerrada cuando se congela el conjunto de tareas (sección 12). Es el seguimiento de [`RESULTS-pignolo2.md`](RESULTS-pignolo2.md), cuya medición tuvo tres tareas en total y por eso solo permite afirmaciones exploratorias (ver su sección "Corrección de las etiquetas de evidencia (2026-10-23)"). Las corridas pagas esperan el OK explícito del autor._

## Campos que fijó el autor (decisiones del 2026-10-24)

| Campo | Valor |
|---|---|
| Tope de gasto total acumulado (USD) | 75. El libro de gastos cuenta todos los experimentos: unos 29,2 USD ya se gastaron en el desarrollo y en mediciones anteriores, así que quedan unos 45 USD para validación, juez y repeticiones |
| Tope por corrida (USD) | 3 |
| Número de tareas de validación N | 16 (7 chicas y 9 medianas), elegidas por `tests/evals/select-validation.mjs` entre 20 candidatas empaquetadas (9 chicas y 11 medianas); las 4 no elegidas son una reserva ordenada (ver 4.2). La grilla de potencia de la sección 9 va de 8 a 30 tareas y incluye n = 16 |
| Semilla de la selección de tareas | 20261024 |
| Semilla del calendario de corridas | 20261025 |
| Semilla del bootstrap | 20261026 |
| Semilla del sorteo de la revisión humana del juez | 20261027 |
| Márgenes marcados `[confirmado por el autor 2026-10-24]` | confirmados con los números propuestos (ver secciones 5, 7 y 8) |
| Hash de congelado (SHA-256 del archivo de congelado, ver sección 12) | `[lo escribe el comando de congelado / el commit de preinscripción]` |
| Commit de esta ficha (el que llena estos campos) | `[lo escribe el comando de congelado / el commit de preinscripción]` |

Las cuatro semillas y la confirmación de los márgenes hacen falta para que la preinscripción sea reproducible.

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

**N = 16 tareas** (7 chicas y 9 medianas), elegidas con una **regla mecánica escrita antes de mirar resultados** a partir de commits reales de una rama de una app privada del autor. Las tareas se identifican con ids genéricos (`v01`, `v02`...); nada de nombres, rutas, funciones ni hashes de la app aparece en el repositorio.

**Cómo se armaron las 20 candidatas.**

1. **Estratos por tamaño del commit real:** **chica** = de 30 a 200 líneas cambiadas en el commit real; **mediana** = de 201 a 1200 líneas cambiadas. (No se definen por archivos ni por líneas de producción.)
2. **Regla mecánica de muestreo, escrita antes de mirar resultados:** entre los commits elegibles de cada estrato, ordenados por fecha, se toma uno de cada k, con **k = 2 en las chicas y k = 3 en las medianas**. Los commits del conjunto de desarrollo y sus vecinos quedan afuera.
3. **Verificación mecánica de cada candidata:** los tests ocultos (los del commit real, ver 4.3) fallan (rojo) en el commit padre y pasan (verde) en el commit real, y la suite completa del padre estaba en verde.
4. **Reemplazos antes de cualquier corrida con un modelo:** algunos commits con más de 100 aserciones nuevas, o cuyo padre no tenía la suite en verde, se reemplazaron por el siguiente elegible de su estrato. Ningún reemplazo dependió de resultados de los brazos, porque todavía no había corrido ninguno.
5. **Auditoría de cada aserción oculta contra el prompt** (ver 4.4): entre las 20 candidatas no quedó ninguna aserción subespecificada.

El resultado son **20 candidatas empaquetadas: 9 chicas y 11 medianas**.

**Selección final de las 16.** La hace `node tests/evals/select-validation.mjs --input <candidatas> --output <selección> --small 7 --medium 9 --seed 20261024`. El script ordena las candidatas de cada estrato por id, baraja cada estrato con Fisher-Yates y una PRNG con semilla (mulberry32, una por estrato derivada de la semilla: la semilla para las chicas y la semilla más 1 para las medianas) y elige las primeras 7 chicas y 9 medianas del estrato barajado. Las 4 que sobran (2 chicas y 2 medianas) son una **reserva en el orden del barajado**: sirven solo para reemplazar, en ese orden y dentro de su estrato, una tarea que se descubra inválida **antes del congelado**. Después del congelado no se reemplaza nada. Misma entrada y misma semilla dan siempre la misma selección; la salida guarda un hash de la entrada y el script solo imprime ids y conteos.

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

## 5. Diseño

- **Una repetición por tarea y brazo.** La tarea es la unidad. Se justifica con la investigación (Miller: lo que se generaliza es el número de tareas, las repeticiones de una misma tarea no reducen la incertidumbre entre tareas) y con el ruido observado (sección 2.1). La simulación de potencia (sección 9) muestra que pasar de 1 a 2 repeticiones por tarea mejora poco, mientras que duplicar el costo de ejecución es seguro. **Desviación del protocolo:** `docs/protocolo-de-pruebas.md` pide al menos 3 repeticiones por brazo cuando la corrida cuesta menos de ~300 mil tokens; aquí la replicación es entre tareas. En esta ficha, "E3" significa replicación a nivel de tarea con n de 8 o más, y con menos de 8 tareas el resultado es exploratorio `[confirmado por el autor 2026-10-24]`.
- **Orden al azar con semilla.** El calendario baraja el orden de las tareas y, dentro de cada tarea, el orden de los tres brazos. Se guarda el calendario completo en el archivo de congelado.
- **Brazos intercalados en el tiempo.** Las tres corridas de una tarea van seguidas (bloque de tarea), de modo que la variación horaria de la API y de la máquina pega parecido a los tres brazos.
- **Espacio de trabajo limpio por corrida:** un árbol nuevo desde el commit padre, sin restos de corridas anteriores.
- **Topes fijos:** 3 USD por corrida y 75 USD de gasto total acumulado (campos del autor). Una corrida que llega al tope por corrida (`budget_cap`) o se corta por tiempo mientras el modelo seguía trabajando **es un resultado**, no un fallo de infraestructura: cuenta como no verde, con costo igual al tope (costo censurado, marcado) y **no se repite** `[confirmado por el autor 2026-10-24]`.
- **Fallos de infraestructura** (error de la API, límite de uso, caída del arnés, corte de red) son **inválidos**: se registran aparte con su motivo y se repiten hasta 2 veces por falla (`batch --retry-infra`, sección 12) `[confirmado por el autor 2026-10-24]`. **Nunca se repite una corrida por un mal resultado.** Un tope por corrida o un corte por tiempo del modelo es un resultado; una falla de infraestructura es inválida y se repite: esa es la línea que separa las dos cosas.
- **Sin mirar:** n fijo; no se agregan tareas ni repeticiones después de ver resultados. Una mirada intermedia está permitida solo para detectar fallas del arnés, se declara en el informe y no es confirmatoria.
- **Si se agota el presupuesto:** el arnés no lanza una corrida si lo gastado (de **todos** los experimentos, juez incluido) más 1,25 veces el tope por corrida pasa del tope total; el bloque de tarea en curso puede quedar incompleto, y entonces solo cuentan los bloques completos (los tres brazos de la tarea) y el bloque incompleto se informa aparte. Como el orden es aleatorio, las tareas completas son una muestra válida. Se publica con el n alcanzado; con menos de 8 tareas el resultado es exploratorio. No se amplía el tope para "rescatar" un resultado.

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

**El juez.** Rúbrica de cinco criterios binarios (la lista está en la sección 6.1), concretados para cada tarea con el prompt y la solución real **antes de las corridas** y congelados. El comportamiento pedido lo decide la aceptación oculta, no el juez. Cada pasada recibe el prompt, la solución real, la rúbrica y los resultados de los tres brazos con **nombres neutros, orden mezclado**. Dos pasadas por tarea, con asignación de etiquetas y orden distintos. La nota es la proporción de criterios cumplidos, promediando las dos pasadas; las discrepancias entre pasadas se informan.

**Limitación declarada:** el juez es de la misma familia de modelos que los ejecutores, y puede compartir sesgos y preferir su propio estilo (MT-Bench). Mitigaciones: criterios binarios contra la solución real, ciegas, orden mezclado, dos pasadas, el tamaño del diff informado al lado (sesgo de verbosidad), y **una revisión humana por muestreo** (sección 6.1): el panel del juez solo cuenta si el acuerdo con el autor llega al 80 % `[confirmado por el autor 2026-10-24]`.

### 6.1 Revisión humana del juez

El autor califica a mano, a ciegas, una submuestra al azar de los paquetes que ve el juez, con la misma rúbrica, y se mide el acuerdo. El procedimiento queda escrito ahora, antes de las corridas.

**Muestra.** 8 de los 48 paquetes a ciegas (16 tareas por 3 brazos). El sorteo es reproducible: se listan los 48 paquetes por su id (`<tarea>/pack-<k>`, con las etiquetas ya mezcladas por `blind` y sin la clave de brazos), se pasa la lista a `select-validation.mjs` como un solo estrato y se piden 8 con la semilla del sorteo: `node tests/evals/select-validation.mjs --input <paquetes> --output <sorteo> --small 8 --medium 0 --seed 20261027`. Los 8 ids de `selected` son los que revisa el autor, que califica antes de ver las notas del juez y sin la clave.

**Rúbrica (fija antes del congelado).** Cinco criterios binarios, sí o no, que el autor y el juez aplican a cada paquete comparando con la solución real:

1. Respeta las convenciones del repositorio que se ven en los archivos vecinos (nombres, estructura, estilo, manejo de errores).
2. No hay cambios no relacionados con la tarea (archivos o líneas ajenos al pedido).
3. No duplica una utilidad que ya existe en el repositorio.
4. Maneja los casos borde que enuncia el prompt.
5. No quedan restos de depuración (impresiones, código comentado, archivos temporales).

La rúbrica de cada tarea concreta esos cinco criterios con ejemplos tomados de la solución real (qué utilidad existente habría que reutilizar, qué casos borde enuncia el prompt) y se congela con el resto (sección 12).

**Acuerdo.** Para cada paquete sorteado y cada criterio se compara el veredicto del autor con el del juez; si las dos pasadas del juez no coinciden entre sí, el criterio cuenta como desacuerdo. Son 40 comparaciones (8 paquetes por 5 criterios). **El panel del juez cuenta solo si el acuerdo es de al menos 80 %** (32 de 40 o más) `[confirmado por el autor 2026-10-24]`. Se informa el acuerdo total y por criterio, y las discrepancias. Si queda por debajo, el panel se informa como no confiable y no se usa para ninguna conclusión; las métricas deterministas siguen decidiendo igual.

## 7. Plan de análisis

Las cuentas las hace `node tests/evals/analysis-cli.mjs` (se está completando por separado; esta ficha lo cita por su nombre y sus banderas `--csv`, `--experiment`, `--contrasts`, `--primary`, `--margin`, `--seed`, `--task-set-file`, `--grades` y `--json`). Ejemplo: `node tests/evals/analysis-cli.mjs --csv <csv> --experiment <nombre> --contrasts "P:N,P:S,S:N" --primary "P:N,P:S" --margin 1.5 --seed 20261026 --task-set-file <selección> --grades <notas> --json`. `--primary` marca los dos contrastes primarios (los que entran en Holm y en la regla de decisión) y S contra N queda exploratorio. La semilla del bootstrap es 20261026.

1. **Colapsar repeticiones por tarea:** si una tarea y brazo tiene más de una corrida válida (por ejemplo una repetición por fallo de infraestructura), se usa la media geométrica del costo de esa tarea y brazo. Lo esperado es una corrida válida por celda.
2. **Costo.** Para cada contraste, razón de costos por tarea `c_P / c_control`, media del logaritmo, y de ahí la razón de medias geométricas (RMG). Intervalo por **bootstrap percentil sobre las tareas**: 10.000 remuestreos, semilla fija. Cota superior unilateral del 95 % (percentil 95) contra el margen 1,5 para la no inferioridad; intervalo del 90 % (percentiles 5 y 95) para la equivalencia descriptiva con margen 1,25 (el intervalo queda dentro de [0,8; 1,25]). Valor p de la **permutación de signos** sobre las diferencias de log, bilateral, **ajustado con Holm** sobre los dos contrastes primarios.
3. **Cota t adicional `[confirmado por el autor 2026-10-24]`.** La simulación de la sección 9 muestra que la cota percentil sola declara no inferioridad con un error tipo I de 5 a 9 % cuando la verdad está justo en el margen (nominal 5 %). Se calcula también la cota t sobre el log: `media + t(0,95; n-1) · s / raíz(n)`. La no inferioridad se declara solo si **las dos** cotas están por debajo de 1,5 (regla doble). Si el CLI no informa la cota t en el momento de congelar, se calcula con esta fórmula.
4. **Éxito.** Por brazo, k/n tareas verdes con intervalo de Wilson del 95 %. Por contraste, **McNemar exacto** sobre los pares discordantes por tarea.
5. **Panel del juez.** Notas apareadas por tarea, Wilcoxon de rangos con signo (exacto para n chico, ceros descartados), y conteos gana/empata/pierde.
6. **Se muestran siempre** el número de tareas, los intervalos y la tasa de activación por brazo. Con **menos de 8 tareas el resultado se rotula exploratorio** y no se dan veredictos.
7. **Descriptivos sin decisión:** tokens por tipo, costo por tarea resuelta, tiempo de pared, turnos, agentes, alcance fuera de la solución real, tamaño del diff, tests agregados, cobertura y mutación si se midieron; por brazo, mediana y rango.
8. **Sensibilidades declaradas, no decisivas:** sin las corridas de costo censurado, sin las tareas donde ningún brazo queda verde, por protocolo en vez de ITT.

## 8. Reglas de decisión

Se fijan antes de ver datos. Para cada contraste P contra X (X = N o S) y con n de 8 o más. Sea `m = max(1, parte entera de 0,10 · n)`: con n = 16, m = 1 tarea (6,25 puntos). Si el lote termina con menos tareas, se recalcula con el n alcanzado.

**Costo.**

| Resultado | Condición |
|---|---|
| **No inferior en costo** | Las dos cotas superiores del 95 % (percentil y t) de la RMG son menores que 1,5 |
| **Más caro demostrado** | El valor p ajustado con Holm es menor que 0,05 **y** el intervalo del 90 % no incluye 1 con la RMG por encima |
| **Más barato demostrado** | Ídem con la RMG por debajo |
| **Sin diferencia demostrada** | Ninguna de las dos diferencias demostradas |
| **Equivalente (descriptivo)** | El intervalo del 90 % queda dentro de [0,8; 1,25] |

Combinaciones: no inferior y sin diferencia demostrada; no inferior y más caro demostrado ("más caro dentro del margen"); no inferior y más barato demostrado; **no concluyente** (no se cumple la no inferioridad y tampoco hay diferencia demostrada); **peor en costo** (más caro demostrado y no se cumple la no inferioridad).

**Calidad.** Cada puerta se evalúa por contraste. Todos los márgenes están `[confirmado por el autor 2026-10-24]`, por estas razones: con n = 16 una tarea vale 6,25 puntos, y m = 1 es el piso de la fórmula (una diferencia de una tarea está dentro del ruido; más de una merece una alerta); el mismo margen proporcional para todas las puertas evita elegir márgenes distintos a la medida de cada resultado.

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

**Límite de lo que puede decir la puerta Q1.** La simulación de la sección 9 muestra que el McNemar exacto casi no tiene potencia con tantas tareas: una caída de 20 puntos en el éxito (0,9 contra 0,7) se detecta con 11 % de probabilidad con 16 tareas (19 % con 20). Q1 es una red de seguridad contra una caída grande, no una demostración de no inferioridad en éxito. Una respuesta de "sin pérdida de calidad observada" se escribe así y no como "calidad equivalente".

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
- **Con N = 16 (el diseño elegido), r = 1:** descartar 1,5 veces sin efecto real tiene 100 %, 100 % y 87 % de potencia para sigma_int de 0,15, 0,25 y 0,40; si el costo real de P es un 20 % mayor, 92 %, 72 % y 47 % con el bootstrap solo (89 %, 66 % y 43 % con la regla doble); detectar 0,8 con el IC del 90 % da 92 %, 72 % y 47 %, y con el umbral de Holm 77 %, 53 % y 29 %. El error tipo I en el margen es de 7 %, 7 % y 6 % con el bootstrap solo y de 5 %, 5 % y 4 % con la regla doble. La equivalencia dentro de [0,8; 1,25] llega a 83 %, 42 % y 6 %. En éxito, el McNemar exacto detecta una caída de 0,9 a 0,7 con 11 % de probabilidad. Con interacción tarea por brazo moderada o alta (0,25 o más), N = 16 queda corto para distinguir un 20 % de diferencia.
- **Éxito binario:** el McNemar exacto tiene muy poca potencia. Con 20 tareas detecta una caída de 0,9 a 0,7 con 19 % de probabilidad, y con 30 tareas con 36 %. Si los dos brazos están cerca del techo (0,9 contra 0,9) hay solo unos 3,6 pares discordantes esperados con 20 tareas. **Con este tamaño no se puede afirmar no inferioridad ni diferencia en el éxito,** salvo diferencias muy grandes; el éxito es un chequeo de seguridad y un dato descriptivo.
- **Lo que el diseño no puede:** detectar efectos menores a ±15 a 20 % de costo, demostrar equivalencia con sigma_int de 0,25 o más, o probar que la calidad no cae.

## 10. Amenazas a la validez

| Amenaza | Mitigación o reconocimiento |
|---|---|
| El plugin no se activa | La activación se informa por corrida y por brazo; ITT es el primario; las variantes forzadas son análisis aparte y rotulado. Si la activación es baja, la comparación mide "instalar el plugin" y se dice |
| Prompts que casi dictan la solución | Auditoría del prompt (4.4); reglas del prompt: interfaz fijada. **Limitación que no se mitiga y se declara (4.2):** como los tests ocultos aseveran textos exactos, HTML y firmas, casi todos los prompts filtran parte de la solución; el diseño mide ejecución de una especificación cerrada, no planificación de una abierta |
| Validez de los tests ocultos | Rojo en el padre, verde en el commit, repetido 3 veces; auditoría por aserción; control con soluciones alternativas en una submuestra (OpenAI sobre SWE-bench Verified) |
| Juez de la misma familia que los ejecutores | Declarado; criterios binarios; ciegas; dos pasadas; revisión humana de una submuestra; las métricas deterministas deciden |
| Una sola app privada y un solo ecosistema | Reconocido: no generaliza a otros lenguajes, stacks ni modelos. Las 16 tareas salen de una sola rama de una app, con un único modelo y esfuerzo |
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

Modelo de costo con las medianas observadas por corrida (E1, medición anterior): tareas chicas de 0,30 a 0,60 USD (central 0,45) y medianas de 0,70 a 1,10 USD (central 0,90); las corridas de superpowers con invocación forzada costaron un 15 a 25 % más. Mezcla de N = 16: 7 chicas y 9 medianas, 48 corridas (21 chicas y 27 medianas).

| Concepto | Bajo | Central | Alto | Supuesto |
|---|---|---|---|---|
| 48 corridas de ejecución | 25,2 | 33,8 | 42,3 | 21 corridas chicas y 27 medianas con los costos de arriba |
| Sobrecosto si superpowers se activa | 0,0 | 2,3 | 2,8 | 0, 20 y 25 % sobre las 16 corridas de S |
| Repeticiones por fallos de infraestructura | 2,5 | 3,4 | 4,2 | 10 % del costo de ejecución (alrededor de 5 de 48 corridas) |
| Prueba del arnés en el conjunto de desarrollo y control con soluciones alternativas | 3,0 | 4,0 | 5,0 | 3 corridas de prueba y 5 de control (4.4). Las de prueba ya están dentro del gasto de desarrollo |
| Juez con modelo | 8,0 | 11,2 | 14,4 | 32 llamadas (16 tareas por 2 pasadas) de 0,25 a 0,45 USD. **Supuesto sin medir (E0):** se calibra con una llamada sobre el conjunto de desarrollo antes de congelar |
| **Total estimado de la validación** | **38,7** | **54,7** | **68,7** | |

**Tope de gasto total acumulado: 75 USD** `[confirmado por el autor 2026-10-24]`. El libro de gastos cuenta todos los experimentos y ya hay unos 29,2 USD gastados en el desarrollo y en mediciones anteriores, así que **quedan unos 45 USD**. Contra esa cifra, el escenario bajo (38,7) entra, el central (54,7) lo pasa en unos 10 USD (menos, porque parte de la línea de prueba del arnés ya está gastada) y el alto (68,7) en unos 24. Las cifras del juez, el sobrecosto de superpowers y la proporción de repeticiones son los supuestos más flojos. Con ese tope, **es posible que el lote termine antes de las 16 tareas**: la regla de la sección 5 lo cubre (el arnés no lanza una corrida que pueda pasar el tope, se publica con el n alcanzado, y con menos de 8 tareas el resultado es exploratorio). No se amplía el tope para "rescatar" un resultado. **Tope por corrida: 3 USD**, unas 3 veces el costo central de una mediana `[confirmado por el autor 2026-10-24]`. El gasto fuera del arnés (juez, controles) se registra en el mismo libro de gastos.

## 12. Procedimiento

Los comandos son los del arnés (`tests/evals/harness/README.md`); todos menos `batch`/`run` son locales y gratis. `batch` y `run` gastan tokens y no corren sin el OK explícito del autor para el gasto.

1. **Tareas candidatas** (carpeta privada, fuera del repositorio): ya armadas y auditadas según 4.2 a 4.4. No gasta tokens.
2. **Prueba del arnés** sobre el conjunto de desarrollo: ya hecha en la fase de desarrollo (apéndice). Esas corridas no entran en las conclusiones.
3. **Commit de preinscripción:** el commit de esta ficha, con las decisiones del autor del 2026-10-24. Su hash es el que recibe el congelado.
4. **Selección de las 16:** `node tests/evals/select-validation.mjs --input <candidatas> --output <selección> --small 7 --medium 9 --seed 20261024` (4.2). Si una tarea elegida resulta inválida antes del congelado, la reemplaza la primera de la reserva de su estrato y el motivo queda anotado. Las 16 se declaran en la configuración local del arnés con `set: "validation"`.
5. **Rúbrica del juez** (6.1): se concreta para cada una de las 16 tareas y queda fija antes del congelado.
6. **Congelado:** `node tests/evals/harness/run.mjs freeze --prereg <hash del commit de preinscripción>` escribe `freeze.json` en la carpeta privada con el hash de las tareas de validación (prompt, commit base, tests ocultos, comandos de aceptación y de la suite, archivos de alcance), la identidad de los plugins (el hash del árbol git de la carpeta del plugin), la versión del CLI, el modelo y el esfuerzo. `node tests/evals/harness/run.mjs freeze --check` verifica sin escribir; `run` se niega, antes de gastar, a lanzar una tarea de validación si algo cambió. **Lo que el congelado del arnés no hashea** (la rúbrica del juez, el calendario, los scripts de análisis y el `CLAUDE.md` neutral) se fija de otra manera: los scripts y el `CLAUDE.md` neutral están en el repositorio en el commit de preinscripción o en uno anterior, y el SHA-256 de la rúbrica y del calendario se anotan en una aclaración fechada al final de esta ficha (no cambia reglas). El SHA-256 de `freeze.json` y el commit de preinscripción se anotan en los campos del autor del mismo modo, y se crea una etiqueta de git (propuesta: `comparacion-3-brazos-preinscrita`; sin push). Las cuentas del arnés no cambian entre el congelado y el final.
7. **Calendario:** `node tests/evals/harness/run.mjs schedule --tasks <las 16 ids> --arms N,S,P --seed 20261025` baraja las tareas y, dentro de cada una, los tres brazos, y escribe `schedule-20261025.json`. Misma semilla y mismos argumentos dan el mismo orden.
8. **Lote:** `node tests/evals/harness/run.mjs batch --schedule schedule-20261025.json --experiment <nombre> --dry-run` muestra el plan, el gasto acumulado, el peor caso y el estado del congelado sin gastar. Con el OK del autor se repite sin `--dry-run`: corre, en serie y por entrada, `prepare`, `run`, `accept` (con el panel de calidad) y `row`; se detiene en el primer error del arnés y se puede relanzar con el mismo calendario (salta lo que ya tiene fila). Los fallos de infraestructura se repiten con `batch --schedule ... --experiment <nombre> --retry-infra`, hasta 2 veces por falla. Nada se descarta en silencio.
9. **Reglas de lectura de las corridas inválidas** (iguales a las de la sección 5):
   - **Fallo de infraestructura** (error de la API, límite de uso, caída del arnés, corte de red, falla nativa del proceso): es **inválido** y se repite con `--retry-infra`, hasta 2 veces.
   - **Tope por corrida (`budget_cap`) o corte por tiempo del modelo:** es un **resultado**, no se repite. Cuenta como no verde y con costo censurado (igual al tope, marcado). El arnés las registra como inválidas con ese motivo; al analizar se reclasifican como resultado censurado y no se repiten ni se esconden.
   - **Nunca se repite una corrida por un mal resultado.**
10. **Panel de calidad:** métricas deterministas sobre cada resultado (corre dentro de `accept`); `blind` arma el paquete a ciegas con nombres neutros y la clave aparte, el juez califica en dos pasadas y `unblind` pasa las notas a `pignolo2-grades.json`; el autor califica la submuestra del sorteo de 6.1.
11. **Análisis:** `node tests/evals/analysis-cli.mjs --csv tests/evals/pignolo2-runs.csv --experiment <nombre> --contrasts "P:N,P:S,S:N" --primary "P:N,P:S" --margin 1.5 --seed 20261026 --task-set-file <selección> --grades tests/evals/pignolo2-grades.json --json` (sección 7). S contra N queda exploratorio. Se guarda la salida `--json` junto con el CSV.
12. **Informe:** se publican todos los resultados, también los nulos o negativos, con el n, los intervalos y la tasa de activación. El CSV es el dato crudo, una fila por corrida. En el repositorio no hay contenido privado: ni nombres, ni rutas, ni archivos, ni commits de la app. Las tareas se describen de forma genérica ("commits reales de una app privada") y por id y estrato.
13. **Cambios a esta ficha después del congelado:** solo aclaraciones fechadas al final que no cambien reglas, umbrales ni el conjunto de tareas. Cualquier otro cambio invalida la preinscripción y se rotula como tal.

## Apéndice: Fase de desarrollo (no entra en las conclusiones)

Resultados de la fase de desarrollo, que sirvió para depurar el arnés. Se anotan por transparencia y **no cuentan en ninguna conclusión** de esta comparación.

- **Corridas:** 9 válidas, 3 tareas de desarrollo por los 3 brazos con 1 repetición. La corrida mediana de superpowers se cortó con un código de salida nativo de Windows y se repitió (fallo de infraestructura).
- **Razones de costo (IC 95 %):** P sobre N 1,045 (0,96 a 1,10); S sobre N 0,977 (0,78 a 1,13); P sobre S 1,070 (0,91 a 1,39).
- **Dispersión:** la dispersión de los log-cocientes de costo apareados por tarea fue de 0,07 a 0,22 según el contraste. Con n = 3 no es una estimación confiable de la interacción tarea por brazo.
- **Activación:** ningún plugin se activó solo en ninguna corrida de desarrollo (coincide con la medición anterior, sección 2.1).
- **Hipótesis posterior a ver los datos (no es un resultado):** un test oculto de la tarea mediana de desarrollo, sobre etiquetas de fechas que cruzan de año, falló en 4 de 4 corridas sin Pignolo y sin un plan forzado, y pasó en 5 de 5 con Pignolo cargado. Se anota como hipótesis para examinar en la validación; con una sola tarea no sostiene ninguna afirmación.
- **Panel de calidad:** `tsc` real (42 errores preexistentes) y ESLint corrieron en el panel de calidad de esas corridas.
