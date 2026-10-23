# Arnés de medición de Pignolo 2

Corre la misma tarea en dos brazos y junta las métricas que pide la ficha `tests/evals/RESULTS-pignolo2.md`:

- **Brazo A:** Claude Code con solo el plugin `superpowers`.
- **Brazo B:** Claude Code con solo el plugin Pignolo 2 (`plugins/pignolo`).

El arnés es **genérico**: no lleva nombres, código, commits ni rutas de ningún proyecto. Las tareas reales viven en una carpeta privada que se indica en un archivo de configuración fuera de git (`harness.local.json`). Lo único que se versiona de una medición real es `tests/evals/pignolo2-runs.csv` (métricas con ids de tarea genéricos) y, si se quiere, `tests/evals/pignolo2-grades.json` (notas del revisor a ciegas).

Node >= 22, sin dependencias. Necesita `git` y `tar` en el PATH (Windows 10/11 trae `tar`).

## Regla general

Una corrida en la que no se puede confiar se marca **inválida** con su motivo (columnas `invalid` e `invalid_reason` del CSV). Nunca se descarta en silencio ni se cuenta en silencio: `summary` la lista, la deja fuera de las cifras y deja la tarea en `pendiente: <n> corridas inválidas` hasta repetirla (`--note rerun`).

Motivos: `no_result` (sin mensaje final), `timed_out`, `exit_nonzero`, `is_error` (error de autenticación, límite de uso, plugin que no carga...), `budget_cap` (superó `perRunCapUsd`), `result_not_success`, `contaminated`, `own_plugin_not_loaded`, `nm_changed`, `source_nm_changed`, `escaped_cwd`, `no_changes`, `trees_unmeasurable`, `drop_failed` (no se pudo borrar la copia de `node_modules` descartada), `post_run_error` (falló un paso posterior a la corrida; el detalle está en `postRunError` de `metrics.json`).

Después de la corrida paga **nada puede perder `metrics.json`**: cada paso posterior (procesos, manifiestos, árboles, métricas, escapes) está protegido, un fallo se anota en `postRunError` y la corrida queda inválida, pero `metrics.json` se escribe siempre. Si el proceso se corta antes de escribirlo (existe `stream.jsonl` sin `metrics.json`), el ledger la cuenta igual como gastada.

## Qué gasta plata y qué no

Solo `run` lanza `claude -p` y gasta tokens. Todo lo demás (`prepare`, `accept`, `row`, `blind`, `unblind`, `summary`) es local y gratis. Las pruebas del arnés (`tests/harness.test.js`) usan un `claude` falso (`tests/fixtures/harness/fake-claude.mjs`) y no gastan nada.

`run` pasa `--max-budget-usd` (tope por corrida, `perRunCapUsd`) y un tiempo máximo (`timeoutMs`). Además hay un **tope total** (`totalCapUsd`): `run` no lanza nada si lo ya gastado más 1,25 veces `perRunCapUsd` (el margen cubre lo que una corrida puede pasarse del tope) supera `totalCapUsd`. Lo gastado es la suma de `cost_usd` de **todas** las filas del CSV (de cualquier experimento, la calibración incluida), más las corridas que ya gastaron y todavía no tienen fila (`metrics.json` sin fila), más las interrumpidas (`stream.jsonl` sin `metrics.json`), más el registro de gasto fuera de `run` (abajo). Una corrida sin costo conocido (cortada por tiempo, interrumpida, sin resultado) cuenta como `perRunCapUsd`, lo máximo que pudo costar.

El revisor a ciegas y cualquier otro gasto que no pase por `run` se anotan en `<privateRoot>/grader-spend.csv` (o la ruta de `graderSpendPath`), un CSV con encabezado `date,usd,note` al que se le agrega una línea por gasto; el ledger lo suma. No corras `run` sin el OK del autor para el gasto: la ficha lo exige.

## Configuración

1. Copiá `harness.example.json` a `harness.local.json` (está en `.gitignore`) y completá las rutas absolutas:

| Clave | Qué es |
|---|---|
| `sourceRepo` | repo privado de donde se exporta el commit de partida; de ahí también sale `node_modules` (una sola vez, como copia) |
| `privateRoot` | carpeta privada con las tareas (ver abajo), los paquetes a ciegas y sus claves |
| `workRoot` | dónde se crean las carpetas de corrida `<tarea>-<brazo>-<rep>/` y la copia `_nm` |
| `configDir` | `CLAUDE_CONFIG_DIR` dedicado a la medición (sin plugins instalados, sin `CLAUDE.md`, sin hooks) |
| `arms.A`, `arms.B` | `pluginName` y `pluginDir` de cada brazo (`--plugin-dir`); el `name` de `.claude-plugin/plugin.json` tiene que coincidir con `pluginName` |
| `model`, `permissionMode`, `perRunCapUsd`, `timeoutMs` | se pasan tal cual a `claude -p` |
| `effort` | nivel de esfuerzo que se pasa con `--effort` (`low`, `medium`, `high`, `xhigh`, `max`); por defecto `medium`, el mismo en los dos brazos |
| `totalCapUsd` | tope de gasto de toda la medición (obligatorio) |
| `neutralPlugins` | patrones (`*` es cualquier texto) de plugins que Claude Code carga en toda sesión y que **no** son contaminación; por defecto `["cc-plugin-*"]`. Se registran en `metrics.json` (`neutralPluginsLoaded`) y en la columna `neutral_plugins`. Un plugin que no es del brazo ni coincide con esta lista sí contamina. Cargan igual en los dos brazos, así que no sesgan la comparación |
| `neutralConfigPaths` | rutas de `configDir` con contenido que Claude Code sincroniza de la cuenta y que se declara en vez de bloquear; por defecto `["skills/synced", "plugins/synced", "plugins/data"]` (ver "Contenido sincronizado de la cuenta") |
| `extraEnvAllow` | nombres de variables de entorno extra que el hijo puede heredar (ver "Entorno del hijo") |
| `copyDirs` | carpetas o archivos ignorados por git que la tarea necesita (por ejemplo el cliente generado de la base) y que se copian de la fuente; rutas relativas, sin `.`, `..` ni vacías |
| `weights`, `modelFactor` | pesos de los tokens y factor por familia de modelo, ver "Calibración" |
| `seed` | semilla del mezclado a ciegas (el mismo valor reproduce el mismo orden) |
| `tasks` | `{ "<id>": { "kind": "medium" \| "small" } }`, lo usa `summary` para aplicar la regla de cada tipo |
| `blindExcludePaths` | notas de proceso y documentos del proyecto que se sacan del diff a ciegas y de los conteos de código (ver "Revisor a ciegas"); el ejemplo trae la lista por defecto |
| `nmIgnore` | carpetas de herramientas dentro de `node_modules` que no cuentan como cambio (por defecto `.vite`, `.vitest`, `.cache`, `.turbo`, `.parcel-cache`, `.eslintcache`) |
| `claudeBin`, `claudeArgsPrefix`, `extraArgs` | para apuntar a otro ejecutable o sumar flags sin tocar el código |
| `trackProcesses` | `false` apaga el listado de procesos antes y después (por defecto `true`) |
| `graderSpendPath` | CSV `date,usd,note` con el gasto fuera de `run` (revisor a ciegas); por defecto `<privateRoot>/grader-spend.csv` |
| `csvPath`, `gradesPath`, `experiment` | por defecto `tests/evals/pignolo2-runs.csv`, `tests/evals/pignolo2-grades.json` y `pignolo2` |

Al cargar la configuración se rechaza: un `totalCapUsd` o `perRunCapUsd` que no sea mayor que 0, un `effort` desconocido, un `%` en `workRoot` (el shell de Windows lo expande en los comandos de aceptación), un `workRoot`, `privateRoot` o `sourceRepo` metido dentro de otro (el agente podría llegar a la fuente o a la carpeta privada desde la corrida) y un `copyDirs` vacío, absoluto o con `.`/`..`.

2. Entrá una sola vez con el `configDir` de la medición (PowerShell):

```powershell
$env:CLAUDE_CONFIG_DIR = "<configDir>"; claude
# dentro: /login
```

`run` revisa `configDir` antes de gastar: tiene que existir y no puede tener `CLAUDE.md`, plugins instalados (`plugins/installed_plugins.json` con entradas, o `plugins/cache` con contenido; el archivo vacío o ausente está bien, y los registros de marketplaces y `plugins/data` se permiten y, si cambian, aparecen en `config_dir_delta`), `skills/` (salvo `skills/synced`), `agents/`, `commands/` o `hooks/` con contenido, ni `settings.json` / `settings.local.json` con `hooks` o `enabledPlugins`. Y que el `name` del plugin de cada brazo coincida con el `pluginName` configurado.

## Contenido sincronizado de la cuenta

