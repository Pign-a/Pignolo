# Pignolo

Plugin de Claude Code con una metodología de desarrollo con agentes. Estado: v0.2 en construcción (hito 2 de 8).

Diseño: `docs/specs/2026-09-26-pignolo-v1-design.md`.

## Requisitos

- Node ≥ 20 (sin dependencias npm).
- git ≥ 2.31 (el repo sombra usa `rev-parse --path-format=absolute` y `fetch --no-write-fetch-head`).
- En Windows, PowerShell (`powershell.exe`) para leer comandos de PowerShell por su AST; sin él, esos comandos quedan como no verificables.

## Instalar

Desde la terminal:

    claude plugin marketplace add Pign-a/Pignolo
    claude plugin install pignolo@pignolo
    claude plugin install pignolo-ui@pignolo   # opcional: interfaces web

O dentro de Claude Code: `/plugin marketplace add Pign-a/Pignolo` y `/plugin install pignolo@pignolo`. Para tomar cambios nuevos: `/plugin marketplace update pignolo`.

## Tests

    npm test

## Agentes y setup

El plugin trae 19 agentes con herramientas, esfuerzo y modelo fijados por rol (`plugins/pignolo/lib/roles.js`). Los despachan las skills con una tarjeta de tarea; no se usan directo.

**Configurar.** Dentro de Claude Code, una vez por máquina: `/pignolo:setup`. Solo lo dispara el humano. Verifica el entorno (node, git ≥ 2.31, `gh`, PowerShell, superpowers, agent teams, y si `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` o `availableModels` anulan el perfil), pide el perfil de modelos (`max`, `balanced` o `economy`; se guarda en `~/.pignolo/config.json`), propone la plantilla de permisos con el detalle de lo que suma y, solo con tu sí, la aplica. Nunca quita ni reordena reglas tuyas y respalda el archivo (`.pignolo-bak-<fecha>`) antes de escribir. Los revisores corren en opus en todos los perfiles, `economy` incluido.

**Activar pignolo en un proyecto.** Hasta que exista `/pignolo:init` (hito 8), se activa a mano: crear `.pignolo/project.md` en la raíz del repo (puede tener solo una línea de notas). Con ese archivo, y mientras no hayas escrito `/pignolo:off`, el hook de `Agent` niega cualquier subagente que no sea `pignolo:*` (también `fork` y el despacho sin tipo) y respalda el trabajo antes de cada despacho permitido. Sin `project.md` el hook no niega nada. Para desactivar: borrar el archivo, o `/pignolo:off` (apaga la restricción, no los respaldos).

## Guardia de shell

Capa contra errores honestos, no frontera de seguridad (spec §1.9). Analiza cada comando de Bash (tokenizador propio) y de PowerShell (AST nativo, ~0,3 s por comando) sobre su argv literal:

- **Conjunto catastrófico**, siempre activo (también con `PIGNOLO_DISABLED=1` y `/pignolo:off`): borrar o mover `.git`, `.claude`, `~/.pignolo`, `~` o la raíz del repo, o un comodín o variable en esos lugares (no se expanden globs: `rm *.log` en la raíz también se niega; en PowerShell, un borrado que recibe las rutas por el pipeline cuenta como comodín); escribir con Edit/Write en `.git/**`, `.claude/**` (salvo `.claude/worktrees/`), `.gitconfig`, `~/.pignolo/**`, `~/.claude/settings*.json` o `~/.claude/plugins/**`, y desde la shell en los mismos lugares salvo el `.claude/**` del proyecto. El resto de `~/.claude` (memoria, planes, `CLAUDE_JOB_DIR`, skills) no se protege.
- **Directorio actual**: un `cd` mueve el directorio de lo que sigue por `&&`; después de `;`, `||`, `&`, un salto de línea, un subshell o un pipeline, el directorio queda desconocido y un comodín o una variable en un borrado se niega (`cd dist; rm -rf *` sin `dist` borraría la raíz).
- **Git**: deny a lo que pierde trabajo sin commitear o no se recupera localmente; confirmación para lo recuperable por reflog (push, borrado de ramas, `update-ref`, `checkout -B`).
- **No verificable** (parseo fallido, programa o código que sale de una variable, `eval`, `source <(…)`, pipes a un intérprete, `node -e`/`python -c` que lanzan procesos, subcomandos de git que corren shell, alias de git, una sustitución `` `…` `` o `$(…)` dentro de un argumento entre comillas dobles de `-c`/`-e`/`-m`/`--message`, salvo `$(cat <<'EOF' … EOF)`): deny en `auto`, `bypassPermissions` y `dontAsk`; confirmación en los demás modos.
- Diagnóstico: `node plugins/pignolo/lib/git-guard.js --explain "<comando>" [--shell powershell] [--mode <modo>]`.
- Riesgo residual declarado: `tests/guard/residual-risk.md`.

## Hito 1: qué protege y qué no

