# Auditoría de las reglas que frenan al agente (pignolo, 2026-10-02)

## Decisiones del autor sobre esta auditoría (2026-10-02)

**Principio:** la guardia frena al agente en los comandos realmente peligrosos y no lo frena en la actividad común. Dos preguntas para toda regla: ¿se pierde algo que no se puede recuperar? ¿la guardia puede saberlo con certeza? Si no, no frena.

- **D-G1: todos los ajustes técnicos de esta auditoría** (los cambios 1, 2, 4, 7, 8 y 9 de §4): `inline-code` se niega solo cuando el código inline llama a git o borra algo protegido o calculado; leer el launcher (`pignolo-launcher`) deja de bloquearse, solo se bloquea ejecutarlo; `dynamic-redirect` se permite salvo que la parte literal nombre `.git` o `.pignolo`; `catastrophic-delete` resuelve `mktemp`, las variables de un `for`, los comodines con prefijo literal y `find -delete` sobre rutas temporales; `dynamic-argument`, `protected-flag`, `unparseable` (`case`) y `dynamic-command` se angostan como dice §4 y §6; la plantilla de permisos pierde la familia "el texto menciona git" y la entrada `git restore *`, que además negaba `--staged`.
- **D-G2: lo recuperable pasa, con la instantánea tomada antes:** `git checkout <ref> -- <archivos literales>`, `git checkout -- <archivos>`, `git restore` de archivos concretos (y `--ours` / `--theirs`), `git stash` / `stash push` / `pop` / `apply`. Siguen negados `stash drop` y `stash clear`, y las formas no literales o de árbol entero que esta auditoría deja cerradas.
- **D-G3: plazo del launcher:** cuando vence el plazo de 3 s, un comando de solo lectura POR ESTRUCTURA pasa; lo que escribe, borra o no se puede clasificar sigue negado.
- **D-G4: la instantánea se toma solo antes de los comandos que pueden descartar trabajo** (checkout, restore, stash, reset, clean, rm y similares, como lista cerrada derivada de la clasificación de la propia guardia), no antes de todo comando. Un comando que la guardia no puede clasificar sigue teniendo instantánea.
- **No tocar:** la lista de §5.
- **Sin decidir (fuera del plan):** `git branch -d` sin confirmación, `*navigate*` en el ask de MCP, `--force-with-lease` sobre la rama propia.

Plan que las implementa: [`docs/plans/2026-10-02-guardia-sin-tropiezos.md`](../plans/2026-10-02-guardia-sin-tropiezos.md).

## Alcance y método

Principio del autor: la guardia frena lo REALMENTE peligroso y no frena la actividad común.
Estado auditado: rama `core/guard-sin-confirmar-push` (núcleo 0.14.1). Solo lectura. Los 181 comandos bloqueados que se midieron salen de las transcripciones de una sesión de desarrollo; el plan los versiona saneados (sin rutas ni nombres privados) en `tests/guard/medidos.json`.

Marcas: **(M)** medido en esta auditoría, **(I)** inferido de lo medido o del código, **(S)** supuesto.

## 0. Lo medido

- Transcripciones de la sesión de desarrollo: 199 archivos, 10.820 llamadas a herramientas, 7.460 Bash, 59 PowerShell, 1.658 Edit/Write, 198 Agent (M).
- **181 llamadas bloqueadas por el hook de pignolo** (171 en subagentes, 10 en el hilo principal), en 97 de las 199 transcripciones (M). 2 son de esta misma auditoría (leer `launcher.js`).
- Reintentos: cada bloqueo costó al menos una llamada más; en 7 casos el reintento también fue bloqueado (cadena máxima de 2) (M). El texto de los comandos bloqueados suma 211.589 caracteres, ≈ 60.000 tokens de salida tirados, y hubo que reescribirlos (I).
- **Ninguno de los 181 bloqueos frenó un daño real** en lo que leí: los 12 "catastróficos", los 13 de plazo y los 14 de stash completos, y una muestra de 7 por regla del resto (M sobre lo leído, I sobre el resto).
- La versión instalada es la 0.2.1 (52 reglas, un solo hook por Bash). Reevalué cada comando bloqueado con el código actual: **166 de 181 siguen bloqueados**; los 15 que hoy pasan son los 13 de plazo y 2 sueltos, y el plazo sigue existiendo (M).
- Los `ask` no dejan rastro en las transcripciones: su frecuencia no se pudo medir. Las reglas `push` y `merge-main` (ask) de la 0.2.1 ya no existen.
- La plantilla `permissions.json` no está instalada en esta máquina: su fricción es inferida, no medida.
- Reglas nuevas que la 0.2.1 no tiene (9: `pignolo-run`, `-plan`, `-init`, `-holdout`, `-queue`, `-worktree-tools`, `-protected-refs`, `subagent-main`, `sabotage-lock`): sin medición de campo.

