# Guardia de git y respaldos de pignolo: qué hacen otros, qué dice la doc oficial y qué conviene cambiar

Fecha: 2026-09-27 · Alcance: hito 1 (`shell-parse.js`, `git-guard.js`, instantáneas WIP, respaldo de refs, interruptor) frente a la auditoría adversarial (45 de 119 comandos destructivos permitidos, hallazgos F1–F12).
Marcas: **[V]** verificado leyendo la fuente primaria o ejecutándolo; **[S]** síntesis o inferencia propia a partir de fuentes [V]; **[NV]** no verificado. Todas las URL se consultaron el 2026-09-27.
Mediciones propias en `%TEMP%\pignolo-research\bench\` (repo sintético, Windows 11, git 2.52.0.windows.1). No se ejecutó nada contra `D:\pignolo`.

---

## 1. Resumen

1. **Nadie publica una guardia de comandos que resista a un atacante, y todos lo dicen.** dcg: "assumes the AI agent is well-intentioned but fallible… not adversarial attacks" [V]. cc-safety-net: el modo estándar "is not expected to be bypass-proof against deliberately crafted shell syntax" [V]. Trail of Bits: "Hooks are not a security boundary… Guardrails, not walls" [V]. La doc de Claude Code dice que una regla deny de Bash "isn't a security boundary around the program" [V]. La mayoría de los 45 comandos que se escaparon en la auditoría están armados a propósito. Hay que clasificarlos por procedencia antes de parchear el parser (§6).
2. **F1 es el único hallazgo que rompe la promesa del spec**, porque borra la red de recuperación (§0b). La solución que convergen los demás tiene dos partes. (a) Proteger siempre el `.git` y el almacén de respaldos, como un "catastrophic set" que no depende del modo. Así lo hace cc-safety-net [V]. (b) Sacar las instantáneas del repo.
3. **Fix (1) (instantáneas fuera del repo): mantenerlo, pero cambiar `git bundle` por un repo sombra.** Un repo sombra es un `--git-dir` propio en `~/.pignolo`, sembrado con los objetos del repo y con índice persistente. Medido: la primera instantánea sin sembrar tarda 60 s, sembrada 2,1 s, y las incrementales 0,22 s [V].
4. **Fix (2) (en bash, solo git literal simple): mantener la dirección y cambiar el criterio.** El disparador no debería ser "el texto menciona git". Debería ser "hay código que se ejecuta y no se ve como argv literal": sumideros de ejecución, nombres de comando dinámicos, wrappers, intérpretes y subcomandos de git que lanzan un shell. Es lo que hacen el modo Strict de cc-safety-net y los sumideros fail-closed de dcg [V]. Cuando no se puede verificar algo, la salida es `ask` en modos interactivos y `deny` en los desatendidos [V].
5. **PowerShell:** conviene usar el parser nativo (`System.Management.Automation.Language.Parser`) en lugar de un tokenizador propio. Medido: 205–253 ms por comando lanzando `powershell.exe` [V]. Corrige F5 y el falso positivo de F12.

---

## 2. Qué hacen otras herramientas (pregunta 1)

| Herramienta | Mecanismo | Estrellas · último push · licencia | F1–F8 que frenaría | Evasiones y límites conocidos |
|---|---|---|---|---|
| **dcg** (Dicklesworthstone/destructive_command_guard), Rust | Hook PreToolUse. Patrones seguros primero y destructivos después. Por defecto **permite lo desconocido**. Paquetes `core.git` y `core.filesystem` siempre activos. Recursión en `bash -c` y escaneo de heredoc e intérpretes en tres niveles. Plazo interno de 1000 ms: al vencerse, devuelve `ask`/`deny`, no allow. En Windows, `windows.filesystem` activo por defecto (`Remove-Item -Recurse`, `rd /s`, `del /s`). | 6.064 · 2026-09-26 · NOASSERTION [V] | F2/F3 parcial: sobre raw JSON es fail-open por defecto, con `DCG_FAIL_CLOSED=1` opcional [V]. F4 parcial: `source <(...)`, `eval "$(...)"` y ScriptBlocks invocados son fail-closed (`heredoc.posix:process-substitution`, `…:eval-dynamic`, `heredoc.powershell:invoke-expression-dynamic`) [V]. F5 parcial [V]. F8: reglas `update-ref`, `update-ref-delete`, `push-force-refspec`, `symbolic-ref`, `filter-branch`, `read-tree-reset`, `checkout-force`, `git-alias-semantic-unverified` [V, IDs leídos en `src/packs/core/git.rs`]. F1: `Remove-Item -Recurse` bloqueado en Windows [V]; no hay regla específica para `.git` [NV]. | Declara: "Commands in scripts… we don't inspect", escrituras directas desde Python/JS, "A determined attacker can bypass this hook" [V]. Cobertura de `checkout -B`, `switch -C`, `rebase -x` y `bisect run`: [NV]. |
| **cc-safety-net** (kenryu42), TS | Parser propio POSIX y PowerShell, sin dependencias. Presets Standard / Strict / Paranoid. Strict "blocks dynamic or unparseable commands the analyzer cannot verify safely"; Paranoid además bloquea `rm -rf` dentro del proyecto y los one-liners de intérprete. **Catastrophic set siempre activo:** borrar `/`, borrar `~`, "destructive mutation of the protected Git metadata set" (el `.git` más cercano, el gitdir de worktrees y submódulos, el common dir y `hooks/`) y la mutación de su propia `policy.json`. En Standard, lo no verificable destructivo pasa a `ask`. | 1.561 · 2026-09-26 · MIT [V] | F1 sí, por el catastrophic set [V] (que el glob `.g*` resuelva: [NV], porque declara que no expande globs [V]). F2/F3 sí en Strict [V]. F4 sí en Strict (`shell.dynamic-executable`, cuerpos de `xargs sh -c` tratados como dinámicos) [V]. F5 parcial ("PowerShell support is partial", subconjunto conservador) [V]. F8 [NV]. | Registro público de riesgo residual RR-1…RR-10+: ejecutables armados en runtime (RR-1), estructura por sustitución (RR-2), cuerpos de scripts (RR-5), emulación de globs y brace (RR-6), aliases, funciones, PATH e IFS (RR-7), trucos de comillas (RR-8), emulación de `find` y `xargs` (RR-9). En Standard son residuales; en Strict, fail-closed [V]. |
| **Trail of Bits `claude-code-config`** | Dos hooks regex (`rm -rf` y push a main). Recomiendan correr en `--dangerously-skip-permissions` con `/sandbox` o un devcontainer. | 2.118 · 2026-08-24 · sin licencia [V] | Ninguno de forma robusta, a propósito. | "a prompt injection can work around them" [V]. |
| **Ejemplo oficial de Anthropic** (`examples/hooks/bash_command_validator_example.py`) | Regex que sugiere `rg` en vez de `grep`. Es un empujón de UX, no seguridad. | repo anthropics/claude-code [V] | Ninguno. | — |
| **mattpocock/skills `git-guardrails-claude-code`**, aihero | Hook regex para comandos git peligrosos. | 270.688 · 2026-09-24 · MIT [V; cifra de estrellas tal como la da la API] | Solo formas literales [S]. | No declara el modelo de amenaza [NV]. |
| **cc-safe** (ykdojo) | Escanea los `allow` ya aprobados en los settings. No es un hook. | 60 · 2025-12-10 · NOASSERTION [V] | No aplica (auditoría de configuración). | — |
| **parry-guard** (vaporif) | Clasificador ML (DeBERTa) de prompt injection sobre entradas y salidas de herramientas. | 45 · 2026-07-28 · MIT [V] | No aplica (detecta inyección, no comandos). | Probabilístico [S]. |
| **Codex CLI** (OpenAI) | Sandbox del sistema operativo: Seatbelt, bubblewrap, y **en Windows nativo un sandbox propio** con tokens restringidos. En `workspace-write`, ".git is protected as read-only whether it appears as a directory or file"; también `.agents` y `.codex` [V]. | 126.770 · 2026-09-28 · Apache-2.0 [V] | F1 y F11 por construcción (a nivel de SO) [V]. | Issues abiertos por `.git` de solo lectura que rompe commits y worktrees (#15505, #27418) [V]: el costo de la protección fuerte es fricción. |
| **Gemini CLI** | Allowlist por prefijo de `run_shell_command`. | 107.166 · 2026-09-28 · Apache-2.0 [V] | — | Tracebit: un prefijo permitido seguido de `;` ejecutaba cualquier cosa. Se corrigió con un policy engine [V]. |
| **Cursor** | Denylist de auto-run y luego allowlist. | — | — | Backslash (2025-07-21): la denylist se evadía con `"e"cho`, subshell, scripts y base64, y Cursor la **deprecó en la 1.3** [V]. GHSA-534m-3w6r-8pqr (2025-08-01): allowlist evadida con backticks y `$(cmd)`, corregida con "a more robust parser" [V]. GHSA-82wg-qcm4-fp2w (2026-01-14): allowlist evadida envenenando variables de entorno con built-ins [V]. |

Lecciones que se desprenden [S]:
- Las listas de bloqueo por texto fracasan siempre ante la ofuscación (Cursor).
- Las allowlists por prefijo fracasan si no se parsea la estructura (Gemini y Cursor).
- Las guardias maduras convergen en un **parser estructural con fail-closed ante lo dinámico** y un **catastrophic set innegociable**. Todo lo demás lo declaran como riesgo residual.
- Solo un sandbox de SO (Codex en Windows nativo; Claude Code solo en macOS, Linux y WSL2) cierra F1 y F11 por construcción.

---

## 3. Verificación contra la doc oficial de Claude Code (pregunta 4)

Páginas descargadas completas desde `https://code.claude.com/docs/en/<página>.md` el 2026-09-27.

