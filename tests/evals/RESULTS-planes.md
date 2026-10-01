# Resultados: prueba de metodologías de validación de planes

Fecha: 2026-09-30. Claude Code 2.1.285, Windows nativo, `claude -p` sin pignolo cargado (`--setting-sources project,local`). Plan de la prueba: `docs/plans/2026-09-30-bench-validacion-de-planes.md`. Investigación de base: `docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md`. Decisión del autor: prueba completa, tope 25 USD. **Gasto: 28,50 USD** (tope ampliado a 40 por el autor para M6 y M7). Resultados buenos o malos, sin transcripciones. `tests/bench/plans/results/` no se versiona.

## Métodos

M1 script de referencias (sin IA) · M2 M1 + rojo de los tests del plan (sin IA) · M3 revisor de solo lectura · M4 capas (M2 y después un revisor que recibe su informe) · M5 capas + experimentos puntuales (el revisor puede correr Bash en una carpeta temporal, con la guardia de pignolo cargada) · M6 dos pasos: un revisor lista hallazgos y, aparte, los supuestos que solo se verifican ejecutando; un segundo agente cuya única tarea es verificarlos con experimentos, con un hook `Stop` real que lo bloquea (hasta 2 veces) si hizo menos experimentos que supuestos · M7 el mismo primer paso, y los supuestos los verifican sondas fijas sin IA (`tests/bench/plans/probes.js`) · M6 dos pasos con experimentos forzados (un revisor de solo lectura que recibe el informe de M2 y lista las afirmaciones que solo se verifican ejecutando; después un experimentador con Bash, la guardia de pignolo y un hook Stop real que no lo deja terminar mientras haya menos Bash que afirmaciones, como mucho 2 bloqueos) · M7 dos pasos con sondas fijas (el mismo paso A y después sondas deterministas de Windows y Node, sin IA, sobre las afirmaciones) · M0 replay: implementar el plan en una copia y reportar lo que no funcionó (el método viejo).

**M6 y M7 (preparados, sin medir todavía).** El hook de M6 va en un settings por corrida (`--settings <scratch>/settings.json`): se verificó con dos llamadas reales mínimas (sonnet, 0,07 USD en total) que con `-p` y `--setting-sources project,local` los hooks de `--settings` corren: un Stop que bloquea una vez hizo seguir al modelo, y un PostToolUse de Bash anotó la llamada. Con `--no-session-persistence` la transcripción no se escribe (`transcript_path` apunta a un archivo que no existe), por eso el hook cuenta los Bash con PostToolUse. **Límite de M7:** sus cinco sondas (npm/npx sin shell, `child.kill()` que deja vivo al nieto, `spawnSync` que bloquea el event loop, `git apply --numstat` que devuelve 0 con un parche que no aplica, `process.kill(pid, 0)` con EPERM en Windows) salen de errores ya vistos, incluidos los de este caso real (r03, r06, r12): sobre el caso real, M7 mide la cobertura de riesgos conocidos, no el caso general.

## Planes sintéticos (3 planes × 6 errores plantados + 1 plan limpio; 3 corridas por método y modelo)

| Método | Modelo | Recall | Falsas alarmas (total) | USD por corrida | Segundos por corrida |
|---|---|---|---|---|---|
| M1 | — | 56 % | 0 | 0 | 0,1 |
| M2 | — | 72 % | 0 | 0 | 0,4 |
| M3 | sonnet | 100 % | 3 | 0,068 | 11 |
| M3 | opus | 100 % | 6 | 0,148 | 19 |
| M4 | sonnet | 96 % | 0 | 0,072 | 13 |
| M4 | opus | 100 % | 2 | 0,143 | 21 |
| M5 (1 corrida, p1 y el limpio) | sonnet | 100 % | 0 | 0,085 | — |
| M5 (1 corrida, p1 y el limpio) | opus | 100 % | 0 | 0,170 | — |
| M0 (1 corrida, sin el plan limpio) | sonnet | 100 % | 0 | 0,090 | — |
| M0 (1 corrida, sin el plan limpio) | opus | 100 % | 4 | 0,230 | — |

Los planes sintéticos resultaron fáciles: todos los métodos con IA encuentran todo. Sirven para ver falsas alarmas y costo, no para separar modelos.

