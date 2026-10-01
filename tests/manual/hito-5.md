# Checklist manual — hito 5a (modo `plan`, parte determinista)

Sesión real de Claude Code, Windows nativo, repo de prueba sin datos del autor y con `.pignolo/project.md`. Cada punto: anotar fecha, versión de Claude Code y resultado.

1. `scope-gate`: con un plan registrado en `scope-card` sin aprobar, un `git merge int/<plan>` a `main` queda negado con una alternativa; con la tarjeta aprobada (`plan.js scope-card approve`) la guardia pide la confirmación habitual y `scope-gate` calla. Anotar si, cuando la guardia pide confirmación y `scope-gate` niega, el host muestra solo la negación (C12 de la auditoría: verificado estáticamente, no en vivo).
2. `plan-auditor` en `review` que intenta `Bash`: negado en el momento y con `Alternativa:`. En `verify`: escribe un script en `.pignolo/tmp/plan-audit/<plan>/scratch/` con `Write`, lo corre con `Bash`, y si cierra con menos experimentos que afirmaciones el `SubagentStop` lo hace volver (hasta 2 veces); la tercera lo deja terminar y `plan-audit.js finish` da `ESCALATE`. Un `Write` fuera del `scratch/` queda negado.
3. **`PostToolUse` y `PostToolUseFailure` de `Bash` reciben `agent_type` dentro de un subagente** (hipótesis abierta desde 3a): anotar el valor real (`pignolo:plan-auditor`) y que un experimento que sale con código distinto de cero se cuenta (`bash-calls.log` suma una línea).
4. La forma real del `tool_input` de la herramienta `Artifact` (R-9): anotar las claves; con `presentation: text` en `project.md` y un flujo en curso, `present-gate` niega la publicación. Si la forma no coincide, la segunda capa (`present.js check` antes de publicar) es la que vale.
5. `/compact` en medio de un plan (etapa `audited`): `next.js --text` y el arranque (`SessionStart`, `compact`) dan la acción correcta, la misma frase.
6. Cada mensaje al humano de los puntos 1 a 5 viene en dos capas y con categoría.
