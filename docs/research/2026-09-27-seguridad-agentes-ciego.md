# Protección contra comandos destructivos de agentes de código: estado del arte (investigación ciega)

Fecha de la investigación: 2026-09-27. Solo lectura en la web; no se tocó ningún repositorio local.

**Leyenda de evidencia**
- **[V]** leído en la fuente original (repo, docs oficiales, advisory). Donde dice "[V, texto]" se descargó el archivo crudo y se verificó la frase literal con grep.
- **[S]** sacado de un resumen o una fuente secundaria (el resumidor web, un blog, un agregador) y no verificado palabra por palabra.
- **[NV]** inferencia mía, sin fuente.

**Advertencia de método, ocurrida en esta misma investigación:** el resumidor web afirmó que el README de dcg decía que dcg "no puede proteger contra `git -C`, `git -c`, `sudo`, `xargs`, `find -exec`". Al descargar el README crudo y buscar esas frases, **esa lista no existe**: el resumidor la inventó. La sección real de limitaciones es otra (ver §1.1). Todas las afirmaciones sobre dcg y cc-safety-net de este informe se verificaron contra el texto crudo.

---

## 1. Cómo resuelven hoy el problema las herramientas existentes

### 1.1 Guardias de comandos con hooks PreToolUse (plugins de terceros)

