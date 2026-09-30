# Resultados de las evals del hito 3 (agentes de revisión)

Estado: **cortada después de la segunda sonda, 2026-09-30.** Se encontró un grader mal escrito (freno ii) y no se corrió la calibración. Corrieron solo dos sondas: 0,172 USD de 54. Las cifras se completan a medida que corre cada etapa, buenas o malas. Sin transcripciones completas (a lo sumo la línea del grader que falló, recortada) y sin datos de proyectos donde se usa pignolo: los fixtures son sintéticos. `results/` y `generated/` no se versionan.

Diseño y definiciones: spec §15 (`agents`). Recall: el subagente reporta la ubicación plantada como `archivo:N` (±3 líneas; un rango `archivo:A-B` no cuenta: el contrato de los agentes es `path:line`) con severidad BLOCKER o CRITICAL (en `readability`, WARNING o más). Falso positivo: BLOCKER o CRITICAL en un diff limpio. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso.

## Etapas

Orden fijo (decisión D-3b, tope total 54 USD): sonda, calibración, completa en opus, rama sonnet. Si un tope o un freno corta una corrida, se anota acá qué freno fue.

Freno iii (la calibración no falla en ningún caso) se cumple solo si `calib-win.json` trae **exactamente 12 casos** (8 de lentes y 4 de jueces) y `calib-wsl2.json` **exactamente 2** (`refuter` y `fixer`), y todos aprobados. Un archivo con menos casos (una etiqueta que no los juntó, WSL2 ausente, una corrida cortada por el tope) no cumple el freno aunque lo que haya esté aprobado.

| Etapa | Comando | Fecha | Claude Code | Modelo de la sesión principal | Modelo del revisor | Costo total (USD) | Corte |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sonda | `claude plugin eval . --eval-dir tests/evals/generated/opus --case review-reliability-defect --runs 1 --ablation none --scaffold --trust-plugin --max-cost-usd 1 --json tests/evals/generated/probe.json` | 2026-09-30 | 2.1.285 | sonnet (del `prompt.md`; `modelUsage` no se pudo leer: trace borrado) | opus (pedido en el `Agent`; no verificado en el trace) | 0,097 | **Freno i**: no se pudo demostrar ≥ 1 evento SUB |
| Sonda 2 (decisión del autor: repetir con `--keep-temp`) | el mismo de la sonda más `--keep-temp`, con `--json tests/evals/generated/probe2.json` | 2026-09-30 | 2.1.285 | sonnet (`claude-sonnet-5-5` en `modelUsage`) | opus (`claude-opus-5-5` en `modelUsage`) | 0,075 | freno i se cumple (2 eventos SUB). **Grader mal escrito** (freno ii): se frena antes de la calibración |
| Calibración (Windows) | no corrió | — | — | — | opus | 0 | frenada por el grader mal escrito |
| Calibración (WSL2) | no corrió | — | — | — | opus | 0 | fuera por decisión del autor: `refuter` y `fixer` quedan como "no medidos (WSL2 sin preparar)" |
| Completa en opus (Windows) | no corrió | — | — | — | opus | 0 | — |
| Completa en opus (WSL2) | no corrió | — | — | — | opus | 0 | fuera (WSL2 sin preparar) |
| Rama sonnet (Windows) | no corrió | — | — | — | sonnet | 0 | — |
| Rama sonnet (WSL2, solo `refuter`) | no corrió | — | — | — | sonnet | 0 | fuera (WSL2 sin preparar) |

## Por caso

Solo corrieron las sondas, las dos sobre el mismo caso y con una corrida cada una.

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | 0/2 según los graders. En la sonda 2 el agente **sí** dio el hallazgo correcto (`src/pages.js:7`, BLOCKER), leído a mano en el trace | `finds-planted-defect`: "pattern not found in trace" (grader mal escrito, ver abajo) | 0,172 | 0,097 y 0,075 | sin veredicto (sondas, no 5 corridas) |
| refuter | refuter-false-finding | no medido (WSL2 sin preparar) | — | — | — | — |
| fixer | fixer-confirmed-finding | no medido (WSL2 sin preparar) | — | — | — | — |

Los otros 11 casos no corrieron.

## Frenos

**Primera sonda.** Freno i: no se pudo demostrar. El runner borró el trace al terminar, y ni `results/` ni el `report.html` lo guardan. Decisión del autor (2026-09-30): repetir la sonda con `--keep-temp`, dejar fuera los casos de WSL2 y ajustar los frenos. Los frenos ajustados son estos: (i) la sonda 2 da ≥ 1 SUB; (ii) igual que antes; (iii) exactamente 12 casos en `calib-win.json`, todos aprobados; (iv) sonda + sonda 2 + calibración de Windows ≤ 5,8 USD.

**Sonda 2** (con `--keep-temp`, que sí conserva `out/trace.jsonl`):