- Protege (best-effort): el conjunto catastrófico y los comandos git destructivos directos e indirectos conocidos (ver "Guardia de shell": Bash con tokenizador propio, PowerShell con su AST nativo; lo que no se puede verificar se niega o pide confirmación según el modo). Antes de cada comando de shell que la guardia deja pasar o manda a confirmar toma una instantánea del trabajo sin commitear y al arrancar respalda las refs (`refs/pignolo/backup/*`).
- Las instantáneas van al **repo sombra** `~/.pignolo/shadow/<repo-id>.git`, fuera del repo: sobreviven a borrar `.git`. SessionStart lo siembra en segundo plano (copia HEAD, ramas y tags a `refs/pignolo/refs/<fecha>/` y toma la primera instantánea). Mientras no está sembrado, la instantánea queda dentro del repo (`refs/pignolo/wip/*`), y esa copia **no** sobrevive a borrar `.git`; la siembra siguiente la copia a la sombra.
- La instantánea captura los archivos modificados, borrados y nuevos **no ignorados**; lo que está en `.gitignore` o `.git/info/exclude` no se guarda. Los submódulos y repos anidados quedan como referencia, sin contenido. Si el árbol no cambió desde la última instantánea, no se crea otra ref. Una instantánea que falla se muestra y queda en `~/.pignolo/logs/backup-failures.log`.
- Retención: se borra lo que tiene más de 14 días (instantáneas de la sombra, `refs/pignolo/wip/*`, juegos de refs de la sombra y respaldos de refs del repo `refs/pignolo/backup/*`), salvo la última de cada una de las 3 sesiones previas. Del repo solo se borra lo que la sombra ya tiene: nunca la única copia. Aviso al arrancar si la sombra de un repo pasa 1 GB.
- Declarado: en Windows nativo no hay sandbox; un hook que no arranca o vence su timeout NO bloquea. La capa autoritativa es la plantilla de permisos (`templates/permissions.json`), que `/pignolo:setup` propone (ver "Agentes y setup").
- Declarado: la protección del interruptor contra el modelo es best-effort. `/pignolo:off` y `/pignolo:on` solo cambian el estado si el evento es `UserPromptExpansion` y el texto tipeado empieza con `/pignolo:`; la guardia bloquea invocar el launcher de pignolo por shell con la ruta escrita literal (salvo la forma exacta de `/pignolo:status`; una ruta armada con una variable, una sustitución o un comodín no se reconoce) y escribir los flags con `touch`, `rm`, `New-Item`, `Set-Content`, redirecciones o código inline. Una escritura armada de otra forma (p. ej. un script propio) no se detecta.
- Borrados que no pasan por git (`rm`, `Remove-Item`, `Write`) solo quedan cubiertos por las instantáneas previas.
- Scripts fuera de los hooks: `node plugins/pignolo/scripts/wip-snapshot.js [--cwd <dir>] [--reason <texto>] [--session <id>]`, `node plugins/pignolo/scripts/backup-ref.js [--cwd <dir>]` y `node plugins/pignolo/scripts/shadow-seed.js [--cwd <dir>] [--session <id>]`.

## Recuperar desde el repo sombra

La sombra de cada repo es `~/.pignolo/shadow/<repo-id>.git`; su archivo `pignolo/origin` dice de qué carpeta es. Las instantáneas están en `refs/pignolo/wip/<sesión>/<fecha>` y las refs copiadas en `refs/pignolo/refs/<fecha>/`.

    S=~/.pignolo/shadow/<repo-id>.git
    git --git-dir "$S" for-each-ref --sort=-creatordate refs/pignolo/wip/     # instantáneas, la más nueva arriba
    git --git-dir "$S" for-each-ref --sort=-refname refs/pignolo/refs/        # juegos de refs, el más nuevo arriba
    git --git-dir "$S" show <ref>:<archivo>                                   # ver un archivo

**Atención:** el `checkout … -- .` de la receta sobrescribe los archivos que hay ahora en la carpeta con los de la instantánea. Si en la carpeta hay trabajo más nuevo que la instantánea, guardalo antes: copiá la carpeta a otro lado, o commitealo justo después del `git init` (`git add -A` y `git commit -m "estado actual"`: queda en la rama `pignolo-rescate`). Sin `.git` no hay stash; con un repo sano, commiteá o usá `git stash push -m "<etiqueta>"` antes de tocar nada.

Si se borró `.git`, se rearma el repo desde la sombra, parado en la carpeta del repo (`<rama>` es la rama en la que estabas):

    git init -b pignolo-rescate
    git fetch "$S" 'refs/pignolo/refs/<fecha>/heads/*:refs/heads/*' '<ref-de-instantánea>:refs/heads/pignolo-rescate-wip'
    git symbolic-ref HEAD refs/heads/<rama>
    git -c core.autocrlf=false checkout pignolo-rescate-wip -- .
    git reset -q

Queda `HEAD` en `<rama>`, las ramas como estaban en esa fecha y el trabajo sin commitear de la instantánea en el árbol, sin commitear, byte a byte (`core.autocrlf=false`: la sombra guarda los bytes exactos). `git init -b` evita que el fetch choque con la rama inicial (`init.defaultBranch=main`). La configuración del repo (remotos, hooks) no se guarda en la sombra: hay que volver a ponerla. `pignolo-rescate-wip` se puede borrar al terminar.