| Bloqueos (M) | Regla | ¿Sigue en el código actual? |
|---|---|---|
| 51 | `inline-code` | sí, 51 de 51 |
| 35 | `pignolo-launcher` (todos eran lecturas: `cat`, `sed -n`, `grep`, `git diff`) | sí, 35 de 35 |
| 17 + 1 + 3 | `checkout-path`, `restore`, `git-C` | sí (20 de 21) |
| 16 | `dynamic-redirect` | sí |
| 14 | `stash` (13 eran `git stash; test; git stash pop` en la misma línea) | sí |
| 13 | plazo interno de 3 s (10 Bash, 3 PowerShell) | el plazo sigue; los 13 comandos eran permitidos |
| 12 | `catastrophic-delete` (temporales, `*.log`, `rm "$f"` de un `mktemp`) | sí, 12 de 12 |
| 5 | `dynamic-argument` (2 eran `for b in <lista literal>; do git merge $b`) | sí |
| 5 | `protected-flag` (comodín o variable con el texto "pignolo" o "disabled") | sí |
| 4 + 2 + 1 + 1 + 1 | `unparseable`, `dynamic-command`, `hidden-code`, `quoted-substitution`, `ps-unavailable` | sí |

Por clase de daño de la regla que bloqueó: no verificable 84, política 40, recuperable 32, irreversible 12 (los 12, falsos positivos), plazo 13.

## 1. Tabla A — reglas de `git-guard.js` (59 ids: 2 catastróficas, 35 deny, 16 no verificables, 6 ask)

Veredictos de ejemplo medidos con `evaluate` en modo `bypassPermissions` (M). "Frec." = cuánto la pisa un agente honesto.

### A.1 Daño irreversible (11)

| Regla | Qué frena (ejemplo) | Frec. y evidencia | Costo del freno | Recomendación | Riesgo residual |
|---|---|---|---|---|---|
| `catastrophic-delete` | `rm -rf .git`, `rm -rf ~`, `rm -rf *` en la raíz. También, hoy: `f=$(mktemp); rm "$f"`, `rm -f build-*.log`, `mv "$f.bak" "$f"`, `find . -name "*.bak" -delete`, `gci $env:TEMP -Filter x-* \| Remove-Item` | a menudo: 12 bloqueos, 12 falsos (M) | deny sin salida útil ("lo hace el humano"); rige aun con `/pignolo:off` | **Mantener el núcleo, angostar el disparador**: (a) variable asignada en el mismo comando desde `mktemp`, un literal o la lista literal de un `for` se resuelve; (b) un comodín con prefijo literal que no empieza con punto (`build-*.log`) no puede tocar `.git`: permitir; (c) `find <dir> -name <patrón> -delete` no borra `<dir>`: evaluar el patrón, no el punto de partida; (d) en PowerShell, `$_.FullName` de un `Get-ChildItem` con raíz literal fuera de lo protegido | `rm -rf s*` en la raíz borra `src/`: recuperable por git y por la instantánea |
| `protected-path` | escribir en `.git/`, `.gitconfig`, `~/.pignolo`, `~/.claude/settings*.json`, `~/.claude/plugins` (`echo x > .git/info/exclude`) | rara: 0 (M) | deny claro | **Mantener** | — |
| `reset-hard` | `git reset --hard HEAD~1`, `--merge` | rara: 0 (M) | deny con alternativa (`--soft`, `revert`) | **Mantener**. Nota: la instantánea previa lo vuelve recuperable salvo lo ignorado, pero si la instantánea falla no hay red | — |
| `clean` | `git clean -fd`, `-fdx` (pasa `-n`) | rara: 0 (M) | deny; "borrá a mano" | **Mantener** (`-x` borra ignorados que la instantánea no guarda) | — |
| `worktree-remove-force` | `git worktree remove --force ../wt` | rara: 0 (M) | deny con alternativa | **Mantener** (la instantánea solo cubre el worktree del `cwd`) | — |
| `gc-prune` | `git gc --prune=now`, `git prune` | rara | deny | **Mantener** | — |
| `reflog-expire` | `git reflog expire --all`, `refs migrate --no-reflog` | rara | deny | **Mantener** | — |
| `push-force` | `git push -f`, `--force-with-lease`, `+ref`, `--mirror`, `--prune` | rara: 0 (M) | deny; alternativa "commit nuevo" | **Mantener**. `--force-with-lease` sobre la rama propia de la tarea es decisión del autor | — |
| `send-pack` | `git send-pack ...` | rara | deny | **Mantener** | — |
| `pignolo-ref` | `git update-ref -d refs/pignolo/backup/x` | rara | deny | **Mantener** (son los respaldos) | — |
| `update-ref-stdin` | `git update-ref --stdin` | rara | deny | **Mantener** | — |

### A.2 Daño recuperable (15)

