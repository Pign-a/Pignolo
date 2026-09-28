# Auditoría independiente del plan del hito 1 (ronda 2)

- **Fecha:** 2026-09-27
- **Objeto:** `docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md` en `f5648ed` (tareas 1 a 9)
- **Auditor:** agente opus sin contexto previo, sobre un directorio vacío (no usó la copia de la que salió el plan)
- **Entorno:** Windows 11, Node 24.13.1, git 2.52.0.windows.1, PowerShell 5.1 y Git Bash
- **Veredicto:** `REQUEST_CHANGES`
- **Material de trabajo** (réplica, herramientas `hunt.js`/`demo.js`, documentación oficial descargada): `local/audits/2026-09-27-auditoria-2/` (fuera de git)

## Replay

Transcripción literal, sin arreglos: todo compiló. Los conteos de rojo y verde coinciden con el plan en las 9 tareas (T1 `1/fail 1` → `2/2`; … T8 → `324/324`; T9 `327/324/3` → `327/327`). `claude plugin validate .` pasa en T1, T8 y T9.

## Roturas de "Demostrar el rojo"

Todas fallan. Estas fallan más tests de los que nombra su tabla (que no dice "al menos"):

- T2 rotura 3 (`String(p).split('/')`): además `resolveClean joins relative paths and resolves ..`.
- T3a rotura 3 (`heredocs.splice(0)`): además `bash: unparseable input throws ParseError`.
- T5 rotura 2 (instantánea antes de evaluar): además `snapshot failure on an allowed command is reported with systemMessage, exit 0 (H7)`.
- T5 rotura 5 (`if (false) snapshot(...)`): 4 tests en total.
- T6 rotura 3: además `other commands are ignored`.

## Hallazgos (reproducidos ejecutando, salvo lo marcado como hipótesis)

| Id | Severidad | Tarea | Qué pasa | Arreglo sugerido por el auditor |
|---|---|---|---|---|
| F1 | CRITICAL | 3b | `.git` se borra con glob, variable o `find`: `rm -rf .g*`, `rm -rf .gi?`, `find .git -delete`, `G=.git; echo x > $G/HEAD`, `Remove-Item -Recurse -Force .gi*`. Demo: launcher exit 0 y `.git` desaparece, con las instantáneas `refs/pignolo/wip/*` adentro. El README promete que las instantáneas cubren estos borrados: es engañoso | Bloquear globs/dinámicos que puedan coincidir con `.git` en borrados y redirecciones; `find ... -delete` sobre `.git` como `git-dir-write` |
| F2 | MAJOR | 3b | `ParseError` sin la cadena "git" se permite: `case x in x) g''it reset --hard;; esac`. Demo: se perdió trabajo sin commitear | Ante `ParseError`, evaluar sobre texto sin comillas ni escapes, o bloquear siempre |
| F3 | MAJOR | 3b | El tope de 32 vueltas de `stripPrefix` falla abierto: `command `×33 + `git reset --hard`, `env `×40, `nohup time command `×12 | Al agotar el tope, bloquear |
| F4 | MAJOR | 3b | Formas indirectas: envoltorios (`winpty`, `watch`, `setsid`, `flock`, `script -qc`, `strace`); `source <(...)`, `bash <(...)`, `. /dev/stdin <<<`; intérpretes con código pegado (`perl -e'…'`, `ruby -e'…'`, `awk system()`, `sed e`); subcomandos de git que ejecutan shell (`submodule foreach`, `rebase -x`, `bisect run`, `difftool -x`). Demo con `source <(...)`: trabajo perdido. `python -c'…'` pegado: hipótesis, no verificado | Bloquear palabras posteriores que sean git/runner/intérprete; reglas para esos subcomandos |
| F5 | MAJOR | 3b | PowerShell armando el texto: `[scriptblock]::Create('gi'+'t …').Invoke()`, `InvokeScript`, `Set-Alias x Invoke-Expression`, `Start-Process ('gi'+'t')`, `[Diagnostics.Process]::Start`, `Invoke-Command -ScriptBlock`. Demo en PowerShell 5.1: trabajo perdido | Bloquear `::Create(`, `.InvokeScript`, `.Invoke(`, `Process]::Start`, alias hacia `iex`, programa o scriptblock dinámico |
| F6 | MAJOR | 3b + 6 | Se invoca el launcher sin que la guardia lo vea: `cd <plugin>/hooks && … | node launcher.js toggle`, o la ruta en una variable. Demo: escribió `.pignolo/.disabled` | Comparar por nombre base resolviendo `cd`; declarar la ruta dinámica |
| F7 | MINOR | 3b | Escritura del flag sin detectar: `F=.pignolo/.disabled; echo x > $F`, `cd .pig*; touch .disabled`, `node -e` y `[IO.File]::WriteAllText` con el nombre armado. Contradice el README | Chequeo dinámico en destinos de redirección; `cd` con glob = directorio desconocido |
| F8 | MINOR | 3b | Equivalentes permitidos: `update-ref refs/heads/main HEAD~5`, `checkout -B`, `switch -C`, `fetch origin +main:main`, `send-pack --force`, `merge --no-verify`; `-c remote.origin.mirror=true push` queda en `ask` | Sumar reglas |
| F9 | MINOR | 2, 3a, 5, 6 | Tablas de rojo imprecisas (ver arriba) | "Al menos" o listar todos |
| F10 | MINOR | 8 | Comentario falso en `permissions.test.js` ("mismo criterio que Claude Code"): la doc dice que el `*` final también acepta el comando sin argumentos solo si es el único comodín | `( .*)?` solo con un único `*` |
| F11 | MINOR | 5 | `protect-paths` no cubre `.git/**` ni `.claude/settings*.json`; la guardia permite escribir `.claude/settings.local.json`. Demo: alias local en `.git/config` → `git x` ejecutó `reset --hard`. La doc marca `.git` y `.claude` como rutas protegidas; que se cumpla en vivo: hipótesis | Cubrir esas rutas |
| F12 | MINOR | 3b | Falsos positivos no declarados: en PowerShell `$branch = git rev-parse --abbrev-ref HEAD` y `$s = git status --porcelain`; `git -C ../other status` | Permitir o declarar |