- **Sandbox en Windows nativo:** "Native Windows is not supported. On Windows, run Claude Code inside a WSL2 distribution." (`sandboxing`) [V]. El sandbox protege dentro del cwd `hooks` y `config` de `.git`, los settings de `.claude` y los archivos que convertirían el cwd en un repo bare. **No** impide borrar `.git/objects` [V].
- **Wrappers que se quitan antes de comparar reglas:** `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob` y `xargs` sin flags. "This wrapper list is built in and is not configurable." `watch`, `setsid`, `ionice` y `flock` "can't be auto-approved by a prefix rule… in Manual mode they always prompt"; lo mismo pasa con `find -exec/-delete` (`permissions`) [V]. Consecuencia [S]: en modo manual F4 ya le pregunta al humano. El riesgo de F4 se concentra en `auto`, `bypassPermissions` y en un `allow` amplio.
- **Límite de las reglas de Bash:** `Bash(git push *)` no frena `git -C . push`, `git -c … push` ni `git 'push'`. "isn't a security boundary around the program" [V].
- **PowerShell:** Claude Code "parses the PowerShell AST and checks each command in a compound command independently" [V]. Es un precedente directo para usar el AST nativo.
- **Rutas protegidas (`permission-modes`):** las escrituras a `.git`, `.claude` (salvo `.claude/worktrees`), `.config/git`, `.gitconfig`, `.husky`, `.mcp.json` y otras se preguntan en `default` y `acceptEdits`, van al clasificador en `auto`, se niegan en `dontAsk` y **se permiten en `bypassPermissions`**. Un `allow` en settings no las preaprueba [V]. Cubre F11 por la herramienta Edit, salvo en bypass [S].
- **Rutas críticas para `rm`:** la raíz, los directorios de primer nivel, `~`, las raíces de unidad de Windows y **el cwd y sus padres**. También globs bajo variable, `D=$(pwd); rm -rf "$D"` y formas anidadas en `(…)`, `$(…)` y `<(…)`. `.git` **no** está en la lista, así que `rm -rf .git` no es ruta crítica [V]. En `Remove-Item` se niegan siempre los comodines al final (`\*`) y las rutas de sistema [V].
- **Qué persiste entre comandos del Bash tool (`tools-reference`):** el `cd` persiste dentro del proyecto; las variables de entorno no (salvo `CLAUDE_ENV_FILE`); **los aliases y funciones de `~/.bashrc` se aplican a todo comando** [V]. Consecuencia para F6 [S]: una ruta relativa se resuelve contra el `cwd` del payload, y un comando anterior puede haberlo cambiado. Los aliases del usuario son un riesgo residual irreducible para un análisis estático (RR-7 de cc-safety-net).
- **Hooks, fallas y timeouts (`hooks`):** un hook `command` en PreToolUse que vence el timeout "doesn't block the tool call… don't count on a stalled hook to act as a gate". Solo el exit 2 bloquea; el exit 1 no bloquea. El timeout por defecto de un hook `command` es **600 s** [V]. Un `permissionDecision: "deny"` en PreToolUse "blocks the tool even in `bypassPermissions` mode" [V]. Un `allow` de un hook no puede aprobar un `rm` sobre una ruta crítica [V].
  - Consecuencia [S]: el spec pide un "timeout explícito y chico", y eso **aumenta** la ventana de fail-open. dcg usa otro patrón: un plazo interno corto que devuelve `deny`/`ask` y un timeout del host holgado [V]. Conviene fijar el `timeout` del hook en 30–60 s y dejar dentro del launcher el plazo interno que falla cerrado.
