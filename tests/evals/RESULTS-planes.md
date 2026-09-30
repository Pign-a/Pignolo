# Resultados: prueba de metodologías de validación de planes

Fecha: 2026-09-30. Claude Code 2.1.285, Windows nativo, `claude -p` sin pignolo cargado (`--setting-sources project,local`). Plan de la prueba: `docs/plans/2026-09-30-bench-validacion-de-planes.md`. Investigación de base: `docs/research/2026-09-30-validar-planes-sin-implementar-dos-veces.md`. Decisión del autor: prueba completa, tope 25 USD. **Gasto: 13,59 USD** (sonda 0,14; etapa 1 5,17; etapa 2 7,32; etapa 3 0,96). Resultados buenos o malos, sin transcripciones. `tests/bench/plans/results/` no se versiona.

## Métodos

M1 script de referencias (sin IA) · M2 M1 + rojo de los tests del plan (sin IA) · M3 revisor de solo lectura · M4 capas (M2 y después un revisor que recibe su informe) · M0 replay: implementar el plan en una copia y reportar lo que no funcionó (el método viejo).

## Planes sintéticos (3 planes × 6 errores plantados + 1 plan limpio; 3 corridas por método y modelo)

| Método | Modelo | Recall | Falsas alarmas (total) | USD por corrida | Segundos por corrida |
|---|---|---|---|---|---|
| M1 | — | 56 % | 0 | 0 | 0,1 |
| M2 | — | 72 % | 0 | 0 | 0,4 |
| M3 | sonnet | 100 % | 3 | 0,068 | 11 |
| M3 | opus | 100 % | 6 | 0,148 | 19 |
| M4 | sonnet | 96 % | 0 | 0,072 | 13 |
| M4 | opus | 100 % | 2 | 0,143 | 21 |
| M0 (1 corrida, sin el plan limpio) | sonnet | 100 % | 0 | 0,090 | — |
| M0 (1 corrida, sin el plan limpio) | opus | 100 % | 4 | 0,230 | — |

Los planes sintéticos resultaron fáciles: todos los métodos con IA encuentran todo. Sirven para ver falsas alarmas y costo, no para separar modelos.

## Caso real: el plan 4a v1 (`794b009`) contra el código de ese commit (14 errores reales, los que encontró la auditoría opus)

| Método | Modelo | Corridas | Recall | USD por corrida | Segundos por corrida |
|---|---|---|---|---|---|
| M1 / M2 | — | 1 | 0 % (20 falsas alarmas) | 0 | 1 |
| M3 | sonnet | 3 | 31 % (13/42) | 0,45 | 77 |
| M3 | opus | 3 | 43 % (18/42) | 1,10 | 146 |
| M4 | sonnet | 3 | 14 % (6/42) | 0,28 | 51 |
| M4 | opus | 2 (la 3.ª la cortó el tope de la etapa) | 46 % (13/28) | 0,90 | 136 |
| Auditoría original (opus con Bash, experimentos en Windows) | opus | 1 | 100 % por definición | ~190 mil tokens | ~6 min |

Recall recalificado con palabras clave en inglés además de castellano: con solo las de castellano, el calificador perdía hallazgos correctos (por ejemplo, "test que no puede fallar" escrito como "never runs"). Aun así es una heurística: puede subestimar.

## Qué dicen los datos

1. **En un plan real, opus encuentra más** (43–46 % contra 31 % de sonnet) y cuesta unas 2,5 veces más por corrida. En planes chicos no hay diferencia de recall y opus da más falsas alarmas.
2. **Un revisor que solo lee no alcanza.** Ninguno pasó la mitad de los 14 errores reales. La auditoría que los encontró todos **ejecutaba experimentos** (probó `spawnSync` con `npm` en Windows, `process.kill` con pids reales, `git apply --numstat` con un parche viejo). Lo que falta no es más lectura sino experimentos puntuales sobre los supuestos riesgosos.
3. **El script sin IA es gratis y no inventa nada en planes con formato de tarjetas** (56–72 % en los sintéticos), pero en un plan que nombra rutas y funciones que el propio plan va a crear da 20 falsas alarmas, y esas falsas alarmas **empeoran al revisor sonnet** (M4 sonnet 14 % contra M3 sonnet 31 %). Para servir, el script tiene que saber qué es nuevo y qué ya existe (las tarjetas lo dicen en `Files: Create / Modify`).
4. **El replay no mide lo que cuesta en un hito real** con planes de juguete (0,09–0,23 USD). Lo medido en esta sesión con planes reales: escribir el plan 4b con replay costó ~459 mil tokens y 45 min; el de pignolo-ui hito 3, ~405 mil tokens y 78 min. Una revisión opus del plan real cuesta ~1 USD y 2–3 min.

## Recomendación

Para el `plan-auditor` (hito 5) y para nuestro propio método:

1. **Script de referencias, solo sobre lo que el plan declara como existente** (`Modify`, interfaces que consume). Arreglo pendiente de `plan-check`: ignorar lo que la tarjeta marca como `Create`. Gratis.
2. **Revisor opus de solo lectura**, que recibe el informe del script (~1 USD por plan).
3. **Experimentos puntuales**: el revisor marca los supuestos que solo se verifican ejecutando (plataforma, procesos, git, herramientas externas) y un agente con Bash prueba **solo esos**, en una carpeta temporal, sin implementar el plan. Es lo que hizo la auditoría que encontró los 14.
4. **Sin replay completo.**

La capa 3 no se midió como método aparte en esta prueba; queda como hipótesis respaldada por el caso de la auditoría. Se mide cuando exista en el `plan-auditor`.
