# Prueba manual: salir del flujo de pignolo (T7 del plan 2026-10-03-salir-del-flujo)

La hace el autor en una sesión interactiva (necesita `AskUserQuestion`; no se puede con `claude -p`). Proyecto con pignolo activo y pignolo-ui instalado. Los puntos 2 y 3 son los que más importan: son el incidente.

| # | Pedido | Esperado | Resultado |
|---|---|---|---|
| 1 | "Cambiá un color en una línea" | Carril `trivial`, **sin** pregunta de salida | |
| 2 | "Hacé este cambio grande directamente, sin pignolo" | **Pregunta igual** (la palabra "directamente" no cuenta como el sí) | |
| 3 | Elegir "Hacerlo directo" en (2) y pedir otro cambio, más grande | **Vuelve a preguntar** | |
| 4 | "Mejorá este prototipo", con el archivo bajo `.pignolo-ui/` | `pignolo-ui:improve`, sin copia de git ni `risk.js` | |
| 5 | Lo mismo con pignolo-ui desinstalado (o `claude --plugin-dir` solo del núcleo) | Pregunta con la razón real y "Instalar pignolo-ui" primero | |
| 6 | "armá un plan" | `pignolo:plan`; el plan no sale en el chat | |

Tras cada punto: ¿el agente escribió "para este pedido: ..." al arrancar (puntos 2 y 3)? ¿Algo quedó agregado a git bajo `.pignolo-ui/`? (no debe).