- **(i) Se cumple: 2 eventos SUB.** Son los dos `tool_use` del revisor opus (Read y Grep).
- **(ii) Se encontró un grader mal escrito, así que se frena.** `review-cases.js` no se tocó (`git diff --quiet 41d2b5d` sale 0). Pero el trace real muestra que **el informe final del subagente nunca sale como evento `assistant` con `parent_tool_use_id` no nulo**. Aparece solo en un evento `system` (`task_notification`) y en el `tool_result` del `user` de la sesión principal (`parent_tool_use_id: null`). Los eventos SUB traen solo los `tool_use` del subagente. Por eso todo grader `trace` que busca **texto** del subagente detrás del prefijo SUB no puede aprobar nunca, y los de `not_contains` aprueban siempre. Son `finds-planted-defect`, `verdict-*`, `no-blocking-finding`, `refutes-false-claim`, `keeps-true-claim` y `done`. Los que miran `tool_use` del subagente (`subagent-edited-source` y `subagent-ran-tests`) sí son viables. En la sonda 2 el revisor devolvió el hallazgo plantado correcto: `"location": "src/pages.js:7"` con `"severity": "BLOCKER"` (línea recortada del `tool_result`), y el grader lo dio como fallado. El test determinista de los graders pasaba porque su trace sintético ponía el texto en un `assistant` con parent, y los traces reales de 2.1.285 no tienen esa forma.
- **(iii) No corrió.** La calibración quedó frenada.
- **(iv) Se cumple:** 0,172 USD.

**Costo del subagente.** En la sonda 2, `modelUsage` trae `claude-sonnet-5-5` (0,0426 USD: 398 de salida, 8 782 de escritura de caché, 17 570 de lectura) y `claude-opus-5-5` (0,0319 USD: 1 181 de salida con 181 de razonamiento, 1 336 de escritura, 8 154 de lectura). La suma, 0,0746, es igual al `costUsd` de `probe2.json` (0,0745768). O sea que el costo del subagente **sí entra** en `costUsd`. El revisor opus costó mucho menos que lo estimado (0,21) porque el caso es chico: 2 herramientas y 1,2 k tokens de salida.

## Notas

- Costo total gastado: **0,172 USD** de un tope de 54 (sonda 0,097 + sonda 2 0,075).
- Para retomar hacen falta decisiones del autor, porque cambian un grader (freno ii). Hay que reescribir los graders de texto para que lean el informe final donde el trace lo pone: el `tool_result` del `Agent` en la sesión principal, o el `system` `task_notification`. Eso se hace en `review-cases.js` y en su test determinista, con un trace sintético que copie la forma real. Después, sonda y calibración de nuevo.
- **Corrección de los graders (0.4.1, sin evals pagas).** Cada grader de texto lee solo el `tool_result` que la sesión principal recibe por su `tool_use` de `Agent` con el `subagent_type` del caso: el patrón empieza en ese `tool_use` (`"type":"tool_use","id":"(…)","name":"Agent","input":{… "subagent_type":"pignolo:<agente>" …}`), sigue hasta `"tool_use_id":"\1","type":"tool_result","content":` (mismo id) y busca dentro de ese string. El runner 2.1.285 corre **una** RegExp sobre todo el trace (cada evento re-serializado, unidos por `\n`), no línea por línea: por eso la retro-referencia `\1` funciona. El veredicto (`verdict-*`, `done`) es la última línea del informe; el harness 2.1.285 sangra cada línea y agrega `agentId: …` al final, y el patrón acepta las dos formas. `no-blocking-finding` y `keeps-true-claim` pasan de `not_contains` a `contains` sobre un informe con su bloque ```json que no trae lo prohibido: reprueban si el subagente no devolvió un informe con su bloque ```json: sin `tool_result` del `Agent`, con un error de la herramienta, con el aviso de `run_in_background` o con un informe vacío. Todo caso suma `subagent-returned` (el bloque ```json; en el `fixer`, `DONE`, `BLOCKED` o `NEEDS_CONTEXT` como última línea) y `single-dispatch` (con dos despachos de `Agent` los graders aprobarían el mejor informe); el prompt pide `run_in_background false`. La palabra final tolera `**APPROVE**`, `` `DONE` `` y el prefijo `Final word:`, y reprueba si le sigue texto no vacío. **Supuesto:** se lee solo el primer bloque de texto del `tool_result` (comprobado en 2.1.285, donde el informe llega en un único bloque). `subagent-edited-source` y `subagent-ran-tests` siguen con SUB. El test determinista usa la sonda 2 recortada y sin rutas personales (`tests/fixtures/evals/probe2-review-reliability-defect.jsonl`): `finds-planted-defect` y `subagent-returned` aprueban sobre ese trace real, y los graders de `review-reliability-clean` lo reprueban. Freno i no cambia: los eventos SUB siguen contando para "el subagente trabajó". Siguiente: sonda de nuevo con los graders nuevos y, si pasa, calibración.
- `--keep-temp` deja `%TEMP%/claude-eval-<id>/` sin sellar (aviso del runner: puede tener archivos escritos por el agente). No se borró: borrarlo requiere el OK del autor.
