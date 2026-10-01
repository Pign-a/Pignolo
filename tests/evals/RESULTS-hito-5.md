# Resultados de las evals del hito 5b (spec-reviewer, plan-auditor, validator)

Estado: **etapa Windows cortada por el freno iii en la calibración, 2026-10-01.** Gasto: **0,276 USD** de un tope total de 17 (decisión del autor D-5-2). La etapa WSL2 (`plan-auditor`, `validator`) y la corrida completa no se corrieron: frenaron a la espera del autor. La medición de la combinación 2a + 2b sobre el plan del hito 6 se omitió por pedido. Sin transcripciones completas; los fixtures son sintéticos. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos.

Diseño: spec §15 y `tests/evals/plan-cases.js`. Casos generados con `node tests/evals/plan-cases.js --out tests/evals/generated/plan`. Todo en opus. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso. Claude Code 2.1.285, Windows nativo, pignolo 0.8.1 (main en 4ac552d).

## Etapas

| Etapa | Comando | Costo (USD) | Corte |
|---|---|---|---|
| Sonda | `claude plugin eval . --eval-dir tests/evals/generated/plan --case spec-reviewer-added-scope --runs 1 --ablation none --scaffold --trust-plugin --keep-temp --no-publish --max-cost-usd 0.4 --json tests/evals/generated/probe-sr.json` | 0,106 | ninguno: 1/1, todos los graders; 5 eventos SUB en la traza (freno i cumplido) |
| Calibración (2026-10-01) | `… --tag windows --runs 1 -j 2 … --max-cost-usd 0.5 --json tests/evals/generated/calib-win.json` | 0,171 | **Freno iii:** 1/2. `git diff --quiet` sobre los graders sale 0 (freno ii cumplido) |

## Por caso (calibración, 1 corrida)

| Agente | Caso | Aciertos / corridas | USD por corrida | Segundos | Grader que falló |
|---|---|---|---|---|---|
| spec-reviewer | spec-reviewer-added-scope | 1/1 | 0,086 | 27 | ninguno |
| spec-reviewer | spec-reviewer-clean | 0/1 (score 0,875) | 0,085 | 27 | `verdict-approve` |

Sin corridas de `plan-auditor-*` ni `validator-*` (no se llegó a WSL2). Sin corrida completa (5 por caso).

## Por qué falló `spec-reviewer-clean`

El agente entregó la tarjeta con `Added without being asked: none` y las ocho secciones, pero cerró con `REQUEST_CHANGES` en vez de `APPROVE`. Sus hallazgos fueron 2 MAJOR y 4 MINOR sobre lo que el spec no define (estados posibles, valor por defecto del selector, selección simple o múltiple, estado vacío, origen de los datos, falta de criterios de aceptación). No inventó alcance agregado: pidió precisión. El grader exige `APPROVE`, y el fixture "limpio" es de dos líneas, así que el spec es genuinamente vago. Es una discrepancia entre el fixture o el grader y la carta del agente (¿"limpio" = sin alcance agregado, o sin huecos?), no un fallo evidente del agente. No se editó nada a mitad de corrida (freno); decide el autor: relajar el grader a "sin ítem agregado y sin BLOCKER" o enriquecer el fixture con criterios de aceptación, y recalibrar. Una sola corrida no mide la tasa.

## Frenos del hito 4

| Freno | Estado |
|---|---|
| i. Sonda con al menos un evento SUB | cumplido (5) |
| ii. Graders sin cambios desde la calibración (`git diff --quiet`) | cumplido |
| iii. Calibración con exactamente los casos de la etapa y todos aprobados | **no cumplido (1/2)** |
| iv. 5 × calibración ≤ tope de la completa | no evaluado (corte previo) |
| v. Tope de costo por corrida (`--max-cost-usd`) | no se alcanzó |
