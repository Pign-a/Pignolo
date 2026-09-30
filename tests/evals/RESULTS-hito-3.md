# Resultados de las evals del hito 3 (agentes de revisión)

Estado: **cortada en la sonda (freno i), 2026-09-30.** Solo corrió la sonda (0,097 USD de 54). Las cifras se completan a medida que corre cada etapa, buenas o malas. Sin transcripciones completas (a lo sumo la línea del grader que falló, recortada) y sin datos de proyectos donde se usa pignolo: los fixtures son sintéticos. `results/` y `generated/` no se versionan.

Diseño y definiciones: spec §15 (`agents`). Recall: el subagente reporta la ubicación plantada como `archivo:N` (±3 líneas; un rango `archivo:A-B` no cuenta: el contrato de los agentes es `path:line`) con severidad BLOCKER o CRITICAL (en `readability`, WARNING o más). Falso positivo: BLOCKER o CRITICAL en un diff limpio. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso.

## Etapas

Orden fijo (decisión D-3b, tope total 54 USD): sonda, calibración, completa en opus, rama sonnet. Si un tope o un freno corta una corrida, se anota acá qué freno fue.

Freno iii (la calibración no falla en ningún caso) se cumple solo si `calib-win.json` trae **exactamente 12 casos** (8 de lentes y 4 de jueces) y `calib-wsl2.json` **exactamente 2** (`refuter` y `fixer`), y todos aprobados. Un archivo con menos casos (una etiqueta que no los juntó, WSL2 ausente, una corrida cortada por el tope) no cumple el freno aunque lo que haya esté aprobado.

| Etapa | Comando | Fecha | Claude Code | Modelo de la sesión principal | Modelo del revisor | Costo total (USD) | Corte |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sonda | `claude plugin eval . --eval-dir tests/evals/generated/opus --case review-reliability-defect --runs 1 --ablation none --scaffold --trust-plugin --max-cost-usd 1 --json tests/evals/generated/probe.json` | 2026-09-30 | 2.1.285 | sonnet (del `prompt.md`; `modelUsage` no se pudo leer: trace borrado) | opus (pedido en el `Agent`; no verificado en el trace) | 0,097 | **Freno i**: no se pudo demostrar ≥ 1 evento SUB |
| Calibración (Windows) | no corrió | — | — | — | opus | 0 | cortada por el freno i |
| Calibración (WSL2) | no corrió | — | — | — | opus | 0 | no hay `claude` ni `node` en la distro Ubuntu de WSL2: el freno iii tampoco se habría cumplido |
| Completa en opus (Windows) | no corrió | — | — | — | opus | 0 | — |
| Completa en opus (WSL2) | no corrió | — | — | — | opus | 0 | — |
| Rama sonnet (Windows) | no corrió | — | — | — | sonnet | 0 | — |
| Rama sonnet (WSL2, solo `refuter`) | no corrió | — | — | — | sonnet | 0 | — |

## Por caso

Solo corrió la sonda: un caso, una corrida.

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | 0/1 (puntaje 0,67: pasan `dispatched` y `model`) | `finds-planted-defect`: "pattern not found in trace" | 0,097 | 0,097 | sin veredicto (1 corrida de sonda, no 5) |

Los otros 13 casos no corrieron.

## Frenos

Medidos después de la sonda. La calibración no corrió porque el freno i ya había fallado.

- **(i) La sonda da ≥ 1 evento SUB: falla (no demostrado).** El `tracePath` que informa `probe.json` (`%TEMP%/claude-eval-*/out/trace.jsonl`) ya no existía al terminar la corrida: el runner borra su directorio temporal, y ni `results/` ni el `report.html` guardan el trace. No se pudo contar SUB ni leer `modelUsage`. La única señal indirecta es `finds-planted-defect`: sus líneas empiezan con el patrón SUB y no encontró nada. Eso es compatible con dos causas: el trace no trae los eventos del subagente, o los trae sin el hallazgo. La corrida duró 23 s, con 2 turnos de la sesión principal y 0,097 USD, contra ≈ 0,28 USD estimados para un caso en opus.
- **(ii) Ningún grader corregido: se cumple.** `git diff --quiet 41d2b5d -- tests/evals/review-cases.js` sale 0.
- **(iii) Calibración completa y aprobada: falla (no corrió).** Además, WSL2 no tiene `claude` ni `node` (`wsl -e bash -lc "claude --version"` da `command not found`). No se instaló ni se autenticó nada.
- **(iv) Costo de la calibración ≤ 5,8 USD: se cumple de forma trivial** (0,097 USD, solo la sonda).

## Notas

- Costo total gastado: **0,097 USD** de un tope de 54.
- Para retomar hacen falta decisiones del autor. Primero, cómo conservar el trace de la sonda: `--keep-temp` ("Preserve scaffold dirs for debugging") es la candidata, pero sin probar. Cambia el comando del plan, y una segunda sonda es una corrida nueva. Segundo, instalar y autenticar `claude` y `node` en WSL2, o sacar de la calibración los casos `refuter` y `fixer`.
