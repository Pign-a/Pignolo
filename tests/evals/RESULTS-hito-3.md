# Resultados de las evals del hito 3 (agentes de revisión)

Estado: **cortada en la calibración por el freno iii, 2026-09-30.** Con los graders corregidos (0.4.1), la sonda 3 pasó, pero la calibración en Windows dio 9 de 12. Los 3 fallos son del agente o del fixture, no del grader. Gasto: 1,430 USD de 54. Las cifras se completan a medida que corre cada etapa, buenas o malas. Sin transcripciones completas (a lo sumo la línea del grader que falló, recortada) y sin datos de proyectos donde se usa pignolo: los fixtures son sintéticos. `results/` y `generated/` no se versionan.

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
| Calibración (WSL2) | no corrió | — | — | — | opus | 0 | fuera por decisión del autor: `refuter` y `fixer` quedan como "no medidos (WSL2 sin preparar)" |
| Completa en opus (Windows) | no corrió | — | — | — | opus | 0 | — |
| Completa en opus (WSL2) | no corrió | — | — | — | opus | 0 | fuera (WSL2 sin preparar) |
| Rama sonnet (Windows) | no corrió | — | — | — | sonnet | 0 | — |
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