| Regla | Qué frena (ejemplo) | Frec. y evidencia | Costo del freno | Recomendación | Riesgo residual |
|---|---|---|---|---|---|
| `stash` | `git stash`, `git stash pop`, `drop`, `apply stash@{0}`; pasa solo `push -m` y `apply <sha>` | a menudo: 14 (M), 13 con `pop` en la misma línea para ver el rojo sobre la base | deny; la alternativa deja el `pop` negado: hay que aplicar por SHA | **Relajar**: permitir `stash` / `push` / `pop` / `apply`; seguir negando `drop` y `clear` | El stash es común a los worktrees: con tareas en paralelo un `pop` puede traer el stash de otro agente. Queda en el objeto del stash y en la instantánea. Opción intermedia: relajar solo cuando el repo no tiene worktrees enlazados |
| `checkout-path` | `git checkout -- f.js`, `git checkout main -- docs/x.md`, `git checkout --ours f.js`, `git checkout f.js` | a menudo: 17 (M); 16 de 21 (con `restore` y `git-C`) deshacían una mutación propia hecha en el mismo comando | deny; la alternativa (`git show ref:ruta`) no deshace nada: el agente reescribe con `git show ... > f` (que cae en `dynamic-redirect`) o con Edit | **Relajar**: permitir con rutas de archivo literales (sin `.`, sin comodín, sin carpeta) cuando la instantánea de esta misma llamada salió bien; seguir negando `-- .`, comodines y `-p`. Permitir siempre `--ours` / `--theirs` (resolver un conflicto) | Descartar a propósito un archivo con trabajo sin commitear del humano: queda en `refs/pignolo/wip` salvo que esté ignorado |
| `restore` | `git restore f.js` (pasa `--staged`) | a veces: 1 (M) | deny con alternativa | **Relajar** igual que `checkout-path` | igual |
| `checkout-force` | `git checkout -f rama` | rara: 0 | deny claro | **Mantener** | — |
| `switch-force` | `git switch -f`, `--discard-changes` | rara: 0 | deny claro | **Mantener** | — |
| `fetch-force-head` | `git fetch -u origin +a:b` | rara | deny | **Mantener** | — |
| `read-tree-update` | `git read-tree -u` | rara | deny | **Mantener** | — |
| `checkout-index-force` | `git checkout-index -f` | rara | deny | **Mantener** | — |
| `rm-force` | `git rm -f a.js` | rara | deny con alternativa | **Mantener** | — |
| `branch-delete` (ask) | `git branch -d x` y `-D x` | a veces (S): limpieza de ramas de tarea | ask: espera al humano; en un agente en segundo plano es un parate | **Relajar**: `-d` → permitir (git ya se niega si no está unida). `-D` → permitir con chequeo (la punta está en `main`, en otra rama o en `refs/pignolo/backup`); si no, ask | Con `-D` sin chequeo: commits sin unir quedan solo en el reflog |
| `branch-force` (ask) | `git branch -f x`, `-M main` | rara | ask | **Mantener** | — |
| `tag-delete` (ask) | `git tag -d v1` | rara | ask | **Mantener** | — |
| `tag-force` (ask) | `git tag -f v1` | rara | ask | **Mantener** | — |
| `push-delete` (ask) | `git push origin --delete x` | rara | ask | **Mantener** (efecto fuera de la máquina) | — |
| `ref-move` (ask) | `git checkout -B x`, `git switch -C x`, `git update-ref refs/heads/x HEAD`, `git fetch origin +refs/heads/*:refs/remotes/origin/*` | a veces (S) | ask | **Relajar**: `-B` / `-C` cuando la rama no existe es crear (se lee `.git/refs` sin lanzar git); refspec forzado con destino `refs/remotes/*` → permitir. El resto, ask | Ninguno nuevo: lo que mueve una ref existente sigue en ask |

### A.3 Política: protege el método, no datos (15)

