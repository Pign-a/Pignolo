# Resultados de las evals del hito 3 (agentes de revisión)

Estado: **completa en Windows, 2026-09-30.** Tras ajustar los agentes (0.4.2), la recalibración dio 12/12, la completa en opus 60/60 corridas (12/12 casos ≥ 4/5) y la rama sonnet 58/60 (11/12: `review-risk-clean` 3/5 por omitir el bloque ```json, con la conclusión correcta). `refuter` y `fixer` siguen sin medir (WSL2 sin preparar). Gasto total: 11,49 USD de 54 (sondas y calibraciones 2,65; completa opus 5,35; sonnet 3,49), más lo que haya consumido la completa en opus que se interrumpió, que no dejó informe. Sin transcripciones completas (a lo sumo la línea del grader que falló, recortada) y sin datos de proyectos donde se usa pignolo: los fixtures son sintéticos. `results/` y `generated/` no se versionan.

Diseño y definiciones: spec §15 (`agents`). Recall: el subagente reporta la ubicación plantada como `archivo:N` (±3 líneas; un rango `archivo:A-B` no cuenta: el contrato de los agentes es `path:line`) con severidad BLOCKER o CRITICAL (en `readability`, WARNING o más). Falso positivo: BLOCKER o CRITICAL en un diff limpio. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso.

## Etapas

Orden fijo (decisión D-3b, tope total 54 USD): sonda, calibración, completa en opus, rama sonnet. Si un tope o un freno corta una corrida, se anota acá qué freno fue.

Freno iii (la calibración no falla en ningún caso) se cumple solo si `calib-win.json` trae **exactamente 12 casos** (8 de lentes y 4 de jueces) y `calib-wsl2.json` **exactamente 2** (`refuter` y `fixer`), y todos aprobados. Un archivo con menos casos (una etiqueta que no los juntó, WSL2 ausente, una corrida cortada por el tope) no cumple el freno aunque lo que haya esté aprobado.

| Etapa | Comando | Fecha | Claude Code | Modelo de la sesión principal | Modelo del revisor | Costo total (USD) | Corte |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sonda | `claude plugin eval . --eval-dir tests/evals/generated/opus --case review-reliability-defect --runs 1 --ablation none --scaffold --trust-plugin --max-cost-usd 1 --json tests/evals/generated/probe.json` | 2026-09-30 | 2.1.285 | sonnet (del `prompt.md`; `modelUsage` no se pudo leer: trace borrado) | opus (pedido en el `Agent`; no verificado en el trace) | 0,097 | **Freno i**: no se pudo demostrar ≥ 1 evento SUB |
| Sonda 2 (decisión del autor: repetir con `--keep-temp`) | el mismo de la sonda más `--keep-temp`, con `--json tests/evals/generated/probe2.json` | 2026-09-30 | 2.1.285 | sonnet (`claude-sonnet-5-5` en `modelUsage`) | opus (`claude-opus-5-5` en `modelUsage`) | 0,075 | freno i se cumple (2 eventos SUB). **Grader mal escrito** (freno ii): se frena antes de la calibración |
| Sonda 3 (graders 0.4.1, HEAD `7d03b22`) | el de la sonda 2, con `--json tests/evals/generated/probe3.json` | 2026-09-30 | 2.1.285 | sonnet (`claude-sonnet-5-5`, 0,0425 USD) | opus (`claude-opus-5-5`, 0,0522 USD) | 0,095 | ninguno: freno i se cumple (2 SUB) y los 5 graders aprueban sobre un informe correcto |
| Calibración (Windows) | `claude plugin eval . --eval-dir tests/evals/generated/opus --tag review --tag judges --runs 1 --ablation none --scaffold --trust-plugin --keep-temp --max-cost-usd 4 -j 2 --json tests/evals/generated/calib-win.json` | 2026-09-30 | 2.1.285 | sonnet | opus | 1,164 (197 s) | **Freno iii**: 12 casos, 9 aprobados, 3 fallados. Se frena |
| Recalibración (Windows; agentes 0.4.2, HEAD `127a947`) | la misma de la calibración, con `--json tests/evals/generated/calib-win-2.json` | 2026-09-30 | 2.1.285 | — (no arrancó) | — | 0 (23 s) | **No válida:** los 12 casos salieron con `exit 1: You've hit your session limit` antes de despachar el agente (`Agent called 0x`). No mide nada de los agentes. Se frena y vuelve al autor |
| Recalibración 2 (Windows; agentes 0.4.2, HEAD `127a947`) | chequeo de 1 caso (`check-limit.json`, tope 0,5) y después la de la calibración con `--json tests/evals/generated/calib-win-3.json` | 2026-09-30 | 2.1.285 | revisor opus, sesión principal sonnet | **12/12** | 0,107 + 1,112 | **Pasa los frenos ii, iii y iv.** Los 3 casos limpios que fallaron con 0.4.1 ahora aprueban y los 6 defectos plantados se siguen encontrando |
| Completa en opus (Windows) | la del plan, tope 26 | 2026-09-30 | 2.1.285 | — | — | sin informe (cortada) | **Interrumpida por el autor** ("frenemos por hoy") antes de terminar; no dejó `full-opus-win.json`. Se retoma mañana desde cero |
| Calibración (WSL2) | no corrió | — | — | — | opus | 0 | fuera por decisión del autor: `refuter` y `fixer` quedan como "no medidos (WSL2 sin preparar)" |
| Completa en opus (Windows; agentes 0.4.2, HEAD `e141f15`) | `claude plugin eval . --eval-dir tests/evals/generated/opus --tag review --tag judges --runs 5 --ablation none --scaffold --trust-plugin --keep-temp --max-cost-usd 26 -j 2 --json tests/evals/generated/full-opus-win.json` | 2026-09-30 | 2.1.285 | sonnet | opus | 5,346 (790 s) | ninguno: **60/60 corridas aprobadas**, 12/12 casos ≥ 4/5. Freno ii: `git diff --quiet 7d03b22 -- tests/evals/review-cases.js` sale 0 |
| Completa en opus (WSL2) | no corrió | — | — | — | opus | 0 | fuera (WSL2 sin preparar) |
| Rama sonnet (Windows; agentes 0.4.2, HEAD `e141f15`) | `node tests/evals/review-cases.js --out tests/evals/generated/sonnet --reviewer-model sonnet` y `claude plugin eval . --eval-dir tests/evals/generated/sonnet --tag review --tag judges --runs 5 --ablation none --scaffold --trust-plugin --keep-temp --max-cost-usd 15 -j 2 --json tests/evals/generated/full-sonnet-win.json` | 2026-09-30 | 2.1.285 | sonnet | sonnet | 3,492 (499 s) | ninguno: 58/60 corridas, 11/12 casos ≥ 4/5. `review-risk-clean` 3/5 (falla de formato del agente, ver abajo) |
| Rama sonnet (WSL2, solo `refuter`) | no corrió | — | — | — | sonnet | 0 | fuera (WSL2 sin preparar) |

## Por caso

**Sonda 3** (`review-reliability-defect`, 1 corrida): aprobada. El informe trae `src/pages.js:7` con BLOCKER, y `finds-planted-defect`, `subagent-returned`, `single-dispatch`, `dispatched` y `model` aprueban. Las sondas 1 y 2, con los graders viejos, dieron 0/1 cada una (grader mal escrito).

**Calibración en Windows** (1 corrida por caso, revisor opus, sesión principal sonnet):

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | 1/1 | — | 0,080 | 0,080 | sin veredicto (calibración, 1 corrida) |
| review-reliability | review-reliability-clean | 1/1 | — | 0,092 | 0,092 | sin veredicto |
| review-resilience | review-resilience-defect | 1/1 | — | 0,106 | 0,106 | sin veredicto |
| review-resilience | review-resilience-clean | **0/1** | `no-blocking-finding`, `verdict-approve` | 0,152 | 0,152 | sin veredicto |
| review-risk | review-risk-defect | 1/1 | — | 0,092 | 0,092 | sin veredicto |
| review-risk | review-risk-clean | 1/1 | — | 0,097 | 0,097 | sin veredicto |
| review-readability | review-readability-defect | 1/1 | — | 0,084 | 0,084 | sin veredicto |
| review-readability | review-readability-clean | **0/1** | `no-blocking-finding`, `verdict-approve` | 0,118 | 0,118 | sin veredicto |
| judge-a | judge-a-defect | 1/1 | — | 0,082 | 0,082 | sin veredicto |
| judge-a | judge-a-clean | **0/1** | `verdict-approve` | 0,094 | 0,094 | sin veredicto |
| judge-b | judge-b-defect | 1/1 | — | 0,075 | 0,075 | sin veredicto |
| judge-b | judge-b-clean | 1/1 | — | 0,093 | 0,093 | sin veredicto |
| refuter | refuter-false-finding | no medido (WSL2 sin preparar) | — | — | — | — |
| fixer | fixer-confirmed-finding | no medido (WSL2 sin preparar) | — | — | — | — |

Los 4 casos con defecto plantado y los 2 jueces con defecto aprobaron. Los 3 fallos son todos en diffs limpios. Qué dijo el agente en cada uno (leído en su trace, recortado):

- **review-readability-clean:** marca CRITICAL en `src/token.js:4`: "a token without a valid expiresAt is reported as NOT expired". Es un defecto **anterior al diff**, y el propio agente lo dice ("R1 is older than this diff … I am still blocking on it"). Termina en REQUEST_CHANGES. Es un falso positivo por la definición de §15, y el grader lo califica bien: **falla del agente**, que bloquea por algo que el diff no toca.
- **review-resilience-clean:** marca CRITICAL en `src/store.js:9`: "No fsync is called on the temp file before the rename". Como la tarjeta pide "writes rows atomically", la observación es defendible sobre durabilidad ante un corte de luz. Termina en REQUEST_CHANGES. El grader aplica bien la definición; lo que se discute es **el fixture**, que da por limpio un diff que el revisor puede leer, con razón, como incompleto frente a la tarjeta. Es decisión del autor si el caso se reescribe o si el revisor debe bajar ese hallazgo a WARNING.
- **judge-a-clean:** no hay BLOCKER ni CRITICAL (`no-blocking-finding` aprueba) y el veredicto es APPROVE, pero después agrega una línea más ("File reviewed: …"). El contrato del agente dice "End with one word on its own line", así que el grader reprueba con razón: **falla de formato del agente**.

Ningún grader quedó mal escrito en la calibración: en los 12 casos, lo que aprobó y lo que reprobó coincide con lo que el agente dijo.

**Completa en opus, Windows** (5 corridas por caso, revisor opus, sesión principal sonnet, agentes 0.4.2):

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | 5/5 | — | 0,401 | 0,080 | pasa |
| review-reliability | review-reliability-clean | 5/5 | — | 0,444 | 0,089 | pasa |
| review-resilience | review-resilience-defect | 5/5 | — | 0,524 | 0,105 | pasa |
| review-resilience | review-resilience-clean | 5/5 | — | 0,578 | 0,116 | pasa |
| review-risk | review-risk-defect | 5/5 | — | 0,436 | 0,087 | pasa |
| review-risk | review-risk-clean | 5/5 | — | 0,454 | 0,091 | pasa |
| review-readability | review-readability-defect | 5/5 | — | 0,432 | 0,086 | pasa |
| review-readability | review-readability-clean | 5/5 | — | 0,437 | 0,087 | pasa |
| judge-a | judge-a-defect | 5/5 | — | 0,388 | 0,078 | pasa |
| judge-a | judge-a-clean | 5/5 | — | 0,452 | 0,090 | pasa |
| judge-b | judge-b-defect | 5/5 | — | 0,387 | 0,077 | pasa |
| judge-b | judge-b-clean | 5/5 | — | 0,412 | 0,082 | pasa |
| refuter | refuter-false-finding | no medido (WSL2 sin preparar) | — | — | — | — |
| fixer | fixer-confirmed-finding | no medido (WSL2 sin preparar) | — | — | — | — |

Ninguna corrida terminó con error. Los 60 directorios temporales (`--keep-temp`) se borraron tras leer el informe.

**Rama sonnet, Windows** (5 corridas por caso, revisor **sonnet**, sesión principal sonnet, agentes 0.4.2):

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | 5/5 | — | 0,283 | 0,057 | pasa |
| review-reliability | review-reliability-clean | 5/5 | — | 0,300 | 0,060 | pasa |
| review-resilience | review-resilience-defect | 5/5 | — | 0,303 | 0,061 | pasa |
| review-resilience | review-resilience-clean | 5/5 | — | 0,340 | 0,068 | pasa |
| review-risk | review-risk-defect | 5/5 | — | 0,278 | 0,056 | pasa |
| review-risk | review-risk-clean | **3/5** | `subagent-returned` y `no-blocking-finding` (2 corridas) | 0,321 | 0,064 | **no pasa** |
| review-readability | review-readability-defect | 5/5 | — | 0,287 | 0,057 | pasa |
| review-readability | review-readability-clean | 5/5 | — | 0,280 | 0,056 | pasa |
| judge-a | judge-a-defect | 5/5 | — | 0,262 | 0,052 | pasa |
| judge-a | judge-a-clean | 5/5 | — | 0,294 | 0,059 | pasa |
| judge-b | judge-b-defect | 5/5 | — | 0,260 | 0,052 | pasa |
| judge-b | judge-b-clean | 5/5 | — | 0,285 | 0,057 | pasa |

**Qué pasó en `review-risk-clean`** (leído en el `tool_result` de las 2 corridas falladas): el revisor sonnet llegó a la conclusión correcta ("No findings. The change is a pure refactor…", cierra con `APPROVE`), pero **no escribió el bloque ```json**. Su contrato (`agents/review-risk.md:28`) pide el bloque también sin hallazgos (`[]`), porque pignolo lo copia al ledger. Sin él, `subagent-returned` reprueba con razón, y `no-blocking-finding` también, porque exige el bloque (un informe sin bloque no se puede leer). **Falla de formato del agente, no del grader**: el fondo (sin falsos positivos) es correcto en las 5 corridas.

**Comparación opus/sonnet (Windows, 10 casos de lentes y 2 de jueces, 5 corridas cada uno):** recall de los defectos plantados 30/30 en los dos; falsos positivos (BLOCKER o CRITICAL en un diff limpio) 0/30 en los dos; formato 60/60 en opus y 58/60 en sonnet. Costo por corrida: opus 0,077–0,116 USD, sonnet 0,052–0,068 USD (alrededor de un 35 % menos). Con esto, sonnet supera el 80 % de recall que puso el autor como condición para que `economy` pueda pasar los revisores a sonnet (§7), pero **eso lo decide el autor**, y el caso `review-risk-clean` no llega al umbral 4/5 por formato. Son fixtures chicos y sintéticos: no miden diffs grandes.

Los 60 directorios temporales se borraron tras leer el informe.

## Frenos

**Primera sonda.** Freno i: no se pudo demostrar. El runner borró el trace al terminar, y ni `results/` ni el `report.html` lo guardan. Decisión del autor (2026-09-30): repetir la sonda con `--keep-temp`, dejar fuera los casos de WSL2 y ajustar los frenos. Los frenos ajustados son estos: (i) la sonda 2 da ≥ 1 SUB; (ii) igual que antes; (iii) exactamente 12 casos en `calib-win.json`, todos aprobados; (iv) sonda + sonda 2 + calibración de Windows ≤ 5,8 USD.

**Sonda 2** (con `--keep-temp`, que sí conserva `out/trace.jsonl`):

- **(i) Se cumple: 2 eventos SUB.** Son los dos `tool_use` del revisor opus (Read y Grep).
- **(ii) Se encontró un grader mal escrito, así que se frena.** `review-cases.js` no se tocó (`git diff --quiet 41d2b5d` sale 0). Pero el trace real muestra que **el informe final del subagente nunca sale como evento `assistant` con `parent_tool_use_id` no nulo**. Aparece solo en un evento `system` (`task_notification`) y en el `tool_result` del `user` de la sesión principal (`parent_tool_use_id: null`). Los eventos SUB traen solo los `tool_use` del subagente. Por eso todo grader `trace` que busca **texto** del subagente detrás del prefijo SUB no puede aprobar nunca, y los de `not_contains` aprueban siempre. Son `finds-planted-defect`, `verdict-*`, `no-blocking-finding`, `refutes-false-claim`, `keeps-true-claim` y `done`. Los que miran `tool_use` del subagente (`subagent-edited-source` y `subagent-ran-tests`) sí son viables. En la sonda 2 el revisor devolvió el hallazgo plantado correcto: `"location": "src/pages.js:7"` con `"severity": "BLOCKER"` (línea recortada del `tool_result`), y el grader lo dio como fallado. El test determinista de los graders pasaba porque su trace sintético ponía el texto en un `assistant` con parent, y los traces reales de 2.1.285 no tienen esa forma.
- **(iii) No corrió.** La calibración quedó frenada.
- **(iv) Se cumple:** 0,172 USD.

**Sonda 3 y calibración** (graders 0.4.1; nuevo punto de partida del freno ii: HEAD `7d03b229c86a430d3363541a60d652bfa573538d`):

- **(i) Se cumple:** la sonda 3 da 2 eventos SUB.
- **(ii) Se cumple:** `git diff --quiet 7d03b22 -- tests/evals/review-cases.js` sale 0, y ningún grader dio un resultado distinto de lo que el agente dijo.
- **(iii) Falla:** `calib-win.json` trae exactamente 12 casos, pero aprobaron 9. Los que fallaron son `review-readability-clean`, `review-resilience-clean` y `judge-a-clean`.
- **(iv) Se cumple:** sonda 0,097 + sonda 2 0,075 + sonda 3 0,095 + calibración 1,164 = **1,430 USD** (≤ 5,8).

No corrieron la completa en opus ni la rama sonnet.

**Costo del subagente.** En la sonda 2, `modelUsage` trae `claude-sonnet-5-5` (0,0426 USD: 398 de salida, 8 782 de escritura de caché, 17 570 de lectura) y `claude-opus-5-5` (0,0319 USD: 1 181 de salida con 181 de razonamiento, 1 336 de escritura, 8 154 de lectura). La suma, 0,0746, es igual al `costUsd` de `probe2.json` (0,0745768). O sea que el costo del subagente **sí entra** en `costUsd`. El revisor opus costó mucho menos que lo estimado (0,21) porque el caso es chico: 2 herramientas y 1,2 k tokens de salida.

## Notas

- **Recalibración con los agentes 0.4.2** (decisión del autor: "mejorar agentes y recalibrar"; nuevo punto de partida del freno ii: HEAD `127a94739b5d888c7e5fe3ddfa0cad261bd61401`, con `review-cases.js` sin cambios desde `7d03b22`). No corrió de verdad: la cuenta llegó al límite de sesión, y los 12 casos terminaron en 0 USD sin despachar el subagente. En lo formal, el freno iii falla (0/12), pero el 0/12 **no es una medición de los agentes**. Por la regla "nunca repetir una corrida", repetirla después del reinicio del límite lo decide el autor.

- Costo total gastado: **1,430 USD** de un tope de 54 (sondas 0,097 + 0,075 + 0,095; calibración en Windows 1,164).
- Para retomar hace falta una decisión del autor, porque la corrida completa espera ante un freno. Las opciones son: seguir con los 3 fallos anotados (el freno es mecánico, no dice si el agente es malo), ajustar los agentes (alcance del diff en `review-readability`, palabra final en `judge-a`), o reescribir el fixture de `review-resilience-clean`.
- Para retomar hacen falta decisiones del autor, porque cambian un grader (freno ii). Hay que reescribir los graders de texto para que lean el informe final donde el trace lo pone: el `tool_result` del `Agent` en la sesión principal, o el `system` `task_notification`. Eso se hace en `review-cases.js` y en su test determinista, con un trace sintético que copie la forma real. Después, sonda y calibración de nuevo.
- **Corrección de los graders (0.4.1, sin evals pagas).** Cada grader de texto lee solo el `tool_result` que la sesión principal recibe por su `tool_use` de `Agent` con el `subagent_type` del caso: el patrón empieza en ese `tool_use` (`"type":"tool_use","id":"(…)","name":"Agent","input":{… "subagent_type":"pignolo:<agente>" …}`), sigue hasta `"tool_use_id":"\1","type":"tool_result","content":` (mismo id) y busca dentro de ese string. El runner 2.1.285 corre **una** RegExp sobre todo el trace (cada evento re-serializado, unidos por `\n`), no línea por línea: por eso la retro-referencia `\1` funciona. El veredicto (`verdict-*`, `done`) es la última línea del informe; el harness 2.1.285 sangra cada línea y agrega `agentId: …` al final, y el patrón acepta las dos formas. `no-blocking-finding` y `keeps-true-claim` pasan de `not_contains` a `contains` sobre un informe con su bloque ```json que no trae lo prohibido: reprueban si el subagente no devolvió un informe con su bloque ```json: sin `tool_result` del `Agent`, con un error de la herramienta, con el aviso de `run_in_background` o con un informe vacío. Todo caso suma `subagent-returned` (el bloque ```json; en el `fixer`, `DONE`, `BLOCKED` o `NEEDS_CONTEXT` como última línea) y `single-dispatch` (con dos despachos de `Agent` los graders aprobarían el mejor informe); el prompt pide `run_in_background false`. La palabra final tolera `**APPROVE**`, `` `DONE` `` y el prefijo `Final word:`, y reprueba si le sigue texto no vacío. **Supuesto:** se lee solo el primer bloque de texto del `tool_result` (comprobado en 2.1.285, donde el informe llega en un único bloque). `subagent-edited-source` y `subagent-ran-tests` siguen con SUB. El test determinista usa la sonda 2 recortada y sin rutas personales (`tests/fixtures/evals/probe2-review-reliability-defect.jsonl`): `finds-planted-defect` y `subagent-returned` aprueban sobre ese trace real, y los graders de `review-reliability-clean` lo reprueban. Freno i no cambia: los eventos SUB siguen contando para "el subagente trabajó". Siguiente: sonda de nuevo con los graders nuevos y, si pasa, calibración.
- `--keep-temp` deja `%TEMP%/claude-eval-<id>/` sin sellar (aviso del runner: puede tener archivos escritos por el agente). Quedan 14 (sonda 2, sonda 3 y los 12 de la calibración). No se borraron: la regla de borrado pide el OK directo del autor en la conversación, y el pedido llegó por el coordinador.

- **Recalibración 2 (0.4.2): 12/12.** Con los revisores corregidos (alcance: bloquear solo lo que el diff introduce; palabra final sola; resiliencia sin tratar endurecimientos como CRITICAL) pasan los 12 casos en una corrida. Gasto acumulado de la etapa de calibración: 2,65 USD (≤ 5,8). La corrida completa en opus arrancó y el autor la frenó antes de terminar; su costo parcial no quedó informado (tope de esa corrida: 26 USD).
