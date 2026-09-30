# Prueba de metodologías de validación de planes (sonnet y opus). Plan liviano

> Método liviano (CLAUDE.md): tarjetas, sonnet para implementar, el rojo de cada test al ejecutar, una revisión opus al final. Los pasos usan casillas (`- [ ]`).

**Objetivo:** medir, con datos, cuánto encuentra y cuánto cuesta cada forma de validar un plan contra el código, con sonnet y con opus, para elegir la del `plan-auditor` (hito 5) y la de nuestro propio método.

**Decisión del autor (2026-09-30):** prueba completa, tope 25 USD, antes del plan del hito 5. Investigación de base: `docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md`.

## Métodos

| Id | Método | IA | Modelos | Corridas por plan y modelo |
|---|---|---|---|---|
| M1 | Script de referencias (capas 1 + 2): rutas, símbolos y firmas que nombra el plan contra el repo; `node --check` de los bloques de código | no | — | 1 (determinista) |
| M2 | M1 + rojo de los tests del plan (capa 3): cada bloque de test del plan se corre contra el código actual y tiene que fallar | no | — | 1 |
| M3 | Solo revisor: un agente de solo lectura con el plan y el repo | sí | sonnet, opus | 3 |
| M4 | Capas: M2 y después un revisor que recibe el informe de M2 | sí | sonnet, opus | 3 |
| M0 | Replay: implementar el plan en una copia y reportar lo que no funcionó (el método viejo, como referencia) | sí | sonnet, opus | 1 |

## Casos

- **Real:** el plan 4a v1 (`git show 794b009:docs/plans/2026-09-30-hito-4-tests-sabotaje-holdout.md`) contra el código de ese commit. Verdad de base: los 14 hallazgos de la auditoría opus, resumidos en la tabla del final del plan corregido (`1046030`), cada uno con sus palabras clave de coincidencia.
- **Sintéticos:** un repo chico de prueba (Node, sin dependencias, ~8 archivos con tests) y 3 planes en formato de tarjetas con 6 errores plantados cada uno, uno por tipo: `missing-symbol` (función o archivo que no existe), `wrong-signature`, `test-cannot-fail`, `contradiction` (dos tareas se contradicen), `false-platform-assumption` (supuesto de Windows o shell falso), `broken-command`. Más 1 plan limpio (falsas alarmas).

## Métricas por corrida

`found` (errores plantados encontrados), `falsePositives` (hallazgos que no coinciden con ningún error plantado; en el plan limpio, todos), `costUsd`, `durationSeconds`, `tokens` (entrada, salida, caché), `model`. Por método y modelo: recall medio, falsas alarmas medias, costo medio, tiempo medio, y costo por error encontrado.

**Coincidencia (determinista):** cada error plantado tiene un `id`, la tarea del plan donde está y 1 a 3 palabras clave (el símbolo, la ruta, el comando). Un hallazgo coincide si nombra la tarea (o la línea del plan) y al menos una palabra clave. Los informes se piden en un bloque `json` fijo: `[{ "task": "T3", "kind": "...", "evidence": "...", "keywords": [...] }]`.

## Tareas

### Task B1: `scripts/plan-check.js` (M1 y M2; queda en pignolo para el `plan-auditor`)

**Files:** Create `plugins/pignolo/lib/plan-check.js`, `plugins/pignolo/scripts/plan-check.js`; Test `tests/plan-check.test.js`.