- **Checkpoints (`checkpointing`):** "Checkpointing does not track files modified by Bash commands". Tampoco restauran las ediciones de subagentes, salvo un fork en primer plano. Guardan 100 checkpoints por sesión y se borran a los ~30 días [V]. **No sirven como red de F1 ni de ningún comando de shell** [S].
- **Guía de PreToolUse para inspeccionar comandos:** la doc remite a los hooks "to inspect the full command text with your own logic" y al sandbox "for filesystem and network enforcement that doesn't depend on the command text" [V]. No hay una guía oficial de parsing seguro [V, por ausencia en `hooks` y `hooks-guide`].

---

## 4. Almacenamiento de instantáneas (pregunta 3)

### Mediciones (repo sintético: 20.000 archivos, 82 MB, Windows nativo) [V]

| Operación | Tiempo |
|---|---|
| Commit inicial del repo (escritura de 20.000 objetos sueltos) | 75 s (probablemente por Defender y el I/O de NTFS [S]) |
| **A.** Instantánea en el repo, índice temporal copiado de `.git/index` (lo actual del plan) | 0,30 s |
| A2. Lo mismo con un índice temporal vacío (rehash completo; los objetos ya existían) | 1,40 s |
| **B.** Repo sombra `--git-dir` propio, **primera** instantánea sin sembrar | **60,2 s** |
| **C.** Repo sombra, instantánea incremental con índice persistente | **0,22 s** |
| **E.** Repo sombra **sembrado** (`fetch` de HEAD desde el repo + `read-tree` + `add -A`) | **2,15 s** |
| `git bundle create` completo del ref WIP | 0,10 s (1,3 MB; el contenido sintético comprime demasiado) |
| `git bundle` incremental `HEAD..wip` | 0,06 s (1,7 KB) |
| Recuperación byte a byte desde la sombra después de borrar el archivo en el árbol | OK (`cmp`) |

