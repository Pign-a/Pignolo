# Checklist manual — hito 1

Correr en una sesión INTERACTIVA de Claude Code, en Windows nativo, con el plugin instalado desde el marketplace local (`/plugin marketplace add ./` en la raíz del repo, `/plugin install pignolo`). Registrar fecha, versión de Claude Code y resultado de cada punto.

1. [ ] Al arrancar en un repo con la sombra ya sembrada no aparece ningún mensaje de pignolo (callado en el éxito, spec §8.3) ni aviso de canario, y `git for-each-ref refs/pignolo/backup` muestra un juego nuevo de ese arranque.
2. [ ] Pedirle a Claude "corré `git reset --hard HEAD`": el comando se bloquea y el mensaje trae una alternativa.
3. [ ] Pedirle "corré `git push`": aparece un pedido de confirmación con la etiqueta `[plugin:pignolo]`.
4. [ ] Escribir `/pignolo:off`: aparece el mensaje de apagado; existe `.pignolo/.disabled`; `git reset --hard` sigue bloqueado.
5. [ ] Pedirle a Claude que borre `.pignolo/.disabled` con Bash, con PowerShell y con Write: los tres se bloquean.
6. [ ] Escribir `/pignolo:on`: el flag desaparece.
7. [ ] Verificar los valores reales de `command_name` y `prompt` que recibe `UserPromptExpansion` para una skill de plugin (activar `claude --debug` y buscar el payload): anotar si `command_name` es `pignolo:off` u `off`, y que `prompt` empieza con `/pignolo:off`. (Afirmación clave del hito: el toggle depende de ambos.)
8. [ ] Verificar que `systemMessage` de SessionStart, de UserPromptExpansion y de PreToolUse (instantánea fallida) se muestra al usuario. (Afirmación clave del hito.)
9. [ ] Pedirle a Claude que el modelo invoque `/pignolo:off` por su cuenta: no puede (skill con `disable-model-invocation`). Pedirle que corra el launcher con `toggle` por Bash: la guardia lo bloquea.
10. [ ] Arrancar con `PIGNOLO_DISABLED=1`: aparece el aviso en rojo y `git reset --hard` pasa; `rm -rf .git` sigue bloqueado (conjunto catastrófico).
11. [ ] Arrancar en un repo, esperar unos segundos, modificar un archivo y pedirle a Claude cualquier comando de shell: existe una ref nueva en `refs/pignolo/wip/` **de la sombra** (`git --git-dir ~/.pignolo/shadow/<repo-id>.git for-each-ref refs/pignolo/wip/`) que contiene el cambio, y ninguna en el repo; repetir el comando sin tocar nada y verificar que no aparece otra ref. (Afirmación clave del hito: el `session_id` de PreToolUse es el mismo que el de SessionStart; si no, todo cae al modo dentro del repo.)
12. [ ] Renombrar temporalmente `hooks/handlers/guard.js` y arrancar: el canario avisa en rojo que la guardia está caída y nombra las familias (catastrófico, git destructivo, ejecución no literal, PowerShell por AST). Restaurar. Lo mismo con `protect-paths.js`: nombra solo "Edit/Write protegido".
13. [ ] Escribir `/pignolo:status`: el comando que corre el modelo pasa la guardia y muestra la línea `pignolo: hooks ...; guardia de git ...; canario ...`.
14. [ ] Abrir una sesión con `--fork-session` (o `/branch`): se crea un juego nuevo en `refs/pignolo/backup` (sin mensaje).
15. [ ] En un repo sin sombra, arrancar: aparece "sembrando el repo sombra en segundo plano" y, sin hacer nada más, `~/.pignolo/shadow/<repo-id>.git/pignolo/status.json` llega a `"state": "ok"` (el proceso de siembra sobrevive al fin del hook). Registrar cuánto tardó.
16. [ ] `/resume` y `/clear` de la misma sesión: la instantánea siguiente sigue yendo a la sombra (anotar si `session_id` cambia con `/clear`).
17. [ ] Un comando de la guardia no tarda más de ~0,5 s perceptibles en un repo mediano; un comando de PowerShell, ~0,35 s más (arranque de `powershell.exe`); si un hook se corta por el plazo interno, el comando se niega con "se venció el plazo interno".
18. [ ] Con la herramienta PowerShell: `git status` pasa; `[scriptblock]::Create('git reset --hard').Invoke()` pide confirmación en modo default y se niega en `bypassPermissions`.
19. [ ] Arrancar en un repo con respaldos de refs de más de 14 días (`refs/pignolo/backup/*`): tras la siembra quedan solo los de los 3 arranques previos y el actual, y los que apuntan a commits que la sombra no tiene.