## Caso real: el plan 4a v1 (`794b009`) contra el código de ese commit (14 errores reales, los que encontró la auditoría opus)

**Recall contado a mano** (un revisor opus etiquetó por significado cada uno de los 76 hallazgos de las 19 corridas; ver "Validación del calificador" abajo). Solo corridas válidas.

| Método | Modelo | Corridas | Recall (a mano) | USD por corrida | Segundos por corrida |
|---|---|---|---|---|---|
| M1 / M2 | — | 1 | 0 % (20 falsas alarmas) | 0 | 1 |
| M3 revisor | sonnet | 3 | 21 % (9/42) | 0,45 | 77 |
| M3 revisor | opus | 3 | **33 %** (14/42) | 1,10 | 146 |
| M4 script + revisor | sonnet | 3 | 10 % (4/42) | 0,28 | 51 |
| M4 script + revisor | opus | 2 (la 3.ª la cortó el tope) | **32 %** (9/28) | 0,90 | 136 |
| M5 script + revisor + experimentos | sonnet | 2 | 14 % (4/28) | 0,42 | 70 |
| M5 script + revisor + experimentos | opus | 3 | 29 % (12/42) | 0,95 | 144 |
| M6 dos pasos + experimentos forzados por hook | sonnet | 3 | 29 % (12/42) | 0,62 | 163 |
| M6 dos pasos + experimentos forzados por hook | opus | 3 | **38 %** (16/42) | 1,45 | 276 |
| M7 dos pasos + sondas fijas | sonnet | 3 | 24 % (10/42) | 0,31 | 69 |
| M7 dos pasos + sondas fijas (6 aciertos solo de sondas) | opus | 3 | **45 %** (19/42) | 0,92 | 146 |
| Auditoría original (opus con Bash, muchos experimentos) | opus | 1 | 100 % por definición | ~190 mil tokens | ~6 min |

M6 y M7 (abajo) encontraron por primera vez r03 (M6 opus, con un experimento), r05 y r07 (M7 opus) y r14 (M6). Entre M3 y M5, ningún método encontró r03 (`npm`/`npx` sin shell en Windows), r05 (rojo sin verde previo), r11 (palabras clave sin límite: `process.exit` como `xit(`), r14 (`Grep.pattern` no es una ruta) ni r07 (debilitamientos del `test-writer` dentro del `testRef`); r08 lo encontró una sola corrida (M5 opus).

**M5 (experimentos puntuales).** Con sonnet, en ninguna corrida ejecutó un experimento aunque tenía Bash, permiso de escritura y la indicación explícita ("no corrí experimentos": razona desde el código). Con opus, dos de las tres corridas sí experimentaron, pero el recall no subió frente a M3/M4 opus. Primero la guardia de pignolo bloqueó `node -e` (código inline que lanza procesos) y el modelo se rindió; con la indicación de escribir el experimento en un archivo, opus lo hizo. Las corridas de M5 con la preparación rota (sin permiso de escritura) quedaron fuera de la tabla, y también una de opus que cortó el límite de uso de la cuenta.

## A/B de D-5-1: dos agentes o uno (2026-09-30)

Con el hook corregido (cuenta también los experimentos que fallan: un Bash con salida distinta de 0 dispara `PostToolUseFailure`, no `PostToolUse`), 2 corridas por método y modelo sobre el caso real, recall contado a mano:

| Método | Modelo | Recall | Hallazgos falsos | USD por corrida | Tiempo |
|---|---|---|---|---|---|
| M6: revisor y, en otro despacho, un agente que solo experimenta | opus | **46 %** (13/28) | 0 | 2,09 | ~8 min |
| M8: un solo agente que revisa, lista sus supuestos y experimenta | opus | 32 % (9/28) | 1 | 1,74 | ~5 min |
| M6 | sonnet | 18 % (5/28) | 2 | 0,47 | ~2 min |
| M8 | sonnet | 4 % (1/28) | 0 | 0,35 | ~1,5 min |

Separar los pasos rinde +14 puntos con opus por ~20 % más de costo; con sonnet ningún diseño sirve. Gasto del A/B: 9,28 USD (total de la prueba: 37,78 de 40).

## Validación del calificador (2026-09-30)