| Herramienta | Mecanismo | Estrellas / último push / licencia | Límites y bypasses conocidos |
|---|---|---|---|
| **dcg: Destructive Command Guard** (`Dicklesworthstone/destructive_command_guard`), Rust | Denylist por "packs" (`core.git`, `core.filesystem` siempre activos; paquetes por defecto para Windows) + pipeline de 3 niveles: regex SIMD como disparador → extracción de código embebido (heredocs, `python -c`, `bash -c`, `node -e`) → emparejamiento por AST, con análisis recursivo. Soporta Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, OpenCode y otros. | ~6.064★, actividad al 2026-09-27, **licencia propia "basada en MIT con un anexo OpenAI/Anthropic"** [V, texto]. No acepta contribuciones externas [V, texto]. | **Falla abierto por defecto** ante un sobre de hook malformado o demasiado grande ("Allow with an audit warning"; `general.fail_closed = true` lo cambia) [V, texto]. Tres advisories publicados [V]: GHSA-4cfr-w3v5-w5j5 (2026-07-14, High), *"Exponential-time command-substitution preprocessing lets a crafted command hang dcg and bypass the guard via hook-timeout fail-open"*; GHSA-qrvv-jghm-vhph (2026-08-27, High), *"ANSI-C quoted executable names bypass destructive-command matching"*; GHSA-4h58-8v93-p2cx (2026-08-27, High), *"Untrusted repository configuration can silently weaken dcg policy"*. Limitaciones que el propio README declara [V, texto]: *"A determined attacker can bypass this hook"*, *"Direct file writes via Python/JavaScript… are not intercepted"*, *"doesn't prevent loss of local-only commits"*, *"If an agent runs `./deploy.sh`, we don't inspect what's inside the script"*. Modelo de amenaza: *"assumes the AI agent is well-intentioned but fallible… not adversarial attacks"*. Aviso operativo: *"Claude Code can silently remove the dcg hook when it rewrites `~/.claude/settings.json`"*. `eval "$(cmd)"`, `source <(cmd)` y un `Invoke-Expression` dinámico **fallan cerrados** bajo reglas `heredoc.*` (issue #261), con excepciones para idiomas literales de inicialización de shell. |
| **CC Safety Net** (`kenryu42/cc-safety-net`), TypeScript | "Análisis semántico": parsers propios, acotados, de POSIX y de PowerShell (*"No third-party shell parser is embedded"*) que arman una representación intermedia estructural. Tres presets: Standard, Strict (bloquea lo dinámico o lo que no puede parsear) y Paranoid (además bloquea `rm -rf` dentro del proyecto y los one-liners de intérprete). Soporta unos 13 CLIs. | ~1.561★, push el 2026-09-26, MIT [V] | README [V, texto]: *"It does not set filesystem permissions, watch network egress, or contain a process."* SECURITY.md [V, texto]: *"best-effort, static pre-execution policy gate… not an operating-system sandbox, a privilege boundary"*; Standard *"intentionally allows dynamic executables, guarded command structure assembled through substitution, unverifiable recursive-delete targets"*; Strict/Paranoid *"are required when commands may come from prompt injection"*. PowerShell: *"not a general PowerShell parser"*; la concatenación, las subexpresiones y `Join-Path` no se evalúan. Codex `write_stdin`: lo que el modelo tipea en una sesión ya abierta no se puede inspeccionar. Hosts cuyo hook falla abierto por diseño (Grok Build). Defensa decorativa documentada: las configuraciones legacy (`.safety-net.json`) *"Their rules enforce nothing. Normal use does not show this failure because the commands now run."* Punto clave: *"A sandbox still allows `git reset --hard` inside your project."* |
| Colecciones chicas: `hex/claude-guard` (2★, MIT), `vakovalskii/destructive-guard` (2★), `karlkfi/claude-branch-guard` (3★, archivado, movido a `claude-bouncer`), `buvis/claude-aegis` (0★), `xaversebastian/agent-guardrails-kit` (0★), `deviantintegral/cc-safe-setup` (0★), `Alexander-Tyagunov/magician` (14★) | Mayormente listas de regex o patrones en Python/shell | [V] metadatos vía la API de GitHub | Sin auditoría pública; mismo diseño de denylist por texto. [NV] |

### 1.2 Mecanismos que traen los propios agentes

- **Claude Code**
  - *Reglas de permiso:* la documentación oficial dice que no son una frontera [V, texto]: *"a deny or ask rule covers the invocation Claude usually produces and isn't a security boundary around the program."* Ejemplos oficiales de lo que **no** frena cada regla: `Bash(rm *)` no detiene `/bin/rm -rf build/` ni `bash -c 'rm -rf build/'`; `Bash(git push *)` no detiene `git -C . push`, `git -c push.default=current push` ni `git 'push' origin main`. Antes de comparar, quita solo un conjunto fijo de wrappers (`timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob` y `xargs` sin flags). `watch`, `setsid`, `ionice`, `flock` y `find -exec/-delete` siempre piden confirmación. Para PowerShell parsea el AST y canoniza los alias [V]. *"Bash permission patterns that try to constrain command arguments are fragile"* [V]. Mientras ninguna regla deny o ask coincida, un hook PreToolUse que devuelve `allow` no saltea las reglas deny [V].
  - *Hooks:* solo el **exit 2** bloquea; el exit 1 sin JSON *"proceeds with the action"*; un hook que vence su timeout *"doesn't block the tool call… don't count on a stalled hook to act as a gate"* [V]. En Windows, el hook corre con Git Bash o PowerShell [V].
  - *Issues abiertos* [V, título y cuerpo leídos]: #94362 (2026-09-14): un hook sin bit de ejecución **falla abierto**, *"A safety control that cannot be executed should not fail open."* #84701 (2026-08-07): los `deny` de PreToolUse **no se aplican** a Bash lanzado por subagentes del Task tool, con repro (`find -delete`, `chmod -R 777`) y un incidente de `rm -rf` sobre el home durante 5,5 minutos. Incidentes recientes con título relevante (solo el título está verificado): #95355 (`stash pop` + `reset --hard` destruyeron ~600 líneas), #97534, #95426 (~600 GB borrados por una sustitución que resolvió a la raíz de un disco), #90943 (sesiones concurrentes en un mismo worktree).
  - *CVE del parser de comandos* [V]: CVE-2025-54795 (bypass con `echo`, <1.0.24); CVE-2025-66032 (`$IFS` y flags cortos, CVSS 8.7, corregido en 1.0.93, publicado el 2025-12-03, reportado por RyotaK / GMO Flatt Security); CVE-2025-64755 (`sed`); CVE-2026-25723 (`sed` con pipe); CVE-2026-24887 (`find`) [S, lista de advisories].
  - *Sandbox:* Seatbelt en macOS, bubblewrap en Linux/WSL2. **"Native Windows is not supported"** [V]. Permite escribir en el cwd; protege `.git/hooks` y `.git/config`, y en el cwd impide que se creen `HEAD`/`objects`/`refs` sueltos [V]. Tiene un escape `dangerouslyDisableSandbox`, que se desactiva con `allowUnsandboxedCommands: false` [V]. Cita clave [V]: *"any approach that mounts your project directory writable can still modify that code."*
  - *Auto mode* (clasificador, post del 2026-03-25) [V]: el 93% de los prompts se aprueba; tasa de falsos positivos del 0,4% en 10.000 acciones reales; **17% de falsos negativos en 52 acciones "overeager" reales**; al entrar en el modo se descartan las reglas que dan ejecución arbitraria (intérpretes con comodín, `run` de gestores de paquetes). Un estudio independiente (arXiv 2604.04978) reporta 81% de falsos negativos sobre prompts ambiguos de estrés y que el 36,8% de las acciones peligrosas pasa por Write/Edit, donde el clasificador no mira [S].
  - *Checkpoints* [V]: *"Checkpointing does not track files modified by Bash commands"*; no restauran las ediciones de subagentes que no sean forks en primer plano, ni symlinks o hardlinks; guardan 100 checkpoints por sesión y un barrido de retención los borra a los ~30 días; *"Not a replacement for version control."*
- **Codex CLI** [V]: modos de sandbox `read-only` / `workspace-write` / `danger-full-access` y políticas de aprobación `on-request` / `never` / `granular`. **En `workspace-write`, `.git`, `.agents` y `.codex` quedan en solo lectura** incluso dentro de raíces escribibles (en Linux, bubblewrap los remonta en solo lectura; issues #15505 y #14338 se quejan de que eso rompe `git commit`/`fetch`) [V docs, S detalle]. En Windows tiene un **sandbox nativo**: el modo *elevated* usa usuarios dedicados (`CodexSandboxOffline`/`Online`), token restringido con SIDs sintéticos, ACLs, firewall y setup con UAC; el modo *unelevated* usa un token restringido derivado del usuario más ACLs [V docs learn.chatgpt.com; S detalle de SIDs]. El post de OpenAI "Building a safe, effective sandbox to enable Codex on Windows" devolvió 403 [no leído]. Issue #40158: `codex exec` cae al token restringido aun con `elevated` explícito [S, título].
- **Cursor** [V]: el denylist fue **deprecado en la 1.3** después de los bypasses de Backslash y HiddenLayer. Hoy los modos de ejecución son Auto-review (clasificador), Allowlist y Run Everything. *"Auto-review is not a security boundary."* El sandbox solo existe en macOS (Seatbelt) y Linux (Landlock + seccomp); no hay mención de Windows. Permite escribir en el workspace; protege `.git/config` y `.git/hooks`. Los checkpoints son *"stored locally and separate from Git"* y solo cubren archivos que editó el agente.
- **Gemini CLI** [V]: Seatbelt (varios perfiles; el default es `permissive-open`), Docker/Podman, gVisor, LXC y un **sandbox nativo de Windows que usa `icacls` para marcar como "Low Mandatory Level"** los directorios escribibles. Ese cambio **persiste después de la sesión** (hay que revertirlo a mano con `/setintegritylevel Medium`). *"Sandboxing reduces but doesn't eliminate all risks."*
- **Cline** [S]: checkpoints en un **repo git sombra** fuera del proyecto (`globalStorage/…/checkpoints/{cwdHash}/.git`, en Windows bajo `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\checkpoints`). Anti-patrón documentado [V]: issue #9590 (2026-02-27), el feature de checkpoints **renombró el `.git` raíz del usuario a `.git_disabled`** al manejar repos anidados y además generó recursión infinita.
- **Roo Code** [V]: auto-approve con allowlist de prefijos. CVE-2026-82537 (2026-09-08, CVSS 7.7, CWE-436 *Interpretation Conflict*), *"word-boundary mismatch in comment handling between the approval gate's shell parser and bash"*. Otro CVE por omitir el operador `|&` [S]. Issue #11095: *"prefix is inherently unsafe"* [S, título].
- **Aider** [V]: por defecto **hace commit antes de editar** (dirty-commits) y después de cada edición; `/undo`. Lleva el trabajo al historial de git, así que un `reset --hard` posterior se puede recuperar por reflog. No protege si se borra `.git`. [NV]
- **OpenHands** [S]: cada sesión corre en un contenedor Docker con el workspace montado; tiene un modo de confirmación de acciones riesgosas; montar `docker.sock` equivale a root sobre el host.

### 1.3 Mecanismos del lado de git

- **No existe ningún hook** para `reset`, `checkout -- <paths>`, `clean` ni `stash drop` [V, githooks]. `post-checkout` *"cannot affect the outcome"* [V].
- **El hook `reference-transaction` sí puede abortar** actualizaciones de refs: *"In these states [preparing/prepared], a non-zero exit status will cause the transaction to be aborted"* [V]. Alcanza para frenar el movimiento o borrado de refs (reset de rama, `branch -D`, `update-ref`), no la pérdida del working tree sin commitear [NV]. Además vive en `.git/hooks` (muere con `.git`), y un agente puede desactivarlo con `git -c core.hooksPath=…` [NV].
- **Stash:** un stash borrado se puede recuperar con `git fsck --unreachable | grep commit …` mientras no corra gc [V, git-stash]. El reflog y los objetos inalcanzables expiran con gc (por defecto ~2 semanas / 30 días) [S].

---

## 2. ¿El filtrado por texto se considera derrotable? Sí, con abundante evidencia primaria

1. **Backslash Security, 2025-07-21** [V]: cuatro bypasses del denylist de Cursor (Base64, subshell, script en disco, comillas: *"For every command in a Cursor denylist, there are infinite commands not present in the denylist which… have the same behavior"*, p. ej. `"e"cho`). Cursor deprecó el denylist. Recomiendan allowlist más capas adicionales.
2. **GMO Flatt Security, "Pwning Claude Code in 8 Different Ways", 2026-01-12** [V]: `man --html=…`, `sort --compress-program sh`, `history -s … ; history -a ~/.bashrc`, `git ls-remote --upload-pa=…` (flags abreviados de git), `sed …/e`, `xargs -t`, `rg … $IFS … --pre=sh`, `${var@P}`. Conclusión textual: *"favoring an allowlist approach over a blocklist approach when implementing security-sensitive features like command execution."* Anthropic pasó a una allowlist (CVE-2025-66032).
3. **Claude Code docs** [V]: las reglas no son una frontera (ver §1.2); hay que usar el sandbox para algo que no dependa del texto.
4. **Roo Code, CWE-436** [V]: el parser del guardián y el de bash interpretan distinto. Es la clase de bug estructural de todo guardián de texto.
5. **dcg** [V]: bypass por timeout con falla abierta (ReDoS/exponencial), comillas ANSI-C `$'…'`, configuración del repo que debilita la política. Su propio modelo de amenaza excluye al adversario.
6. **CC Safety Net** [V]: *"best-effort"*, *"not… a privilege boundary"*; exige Strict/Paranoid (que falla cerrado ante lo no parseable) si hay prompt injection.

**Qué recomiendan en lugar del filtro:** (a) allowlist en vez de denylist (Flatt, Backslash); (b) una frontera del sistema operativo que no dependa del texto: sandbox, contenedor o VM (docs de Claude Code, Codex, Cursor); (c) fallar cerrado ante lo no parseable o dinámico (dcg `heredoc.*`, modo Strict de CC Safety Net, "Commands the analysis can't parse → ask" en Claude Code); (d) aceptar que el guardián es para el agente *bienintencionado pero falible*, no para el adversario.

## 3. Allowlist vs. denylist

- **Evidencia:** los dos proveedores con bypasses públicos del denylist (Cursor y Claude Code) migraron a allowlist o a un clasificador [V]. Pero las allowlists **de prefijo** también se rompen: Roo Code (CWE-436), el `git ls-remote --upload-pa` de Flatt (un comando "read-only" en la allowlist con un flag peligroso), `find -exec` [V].
- **Qué traen por defecto las herramientas maduras** [V]: Claude Code: aprobación manual, salvo un conjunto fijo de comandos read-only no configurable, y analizado a nivel de flags. Codex: `workspace-write` + `on-request` + `.git` en solo lectura + sin red. Cursor: Auto-review (clasificador) + sandbox en macOS/Linux, sin denylist.
- **Costo de los falsos positivos:** Anthropic mide que se aprueba el 93% de los prompts, es decir, **fatiga de aprobación** [V]. El sandbox de Claude Code existe para reducir prompts. CC Safety Net advierte "Occasional false positives on advanced shell" (Strict) y "Expect friction" (Paranoid) [V]. El sandbox de Codex con `.git` en solo lectura genera issues porque rompe `commit`/`fetch` [S]. Es decir, cada frontera estricta genera presión para aflojarla.
- **Síntesis** [NV]: una allowlist exacta y analizada a nivel de argumentos es defendible para comandos de bajo riesgo; un denylist sirve como red contra errores honestos, no como control. Lo que ninguno de los dos cubre es un comando permitido que destruye (un `git checkout` legítimo que pisa cambios sin commitear).

## 4. Recuperación en vez de prevención

| Mecanismo | Dónde guarda | Qué cubre | Qué no cubre |
|---|---|---|---|
| Checkpoints de Claude Code [V] | Junto a la sesión, en `~/.claude` (barrido de retención ~30 días) | Ediciones de las herramientas de archivo | **Cambios hechos por Bash**, subagentes en background, symlinks, cambios externos |
| Checkpoints de Cursor [V] | "Locally, separate from Git" | Archivos que modificó el agente | Comandos de terminal (no se documenta que los cubra) |
| Checkpoints de Cline [S] | Repo git sombra en el globalStorage de VS Code, fuera del proyecto | Estado completo tras cada uso de herramienta, incluidos archivos no trackeados | Riesgo propio: el bug #9590 renombró el `.git` del usuario [V] |
| Aider [V] | En el propio repo (commits) | Deja todo commiteado antes y después de editar, recuperable por reflog | Borrado de `.git`; commits locales sin push |
| jj (Jujutsu) [V] | Log de operaciones en el repo (`.jj`) [NV sobre la ruta] | Snapshot automático del working copy **antes de cada comando jj**; `jj undo` / `jj op restore` | Lo que un `git checkout -- .` destruye entre dos comandos jj [NV] |
| Hooks de checkpoint de terceros (`Ixe1/claude-code-checkpointing-hook`, 15★, MIT; `alessandro-martelli/claude-code-harness`, "checkpoint… on a hidden git ref") [V metadatos] | Ref oculta o repo aparte | Snapshot antes de modificar | Un checkpoint en una ref dentro de `.git` **muere con `.git`** [NV] |
| git reflog / fsck / stash [V] | Dentro de `.git` | Commits y stashes perdidos hasta el gc | `rm -rf .git`, cambios que nunca se agregaron al índice |
| Sandbox que deja `.git` en solo lectura (Codex) [V] | — | Evita que el agente destruya la base de datos de git | Worktree sin commitear (p. ej. `checkout -- .` solo escribe el worktree) [NV] |

**Por qué los datos se guardan fuera del repo:** Cline guarda su repo sombra en globalStorage (según las fuentes, para no ensuciar el historial ni el `.git` del usuario) [S]; Claude Code guarda sus checkpoints junto a la sesión [V]. Todas las fuentes insisten en que los checkpoints **no reemplazan a git** [V]. **Inferencia** [NV]: la única copia que sobrevive a `rm -rf .git`, a `git clean -fdx` y a `reset --hard` es la que está fuera del árbol del repo **y** fuera de lo que el agente puede escribir. Un `git bundle` o un repo sombra fuera del workspace cumplen la primera condición; solo una frontera del sistema operativo (ACL o usuario distinto) cumple la segunda.

## 5. Windows nativo (sin WSL2)

- **Claude Code:** sin sandbox nativo; recomienda WSL2, contenedor o VM [V]. Los hooks corren en Git Bash o PowerShell [V]. Las reglas de permiso de PowerShell analizan el AST y canonizan alias [V].
- **Codex:** es el único con **sandbox nativo real** (token restringido, usuarios dedicados, ACLs, firewall; el modo elevated requiere admin/UAC) [V/S].
- **Gemini CLI:** integridad Low mediante `icacls` (persiste después de la sesión) o Docker/Podman [V].
- **Cursor:** sandbox solo en macOS y Linux [V].
- **Windows Sandbox** [V, Microsoft Learn]: requiere Pro/Enterprise/Education (no Home) y Hyper-V; **una sola instancia a la vez**; el CLI `wsb exec` está en preview y **no devuelve la salida del proceso** (*"no support for process I/O"*); lo escrito en carpetas mapeadas con escritura persiste. Es poco práctico para ejecutar comandos de un agente [NV].
- **AppContainer / tokens restringidos / niveles de integridad** [NV + S]: son las primitivas que eligió Codex (token restringido + ACLs) y Gemini (integridad Low). No encontré un post primario legible que explique por qué Codex no eligió AppContainer (el post de OpenAI dio 403).
- **Dev Containers / Docker Desktop:** es la opción que recomiendan Claude Code y OpenHands [V/S]. Montar el repo con escritura sigue exponiendo el código [V, cita de §1.2].
- **dcg** trae paquetes para Windows activos por defecto (`del /s`, `rd /s`, `Remove-Item -Recurse`, `vssadmin delete shadows`…) y un timeout de 3000 ms en su preset de Windows [S sobre el contenido del pack; timeout V].
- **CC Safety Net:** *"Windows support for the remaining CLIs is best effort and has not been tested"* [V, texto].

## 6. Revisión entre agentes (breve)

- **Plugin oficial `code-review` de Anthropic** [S, resumen del README]: 4 agentes en paralelo e independientes (2 de cumplimiento de CLAUDE.md, 1 de bugs, 1 de historia de git), puntaje de confianza de 0 a 100 con umbral de 80, y verificación de que la guía citada realmente lo diga.
- **Tests decorativos:** la respuesta industrial documentada es la **mutación**. El ACH de Meta (FSE 2025) genera mutantes y solo acepta tests que los matan; 571 tests sobre 9.095 mutantes [S]. Un revisor adversarial que intente romper el código bajo test (o borrar la línea protegida) aplica el mismo principio [NV].
- **Clasificador de Anthropic** [V]: en dos etapas, la segunda con razonamiento solo sobre lo que la primera marcó; 17% de falsos negativos. Un juez-LLM único no alcanza como gate [NV].
- **Evitar el rubber-stamping** [NV, patrón de las fuentes]: revisores sin el contexto del autor, con mandato estrecho, que deben aportar evidencia verificable (un test que falla o un comando reproducible), no una opinión.

---

## Qué recomiendan las fuentes (mecanismos, de mayor a menor)

1. **Una frontera del sistema operativo que no dependa del texto del comando**: sandbox del SO, contenedor o VM, con `.git` y los archivos de configuración del agente **fuera del alcance de escritura** (Codex lo hace por defecto). Es lo único que sobrevive a wrappers, intérpretes, scripts en disco y bugs de parser. En Windows nativo, lo único probado es el enfoque de Codex (token restringido + ACLs + usuario dedicado).
2. **Recuperación fuera del repo y fuera del alcance del agente**: snapshot o repo sombra en otra ubicación (el modelo de Cline, pero sin mutar el repo del usuario), commits automáticos antes de editar (Aider) o el log de operaciones de jj. Nunca solo dentro de `.git`.
3. **Allowlist exacta y analizada** (no por prefijo), con **fallo cerrado** ante lo no parseable o dinámico (`eval`, `source <(…)`, `Invoke-Expression`, `[scriptblock]::Create`, globs no resueltos). La recomiendan Flatt y Backslash, y la implementan Claude Code y los modos Strict/Paranoid.
4. **Guardián de denylist semántico (dcg / CC Safety Net) como red contra errores honestos**, configurado para fallar cerrado (`general.fail_closed`, `unverified_decision=deny`, `exit 2`), con autodiagnóstico de que el hook sigue registrado y es ejecutable.
5. **Clasificador (auto mode / Auto-review)** como capa de reducción de fatiga, declarado explícitamente como "no es una frontera" (17% de falsos negativos).
6. **Instrucciones en CLAUDE.md o equivalentes**: moldean la conducta, no hacen cumplir nada (docs de Claude Code).

## Anti-patrones documentados

- **Denylist por texto como control de seguridad**: Cursor lo deprecó; Claude Code acumuló CVEs hasta pasar a allowlist.
- **Allowlist por prefijo**: bypass por *interpretation conflict* (Roo CWE-436), por flags peligrosos de comandos "read-only" (`sort --compress-program`, `git --upload-pack`, `sed …e`, `rg --pre`).
- **Un parser propio que difiere del de bash o PowerShell** (comentarios `#`, `|&`, `$'…'`, `$IFS`, `${x@P}`).
- **Guardián que falla abierto** por timeout (dcg GHSA-4cfr), por exit 1 en lugar de 2, por hook sin permiso de ejecución (#94362), por un envoltorio malformado (default de dcg), por un host sin knob de fail-closed (Grok).
- **Guardián que no está en el camino real**: subagentes que evitan el `deny` (#84701), `write_stdin` de Codex, hook borrado cuando el agente reescribe `settings.json` (dcg), configuración legacy que "no aplica nada" sin avisar (CC Safety Net), rutas `unified_exec` de Codex no interceptadas.
- **Configuración del repo capaz de aflojar la política** (dcg GHSA-4h58).
- **Checkpoints que no cubren Bash** vendidos como red de seguridad (Claude Code, Cursor).
- **Mecanismo de recuperación que muta el repo** (Cline renombró `.git` → `.git_disabled`).
- **Backups o checkpoints dentro de `.git`** (reflog, refs ocultas), que mueren con `rm -rf .git`. [NV, pero se deduce de la documentación de git]
- **Sandbox que deja el repo escribible creyendo que protege el trabajo**: *"can still modify that code"* (Claude Code); *"A sandbox still allows git reset --hard inside your project"* (CC Safety Net).
- **Cambios de sistema persistentes para "aislar"** (Gemini deja integridad Low después de la sesión).
- **Confiar en resúmenes**: en esta misma investigación, un resumidor inventó limitaciones de dcg.

## Resumen en 15 líneas

1. Los guardianes de comandos por texto (dcg, CC Safety Net, reglas de permiso) son redes contra errores honestos, no fronteras; sus propios autores lo dicen por escrito.
2. Hay evidencia primaria de que se evaden: 8 bypasses de Claude Code (Flatt, CVE-2025-66032), 4 del denylist de Cursor (Backslash), CVEs de parser en Roo Code y 3 advisories High en dcg.
3. La causa estructural es el *interpretation conflict*: el parser del guardián nunca es idéntico al del shell.
4. Los proveedores migraron del denylist a una allowlist o a un clasificador, y los dos declaran "no es una frontera" (el clasificador de Anthropic deja pasar el 17% de las acciones overeager).
5. Además, los hooks fallan abierto por timeout, por exit ≠ 2, por falta del bit de ejecución y en subagentes (issues abiertos en Claude Code).
6. Los sandboxes del SO son la recomendación unánime, pero dejan el repo escribible: `git reset --hard` sigue funcionando dentro del sandbox.
7. Codex es el único que, por defecto, deja `.git` en solo lectura dentro del workspace y tiene un sandbox nativo de Windows (token restringido + ACLs).
8. Claude Code y Cursor no tienen sandbox en Windows nativo; Gemini usa integridad Low vía icacls, que persiste.
9. Windows Sandbox no sirve para esto (una instancia, sin E/S del proceso en `wsb exec`, no existe en Home).
10. Los checkpoints de Claude Code y Cursor no cubren cambios hechos por Bash; los de Cline usan un repo sombra externo, pero una vez renombraron el `.git` del usuario.
11. Aider hace commit antes de editar y jj hace snapshot antes de cada comando: convierten lo destructivo en recuperable, salvo el borrado de `.git`.
12. Git no tiene hooks para reset/checkout/clean/stash drop; `reference-transaction` solo puede abortar cambios de refs.
13. Todo backup dentro de `.git` muere con `.git`: la copia tiene que vivir fuera del repo y fuera del alcance de escritura del agente.
14. Orden recomendado: frontera del SO con `.git` protegido → snapshot externo → allowlist exacta con fallo cerrado → guardián semántico fail-closed → clasificador.
15. Para la revisión entre agentes: revisores independientes con umbral y evidencia verificable; contra los tests decorativos, mutación (el enfoque de ACH de Meta).

## Fuentes principales (con fecha de acceso: 2026-09-27)

- dcg: https://github.com/Dicklesworthstone/destructive_command_guard (README crudo, `/security`)
- CC Safety Net: https://github.com/kenryu42/cc-safety-net (README y SECURITY.md crudos)
- Claude Code docs: https://code.claude.com/docs/en/permissions · /sandboxing · /sandbox-environments · /hooks · /checkpointing
- Anthropic, auto mode (2026-03-25): https://www.anthropic.com/engineering/claude-code-auto-mode
- Flatt Security (2026-01-12): https://flatt.tech/research/posts/pwning-claude-code-in-8-different-ways/
- GHSA-xq4m-mc3c-vvg3 (CVE-2025-66032): https://github.com/advisories/GHSA-xq4m-mc3c-vvg3 ; GHSA-x56v-x2h6-7j34 ; GHSA-7mv8-j34q-vp7q ; GHSA-mhg7-666j-cqg4
- Backslash (2025-07-21): https://www.backslash.security/blog/cursor-ai-security-flaw-autorun-denylist
- Cursor run modes: https://cursor.com/docs/agent/security/run-modes ; checkpoints: https://cursor.com/docs/agent/chat/checkpoints
- Codex: https://learn.chatgpt.com/docs/agent-approvals-security ; https://learn.chatgpt.com/docs/windows/windows-sandbox.md ; issues openai/codex #15505, #14338, #40158
- Gemini CLI sandbox: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md
- Cline: https://docs.cline.bot/core-workflows/checkpoints ; issue https://github.com/cline/cline/issues/9590
- Roo Code CVE-2026-82537: https://www.vulncheck.com/advisories/roo-code-auto-approve-bypass-via-shell-parser-word-boundary-mismatch
- Aider git: https://aider.chat/docs/git.html ; jj op log: https://docs.jj-vcs.dev/latest/operation-log/
- git: https://git-scm.com/docs/githooks ; https://git-scm.com/docs/git-stash
- Windows Sandbox: https://learn.microsoft.com/windows/security/application-security/application-isolation/windows-sandbox/ (CLI, configuración .wsb)
- Issues de Claude Code: #94362, #84701, #95355, #97534, #95426, #90943
- Meta ACH: https://arxiv.org/pdf/2501.12862