Cuando Claude Code corre con sesión iniciada **descarga contenido de la cuenta al directorio de configuración** en el primer inicio: skills de la cuenta en `<configDir>/skills/synced/<bucket>/...` (cientos de archivos), un plugin de la cuenta con sus skills y su `.mcp.json` en `<configDir>/plugins/synced/<bucket>/...`, y una carpeta de datos por plugin en `<configDir>/plugins/data/<plugin>-inline/` (también para el plugin del brazo). Lo crea Claude Code solo, lo administra la cuenta y **los dos brazos ven lo mismo**: es una condición realista (las sesiones reales del autor lo tienen) que suma el mismo contexto a ambos. Por eso es neutral: se **declara**, no se bloquea.

- El chequeo previo de `configDir` deja pasar exactamente `neutralConfigPaths` (por defecto esas tres rutas). Cualquier otra cosa en `skills/`, plugins instalados (`installed_plugins.json`, `plugins/cache`), hooks, `enabledPlugins` o un `CLAUDE.md` en `configDir` sigue bloqueando.
- Bloquea igual si ese contenido trae una skill, un plugin (carpeta o `name` de un `plugin.json`) que se llame como el plugin de un brazo (`superpowers` o `pignolo`, o con prefijo `superpowers-` / `pignolo-`): sería contaminación, con un mensaje que lo dice. Si aparece durante la corrida, la corrida queda `contaminated`.
- `metrics.json` guarda `neutralConfigContent` (solo nombres y conteos: archivos y carpetas de skills sincronizadas, archivos y nombres de plugin de `plugins/synced`, carpetas de `plugins/data`) **antes** y **después** de la corrida y si la creó la corrida (`createdByRun`). El CSV lo resume en la columna `neutral_config`, por ejemplo `skills_synced=322;plugins_synced=77;plugins_data=1` (más `creado_en_la_corrida` si lo creó esa corrida).
- Un plugin que figura en el `init` y es uno de los `name` de `plugins/synced` es neutral (se anota en `neutralPluginsLoaded`); uno que no es del brazo, ni coincide con `neutralPlugins`, ni está en ese contenido, sigue contaminando.
- La ficha lo declara entre las amenazas a la validez.

## Entorno del hijo

`claude` **no** hereda el entorno del proceso padre. Se arma desde una lista blanca: `PATH`, `PATHEXT`, `SystemRoot`, `SystemDrive`, `WINDIR`, `ComSpec`, `TEMP`, `TMP`, `USERPROFILE`, `USERNAME`, `HOME`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramData`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`, más lo que listes en `extraEnvAllow`, más `CLAUDE_CONFIG_DIR=<configDir>` y `DISABLE_AUTOUPDATER=1`. Todo lo demás (`CLAUDECODE`, `CLAUDE_CODE_*`, `ANTHROPIC_*`, `GITHUB_TOKEN`, cualquier `*_TOKEN`, `*_KEY`, `*_SECRET`) no llega. En `metrics.json` quedan los **nombres** (nunca los valores) de **todas** las variables descartadas (`droppedEnvNames`). Los comandos de `accept-cmd.txt` y `full-cmd.txt` corren con la misma lista blanca (sin `CLAUDE_CONFIG_DIR` ni `DISABLE_AUTOUPDATER`): si la suite del proyecto necesita una variable, agregala a `extraEnvAllow`.

Como el entorno no pasa, una `ANTHROPIC_API_KEY` del padre no se usa: la medición corre con el login de `configDir`. Si Claude Code no encuentra su shell en Windows y hace falta, agregá el nombre de la variable que lo resuelve (por ejemplo la del ejecutable de git bash) a `extraEnvAllow`.

El prompt de la tarea no va como argumento: se escribe en `prompt.stdin.txt` de la carpeta de corrida y es la entrada estándar de `claude -p`, así un prompt que empiece con `-` nunca se lee como opción. (`claude --help` documenta `-p` para tuberías; no se probó `--` porque probarlo gasta una llamada, ver "Calibración".)

## Carpeta privada

```
<privateRoot>/
  tasks.json           opcional pero necesario para las tareas chicas: { "<task>": { "baselineFull": { "fail": N } } }
  <task>/
    prompt.md          consigna textual que se le pasa a claude -p
    base.txt           commit (o ref) de partida en sourceRepo
    accept/**          tests de aceptación; se copian al árbol medido con la misma ruta relativa a accept/
    accept-cmd.txt     un solo comando de shell que corre los tests de aceptación (en la raíz del árbol medido)
    full-cmd.txt       un solo comando de shell que corre la suite completa del proyecto
  blind/<task>/        lo genera `blind`: paquetes, consigna del revisor (la carpeta que se le da al revisor)
  blind-keys/<task>.json   la clave (etiqueta a brazo y repetición), FUERA de lo que lee el revisor
```

