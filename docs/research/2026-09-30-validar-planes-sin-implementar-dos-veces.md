# Validar un plan contra el código sin implementarlo dos veces

_Investigación web, 2026-09-30 (agente sonnet, fuentes leídas ese día). Pedido del autor: que el plan quede validado contra el código real sin construir el hito dos veces (el "replay en copia" que usaban los planes de los hitos 1 a 4a)._

## Alternativas

| # | Alternativa | Cómo funciona | Detecta | No detecta | Costo | Evidencia |
|---|---|---|---|---|---|---|
| 1 | Grounding estático de referencias | Un script extrae del plan rutas, símbolos y firmas (bloque estructurado) y las resuelve contra el repo (`fs`, grep, AST o LSP). | Archivos, funciones y firmas inventadas o viejas. | Contradicciones de diseño; tests que no pueden fallar. | Casi cero tokens. | [1] (validación de código generado con AST: precisión 100 %, recall 87,6 %; aplicarlo a planes es hipótesis), [2], [3]. |
| 2 | Compilar esqueletos de interfaces | El plan trae solo firmas y tipos; se compilan en una copia (`node --check`, `tsc --noEmit`). | Firmas incompatibles, imports rotos. | Comportamiento. | Una compilación. | `plancheck` (`go build -overlay`), +7,9 pp de recall de archivos omitidos [4]. |
| 3 | Tests primero: el plan son tests rojos | El plan entrega tests o criterios ejecutables; se corren contra el código actual y deben fallar por la razón declarada. **Los tests se reutilizan en la implementación.** | Tests que no pueden fallar, criterios ambiguos, APIs inexistentes. | Diseño que el test no cubre. | Medio, pero no se repite. | Anthropic recomienda un check ejecutable y specs que terminen en verificación [5]; Kiro deriva property tests de requisitos EARS [6][7]. |
| 4 | Revisor independiente con acceso al código | Subagente de contexto limpio, solo lectura, que verifica cada afirmación con `archivo:línea` y reporta solo lo que afecta la corrección. | Contradicciones, omisiones, supuestos falsos. | Probabilístico; con prompt laxo inventa hallazgos. | Decenas de miles de tokens. | Patrón Writer/Reviewer y advertencia sobre revisores que "siempre encuentran algo" [5]; Spec Kit `/speckit.analyze` (consistencia spec/plan/tasks, no contra el código) [8]. |
| 5 | Spike solo del riesgo más alto | Experimento descartable y acotado sobre la incógnita que hundiría el plan. | Supuestos de API o toolchain que solo se ven ejecutando. | Todo lo no elegido. | Acotado por diseño. | XP [9]; `plancheck` con prototipo: +5,8 a +17,7 pp de recall, ~0,05–0,15 USD por tarea (una corrida, solo Go) [4]. |
| 6 | Plan como checklist ejecutable | Cada paso trae su comando de verificación; un hook `Stop` o el revisor bloquea el cierre hasta que pasen. | Desviaciones del plan. | No corrige el plan antes de empezar. | Bajo. | Stop hook como compuerta determinista y `/goal` [5][10]. |

No existe un evento de hook `ExitPlanMode`; que `PreToolUse` dispare sobre esa herramienta es **hipótesis, no verificado** [10].

Contexto: en alucinaciones a nivel repositorio, 43,5 % son conflictos de requisitos, 31,9 % de conocimiento de APIs y 24,6 % de contexto del proyecto; RAG solo mejoró Pass@1 de forma modesta [11]. Un solo chequeo no alcanza.

## Recomendación (capas, de menor a mayor costo)

1. **Determinista, siempre (1 + 2):** el plan declara sus referencias en un bloque estructurado; un script Node ≥ 22 sin dependencias verifica existencia, firmas y compila los esqueletos. Falla rápido con la lista de huérfanas.
2. **Rojo de los tests del plan (3):** cada test propuesto se corre contra el código actual y debe fallar por la razón declarada. Es trabajo que se reutiliza, no se repite.
3. **Un revisor opus, una pasada (4):** solo lectura, recibe el informe de la capa 1, evidencia `archivo:línea` obligatoria, solo hallazgos que afectan la corrección.
4. **Spike solo para 1–2 supuestos marcados de riesgo alto (5).**
5. **Checklist ejecutable como salida (6):** un comando de verificación por tarea que el implementador tiene que pasar.

Descartado: replay completo en copia (lo que se quiere evitar) y validar solo con un revisor LLM.

Límites: no hay estudios que comparen estas técnicas aplicadas a planes (solo a código generado); las cifras de `plancheck` son de una corrida y solo Go; los costos de 1, 2, 3 y 6 son estimación propia.

## Fuentes

1. https://arxiv.org/html/2601.19106v1
2. https://arxiv.org/pdf/2505.05057
3. https://arxiv.org/pdf/2401.01701
4. https://github.com/justinstimatze/plancheck
5. https://code.claude.com/docs/en/best-practices
6. https://kiro.dev/docs/specs/
7. https://kiro.dev/docs/specs/best-practices/
8. https://github.github.io/spec-kit/reference/agentic-sdd.html
9. https://aipatternbook.com/risk-spike
10. https://code.claude.com/docs/en/hooks
11. https://arxiv.org/html/2409.20550v1

(Todas leídas el 2026-09-30.)
