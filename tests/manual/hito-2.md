# Checklist manual — hito 2

Correr en una sesión INTERACTIVA de Claude Code, en Windows nativo, con el plugin 0.2.0 instalado (`/plugin marketplace update pignolo`). Registrar fecha, versión de Claude Code y resultado de cada punto (los resultados van en `tests/manual/hito-2-resultados.md`).

1. [ ] `/pignolo:setup` en una sesión real: la skill corre `check` y muestra la lista (node, git, `gh`, PowerShell, superpowers, agent teams), pregunta el perfil, escribe `~/.pignolo/config.json` con el perfil elegido y, sin un sí explícito, no toca ningún `settings.json`. Con el sí, si el archivo ya existía queda un `settings.json.pignolo-bak-<fecha>` y las reglas previas siguen todas en su lugar; si no existía, se crea sin respaldo.
2. [ ] `/pignolo:setup` con `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` en el entorno (o en `env` de `settings.json`): el chequeo avisa que el perfil no se va a aplicar y nombra la variable.
3. [ ] En un repo SIN `.pignolo/project.md`: pedirle a Claude "usá un agente Explore para buscar X". El despacho pasa (el hook no niega fuera de un proyecto activo).
4. [ ] En un repo CON `.pignolo/project.md` (creado a mano): el mismo pedido se niega con el mensaje que nombra `pignolo:explorer` como alternativa. Repetir con `general-purpose`, con `fork` y con un despacho sin `subagent_type`: los tres se niegan.
5. [ ] En el mismo repo, `/pignolo:off` y repetir el despacho de `Explore`: pasa. `/pignolo:on`: se vuelve a negar.
6. [ ] Con `project.md`, despachar `pignolo:explorer`: pasa. Confirmar que corre con el modelo del perfil (`balanced`: sonnet) y sin acceso a Edit/Write/Bash. Cambiar a `max` con `/pignolo:setup` y anotar si el modelo del explorer cambia o queda el del frontmatter (el frontmatter fija `balanced`; el perfil lo aplica la skill que despacha, todavía inexistente): registrar lo observado.
7. [ ] `agent_type` de `SubagentStart` (activar `claude --debug` y buscar el payload) al despachar `pignolo:explorer`: anotar si llega `pignolo:explorer` (la doc oficial lo confirma) o `explorer`. Anotar también el `agent_type` de un `PreToolUse` hecho por el subagente.
8. [ ] Antes de un despacho permitido se crea un juego nuevo en `refs/pignolo/backup/` solo si las refs cambiaron: dos despachos seguidos sin tocar ramas dejan un único juego nuevo; y hay una ref nueva en `refs/pignolo/wip/` de la sombra si hubo cambios sin commitear.
9. [ ] Con `/pignolo:off`, un despacho de `pignolo:explorer` sigue tomando la instantánea (`/pignolo:off` apaga la allowlist, no los respaldos). Con `PIGNOLO_DISABLED=1` no la toma.
10. [ ] Despachar un agente `pignolo:researcher` (con `omitClaudeMd`): no recibe el `CLAUDE.md` del proyecto (preguntarle qué reglas conoce del proyecto; no debe saber ninguna).
11. [ ] `pignolo:test-writer` no tiene Bash: pedirle un test y verificar que rotula el rojo como "not verified" y nombra la rotura y el comando. Correr ese comando a mano y anotar si el rojo es real.
12. [ ] El resto de los hooks del hito 1 siguen igual (repetir los puntos 2, 3 y 13 de `tests/manual/hito-1.md`).
