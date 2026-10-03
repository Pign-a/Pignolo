# Fuga de leak-values.json al historial git. Plan de implementación (método liviano)

> **Para quien ejecute:** un solo ejecutor sonnet en serie; revisión final opus con una pasada de arreglos (CLAUDE.md). **Es un hito de riesgo (guardia, privacidad, mover archivos): antes de ejecutar pasa por auditoría opus del plan (`plan-auditor`).** Casillas `- [ ]` para marcar.
>
> **Versiones (renumerables al unir):** núcleo `pignolo` **0.21.0**, `pignolo-ui` **0.11.0** (hoy main: 0.19.0 / 0.10.0; 0.20.0 es del asistente). Cada paquete sube `version` en `plugin.json` y suma su entrada al CHANGELOG (`tests/changelog-versions.test.js`).
>
> **Rama:** `fix/fuga-leak-values` desde `main`. Orden: T1 -> T2 -> T3 -> T4 -> T5 (T1 es de pignolo-ui y no depende del núcleo; T2 y T3 son del núcleo).

## Incidente (proyecto real del autor, 2026-10-03)

Un agente hizo `git add -f` de carpetas enteras de `.pignolo-ui/runs/` (el `.pignolo-ui/.gitignore` ignora todo, a propósito) para un "commit de resguardo". Adentro están `leak-values.json` y `leak-origins.json`, que pignolo-ui genera para buscar fugas y que contienen en texto plano usuario del SO, carpeta personal, nombre y email de git y, con `--email`, el email de la cuenta. Un commit local ya incluye 4 archivos de dos corridas; otro iba a incluir 2 más. Después, "fueron rechazados" leer el archivo y sacarlo del índice (mensaje exacto desconocido).

**Datos del proyecto afectado:** pignolo-ui 0.10.0; núcleo instalado <= 0.15.0 (caché hasta 0.15.0); **el proyecto no tiene pignolo inicializado** (no hay `.pignolo/project.md`). Consecuencias de diseño: (1) la guardia del núcleo probablemente **no estaba activa** (los hooks de pignolo rigen con pignolo activo, y el núcleo era viejo), así que los dos rechazos casi seguro vinieron del clasificador de permisos de Claude Code (modo auto), no de pignolo; (2) **pignolo-ui por sí solo tiene que impedir la fuga** (T1: los archivos nunca están bajo el proyecto, sin depender del núcleo); (3) la compuerta de commit del núcleo (T2) es una **segunda capa**, no la primera. Y la salida de `leak-values` no avisaba nada sobre no commitear (T1 lo corrige).

## Hechos verificados en `main` (2026-10-03, worktree de este plan)