| Regla | Qué frena (ejemplo) | Frec. y evidencia | Costo del freno | Recomendación | Riesgo residual |
|---|---|---|---|---|---|
| `pignolo-launcher` | cualquier palabra que termine en `hooks/launcher.js`: `cat hooks/launcher.js`, `git diff -- hooks/launcher.js`, `for f in hooks/launcher.js ...` | a menudo al desarrollar pignolo: 35 (M), todas lecturas; rara en un proyecto usuario | deny sin alternativa para leer (sirve Read) | **Angostar a la ejecución**: solo cuando el programa es `node` (u otro intérprete) y el launcher es el script. Es lo que ya dicen G21 y §11.6 ("nunca un grep del texto") | Ninguno: leer no apaga nada |
| `protected-flag` | escribir el flag `disabled`, `claude plugin disable pignolo`. También, hoy: `sed -n 1,5p .pignolo/state/*.md`, `cp .pignolo/tmp/task-*.md /tmp/`, `pytest tests/test_disabled*`, `for f in src/disabled-*.tsx` | a veces: 5 (M), 0 tocaban el flag | deny; "pedile al humano" (sin salida) | **Angostar**: solo programas que escriben o borran, y solo si el comodín puede dar con `.pignolo/disabled` o `~/.pignolo/disabled` (carpeta fija, patrón que casa "disabled") | Un borrador raro con comodín quita el flag: eso ENCIENDE la guardia. Crear el flag con un comodín no es posible |
| `no-verify` | `git commit -n`, `--no-verify` | rara: 0 | deny claro | **Mantener** | — |
| `config-write` | `git config core.hooksPath x`; también `core.editor`, `http.proxy`, `core.sparseCheckout`, `--unset core.hooksPath` | rara: 0 | deny; "lo hace el humano" | **Mantener**; ajuste técnico: negar por la lista `PROTECTED_CONFIG` (lo que ejecuta programas o toca la guardia) en vez de permitir por lista corta | Una clave nueva de git que ejecute programas y no esté en la lista |
| `git-config-override` | `git -c core.pager=cat log`, `-c alias.x=...`, `-c protocol.file.allow=always` | rara: 0 | deny claro | **Mantener** | — |
| `git-env-config` | `GIT_CONFIG_COUNT=1 git ...` | rara | deny | **Mantener** | — |
| `pignolo-run` / `-plan` / `-init` / `-holdout` / `-queue` / `-worktree-tools` (6) | un subagente que ejecuta `scripts/run.js`, `plan.js`, `init.js`, `places.js`, `holdout.js`, `queue.js merge`, `worktree.js create` | rara por diseño; sin medición (no están en la 0.2.1). G35: niega `places.js where`, que solo lee | deny; el agente responde BLOCKED (parate buscado) | **Mantener**. Técnico: dejar pasar los subcomandos de lectura (`where`) | — |
| `pignolo-protected-refs` | un subagente que escribe `int/*`, `queue/*`, `cp/*`, `contract/*` | rara; sin medición | deny; BLOCKED | **Mantener** | — |
| `subagent-main` | un subagente que hace `git push` o `git merge` con HEAD en `main`; una rama ilegible cuenta como `main` | a veces (I): un subagente que arma un repo de prueba con `git init -b main` y hace `merge` ahí queda negado | deny; BLOCKED | **Mantener** (decisión del autor de hoy). Técnico: no aplicarla fuera del repo del proyecto y sus worktrees | Un subagente hace merge sobre `main` de otro repo de la máquina |
| `sabotage-lock` | `git add` / `commit` con un sabotaje a medio hacer | rara | deny con el comando de recuperación | **Mantener** | — |

### A.4 No verificable: la guardia no puede leerlo y niega por las dudas (18)

En `auto`, `bypassPermissions` y `dontAsk` salen deny; en los demás modos, ask. Esta máquina corre en `auto` (M).

| Regla | Qué frena (ejemplo) | Frec. y evidencia | Costo del freno | Recomendación | Riesgo residual |
|---|---|---|---|---|---|
| `inline-code` | `node -e` / `python -c` / heredoc a un intérprete cuyo texto nombra `git` como palabra o usa `child_process`, `spawn(`, `subprocess`; awk con `print ... \|`; `sed e` | **a menudo: 51 (M)**. 16 solo porque el texto (casi siempre lo que se iba a escribir en un archivo) contenía la palabra git; 21 por `spawn` / `execFileSync` (9 de ellos además nombraban git); 6 por API de borrado con ruta calculada; 5 sin clasificar; 3 awk (uno, `awk -F'\|' '{print $2 "\|" $3}'`, es un falso positivo del patrón) | deny; "guardá el script en un archivo": 1 Write + 1 Bash más, y el script en archivo ya no se mira | **Relajar** (ver §3.3): negar solo si el código llama a git de verdad (`'git'` como primer argumento de `spawn`/`exec*`/`subprocess`, o una cadena de shell que empieza con `git `) o borra una ruta protegida o calculada | Un script inline que arma el comando por partes pasa: hoy pasa igual con escribirlo en un archivo |
| `dynamic-redirect` | `echo x > $OUT`, `npm test > "$LOG" 2>&1`, `D=$(mktemp -d); echo x > $D/a`, `for f in a b; do git show HEAD:$f > $f; done` | a menudo: 16 (M), 0 hacia `.git` o `~/.pignolo` | deny; "escribí la ruta literal" (1 reintento) | **Permitir**. Sigue el deny cuando la parte literal nombra `.git`, `.pignolo` o el flag (ya existe) | Una variable que valga `.git/config`: un archivo pisado, recuperable de la sombra |
| `dynamic-argument` | `for b in a b; do git merge --no-ff $b; done`, `git checkout $B`, `git push origin $B`, `git fetch origin "$B"`, `git worktree add "$J/wt"` | a veces: 5 (M), 3 en el hilo principal | deny; reescribir literal: un comando por rama | **Relajar** (ver §3.1): expandir las variables de un `for` con lista literal; permitir variable en posición de ref o ruta en `merge`, `fetch` (sin `-u`), `worktree add`, `branch` y `tag` de creación; dejar el deny en `push`, `checkout`, `reset`, `clean`, `rm`, `stash`, `config` | En `merge "$B"` la variable podría valer una opción: `merge` no tiene opciones que pierdan trabajo |
| `git-C` | `git -C ../wt checkout -- f.js`, `git -C replay checkout abc123` | a veces: 3 (M) | deny; "usá `cd` y `git checkout`" | **Relajar**: con `-C <dir literal>` resolver el directorio (el código ya lo hace para la rama de HEAD) y aplicar las reglas normales de `checkout` | Ninguno nuevo |
| `unparseable` | `for x in $f; do case $x in *.test.js) ...;; esac; done`; `python - <<'EOF' ... EOF \|\| node -e "..."` con comillas anidadas | a veces: 4 (M) | deny; "reescribilo simple" | **Mantener el deny**, arreglar el parser: `case ... esac` es bash común. Si el texto no nombra git ni un borrador, permitir (ver §3.4) | Un comando mal parseado que esconda un borrado: lo cubre la heurística de texto del conjunto catastrófico, que ya existe |
| `dynamic-command` | `run(){ "$@"; }; run git status`, `$R "$S" ...`, `& $exe --version` | a veces: 2 (M) | deny; "escribí el programa literal" | **Relajar**: resolver la variable si se asignó en el mismo comando con un literal (`R="node x.mjs"`); una función definida en el mismo comando se analiza por su cuerpo y sus llamadas | Variable heredada del entorno: sigue deny |
| `hidden-code` | `eval "$(ssh-agent)"`, `Invoke-Expression`, `curl ... \| sh`, `cmd /c rmdir /s /q $d` | rara: 1 (M) | deny | **Mantener** | — |
| `quoted-substitution` | `git commit -m "fix: $(date)"`, `node -e "... \`x\` ..."` | rara: 1 (M); nació de un `rm -rf .git` real en el hito 1 | deny con alternativa (`-F archivo`) | **Mantener** | — |
| `ps-unavailable` | PowerShell que no parseó en 2 s | rara: 1 (M), bajo carga | deny; "reintentá" | **Mantener**; ver §3.5 (plazo) | — |
| `git-shell` | `git rebase -x "npm test"`, `git bisect run`, `submodule foreach` | rara: 0 | deny | **Mantener**. Técnico: analizar el comando literal de `-x` y de `bisect run` como cualquier otro | — |
| `unknown-with-git` | `docker run x git status`, una función `run git ...` | rara: 0 directas | deny | **Mantener** | — |
| `unknown-git-subcommand` | `git lg` (alias) | rara | deny | **Mantener** | — |
| `git-unknown-option` | opción global de git desconocida | rara | deny | **Mantener** | — |
| `git-config-unknown` | `git -c clave.rara=x ...` | rara | deny | **Mantener** | — |
| `too-deep` | más de 4 niveles de `bash -c` | rara | deny | **Mantener** | — |
| `ps-sink`, `ps-encoded` (2) | `[scriptblock]::Create(...)`, `-EncodedCommand` | rara | deny | **Mantener** | — |
| `invalid-input` | comando vacío | rara | deny | **Mantener** | — |

