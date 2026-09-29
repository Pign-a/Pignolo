# Resultados de evals de agentes

Fecha: 2026-09-29. Claude Code 2.1.284, Windows nativo (sin WSL). Solo graders deterministas, sin corrida base.

## Comando

Se corre desde la raíz del repo. `--eval-dir` no admite `..`, así que el objetivo es `.` y cada `prompt.md` apunta al plugin con `plugins: ["../../../../plugins/pignolo"]`.

```
claude plugin eval . --eval-dir tests/evals/agents --ablation none --runs 5 --scaffold --allow-tools WebFetch --trust-plugin --max-cost-usd 6 -j 2
```

`--scaffold` es necesario: el fixture del explorer lo crea `explorer-cites-lines/fixture.sh` (6 archivos inventados en el workspace vacío). Validación previa de cada caso con `--runs 1 --case <x> --max-cost-usd 0.5`.

## Corrida completa (5 corridas por caso)

| Caso | Pasan | Puntaje | Costo | Veredicto (umbral 4/5) |
| --- | --- | --- | --- | --- |
| explorer-cites-lines | 5/5 | 1.00 | 0,56 USD | PASA |
| researcher-no-repo | 5/5 | 1.00 | 0,96 USD | PASA |

Costo de la corrida completa: 1,52 USD (210 s). Validaciones: 0,12 + 0,19 USD. Total de la tarea: 1,83 USD (tope 8).

## Modelo y effort

- explorer: `sonnet`, effort `low` (frontmatter del agente).
- researcher: `opus` (visto en el trace: `claude-opus-5-5`), effort `medium` (frontmatter del agente).
- El reporte no imprime el effort resuelto; los valores son los del frontmatter, no una lectura del runtime.

## Notas

- `researcher-no-repo` omite `WebSearch` del grant (solo se concedió `WebFetch`, según el tope acordado); el runner avisa "not granted: WebSearch". El agente respondió igual con `WebFetch` en las 5 corridas.
- El grader negativo sobre `Read|Grep|Glob` se implementó como tres `tool_used` con `min: 0` y `max: 0`. Miden la sesión principal, que ni siquiera tiene esas herramientas concedidas en este caso, así que aportan poco.
- El regex del explorer exige dos citas `\S+\.\w+:\d+` en la respuesta final, sin verificar que apunten a líneas correctas.
- Los resultados locales (`results/`) no se versionan.
