# Resultados de las evals del hito 3 (agentes de revisión)

Estado: **pendiente de la primera corrida.** Las cifras se completan a medida que corre cada etapa, buenas o malas. Sin transcripciones completas (a lo sumo la línea del grader que falló, recortada) y sin datos de proyectos donde se usa pignolo: los fixtures son sintéticos. `results/` y `generated/` no se versionan.

Diseño y definiciones: spec §15 (`agents`). Recall: el subagente reporta la ubicación plantada (±3 líneas, o un rango `archivo:A-B` que la contiene) con severidad BLOCKER o CRITICAL (en `readability`, WARNING o más). Falso positivo: BLOCKER o CRITICAL en un diff limpio. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso.

## Etapas

Orden fijo (decisión D-3b, tope total 54 USD): sonda, calibración, completa en opus, rama sonnet. Si un tope o un freno corta una corrida, se anota acá qué freno fue.

| Etapa | Comando | Fecha | Claude Code | Modelo de la sesión principal | Modelo del revisor | Costo total (USD) | Corte |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sonda | pendiente | pendiente | pendiente | pendiente | opus | pendiente | pendiente |
| Calibración (Windows) | pendiente | pendiente | pendiente | pendiente | opus | pendiente | pendiente |
| Calibración (WSL2) | pendiente | pendiente | pendiente | pendiente | opus | pendiente | pendiente |
| Completa en opus (Windows) | pendiente | pendiente | pendiente | pendiente | opus | pendiente | pendiente |
| Completa en opus (WSL2) | pendiente | pendiente | pendiente | pendiente | opus | pendiente | pendiente |
| Rama sonnet (Windows) | pendiente | pendiente | pendiente | pendiente | sonnet | pendiente | pendiente |
| Rama sonnet (WSL2, solo `refuter`) | pendiente | pendiente | pendiente | pendiente | sonnet | pendiente | pendiente |

## Por caso

Una tabla por etapa que corrió, con esta forma.

| Agente | Caso | Aciertos / corridas | Grader que falló | Costo total (USD) | Costo por corrida (USD) | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- | --- | --- |
| review-reliability | review-reliability-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-reliability | review-reliability-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-resilience | review-resilience-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-resilience | review-resilience-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-risk | review-risk-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-risk | review-risk-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-readability | review-readability-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| review-readability | review-readability-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| judge-a | judge-a-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| judge-a | judge-a-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| judge-b | judge-b-defect | pendiente | pendiente | pendiente | pendiente | pendiente |
| judge-b | judge-b-clean | pendiente | pendiente | pendiente | pendiente | pendiente |
| refuter | refuter-false-finding | pendiente | pendiente | pendiente | pendiente | pendiente |
| fixer | fixer-confirmed-finding | pendiente | pendiente | pendiente | pendiente | pendiente |

## Notas

Pendiente de la primera corrida.