`baselineFull.fail` es cuántos tests de la suite completa ya fallan en el commit base (el piso). La regla de la tarea chica exige `full_fail <= piso`. Sin piso, la tarea queda `pendiente`.

En `accept-cmd.txt` y `full-cmd.txt` se puede usar `{json}`: se reemplaza por una ruta entre comillas para que el corredor escriba su reporte JSON (por ejemplo `npx vitest run --reporter=json --outputFile={json} ...`). Con `{json}` el conteo sale de `numPassedTests` / `numFailedTests` / `numFailedTestSuites`. Sin él se lee la línea resumen (vitest, jest o node:test: `Test Files` / `Test Suites` dan las suites fallidas) y, si no se reconoce, se usa el código de salida (1/0 o 0/1) y la fila del CSV lo avisa en `note`.

**Verde** = código de salida 0, cero suites fallidas (un archivo de test que no se puede importar es una suite fallida), cero tests fallidos y más de cero tests pasados. Contar solo los tests no alcanza.

## node_modules

El agente corre con permisos libres, así que no se le da el `node_modules` de la fuente. `prepare` hace **una** copia, en `<workRoot>/_nm/node_modules` (se crea sola si falta), y cada corrida (también `measured/` y los worktrees) enlaza su `node_modules` a esa carpeta como junction.

**Por qué la copia está dentro de una carpeta llamada `node_modules`.** Node resuelve un import de paquete subiendo desde la ruta *real* del archivo que importa hasta encontrar una carpeta que se llame literalmente `node_modules`; una copia en `_nm/vitest/...` nunca encuentra a `_nm/@vitest/utils` (`ERR_MODULE_NOT_FOUND`: así falló la primera corrida real). Una copia del diseño viejo (`_nm` con los paquetes directamente adentro, o con un manifiesto sin `layout: 2`) se detecta como vieja, se borra con el borrado seguro y se vuelve a copiar, gratis y antes de gastar. Una prueba arma una copia mínima con un paquete `a` que hace `require('b')`, un `@scope/d` y un `.bin`, la enlaza con la misma función del arnés y comprueba que se resuelven. Antes y después de cada corrida se calcula un manifiesto (nombres de los paquetes de primer nivel ordenados, cantidad de entradas y hash de `.package-lock.json`; las carpetas de `nmIgnore` no cuentan). Si la copia cambió, la corrida es inválida (`nm_changed`) y la copia se borra con el borrado seguro (nunca recorre una junction), así la próxima preparación copia de nuevo desde la fuente. Si cambió el `node_modules` de la fuente, la corrida es inválida (`source_nm_changed`) y se avisa por stderr. Una copia que ya no coincide con su manifiesto (alguien la tocó entre corridas) se descarta y se vuelve a copiar sola, gratis y antes de gastar, siempre que el `node_modules` de la fuente siga siendo el que se copió; si la fuente cambió, `run` se niega y no gasta.

Borrar la copia es a prueba de bloqueos: primero se renombra a `_nm.trash-<marca>` (así el nombre `_nm` queda libre al instante) y después se borra con el borrado seguro; si un archivo está bloqueado (EBUSY/EPERM) la carpeta renombrada queda, la corrida se marca `drop_failed` y el próximo `prepare` la borra cuando ya no esté bloqueada.

`prepare` y `run` se niegan, antes de copiar y de gastar, si el `node_modules` de la fuente (o un `copyDirs`) tiene enlaces simbólicos o junctions que salen de la carpeta o están rotos: se miran las entradas de primer nivel, todo `@scope/*` y los hijos de `.pnpm` en `node_modules`, y todo el árbol en `copyDirs` (en Windows una copia sigue las junctions y traería contenido de afuera, o un enlace dejaría al agente escribir fuera de la copia). Hay que resolver esos enlaces antes de medir.

## Árbol medido

Un método puede dejar su código en la carpeta de la corrida, en un worktree de git o en una rama (superpowers crea worktrees). Después de cada corrida se registran `git worktree list`, las ramas adelantadas al commit base y qué árboles tienen cambios contra el base. **El árbol medido es el de mayor cambio contra el base entre la carpeta, los worktrees y las ramas** (empate: la carpeta de la corrida). Todos los candidatos quedan en `changes.json`; si más de uno tiene cambios se marca `multiple_trees` (aparece en `note` del CSV y en las notas de `summary`, para revisar a mano). `accept` corre en el árbol medido: le enlaza `node_modules`, copia los `copyDirs` que falten y copia ahí los tests de aceptación. Si el código está solo en una rama, `accept` la saca a un worktree propio (`<corrida>/measured`).