## 2. Tabla B — plantilla `permissions.json` (la instala `/pignolo:setup`)

No está instalada acá: todo (I). Un deny de permisos no trae "Alternativa", no mira el modo y **sigue activo con `/pignolo:off`**.

| Familia | Entradas (ejemplo) | Daño | Frec. | Costo | Recomendación | Riesgo residual |
|---|---|---|---|---|---|---|
| Git irreversible | `git reset --hard *`, `git clean -*f*`, `git push --force*`, `-f`, `+*`, `--mirror`, `git gc --prune*`, `git prune`, `git reflog expire/delete`, `git send-pack`, `rm -rf .git`, `git worktree remove --force` | irreversible | rara | deny seco | **Mantener**: es la única capa que rige si el hook no arranca | — |
| Git recuperable | `git stash`, `git stash pop *`, `git checkout -- *`, `git checkout * -- *`, `git checkout .`, `git restore *`, `git rm -f *`, `git read-tree -u`, `git checkout-index -f` | recuperable | a menudo (los mismos 32 casos de la tabla A) | deny seco, peor que el del hook | **Alinear con la guardia**: sacar lo que la guardia pase a permitir. Hoy `Bash(git restore *)` niega también `git restore --staged`, que es la alternativa que la propia guardia recomienda | El del cambio equivalente en la guardia |
| Saltear hooks y config | `git commit --no-verify *`, `-n *`, `git config alias.*`, `core.hooksPath`, `gc.*`, `git -c alias.*`, `GIT_CONFIG_*` | política | rara | deny seco | **Mantener** | — |
| Ejecución indirecta por texto | `bash -c *git *`, `sh -c *git *`, `node -e *git *`, `python -c *git *`, `cmd /c *git *`, `xargs *git *`, `find * -exec *git *`, `alias *git*`, `eval *` | no verificable | a menudo: es el mismo patrón "el texto menciona git" que §11.6 descarta; casa `node -e` que escribe un archivo con la palabra git y `git ls-files \| xargs grep "git status"` | deny seco | **Quitar la familia** (la guardia la resuelve por estructura, y `bash -c "git status"` hoy pasa por la guardia y chocaría acá). Dejar `eval *` | Si el hook no arranca, `bash -c "git reset --hard"` no lo frena nadie: la entrada `git reset --hard *` tampoco lo veía |
| Interruptor | `rm *pignolo*disabled*`, `touch ...`, `*launcher.js* toggle*`, equivalentes PowerShell | política | rara | deny seco | **Mantener** | — |
| Refs de respaldo | `git update-ref -d refs/pignolo/*`, `--stdin` | irreversible | rara | deny seco | **Mantener** | — |
| PowerShell | `Invoke-Expression *`, `iex *`, `-EncodedCommand`, `& $*`, `Start-Process git *` | no verificable | rara | deny seco | **Mantener** | — |
| Ask: ramas y tags | `git branch -d *`, `-D *`, `-f *`, `-M *`, `git tag -d *`, `-f *` | recuperable | a veces | ask: espera al humano | **Relajar** `git branch -d *` → sin entrada; el resto igual que la guardia | El de `branch-delete` |
| Ask: MCP | `mcp__*__*send*`, `*push*`, `*create*`, `*update*`, `*navigate*` | política (datos que salen) | a veces: `*navigate*` pregunta en cada página de un navegador MCP | ask | **Mantener** send / push / create / update; `*navigate*` es decisión del autor | Navegar a una URL con datos en la ruta |