El calificador automático cuenta un hallazgo si nombra la tarea y una palabra clave. Contra el conteo a mano de las 19 corridas de M3–M5 del caso real: 6 corridas iguales, 13 con diferencias de 1 a 3 errores; 18 aciertos falsos y 11 omisiones. **Infla el recall** entre 0 y 7 puntos según el grupo, porque hay palabras clave demasiado genéricas (`private-reads` en casi todo hallazgo de las tasks 5 y 7; `cat` dentro de "catastrophic"; `Glob`, `pattern`, `weakened`), y **omitía** r13 (el test que espera "el mismo error que hoy") mientras las palabras clave estaban solo en castellano. El orden entre métodos no cambia. Las tablas del caso real usan el conteo a mano; los sintéticos (errores plantados con nombres únicos) no tienen este problema. En M6 y M7 (12 corridas, 124 hallazgos) la sobreestimación fue mayor: 79 aciertos automáticos contra 57 a mano (r10 y r01 por palabras genéricas, r04/r14/r12 por palabras sueltas). Arreglo pendiente del calificador: límites de palabra y palabras clave específicas; hasta entonces, el caso real se cuenta a mano.

## Qué dicen los datos

1. **Opus encuentra más que sonnet en un plan real** en todos los métodos, y cuesta 2 a 3 veces más por corrida. En planes chicos no hay diferencia de recall.
2. **Un revisor que solo lee se queda en ~33 % con opus y ~21 % con sonnet** (M3), y darle el script o permiso para experimentar en la misma pasada no lo mejora (M4, M5): sonnet no experimenta aunque pueda.
3. **Separar en dos pasos y obligar a verificar sí mejora** (M6, M7). El revisor lista aparte los supuestos que solo se verifican ejecutando, y otro paso los verifica:
   - con experimentos forzados por un hook (M6): opus 38 % y sonnet 29 %, con sonnet haciendo ~7 experimentos por corrida porque el hook no lo deja terminar sin ellos; encontró errores que ninguna lectura había visto (r03, `npm` sin shell en Windows);
   - con sondas fijas (M7): opus 45 % y sonnet 24 %, al menor costo con IA. Parte de esa ventaja es trampa a favor: las sondas salen de errores conocidos, algunos de este caso (6 aciertos, todos r12, vinieron solo de sondas). Sin esos, M7 opus queda en ~38 %, igual que M6 opus.
4. **Los experimentos también pueden equivocarse**: M6 sonnet dio 2 hallazgos falsos por experimentos mal armados (concluyó que `child.kill()` no deja vivo al nieto, lo contrario de lo que mide la sonda). Opus: 0.
5. **El replay no mide lo que cuesta en un hito real** con planes de juguete. Lo medido esta sesión con planes reales: escribir el plan 4b con replay costó ~459 mil tokens y 45 min; el de pignolo-ui hito 3, ~405 mil tokens y 78 min. M6 opus: ~1,45 USD y ~4,6 min por plan.

## Recomendación

Para el `plan-auditor` (hito 5) y para nuestro propio método, con opus:

1. **Paso 1, revisor opus de solo lectura** que entrega hallazgos y, aparte, la lista estructurada de supuestos que solo se verifican ejecutando.
2. **Paso 2a, sondas fijas** (gratis, deterministas) para los riesgos ya conocidos: `npm` sin shell, árbol de procesos, `spawnSync` y señales, `git apply --numstat`, pids. La lista crece con cada error nuevo que aparezca.
3. **Paso 2b, experimentos forzados** para los supuestos que ninguna sonda cubre: un agente cuya única tarea es verificarlos, con un hook `Stop` que no lo deja terminar sin un experimento por supuesto (el mecanismo del `handback-gate`).
4. `plan-check` solo con planes en tarjetas. **Sin replay.** Sonnet no alcanza para auditar planes: se queda en 21–29 %.

Costo esperado de la combinación: ~1,5–2,5 USD y ~5 minutos por plan, contra ~450 mil tokens y 45–80 min del replay. No se midió la combinación 2a + 2b junta: se mide cuando exista en el `plan-auditor`, sobre un plan real nuevo (no este caso, que ya sirvió para armar las sondas).

Gasto total de la prueba: **28,50 USD** de 40 (tope ampliado por el autor para M6 y M7): 13,59 de la primera tanda, 4,95 de M5, 0,07 de la verificación del hook y 9,89 de M6 y M7.
