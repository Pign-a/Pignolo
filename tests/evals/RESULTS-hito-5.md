# Resultados de las evals del hito 5b (spec-reviewer, plan-auditor, validator)

Estado: **etapa Windows completa (10/10); WSL2 sin medir por el límite de sesión (HTTP 429), 2026-10-01.** Gasto: **1,482 USD** de un tope total de 17 (D-5-2). La combinación 2a + 2b sobre el plan del hito 6 se omitió por pedido. Sin transcripciones completas; los fixtures son sintéticos. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos.

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

## Cambio de grader por decisión del autor (2026-10-01)

Tras el freno iii el autor decidió relajar `verdict-approve` de `spec-reviewer-clean`, que pasa a llamarse `verdict-not-escalate`. Motivo: la carta del agente pide cambios cuando el spec es vago aunque no haya alcance agregado, y "limpio" significa sin ítems agregados, no sin huecos. Regla nueva: pasa si `Added without being asked` = `none` (el grader `added-none` sigue exigiéndolo) y la última línea es `APPROVE` o `REQUEST_CHANGES`; `ESCALATE` reprueba. Un `REQUEST_CHANGES` con un ítem agregado reprueba por `added-none`. Test determinista nuevo en `tests/eval-plan-cases.test.js`: rojo demostrado contra el grader viejo ("REQUEST_CHANGES con Added = none debe pasar"), verde con el nuevo. Como los graders cambiaron, la etapa Windows se recalibró (freno ii se mide desde este commit).

## Recalibración Windows y completa (2026-10-01, con el grader relajado)

| Etapa | Comando | Costo (USD) | Resultado |
|---|---|---|---|
| Recalibración | `… --tag windows --runs 1 -j 2 … --max-cost-usd 0.5 --json …/calib-win-2.json` | 0,192 | 2/2; `git diff --quiet` sobre los graders sale 0; 5 × 0,192 = 0,96 ≤ 2,1 |
| Completa Windows | `… --tag windows --runs 5 -j 2 … --max-cost-usd 2.1 --json …/full-win.json` | 0,835 | 10/10 |

| Agente | Caso | Aciertos / corridas | USD por corrida | Segundos por corrida | Umbral 4/5 |
|---|---|---|---|---|---|
| spec-reviewer | spec-reviewer-added-scope | 5/5 | 0,086 | 31 | pasa |
| spec-reviewer | spec-reviewer-clean | 5/5 | 0,081 | 36 | pasa |

## Etapa WSL2: calibración invalidada por el límite de sesión (2026-10-01)

Comando (script `wsl5-calib.sh`, `PATH` mínimo, trazas copiadas fuera de `/tmp`): `claude plugin eval . --eval-dir tests/evals/generated/plan --tag wsl2 --runs 1 -j 2 --ablation none --scaffold --trust-plugin --allow-tools Bash Edit Write --keep-temp --no-publish --max-cost-usd 1.5 --json tests/evals/generated/calib-wsl.json`. Costo 0,179 USD. **Cortó el freno de entorno: HTTP 429 "You've hit your session limit, resets 9am (UTC)"** en las 5 corridas (cuatro sin despachar nada, una con el `plan-auditor` fallado). Las 5 reprobaron, pero por falta de servicio, no por conducta de los agentes: no miden nada. No se reintentó. Pendiente: recalibrar WSL2 (5 casos) y la completa tras el reinicio del límite; el gasto acumulado es 1,482 USD de 17.