## 3. Tabla C — compuertas de hooks y lo que cuestan por llamada

Tiempos medidos hoy con la máquina con otros agentes corriendo: arranque de `node` 123 ms; launcher `guard` sin instantánea 123 ms; cada launcher que sale por el atajo 55 ms; `guard` de PowerShell 523 ms; `git rev-parse` 25 ms (M). El informe del 7a midió ≈ 0,4 s por llamada a git bajo carga.

| Compuerta | Qué frena | Daño | Costo por llamada | Bloqueos (M) | Recomendación | Riesgo residual |
|---|---|---|---|---|---|---|
| `guard` (PreToolUse Bash, PowerShell) | tabla A | — | 1 proceso + worker + **instantánea WIP en cada comando, también `ls`** (4 a 6 git: `rev-parse`, `add -A`, `write-tree`, `for-each-ref`, y a veces `commit-tree` + `update-ref`). 0,25–0,35 s según la spec; PowerShell +0,4 s | 168 | **Mantener**; sacar la instantánea de la ruta de los comandos de solo lectura (G22/G42) | Un comando mal clasificado como lectura corre sin instantánea |
| Plazo interno del launcher (3 s, niega al vencer) | cualquier llamada si el hook tarda | ninguno | — | 13, todos sobre comandos permitidos; 7 de solo lectura | **Cambiar** (ver §3.5) | ver §3.5 |
| `private-reads` (Read, Grep, Glob, Bash, PowerShell) | un subagente que lee el holdout o los sellos | política | 1 proceso (55 ms) en cada Read / Grep / Glob / Bash del hilo principal para salir sin hacer nada | 0 (no está en la 0.2.1) | **Mantener**; unir en un solo proceso por evento | — |
| `scope-gate` (Bash, PowerShell) | llevar ramas de un plan a `main` sin tarjeta aprobada | política | 55 ms por el atajo; con `git` + verbo, hasta 2,5 s de git; falla cerrado dentro de un plan | 0 | **Mantener**; mismo proceso que `guard` | — |
| `plan-audit-gate` (Pre, Post, PostFailure) | `Bash` del `plan-auditor` en modo review | política | 2 procesos por Bash (55 ms cada uno) para dos tipos de agente | 0 | **Mantener**; mismo proceso que `guard` | — |
| `protect-paths` (Edit, Write) | `.git`, `~/.pignolo`, settings (irreversible); flags, `run.json`, `state/`, tests por rol (política) | irreversible + política | 1 proceso (≈ 120 ms) | 0 en 1.658 | **Mantener** | — |
| `agent-gate` (Agent) | agentes que no son `pignolo:*` durante un flujo; toma instantánea y respaldo de refs | política | 1 proceso + git, dentro de los 3 s | 0 en 198 | **Mantener** | — |
| `handback-gate` (SubagentHandback, SubagentStop) | un DONE sin sello | política | git dentro del plazo; hasta 8 rechazos y BLOCKED | sin medición | **Mantener** | — |
| `egress`, `present-gate` | web y MCP de subagentes; publicar con datos | política (datos que salen) | atajo para el hilo principal | 0 | **Mantener** | — |
| SessionStart / SubagentStart | no bloquean; inyectan canario, nivel caliente (tope 8.000), `core.md` (1.316 bytes) y la tarjeta (tope 6.000) | ninguno | canario ≈ 0,9 s por arranque | — | **Mantener** | — |

Suma por Bash hoy: 4 procesos antes y 1 después ≈ 0,3 s + la instantánea ≈ 0,5–0,7 s (M + I). Con 7.460 Bash, más de una hora de reloj en esta sesión (I). La 0.2.1 tenía un solo hook por Bash.

---

## 4. Lo que hay que cambiar primero (fricción sin protección real)