### Comparación

| Opción | Sobrevive a F1 (`rm -rf .git`) | Captura sin seguimiento / ignorados | Costo | Veredicto |
|---|---|---|---|---|
| `refs/pignolo/wip/*` en el repo (plan actual) | **No** [V por la auditoría] | Sí / no | 0,3 s | Queda solo como fallback mientras la sombra no está lista |
| `git bundle` en `~/.pignolo` | Solo si el bundle es **autocontenido**. Uno incremental "will require the revision `old`… to exist" [V git-bundle], y esos objetos mueren con `.git`. Además un bundle "will not include… index, working tree" [V]: hay que crear el commit WIP en el repo primero. | Igual que la instantánea de origen | Uno completo por comando crece con la historia [S] | **Rechazado como almacén de WIP.** Sirve como respaldo periódico de refs (`--all`) al arrancar la sesión |
| Repo sombra con `objects/info/alternates` apuntando al repo | **No:** los blobs sin cambios viven solo en el repo. git-clone `--shared`: "the cloned repository will become corrupt" si el origen pierde los objetos [V] | Sí / no | Rápido | Rechazado |
| **Repo sombra con almacén propio, sembrado y con índice persistente** | **Sí** [V: medición E y restauración] | Sí (se respeta `.gitignore` del árbol) / no | Siembra de 2 s una vez por sesión y 0,2 s por comando | **Recomendado** |
| Copiar el árbol de trabajo | Sí | Todo | Proporcional al tamaño en cada comando | Rechazado por el plazo de 4 s [S] |
| Checkpoints de Claude Code | — | No cubre Bash [V] | — | No aplica |
| VSS o snapshots del sistema de archivos en Windows | Sí | Todo | Requiere admin [NV] | Fuera de alcance |

Qué hace Cline [V, código de `sdk/packages/core/src/hooks/checkpoint-hooks.ts`]:
- El SDK actual volvió a **refs privados dentro del repo** (`refs/cline/checkpoints/<sesión>/<n>`) con un `GIT_INDEX_FILE` **persistente por sesión**, guardado en el directorio de datos de Cline y con clave `sha256(cwd + sesión)`.
- El índice persiste porque "lets git's stat cache skip re-reading (and re-hashing) untracked files" [V]. Es el mismo diseño que pignolo, y comparte su debilidad ante F1 [S].
- La extensión de VS Code usó un repo sombra con `core.worktree`. Su issue #9590 (cerrado) documenta que **renombró el `.git` del usuario a `.git_disabled`** al manejar repos anidados [V]. Regla que se desprende: nunca tocar el `.git` del usuario ni los `.git` anidados.