`run` marca `no_changes` (inválida) cuando ningún árbol tiene cambios contra el base: cubre las corridas que terminan con una pregunta. Para decidir esto cuenta **todo** cambio (también en nombres de `blindExcludePaths`): una tarea cuyo archivo objetivo esté excluido no se marca `no_changes`; las exclusiones solo valen para el diff a ciegas y para los conteos de código. Si todas las corridas de un brazo terminan sin cambios, `summary` lo escribe como resultado ("el brazo X termina sin cambios en todas las corridas: n/n") en vez de dejar la tarea pendiente.

Un worktree cuya carpeta ya no existe (el agente lo borró) se poda (`git worktree prune`) y se ignora; si el código estaba solo ahí, la corrida queda `no_changes`. Las últimas líneas (~1 KB) del texto final están en `metrics.json` (`finalText`), nunca en el CSV.

Los conteos de `changes.json` (`filesChanged`, `linesAdded`, `linesRemoved`, `files`) son de **código**: se excluyen con pathspec de git las entradas de `blindExcludePaths`. `rawFilesChanged` es el total sin excluir, y `changes.patch` conserva el parche completo.

## Un ciclo completo

```powershell
node tests/evals/harness/run.mjs prepare --task T --arm A --rep 1
node tests/evals/harness/run.mjs run     --task T --arm A --rep 1    # gasta tokens
node tests/evals/harness/run.mjs accept  --task T --arm A --rep 1
node tests/evals/harness/run.mjs row     --task T --arm A --rep 1
```

Intercalá los brazos (A, B, A, B...) como pide la ficha. Todos los comandos aceptan `--config <ruta>`. `prepare`, `run`, `accept`, `row`, `clean` y `summary` aceptan `--experiment <nombre>` (hay que pasar el mismo en todos los pasos de una corrida); `row` se niega si el experimento no es el de la corrida. Las corridas del experimento de la configuración viven en `<workRoot>/<tarea>-<brazo>-<rep>`; las de cualquier otro experimento (la calibración, `pignolo2-calib`) en `<workRoot>/<experimento>/<tarea>-<brazo>-<rep>`, así una corrida de calibración nunca ocupa la carpeta de una real.

| Comando | Qué hace |
|---|---|
| `prepare` | exporta el commit base con `git archive \| tar -x`, borra `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`, `.mcp.json` y cualquier `.claude/` (también anidados), escribe el `CLAUDE.md` neutral (`neutral-claude.md`), enlaza `node_modules` a la copia `_nm/node_modules` como junction, copia `copyDirs`, y hace `git init` con identidad local `eval` y un commit `base` (etiqueta `base`) en `main`. `node_modules` y `copyDirs` quedan en `.git/info/exclude`. No pisa una carpeta existente. |
| `run` | revisa plugin, `configDir` y tope total (gratis), lee `prompt.md`, lanza `claude` con `cwd` en el repo de la corrida, guarda `stream.jsonl` y `stderr.txt`, mide el tiempo de pared, mata el árbol de procesos al pasar `timeoutMs` y escribe `metrics.json`. No se puede correr dos veces la misma carpeta. Registra los procesos que sobran (`leftover_processes`, sin matarlos), los nombres que aparecen o desaparecen en `configDir` (`config_dir_delta`), la versión de Claude Code y el modelo resuelto (`init`), y marca `escaped_cwd` si una herramienta nombra la fuente, la carpeta privada u otra corrida (el primer comando, 200 caracteres, queda en `metrics.json`). |
| `accept` | calcula **primero** el resumen de cambios (`changes.json`, `changes.patch`, `changes.blind.patch`), **después** copia los tests de aceptación y corre `accept-cmd.txt` y `full-cmd.txt` en el árbol medido; escribe `acceptance.json` (código de salida, suites fallidas y piso de la suite completa). Repetirlo conserva el primer resumen. |
| `clean [--force]` | borra la carpeta de una corrida con el borrado seguro: toda junction o enlace (`node_modules` de la corrida, de `measured/` o de cualquier worktree dentro de la carpeta) se quita como enlace antes de seguir, sin recorrerlo. Se niega si la corrida tiene datos que no están en el CSV (corré `row` antes, o `--force`). Es la única forma prevista de borrar una corrida: no se borra a mano. |
| `row` | agrega una fila a `pignolo2-runs.csv`. Rechaza otra fila de la misma tarea/brazo/repetición salvo con `--note rerun`. |
| `blind --task T --reps 1,2,3` | arma `blind/T/pack-<k>/{diff.patch,meta.json}` con etiquetas `X`, `Y`, `Z`... en orden mezclado con la semilla, `grader-prompt.md` y `task-prompt.md`, y deja la clave en `blind-keys/T.json`. Se detiene si el diff aún nombra a algún plugin (`--allow-leaks` lo fuerza). `--force` regenera. |
| `unblind --task T --input salida.json` | pasa la salida JSON del revisor (una lista de `{label, serious_findings, correctness, quality}`) a `pignolo2-grades.json` usando la clave; cada nota recuerda la marca de tiempo de la corrida que calificó. |
| `summary [--csv ...] [--grades ...] [--experiment ...] [--medium a,b] [--small c] [--json] [--include-contaminated]` | mediana y rango por tarea y brazo, y la regla de decisión. Por defecto solo cuenta el experimento de la configuración. |

