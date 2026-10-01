# Resultados de las evals del hito 8b (debugger)

Estado: **etapas sonda, calibración y completa corridas el 2026-10-01 en WSL2; la completa NO pasa el umbral con los graders tal como están (3 de 5 por caso), y las 6 corridas reprobadas son falsos rechazos de los graders, no fallos del agente.** Gasto: **2,766 USD** de un tope de 8 (D-8-4). Sin transcripciones completas; los fixtures son sintéticos. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos. Claude Code 2.1.285, pignolo 0.11.1 (rama `core/hito-8b`), `debugger` en opus con esfuerzo alto.

Diseño: `tests/evals/debugger-cases.js` (casos y graders), `tests/eval-debugger-cases.test.js` (20 subtests deterministas, sin tokens). Casos generados con `node tests/evals/debugger-cases.js --out tests/evals/generated/debugger`. Umbral (spec §0 d): al menos 4 de 5 corridas por caso.

## Casos

| Caso | Defecto plantado | Qué mide |
|---|---|---|
| debugger-off-by-one | `<=` por `<` en `src/range.js:6`; la tarjeta no sugiere área | recall |
| debugger-wrong-suspect | la tarjeta acusa a `src/cache.js`; la causa real está en `src/parse.js:7` (`replace(',', '')` quita solo la primera coma) | recall, y que descarte la sospecha con evidencia |
| debugger-not-reproducible | la tarjeta describe un fallo de reloj que no existe (la función es pura y el test pasa) | falso positivo: afirmar causa donde no hay |

## Etapas

Script `h8-eval.sh` (`PATH` mínimo `$HOME/.local/node/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin`, trazas copiadas fuera de `/tmp` apenas termina cada etapa, `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash …`). Flags comunes: `--eval-dir tests/evals/generated/debugger --ablation none --scaffold --trust-plugin --allow-tools Bash Edit Write --keep-temp --no-publish --max-cost-usd <tope> --json …`.

| Etapa | Selección | Costo (USD) | Resultado |
|---|---|---|---|
| Sonda | `--case debugger-off-by-one --runs 1`, tope 0,6 | 0,161 | 1/1, todos los graders; 7 eventos SUB en la traza (freno i) |
| Calibración | `--tag debugger --runs 1 -j 2`, tope 1,5 | 0,433 | 3/3; `git diff --quiet` sobre `debugger-cases.js` sale 0 (freno ii); 5 × 0,433 = 2,17 ≤ 6 (freno iv) |
| Completa | `--tag debugger --runs 5 -j 2`, tope 6 | 2,172 | **9/15 por los graders** (3/5 por caso); no se alcanzó ningún tope |

| Agente | Caso | Aciertos / corridas (graders) | USD por corrida | Segundos por corrida | Umbral 4/5 |
|---|---|---|---|---|---|
| debugger | debugger-off-by-one | 3/5 | 0,138 | 31 | no pasa (por los graders) |
| debugger | debugger-wrong-suspect | 3/5 | 0,135 | 35 | no pasa (por los graders) |
| debugger | debugger-not-reproducible | 3/5 | 0,161 | 50 | no pasa (por los graders) |

El costo real por corrida (0,14 a 0,16 USD) quedó a la mitad de lo estimado en el plan (0,30 USD, hipótesis sin medir).

## Por qué reprobaron las 6 corridas: leídas a mano, el agente acertó en las 6

Cada informe reprobado se leyó entero en su traza. En todos el `debugger` hizo bien el trabajo (reprodujo, citó la salida del test, no modificó nada, cerró con la palabra final correcta); lo que falló es la redacción que el grader esperaba. Es el gap G10 (graders que rechazan trabajo correcto) y no se corrigió durante la corrida (freno: nunca se edita un grader a mitad de etapa).

| Corridas | Grader que falló | Qué dijo el agente | Defecto del grader |
|---|---|---|---|
| off-by-one × 2 | `no-offer` | "The comment at line 2 says `range` **should include** `start`…" | El patrón `should I` con la bandera `i` casa "should **I**nclude": la oferta de seguir era una falsa alarma. El test determinista no tenía una muestra con "should include". |
| wrong-suspect × 1 | `cause-in-parse` | "**Root cause:** line 7 of `/tmp/…/src/parse.js`" | La causa estaba bien (archivo y línea 7), pero en la forma "line N of <ruta>", que el grader no reconoce (solo `ruta:N`, `ruta line N`, `ruta#LN`). |
| wrong-suspect × 1 | `rules-out-suspect` | "The test fails because of a bug in `src/parse.js`, **not in `src/cache.js`**… **Your cache suspicion, ruled out**" | El descarte estaba, pero con "not in" (no está en la lista de negaciones) y con "cache suspicion" sin el nombre del archivo pegado. |
| not-reproducible × 2 | `no-unmarked-cause` | "…**no root cause** to report" / "I found **no root cause**… There is **no confirmed cause**" | Ninguna causa afirmada; el grader busca la marca (`none`, `not verified`…) **después** de la palabra "cause" y acá la negación va **antes**. |

Los tres tipos de defecto son del grader (G10: rechaza lo correcto), ninguno acepta lo incorrecto. Los nueve aprobados no se leyeron uno por uno (pasaron todos los graders). Por lo leído, el agente acertó en las 6 reprobadas y no hay ninguna corrida donde un grader aceptara algo incorrecto, pero **esto no es una medición**: la cifra válida es la de los graders (9/15) hasta que se arreglen y se recalibre.

## Frenos

| Freno | Estado |
|---|---|
| i. Sonda con al menos un evento SUB | cumplido (7) |
| ii. Graders sin cambios desde la calibración (`git diff --quiet`) | cumplido |
| iii. Calibración con exactamente los casos de la etapa y todos aprobados | cumplido (3/3) |
| iv. 5 × calibración ≤ tope de la completa | cumplido (2,17 ≤ 6) |
| v. Tope de costo por corrida (`--max-cost-usd`) | no se alcanzó |

El umbral del criterio (d) no se da por cumplido: con los graders actuales cada caso queda en 3/5.

## Qué sigue (decide el autor: cambia el calificador, y la repetición cuesta)

Arreglos propuestos, **no aplicados**, cada uno con su muestra en `tests/eval-debugger-cases.test.js` (rojo antes, verde después, como en el hito 5 con `verdict-not-escalate`):

1. `no-offer`: sin la bandera `i` en `should I` / `shall I` (o con `[Ss]hould I\b` y `[Ss]hall I\b`: casan "Should I fix it?" y no "should include").
2. `cause-in-parse` y `cause-at-line`: aceptar también "line N of <ruta>" y "line N in <ruta>".
3. `rules-out-suspect`: aceptar "not in <ruta>", "not the culprit" y un descarte que nombre al sospechoso sin la extensión (`cache`), siempre exigiendo la negación cerca.
4. `no-unmarked-cause`: aceptar la negación **antes** de "cause" (`no root cause`, `no confirmed cause`, `not found`).

Costo de repetir: calibración 0,43 USD y completa ≈ 2,2 USD; con lo gastado quedan 5,23 USD de los 8 (alcanza para una calibración, una completa y una margen). Un grader relajado hay que probarlo además con muestras que **deben seguir reprobando** (G11), como ya hace el test.
