# Resultados: prueba de metodologías de validación de planes

Fecha: 2026-09-30. Claude Code 2.1.285, Windows nativo, `claude -p` sin pignolo cargado (`--setting-sources project,local`). Plan de la prueba: `docs/plans/2026-09-30-bench-validacion-de-planes.md`. Investigación de base: `docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md`. Decisión del autor: prueba completa, tope 25 USD. **Gasto: 18,54 USD** (sonda 0,14; etapa 1 5,17; etapa 2 7,32; etapa 3 0,96; M5 4,95). Resultados buenos o malos, sin transcripciones. `tests/bench/plans/results/` no se versiona.

## Métodos

M1 script de referencias (sin IA) · M2 M1 + rojo de los tests del plan (sin IA) · M3 revisor de solo lectura · M4 capas (M2 y después un revisor que recibe su informe) · M5 capas + experimentos puntuales (el revisor puede correr Bash en una carpeta temporal, con la guardia de pignolo cargada) · M6 dos pasos con experimentos forzados (un revisor de solo lectura que recibe el informe de M2 y lista las afirmaciones que solo se verifican ejecutando; después un experimentador con Bash, la guardia de pignolo y un hook Stop real que no lo deja terminar mientras haya menos Bash que afirmaciones, como mucho 2 bloqueos) · M7 dos pasos con sondas fijas (el mismo paso A y después sondas deterministas de Windows y Node, sin IA, sobre las afirmaciones) · M0 replay: implementar el plan en una copia y reportar lo que no funcionó (el método viejo).

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
| Auditoría original (opus con Bash, muchos experimentos) | opus | 1 | 100 % por definición | ~190 mil tokens | ~6 min |

Ningún método encontró r03 (`npm`/`npx` sin shell en Windows), r05 (rojo sin verde previo), r11 (palabras clave sin límite: `process.exit` como `xit(`), r14 (`Grep.pattern` no es una ruta) ni r07 (debilitamientos del `test-writer` dentro del `testRef`); r08 lo encontró una sola corrida (M5 opus).

**M5 (experimentos puntuales).** Con sonnet, en ninguna corrida ejecutó un experimento aunque tenía Bash, permiso de escritura y la indicación explícita ("no corrí experimentos": razona desde el código). Con opus, dos de las tres corridas sí experimentaron, pero el recall no subió frente a M3/M4 opus. Primero la guardia de pignolo bloqueó `node -e` (código inline que lanza procesos) y el modelo se rindió; con la indicación de escribir el experimento en un archivo, opus lo hizo. Las corridas de M5 con la preparación rota (sin permiso de escritura) quedaron fuera de la tabla, y también una de opus que cortó el límite de uso de la cuenta.

## Validación del calificador (2026-09-30)

El calificador automático cuenta un hallazgo si nombra la tarea y una palabra clave. Contra el conteo a mano de las 19 corridas del caso real: 6 corridas iguales, 13 con diferencias de 1 a 3 errores; 18 aciertos falsos y 11 omisiones. **Infla el recall** entre 0 y 7 puntos según el grupo, porque hay palabras clave demasiado genéricas (`private-reads` en casi todo hallazgo de las tasks 5 y 7; `cat` dentro de "catastrophic"; `Glob`, `pattern`, `weakened`), y **omitía** r13 (el test que espera "el mismo error que hoy") mientras las palabras clave estaban solo en castellano. El orden entre métodos no cambia. Las tablas del caso real usan el conteo a mano; los sintéticos (errores plantados con nombres únicos) no tienen este problema. Arreglo pendiente del calificador: límites de palabra y palabras clave específicas.

## Qué dicen los datos

1. **Opus encuentra 1,5 a 3 veces más que sonnet en un plan real** (29–33 % contra 10–21 %) y cuesta 2 a 3 veces más por corrida (~1 USD contra ~0,3–0,45). En planes chicos no hay diferencia de recall.
2. **Con opus, M3, M4 y M5 dan lo mismo** (29–33 %). El script no ayuda al revisor en este plan y a sonnet lo perjudica (21 % → 10 %), porque le mete 20 falsas alarmas: el plan nombra lo que él mismo va a crear.
3. **Los experimentos puntuales, en una sola pasada acotada, no reprodujeron lo que encontró la auditoría original.** Los errores que solo se ven ejecutando (r03, r05, r11) no los encontró nadie. La auditoría que los encontró trabajó ~6 minutos con muchos experimentos dirigidos; M5 opus, ~2,4 minutos con uno o dos.
4. **El replay no mide lo que cuesta en un hito real** con planes de juguete (0,09–0,23 USD). Lo medido esta sesión con planes reales: escribir el plan 4b con replay costó ~459 mil tokens y 45 min; el de pignolo-ui hito 3, ~405 mil tokens y 78 min.

## Recomendación

Para el `plan-auditor` (hito 5) y para nuestro método:

1. **Revisor opus de solo lectura** (M3): el mejor recall por dólar entre lo medido (~33 % a ~1,1 USD, 2–3 min). Sonnet no alcanza para revisar planes reales.
2. **El script** (`plan-check`) solo cuando el plan declara qué crea y qué modifica (formato de tarjetas); si no, no se le pasa al revisor. Arreglo pendiente: ignorar lo marcado como `Create`.
3. **Experimentos**: no como paso automático de una pasada. Donde el plan toca plataforma, procesos, git o herramientas externas (los errores que nadie encontró leyendo), una auditoría con tiempo para experimentar, como la original, solo en hitos de riesgo (ya lo dice CLAUDE.md).
4. **Sin replay completo.**

Gasto total de la prueba: **18,54 USD** de 25 (13,59 de la primera tanda y 4,95 de M5, incluidas las sondas y una corrida de opus cortada por el límite de uso).