### Columnas del CSV

`experiment, task, arm, rep, timestamp, model, model_resolved, claude_version, cost_usd, weighted_tokens, input, output, cache_read, cache_write, model_tokens, wall_s, duration_ms, turns, agents, agents_main, result_subtype, is_error, exit_code, timed_out, invalid, invalid_reason, accept_exit, accept_pass, accept_fail, accept_suites_failed, full_pass, full_fail, full_baseline_fail, contamination, neutral_plugins, neutral_config, files_changed, lines_added, lines_removed, note`.

`wall_s` es el tiempo de pared del proceso: incluye el arranque de Claude Code, la carga de los plugins y los hooks. `duration_ms` es el que informa Claude Code en su mensaje final. `agents` cuenta todos los subagentes y `agents_main` los lanzados por el hilo principal. `model_tokens` son los tokens crudos por modelo (`modelo=entrada/salida/cache leída/cache escrita`, separados por `|`): `summary` recalcula con ellos los tokens ponderados con la configuración actual, y el `weighted_tokens` del CSV es el que se calculó al correr.

### Revisor a ciegas

El revisor corre **en Opus, en una corrida aparte** (otra sesión que no ve `blind-keys/` ni el CSV). Se le da la carpeta `blind/T/` (`grader-prompt.md`, `task-prompt.md` y los `pack-<k>`); devuelve un JSON por paquete: `{ "label", "serious_findings": [...], "correctness": 0-5, "quality": 0-5 }`. Eso se pasa a `unblind`.

El diff que ve el revisor sale de `accept` ya filtrado con pathspecs de git (no con expresiones regulares sobre el texto del diff, así los nombres con espacios funcionan) y sin las entradas de `blindExcludePaths`: `.claude/`, `.superpowers/`, `.pignolo/`, `docs/superpowers/`, `docs/pignolo/`, `docs/sessions/`, `docs/research/`, `roadmap.md`, `security.md`, `design.md`, `CLAUDE.md`, `.gitignore`, `.worktrees/` (un nombre sin barra coincide en cualquier carpeta). La consigna del revisor aclara que las notas de proceso y los documentos del proyecto están fuera de alcance y no se penalizan.

### Regla de decisión que aplica `summary`

- **Tarea mediana (`medium`), no inferioridad:** B pasa si la mediana de tokens ponderados de B es menor o igual a 1,5 veces la de A **y** el máximo de B es menor o igual a 1,5 veces el máximo de A **y** la calidad es igual o mejor (mediana de nota, hallazgos graves y proporción de corridas verdes, todos no peores que A). Que los rangos se pisen **no** impide pasar: solo impide afirmar que B es mejor que A, y entonces el resumen escribe "no se afirma superioridad". Sin notas a ciegas de todas las corridas válidas: `pendiente`.
- **Tarea chica (`small`):** la mediana de tiempo de pared y de tokens ponderados de B debe ser menor o igual que la de A, el resultado de B correcto (verde) en todas sus corridas y `full_fail <= piso` en todas. Un exceso con rangos que se pisan es "sin diferencia demostrada" (riesgo abierto); sin pisarse, "no pasa". Sin aceptación o sin piso: `pendiente`.
- Evidencia: **E3** con 3 o más repeticiones válidas por brazo, **E2** con 2, "sin evidencia" con 1 o menos. Nunca se imprime una cifra sin su rango. El costo en USD se imprime al lado de los tokens ponderados.
- Las corridas repetidas (`rerun`) reemplazan a la original en las cifras; las dos quedan en el CSV. Las inválidas (cortadas por tiempo, con error, que superaron el tope, contaminadas, con `escaped_cwd`...) se listan y dejan la tarea en `pendiente: <n> corridas inválidas`; las que superaron el tope se nombran aparte ("superó el tope"). Las notas a ciegas cuentan solo para las corridas usadas: una nota de una corrida que se rehízo no se hereda.
- Las filas de otro experimento (por ejemplo `pignolo2-calib`) se ignoran y se nombran.