**Fail-open sin declarar:** F2, F3, redirecciones con destino dinámico, y `merge-main` cae a `allow` si `currentBranch` vence su plazo de 1 s (no reproducido).

**Fail-closed verificado:** 3000 `$(` anidados → `RangeError` atrapado, exit 2; entrada inválida → exit 2; la regex de `mentionsGit` es lineal (80 KB en 11 ms).

## Evasiones y falsos positivos

- 119 comandos adversariales: 67 bloqueados bien, **45 destructivos permitidos**, 7 permitidos con razón o mitigados.
- 32 comandos inofensivos de uso diario: 26 permitidos, 6 falsos positivos (3 declarados, 3 no: F12).

## Afirmaciones de plataforma (doc oficial descargada completa)

- [V] Forma exec `command` + `args`, `${CLAUDE_PLUGIN_ROOT}` en `args`.
- [V] Exit 2 en PreToolUse bloquea; exit 1 no; un hook que no arranca o vence su timeout no bloquea; `timeout` en segundos.
- [V] `permissionDecision: "ask"` se muestra con la etiqueta `[plugin:<name>]`; `systemMessage` se muestra al usuario.
- [V] UserPromptExpansion recibe `command_name`, `command_source`, `prompt`, etc.
- [NV] Qué valores recibe para una skill de plugin: el ejemplo oficial no trae espacio de nombres (`"prompt": "/example-skill arg1 arg2"`), así que no prueba que `prompt` empiece con `/pignolo:`. Queda para el checklist manual (punto 7).
- [V] Matchers de SessionStart, incluido `fork` (desde v2.1.214); `additionalContext`; ubicación de `hooks/hooks.json`; `disable-model-invocation`.
- [WRONG] El criterio de comodines de `permissions.test.js` (F10).
- Nota: Claude Code solo quita los envoltorios `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin` y `noglob` al comparar reglas de permisos; las reglas deny no cubren `env git`, `sudo git` ni `winpty git`.
