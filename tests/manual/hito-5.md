# Checklist manual — hito 5a (modo `plan`, parte determinista)

Sesión real de Claude Code, Windows nativo, repo de prueba sin datos del autor y con `.pignolo/project.md`. Cada punto: anotar fecha, versión de Claude Code y resultado.

1. `scope-gate`: con un plan registrado en `scope-card` sin aprobar, un `git merge int/<plan>` a `main` queda negado con una alternativa; con la tarjeta aprobada (`plan.js scope-card approve`) la guardia pide la confirmación habitual y `scope-gate` calla. Anotar si, cuando la guardia pide confirmación y `scope-gate` niega, el host muestra solo la negación (C12 de la auditoría: verificado estáticamente, no en vivo).
2. `plan-auditor` en `review` que intenta `Bash`: negado en el momento y con `Alternativa:`. En `verify`: escribe un script en `.pignolo/tmp/plan-audit/<plan>/scratch/` con `Write`, lo corre con `Bash`, y si cierra con menos experimentos que afirmaciones el `SubagentStop` lo hace volver (hasta 2 veces); la tercera lo deja terminar y `plan-audit.js finish` da `ESCALATE`. Un `Write` fuera del `scratch/` queda negado.
3. **`PostToolUse` y `PostToolUseFailure` de `Bash` reciben `agent_type` dentro de un subagente** (hipótesis abierta desde 3a): anotar el valor real (`pignolo:plan-auditor`) y que un experimento que sale con código distinto de cero se cuenta (`bash-calls.log` suma una línea).
4. La forma real del `tool_input` de la herramienta `Artifact` (R-9): anotar las claves; con `presentation: text` en `project.md` y un flujo en curso, `present-gate` niega la publicación. Si la forma no coincide, la segunda capa (`present.js check` antes de publicar) es la que vale.
5. `/compact` en medio de un plan (etapa `audited`): `next.js --text` y el arranque (`SessionStart`, `compact`) dan la acción correcta, la misma frase.
6. Cada mensaje al humano de los puntos 1 a 5 viene en dos capas y con categoría.

# Checklist manual: hito 5b (skills, plantillas y cartas)

Sesión real de Claude Code, Windows nativo, repo de prueba sin datos del autor y con `.pignolo/project.md`. Cada punto: fecha, versión de Claude Code y resultado.

7. Un `/pignolo:plan` completo en el repo de prueba: del pedido a la tarjeta aprobada (el humano en su turno), el plan, la auditoría de tres pasos (`review` sin `Bash`, sondas, `verify` con un experimento por afirmación), una tarea serial, el `validator` y el cierre. Anotar en qué paso la skill se desvía de lo escrito y si algún comando de `plan.js` o `plan-audit.js` salió con otro uso del esperado.
8. El aprobado visual llega a la task-card y el `implementer` lo verifica **desde su worktree**: guardar una carpeta con `approved.js save`, registrar la decisión con `record`, commitear las dos por ruta en `int/<plan>` (paso 9 de la skill), crear el worktree de la tarea, ponerla en `Approved visual`, comprobar que el `implementer` corre `approved-verify.js` antes de escribir y sale 0 (sin ese commit sale `BLOCKED` con `no-entry`: 0.8.1), y que con un archivo cambiado termina `BLOCKED`.
9. Un artifact publicado con `presentation: ask` y elegido `artifact` contiene las mismas opciones que el texto (solo si el autor aprobó una plantilla en `templates/present/APPROVALS.md`): comparar la lista del texto con los `data-option` de la página y confirmar que quedó privado.