- `evaluate()` de `plugins/pignolo/lib/git-guard.js` devuelve `allow`, para main y subagente, en: `git restore --staged <ruta>`, `git rm --cached -r .pignolo-ui/runs`, `git reset -- .pignolo-ui/runs`, `cat .pignolo-ui/runs/a/leak-values.json`, **y también `git add -f .pignolo-ui/runs`** y `git commit -m x` (no hay ninguna regla de `add -f` ni de contenido del índice).
- `private-reads.js` solo niega `<pignoloHome>/holdout`, `<pignoloHome>/seals` y `.pignolo/tmp/holdout` (`privateRoots` en `lib/holdout.js`). **No toca `.pignolo-ui/runs` ni `leak-values.json`.** `protect-paths.js` es de Edit/Write; `scope-gate` y `plan-audit-gate` solo miran planes. Ningún handler de `main` frena leer ese archivo ni lo de 2c. **Decisión abierta D5.**
- No existe una compuerta previa al commit sobre el índice: `lib/gate.js` es la compuerta de tests con sello, no un pre-commit.
- Dónde se escriben: `scripts/run.mjs` `leak-values` (`--out <archivo>`; `leak-origins.json` va en el mismo directorio) con `--out <run>/leak-values.json` en `reference/options.md` (l.29), `reference/present-and-choose.md` (l.12), `skills/define/SKILL.md`. Se leen en `lib/canvas-publish.mjs` (l.297-301: `valuesFile` y `leak-origins.json` en su `dirname`), `scripts/leak-check.mjs` (`--values-file`), `scripts/canvas-index.mjs` (`plan`/`publish --values-file`), `lib/leak-scan.mjs`, `reference/context.md`. Esas referencias nombran el archivo solo como insumo; no dicen nada de git.
- **Origen de la idea del "commit de resguardo"** (ninguna skill lo pide; `grep -i "resguardo|backup commit|safety commit|git add -f"` en `skills/` y `reference/` da 0): los textos de la guardia. `RULES` en `git-guard.js` dicen "commiteá el trabajo (commit WIP)" / "commiteá o respaldá" (`stash`, `checkout-path`, `reset-hard`, `snapshot-required`, `worktree-remove-force`), y la instantánea WIP (`git-backup.js`) siembra la idea de "resguardar". Las skills `daily`/`trivial` ya dicen "Stage by path" (`daily` l.15) pero sin prohibir `-f`. Con el núcleo viejo del incidente, el agente lo resolvió por su cuenta con `add -f`.

## Rulings

- **D1 ubicación única: `<pignoloHome>/ui-leaks/<repoId>/<run-id>/`** (`pignoloHome` = `PIGNOLO_HOME` o `~/.pignolo`; `repoId` = sha1 hex de 12 de la ruta real del proyecto). Se evaluó `.git/pignolo-ui/`: en un worktree enlazado `.git` es un archivo y hay que resolver `--git-common-dir`; y no existe fuera de un repo. Una sola ruta bajo la carpeta del usuario sirve a ambos casos, no tiene `.git` ni gitignore que olvidar, y queda dentro de `~/.pignolo`, que `protect-paths` ya protege de escritura y que se añade a la lectura privada (T3). pignolo-ui la calcula solo (no importa código del núcleo: duplica las dos líneas de `pignoloHome`, como `approved.mjs` con `approved.js`). Los demás archivos de la corrida (`run.json`, opciones, capturas) siguen en `.pignolo-ui/runs/<run>/`.
- **D2 guardián del escritor:** el módulo se niega a devolver o escribir en una carpeta que quede dentro del proyecto (`isWithin(project, dir)`), aunque `PIGNOLO_HOME` apunte ahí.
- **D3 migración:** no se copia ningún valor viejo: `leak-values` se regenera en el lugar nuevo en cada corrida. Los archivos viejos del árbol se listan (nunca su contenido) y solo se borran con el sí explícito del humano o se dejan y se avisa. Las corridas viejas se podan solas a los 14 días (`run-init.mjs`), no cambia.
- **D4 qué es privado (una sola lista, `lib/private-paths.js` del núcleo):** directorios `.pignolo-ui/` (todo: runs y el resto, el `.gitignore` propio lo ignora entero), `.pignolo/local/`, `.pignolo/tmp/`, `.pignolo/worktrees/`; archivos `.pignolo/run.json`, `.pignolo/.disabled`, `.pignolo/panel-state.json`; y por nombre, en cualquier carpeta, `leak-values.json` y `leak-origins.json`. (`.pignolo/state/` NO: se versiona a propósito.)
- **D6 la salida segura nunca se frena.** `restore --staged`, `rm --cached`, `reset -- <ruta>` y la lectura del archivo pasan por todos los handlers; hay test de eso (T3). Si algo de eso se frena es un bug.
- **D9 la protección de pignolo-ui no depende del núcleo.** T1 (archivos fuera del árbol) + una línea de aviso en la salida de `leak-values` y en la referencia + textos de skills de pignolo-ui. T2 solo suma una segunda capa si el núcleo está.

## Decisiones abiertas para el autor

