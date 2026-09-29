# Resultados del checklist manual — hito 1

Primera corrida en una sesión real de Claude Code, 2026-09-29. Windows 11, PowerShell 5.1, plugin instalado desde el marketplace local (`/plugin install pignolo@pignolo`). Se usó un repo de prueba descartable con un solo commit y sin remoto.

| Punto | Resultado | Nota |
|---|---|---|
| 1. Arranque callado con la sombra ya sembrada | Sin probar | No se reabrió la sesión en el mismo repo. Las sesiones siguientes (`PIGNOLO_DISABLED`, `/clear`) no mostraron aviso de siembra. |
| 2. `git reset --hard HEAD` se bloquea con alternativa | OK | |
| 3. `git push` pide confirmación `[plugin:pignolo]` | Sin probar | El repo no tenía remoto y el modelo no intentó el comando. Lo cubren los tests. |
| 4. `/pignolo:off`: mensaje, flag creado, guardia activa | OK | |
| 5. Borrar `.pignolo/.disabled` se bloquea | OK (Bash) | Solo se probó el pedido en lenguaje natural. PowerShell y Write los cubren los tests. |
| 6. `/pignolo:on` quita el flag | OK | |
| 7. `command_name` y `prompt` de `UserPromptExpansion` | OK en la práctica | No se capturó el payload con `--debug`. `off` y `on` dependen de ambos valores y funcionaron. |
| 8. `systemMessage` visible | OK | Se vieron los de SessionStart y UserPromptExpansion. El de instantánea fallida no se disparó. |
| 9. El modelo no puede invocar `/pignolo:off` ni el toggle | Sin probar | Lo cubren los tests (`disable-model-invocation` y la guardia sobre el launcher). |
| 10. `PIGNOLO_DISABLED=1` | OK | Aparece el aviso ⚠ al arrancar y `rm -rf .git` sigue bloqueado. |
| 11. Instantánea WIP en la sombra, ninguna en el repo, deduplicada | OK | `session_id` de PreToolUse igual al de SessionStart. 3 instantáneas para muchos comandos: solo cuando algo cambió. |
| 12. Canario con la guardia caída | OK fuera de Claude Code | En vivo no avisó. Probablemente se renombró el archivo en el fuente y no en la copia instalada (`~/.claude/plugins/cache/...`). Con una copia exacta del plugin instalado y `guard.js` renombrado, el canario nombra las cuatro familias. Repetir en vivo. |
| 13. `/pignolo:status` | OK, con un bug | **Bug:** al llamar el launcher por pipe desde PowerShell 5.1, el BOM que antepone el pipe hacía fallar el parseo ("entrada JSON inválida"). Arreglado en `45d1e99` con su test en rojo. |
| 14. `--fork-session` / `/branch` crea juego de respaldo | Sin probar | Lo cubren los tests. |
| 15. Siembra en segundo plano | OK | Apareció "sembrando el repo sombra en segundo plano" en el primer arranque. No se midió el tiempo hasta `"state": "ok"`. |
| 16. `/resume` y `/clear` | OK (`/clear`) | `/clear` cambia el `session_id`, reejecuta el arranque (con un juego de respaldo nuevo) y la instantánea siguiente va a la sombra: 4 grupos para 4 sesiones. `/resume` no se probó. |
| 17. Latencia | OK | Sin demora perceptible. Los 4–23 s por turno son razonamiento del modelo. `/pignolo:off` tomó 4 s en total. |
| 18a. `git status` por PowerShell pasa | OK | |
| 18b. `[scriptblock]::Create(...)` pide/niega | Sin probar en vivo | El modelo se negó antes de correrlo, así que el hook no lo vio. Lo cubren los tests. |
| 19. Retención de respaldos de más de 14 días | Sin probar | Lo cubren los tests. |

Aclaración sobre un falso bug: `git status` mostraba `.pignolo/` sin seguimiento. Es `.pignolo/.gitignore` (contiene `.disabled`), que el plugin crea para que se commitee con el proyecto. Es lo esperado.

## Pendiente para una segunda corrida

Repetir en vivo los puntos 1, 3 (con remoto), 12 (renombrando la copia instalada, con Claude Code cerrado), 15 (medir la siembra) y `/resume` del 16.