## Calibración: qué verificar en la primera corrida real

Antes de la primera corrida válida, correr una chica por brazo con `--experiment pignolo2-calib` (en `run` y en `row`): queda en el mismo CSV, cuenta para el tope total y nunca se mezcla en el resumen real. Comprobar:

1. **Flags de `claude -p`.** Los verificados con `claude --help` (2.1.302): `-p`, `--model`, `--effort` (`low`, `medium`, `high`, `xhigh`, `max`), `--plugin-dir` (repetible, no variádico), `--permission-mode` (con `bypassPermissions`), `--output-format stream-json`, `--verbose`, `--max-budget-usd`, `--no-session-persistence`. No se pasa `--bare` (saltaría los hooks de los plugins, que son parte del brazo). Si alguna versión nueva cambia un flag, se ajusta en `buildArgv` (`execute.mjs`) o con `extraArgs`.
2. **El prompt por stdin.** `-p` sin prompt posicional lee la entrada estándar (`claude --help` lo describe para tuberías). No se verificó contra un `claude` real porque probarlo gasta; la calibración tiene que confirmar que el prompt llega completo y que `stream.jsonl` trae un mensaje `result`.
3. **Campos del stream.** El formato exacto se tomó de lo conocido de stream-json y de las pruebas con el stub: `system/init` con `plugins` (lista de objetos con `name`), `model` y `claude_code_version`; `result` con `subtype`, `is_error`, `result`, `total_cost_usd`, `usage`, `modelUsage` (claves camelCase por modelo), `duration_ms`, `num_turns`; `parent_tool_use_id` en los mensajes de subagentes. Si un nombre difiere, la métrica queda en `null` o 0 y la corrida sale inválida (`no_result`, `own_plugin_not_loaded`...), nunca con un valor inventado. El subtipo exacto de un corte por presupuesto se asume que contiene `budget` (por ejemplo `error_max_budget_usd`): confirmarlo.
4. **Tokens de subagentes.** `metrics.json` guarda `tokens` (suma de `modelUsage`, que debería incluir subagentes), `tokensByModel` y `usageMainThread` (campo `usage` del mensaje `result`). Si en una corrida con subagentes ambos son iguales, `modelUsage` no suma los subagentes y hay que sumar el uso desde los mensajes del stream. Si el resultado no trae `modelUsage`, se usa `usage` y la fila lo avisa (`tokens-solo-hilo-principal`).
5. **Cantidad de agentes.** Se cuentan los `tool_use` de nombre `Agent` o `Task` (sin repetir ids) en todo el stream; `agents_main` cuenta los del hilo principal. Verificar con un stream real que los subagentes aparecen y que los nombres coinciden.
6. **Contaminación.** Contaminada = el plugin del brazo no figura cargado en `system/init`, **o** figura cargado cualquier plugin que no sea el del brazo (también por skills, agentes y comandos del otro). Verificar en un stream real que `plugins` lista el plugin del brazo con un nombre que coincide con `pluginName` (puede venir como `nombre@marketplace`), y que los plugins incorporados de Claude Code estén cubiertos por `neutralPlugins` (la primera corrida real listó tres, ver "Primera corrida real"). Si `configDir` tiene plugins instalados, van a aparecer ahí.
7. **Pesos y factores por modelo.** `weights` (entrada 1, salida 5, caché leída 0,1, caché escrita 1,25) son una aproximación de los precios relativos de un modelo, y `modelFactor` (`opus` 5, `sonnet` 1, `haiku` 0,33, buscado como subcadena del id del modelo en `modelUsage`) los escala por familia. **Son marcadores a calibrar** contra `cost_usd` en las primeras corridas: comparar el ponderado con el costo de cada modelo y ajustar antes de la primera corrida válida; `summary` recalcula siempre con la configuración actual desde los tokens crudos, así que ajustar después no obliga a rehacer corridas, pero hay que fijar los valores antes de mirar resultados. Un modelo sin familia conocida usa factor 1 y queda en `metrics.json` (`unknownModels`).
8. **Costo.** `cost_usd` es `total_cost_usd` del mensaje `result`; con login de suscripción puede venir como estimación.
9. **Permisos.** Con `bypassPermissions` el agente corre comandos sin pedir permiso. No lo uses fuera de una carpeta descartable (ver "Límites").
10. **`configDir`.** `config_dir_delta` de la primera corrida muestra qué escribe Claude Code en el directorio de configuración (solo nombres). Si crea algo en `plugins/` que el chequeo previo toma por contaminación, ajustar `checkConfigDir` en `execute.mjs`.
11. **Árbol medido.** En una corrida de superpowers real, mirar `changes.json`: dónde dejó el código (worktree, rama, carpeta), y que `accept` corra en ese árbol. Si usa una carpeta de worktrees fuera de `workRoot`, el chequeo `escaped_cwd` no la toma por un escape (solo mira la fuente, la carpeta privada y las demás corridas).
12. **Conteos de aceptación.** Que `{json}` / el resumen del corredor de tests de la tarea real produzcan fuente `json` o `summary` (no `exit-code`) y que traigan las suites fallidas.
13. **Export.** Que `git archive | tar` funcione con el repo real (symlinks, submódulos, `.gitattributes export-ignore`), y que `copyDirs` cubra lo que la suite necesita (por ejemplo el cliente generado de la base y los `.env` ignorados, si hicieran falta).
14. **Diff a ciegas.** Revisar a mano un `pack-*/diff.patch` real antes de entregarlo al revisor: que no queden rastros del método.