1. **D5** el mensaje exacto del rechazo: con los datos nuevos, la causa más probable es el clasificador de Claude Code (pignolo no estaba activo en ese proyecto); el plan no lo puede arreglar, solo hace que sacar del índice y leer nunca sea frenado por pignolo (test T3) y que no haga falta nada de eso si T1 está. Si el autor trae el mensaje, se atribuye.
2. **D7** subagente y `git add -f`: se niega **todo** `add -f/--force` de un subagente (no solo de rutas privadas): no tiene razón para forzar lo ignorado. Alternativa más estrecha deja pasar `add -f .env`. Recomendado: negar todo.
3. **D8** la compuerta de commit con privados en el índice rige también con `/pignolo:off` y `PIGNOLO_DISABLED=1` (como el conjunto catastrófico). Recomendado: sí; solo salta si hay privados en el índice.
4. Límite aceptado: `git commit <pathspec>` (rutas sin pasar por el índice) no se ve; se cubre `-C <dir>` y `-a`. Y en un proyecto sin pignolo activo la compuerta no corre: ahí rige solo T1.

---

## T1: pignolo-ui escribe los valores fuera del proyecto (`pignolo-ui` 0.11.0)

**Archivos:** nuevo `plugins/pignolo-ui/lib/leak-store.mjs`; modificar `scripts/run.mjs` (`leak-values`, subcomando nuevo `leak-migrate`), `scripts/leak-check.mjs`, `scripts/canvas-index.mjs` y `lib/canvas-publish.mjs` (solo el origen de `valuesFile` por defecto), `reference/options.md`, `reference/present-and-choose.md`, `reference/context.md`, `skills/define/SKILL.md`, `skills/new|improve|audit/SKILL.md` si nombran `<run>/leak-values.json`; `plugin.json`, `CHANGELOG.md`, README de pignolo-ui.

**Interfaces:**
- `leakDirFor({ project, run, env = process.env }) -> string` (carpeta absoluta de D1; `run` es el id, o la ruta de la corrida, de la que se toma la primera carpeta bajo `runs/`). Lanza `Error('leak-store: la carpeta de valores quedaría dentro del proyecto')` si D2.
- `writeLeakFiles({ project, run, values, origins, env }) -> { dir, valuesFile, originsFile }` crea la carpeta y escribe ambos archivos (modo 0o600 donde el SO lo soporte).
- `findLegacyLeakFiles(project) -> string[]` rutas relativas (`/`) de `leak-values.json` / `leak-origins.json` bajo `.pignolo-ui/runs/**`; nunca devuelve contenido.
- CLI: `run.mjs leak-values --project <repo> --run <run> [--email <mail>]` escribe con `writeLeakFiles` e imprime `{ out, count, origins, legacy: <n>, note: "..." }`. `out` es la ruta del archivo de valores (las skills lo usan como `--values-file`). **`note` es una línea fija: `Estos valores son datos personales: viven fuera del proyecto; nunca los agregues a git (ni con git add -f).`** (también por stderr). `--out` se rechaza con `UsageError('--out ya no existe: los valores se guardan fuera del proyecto (--run)')`. `leak-check.mjs` y `canvas-index.mjs` aceptan `--values-file` (como hoy) y, sin él, lo derivan de `--run` o `--dir`.
- `run.mjs leak-migrate --project <repo> [--delete]` -> `{ found: [...], tracked: [...], deleted: [...] }`. Sin `--delete` solo lista (`tracked` = los que `git ls-files` tiene). `--delete` solo borra esos archivos (nunca carpetas ni otros archivos de la corrida) y **no toca el índice ni el historial**; si `tracked` no está vacío, imprime que hay que sacarlos del índice y apunta a `docs/fuga-leak-values.md`. La skill pide el sí al humano antes de pasar `--delete`.
- **Referencia (`reference/context.md`, la que cargan new/improve/audit/define):** una línea marcada `NO-GIT-UI:` : `NO-GIT-UI: never force into git anything under .pignolo-ui/ (no git add -f/--force, no "backup" commit of it): it is ignored on purpose and the leak values are personal data.` `present-and-choose.md` y `options.md` la enlazan donde nombran el archivo de valores.