**Interfaces:** `checkPlan({ planText, root, runTests }) → { refs: [{ task, kind: 'path'|'symbol'|'command', value, ok, why }], blocks: [{ task, lang, ok, error }], tests: [{ task, file, red, exit }] | null }`. Tareas detectadas por los encabezados `### Task <id>`. Referencias: rutas entre backticks con `/` o extensión conocida (existen en `root`), símbolos `nombre(` entre backticks (grep de una definición `function nombre`, `nombre =`, `exports.nombre`, `def nombre` en `root`), firmas `nombre({ a, b })` (compara los nombres de parámetros con la definición, si es JS), comandos `node <archivo>` y `npm run <x>` (el archivo o el script existen). Bloques ```js```: `node --check` sobre un archivo temporal. Con `runTests: true`, cada bloque de código cuya primera línea es `// test: <ruta>` se escribe en una copia temporal (`git worktree add --detach`) y se corre con `node --test`; `red` = salió ≠ 0. CLI: `node scripts/plan-check.js --plan <archivo> [--root <dir>] [--run-tests]`, salida JSON, exit 0 sin problemas, 1 con problemas, 2 uso.
- [ ] Tests primero (tabla): ruta que existe / no existe; símbolo definido / inventado; firma con un parámetro renombrado; comando `node scripts/x.js` inexistente; bloque js con error de sintaxis; bloque de test que falla (red) y uno que pasa contra el código actual (no red); la copia temporal se borra.
- [ ] Rojo, implementar, verde. Commit `feat(plan-check): referencias, bloques y rojo de los tests de un plan`.

### Task B2: casos de la prueba y calificador

**Files:** Create `tests/bench/plans/fixture/` (repo de prueba), `tests/bench/plans/cases/{p1,p2,p3,clean}.md`, `tests/bench/plans/truth.json` (errores plantados de p1–p3 y los 14 del caso real con sus palabras clave), `tests/bench/plans/grade.js` (`grade({ findings, truth, plan }) → { found, missed, falsePositives }`); Test `tests/bench-grade.test.js`.
- [ ] Tests primero del calificador: un informe que nombra tarea y palabra clave cuenta; solo la palabra clave en otra tarea no cuenta; un hallazgo sin coincidencia es falsa alarma; en `clean` todo hallazgo es falsa alarma; `json` mal formado → 0 encontrados y error registrado.
- [ ] Los planes sintéticos se escriben con los 6 tipos de error; M1/M2 corridos sobre ellos tienen que encontrar al menos los `missing-symbol`, `wrong-signature` y `broken-command` (si no, el script o el caso está mal).
- [ ] Commit `test(bench): casos y calificador de la prueba de validación de planes`.

### Task B3: runner

**Files:** Create `tests/bench/plans/run.js`, `tests/bench/plans/prompts/{reviewer,layered,replay}.md`.
- Corre cada método con `claude -p --model <sonnet|opus> --output-format json --max-budget-usd <tope por corrida>` en una copia temporal del repo del caso (el fixture, o `git worktree add --detach 794b009` para el real), con herramientas de solo lectura para M3/M4 (`--allowedTools Read Grep Glob`) y con edición y Bash para M0. Sin pignolo cargado: se mide el método, no el plugin (verificar si `--bare` sirve con el login de claude.ai; si no, correr sin `--bare` desde una carpeta sin CLAUDE.md). Lee `total_cost_usd`, `duration_ms` y `usage` del JSON; extrae el bloque `json` del resultado y lo califica con `grade.js`.
- Tope global: corta antes de pasar 25 USD acumulados y lo informa. `--dry-run` imprime la matriz y el costo estimado sin llamar a nadie.
- Salida: `tests/bench/plans/results/<fecha>.json` (no versionado) y una tabla en `tests/evals/RESULTS-planes.md`.
- [ ] Test sin costo: el runner con un `claude` falso (un script que devuelve un JSON grabado) arma la matriz, suma costos, respeta el tope y escribe la tabla.
- [ ] Commit `feat(bench): runner de la prueba de validación de planes`.

### Task B4: corrida y resultados (la hace el hilo principal, con costo)

- [ ] `--dry-run`; sonda (1 corrida de M3 sonnet sobre p1); si el calificador y el costo cierran, la matriz completa con tope 25 USD.
- [ ] `tests/evals/RESULTS-planes.md` y sección breve en el README ("Validación de planes"): por método y modelo, recall, falsas alarmas, costo, tiempo y costo por error encontrado; qué método se elige para el `plan-auditor` y por qué. Resultados buenos o malos, sin transcripciones.

## Límites declarados

Un solo caso real y tres sintéticos; la coincidencia por palabras clave puede perder un hallazgo bien escrito con otras palabras (se revisan a mano los no coincidentes de la sonda antes de la matriz). El replay (M0) se corre una sola vez por plan y modelo por su costo.
