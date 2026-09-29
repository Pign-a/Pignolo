# Auditoría independiente del plan del hito 1 (ronda 3)

- **Fecha:** 2026-09-29
- **Objeto:** `docs/plans/2026-09-26-hito-1-esqueleto-y-guardia.md` en `f13bac1` (tareas 1, 2, 3a–3e, 4, 5, 6, 7, 7b, 7c, 8 y 9)
- **Auditor:** agente opus sin contexto previo, sobre un directorio vacío. No leyó las copias de trabajo del autor (`local/core-plan-rewrite/`, `local/guard-fix-2026-09-28/`).
- **Entorno:** Windows 11 Pro 10.0.26200, Node 24.13.1, git 2.52.0.windows.1, Windows PowerShell 5.1 y Git Bash; `claude plugin validate` del CLI instalado.
- **Veredicto:** `REQUEST_CHANGES`
- **Material de trabajo** (fuera de git): `local/auditoria-3/`. Ahí están la réplica (`repo/`, `replay.log`, `logs/`), las herramientas (`tools/replay.js`, `breaks.js`, `corpus.js`, `hunt.js`, `demo.js`, `backup-check.js`), los resultados (`hunt-eval.json`, `hunt-launcher.json`, `breaks.log`, `breaks-paralelo.log`, `demo.log`, `demo2.log`, `backup-check.log`) y la documentación oficial descargada (`docs/`).

## Resumen

El plan se ejecuta tal como está escrito y da lo que declara. Coinciden los 30 conteos de rojo y de verde, cada commit deja el árbol limpio y `claude plugin validate .` pasa. De las 68 roturas, 67 fallan exactamente con los tests que nombra su tabla; la otra difiere en uno el total, no la cobertura. Todo lo que encontró la ronda 2 (F1–F12) quedó arreglado o declarado: los 119 comandos de esa ronda se comportan como dice `residual-risk.md`, y ninguna de las formas de F1–F7 que probé de nuevo pasa.

El veredicto es `REQUEST_CHANGES` por cinco hallazgos MAJOR. Son huecos del conjunto catastrófico y de la recuperación, no variantes rebuscadas del parser:

1. **G1.** La guardia da por hecho que un `cd` cambia de directorio, aunque falle, corra en un subshell o en un pipeline, o no se ejecute porque va después de un `&&` que falla. Así pasan `cd dist; rm -rf *` (con `dist` inexistente) y `cd /no/existe; rm -rf .g*`, que borran la raíz o `.git`. Demostrado.
2. **G2.** En PowerShell, un borrado por pipeline no tiene operandos y pasa: `Get-ChildItem -Force | Remove-Item -Recurse -Force`. Demostrado: `.git` borrado.
3. **G3.** `$(( … ))` se salta entero: las sustituciones de adentro no se analizan, y pasa `echo $(( $(rm -rf .git) ))`. Demostrado con `git reset --hard`.
4. **G4.** La receta de recuperación del README falla con `init.defaultBranch=main`, porque el test usa otra receta. Además deja los archivos en CRLF cuando el git del sistema tiene `core.autocrlf=true`.
5. **G5.** `~/.claude/**` queda entero fuera de las rutas protegidas. `~/.claude/settings.json` y el código instalado del propio plugin se pueden escribir con Edit/Write y desde la shell en cualquier modo, y ni el README ni "qué protege y qué no" lo declaran.

## Replay

Transcripción literal con `tools/replay.js`. La herramienta lee el markdown y, en orden:

- escribe cada bloque de archivo;
- aplica cada "reemplazar … por …" y cada "agregar al final" (todos encontraron su texto exactamente una vez);
- corre `npm test` en cada `Run:`;
- hace cada commit con los `git add` del plan y el mensaje escrito en un archivo fuera del repo.

No quedó ninguna instrucción sin aplicar ni ningún bloque sin destino.