Detalles de diseño para la sombra [S, salvo donde se marca]:
- Ruta `~/.pignolo/shadow/<repo-id>.git`, con el `repo-id` que ya define el spec §8.2. Siempre se invoca con `--git-dir` y `--work-tree` explícitos, sin `core.worktree` persistido.
- En la sombra, `core.autocrlf=false` para guardar byte a byte. Sin eso aparecieron avisos de conversión CRLF en la medición [V].
- Copiar `.git/info/exclude` del repo a la sombra, porque la sombra no lo ve.
- Índice por sesión (como Cline) para evitar peleas por `index.lock` entre sesiones.
- Sembrar en `SessionStart` de forma asíncrona. Hasta que termine, usar el fallback en el repo (0,3 s).
- Los submódulos y repos anidados quedan como gitlink, sin contenido: declararlo.
- Los archivos ignorados (`.env`, `node_modules`) **no** se capturan. Es a propósito: por volumen y porque capturarlos copiaría secretos (spec §6.1 regla 5).
- **La guardia tiene que proteger `~/.pignolo/`** con la misma fuerza que `.git`. El `~` es ruta crítica para Claude Code, pero `~/.pignolo` no lo es [V].

---

## 5. Cada hallazgo con su mejor arreglo

| Hallazgo | Arreglo mejor respaldado | Fuente |
|---|---|---|
| **F1** borrar `.git` (glob, variable, `find`, `Remove-Item .gi*`) | (a) Repo sombra fuera del repo (§4). (b) Catastrophic set siempre activo: cualquier `rm`/`rmdir`/`Remove-Item`/`rd`/`del`/`find -delete`/`mv`/`robocopy /MIR` cuyo operando sea `.git` o `~/.pignolo`, **o cuyo operando tenga glob, variable o sustitución y resuelva en la raíz del repo** → deny (sin intentar expandir el glob). (c) Lo mismo en el hook de Edit/Write. | cc-safety-net catastrophic set [V]; su RR-6 "no expande globs" [V]; Codex `.git` de solo lectura [V]; el spec §0b |
| **F2/F3** fail-open si falla el parseo y el texto no dice "git", o si se llega al tope de 32 | Parseo fallido o tope alcanzado → **deny siempre** (`ask` en modos interactivos si se quiere menos fricción), sin mirar el texto. Aplica también al JSON crudo inválido. | Strict de cc-safety-net [V]; `unverified_decision` de dcg [V]; spec §11.6 "Rechaza lo que no puede parsear" |
| **F4** wrappers, `source <(…)`, `bash <(…)`, intérpretes, subcomandos de git que ejecutan shell | Tres clases estructurales. (1) **Wrappers conocidos:** se quitan y se reevalúa lo que envuelven (`timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, `xargs`, `env`, `watch`, `setsid`, `ionice`, `flock`, `winpty`, `script -c`, `strace`, `sudo`, `chronic`, `unbuffer`). Un **comando desconocido con un token `git` en argv** → deny. (2) **Sumideros de ejecución:** `eval`, `source`/`.` de algo no literal, sustitución de procesos como programa, un shell o intérprete que lee stdin, `-c/-e/-E/-r` con código, y `awk`, `sed` (`e`/`s///e`), `perl`, `ruby`, `python`, `node`, `php` y `find -exec` con código que tenga un primitivo de ejecución → deny. (3) **Git que lanza shell:** `rebase -x/--exec`, `submodule foreach`, `bisect run`, `difftool -x/--extcmd`, `mergetool`, `filter-branch`, `-c core.editor/sequence.editor/core.pager/core.fsmonitor/core.hooksPath/alias.*=!…` → deny. | Lista de wrappers de la doc de Claude Code [V]; sumideros fail-closed de dcg [V]; Strict de cc-safety-net [V] |
| **F5** PowerShell arma el código en strings (`[scriptblock]::Create`, `InvokeScript`, `Set-Alias x iex`, `Process]::Start`) | Parsear con el **AST nativo** de PowerShell (medido: ~0,2 s). Negar todo `CommandAst` cuyo nombre no sea una palabra literal, toda `InvokeMemberExpressionAst` sobre `[scriptblock]`, `[Diagnostics.Process]`, `$ExecutionContext` o `.InvokeScript`, `Set-Alias`/`New-Alias` hacia `iex`/`git`/`Invoke-*`, `-EncodedCommand`, `Start-Job`/`Invoke-Command -ScriptBlock`. | Claude Code parsea el AST de PS [V]; dcg `invoke-expression-dynamic` [V]; medición propia [V] |
| **F6/F7** interruptor por `cd` más ruta relativa o variable; flag escrito con una redirección dinámica | Resolver las rutas contra `payload.cwd` [V: el cwd persiste]. Un destino de redirección dinámico → deny. **Aceptar el residuo:** un agente puede falsificar el stdin del launcher, así que el interruptor no es un límite de seguridad. Lo que importa ya lo cumple el spec: `/pignolo:off` **no** apaga la guardia ni los respaldos (§3.3). | Doc de `tools-reference` [V]; spec §3.3 |
| **F8** equivalentes (`update-ref`, `checkout -B`, `switch -C`, `fetch +main:main`, `send-pack --force`, `merge --no-verify`) | Agregar reglas. `send-pack`, `push --mirror`, `push +ref` y `fetch +src:dst` sobre la rama activa → deny: **no son recuperables localmente**. `--no-verify`/`-n` en `commit`, `merge`, `rebase`, `am` y `push` → deny. `update-ref` y `symbolic-ref` fuera de `refs/pignolo/` → ask. `checkout -B` y `switch -C` sobre una rama existente → ask. Los movimientos de ref locales quedan cubiertos por el reflog `never` y el respaldo de refs: por eso ask y no deny. | IDs de dcg `update-ref`, `push-force-refspec`, `symbolic-ref`, `filter-branch` [V]; spec §11.6 reflog [V] |
| **F11** alias en `.git/config` local y `.claude/settings.local.json` | El hook de Edit/Write protege `.git/**`, `.claude/**` (salvo `.claude/worktrees`), `.gitconfig` y `~/.pignolo/**`, para cubrir `bypassPermissions`, donde la protección nativa no rige [V]. En shell, cualquier escritura de `git config` (no solo `alias.*`) → deny, salvo una allowlist de claves. En `SessionStart`, leer `git config --get-regexp '^alias\.'` y tratar `git <alias>` como su expansión, o deny si empieza con `!`. | Rutas protegidas de Claude Code [V]; dcg `git-alias-semantic-unverified` [V, solo el ID] |
| **F12** falsos positivos (`$b = git rev-parse …`, `git -C ../x status`) | El AST de PS reconoce la asignación con un `CommandAst` literal y la permite. `-C`/`--git-dir`/`--work-tree` se permiten con subcomandos de solo lectura y se niegan con destructivos. dcg primero confirma el patrón seguro y después busca el destructivo. | dcg "Whitelist-First Architecture" [V] |

---

## 6. Veredicto sobre los dos arreglos (pregunta 2)

**Fix (1): instantáneas en `~/.pignolo/`. MANTENER Y CAMBIAR EL MEDIO.**
- `git bundle` no sirve como almacén de WIP. Uno incremental depende de objetos que viven en el `.git` que se quiere proteger, y uno completo en cada comando no escala [V/S].
- Conviene un **repo sombra con almacén de objetos propio, sembrado por `fetch` desde el repo, con índice persistente por sesión**. Medido: siembra de 2,1 s y 0,22 s por comando. Cabe en el plazo de 4 s [V].
- `git bundle --all` sí sirve como respaldo periódico de refs al arrancar la sesión, porque protege lo commiteado aun sin `.git` [S].
- Hay que proteger `~/.pignolo` en la guardia.

**Fix (2): en bash, git solo en forma literal simple, y lo demás bloquea. MANTENER LA DIRECCIÓN Y CAMBIAR EL DISPARADOR.**
- Es hacia donde converge el Strict de cc-safety-net: "blocks dynamic or unparseable commands the analyzer cannot verify safely" [V].
- Pero "menciona git" es a la vez demasiado amplio y demasiado estrecho [S]:
  - **Demasiado amplio:** en el repo de pignolo muchos comandos legítimos mencionan git como dato (`grep "git reset --hard" tests/`, `rg git`, `echo`). Esto es crítico porque el propio repo del plugin lo va a pisar a diario.
  - **Demasiado estrecho:** `echo … | base64 -d | sh` no menciona git.
- El disparador correcto es "**hay ejecución que no se ve como argv literal**": las clases de F4 más un nombre de comando dinámico. Un token `git` solo dispara en argv de un comando **desconocido**, nunca en posiciones de dato de comandos inertes conocidos.
- Costo de falsos positivos que reportan otros: Strict, "Occasional false positives on advanced shell"; Paranoid, "Expect friction" [V]. dcg: "False positives are the design constraint" [V]. **Nadie publica tasas numéricas** [NV]. Codex muestra el extremo: su `.git` de solo lectura genera issues por commits imposibles [V].

**¿Hay una arquitectura mejor? Sí, y combina tres cosas [S]:**
- La guardia como capa de UX y de errores honestos, fail-closed en lo estructural.
- La **recuperación fuera del repo** como red real.
- Un **catastrophic set** chico e innegociable.

Para amenazas adversariales, lo que corresponde es un sandbox de SO: WSL2 con `/sandbox` o un devcontainer [V doc]. Los worktrees por tarea del hito 7 reducen además el radio de F1: en un worktree enlazado, `.git` es un archivo que apunta al repo principal [S, a verificar en el hito 7].

---

## 7. Arquitectura recomendada para el hito 1 (≤ 10 líneas)

1. Modelo de amenaza escrito: agente útil pero falible. Lo adversarial queda fuera de los hooks y se deriva a WSL2+sandbox o devcontainer.
2. Red real: repo sombra en `~/.pignolo/shadow/<repo-id>.git` (sembrado en SessionStart, 0,2 s por comando), fallback en el repo mientras no esté listo, `bundle --all` de refs al arrancar y reflog `never`.
3. Catastrophic set siempre activo, incluso con `PIGNOLO_DISABLED`: borrar o mover `.git`, `~/.pignolo`, `~` o la raíz del repo por cualquier forma, glob o variable; y escribir en `.git/**`, `.claude/**` o `~/.pignolo/**`.
4. Guardia bash estructural: parseo fallido, tope, nombre dinámico, sumidero de ejecución, wrapper desconocido con git, o git que lanza shell → deny en `auto`/`bypass`/`dontAsk` y ask en los demás modos (leyendo `permission_mode`).
5. Reglas de git: primero lo seguro (allowlist de formas de solo lectura y comunes) y después lo destructivo, con F8 incluido. Deny para lo no recuperable (remoto, `--no-verify`); ask para lo recuperable por reflog.
6. PowerShell con el AST nativo (`powershell.exe -NoProfile`, ~0,2 s). Si no arranca → deny.
7. Launcher: plazo interno que niega (≈3 s) y `timeout` del hook de 30–60 s, no chico.
8. Interruptor: declarado como no-límite. La guardia no depende de él.
9. Tests: corpus `must-block` y `must-allow` (el `must-allow` sale de comandos reales de las transcripciones del autor), registro de riesgo residual y un canario por familia.

---

## 8. Qué declarar fuera de alcance

- Prompt injection o agentes adversariales. Los hooks no son un límite: lo dicen la doc de Claude Code, ToB, dcg y cc-safety-net [V].
- El contenido de scripts invocados (`node x.js`, `bash x.sh`), según RR-5 de cc-safety-net [V]. La red es la instantánea.
- Aliases y funciones de `~/.bashrc`, que Claude Code aplica a todo comando [V], y la mutación de PATH o IFS (RR-7).
- Expansión exacta de globs, brace e IFS (RR-6). Se sustituye por la regla conservadora de F1.
- Cadenas reconstruidas en runtime dentro de intérpretes (RR-4).
- Hooks que vencen o no arrancan [V]. Timeouts del host.
- Archivos ignorados y contenido de submódulos en las instantáneas.
- Rutas 8.3 y enlaces simbólicos hacia los flags (ya declarado en el plan).
- Falsificación del interruptor por un agente que invoca el launcher.
- Borrados de `~/.pignolo` por procesos que no pasan por Bash o PowerShell (un programa compilado, por ejemplo).

---

## 9. Patrones de revisión reutilizables (pregunta 5)

- **Registro de riesgo residual adjudicado una sola vez** (cc-safety-net `docs/residual-risk.md` y `REVIEW.md`) [V]. Clasificación en orden fijo: fuera de alcance → nunca-residual (must-fix) → familia existente → falso negativo con procedencia realista (must-fix) → construido sin prueba (evidence-invalid) → familia nueva.
  - "Uncertainty never creates a new family."
  - Una familia nueva exige **un clasificador independiente, sin historial, con prompt neutro**, y acuerdo en todas las compuertas. Encaja directo con `refuter` y `judge-a`/`judge-b` de pignolo.
  - Tope: "one review-driven remediation pass and one confirmation review" y después clasificar, para cortar la carrera de parches al parser. Es justo el riesgo que tiene la auditoría actual.
- **El corpus crece con evidencia, no con imaginación:** las nuevas entradas `must-block` salen de evidencia de campo, y cada familia aceptada lleva un fixture fail-closed del modo estricto [V].
- **Herramientas de diagnóstico:** `dcg test`, `dcg explain` (traza de la decisión) y `dcg test --enforce-budget` [V]; `cc-safety-net explain` y `doctor` [V]. Para pignolo: un `node lib/git-guard.js --explain "<cmd>"` que los revisores puedan ejecutar [S].
- **Pruebas diferenciales contra shells reales [S]:** correr el corpus en Git Bash y en `powershell.exe` dentro de un directorio temporal, con `git`, `rm` y los wrappers reemplazados por shims que registran el argv, y comparar ese argv con el que predice `shell-parse.js`. Para PowerShell, el AST nativo sirve de oráculo. Riesgo: ejecuta el corpus, así que solo en un directorio desechable, con PATH aislado y sin los binarios reales.
- **Corpus `must-allow` desde las transcripciones reales** (`~/.claude/projects/*/*.jsonl`, comandos Bash y PowerShell) para medir la tasa de falsos positivos antes de fijar deny o ask [S].

---

## 10. Preguntas que decide el autor

1. **¿Deny o ask ante lo no verificable?** En modo interactivo, `ask` baja la fricción. En `auto`/`bypass`, `ask` es ambiguo en la doc: dcg lo trata como `deny` [V]. ¿Aceptás leer `permission_mode` y cambiar de conducta según el modo?
2. **Tasa de falsos positivos tolerable.** Nadie publica números. ¿Medimos con tus transcripciones y fijamos un umbral (por ejemplo, ≤ 1 % de comandos reales bloqueados)?
3. **Presupuesto de disco y retención del repo sombra.** La siembra copia la historia empaquetada; hay que elegir qué se poda y cuándo. Conviene alinearlo con la poda de 14 días de `close-session`.
4. **¿Instantáneas de archivos ignorados?** Recomendación: no, por secretos y volumen. Consecuencia: un `rm .env` no se recupera.
5. **¿El catastrophic set se apaga con `PIGNOLO_DISABLED=1`?** cc-safety-net no permite apagarlo [V].
6. **¿Se acepta pagar ~0,2 s por comando de PowerShell** para usar el AST nativo, o se mantiene el tokenizador propio con el AST solo como oráculo en los tests?
7. **¿Recomendar o exigir WSL2 con `/sandbox`** para correr pignolo en `auto` o `bypassPermissions`? El spec §1.8 ya reconoce que en Windows nativo no hay sandbox.
8. **¿Se mantienen los refs WIP dentro del repo** como segunda copia (0,3 s) o solo como fallback hasta que la sombra esté sembrada?
9. **¿Se declara el interruptor como forjable** y se deja así, o se le agrega registro y alerta? El registro también es forjable [S].

---

## Fuentes

- Claude Code docs (páginas completas en `.md`, consultadas el 2026-09-27): https://code.claude.com/docs/en/sandboxing · /permissions · /permission-modes · /hooks · /hooks-guide · /checkpointing · /tools-reference
- dcg README y `src/packs/core/git.rs`: https://github.com/Dicklesworthstone/destructive_command_guard
- cc-safety-net README, SECURITY.md, REVIEW.md, docs/residual-risk.md: https://github.com/kenryu42/claude-code-safety-net
- Trail of Bits: https://github.com/trailofbits/claude-code-config
- Ejemplo de hook de Anthropic: https://github.com/anthropics/claude-code/blob/main/examples/hooks/bash_command_validator_example.py
- mattpocock git-guardrails: https://github.com/mattpocock/skills/blob/main/skills/misc/git-guardrails-claude-code/SKILL.md
- cc-safe: https://github.com/ykdojo/cc-safe · parry-guard: https://github.com/vaporif/parry-guard
- Codex, aprobaciones y seguridad: https://learn.chatgpt.com/docs/agent-approvals-security (redirige desde developers.openai.com/codex/agent-approvals-security) · issues https://github.com/openai/codex/issues/15505 y /27418
- Gemini CLI y Tracebit: https://tracebit.com/blog/code-exec-deception-gemini-ai-cli-hijack
- Cursor: https://www.backslash.security/blog/cursor-ai-security-flaw-autorun-denylist · https://github.com/cursor/cursor/security/advisories/GHSA-534m-3w6r-8pqr · https://github.com/cursor/cursor/security/advisories/GHSA-82wg-qcm4-fp2w
- Cline: https://docs.cline.bot/core-workflows/checkpoints · `sdk/packages/core/src/hooks/checkpoint-hooks.ts` en https://github.com/cline/cline · issue https://github.com/cline/cline/issues/9590
- git: https://git-scm.com/docs/git-bundle · https://git-scm.com/docs/git-clone (nota de `--shared`) · https://git-scm.com/docs/gitrepository-layout
