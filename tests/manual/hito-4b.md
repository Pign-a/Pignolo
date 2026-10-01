# Checklist manual — hito 4b (tests, sabotaje y holdout en los flujos)

Sesión real de Claude Code, Windows nativo, repo de prueba sin datos del autor. Cada punto: anotar fecha, versión de Claude Code y resultado.

1. `daily` con un cambio que agrega comportamiento: la tarjeta trae un bloque `Test-card` por test, y el orquestador muestra el rojo `test-first` antes de despachar al `implementer`.
2. `daily` con una tarea que mezcla un test `test-first` (comportamiento nuevo) y uno `sabotage` (guardia de algo que ya existe):
   - El rojo del primero se ve en el paso 7.
   - Después del commit del implementer, el orquestador escribe el parche en `.pignolo/tmp/`; `sabotage.js` da exit 0 con `--timeout-min 4` y el worktree queda limpio.
   - Con un test débil: exit 1 y el `test-writer` otra vez (commit nuevo encima).
   - Con una suite que tarda más de 4 minutos: no-veredicto, repetición en segundo plano o pregunta; nunca "arreglá el parche".
3. El `implementer` informa el `seedOffered`; una falla forzada que depende del orden se repite con `--seed` y termina en pregunta, no en reintentos.
4. Riesgo `medium`: `review-testability` recibe el comando y las test-cards; con un test decorativo plantado da BLOCKER con la rotura como diff, y `review` lo confirma con `sabotage.js` (exit 1) antes de despachar al `test-writer` de reproducción (que no recibe el hallazgo decorativo) y pide `test-authorization`.
5. (D-4b-3 aprobada por el autor; Task 11 hecha.) Un `test-writer` que intenta escribir `.pignolo/tmp/holdout/` dentro del worktree de la tarea: negado, con la alternativa del checkout principal. Un implementer que intenta `cat ../../tmp/holdout/...` desde el worktree: negado.
6. Cada mensaje al humano de los puntos 1 a 5 viene en dos capas y con categoría.
