# Prueba manual: preguntas interactivas y tope de la auditoría (plan 2026-10-05, núcleo 0.24.0)

La hace el autor en una sesión interactiva (necesita `AskUserQuestion`; no se puede con `claude -p`). Proyecto con pignolo activo.

| # | Pedido | Esperado | Resultado |
|---|---|---|---|
| 1 | "armá un plan para <algo mediano con varias decisiones>" | Las preguntas salen como selector (`AskUserQuestion`), no como texto largo; hasta 4 en una llamada; la categoría en el título corto de cada una | |
| 2 | Mirar las opciones de una pregunta | La recomendada va primera con "(Recomendado)"; cada opción dice qué pasa, el costo y si se deshace, en una línea | |
| 3 | Contar las preguntas hasta el scope-card en un pedido chico, uno mediano y uno grande | Como mucho 2, 4 y 6 | |
| 4 | Los supuestos de bajo riesgo | Una sola pregunta con "Van así" y "Cambio alguno" | |
| 5 | Una pregunta en `daily`, `review` o `close-session` | También como selector | |
| 6 | Auditoría del plan con un hallazgo importante | Una pasada de arreglos y una sola re-auditoría (más corta y en sonnet) | |
| 7 | Dejar un hallazgo importante sin arreglar en la re-auditoría | `ESCALATE`: pregunta (selector) con tres opciones: arreglar y re-auditar solo lo cambiado, auditar de nuevo entero, dejar el plan; no se avanza a `audited` | |
| 8 | Un hallazgo menor | No frena; no se escribe en el plan (queda en `plan.json`) y se dice en una línea | |
| 9 | Elegir "Arreglar y re-auditar solo lo cambiado" tras el `ESCALATE` | Los arreglos los hace un agente sobre el archivo del plan, sin narrar cada edición; otra vuelta acotada en sonnet, abierta con `--extra-round`; ninguna vuelta extra sin una pregunta nueva | |
| 10 | Mirar lo que se dice tras cada vuelta | Un resumen fijo: hallazgos por gravedad, los que frenan en una línea con su id, qué sigue; sin tablas ni historia de vueltas | |
| 11 | Contestar una pregunta con el selector y mirar la cita registrada (`decision add`, `scope-card approve`) | La cita es la pregunta y la etiqueta elegida, literales; el modelo no repite la pregunta en texto | |
| 12 | Una pregunta contestada al momento con el selector | No aparece en "Te toca" del panel; una que queda pendiente sí | |

Tras cada punto: ¿hubo texto largo de "detalle técnico" sin pedirlo? (no debe).