| Tarea | Rojo esperado → obtenido (tests/pass/fail) | Verde esperado → obtenido |
|---|---|---|
| 1 | 1/0/1 → igual | 2/2 → igual; validate OK |
| 2 | 17/2/15 → igual | 24/24 → igual |
| 3a | 25/24/1 → igual | 39/39 → igual |
| 3b | 40/39/1 → igual | 43/43 → igual |
| 3c | 50/43/7 → igual | 446/446 → igual |
| 3d | 449/446/3 → igual | 449/449 → igual |
| 3e | 454/450/4 → igual (los 4 nombrados) | 454/454 → igual |
| 4 | 459/454/5 → igual | 483/483 → igual |
| 5 | 442/434/8 → igual (los 8 nombrados) | 518/518 → igual |
| 6 | 519/518/1 → igual | 527/527 → igual |
| 7 | 531/528/3 → igual | 541/541 → igual |
| 7b | 552/542/10 → igual (pasa solo el nombrado) | 552/552 → igual |
| 7c | 555/550/5 → igual | 555/555 → igual |
| 8 | 556/555/1 → igual | 561/561 → igual; validate OK |
| 9 | 566/561/5 → igual | 566/566 → igual; validate OK |

Cada commit dejó el árbol limpio. La suite tarda ~1 min en una máquina sin otra carga.

## Roturas de "Demostrar el rojo"

`tools/breaks.js` aplica cada una de las 68 roturas sobre el verde de su tarea (un worktree en el commit de la tarea), corre `npm test` y compara con la tabla. Corrida en serie:

- **67 de 68 exactas:** el mismo total y los mismos tests nombrados, sin tests de más cuando la tabla no dice "entre ellos".
- **T3c rotura 4** (`long('hard') || long('merge')` → `long('merge')`): la tabla dice 86 y `npm test` informa `fail 87` en tres corridas. Los nombres distintos son 86, porque dos tests generados comparten nombre. La tabla cuenta nombres y no tests. Es MINOR (G13).
- **Con carga, la suite no es estable.** Con tres `npm test` en paralelo (`breaks-paralelo.log`), 11 de las 21 roturas que alcanzaron a correr dieron fallas espurias (T4#5, T5#1–7, T6#1–2, entre otras). La causa son los plazos reales: el parseo de PowerShell vence a los 2 s y sale `ps-unavailable`, y la instantánea también vence la suya. `runGuard` reintenta solo por el plazo de la instantánea. Los conteos del plan solo se reproducen con la máquina libre (G13).

## Hallazgos

Reproducidos ejecutando. "Demo" significa que el launcher real devolvió exit 0 en `bypassPermissions` y que después el comando se ejecutó dentro de un repo descartable en un temporal (`tools/demo.js`).

| Id | Severidad | Tarea | Qué pasa (reproducción) | Arreglo sugerido |
|---|---|---|---|---|
| G1 | MAJOR | 3c (`changeDir`) | La guardia trata todo `cd` como hecho. No distingue un `cd` que falla, uno dentro de `( … )` o de un pipeline, ni uno después de un `&&` que falla. Desde ahí evalúa lo que sigue en el directorio supuesto: un comodín en la raíz o `.g*` deja de ser catastrófico. Pasan en los 6 modos: `cd dist; rm -rf *` (sin `dist`: borra la raíz), `cd dist; rm -rf .[!.]* *`, `cd /no/existe; rm -rf .g*`, `(cd /tmp); rm -rf .g*`, `false && cd /tmp; rm -rf .g*`, `cd /tmp \| true; rm -rf .gi?`. En PowerShell, `Set-Location dist; Remove-Item * -Recurse -Force`, porque el error de `Set-Location` no corta. Demo: `.git` BORRADO con las dos primeras formas de `.g*`. `cd dist; rm -rf *` es un error honesto realista. No está declarado: el riesgo residual habla de la expansión de globs, no del seguimiento de `cd`. | Mover el cwd solo cuando el `cd` es literal y encabeza una cadena `&&` hasta el comando. En los demás casos (`;`, subshell, pipeline, `\|\|`), el cwd pasa a ser desconocido (`null`), y entonces un comodín ya es catastrófico. Restaurar el cwd al salir de `( … )`. Tests con esas seis formas. |
| G2 | MAJOR | 3b + 3c (`psCommands`, `dispatch`) | En PowerShell, un borrado que recibe la ruta por el pipeline no tiene operandos y pasa en los 6 modos: `Get-ChildItem -Force \| Remove-Item -Recurse -Force`, `gci -Force \| ri -r -fo`, `Get-Item .git -Force \| Remove-Item -Recurse -Force`, `'.git' \| Remove-Item -Recurse -Force`. También pasan `(Get-Item .git -Force).Delete($true)` y `[IO.DirectoryInfo]::new('.git').Delete($true)` (miembro sobre una expresión, no sobre `[IO.Directory]`) y `Set-Alias g Remove-Item; g .git -Recurse -Force`. Demo: `.git` BORRADO con el pipeline y con el alias; con `.Delete($true)`, `.git` quedó inservible. Bash sí lo cubre: `ls -A \| xargs rm -rf` agrega un operando dinámico y sale catastrófico. | Un comando de `DELETE_CMDS` con la entrada por pipeline (`pipedIn`) y sin `-Path`/`-LiteralPath` literal recibe un operando dinámico, como `xargs`. Los miembros `Delete`, `MoveTo` y `Replace` sobre cualquier expresión se tratan como un borrado con operando dinámico. `Set-Alias`/`New-Alias`/`Set-Item alias:` hacia `DELETE_CMDS` o `WRITE_CMDS` pasa a `ps-sink`. |
| G3 | MAJOR | 3a (`bashDollar`) | Para `$(( … ))` se llama a `skipParens` y el cuerpo no se analiza: las sustituciones de comandos de adentro, que bash sí ejecuta, no se ven. Pasan en los 6 modos `echo $(( $(rm -rf .git) ))`, `x=$(( $(git reset --hard) ))` y `echo "$(( \`git reset --hard\` ))"`. `(( … ))`, `$[ … ]`, `let` y `for (( ))` sí se cubren. Demo: trabajo sin commitear perdido (queda la instantánea). Es la divergencia número 1 del Review Focus, y el conjunto catastrófico no la ve. | Recorrer el cuerpo aritmético buscando `$(`, `${` y backticks con el mismo analizador de `bashDq`, o lanzar `ParseError` si aparecen. Test: `echo $(( $(rm -rf .git) ))` → `catastrophic-delete`. |
| G4 | MAJOR | 8 (README, "Recuperar desde el repo sombra") | La receta `git init` + `git fetch "$S" 'refs/pignolo/refs/<fecha>/heads/*:refs/heads/*' …` falla con `fatal: refusing to fetch into branch 'refs/heads/main' checked out at …` si `init.defaultBranch=main`, algo común. El test (`backup.test.js:74`) usa otra receta, `git init -q -b rescate`, así que la del README nunca se probó. Con `core.autocrlf=true` en la config del sistema (lo trae Git for Windows), `git checkout rescate -- .` devolvió `"trabajo sin commitear\r\n"` para un archivo que era LF: la sombra guarda bytes exactos y la receta los cambia. La receta tampoco dice cómo dejar `HEAD` en la rama recuperada. Probado en `backup-check.log`, escenario A, y a mano. | README: `git init -b rescate`, `git -c core.autocrlf=false checkout rescate -- .` y `git switch main` (o `git reset --soft main`). Hacer que el test ejecute la receta del README tal cual, con `init.defaultBranch=main` y `core.autocrlf=true`. |
| G5 | MAJOR | 3c + 5 (`isProtectedWrite`) | Por la excepción "salvo el `~/.claude` del usuario", todo `~/.claude/**` es escribible. Protect-paths devuelve exit 0 para Write sobre `~/.claude/settings.json`, sobre `~/.claude/plugins/cache/pignolo/…/lib/git-guard.js` y sobre `~/.claude/projects/x/memory/MEMORY.md`. Desde la shell, `echo '{}' > ~/.claude/settings.json` y `sed -i … ~/.claude/plugins/cache/pignolo/lib/git-guard.js` salen `allow` en `bypassPermissions`, justo el modo donde la protección nativa no rige (permission-modes.md, "Protected paths"). Editar el código del plugin o desactivarlo en settings apaga también el conjunto catastrófico en las sesiones siguientes. §8.3 del spec dice "nadie escribe `.claude/**`", y el README y "qué protege y qué no" no nombran la excepción. | Exceptuar solo lo que Claude Code escribe con Write, `~/.claude/projects/*/memory/**`, y proteger `~/.claude/settings*.json`, `~/.claude/plugins/**` y `CLAUDE_PLUGIN_ROOT`. Si no, declararlo en el README y en `residual-risk.md`. |
| G6 | MINOR | 3c (`script`) | Con la guardia encendida, si `powershell.exe` no arranca o vence sus 2 s (pasa con carga), `Remove-Item .git -Recurse -Force` sale `ask` (`ps-unavailable`) en los modos interactivos. Con `PIGNOLO_DISABLED=1` la heurística de texto lo niega (`catastrophic-delete`). Apagar la guardia la vuelve más estricta, y el conjunto catastrófico pasa a pedir confirmación, cuando el spec dice deny en todos los modos. | Aplicar `TEXT_DELETE`/`TEXT_TARGET` ante todo fallo de parseo, no solo con `onlyCatastrophic`. |
| G7 | MINOR | 3c (`PROTECTED_CONFIG`, `gitRules`, `stripPrefix`) | Git ejecuta programas por caminos que la guardia no mira. Todos pasan en los 6 modos. Con marcadores inocuos verifiqué que git ejecuta los de `--upload-pack`, `GIT_EDITOR`, `difftool.x.cmd`, `protocol.allow=always` y `GIT_EXTERNAL_DIFF`. <br>• `--upload-pack`/`-u`/`--receive-pack` contra un repo local (`git fetch`/`ls-remote`/`clone`) y `git archive --remote=. --exec=…` <br>• `-c protocol.allow=always` (no calza con `protocol\..+\.allow`) y `GIT_ALLOW_PROTOCOL=ext` <br>• `-c difftool.<t>.cmd`, `-c browser.<t>.cmd` con `help -w` y `-c gpg.ssh.defaultKeyCommand` <br>• las variables `GIT_EDITOR`, `EDITOR`, `GIT_SEQUENCE_EDITOR`, `GIT_EXTERNAL_DIFF` y `GIT_SSH_COMMAND` <br>Es la familia `git-shell` y `-c core.editor…` del spec, sin declarar. | Sumar `protocol\.allow`, `difftool\..+\.(cmd\|path)`, `mergetool\..+\.cmd`, `browser\..+\.(cmd\|path)` y `gpg\..+\.\w*command` a `PROTECTED_CONFIG`. Tratar esas variables de entorno como `git-env-config` salvo valores inertes (`true`, `:`, `cat`). Tratar `--upload-pack`/`--receive-pack`/`--exec` con valor como `git-shell`. |
| G8 | MINOR | 3c (`WRAPPERS`, `INERT`, `analyzeCmd`) | Envoltorios y sumideros sin cubrir, verificados con marcadores (`env -S` pegado, `xargs -I`, `^` de cmd): <br>• `env -S'git reset --hard'` y `env --split-string='…'` (la regex `code` exige la opción sola) <br>• `echo 'git reset --hard' \| xargs -I{} sh -c '{}'`: el código literal es `{}` y `xargs` lo reemplaza con la entrada <br>• `npm exec -c '…'`, `npx -c '…'`, `npm exec -- git reset --hard`, `pnpm exec git …`, `yarn exec git …`: `npm`/`npx`/`pnpm`/`yarn` están en `INERT` <br>• `cmd /c g^it reset --hard`: el `^` de cmd <br>• `Rscript -e`, `lua -e`, `vim -es -c '!…'`, `sqlite3 … '.shell …'` <br>Además `script --command=…`, `flock --command=…`, `su -c`, `sg`, `busybox sh -c`/`busybox rm -rf .git` y `rsync --delete` pasan, pero Git for Windows no los trae: no aplican en la plataforma objetivo. Todos pasan con la instantánea previa; ninguno está declarado. | `env`: aceptar `-S…` y `--split-string=`. `xargs -I<r>`: marcar como dinámica toda palabra que contenga `<r>`. `npm`/`pnpm`/`yarn` `exec` y `npx -c`: evaluar como envoltorio o código. `cmd`: quitar los `^` antes de evaluar, o tratar `^` como no verificable. O declarar la lista en `residual-risk.md`. |
| G9 | MINOR | 3c (`WRITE_CMDS`, `DELETE_CMDS`) | Escrituras en `.git/**` desde la shell con programas que no están en `WRITE_CMDS`: `sed -i 's/a/b/' .git/config`, `dd if=/dev/zero of=.git/index`, `perl -pi -e … .git/HEAD`, `tar -xf x.tar -C .git`. El spec (§11.6) pone "escribir desde la shell en `.git/**`" en el conjunto catastrófico, y `sed -i` sobre `.git/config` es un error honesto plausible (cambiar el remoto). Borradores de paquetes: `npx rimraf .git`, `npx shx rm -rf .git` y `npx del-cli .git` pasan. Quedan cubiertos solo de forma genérica ("paquetes invocados"), aunque `rimraf` es el `rm -rf` habitual en proyectos Node sobre Windows. | Reconocer `sed -i`/`perl -i`, `dd of=` y `tar -C` como escrituras. Reconocer `npx`/`pnpm dlx`/`yarn dlx` más `rimraf`/`shx rm`/`del-cli`/`trash` como borrados. O nombrarlos en `residual-risk.md`. |
| G10 | MINOR | 3c | Equivalentes sueltos: <br>• `git refs migrate --ref-format=reftable --no-reflog` pasa y descarta los reflogs, que §11.6 llama la última red <br>• `git mv -f a b` pisa `b` <br>• `git -c remote.origin.push=+refs/heads/*:refs/heads/* push origin` sale `ask` con el motivo "push al remoto", aunque es un push forzado, porque `remote.*.push` no está en `PROTECTED_CONFIG` | `refs migrate` como `reflog-expire`; `remote\..+\.push` en `PROTECTED_CONFIG`. |
| G11 | MINOR | 6 + 8 (README) | El README dice que la guardia "bloquea invocar el launcher de pignolo por shell (salvo la forma exacta de `/pignolo:status`)". Pasan con la ruta dinámica o con un glob: `echo '{}' \| node "$(find . -name launcher.js)" toggle` y `node plugins/pignolo/hooks/launch*.js toggle`. La falsificación del interruptor está declarada fuera de alcance, pero la frase del README promete más. | Agregar "con la ruta escrita literal" al README, o comparar por nombre base en rutas dinámicas y con glob. |
| G12 | MINOR | 7 (spec §8.3) | §8.3 dice "Callados en el éxito: ningún hook agrega `additionalContext` ni `systemMessage` cuando todo sale bien". Sin embargo, SessionStart emite `pignolo: respaldo de N refs en …` en cada `startup`/`fork` sano, y lo exigen el test `healthy guard: … startup backs up refs` y el punto 1 del checklist. | Decisión del autor: callar el respaldo sano (y ajustar el test y el checklist) o corregir el spec. |
| G13 | MINOR | 2–7 (tests) | La suite depende de plazos reales, incluido el de 2 s de PowerShell, y bajo carga falla de forma espuria. Con tres `npm test` en paralelo cayeron, entre otros, `catastrophic in every mode: rm -r -fo .git` y `powershell sink (F5): …`. `runGuard` solo reintenta por el plazo de la instantánea. Además, la tabla de T3c rotura 4 cuenta nombres (86) y no tests (87). | Reintentar también ante `ps-unavailable` en los tests que no prueban el plazo, o darles un `psTimeout` holgado. Aclarar en las tablas que el número es de tests o de nombres. |

**Fail-closed verificado:** se niegan o preguntan los 119 comandos de la ronda 2 y las formas nuevas de las familias F1–F7 que probé: `command ` y `env ` repetidos 40 veces, `$'…'`, `\git`, `#` pegado, continuación de línea, `${x:-$(…)}`, `a[$(…)]=`, `<<-` con tab, `cat <<EOF; git …`, `tee >(…)`, `[IO.Directory]::Delete`, `cmd /c rd /s /q .git`, `wsl -e rm -rf .git`, `\\?\` y `::$INDEX_ALLOCATION`. El launcher y `evaluate()` coinciden en los 552 casos (276 comandos × 2 modos). La única diferencia es `git merge --ff-only feature`: el launcher lee que la rama es `main` y pregunta, como está diseñado.

## Caza adversarial y falsos positivos

Corpus propio (`tools/corpus.js`) de 276 comandos: 186 destructivos o indirectos de bash y PowerShell y 88 inofensivos de uso diario. No cuento `cat <<EOF … EOF␠ …`, que bash tampoco ejecuta, ni `git --exec-path=… status`, que es inofensivo. Los pasé por `evaluate()` con `cwd` en un repo real, en los seis modos, y por el launcher real en `default` y `bypassPermissions`.

**Destructivos (186):**

| Modo | Niega | Pregunta | Pasa |
|---|---|---|---|
| `default`, `acceptEdits`, `plan` | 90 | 38 | 58 |
| `auto`, `bypassPermissions`, `dontAsk` | 126 | 2 | 58 |

De los 58 que pasan:

- **2 declarados:** los del interruptor (G11).
- **3 declarados solo de forma genérica:** `npx rimraf`/`shx`/`del-cli` (G9).
- **7 no aplican en la plataforma objetivo:** `script`/`flock --command=`, `su`, `sg`, `busybox` ×2 y `rsync`, que Git for Windows no trae.
- **46 no están declarados:** G1 (4 del corpus), G2 (6), G3 (1), G7 (14), G8 (15), G9 (4 escrituras en `.git`) y G10 (2).

Los 2 que preguntan en modo autónomo son `checkout -B main` (confirmación diseñada) y `-c remote.origin.push=+… push` (G10).

Todos los comandos derivados de la ronda 2 se niegan o preguntan. Lo que pasa son formas nuevas.

**Inofensivos (88):** 85 pasan en los seis modos. Los otros 3:

- `git checkout "$BRANCH"`: `ask`/`deny`, falso positivo declarado.
- `rm *.log`: catastrófico, declarado.
- `find . -name "*.log" -delete`: catastrófico por la misma regla del comodín en la raíz.

No hay falsos positivos sin declarar. Pasan `git -C ../other status`, `$b = git rev-parse …`, `$s = git status --porcelain`, `mkdir -p .claude/skills/x`, `git commit -m "$(cat <<'EOF' …)"` y `Get-ChildItem -Recurse -Filter *.log | Remove-Item`.

## Respaldos

Con repos reales en temporales y `PIGNOLO_HOME`/`HOME`/`USERPROFILE` aislados (`tools/backup-check.js`, `backup-check.log`). No toqué `~/.pignolo`.

- **A. Con sombra.** SessionStart por el launcher respalda 2 refs, anuncia la siembra y lanza la siembra, que llega a `ok` sola: el proceso sobrevive al hook. Una modificación y un archivo nuevo dispararon el guard: exit 0, callado y sin refs `wip` en el repo. Después borré `.git`, `a.txt`, `nuevo.txt` y `f.txt`.
  - `pignolo/origin` apunta al repo.
  - La receta del README recuperó las ramas `main` y `feature`, `a.txt` modificado y `nuevo.txt`.
  - `secreto.env`, que está ignorado, no se recuperó, como está declarado.
  - Problemas: la receta falla con `init.defaultBranch=main` y convierte a CRLF (G4).
- **B. Fallback antes de sembrar.** La instantánea quedó en `refs/pignolo/wip/<clave>/<ts>` y recuperó el contenido tras `git reset --hard`. En el hook es callada (el aviso de "sembrando" sale en SessionStart).
- **C. Fallback y `rm -rf .git`.** Se pierde, y no existe `~/.pignolo/shadow`. Está declarado.
- **D. `session_id` de PreToolUse distinto del de SessionStart.** La instantánea cae al repo sin ningún aviso. Está declarado en el Review Focus 5 y en el punto 11 del checklist; sigue siendo la dependencia en vivo más importante.
- **Retención.** Leí el orden de `prune`. Del repo borra solo lo que la sombra tiene con el mismo sha, y lo hace antes de podar la sombra con la misma regla y la misma fecha. Los respaldos de refs se deciden después, contra los sha que quedan. Un vencimiento en los dos lados a la vez solo ocurre si la regla vence la unidad en los dos, que es la política pedida. No encontré un caso en que se borre la única copia de algo que alguna de las dos reglas conserva, y las 6 roturas de 7b fallan donde dicen.
- **Commits posteriores a la siembra.** SessionStart respalda refs solo dentro del repo (`outside: false`), y la sombra copia refs solo al sembrar. Tras `rm -rf .git`, los commits hechos durante la sesión se recuperan como contenido (instantánea) pero no como historia. Está declarado ("en cada siembra").

## Afirmaciones de plataforma

Contra la documentación oficial descargada completa el 2026-09-29 (`local/auditoria-3/docs/`: hooks, permissions, permission-modes, skills, plugins-reference, plugin-marketplaces).

- [V] Forma exec: `command` + `args` sin shell, y `${CLAUDE_PLUGIN_ROOT}` sustituido en cada elemento de `args` (hooks.md, "Exec form and shell form").
- [V] En PreToolUse, exit 2 bloquea aunque haya JSON y exit 1 no bloquea. Un hook que no arranca es un error no bloqueante. Un hook `command` que vence su `timeout` no bloquea el tool call. `timeout` va en segundos, con 600 por defecto.
- [V] `permissionDecision: "ask"` se muestra con la etiqueta `[plugin:<name>]`, y el `permissionDecisionReason` de un ask lo ve el usuario, no Claude. Un `ask` de hook fuerza la confirmación también en `auto`.
- [V] `systemMessage` se muestra al usuario. SessionStart y UserPromptExpansion aceptan `hookSpecificOutput.additionalContext`.
- [V] UserPromptExpansion recibe `expansion_type`, `command_name`, `command_args`, `command_source` y `prompt`, y su matcher es `command_name`.
- [NV] Que para una skill de plugin `command_name` sea `pignolo:off` y `prompt` empiece con `/pignolo:off`. El ejemplo oficial es `"command_name": "example-skill"`, `"prompt": "/example-skill arg1 arg2"`, sin espacio de nombres. skills.md dice que las skills de plugin se invocan como `/plugin-name:skill-name`. Queda para el punto 7 del checklist, que es correcto que lo exija.
- [V] Matchers de SessionStart `startup|resume|clear|compact|fork`; `fork` existe desde v2.1.214 (antes llegaba como `resume`).
- [V] `hooks/hooks.json` del plugin se carga (plugins-reference). `disable-model-invocation: true` impide que Claude invoque la skill. `${CLAUDE_PLUGIN_ROOT}` se sustituye en el texto de una skill de plugin, así que la línea de `/pignolo:status` llega con la ruta absoluta.
- [V] Rutas relativas `./plugins/<nombre>` desde la raíz del marketplace.
- [V] F10 queda corregido: un ` *` final acepta el comando sin argumentos solo si es el único comodín (permissions.md). También se admiten globs en el nombre de herramienta en deny/ask (`mcp__*__*send*`).
- [V] `permission_mode` toma los valores `default`, `plan`, `acceptEdits`, `auto`, `dontAsk` y `bypassPermissions`. "Manual" llega como `default`.
- [V] En `bypassPermissions` la protección nativa de rutas (`.git`, `.claude` salvo `worktrees`, `.gitconfig`…) no rige, así que protect-paths cubre un hueco real.
- Nota: las reglas `PowerShell(...)` se comparan sin distinguir mayúsculas y con los alias canonizados (permissions.md). `permissions.test.js` compara con una regex que distingue mayúsculas y sin alias. En la práctica solo hace la plantilla más estricta de lo que el test mide, y no cambia el resultado.
- Nota: `MultiEdit` ya no figura entre las herramientas de la doc. Dejarlo en el matcher no molesta.
- Nota: la doc de modos describe "critical paths" (raíz y directorios de primer nivel) que Claude Code nunca aprueba en automático. No cubren `.git` ni la raíz de un repo, así que no reemplazan el conjunto catastrófico.
