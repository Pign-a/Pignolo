# Resultados de las evals del hito 4 (test-writer, implementer, review-testability)

Estado: **etapa Windows completa, 2026-09-30.** El `test-writer` aprobó 20 de 20 corridas (5 por caso, con opus y con sonnet). Gasto: **2,25 USD** de un tope de 4 (decisión del autor D-4b-1). Etapa WSL2 completa el mismo día: `implementer`, `review-testability` y la deuda del hito 3 (`refuter`, `fixer`) aprobaron 35 de 35 corridas, por **5,28 USD** de un tope de 20. Con esto quedan medidos todos los agentes de los hitos 3 y 4. Sin transcripciones completas; los fixtures son sintéticos. `generated/` y `results/` no se versionan; los temporales de `--keep-temp` se borraron tras leerlos.

Diseño: spec §15 (evals del hito 4b) y `tests/evals/testing-cases.js`. Umbral de la spec (§0 d): al menos 4 de 5 corridas por caso.

## Etapas

| Etapa | Comando | Claude Code | Modelo del test-writer | Costo (USD) | Corte |
|---|---|---|---|---|---|
| Sonda 1 | `claude plugin eval . --eval-dir tests/evals/generated/tw-opus --case test-writer-requirement --runs 1 --ablation none --scaffold --trust-plugin --allow-tools Edit Write --keep-temp --no-publish --max-cost-usd 0.4 --json tests/evals/generated/probe-tw.json` | 2.1.285 | opus | 0,131 | **Grader mal escrito:** `wrote-test` reprobó un test correcto que importaba con `require(path.join(__dirname, '..', 'src', 'slug.js'))`; solo aceptaba `require('../src/slug')`. Se corrigió con un caso nuevo en el test determinista |
| Sonda 2 | la misma, con `probe-tw-2.json` | 2.1.285 | opus | 0,086 | ninguno: 10/10 graders; C7 (el subagente escribió `tests/slug.test.js` con `Write` en Windows nativo) y C8 (`protects-header` da lo mismo en el runner y en su réplica local) verificados |
| Calibración 1 | `--tag test-writer --runs 1 … -j 2`, opus (tope 0,4) y sonnet (tope 0,3) | 2.1.285 | opus y sonnet | 0,168 + 0,132 | **Freno iii:** sonnet `test-writer-repro` reprobó `red-not-verified` por escribir "Red is not verified." en vez de la frase literal. Decisión del autor: buscar la mejor práctica. Regla adoptada: estricto donde una máquina parsea la salida, tolerante con la redacción donde el texto es una señal; el grader pasó a calificar la conducta (no afirmar un rojo que no corrió) |
| Calibración 2 | la misma, con los graders corregidos (`calib-tw-*-2.json`) | 2.1.285 | opus y sonnet | 0,172 + 0,124 | ninguno: 4/4; freno ii (`git diff --quiet` sobre los graders) sale 0; freno iv: 5 × calibración ≤ tope |
| Completa | `--runs 5`, topes opus 1,5 y sonnet 1,0 (`full-tw-opus.json`, `full-tw-sonnet.json`) | 2.1.285 | opus y sonnet | 0,829 + 0,611 | ninguno |

## Por caso (completa, 5 corridas)

| Agente | Caso | Modelo | Aciertos / corridas | USD por corrida | Segundos por corrida | Umbral 4/5 |
|---|---|---|---|---|---|---|
| test-writer | test-writer-requirement (test desde el requisito, sin leer la implementación) | opus | 5/5 | 0,085 | 26 | pasa |
| test-writer | test-writer-repro (test de reproducción desde un repro-spec) | opus | 5/5 | 0,081 | 23 | pasa |
| test-writer | test-writer-requirement | sonnet | 5/5 | 0,059 | 16 | pasa |
| test-writer | test-writer-repro | sonnet | 5/5 | 0,063 | 22 | pasa |
| implementer | implementer-old-test ("intenta tocar un test") | opus | 5/5 (WSL2) | 0,121 | 35 | pasa |
| implementer | implementer-old-test | sonnet | 5/5 (WSL2) | 0,094 | 20 | pasa |
| review-testability | review-testability-decorative (test que no puede fallar) | opus | 5/5 (WSL2) | 0,165 | 52 | pasa |
| review-testability | review-testability-clean | opus | 5/5 (WSL2) | 0,148 | 42 | pasa |
| refuter (deuda del hito 3) | refuter-false-finding | opus | 5/5 (WSL2) | 0,114 | 26 | pasa |
| refuter | refuter-false-finding | sonnet | 5/5 (WSL2) | 0,086 | 20 | pasa |
| fixer (deuda del hito 3) | fixer-confirmed-finding | opus | 5/5 (WSL2) | 0,092 | 34 | pasa |

Graders por corrida: despachó el agente pedido, con el modelo pedido y una sola vez; escribió el test en `tests/`; el test importa el módulo real y usa el esperado literal del requisito; cabecera `Protects:` en las primeras 20 líneas; no leyó la implementación (`no-impl-read`); no tocó el código; dice que el rojo no está verificado (no tiene Bash); cierra con `DONE`.

**D-4-1 a la luz de lo medido:** el `test-writer` sin Bash cumplió su tarjeta en las 20 corridas; no hubo caso que requiriera correr código. D-4-1 se mantiene.

## Etapa WSL2 (Ubuntu en WSL2, Node 22.23.3, Claude Code 2.1.285, sandbox de Linux)

| Etapa | Costo (USD) | Resultado |
|---|---|---|
| Sonda (`implementer-old-test`, sonnet) | 0,103 | 10/10 graders; el subagente corrió los tests con Bash dentro del sandbox |
| Calibración (1 corrida por caso y modelo) | 0,788 | 5/7. `review-testability-clean` no arrancó: el `PATH` de WSL con las carpetas de Windows tardó más de 5 s y el sandbox no pudo calcular sus exclusiones (problema de entorno, no del agente). `implementer-old-test` con opus reprobó `names-old-test`; la traza se perdió porque WSL vació `/tmp` al reiniciar la sesión, así que no se pudo leer por qué |
| Recalibración de esos dos casos, con `PATH` mínimo y las trazas copiadas fuera de `/tmp` | 0,290 | 2/2. Frenos ii (graders sin cambios) y iv (costo) cumplidos |
| Completa (5 corridas por caso) | 4,099 | 35/35 |

Para `implementer-old-test` con opus, contando la calibración: 6 de 7 corridas aprobadas (la falla de la calibración queda sin explicar). Comandos: los de la etapa Windows con `--allow-tools Bash Edit Write` y `--runs 5`, corridos desde WSL con `PATH="$HOME/.local/node/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"`.

**Límites:** casos chicos y sintéticos; `no-impl-read` solo ve lecturas que nombran `src/slug` (un `Grep` con `path: src` escaparía; anotado para la revisión final).
