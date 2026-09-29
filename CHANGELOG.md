# Changelog

## 0.2.1 — 2026-09-29

- `/pignolo:setup`: los conteos de reglas salen del JSON del script (en la primera corrida real el modelo contó 97 en vez de 96) y el resumen nombra la ruta de la config y cómo se resolvió cada conflicto de reglas. Hallado en el checklist manual del hito 2.
- `/pignolo:setup` reordenado: un paso por mensaje, cada uno con una parte "en pocas palabras" y el "detalle técnico" debajo (decisión del autor: la primera corrida tenía demasiado texto y sin orden). La regla queda en el spec §4.6 para todo texto al humano.

## 0.2.0 — 2026-09-29

- Hito 2: los 19 agentes (`agents/`), la tabla de roles y los perfiles de modelo (`max`, `balanced`, `economy`) con la config de usuario `~/.pignolo/config.json`, `/pignolo:setup` y el hook `PreToolUse` sobre `Agent`. Motivo: sin agentes propios, la delegación caía en `Explore`/`general-purpose`, que no llevan las herramientas ni el modelo del rol.
- Hook de `Agent`: con pignolo activo en el proyecto (existe `.pignolo/project.md` y no está apagado) solo se despachan `pignolo:*`, `pignolo-ui:ui-option` y `pignolo-ui:ui-auditor`; se niegan también `fork` y el despacho sin `subagent_type`. Fuera de un proyecto activo no se niega nada. Antes de cada despacho permitido toma la instantánea WIP y el respaldo de las ramas dentro del plazo del hook; si no alcanza, avisa y deja pasar. El proyecto activo se busca subiendo desde el `cwd` sin usar git.
- El respaldo de refs no crea un juego nuevo si el último `refs/pignolo/backup/*` es idéntico (ahora se respalda antes de cada despacho); no corta el espejo a la sombra. El último juego se busca sin listar todos (cientos de juegos daban ENOBUFS).
- `/pignolo:setup` (solo humano): chequeo de entorno, perfil, plantilla de permisos que solo agrega reglas y respalda el archivo antes de escribir, conflictos de reglas, y detección de `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, `availableModels` y agent teams. Engram queda para el hito 6. `setup` escribe y lee el settings del usuario en el `~/.claude` de Claude Code (en Windows, `USERPROFILE` aunque `HOME` difiera), acepta settings con BOM y su commit de prueba no corre hooks globales; `subagentModelForce` sigue la precedencia de los settings; una config con valores desconocidos es `config inválida`.
- Hasta que exista `/pignolo:init` (hito 8), pignolo se activa en un proyecto creando a mano `.pignolo/project.md`.

## 0.1.1 — 2026-09-29

- El launcher acepta la entrada con BOM que antepone el pipe de PowerShell 5.1 (antes negaba con "entrada JSON inválida"). Hallado en el checklist manual del hito 1.

## 0.1.0 — sin publicar

- Hito 1: esqueleto, launcher de hooks, guardia de git, instantáneas WIP, respaldo de refs, canario, interruptor y plantilla de permisos. Motivo: lecciones del proyecto de origen (`git checkout --` que borró trabajo sin commitear; stash compartido entre worktrees).
- Hito 1 (respaldos): instantáneas en un repo sombra fuera del repo (`~/.pignolo/shadow/<repo-id>.git`), sembrado en segundo plano en SessionStart, con fallback dentro del repo mientras no está sembrado; respaldo de refs fuera del repo por fetch a la sombra (en lugar de `git bundle`); retención de 14 días con la excepción de las 3 sesiones previas; launcher con plazo interno de 3 s que niega. Motivo: auditoría F1 (`rm -rf .git` se llevaba las instantáneas).
- Hito 1 (guardia de shell): analizador estructural para Bash y AST nativo para PowerShell; conjunto catastrófico siempre activo (borrar o mover `.git`, `~/.pignolo`, `~` o la raíz, y escribir en `.git/**`, `.claude/**`, `.gitconfig`, `~/.pignolo/**`); lo no verificable se niega en los modos autónomos y pide confirmación en los interactivos; `--explain`; corpus de ataques y registro de riesgo residual. Motivo: auditoría ronda 2 (F1–F12).
- Hito 1 (integración): el canario de SessionStart prueba un comando por familia de la guardia y nombra la familia caída; los respaldos de refs dentro del repo (`refs/pignolo/backup/*`) siguen la regla de retención de 14 días; requisito git ≥ 2.31.
- Hito 1 (texto por la shell): una sustitución de comandos dentro de un argumento entre comillas dobles de `-c`/`-e`/`-m`/`--message` es no verificable (salvo el heredoc con delimitador entre comillas), y la regla 6 del núcleo pide escribir archivos y mensajes con Write o `git commit -F`. Motivo: incidentes anthropics/claude-code #81273 y #84429, openai/codex #12288 y el propio (`node -e` con backticks borró un `.git`).
- Hito 1 (auditoría 3): un `cd` que pudo fallar o no correr deja el directorio desconocido (un comodín después se niega); las sustituciones dentro de `$(( … ))` se analizan; en PowerShell, los borrados por pipeline, `.Delete()`/`.MoveTo()` sobre un objeto y los alias a comandos que borran o escriben; `~/.claude/settings*.json` y `~/.claude/plugins/**` son rutas protegidas; programas que git ejecuta por `-c`, variables de entorno (`GIT_EDITOR`…) u opciones (`--upload-pack`…); `npx`/`npm exec`, `rimraf`, `sed -i`, `perl -i`, `dd of=` y `tar -C` sobre `.git`; un borrado catastrófico que no se pudo analizar se niega también con la guardia encendida. La receta de recuperación del README se prueba tal cual (con `init.defaultBranch=main` y `core.autocrlf=true`); SessionStart no habla cuando todo sale bien; los tests borran sus temporales. Motivo: auditoría ronda 3 (G1–G13).
- `pignolo-ui`, hito 1: linter del plugin, parser YAML propio, colores, fuentes de tokens, `design-md` (`validate`, `extract`, `patch`), aprobados versionados (`approve`) y la plantilla `DESIGN.md`. Detalle en `plugins/pignolo-ui/CHANGELOG.md`.