## Primera corrida real

Una corrida de calibración del brazo A en una tarea chica (sin datos privados en lo que sigue). Hechos:

- Los campos del stream eran los supuestos: `system/init` con `plugins[].name`, `model` y `claude_code_version`; `result` con `subtype` `success`, `modelUsage` por modelo y `usage`.
- El prompt por stdin funcionó.
- Costo (`total_cost_usd`): 0,26 USD para una tarea chica de unos 74 s, 14 turnos y 0 subagentes.
- El subtipo del corte por presupuesto **sigue sin verificarse** (no se llegó al tope).
- El `node_modules` copiado pesaba unos 970 MB: la copia única es cara en disco y en tiempo la primera vez.
- `init.plugins` listó, además del plugin del brazo, tres plugins incorporados que Claude Code carga en toda sesión sin importar la configuración: `cc-plugin-agents-md`, `cc-plugin-telemetry` y `cc-plugin-plugin-authoring`. Se cargan igual en los dos brazos (no sesgan la comparación), y por eso `neutralPlugins` los deja pasar y los anota.
- Falló la suite del proyecto con `ERR_MODULE_NOT_FOUND` porque la copia de `node_modules` no estaba dentro de una carpeta llamada `node_modules` (arreglado, ver "node_modules").

## Límites

- Con `bypassPermissions` el agente puede hacer lo que haga el usuario de Windows: borrar o escribir fuera de la carpeta de la corrida. El arnés no lo impide. Lo que sí hace: entorno sin credenciales, `node_modules` aislado, `configDir` y plugin verificados, y detección posterior (`escaped_cwd`, `nm_changed`, `source_nm_changed`, `leftover_processes`). `escaped_cwd` mira las herramientas del stream; un script que escriba fuera sin nombrar la ruta no se ve. La única defensa real es correr en una máquina o usuario descartable.
- Los comandos de `accept-cmd.txt` y `full-cmd.txt` corren con la lista blanca de entorno más `extraEnvAllow`; una variable que el proyecto necesite hay que permitirla a mano.
- Cachés de herramientas compartidas (la de npm, las de `%LOCALAPPDATA%`, `~/.cache`) viven fuera de la corrida y pasan de una corrida a otra: pueden dar ventaja a la segunda corrida de un brazo. El arnés no las aísla; se mitiga intercalando los brazos y se declara como amenaza.
- Los cambios dentro de `node_modules` y `copyDirs` no cuentan en el resumen de cambios.
- Los diffs a ciegas excluyen las notas de proceso conocidas (`blindExcludePaths`); un método que deje otros rastros distintivos en el código puede delatarse igual. `blind` avisa si el diff nombra a un plugin, no detecta el estilo.
- El revisor ve el diff y la consigna, no el repo completo.
- La detección de escapes mira las herramientas del stream: compara en el borde de la ruta (`X/app` no coincide con `X/app-runs`), entiende `C:\`, `C:/`, `/c/`, `/mnt/c/` y barras dobles, y marca los `..` que salen de la carpeta de la corrida cuando se pueden resolver desde el repo. No ve lo que un script haga por dentro.
- Un worktree que el agente cree fuera de la carpeta de la corrida y que `clean` no alcance queda donde está (se registra en `changes.json` / `metrics.json`).
- Para repetir una corrida: `run.mjs clean --task T --arm A --rep 1` (borra la carpeta de esa corrida; sus métricas ya están en el CSV), volvé a `prepare` y anotá `--note rerun` en `row`. No se borra nada a mano.