**Casos de test literales (`plugins/pignolo-ui/tests/leak-store.test.mjs`):**
1. `leak-values --project <repo tmp> --run <repo>/.pignolo-ui/runs/r1 --email a@b.c` con `PIGNOLO_HOME=<tmp home>`: sale 0; `out` empieza con `<tmp home>/ui-leaks/`; el archivo existe y `leak-origins.json` está a su lado; **recorre el árbol del proyecto y no hay ningún archivo llamado `leak-values.json` ni `leak-origins.json`** (fija "nunca bajo el proyecto", sin pignolo del núcleo en el entorno); la salida contiene `nunca los agregues a git`.
2. `PIGNOLO_HOME=<repo>/.pignolo-home` (dentro del proyecto): sale con error y no escribe nada (D2).
3. Dos proyectos distintos -> `repoId` distintos; la misma ruta real (también vía worktree enlazado de otra ruta) -> el mismo.
4. `--out x.json` -> `UsageError` con el texto fijo.
5. `canvas-index plan` y `leak-check` sin `--values-file` encuentran los valores del lugar nuevo (`--run`/`--dir`); con la carpeta ausente, `no-leak-values` como hoy.
6. `leak-migrate` con `.pignolo-ui/runs/r0/leak-values.json` y `r0/run.json`: lista solo el primero; sin `--delete` no borra; con `--delete` borra solo los `leak-*.json` y deja `run.json`; no imprime el contenido (se siembra `SECRETO-XYZ` y no aparece en stdout/stderr); con el archivo trackeado (`git add -f` en el test) lista en `tracked` y el mensaje apunta al doc.
7. Los tests existentes que leían `<run>/leak-values.json` (`canvas-publish`, `hito-4a/4c/4f-acceptance`, `leak-scan`, `run-cli`, `fix-4i`, `ui4-fixes`, `ui4c1-fixes`, `review-4i-texts`, `skill-new`, `tests/support/canvas-plan.mjs`) se adaptan al `out` nuevo; ninguno escribe un `leak-*.json` bajo el proyecto.
8. Texto: ningún `.md` de `skills/` ni `reference/` contiene `leak-values.json` precedido por `<run>/`; `reference/context.md` tiene exactamente una línea `NO-GIT-UI:`.

**Rojo:** el caso 1 falla hoy (escribe en `--out <run>/…`); se demuestra revirtiendo `leak-store` a escribir en la corrida.

- [ ] T1 hecha

## T2: guardia del núcleo, `git add -f` y compuerta de commit (`pignolo` 0.21.0), segunda capa

**Archivos:** nuevo `plugins/pignolo/lib/private-paths.js` (D4) y `lib/private-index.js`; modificar `lib/git-guard.js` (regla `add-force`), `hooks/handlers/guard.js` (compuerta de índice), `tests/guard/must-block.json` y `must-allow.json`, tests nuevos.