| # | Regla | Cambio | Bloqueos que evita (M) |
|---|---|---|---|
| 1 | `inline-code` | negar solo si el código llama a git o borra algo protegido o calculado | ≈ 35 de 51 (I: quedan los 6 de borrado calculado y hasta 9 que lanzan procesos y nombran git) |
| 2 | `pignolo-launcher` | negar solo la ejecución, no la lectura | 35 de 35 (pesa al desarrollar pignolo, no en un proyecto usuario) |
| 3 | `checkout-path` + `restore` + `git-C` | permitir rutas de archivo literales con instantánea previa; `--ours` / `--theirs` | ≈ 19 de 21 |
| 4 | `dynamic-redirect` | permitir | 16 de 16 |
| 5 | `stash` | permitir `stash` / `push` / `pop` / `apply`; negar `drop` / `clear` | 14 de 14 |
| 6 | plazo de 3 s | no negar comandos de solo lectura; instantánea fuera del plazo | 13 de 13 |
| 7 | `catastrophic-delete` | resolver `mktemp` y `for`; comodín con prefijo literal; `find -delete` | ≈ 10 de 12 |
| 8 | `dynamic-argument` | expandir `for` literal; permitir ref variable en `merge` / `fetch` / `worktree add` | ≈ 3 de 5 |
| 9 | `protected-flag` | solo escritores y solo si el comodín alcanza el flag | 5 de 5 |
| 10 | `unparseable` + `dynamic-command` | parsear `case`; resolver variables y funciones del mismo comando | ≈ 4 de 6 |

Total: ≈ 155 de 181 bloqueos (≈ 85 %) (I). Además: `branch -d` y `checkout -B` de una rama nueva dejan de preguntar (sin medición) y la plantilla deja de negar por "el texto menciona git".

## 5. No tocar

- `catastrophic-delete` en su núcleo (`.git`, `~`, `~/.pignolo`, la raíz, `*` suelto) y `protected-path`: sin `.git` o sin `~/.pignolo` no queda nada de dónde recuperar.
- `reset-hard`, `clean`, `worktree-remove-force`: pierden trabajo sin commitear; 0 bloqueos en 7.460 Bash, o sea que no molestan.
- `push-force`, `send-pack`, `push-delete` (ask): tocan el remoto, donde no hay sombra.
- `gc-prune`, `reflog-expire`, `pignolo-ref`, `update-ref-stdin`: destruyen la red de recuperación.
- `no-verify`, `git-config-override`, `git-env-config`, `config-write` sobre hooks y alias: apagan verificaciones sin que se note.
- `quoted-substitution`: nació de un `rm -rf .git` real.
- Las de rol de subagente y `sabotage-lock`: frenan poco y el parate es el buscado.
- En la plantilla: la familia "Git irreversible", única capa viva si el hook no arranca.

## 6. La familia "no verificable": política propuesta

Hoy: si no puedo leerlo, niego. Propuesta: niego solo si lo que no puedo leer puede ser peligroso.

1. **Argumentos de git con variables.** Primero se resuelve lo que se puede: variable asignada con un literal en el mismo comando (ya está), variable de un `for` con lista literal (el cuerpo se evalúa una vez por valor), `$(mktemp ...)` como ruta temporal. Lo que queda dinámico se permite si el subcomando es de lectura (ya está) o si está en posición de ref o ruta de `merge`, `fetch` sin `-u`, `worktree add`, `branch` y `tag` de creación, `add`, `commit`. Se niega en `push`, `checkout`, `switch`, `reset`, `clean`, `rm`, `stash`, `restore`, `config`, `update-ref`. Tests: una fila `must-allow` por forma medida (`for b in a b; do git merge $b; done`, `git fetch origin "$B"`), una `must-block` por subcomando que sigue negado (`git push origin $B`, `git checkout $B`), y `for b in --force x; do git push origin $b; done` → deny (el valor expandido se evalúa).
2. **Redirección a variable.** Permitir; deny si la parte literal nombra `.git`, `.pignolo` o el flag. Tests: `echo x > "$LOG"` pasa; `> "$D/.git/config"` y `> ".git/$f"` se niegan.
3. **Código inline.** Negar solo si: (a) hay una llamada a proceso cuyo primer argumento literal es `git`, o una cadena de shell que empieza con `git ` o lo trae tras `&&`, `;`, `|`; (b) hay una llamada a proceso cuyo comando no es literal Y además el texto nombra git; (c) hay un borrado sobre una ruta protegida o calculada (como hoy). `spawnSync('node', ...)`, `execFileSync(process.execPath, ...)`, `subprocess.run(['npm','test'])` y el texto que solo menciona git dentro de una cadena a escribir pasan. En awk, `print ... |` cuenta solo fuera de comillas. Tests: las 51 filas medidas como corpus (≈ 35 `must-allow`; las demás, `must-block` o a revisar una por una), más `node -e "require('child_process').execSync('git reset --hard')"`, `python -c "import os; os.system('git clean -fdx')"` y `execSync(cmd)` con el texto nombrando git → deny.
4. **Lo que no parsea.** Arreglar `case ... esac`. Si igual falla: se niega si el texto nombra git, un borrador (`rm`, `mv`, `Remove-Item`, `find -delete`) o un sumidero (`eval`, `| sh`); si no, pasa. Tests: el comando medido con `case` pasa; `rm -rf "$(` sin cerrar se niega.
5. **`git checkout <ref> -- <ruta>` y `git restore <ruta>`.** Recuperable si las rutas son archivos literales y la instantánea de esta llamada salió bien: la guardia evalúa, toma la instantánea y recién ahí permite; sin instantánea, deny como hoy. Tests: archivo limpio pasa; archivo sucio con instantánea pasa y el contenido previo está en `refs/pignolo/wip`; instantánea fallida → deny; `git checkout -- .` y `git checkout -- src/` → deny.
6. **`git -C <dir literal>`.** Resolver el directorio y aplicar las mismas reglas. Tests: `git -C ../wt checkout rama` pasa; `git -C ../wt checkout -- archivo` sigue la regla del punto 5; `git -C "$X" checkout y` → deny.
7. Sin cambio: `eval` de algo dinámico, `curl | sh`, `Invoke-Expression`, `-EncodedCommand`, alias de git, `git -c` con clave desconocida, sustitución entre comillas en `-m` / `-e`.