**Interfaces:**
- `private-paths.js`: `isPrivatePath(rel) -> boolean` (acepta `/` y `\`, sin distinguir mayúsculas; `./` normalizado); exporta `PRIVATE_DIRS`, `PRIVATE_FILES`, `PRIVATE_NAMES`.
- `private-index.js`: `stagedPrivate({ cwd, all }) -> string[]` corre `git diff --cached --name-only -z` (con `all`, también `git diff --name-only -z`, para `commit -a`) con plazo de 1 s; devuelve las rutas privadas; sin repo o si git falla -> `[]`. `exitCommand(paths) -> string` arma `git restore --staged -- "<ruta1>" "<ruta2>"` (hasta 5 rutas; con más, la carpeta madre `git restore --staged -- ".pignolo-ui"`).
- `git-guard.js` `RULES['add-force']`: `['deny', 'git add -f/--force agrega al índice archivos que el proyecto ignora a propósito (por ejemplo .pignolo-ui/ guarda datos personales del autor)', 'agregá solo código por ruta, sin -f; si querías resguardar trabajo, commiteá esas rutas y dejá lo ignorado fuera']`. Se dispara con `add` y `-f`/`--force` (incluido `-fA`, `-Af`), y con `update-index --add`/`--cacheinfo`, solo si `ctx.subagent` (D7), usando el parser de opciones existente.
- `guard.js`: antes de la instantánea y **también con `guardOff`** (D8), si el comando lleva `git ... commit` (prefiltro `/\bgit\b[^;&|\n]*\bcommit\b/i`; con `-C <dir>`, en ese `<dir>`): `stagedPrivate`; si hay, `exit 2` con `pignolo bloqueó el commit: el índice tiene archivos privados de pignolo (<rutas, nunca su contenido>). Alternativa: sacalos del índice con \`<exitCommand>\` y commiteá de nuevo.`. Para main y subagentes.

**Casos de test literales:**
1. `tests/git-guard.test.js`: `git add -f .pignolo-ui/runs` con `subagent:true` -> block `add-force`; `git add --force .pignolo-ui/runs/r1/leak-values.json`, `git add -fA`, `git add -Af .`, `git update-index --add --cacheinfo ...` -> block; con `subagent:false` -> allow (lo cubre el caso 3); `git add src/a.js` subagente -> allow.
2. `tests/guard/must-block.json`: familia `add-force`. `must-allow.json`: `git restore --staged .pignolo-ui/runs`, `git rm --cached -r .pignolo-ui/runs`, `git reset -- .pignolo-ui/runs`, `git reset HEAD -- leak-values.json` (subagente y main) y `git reset --soft HEAD~1`.
3. `tests/guard-private-index.test.js` (repo tmp real, `git init`): fuera del hook se hace `git add -f .pignolo-ui/runs/r1/leak-values.json`; `guard.run` con `git commit -m x` -> `exit 2`, stderr contiene `git restore --staged -- ".pignolo-ui/runs/r1/leak-values.json"` y **no** el valor sembrado `SECRETO-XYZ`. Igual para `leak-origins.json` en otra carpeta, `.pignolo/local/x.txt`, `git -C <repo> commit` desde otro `cwd`, `git commit -a -m x` con el archivo trackeado y modificado, con `PIGNOLO_DISABLED=1` y con `agent_id` presente.
4. Mismo repo, índice sin privados: `git commit -m x` pasa; el prefiltro no se dispara con `git restore --staged .pignolo-ui/runs`, `git log --oneline` ni `git status`.
5. Con privados en el índice, `git restore --staged -- ".pignolo-ui/runs/r1/leak-values.json"` (el comando exacto del mensaje), `git rm --cached -r .pignolo-ui/runs` y `git reset -- .pignolo-ui/runs` pasan por `guard.run` -> `exit 0` (D6). Se ejecuta el comando del mensaje de verdad y luego `git commit` pasa.
6. Mayúsculas y separadores: `.PIGNOLO-UI\Runs\r1\LEAK-VALUES.JSON` en el índice se detecta; un `leak-values.json` en `docs/` también (por nombre).

**Rojo:** los casos 1 y 3 fallan hoy (`allow`); se demuestra quitando la regla y el bloque de `guard.js`.

- [ ] T2 hecha

## T3: lectura y salida segura, en todos los handlers (núcleo)

**Archivos:** `plugins/pignolo/hooks/handlers/private-reads.js`, tests nuevos.

**Interfaces:** en `private-reads.js`, `EXTRA_PRIVATE_ROOTS(env) = [path.join(pignoloHome(env), 'ui-leaks')]` se suma a `privateRoots(env)` solo en ese handler (no se toca `lib/holdout.js`: lo usan guardado y sello). Un subagente no lee la carpeta de T1; el hilo principal sí. **No se agrega** regla para `.pignolo-ui/**`: leer el archivo viejo no hace falta para sacarlo del índice, pero frenarlo no protege nada y arriesga 2c.

**Casos de test literales (`tests/private-reads-leak.test.js`):**
1. Subagente `pignolo:implementer`, pignolo activo: `Read .pignolo-ui/runs/r1/leak-values.json`, `cat` y `Get-Content` del archivo -> `exit 0` (fija D6/punto 3).
2. Mismo contexto: `Read <PIGNOLO_HOME>/ui-leaks/<id>/r1/leak-values.json`, `cat ~/.pignolo/ui-leaks/x/y/leak-values.json` y `grep -r SECRETO ~/.pignolo` -> `exit 2`. Hilo principal (sin `agent_id`) -> `exit 0`.
3. Matriz de la salida segura: `git restore --staged -- ".pignolo-ui/runs"`, `git rm --cached -r .pignolo-ui/runs`, `git reset -- .pignolo-ui/runs`, `cat .pignolo-ui/runs/r1/leak-values.json`, con `guard`, `private-reads`, `scope-gate` y `plan-audit-gate`, como main y subagente, dentro de un plan activo y fuera: ningún handler devuelve `exit 2`.
4. `PowerShell` con las mismas formas (`git restore --staged -- '.pignolo-ui\runs'`) -> `allow`.

**Rojo:** el caso 2 falla hoy (la carpeta nueva no está en la lista); el caso 3 es de regresión: se demuestra agregando a propósito una regla que frena `restore --staged` y viendo que cae. Se registra en `docs/gaps.md` el diagnóstico del rechazo (D5: clasificador de Claude Code, no pignolo).

- [ ] T3 hecha

## T4: textos, el origen del "commit de resguardo" (núcleo + pignolo-ui)

**Archivos:** `plugins/pignolo/skills/daily/SKILL.md` (l.15), `skills/trivial/SKILL.md`, `skills/entry/SKILL.md`, `skills/close-session/SKILL.md`; `plugins/pignolo/lib/git-guard.js` (alternativas de `stash`, `checkout-path`, `reset-hard`, `snapshot-required`, `worktree-remove-force`). La línea de pignolo-ui (`NO-GIT-UI:`) ya es de T1.

**Texto literal** en las cuatro skills del núcleo (una línea que empieza con `NO-RUNS-COMMIT:`, en inglés): `NO-RUNS-COMMIT: never stage ignored files and never use git add -f/--force; .pignolo-ui/ and .pignolo/local/ hold the author's private data (leak-values.json has the user name, home folder and email) and are ignored on purpose. For a backup or WIP commit, commit only code paths by name and leave the ignored folders out.`

**En la guardia:** cada alternativa que dice "commiteá ... WIP" suma ` (solo código, por ruta, sin git add -f)`. Los tests que fijan esas cadenas (`tests/git-guard.test.js`, `tests/guard/*.json`) se actualizan a la vez.

**Casos de test literales (`tests/skills-no-runs-commit.test.js`):**
1. Cada archivo de la lista contiene exactamente una línea `NO-RUNS-COMMIT:`; `plugins/pignolo-ui/reference/context.md` exactamente una `NO-GIT-UI:`.
2. Ningún `SKILL.md` ni `reference/*.md` de ambos plugins tiene una línea (fuera de esas marcadas) que junte `.pignolo-ui` o `.pignolo/local` con `git add`, `commit`, `resguard`, `backup` o `stage` (regex `/(git add|commit|resguard|back ?up|stage)[^\n]{0,80}(\.pignolo-ui|\.pignolo\/local)|(\.pignolo-ui|\.pignolo\/local)[^\n]{0,80}(git add|commit|resguard|back ?up|stage)/i`).
3. Ninguna `RULES[*][2]` que contiene `commiteá` omite `sin git add -f`.

**Rojo:** 1 y 3 fallan hoy; 2 se demuestra agregando una línea "commiteá `.pignolo-ui/runs`" a una skill.

- [ ] T4 hecha

## T5: ayuda al usuario afectado, versiones y registro

**Archivos:** nuevo `docs/fuga-leak-values.md`; `README.md` (una línea y el enlace, sección "Guardia de shell"); CHANGELOG del núcleo (0.21.0) y de pignolo-ui (0.11.0); ambos `plugin.json`; `docs/gaps.md` (D5, los límites del punto 4 de las decisiones abiertas); `docs/STATE.md`.

**Contenido de `docs/fuga-leak-values.md` (corto, en español, comandos que corre el humano, no el agente):**
1. **Qué pasó:** pignolo-ui anterior a 0.11.0 guardaba `leak-values.json` y `leak-origins.json` (usuario, carpeta personal, nombre y email) en `.pignolo-ui/runs/<corrida>/`; un `git add -f` los puede meter al historial. No son claves ni contraseñas, pero son datos personales.
2. **Commit local, sin push:** `git log --stat --oneline -- .pignolo-ui` muestra qué commits los traen. Si es el último: `git reset --soft HEAD~1`, `git restore --staged -- .pignolo-ui` y volver a commitear lo que corresponda. Si hay commits encima: `git rebase -i <commit anterior al primero>` en la terminal del humano, `edit` en cada uno, `git rm --cached -r .pignolo-ui`, `git commit --amend --no-edit`, `git rebase --continue`. Verificar: `git log --stat -- .pignolo-ui` sin salida. Los objetos viejos quedan en el reflog; para borrarlos de verdad: `git reflog expire --expire=now --all && git gc --prune=now` (lo corre el humano; la guardia de pignolo lo frena a los agentes a propósito). Los archivos del árbol: `node <pignolo-ui>/scripts/run.mjs leak-migrate --project . --delete` (pide el sí).
3. **Ya se publicó (push):** tratarlo como publicado. Repo privado de una sola persona: riesgo bajo, pero cambiar de commit no lo quita de copias hechas. Repo público o compartido: reescribir la historia con `git filter-repo --path .pignolo-ui --invert-paths`, `git push --force` a mano (decisión del humano; la guardia lo niega a agentes), avisar a quienes clonaron, pedir al alojamiento que purgue vistas en caché (GitHub: soporte) y recordar que el email ya figura en los metadatos de los commits.
4. **Cómo no vuelve a pasar:** actualizar ambos plugins (`/plugin update`) y qué hace ahora cada capa (T1 a T3).

**Casos de test literales (`tests/fuga-doc.test.js`):** el doc existe y contiene `git reset --soft HEAD~1`, `git restore --staged`, `git filter-repo` y `leak-migrate`; el README lo enlaza; `plugin.json` de cada paquete == primera versión de su CHANGELOG (test existente `changelog-versions`); ambos CHANGELOG nombran el cambio (`leak-values`).

**Cierre de rama (lo hace el controlador):** `npm test` una sola vez sobre la rama unida con `main`, tras los arreglos. Revisión opus propia (toca guardia, borrados y privacidad), con el diff como archivo y los hallazgos deterministas como tests rojos. Autochequeo del ejecutor (5): (1) formas de git que saltan la regla (`git -c alias`, `--force`, `-fA`, alias de shell, PowerShell); (2) rutas con otra capitalización, `.\`, junctions y symlinks en `PIGNOLO_HOME` y en `runs/`; (3) archivos no UTF-8 o con BOM en el índice; (4) lectores con la forma vieja (`<run>/leak-values.json`): `grep` sobre `plugins/` sin resultados; (5) cada afirmación del informe marcada "probado" o "no probado".

- [ ] T5 hecha