## 7. El plazo del launcher que niega al vencer

No se justifica para toda llamada. Los 13 casos medidos eran comandos permitidos, 7 de solo lectura; el plazo no vence porque el comando sea raro sino porque la máquina está cargada (≈ 0,4 s por git, PowerShell 0,5 s) y dentro de los 3 s entra la instantánea, que no decide nada. En las suites es la causa repetida de fallas falsas (G8, G47; 26 fallas de tiempo en la suite del 8d).

Propuesta, en orden:
1. **Decidir primero, respaldar después.** El veredicto de `evaluate` sale en decenas de ms (Bash). Si es `allow` y vence el plazo durante la instantánea, se permite con el aviso "corre sin respaldo previo" (el handler ya hace eso cuando la instantánea falla por su cuenta).
2. **Fallar cerrado solo donde hay algo que perder.** Si el plazo vence antes del veredicto: una clasificación barata por texto en el hilo principal del launcher, sin worker. Si el comando no nombra git, un borrador, un escritor a ruta protegida ni un intérprete, sale 0. El resto, deny como hoy.
3. **Sin instantánea para lo que solo lee** (los programas de `READ_ONLY` y los subcomandos de lectura de git): saca la mayor parte del costo por llamada.
4. `private-reads`, `scope-gate` y `plan-audit-gate` en el mismo proceso que `guard`: un arranque de node en vez de cuatro.
5. No subir el plazo: 3 s ya es mucho por comando y el host no bloquea si vence el suyo.

Riesgo: un comando que escribe pero la clasificación barata toma por lectura corre sin veredicto en una máquina cargada. La lista corta y cerrada lo acota.

## 8. Qué decide el autor y qué es ajuste técnico

**Del autor** (cambian lo que el producto promete):
- Que `checkout <ruta>`, `restore <ruta>` y `stash` / `pop` dejen de ser deny: hoy la spec dice "deny (pierde trabajo sin commitear)". Pasa a "recuperable por la instantánea".
- Que `git branch -d` deje de pedir confirmación, y si `-D` pasa con chequeo.
- Que el plazo vencido deje pasar lo de solo lectura: hoy §8.3 dice "al vencer, niega".
- Que la instantánea deje de tomarse "antes de todo comando, sin clasificarlo" (§11.6).
- Quitar de la plantilla la familia de ejecución indirecta por texto y alinear el resto.
- `*navigate*` en el ask de MCP; `--force-with-lease` sobre la rama propia.
- Adoptar el principio de §9 en la spec.

**Técnico** (lo decide el agente y lo registra): angostar `pignolo-launcher` y `protected-flag`; `inline-code` por llamada real a git; `dynamic-redirect`; expansión de `for` y `mktemp`; `git -C` literal; `case` en el parser; comodines con prefijo literal y `find -delete`; `-B` / `-C` sobre rama inexistente; un solo proceso por evento; `subagent-main` solo en el repo del proyecto; el falso positivo de awk; lecturas de `places.js`.

## 9. Principio para la spec

> Antes de sumar o endurecer una regla de la guardia se contestan dos preguntas. **Primera: si el comando corre, ¿se pierde algo que no se puede recuperar?** Cuenta como irrecuperable lo que no vuelve ni del reflog, ni de la instantánea, ni del remoto: borrar `.git`, forzar un push, podar objetos, borrar archivos ignorados o un worktree con cambios. **Segunda: ¿la guardia puede saber con certeza que este comando es de ese tipo?** Si las dos respuestas son sí, la regla niega, en todos los modos. Si el daño es irrecuperable pero la guardia no puede estar segura, pide confirmación en modo interactivo y niega en modo autónomo, y la regla tiene que nombrar la forma concreta que no pudo leer. Si el daño es recuperable, la regla no frena: como mucho avisa y deja el respaldo tomado. Lo que no hace daño y solo protege el método (roles, compuertas, archivos de estado) puede negar, pero solo al ejecutar, nunca al leer. Toda regla entra con dos pruebas de campo: una lista de comandos comunes que tiene que dejar pasar y la cuenta de cuántas veces frenó trabajo honesto en una sesión real; una regla que frena más de dos veces por sesión sin haber evitado un daño se angosta o se saca.
